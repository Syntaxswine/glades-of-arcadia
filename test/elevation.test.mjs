// test/elevation.test.mjs — the elevation engine's arithmetic.
//
// docs/ELEVATION.md. Three claims are load-bearing and all three are proved
// here exhaustively rather than by sampling, because each of them is a bug
// class that looks *almost* right on screen and is therefore invisible:
//
//   1. PROJECTION ROUND-TRIP AT EVERY LEVEL. For all 400 tiles x 7 levels x
//      several cameras, project the tile's centre and pick it back. A rise term
//      that is applied on the way out and not on the way back gives a game
//      where clicks land one tile further back the higher the ground is — and
//      on flat ground it is perfect, so it ships.
//   2. FRONT-MOST WINS. Where columns overlap on screen, picking must return
//      the one the player can see, which is the one painted LAST. Tested on a
//      staircase, where every tile overlaps its neighbour by construction.
//   3. THE DEPTH KEY ORDERS BY ROW FIRST AND HEIGHT SECOND. A level term that
//      leaks into the next diagonal row makes objects on a plateau draw over
//      things standing in front of it.
//
// Plus the invariant that makes the whole change safe: ON A FLAT MAP THE NEW
// PICK AGREES WITH THE OLD INVERSE EVERYWHERE. Elevation is a strict extension.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TILE_W, TILE_H, HALF_W, HALF_H, MAP_W, MAP_H,
  LEVEL_H, MAX_LEVEL, LEVELS, MAX_RISE,
  clampLevel, riseOf, levelOf,
  toScreen, toScreenAt, tileCentreAt, footprintCentreAt,
  toTile, pickColumn, pickTileAt, columnFaceAt, exposedRise, frontNeighbour, levelReader,
  depthOf, depthOfTile, sortForDraw, compareDepth,
  worldBounds, mapScreenBounds, cameraBounds, clampCamera, visibleTileRange,
} from '../js/iso.js';

const CAMERAS = [
  { x: 0, y: 0 },
  { x: 137, y: -42 },
  { x: -288, y: 163 },
  { x: -640, y: -96 },
];

/** A deterministic, lumpy height map — terraces, pits and long cliffs. */
function heightMap(mapW = MAP_W, mapH = MAP_H, seed = 7) {
  const a = new Int8Array(mapW * mapH);
  let s = seed >>> 0;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let ty = 0; ty < mapH; ty++) {
    for (let tx = 0; tx < mapW; tx++) {
      // terraces down the diagonal, plus noise, plus a flat-bottomed pit
      let h = Math.floor(((tx + ty) / (mapW + mapH)) * (MAX_LEVEL + 1));
      if (rnd() < 0.25) h += 2;
      if (tx > 5 && tx < 10 && ty > 5 && ty < 10) h = 0;
      a[ty * mapW + tx] = Math.max(0, Math.min(MAX_LEVEL, h));
    }
  }
  return a;
}

// ---------------------------------------------------------------------------

test('LEVEL_H is the single source of the rise, and the constants agree', () => {
  assert.equal(LEVEL_H, 16);
  assert.equal(LEVEL_H, TILE_H / 2, 'half a tile height — ELEVATION.md');
  assert.equal(MAX_LEVEL, 6);
  assert.equal(LEVELS, MAX_LEVEL + 1);
  assert.equal(MAX_RISE, MAX_LEVEL * LEVEL_H);
  assert.equal(riseOf(4), 64, 'a four-level waterfall drops 64px');

  // The clamp is total: no level ever escapes 0..MAX_LEVEL, whatever it is.
  for (const bad of [-9, -1, 0, 3, 6, 7, 99, NaN, undefined, null, '3', 2.4]) {
    const c = clampLevel(bad);
    assert.ok(Number.isInteger(c) && c >= 0 && c <= MAX_LEVEL, `clampLevel(${bad}) = ${c}`);
  }
  assert.equal(levelOf({}), 0, 'no level means the ground floor');
  assert.equal(levelOf({ level: 4 }), 4);
});

test('the projection gains exactly one term and nothing else moves', () => {
  for (const cam of CAMERAS) {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const flat = toScreen(tx, ty, cam);
        for (let L = 0; L <= MAX_LEVEL; L++) {
          const up = toScreenAt(tx, ty, L, cam);
          assert.equal(up.x, flat.x, 'x must not move with height');
          assert.equal(up.y, flat.y - L * LEVEL_H, 'y falls by exactly level * LEVEL_H');
        }
      }
    }
  }
});

