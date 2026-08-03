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

// --- the brush -------------------------------------------------------------
//
// The owner: *"it would be nice if you could change the size of your selection
// like changing the size of your brush in a painting application, 1 square, 2
// square, 3 square, 5 square. this is especially useful for hills."*
//
// The mechanism is one sentence — THE BRUSH IS THE WIDTH OF THE STROKE — and
// these hold it to the three things that sentence promises: it covers n x n,
// it anchors where every other footprint anchors, and it is still ONE undo.

/** A rig whose ui.js reports a fixed brush, the way the real one would. */
function brushRig(n, opts = {}) {
  const r = rig(opts);
  r.ui.brush = () => n;
  return r;
}

test('THE BRUSH COVERS n x n: one click raises a square, not a tile', () => {
  for (const [n, want] of [[1, 1], [2, 4], [3, 9], [5, 25]]) {
    const r = brushRig(n);
    r.S.tool = 'raise';
    r.drag([8, 8], [8, 8]);
    let raised = 0;
    for (let y = 0; y < r.world.h; y++) {
      for (let x = 0; x < r.world.w; x++) if (r.world.levelAt(x, y) > 0) raised++;
    }
    assert.equal(raised, want, `a ${n}-brush raised ${raised} tiles, wanted ${want}`);
    r.input.destroy();
  }
});

test('THE BRUSH ANCHORS AT THE CURSOR and grows toward +tx/+ty', () => {
  // The same corner every multi-tile placeable already anchors at. Growing from
  // the centre would be a second anchoring rule, and the 2x2 path under the
  // cursor would sit somewhere the 3x3 brush did not.
  const r = brushRig(3);
  r.S.tool = 'raise';
  r.drag([8, 8], [8, 8]);
  assert.equal(r.world.levelAt(8, 8), 1, 'the anchor tile itself was not raised');
  assert.equal(r.world.levelAt(10, 10), 1, 'the far corner of the square was not raised');
  assert.equal(r.world.levelAt(7, 8), 0, 'the brush reached backwards along tx');
  assert.equal(r.world.levelAt(8, 7), 0, 'the brush reached backwards along ty');
  assert.equal(r.world.levelAt(11, 8), 0, 'the brush reached one tile too far');
  r.input.destroy();
});

test('A WIDE DRAG IS A THICK STROKE, not a second rectangle', () => {
  // Dragging 8,8 -> 12,8 with a 3-brush paints 7 x 3, which is the stroke a
  // 3-wide brush leaves. This is the whole reason the brush grows the region
  // rather than repeating a square at each end.
  const r = brushRig(3);
  r.S.tool = 'raise';
  r.drag([8, 8], [12, 8]);
  let raised = 0;
  for (let y = 0; y < r.world.h; y++) {
    for (let x = 0; x < r.world.w; x++) if (r.world.levelAt(x, y) > 0) raised++;
  }
  assert.equal(raised, 7 * 3, `a 3-brush dragged five tiles painted ${raised}, wanted 21`);
  r.input.destroy();
});

test('A BRUSH STROKE IS STILL ONE UNDO STEP', () => {
  // The property the terrain drag already had, and the one a brush is most
  // likely to break: applying per tile would fill a 64-step stack with one hill.
  const r = brushRig(5);
  r.S.tool = 'raise';
  r.drag([8, 8], [8, 8]);
  assert.equal(r.world.levelAt(10, 10), 1);
  r.world.undo();
  let left = 0;
  for (let y = 0; y < r.world.h; y++) {
    for (let x = 0; x < r.world.w; x++) if (r.world.levelAt(x, y) > 0) left++;
  }
  assert.equal(left, 0, `one undo left ${left} tiles raised — the stroke was ${left ? 'many' : 'one'} edits`);
  r.input.destroy();
});

test('THE PREVIEW IS THE BRUSH: the ghost is the size the click will be', () => {
  // A size the player cannot see before they click is a size they discover by
  // undoing. The ghost has to be the promise the click then keeps.
  const r = brushRig(3);
  r.S.tool = 'raise';
  canvas.fire('pointermove', r.at(8, 8));
  const g = r.ghosts[r.ghosts.length - 1];
  assert.ok(g, 'no ghost at all');
  assert.deepEqual({ w: g.w, h: g.h }, { w: 3, h: 3 }, 'the terrain preview ignored the brush');
  r.input.destroy();
});

