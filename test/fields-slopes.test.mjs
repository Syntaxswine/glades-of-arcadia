// test/fields-slopes.test.mjs — slopes are neutral; terraces are ordinary ground.
//
// docs/ELEVATION.md, "Slopes are neutral; terraces are ordinary ground". Three
// rules from the owner, and the reason they belong together is a symmetry that
// this file exists to hold in place:
//
//   | barrier              | its doorway  |
//   |----------------------|--------------|
//   | hedge / wall / herm  | hedge arch   |
//   | cliff of 2+ levels   | ramp / stair |
//
//   1. a slope is PERMANENTLY neutral ground — no planting can ever claim it,
//   2. a terrace flat is ORDINARY ground — it takes a grass type normally,
//   3. a connector does NOT block. It is the way through the cliff, exactly as
//      the arch is the way through the hedge.
//
// Rules 1 and 3 pull in opposite directions on the same tile — nobody may own
// it, and everybody's influence goes through it — so the interesting failures
// are the ones where implementing either quietly undoes the other. Every test
// below is aimed at that seam.
//
// A separate file from fields.test.mjs on purpose: three other owners are in
// this tree, and a new file cannot collide with anything.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Fields, CLAIM_FLOOR, LEVEL_BLOCK, CONNECTOR_SPAN,
  isConnector, connectorSpan, isNullifier, maskFor,
} from '../js/fields.js';

const P = (tx, ty, extra = {}) => ({ tx, ty, footprint: [1, 1], tags: [], ...extra });

/** A single-affinity planting — 1.0, the way the player COMMITS ground. */
const plant = (tx, ty, a) => P(tx, ty, { affinities: [a], tags: ['tree'] });

/**
 * The earth ramp of js/catalog.js, in the shape main.js's field bridge actually
 * delivers it: tags and deposits, no `connector` flag — the bridge forwards
 * `tags` and drops the flag, so this is the case that has to work.
 *
 * Note `path` in the tags. That tag is how the gravel walk earns its occlusion,
 * so a connector recognised only by its tags is one line away from being read as
 * a wall — which is the precise opposite of the object.
 */
const ramp = (tx, ty) => P(tx, ty, {
  tags: ['connector', 'path', 'archaic', 'terrace', 'traffic'],
  deposits: { seclusion: -1 },
});

/** The stone stair — the neoclassical register of the same object. */
const stair = (tx, ty) => P(tx, ty, {
  tags: ['connector', 'path', 'dressed-stone', 'neoclassical', 'terrace', 'traffic'],
});

/** A hedge, and a hedge with a doorway in it. */
const hedge = (tx, ty) => P(tx, ty, { nullifier: true, tags: ['hedge'] });
const arch = (tx, ty) => P(tx, ty, { nullifier: 'arch', gate: 'x', tags: ['hedge', 'arch'] });

// ---------------------------------------------------------------------------
// Recognising a connector at all
// ---------------------------------------------------------------------------

test('a connector is recognised from any of the four signals the catalogue sends', () => {
  assert.ok(isConnector({ connector: true }));
  assert.ok(isConnector({ span: 1 }));
  assert.ok(isConnector({ group: 'connector' }));
  for (const t of ['connector', 'ramp', 'stair', 'steps']) {
    assert.ok(isConnector(P(0, 0, { tags: [t] })), `tag ${t} was not read as a connector`);
  }
  assert.ok(!isConnector(P(0, 0, { tags: ['hedge', 'path'] })));
  assert.ok(!isConnector(null));
  assert.equal(connectorSpan(ramp(0, 0)), CONNECTOR_SPAN);
  assert.equal(connectorSpan({ connector: { span: 2 } }), 2);
  assert.equal(connectorSpan(hedge(0, 0)), 0);
});

test('a connector is NEVER a nullifier, even though three of the four are tagged path', () => {
  // The trap: `path` is in the nullifier tag list because of the gravel walk.
  // ELEVATION.md draws the distinction explicitly — a walk runs ALONG ground
  // and divides it, a connector runs THROUGH a cliff and joins it.
  assert.ok(isNullifier(P(0, 0, { tags: ['path'] })), 'a gravel walk still blocks');
  assert.ok(!isNullifier(ramp(0, 0)), 'an earth ramp must not block');
  assert.ok(!isNullifier(stair(0, 0)), 'a stone stair must not block');
  assert.equal(maskFor(ramp(0, 0)), 0xff, 'a ramp occludes no direction at all');
});

