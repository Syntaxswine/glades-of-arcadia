#!/usr/bin/env node
/**
 * tools/elevation-probe.mjs — look at the elevation engine, and measure it.
 *
 *   node tools/elevation-probe.mjs [--out docs/shots] [--quiet]
 *
 * Renders four scenes through the real js/render.js on a headless canvas, writes
 * them as PNGs, and runs the three checks a picture cannot make:
 *
 *   1. PICK ROUND-TRIP — for every pixel of the viewport, pick a column and
 *      then re-derive the surface from the projection. Any disagreement is a
 *      click that lands somewhere the player did not aim.
 *   2. FRAME BUDGET — a full 20x20 map, fully planted, with terrain, movers
 *      and a live waterfall. The target is 60fps, i.e. 16.7ms.
 *   3. PALETTE PURITY — the cliff faces, the falls and the five grass types
 *      are all new generated art. Every pixel of them must be a colour that is
 *      already in palette.js (SPEC §3, RESEARCH A9.4).
 *
 * Exits non-zero on a structural fault only: a pick disagreement or a colour
 * that is not in the palette. Timing is REPORTED, never asserted — a busy CI
 * box is not a rendering bug.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { installCanvas, createCanvas, encodePNG, zoom } from './headless-canvas.mjs';

installCanvas();

const render = await import('../js/render.js');
const iso = await import('../js/iso.js');
const pal = await import('../js/palette.js');
let tiles = null;
try {
  tiles = await import('../js/art/tiles.js');
} catch {
  tiles = null; // another owner's module, mid-flight — the probe does not care
}

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const OUT = resolve(process.cwd(), arg('--out', 'docs/shots'));
const QUIET = argv.includes('--quiet');
mkdirSync(OUT, { recursive: true });

const { MAX_LEVEL } = iso;
const log = (...a) => {
  if (!QUIET) console.log(...a);
};

// ---------------------------------------------------------------------------
// Scenes. Built for render.js directly — no world.js, no catalog.js — so the
// elevation engine can be judged on its own while seven other owners are
// mid-edit.

function scene(mapW, mapH, fill) {
  const n = mapW * mapH;
  const levels = new Int8Array(n);
  const grass = new Uint8Array(n);
  const contest = new Int8Array(n).fill(-1);
  const wet = new Uint8Array(n);
  fill({ levels, grass, contest, wet, mapW, mapH, i: (x, y) => y * mapW + x });
  return {
    mapW,
    mapH,
    terrainVersion: 1,
    levels,
    grass: (tx, ty) => render.GRASS_TYPES[grass[ty * mapW + tx]],
    grassContest: (tx, ty) => {
      const c = contest[ty * mapW + tx];
      return c < 0 ? null : render.GRASS_TYPES[c];
    },
    terrain: (tx, ty) => {
      const i = ty * mapW + tx;
      if (!wet[i]) return null;
      return { water: true, art: tiles ? tiles.WATER[0] : null };
    },
    objects: [],
    creatures: [],
    _raw: { levels, grass, contest, wet },
  };
}

const SCENES = {
  // The whole ladder in one shot: six levels of terrace, long cliffs.
  terraces: () =>
    scene(20, 20, (s) => {
      for (let y = 0; y < s.mapH; y++) {
        for (let x = 0; x < s.mapW; x++) {
          s.levels[s.i(x, y)] = Math.max(0, Math.min(MAX_LEVEL, MAX_LEVEL - Math.floor((x + y) / 5)));
        }
      }
    }),

  // A spring high on a terrace falling to a pool below — ELEVATION.md's own
  // argument for why this makes the naiad's habitat worth building.
  waterfall: () =>
    scene(20, 20, (s) => {
      for (let y = 0; y < s.mapH; y++) {
        for (let x = 0; x < s.mapW; x++) {
          const i = s.i(x, y);
          const d = x + y;
          s.levels[i] = d < 14 ? 5 : d < 16 ? 1 : 0;
          if (x >= 3 && x <= 8 && y >= 3 && y <= 8 && d < 14) s.wet[i] = 1;
          if (d >= 16 && x >= 4 && x <= 12 && y >= 4 && y <= 12) s.wet[i] = 1;
          s.grass[i] = s.levels[i] >= 5 ? 1 : s.levels[i] === 0 ? 3 : 2;
        }
      }
    }),

  // All five grass types, contested seams between them, soft meadow edges.
  zoning: () =>
    scene(20, 20, (s) => {
      const centres = [
        [4, 4, 1],
        [15, 4, 2],
        [4, 15, 3],
        [15, 15, 4],
      ];
      for (let y = 0; y < s.mapH; y++) {
        for (let x = 0; x < s.mapW; x++) {
          const i = s.i(x, y);
          let best = 0;
          let bestD = 6.5;
          let second = -1;
          let secondD = 99;
          for (const [cx, cy, t] of centres) {
            const d = Math.hypot(x - cx, y - cy);
            if (d < bestD) {
              secondD = bestD;
              second = best;
              bestD = d;
              best = t;
            } else if (d < secondD) {
              secondD = d;
              second = t;
            }
          }
          s.grass[i] = best;
          if (best !== 0 && second > 0 && secondD - bestD < 0.9) s.contest[i] = second;
        }
      }
    }),

  // Everything at once, which is what the game looks like and therefore the
  // one to judge: terraces, a pinnacle, a fall, four grass types, contest.
  glade: () =>
    scene(20, 20, (s) => {
      for (let y = 0; y < s.mapH; y++) {
        for (let x = 0; x < s.mapW; x++) {
          const i = s.i(x, y);
          let h = 0;
          if (x + y < 10) h = 4;
          else if (x + y < 13) h = 2;
          if (x > 13 && y > 13) h = 1;
          if (x >= 2 && x <= 4 && y >= 2 && y <= 4) h = 6;
          s.levels[i] = h;
          if (x >= 3 && x <= 6 && y >= 3 && y <= 6 && h === 4) s.wet[i] = 1;
          if (x + y >= 13 && x + y <= 18 && x >= 4 && x <= 10) s.wet[i] = 1;
          s.grass[i] = h >= 4 ? 1 : h === 0 ? 3 : h === 1 ? 4 : 2;
          if (h === 2 && (x + y) & 1) s.contest[i] = 1;
        }
      }
    }),
};

// Where to point the camera for each scene. Framing matters: centred on the
// map, a hillside puts all its cliffs off the top of the viewport and the shot
// shows nothing but the plateau you happen to be standing on.
const FRAMING = {
  terraces: [9.5, 9.5],
  waterfall: [7, 7],
  zoning: [9.5, 9.5],
  glade: [6.5, 6.5],
};

function draw(name, opts = {}) {
  const cv = createCanvas(640, 400);
  const r = render.createRenderer(cv, { reducedMotion: opts.motion !== true, maxScale: 1 });
  const sc = SCENES[name]();
  r.setScene(sc);
  const f = opts.at || FRAMING[name] || [sc.mapW / 2 - 0.5, sc.mapH / 2 - 0.5];
  r.centreOnTile(f[0], f[1], true);
  if (opts.lift) {
    r.target.y -= opts.lift;
    r.camera.y = r.target.y;
  }
  r.frame(opts.t ?? 0);
  return { r, sc, cv };
}

/** A 1:1 crop, zoomed, so a detail can be judged the way the sprite lab does. */
function crop(cv, x, y, w, h, k) {
  const out = createCanvas(w, h);
  const ctx = out.getContext('2d');
  ctx.drawImage({ width: cv.width, height: cv.height, _data: cv._data }, -x, -y);
  return zoom(out, k);
}

