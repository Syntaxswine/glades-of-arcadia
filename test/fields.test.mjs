// test/fields.test.mjs — affinity propagation and the two surviving conditions.
//
// docs/ZONING.md replaces the five abstract axes with four species affinities;
// docs/DECOR.md replaces the gaussian convolution with a flood fill that
// respects occluders; docs/ELEVATION.md makes a 2-level step an occluder for
// free. Five properties are load-bearing and every one of them is tested here
// rather than assumed:
//
//   * remove() is an EXACT inverse of add(). If it drifts, a garden slowly rots
//     as the player edits it, and nothing ever tells them.
//   * the incremental path equals a full rebuild — including after a hedge or a
//     terrace has changed what influence can cross, which is the new way for an
//     incremental field to go quietly wrong.
//   * open ground still decays by exactly the old gaussian, in every direction.
//     Zones are circles, not octagons.
//   * an occluder actually occludes, and an arch actually leaks.
//   * the contest margin answers ZONING.md's two worked cases.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Fields, AFFINITIES, CONDITIONS, AXES, RETIRED_AXES, SIGMA, KERNEL_RADIUS,
  AXIS_META, GRASS_FOR, GRASS_TYPES, AFFINITY_WEIGHT, CLAIM_FLOOR, LEVEL_BLOCK,
  normaliseAxis, gaussianKernel, contestMargin, affinityWeights, maskFor,
} from '../js/fields.js';

const P = (tx, ty, extra = {}) => ({ tx, ty, footprint: [1, 1], tags: [], ...extra });
const hedge = (tx, ty) => P(tx, ty, { nullifier: true, tags: ['hedge'] });

// ---------------------------------------------------------------- vocabulary

test('four species affinities plus the two conditions grass cannot express', () => {
  assert.deepEqual([...AFFINITIES], ['satyr', 'centaur', 'naiad', 'unicorn']);
  assert.deepEqual([...CONDITIONS], ['maturity', 'seclusion']);
  assert.deepEqual([...AXES], ['satyr', 'centaur', 'naiad', 'unicorn', 'maturity', 'seclusion']);
});

test('wildness, order and moisture are retired and read 0 instead of throwing', () => {
  // A module that has not caught up with ZONING.md must degrade quietly. A
  // stale reader losing its zoning is a bug; a stale reader taking the garden
  // down with it is a catastrophe, and SPEC §0 forbids losing a garden.
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(5, 5, { affinities: ['satyr'], deposits: { wildness: 9, order: -9, moisture: 9 } }));
  for (const dead of RETIRED_AXES) {
    assert.equal(f.at(dead, 5, 5), 0, `${dead} still carries weight`);
    assert.equal(f.overlay(dead).data[5 * 20 + 5], normaliseAxis(dead, 0));
  }
  assert.ok(f.at('satyr', 5, 5) > 0, 'the live affinity was lost with the dead axes');
});

test('every grass type has an owner and vice versa', () => {
  assert.equal(GRASS_FOR.neutral, 'meadow');
  for (const a of AFFINITIES) {
    assert.ok(GRASS_TYPES.includes(GRASS_FOR[a]), `${a} has no grass`);
    assert.equal(AXIS_META[a].grass, GRASS_FOR[a]);
  }
});

// ------------------------------------------------------------------ weights

test('breadth costs strength — 1.0 single, 0.7 each dual, 0.5 each triple', () => {
  // docs/DECOR.md. Without the gradient a triple is strictly better than a
  // single and the optimal garden is nothing but triples.
  assert.deepEqual(affinityWeights({ affinities: ['satyr'] }), { satyr: 1.0 });
  assert.deepEqual(affinityWeights({ affinities: ['satyr', 'naiad'] }), { satyr: 0.7, naiad: 0.7 });
  assert.deepEqual(
    affinityWeights({ affinities: ['satyr', 'centaur', 'naiad'] }),
    { satyr: 0.5, centaur: 0.5, naiad: 0.5 }
  );
  assert.ok(AFFINITY_WEIGHT[1] > AFFINITY_WEIGHT[2] && AFFINITY_WEIGHT[2] > AFFINITY_WEIGHT[3]);
});

