// test/elevation-render.test.mjs — the RENDERER's half of elevation.
//
// js/render.js needs a canvas, so this drives it through the software canvas in
// tools/headless-canvas.mjs (Node built-ins only — SPEC §1 permits that in
// tools/ and test/). What that buys is the ability to assert things about the
// PIXELS, which is where every remaining elevation bug lives:
//
//   * NO HOLES — if picking says there is a surface under a pixel, the terrain
//     cache must have painted one. This is what catches a half-tile offset in
//     a top-face blit, which opens a diagonal seam of sky between the ground
//     tiles and reads convincingly as a lighting effect rather than as a bug.
//   * PALETTE PURITY — the cliff faces, the falls and the five grass types are
//     all newly generated art, and SPEC §3 says every colour on screen comes
//     from palette.js.
//   * THE SPREAD IS GRADUAL AND RADIATES — a zoning flip must not snap, and
//     the tile nearest the cause must go first (ZONING.md).
//   * OBJECTS RIDE THEIR TERRACE — an object that declares no level takes the
//     height of the tile under it, so raising ground carries it up for free.
//
// The full picture-making version of all this, which also writes PNGs to look
// at, is tools/elevation-probe.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { installCanvas, createCanvas } from '../tools/headless-canvas.mjs';

installCanvas();

const render = await import('../js/render.js');
const iso = await import('../js/iso.js');
const pal = await import('../js/palette.js');

const { MAX_LEVEL, LEVEL_H } = iso;
const W = 20;
const H = 20;

function makeScene(opts = {}) {
  const n = W * H;
  const levels = new Int8Array(n);
  const grass = new Uint8Array(n);
  const contest = new Int8Array(n).fill(-1);
  const wet = new Uint8Array(n);
  const at = (x, y) => y * W + x;
  if (opts.fill) opts.fill({ levels, grass, contest, wet, at });
  const sc = {
    mapW: W,
    mapH: H,
    terrainVersion: 1,
    levels,
    grass: (tx, ty) => render.GRASS_TYPES[grass[at(tx, ty)]],
    grassContest: (tx, ty) => {
      const c = contest[at(tx, ty)];
      return c < 0 ? null : render.GRASS_TYPES[c];
    },
    terrain: (tx, ty) => (wet[at(tx, ty)] ? { water: true } : null),
    objects: [],
    creatures: [],
  };
  sc._raw = { levels, grass, contest, wet, at };
  return sc;
}

function makeRenderer(sc, opts = {}) {
  const cv = createCanvas(640, 400);
  const r = render.createRenderer(cv, { reducedMotion: false, maxScale: 1, ...opts });
  r.setScene(sc);
  r.centreOnTile(opts.cx ?? 7, opts.cy ?? 7, true);
  r.frame(opts.t ?? 0);
  return { r, cv };
}

/** A lumpy garden: terraces, a pinnacle, an upper pool and a lower one. */
const LUMPY = {
  fill: ({ levels, grass, contest, wet, at }) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = at(x, y);
        let h = 0;
        if (x + y < 10) h = 4;
        else if (x + y < 13) h = 2;
        if (x > 13 && y > 13) h = 1;
        if (x >= 2 && x <= 4 && y >= 2 && y <= 4) h = MAX_LEVEL;
        levels[i] = h;
        if (x >= 3 && x <= 6 && y >= 3 && y <= 6 && h === 4) wet[i] = 1;
        if (x + y >= 13 && x + y <= 18 && x >= 4 && x <= 10) wet[i] = 1;
        grass[i] = h >= 4 ? 1 : h === 0 ? 3 : h === 1 ? 4 : 2;
        if (h === 2 && (x + y) & 1) contest[i] = 1;
      }
    }
  },
};

// ---------------------------------------------------------------------------

test('NO HOLES: wherever picking finds a surface, terrain was painted', () => {
  const { r } = makeRenderer(makeScene(LUMPY));
  const b = r._world;
  const cache = r._terrainCv;
  let holes = 0;
  let surfaces = 0;
  // Pixel CENTRES: the tile mask classifies a pixel by its centre, and probing
  // corners disagrees with it along every diamond edge for reasons that have
  // nothing to do with elevation.
  for (let sy = 0; sy < 400; sy += 2) {
    for (let sx = 0; sx < 640; sx += 2) {
      if (!r.pickScreen(sx + 0.5, sy + 0.5).hit) continue;
      surfaces++;
      const cx = Math.round(sx + 0.5 + r._cam.x - b.minX);
      const cy = Math.round(sy + 0.5 + r._cam.y - b.minY);
      if (cx < 0 || cy < 0 || cx >= cache.width || cy >= cache.height) continue;
      if (cache._data[(cy * cache.width + cx) * 4 + 3] < 255) holes++;
    }
  }
  assert.ok(surfaces > 20000, `expected a landscape, got ${surfaces} surface pixels`);
  assert.equal(holes, 0, `${holes} pixels where a surface was picked but nothing was painted`);
});

