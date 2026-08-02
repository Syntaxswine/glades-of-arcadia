// ghost.test.mjs — the placement preview, and the two paths it takes.
//
// The owner: *"there are items, like the paths, that are two tiles by two
// tiles, but the preview cursor only shows the upper most tile of the 4
// highlighted."*
//
// ---------------------------------------------------------------------------
// A PRODUCER AND A CONSUMER THAT NEVER AGREED ON A KEY NAME.
//
// `js/input.js` states a ghost's size as `w`/`h`. `js/render.js` reads it
// through `footprintOf`, which — like every other object in the game — wants
// `footprint: [w, h]`. `js/ui.js` DID convert, in the one call it makes to the
// renderer directly... and `js/main.js`'s draw loop then handed `ui.ghost`
// straight to `renderer.setGhost` on every frame, raw, overwriting it.
//
// The per-frame path always wins, so `footprintOf` saw no footprint, returned
// [1, 1], and the plate loop drew exactly one tile: (tx, ty), which is the
// north corner of the block and the top of the diamond on screen. The other
// three were never drawn, and the conversion that existed was dead code.
//
// Two tests, because there are two things to hold: the renderer's contract
// (measured in pixels, so it cannot be satisfied by a shape that merely looks
// right) and ui.js emitting the shape that satisfies it.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installCanvas, createCanvas } from '../tools/headless-canvas.mjs';

installCanvas();

const render = await import('../js/render.js');
const { ghostShape } = await import('../js/ui.js');

const MAP = 12;
const scene = () => ({
  mapW: MAP,
  mapH: MAP,
  terrainVersion: 1,
  levels: new Int8Array(MAP * MAP),
  grass: () => render.GRASS_TYPES[0],
  grassContest: () => null,
  terrain: () => null,
  objects: [],
  creatures: [],
});

/** How many pixels the ghost changes. One plate is a 64x32 diamond. */
function ghostInk(ghost) {
  const cv = createCanvas(640, 400);
  const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
  r.setScene(scene());
  r.centreOnTile(6, 6, true);
  r.setGhost(null);
  r.frame(0);
  const before = cv._data.slice();
  r.setGhost(ghost);
  r.frame(0);
  let n = 0;
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] !== cv._data[i] || before[i + 1] !== cv._data[i + 1] || before[i + 2] !== cv._data[i + 2]) n++;
  }
  return n;
}

test('a 2x2 ghost highlights four tiles, not one', () => {
  const one = ghostInk({ tx: 5, ty: 5, footprint: [1, 1], legal: true });
  assert.ok(one > 200, `a 1x1 plate should be a visible diamond, got ${one}px`);

  const four = ghostInk({ tx: 5, ty: 5, footprint: [2, 2], legal: true });
  // Measured in PIXELS on purpose. A ghost that carried the right numbers in
  // the wrong key would pass any structural assertion and still draw one tile,
  // which is exactly the bug — so the test has to look at the frame.
  const ratio = four / one;
  assert.ok(
    ratio > 3.5 && ratio < 4.5,
    `a 2x2 should cover about four 1x1 plates; covered ${ratio.toFixed(2)}x (${four}px vs ${one}px)`
  );

  const wide = ghostInk({ tx: 5, ty: 5, footprint: [2, 1], legal: true });
  assert.ok(wide / one > 1.5 && wide / one < 2.5, `a 2x1 covered ${(wide / one).toFixed(2)}x`);
});

test('a ghost stated as w/h alone draws one tile — which is why ui.js converts', () => {
  // The negative control, and the reason the fix belongs in ui.js rather than
  // as a fallback in render.js: `footprintOf` is the game's ONE definition of
  // how big a thing is, and teaching it a second vocabulary would mean every
  // future consumer has to know both.
  const one = ghostInk({ tx: 5, ty: 5, footprint: [1, 1], legal: true });
  const raw = ghostInk({ tx: 5, ty: 5, w: 2, h: 2, legal: true });
  assert.equal(raw, one, 'w/h alone should still mean one plate to the renderer');
});

test('ui.js emits a footprint, so BOTH paths to the renderer agree', () => {
  // js/main.js does `renderer.setGhost(ui.ghost)` every frame with whatever
  // ui.js is HOLDING. So what it holds has to be renderer-shaped, not just
  // what it hands over in its own call. `ghostShape` is that statement, and it
  // is a named export precisely so this can be asserted without a DOM.
  const g = ghostShape({ mode: 'place', id: 'greensward', tx: 4, ty: 4, w: 2, h: 2, legal: true });
  assert.ok(g, 'ghostShape dropped a real ghost');
  assert.deepEqual([...g.footprint], [2, 2], 'no footprint for the renderer to read');
  // ...and the old vocabulary survives, because `drawGhost` (preview mode, no
  // renderer attached) reads it and input.js's words are not ui.js's to change.
  assert.equal(g.w, 2);
  assert.equal(g.h, 2);

  // A 1x1 says so rather than saying nothing — `footprintOf` defaults to
  // [1, 1] anyway, but a ghost that omits the key relies on that default and
  // the whole bug was a default standing in for a fact.
  assert.deepEqual([...ghostShape({ tx: 4, ty: 4 }).footprint], [1, 1]);

  // Nothing in, nothing out. `setGhost(null)` is how the tool bar clears it.
  assert.equal(ghostShape(null), null);
  assert.equal(ghostShape({ id: 'herm' }), null, 'a ghost with no tile is not a ghost');

  // Junk sizes fall back rather than producing a zero-plate preview or a loop
  // that never ends.
  assert.deepEqual([...ghostShape({ tx: 1, ty: 1, w: 0, h: -3 }).footprint], [1, 1]);
});