test('an explicit affinity map wins over the breadth rule and over tags', () => {
  assert.deepEqual(affinityWeights({ affinities: { naiad: 2.5 }, tags: ['ash'] }), { naiad: 2.5 });
  // A declared-empty list is neutral furniture on purpose — the decor layer of
  // DECOR.md Part II exists precisely so that placing can be unanxious.
  assert.deepEqual(affinityWeights({ affinities: [], tags: ['ash'] }), {});
});

test('a negative affinity repels, and can never claim or contest ground', () => {
  // catalog.js authors the DECOR Part II register split as a small negative:
  // a fluted neoclassical piece mildly repels the satyr. SPEC §7 asks for
  // exactly that. What a negative must NOT do is win a tile.
  assert.deepEqual(affinityWeights({ affinities: { satyr: -0.15, unicorn: 0.3 } }),
    { satyr: -0.15, unicorn: 0.3 });
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: { satyr: -1 } }));
  assert.ok(f.at('satyr', 10, 10) < 0, 'the repulsion did not land');
  assert.equal(f.resolve(10, 10).kind, 'neutral', 'a negative score claimed ground');
  // ...and it genuinely holds a species off ground it would otherwise take.
  const g = new Fields({ w: 20, h: 20 });
  g.add(P(10, 10, { affinities: ['satyr'] }));
  const alone = g.resolve(12, 10);
  g.add(P(13, 10, { affinities: { satyr: -0.6, unicorn: 0.3 } }));
  assert.ok(g.at('satyr', 12, 10) < alone.top, 'the colonnade did not push back');
});

test('an explicit blocks:true is solid even on a piece tagged like a doorway', () => {
  assert.equal(maskFor({ blocks: true, tags: ['arch', 'ruin'] }), 0);
  assert.equal(maskFor({ blocks: { gap: true }, tags: ['hedge', 'arch'] }), (1 << 0) | (1 << 4));
  assert.equal(maskFor({ blocks: { gap: true, axis: 'y' } }), (1 << 2) | (1 << 6));
  assert.equal(maskFor({ blocks: false, tags: ['hedge'] }), 0xff, 'blocks:false is the author saying no');
});

// --------------------------------------------------------------- the profile

test('in open ground the flood decays by exactly the old gaussian', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['satyr'] }));
  assert.equal(f.at('satyr', 10, 10), 1, 'a single-affinity object reads 1.0 at its own feet');
  for (const d of [1, 2, 3, 4, 5]) {
    const want = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
    assert.ok(
      Math.abs(f.at('satyr', 10 + d, 10) - want) < 1e-12,
      `at ${d} tiles: ${f.at('satyr', 10 + d, 10)} vs ${want}`
    );
  }
  assert.equal(f.at('satyr', 10 + KERNEL_RADIUS + 1, 10), 0, 'nothing leaks past the rim');
  const k = gaussianKernel(SIGMA, KERNEL_RADIUS);
  assert.equal(k.w[k.radius * k.size + k.radius], 1, 'the reference kernel peaks at 1.0');
});

test('unobstructed zones are circles, not octagons', () => {
  // The detour term is what makes a hedge bite; if it leaked into open ground
  // the falloff would be octile and every zone on the map would go octagonal.
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['naiad'] }));
  const diag = f.at('naiad', 13, 14); // displacement (3,4), distance 5
  const axis = f.at('naiad', 15, 10); // displacement (5,0), distance 5
  assert.ok(Math.abs(diag - axis) < 1e-12, `${diag} vs ${axis}`);
});

test('the affinities are independent — one claim does not move another', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(5, 5, { affinities: ['satyr'] }));
  for (const a of AFFINITIES) {
    if (a === 'satyr') continue;
    assert.equal(f.at(a, 5, 5), 0, `${a} moved when only the satyr planted`);
  }
});

// ------------------------------------------------------------------ occluders

