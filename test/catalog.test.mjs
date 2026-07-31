// test/catalog.test.mjs — catalogue integrity and the tag contract (SPEC §10).
//
// The tag vocabulary is the single highest-risk seam in the project, because a
// requirement keyed on a tag no placeable carries does not fail loudly. It just
// never fires. The creature ladders shipped asking for `spring`, `pool`,
// `herb`, `krater` and `conduit`; the catalogue carried `spring-head`,
// `still-water`, `physic`, `wine` and `fountain`. Four of the five creatures
// could never settle, and the game booted clean.
//
// So: BOTH directions are asserted here, and the direction that was broken is
// the first test in the file.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATALOG, GROUPS, AXES, GROUND_TYPES, ALL_TAGS, TAGS, byId, byGroup, byTag,
  isGroundPainter, starterSet, unlockGraph,
  // docs/TOMBS.md
  EPITAPHS, TOMB_IDS, TOMB_TENDING, epitaphsFor, isOffering, isTomb,
  ARCADIAN_UNLOCK, arcadianTombFound, tombTended,
} from '../js/catalog.js';
import { CREATURES, CREATURE_BY_ID, RUNGS, REQUIRED_TAGS, BEATS } from '../js/creatures.js';
import * as tiles from '../js/art/tiles.js';
import * as props from '../js/art/props.js';
import * as extras from '../js/art/extras.js';
// art/decor.js is the fifth art module and the catalogue names 37 of its
// sprites. It was missing from this registry, so `every placeable names art
// that exists` was only ever checking four fifths of the art — and it passed
// while 2,494 lines of authored decor were unreachable. The registry here must
// list exactly what js/main.js's createArtist() lists, or this test cannot mean
// what its name says.
import * as decor from '../js/art/decor.js';
import { COMPOSERS, COMPOSER_INFO, compose } from '../js/art/grow.js';

const carried = new Set(CATALOG.flatMap((p) => p.tags || []));

test('every tag a creature requirement asks for is carried by some placeable', () => {
  const orphans = REQUIRED_TAGS.filter((t) => !carried.has(t));
  assert.deepEqual(
    orphans,
    [],
    `these requirements can never fire: ${orphans.join(', ')}`
  );
});

test('every tag on a placeable is in the declared vocabulary', () => {
  const declared = new Set(ALL_TAGS);
  for (const p of CATALOG) {
    for (const t of p.tags || []) {
      assert.ok(declared.has(t), `'${p.id}' carries '${t}', which is not in ALL_TAGS`);
    }
  }
  // ...and the vocabulary declares nothing nobody uses.
  for (const t of ALL_TAGS) assert.ok(carried.has(t), `ALL_TAGS declares '${t}' and no placeable carries it`);
  // ...and the grouped view is the same set as the flat one.
  const grouped = new Set(Object.values(TAGS).flat());
  assert.deepEqual([...grouped].sort(), [...declared].sort());
});

test('every behavioural beat can happen somewhere', () => {
  // A beat is watched, not computed (SPEC §7). If its site tag exists on
  // nothing, the creature reaches `settles` minus one requirement, for ever.
  for (const beat of Object.values(BEATS)) {
    const reachable = beat.site.filter((t) => carried.has(t));
    assert.ok(reachable.length > 0, `beat '${beat.id}' has no site: ${beat.site.join(', ')}`);
  }
});

test('ids are unique and well formed', () => {
  const seen = new Set();
  for (const p of CATALOG) {
    assert.match(p.id, /^[a-z][a-z0-9-]*$/, `id '${p.id}'`);
    assert.ok(!seen.has(p.id), `duplicate id '${p.id}'`);
    seen.add(p.id);
    assert.equal(byId(p.id), p, `byId('${p.id}') did not round-trip`);
  }
});

