// shadow-probe.mjs — how much of each object's contact shadow can be SEEN?
//
//   node tools/shadow-probe.mjs [--ids a,b,c] [--ground grass|flagstone|...]
//                               [--all] [--sort drawn|visible|hidden]
//
// WHY THIS EXISTS
//
// Glades draws contact shade twice, by two systems that have never been
// compared: a baked 'm' skirt inside 68 sprites, and a runtime stamp laid down
// as its own pass under everything. The 2026-07-31 handoff proposes deleting
// the first, and warns that doing so before enlarging the second would "trade a
// green mat for no shadow at all". That warning was arithmetic on the stamp's
// dimensions. THIS MEASURES IT ON RENDERED PIXELS INSTEAD.
//
// The method is three frames of the same one-object garden:
//
//   A   terrain only                      the ground, with nothing on it
//   B   terrain + the shadow pass         the stamp, with nothing over it
//   C   terrain + shadow + the object     what the player actually sees
//
// then
//
//   drawn    = pixels where B differs from A          the stamp's whole area
//   visible  = of those, pixels where C still equals B   what survives the object
//   hidden   = drawn - visible
//
// A stamp that is 100% hidden is not a subtle art problem. It is dead work
// every frame, and — more to the point — it is the entire budget available to
// replace a baked skirt that is currently doing the job.
//
// The `--ids` a caller passes are CATALOGUE ids, not sprite names, because the
// question is about objects the player can place. `baked` counts 'm' pixels in
// the sprite and is an OVER-count: 'm' is GRASS[0] and doubles as an object
// colour, so 457 of the tumulus's are its own barrow turf. It is here as an
// order of magnitude beside `visible`, not as a precise second measurement.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { installCanvas, createCanvas, encodePNG, zoom } from './headless-canvas.mjs';

installCanvas();

const render = await import('../js/render.js');
const { groundCentre } = await import('../js/art/format.js');
const cat = await import('../js/catalog.js');

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const has = (f) => argv.includes(f);

const GROUND = arg('--ground', 'grass');
const SORT = arg('--sort', 'hidden');
const ONLY = arg('--ids', '') ? arg('--ids', '').split(',').map((s) => s.trim()) : null;

// --- the art registry, resolved exactly as main.js resolves it -------------

const registry = new Map();
for (const m of ['tiles', 'extras', 'props', 'decor']) {
  let mod;
  try {
    mod = await import(`../js/art/${m}.js`);
  } catch {
    continue;
  }
  const add = (name, s) => {
    if (s && s.rows && s.anchor) registry.set(s.name || name, s);
  };
  for (const [k, v] of Object.entries(mod)) add(k, v);
  for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY', 'CLUMPS']) {
    const t = mod[key];
    if (!t || typeof t !== 'object') continue;
    for (const [k, v] of Object.entries(t)) add(k, v);
  }
}

const artOf = (def) => {
  const a = def && def.art;
  if (!a || a.kind !== 'sprite') return null;
  if (a.wanted && registry.has(a.wanted)) return registry.get(a.wanted);
  return registry.get(a.sprite) || null;
};

// --- one flat garden, one object in the middle of it -----------------------

const W = 9;
const H = 9;
const TX = 4;
const TY = 4;
const VIEW_W = 640;
const VIEW_H = 400;

/**
 * `--paved <sprite>` lays a hard ground instead of turf — flagstone, gravel,
 * terrace paving — which is the case the shadow colour used to get wrong. A
 * paved tile carries no grass type, so `_groundKeyAt` has to read the tile art,
 * and that is the arm this exercises.
 */
const PAVED = arg('--paved', '');
const pavedArt = PAVED ? registry.get(PAVED) : null;
if (PAVED && !pavedArt) {
  console.error(`no tile sprite '${PAVED}' — try flagstone-dressed, gravel-c, terrace-paving-edged`);
  process.exit(2);
}
const terrainOf = pavedArt
  ? () => ({ art: pavedArt, grass: null, level: 0 })
  : () => null;

/** A dead-flat map of one ground, with `objects` on it. */
function scene(objects, w = W, h = H) {
  const levels = new Int8Array(w * h);
  return {
    mapW: w,
    mapH: h,
    terrainVersion: 1,
    levels,
    grass: () => (pavedArt ? null : GROUND),
    grassContest: () => null,
    terrain: terrainOf,
    objects,
    creatures: [],
  };
}