test('a nullifier stops influence dead and claims nothing itself', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['satyr'] }));
  const open = f.at('satyr', 13, 10);
  assert.ok(open > 0.4);
  for (let y = 0; y < 20; y++) f.add(hedge(11, y)); // an unbroken screen
  assert.equal(f.at('satyr', 13, 10), 0, 'influence crossed a hedge');
  assert.equal(f.at('satyr', 11, 10), 0, 'the hedge tile itself took a claim');
  assert.ok(f.isBlocked(11, 10));
  assert.equal(f.resolve(11, 10).type, 'meadow', 'a null tile must render as meadow');
  assert.ok(Math.abs(f.at('satyr', 9, 10) - 0.9231163) < 1e-6, 'the near side was disturbed');
});

test('two species can sit one tile apart with a hedge between them', () => {
  // docs/DECOR.md names this as the whole point of the request. It needs the
  // detour term: vector propagation alone walks round a one-tile hedge for free.
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['satyr'] }));
  const naked = f.at('satyr', 12, 10);
  f.add(hedge(11, 10));
  const screened = f.at('satyr', 12, 10);
  assert.ok(screened < naked * 0.8, `a lone hedge did nothing: ${naked} -> ${screened}`);
  assert.ok(screened > 0, 'a lone hedge should be got round, not be a wall');
});

test('a hedge arch leaks through its doorway and nowhere else', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['satyr'] }));
  for (let y = 0; y < 20; y++) {
    f.add(y === 10 ? P(11, y, { nullifier: 'arch', gate: 'x', tags: ['hedge', 'arch'] }) : hedge(11, y));
  }
  const throughGate = f.at('satyr', 13, 10);
  assert.ok(Math.abs(throughGate - Math.exp(-9 / (2 * SIGMA * SIGMA))) < 1e-9,
    'the gate should pass its own line at full strength');
  assert.ok(f.at('satyr', 13, 12) > 0, 'past the gate the influence should spread again');
  assert.ok(f.at('satyr', 13, 12) < throughGate, 'and spread costs the detour round the gate');
  assert.equal(maskFor({ nullifier: 'arch', gate: 'x' }), (1 << 0) | (1 << 4));
  assert.equal(maskFor({ nullifier: true, tags: [] }), 0);
  assert.equal(maskFor({ tags: ['tree'] }), 0xff);
});

test('the five nullifiers of DECOR.md occlude on their tags alone', () => {
  for (const tag of ['hedge', 'wall', 'herm', 'cypress-screen', 'gravel-walk']) {
    assert.equal(maskFor(P(0, 0, { tags: [tag] })), 0, `${tag} did not occlude`);
  }
});

// ------------------------------------------------------------------ elevation

test('a 2-level step blocks and a 1-level step does not', () => {
  // docs/ELEVATION.md, verbatim: terraces are nullifiers for free, but gentle
  // undulation stays connected so the player has a soft tool and a hard one.
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['naiad'] }));
  const flat = f.at('naiad', 13, 10);
  for (let y = 0; y < 20; y++) f.setLevel(11, y, LEVEL_BLOCK - 1);
  assert.ok(Math.abs(f.at('naiad', 13, 10) - flat) < 1e-12, 'a 1-level step blocked');
  for (let y = 0; y < 20; y++) f.setLevel(11, y, LEVEL_BLOCK);
  assert.equal(f.at('naiad', 13, 10), 0, 'a 2-level step did not block');
});

test('a hollow is secluded and a summit is not', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 2; y <= 8; y++) for (let x = 2; x <= 8; x++) f.setLevel(x, y, 3);
  for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) f.setLevel(x, y, 1);
  f.setLevel(15, 15, 3);
  const hollow = f.at('seclusion', 5, 5);
  const summit = f.at('seclusion', 15, 15);
  assert.ok(hollow > 1, `a sunken garden should be quiet: ${hollow}`);
  assert.ok(summit < -1, `an exposed summit should not be: ${summit}`);
});

// ----------------------------------------------------------------- resolution