test('the drawn frame agrees with the pick, over the whole viewport', () => {
  const { r } = makeRenderer(makeScene(LUMPY));
  const reader = iso.levelReader((tx, ty) => r.levelAt(tx, ty), W, H);
  let bad = 0;
  let faces = 0;
  for (let sy = 0; sy < 400; sy += 2) {
    for (let sx = 0; sx < 640; sx += 2) {
      const p = r.pickScreen(sx + 0.5, sy + 0.5);
      if (!p.hit) continue;
      if (p.face !== 'top') faces++;
      const n = iso.toScreenAt(p.tx, p.ty, p.level, r._cam);
      const rise = iso.exposedRise(p.tx, p.ty, reader);
      const f = iso.columnFaceAt(sx + 0.5 - n.x, sy + 0.5 - n.y, rise.se, rise.sw);
      if (f !== p.face || r.levelAt(p.tx, p.ty) !== p.level) bad++;
    }
  }
  assert.ok(faces > 500, `expected cliff faces to be clickable, got ${faces} pixels`);
  assert.equal(bad, 0);
});

test('PALETTE PURITY: every pixel of the generated terrain is a palette colour', () => {
  const allowed = new Set(pal.PALETTE.keys().map((k) => pal.PALETTE.get(k).toLowerCase()));
  const { r, cv } = makeRenderer(makeScene(LUMPY));
  r.requestDraw();
  r.frame(500);
  const d = cv._data;
  const strays = new Set();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const hex =
      '#' +
      d[i].toString(16).padStart(2, '0') +
      d[i + 1].toString(16).padStart(2, '0') +
      d[i + 2].toString(16).padStart(2, '0');
    if (!allowed.has(hex)) strays.add(hex);
  }
  assert.deepEqual([...strays], [], 'colours on screen that are not in palette.js');
});

test('the five grass types are actually distinguishable from each other', () => {
  // ZONING.md: "the five must be legible at a glance". Legibility is not
  // testable, but INDISTINGUISHABILITY is: a pair whose mean colour differs by
  // almost nothing cannot be legible however it is drawn, and the first
  // millefleurs failed exactly this way against meadow.
  const mean = (t) => {
    const cv = render.groundTile(0, 0, t, null, null);
    const d = cv._data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
      n++;
    }
    return [r / n, g / n, b / n];
  };
  const means = render.GRASS_TYPES.map((_, i) => mean(i));
  for (let a = 0; a < means.length; a++) {
    for (let b = a + 1; b < means.length; b++) {
      const d = Math.hypot(means[a][0] - means[b][0], means[a][1] - means[b][1], means[a][2] - means[b][2]);
      assert.ok(
        d > 9,
        `${render.GRASS_TYPES[a]} and ${render.GRASS_TYPES[b]} differ by only ${d.toFixed(1)} — indistinguishable`
      );
    }
  }
});

test('contested ground is a 50% checkerboard of BOTH competing types', () => {
  // Not a blend, not a third colour: alternate pixels, which is what makes it
  // read as deliberately unresolved (ZONING.md) instead of as a new grass.
  const a = render.groundTile(0, 0, 1, null, null);
  const b = render.groundTile(0, 0, 3, null, null);
  const mix = render.groundTile(0, 0, 1, 3, null);
  let fromA = 0;
  let fromB = 0;
  let neither = 0;
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      if (!mix._data[i + 3]) continue;
      const same = (src) =>
        src._data[i] === mix._data[i] && src._data[i + 1] === mix._data[i + 1] && src._data[i + 2] === mix._data[i + 2];
      const wantA = ((x + y) & 1) === 0;
      if (same(a) && wantA) fromA++;
      else if (same(b) && !wantA) fromB++;
      else neither++;
    }
  }
  assert.equal(neither, 0, 'every contested pixel comes from one of the two types, on the checker phase');
  assert.ok(fromA > 400 && fromB > 400, `expected a 50/50 split, got ${fromA}/${fromB}`);
});

