// test/input-terrain.test.mjs — the terrain TOOLS and elevation-aware picking
// (js/input.js). docs/ELEVATION.md, SPEC §0 and §8.
//
// input.js is the one module in the pure set that touches the DOM, so this file
// stands up a DOM stub thin enough to dispatch pointer and key events at it.
// That is worth doing rather than skipping, because the two things most likely
// to break here are invisible from any other test:
//
//   1. A DRAG IS ONE UNDO STEP. Applying per tile as the pointer crosses would
//      look identical on screen and fill the 64-step stack with one terrace.
//   2. PICKING IS ELEVATION-AWARE, AND STAYS THAT WAY. input.js asks js/iso.js
//      for the elevated picker by name. If that export is renamed, input.js
//      silently falls back to the flat inverse — which is PERFECT on flat
//      ground and one tile out on every terrace. Nothing else would catch it.

import test from 'node:test';
import assert from 'node:assert/strict';

// --- the DOM stub, installed before js/input.js is imported ----------------

const listeners = new Map();
function target(name) {
  return {
    addEventListener: (t, fn) => listeners.set(name + ':' + t, fn),
    removeEventListener: (t) => listeners.delete(name + ':' + t),
    fire(t, ev) {
      const fn = listeners.get(name + ':' + t);
      if (fn) fn({ preventDefault() {}, ...ev });
      return !!fn;
    },
  };
}
const canvas = {
  ...target('canvas'),
  width: 640,
  height: 400,
  focus() {},
  setPointerCapture() {},
  releasePointerCapture() {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 400 }),
};
const win = target('window');
globalThis.window = win;
globalThis.document = { getElementById: () => canvas, body: {}, documentElement: {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { World, MAX_LEVEL } = await import('../js/world.js');
const { createInput, pickingIsElevationAware, TERRAIN_TOOLS } = await import('../js/input.js');
const { tileCentreAt, LEVEL_H } = await import('../js/iso.js');

// --- a rig ----------------------------------------------------------------

function rig(opts = {}) {
  const world = new World({ seed: 42 });
  const said = [];
  const ghosts = [];
  const S = { tool: 'place', selection: null };
  const ui = {
    tool: () => S.tool,
    selection: () => S.selection,
    toggleTool: (t) => (S.tool = S.tool === t ? 'place' : t),
    setGhost: (g) => ghosts.push(g),
    say: (s) => said.push(s),
    announce: () => {},
    blocks: () => false,
    isModal: () => false,
    viewport: () => ({ x: 0, y: 0, w: 640, h: 400 }),
  };
  const input = createInput({
    canvas,
    world,
    ui,
    map: { w: world.w, h: world.h },
    selfDrive: false,
    ...opts,
  });
  const cam = input.cameraOf();

  /** Client px over the DRAWN centre of a tile's top face, height and all. */
  const at = (tx, ty, button = 0) => {
    const c = tileCentreAt(tx, ty, world.levelAt(tx, ty) || 0, { ox: cam.ox, oy: cam.oy });
    return { clientX: c.x, clientY: c.y, button, pointerId: 1 };
  };
  const drag = (a, b, button = 0) => {
    canvas.fire('pointerdown', { ...at(a[0], a[1], button) });
    canvas.fire('pointermove', { ...at(b[0], b[1], button) });
    win.fire('pointerup', { ...at(b[0], b[1], button) });
  };

  return { world, ui, S, said, ghosts, input, at, drag, cam };
}

// --- picking ---------------------------------------------------------------

test('picking is elevation-aware — iso.js is asked, and answers', () => {
  assert.equal(
    pickingIsElevationAware(null),
    true,
    'js/iso.js no longer exports a picker input.js recognises; picking has ' +
      'silently fallen back to the flat inverse and every terrace click is wrong'
  );
});

test('a click over a raised tile picks THAT tile, not the one behind it', () => {
  const r = rig();
  // A plateau, well inside the map so the answer is unambiguous.
  r.world.raise(6, 6, 10, 10);
  r.world.raise(6, 6, 10, 10);
  r.world.raise(6, 6, 10, 10);
  assert.equal(r.world.levelAt(8, 8), 3);

  r.S.tool = 'raze';
  const seen = [];
  canvas.fire('pointermove', r.at(8, 8));
  seen.push(r.input.hovered());
  assert.deepEqual(
    { tx: seen[0].tx, ty: seen[0].ty },
    { tx: 8, ty: 8 },
    'the pointer over a 3-level plateau picked the wrong tile — the rise term ' +
      'is being applied on the way out and not on the way back'
  );
  assert.equal(seen[0].level, 3);
  assert.ok(LEVEL_H > 0);
  r.input.destroy();
});

// --- the terrain tools -----------------------------------------------------

test('the three verbs are the ones ELEVATION.md names', () => {
  assert.deepEqual([...TERRAIN_TOOLS], ['raise', 'lower', 'level']);
});

test('a raise drag lands as ONE undoable edit over the whole region', () => {
  const r = rig();
  r.S.tool = 'raise';
  const depth = r.world.undoStack.length;
  r.drag([4, 4], [7, 7]);

  assert.equal(r.world.levelAt(5, 5), 1);
  assert.equal(r.world.levelAt(7, 7), 1);
  assert.equal(r.world.levelAt(8, 8), 0, 'the edit leaked outside the dragged region');
  assert.equal(
    r.world.undoStack.length,
    depth + 1,
    'a 16-tile drag was not one undo step — it will eat the 64-step stack'
  );

  r.world.undo();
  assert.equal(r.world.levelAt(5, 5), 0, 'one undo did not put the whole terrace back');
  r.input.destroy();
});

test('nothing is applied until the pointer comes up', () => {
  const r = rig();
  r.S.tool = 'raise';
  canvas.fire('pointerdown', r.at(4, 4));
  canvas.fire('pointermove', r.at(6, 6));
  assert.equal(r.world.levelAt(5, 5), 0, 'the drag built the terrace while still being drawn');
  win.fire('pointerup', r.at(6, 6));
  assert.equal(r.world.levelAt(5, 5), 1);
  r.input.destroy();
});

test('the ghost previews the whole region, with the anchor and the reason', () => {
  const r = rig();
  r.S.tool = 'level';
  r.ghosts.length = 0;
  canvas.fire('pointerdown', r.at(3, 3));
  canvas.fire('pointermove', r.at(5, 6));
  const g = r.ghosts[r.ghosts.length - 1];
  assert.equal(g.mode, 'terrain');
  assert.equal(g.op, 'level');
  assert.deepEqual({ tx: g.tx, ty: g.ty, w: g.w, h: g.h }, { tx: 3, ty: 3, w: 3, h: 4 });
  assert.deepEqual(g.anchor, { tx: 3, ty: 3 }, 'level must flatten toward the drag anchor');
  win.fire('pointerup', r.at(5, 6));
  r.input.destroy();
});

test('Esc abandons a terrain drag instead of quietly committing it', () => {
  const r = rig();
  r.S.tool = 'raise';
  canvas.fire('pointerdown', r.at(4, 4));
  canvas.fire('pointermove', r.at(6, 6));
  win.fire('keydown', { key: 'Escape' });
  win.fire('pointerup', r.at(6, 6));
  assert.equal(r.world.levelAt(5, 5), 0, 'Esc built a terrace on the way out');
  r.input.destroy();
});

test('right-dragging inverts raise and lower', () => {
  const r = rig();
  r.S.tool = 'raise';
  r.drag([4, 4], [5, 5]);
  r.drag([4, 4], [5, 5]);
  assert.equal(r.world.levelAt(4, 4), 2);
  r.drag([4, 4], [5, 5], 2);
  assert.equal(r.world.levelAt(4, 4), 1, 'a right-drag with the raise tool did not lower');
  r.input.destroy();
});

test('level flattens the region to the height of the tile the drag began on', () => {
  const r = rig();
  r.world.raise(0, 0, 6, 6);
  r.world.raise(0, 0, 2, 2); // (1,1) is 2, (5,5) is 1
  r.S.tool = 'level';
  r.drag([5, 5], [1, 1]); // begun on the LOW ground
  assert.equal(r.world.levelAt(1, 1), 1);
  assert.equal(r.world.levelAt(5, 5), 1);
  r.input.destroy();
});

test('the + and - keys raise and lower the tile under the cursor', () => {
  const r = rig();
  canvas.fire('pointermove', r.at(9, 9));
  win.fire('keydown', { key: '+' });
  assert.equal(r.world.levelAt(9, 9), 1);
  win.fire('keydown', { key: '-' });
  assert.equal(r.world.levelAt(9, 9), 0);
  win.fire('keydown', { key: 'PageUp' });
  assert.equal(r.world.levelAt(9, 9), 1);
  r.input.destroy();
});

test('r cycles raise -> lower -> level -> placing', () => {
  const r = rig();
  const seen = [];
  for (let i = 0; i < 4; i++) {
    win.fire('keydown', { key: 'r' });
    seen.push(r.S.tool);
  }
  assert.deepEqual(seen, ['raise', 'lower', 'level', 'place']);
  r.input.destroy();
});

// --- SPEC §0 and §8 --------------------------------------------------------

test('terrain editing is free and unlimited — the tools never refuse for a cost', () => {
  const r = rig();
  r.S.tool = 'raise';
  for (let i = 0; i < 120; i++) r.drag([i % 15, (i * 3) % 15], [(i % 15) + 2, ((i * 3) % 15) + 2]);
  assert.ok(r.world.stats().relief > 0, 'nothing was built at all');
  // Every refusal seen must be a physical one — a ceiling or a floor, never a
  // price. This is the assertion that stops a terraforming cost creeping in.
  for (const s of r.said) {
    assert.ok(
      !/cost|afford|pay|coin|resource|energy|not enough/i.test(s),
      `the terrain tools said something about a cost: "${s}"`
    );
  }
  r.input.destroy();
});

test('the ceiling refuses out loud, and the refusal is physical', () => {
  const r = rig();
  r.S.tool = 'raise';
  for (let i = 0; i < MAX_LEVEL + 2; i++) r.drag([9, 9], [9, 9]);
  assert.equal(r.world.levelAt(9, 9), MAX_LEVEL);
  const last = r.said[r.said.length - 1];
  assert.match(last, /high/i, `the refusal should say why: "${last}"`);
  r.input.destroy();
});

test('an illegal placement SAYS WHY rather than doing nothing', () => {
  const r = rig();
  r.world.place('oak', 8, 8);
  r.S.tool = 'place';
  r.S.selection = { id: 'oak', footprint: [1, 1] };
  r.said.length = 0;
  r.drag([8, 8], [8, 8]);
  assert.equal(r.said.length, 1, 'a refused placement said nothing at all');
  assert.match(r.said[0], /already/i);
  // ...and it says it once, not once per tile crossed.
  r.drag([8, 8], [8, 8]);
  assert.equal(r.said.length, 1, 'the same refusal was repeated');
  r.input.destroy();
});

test('the connector rule and the flat-footprint rule are what the ghost enforces', () => {
  const r = rig();
  const stair = { id: 'stone-stair', footprint: [1, 1], connector: true };
  const bench = { id: 'exedra', footprint: [3, 1] };

  assert.equal(r.input.legality(stair, 4, 4).ok, false, 'a stair stood on flat ground');
  r.world.raise(5, 4);
  assert.equal(r.input.legality(stair, 4, 4).ok, true, 'a stair refused a one-level step');
  r.world.raise(5, 4);
  const tall = r.input.legality(stair, 4, 4);
  assert.equal(tall.ok, false, 'a stair climbed a two-level cliff in one flight');
  assert.ok(tall.reason && tall.reason.length > 0);

  assert.equal(r.input.legality(bench, 10, 10).ok, true);
  r.world.raise(11, 10);
  const uneven = r.input.legality(bench, 10, 10);
  assert.equal(uneven.ok, false, 'a 3x1 bench straddled a step');
  assert.match(uneven.reason, /level/i);
  r.input.destroy();
});