test('ROUND TRIP: every tile at every level picks back to itself', () => {
  // The centre of the top face, projected and picked. This is the whole
  // contract: pick(project(t)) === t, for all 400 tiles and all 7 levels.
  for (const cam of CAMERAS) {
    for (let L = 0; L <= MAX_LEVEL; L++) {
      const levels = () => L; // a uniform plateau at height L
      for (let ty = 0; ty < MAP_H; ty++) {
        for (let tx = 0; tx < MAP_W; tx++) {
          const c = tileCentreAt(tx, ty, L, cam);
          const got = pickColumn(c.x, c.y, cam, { levels });
          assert.ok(got, `nothing under the centre of (${tx},${ty}) at level ${L}`);
          assert.equal(got.tx, tx, `tx at level ${L}`);
          assert.equal(got.ty, ty, `ty at level ${L}`);
          assert.equal(got.level, L);
          assert.equal(got.face, 'top');
        }
      }
    }
  }
});

test('ROUND TRIP: every tile of a lumpy map, over its whole top face', () => {
  // Not just the centre — nine points spread across each diamond, on a map
  // where neighbours differ by up to six levels.
  const levels = heightMap();
  const at = levelReader(levels, MAP_W, MAP_H);
  const probes = [
    [0, 0], [0, -10], [0, 10], [-20, 0], [20, 0],
    [-12, -6], [12, -6], [-12, 6], [12, 6],
  ];
  for (const cam of CAMERAS) {
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const h = at(tx, ty);
        const c = tileCentreAt(tx, ty, h, cam);
        for (const [dx, dy] of probes) {
          const got = pickColumn(c.x + dx, c.y + dy, cam, { levels });
          assert.ok(got, `sky over (${tx},${ty})+${dx},${dy}`);
          // The point is inside this tile's diamond, so either this tile owns
          // it or a tile IN FRONT of it is standing over it. Never one behind.
          const ours = got.tx === tx && got.ty === ty;
          const infront = got.tx + got.ty > tx + ty;
          assert.ok(
            ours || infront,
            `(${tx},${ty})+${dx},${dy} picked (${got.tx},${got.ty}) which is BEHIND it`
          );
          if (ours) assert.equal(got.level, h);
        }
      }
    }
  }
});

test('on a flat map the elevation pick is exactly the old flat inverse', () => {
  // The safety net for every consumer that has not been told about levels yet.
  for (const cam of CAMERAS) {
    for (let sy = -40; sy < 700; sy += 7) {
      for (let sx = -700; sx < 700; sx += 11) {
        const flat = toTile(sx, sy, cam);
        const on = flat.tx >= 0 && flat.ty >= 0 && flat.tx < MAP_W && flat.ty < MAP_H;
        const got = pickColumn(sx, sy, cam, { levels: 0 });
        if (on) {
          assert.ok(got, `flat map, on-map point (${sx},${sy}) picked nothing`);
          assert.equal(got.tx, flat.tx);
          assert.equal(got.ty, flat.ty);
          assert.equal(got.level, 0);
          assert.equal(got.face, 'top');
        } else {
          assert.equal(got, null, `off-map point (${sx},${sy}) hit ${JSON.stringify(got)}`);
        }
      }
    }
  }
});

