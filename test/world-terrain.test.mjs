// test/world-terrain.test.mjs — elevation in the TILE MODEL, and the placement
// rules that follow from it (js/world.js). docs/ELEVATION.md.
//
// test/elevation.test.mjs covers the PROJECTION side of the same feature — the
// pixels. This file covers the map side: what a level is, what raise / lower /
// level do to it, what rides up with it, what the save does with it, and which
// placements the world refuses and with what words.
//
// The claims that are load-bearing, and why each is here:
//
//   * TERRAIN EDITING COSTS NOTHING AND IS ALWAYS REVERSIBLE. SPEC §0 is
//     absolute. A test is the only thing that stops a "small" cost creeping in
//     later, so the undo assertions are exact and the serialised state is
//     scanned for the vocabulary of an economy.
//   * OBJECTS RIDE UP. Not "usually" — a multi-tile object can NEVER be left
//     straddling two heights, because that is not a state the renderer or the
//     player can make sense of.
//   * A V1 SAVE STILL OPENS. Never losing a garden is the floor of a cosy game,
//     and a save written before elevation existed is a flat garden, which is a
//     complete answer rather than a compromise.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  World,
  MIN_LEVEL,
  MAX_LEVEL,
  TERRACE_BLOCK,
  SAVE_VERSION,
  GRASS_TYPES,
  parseRegion,
  isConnector,
  clampLevel,
} from '../js/world.js';
import { MAX_LEVEL as ISO_MAX_LEVEL } from '../js/iso.js';
import { CATALOG, byId } from '../js/catalog.js';

/** The first catalogue entry matching a predicate, or undefined. */
const find = (fn) => CATALOG.find(fn);

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

test('a new glade is flat, and flat means level 0 everywhere', () => {
  const w = new World({ seed: 1 });
  for (let ty = 0; ty < w.h; ty++) {
    for (let tx = 0; tx < w.w; tx++) assert.equal(w.levelAt(tx, ty), MIN_LEVEL);
  }
  assert.equal(w.levelAt(-1, 0), null, 'off the map is null, not a height');
});

test('world.js and iso.js agree on the ceiling', () => {
  // They are deliberately separate constants — one is the tile model, one is the
  // projection — but a disagreement would draw terraces the map does not have.
  assert.equal(MAX_LEVEL, ISO_MAX_LEVEL);
});

test('clampLevel never returns something illegal', () => {
  for (const junk of [NaN, undefined, null, -3, 99, '4', Infinity, -Infinity]) {
    const v = clampLevel(junk);
    assert.ok(Number.isInteger(v) && v >= MIN_LEVEL && v <= MAX_LEVEL, `clampLevel(${junk}) = ${v}`);
  }
});

// ---------------------------------------------------------------------------
// The three verbs
// ---------------------------------------------------------------------------

test('raise and lower move a region by exactly one level', () => {
  const w = new World({ seed: 2 });
  const r = w.raise(3, 3, 5, 5);
  assert.equal(r.ok, true);
  assert.equal(r.changed.length, 9, 'a 3x3 region is nine tiles');
  assert.equal(w.levelAt(4, 4), 1);
  assert.equal(w.levelAt(6, 6), 0, 'the edit did not leak outside the region');
  w.lower(3, 3, 5, 5);
  assert.equal(w.levelAt(4, 4), 0);
});

test('level flattens a region to the height of the tile the drag started on', () => {
  const w = new World({ seed: 3 });
  w.raise(0, 0, 3, 3);
  w.raise(0, 0, 1, 1); // (0,0) is now 2, (3,3) is 1
  assert.equal(w.levelAt(0, 0), 2);
  assert.equal(w.levelAt(3, 3), 1);
  // Dragged FROM (3,3): everything comes down to 1, not up to 2.
  w.flatten(3, 3, 0, 0);
  assert.equal(w.levelAt(0, 0), 1);
  assert.equal(w.levelAt(3, 3), 1);
  assert.equal(w.levelAt(1, 1), 1);
});

test('the ceiling and the floor refuse warmly, and change nothing', () => {
  const w = new World({ seed: 4 });
  for (let i = 0; i < MAX_LEVEL; i++) assert.equal(w.raise(1, 1).ok, true);
  assert.equal(w.levelAt(1, 1), MAX_LEVEL);
  const r = w.raise(1, 1);
  assert.equal(r.ok, false);
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0, 'a refusal must say something, not nothing');
  assert.equal(w.levelAt(1, 1), MAX_LEVEL, 'a refused raise still changed the map');

  const d = w.lower(9, 9);
  assert.equal(d.ok, false);
  assert.equal(w.levelAt(9, 9), MIN_LEVEL);
});