function frame(objects) {
  const cv = createCanvas(VIEW_W, VIEW_H);
  const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
  r.setScene(scene(objects));
  r.centreOnTile(TX, TY, true);
  r.frame(0);
  return cv.getContext('2d').getImageData(0, 0, VIEW_W, VIEW_H).data;
}

const differs = (a, b, i) =>
  a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3];

/**
 * The three frames, differenced.
 *
 * `art: null` isolates frame B: the shadow pass runs over every entry in the
 * draw list, while the object pass skips anything without art. That is a
 * property of render.js and not a flag invented for this tool, which is the
 * reason to prefer it — a probe with its own private code path measures its
 * own private code path.
 *
 * BUT THE RADIUS MUST BE PINNED, and the first version of this file was wrong
 * for exactly one commit because it was not. Once the shadow's size started
 * coming from `groundCentre(art)`, dropping the art dropped the measurement:
 * frame B drew the FALLBACK stamp and frame C drew the measured one, so the
 * difference between them was mostly the difference between two shadows and
 * the "visible" number was fiction. Passing `shadow` explicitly on both — the
 * scene field that means "the contact radius, in px" — makes the two frames
 * differ in exactly one thing, which is the whole point of differencing them.
 */
function measure(def, art) {
  const fp = def.footprint || [1, 1];
  const gc = groundCentre(art);
  const shadow = gc ? gc.r : undefined;
  const base = { tx: TX, ty: TY, footprint: fp, level: 0, shadow };
  const A = frame([]);
  const B = frame([{ ...base, art: null }]);
  const C = frame([{ ...base, art }]);

  let drawn = 0;
  let visible = 0;
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (let p = 0; p < VIEW_W * VIEW_H; p++) {
    const i = p * 4;
    if (!differs(A, B, i)) continue;
    drawn++;
    const y = (p / VIEW_W) | 0;
    const x = p % VIEW_W;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
    if (!differs(B, C, i)) visible++;
  }
  // ...and WHAT COLOUR it came out, which is the other half of the question.
  // SPEC §3 wants the shadow made of the GROUND's ramp two steps down, so a
  // prop on flagstone casts stone-coloured shade. Until 2026-08-01 every paved
  // tile fell through to the grass default and the whole catalogue stood on
  // little green mats; a census of the actual pixels is the only way to be
  // sure that is fixed, because "it looks darker" is true of the bug too.
  const hues = new Map();
  for (let p = 0; p < VIEW_W * VIEW_H; p++) {
    const i = p * 4;
    if (!differs(A, B, i)) continue;
    const hex = `#${B[i].toString(16).padStart(2, '0')}${B[i + 1].toString(16).padStart(2, '0')}${B[i + 2].toString(16).padStart(2, '0')}`;
    hues.set(hex, (hues.get(hex) || 0) + 1);
  }

  return {
    drawn,
    visible,
    hidden: drawn - visible,
    w: right >= left ? right - left + 1 : 0,
    h: bottom >= top ? bottom - top + 1 : 0,
    hues,
  };
}

/** Which ramp a rendered colour belongs to, for the shadow-colour census. */
const RAMP_OF_HEX = new Map();
{
  const pal = await import('../js/palette.js');
  for (const [name, ramp] of Object.entries(pal.RAMPS)) {
    for (let i = 0; i < ramp.hex.length; i++) {
      RAMP_OF_HEX.set(ramp.hex[i].toLowerCase(), `${name}[${i}]=${ramp.keys[i]}`);
    }
  }
}

/** 'm' pixels in the sprite. An OVER-count — see the header. */
const bakedPixels = (s) =>
  s && s.rows ? s.rows.reduce((n, row) => n + (row.match(/m/g) || []).length, 0) : 0;

// --- run -------------------------------------------------------------------

const rows = [];
for (const def of cat.CATALOG) {
  if (ONLY && !ONLY.includes(def.id)) continue;
  if (cat.isGroundPainter(def)) continue;
  const art = artOf(def);
  if (!art) continue;
  const m = measure(def, art);
  rows.push({
    id: def.id,
    fp: (def.footprint || [1, 1]).join('x'),
    sprite: art.name,
    baked: bakedPixels(art),
    ...m,
  });
}

