// test/iso.test.mjs — the projection and the depth sort.
//
// SPEC §10: "projection round-trips for every tile, depth-sort correctness
// including multi-tile footprints".
//
// The half-tile in here is the single most expensive bug the project had: a
// second, "tiny duplicate" inverse in js/input.js shifted the pointer by
// TILE_W/2 before flooring, on the premise that `(tx-ty)*32` is the tile
// bounding box's LEFT edge. It is the diamond's NORTH VERTEX. Every click
// placed one tile to the left of the cursor, and nothing caught it because the
// ghost preview used the same wrong inverse and so agreed with itself.
//
// So this file tests BOTH implementations against SPEC §2's formula, and
// against each other. A duplicate projection is only safe if a test pins it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_W, TILE_H, MAP_W, MAP_H,
  toScreen, toTile, tileCentre, footprintCentre, tileAt, pointInDiamond,
  depthOf, depthOfTile, compareDepth, sortForDraw, validateFootprint, LEVELS,
  footprintTiles, footprintsOverlap, inBounds, clampCamera, cameraBounds,
} from '../js/iso.js';

import {
  tileToScreen as inputToScreen,
  tileFromScreen as inputFromScreen,
  tileCentre as inputCentre,
  tileAtScreen,
} from '../js/input.js';

const CAMERAS = [
  { x: 0, y: 0 },
  { x: 137, y: -42 },
  { x: -288, y: 163 },
  { x: 0.5, y: 0.5 },
  { x: -1e6, y: 1e6 },
  { x: 1e6, y: -1e6 },
];

test('SPEC §2 forward projection, literally', () => {
  for (const cam of CAMERAS) {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const p = toScreen(tx, ty, cam);
        assert.equal(p.x, (tx - ty) * (TILE_W / 2) - cam.x);
        assert.equal(p.y, (tx + ty) * (TILE_H / 2) - cam.y);
      }
    }
  }
});

test('every tile centre round-trips to its own tile', () => {
  for (const cam of CAMERAS) {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const c = tileCentre(tx, ty, cam);
        const back = toTile(c.x, c.y, cam);
        assert.equal(back.tx, tx, `tile ${tx},${ty} centre at cam ${cam.x},${cam.y}`);
        assert.equal(back.ty, ty);
        // The fractional part must be the middle of the tile, not merely
        // inside it — that is what makes a mover's position exact.
        assert.ok(Math.abs(back.fx - (tx + 0.5)) < 1e-9);
        assert.ok(Math.abs(back.fy - (ty + 0.5)) < 1e-9);
      }
    }
  }
});

test('a tile centre stays in its own tile when nudged inside the diamond', () => {
  // ±15px horizontally and ±7px vertically is comfortably inside a 64x32
  // diamond at its centre; this is the tolerance a click actually needs.
  const cam = { x: -288, y: 163 };
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const c = tileCentre(tx, ty, cam);
      for (const [dx, dy] of [[0, 0], [15, 0], [-15, 0], [0, 7], [0, -7], [8, 3], [-8, -3]]) {
        const back = toTile(c.x + dx, c.y + dy, cam);
        assert.equal(`${back.tx},${back.ty}`, `${tx},${ty}`, `offset ${dx},${dy} of tile ${tx},${ty}`);
      }
    }
  }
});