test('a partly-blocked region still moves the part that can move', () => {
  const w = new World({ seed: 5 });
  for (let i = 0; i < MAX_LEVEL; i++) w.raise(2, 2);
  const r = w.raise(2, 2, 3, 2); // (2,2) is at the ceiling, (3,2) is not
  assert.equal(r.ok, true);
  assert.equal(r.blocked, 1);
  assert.equal(w.levelAt(2, 2), MAX_LEVEL);
  assert.equal(w.levelAt(3, 2), 1);
});

test('every region spelling reaches the same tiles', () => {
  const a = parseRegion([2, 2, 3, 3]).tiles;
  const b = parseRegion([{ x0: 2, y0: 2, x1: 3, y1: 3 }]).tiles;
  const c = parseRegion([{ x0: 2, y0: 2, w: 2, h: 2 }]).tiles;
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  // Dragged backwards, the ANCHOR is still the tile the drag began on.
  assert.deepEqual(parseRegion([3, 3, 2, 2]).tiles[0], [3, 3]);
  // An explicit brush path keeps its order and drops repeats.
  assert.deepEqual(parseRegion([[[1, 1], [2, 1], [1, 1]]]).tiles, [[1, 1], [2, 1]]);
});

// ---------------------------------------------------------------------------
// SPEC §0 — free, unlimited, reversible
// ---------------------------------------------------------------------------

test('terrain editing is free — no cost, no counter, no budget anywhere', () => {
  const w = new World({ seed: 6 });
  for (let i = 0; i < 200; i++) w.raise(i % 20, (i * 7) % 20);
  const json = JSON.stringify(w.serialize());
  assert.ok(!/cost|currency|coin|money|energy|cooldown|budget|charge/i.test(json));
});

test('a dragged terrace is ONE undo step, and undo is exact', () => {
  const w = new World({ seed: 7 });
  const before = [];
  for (let i = 0; i < w.levels.length; i++) before.push(w.levels[i]);

  const depth = w.undoStack.length;
  w.raise(2, 2, 8, 8); // 49 tiles
  assert.equal(w.undoStack.length, depth + 1, 'a 49-tile drag is not one undo step');
  assert.equal(w.levelAt(5, 5), 1);

  assert.equal(w.undo(), true);
  for (let i = 0; i < w.levels.length; i++) {
    assert.equal(w.levels[i], before[i], 'undo did not restore the ground exactly');
  }
});

test('undo unwinds a whole terraced hillside, step by step, to flat', () => {
  const w = new World({ seed: 8 });
  // Nested regions: a proper stepped hillside, one raise per terrace, and no
  // raise that hits the ceiling (which would record nothing and skew the count).
  for (let i = 0; i < MAX_LEVEL; i++) {
    assert.equal(w.raise(0, 0, MAX_LEVEL * 2 - i, MAX_LEVEL * 2 - i).ok, true);
  }
  assert.equal(w.levelAt(0, 0), MAX_LEVEL);
  assert.equal(w.levelAt(MAX_LEVEL * 2, MAX_LEVEL * 2), 1, 'the foot of the hill is one step up');
  for (let i = 0; i < MAX_LEVEL; i++) assert.equal(w.undo(), true);
  for (let i = 0; i < w.levels.length; i++) assert.equal(w.levels[i], 0, 'the hill did not fully unwind');
});

test('a terrain edit emits, so fields.js can recompute incrementally', () => {
  const w = new World({ seed: 9 });
  const seen = [];
  w.subscribe((ev) => seen.push(ev));
  w.raise(4, 4, 5, 5);
  const ev = seen.find((e) => e.type === 'level');
  assert.ok(ev, 'no level event was emitted');
  assert.equal(ev.op, 'raise');
  assert.equal(ev.tiles.length, 4);
  assert.equal(ev.tiles[0].next - ev.tiles[0].prev, 1);
});

// ---------------------------------------------------------------------------
// Objects ride up
// ---------------------------------------------------------------------------

test('raising the ground under an object is legal and the object rides up', () => {
  const w = new World({ seed: 10 });
  const o = w.place('oak', 5, 5);
  assert.ok(o);
  assert.equal(w.levelOf(o), 0);
  w.raise(5, 5);
  assert.equal(w.levelOf(o), 1, 'the oak did not ride up with its ground');
  assert.equal(w.objectAt(5, 5), o, 'the oak was disturbed by the edit');
  w.undo();
  assert.equal(w.levelOf(o), 0, 'the oak did not ride back down');
});