// SPEC §5 asked for "roughly 45-60 placeables", and THAT NUMBER IS DEAD. It was
// written before the addenda, and every one of them adds content it could not
// have counted:
//
//     DECOR.md Part I    33   the affinity vocabulary — a fixed census
//     DECOR.md Part II   60   "roughly 60 entries here on top of the 33"
//     ELEVATION.md        9   connectors, cave mouths, the fall pieces
//     TOMBS.md            5   the funerary structures, one of them hidden
//                       ---
//                       107   derived from the docs
//
// on top of the base ground, water and plants DECOR.md explicitly preserves
// ("Ground tiles, water, and non-affinity scenery are not in this count and
// still exist"). THE SHIPPED CATALOGUE IS 135. If that figure moves, it is
// because somebody added or removed content, and the band below is wide enough
// to let a wave land and narrow enough that a catalogue which doubled by
// accident would be caught.
//
// The band is the weak half of this test and it is deliberately not the point.
// A count cannot tell a catalogue that grew correctly from one that grew by
// accident; what the docs actually fix is the CENSUS, and that is asserted
// exactly, below and in catalog.js's own load-time self-check. A thirteenth
// single, a sixth tomb, or a second hidden object is a fault however many
// placeables happen to exist that day.
test('the catalogue is the size the docs ask for, weighted toward plants', () => {
  const doc = 33 + 60 + 9 + 5; // DECOR I + DECOR II + ELEVATION + TOMBS = 107
  const shipped = 135;
  assert.ok(
    CATALOG.length >= doc && CATALOG.length <= doc + 60,
    `${CATALOG.length} placeables: the addenda derive ${doc} and the catalogue shipped ` +
      `${shipped}, plus the base ground/water/plants DECOR.md preserves`
  );
  const counts = Object.fromEntries(GROUPS.map((g) => [g, byGroup(g).length]));
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), CATALOG.length, 'a placeable is in no group');
  assert.ok(counts.plants >= counts.trees, `plants ${counts.plants} vs trees ${counts.trees}`);
  assert.ok(counts.plants >= 12, `only ${counts.plants} plants`);
});

// docs/TOMBS.md, in the two directions that matter. Both halves of the mechanic
// are properties of the catalogue entry, and either could rot without anything
// throwing: a tomb that stopped blocking would quietly become an ornament, and
// a tomb that stopped depositing maturity would quietly become nothing at all.
test('the five tombs block influence and grant maturity', () => {
  const tombs = CATALOG.filter((p) => p.tags.includes('tomb'));
  assert.equal(tombs.length, 5, 'TOMBS.md is five structures');
  for (const t of tombs) {
    assert.ok(t.blocks, `${t.id} must block — nothing grows on a grave`);
    assert.ok(t.deposits.maturity > 0, `${t.id} must grant maturity — a tomb IS a past`);
    assert.equal(Object.keys(t.affinities).length, 0, `${t.id} is a nullifier and emits no affinity`);
  }
  // Exactly one is hidden, and it is Poussin's.
  const hidden = CATALOG.filter((p) => p.hidden);
  assert.deepEqual(hidden.map((p) => p.id), ['arcadian-tomb']);
  // ...and it is hidden rather than creature-gated. `unlockedBy` would put an
  // empty "not yet discovered" slot on the palette, which is a promise, and
  // this object's whole design is that it makes none.
  assert.equal(hidden[0].unlockedBy, null);
});

test('the epitaphs are the curated list, verbatim and without duplicates', () => {
  assert.equal(EPITAPHS.length, 20, 'TOMBS.md lists twenty');
  assert.equal(new Set(EPITAPHS).size, 20, 'two epitaphs are the same line');
  for (const e of EPITAPHS) {
    assert.match(e, /[.:]$/, `"${e}" should end as a sentence`);
    assert.ok(e.length < 60, `"${e}" is too long for the register`);
  }
  // Several are tuned to the denizens, which is why the list is hand-written.
  assert.ok(EPITAPHS.some((e) => /horses/.test(e)), 'nothing for the centaur');
  assert.ok(EPITAPHS.some((e) => /pipes/.test(e)), 'nothing for the satyr');
  assert.ok(EPITAPHS.some((e) => /river|channel/.test(e)), 'nothing for the naiad');
});

test('epitaphs are assigned without repeat, and are stable across a reload', () => {
  const uids = [4, 11, 27, 33, 108];
  const a = epitaphsFor(uids);
  assert.equal(a.size, uids.length);
  assert.equal(new Set(a.values()).size, uids.length, 'two graves share a verse');
  for (const v of a.values()) assert.ok(EPITAPHS.includes(v), `"${v}" is not on the list`);
  // The allocator is a pure function of the SET, so a reload — which walks the
  // objects in whatever order the save happens to hold — gives the same answer.
  const b = epitaphsFor([...uids].reverse());
  for (const uid of uids) assert.equal(b.get(uid), a.get(uid), `uid ${uid} drifted`);
});