test('the diamonds partition the plane exactly — no gap, no overlap', () => {
  // Brute force every pixel of the map's screen bbox and count how many belong
  // to each tile. Each 64x32 diamond is exactly half its bounding box: 1024 px.
  // This is the property that makes floor(inverse) a correct hit test.
  const cam = { x: 0, y: 0 };
  const counts = new Map();
  const x0 = -MAP_H * (TILE_W / 2) - 4;
  const x1 = MAP_W * (TILE_W / 2) + 4;
  const y1 = (MAP_W + MAP_H) * (TILE_H / 2) + 4;
  let inside = 0;
  for (let y = -4; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const t = toTile(x + 0.5, y + 0.5, cam);
      if (!inBounds(t.tx, t.ty, MAP_W, MAP_H)) continue;
      inside++;
      const k = `${t.tx},${t.ty}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  assert.equal(counts.size, MAP_W * MAP_H, 'every tile owns at least one pixel');
  for (const [k, n] of counts) assert.equal(n, 1024, `tile ${k} owns ${n} px, expected 1024`);
  assert.equal(inside, MAP_W * MAP_H * 1024);
});

test('pointInDiamond agrees with toTile everywhere in the bounding box', () => {
  // (u, v) are measured from the tile's NORTH VERTEX, so the bounding box runs
  // u in [-32, 32), v in [0, 32). The closed predicate includes shared edges;
  // toTile owns each pixel exactly once. They must agree on every interior
  // pixel, which is the only claim that matters.
  const cam = { x: 0, y: 0 };
  const north = toScreen(7, 9, cam);
  let checked = 0;
  for (let v = 0; v < TILE_H; v++) {
    for (let u = -TILE_W / 2; u < TILE_W / 2; u++) {
      const px = north.x + u + 0.5;
      const py = north.y + v + 0.5;
      const t = toTile(px, py, cam);
      const mine = t.tx === 7 && t.ty === 9;
      if (mine) {
        assert.ok(pointInDiamond(u + 0.5, v + 0.5), `toTile claims ${u},${v} but pointInDiamond does not`);
        checked++;
      }
    }
  }
  assert.equal(checked, 1024);
});

test('tileAt refuses points off the map', () => {
  const cam = { x: 0, y: 0 };
  assert.equal(tileAt(-1000, -1000, cam, MAP_W, MAP_H), null);
  const c = tileCentre(3, 4, cam);
  const hit = tileAt(c.x, c.y, cam, MAP_W, MAP_H);
  assert.deepEqual([hit.tx, hit.ty], [3, 4]);
});

// ---------------------------------------------------------------------------
// input.js's duplicate projection must agree with iso.js
// ---------------------------------------------------------------------------

test('input.js agrees with iso.js on the forward projection', () => {
  for (const cam of CAMERAS) {
    const c2 = { ox: cam.x, oy: cam.y };
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const a = toScreen(tx, ty, cam);
        const b = inputToScreen(tx, ty, c2);
        assert.equal(b.x, a.x, `north vertex x of ${tx},${ty}`);
        assert.equal(b.y, a.y, `north vertex y of ${tx},${ty}`);
        const ca = tileCentre(tx, ty, cam);
        const cb = inputCentre(tx, ty, c2);
        assert.equal(cb.x, ca.x, `centre x of ${tx},${ty}`);
        assert.equal(cb.y, ca.y, `centre y of ${tx},${ty}`);
      }
    }
  }
});

test('input.js agrees with iso.js on the INVERSE — the half-tile regression', () => {
  for (const cam of CAMERAS) {
    const c2 = { ox: cam.x, oy: cam.y };
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const c = tileCentre(tx, ty, cam);
        const a = toTile(c.x, c.y, cam);
        const b = tileAtScreen(c.x, c.y, c2);
        assert.equal(b.tx, a.tx, `input picked ${b.tx},${b.ty} where iso picked ${a.tx},${a.ty}`);
        assert.equal(b.ty, a.ty);
        assert.equal(b.tx, tx);
        assert.equal(b.ty, ty);
        const f = inputFromScreen(c.x, c.y, c2);
        assert.ok(Math.abs(f.tx - (tx + 0.5)) < 1e-9);
        assert.ok(Math.abs(f.ty - (ty + 0.5)) < 1e-9);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Footprints and the depth sort
// ---------------------------------------------------------------------------

test('non-rectangular footprints are rejected (SPEC §2)', () => {
  assert.deepEqual(validateFootprint([2, 2]), [2, 2]);
  // null means "unspecified" and defaults to 1x1 — an object need not declare.
  assert.deepEqual(validateFootprint(null), [1, 1]);
  for (const bad of [[0, 1], [1, 0], [-1, 2], [2], [1, 1, 1], 'big', [1.5, 2], [2, 2, 2]]) {
    assert.throws(() => validateFootprint(bad), undefined, `should reject ${JSON.stringify(bad)}`);
  }
});

test('footprintTiles and overlap', () => {
  const tiles = footprintTiles({ tx: 3, ty: 4, footprint: [2, 3] });
  assert.equal(tiles.length, 6);
  assert.ok(tiles.some(([x, y]) => x === 3 && y === 4));
  assert.ok(tiles.some(([x, y]) => x === 4 && y === 6));
  const at = (tx, ty, footprint) => ({ tx, ty, footprint });
  assert.equal(footprintsOverlap(at(0, 0, [2, 2]), at(1, 1, [2, 2])), true);
  assert.equal(footprintsOverlap(at(0, 0, [2, 2]), at(2, 0, [2, 2])), false);
});

test('depth of a multi-tile footprint is its far corner', () => {
  // ELEVATION.md: the key is now (tx+ty) * LEVELS + level, so a bare tx+ty is
  // scaled by LEVELS. The ORDERING is unchanged on flat ground — this is a
  // monotone rescale that reserves one whole row of key space per diagonal for
  // the height term. Elevation ordering is pinned in test/elevation.test.mjs.
  assert.equal(depthOfTile(3, 4), 7 * LEVELS);
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [1, 1] }), 7 * LEVELS);
  // A 2x2 at (3,4) occupies up to (4,5): the largest tx+ty is 9.
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [2, 2] }), 9 * LEVELS);
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [3, 1] }), 9 * LEVELS);
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [1, 3] }), 9 * LEVELS);
});

test('a big object draws behind anything standing in front of its far corner', () => {
  // The real failure this guards: a 2x2 grotto at (5,5) reaches (6,6). A tree
  // at (6,7) is in FRONT of it and must draw over it; a tree at (5,4) is
  // behind and must draw under. Using the origin corner for depth gets the
  // first of those backwards.
  const grotto = { id: 'grotto', tx: 5, ty: 5, footprint: [2, 2] };
  const front = { id: 'front', tx: 6, ty: 7, footprint: [1, 1] };
  const behind = { id: 'behind', tx: 5, ty: 4, footprint: [1, 1] };
  const order = sortForDraw([front, grotto, behind]).map((o) => o.id);
  assert.deepEqual(order, ['behind', 'grotto', 'front']);
});

test('the sort is stable, and the tiebreak chain is depth -> tx -> insertion', () => {
  const items = [
    { id: 'a', tx: 2, ty: 4, footprint: [1, 1] }, // depth 6, tx 2
    { id: 'b', tx: 4, ty: 2, footprint: [1, 1] }, // depth 6, tx 4
    { id: 'c', tx: 2, ty: 4, footprint: [1, 1] }, // depth 6, tx 2, later
    { id: 'd', tx: 0, ty: 0, footprint: [1, 1] }, // depth 0
  ];
  assert.deepEqual(sortForDraw(items).map((o) => o.id), ['d', 'a', 'c', 'b']);
});

test('a mover crossing a tile boundary never pops', () => {
  // Fractional positions go into the SAME key, so the ordering against a fixed
  // object changes exactly once, at the boundary, and monotonically.
  const tree = { id: 'tree', tx: 5, ty: 5, footprint: [1, 1] };
  let flips = 0;
  let prev = null;
  for (let s = 0; s <= 400; s++) {
    const t = s / 100; // walk from ty=4 to ty=8 along x=5
    const mover = { id: 'mover', tx: 5, ty: 4 + t, footprint: [1, 1] };
    const order = sortForDraw([tree, mover]).map((o) => o.id).join(',');
    if (prev !== null && order !== prev) flips++;
    prev = order;
  }
  assert.equal(flips, 1, 'the mover should pass the tree exactly once');
});

test('compareDepth is a total order consistent with sortForDraw', () => {
  const rnd = mulberry(1234);
  const items = [];
  for (let i = 0; i < 200; i++) {
    items.push({
      id: i,
      tx: Math.floor(rnd() * 20),
      ty: Math.floor(rnd() * 20),
      footprint: [1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 3)],
      _i: i,
    });
  }
  const sorted = sortForDraw(items);
  const indexOf = new Map(items.map((o, i) => [o, i]));
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    assert.ok(
      compareDepth(a, indexOf.get(a), b, indexOf.get(b)) <= 0,
      `pair ${i} is out of order`
    );
  }
});

test('the camera clamp keeps the map on screen from every corner', () => {
  const b = cameraBounds(MAP_W, MAP_H, 640, 400);
  for (const start of [
    { x: -1e6, y: -1e6 }, { x: 1e6, y: 1e6 }, { x: -1e6, y: 1e6 }, { x: 1e6, y: -1e6 },
  ]) {
    const c = clampCamera(start, MAP_W, MAP_H, 640, 400);
    assert.ok(c.x >= b.minX - 1e-9 && c.x <= b.maxX + 1e-9, `x ${c.x} outside [${b.minX}, ${b.maxX}]`);
    assert.ok(c.y >= b.minY - 1e-9 && c.y <= b.maxY + 1e-9, `y ${c.y} outside [${b.minY}, ${b.maxY}]`);
  }
});

test('footprintCentre of a 1x1 is exactly the tile centre', () => {
  const cam = { x: 11, y: -7 };
  for (let ty = 0; ty < 5; ty++) {
    for (let tx = 0; tx < 5; tx++) {
      const a = tileCentre(tx, ty, cam);
      const b = footprintCentre(tx, ty, 1, 1, cam);
      assert.deepEqual([b.x, b.y], [a.x, a.y]);
    }
  }
  // A 2x2 anchors on the middle of its own base, not its origin corner.
  const c = footprintCentre(4, 4, 2, 2, cam);
  const mid = tileCentre(4.5, 4.5, cam);
  assert.ok(Math.abs(c.x - mid.x) < 1e-9 && Math.abs(c.y - mid.y) < 1e-9);
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