test('the contest margin answers both of ZONING.md\'s worked cases', () => {
  // "two objects versus three should be able to tie near the boundary, but
  //  twenty versus twenty-one should not read as contested across a whole
  //  meadow." Same absolute gap in both, so the margin has to shrink as the
  //  stakes rise — which reads as: the more you commit, the more decisive the
  //  ground becomes.
  assert.ok(0.2 <= contestMargin(1.6), 'sparse ground should be able to tie');
  assert.ok(0.4 > contestMargin(8.4), 'dense ground should be decisive');
  // Monotone downward over the range that matters, and never zero.
  let prev = Infinity;
  for (let top = 1.5; top <= 30; top += 0.5) {
    const m = contestMargin(top);
    assert.ok(m > 0 && m <= prev + 1e-12, `margin not shrinking at ${top}`);
    prev = m;
  }
});

test('a lone object claims its ground outright and is not contested with nobody', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['unicorn'] }));
  const here = f.resolve(10, 10);
  assert.equal(here.kind, 'claimed');
  assert.equal(here.type, 'millefleurs');
  assert.equal(here.other, null);
  // ...out to the claim floor, and past that the ground is nobody's.
  const reach = Math.sqrt(-2 * SIGMA * SIGMA * Math.log(CLAIM_FLOOR));
  assert.equal(f.resolve(10 + Math.ceil(reach) + 1, 10).kind, 'neutral');
  assert.equal(f.grassAt(10 + Math.ceil(reach) + 1, 10), 'meadow');
});

test('an even fight is contested, and reports both sides for the dither', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(8, 10, { affinities: ['satyr'] }));
  f.add(P(12, 10, { affinities: ['unicorn'] }));
  const mid = f.resolve(10, 10);
  assert.equal(mid.kind, 'contested');
  assert.deepEqual([mid.owner, mid.other].sort(), ['satyr', 'unicorn']);
  const grid = f.grassGrid();
  const i = 10 * 20 + 10;
  assert.ok(grid.type[i] !== 0 && grid.other[i] !== 0, 'the grid must carry both to dither');
  assert.notEqual(grid.type[i], grid.other[i]);
});

test('a triple alone ties three ways — DECOR.md wants that ambiguity', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { affinities: ['satyr', 'centaur', 'naiad'] }));
  assert.equal(f.resolve(10, 10).kind, 'contested', 'lay a triple, decide later who claims it');
  f.add(P(10, 11, { affinities: ['satyr'] })); // ...decide later.
  assert.equal(f.resolve(10, 10).kind, 'claimed');
  assert.equal(f.resolve(10, 10).owner, 'satyr');
});

test('a contiguous patch is measured, and contested tiles are not part of one', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (const [x, y] of [[4, 4], [6, 4], [4, 6], [6, 6]]) f.add(P(x, y, { affinities: ['centaur'] }));
  const patch = f.patch('centaur', 5, 5);
  assert.ok(patch.size > 20, `a four-object planting should hold a real patch: ${patch.size}`);
  for (const t of patch.tiles) {
    const r = f.resolve(t.tx, t.ty);
    assert.equal(r.kind, 'claimed');
    assert.equal(r.owner, 'centaur');
  }
  assert.equal(f.patch('satyr', 5, 5).size, 0, 'a patch of somebody else\'s grass is not yours');
});

test('removing the objects reverts the ground toward meadow', () => {
  // ZONING.md calls this a cosy guarantee, not a side effect.
  const f = new Fields({ w: 20, h: 20 });
  const planted = [];
  for (const [x, y] of [[4, 4], [6, 4], [4, 6]]) {
    planted.push(f.add(P(x, y, { affinities: ['naiad'] })));
  }
  assert.ok(f.grassCounts().fen > 10);
  for (const p of planted) f.remove(p);
  const counts = f.grassCounts();
  assert.equal(counts.fen, 0);
  assert.equal(counts.meadow, 400);
});

test('grassChanges reports the delta nearest the cause first', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.grassChanges(); // take the baseline
  f.add(P(10, 10, { affinities: ['satyr'] }));
  const { origin, changed } = f.grassChanges();
  assert.deepEqual(origin, { tx: 10, ty: 10 });
  assert.ok(changed.length > 0);
  assert.deepEqual({ tx: changed[0].tx, ty: changed[0].ty }, { tx: 10, ty: 10 });
  assert.equal(changed[0].to, 'thicket');
  let prev = -1;
  for (const c of changed) {
    const d2 = (c.tx - 10) ** 2 + (c.ty - 10) ** 2;
    assert.ok(d2 >= prev, 'the ripple must go outward');
    prev = d2;
  }
  assert.equal(f.grassChanges().changed.length, 0, 'a second call with no edit is empty');
});