// ---------------------------------------------------------------------------
// 1. The pictures.

const faultsEarly = [];
const made = {};
for (const name of Object.keys(SCENES)) {
  const m = draw(name);
  made[name] = m;
  writeFileSync(join(OUT, `elev-${name}.png`), encodePNG(m.cv));
  log(`wrote elev-${name}.png`);
}

// PLANTED TERRACES — the shot that tests the depth sort with height. Trees on
// four different levels, with a tall one standing on low ground in front of a
// cliff, which ELEVATION.md names as the remaining hard case.
{
  let grow = null;
  try {
    grow = await import('../js/art/grow.js');
  } catch {
    grow = null;
  }
  if (grow) {
    const m = draw('glade', { at: [7, 7] });
    const objs = [];
    let seed = 11;
    for (let ty = 0; ty < 20; ty++) {
      for (let tx = 0; tx < 20; tx++) {
        if ((tx * 5 + ty * 3) % 7) continue;
        if (m.r._wet[ty * 20 + tx]) continue;
        seed = (seed * 1103515245 + 12345) >>> 0;
        const which = seed % 3;
        const art = grow.compose(
          which === 0 ? 'broadleaf' : which === 1 ? 'conifer' : 'olive',
          seed,
          { stage: 'mature' }
        );
        objs.push({ tx, ty, art, footprint: [1, 1] });
      }
    }
    m.sc.objects = objs;
    m.r.setScene(m.sc);
    m.r.requestDraw();
    m.r.frame(400);
    writeFileSync(join(OUT, 'elev-planted-terraces.png'), encodePNG(m.cv));
    log(`wrote elev-planted-terraces.png  (${objs.length} trees across the terraces)`);
  }
}