// ---------------------------------------------------------------------------
// Rule 1 — sloped ground is permanently neutral
// ---------------------------------------------------------------------------

test('a slope between two heavily planted single-species zones stays neutral', () => {
  const f = new Fields({ w: 20, h: 20 });

  // A one-level step, which does NOT block: gentle undulation stays connected,
  // so both zones' influence pours across the slope and neither may have it.
  for (let y = 0; y < 20; y++) for (let x = 11; x < 20; x++) f.setLevel(x, y, 1);

  // Heavy planting either side — six singles each, the strongest thing the
  // vocabulary can say.
  for (let y = 8; y <= 12; y++) {
    for (const x of [7, 8, 9]) f.add(plant(x, y, 'satyr'));
    for (const x of [12, 13, 14]) f.add(plant(x, y, 'naiad'));
  }

  // The ramps run up the step, one per row.
  for (let y = 0; y < 20; y++) f.add(ramp(10, y));

  for (let y = 8; y <= 12; y++) {
    const r = f.resolve(10, y);
    assert.equal(r.kind, 'neutral', `the slope at row ${y} was claimed`);
    assert.equal(f.grassAt(10, y), 'meadow');
    assert.equal(r.owner, null);

    // ...and it is neutral BY RULE, not for want of influence. There is more
    // than enough satyr on this tile to claim it outright; the resolution
    // refuses it anyway, which is the difference between a hard rule and a
    // weighting.
    assert.ok(f.at('satyr', 10, y) > CLAIM_FLOOR,
      `row ${y} had no claim to refuse — the test is not proving anything`);

    // The ground either side is ordinary and takes its owner's grass.
    assert.equal(f.resolve(9, y).owner, 'satyr', `row ${y} lost the near bank`);
    assert.equal(f.resolve(11, y).owner, 'naiad', `row ${y} lost the far bank`);
  }
});

test('no amount of planting can ever claim a slope — it is impossible, not unlikely', () => {
  const f = new Fields({ w: 20, h: 20 });
  f.add(ramp(10, 10));
  // Bury it. Twenty-four singles of one species, every one of them adjacent or
  // near-adjacent. If neutrality were a weighting this would beat it.
  for (let y = 8; y <= 12; y++) {
    for (let x = 8; x <= 12; x++) {
      if (x === 10 && y === 10) continue;
      f.add(plant(x, y, 'satyr'));
    }
  }
  assert.ok(f.at('satyr', 10, 10) > 10 * CLAIM_FLOOR, 'the pile-on did not land');
  assert.equal(f.resolve(10, 10).kind, 'neutral');
  assert.equal(f.grassAt(10, 10), 'meadow');
  assert.equal(f.grassGrid().type[10 * 20 + 10], 0, 'the grid disagreed with resolve()');
  assert.equal(f.grassGrid().slope[10 * 20 + 10], 1, 'the grid did not flag the seam');
  assert.equal(f.grassGrid().blocked[10 * 20 + 10], 0, 'a slope is a seam, not a barrier');
  assert.ok(f.isSlope(10, 10));
  assert.equal(f.climbAt(10, 10), CONNECTOR_SPAN);

  // Lift the ramp and the ground it stood on is claimed instantly — the
  // neutrality lived on the slope, not on the tile.
  const r = f.placements.find((p) => isConnector(p));
  f.remove(r);
  assert.equal(f.resolve(10, 10).owner, 'satyr');
  assert.equal(f.isSlope(10, 10), false);
});

test('a slope is a free seam: it severs a patch without severing the influence', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 6; y <= 14; y++) for (let x = 6; x <= 14; x++) f.add(plant(x, y, 'satyr'));
  for (let y = 0; y < 20; y++) f.add(ramp(10, y));

  // ELEVATION.md, "Consequence: slopes are free seams" — two zones adjacent but
  // visually separate, for nothing, and prettier than a hedge.
  const west = f.patch('satyr', 8, 10);
  const east = f.patch('satyr', 12, 10);
  assert.ok(west.size > 4 && east.size > 4, 'both banks should hold thicket');
  assert.ok(!west.tiles.some((t) => t.tx >= 10), 'the patch walked through the seam');
  assert.ok(!east.tiles.some((t) => t.tx <= 10), 'the patch walked through the seam');

  // ...and yet the influence itself never noticed the seam. This is the pair of
  // rules that had to co-exist: neutral ground, permeable ground.
  assert.ok(f.at('satyr', 10, 10) > CLAIM_FLOOR);
  const flat = new Fields({ w: 20, h: 20 });
  for (let y = 6; y <= 14; y++) for (let x = 6; x <= 14; x++) flat.add(plant(x, y, 'satyr'));
  assert.ok(Math.abs(f.at('satyr', 12, 10) - flat.at('satyr', 12, 10)) < 1e-12,
    'the ramp attenuated influence crossing it');
});

