// ui.js — the chrome. Late-90s Impressions bevelled panels, in the DOM.
//
// Everything here is measured in LOGICAL pixels (the 640x400 screen) and
// rendered at an integer scale via the CSS custom property `--u`, set by
// `fitStage()` below. Two rules follow from that, and they are why this module
// exists at all:
//
//   * Every size in css/style.css is `calc(N * var(--u))` with N a whole number
//     of logical pixels, so every edge in the chrome lands on the same pixel
//     grid as the canvas. Type is `8 * var(--u)` — a whole number of pixels at
//     1x, 2x and 3x, never fractionally scaled.
//   * Nothing here is drawn with the 2D path rasteriser. No gradients, no
//     border-radius, no anti-aliased curve anywhere in the game's chrome.
//
// THE JOURNAL RULE (SPEC §7, restated by docs/ZONING.md), which is the whole
// difference between cosy and anxious:
//
//     exact ticks for counts        ("2 of 3 ash trees")
//     qualitative words for the
//       surviving CONDITIONS        ("almost quiet enough", "older still")
//     the required grass patch
//       AS A PICTURE                a little clump of tiles, filled in as it
//                                   grows — see groundPicture() below
//     never a percentage, never a summed score, no rating number anywhere.
//
// creatures.js already formats each requirement into a `text` that obeys this,
// and this module renders that text verbatim. `axisWord()` below is the same
// vocabulary, kept here so tile tooltips and any UI-side phrasing use the words
// the player has already learned from the cards.
//
// WHAT THIS MODULE ADDED FOR THE ZONING AND ELEVATION WORK:
//
//   * the TERRAIN TOOLS — raise / lower / level — as a tool group at the head
//     of the `Land` tab, beside the ramps and stairs they cut the ground for.
//   * the palette organised by the docs/DECOR.md groups, every button carrying
//     an AFFINITY GLYPH: a four-column bar, one per creature, always in DECOR's
//     fixed 1-2-3-4 order, so a 1,3 item and a 1 item are two different SHAPES
//     and not two different strings.
//   * the journal's ground line, which draws the patch and refuses the figure.
//
// Nothing here shows a number that is not a count of discrete things the player
// could walk over and count themselves. If a future edit wants to put a
// progress bar on a creature card, re-read SPEC §0 first.
//
// DEPENDENCIES: `js/palette.js` for colour, and two projection helpers from
// `js/input.js` used only when no renderer is present. Everything else — the
// catalogue, the world, the bestiary, the renderer — is INJECTED through
// `createUI(opts)` and every call into it is guarded, so this module comes up
// whether or not its siblings do.

import { RAMPS, ACCENT, resolve as paletteResolve } from './palette.js';
import { rasterise } from './art/format.js';
import { TILE_W, TILE_H, tileToScreen } from './input.js';
import { AXES as FIELD_AXES } from './fields.js';
// docs/TOMBS.md. Imported rather than injected, on the same grounds as
// fields.js's AXES above: these are DATA and RULES, not a sibling module's
// behaviour, and a second copy of the epitaph list or of the discovery
// threshold living here is a copy that can drift from the one the tests check.
// catalog.js is pure and DOM-free, so this costs the module nothing.
import {
  ARCADIAN_UNLOCK,
  arcadianTombFound,
  byId as catalogById,
  epitaphsFor,
  isTomb,
  retendTombs,
  tombTended,
} from './catalog.js';

export const LOGICAL_W = 640;
export const LOGICAL_H = 400;
export const MIN_SCALE = 1;
export const MAX_SCALE = 3; // SPEC §2: 1x, 2x, 3x.

/** Logical-pixel layout of the chrome. VIEW is the map's visible rectangle. */
export const LAYOUT = {
  TOPBAR: { x: 0, y: 0, w: 640, h: 14 },
  VIEW: { x: 0, y: 14, w: 640, h: 286 },
  PANEL: { x: 0, y: 300, w: 640, h: 100 },
};

/**
 * The channels Tab cycles. Taken from fields.js rather than re-typed, because
 * ZONING.md retired `wildness`, `order` and `moisture` and replaced them with
 * the four species affinities. A retired channel does not crash — it reads 0
 * and the wash comes out flat — so a stale copy of this list is invisible
 * except as three dead presses of Tab, which is exactly the kind of fault
 * nobody reports. fields.js owns the vocabulary; this follows it.
 */
export const AXES = [...FIELD_AXES];

/** Garden seconds in a day, per creatures.js DAY_SECONDS. Override in opts. */
const DAY_SECONDS = 480;

// --------------------------------------------------------------------------
// The shared vocabulary. No numbers, ever.
// --------------------------------------------------------------------------

const AXIS_VOCAB = {
  wildness: { met: 'wild enough', more: 'wilder', less: 'tamer' },
  order: { met: 'tidy enough', more: 'tidier', less: 'looser' },
  seclusion: { met: 'quiet enough', more: 'quieter', less: 'more open' },
  moisture: { met: 'damp enough', more: 'wetter', less: 'drier' },
  maturity: { met: 'old enough', more: 'older', less: 'younger' },
};
const AXIS_FALLBACK = { met: 'right', more: 'more', less: 'less' };

/**
 * The qualitative gap word for an axis requirement.
 *
 *   axisWord('wildness', 1.2, { min: 3, scale: 4 })  ->  'wilder still'
 *   axisWord('seclusion', 2.7, { min: 3, scale: 4 }) ->  'almost quiet enough'
 *   axisWord('order', 5, { max: 2, scale: 4 })       ->  'much looser'
 *
 * `band` is `{ min?, max?, scale? }`. A band with only `min` is satisficing:
 * anything at or above it is met and more does nothing, which is the
 * anti-optimisation rule from RESEARCH §C4. `scale` is how many axis units
 * count as "a lot"; it defaults to 3.
 *
 * Returns a phrase, never a magnitude. If you ever want to expose the numbers
 * this function was given, re-read SPEC §7.
 */
export function axisWord(axis, value, band = {}) {
  const v = AXIS_VOCAB[axis] || AXIS_FALLBACK;
  if (value == null) return v.met;
  const scale = band.scale > 0 ? band.scale : 3;
  let gap = 0;
  let dir = 0;
  if (band.min != null && value < band.min) {
    dir = 1;
    gap = band.min - value;
  } else if (band.max != null && value > band.max) {
    dir = -1;
    gap = value - band.max;
  }
  if (dir === 0) return v.met;
  const word = dir > 0 ? v.more : v.less;
  const near = gap < scale * 0.34;
  const far = gap > scale;
  if (dir > 0) {
    if (near) return `almost ${v.met}`;
    return far ? `much ${word}` : `${word} still`;
  }
  if (near) return `a touch ${word}`;
  return far ? `much ${word}` : `${word} still`;
}

/** Is an axis requirement satisfied? Used only to pick a tick, never shown. */
export function axisMet(value, band = {}) {
  if (value == null) return false;
  if (band.min != null && value < band.min) return false;
  if (band.max != null && value > band.max) return false;
  return true;
}

// --------------------------------------------------------------------------
// Integer scaling / letterbox
// --------------------------------------------------------------------------

/** The one scale formula. Every module in the game must agree on this. */
export function pickScale(w, h) {
  const ww = w || window.innerWidth || LOGICAL_W;
  const hh = h || window.innerHeight || LOGICAL_H;
  const s = Math.floor(Math.min(ww / LOGICAL_W, hh / LOGICAL_H));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s || MIN_SCALE));
}

/**
 * Size the stage. The canvas backing store is never touched — it is 640x400,
 * full stop — only its CSS box and the `--u` unit change.
 *
 * If a renderer is present it is asked to do the sizing through its own
 * `resize(winW, winH)`, because it also keeps a `scale` that its `pickTile()`
 * divides by; sizing the canvas behind its back would put every click half a
 * screen out. `--u` is then read back off the canvas' real box, so the chrome
 * matches whatever actually happened rather than what we asked for.
 */
export function fitStage(app, canvas, renderer) {
  const scale = pickScale();
  if (renderer && typeof renderer.resize === 'function') {
    try {
      renderer.resize(window.innerWidth, window.innerHeight);
    } catch (_) {
      /* fall through to sizing it ourselves */
    }
  }
  if (canvas) {
    if (canvas.width !== LOGICAL_W) canvas.width = LOGICAL_W;
    if (canvas.height !== LOGICAL_H) canvas.height = LOGICAL_H;
    const want = LOGICAL_W * scale + 'px';
    if (canvas.style.width !== want) {
      canvas.style.width = want;
      canvas.style.height = LOGICAL_H * scale + 'px';
    }
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.imageSmoothingEnabled = false;
  }
  syncUnit(app, canvas, scale);
  return scale;
}

/** `--u` follows the canvas' actual rendered width. The canvas is the truth. */
export function syncUnit(app, canvas, fallbackScale) {
  let u = fallbackScale || 1;
  if (canvas) {
    const r = canvas.getBoundingClientRect();
    if (r.width > 0) u = r.width / LOGICAL_W;
  }
  const px = u + 'px';
  if (app.style.getPropertyValue('--u') !== px) app.style.setProperty('--u', px);
  app.dataset.scale = String(Math.round(u));
  return u;
}

/**
 * Keep the chrome glued to the canvas for the life of the page. Returns a stop
 * function. Call this once from the boot script; it is cheap and it makes the
 * chrome correct even when another module re-sizes the canvas on its own.
 */
export function watchStage(app, canvas, renderer) {
  const refit = () => fitStage(app, canvas, renderer);
  refit();
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  let ro = null;
  if (typeof ResizeObserver === 'function' && canvas) {
    ro = new ResizeObserver(() => {
      // Idempotent: if the box already agrees, nothing is written and the
      // observer does not re-fire. If another module shrank it, we put it back.
      const r = canvas.getBoundingClientRect();
      const want = LOGICAL_W * pickScale();
      if (Math.abs(r.width - want) > 0.5) fitStage(app, canvas, renderer);
      else syncUnit(app, canvas, pickScale());
    });
    ro.observe(canvas);
  }
  return () => {
    window.removeEventListener('resize', refit);
    window.removeEventListener('orientationchange', refit);
    if (ro) ro.disconnect();
  };
}

// --------------------------------------------------------------------------
// Placeholder silhouettes
// --------------------------------------------------------------------------
// A journal card for a creature you have not met shows a shape and nothing
// else. creatures.js supplies the *words* for that shape ("A hunched shape with
// horns, on a slope."); these are the picture. If the art owner supplies
// `opts.portrait(card, { silhouette })` these are never used. They are chrome,
// not world art — deliberately crude blocked masses, read at 3x.