test('a one-level-per-row slope is EDGE ON and vanishes — the front tile wins', () => {
  // A geometric fact worth pinning, because it decides a design question.
  // LEVEL_H is exactly HALF_H, so a slope of one level per diagonal row rises
  // 16px per row and the projection drops 16px per row: the two cancel, every
  // tread lands precisely on the one behind it, and the whole staircase
  // collapses to a single row of pixels seen edge-on.
  //
  // This is why ELEVATION.md's connectors are OBJECTS rather than sloped
  // terrain — a terrain slope at this pitch would be literally invisible — and
  // it is the worst case for picking: seven tiles stacked on one diamond. The
  // front-most must win, every time.
  const mapW = 10;
  const mapH = 10;
  const levels = (tx, ty) => Math.min(MAX_LEVEL, tx + ty);
  const opts = { levels, mapW, mapH };
  const cam = { x: -320, y: 0 };

  for (let ty = 0; ty < mapH; ty++) {
    for (let tx = 0; tx < mapW; tx++) {
      const c = tileCentreAt(tx, ty, Math.min(MAX_LEVEL, tx + ty), cam);
      const got = pickColumn(c.x, c.y, cam, opts);
      assert.ok(got, `staircase (${tx},${ty}) picked nothing`);
      assert.ok(
        got.tx + got.ty >= tx + ty,
        `(${tx},${ty}) picked (${got.tx},${got.ty}), which is BEHIND it and therefore buried`
      );
      // And whatever it picked genuinely covers that pixel: re-derive the
      // tile-local coords and ask the predicate again.
      const north = toScreenAt(got.tx, got.ty, got.level, cam);
      const r = exposedRise(got.tx, got.ty, levelReader(levels, mapW, mapH));
      assert.equal(columnFaceAt(c.x - north.x, c.y - north.y, r.se, r.sw), got.face);
    }
  }
});

test('FRONT-MOST WINS: on a half-pitch staircase every tread is picked exactly', () => {
  // One level per TWO rows: the treads are visible, and each one is partly
  // overlapped by the step in front. A naive "try level 0 first" pick returns
  // the buried tile here every time; the front-to-back walk returns the tread.
  const mapW = 10;
  const mapH = 10;
  const levels = (tx, ty) => Math.min(MAX_LEVEL, (tx + ty) >> 1);
  const opts = { levels, mapW, mapH };
  const cam = { x: -320, y: -64 };

  for (let ty = 0; ty < mapH; ty++) {
    for (let tx = 0; tx < mapW; tx++) {
      const h = Math.min(MAX_LEVEL, (tx + ty) >> 1);
      const c = tileCentreAt(tx, ty, h, cam);
      // 6px above the tread's centre. Dead centre is not a fair probe: the
      // step in front has its apex EXACTLY there, and a vertex belongs to the
      // diamond it opens, so the honest answer at that one pixel is the step
      // in front. Six pixels up is unambiguously this tread.
      const got = pickColumn(c.x, c.y - 6, cam, opts);
      assert.ok(got, `staircase (${tx},${ty}) picked nothing`);
      assert.equal(`${got.tx},${got.ty}`, `${tx},${ty}`, `staircase tread (${tx},${ty})`);
      assert.equal(got.level, h);
      assert.equal(got.face, 'top');
    }
  }
});

test('a cliff face is pickable, and belongs to the tile standing proud', () => {
  const mapW = 6;
  const mapH = 6;
  // One plateau at level 4, everything else on the floor.
  const levels = (tx, ty) => (tx <= 2 && ty <= 2 ? 4 : 0);
  const opts = { levels, mapW, mapH };
  const cam = { x: -200, y: -40 };

  // (2,2) is the plateau's front corner: both of its front neighbours (3,2)
  // and (2,3) are on the floor, so both faces are exposed, 64px each.
  const r = exposedRise(2, 2, levelReader(levels, mapW, mapH));
  assert.equal(r.se, 64);
  assert.equal(r.sw, 64);

  const north = toScreenAt(2, 2, 4, cam); // the raised diamond's north vertex
  // 20px right of the south vertex is on the SE (shaded) face; 20px left is on
  // the SW (lit) face. Both sit 30px below the top edge at that u.
  const probe = (u, down) => pickColumn(north.x + u, north.y + TILE_H - Math.abs(u) / 2 + down, cam, opts);

  const se = probe(16, 30);
  assert.ok(se, 'the SE face picked nothing');
  assert.equal(`${se.tx},${se.ty}`, '2,2');
  assert.equal(se.face, 'se');
  assert.equal(se.level, 4);

  const sw = probe(-16, 30);
  assert.equal(`${sw.tx},${sw.ty}`, '2,2');
  assert.equal(sw.face, 'sw');

  // Just past the foot of the 64px face is the floor tile in front, not the
  // plateau: the face stops exactly where the neighbour's top begins.
  const below = probe(0, 70);
  assert.ok(below.tx + below.ty > 4, 'past the foot of the cliff is the ground in front');

  // And the two front neighbours are named correctly, which is the thing that
  // is easy to get backwards: +tx is DOWN-RIGHT, +ty is DOWN-LEFT.
  assert.deepEqual(frontNeighbour(2, 2, 'se'), { tx: 3, ty: 2 });
  assert.deepEqual(frontNeighbour(2, 2, 'sw'), { tx: 2, ty: 3 });
  const se3 = toScreen(3, 2, null);
  const sw3 = toScreen(2, 3, null);
  const own = toScreen(2, 2, null);
  assert.ok(se3.x > own.x && se3.y > own.y, 'the se neighbour is down-RIGHT');
  assert.ok(sw3.x < own.x && sw3.y > own.y, 'the sw neighbour is down-LEFT');
});

