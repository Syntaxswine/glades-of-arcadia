// test/minimap.test.mjs — the minimap's projection, which is the only part of
// it that can be wrong in a way nobody sees.
//
// The DRAWING needs eyes and got them (docs/shots/mm-on.png). The PROJECTION is
// arithmetic, and arithmetic that is one tile out looks completely plausible:
// the diamond fills, the colours are right, and every click lands somewhere
// near where you aimed. This holds it exactly.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MINIMAP, tileToMini, miniToTile } from '../js/minimap.js';
import { MAP_W, MAP_H } from '../js/iso.js';

test('every tile lands on exactly one pixel, and no two tiles share it', () => {
  const seen = new Map();
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const p = tileToMini(tx, ty);
      assert.ok(p.x >= 0 && p.x < MINIMAP.W, `tile ${tx},${ty} -> x ${p.x} off panel`);
      assert.ok(p.y >= 0 && p.y < MINIMAP.H, `tile ${tx},${ty} -> y ${p.y} off panel`);
      const k = `${p.x},${p.y}`;
      assert.equal(seen.has(k), false, `${tx},${ty} collides with ${seen.get(k)} at ${k}`);
      seen.set(k, `${tx},${ty}`);
    }
  }
  assert.equal(seen.size, MAP_W * MAP_H, 'tiles went missing');
});

test('THE DIAMOND IS SOLID — no gaps inside it', () => {
  // The halved row (`(tx + ty) >> 1`) looks lossy. It is not: the two diagonals
  // that round onto a row interleave by parity. If that ever stops being true
  // the minimap fills with holes, which reads as a rendering fault rather than
  // as a projection bug, so it is worth a test that says which it is.
  const filled = new Set();
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const p = tileToMini(tx, ty);
      filled.add(`${p.x},${p.y}`);
    }
  }
  // Walk each row's own span. Row 0 is the only short one — one diagonal
  // instead of two — so it is allowed to be, and only, half full.
  for (let y = 1; y < MINIMAP.H - 1; y++) {
    const xs = [];
    for (let x = 0; x < MINIMAP.W; x++) if (filled.has(`${x},${y}`)) xs.push(x);
    if (!xs.length) continue;
    const lo = xs[0];
    const hi = xs[xs.length - 1];
    assert.equal(xs.length, hi - lo + 1, `row ${y} has a hole between ${lo} and ${hi}`);
  }
});

test('a click on a tile returns that tile — exactly, for all 3600', () => {
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const p = tileToMini(tx, ty);
      const back = miniToTile(p.x, p.y);
      assert.deepEqual(back, { tx, ty }, `${tx},${ty} came back as ${back.tx},${back.ty}`);
    }
  }
});

test('the panel is the size the geometry says it is', () => {
  assert.equal(MINIMAP.W, MAP_W + MAP_H - 1);
  assert.equal(MINIMAP.H, ((MAP_W + MAP_H - 2) >> 1) + 1);
  // It has to fit in the view with room to spare, or it stops being a corner
  // panel and starts being a second screen. The view is 640 x 286.
  assert.ok(MINIMAP.W + MINIMAP.PAD * 2 < 640 * 0.35, 'the minimap is eating the screen');
  assert.ok(MINIMAP.H + MINIMAP.PAD * 2 < 286 * 0.35);
});

test('the projection is derived from the map size, not pinned to 60', () => {
  // Growing the map must move the minimap with it. A hard-coded 60 here would
  // survive every test above and quietly clip the new ground.
  const corner = tileToMini(MAP_W - 1, MAP_H - 1);
  assert.equal(corner.y, MINIMAP.H - 1, 'the south corner is not on the bottom row');
  assert.equal(tileToMini(0, 0).y, 0, 'the north corner is not on the top row');
  assert.equal(tileToMini(MAP_W - 1, 0).x, MINIMAP.W - 1, 'the east corner is not flush right');
  assert.equal(tileToMini(0, MAP_H - 1).x, 0, 'the west corner is not flush left');
});