rows.sort((a, b) => (SORT === 'drawn' ? b.drawn - a.drawn : SORT === 'visible' ? b.visible - a.visible : b.hidden - a.hidden));

const shown = has('--all') || ONLY ? rows : rows.slice(0, 30);

console.log(`contact shadow visibility — ${rows.length} placeables on ${GROUND}\n`);
console.log('  drawn   = px the runtime shadow pass put down');
console.log('  visible = px of it still on screen after the object is drawn');
console.log('  baked   = "m" px inside the sprite (an OVER-count: m is also an object colour)\n');
console.log('  id                       fp     stamp    drawn  visible  hidden   baked');
console.log('  ' + '-'.repeat(74));
for (const r of shown) {
  console.log(
    '  ' +
      r.id.padEnd(25) +
      r.fp.padEnd(7) +
      `${r.w}x${r.h}`.padEnd(8) +
      String(r.drawn).padStart(6) +
      String(r.visible).padStart(9) +
      String(r.hidden).padStart(8) +
      String(r.baked).padStart(8) +
      (r.drawn && r.visible === 0 ? '   ALL HIDDEN' : '')
  );
}
if (shown.length < rows.length) console.log(`  ... ${rows.length - shown.length} more (--all)`);

// --- ...and a picture, because a count is not a look ------------------------
//
// SPEC §10: "Do not author pixel art blind — it does not work." A shadow that
// measures well and reads as a dark puddle round the object's ankles is still
// wrong, and no pixel count says so. `--png` lays the requested objects out on
// one flat garden and writes the frame, so the next thing after reading the
// table is looking at the thing the table describes.
const PNG = arg('--png', '');
if (PNG) {
  const ids = ONLY || rows.slice(0, 12).map((r) => r.id);
  const defs = ids.map((id) => cat.CATALOG.find((d) => d.id === id)).filter(Boolean);
  const GW = 16;
  const GH = 16;
  const objects = [];
  // Spaced three tiles apart down the diagonal band the camera actually sees,
  // so no object's own art covers its neighbour's shadow — which would make
  // the picture agree with a bug.
  let i = 0;
  for (const d of defs) {
    const fp = d.footprint || [1, 1];
    const tx = 2 + (i % 4) * 3;
    const ty = 2 + Math.floor(i / 4) * 4;
    objects.push({ tx, ty, footprint: fp, level: 0, art: artOf(d) });
    i++;
  }
  const cv = createCanvas(VIEW_W, VIEW_H);
  const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
  r.setScene(scene(objects, GW, GH));
  r.centreOnTile(6, 6, true);
  r.frame(0);
  const out = resolve(process.cwd(), PNG);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePNG(zoom(cv, Number(arg('--zoom', 2)))));
  console.log(`\n  wrote ${PNG} — ${defs.length} objects on ${GROUND}`);
}

// The colour census, pooled across everything measured.
{
  const pool = new Map();
  for (const r of rows) for (const [hex, n] of r.hues) pool.set(hex, (pool.get(hex) || 0) + n);
  if (pool.size) {
    console.log('\n  SHADOW COLOUR — what the stamp is actually made of');
    for (const [hex, n] of [...pool].sort((a, b) => b[1] - a[1])) {
      const ramp = RAMP_OF_HEX.get(hex) || '(not a ramp colour)';
      const wrong = ramp.startsWith('grass') && PAVED ? '   <-- GRASS ON PAVING' : '';
      console.log(`    ${hex}  ${String(n).padStart(7)} px   ${ramp}${wrong}`);
    }
  }
}

const dead = rows.filter((r) => r.drawn > 0 && r.visible === 0);
const totalDrawn = rows.reduce((n, r) => n + r.drawn, 0);
const totalVisible = rows.reduce((n, r) => n + r.visible, 0);
console.log(
  `\n  ${rows.length} measured · ${dead.length} with a COMPLETELY hidden stamp · ` +
    `${totalVisible} of ${totalDrawn} stamp px visible overall ` +
    `(${((100 * totalVisible) / Math.max(1, totalDrawn)).toFixed(1)}%)`
);
if (dead.length) console.log('  completely hidden: ' + dead.map((r) => r.id).join(', '));