test('THE SPREAD IS GRADUAL, and radiates from the cause', () => {
  const sc = makeScene({ fill: ({ grass }) => grass.fill(0) });
  const { r } = makeRenderer(sc, { cx: 9.5, cy: 9.5 });

  // Everything is meadow, and the renderer shows it.
  assert.equal(r._grassAt(2, 2), 0);
  assert.equal(r._grassAt(12, 12), 0);

  // The whole map flips to thicket, caused at (2,2).
  sc._raw.grass.fill(1);
  sc.grassCause = { tx: 2, ty: 2 };
  sc.terrainVersion = 2;
  r.invalidateTerrain();
  r.frame(1000);

  // NOTHING has snapped: at the moment of the edit the ground is unchanged.
  assert.equal(r._grassAt(2, 2), 0, 'the flip must not be instant');
  assert.ok(r._spread.size > 300, 'the whole map should be queued');

  // The tile AT the cause is due before a tile far from it.
  const near = r._spread.get(2 * 20 + 2);
  const far = r._spread.get(19 * 20 + 19);
  assert.ok(near < far, `the cause (${near}) must flip before the far corner (${far})`);

  // Let time pass a little: the near tile has gone, the far one has not.
  // And check the PIXELS, not just the bookkeeping — the partial repaint has
  // to touch the flipped tile and leave the rest of the cache alone, which is
  // the whole reason `_stampRegion` clips instead of clearing tile boxes.
  const cache = r._terrainCv;
  const before = Uint8ClampedArray.from(cache._data);
  r.frame(1000 + 200);
  assert.equal(r._grassAt(2, 2), 1, 'the cause should have flipped by now');
  assert.equal(r._grassAt(19, 19), 0, 'the far corner should still be waiting');

  const px = (tx, ty) => {
    const b = r._world;
    const n = iso.toScreenAt(tx, ty, r.levelAt(tx, ty), null);
    return Math.round(n.y + 16 - b.minY) * cache.width + Math.round(n.x - b.minX);
  };
  let nearChanged = 0;
  let farChanged = 0;
  for (let d = -8; d <= 8; d++) {
    const a = (px(2, 2) + d) * 4;
    const f = (px(19, 19) + d) * 4;
    if (before[a] !== cache._data[a] || before[a + 1] !== cache._data[a + 1]) nearChanged++;
    if (before[f] !== cache._data[f] || before[f + 1] !== cache._data[f + 1]) farChanged++;
  }
  assert.ok(nearChanged > 0, 'the flipped tile must actually be repainted');
  assert.equal(farChanged, 0, 'a partial repaint must not disturb the far corner');

  // Let it all run out.
  r.frame(1000 + 60000);
  assert.equal(r._spread.size, 0);
  assert.equal(r._grassAt(19, 19), 1);
});

test('reduced motion snaps the grass instead of spreading it, and still repaints', () => {
  // SPEC §0: prefers-reduced-motion stops idle animation. The trap here is
  // repainting: with motion off and no height change there is no structural
  // reason to rebuild the cache, and the flip silently never appears.
  const sc = makeScene({ fill: ({ grass }) => grass.fill(0) });
  const { r, cv } = makeRenderer(sc, { reducedMotion: true, cx: 9.5, cy: 9.5 });
  const before = Buffer.from(cv._data.buffer.slice(0));

  sc._raw.grass.fill(3); // fen — a long way from meadow in colour
  sc.terrainVersion = 2;
  r.invalidateTerrain();
  r.frame(1000);

  assert.equal(r._spread.size, 0, 'nothing should be queued');
  assert.equal(r._grassAt(9, 9), 3, 'the grass should have snapped');
  assert.notDeepEqual(Buffer.from(cv._data.buffer.slice(0)), before, 'the frame must actually change');
});

test('OBJECTS RIDE THEIR TERRACE — height is read from the tile beneath', () => {
  const sc = makeScene({
    fill: ({ levels, at }) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) levels[at(x, y)] = x < 10 ? 0 : 3;
    },
  });
  const art = { w: 8, h: 8, anchor: [4, 7], data: new Uint8ClampedArray(8 * 8 * 4).fill(255) };
  const low = { tx: 5, ty: 5, art, footprint: [1, 1] };
  const high = { tx: 15, ty: 5, art, footprint: [1, 1] };
  const pinned = { tx: 15, ty: 6, art, footprint: [1, 1], level: 0 };
  sc.objects = [low, high, pinned];
  const { r } = makeRenderer(sc, { cx: 9.5, cy: 5.5 });

  const list = r._drawList;
  const byX = new Map(list.map((e) => [e.src, e]));
  assert.equal(byX.get(low).level, 0, 'an object on the low ground stays low');
  assert.equal(byX.get(high).level, 3, 'an object on the terrace rides up with it');
  assert.equal(byX.get(pinned).level, 0, 'an explicit level is respected verbatim');

  // And the lift is real in screen space, not just in the sort key.
  const a = iso.footprintCentreAt(15, 5, 1, 1, 3, r._cam);
  const flat = iso.footprintCentreAt(15, 5, 1, 1, 0, r._cam);
  assert.equal(flat.y - a.y, 3 * LEVEL_H);
});