// A close-up of the fall, at six palette phases in one strip, so the motion can
// be judged without a browser.
{
  const strip = createCanvas(140 * 6, 110);
  const sctx = strip.getContext('2d');
  for (let p = 0; p < 6; p++) {
    const m = draw('waterfall', { motion: true, t: (p * 1000) / 8 + 1, at: [6, 6] });
    sctx.drawImage(crop(m.cv, 250, 130, 140, 110, 1), p * 140, 0);
  }
  writeFileSync(join(OUT, 'elev-fall-phases.png'), encodePNG(zoom(strip, 2)));
  log('wrote elev-fall-phases.png  (six consecutive palette phases, left to right)');
}

// THE WATER MUST FALL DOWN.
//
// This is the check the eye is worst at and the code is easiest to get wrong:
// palette cycling has no inherent direction, and the sign that makes a
// waterfall fall is the sign that makes it climb. A shot of one frame cannot
// show it and a shot of two frames barely can, so measure it.
//
// Method: rasterise the same fall at consecutive phases and cross-correlate
// the brightness profile down the sheet. The offset that maximises the match
// is how far the pattern moved, and it must be POSITIVE (downward).
{
  const m = draw('waterfall', { motion: true, at: [6, 6] });
  const cache = m.r._terrainCv;
  void cache;
  // Pull the fall art straight out of the renderer's own cache path by
  // rendering two phases and comparing a column of the sheet.
  const profile = (t) => {
    const s = draw('waterfall', { motion: true, t, at: [6, 6] });
    const d = s.cv._data;
    const col = [];
    // A column of pixels that is entirely inside the falling sheet.
    const x = 320;
    for (let y = 60; y < 150; y++) {
      const i = (y * 640 + x) * 4;
      col.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    }
    return col;
  };
  const a = profile(1);
  const b = profile(1 + 1000 / 8); // exactly one palette phase later
  let bestShift = 0;
  let bestScore = -Infinity;
  for (let sh = -6; sh <= 6; sh++) {
    let s = 0;
    let n = 0;
    for (let i = 12; i < a.length - 12; i++) {
      s += a[i] * b[i + sh];
      n++;
    }
    s /= n;
    if (s > bestScore) {
      bestScore = s;
      bestShift = sh;
    }
  }
  // b[i + sh] matches a[i], so the pattern moved by -sh. Downward is positive.
  const moved = -bestShift;
  log(`\nwaterfall motion: the sheet moved ${moved > 0 ? '+' : ''}${moved}px per palette phase (down is positive)`);
  if (moved <= 0) {
    console.error('FAULT: the waterfall is running UP the cliff');
    faultsEarly.push('waterfall direction');
  }
}