test('THE BRUSH STOPS AT THE MAP EDGE rather than reaching off it', () => {
  const r = brushRig(5);
  r.S.tool = 'raise';
  const edge = r.world.w - 2;
  r.drag([edge, edge], [edge, edge]);
  let raised = 0;
  for (let y = 0; y < r.world.h; y++) {
    for (let x = 0; x < r.world.w; x++) if (r.world.levelAt(x, y) > 0) raised++;
  }
  assert.equal(raised, 4, `a 5-brush at the corner raised ${raised} tiles, wanted the 2x2 that fits`);
  r.input.destroy();
});

test('THE BRUSH PAINTS PLACEMENTS TOO, one-tile ones', async () => {
  // The owner scoped it himself: *"the easiest way to implement it is to make
  // it work on any one tile placements."*
  const cat = await import('../js/catalog.js');
  const one = cat.CATALOG.find((p) => p.id === 'mossy-ground');
  assert.ok(one, 'the catalogue no longer has mossy-ground');
  const r = brushRig(3);
  r.S.tool = 'place';
  r.S.selection = one;
  canvas.fire('pointermove', r.at(8, 8));
  const g = r.ghosts[r.ghosts.length - 1];
  assert.deepEqual({ w: g.w, h: g.h }, { w: 3, h: 3 }, 'the placement preview ignored the brush');
  r.input.destroy();
});

test('A MULTI-TILE PLACEABLE IGNORES THE BRUSH', async () => {
  // A 2x2 path repeated on a 3x3 brush would overlap itself six ways, and the
  // player could not predict which nine of the sixteen tiles they were about to
  // cover. The brush is for one-tile things; the footprint wins.
  const cat = await import('../js/catalog.js');
  const big = cat.CATALOG.find((p) => p.id === 'meadow-turf');
  assert.deepEqual(big.footprint, [2, 2], 'meadow-turf is no longer 2x2');
  const r = brushRig(5);
  r.S.tool = 'place';
  r.S.selection = big;
  canvas.fire('pointermove', r.at(8, 8));
  const g = r.ghosts[r.ghosts.length - 1];
  assert.deepEqual({ w: g.w, h: g.h }, { w: 2, h: 2 }, 'a 2x2 placeable was stretched to the brush');
  r.input.destroy();
});

test('THE GROUND PAINTER DRAG LEAVES A WIDE TRAIL, not a one-tile line', () => {
  // Written to CHECK a claim rather than to state one. Ground painters are the
  // only placeable that drags, and it was not obvious whether the brush reached
  // that path — doPlace is called per tile as the pointer crosses. It does, and
  // the result is what a wide brush should leave: a trail as wide as the brush.
  const r = brushRig(3);
  r.S.tool = 'place';
  r.S.selection = { id: 'mossy-ground', ground: 'moss', group: 'ground', footprint: [1, 1] };
  const placed = [];
  r.input.destroy();
  const r2 = brushRig(3, { on: { place: (id, tx, ty) => { placed.push([tx, ty]); return true; } } });
  r2.S.tool = 'place';
  r2.S.selection = r.S.selection;
  r2.drag([8, 8], [12, 8]);
  assert.ok(placed.length >= 9, `a 3-brush drag placed only ${placed.length} tiles`);
  const xs = placed.map(([x]) => x);
  const ys = placed.map(([, y]) => y);
  // The trail is three tiles WIDE across the whole drag — that is the claim,
  // and asserting only the click would not have tested it.
  assert.deepEqual([Math.min(...ys), Math.max(...ys)], [8, 10], 'the trail is not as wide as the brush');
  assert.equal(Math.min(...xs), 8, 'the trail does not start at the press');
  assert.ok(Math.max(...xs) >= 12, `the trail stopped at ${Math.max(...xs)}, short of the release`);
  r2.input.destroy();
});
