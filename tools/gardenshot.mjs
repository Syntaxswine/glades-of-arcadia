#!/usr/bin/env node
/**
 * tools/gardenshot.mjs — WHAT THE PLAYER WOULD SEE.
 *
 *   node tools/gardenshot.mjs --place "colonnade@6,6 x4 +tx" --zoom 3
 *   node tools/gardenshot.mjs --place "arcade@5,5 x3 +tx; arcade@8,5 x3 +ty"
 *   node tools/gardenshot.mjs --place "balustrade@6,6 x3 +tx; balustrade@8,6 x3 +ty" --level 1
 *
 * WHY THIS EXISTS, and it is a confession.
 *
 * Every art instrument in tools/ draws a MONTAGE: `propshot` a contact sheet,
 * `decor-shot` a grid, `joinshot` a run laid on a patch of lattice it builds
 * itself. Each is the art talking to a probe. None of them is the GAME — none
 * goes through `catalog.js`'s footprints, `world.js`'s placement rules,
 * main.js's join-mask resolution or `render.js`'s depth sort — and so a fault
 * that lives in the seam between the art and the game has, until now, had
 * nowhere to show itself except a browser.
 *
 * And the browser was not being used. The standing note in six handoffs said
 * the preview pane could not boot the game, and on 2026-08-05 that turned out
 * to be **stale**: it boots, `rAF` runs, the title screen advances. What is
 * true is narrower and duller — the pane is 415x320 and will not resize, the
 * game has no global handle to drive from a console, so reaching a placed
 * colonnade means clicking a garden into being through a letterbox. That is a
 * bad enough instrument that it was not used, and "I have an instrument I
 * never use" is indistinguishable from having none.
 *
 * So: the real World, the real catalogue, the real artist, the real scene
 * builder, the real renderer — in Node, at any size, in one command.
 *
 * IT RUNS THE GAME, IT DOES NOT MODEL IT. That rule is `playtest.mjs`'s and it
 * is why `createArtist` and `createSceneBuilder` are exported from main.js
 * rather than reimplemented here: join masks are decided by the code that
 * decides them in play, which is the entire point of asking the question.
 *
 * THE PLACEMENT MINI-LANGUAGE, because a run of four should not be four lines:
 *
 *   id@tx,ty            one piece
 *   id@tx,ty x4         four, stepping +tx
 *   id@tx,ty x4 +ty     four, stepping +ty
 *   a; b; c             several, in order
 *
 * Node built-ins only (SPEC §1). PNG out via tools/headless-canvas.mjs.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

import { installCanvas, createCanvas, encodePNG, zoom } from './headless-canvas.mjs';

installCanvas();

const render = await import('../js/render.js');
const cat = await import('../js/catalog.js');
const { World } = await import('../js/world.js');
const { Fields } = await import('../js/fields.js');
const { createArtist, createSceneBuilder } = await import('../js/main.js');

const mGrow = await import('../js/art/grow.js');
const mTiles = await import('../js/art/tiles.js');
const mProps = await import('../js/art/props.js');
const mExtras = await import('../js/art/extras.js');
const mDecor = await import('../js/art/decor.js');
const mArtCreatures = await import('../js/art/creatures.js');
const mFields = await import('../js/fields.js');

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};

const ZOOM = Number(arg('--zoom', 3));
const MAP = Number(arg('--map', 20));
const LEVEL = Number(arg('--level', 0));
const PAD = Number(arg('--pad', 12));
const OUT = resolve(process.cwd(), arg('--out', 'docs/shots/garden.png'));
const VIEW_W = Number(arg('--w', 900));
const VIEW_H = Number(arg('--h', 620));

/** `id@tx,ty x4 +ty` — see the header. */
function parsePlan(text) {
  const out = [];
  for (const chunk of String(text).split(';')) {
    const s = chunk.trim();
    if (!s) continue;
    const m = /^([a-z0-9-]+)@(\d+),(\d+)(?:\s+x(\d+))?(?:\s+([+-]t[xy]))?$/i.exec(s);
    if (!m) {
      console.error(`cannot read placement '${s}' — expected  id@tx,ty [xN] [+tx|+ty]`);
      process.exit(2);
    }
    const [, id, tx, ty, n, axis] = m;
    const step = axis === '+ty' || axis === '-ty' ? [0, 1] : [1, 0];
    const sign = axis && axis[0] === '-' ? -1 : 1;
    for (let i = 0; i < Number(n || 1); i++) {
      out.push({ id, tx: Number(tx) + step[0] * i * sign, ty: Number(ty) + step[1] * i * sign });
    }
  }
  return out;
}

const plan = parsePlan(arg('--place', ''));
if (!plan.length) {
  console.error('nothing to place. try:  --place "colonnade@6,6 x4 +tx"');
  process.exit(2);
}

// --- a real garden ---------------------------------------------------------

const world = new World({ w: MAP, h: MAP, seed: 0x51ade5 });
const fields = new Fields({ world });