const SIL = {
  satyr: [
    '..#......#..',
    '...#....#...',
    '....####....',
    '....####....',
    '.....##.....',
    '...######...',
    '..########..',
    '..########..',
    '...######...',
    '...######...',
    '..########..',
    '..###..###..',
    '..###..###..',
    '...##..##...',
    '...##..##...',
    '...##..##...',
    '..###..###..',
    '..###..###..',
  ],
  centaur: [
    '.....###........',
    '.....###........',
    '......#.........',
    '....#####.......',
    '....#####.......',
    '...######.......',
    '..###########...',
    '.#############..',
    '.#############..',
    '.#############..',
    '.###.......###..',
    '.###.......###..',
    '.###.......###..',
    '.###.......###..',
    '.###.......###..',
    '.###.......###..',
  ],
  naiad: [
    '...####...',
    '..######..',
    '...####...',
    '....##....',
    '..######..',
    '.########.',
    '.########.',
    '..######..',
    '..######..',
    '..######..',
    '.########.',
    '.########.',
    '.########.',
    '##########',
    '##########',
    '.########.',
  ],
  unicorn: [
    '............##..',
    '...........##...',
    '..........###...',
    '.........####...',
    '.........####...',
    '........####....',
    '..#########.....',
    '.###########....',
    '.############...',
    '.############...',
    '.############...',
    '.###......###...',
    '.###......###...',
    '.###......###...',
    '.###......###...',
    '.###......###...',
  ],
};
SIL.pan = SIL.satyr; // Pan is never shown before he is sighted anyway.
SIL._ = [
  '...####...',
  '..######..',
  '..######..',
  '...####...',
  '..######..',
  '.########.',
  '.########.',
  '.########.',
  '..######..',
  '..######..',
  '..###.###.',
  '..###.###.',
  '..###.###.',
  '..###.###.',
];

// --------------------------------------------------------------------------
// Art coming in from other modules
// --------------------------------------------------------------------------
// `opts.icon` and `opts.portrait` are supplied by whoever wires the game up,
// and the art pipeline speaks in several shapes (SPEC §4, render.js' scene
// contract). Everything that arrives here is normalised to a canvas and every
// step is guarded: a hook that returns the wrong shape must never be able to
// take the journal down with it.

function blank(w, h) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, w | 0);
  cv.height = Math.max(1, h | 0);
  return cv;
}

/** Any of the contracted art shapes -> a canvas, or null. Never throws. */
function artCanvas(art) {
  try {
    if (!art) return null;
    if (typeof art.getContext === 'function') return art; // a canvas already
    if (art.canvas && typeof art.canvas.getContext === 'function') return art.canvas;
    if (Array.isArray(art.rows) && art.anchor) return rasterise(art, paletteResolve);
    if (art.data && art.w && art.h) {
      const cv = blank(art.w, art.h);
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(art.w, art.h);
      img.data.set(art.data.subarray ? art.data.subarray(0, img.data.length) : art.data);
      ctx.putImageData(img, 0, 0);
      return cv;
    }
  } catch (err) {
    console.warn('[ui] could not read the art handed to a palette button', err);
  }
  return null;
}

/**
 * A palette-button icon: the top of the sprite, cropped 1:1 into the chip.
 * Cropping rather than scaling, because a downscaled sprite is a fractional
 * scale by another name, and the top of a plant is the part that identifies it.
 */
function chipCanvas(src, w, h) {
  const cv = blank(w, h);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sw = Math.min(w, src.width);
  const sh = Math.min(h, src.height);
  const sx = Math.max(0, Math.round((src.width - sw) / 2));
  const dx = Math.round((w - sw) / 2);
  ctx.drawImage(src, sx, 0, sw, sh, dx, 0, sw, sh);
  cv.classList.add('pixels');
  cv.style.width = `calc(${w} * var(--u))`;
  cv.style.height = `calc(${h} * var(--u))`;
  return cv;
}

/**
 * A journal portrait: the largest WHOLE-NUMBER upscale that fits the box. When
 * `mask` is set the sprite is filled flat with one unlit colour — a true
 * silhouette of the real creature, which is what an unmet card shows (SPEC §7).
 */
function portraitCanvas(src, boxW, boxH, mask) {
  const k = Math.max(1, Math.min(3, Math.floor(Math.min(boxW / src.width, boxH / src.height))));
  const cv = blank(src.width, src.height);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0);
  if (mask) {
    // source-in against a hard-alpha sprite: every opaque pixel becomes one
    // colour and no new intermediate values are introduced.
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = RAMPS.marble.hex[0];
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  cv.classList.add('pixels');
  cv.style.width = `calc(${src.width * k} * var(--u))`;
  cv.style.height = `calc(${src.height * k} * var(--u))`;
  return cv;
}

function silhouetteCanvas(id, scale = 3) {
  const rows = SIL[id] || SIL._;
  const w = rows[0].length;
  const h = rows.length;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const hex = RAMPS.marble.hex[0]; // '#6B6154' — an unlit shape, never black
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rows[y][x] !== '#') continue;
      const i = (y * w + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  cv.classList.add('pixels');
  cv.style.width = `calc(${w * scale} * var(--u))`;
  cv.style.height = `calc(${h * scale} * var(--u))`;
  return cv;
}

// --------------------------------------------------------------------------
// The ghost, for when there is no renderer
// --------------------------------------------------------------------------
// render.js draws its own ghost plate from `renderer.setGhost(...)`, which is
// where the ghost belongs — it knows the snapped camera. This fallback exists
// so the ghost still works in preview mode, and it uses the same idea: a
// stipple, never `globalAlpha`. A translucent wash greys the whole scene and is
// the clearest modern tell there is.

const GHOST_COLOURS = {
  legal: RAMPS.canopy.hex[4], // #9DB255
  illegal: ACCENT[2], // #C8414A
  razeOk: RAMPS.gold.hex[3], // #E9C158
  // Terrain edits get the EARTH ramp rather than the green: what you are about
  // to change is the ground itself, not something standing on it.
  raise: RAMPS.earth.hex[4], // #C0A176
  lower: RAMPS.earth.hex[2], // #7A5C3C
  level: RAMPS.marble.hex[3], // #DDD2BE — a flat, dressed, deliberate colour
};

const ghostCache = new Map();

function ghostTile(hex) {
  const hit = ghostCache.get(hex);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = TILE_W;
  cv.height = TILE_H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(TILE_W, TILE_H);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let y = 0; y < TILE_H; y++) {
    // The exact 64x32 diamond: row y spans [30-2k, 33+2k], k counting in from
    // whichever half of the tile y is in. k=0 -> 4px wide, k=15 -> 64px.
    const k = y < TILE_H / 2 ? y : TILE_H - 1 - y;
    const x0 = 30 - 2 * k;
    const x1 = 33 + 2 * k;
    for (let x = x0; x <= x1; x++) {
      const edge = x <= x0 + 1 || x >= x1 - 1;
      if (!edge && ((x + y) & 1) !== 0) continue; // 50% stipple inside
      const i = (y * TILE_W + x) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ghostCache.set(hex, cv);
  return cv;
}

// --------------------------------------------------------------------------
// Small DOM helpers
// --------------------------------------------------------------------------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function btn(cls, label, onClick, title) {
  const b = el('button', 'btn ' + (cls || ''), label);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', (ev) => {
    ev.preventDefault();
    onClick(ev);
  });
  return b;
}

function cap(s) {
  return String(s || '').replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Palette grid geometry. Must match `.grid` / `.item-chip` in style.css. */
const GRID_COLS = 6;
const CHIP_W = 54;
const CHIP_H = 21;

/** Call a method if it is there. Never let a sibling module take the UI down. */
function ask(obj, name, ...args) {
  if (!obj || typeof obj[name] !== 'function') return undefined;
  try {
    return obj[name](...args);
  } catch (err) {
    console.warn(`[ui] ${name}() threw`, err);
    return undefined;
  }
}

const GROUP_ORDER = [
  'ground', 'terrain', 'water', 'plants', 'trees', 'sculpture', 'structure', 'decor',
];
const GROUP_LABEL = {
  ground: 'Ground',
  terrain: 'Land',
  water: 'Water',
  plants: 'Plants',
  trees: 'Trees',
  sculpture: 'Statuary',
  structure: 'Building',
  decor: 'Furniture',
};
const GROUP_SWATCH = {
  ground: RAMPS.earth.hex[2],
  terrain: RAMPS.rock.hex[2],
  water: RAMPS.water.hex[3],
  plants: RAMPS.grass.hex[3],
  trees: RAMPS.canopy.hex[2],
  sculpture: RAMPS.marble.hex[3],
  structure: RAMPS.rock.hex[3],
  decor: RAMPS.terracotta.hex[2],
};

// --------------------------------------------------------------------------
// THE TERRAIN TOOLS  (docs/ELEVATION.md, "Editing tools")
// --------------------------------------------------------------------------
// Classic builder verbs, click-and-drag: raise, lower, level. They live on the
// `Land` tab beside the connectors — the ramps and stairs — because shaping the
// ground and putting the ways up it are one job and the player should not have
// to look in two places for them.
//
// The cosy guarantee holds absolutely and the tooltips say so out loud: terrain
// editing is free, unlimited and reversible, on the same 64-step undo stack as
// everything else. There is no terraforming cost and there never will be.
//
// The contract with js/input.js, which owns the pointer:
//   ui.tool()             -> 'place' | 'raze' | 'raise' | 'lower' | 'level'
//   ui.isTerrainTool()    -> true for the three below
//   ui.selectTool(id)     -> set it (and clear any placeable selection)
//   on.tool(id)           -> fired on every change
//   ui.setGhost({ mode: <tool id>, tx, ty, w, h, legal })  during a drag

export const TERRAIN_TOOLS = Object.freeze([
  Object.freeze({
    id: 'raise',
    label: 'Raise',
    key: 'R',
    hint: 'Drag to lift the ground a level. Anything standing on it rides up with it. Free, and undoable.',
  }),
  Object.freeze({
    id: 'lower',
    label: 'Lower',
    key: 'F',
    hint: 'Drag to drop the ground a level. Water above a drop becomes a waterfall on its own.',
  }),
  Object.freeze({
    id: 'level',
    label: 'Level',
    key: 'G',
    hint: 'Drag out a region and it flattens to the height of the first tile you touched.',
  }),
]);
const TERRAIN_TOOL_IDS = TERRAIN_TOOLS.map((t) => t.id);

// --------------------------------------------------------------------------
// AFFINITY — the glyph, and the words
// --------------------------------------------------------------------------
// docs/DECOR.md fixes the numbering and never changes it:
//
//     1 = satyr   2 = centaur   3 = naiad   4 = unicorn
//
// A player must be able to tell a 1,3 item from a 1 item AT A GLANCE, which
// rules out text: "1,3" and "1" are two glyphs of nearly the same shape at 8px
// and the eye does not read a palette button, it recognises it.
//
// So the glyph is a four-column bar chart, one column per creature, ALWAYS IN
// THE SAME ORDER, and it encodes both facts at once:
//
//     WHICH creature   the column's position, and its colour
//     HOW STRONGLY     the bar's height — and because DECOR.md makes breadth
//                      cost strength (single 1.0, dual 0.7, triple 0.5), a
//                      single is a tall lone bar and a triple is three short
//                      ones. The player sees "commits this ground" versus
//                      "argues for three of them" without being told.
//
// An affinity of zero is a single dark pixel on the baseline, not a blank: the
// four columns must always be four columns or the positions stop meaning
// anything. A negative lean (DECOR.md Part II — a fluted neoclassical piece
// mildly repels the satyr) is a mark BELOW the baseline in the blossom accent.
// A nullifier is not bars at all: it is a bar across all four columns, which is
// a picture of a wall, and a wall is exactly what it does.

const AFFINITY_ORDER = ['satyr', 'centaur', 'naiad', 'unicorn'];
const AFFINITY_INK = {
  satyr: RAMPS.olive.hex[3], // '#8A8B52' — dry, tussocky, unkempt
  centaur: RAMPS.grass.hex[3], // '#96A551' — open coarse running turf
  naiad: RAMPS.water.hex[3], // '#3E9A98' — lush wet green going blue
  unicorn: ACCENT['7'], // '#F2EADA' — fine, pale, silvery
};
const AFFINITY_NAME = { satyr: 'satyr', centaur: 'centaur', naiad: 'naiad', unicorn: 'unicorn' };
const AFFINITY_OFF = RAMPS.rock.hex[1]; // '#474138' — present, unlit, not blank
const AFFINITY_AGAINST = ACCENT['1']; // '#8E1F2A' — a lean that repels

/** The grass each affinity paints, for the journal picture. */
const GRASS_INK = {
  meadow: RAMPS.grass.hex[2], // '#74863C' ordinary green
  thicket: RAMPS.olive.hex[3],
  sward: RAMPS.grass.hex[3],
  fen: RAMPS.water.hex[3],
  millefleurs: ACCENT['7'],
};
const GRASS_SHADE = {
  meadow: RAMPS.grass.hex[0],
  thicket: RAMPS.olive.hex[1],
  sward: RAMPS.grass.hex[1],
  fen: RAMPS.water.hex[1],
  millefleurs: RAMPS.marble.hex[2],
};

/** Glyph geometry, in logical pixels. Whole numbers only — SPEC §2. */
const GLYPH_COL = 3;
const GLYPH_GAP = 1;
const GLYPH_W = AFFINITY_ORDER.length * GLYPH_COL + (AFFINITY_ORDER.length - 1) * GLYPH_GAP; // 15
const GLYPH_H = 8;
const GLYPH_BASE = 6; // the baseline row; row 7 is the below-baseline mark

/** Bar height for a weight. Bands, not a scale — DECOR.md's three classes. */
function glyphBars(weight) {
  const w = Math.abs(weight);
  if (w >= 0.9) return 6; // single — commits the ground
  if (w >= 0.6) return 4; // dual — a swing voter
  if (w >= 0.4) return 3; // triple — a junction piece
  if (w > 0) return 2; // a lean
  return 0;
}

/**
 * Read a placeable's affinities as `{ satyr, centaur, naiad, unicorn }`.
 * Accepts the catalogue's authored weight object, the array shorthand, and the
 * numeric shorthand of DECOR.md ([1,3]). Never throws on a shape it has not
 * seen — an unreadable item simply has no glyph.
 */
export function affinityOf(item) {
  const out = {};
  if (!item) return out;
  const raw = item.affinities || item.affinity || null;
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    for (const id of AFFINITY_ORDER) {
      const v = Number(raw[id]);
      if (Number.isFinite(v) && v !== 0) out[id] = v;
    }
    return out;
  }
  if (Array.isArray(raw)) {
    const ids = [];
    for (const a of raw) {
      const id = typeof a === 'number' ? AFFINITY_ORDER[a - 1] : String(a);
      if (AFFINITY_ORDER.includes(id) && !ids.includes(id)) ids.push(id);
    }
    const w = ids.length === 1 ? 1 : ids.length === 2 ? 0.7 : ids.length === 3 ? 0.5 : 0.35;
    for (const id of ids) out[id] = w;
  }
  return out;
}