test('tending is a smaller gift and never a penalty', () => {
  assert.ok(TOMB_TENDING.neglectedShare > 0, 'a neglected grave still gives');
  assert.ok(TOMB_TENDING.neglectedShare < 1, 'and a tended one gives more');
  assert.equal(TOMB_TENDING.radius, 2, 'TOMBS.md says within 2 tiles');
  // Every tag the rule looks for must be carried by something a player can
  // actually put beside a grave, or the mechanic can never fire.
  for (const tag of TOMB_TENDING.tags) {
    const carriers = byTag(tag).filter((p) => !p.tags.includes('tomb'));
    assert.ok(carriers.length > 0, `nothing but a tomb carries '${tag}'`);
  }
  // A tomb must not tend itself, or its neighbour.
  for (const id of TOMB_IDS) assert.equal(isOffering(byId(id)), false, `${id} tends itself`);
});

test('the affinity census is exactly DECOR.md’s table', () => {
  const cls = (name) => CATALOG.filter((p) => p.zoneClass === name).length;
  assert.equal(cls('single'), 12, '4 species x 3 singles');
  assert.equal(cls('dual'), 12, '6 pairs x 2 duals');
  assert.equal(cls('triple'), 4, '4 triples x 1');
  // Weights: breadth costs strength, or the optimal garden is all triples.
  const weightOf = (name) => {
    const p = CATALOG.find((d) => d.zoneClass === name);
    return Math.max(...Object.values(p.affinities || {}));
  };
  assert.equal(weightOf('single'), 1.0);
  assert.equal(weightOf('dual'), 0.7);
  assert.equal(weightOf('triple'), 0.5);
});

test('every placeable has a real blurb', () => {
  for (const p of CATALOG) {
    assert.equal(typeof p.blurb, 'string', `${p.id} has no blurb`);
    assert.ok(p.blurb.length > 20, `${p.id}'s blurb is a stub: "${p.blurb}"`);
    assert.ok(!/%|score|rating|points/i.test(p.blurb), `${p.id}'s blurb implies judgement`);
  }
  assert.equal(new Set(CATALOG.map((p) => p.blurb)).size, CATALOG.length, 'two placeables share a blurb');
});

test('deposits are on the five axes, in range, and order is not inverse wildness', () => {
  for (const p of CATALOG) {
    for (const [axis, v] of Object.entries(p.deposits || {})) {
      assert.ok(AXES.includes(axis), `${p.id} deposits on unknown axis '${axis}'`);
      assert.ok(Number.isFinite(v) && v >= -3 && v <= 3, `${p.id}.${axis} = ${v}`);
    }
  }
  // SPEC §6 requires order and wildness to be genuinely independent. Correlated
  // at -1 they are one axis wearing two hats; the catalogue must populate all
  // four quadrants and stay well off the anti-diagonal.
  const xs = CATALOG.map((p) => (p.deposits && p.deposits.order) || 0);
  const ys = CATALOG.map((p) => (p.deposits && p.deposits.wildness) || 0);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const corr = num / Math.sqrt(dx * dy);
  assert.ok(corr > -0.85, `corr(order, wildness) = ${corr.toFixed(3)} — that is one axis, not two`);
  const quad = (fx, fy) => CATALOG.filter((p) => fx((p.deposits || {}).order || 0) && fy((p.deposits || {}).wildness || 0)).length;
  const pos = (v) => v > 0;
  const nonpos = (v) => v <= 0;
  assert.ok(quad(pos, pos) > 0, 'nothing is ordered AND wild — a made meadow');
  assert.ok(quad(pos, nonpos) > 0, 'nothing is ordered and tame — a swept walk');
  assert.ok(quad(nonpos, pos) > 0, 'nothing is disordered and wild — a ruin');
  assert.ok(quad(nonpos, nonpos) > 0, 'nothing is disordered and tame — bare scree');
});

test('every unlockedBy names a real creature', () => {
  for (const p of CATALOG) {
    if (p.unlockedBy == null) continue;
    assert.ok(CREATURE_BY_ID.get(p.unlockedBy), `${p.id} is unlocked by '${p.unlockedBy}', which is not a creature`);
  }
});

