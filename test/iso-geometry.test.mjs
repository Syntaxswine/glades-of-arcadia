// iso-geometry.test.mjs — the world's coordinate system, and the instrument
// that measures art against it.
//
// This guards `tools/isogeom.mjs`, which is shared by the headless census
// (`tools/iso-audit.mjs`) and the sprite lab's overlay. THE SHARING IS THE
// POINT: a lab that drew a guide the audit did not measure against would let
// an artist align to the wrong line in perfectly good faith, and nothing would
// ever report it. So the geometry is asserted here once, and both consumers
// import the same functions.
//
// ---------------------------------------------------------------------------
// WHY THE HEXAGON
//
// In a 2:1 projection there are exactly three visible planes — the ground
// diamond and the two vertical walls — so exactly three straight-line families
// a sprite may use: rising 1-in-2, falling 1-in-2, and vertical. A long
// horizontal run is none of them; it is a front elevation pasted into a world
// that has no front. And the silhouette of a unit cube is a HEXAGON, which is
// the envelope art should be drawn inside.
//
// The exception is real: ROTATIONAL forms (column, urn, boulder, trunk) look
// the same from every side and are correctly symmetric on screen. The last
// test in this file is the column, standing as a permanent negative control
// against the day someone decides symmetry itself is the fault. It is not —
// the first draft of the audit believed that and ranked COLUMN the fourth-worst
// sprite in the game.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_W, TILE_H, CUBE_H, WANT, RUN_MIN, GROUND_ELLIPSE, curveAllowance,
  project, groundDiamond, boxHull, nearEdgeProfile,
  baseProfile, baseLift, flatRuns, groundRuns, measure, measurable,
} from '../tools/isogeom.mjs';
import { TILE_W as GAME_TILE_W, TILE_H as GAME_TILE_H, toScreen } from '../js/iso.js';
import { defineSprite } from '../js/art/format.js';

// ---------------------------------------------------------------------------
// The tool and the game must agree about the shape of the world.
// ---------------------------------------------------------------------------

test('isogeom and js/iso.js describe the same projection', () => {
  assert.equal(TILE_W, GAME_TILE_W);
  assert.equal(TILE_H, GAME_TILE_H);
  // `project` is `toScreen` with the camera at the origin. Checked over a
  // spread of offsets, including fractional and negative ones, because the
  // overlay works entirely in half-tiles.
  for (const [dtx, dty] of [[0, 0], [1, 0], [0, 1], [-0.5, -0.5], [2.5, -1.5], [3, 3]]) {
    const a = project(dtx, dty);
    const b = toScreen(dtx, dty, null);
    assert.deepEqual({ x: a.x, y: a.y }, { x: b.x, y: b.y }, `at ${dtx},${dty}`);
  }
});

test('a unit cube is 32px of vertical edge, not 16', () => {
  // LEVEL_H is 16 because TERRAIN rises half a tile per level. An OBJECT is
  // not terrain: a one-tile cube is 32px tall on screen, and drawing the guide
  // at 16 would teach every artist to draw everything squashed.
  assert.equal(CUBE_H, TILE_W / 2);
  assert.deepEqual(project(0, 0, 1), { x: 0, y: -32 });
});

// ---------------------------------------------------------------------------
// The ground diamond — the shape a base has to meet.
// ---------------------------------------------------------------------------

test('the 1x1 ground diamond is the tile, centred on the anchor', () => {
  assert.deepEqual(groundDiamond(1, 1), [
    { x: 0, y: -16 }, // N, the back corner
    { x: 32, y: 0 }, // E
    { x: 0, y: 16 }, // S, nearest the viewer
    { x: -32, y: 0 }, // W
  ]);
});

test('a 2x1 footprint is a diamond twice as long down the x axis', () => {
  const [n, e, s, w] = groundDiamond(2, 1);
  assert.deepEqual(n, { x: -16, y: -24 });
  assert.deepEqual(e, { x: 48, y: 8 });
  assert.deepEqual(s, { x: 16, y: 24 });
  assert.deepEqual(w, { x: -48, y: -8 });
  // (fw+fh)*32 wide and (fw+fh)*16 tall — the same numbers the anchor audit
  // derives its front-vertex drop from, arrived at independently.
  assert.equal(e.x - w.x, (2 + 1) * 32);
  assert.equal(s.y - n.y, (2 + 1) * 16);
});