/**
 * `--level` raises the whole plot the run stands on, because an object's height
 * is READ FROM ITS TILE (world.js's rule) and a piece that looks right on the
 * flat can still meet a terrace wrong. Raising the ground under the run is the
 * cheapest way to ask that question, and it costs one flag.
 */
if (LEVEL) {
  for (const p of plan) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (typeof world.setLevel === 'function') world.setLevel(p.tx + dx, p.ty + dy, LEVEL);
      }
    }
  }
}

const placed = [];
const refused = [];
for (const p of plan) {
  // THE REAL PLACEMENT PATH, refusals and all. A tool that force-pushes objects
  // into the list can photograph a garden the player could never build — which
  // is a picture of nothing, and worse, a picture that looks like evidence.
  const o = world.place(p.id, p.tx, p.ty);
  if (o) placed.push(p);
  else refused.push(p);
}
if (!placed.length) {
  console.error('every placement was refused — check the ids against js/catalog.js');
  process.exit(2);
}

// --- the real artist, the real scene ---------------------------------------

const mods = {
  grow: mGrow,
  tiles: mTiles,
  artCreatures: mArtCreatures,
  props: mProps,
  extras: mExtras,
  decor: mDecor,
  fields: mFields,
};
const artist = createArtist(mods);
const builder = createSceneBuilder({ world, fields, bestiary: null, cat, artist, mods });

const cv = createCanvas(VIEW_W, VIEW_H);
const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
r.setScene(builder.scene(0));

// Centre on the middle of what was placed, so a run walks off neither edge.
const cx = Math.round(placed.reduce((a, p) => a + p.tx, 0) / placed.length);
const cy = Math.round(placed.reduce((a, p) => a + p.ty, 0) / placed.length);
r.centreOnTile(cx, cy, true);
r.frame(0);

// --- crop to the ink, so the subject is not a stamp on a field of grass -----

const ctx = cv.getContext('2d');
const img = ctx.getImageData(0, 0, VIEW_W, VIEW_H);
const px = img.data;

/**
 * The crop is found by DIFFERENCE against an empty garden, not by looking for
 * "non-grass" pixels: grass is procedural and noisy, and every threshold that
 * tries to name it by colour eventually eats a marble highlight. Two frames of
 * the same map with and without the objects is exact.
 */
const bare = createCanvas(VIEW_W, VIEW_H);
{
  const empty = new World({ w: MAP, h: MAP, seed: 0x51ade5 });
  if (LEVEL) {
    for (const p of plan) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (typeof empty.setLevel === 'function') empty.setLevel(p.tx + dx, p.ty + dy, LEVEL);
        }
      }
    }
  }
  const b = render.createRenderer(bare, { reducedMotion: true, maxScale: 1 });
  b.setScene(
    createSceneBuilder({ world: empty, fields, bestiary: null, cat, artist, mods }).scene(0)
  );
  b.centreOnTile(cx, cy, true);
  b.frame(0);
}
const basePx = bare.getContext('2d').getImageData(0, 0, VIEW_W, VIEW_H).data;

let left = VIEW_W;
let right = -1;
let top = VIEW_H;
let bottom = -1;
for (let p = 0; p < VIEW_W * VIEW_H; p++) {
  const i = p * 4;
  if (
    px[i] === basePx[i] &&
    px[i + 1] === basePx[i + 1] &&
    px[i + 2] === basePx[i + 2] &&
    px[i + 3] === basePx[i + 3]
  )
    continue;
  const x = p % VIEW_W;
  const y = (p / VIEW_W) | 0;
  if (x < left) left = x;
  if (x > right) right = x;
  if (y < top) top = y;
  if (y > bottom) bottom = y;
}
if (right < 0) {
  console.error('the objects drew nothing that differs from bare ground — is the view too small?');
  process.exit(2);
}

left = Math.max(0, left - PAD);
top = Math.max(0, top - PAD);
right = Math.min(VIEW_W - 1, right + PAD);
bottom = Math.min(VIEW_H - 1, bottom + PAD);
const w = right - left + 1;
const h = bottom - top + 1;

const crop = createCanvas(w, h);
const cimg = crop.getContext('2d').createImageData(w, h);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const s = ((y + top) * VIEW_W + (x + left)) * 4;
    const d = (y * w + x) * 4;
    cimg.data[d] = px[s];
    cimg.data[d + 1] = px[s + 1];
    cimg.data[d + 2] = px[s + 2];
    cimg.data[d + 3] = px[s + 3];
  }
}
crop.getContext('2d').putImageData(cimg, 0, 0);

const shot = ZOOM > 1 ? zoom(crop, ZOOM) : crop;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePNG(shot));

console.log(`${OUT}  ${shot.width}x${shot.height}  ${placed.length} placed, level ${LEVEL}`);
if (refused.length) {
  console.log(`  REFUSED by world.canPlace: ${refused.map((p) => `${p.id}@${p.tx},${p.ty}`).join(', ')}`);
}