test('a waterfall appears where water stands above a drop, and stops when it does not', () => {
  // ELEVATION.md: "a rendering consequence of adjacency, not a fluid model".
  // There is no waterfall state anywhere; lower the tile in front and it
  // starts, raise it back and it stops.
  const sc = makeScene({
    fill: ({ levels, wet, at }) => {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          levels[at(x, y)] = x + y < 12 ? 4 : 0;
          if (x + y < 12 && x >= 3 && x <= 7 && y >= 3 && y <= 7) wet[at(x, y)] = 1;
        }
      }
    },
  });
  const { r } = makeRenderer(sc, { cx: 7, cy: 7 });

  // Some tile of the pool sits on the lip, and its front neighbour is 4 down.
  let falls = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!r._wet[y * W + x]) continue;
      if (r.levelAt(x + 1, y) < r.levelAt(x, y) || r.levelAt(x, y + 1) < r.levelAt(x, y)) falls++;
    }
  }
  assert.ok(falls > 0, 'a pool on a lip must fall');

  // Foam lands on the tile below, which is therefore an animated tile.
  assert.ok(r._anim.length > 0);
  const landsOn = r._anim.filter((i) => !r._wet[i]);
  assert.ok(landsOn.length > 0, 'the foam at the foot of the fall is animated too');

  // Flatten the world: no drop, no fall, and no animated tile that is not water.
  for (let i = 0; i < W * H; i++) sc._raw.levels[i] = 4;
  sc.terrainVersion = 2;
  r.invalidateTerrain();
  r.frame(1000);
  assert.equal(r._anim.filter((i) => !r._wet[i]).length, 0, 'nothing falls onto a flat world');
});

test('the terrain cache has headroom, and a back-row plateau is not sliced off', () => {
  const sc = makeScene({
    fill: ({ levels, at }) => {
      levels[at(0, 0)] = MAX_LEVEL;
    },
  });
  const { r } = makeRenderer(sc, { cx: 0, cy: 0 });
  const b = r._world;
  assert.equal(b.minY, -iso.MAX_RISE);
  assert.equal(r._terrainCv.height, b.height);

  // The very top of tile (0,0)'s raised diamond is inside the cache.
  const n = iso.toScreenAt(0, 0, MAX_LEVEL, null);
  const cy = Math.round(n.y - b.minY);
  assert.ok(cy >= 0 && cy < r._terrainCv.height, `the plateau top is at cache row ${cy}`);
  // ...and something is actually painted there.
  const cx = Math.round(n.x - b.minX);
  const i = ((cy + 8) * r._terrainCv.width + cx) * 4;
  assert.equal(r._terrainCv._data[i + 3], 255, 'the raised tile is painted, not clipped away');
});

test('a scene with nothing in it still draws a glade', () => {
  // The renderer must be useful before the other seven owners land, and
  // `{}` is the shape it gets while they are mid-edit.
  const cv = createCanvas(640, 400);
  const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
  r.setScene({});
  r.frame(0);
  let painted = 0;
  for (let i = 3; i < cv._data.length; i += 4) if (cv._data[i]) painted++;
  assert.ok(painted > 200000, 'an empty scene should still be a meadow');
});

// ---------------------------------------------------------------------------
// THE BACK RIM (render.js §THE BACK RIM)
// ---------------------------------------------------------------------------
//
// The owner, looking at a terraced hillside: *"we need a line on the back edge
// of the grassy hill tops, otherwise they are invisible."*
//
// He is right, and the reason is projection rather than art: the face on the
// far side of a plateau points away from the camera, so nothing is drawn, and
// grass on a terrace meets grass on the floor with no mark between them. These
// tests hold the remedy to being VISIBLE and to being CORRECT — a line that is
// only correct is one nobody can see, which is the state this fixes.