test('the front vertex sits (fw+fh)*8 below the anchor', () => {
  // The claim `test/sprite-anchors.test.mjs` is built on, checked against the
  // projection rather than restated. If one of them is ever wrong, it should
  // not be possible for both to be wrong in the same direction.
  for (const [fw, fh] of [[1, 1], [2, 1], [2, 2], [3, 1], [3, 2]]) {
    const s = groundDiamond(fw, fh)[2];
    assert.equal(s.y, (fw + fh) * 8, `${fw}x${fh}`);
  }
});

// ---------------------------------------------------------------------------
// The hexagon.
// ---------------------------------------------------------------------------

test('the silhouette of a unit cube is a hexagon, 64 by 64', () => {
  const hull = boxHull(1, 1, 1);
  assert.equal(hull.length, 6, 'a cube in 2:1 iso has a six-sided outline');
  const xs = hull.map((p) => p.x);
  const ys = hull.map((p) => p.y);
  assert.equal(Math.max(...xs) - Math.min(...xs), 64);
  assert.equal(Math.max(...ys) - Math.min(...ys), 64);
  // The two vertical edges, at the E and W corners, are the only pairs sharing
  // an x — that is what makes it a hexagon rather than an octagon.
  assert.deepEqual(hull, [
    { x: 0, y: -48 }, // N' top back
    { x: 32, y: -32 }, // E'
    { x: 32, y: 0 }, // E   — vertical edge
    { x: 0, y: 16 }, // S   ground front
    { x: -32, y: 0 }, // W
    { x: -32, y: -32 }, // W' — vertical edge
  ]);
});

test('a box of zero height degenerates to its own ground diamond', () => {
  assert.deepEqual(boxHull(1, 1, 0), groundDiamond(1, 1));
  assert.deepEqual(boxHull(2, 3, 0), groundDiamond(2, 3));
});

test('every edge of the hexagon is a legal isometric line', () => {
  // The whole thesis, asserted: walking the hull, each edge is vertical, or
  // rises/falls exactly 1 in 2. NONE of them is horizontal.
  const hull = boxHull(2, 2, 1.5);
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0) continue; // vertical: legal
    assert.equal(Math.abs(dy / dx), 0.5, `edge ${i} runs ${dx},${dy} — not a 2:1 line`);
  }
});

test('the near-edge profile covers the whole width of the diamond', () => {
  const prof = nearEdgeProfile(1, 1);
  assert.equal(prof.get(-32), 0, 'the W corner');
  assert.equal(prof.get(0), 16, 'the S corner, the lowest point');
  assert.equal(prof.get(32), 0, 'the E corner');
  for (let x = -32; x <= 32; x++) assert.ok(prof.has(x), `no sample at x=${x}`);
});

// ---------------------------------------------------------------------------
// The measure. Both controls, because an instrument that only ever sees
// passing input is not an instrument.
// ---------------------------------------------------------------------------

/** A filled 2:1 diamond, w wide — a correctly-footed base. */
function diamondSprite(w = 32) {
  const h = w / 2;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const k = y < h / 2 ? y : h - 1 - y;
    const half = (k + 1) * 2;
    const x0 = w / 2 - half;
    const x1 = w / 2 + half - 1;
    let row = '';
    for (let x = 0; x < w; x++) row += x >= x0 && x <= x1 ? 'v' : '.';
    rows.push(row);
  }
  return defineSprite({ name: 'control-diamond', rows, anchor: [w / 2, h - 1] });
}

/** A rectangle: a slab drawn in the plane of the screen. */
function slabSprite(w = 32, h = 20) {
  return defineSprite({ name: 'control-slab', rows: new Array(h).fill('v'.repeat(w)), anchor: [w / 2, h - 1] });
}