test('a multi-tile object is never left straddling two heights', () => {
  const multi = find((d) => (d.footprint[0] > 1 || d.footprint[1] > 1) && !d.ground && !isConnector(d));
  assert.ok(multi, 'the catalogue has no multi-tile object to test with');
  const w = new World({ seed: 11 });
  const o = w.place(multi.id, 5, 5);
  assert.ok(o, `could not place ${multi.id}`);

  // Raise ONE tile of the footprint. Its whole footprint must come with it.
  w.raise(5, 5);
  const tiles = [];
  for (let y = 0; y < multi.footprint[1]; y++) {
    for (let x = 0; x < multi.footprint[0]; x++) tiles.push(w.levelAt(5 + x, 5 + y));
  }
  assert.equal(new Set(tiles).size, 1, `${multi.id} ended up on two heights: ${tiles}`);
  assert.equal(tiles[0], 1);

  // And flattening half of it is just as safe.
  w.flatten(5, 5, 5, 5, { to: 3 });
  const after = [];
  for (let y = 0; y < multi.footprint[1]; y++) {
    for (let x = 0; x < multi.footprint[0]; x++) after.push(w.levelAt(5 + x, 5 + y));
  }
  assert.equal(new Set(after).size, 1, `${multi.id} was left uneven by level`);
});

// ---------------------------------------------------------------------------
// Placement legality
// ---------------------------------------------------------------------------

test('a multi-tile object needs level ground, and says so', () => {
  const multi = find((d) => (d.footprint[0] > 1 || d.footprint[1] > 1) && !d.ground && !isConnector(d) && d.flatFooting !== false);
  assert.ok(multi, 'no flat-footed multi-tile object in the catalogue');
  const w = new World({ seed: 12 });
  assert.equal(w.canPlace(multi.id, 5, 5).ok, true, 'refused on genuinely flat ground');
  w.raise(5, 5); // break the footprint's first tile out of level
  const r = w.canPlace(multi.id, 5, 5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /level/i, `the reason must tell the player what to do: "${r.reason}"`);
});

test('a 1x1 object is flat by definition and goes anywhere', () => {
  const w = new World({ seed: 13 });
  for (let i = 0; i < 4; i++) w.raise(5, 5);
  assert.equal(w.canPlace('oak', 5, 5).ok, true, 'a tree cannot stand on a terrace');
});

test('a connector may bridge exactly one level — no more, no less', () => {
  const conn = find((d) => isConnector(d) && d.footprint[0] === 1 && d.footprint[1] === 1);
  assert.ok(conn, 'the catalogue has no 1x1 connector');
  const w = new World({ seed: 14 });

  // Flat ground: nothing to climb.
  const flat = w.canPlace(conn.id, 5, 5);
  assert.equal(flat.ok, false);
  assert.ok(flat.reason && flat.reason.length > 0);

  // One level beside it: legal, which is the whole "1 up, 1 over" rule.
  w.raise(6, 5);
  assert.equal(w.canPlace(conn.id, 5, 5).ok, true, 'a stair refused a one-level step');

  // Two levels: refused, and the reason names the size of the problem.
  w.raise(6, 5);
  const tall = w.canPlace(conn.id, 5, 5);
  assert.equal(tall.ok, false);
  assert.match(tall.reason, /2/, `the reason should name the height: "${tall.reason}"`);
});

test('a connector that the land stops agreeing with is marked, never destroyed', () => {
  const conn = find((d) => isConnector(d) && d.footprint[0] === 1 && d.footprint[1] === 1);
  const w = new World({ seed: 15 });
  w.raise(6, 5);
  const o = w.place(conn.id, 5, 5);
  assert.ok(o);
  assert.equal(w.connectorSound(o), true);
  assert.equal(w.adriftConnectors().length, 0);

  w.lower(6, 5); // take the step away from under it
  assert.equal(w.objectAt(5, 5), o, 'the stair was destroyed by a terrain edit');
  assert.equal(w.connectorSound(o), false);
  assert.equal(w.adriftConnectors().length, 1);

  w.raise(6, 5); // put it back, and the stair is simply sound again
  assert.equal(w.connectorSound(o), true);
});

test('water will not lie across a step', () => {
  const pond = find((d) => d.ground === 'water' && (d.footprint[0] > 1 || d.footprint[1] > 1));
  if (!pond) return; // no multi-tile water painter in the catalogue; nothing to prove
  const w = new World({ seed: 16 });
  assert.equal(w.canPlace(pond.id, 5, 5).ok, true);
  w.raise(5, 5);
  const r = w.canPlace(pond.id, 5, 5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /level|step/i);
});