/** A single 3x3 plateau standing two levels above an otherwise flat map. */
const PLATEAU = {
  fill: ({ levels, grass, at }) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = at(x, y);
        levels[i] = x >= 8 && x <= 10 && y >= 8 && y <= 10 ? 2 : 0;
        grass[i] = 0; // ONE grass type everywhere: the rim is the only mark
      }
    }
  },
};

/** Cache-space pixel, as `#rrggbb`. */
function cachePixel(r, x, y) {
  const cv = r._terrainCv;
  const o = (Math.round(y) * cv.width + Math.round(x)) * 4;
  const d = cv._data;
  const hex = (v) => v.toString(16).padStart(2, '0');
  return `#${hex(d[o])}${hex(d[o + 1])}${hex(d[o + 2])}`.toUpperCase();
}

test('THE BACK RIM EXISTS: a plateau has a brow where its drop is hidden', () => {
  const { r } = makeRenderer(makeScene(PLATEAU), { cx: 9, cy: 9 });
  const b = r._world;
  const rim = (pal.PALETTE.get(pal.contactShadow('o')) || '').toUpperCase();
  assert.ok(rim, 'no rim colour in the palette');

  // The north vertex of the plateau's back corner tile, raised two levels.
  const n = iso.toScreenAt(8, 8, 2, null);
  const nx = n.x - b.minX;
  const ny = n.y - b.minY;

  // Walk both back edges down the 2:1 stair from that vertex. Every row of the
  // top half of the diamond carries exactly one rim pixel per side.
  let nw = 0;
  let ne = 0;
  for (let ly = 0; ly < iso.HALF_H; ly++) {
    if (cachePixel(r, nx - 1 - 2 * ly, ny + ly) === rim) nw++;
    if (cachePixel(r, nx + 2 * ly, ny + ly) === rim) ne++;
  }
  assert.ok(nw >= 12, `only ${nw} of 16 rows carry the north-west rim`);
  assert.ok(ne >= 12, `only ${ne} of 16 rows carry the north-east rim`);
});

test('THE BACK RIM IS VISIBLE: it does not match the grass it separates', () => {
  // The whole complaint. A rim drawn in the ground's own colour would pass the
  // test above and change nothing on screen — this is the one that refuses it.
  const rim = pal.PALETTE.get(pal.contactShadow('o'));
  const tops = ['#3B4A22', '#55672D', '#74863C', '#96A551'];
  assert.ok(!tops.slice(1).includes(rim), `the rim is ${rim}, a grass body colour`);
  // Darker than the mid-tone it borders, by a real margin, in every channel.
  const v = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = v(rim);
  const g = v('#74863C');
  assert.ok(
    a.every((c, i) => g[i] - c > 16),
    `the rim ${rim} is not meaningfully darker than the grass beside it`
  );
});

test('FLAT GROUND GETS NO RIM: the mark means a drop, or it means nothing', () => {
  // A line drawn on every tile edge is a grid, not a landscape — and it would
  // be the easy wrong version of this feature.
  const { r } = makeRenderer(makeScene({ fill: ({ grass, at }) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) grass[at(x, y)] = 0;
  } }));
  const b = r._world;
  const rim = (pal.PALETTE.get(pal.contactShadow('o')) || '').toUpperCase();
  const n = iso.toScreenAt(9, 9, 0, null);
  let found = 0;
  for (let ly = 0; ly < iso.HALF_H; ly++) {
    if (cachePixel(r, n.x - b.minX - 1 - 2 * ly, n.y - b.minY + ly) === rim) found++;
  }
  // Grass speckle is authored in the dark ramp step, so a stray pixel or two is
  // the texture, not a rim. A rim is the whole edge.
  assert.ok(found <= 4, `flat ground drew ${found} of 16 rim pixels — that is a grid`);
});

test('THE RIM IS INSIDE ITS OWN TILE: it can never bleed onto the neighbour', () => {
  // Taken from `tileMask()` for exactly this reason. The stamp is half a tile
  // wide and half a tile tall, and every lit pixel in it must be inside the
  // diamond — otherwise a rim draws over the tile behind, which in this
  // painter's order is a tile that was already finished.
  const m = render.tileMask();
  for (const side of iso.BACK_SIDES) {
    const stamp = render._backRimStamp(side);
    for (let ly = 0; ly < iso.HALF_H; ly++) {
      for (let lx = 0; lx < iso.HALF_W; lx++) {
        if (!stamp._data[(ly * iso.HALF_W + lx) * 4 + 3]) continue;
        const tx = side === 'nw' ? lx : lx + iso.HALF_W;
        assert.equal(m[ly * iso.TILE_W + tx], 1, `${side} rim pixel (${lx},${ly}) is off the diamond`);
      }
    }
  }
});