test('columnFaceAt is the diamond plus two skirts, and nothing else', () => {
  // Exhaustive over the tile-local box: every pixel is classified, and the top
  // classification is byte-identical to the flat inverse's ownership rule.
  let tops = 0;
  for (let v = 0; v < TILE_H; v++) {
    for (let u = -HALF_W; u < HALF_W; u++) {
      const uu = u + 0.5;
      const vv = v + 0.5;
      const face = columnFaceAt(uu, vv, 0, 0);
      const a = uu / HALF_W;
      const b = vv / HALF_H;
      const owned = Math.floor((a + b) / 2) === 0 && Math.floor((b - a) / 2) === 0;
      assert.equal(face === 'top', owned, `(${uu},${vv})`);
      if (owned) tops++;
    }
  }
  assert.equal(tops, (TILE_W * TILE_H) / 2, 'a tile owns exactly half its bounding box');

  // With no rise there are no faces below the diamond at all.
  assert.equal(columnFaceAt(0, 40, 0, 0), null);
  // With a rise, the skirt hangs off the correct side.
  assert.equal(columnFaceAt(10, 40, 32, 0), 'se');
  assert.equal(columnFaceAt(-10, 40, 0, 32), 'sw');
  assert.equal(columnFaceAt(-10, 40, 32, 0), null, 'a rise on the other side is not this face');
  // Outside the tile's width, never.
  assert.equal(columnFaceAt(40, 40, 96, 96), null);
});

test('pickTileAt always answers, and says whether it hit a surface', () => {
  const levels = () => 0;
  const cam = { x: -320, y: 0 };
  const centre = tileCentreAt(4, 4, 0, cam);
  const a = pickTileAt(centre.x, centre.y, cam, { levels });
  assert.equal(a.hit, true);
  assert.equal(`${a.tx},${a.ty}`, '4,4');
  assert.equal(a.inBounds, true);
  // Far off the map: no surface, but still a usable flat answer for the UI.
  const b = pickTileAt(-4000, -4000, { x: 0, y: 0 }, { levels });
  assert.equal(b.hit, false);
  assert.equal(b.inBounds, false);
  assert.ok(Number.isFinite(b.tx) && Number.isFinite(b.ty));
});

test('THE DEPTH KEY: row first, height second, and no bleed between rows', () => {
  assert.equal(depthOfTile(3, 4), 7 * LEVELS);
  assert.equal(depthOfTile(3, 4, 2), 7 * LEVELS + 2);
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [1, 1] }), 7 * LEVELS);
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [2, 2] }), 9 * LEVELS);
  assert.equal(depthOf({ tx: 3, ty: 4, footprint: [2, 2], level: 6 }), 9 * LEVELS + 6);

  // THE INVARIANT: the tallest possible object on row N still draws before the
  // shortest possible object on row N+1. If this fails, a statue on a plateau
  // punches through the hillside in front of it.
  for (let row = 0; row < 40; row++) {
    const highest = depthOfTile(row, 0, MAX_LEVEL);
    const nextLowest = depthOfTile(row + 1, 0, 0);
    assert.ok(highest < nextLowest, `row ${row} at MAX_LEVEL bleeds into row ${row + 1}`);
  }
});