// A zoomed strip of the five grass types and the contested blends, so the art
// can be judged at 4x the way the sprite lab shows everything else.
{
  const types = render.GRASS_TYPES;
  const cv = createCanvas(64 * 5, 32 * 4);
  const ctx = cv.getContext('2d');
  for (let i = 0; i < types.length; i++) {
    ctx.drawImage(render.groundTile(i, 0, i, null, null), i * 64, 0);
    ctx.drawImage(render.groundTile(i, 1, i, 0, null), i * 64, 32);
    ctx.drawImage(render.groundTile(i, 2, i, null, { other: 0, mask: 15 }), i * 64, 64);
    // contested against the NEXT type round the ring — the nine other pairs
    ctx.drawImage(render.groundTile(i, 3, i, (i + 1) % types.length, null), i * 64, 96);
  }
  writeFileSync(join(OUT, 'elev-grass-strip.png'), encodePNG(zoom(cv, 3)));
  log(
    'wrote elev-grass-strip.png  (1: the five types, 2: contested with meadow, ' +
      '3: soft edges all round toward meadow, 4: contested with the next type)'
  );
}

// ---------------------------------------------------------------------------
// 2. PICK ROUND-TRIP — every pixel of the viewport.

let faults = faultsEarly.length;
{
  const { r } = made.glade;
  const lv = (tx, ty) => r.levelAt(tx, ty);
  const reader = iso.levelReader(lv, 20, 20);
  let tested = 0;
  let sky = 0;
  let onFace = 0;
  let bad = 0;
  for (let sy = 0; sy < 400; sy++) {
    for (let sx = 0; sx < 640; sx++) {
      // Pixel CENTRES. The tile mask classifies a pixel by its centre, so a
      // checker that probes the top-left corner disagrees with it along every
      // diamond edge and reports a fault that is really a half-pixel
      // convention mismatch. Real pointer events are fractional anyway.
      const p = r.pickScreen(sx + 0.5, sy + 0.5);
      tested++;
      if (!p.hit) {
        sky++;
        continue;
      }
      if (p.face !== 'top') onFace++;
      const n = iso.toScreenAt(p.tx, p.ty, p.level, r._cam);
      const rise = iso.exposedRise(p.tx, p.ty, reader);
      const f = iso.columnFaceAt(sx + 0.5 - n.x, sy + 0.5 - n.y, rise.se, rise.sw);
      if (f !== p.face || lv(p.tx, p.ty) !== p.level) bad++;
    }
  }
  faults += bad;
  log(
    `\npick round-trip: ${tested} pixels tested, ${bad} disagreements, ` +
      `${onFace} landed on a cliff face, ${sky} were sky`
  );
}

// NO HOLES. If picking says there is a surface under a pixel, the terrain
// cache had better have painted one there. This is the check that catches an
// off-by-half-a-tile in the top-face blit, which opens a diagonal seam of sky
// between the ground tiles and reads convincingly as a lighting effect.
for (const name of Object.keys(made)) {
  const { r } = made[name];
  const b = r._world;
  const cache = r._terrainCv;
  let holes = 0;
  for (let sy = 0; sy < 400; sy++) {
    for (let sx = 0; sx < 640; sx++) {
      if (!r.pickScreen(sx + 0.5, sy + 0.5).hit) continue;
      const cx = Math.round(sx + r._cam.x - b.minX);
      const cy = Math.round(sy + r._cam.y - b.minY);
      if (cx < 0 || cy < 0 || cx >= cache.width || cy >= cache.height) continue;
      if (cache._data[(cy * cache.width + cx) * 4 + 3] < 255) holes++;
    }
  }
  faults += holes;
  log(`holes in ${name}: ${holes} pixels where a surface was picked but nothing was painted`);
}