/** Does this item block influence rather than emit it? */
export function isNullifier(item) {
  if (!item) return false;
  if (item.blocks !== undefined && item.blocks !== null) return item.blocks !== false;
  if (item.nullifier !== undefined && item.nullifier !== null) return item.nullifier !== false;
  if (item.zoneClass === 'nullifier') return true;
  return (item.tags || []).includes('nullifier');
}

/**
 * The affinity glyph, as a canvas. 15x8 logical pixels, drawn 1:1 and scaled by
 * whole numbers through `--u` like everything else in the chrome.
 */
export function affinityGlyph(item) {
  const cv = blank(GLYPH_W, GLYPH_H);
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const nul = isNullifier(item);
  const aff = affinityOf(item);

  if (nul) {
    // A wall, drawn as a wall: one unbroken course across every column.
    ctx.fillStyle = RAMPS.rock.hex[3];
    ctx.fillRect(0, GLYPH_BASE - 2, GLYPH_W, 2);
    ctx.fillStyle = RAMPS.rock.hex[1];
    ctx.fillRect(0, GLYPH_BASE, GLYPH_W, 1);
  } else {
    AFFINITY_ORDER.forEach((id, i) => {
      const x = i * (GLYPH_COL + GLYPH_GAP);
      const w = aff[id] || 0;
      if (w > 0) {
        const h = glyphBars(w);
        ctx.fillStyle = AFFINITY_INK[id];
        ctx.fillRect(x, GLYPH_BASE + 1 - h, GLYPH_COL, h);
      } else if (w < 0) {
        ctx.fillStyle = AFFINITY_OFF;
        ctx.fillRect(x, GLYPH_BASE, GLYPH_COL, 1);
        ctx.fillStyle = AFFINITY_AGAINST;
        ctx.fillRect(x, GLYPH_BASE + 2, GLYPH_COL, 1);
      } else {
        // Unlit, never absent. Four columns must always be four columns.
        ctx.fillStyle = AFFINITY_OFF;
        ctx.fillRect(x, GLYPH_BASE, GLYPH_COL, 1);
      }
    });
  }
  cv.classList.add('pixels');
  cv.style.width = `calc(${GLYPH_W} * var(--u))`;
  cv.style.height = `calc(${GLYPH_H} * var(--u))`;
  return cv;
}

/**
 * The same fact in words, for the info box, the tooltip and the screen reader.
 * The glyph is for the eye; this is for everything else, and a player who
 * cannot read the glyph is never worse off than one who can.
 */
export function affinityWords(item) {
  if (isNullifier(item)) return 'Breaks the chain — nothing spreads through it.';
  const aff = affinityOf(item);
  const forIds = AFFINITY_ORDER.filter((id) => (aff[id] || 0) > 0);
  const againstIds = AFFINITY_ORDER.filter((id) => (aff[id] || 0) < 0);
  const bits = [];
  if (forIds.length) {
    const strength =
      forIds.length === 1 ? 'Ground for the' : forIds.length === 2 ? 'Shared ground:' : 'A junction:';
    bits.push(`${strength} ${listWords(forIds.map((id) => AFFINITY_NAME[id]))}.`);
  }
  if (againstIds.length) {
    bits.push(`The ${listWords(againstIds.map((id) => AFFINITY_NAME[id]))} will not have it.`);
  }
  if (!bits.length) return 'Takes no side. Put it wherever it looks right.';
  return bits.join(' ');
}