// ------------------------------------------------------- the two conditions

test('maturity accrues with garden time and does not un-accrue on felling', () => {
  // SPEC §6: "a glade left alone quietly improves". SPEC §0: nothing is ever
  // taken from you — cutting a tree down must not roll the ground back.
  const f = new Fields({ w: 20, h: 20 });
  const tree = f.add(P(10, 10, { deposits: { maturity: 1 }, tags: ['mature'] }));
  const before = f.at('maturity', 10, 10);
  for (let i = 0; i < 400; i++) f.tick(1);
  const aged = f.at('maturity', 10, 10);
  assert.ok(aged > before, `maturity did not accrue: ${before} -> ${aged}`);
  f.remove(tree);
  const after = f.at('maturity', 10, 10);
  assert.ok(after > 0, 'felling the tree un-aged the ground');
  assert.ok(after < aged, 'the tree itself should stop depositing when removed');
});

test('moss creeps round a hedge rather than through it', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) f.add(hedge(11, y));
  f.add(P(10, 10, { deposits: { maturity: 2 }, tags: ['mature'] }));
  for (let i = 0; i < 400; i++) f.tick(1);
  assert.ok(f.at('maturity', 9, 10) > 1, 'the near side did not age');
  assert.equal(f.at('maturity', 13, 10), 0, 'age crossed a hedge');
});

test('a path costs seclusion even when nobody wrote the number down', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { tags: ['gravel-walk', 'path'] }));
  assert.ok(f.at('seclusion', 10, 11) < 0, 'traffic did not read as traffic');
});

// ------------------------------------------------------------- the machinery

test('remove is an exact inverse of add', () => {
  const f = new Fields({ w: 20, h: 20 });
  const p = P(8, 8, { affinities: ['naiad'], deposits: { seclusion: 2, maturity: -1 } });
  f.add(p);
  assert.notEqual(f.at('naiad', 8, 8), 0);
  f.remove(p);
  for (const c of AXES) {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        assert.equal(f.data[c][y * 20 + x], 0, `${c} at ${x},${y} did not return to zero`);
      }
    }
  }
});

test('remove uses the stamp that was applied, not the object as it is now', () => {
  // The object is a live reference the world may have mutated (a tree grows).
  const f = new Fields({ w: 20, h: 20 });
  const p = P(6, 6, { affinities: ['satyr'] });
  f.add(p);
  p.affinities = ['unicorn']; // somebody edited it in place
  p.tx = 19;
  f.remove(p);
  assert.equal(f.at('satyr', 6, 6), 0);
  assert.equal(f.at('unicorn', 19, 6), 0);
});

test('the incremental path equals a full rebuild, hedges and terraces and all', () => {
  // The new way for an incremental field to rot: a hedge planted after the
  // trees changes what those trees could reach, and if the module forgets to
  // re-flood them the garden is quietly wrong from then on. So the fuzz mixes
  // placements, removals, occluders, arches and terrain edits.
  const f = new Fields({ w: 20, h: 20 });
  const rnd = mulberry(99);
  const live = [];
  for (let i = 0; i < 300; i++) {
    const r = rnd();
    if (live.length && r < 0.25) {
      const j = Math.floor(rnd() * live.length);
      f.remove(live[j]);
      live.splice(j, 1);
    } else if (r < 0.35) {
      f.setLevel(Math.floor(rnd() * 20), Math.floor(rnd() * 20), Math.floor(rnd() * 4));
    } else {
      const kind = rnd();
      const p = P(Math.floor(rnd() * 20), Math.floor(rnd() * 20),
        kind < 0.15 ? { nullifier: true, tags: ['hedge'] }
          : kind < 0.2 ? { nullifier: 'arch', gate: rnd() < 0.5 ? 'x' : 'y', tags: ['hedge', 'arch'] }
            : {
              affinities: [AFFINITIES[Math.floor(rnd() * 4)]],
              deposits: { seclusion: rnd() * 4 - 2, maturity: rnd() * 3 },
            });
      f.add(p);
      live.push(p);
    }
  }
  // Not exactly zero, and it should not be: incremental addition sums the
  // stamps in a different ORDER from the rebuild, and float addition is not
  // associative. Measured worst case here is ~2e-14 on values of order 10 —
  // a couple of ULPs. The bound is 1e-9, five orders of magnitude tighter than
  // any real bookkeeping bug (a missed stamp is a whole deposit, ~1).
  const check = f.verifyIncremental();
  assert.ok(
    check.worst < 1e-9,
    `incremental fields disagree with a rebuild by ${check.worst} on ${check.axis}`
  );
});