// ---------------------------------------------------------------------------
// Rule 2 — terrace flats are ordinary ground
// ---------------------------------------------------------------------------

test('a terrace flat is ordinary ground and takes a grass type normally', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, 3);
  for (let y = 9; y <= 11; y++) for (const x of [13, 14, 15]) f.add(plant(x, y, 'unicorn'));

  assert.equal(f.resolve(14, 10).owner, 'unicorn', 'the upper terrace refused to grow');
  assert.equal(f.grassAt(14, 10), 'millefleurs');
  assert.equal(f.isSlope(14, 10), false);

  // Raising the same garden by three more levels changes nothing about who owns
  // it. Height is not a claim, and it is not an obstacle to one either.
  const before = f.at('unicorn', 14, 10);
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, 6);
  assert.ok(Math.abs(f.at('unicorn', 14, 10) - before) < 1e-12);
  assert.equal(f.resolve(14, 10).owner, 'unicorn');
});

// ---------------------------------------------------------------------------
// Rule 3 — the connector is the doorway through the cliff
// ---------------------------------------------------------------------------

test('influence crosses a 2-level cliff ONLY where a connector bridges it', () => {
  const build = (withRamp) => {
    const f = new Fields({ w: 20, h: 20 });
    // A plateau: everything from x=10 east stands LEVEL_BLOCK levels up. The
    // whole boundary is shut.
    for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, LEVEL_BLOCK);
    if (withRamp) f.add(ramp(9, 10)); // the foot of the cliff, one row only
    f.add(plant(7, 10, 'satyr'));
    f.add(plant(7, 9, 'satyr'));
    f.add(plant(7, 11, 'satyr'));
    return f;
  };

  const shut = build(false);
  for (let y = 0; y < 20; y++) {
    assert.equal(shut.at('satyr', 10, y), 0, `the cliff leaked at row ${y}`);
  }

  const open = build(true);
  assert.ok(open.at('satyr', 10, 10) > 0, 'the ramp did not open the cliff');
  assert.ok(open.at('satyr', 11, 10) > 0, 'influence stopped on the doorstep');
  assert.ok(open.at('satyr', 12, 10) > 0, 'influence did not spread on the terrace above');

  // ONLY there. Six rows up the same cliff face, with no way up, it is still 0 —
  // the doorway is a place, not a general dispensation.
  for (const y of [0, 3, 4, 16, 19]) {
    assert.equal(open.at('satyr', 10, y), 0, `the cliff leaked at row ${y} with no ramp there`);
  }

  // And moving the ramp moves the doorway, which is the player's whole decision:
  // deciding where the ways up are IS deciding where the zones stay joined.
  const moved = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) moved.setLevel(x, y, LEVEL_BLOCK);
  moved.add(plant(7, 10, 'satyr'));
  moved.add(plant(7, 9, 'satyr'));
  moved.add(plant(7, 11, 'satyr'));
  const r = moved.add(ramp(9, 10));
  assert.ok(moved.at('satyr', 11, 10) > 0);
  moved.remove(r);
  // Zero to within the stamp's own arithmetic: re-flooding a source through a
  // changed graph adds and subtracts the same doubles in a different order, so
  // the module's other inverse checks read the same way.
  assert.ok(Math.abs(moved.at('satyr', 11, 10)) < 1e-12,
    `lifting the ramp did not re-sever the terrace: ${moved.at('satyr', 11, 10)}`);
});