test('no orphan content: every placeable is reachable from an empty garden', () => {
  // A gate must never be a plausible settle REQUIREMENT of the creature that
  // opens it, or the unlock graph has a cycle and the content is unreachable.
  const graph = unlockGraph();
  for (const creature of graph.keys()) {
    assert.ok(CREATURE_BY_ID.get(creature), `unlockGraph gates content behind '${creature}'`);
  }
  const open = new Set(starterSet().map((p) => p.id));
  assert.ok(open.size > 0, 'an empty garden can place nothing at all');

  const requiredIds = new Set();
  for (const c of CREATURES) {
    for (const rung of RUNGS) {
      for (const r of c.rungs[rung]) {
        if (r.kind !== 'count' || !r.tag) continue;
        for (const p of byTag(r.tag)) requiredIds.add(`${c.id}:${p.id}`);
      }
    }
  }

  let changed = true;
  const settled = new Set();
  while (changed) {
    changed = false;
    for (const c of CREATURES) {
      if (settled.has(c.id)) continue;
      // A creature can settle if every count requirement on every rung up to
      // `settles` has at least one currently-placeable carrier.
      const need = RUNGS.slice(0, RUNGS.indexOf('settles') + 1)
        .flatMap((r) => c.rungs[r])
        .filter((r) => r.kind === 'count' && r.min !== 0 && r.n > 0);
      const ok = need.every((r) => byTag(r.tag).some((p) => open.has(p.id)));
      if (!ok) continue;
      settled.add(c.id);
      changed = true;
      for (const p of CATALOG) if (p.unlockedBy === c.id) open.add(p.id);
    }
  }

  const unreachable = CATALOG.filter((p) => !open.has(p.id)).map((p) => p.id);
  assert.deepEqual(unreachable, [], `unreachable placeables: ${unreachable.join(', ')}`);
  assert.ok(requiredIds.size > 0);
});

test('ground painters paint a real ground type; objects do not', () => {
  for (const p of CATALOG) {
    if (isGroundPainter(p)) {
      assert.ok(GROUND_TYPES.includes(p.ground), `${p.id} paints '${p.ground}'`);
      assert.ok(Array.isArray(p.footprint), `${p.id} needs a brush size`);
    } else {
      assert.ok(p.ground == null, `${p.id} is not a painter but declares ground '${p.ground}'`);
    }
  }
});

test('every footprint is a positive rectangle (SPEC §2)', () => {
  for (const p of CATALOG) {
    assert.ok(Array.isArray(p.footprint) && p.footprint.length === 2, `${p.id} footprint`);
    const [w, h] = p.footprint;
    assert.ok(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0, `${p.id} footprint ${p.footprint}`);
  }
});

// ---------------------------------------------------------------------------
// The art seam: every placeable must actually draw something
// ---------------------------------------------------------------------------

function spriteRegistry() {
  const reg = new Map();
  const take = (mod) => {
    for (const v of Object.values(mod)) {
      if (v && typeof v === 'object' && Array.isArray(v.rows) && v.anchor) reg.set(v.name, v);
      else if (Array.isArray(v)) for (const s of v) if (s && s.rows && s.anchor) reg.set(s.name, s);
      else if (v && typeof v === 'object') for (const s of Object.values(v)) if (s && s.rows && s.anchor) reg.set(s.name, s);
    }
  };
  take(tiles);
  take(props);
  take(extras);
  take(decor);
  return reg;
}

test('every placeable names art that exists', () => {
  const reg = spriteRegistry();
  const missing = [];
  for (const p of CATALOG) {
    assert.ok(p.art && (p.art.kind === 'sprite' || p.art.kind === 'grow'), `${p.id} has no art`);
    if (p.art.kind === 'sprite') {
      if (!reg.has(p.art.sprite)) missing.push(`${p.id} -> sprite '${p.art.sprite}'`);
    } else if (!COMPOSERS[p.art.composer]) {
      missing.push(`${p.id} -> composer '${p.art.composer}'`);
    }
  }
  assert.deepEqual(missing, [], `art the catalogue names and nothing provides:\n  ${missing.join('\n  ')}`);
});

test('every grow placeable names a variant its composer knows', () => {
  for (const p of CATALOG) {
    if (!p.art || p.art.kind !== 'grow') continue;
    const info = COMPOSER_INFO[p.art.composer];
    assert.ok(info, `${p.id}: no COMPOSER_INFO for '${p.art.composer}'`);
    if (!info.key) continue;
    const v = (p.art.params || {})[info.key];
    if (v == null) continue; // the composer's own default is fine
    assert.ok(
      info.variants.includes(v),
      `${p.id} asks ${p.art.composer} for ${info.key}='${v}'; it knows ${info.variants.join(', ')}`
    );
  }
});