// ---------------------------------------------------------------------------
// What elevation gives the rest of the game
// ---------------------------------------------------------------------------

test('a two-level step blocks influence and a one-level step does not', () => {
  const w = new World({ seed: 17 });
  assert.equal(w.blocksAcross(5, 5, 6, 5), false, 'flat ground blocks nothing');
  w.raise(6, 5);
  assert.equal(w.blocksAcross(5, 5, 6, 5), false, 'a gentle undulation must stay connected');
  w.raise(6, 5);
  assert.equal(TERRACE_BLOCK, 2);
  assert.equal(w.blocksAcross(5, 5, 6, 5), true, 'a terrace must nullify, like a hedge');
  assert.equal(w.blocksAcross(5, 5, -1, 5), true, 'off the map is a wall');
});

test('a raised tile exposes its two front faces and no others', () => {
  const w = new World({ seed: 18 });
  w.raise(5, 5);
  const faces = w.exposedFaces(5, 5);
  assert.deepEqual(faces.map((f) => f.side).sort(), ['se', 'sw']);
  assert.equal(faces[0].drop, 1);
  assert.deepEqual(w.exposedFaces(6, 5), [], 'the tile below has no face of its own');
});

test('water beside a drop is a waterfall, and it is only ever a read-out', () => {
  const w = new World({ seed: 19 });
  w.raise(5, 5, 6, 6);
  w.raise(5, 5, 6, 6);
  const pond = find((d) => d.ground === 'water');
  assert.ok(pond);
  assert.equal(w.paint(pond.id, 5, 5) !== null, true);
  const falls = w.waterfallAt(5, 5);
  assert.ok(falls.length > 0, 'a pond on a terrace edge does not fall');
  assert.ok(falls.every((f) => f.drop === 2));
  // Nothing flows: the water level did not change, because this is not a sim.
  assert.equal(w.levelAt(5, 5), 2);
  assert.equal(w.waterfallAt(15, 15).length, 0, 'dry ground does not fall');
});

// ---------------------------------------------------------------------------
// The grass cache
// ---------------------------------------------------------------------------

test('grass starts as meadow and is written by whoever computes it', () => {
  const w = new World({ seed: 20 });
  assert.equal(w.grassAt(3, 3), 'meadow');
  assert.equal(w.contestedAt(3, 3), null);

  const changed = w.applyGrass([
    { tx: 3, ty: 3, type: 'fen' },
    { tx: 4, ty: 3, type: 'thicket', second: 'sward' },
  ]);
  assert.equal(changed.length, 2);
  assert.equal(w.grassAt(3, 3), 'fen');
  assert.deepEqual(w.grassInfo(4, 3), { type: 'thicket', second: 'sward', contested: true });
  // Writing the same thing again is not a change, so nothing re-animates.
  assert.equal(w.applyGrass([{ tx: 3, ty: 3, type: 'fen' }]).length, 0);
  assert.ok(GRASS_TYPES.includes('millefleurs'));
});

test('the cache takes fields.js\'s own grid, and the two code orders agree', async () => {
  const { GRASS_TYPES: FIELD_TYPES, GRASS_CODE } = await import('../js/fields.js');
  // The load-bearing agreement: fields.js decides, world.js stores, and if the
  // two lists ever drift the whole garden is painted the wrong species.
  assert.deepEqual([...FIELD_TYPES], [...GRASS_TYPES], 'fields.js and world.js disagree on the grass list');
  assert.equal(GRASS_TYPES[GRASS_CODE.satyr], 'thicket');
  assert.equal(GRASS_TYPES[GRASS_CODE.unicorn], 'millefleurs');

  const w = new World({ seed: 27 });
  const type = new Uint8Array(w.w * w.h);
  const other = new Uint8Array(w.w * w.h);
  type[w.w * 4 + 4] = GRASS_CODE.naiad;
  type[w.w * 5 + 5] = GRASS_CODE.satyr;
  other[w.w * 5 + 5] = GRASS_CODE.unicorn;

  const n = w.cacheGrassGrid({ w: w.w, h: w.h, types: FIELD_TYPES, type, other });
  assert.equal(n, 2);
  assert.equal(w.grassAt(4, 4), 'fen');
  assert.deepEqual(w.grassInfo(5, 5), { type: 'thicket', second: 'millefleurs', contested: true });
  assert.equal(w.cacheGrassGrid({ w: w.w, h: w.h, types: FIELD_TYPES, type, other }), 0);
});