test('an object on a plateau draws after its own column and before the row in front', () => {
  const terrace = { id: 'terrace-urn', tx: 5, ty: 5, level: 4, footprint: [1, 1] };
  const behind = { id: 'behind', tx: 5, ty: 4, level: 4, footprint: [1, 1] };
  const infront = { id: 'infront', tx: 6, ty: 5, level: 0, footprint: [1, 1] };
  const order = sortForDraw([infront, terrace, behind]).map((o) => o.id);
  assert.deepEqual(order, ['behind', 'terrace-urn', 'infront']);

  // Same tile, two heights: the higher one is painted later.
  const low = { id: 'low', tx: 2, ty: 2, level: 0, footprint: [1, 1] };
  const high = { id: 'high', tx: 2, ty: 2, level: 3, footprint: [1, 1] };
  assert.deepEqual(sortForDraw([high, low]).map((o) => o.id), ['low', 'high']);
});

test('a mover riding a slope still never pops', () => {
  // The mover walks down a terrace, gaining fractional tile position AND
  // changing level partway. The order against a fixed tree may change once,
  // and only once — a level term that dominated the row term would flip it
  // twice, which on screen is the creature blinking in front of the tree.
  const tree = { id: 'tree', tx: 5, ty: 5, level: 0, footprint: [1, 1] };
  let flips = 0;
  let prev = null;
  for (let s = 0; s <= 400; s++) {
    const t = s / 100;
    const mover = { id: 'mover', tx: 5, ty: 4 + t, level: t > 2 ? 0 : 1, footprint: [1, 1] };
    const order = sortForDraw([tree, mover]).map((o) => o.id).join(',');
    if (prev !== null && order !== prev) flips++;
    prev = order;
  }
  assert.equal(flips, 1, 'the mover should pass the tree exactly once');
});

test('compareDepth stays a total order with levels in play', () => {
  const items = [];
  let s = 99;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 300; i++) {
    items.push({
      id: i,
      tx: Math.floor(rnd() * 20),
      ty: Math.floor(rnd() * 20),
      level: Math.floor(rnd() * (MAX_LEVEL + 1)),
      footprint: [1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 3)],
    });
  }
  const sorted = sortForDraw(items);
  const indexOf = new Map(items.map((o, i) => [o, i]));
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(compareDepth(sorted[i - 1], indexOf.get(sorted[i - 1]), sorted[i], indexOf.get(sorted[i])) <= 0);
  }
});

test('the world cache gets headroom above, and the camera can reach it', () => {
  const flat = mapScreenBounds(MAP_W, MAP_H);
  const world = worldBounds(MAP_W, MAP_H);
  assert.equal(world.minY, flat.minY - MAX_RISE);
  assert.equal(world.height, flat.height + MAX_RISE);
  assert.equal(world.width, flat.width, 'height never widens the map');

  // A per-side margin lets the camera rise to show a back-row plateau without
  // also letting it fall off the bottom into empty sky.
  const b = cameraBounds(MAP_W, MAP_H, 640, 400, { top: MAX_RISE });
  const plain = cameraBounds(MAP_W, MAP_H, 640, 400, 0);
  assert.equal(b.minY, plain.minY - MAX_RISE);
  assert.equal(b.maxY, plain.maxY);
  assert.equal(b.minX, plain.minX);
  const c = clampCamera({ x: 0, y: -1e6 }, MAP_W, MAP_H, 640, 400, { top: MAX_RISE });
  assert.equal(c.y, plain.minY - MAX_RISE);
});

test('the visible range reaches far enough forward to catch raised columns', () => {
  const cam = { x: -320, y: 0 };
  const withRise = visibleTileRange(cam, 640, 400, MAP_W, MAP_H, 1);
  const without = visibleTileRange(cam, 640, 400, MAP_W, MAP_H, 1, 0);
  assert.ok(
    withRise.tx1 >= without.tx1 && withRise.ty1 >= without.ty1,
    'the elevation-aware range is never smaller'
  );
});

test('footprintCentreAt is footprintCentre lifted by the rise', () => {
  for (const cam of CAMERAS) {
    for (let L = 0; L <= MAX_LEVEL; L++) {
      const a = footprintCentreAt(4, 7, 2, 3, L, cam);
      const flat = toScreen(4 + 1, 7 + 1.5, cam);
      assert.equal(a.x, flat.x);
      assert.equal(a.y, flat.y - L * LEVEL_H);
    }
  }
  // HALF_W/HALF_H are still what the rest of the file thinks they are.
  assert.equal(HALF_W, 32);
  assert.equal(HALF_H, 16);
});