test('a ramp reaches one level, so a 3-level cliff stays shut', () => {
  // The bound is geometry, not policy: the head of the ramp is CONNECTOR_SPAN
  // above its foot, so it can shake hands with ground up to LEVEL_BLOCK-1 above
  // its head and no higher. ELEVATION.md: a taller cliff wants two flights.
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, 3);
  f.add(ramp(9, 10));
  f.add(plant(7, 10, 'satyr'));
  assert.equal(f.at('satyr', 10, 10), 0, 'one flight climbed three levels');

  // Two flights, which is what a terraced garden actually looks like: a ledge at
  // level 1 and another at 2, each with its own ramp.
  const g = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) g.setLevel(x, y, 3);
  for (let y = 0; y < 20; y++) g.setLevel(9, y, 1);
  g.add(ramp(8, 10));
  g.add(ramp(9, 10));
  g.add(plant(7, 10, 'satyr'));
  assert.ok(g.at('satyr', 10, 10) > 0, 'two flights did not climb three levels');
});

test('the doorway tile is neutral ground and the influence goes through it anyway', () => {
  // The two rules on one tile, which is the whole point of the section.
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, LEVEL_BLOCK);
  f.add(ramp(9, 10));
  for (let y = 8; y <= 12; y++) for (const x of [6, 7, 8]) f.add(plant(x, y, 'satyr'));
  assert.ok(f.at('satyr', 9, 10) > CLAIM_FLOOR, 'the doorway received no influence');
  assert.equal(f.resolve(9, 10).kind, 'neutral', 'the doorway was claimed');
  assert.ok(f.at('satyr', 11, 10) > 0, 'nothing got through the doorway');
});

// ---------------------------------------------------------------------------
// The symmetry — a hedge arch and a ramp are the same object twice
// ---------------------------------------------------------------------------

test('a hedge arch and a ramp behave identically as doorways', () => {
  // Measured on a single row so the two are exactly comparable: an arch gates a
  // tile AXIS and a ramp opens an EDGE, and on a 1-wide map both of those are
  // simply "along the row", with no diagonals to tell them apart. What is left
  // is the claim itself — that a barrier with its doorway passes exactly what
  // open ground passes, and a barrier without one passes nothing — and that
  // claim comes out with the same numbers for both.
  const row = (build) => {
    const f = new Fields({ w: 21, h: 1 });
    build(f);
    f.add(plant(7, 0, 'satyr'));
    return Array.from({ length: 21 }, (_, x) => f.at('satyr', x, 0));
  };

  const open = row(() => {});
  const walled = row((f) => f.add(hedge(10, 0)));
  const arched = row((f) => f.add(arch(10, 0)));
  const cliff = row((f) => {
    for (let x = 10; x < 21; x++) f.setLevel(x, 0, LEVEL_BLOCK);
  });
  const ramped = row((f) => {
    for (let x = 10; x < 21; x++) f.setLevel(x, 0, LEVEL_BLOCK);
    f.add(ramp(9, 0));
  });

  // Both barriers stop dead at the same tile.
  for (let x = 10; x <= 13; x++) {
    assert.equal(walled[x], 0, `the hedge leaked at ${x}`);
    assert.equal(cliff[x], 0, `the cliff leaked at ${x}`);
  }
  // Both doorways pass exactly what open ground passes — and therefore exactly
  // what each other passes. Same rule, twice.
  for (let x = 0; x < 21; x++) {
    assert.ok(Math.abs(arched[x] - open[x]) < 1e-12, `the arch changed the profile at ${x}`);
    assert.ok(Math.abs(ramped[x] - open[x]) < 1e-12, `the ramp changed the profile at ${x}`);
    assert.ok(Math.abs(arched[x] - ramped[x]) < 1e-12,
      `arch and ramp disagreed at ${x}: ${arched[x]} vs ${ramped[x]}`);
  }
  assert.ok(open[13] > 0, 'the reference profile was empty — the test proved nothing');
});