test('THE RIM IS CONTINUOUS: a 2:1 line is two pixels per row, not one', () => {
  // THE TEST THAT WAS MISSING, and the reason it is here.
  //
  // The first version of the rim walked the sixteen ROWS and marked the
  // outermost pixel of each. Every assertion above passed — the rim existed,
  // it was the right colour, it stayed inside its diamond — and on screen it
  // was a DOTTED line, because a 2:1 edge moves two pixels across per row and
  // those marks touched only at their corners. It read as a UI overlay laid on
  // the grass rather than as an edge of the ground, which is worse than the
  // problem it was fixing.
  //
  // Nothing caught it but looking at the picture. This is that look, written
  // down: count the pixels, not the rows.
  // Both stamps laid side by side, which is how they are drawn: 'nw' over the
  // tile's left half, 'ne' over its right. Continuity is a property of the
  // WHOLE brow, not of either half — the two meet at the north vertex.
  const row = new Array(iso.TILE_W).fill(-1);
  for (const side of iso.BACK_SIDES) {
    const stamp = render._backRimStamp(side);
    const from = side === 'nw' ? 0 : iso.HALF_W;
    for (let ly = 0; ly < iso.HALF_H; ly++) {
      for (let lx = 0; lx < iso.HALF_W; lx++) {
        if (!stamp._data[(ly * iso.HALF_W + lx) * 4 + 3]) continue;
        assert.equal(row[from + lx], -1, `column ${from + lx} carries two rim pixels`);
        row[from + lx] = ly;
      }
    }
  }

  // One pixel per column, over the full span the brow covers. The end columns
  // are the tile's west and east vertices, which belong to the rows BELOW the
  // top half and so are not part of it — that is the diamond, not a gap.
  const cols = row.map((v, i) => [i, v]).filter(([, v]) => v >= 0);
  assert.equal(cols.length, iso.TILE_W - 2, `the brow covers ${cols.length} columns of 62`);

  // AND UNBROKEN: neighbouring columns are on the same row or one apart. This
  // is the assertion the dotted version failed — it stepped two rows at a time
  // with nothing in between.
  for (let k = 1; k < cols.length; k++) {
    const [x0, y0] = cols[k - 1];
    const [x1, y1] = cols[k];
    assert.equal(x1, x0 + 1, `a gap in the brow between columns ${x0} and ${x1}`);
    assert.ok(Math.abs(y1 - y0) <= 1, `the brow jumps ${Math.abs(y1 - y0)} rows at column ${x1}`);
  }
});

test('A MOVER TAKES ITS HEIGHT FROM THE TILE IT IS OVER, not the one behind', () => {
  // A mover is drawn at (tx + 0.5, ty + 0.5) — `footprintCentreAt` adds half a
  // tile for a 1x1 — so the tile under a creature at x = 5.8 is tile 6, not
  // tile 5. `_liftDrawList` floored it, and therefore read the level of the
  // tile BEHIND the creature for the whole second half of every tile.
  //
  // Invisible on flat ground, which is why it survived. On a terrace edge it is
  // a whole level, applied for half of every crossing.
  const r = makeRenderer(makeScene({ fill: ({ levels, at }) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) levels[at(x, y)] = x >= 6 ? 1 : 0;
  } })).r;
  const lift = (tx) => r._liftDrawList([], [{ tx, ty: 8, footprint: [1, 1] }])[0].level;

  // The step is between tile 5 (level 0) and tile 6 (level 1). A creature is
  // over tile 6 from x = 5.5 upward, so that is where its height must change.
  assert.equal(lift(5.2), 0, 'over tile 5, which is the low side');
  assert.equal(lift(5.8), 1, 'over tile 6 and still standing a level too low');
  assert.equal(lift(6.4), 1, 'over tile 6');

  // ...and the change happens ONCE, at the half-tile, not at the integer.
  const flips = [];
  for (let x = 4.9; x < 7.0; x += 0.1) {
    const a = lift(+x.toFixed(2));
    const b = lift(+(x + 0.1).toFixed(2));
    if (a !== b) flips.push(+(x + 0.05).toFixed(2));
  }
  assert.equal(flips.length, 1, `height changed ${flips.length} times crossing one step: ${flips}`);
  assert.ok(flips[0] > 5.4 && flips[0] < 5.7, `the change is at x=${flips[0]}, not at the half-tile`);
});