// The other half of picking: project every tile's top centre and pick it back.
{
  const { r, sc } = made.glade;
  let bad = 0;
  let buried = 0;
  for (let ty = 0; ty < 20; ty++) {
    for (let tx = 0; tx < 20; tx++) {
      const h = r.levelAt(tx, ty);
      const c = iso.tileCentreAt(tx, ty, h, r._cam);
      if (c.x < 0 || c.x >= 640 || c.y < 0 || c.y >= 400) continue;
      const p = r.pickScreen(c.x, c.y);
      if (!p.hit) {
        bad++;
        continue;
      }
      if (p.tx === tx && p.ty === ty) continue;
      // Anything else must be IN FRONT — a tile standing over this one. A tile
      // behind winning would mean the pick and the painter disagree.
      if (p.tx + p.ty > tx + ty) buried++;
      else bad++;
    }
  }
  void sc;
  faults += bad;
  log(`tile centres: ${bad} wrong, ${buried} legitimately buried by a column in front`);
}

// ---------------------------------------------------------------------------
// 3. FRAME BUDGET — 20x20, fully planted, terrain, movers, a live waterfall.

{
  const cv = createCanvas(640, 400);
  const r = render.createRenderer(cv, { reducedMotion: false, maxScale: 1 });
  const sc = SCENES.glade();
  const art = tiles ? tiles.GRASS[0] : null;
  const objs = [];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) objs.push({ tx: x, ty: y, art, footprint: [1, 1] });
  const movers = [];
  for (let k = 0; k < 12; k++) movers.push({ tx: 3 + k * 1.37, ty: 5 + k * 0.61, art, footprint: [1, 1] });
  sc.objects = objs;
  sc.creatures = movers;
  r.setScene(sc);
  r.centreOnTile(9.5, 9.5, true);

  for (let k = 0; k < 8; k++) r.frame(k * 130); // warm every cache and phase

  const N = 200;
  let t0 = process.hrtime.bigint();
  for (let k = 0; k < N; k++) {
    r.requestDraw();
    r.frame(2000 + k * 16.7);
  }
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / N;

  t0 = process.hrtime.bigint();
  for (let k = 0; k < 20; k++) {
    sc.terrainVersion = 500 + k;
    r.invalidateTerrain();
    r.requestDraw();
    r.frame(20000 + k * 16.7);
  }
  const rebuild = Number(process.hrtime.bigint() - t0) / 1e6 / 20;

  log(
    `\nframe budget: ${per.toFixed(2)}ms/frame with ${objs.length} objects + ${movers.length} movers ` +
      `(60fps = 16.7ms)\n` +
      `terrain rebuild: ${rebuild.toFixed(2)}ms  — paid only on a terrain edit, not per frame\n` +
      `NOTE: this is a software canvas in Node. A real GPU-backed canvas blits ` +
      `far faster, so these are pessimistic upper bounds.`
  );
  writeFileSync(join(OUT, 'elev-planted.png'), encodePNG(cv));
  log('wrote elev-planted.png');
}

// ---------------------------------------------------------------------------
// 4. PALETTE PURITY.

{
  const allowed = new Set(pal.PALETTE.keys().map((k) => pal.PALETTE.get(k).toLowerCase()));
  let total = 0;
  const strays = new Map();
  for (const name of Object.keys(made)) {
    const d = made[name].cv._data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      total++;
      const hex =
        '#' +
        d[i].toString(16).padStart(2, '0') +
        d[i + 1].toString(16).padStart(2, '0') +
        d[i + 2].toString(16).padStart(2, '0');
      if (!allowed.has(hex)) strays.set(hex, (strays.get(hex) || 0) + 1);
    }
  }
  log(`\npalette purity: ${strays.size} colours across ${total} pixels are not in palette.js`);
  for (const [hex, n] of [...strays.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    log(`  ${hex}  x${n}`);
  }
  faults += strays.size;
}

// ---------------------------------------------------------------------------

if (faults) {
  console.error(`\nELEVATION PROBE: ${faults} structural faults`);
  process.exit(1);
}
log('\nELEVATION PROBE: clean');