test('the grass cache is derived, so undo never touches it', () => {
  const w = new World({ seed: 21 });
  w.place('oak', 5, 5);
  w.applyGrass([{ tx: 5, ty: 5, type: 'sward' }]);
  const depth = w.undoStack.length;
  w.applyGrass([{ tx: 6, ty: 5, type: 'sward' }]);
  assert.equal(w.undoStack.length, depth, 'a grass write went onto the undo stack');
  w.undo();
  assert.equal(w.grassAt(6, 5), 'sward', 'undo rolled back derived state');
});

// ---------------------------------------------------------------------------
// The save
// ---------------------------------------------------------------------------

test('the save carries levels and the grass cache, and round-trips exactly', () => {
  const w = new World({ seed: 22 });
  w.raise(3, 3, 6, 6);
  w.raise(4, 4, 5, 5);
  w.place('oak', 4, 4);
  w.applyGrass([{ tx: 4, ty: 4, type: 'fen', second: 'thicket' }]);

  const save = w.serialize();
  assert.equal(save.version, SAVE_VERSION);
  assert.ok(Array.isArray(save.levels));
  assert.ok(Array.isArray(save.grassTypes), 'the grass cache needs its own legend too');

  const back = World.deserialize(save);
  assert.deepEqual(Array.from(back.levels), Array.from(w.levels));
  assert.equal(back.levelAt(4, 4), 2);
  assert.equal(back.grassAt(4, 4), 'fen');
  assert.equal(back.contestedAt(4, 4), 'thicket');
  assert.equal(back.levelOf(back.objectAt(4, 4)), 2, 'the oak did not come back up its terrace');
});

test('a v1 save — written before elevation existed — opens as a flat garden', () => {
  const w = new World({ seed: 23 });
  w.place('oak', 5, 5);
  w.paint('gravel-walk', 2, 2);
  const old = w.serialize();
  old.version = 1;
  delete old.levels;
  delete old.maxLevel;
  delete old.grass;
  delete old.grassAlt;
  delete old.grassTypes;

  const back = World.deserialize(old);
  assert.ok(back, 'a v1 save was refused — a garden must never be lost');
  assert.equal(back.levelAt(5, 5), 0);
  assert.equal(back.grassAt(5, 5), 'meadow');
  assert.ok(back.objectAt(5, 5), 'the oak did not survive the migration');
  assert.deepEqual(back.loadWarnings, [], 'a flat old garden is not a damaged one');
});

test('a damaged or foreign levels array is repaired tile by tile, never refused', () => {
  const w = new World({ seed: 24 });
  w.raise(1, 1, 4, 4);
  const save = w.serialize();
  save.levels[0] = 999;
  save.levels[1] = -4;
  save.levels[2] = 'three';
  save.levels[3] = null;
  save.levels.length = 10; // truncated mid-write
  const back = World.deserialize(save);
  assert.ok(back);
  for (let i = 0; i < back.levels.length; i++) {
    assert.ok(back.levels[i] >= MIN_LEVEL && back.levels[i] <= MAX_LEVEL);
  }
  assert.equal(back.levels[0], MAX_LEVEL, '999 should clamp to the ceiling, not wrap');
  assert.equal(back.levels[1], MIN_LEVEL);
  assert.ok(back.objects.length >= 0);
  assert.ok(back.loadWarnings.length > 0, 'a truncated save should say so');
});

test('a terraced garden is still small enough to autosave continuously', () => {
  const w = new World({ seed: 25 });
  for (let i = 0; i < 60; i++) w.raise(i % 18, (i * 5) % 18, (i % 18) + 2, ((i * 5) % 18) + 2);
  for (let i = 0; i < 40; i++) w.place('oak', (i * 3) % 20, (i * 7) % 20);
  const bytes = JSON.stringify(w.serialize()).length;
  assert.ok(bytes < 64 * 1024, `${bytes} bytes is too much to autosave every four seconds`);
});

test('stats report the relief without ever reporting a score', () => {
  const w = new World({ seed: 26 });
  w.raise(2, 2, 4, 4);
  const s = w.stats();
  assert.equal(s.relief, 1);
  assert.equal(s.levels.length, MAX_LEVEL + 1);
  assert.equal(s.levels[1], 9);
  assert.equal(s.contested, 0);
  assert.ok(!('score' in s) && !('rating' in s), 'SPEC §0: no score anywhere, ever');
  assert.ok(byId('oak'));
});