test('a diamond foot passes, and lifts by about a quarter of its width', () => {
  const q = measure(diamondSprite(32));
  assert.equal(q.ok, true, `a correct base was convicted: ${q.flat}px level`);
  assert.equal(q.flat, 0);
  // `lift` is reported, not voted. Checked here only so the number stays
  // meaningful to a human reading an audit row.
  assert.ok(q.lift >= WANT, `a correct base measured lift ${q.lift}`);
  assert.ok(q.lift > 0.18 && q.lift < 0.3, `expected about 0.25, got ${q.lift}`);
});

test('a slab is convicted, and the run is located', () => {
  const s = slabSprite(32, 20);
  const q = measure(s);
  assert.equal(q.ok, false);
  assert.equal(q.flat, 32);
  // Not just "this is wrong" but "these columns are wrong" — the difference
  // between a report an artist can act on and one they cannot.
  assert.deepEqual(q.runs, [{ x0: 0, x1: 31, y: 19, len: 32 }]);
  assert.deepEqual(flatRuns(s), q.runs);
});

test('a level edge shorter than RUN_MIN is not an edge', () => {
  // A curve bottoming out holds its y for a few columns and that is not a
  // fault. The instrument has to be able to say "no" or its yes means nothing.
  const shelf = defineSprite({
    name: 'control-short-shelf',
    rows: ['.'.repeat(20), ...new Array(6).fill('....vvvvvvvvvv......')],
    anchor: [10, 6],
  });
  assert.equal(groundRuns(shelf).longest, 0, `10px is under the ${RUN_MIN}px floor`);
  const wide = defineSprite({
    name: 'control-wide-shelf',
    rows: ['.'.repeat(20), ...new Array(6).fill('...vvvvvvvvvvvvvv...')],
    anchor: [10, 6],
  });
  assert.equal(groundRuns(wide).longest, 14, 'a 14px level edge is an edge');
});

test('a level run high in the silhouette is not a ground fault', () => {
  // The second wrong version of this measure counted level runs anywhere in
  // the bottom contour, which convicts the underside of a tree canopy. Leaves
  // hang in the air and may hang however they like; only the BASE is judged.
  const rows = [];
  for (let y = 0; y < 30; y++) {
    // A wide flat-bottomed canopy for 10 rows, then a narrow trunk with a
    // proper little 2:1 foot.
    if (y < 10) rows.push('vvvvvvvvvvvvvvvvvvvvvvvvvvvvvv');
    else if (y < 27) rows.push('.............vvvv.............');
    else if (y === 27) rows.push('...........vvvvvvvv...........');
    else if (y === 28) rows.push('............vvvvvv............');
    else rows.push('.............vvvv.............');
  }
  const tree = defineSprite({ name: 'control-canopy', rows, anchor: [15, 28] });
  const q = measure(tree);
  assert.equal(q.flat, 0, 'the canopy underside was counted as a base');
  // ...while the flat-runs-anywhere reading still sees it, which is exactly
  // why that reading is reported and not voted.
  assert.ok(flatRuns(tree).length > 0);
});

test('a ground-plane circle is exactly twice as wide as it is tall', () => {
  assert.equal(GROUND_ELLIPSE, 0.5);
  // The same statement, from the projection: a circle of radius r on the
  // ground touches (r, 0) and (0, r) in TILE space, which land r*32 apart
  // across and r*16 apart down.
  const across = project(1, -1);
  const down = project(1, 1);
  assert.equal(down.y / across.x, GROUND_ELLIPSE);
});

test('a diamond foot has no flat run at all', () => {
  assert.deepEqual(flatRuns(diamondSprite(32)), []);
});

test('the bottom contour has one entry per occupied column', () => {
  const s = diamondSprite(32);
  const prof = baseProfile(s);
  assert.equal(prof.length, 32);
  assert.deepEqual(prof[16], { x: 16, y: 15 }, 'the centre column reaches the front vertex');
  // Monotonic down to the middle and back up: the signature of a foot in the
  // ground plane, and precisely what a horizontal edge does not do.
  for (let i = 1; i <= 16; i++) assert.ok(prof[i].y >= prof[i - 1].y, `column ${i} rose`);
});

test('a sprite too small to have geometry is not judged', () => {
  const pebble = defineSprite({ name: 'pebble', rows: ['.vv.', 'vvvv', '.vv.'], anchor: [2, 2] });
  assert.equal(measurable(pebble), false);
  // ...and asking anyway does not throw or divide by zero.
  assert.equal(Number.isFinite(baseLift(pebble).lift), true);
});