test('a footprint radiates from every tile it covers', () => {
  const f1 = new Fields({ w: 20, h: 20 });
  f1.add(P(5, 5, { affinities: ['satyr'] }));
  const f2 = new Fields({ w: 20, h: 20 });
  f2.add({ tx: 5, ty: 5, footprint: [2, 2], tags: [], affinities: ['satyr'] });
  assert.ok(
    f2.at('satyr', 7, 7) > f1.at('satyr', 7, 7),
    'a 2x2 must reach further than a 1x1 from the same origin'
  );
  assert.equal(f2.at('satyr', 6, 6), 1, 'and read at face value across its own footprint');
});

test('the overlay view is 0..1 and neutral where nothing has happened', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (const channel of AXES) {
    const v = f.overlay(channel);
    assert.equal(v.axis, channel);
    assert.equal(v.data.length, 400);
    const neutral = AXIS_META[channel].signed ? 0.5 : 0;
    assert.equal(v.neutral, neutral);
    for (const x of v.data) {
      assert.ok(Math.abs(x - neutral) < 1e-6, `${channel} on an empty map is not neutral`);
    }
  }
  f.add(P(10, 10, { affinities: ['satyr'] }));
  const v = f.overlay('satyr');
  assert.ok(v.data[10 * 20 + 10] > 0, 'the satyr overlay did not rise where the satyr claimed');
  for (const x of v.data) assert.ok(x >= 0 && x <= 1, 'overlay left 0..1');
});

test('the overlay and grass caches key on version and invalidate on edit', () => {
  const f = new Fields({ w: 20, h: 20 });
  const a = f.overlay('centaur');
  const g = f.grassGrid();
  assert.equal(f.overlay('centaur'), a, 'same version should return the same object');
  assert.equal(f.grassGrid(), g);
  f.add(P(3, 3, { affinities: ['centaur'] }));
  assert.notEqual(f.overlay('centaur'), a, 'an edit must invalidate the overlay cache');
  assert.notEqual(f.grassGrid(), g, 'an edit must invalidate the grass cache');
});

test('normaliseAxis puts a signed channel at 0.5 when neutral and is monotone', () => {
  for (const channel of AXES) {
    const meta = AXIS_META[channel];
    assert.equal(normaliseAxis(channel, 0), meta.signed ? 0.5 : 0);
    let prev = -Infinity;
    for (let v = -20; v <= 20; v += 0.5) {
      const n = normaliseAxis(channel, v);
      assert.ok(n >= 0 && n <= 1, `${channel}(${v}) = ${n} left 0..1`);
      assert.ok(n >= prev - 1e-12, `${channel} is not monotone at ${v}`);
      prev = n;
    }
  }
});

test('the tag index counts exactly, inside the radius and not outside', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { tags: ['tree', 'oak'] }));
  f.add(P(12, 10, { tags: ['tree'] }));
  f.add(P(10, 16, { tags: ['tree'] }));
  assert.equal(f.countTag('tree', 10, 10, 3), 2);
  assert.equal(f.countTag('tree', 10, 10, 6), 3);
  assert.equal(f.countTag('oak', 10, 10, 6), 1);
  assert.equal(f.countTag('willow', 10, 10, 20), 0);
});