test('every grow placeable composes at every stage without throwing', () => {
  for (const p of CATALOG) {
    if (!p.art || p.art.kind !== 'grow') continue;
    for (const stage of ['sprout', 'young', 'mature']) {
      const s = compose(p.art.composer, 4242, { ...p.art.params, stage });
      assert.ok(s && s.rows && s.rows.length, `${p.id} at '${stage}' composed nothing`);
    }
  }
});

// ---------------------------------------------------------------------------
// The tending rule and the hidden tomb, against a world-shaped stub. Both only
// need `objects` and `ageDays`, deliberately, so they can be checked without
// standing a whole World up and without either of them growing a dependency on
// one — see catalog.js.
// ---------------------------------------------------------------------------

const stubWorld = (objects, days = 0) => ({
  objects: objects.map((o, i) => ({ uid: i + 1, ...o })),
  ageDays: () => days,
});

test('a tomb is tended by an offering within two tiles, measured footprint to footprint', () => {
  const grave = { id: 'grave-stele', tx: 10, ty: 10 };
  const bare = stubWorld([grave]);
  assert.equal(tombTended(bare, bare.objects[0]), false, 'a grave alone is not tended');

  const near = stubWorld([grave, { id: 'madonna-lily', tx: 12, ty: 10 }]);
  assert.equal(tombTended(near, near.objects[0]), true, 'lilies two tiles away');

  const far = stubWorld([grave, { id: 'madonna-lily', tx: 13, ty: 10 }]);
  assert.equal(tombTended(far, far.objects[0]), false, 'three tiles is out of reach');

  // A votive counts, which is what makes the libation altar of TOMBS.md work
  // without needing a tag of its own.
  const votive = stubWorld([grave, { id: 'votive-shelf', tx: 10, ty: 12 }]);
  assert.equal(tombTended(votive, votive.objects[0]), true);

  // And a 2x2 heroon is reached from its nearest tile, not from its origin —
  // otherwise the big tombs would be quietly harder to keep than the small.
  const big = stubWorld([{ id: 'heroon', tx: 10, ty: 10 }, { id: 'madonna-lily', tx: 13, ty: 11 }]);
  assert.equal(tombTended(big, big.objects[0]), true);
});

test('the Arcadian tomb wants an old, tended grave standing on old ground', () => {
  const deep = () => ARCADIAN_UNLOCK.maturity + 1;
  const young = stubWorld([{ id: 'heroon', tx: 5, ty: 5 }, { id: 'madonna-lily', tx: 7, ty: 5 }], 1);
  assert.equal(arcadianTombFound(young, deep), false, 'a new grave is not a past');

  const old = stubWorld(
    [{ id: 'heroon', tx: 5, ty: 5 }, { id: 'madonna-lily', tx: 7, ty: 5 }],
    ARCADIAN_UNLOCK.days + 1
  );
  assert.equal(arcadianTombFound(old, deep), true, 'old, tended, and on deep ground');
  assert.equal(arcadianTombFound(old, () => 0), false, 'the glade is not mature enough');

  const neglected = stubWorld([{ id: 'heroon', tx: 5, ty: 5 }], ARCADIAN_UNLOCK.days + 1);
  assert.equal(arcadianTombFound(neglected, deep), false, 'nobody has been leaving anything');

  // The hidden tomb cannot be its own key.
  const self = stubWorld(
    [{ id: 'arcadian-tomb', tx: 5, ty: 5 }, { id: 'madonna-lily', tx: 7, ty: 5 }],
    ARCADIAN_UNLOCK.days + 1
  );
  assert.equal(arcadianTombFound(self, deep), false);
  assert.equal(isTomb(byId('arcadian-tomb')), true);
});

test('no two tree species render as the same sprite', () => {
  // The seam this guards: catalog.js originally named species that grow.js does
  // not have ('columnar', 'gnarled', 'umbrella'), so every broadleaf silently
  // fell back to the same default and the whole wood was oaks.
  const seen = new Map();
  for (const p of byGroup('trees')) {
    if (p.art.kind !== 'grow') continue;
    const rows = compose(p.art.composer, 1, { ...p.art.params }).rows.join('|');
    const twin = seen.get(rows);
    assert.ok(!twin, `${p.id} renders identically to ${twin}`);
    seen.set(rows, p.id);
  }
});