// ---------------------------------------------------------------------------
// The census, and the exception that broke the first version of the tool.
// ---------------------------------------------------------------------------

const MODULES = ['../js/art/props.js', '../js/art/decor.js', '../js/art/tiles.js'];
const sprites = [];
for (const path of MODULES) {
  let mod;
  try {
    mod = await import(new URL(path, import.meta.url).href);
  } catch {
    continue;
  }
  for (const [name, s] of Object.entries(mod)) {
    if (s && Array.isArray(s.rows) && typeof s.w === 'number') sprites.push({ name, s });
  }
}

test('the census is looking at something', () => {
  const measured = sprites.filter((r) => measurable(r.s));
  assert.ok(
    measured.length >= 90,
    `only ${measured.length} sprites measurable — a module stopped exporting?`
  );
});

test('ROTATIONAL forms are not convicted of being symmetric', () => {
  // COLUMN is a cylinder. It is *supposed* to be a perfect mirror about the
  // vertical and *supposed* to have a wide flat waist; the first draft of this
  // instrument scored those two things and ranked it fourth-worst in the game.
  // Only `lift` votes now, and this test is what stops that regressing.
  const col = sprites.find((r) => r.name === 'COLUMN');
  if (!col) return; // renamed art is not this test's business to fail on
  const q = measure(col.s);
  assert.ok(q.mirror > 0.8, 'COLUMN stopped being symmetric — check the sprite, not the tool');
  assert.equal(q.ok, true, `COLUMN measured lift ${q.lift}: a cylinder foot must pass`);
});

// ---------------------------------------------------------------------------
// The allowance, checked against the shape itself rather than against algebra.
//
// The first derivation of `curveAllowance` was WRONG — it solved for the row
// where the curve holds within half a pixel of its lowest point, when the
// binding case is the widest row that SURVIVES once the true bottom row rounds
// away. It under-predicted every wide case, and three correctly-shadowed
// sprites failed by two or three pixels looking exactly like art faults.
//
// So this test does not restate the formula. It DRAWS the ellipse, the same
// way js/art/*.js `skirt` draws it, measures the flat span of its own bottom
// contour, and requires the allowance to cover it. An algebra error cannot
// survive that, because the algebra is not consulted.
// ---------------------------------------------------------------------------

/** The widest level run in the bottom contour of an ideal 2:1 ground ellipse. */
function ellipseFlat(r, halfPixel) {
  const ry = r / 2;
  const cx = 40 + (halfPixel ? 0.5 : 0);
  const cy = 60;
  const low = new Map();
  for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
    for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) {
      const nx = (x - cx) / r;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) low.set(x, Math.max(low.get(x) ?? -1, y));
    }
  }
  const xs = [...low.keys()].sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < xs.length; i++) {
    run = low.get(xs[i]) === low.get(xs[i - 1]) && xs[i] === xs[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

test('the allowance covers what a correct ground ellipse actually does', () => {
  const short = [];
  for (let r = 6; r <= 48; r++) {
    for (const halfPixel of [false, true]) {
      const flat = ellipseFlat(r, halfPixel);
      const allowed = curveAllowance(r);
      if (flat > allowed) short.push(`r=${r}${halfPixel ? '.5' : ''}: draws ${flat}, allows ${allowed}`);
    }
  }
  assert.deepEqual(
    short,
    [],
    'The allowance is under the flat span a correctly drawn shadow of that size ' +
      'produces, so correct art will be convicted. This is the exact error the ' +
      'first derivation made.'
  );
});

test('the allowance is not so generous that a slab walks through it', () => {
  // An upper bound is only useful if it is still a bound. A 64px level edge —
  // a tile's whole width — must be caught at every plausible contact size.
  for (let r = 6; r <= 48; r++) {
    assert.ok(curveAllowance(r) < 64, `r=${r} allows ${curveAllowance(r)}, which lets a full tile edge pass`);
  }
  // ...and the run length that matters most: half a tile.
  assert.ok(curveAllowance(16) < 32, 'a 32px edge on a 32px-wide contact must still be a fault');
});