function listWords(list) {
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

// --------------------------------------------------------------------------
// THE GROUND PICTURE
// --------------------------------------------------------------------------
// docs/ZONING.md, on the journal, and it is the one rule in this file that is a
// refusal rather than a format:
//
//     exact ticks for counts, qualitative words for conditions, and the
//     required grass patch shown AS A PICTURE rather than a number.
//
// So this draws the patch: little iso diamonds in the grass's own colour, the
// ones you have filled in and the ones you still want as empty outlines, in the
// compact clump shape creatures.js generated. It is deliberately NOT "7 of 9".
//
// The reason is not squeamishness about numbers — the counts above it are exact
// to the unit. It is that a patch is a SHAPE and a shape is not a quantity. Two
// gardens of nine tiles can be a lawn and a corridor, and the number is the one
// thing that cannot tell you which you built. The picture can, because it is
// the same kind of thing as the answer.
//
// Diamonds are 8x4 at 2:1, the same proportion as the 64x32 map tile, so the
// picture reads as a scrap of the garden seen from the same angle.

const PIC_W = 8;
const PIC_H = 4;

/**
 * `picture` is `{ w, h, need, cells:[{x,y,filled}] }` from creatures.js
 * `patchPicture()`. `grass` names the type, for colour.
 */
export function groundPicture(picture, grass) {
  const cells = (picture && picture.cells) || [];
  const gw = (picture && picture.w) || 1;
  const gh = (picture && picture.h) || 1;
  // Iso bounds: x runs (cx - cy), y runs (cx + cy).
  const spanX = (gw - 1 + (gh - 1)) * (PIC_W / 2) + PIC_W;
  const spanY = (gw - 1 + (gh - 1)) * (PIC_H / 2) + PIC_H;
  const ox = (gh - 1) * (PIC_W / 2);
  const cv = blank(Math.max(1, spanX), Math.max(1, spanY));
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const ink = GRASS_INK[grass] || GRASS_INK.meadow;
  const shade = GRASS_SHADE[grass] || GRASS_SHADE.meadow;

  for (const c of cells) {
    const px = ox + (c.x - c.y) * (PIC_W / 2);
    const py = (c.x + c.y) * (PIC_H / 2);
    diamond(ctx, Math.round(px), Math.round(py), c.filled ? ink : null, shade);
  }
  cv.classList.add('pixels');
  cv.style.width = `calc(${cv.width} * var(--u))`;
  cv.style.height = `calc(${cv.height} * var(--u))`;
  return cv;
}

/**
 * One 8x4 diamond, by the same rule the 64x32 ghost tile uses: row `y` spans
 * `[c - 2k, c + 1 + 2k]` with `k` counting in from whichever half `y` is in.
 * Rows come out 2, 6, 6, 2 — a true 2:1 diamond with clean 2-across-1-down
 * edges, which is the only proportion allowed anywhere in this game.
 *
 * `fill` null draws the outline only: a tile the patch still wants.
 */
function diamond(ctx, x, y, fill, edge) {
  const half = PIC_H / 2;
  const c = PIC_W / 2 - 1; // 3
  for (let r = 0; r < PIC_H; r++) {
    const k = r < half ? r : PIC_H - 1 - r;
    const x0 = c - 2 * k;
    const x1 = c + 1 + 2 * k;
    for (let px = x0; px <= x1; px++) {
      if (fill) {
        // Solid, with NO seam. Adjacent filled tiles merge into one mass, which
        // is the whole sentence the picture is illustrating: "enough thicket,
        // and ALL OF A PIECE". Outlining each diamond would draw nine tiles
        // where the requirement is one patch.
        ctx.fillStyle = fill;
        ctx.fillRect(x + px, y + r, 1, 1);
        continue;
      }
      // Still wanted: the outline only, so the shape of what is missing is
      // visible without competing with the ground you have.
      if (px !== x0 && px !== x1 && r !== 0 && r !== PIC_H - 1) continue;
      ctx.fillStyle = edge;
      ctx.fillRect(x + px, y + r, 1, 1);
    }
  }
}

/** The five grasses, in the journal's voice. Mirrors creatures.js GRASS_PHRASE. */
const GRASS_WORD = {
  meadow: 'plain meadow',
  thicket: 'thicket',
  sward: 'open sward',
  fen: 'wet fen',
  millefleurs: 'flowered turf',
};

// --------------------------------------------------------------------------
// THE TOMBS  (docs/TOMBS.md)
// --------------------------------------------------------------------------
// Three player-facing jobs land in this file, and one seam that should not.
//
//   * THE EPITAPH, on hover and in the journal. Every tomb takes one on
//     placement, drawn without repeat from the curated list in catalog.js.
//   * THE HIDDEN TOMB. The Arcadian tomb is not in the build menu. It is
//     found — and when it is found NOTHING HAPPENS: no toast, no cue, no
//     journal line, no announcement to the screen reader. A button appears on
//     the Statuary tab and that is the entire event. A player who never finds
//     it loses nothing, and a player who does should feel they noticed rather
//     than that they were told.
//   * THE TENDING READOUT, which says what a grave has and never what it
//     lacks. A neglected grave is a smaller gift, not a fault, and the words
//     have to carry that or the mechanic reads as a chore.
//
// And the seam, named out loud: `retendTombs` is driven from this module's
// quarter-second tick because js/main.js — which owns the field bridge and
// already subscribes to every world edit — belongs to another owner this wave.
// The chrome should not be reconciling a scalar field. When main.js next opens,
// move the one call in `tombTick` beside the bridge's `grow` case and delete
// the rest of this paragraph with it.

/**
 * The journal's one non-creature page.
 *
 * A plain hyphenated token, because this string goes into `data-id` and comes
 * back out through a `[data-id="..."]` selector on every arrow-key press. Take
 * one tried to guarantee it could never collide with a creature id by putting
 * an unprintable character in front of it; the round trip mangled that, so the
 * page could be listed and never selected. No creature is called `the-stones`.
 */
const STONES = 'the-stones';

/** Where the discovery is remembered. world.extra is world.js's declared
 *  opaque passenger for other owners, and it round-trips through the save. */
const TOMB_SAVE_KEY = 'tombs';

const RUNG_LABEL = {
  unknown: 'Not yet seen',
  sighted: 'Sighted',
  visits: 'Visits at dusk',
  settles: 'Settled here',
  thrives: 'Thriving',
};
const WANT_LABEL = {
  sighted: 'to be seen at all',
  visits: 'to come and look',
  settles: 'to stay',
  thrives: 'to thrive',
};

// --------------------------------------------------------------------------
// createUI
// --------------------------------------------------------------------------

/**
 * createUI(opts) -> ui
 *
 * Every option is optional. main.js passes
 *   { root, canvas, game, world, fields, creatures, catalog, renderer, audio,
 *     reducedMotion }
 * and this constructor reads all of those. The extra names are for standalone
 * use (tools/spritelab, the preview boot in index.html):
 *
 *   root / mount   where the chrome goes. Default `#ui`.
 *   canvas         the 640x400 canvas. Default `#screen`.
 *   catalog        Array of placeables (SPEC §5). Alias: `placeables`.
 *   creatures      the Bestiary (anything with `cards()`), or a plain array.
 *   renderer       anything with `setGhost` / `setOverlay`. Alias: game.renderer.
 *   world          used for `canPlace()`, so the ghost can explain itself.
 *   game           main.js's game object; `game.undo()` is the undo button.
 *   icon           (item) => HTMLCanvasElement | null  — palette button art.
 *   portrait       (card, { silhouette }) => HTMLCanvasElement | null.
 *   daySeconds     garden seconds per day for the readout. Default 480.
 *   on             { select, tool, overlay, group, undo, journal } callbacks.
 */
export function createUI(opts = {}) {
  const game = opts.game || null;
  const canvas = opts.canvas || (game && game.canvas) || document.getElementById('screen');
  const mount =
    opts.mount ||
    (opts.root && opts.root.id === 'ui' ? opts.root : null) ||
    document.getElementById('ui') ||
    opts.root;
  if (!mount) throw new Error('createUI: nowhere to mount (expected #ui)');
  const on = opts.on || {};
  const app = document.getElementById('app') || mount.parentElement || document.body;

  const bestiary =
    opts.creatures && typeof opts.creatures.cards === 'function' ? opts.creatures : null;
  const daySeconds = opts.daySeconds > 0 ? opts.daySeconds : DAY_SECONDS;

  const S = {
    world: opts.world || (game && game.world) || null,
    renderer: opts.renderer || (game && game.renderer) || null,
    placeables: normaliseCatalog(opts.placeables || opts.catalog || (game && game.catalog)),
    cards: [],
    unlocked: null, // null = everything available
    group: null,
    selectedId: null,
    tool: 'place',
    overlay: null,
    journal: false,
    journalPick: null,
    ghost: null,
    time: null,
    cardClock: 0,
    toastTimer: 0,
    lastFocus: null,
    // docs/TOMBS.md
    found: new Set(), // hidden placeables the glade has turned up
    hydrated: false,
    tombKey: '', // the uids currently on the map, as one string
    tombEpitaphs: new Map(),
    hoverUid: null,
  };

  function normaliseCatalog(c) {
    if (Array.isArray(c)) return c.slice();
    if (c && Array.isArray(c.items)) return c.items.slice();
    if (c && typeof c === 'object') {
      const vals = Object.values(c).filter((v) => v && typeof v === 'object' && v.id);
      if (vals.length) return vals;
    }
    return [];
  }

  // ---------------------------------------------------------------- topbar --

  const bar = el('div', 'bar');
  const timeOut = el('span', 'bar-time', '');
  const overlayName = el('span', 'bar-overlay', '');
  const barRight = el('div', 'bar-right');

  const btnJournal = btn('bar-btn', 'Journal', () => toggleJournal(), 'Journal (J)');
  btnJournal.setAttribute('aria-haspopup', 'dialog');
  const btnField = btn('bar-btn', 'Field', () => cycleOverlay(1), 'Field overlay (Tab)');
  btnField.setAttribute('aria-pressed', 'false');
  const btnRaze = btn('bar-btn', 'Clear', () => toggleTool('raze'), 'Clear a tile (B)');
  btnRaze.setAttribute('aria-pressed', 'false');
  const btnUndo = btn('bar-btn', 'Undo', () => doUndo(), 'Undo (Ctrl+Z)');

  barRight.append(btnJournal, btnField, btnRaze, btnUndo);
  bar.append(timeOut, overlayName, barRight);

  function doUndo() {
    let r;
    if (typeof on.undo === 'function') r = on.undo();
    else if (game && typeof game.undo === 'function') r = game.undo();
    else r = ask(S.world, 'undo');
    say(r ? 'Undone.' : 'Nothing left to undo.');
    return r;
  }

  // --------------------------------------------------------------- overlay --

  const legend = el('div', 'legend');
  legend.hidden = true;
  const legendTitle = el('div', 'legend-title', '');
  const legendRamp = el('div', 'legend-ramp');
  const legendScale = el('div', 'legend-scale');
  legendScale.append(el('span', null, 'less'), el('span', null, 'more'));
  legend.append(legendTitle, legendRamp, legendScale);

  // ----------------------------------------------------------------- toast --

  const toast = el('div', 'toast');
  toast.hidden = true;

  const liveRegion = el('div', 'sr-only');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');

  // ----------------------------------------------------------------- panel --

  const panel = el('div', 'panel');
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'What to plant and build');

  const grid = el('div', 'grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Things to place');
  grid.id = 'arcadia-grid';

  const info = el('div', 'info');
  const infoName = el('div', 'info-name', 'Arcadia');
  const infoBlurb = el('div', 'info-blurb', '');
  info.append(infoName, infoBlurb);

  panel.append(tabs, grid, info);

  // --------------------------------------------------------------- journal --

  const journal = el('div', 'journal');
  journal.hidden = true;
  journal.setAttribute('role', 'dialog');
  journal.setAttribute('aria-modal', 'true');
  journal.setAttribute('aria-label', 'Journal');
  const jTitle = el('div', 'journal-title', 'Journal');
  const jClose = btn('journal-close', 'X', () => closeJournal(), 'Close (Esc)');
  jClose.setAttribute('aria-label', 'Close journal');
  const jList = el('div', 'journal-list');
  jList.setAttribute('role', 'list');
  const jCard = el('div', 'journal-card');
  journal.append(jTitle, jClose, jList, jCard);

  mount.append(bar, legend, toast, panel, journal, liveRegion);

  // ------------------------------------------------------------- the palette --

  function groups() {
    const seen = [];
    for (const g of GROUP_ORDER) if (S.placeables.some((p) => p.group === g)) seen.push(g);
    for (const p of S.placeables) if (p.group && !seen.includes(p.group)) seen.push(p.group);
    return seen;
  }

  function isUnlocked(item) {
    if (!S.unlocked) return true;
    return S.unlocked.has ? S.unlocked.has(item.id) : S.unlocked.includes(item.id);
  }

  /**
   * A hidden placeable is not shown AT ALL — no chip, no empty slot, no name.
   *
   * That is the difference between `hidden` and `unlockedBy`, and it is the
   * whole design of the Arcadian tomb. A creature-gated item shows a blank
   * "- - -" chip on purpose, because an undiscovered slot is a promise rather
   * than a debt (RESEARCH §C2). This one must make no promise: a grey slot
   * labelled nothing, sitting on the Statuary tab from the first minute, would
   * tell the player there is a thing to find, and the thing to find is that
   * there is a thing to find.
   */
  function isHidden(item) {
    return item && item.hidden === true && !S.found.has(item.id);
  }

  function buildTabs() {
    tabs.textContent = '';
    const gs = groups();
    if (S.group == null || !gs.includes(S.group)) S.group = gs[0] || null;
    gs.forEach((g, i) => {
      const t = btn('tab', GROUP_LABEL[g] || cap(g), () => selectGroup(g));
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-controls', 'arcadia-grid');
      t.setAttribute('aria-selected', String(g === S.group));
      t.tabIndex = g === S.group ? 0 : -1;
      t.dataset.group = g;
      t.title = `${GROUP_LABEL[g] || cap(g)} (${i + 1})`;
      t.addEventListener('keydown', (ev) => {
        const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        ev.preventDefault();
        const list = groups();
        const at = (list.indexOf(S.group) + d + list.length) % list.length;
        selectGroup(list[at]);
        const next = tabs.querySelector(`[data-group="${list[at]}"]`);
        if (next) next.focus();
      });
      tabs.append(t);
    });
  }

  /**
   * The three terrain verbs, as chips at the head of the `Land` tab.
   *
   * They are built exactly like placeable buttons — same bevel, same size, same
   * keyboard walk — because to the player they ARE the same kind of thing: you
   * pick one and then you click the map. Making them look like a different
   * class of control would be a lie about how they are used.
   */
  function terrainChip(tool) {
    const on = S.tool === tool.id;
    const b = el('button', 'item' + (on ? ' is-on' : ''));
    b.type = 'button';
    b.dataset.tool = tool.id;
    b.setAttribute('aria-pressed', String(on));
    b.tabIndex = on ? 0 : -1;

    const chip = el('div', 'item-chip');
    chip.style.position = 'relative';
    chip.append(terrainIcon(tool.id));
    b.classList.add('has-icon');

    b.append(chip, el('div', 'item-label', tool.label));
    b.title = `${tool.label} the land (${tool.key})`;
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => selectTool(tool.id));
    b.addEventListener('pointerenter', () => showToolInfo(tool));
    b.addEventListener('focus', () => showToolInfo(tool));
    b.addEventListener('pointerleave', () => showInfo(null));
    b.addEventListener('blur', () => showInfo(null));
    b.addEventListener('keydown', onGridKey);
    return b;
  }

  /**
   * A tiny picture of what the verb does to a cross-section of ground: two
   * stacked terrace steps and an arrow. Drawn rather than lettered, because a
   * toolbar is recognised and not read.
   */
  function terrainIcon(id) {
    const w = CHIP_W;
    const h = 21;
    const cv = blank(w, h);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // The same cube the map draws, at a sixteenth of the size: a 2:1 diamond
    // top with two vertical faces under it, lit from the upper left. Top gets
    // the grass ramp's lightest step, the left face one step down, the right
    // face two — the shading law of SPEC §3, obeyed at 16 pixels because a
    // toolbar icon that lights differently from the world is a tell.
    const TOP = RAMPS.grass.hex[3];
    const LEFT = RAMPS.earth.hex[2];
    const RIGHT = RAMPS.earth.hex[1];
    const DW = 16; // diamond width
    const DH = 8; // diamond height — exactly 2:1

    /** One flat-topped cube, `x` at its left vertex, `y` at its top vertex. */
    const cube = (x, y, depth) => {
      for (let r = 0; r < DH; r++) {
        const k = r < DH / 2 ? r : DH - 1 - r;
        const x0 = DW / 2 - 1 - 2 * k;
        const x1 = DW / 2 + 2 * k;
        ctx.fillStyle = TOP;
        ctx.fillRect(x + x0, y + r, x1 - x0 + 1, 1);
      }
      // The two vertical faces, hanging off the diamond's lower edges: for
      // each column the face starts where the diamond's silhouette ends, so
      // the cube has no seam and no notch at the side vertices.
      for (let c = 0; c < DW; c++) {
        const k = c < DW / 2 ? c : DW - 1 - c;
        const yTop = y + DH - 1 - Math.floor(k / 2);
        ctx.fillStyle = c < DW / 2 ? LEFT : RIGHT;
        ctx.fillRect(x + c, yTop, 1, depth);
      }
    };

    const lowY = 9;
    const step = 4; // one level of rise, at icon scale
    const leftX = 2;
    const rightX = 2 + DW + 2;
    if (id === 'level') {
      cube(leftX, lowY, 5);
      cube(rightX, lowY, 5);
    } else if (id === 'raise') {
      cube(leftX, lowY, 5);
      cube(rightX, lowY - step, 5 + step);
    } else {
      cube(leftX, lowY - step, 5 + step);
      cube(rightX, lowY, 5);
    }

    // The verb, in gold, over the block that moves. Gold reads first — the
    // player is picking a VERB and the ground is only there to explain it.
    ctx.fillStyle = RAMPS.gold.hex[3];
    const ax = rightX + DW / 2;
    if (id === 'raise') {
      ctx.fillRect(ax, 0, 1, 5);
      for (let i = 0; i < 3; i++) ctx.fillRect(ax - i, 1 + i, 1 + i * 2, 1);
    } else if (id === 'lower') {
      const bx = leftX + DW / 2;
      ctx.fillRect(bx, 0, 1, 5);
      for (let i = 0; i < 3; i++) ctx.fillRect(bx - 2 + i, 3 + i, 5 - i * 2, 1);
    } else {
      ctx.fillRect(2, 2, w - 6, 1);
      ctx.fillRect(2, 4, w - 6, 1);
    }
    cv.classList.add('pixels');
    cv.style.width = `calc(${w} * var(--u))`;
    cv.style.height = `calc(${h} * var(--u))`;
    return cv;
  }

  function showToolInfo(tool) {
    infoName.textContent = `${tool.label} the land`;
    infoBlurb.textContent = tool.hint;
  }

  function buildGrid() {
    grid.textContent = '';
    const items = S.placeables.filter((p) => p.group === S.group && !isHidden(p));
    // ELEVATION.md's editing verbs live at the head of the Land tab, in front
    // of the connectors — the earth ramp, the stone stair, the rock scramble —
    // because you cut a terrace and then you build the way up it.
    if (S.group === 'terrain') for (const t of TERRAIN_TOOLS) grid.append(terrainChip(t));
    if (!items.length) {
      if (S.group !== 'terrain') grid.append(el('div', 'grid-empty', 'Nothing here yet.'));
      return;
    }
    for (const item of items) {
      const unlocked = isUnlocked(item);
      const b = el('button', 'item' + (unlocked ? '' : ' item-locked'));
      b.type = 'button';
      b.dataset.id = item.id;
      b.setAttribute('aria-pressed', String(S.selectedId === item.id));
      b.tabIndex = S.selectedId === item.id ? 0 : -1;

      const chip = el('div', 'item-chip');
      chip.style.position = 'relative';
      let icon = null;
      if (unlocked && typeof opts.icon === 'function') {
        try {
          const src = artCanvas(opts.icon(item));
          if (src) icon = chipCanvas(src, CHIP_W, CHIP_H);
        } catch (_) {
          icon = null;
        }
      }
      if (icon) {
        // With a picture the name is a reminder, so one clipped line is plenty.
        b.classList.add('has-icon');
        chip.append(icon);
      } else {
        // Without one the name is the only thing identifying the button, so it
        // gets the room instead: a short chip and two wrapped lines.
        chip.style.background = unlocked
          ? GROUP_SWATCH[item.group] || RAMPS.rock.hex[2]
          : RAMPS.rock.hex[0];
      }

      // THE AFFINITY GLYPH, pinned to the bottom-right of the chip on a dark
      // plate so it holds against any sprite behind it. Only on things you
      // have: an undiscovered slot must not leak whose ground it would grow.
      const words = unlocked ? affinityWords(item) : '';
      if (unlocked && (Object.keys(affinityOf(item)).length || isNullifier(item))) {
        const plate = el('div', 'aff-plate');
        plate.style.position = 'absolute';
        plate.style.right = '0';
        plate.style.bottom = '0';
        plate.style.background = RAMPS.rock.hex[0];
        plate.style.padding = 'calc(1 * var(--u))';
        plate.style.lineHeight = '0';
        plate.setAttribute('aria-hidden', 'true');
        plate.append(affinityGlyph(item));
        chip.append(plate);
      }

      // An undiscovered slot is a promise, not a debt (RESEARCH §C2) — it is
      // shown, empty and unnamed, rather than hidden.
      const label = el('div', 'item-label', unlocked ? item.name || item.id : '- - -');
      b.append(chip, label);
      b.title = unlocked ? `${item.name || item.id}${words ? ' — ' + words : ''}` : 'Not yet discovered';
      b.setAttribute('aria-label', b.title);

      if (unlocked) {
        b.addEventListener('click', () => selectItem(item.id));
        b.addEventListener('pointerenter', () => showInfo(item));
        b.addEventListener('focus', () => showInfo(item));
        b.addEventListener('pointerleave', () => showInfo(null));
        b.addEventListener('blur', () => showInfo(null));
        b.addEventListener('keydown', onGridKey);
      } else {
        b.disabled = true;
      }
      grid.append(b);
    }
    if (!grid.querySelector('[tabindex="0"]')) {
      const first = grid.querySelector('.item:not([disabled])');
      if (first) first.tabIndex = 0;
    }
  }

  function onGridKey(ev) {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: GRID_COLS, ArrowUp: -GRID_COLS }[ev.key];
    if (!step) return;
    ev.preventDefault();
    const list = [...grid.querySelectorAll('.item:not([disabled])')];
    const at = list.indexOf(ev.currentTarget);
    const next = list[Math.max(0, Math.min(list.length - 1, at + step))];
    if (!next) return;
    list.forEach((n) => {
      n.tabIndex = -1;
    });
    next.tabIndex = 0;
    next.focus();
  }

  function showInfo(item) {
    const shown = item || S.placeables.find((p) => p.id === S.selectedId) || null;
    if (!shown) {
      const tool = TERRAIN_TOOLS.find((t) => t.id === S.tool);
      if (tool) {
        showToolInfo(tool);
        return;
      }
      infoName.textContent = S.tool === 'raze' ? 'Clear' : 'Arcadia';
      infoBlurb.textContent =
        S.tool === 'raze'
          ? 'Click a tile to take it away again. Nothing is ever lost, and putting it back costs nothing.'
          : 'Pick a category, then a thing to plant. Right-click takes it back. Tab washes the map with a habitat field.';
      return;
    }
    infoName.textContent = shown.name || shown.id;
    // The blurb first, then whose ground it grows — the glyph on the button
    // said it at a glance, and this says the same thing in the same words the
    // journal will use, so the vocabulary is learned once (RESEARCH §C5).
    const words = affinityWords(shown);
    infoBlurb.textContent = words ? `${shown.blurb || ''} ${words}`.trim() : shown.blurb || '';
  }

  // ------------------------------------------------------------- the tombs --

  /**
   * Every tomb standing in the glade, with its epitaph.
   *
   * The epitaphs are re-derived whenever the SET of tombs changes, from
   * catalog.js's pure allocator, rather than being handed out once and kept.
   * world.js does not store an epitaph on the object, so anything stateful here
   * would give a grave a different verse after every reload — and a verse that
   * changes when you look away is worse than no verse.
   */
  function tombs() {
    const world = S.world;
    const objs = (world && world.objects) || [];
    const out = [];
    for (const obj of objs) {
      const def = catalogById(obj.id);
      if (isTomb(def)) out.push({ obj, def });
    }
    const key = out.map((e) => e.obj.uid).join(',');
    if (key !== S.tombKey) {
      S.tombKey = key;
      S.tombEpitaphs = epitaphsFor(out.map((e) => e.obj.uid));
    }
    return out;
  }

  /**
   * What a grave has, never what it lacks.
   *
   * Both sentences are gifts. docs/TOMBS.md is explicit that a neglected tomb
   * "is never a penalty, only a smaller gift", and if the words say "neglected"
   * or "untended" the player hears a chore however the arithmetic works. So the
   * neglected line leads with what the grave IS still doing.
   */
  function tendingWords(tended) {
    return tended
      ? 'Somebody has been leaving things here. The ground round it has taken it in.'
      : 'Nothing left here lately. It still makes this ground old — it would make it older.';
  }

  /**
   * The hover readout, for a tomb standing in the world.
   *
   * input.js only sends `setGhost` when something is selected, so a player just
   * looking at their garden hands this module nothing. Rather than ask another
   * owner's file for a new callback, the pointer is read here: the renderer
   * already exposes `pickTile(clientX, clientY)`, which is the one answer that
   * agrees with what was actually drawn, and everything is guarded so a host
   * without a renderer simply has no tomb tooltips.
   */
  function onHover(ev) {
    if (S.journal || !S.world) return;
    const t = ask(S.renderer, 'pickTile', ev.clientX, ev.clientY);
    let hit = null;
    if (t && Number.isFinite(t.tx)) {
      const obj = ask(S.world, 'objectAt', t.tx, t.ty);
      const def = obj ? catalogById(obj.id) : null;
      if (isTomb(def)) hit = { obj, def };
    }
    const uid = hit ? hit.obj.uid : null;
    if (uid === S.hoverUid) return;
    S.hoverUid = uid;
    if (!hit) {
      showInfo(null);
      return;
    }
    tombs(); // refresh the epitaph map if the set has changed under us
    const epitaph = S.tombEpitaphs.get(hit.obj.uid);
    infoName.textContent = hit.def.name;
    let tended = false;
    try {
      tended = tombTended(S.world, hit.obj, hit.def);
    } catch (_) {
      tended = false;
    }
    infoBlurb.textContent = `${epitaph ? `“${epitaph}” ` : ''}${tendingWords(tended)}`;
  }

  /**
   * Once a quarter second: keep the tending honest, and see whether the glade
   * has turned the Arcadian tomb up.
   *
   * NOTHING IS ANNOUNCED. No toast, no audio cue, no live-region message, no
   * journal entry. The palette is rebuilt and a button is there. That silence
   * is the feature.
   */
  function tombTick(g) {
    const world = (g && g.world) || S.world;
    if (!world) return;
    if (!S.hydrated) {
      S.hydrated = true;
      const saved = world.extra && world.extra[TOMB_SAVE_KEY];
      if (saved && Array.isArray(saved.found)) for (const id of saved.found) S.found.add(id);
    }
    const fields = (g && g.fields) || opts.fields || null;
    if (fields) {
      try {
        retendTombs(world, fields);
      } catch (err) {
        console.warn('[ui] tending pass threw', err);
      }
    }
    if (S.found.has(ARCADIAN_UNLOCK.id)) return;
    if (!fields || typeof fields.at !== 'function') return;
    let found = false;
    try {
      // The ring outside the grave, not the grave's own square — a tomb is a
      // nullifier and nothing can propagate into it. catalog.js does the
      // walking; this only has to be able to read a tile.
      found = arcadianTombFound(world, (tx, ty) => fields.at('maturity', tx, ty));
    } catch (_) {
      found = false;
    }
    if (!found) return;
    // Once found, never un-found. SPEC §0's promise about journal entries is
    // the same promise, and it applies here even though the conditions that
    // opened it could later stop holding.
    S.found.add(ARCADIAN_UNLOCK.id);
    if (world.extra && typeof world.extra === 'object') {
      world.extra[TOMB_SAVE_KEY] = { found: [...S.found] };
      // main.js only autosaves a garden it has been told changed, and writing
      // into world.extra behind its back is not a change it can see.
      ask(g, 'markDirty');
    }
    buildGrid();
    syncPressed();
  }

  /** The ghost's refusal, in world.js's own warm words, under the cursor. */
  function showRefusal(reason) {
    if (!reason) {
      showInfo(null);
      return;
    }
    infoBlurb.textContent = reason;
  }

  // ------------------------------------------------------------- selection --

  function selectGroup(g) {
    S.group = g;
    buildTabs();
    buildGrid();
    if (on.group) on.group(g);
  }

  function selectGroupIndex(i) {
    const gs = groups();
    if (i < 0 || i >= gs.length) return;
    selectGroup(gs[i]);
    announce(GROUP_LABEL[gs[i]] || cap(gs[i]));
  }

  function selectItem(id) {
    const item = S.placeables.find((p) => p.id === id) || null;
    if (item && !isUnlocked(item)) return;
    // A restored toolbar must not hand back a placeable the glade has not found
    // — a save written after the discovery, opened in a garden that has not
    // made it, would otherwise put the Arcadian tomb in the player's hand.
    if (item && isHidden(item)) return;
    S.selectedId = item ? item.id : null;
    if (item) S.tool = 'place';
    syncPressed();
    showInfo(item);
    if (on.select) on.select(S.selectedId, item);
    if (item) announce(`${item.name || item.id} selected`);
  }

  function clearSelection() {
    if (!S.selectedId && S.tool === 'place') return;
    S.selectedId = null;
    S.tool = 'place';
    setGhost(null);
    syncPressed();
    showInfo(null);
    if (on.select) on.select(null, null);
    announce('Nothing selected');
  }

  const TOOL_SAID = {
    place: 'Placing',
    raze: 'Clearing',
    raise: 'Raising the land',
    lower: 'Lowering the land',
    level: 'Levelling the land',
  };

  /**
   * Set a tool outright. Any tool other than `place` drops the selected
   * placeable, because holding a plant while dragging a terrace up is a state
   * with two answers to "what does a click do".
   */
  function selectTool(t) {
    const next = t === 'place' || t === 'raze' || TERRAIN_TOOL_IDS.includes(t) ? t : 'place';
    S.tool = next;
    if (next !== 'place') S.selectedId = null;
    setGhost(null);
    syncPressed();
    showInfo(null);
    if (on.tool) on.tool(S.tool);
    announce(TOOL_SAID[S.tool] || 'Placing');
  }

  /** Press it again to put it down. The bar buttons and the chips both use this. */
  function toggleTool(t) {
    selectTool(S.tool === t ? 'place' : t);
  }

  function syncPressed() {
    btnRaze.setAttribute('aria-pressed', String(S.tool === 'raze'));
    btnRaze.classList.toggle('is-on', S.tool === 'raze');
    btnField.setAttribute('aria-pressed', String(S.overlay != null));
    btnField.classList.toggle('is-on', S.overlay != null);
    btnJournal.classList.toggle('is-on', S.journal);
    for (const b of grid.querySelectorAll('.item')) {
      const sel = b.dataset.tool ? b.dataset.tool === S.tool : b.dataset.id === S.selectedId;
      b.setAttribute('aria-pressed', String(sel));
      b.classList.toggle('is-on', sel);
      if (sel) b.tabIndex = 0;
    }
  }

  // --------------------------------------------------------------- overlay --

  /**
   * The wash ramp for a channel, for the legend.
   *
   * Each affinity is washed in ITS OWN GRASS's ramp — satyr in the olive of a
   * thicket, naiad in the cypress-to-water of a fen — so the overlay and the
   * ground it floats over are never two different colour languages. The player
   * learns one association, not two.
   */
  function overlayRamp(axis) {
    switch (axis) {
      case 'satyr': // thicket — dry olive, pulled warm
        return [...RAMPS.olive.hex.slice(0, 4), RAMPS.earth.hex[3]];
      case 'centaur': // sward — pale open running turf
        return RAMPS.grass.hex.slice(0, 4).concat(RAMPS.marble.hex[2]);
      case 'naiad': // fen — lush green going blue
        return [...RAMPS.cypress.hex, RAMPS.water.hex[2], RAMPS.water.hex[4]];
      case 'unicorn': // millefleurs — fine, pale, silvery
        return [...RAMPS.marble.hex.slice(1, 5), ACCENT['7']];
      case 'seclusion':
        return [
          RAMPS.cypress.hex[0],
          RAMPS.cypress.hex[1],
          RAMPS.cypress.hex[2],
          RAMPS.sky.hex[0],
          RAMPS.sky.hex[1],
        ];
      case 'maturity':
        return RAMPS.earth.hex.slice(0, 2).concat(RAMPS.gold.hex.slice(1, 4));
      default:
        return RAMPS.rock.hex.slice(0, 4);
    }
  }

  function setOverlay(axis) {
    S.overlay = axis && AXES.includes(axis) ? axis : null;
    legend.hidden = S.overlay == null;
    overlayName.textContent = S.overlay ? `field: ${S.overlay}` : '';
    if (S.overlay) {
      legendTitle.textContent = S.overlay;
      legendRamp.textContent = '';
      for (const h of overlayRamp(S.overlay)) {
        const chip = el('div', 'legend-chip');
        chip.style.background = h;
        legendRamp.append(chip);
      }
    }
    ask(S.renderer, 'setOverlay', S.overlay);
    syncPressed();
    if (on.overlay) on.overlay(S.overlay);
  }

  function cycleOverlay(dir = 1) {
    const order = [null, ...AXES];
    const at = order.indexOf(S.overlay);
    const next = order[(at + dir + order.length) % order.length];
    setOverlay(next);
    announce(next ? `${next} field shown` : 'field overlay off');
  }

  // --------------------------------------------------------------- journal --
  //
  // Cards come from creatures.js `Bestiary.cards()`, whose contract is:
  //
  //   unrevealed: { id, name:'Unknown', revealed:false, silhouette, hint,
  //                 tells, rung:'unknown', restless }
  //   revealed:   { id, name, species, revealed:true, blurb, rung, rungIndex,
  //                 nextRung, complete, restless, home, region, tells,
  //                 requirements:[{ kind, met, text, ... }] }
  //
  // Each requirement already carries a `text` that obeys the exact-for-counts /
  // qualitative-for-axes rule, so it is rendered verbatim. This module composes
  // its own only when it is handed a raw requirement with no text.

  function refreshCards(force) {
    // The stones page is not a creature card and does not move when a rung
    // does, so it needs its own reason to redraw: a grave placed, removed, or
    // given flowers while the journal is open.
    let stonesMoved = false;
    if (S.journal && S.world) {
      const before = S.tombKey;
      tombs();
      stonesMoved = before !== S.tombKey || S.journalPick === STONES;
    }
    if (!bestiary) {
      if (stonesMoved && S.journal) buildJournal();
      return;
    }
    const next = ask(bestiary, 'cards');
    if (!Array.isArray(next)) return;
    const changed = force || stonesMoved || cardsDiffer(S.cards, next);
    S.cards = next;
    if (changed && S.journal) buildJournal();
  }

  function cardsDiffer(a, b) {
    if (a.length !== b.length) return true;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (x.id !== y.id || x.rung !== y.rung || x.revealed !== y.revealed) return true;
      if ((x.tells || []).length !== (y.tells || []).length) return true;
      if (x.restless !== y.restless || x.stranded !== y.stranded) return true;
      // The ground under a settled creature changes without any rung changing,
      // and it is the most interesting thing on the card when it does.
      const xs = x.standing || {};
      const ys = y.standing || {};
      if (xs.type !== ys.type || xs.contested !== ys.contested || xs.second !== ys.second) return true;
      const xr = x.requirements || [];
      const yr = y.requirements || [];
      if (xr.length !== yr.length) return true;
      for (let j = 0; j < xr.length; j++) {
        if (xr[j].met !== yr[j].met || xr[j].text !== yr[j].text) return true;
      }
    }
    return false;
  }

  function roster() {
    if (S.cards.length) return S.cards;
    // No bestiary: fall back to whatever definitions we were handed, all unmet.
    const defs = Array.isArray(opts.creatures) ? opts.creatures : [];
    return defs
      .filter((c) => !c.hidden)
      .map((c) => ({
        id: c.id,
        name: 'Unknown',
        revealed: false,
        silhouette: c.silhouette || null,
        hint: c.hint || null,
        tells: [],
        rung: 'unknown',
      }));
  }

  function buildJournal() {
    const list = roster();
    jList.textContent = '';
    if (!list.length) {
      jList.append(el('div', 'grid-empty', 'Nothing yet.'));
      jCard.textContent = '';
      jCard.append(el('div', 'card-blurb', 'The glade is new. Plant something, and wait.'));
      return;
    }
    // docs/TOMBS.md asks for the epitaphs "on hover, and in the journal", and
    // the journal is already rows-and-a-card, so the stones get a row: one page
    // listing what is written on every grave in the glade. It appears only once
    // a tomb exists — an empty page called "The stones" is a hint, and this
    // module has one object it is under orders never to hint at.
    //
    // THE ARCADIAN TOMB IS NOT ON IT. "Never listed in the journal" is the
    // doc's phrase and it is taken literally: the tomb keeps its own counsel,
    // its inscription is cut into the object where a player can go and read it,
    // and its epitaph shows on hover like every other. It is the one grave in
    // the garden the record does not have.
    const stones = tombs().filter((e) => !e.def.hidden);
    const ids = [...list.map((c) => c.id), ...(stones.length ? [STONES] : [])];
    if (!ids.includes(S.journalPick)) S.journalPick = ids[0];

    const walk = (ev) => {
      const d = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
      if (!d) return;
      ev.preventDefault();
      const at = (ids.indexOf(S.journalPick) + d + ids.length) % ids.length;
      S.journalPick = ids[at];
      buildJournal();
      const next = jList.querySelector(`[data-id="${S.journalPick}"]`);
      if (next) next.focus();
    };

    for (const c of list) {
      const b = el('button', 'jrow' + (c.id === S.journalPick ? ' is-on' : ''));
      b.type = 'button';
      b.dataset.id = c.id;
      b.setAttribute('role', 'listitem');
      b.tabIndex = c.id === S.journalPick ? 0 : -1;
      b.append(el('span', 'jrow-dot' + (c.revealed ? ' known' : '')));
      b.append(el('span', 'jrow-name', c.revealed ? c.name : '? ? ?'));
      b.addEventListener('click', () => {
        S.journalPick = c.id;
        buildJournal();
      });
      b.addEventListener('keydown', walk);
      jList.append(b);
    }
    if (stones.length) {
      const b = el('button', 'jrow' + (S.journalPick === STONES ? ' is-on' : ''));
      b.type = 'button';
      b.dataset.id = STONES;
      b.setAttribute('role', 'listitem');
      b.tabIndex = S.journalPick === STONES ? 0 : -1;
      b.append(el('span', 'jrow-dot known'));
      b.append(el('span', 'jrow-name', 'The stones'));
      b.addEventListener('click', () => {
        S.journalPick = STONES;
        buildJournal();
      });
      b.addEventListener('keydown', walk);
      jList.append(b);
    }
    if (S.journalPick === STONES) buildStonesCard(stones);
    else buildCard(list.find((c) => c.id === S.journalPick));
  }

  /**
   * The stones page: what is written on every grave in the glade, and whether
   * anything has been left at it.
   *
   * No count, no total, no "3 of 5 tended". This is a page of inscriptions and
   * it is read the way inscriptions are read — one at a time, in the order they
   * were put up.
   */
  function buildStonesCard(stones) {
    jCard.textContent = '';
    jCard.append(el('div', 'card-name', 'The stones'));
    jCard.append(
      el(
        'div',
        'card-blurb',
        'What is written in the glade. A tomb makes the ground round it old, ' +
          'because it demonstrably is; leave flowers or a votive within a couple of ' +
          'paces and it makes it older still.'
      )
    );
    const list = el('ul', 'card-tells');
    for (const { obj, def } of stones) {
      const epitaph = S.tombEpitaphs.get(obj.uid);
      let tended = false;
      try {
        tended = tombTended(S.world, obj, def);
      } catch (_) {
        tended = false;
      }
      const li = el('li');
      const line = el('div', 'req-text', epitaph ? `“${epitaph}”` : def.name);
      li.append(line);
      const foot = el('div', 'card-species', `${def.name} — ${tended ? 'kept' : 'quiet'}`);
      if (!tended) foot.style.color = RAMPS.marble.hex[1];
      li.append(foot);
      list.append(li);
    }
    jCard.append(list);
  }

  function buildCard(c) {
    jCard.textContent = '';
    if (!c) return;

    const head = el('div', 'card-head');
    let port = null;
    if (typeof opts.portrait === 'function') {
      try {
        const src = artCanvas(opts.portrait(c, { silhouette: !c.revealed }));
        // An unmet creature is a SHAPE and nothing more, whatever the art hook
        // handed back — the reveal is the point of the ladder.
        if (src) port = portraitCanvas(src, 44, 60, !c.revealed);
      } catch (_) {
        port = null;
      }
    }
    if (!port) port = silhouetteCanvas(c.id, 3);
    port.classList.add('pixels', 'card-portrait');
    head.append(port);

    const heading = el('div', 'card-heading');
    heading.append(el('div', 'card-name', c.revealed ? c.name : 'Unknown'));
    heading.append(el('div', 'card-rung', RUNG_LABEL[c.rung] || RUNG_LABEL.unknown));
    if (c.revealed && c.species && c.species !== c.name) {
      heading.append(el('div', 'card-species', c.species));
    }
    if (c.region) heading.append(el('div', 'card-species', `at home in ${c.region}`));
    head.append(heading);
    jCard.append(head);

    if (!c.revealed) {
      // Before sighting: the shape, the tells found so far, and exactly one
      // plain-language hint. Never the requirement list (SPEC §8).
      if (c.silhouette) jCard.append(el('div', 'card-blurb', c.silhouette));
      appendTells(c);
      if (c.hint) jCard.append(el('div', 'card-hint', c.hint));
      return;
    }

    if (c.blurb) jCard.append(el('div', 'card-blurb', c.blurb));

    // WHOSE GROUND IT IS STANDING ON. One line, in the same words the palette
    // used, so "thicket" means the same thing on the button and on the card.
    if (c.grass && c.standing) {
      const want = GRASS_WORD[c.grass] || c.grass;
      const on = GRASS_WORD[c.standing.type] || c.standing.type;
      const line = el('div', 'card-species');
      if (c.standing.contested) {
        const other = GRASS_WORD[c.standing.second] || 'something else';
        line.textContent = `Standing where the ${on} and the ${other} are still arguing.`;
        line.style.color = ACCENT['5'];
      } else if (c.standing.type === c.grass) {
        line.textContent = `Standing on its own ${want}.`;
      } else {
        line.textContent = `Standing on ${on}. It wants ${want}.`;
      }
      jCard.append(line);
    }

    // The never-evict promise, said plainly and warmly. These two lines are the
    // player-facing half of the floor in SPEC §0: nothing is being taken, there
    // is no timer on fixing it, and the entry above has not changed.
    if (c.stranded) {
      jCard.append(
        el(
          'div',
          'card-hint',
          `Unhappy. There is no ${GRASS_WORD[c.grass] || 'ground of its own'} left anywhere for it — ` +
            'so it has stayed exactly where it is, and it will wait as long as it takes. ' +
            'Grow some again anywhere in the glade and it will go and find it.'
        )
      );
    } else if (c.restless) {
      jCard.append(
        el(
          'div',
          'card-hint',
          'Restless. The ground under it has changed — it is walking to the nearest patch that is ' +
            'still its own. It is not leaving; nothing here ever does.'
        )
      );
    }
    appendTells(c);

    const reqs = (c.requirements || []).filter(Boolean);
    if (c.complete || !c.nextRung) {
      jCard.append(el('div', 'card-sub', 'At home here.'));
      return;
    }
    if (!reqs.length) return;
    jCard.append(el('div', 'card-sub', `What it wants ${WANT_LABEL[c.nextRung] || 'next'}`));
    const list = el('ul', 'card-reqs');
    for (const r of reqs) list.append(requirementRow(r));
    jCard.append(list);
  }

  function appendTells(c) {
    const tells = (c.tells || []).filter(Boolean);
    if (!tells.length) return;
    jCard.append(el('div', 'card-sub', 'What you have seen'));
    const ul = el('ul', 'card-tells');
    for (const t of tells) ul.append(el('li', null, t));
    jCard.append(ul);
  }

  /**
   * One diagnostic line. Prefers the `text` creatures.js already composed;
   * falls back to composing one from a raw requirement:
   *
   *   { kind:'count',     label:'ash trees', have:2, need:3 }
   *   { kind:'axis',      axis:'wildness', value, band:{min,max,scale} }
   *   { kind:'presence',  label:'a naiad settled nearby', met }
   *   { kind:'behaviour', label:'seen to drink at the pool', met }
   *
   * Counts get exact numbers because they are discrete and the player can go
   * and count them, so hiding the figure would be a lie. Axes get a word. There
   * is no third case, and nothing is ever summed.
   */
  function requirementRow(r) {
    const li = el('li', 'req');
    const kind = r.kind || (r.axis ? 'axis' : r.need != null ? 'count' : 'presence');
    let met = !!r.met;
    let text = r.text || '';

    // THE GROUND LINE. creatures.js hands over a `picture` — the patch shape
    // with the tiles you have filled in — and deliberately hands over NO
    // figure. Draw the picture, print the sentence, and do not be tempted to
    // helpfully add "(7 of 9)" underneath it. That temptation is the whole
    // reason ZONING.md wrote the rule down.
    if (kind === 'ground') {
      li.classList.add('req-ground');
      const tick = el('span', 'tick' + (met ? ' is-met' : ''));
      tick.setAttribute('aria-hidden', 'true');
      li.append(tick);
      if (r.picture) {
        const holder = el('span', 'req-picture');
        holder.style.flex = '0 0 auto';
        holder.style.lineHeight = '0';
        holder.style.marginRight = 'calc(2 * var(--u))';
        holder.setAttribute('aria-hidden', 'true');
        holder.append(groundPicture(r.picture, r.grass));
        li.append(holder);
      }
      const body = el('span', 'req-text', text);
      if (r.contested) body.style.color = ACCENT['5']; // the argument, not a fault
      li.append(body);
      li.classList.toggle('is-met', met);
      // The screen reader gets the same refusal: a shape, described, never a
      // count of tiles.
      li.setAttribute('aria-label', (met ? 'ground: ' : 'wanted: ') + text);
      li.style.alignItems = 'center';
      return li;
    }

    if (!text) {
      if (kind === 'count') {
        const have = Math.max(0, r.have | 0);
        const need = Math.max(0, r.need | 0);
        met = r.met != null ? !!r.met : have >= need;
        text = `${Math.min(have, need)} of ${need} ${r.label || 'of them'}`;
      } else if (kind === 'axis') {
        met = r.met != null ? !!r.met : axisMet(r.value, r.band || {});
        text = `${r.axis} — ${r.word || axisWord(r.axis, r.value, r.band || {})}`;
      } else {
        text = r.label || '';
      }
    }

    const tick = el('span', 'tick' + (met ? ' is-met' : ''));
    tick.setAttribute('aria-hidden', 'true');
    li.append(tick);
    li.append(el('span', 'req-text', text));
    li.classList.toggle('is-met', met);
    if (kind === 'behaviour') li.classList.add('req-behaviour');
    if (kind === 'terrain') li.classList.add('req-terrain');
    li.setAttribute('aria-label', (met ? 'done: ' : 'wanted: ') + text);
    return li;
  }

  function openJournal() {
    if (S.journal) return;
    S.journal = true;
    S.lastFocus = document.activeElement;
    journal.hidden = false;
    mount.classList.add('is-modal');
    refreshCards(true);
    buildJournal();
    syncPressed();
    const first = jList.querySelector('[tabindex="0"]') || jClose;
    first.focus();
    if (on.journal) on.journal(true);
  }

  function closeJournal() {
    if (!S.journal) return;
    S.journal = false;
    journal.hidden = true;
    mount.classList.remove('is-modal');
    syncPressed();
    if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus();
    else if (canvas) canvas.focus();
    if (on.journal) on.journal(false);
  }

  function toggleJournal() {
    if (S.journal) closeJournal();
    else openJournal();
  }

  // The modal keeps its own focus. Tab must not walk out of an open dialog.
  journal.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      closeJournal();
      return;
    }
    if (ev.key !== 'Tab') return;
    const focusable = [...journal.querySelectorAll('button:not([disabled])')].filter(
      (n) => n.tabIndex >= 0
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  // ------------------------------------------------------------------ misc --

  function announce(text) {
    if (!text) return;
    liveRegion.textContent = '';
    liveRegion.textContent = String(text);
  }

  function say(text, ms = 2600) {
    if (!text) return;
    toast.textContent = String(text);
    toast.hidden = false;
    clearTimeout(S.toastTimer);
    S.toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, ms);
    announce(text);
  }

  /** main.js forwards creature events here. A warm line, never a number. */
  function onEvent(ev) {
    if (!ev) return;
    const kind = String(ev.type || ev.kind || '');
    const who = String(ev.name || ev.creature || ev.id || 'something');
    if (/settle/i.test(kind)) say(`${cap(who)} has settled here.`, 4200);
    else if (/thriv/i.test(kind)) say(`${cap(who)} is thriving.`, 4200);
    else if (/visit/i.test(kind)) say(`Something came to look.`, 3400);
    else if (/sight/i.test(kind)) say(`Something has been here.`, 3400);
    else if (/unlock/i.test(kind) && ev.label) say(`${ev.label} — new to plant.`, 3800);
    if (/settle|thriv|sight|visit/i.test(kind)) refreshCards(true);
  }

  function setTime(t) {
    S.time = t;
    if (t == null) {
      timeOut.textContent = '';
      return;
    }
    if (typeof t === 'string') {
      timeOut.textContent = t;
      return;
    }
    if (typeof t === 'number') {
      const day = Math.floor(t / daySeconds) + 1;
      const phase = ask(bestiary, 'timeOfDay');
      const word = typeof phase === 'string' ? phase : phase && phase.name;
      timeOut.textContent = word ? `day ${day} · ${word}` : `day ${day}`;
      return;
    }
    const bits = [];
    if (t.season) bits.push(String(t.season));
    if (t.day != null) bits.push(`day ${Math.max(1, Math.floor(t.day))}`);
    if (t.phase) bits.push(String(t.phase));
    timeOut.textContent = bits.join(' · ');
  }

  /** Does this logical point belong to the chrome rather than the garden? */
  function blocks(x, y) {
    if (S.journal) return true;
    const inRect = (r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
    if (inRect(LAYOUT.TOPBAR) || inRect(LAYOUT.PANEL)) return true;
    if (!legend.hidden && x < 132 && y > LAYOUT.PANEL.y - 46 && y < LAYOUT.PANEL.y) return true;
    return false;
  }

  // ----------------------------------------------------------------- ghost --

  /**
   * setGhost({ mode, id, tx, ty, w, h, legal, reason }) — input.js calls this
   * on every pointer move. When a renderer is present the ghost is handed
   * straight to it, because it knows the snapped camera and draws the plate
   * under the placeable's own art; `drawGhost` below is only for preview mode.
   */
  function setGhost(g) {
    const next = g && g.tx != null ? { w: 1, h: 1, legal: true, ...g } : null;
    const before = S.ghost;
    S.ghost = next;
    if (S.renderer) {
      ask(S.renderer, 'setGhost', next ? { tx: next.tx, ty: next.ty, footprint: [next.w, next.h], art: next.art || null, legal: next.legal } : null);
    }
    // The refusal reason, in world.js's own warm words, in the info box.
    if (next && next.mode !== 'raze' && !next.legal && next.reason) showRefusal(next.reason);
    else if (before && before.reason && (!next || next.legal)) showInfo(null);
  }

  function drawGhost(ctx, cam) {
    const g = S.ghost;
    if (!ctx || !g || S.renderer) return; // the renderer already drew it
    const hex = !g.legal
      ? GHOST_COLOURS.illegal
      : g.mode === 'raze'
        ? GHOST_COLOURS.razeOk
        : GHOST_COLOURS[g.mode] || GHOST_COLOURS.legal;
    const tile = ghostTile(hex);
    const v = LAYOUT.VIEW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, v.w, v.h);
    ctx.clip();
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        // tileToScreen gives the diamond's NORTH VERTEX; a 64x32 bitmap is
        // blitted half a tile width to the left of it.
        const p = tileToScreen(g.tx + x, g.ty + y, cam || { ox: 0, oy: 0 });
        ctx.drawImage(tile, Math.round(p.x - TILE_W / 2), Math.round(p.y));
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- update --

  /**
   * Two signatures, because main.js drives modules as `update(dt, game)` and a
   * standalone host is more naturally `update(snapshot)`:
   *
   *   update(dtSeconds, game)   — a frame tick. Pulls journal cards and the
   *                               time readout off the game object.
   *   update({ time, cards, unlocked, message })  — an explicit push.
   */
  function update(a, b) {
    if (typeof a === 'number') {
      const g = b || game;
      S.cardClock += a;
      // Four times a second is plenty for a journal; the ladder does not move
      // faster than the player can read.
      if (S.cardClock >= 0.25) {
        S.cardClock = 0;
        tombTick(g);
        refreshCards(false);
        if (g && typeof g.time === 'number') setTime(g.time);
        const unlocked = g && (g.unlocked || (g.world && g.world.unlocked));
        if (unlocked && unlocked !== S.unlocked) {
          S.unlocked = unlocked;
          buildGrid();
          syncPressed();
        }
      }
      return;
    }
    const snap = a || {};
    if (snap.time !== undefined) setTime(snap.time);
    if (snap.unlocked !== undefined) {
      S.unlocked = snap.unlocked || null;
      buildGrid();
      syncPressed();
    }
    if (Array.isArray(snap.cards)) {
      S.cards = snap.cards;
      if (S.journal) buildJournal();
    }
    if (snap.message) say(snap.message);
  }

  /** main.js calls ui.draw(alpha, game) after the renderer. Preview-mode only. */
  function draw(alpha, g) {
    if (S.renderer) return;
    const cv = canvas;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const cam = (g && g.camera) || (opts.camera ?? null);
    if (ctx) drawGhost(ctx, cam);
  }

  function setPlaceables(list) {
    S.placeables = normaliseCatalog(list);
    buildTabs();
    buildGrid();
    showInfo(null);
  }

  function setCreatures(list) {
    if (list && typeof list.cards === 'function') {
      S.cards = ask(list, 'cards') || [];
    } else if (Array.isArray(list)) {
      opts.creatures = list;
      S.cards = [];
    }
    if (S.journal) buildJournal();
  }

  // ------------------------------------------------------------------ boot --

  buildTabs();
  buildGrid();
  showInfo(null);
  setOverlay(null);
  setTime(game && typeof game.time === 'number' ? game.time : null);
  tombTick(game);
  refreshCards(true);

  // Passive, so it never competes with input.js for the pointer — this only
  // ever reads. A host with no canvas simply has no tomb tooltips.
  if (canvas) {
    canvas.addEventListener('pointermove', onHover, { passive: true });
    canvas.addEventListener('pointerleave', () => {
      if (S.hoverUid == null) return;
      S.hoverUid = null;
      showInfo(null);
    });
  }

  return {
    el: mount,
    app,
    layout: LAYOUT,
    viewport: () => ({ ...LAYOUT.VIEW }),
    blocks,
    isModal: () => S.journal,

    setPlaceables,
    setCreatures,
    setRenderer(r) {
      S.renderer = r;
      ask(S.renderer, 'setOverlay', S.overlay);
    },
    setWorld(w) {
      S.world = w;
      // A new garden carries its own record of what it has turned up, and its
      // own tombs. Neither survives the swap.
      S.hydrated = false;
      S.tombKey = '';
      S.hoverUid = null;
      tombTick(game);
      buildGrid();
    },
    update,
    draw,
    setTime,
    onEvent,

    selection: () => S.placeables.find((p) => p.id === S.selectedId) || null,
    selectItem,
    clearSelection,
    selectGroup,
    selectGroupIndex,

    tool: () => S.tool,
    toggleTool,
    selectTool,
    setTool: selectTool,
    /** js/input.js asks this to decide whether a drag paints or regrades. */
    isTerrainTool: () => TERRAIN_TOOL_IDS.includes(S.tool),
    terrainTools: () => TERRAIN_TOOLS.map((t) => ({ ...t })),

    overlay: () => S.overlay,
    setOverlay,
    cycleOverlay,
    overlayRamp,

    openJournal,
    closeJournal,
    toggleJournal,

    get ghost() {
      return S.ghost;
    },
    setGhost,
    drawGhost,

    say,
    announce,

    /**
     * main.js folds this into the autosave. Chrome state only, never world.
     *
     * `found` rides along as a second copy for a host that does use this hook.
     * The authoritative store is `world.extra.tombs`, because what the glade has
     * turned up belongs to the garden rather than to the toolbar, and because
     * world.extra is the slot world.js declares for exactly this and round-trips
     * through the save whether or not anybody calls serialize().
     */
    serialize: () => ({
      group: S.group,
      selectedId: S.selectedId,
      tool: S.tool,
      overlay: S.overlay,
      found: [...S.found],
    }),
    restore(st) {
      if (!st) return;
      if (Array.isArray(st.found)) {
        for (const id of st.found) S.found.add(id);
        buildGrid();
      }
      if (st.group) selectGroup(st.group);
      if (st.selectedId) selectItem(st.selectedId);
      if (st.tool && st.tool !== 'place') selectTool(st.tool);
      if (st.overlay) setOverlay(st.overlay);
    },

    /** docs/TOMBS.md — the epitaph on a particular grave, or null. */
    epitaphFor(uid) {
      tombs();
      return S.tombEpitaphs.get(uid) || null;
    },
    /** Hidden placeables the glade has turned up. Never shrinks. */
    found: () => [...S.found],

    destroy() {
      clearTimeout(S.toastTimer);
      if (canvas) canvas.removeEventListener('pointermove', onHover);
      mount.textContent = '';
    },
  };
}