test('counting is straight-line even though influence is not', () => {
  // "Are there three ash trees near me" is a fact about the wood, not about
  // whether you can walk to it. Occlusion belongs to influence, not to counting.
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { tags: ['ash'] }));
  for (let y = 0; y < 20; y++) f.add(hedge(11, y));
  assert.equal(f.countTag('ash', 13, 10, 4), 1);
  assert.equal(f.countGrid('ash', 4)[10 * 20 + 13], 1);
});

test('...but an OCCLUDED count is available, and is what a repulsion asks for', () => {
  // The rule above is right for an at-least count and wrong for an at-most one.
  // "Is there a wall oppressing me" is a fact about the PLACE, and screening a
  // thing off is the oldest answer in gardening — it is the whole of DECOR.md's
  // "conflicting species can sit one tile apart with a hedge between them".
  // creatures.js `atMost` asks for this grid; `atLeast` asks for the other.
  const f = new Fields({ w: 20, h: 20 });
  f.add(P(10, 10, { tags: ['ash'] }));
  for (let y = 0; y < 20; y++) f.add(hedge(11, y));

  const occ = f.countGrid('ash', 4, { occluded: true });
  assert.equal(occ[10 * 20 + 13], 0, 'behind an unbroken hedge, the ash does not count');
  assert.equal(occ[10 * 20 + 9], 1, 'on the near side it counts exactly as before');

  // The two grids must be IDENTICAL wherever nothing occludes, or the change
  // would quietly re-tune every requirement on every open map in the game.
  const g = new Fields({ w: 20, h: 20 });
  g.add(P(10, 10, { tags: ['ash'] }));
  g.add(P(6, 7, { tags: ['ash'] }));
  const plain = g.countGrid('ash', 4);
  const walled = g.countGrid('ash', 4, { occluded: true });
  assert.deepEqual(
    Array.from(walled),
    Array.from(plain),
    'with no occluder anywhere the occluded count is the straight-line count'
  );
});

test('a region is named after the ground, so the name and the grass agree', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (const [x, y] of [[4, 4], [6, 4], [4, 6], [6, 6]]) f.add(P(x, y, { affinities: ['satyr'] }));
  assert.equal(f.grassAt(5, 5), 'thicket');
  assert.ok(/thicket|slope|hollow/.test(f.regionName(5, 5)), f.regionName(5, 5));
  assert.equal(f.regionName(18, 18), null, 'ground with no character gets no name');
});

test('serialize / hydrate round-trips the aged layer and the terrain', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.setLevel(4, 4, 3);
  f.add(P(9, 9, { deposits: { maturity: 2 }, tags: ['mature'] }));
  for (let i = 0; i < 200; i++) f.tick(1);
  const save = JSON.parse(JSON.stringify(f.serialize()));
  const g = new Fields({ w: 20, h: 20 });
  g.add(P(9, 9, { deposits: { maturity: 2 }, tags: ['mature'] }));
  g.hydrate(save);
  assert.equal(g.levelAt(4, 4), 3);
  // serialize() rounds the aged layer to three decimals on purpose — it is a
  // save file, not a checkpoint — so the tolerance is that rounding and no more.
  for (const c of AXES) {
    for (let i = 0; i < 400; i++) {
      const x = i % 20;
      const y = (i / 20) | 0;
      const d = Math.abs(f.at(c, x, y) - g.at(c, x, y));
      assert.ok(d <= 1e-3, `${c} at ${x},${y} drifted by ${d}`);
    }
  }
});

test('propagation stays cheap on a fully planted map', () => {
  const f = new Fields({ w: 20, h: 20 });
  const rnd = mulberry(5);
  for (let i = 0; i < 250; i++) {
    f.add(P(Math.floor(rnd() * 20), Math.floor(rnd() * 20), {
      affinities: [AFFINITIES[Math.floor(rnd() * 4)]],
    }));
  }
  const t0 = Date.now();
  f.rebuild();
  const ms = Date.now() - t0;
  assert.ok(ms < 250, `a full rebuild of a saturated map took ${ms}ms`);
  assert.equal(f.cost().sources, 250);
});

function mulberry(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