test('the two doorways are the same shape in two dimensions too', () => {
  // Same statement off the single row: a barrier across the map with one gap in
  // it, built once as hedge+arch and once as cliff+ramp. The numbers differ in
  // detail (an arch is gated to one axis, a ramp is not — see
  // NEEDS_DESIGN['connector-orientation']), so what is asserted is the SHAPE:
  // shut everywhere along the line, open at the gap, and weaker past the gap
  // than a straight run would be because of the detour.
  const shapes = [];
  for (const kind of ['hedge', 'cliff']) {
    const f = new Fields({ w: 20, h: 20 });
    if (kind === 'hedge') {
      for (let y = 0; y < 20; y++) f.add(y === 10 ? arch(11, y) : hedge(11, y));
    } else {
      for (let y = 0; y < 20; y++) for (let x = 11; x < 20; x++) f.setLevel(x, y, LEVEL_BLOCK);
      f.add(ramp(10, 10));
    }
    f.add(plant(9, 10, 'satyr'));
    shapes.push({
      kind,
      throughGap: f.at('satyr', 12, 10),
      offGap: f.at('satyr', 12, 4),
      pastGap: f.at('satyr', 13, 12),
    });
  }
  for (const s of shapes) {
    assert.ok(s.throughGap > 0, `${s.kind}: nothing came through the gap`);
    assert.equal(s.offGap, 0, `${s.kind}: the barrier leaked away from the gap`);
    assert.ok(s.pastGap > 0, `${s.kind}: influence did not spread past the gap`);
    assert.ok(s.pastGap < s.throughGap, `${s.kind}: the detour round the gap cost nothing`);
  }
});

// ---------------------------------------------------------------------------
// The invariants the rest of the module lives by, with connectors in the mix
// ---------------------------------------------------------------------------

test('remove() is still an exact inverse when connectors are on the map', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, LEVEL_BLOCK);
  const planted = [];
  for (let y = 8; y <= 12; y++) for (const x of [7, 8]) planted.push(f.add(plant(x, y, 'satyr')));
  const before = Float64Array.from(f.data.satyr);

  const r1 = f.add(ramp(9, 10));
  const r2 = f.add(stair(9, 11));
  assert.ok(f.at('satyr', 11, 10) > 0);
  f.remove(r1);
  f.remove(r2);

  let worst = 0;
  for (let i = 0; i < before.length; i++) {
    worst = Math.max(worst, Math.abs(before[i] - f.data.satyr[i]));
  }
  assert.ok(worst < 1e-12, `lifting the connectors left ${worst} behind`);
  assert.ok(planted.length > 0);
});

test('the incremental path equals a full rebuild with ramps, hedges and terraces mixed', () => {
  // The new way for an incremental field to go quietly wrong is a connector
  // that was added to the graph but never re-flooded through, or a rebuild that
  // forgot the ramps and silently re-severed every terrace the player joined.
  let seed = 20260730;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const f = new Fields({ w: 20, h: 20 });
  const live = [];
  for (let step = 0; step < 400; step++) {
    const roll = rnd();
    if (roll < 0.18) {
      f.setLevel(Math.floor(rnd() * 20), Math.floor(rnd() * 20), Math.floor(rnd() * 4));
    } else if (roll < 0.34 && live.length) {
      f.remove(live.splice(Math.floor(rnd() * live.length), 1)[0]);
    } else {
      const tx = Math.floor(rnd() * 20);
      const ty = Math.floor(rnd() * 20);
      const kind = rnd();
      const p = kind < 0.2 ? ramp(tx, ty)
        : kind < 0.3 ? stair(tx, ty)
          : kind < 0.4 ? hedge(tx, ty)
            : kind < 0.5 ? arch(tx, ty)
              : plant(tx, ty, ['satyr', 'centaur', 'naiad', 'unicorn'][Math.floor(rnd() * 4)]);
      live.push(f.add(p));
    }
  }
  const { worst, axis } = f.verifyIncremental();
  assert.ok(worst < 1e-9, `incremental drifted from rebuild by ${worst} on ${axis}`);
});

test('a rebuild keeps the ways up — the terraces stay joined across it', () => {
  const f = new Fields({ w: 20, h: 20 });
  for (let y = 0; y < 20; y++) for (let x = 10; x < 20; x++) f.setLevel(x, y, LEVEL_BLOCK);
  f.add(ramp(9, 10));
  f.add(plant(7, 10, 'satyr'));
  const before = f.at('satyr', 11, 10);
  assert.ok(before > 0);
  f.rebuild();
  assert.ok(Math.abs(f.at('satyr', 11, 10) - before) < 1e-12,
    'the rebuild lost the ramp and re-severed the terrace');
  assert.equal(f.climbAt(9, 10), CONNECTOR_SPAN, 'the rebuild lost the slope itself');
  assert.equal(f.resolve(9, 10).kind, 'neutral', 'the rebuild let the slope be claimed');
});
