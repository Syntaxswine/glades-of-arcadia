// render.js — the canvas renderer for Arcadia.
//
// ===========================================================================
// THE LAWS THIS FILE EXISTS TO ENFORCE
//
//  1. The backing canvas is EXACTLY 640 x 400. Never resized to the window.
//  2. `imageSmoothingEnabled = false` on every context, including offscreen.
//  3. CSS upscale is 1x, 2x or 3x — a WHOLE NUMBER. A fractional scale gives
//     uneven pixel rows and is the loudest possible tell that this is not
//     period art (RESEARCH A9.1).
//  4. Every draw position goes through Math.round(). Sub-pixel sprite
//     positions are the same crime in motion.
//  5. Every colour on screen comes from palette.js. Nothing here invents a
//     hex, lerps RGB, or draws a translucent black shadow.
//  6. Canvas path drawing (arc, lineTo, gradients) is never used to make a
//     sprite edge — that is automatic anti-aliasing, which is not period. All
//     generated art in this file is written per-pixel into ImageData.
//
// ===========================================================================
// LAYER ORDER
//
//   terrain  ->  contact shadows  ->  objects+creatures (depth sorted)
//            ->  field overlay    ->  ghost preview
//
// Terrain is drawn WHOLE and FIRST, into a world-space cache canvas that is
// rebuilt only when terrain changes; per frame it is one drawImage. The field
// overlay is likewise a world-space cache rebuilt only when the field or the
// selected axis changes. That leaves the per-frame cost at roughly
// (2 blits + one blit per visible object), which holds 60fps on a full 20x20
// map of objects with room to spare.
//
// Objects and creatures share ONE depth-sorted pass. SPEC §2 requires movers
// to go through the same key with fractional coordinates so they never pop
// across a tile boundary; a separate creatures-on-top pass would also draw a
// creature over the tree it is standing BEHIND. Because the draw list is built
// as [...objects, ...creatures], the insertion-index tiebreak still puts a
// creature above an object it is exactly co-located with — the "creatures
// layer" falls out of the sort for free and stays correct.
//
// ===========================================================================
// THE SCENE CONTRACT
//
// `renderer.setScene(scene)` / `renderer.draw(scene)` take a plain object.
// Every field is optional; a renderer handed `{}` draws an empty grass glade,
// which is what makes this module useful before the other seven land.
//
//   {
//     mapW, mapH,            // default 20, 20
//
//     terrainVersion,        // any value; when it CHANGES the terrain cache
//                            // is rebuilt. Bump it on a ground edit.
//     terrain(tx, ty) -> art | { art, water, ground, level, grass, grass2 } | null
//                            // `art` is a sprite/composer output (below).
//                            // `water: true` marks the tile for palette
//                            // cycling — as does a sprite that declares
//                            // `cycle` in its defineSprite. `ground` is the
//                            // palette key used for contact shadows on this
//                            // tile (default 'o', grass mid).
//                            // `level` 0..MAX_LEVEL is the tile's height.
//                            // `grass` is a ZONING.md grass type; when set it
//                            // REPLACES `art` for the top face. `grass2` is
//                            // the losing type on CONTESTED ground and makes
//                            // the tile a 50% checkerboard of the two.
//
//     // Elevation and zoning may also arrive whole, which is cheaper than 400
//     // calls and is what world.js can hand over directly:
//     levels,                // Int8Array/array row-major, or (tx,ty)->level
//     grass,                 // array of type names/indices, or (tx,ty)->type
//     grassContest,          // ditto — the SECOND type on a contested tile
//     grassCause: {tx,ty},   // where a zoning flip started, so the spread
//                            // animation radiates from the object that caused
//                            // it rather than from a corner
//     elevationVersion,      // bump to rebuild the columns without a full
//                            // terrain rebuild key change (optional)
//
//     objects: [ { tx, ty, level?, footprint:[w,h], art, variant?, shadow?, ground? } ]
//     creatures: [ { tx, ty, level?, art, variant?, rung?, shadow?, fade? } ]
//                            // rung 'visits' renders desaturated (SPEC §7).
//                            // tx/ty are FRACTIONAL for movers. Please.
//                            // `fade` is 0..1 opacity, for the transit across
//                            // the map boundary (docs/CREATURE-MOVEMENT.md §1)
//                            // — a creature arrives out of the dusk and
//                            // dissolves back into it instead of walking over
//                            // open sky. Omit it, or 1, for everything else.
//                            // Drawn as a Bayer DISSOLVE, never an alpha blend.
//                            // `level` is OPTIONAL: omit it and the renderer
//                            // reads the height of the tile underneath, so an
//                            // object rides its terrace up for free and can
//                            // never be left floating over a lowered tile.
//
//     fieldVersion,          // bump when the field changes
//     overlay: null | {
//       axis,                // 'wildness'|'order'|'seclusion'|'moisture'|'maturity'
//       // EITHER (preferred) a pre-normalised row-major grid — pass
//       // `fields.overlay(axis)` straight through, it is already this shape:
//       data?: Float32Array, version?,
//       // OR a per-tile sampler, auto-ranged:
//       sample?(tx, ty) -> number,
//       range?: [lo, hi],    // omit and data assumes 0..1, sample auto-ranges
//     },
//
//     ghost: null | { tx, ty, footprint, art, legal }
//   }
//
// `art` may be any of:
//   * a sprite definition from `defineSprite` (has `.rows` and `.anchor`),
//   * `{ canvas, anchor:[x,y] }` — a pre-rasterised composer output,
//   * `{ w, h, anchor:[x,y], data:Uint8ClampedArray }` — a raw RGBA buffer,
//   * a bare <canvas>, anchored at its centre.
//
// The anchor pixel sits on the footprint's centre point (SPEC §2); for a 1x1
// that is exactly the tile centre.
//
// ===========================================================================
// WHAT ELEVATION.md ASKS FOR THAT IS **NOT** IN HERE
//
// Everything below is deliberate, not forgotten.
//
//  * CONNECTORS (earth ramp, stone stair, rock scramble, stepped terrace
//    wall). These are placeable OBJECTS, not terrain — that is the whole point
//    of "no auto-slope tiling" — so they belong to catalog.js and art/props.js
//    and they already draw correctly here as ordinary objects that declare a
//    level. Nothing further is needed from the renderer.
//  * THE DRESSED RETAINING WALL as a cliff-face material. `needsDesign`: it is
//    listed with the natural faces in ELEVATION.md, but a dressed wall is
//    masonry the player BUILT, so whether it is a terrain face or a connector
//    object is a design question, not a rendering one. Generated faces are
//    rock / earth / mossy for now.
//  * CAVE MOUTHS. The renderer supplies the hook and no policy: a terrain cell
//    may carry `faceArt: { se, sw }` and the sprite is stamped onto that cliff
//    face at the foot of the rock. Which tiles get one, and what it looks
//    like, is the catalogue's and the art owner's call.
//  * OBJECTS SPANNING TWO LEVELS (a bridge over a gorge). ELEVATION.md marks
//    this NEEDS-DESIGN itself; a scalar depth key cannot order an object that
//    is behind a column at one end and in front of it at the other.
//  * TALL OBJECTS ON LOW GROUND IN FRONT OF A CLIFF. ELEVATION.md: "accept
//    minor overlap rather than building a topological sort". Accepted.

import {
  TILE_W,
  TILE_H,
  HALF_W,
  HALF_H,
  VIEW_W,
  VIEW_H,
  MAP_W,
  MAP_H,
  LEVEL_H,
  MAX_LEVEL,
  MAX_RISE,
  clampLevel,
  FRONT_SIDES,
  frontNeighbour,
  toScreen,
  toScreenAt,
  footprintCentreAt,
  footprintOf,
  worldBounds,
  clampCamera,
  cameraBounds,
  cameraCentredOn,
  visibleTileRange,
  sortForDraw,
  pickTileAt,
  snap,
  facingMirrored,
} from './iso.js';

import { RAMPS, ACCENT, PALETTE, resolve as basePalette, shade, contactShadow, cycleWater } from './palette.js';

import { rasterise } from './art/format.js';

// ---------------------------------------------------------------------------
// Constants.

export const BACKING_W = VIEW_W; // 640
export const BACKING_H = VIEW_H; // 400
export const MAX_SCALE = 3;

/** Light comes from the upper left, so contact shadows fall down-right. */
const SHADOW_DX = 2;
const SHADOW_DY = 1;
const SHADOW_SCALE = 0.5; // fraction of the footprint diamond
const SHADOW_RING = 1.6; // px of the softer outer tone

/** Water palette cycling, RESEARCH A7: 6-12 Hz for a rippling shallow. */
const WATER_HZ = 8;
const WATER_PHASES = RAMPS.water.keys.length; // 6

const GROUND_DEFAULT = 'o'; // grass mid #74863C

/**
 * Gradual grass spread (ZONING.md). ~90ms per tile of distance from the cause
 * means a 6-tile blob finishes in a bit over half a second — quick enough that
 * it never feels like waiting, slow enough that the eye can follow which
 * object did it, which is the whole point.
 */
const SPREAD_BASE_MS = 60;
const SPREAD_MS_PER_TILE = 90;
const SPREAD_JITTER_MS = 55;

// ---------------------------------------------------------------------------
// The field overlay palettes.
//
// SPEC §6: "the single highest-value legibility feature in the game ... it is
// what teaches the player that they are shaping a landscape rather than
// filling zoo pens." It has to be beautiful, and it has to stay READABLE OVER
// GRASS, which is olive-green and mid-value. Two decisions do that work:
//
//  * Only ONE axis is shown at a time, so the ramps do not have to be mutually
//    distinguishable within a frame — each can take the prettiest hue for its
//    meaning. Wildness climbs DARK (overgrown, tangled, shadowed); order
//    climbs to ivory marble (swept, tended); seclusion goes cool and then
//    iris-violet (hushed); moisture is the water ramp; maturity is gold
//    patina.
//  * Value zero is INVISIBLE. Coverage ramps up from nothing, so an untouched
//    corner of the glade shows plain grass and the wash reads as something
//    that has accumulated, not as a heatmap laid on top.
//
// The wash is drawn as flat per-tile diamonds dithered with an ordered 4x4
// Bayer matrix, in world space — the period density ladder from RESEARCH A5
// (solid A -> sparse -> 50% checker -> solid B), never a smooth alpha gradient.
// Coverage is capped below full so the grass always breathes through: it is a
// gauze over the garden, not a coat of paint.

/**
 * The overlay channels, low -> high. Every hex is lifted verbatim from
 * palette.js.
 *
 * ZONING.md retired `wildness`, `order` and `moisture` and put four SPECIES
 * AFFINITIES in their place, so those are what the wash shows now. Each
 * affinity is washed in the ramp of the grass it grows, which means the
 * overlay is a saturated preview of the ground itself rather than a second,
 * unrelated colour code the player has to learn — Tab now answers "how hard is
 * he arguing for this ground?" in the same colours as the answer to "whose
 * ground is this?".
 *
 * The two survivors keep their old ramps, because they are still conditions
 * rather than affinities and reading differently is correct.
 */
export const OVERLAY_RAMPS = Object.freeze({
  satyr: [RAMPS.olive.hex[3], RAMPS.olive.hex[2], RAMPS.olive.hex[1], RAMPS.olive.hex[0]],
  centaur: [RAMPS.grass.hex[3], RAMPS.grass.hex[2], RAMPS.grass.hex[1], RAMPS.grass.hex[0]],
  naiad: [RAMPS.water.hex[4], RAMPS.water.hex[3], RAMPS.cypress.hex[2], RAMPS.cypress.hex[0]],
  unicorn: [RAMPS.marble.hex[1], RAMPS.marble.hex[2], RAMPS.marble.hex[3], ACCENT[7]],
  seclusion: [RAMPS.sky.hex[2], RAMPS.sky.hex[1], RAMPS.sky.hex[0], ACCENT[4]],
  maturity: [RAMPS.earth.hex[1], RAMPS.gold.hex[1], RAMPS.gold.hex[2], RAMPS.gold.hex[3]],
});

const OVERLAY_LEVELS = 24; // quantisation steps of the wash
const OVERLAY_MAX_COVER = 0.625; // 10/16 — the grass never disappears
const OVERLAY_FADE_IN = 0.34; // coverage reaches full by this much of the range
const OVERLAY_MIN_SPAN = 0.12; // in normalised units — below this, no wash

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// ---------------------------------------------------------------------------
// Small helpers.

function hexToRGB(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function luminance(hex) {
  const [r, g, b] = hexToRGB(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return cv;
}

function ctxOf(cv) {
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

// ---------------------------------------------------------------------------
// The canonical tile mask.
//
// Which pixels of a 64x32 box belong to the tile whose north vertex is at the
// box's top-centre? Derived from the SAME inverse transform iso.js uses for
// picking, so the mask and the hit test can never disagree, and the diamonds
// interlock with no gaps and no double-covered pixels. Exactly 1024 of the
// 2048 box pixels are owned — each tile takes half its bounding box.

let TILE_MASK = null;
let TILE_FX = null;
let TILE_FY = null;

export function tileMask() {
  if (TILE_MASK) return TILE_MASK;
  buildTileMask();
  return TILE_MASK;
}

/**
 * The same inverse, kept as FRACTIONS. `TILE_FX[i]` is how far across the tile
 * (0..1) pixel i lies along +tx, `TILE_FY[i]` the same along +ty. That is what
 * the soft meadow edges need: "how close is this pixel to the boundary with
 * the neighbour in that direction" is exactly `1 - fx` and friends, and
 * deriving it from the same transform as the mask means the dither can never
 * bleed outside the diamond it belongs to.
 */
function tileFractions() {
  if (!TILE_FX) buildTileMask();
  return { fx: TILE_FX, fy: TILE_FY };
}

function buildTileMask() {
  const m = new Uint8Array(TILE_W * TILE_H);
  const fxs = new Float32Array(TILE_W * TILE_H);
  const fys = new Float32Array(TILE_W * TILE_H);
  for (let ly = 0; ly < TILE_H; ly++) {
    for (let lx = 0; lx < TILE_W; lx++) {
      const sx = lx - HALF_W + 0.5;
      const sy = ly + 0.5;
      const a = sx / HALF_W;
      const b = sy / HALF_H;
      const fx = (a + b) / 2;
      const fy = (b - a) / 2;
      const i = ly * TILE_W + lx;
      if (Math.floor(fx) === 0 && Math.floor(fy) === 0) {
        m[i] = 1;
        fxs[i] = fx;
        fys[i] = fy;
      }
    }
  }
  TILE_MASK = m;
  TILE_FX = fxs;
  TILE_FY = fys;
}

// ---------------------------------------------------------------------------
// Small deterministic helpers shared by every generated tile and face.

/** A coordinate hash. Never Math.random — a lawn that reshuffles on redraw crawls. */
function hash2(a, b, salt = 0) {
  let h = (a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (salt | 0) * 83492791;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * Terrain data may arrive three ways and the renderer accepts all of them: a
 * function, a row-major array, or nothing. `pick3` chooses the first source
 * that exists; `readAt` reads one tile out of whichever it turned out to be.
 * This is the seam with world.js, and it is deliberately generous — the
 * renderer must draw a sensible glade when handed `{}`.
 */
function pick3(a, b) {
  if (a != null) return a;
  if (b != null) return b;
  return null;
}

function readAt(src, tx, ty, i, dflt) {
  if (src == null) return dflt;
  if (typeof src === 'function') {
    const v = src(tx, ty);
    return v == null ? dflt : v;
  }
  if (typeof src.length === 'number') {
    const v = src[i];
    return v == null ? dflt : v;
  }
  return dflt;
}

/** A grass type by name or index -> index, or 255 for "no zoning here". */
function grassIndexOf(v) {
  if (v == null || v === false) return 255;
  if (typeof v === 'number') return v >= 0 && v < GRASS_TYPES.length ? v | 0 : 255;
  const i = GRASS_INDEX.get(v);
  return i == null ? 255 : i;
}

/** xorshift, seeded. Same seed, same tile, forever. */
function rng(seed) {
  let s = (seed || 1) >>> 0;
  if (!s) s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Recolour resolvers.
//
// A "variant" is the cheap period trick that format.js is built around: the
// same authored rows drawn through a different resolver. Nothing here invents
// a colour — every target hex is already in RAMPS or ACCENT.

/** Map every ramp and accent key onto one target ramp, preserving value. */
function tintResolver(targetHexes) {
  const m = new Map();
  const n = targetHexes.length;
  for (const ramp of Object.values(RAMPS)) {
    const len = ramp.keys.length;
    ramp.keys.split('').forEach((k, i) => {
      const t = len === 1 ? 0 : i / (len - 1);
      m.set(k, targetHexes[Math.round(t * (n - 1))]);
    });
  }
  for (const [k, hex] of Object.entries(ACCENT)) {
    m.set(k, targetHexes[Math.round(luminance(hex) * (n - 1))]);
  }
  return (k) => m.get(k);
}

/**
 * The `visits` rung: "rendered desaturated" (SPEC §7). Warm greys taken from
 * the rock and marble ramps — a creature that has not settled has not gained
 * its colour yet, and the moment it does is the payoff.
 */
const GHOST_HEXES = [
  RAMPS.rock.hex[0],
  RAMPS.rock.hex[1],
  RAMPS.rock.hex[2],
  RAMPS.rock.hex[3],
  RAMPS.marble.hex[1],
  RAMPS.marble.hex[2],
];

export const VARIANTS = {
  base: basePalette,
  ghost: tintResolver(GHOST_HEXES),
  ok: tintResolver(RAMPS.canopy.hex), // legal placement — green
  bad: tintResolver(RAMPS.terracotta.hex), // illegal placement — red
};

// ---------------------------------------------------------------------------
// Art resolution.
//
// Normalises anything the art modules hand us into { canvas, ax, ay, w, h }
// and caches it. Sprite definitions go through format.js's own rasteriser
// (which is what it is for); composer output and raw RGBA buffers are cached
// here against the art object itself, so a composer may return a fresh object
// per plant without leaking.

const artCache = new WeakMap();

function cachedFor(art, key, build) {
  let byVariant = artCache.get(art);
  if (!byVariant) {
    byVariant = new Map();
    artCache.set(art, byVariant);
  }
  let hit = byVariant.get(key);
  if (!hit) {
    hit = build();
    byVariant.set(key, hit);
  }
  return hit;
}

/** Remap a raw RGBA buffer onto a ramp by luminance. Used for tinting. */
function remapRGBA(data, w, h, targetHexes) {
  const out = new Uint8ClampedArray(data.length);
  const n = targetHexes.length;
  const lut = targetHexes.map(hexToRGB);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (!a) continue;
    const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    const c = lut[Math.max(0, Math.min(n - 1, Math.round(l * (n - 1))))];
    out[i] = c[0];
    out[i + 1] = c[1];
    out[i + 2] = c[2];
    out[i + 3] = a;
  }
  return out;
}

function canvasFromRGBA(data, w, h) {
  const cv = makeCanvas(w, h);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(w, h);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return cv;
}

/**
 * A raster flipped about its vertical centre — which in a 2:1 projection is an
 * EXACT quarter-turn of the world, not an approximation of one. The projection
 * is symmetric about the vertical, so a wall running NE-SW mirrors into one
 * running NW-SE and every pixel lands where it should. That is why four
 * facings cost two drawings. js/iso.js §FACING.
 *
 * The anchor moves with it: the pixel at `ax` ends up at `w - 1 - ax`. Getting
 * that wrong shifts the object sideways by twice its anchor offset, which on a
 * centred sprite is invisible and on an off-centre one is not — the failure a
 * test would catch only if it used an asymmetric anchor, which is why the one
 * in test/facing.test.mjs does.
 */
function mirroredRaster(base) {
  const cv = makeCanvas(base.w, base.h);
  const ctx = ctxOf(cv);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(base.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(base.canvas, 0, 0);
  return { canvas: cv, ax: base.w - 1 - base.ax, ay: base.ay, w: base.w, h: base.h };
}

/**
 * @returns {{canvas:HTMLCanvasElement, ax:number, ay:number, w:number, h:number}|null}
 */
export function artRaster(art, variantKey = 'base', facing = 0) {
  // A mirrored facing is the SAME drawing seen from the other side, so it is
  // cached against the same art under its own key rather than being rebuilt
  // per frame. `facingDrawing` is reserved for a second (back) drawing, which
  // no placeable has yet — when one does, it arrives as separate art and this
  // line is where it will be chosen.
  if (art && facingMirrored(facing)) {
    const base = artRaster(art, variantKey, 0);
    return base ? cachedFor(art, `${variantKey}|mirror`, () => mirroredRaster(base)) : null;
  }
  if (!art) return null;
  const resolver = VARIANTS[variantKey] || basePalette;

  // (a) hand-authored sprite definition
  if (art.rows && art.anchor) {
    const canvas = rasterise(art, resolver, variantKey);
    return { canvas, ax: art.anchor[0], ay: art.anchor[1], w: art.w, h: art.h };
  }

  // (b) a bare canvas — anchor at its centre, the only sane guess
  if (typeof art.getContext === 'function') {
    return { canvas: art, ax: art.width >> 1, ay: art.height >> 1, w: art.width, h: art.height };
  }

  // (c) composer output that already carries a canvas
  if (art.canvas && typeof art.canvas.getContext === 'function') {
    const anchor = art.anchor || [art.canvas.width >> 1, art.canvas.height >> 1];
    if (variantKey === 'base') {
      return { canvas: art.canvas, ax: anchor[0], ay: anchor[1], w: art.canvas.width, h: art.canvas.height };
    }
    return cachedFor(art, variantKey, () => {
      const w = art.canvas.width;
      const h = art.canvas.height;
      const src = ctxOf(art.canvas).getImageData(0, 0, w, h).data;
      const hexes = variantKey === 'ghost' ? GHOST_HEXES : variantKey === 'bad' ? RAMPS.terracotta.hex : RAMPS.canopy.hex;
      return { canvas: canvasFromRGBA(remapRGBA(src, w, h, hexes), w, h), ax: anchor[0], ay: anchor[1], w, h };
    });
  }

  // (d) raw RGBA buffer
  if (art.data && art.w && art.h) {
    const anchor = art.anchor || [art.w >> 1, art.h >> 1];
    return cachedFor(art, variantKey, () => {
      const hexes = variantKey === 'ghost' ? GHOST_HEXES : variantKey === 'bad' ? RAMPS.terracotta.hex : RAMPS.canopy.hex;
      const data = variantKey === 'base' ? art.data : remapRGBA(art.data, art.w, art.h, hexes);
      return { canvas: canvasFromRGBA(data, art.w, art.h), ax: anchor[0], ay: anchor[1], w: art.w, h: art.h };
    });
  }

  return null;
}

// ===========================================================================
// GROUND — THE FIVE GRASS TYPES (docs/ZONING.md)
// ===========================================================================
//
// ZONING.md supersedes SPEC §6: the zoning stops being an overlay you toggle
// and becomes the ground itself. Five grass types, drawn from tile data:
//
//   meadow       nobody's — the neutral base, everywhere at the start
//   thicket      satyr     — dry, tussocky, unkempt; weeds and thistle
//   sward        centaur   — open coarse running turf, paler, herb-flecked
//   fen          naiad     — lush wet green going blue, moss and rush
//   millefleurs  unicorn   — fine pale silvery grass, tiny white flowers
//
// All five are drawn from the ramps in palette.js and nothing else, because
// "the five must be legible at a glance and harmonious together". They differ
// by RAMP and by MARK SHAPE, not by saturation — thicket is olive pulled warm
// with long tussock strokes, sward is grass pulled light with almost no marks
// at all (which is what makes it read as short and open), fen is cypress going
// blue with vertical rush strokes, millefleurs is grass frosted with marble
// and strewn with accent 7.
//
// A note on a mistake worth not repeating: the first version of the ground
// shaded each diamond's upper-left half one ramp step lighter, on the
// reasoning that light comes from the upper left. Every tile then carried the
// same hard diagonal seam, the seams lined up tile to tile, and the whole map
// read as corduroy. Ground is FLAT — it has no faces to catch the light, and
// the shading convention in SPEC §3 is about CUBES. Grass is therefore flat
// mid-value with hashed marks; the value structure on the ground comes from
// contact shadows and from the cliff faces, which are cubes and do catch light.

/** The five, in ZONING.md's order. Index 0 is always the neutral base. */
export const GRASS_TYPES = Object.freeze(['meadow', 'thicket', 'sward', 'fen', 'millefleurs']);

/**
 * The palette key a contact shadow is derived from, per grass type — the key
 * whose ramp that grass is mostly made of.
 *
 * SPEC §3: a contact shadow is "the GROUND RAMP darkened two steps". With five
 * grasses there are five ground ramps, and using grass-mid for all of them
 * puts an olive-green skirt under a tree standing on a blue-green fen, where
 * it reads as a pale patch rather than as shade. The shadow has to be made of
 * the ground it falls on.
 */
const GRASS_SHADOW_KEY = Object.freeze(['o', 'h', 'p', 'l', 'o']);
const GRASS_INDEX = new Map(GRASS_TYPES.map((g, i) => [g, i]));
const MEADOW = 0;

/** Three seeded variants each — one tile repeated is a tell (RESEARCH A9.9). */
const GRASS_VARIANTS = 3;

/**
 * A mark recipe. `dir` shapes the stroke, and shape is what separates the five
 * at a glance: 'h' lies flat (turf), 'v' stands up (rush, thistle), 'd' is a
 * 2x2 blob (tussock, moss), 'p' is a single point (a flower — the only place a
 * 1px mark is allowed, and only because these tiles live in a cached world
 * canvas that never sub-pixel crawls).
 */
const GRASS_RECIPES = {
  meadow: {
    fill: RAMPS.grass.hex[2],
    marks: [
      { hex: RAMPS.grass.hex[3], n: 12, dir: 'h', len: 2 },
      { hex: RAMPS.grass.hex[1], n: 12, dir: 'h', len: 2 },
      { hex: RAMPS.grass.hex[0], n: 5, dir: 'd' },
    ],
  },
  // Satyr. Olive pulled warm with earth: un-tended hill country, and the
  // thistle is the one saturated pixel in the set.
  thicket: {
    fill: RAMPS.olive.hex[2],
    marks: [
      { hex: RAMPS.olive.hex[3], n: 14, dir: 'v', len: 3 },
      { hex: RAMPS.olive.hex[1], n: 10, dir: 'v', len: 3 },
      { hex: RAMPS.earth.hex[1], n: 7, dir: 'd' },
      { hex: RAMPS.earth.hex[2], n: 4, dir: 'h', len: 2 },
      { hex: ACCENT[4], n: 2, dir: 'p' }, // thistle
    ],
  },
  // Centaur. An open RUN: pale, coarse, and deliberately under-marked, so a
  // sward reads as ground you could gallop across.
  sward: {
    fill: RAMPS.grass.hex[3],
    marks: [
      { hex: RAMPS.grass.hex[2], n: 10, dir: 'h', len: 3 },
      { hex: RAMPS.olive.hex[3], n: 6, dir: 'h', len: 2 },
      { hex: RAMPS.grass.hex[1], n: 3, dir: 'h', len: 2 },
      { hex: ACCENT[5], n: 2, dir: 'p' }, // herb flecks
    ],
  },
  // Naiad. Cypress going blue, with the water ramp's dark body for standing
  // wet and rushes standing up out of it.
  fen: {
    fill: RAMPS.cypress.hex[2],
    marks: [
      { hex: RAMPS.cypress.hex[1], n: 10, dir: 'd' },
      { hex: RAMPS.water.hex[2], n: 6, dir: 'h', len: 3 },
      { hex: RAMPS.canopy.hex[3], n: 9, dir: 'v', len: 4 }, // rush
      { hex: RAMPS.grass.hex[1], n: 5, dir: 'd' }, // moss
    ],
  },
  // Unicorn. Grass FROSTED with marble, and strewn with the flowers of the
  // tapestries. The first version was grass with a few white pixels and read
  // as plain meadow at 1x — the flowers alone are not enough separation from
  // the neutral base, which is the one pair in the set that MUST be
  // distinguishable. The fix is to grey the turf itself: marble is a warm
  // neutral, so stippling it through green pulls the whole tile toward silver
  // without inventing a colour or reaching for saturation.
  millefleurs: {
    fill: RAMPS.grass.hex[2],
    marks: [
      { hex: RAMPS.marble.hex[1], n: 52, dir: 'h', len: 2 },
      { hex: RAMPS.marble.hex[2], n: 30, dir: 'h', len: 2 },
      { hex: RAMPS.grass.hex[3], n: 10, dir: 'h', len: 2 },
      { hex: RAMPS.marble.hex[3], n: 10, dir: 'p' },
      { hex: ACCENT[7], n: 18, dir: 'p' }, // the white flowers
      { hex: ACCENT[3], n: 3, dir: 'p' },
      { hex: ACCENT[5], n: 3, dir: 'p' },
    ],
  },
};

const grassTileCache = new Map();

/** One 64x32 grass diamond, per (type, variant). Written per-pixel, no paths. */
function grassTileCanvas(type, variant) {
  const key = `${type}/${variant}`;
  const hit = grassTileCache.get(key);
  if (hit) return hit;

  const recipe = GRASS_RECIPES[type] || GRASS_RECIPES.meadow;
  const mask = tileMask();
  const cv = makeCanvas(TILE_W, TILE_H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(TILE_W, TILE_H);
  const d = img.data;
  const rnd = rng(0x9e3779b9 ^ Math.imul(variant + 1, 0x85ebca6b) ^ Math.imul(GRASS_INDEX.get(type) + 3, 0x27d4eb2f));

  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= TILE_W || y >= TILE_H) return;
    if (!mask[y * TILE_W + x]) return;
    const i = (y * TILE_W + x) * 4;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  };

  const fill = hexToRGB(recipe.fill);
  for (let ly = 0; ly < TILE_H; ly++) {
    for (let lx = 0; lx < TILE_W; lx++) put(lx, ly, fill);
  }

  for (const m of recipe.marks) {
    const c = hexToRGB(m.hex);
    for (let k = 0; k < m.n; k++) {
      const x = 2 + Math.floor(rnd() * (TILE_W - 4));
      const y = 2 + Math.floor(rnd() * (TILE_H - 4));
      if (m.dir === 'p') {
        put(x, y, c);
      } else if (m.dir === 'd') {
        put(x, y, c);
        put(x + 1, y, c);
        put(x, y + 1, c);
        put(x + 1, y + 1, c);
      } else if (m.dir === 'v') {
        // A vertical stroke on a 2:1 diamond is a blade standing UP out of the
        // ground plane, which is why rushes and thistles use it.
        for (let i = 0; i < (m.len || 3); i++) put(x, y - i, c);
      } else {
        // Flat along the ground: 2 across, which is one iso "step".
        for (let i = 0; i < (m.len || 2); i++) put(x + i, y + (i & 1 ? 1 : 0), c);
      }
    }
  }

  ctx.putImageData(img, 0, 0);
  grassTileCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// CONTESTED GROUND — a 50% checkerboard of the two competing types.
//
// ZONING.md: "This is not a compromise render." Checkerboard dithering between
// two adjacent values is precisely what period isometric games did at every
// terrain boundary (RESEARCH A5), so contested land reads as deliberately
// unresolved rather than as a bug. It is also one blend routine rather than
// ten tile sets, exactly as ZONING.md asks.
//
// The checker phase is `(x + y) & 1` in WORLD pixels, and every tile's origin
// in the world canvas is a multiple of (32, 16) — both even — so the phase is
// globally continuous and two adjacent contested tiles do not seam.

const blendCache = new Map();

function contestedTile(typeA, typeB, variant) {
  const key = `c${typeA}|${typeB}/${variant}`;
  const hit = blendCache.get(key);
  if (hit) return hit;

  const a = grassTileCanvas(typeA, variant);
  const b = grassTileCanvas(typeB, variant % GRASS_VARIANTS);
  const mask = tileMask();
  const da = ctxOf(a).getImageData(0, 0, TILE_W, TILE_H).data;
  const db = ctxOf(b).getImageData(0, 0, TILE_W, TILE_H).data;

  const cv = makeCanvas(TILE_W, TILE_H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(TILE_W, TILE_H);
  const d = img.data;
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const i = y * TILE_W + x;
      if (!mask[i]) continue;
      const src = (x + y) & 1 ? db : da;
      const j = i * 4;
      d[j] = src[j];
      d[j + 1] = src[j + 1];
      d[j + 2] = src[j + 2];
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  blendCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// SOFT EDGES — where one grass meets another.
//
// ZONING.md asks for "soft dithered edges where a species grass meets neutral
// meadow", and RESEARCH A5 gives the ladder: solid A -> sparse -> 50% checker
// -> sparse -> solid B.
//
// This does the general case rather than only the meadow one, because the
// first version — meadow-only — left every SPECIES-to-SPECIES border as a hard
// straight line, and a hard line between two grasses is the "four zoo pens"
// look that ZONING.md names as the central failure mode. RESEARCH A5 lists
// "terrain-type transitions" as a whole, not one privileged pair.
//
// The cost is controlled by blending toward exactly ONE partner: whichever
// differing type owns the most of this tile's four sides. A tile at a
// three-way junction blends toward the majority neighbour and lets the
// contested checkerboard carry the rest, which is what that mechanic is for.
// Only the tile itself dithers; its neighbour stays pure, so the cache is one
// entry per (type, variant, partner, side mask) and no tile ever has to be
// re-rendered because something two tiles away changed.
//
// Density is a function of distance to the shared edge, in TILE fractions from
// the same inverse transform as the mask, so the band follows the diamond's
// real edge and not its bounding box.

/** Edge mask bits — which cardinal neighbour is plain meadow. */
const EDGE_SE = 1; // (tx+1, ty) — down-right
const EDGE_SW = 2; // (tx, ty+1) — down-left
const EDGE_NW = 4; // (tx-1, ty) — up-left
const EDGE_NE = 8; // (tx, ty-1) — up-right

const EDGE_BAND = 0.42; // in tile widths — how far the blend reaches inward
const EDGE_MAX = 0.5; // 50% checker at the boundary itself, never more

function softEdgeTile(type, variant, other, mask4) {
  const key = `e${type}/${variant}/${other}/${mask4}`;
  const hit = blendCache.get(key);
  if (hit) return hit;

  const base = grassTileCanvas(type, variant);
  const meadow = grassTileCanvas(other, variant);
  const mask = tileMask();
  const { fx, fy } = tileFractions();
  const db = ctxOf(base).getImageData(0, 0, TILE_W, TILE_H).data;
  const dm = ctxOf(meadow).getImageData(0, 0, TILE_W, TILE_H).data;

  const cv = makeCanvas(TILE_W, TILE_H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(TILE_W, TILE_H);
  const d = img.data;

  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const i = y * TILE_W + x;
      if (!mask[i]) continue;
      let dens = 0;
      // Distance to each edge, in tile fractions. The closer to a meadow
      // neighbour, the more meadow shows through.
      if (mask4 & EDGE_SE) dens = Math.max(dens, 1 - fx[i]);
      if (mask4 & EDGE_SW) dens = Math.max(dens, 1 - fy[i]);
      if (mask4 & EDGE_NW) dens = Math.max(dens, fx[i]);
      if (mask4 & EDGE_NE) dens = Math.max(dens, fy[i]);
      dens = dens <= 1 - EDGE_BAND ? 0 : ((dens - (1 - EDGE_BAND)) / EDGE_BAND) * EDGE_MAX;
      const bay = BAYER4[(y & 3) * 4 + (x & 3)] / 16;
      const src = bay < dens ? dm : db;
      const j = i * 4;
      d[j] = src[j];
      d[j + 1] = src[j + 1];
      d[j + 2] = src[j + 2];
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  blendCache.set(key, cv);
  return cv;
}

/**
 * The top face of a grass tile: the type, its contested partner if any, and
 * the soft edge it grows toward a differing neighbour. One entry point so the
 * caches above stay private and the column drawer stays readable.
 *
 * @param {number} type    grass type index
 * @param {number|null} contest  the losing type on contested ground
 * @param {{other:number,mask:number}|null} blend  edge partner and sides
 */
export function groundTile(tx, ty, type, contest, blend) {
  const variant = Math.floor(hash2(tx, ty, 90210) * GRASS_VARIANTS) % GRASS_VARIANTS;
  const t = GRASS_TYPES[type] || 'meadow';
  if (contest != null && contest !== type) {
    // Contested ground is already a dither. Adding an edge blend on top of a
    // checkerboard is how a deliberate technique turns back into noise.
    return contestedTile(t, GRASS_TYPES[contest] || 'meadow', variant);
  }
  if (blend && blend.mask) {
    return softEdgeTile(t, variant, GRASS_TYPES[blend.other] || 'meadow', blend.mask);
  }
  return grassTileCanvas(t, variant);
}

// A NOTE ON A BUG THAT IS NOW STRUCTURALLY IMPOSSIBLE, kept because the shape
// of it recurs. Water used to be re-stamped in place with `clearRect(bx, by,
// 64, 32)`, which clears the tile's bounding BOX — half full of its four
// neighbouring diamonds. That punched ~5,800 transparent pixels into the
// terrain cache around every pond and the sky showed through them as a pale
// fringe that looked, very convincingly, like a deliberate shoreline. The fix
// then was an opaque-diamond `destination-out` punch. With height that fix is
// no longer sufficient EITHER, because a column in front may legitimately have
// painted over the diamond. `_stampRegion` supersedes both: clip, clear,
// repaint every column that touches the rectangle, in draw order.

/** Plain meadow at this tile — the floor under everything, and the fallback. */
function grassTile(tx, ty) {
  return groundTile(tx, ty, MEADOW, null, 0);
}

// ===========================================================================
// CLIFF FACES (docs/ELEVATION.md, "Cliff faces")
// ===========================================================================
//
// A tile standing above its SE or SW neighbour exposes that side. The face is
// a vertical quad hanging off one of the diamond's two lower edges, both of
// which are the line v = 32 - |u| / 2 measured from the north vertex.
//
// SHADING, from SPEC §3 and RESEARCH A4 — for a 2:1 cube lit from upper left:
//   top face    ramp index 4 (the grass, which is its own thing)
//   LEFT face   ramp index 3 — the SW side, turned toward the light
//   RIGHT face  ramp index 1-2 — the SE side, in shadow
// One ramp step top->left, one to two left->right. Consistency is law, so both
// sides come out of one table and neither is authored by eye.
//
// FOUR DETAILS EARN THEIR KEEP, and the last is the one that matters most:
//   * seeded variants, so a long cliff is not a repeating strip,
//   * a 1px darker line every LEVEL_H, so a 4-level cliff reads as four
//     courses rather than as one tall slab,
//   * blocky vertical striation — never 1px noise, which shimmers,
//   * THE SOIL CAP. Two or three pixels of the ground ramp darkened two steps
//     right under the grass line, then one of earth. Without it a cliff is a
//     pasted rectangle; with it the turf visibly sits ON the rock.

// A face's body is ONE ramp index per side and the texture moves +-1 around it.
// The first version reached the whole ramp (index 0 to 3 on a four-entry rock
// ramp) and every cliff came out a barcode: at 16px per course the eye reads
// value variation as pattern, not as surface. A cliff wants to read as one
// material catching one light. Keep the spread to one step, and let the SIDE
// carry the contrast — that is what makes the cubes legible.
const FACE_KINDS = {
  rock: { ramp: RAMPS.rock.hex, lit: 2, shade: 1 },
  earth: { ramp: RAMPS.earth.hex, lit: 2, shade: 1 },
  mossy: { ramp: RAMPS.rock.hex, lit: 2, shade: 1, moss: RAMPS.cypress.hex[1] },
};

const FACE_VARIANTS = 4;
const faceCache = new Map();

/**
 * One cliff face. `side` is 'se' or 'sw'; `rise` is in pixels (a multiple of
 * LEVEL_H). The canvas is 32 wide and (16 + rise) tall, covering the half of
 * the tile box below one lower edge, and is drawn at the tile's north vertex
 * offset by (0, 16) for 'se' or (-32, 16) for 'sw'.
 */
function cliffFace(kind, side, rise, variant) {
  const key = `${kind}/${side}/${rise}/${variant}`;
  const hit = faceCache.get(key);
  if (hit) return hit;

  const cfg = FACE_KINDS[kind] || FACE_KINDS.rock;
  const w = HALF_W;
  const h = HALF_H + rise;
  const cv = makeCanvas(w, h);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const rnd = rng(0x1234567 ^ Math.imul(variant + 1, 0x9e3779b9) ^ (side === 'se' ? 0x55 : 0xaa));

  const bi = side === 'sw' ? cfg.lit : cfg.shade;
  const last = cfg.ramp.length - 1;
  const body = hexToRGB(cfg.ramp[bi]);
  const light = hexToRGB(cfg.ramp[Math.min(last, bi + 1)]);
  const dark = hexToRGB(cfg.ramp[Math.max(0, bi - 1)]);
  const crevice = hexToRGB(cfg.ramp[0]);
  const moss = cfg.moss ? hexToRGB(cfg.moss) : null;
  // The soil cap: the ground ramp darkened two steps (palette.js's own rule
  // for a contact shadow), then one course of earth under it.
  const soil = hexToRGB(PALETTE.get(contactShadow(GROUND_DEFAULT)) || RAMPS.grass.hex[0]);
  const soil2 = hexToRGB(RAMPS.earth.hex[1]);

  // Pre-roll one striation class per pixel column so the texture is vertical
  // and blocky (3-6px wide) rather than per-pixel noise. Most columns are
  // plain body — the variation is punctuation, not a pattern.
  const stripe = new Int8Array(w);
  for (let x = 0; x < w; ) {
    const run = 3 + Math.floor(rnd() * 4);
    const r = rnd();
    const v = r < 0.2 ? 1 : r < 0.36 ? -1 : 0;
    for (let k = 0; k < run && x < w; k++, x++) stripe[x] = v;
  }

  // A handful of blocks per course — 2-3px across, never a stray single pixel,
  // which shimmers (RESEARCH A6 "fuzzy edge").
  const blocks = [];
  const courses = Math.max(1, Math.round(rise / LEVEL_H));
  for (let k = 0; k < courses * 3; k++) {
    blocks.push({
      x: Math.floor(rnd() * w),
      y: Math.floor(rnd() * rise),
      w: 2 + Math.floor(rnd() * 2),
      h: 2,
      up: rnd() < 0.5,
    });
  }
  const blockAt = (x, dy) => {
    for (const b of blocks) {
      if (x >= b.x && x < b.x + b.w && dy >= b.y && dy < b.y + b.h) return b.up ? light : dark;
    }
    return null;
  };
  // Moss hangs in clumps off the lip, not as a uniform fringe.
  const mossRun = new Int8Array(w);
  if (moss) {
    for (let x = 0; x < w; ) {
      const run = 2 + Math.floor(rnd() * 5);
      const on = rnd() < 0.45 ? 2 + Math.floor(rnd() * 5) : 0;
      for (let k = 0; k < run && x < w; k++, x++) mossRun[x] = on;
    }
  }

  for (let i = 0; i < w; i++) {
    const u = side === 'se' ? i + 0.5 : i - HALF_W + 0.5;
    const vTop = TILE_H - Math.abs(u) / 2;
    for (let j = 0; j < h; j++) {
      const v = HALF_H + j + 0.5;
      const dv = v - vTop;
      if (dv < 0 || dv > rise) continue;
      let c;
      if (dv < 2) c = soil; // THE SOIL CAP — the turf sitting ON the rock
      else if (dv < 3) c = soil2;
      else if (moss && dv < 3 + mossRun[i]) c = moss;
      else {
        c = stripe[i] > 0 ? light : stripe[i] < 0 ? dark : body;
        // Course lines: one darker pixel every LEVEL_H, so a 4-level cliff
        // reads as four courses rather than as one tall slab.
        if (dv > LEVEL_H - 1 && dv % LEVEL_H < 1) c = crevice;
        else {
          const b = blockAt(i, Math.floor(dv));
          if (b) c = b;
        }
      }
      const k = (j * w + i) * 4;
      d[k] = c[0];
      d[k + 1] = c[1];
      d[k + 2] = c[2];
      d[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  faceCache.set(key, cv);
  return cv;
}

// ===========================================================================
// WATERFALLS (docs/ELEVATION.md, "Water")
// ===========================================================================
//
// "The motion comes from PALETTE CYCLING on the existing water ramp — the same
// trick as the pond, no new animation system."
//
// So the fall is authored the way tiles.js authors water: as an INDEX buffer
// into the six-entry water ramp, rasterised through `cycleWater(phase)`. No
// shape ever moves; only the colours the indices point at rotate.
//
// THE DIRECTION IS NOT FREE, and getting it wrong gives a waterfall that runs
// UP the cliff, which is both wrong and hilarious. `cycleWater(p)` shows a
// pixel of index i in `hex[(i + p) % 6]`, so the brightest band sits where
// i === 5 - p. If the index INCREASES downward, that band climbs as p rises.
// Indices therefore DECREASE downward:  idx = (-dv) mod 6.

const WATER_KEYS = RAMPS.water.keys; // 'FGHIJK'
const WF_VARIANTS = 3;
const waterfallCache = new Map();

/** The index buffer for a fall, built once per (side, rise, variant). */
function waterfallIndices(side, rise, variant) {
  const key = `i${side}/${rise}/${variant}`;
  const hit = waterfallCache.get(key);
  if (hit) return hit;

  const w = HALF_W;
  const h = HALF_H + rise;
  const idx = new Uint8Array(w * h).fill(255); // 255 = transparent
  const rnd = rng(0xfa11 ^ Math.imul(variant + 1, 0x9e3779b9) ^ (side === 'se' ? 7 : 13));
  // Per-column phase offset and a per-column "rope" brightness, so the sheet
  // breaks into strands the way a real fall does instead of reading as a
  // striped curtain.
  const offset = new Int8Array(w);
  const rope = new Int8Array(w);
  for (let x = 0; x < w; ) {
    const run = 2 + Math.floor(rnd() * 4);
    const off = Math.floor(rnd() * 6);
    const rp = rnd() < 0.3 ? 1 : rnd() < 0.35 ? -1 : 0;
    for (let k = 0; k < run && x < w; k++, x++) {
      offset[x] = off;
      rope[x] = rp;
    }
  }

  for (let i = 0; i < w; i++) {
    const u = side === 'se' ? i + 0.5 : i - HALF_W + 0.5;
    const vTop = TILE_H - Math.abs(u) / 2;
    for (let j = 0; j < h; j++) {
      const v = HALF_H + j + 0.5;
      const dv = v - vTop;
      if (dv < 0 || dv > rise) continue;
      // The band is a function of the SCREEN ROW, not of depth below the lip.
      // That distinction is the difference between a sheet of falling water
      // and a herringbone: the lip is a slanted iso edge, so bands measured
      // from it come out as chevrons, and chevrons read as pattern. Water
      // falls straight down the screen, so the bands run straight across it.
      //
      // Decreasing downward, so the pattern falls (see the note above). The
      // >>1 doubles the vertical period to 12px: at 6px the bands were tighter
      // than the tile is tall and the fall read as scribble rather than as
      // moving water. One palette step now slides the sheet 2px, which at 8Hz
      // is a plausible fall speed.
      let k = (-((j >> 1) + offset[i]) % 6 + 6) % 6;
      k = Math.max(0, Math.min(5, k + rope[i]));
      // The lip is bright — water goes white where it leaves the edge — and
      // the strand darkens as it thins on the way down.
      if (dv < 2) k = 5;
      else if (dv > rise - 3) k = Math.min(5, k + 1);
      idx[j * w + i] = k;
    }
  }
  waterfallCache.set(key, idx);
  return idx;
}

/** Rasterise a fall for one palette phase. Six phases, then it is all cache. */
function waterfallFace(side, rise, variant, phase) {
  const key = `f${side}/${rise}/${variant}/${phase}`;
  const hit = waterfallCache.get(key);
  if (hit) return hit;

  const idx = waterfallIndices(side, rise, variant);
  const w = HALF_W;
  const h = HALF_H + rise;
  const resolve = cycleWater(phase);
  const lut = [];
  for (let i = 0; i < 6; i++) lut.push(hexToRGB(resolve(WATER_KEYS[i])));

  const cv = makeCanvas(w, h);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < idx.length; i++) {
    const k = idx[i];
    if (k === 255) continue;
    const c = lut[k];
    const j = i * 4;
    d[j] = c[0];
    d[j + 1] = c[1];
    d[j + 2] = c[2];
    d[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  waterfallCache.set(key, cv);
  return cv;
}

/**
 * The foam cap at the foot of a fall. Drawn on the LOWER tile's top face, so
 * it is stamped when that tile's column is drawn — otherwise the lower tile
 * would paint straight over it.
 */
const FOAM_W = 30;
const FOAM_H = 11;

function foamCap(variant, phase, big) {
  const key = `foam${variant}/${phase}/${big ? 1 : 0}`;
  const hit = waterfallCache.get(key);
  if (hit) return hit;

  const resolve = cycleWater(phase);
  const lut = [];
  for (let i = 0; i < 6; i++) lut.push(hexToRGB(resolve(WATER_KEYS[i])));
  const cv = makeCanvas(FOAM_W, FOAM_H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(FOAM_W, FOAM_H);
  const d = img.data;
  const rnd = rng(0xf0a3 ^ Math.imul(variant + 1, 0x85ebca6b));
  const cx = FOAM_W / 2;
  const cy = FOAM_H / 2;
  const rx = big ? 14 : 11;
  const ry = big ? 5 : 4;
  for (let y = 0; y < FOAM_H; y++) {
    for (let x = 0; x < FOAM_W; x++) {
      const u = (x - cx + 0.5) / rx;
      const v = (y - cy + 0.5) / ry;
      const t = Math.abs(u) + Math.abs(v); // a diamond, matching the tile
      if (t > 1) continue;
      // Bright at the middle where the water lands, falling off outward, with
      // a ragged edge so it does not read as a stamped ellipse.
      if (t > 0.72 && rnd() < 0.55) continue;
      const k = t < 0.3 ? 5 : t < 0.62 ? 4 : 3;
      const c = lut[k];
      const j = (y * FOAM_W + x) * 4;
      d[j] = c[0];
      d[j + 1] = c[1];
      d[j + 2] = c[2];
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  waterfallCache.set(key, cv);
  return cv;
}

/**
 * A plain water top, for when the scene flags a tile `water` but hands over no
 * art. art/tiles.js's lattice-continuous water is far better and is used
 * whenever it is offered; this exists so the renderer can draw a pond from a
 * scene that is nothing but levels and flags — which is what the elevation
 * probes and a half-built game hand it.
 *
 * Same index-buffer trick as the fall, so it cycles through the same resolver.
 */
const plainWaterCache = new Map();

function plainWaterTile(tx, ty, phase) {
  // The pattern must NOT vary from tile to tile or a lake stops reading as one
  // surface (art/tiles.js learned this the hard way and says so). The bands are
  // therefore a function of WORLD position, and the cache key is the tile's
  // parity, not its coordinates.
  const par = (((tx + ty) % 2) + 2) % 2;
  const key = `${par}/${phase}`;
  const hit = plainWaterCache.get(key);
  if (hit) return hit;

  const mask = tileMask();
  const resolve = cycleWater(phase);
  const lut = [];
  for (let i = 0; i < 6; i++) lut.push(hexToRGB(resolve(WATER_KEYS[i])));
  const cv = makeCanvas(TILE_W, TILE_H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(TILE_W, TILE_H);
  const d = img.data;
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const i = y * TILE_W + x;
      if (!mask[i]) continue;
      // Irregular streaks along the diamond's long axis (RESEARCH A7).
      const wy = y + par * TILE_H;
      const band = Math.sin(wy * 0.7 + Math.cos(x * 0.21) * 1.7) * 1.8 + 2.2;
      const k = Math.max(0, Math.min(5, Math.round(band)));
      const c = lut[k];
      const j = i * 4;
      d[j] = c[0];
      d[j + 1] = c[1];
      d[j + 2] = c[2];
      d[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  plainWaterCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Contact shadows.
//
// SPEC §3: a skirt in the GROUND RAMP DARKENED TWO STEPS, plus a half-diamond
// offset a few px away from the light. NEVER translucent black — that greys
// the whole scene and is the single clearest modern tell. Two opaque tones:
// the core in ground-2 and a one-pixel ring in ground-1, which softens the
// edge without touching alpha.

const shadowCache = new Map();

function shadowStamp(fw, fh, groundKey, scale = 1) {
  const key = `${fw}x${fh}:${groundKey}:${scale}`;
  const hit = shadowCache.get(key);
  if (hit) return hit;

  const span = ((fw + fh) / 2) * SHADOW_SCALE * scale;
  const hw = Math.max(5, Math.round(HALF_W * span));
  const hh = Math.max(3, Math.round(HALF_H * span));
  const w = hw * 2 + 4;
  const h = hh * 2 + 4;

  const core = hexToRGB(PALETTE.get(contactShadow(groundKey)) || PALETTE.get('m'));
  const ring = hexToRGB(PALETTE.get(shade(groundKey, -1)) || PALETTE.get('n'));
  const ringT = 1 + SHADOW_RING / hh;

  const cv = makeCanvas(w, h);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x - w / 2 + 0.5) / hw;
      const v = (y - h / 2 + 0.5) / hh;
      const t = Math.abs(u) + Math.abs(v);
      if (t > ringT) continue;
      const c = t <= 1 ? core : ring;
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const stamp = { canvas: cv, ax: w >> 1, ay: h >> 1 };
  shadowCache.set(key, stamp);
  return stamp;
}

// ---------------------------------------------------------------------------
// The field overlay stamps.
//
// One 64x32 diamond per quantised level, precomputed per axis. Coverage comes
// from a 4x4 Bayer threshold and the colour from a second, decorrelated Bayer
// phase dithering between adjacent ramp entries. Because tile positions in the
// world canvas are always multiples of (32, 16) — both divisible by 4 — the
// Bayer phase is globally consistent and the dither does not seam at tile
// boundaries.

const overlayStampCache = new Map();

/**
 * `side` splits a four-entry ramp into two ladders for a SIGNED axis, both
 * starting from nothing:
 *
 *   'more'  neutral -> the ramp's top    (wilder, tidier, quieter, wetter)
 *   'less'  neutral -> the ramp's bottom (tamer, looser, more open, drier)
 *   'up'    the whole ramp, for unsigned axes, which only ever go one way
 *
 * Three of the five axes run both ways from zero, and a single low-to-high
 * ladder cannot say that: it puts untouched turf in the MIDDLE of the ramp, so
 * an empty glade comes back washed at half strength everywhere and the overlay
 * answers a question nobody asked. Neutral has to be invisible.
 */
function overlayStamps(axis, side = 'up') {
  const cacheKey = `${axis}/${side}`;
  const hit = overlayStampCache.get(cacheKey);
  if (hit) return hit;

  const hexes = OVERLAY_RAMPS[axis] || OVERLAY_RAMPS.wildness;
  const half =
    side === 'more'
      ? hexes.slice(Math.floor(hexes.length / 2))
      : side === 'less'
        ? hexes.slice(0, Math.ceil(hexes.length / 2)).reverse()
        : hexes;
  const lut = half.map(hexToRGB);
  const mask = tileMask();
  const stamps = [];

  for (let level = 0; level < OVERLAY_LEVELS; level++) {
    const t = level / (OVERLAY_LEVELS - 1);
    const cover = Math.min(1, t / OVERLAY_FADE_IN) * OVERLAY_MAX_COVER;
    if (cover <= 0.0001) {
      stamps.push(null);
      continue;
    }
    const cf = t * (lut.length - 1);
    const lo = Math.floor(cf);
    const hi = Math.min(lut.length - 1, lo + 1);
    const frac = cf - lo;

    const cv = makeCanvas(TILE_W, TILE_H);
    const ctx = ctxOf(cv);
    const img = ctx.createImageData(TILE_W, TILE_H);
    const d = img.data;
    for (let ly = 0; ly < TILE_H; ly++) {
      for (let lx = 0; lx < TILE_W; lx++) {
        if (!mask[ly * TILE_W + lx]) continue;
        const bc = BAYER4[(ly & 3) * 4 + (lx & 3)] / 16;
        if (bc >= cover) continue;
        const bh = BAYER4[((ly + 2) & 3) * 4 + ((lx + 1) & 3)] / 16;
        const c = lut[bh < frac ? hi : lo];
        const i = (ly * TILE_W + lx) * 4;
        d[i] = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    stamps.push(cv);
  }

  overlayStampCache.set(cacheKey, stamps);
  return stamps;
}

// ---------------------------------------------------------------------------
/**
 * Punch a Bayer stipple through a raster so it reads as provisional without
 * an alpha blend.
 *
 * This replaced a `globalAlpha = 0.78` on the ghost sprite. The alpha version
 * looked fine but it was the ONLY thing in the renderer producing colours that
 * are not in palette.js — a frame audit found 59 blended near-duplicates, all
 * of them under the ghost, which is exactly the "too many colours" failure in
 * RESEARCH A9.4. A stipple costs nothing, is what a period game would have had
 * to do anyway, and keeps the frame provably palette-pure.
 */
const stippleCache = new WeakMap();

/**
 * THE TRANSIT FADE — docs/CREATURE-MOVEMENT.md §1.
 *
 * How many solid steps the 0..1 fade is quantised to. Four, plus "gone" and
 * "solid", which the caller handles by not drawing and by not dissolving. A
 * 4x4 Bayer matrix can express seventeen coverages, but a period game would
 * have had a handful of dither masks and no more, and four reads as a fade
 * rather than as a fog. It also bounds the raster cache: four extra bitmaps per
 * creature frame, not a continuum of them.
 */
const DISSOLVE_STEPS = 4;

/**
 * Dissolve a raster to `fade` (0..1) with the same Bayer stipple the ghost uses.
 *
 * A stipple rather than `globalAlpha` for exactly the reason `stippled` gives
 * below: alpha is the one thing that produces colours palette.js never
 * authored, and a creature fading through the dusk would put a whole extra
 * blend ladder into every frame it appeared in. A dissolve costs one cached
 * bitmap per step and is what the period actually did.
 *
 * Returns the raster untouched at full fade so the common case pays nothing.
 */
function dissolved(art, variantKey, raster, fade) {
  if (!(fade < 1)) return raster;
  const step = Math.round(fade * (DISSOLVE_STEPS + 1));
  if (step > DISSOLVE_STEPS) return raster; // near enough solid to draw solid
  // Never step 0: "gone" is the caller's decision (it stops drawing entirely),
  // not a bitmap with nothing in it.
  const s = step < 1 ? 1 : step;
  return stippled(art, `${variantKey}#fade${s}`, raster, s / (DISSOLVE_STEPS + 1));
}

function stippled(art, key, raster, cover = 0.625) {
  let byKey = stippleCache.get(art);
  if (!byKey) {
    byKey = new Map();
    stippleCache.set(art, byKey);
  }
  let hit = byKey.get(key);
  if (hit) return hit;
  const { canvas, w, h } = raster;
  const cv = makeCanvas(w, h);
  const ctx = ctxOf(cv);
  const img = ctxOf(canvas).getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (BAYER4[(y & 3) * 4 + (x & 3)] / 16 < cover) continue;
      d[(y * w + x) * 4 + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  hit = { canvas: cv, ax: raster.ax, ay: raster.ay, w, h };
  byKey.set(key, hit);
  return hit;
}

// ---------------------------------------------------------------------------
// Ghost preview footprint plate.
//
// A 25% dithered diamond so the player can see the tiles the thing will eat,
// under the tinted sprite. Green = legal, terracotta = not (SPEC §8).

const plateCache = new Map();

function ghostPlate(legal) {
  const key = legal ? 'ok' : 'bad';
  const hit = plateCache.get(key);
  if (hit) return hit;
  const hexes = legal ? RAMPS.canopy.hex : RAMPS.terracotta.hex;
  const fill = hexToRGB(hexes[hexes.length - 1]);
  const edge = hexToRGB(hexes[hexes.length - 2]);
  const mask = tileMask();
  const cv = makeCanvas(TILE_W, TILE_H);
  const ctx = ctxOf(cv);
  const img = ctx.createImageData(TILE_W, TILE_H);
  const d = img.data;
  for (let ly = 0; ly < TILE_H; ly++) {
    for (let lx = 0; lx < TILE_W; lx++) {
      const inside = mask[ly * TILE_W + lx];
      if (!inside) continue;
      // outline: a masked pixel with an unmasked 4-neighbour
      const left = lx > 0 ? mask[ly * TILE_W + lx - 1] : 0;
      const right = lx < TILE_W - 1 ? mask[ly * TILE_W + lx + 1] : 0;
      const up = ly > 0 ? mask[(ly - 1) * TILE_W + lx] : 0;
      const down = ly < TILE_H - 1 ? mask[(ly + 1) * TILE_W + lx] : 0;
      const isEdge = !left || !right || !up || !down;
      const bc = BAYER4[(ly & 3) * 4 + (lx & 3)] / 16;
      let c = null;
      if (isEdge) c = edge;
      else if (bc < 0.25) c = fill;
      if (!c) continue;
      const i = (ly * TILE_W + lx) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  plateCache.set(key, cv);
  return cv;
}

// ---------------------------------------------------------------------------
// Integer scale.

/** The largest whole-number scale that fits 640x400 in the window. Never 0. */
export function pickScale(winW, winH, maxScale = MAX_SCALE) {
  const s = Math.floor(Math.min(winW / BACKING_W, winH / BACKING_H));
  return Math.max(1, Math.min(maxScale, Number.isFinite(s) ? s : 1));
}

// ---------------------------------------------------------------------------
// The renderer.

class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   *   maxScale        default 3
   *   reducedMotion   default read from prefers-reduced-motion
   *   waterHz         default 8
   *   overlayLayer    'ground' (default) | 'top'
   *   overlayAlpha    default 1 — the DITHER is the translucency. Setting this
   *                   below 1 blends and so puts colours on screen that are
   *                   not in palette.js; it is here as an escape hatch, not as
   *                   a knob to reach for.
   *   easing          camera ease factor 0..1, default 0.28
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.opts = opts;

    // LAW 1: the backing store is 640x400 and never changes.
    canvas.width = BACKING_W;
    canvas.height = BACKING_H;
    this.ctx = ctxOf(canvas);

    canvas.style.imageRendering = 'pixelated';
    canvas.style.display = 'block';
    // belt and braces for older engines
    if (!canvas.style.imageRendering) canvas.style.imageRendering = 'crisp-edges';

    this.maxScale = opts.maxScale ?? MAX_SCALE;
    this.scale = 1;
    this.waterHz = opts.waterHz ?? WATER_HZ;
    this.overlayAlpha = opts.overlayAlpha ?? 1;
    this.overlayLayer = opts.overlayLayer ?? 'ground'; // 'ground' | 'top'
    this.easing = opts.easing ?? 0.28;
    this.reducedMotion =
      opts.reducedMotion ??
      (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false);

    this.mapW = MAP_W;
    this.mapH = MAP_H;

    /** Live camera (may be fractional while easing) and its target. */
    this.camera = { x: 0, y: 0 };
    this.target = { x: 0, y: 0 };
    /** The SNAPPED camera actually used for drawing AND for picking, so a
     *  click never lands one pixel away from what the player saw. */
    this._cam = { x: 0, y: 0 };

    this.scene = null;
    // `undefined` means "the renderer has no opinion, use scene.overlay.axis";
    // `null` means the player pressed Tab past the last axis and wants the
    // wash OFF. Conflating the two made setOverlay(null) a no-op.
    this.overlayAxis = undefined;
    // Same rule as overlayAxis: undefined = defer to scene.ghost, null = none.
    this.ghost = undefined;

    this._terrainCv = null;
    this._terrainKey = null;
    this._waterPhase = -1;

    // --- the terrain snapshot (docs/ELEVATION.md + docs/ZONING.md) ---------
    // Flat typed arrays rather than a per-tile object graph: the column
    // painter walks these ~1200 times on a rebuild and the whole point of the
    // cache is that a rebuild is cheap enough to be unremarkable.
    this._lv = null; // level per tile
    this._gt = null; // TARGET grass type per tile (255 = none)
    this._gt2 = null; // target contested partner
    this._gtShown = null; // DISPLAYED grass type — the spread lags the target
    this._gt2Shown = null;
    this._wet = null;
    this._art = null;
    this._faceArt = null; // per-side decals — a cave mouth set into a cliff
    this._ground = null;
    this._anim = []; // tiles restamped every palette phase
    this._animRect = null;
    this._spread = new Map(); // tile index -> when it flips
    this._grassInit = false;
    this._time = 0;

    this._overlayCv = null;
    this._overlayKey = null;

    this._dirty = true;
    this._running = false;
    this._raf = 0;
    this._onResize = () => this.resize();

    this.stats = { frames: 0, lastMs: 0, drawn: 0, sorted: 0, terrainMs: 0 };

    // The cache is the map's screen box PLUS MAX_RISE of headroom, so a
    // plateau on the back row is not sliced off the top.
    this._world = worldBounds(this.mapW, this.mapH);
    this.centreOnTile(this.mapW / 2 - 0.5, this.mapH / 2 - 0.5, true);
    this.resize();
  }

  // -- lifecycle ------------------------------------------------------------

  attach() {
    if (typeof addEventListener === 'function') addEventListener('resize', this._onResize);
    return this;
  }

  detach() {
    if (typeof removeEventListener === 'function') removeEventListener('resize', this._onResize);
    this.stop();
    return this;
  }

  start() {
    if (this._running) return this;
    this._running = true;
    const tick = (now) => {
      if (!this._running) return;
      this._raf = requestAnimationFrame(tick);
      this.frame(now);
    };
    this._raf = requestAnimationFrame(tick);
    return this;
  }

  stop() {
    this._running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    return this;
  }

  // -- sizing ---------------------------------------------------------------

  /**
   * LAW 3. Whole-number CSS upscale only. The backing store is untouched; the
   * browser blows up 640x400 by an integer with smoothing off, which is
   * exactly what a period game did with a mode-set.
   */
  resize(winW, winH) {
    const w = winW ?? (typeof innerWidth === 'number' ? innerWidth : BACKING_W);
    const h = winH ?? (typeof innerHeight === 'number' ? innerHeight : BACKING_H);
    const s = pickScale(w, h, this.maxScale);
    if (s !== this.scale) {
      this.scale = s;
      this._dirty = true;
    }
    this.canvas.style.width = BACKING_W * s + 'px';
    this.canvas.style.height = BACKING_H * s + 'px';
    return this;
  }

  // -- camera ---------------------------------------------------------------

  /**
   * The camera gets MAX_RISE of extra travel UPWARD and none downward, so a
   * plateau on the back row can be brought fully into view without also
   * letting the player pan off the bottom of the world into empty sky.
   */
  clampTarget() {
    this.target = clampCamera(this.target, this.mapW, this.mapH, BACKING_W, BACKING_H, { top: MAX_RISE });
    return this;
  }

  panBy(dx, dy) {
    this.target.x += dx;
    this.target.y += dy;
    this.clampTarget();
    this._dirty = true;
    return this;
  }

  /** Drag panning: no easing, the camera must stay under the pointer. */
  dragBy(dx, dy) {
    this.target.x += dx;
    this.target.y += dy;
    this.clampTarget();
    this.camera.x = this.target.x;
    this.camera.y = this.target.y;
    this._dirty = true;
    return this;
  }

  panTo(x, y, immediate = false) {
    this.target = { x, y };
    this.clampTarget();
    if (immediate || this.reducedMotion) {
      this.camera.x = this.target.x;
      this.camera.y = this.target.y;
    }
    this._dirty = true;
    return this;
  }

  centreOnTile(tx, ty, immediate = false) {
    const c = cameraCentredOn(tx, ty, BACKING_W, BACKING_H);
    return this.panTo(c.x, c.y, immediate);
  }

  get cameraBounds() {
    return cameraBounds(this.mapW, this.mapH, BACKING_W, BACKING_H, { top: MAX_RISE });
  }

  // -- picking --------------------------------------------------------------

  /**
   * A DOM event's client coords -> tile. Divides out the integer scale, which
   * only this module knows, and uses the SNAPPED camera so picking agrees with
   * what was drawn to the pixel.
   *
   * ELEVATION: this is `iso.pickTileAt`, which walks candidate columns FRONT
   * TO BACK — the exact reverse of the order `_paintColumns` drew them in — so
   * the tile it returns is the one whose pixels the player is actually looking
   * at, whether that is a top face or a cliff face. The height data is the
   * renderer's own snapshot, which is the same data the columns were drawn
   * from, so a click can never disagree with the picture even for the one
   * frame after a terrain edit.
   *
   * @returns {{fx,fy,tx,ty,level,face,hit,inBounds}}
   */
  pickTile(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const sx = (clientX - r.left) / this.scale;
    const sy = (clientY - r.top) / this.scale;
    return this.pickScreen(sx, sy);
  }

  /** The same pick from logical canvas coords. For tests and the probes. */
  pickScreen(sx, sy) {
    return pickTileAt(sx, sy, this._cam, {
      levels: this._lv || 0,
      mapW: this.mapW,
      mapH: this.mapH,
    });
  }

  /** Tile -> position in CSS pixels relative to the canvas. For tooltips. */
  screenOfTile(tx, ty, level) {
    const h = level == null ? this._levelAt(Math.floor(tx), Math.floor(ty)) : level;
    const p = toScreenAt(tx + 0.5, ty + 0.5, h, this._cam);
    return { x: p.x * this.scale, y: p.y * this.scale };
  }

  /** The height of a tile as the renderer currently understands it. */
  levelAt(tx, ty) {
    return this._levelAt(tx, ty);
  }

  /**
   * The palette key a contact shadow on this tile is made of. The scene's own
   * `ground` key wins if it gave one; otherwise the tile's grass supplies it,
   * so a tree standing on a fen casts a fen-coloured shadow.
   */
  _groundKeyAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return null;
    const i = ty * this.mapW + tx;
    if (this._ground && this._ground[i]) return this._ground[i];
    const g = this._gtShown ? this._gtShown[i] : 255;
    return g === 255 ? null : GRASS_SHADOW_KEY[g];
  }

  _now() {
    return this._time || (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  // -- scene ----------------------------------------------------------------

  setScene(scene) {
    this.scene = scene;
    if (scene) {
      const mw = scene.mapW ?? MAP_W;
      const mh = scene.mapH ?? MAP_H;
      if (mw !== this.mapW || mh !== this.mapH) {
        this.mapW = mw;
        this.mapH = mh;
        this._world = worldBounds(mw, mh);
        this.invalidateTerrain();
        this.invalidateFields();
        this.clampTarget();
      }
    }
    this._dirty = true;
    return this;
  }

  /**
   * SPEC §6/§8: Tab cycles axes. Pass `null` to turn the wash OFF, or
   * `undefined` to hand the choice back to `scene.overlay.axis`.
   */
  setOverlay(axis) {
    if (this.overlayAxis === axis) return this;
    this.overlayAxis = axis;
    this._overlayKey = null;
    this._dirty = true;
    return this;
  }

  /** The axis currently washing the map, or null. */
  get overlay() {
    const ov = this.scene && this.scene.overlay;
    return this.overlayAxis !== undefined ? this.overlayAxis : (ov && ov.axis) || null;
  }

  /** Tab: next axis, then off, then round again. */
  cycleOverlay(axes = Object.keys(OVERLAY_RAMPS)) {
    const cur = this.overlay;
    const i = axes.indexOf(cur);
    return this.setOverlay(cur === null ? axes[0] : i + 1 >= axes.length ? null : axes[i + 1]);
  }

  /** `null` clears the preview (Esc); `undefined` defers to `scene.ghost`. */
  setGhost(ghost) {
    this.ghost = ghost;
    this._dirty = true;
    return this;
  }

  invalidateTerrain() {
    this._terrainKey = null;
    this._dirty = true;
    return this;
  }

  invalidateFields() {
    this._overlayKey = null;
    this._dirty = true;
    return this;
  }

  requestDraw() {
    this._dirty = true;
    return this;
  }

  // -- the frame ------------------------------------------------------------

  frame(now = 0) {
    this._time = now;
    // Camera easing. SPEC §0: prefers-reduced-motion stops camera easing.
    if (!this.reducedMotion) {
      const dx = this.target.x - this.camera.x;
      const dy = this.target.y - this.camera.y;
      if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
        this.camera.x += dx * this.easing;
        this.camera.y += dy * this.easing;
        this._dirty = true;
      } else if (this.camera.x !== this.target.x || this.camera.y !== this.target.y) {
        this.camera.x = this.target.x;
        this.camera.y = this.target.y;
        this._dirty = true;
      }
    } else {
      this.camera.x = this.target.x;
      this.camera.y = this.target.y;
    }

    // Water palette cycling, on its own timer (RESEARCH A7). Idle animation,
    // so reduced-motion freezes it at phase 0.
    const phase = this.reducedMotion ? 0 : Math.floor((now / 1000) * this.waterHz) % WATER_PHASES;
    if (phase !== this._waterPhase) {
      this._waterPhase = phase;
      if (this._restampWater()) this._dirty = true;
    }

    // The grass spreads on its own clock (ZONING.md). Cheap when nothing is
    // moving: an empty Map and one branch.
    if (this._advanceSpread(now)) this._dirty = true;

    // Movers must redraw every frame; a static garden costs nothing.
    const sc = this.scene;
    if (sc && sc.creatures && sc.creatures.length) this._dirty = true;

    if (!this._dirty) return;
    this._dirty = false;
    this.draw();
  }

  // -- layers ---------------------------------------------------------------

  // =========================================================================
  // TERRAIN — COLUMNS (docs/ELEVATION.md)
  // =========================================================================
  //
  // Terrain is no longer a grid of diamonds; it is a field of stacked
  // flat-topped cubes. A tile standing above its SE or SW neighbour exposes
  // that side as a vertical face, so each tile draws as a COLUMN: its two
  // front faces from the bottom up, then its top.
  //
  // Order: back to front by (tx + ty), and within a diagonal row left to right
  // by tx. That is the exact reverse of the walk `iso.pickColumn` does, which
  // is what makes picking and drawing provably agree.
  //
  // It all still lands in ONE world-space cache canvas, so the per-frame cost
  // is unchanged: one drawImage for the whole landscape however tall it gets.
  // The cache is `worldBounds`, which is `mapScreenBounds` plus MAX_RISE of
  // headroom at the top — without that, a plateau on the back row is sliced
  // off, and the bug looks like a clipping artefact rather than a cache that
  // is 96px too short.

  /** Level of a tile, 0 off the map, from the snapshot read by `_readTerrain`. */
  _levelAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return 0;
    return this._lv ? this._lv[ty * this.mapW + tx] : 0;
  }

  /** Displayed grass type of a tile (the SPREAD one, not the target). */
  _grassAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return 255;
    return this._gtShown ? this._gtShown[ty * this.mapW + tx] : 255;
  }

  /**
   * Read the whole terrain into flat typed arrays, once per version change.
   *
   * Two kinds of change fall out of this and they are handled differently,
   * which is the point of doing it here rather than inline:
   *
   *   STRUCTURAL — a level, a ground sprite or a water flag moved. The cache
   *   has to be rebuilt whole, because a changed height re-orders occlusion.
   *   ZONING — only which grass owns a tile changed. That must NOT snap: it
   *   spreads tile by tile (ZONING.md, "Flips are gradual"), so it is queued.
   */
  _readTerrain() {
    const sc = this.scene || {};
    const mapW = this.mapW;
    const mapH = this.mapH;
    const n = mapW * mapH;

    let structural = false;
    if (!this._lv || this._lv.length !== n) {
      this._lv = new Uint8Array(n);
      this._gt = new Uint8Array(n).fill(255);
      this._gt2 = new Uint8Array(n).fill(255);
      this._gtShown = new Uint8Array(n).fill(255);
      this._gt2Shown = new Uint8Array(n).fill(255);
      this._wet = new Uint8Array(n);
      this._art = new Array(n).fill(null);
      this._faceArt = new Array(n).fill(null);
      this._ground = new Array(n).fill(null);
      this._grassInit = false;
      structural = true;
    }

    const terrain = typeof sc.terrain === 'function' ? sc.terrain : null;
    const levelSrc = pick3(sc.levels, sc.levelAt);
    const grassSrc = pick3(sc.grass, sc.grassAt);
    const contestSrc = pick3(sc.grassContest, sc.grassContestAt);

    let zoning = false;
    for (let ty = 0; ty < mapH; ty++) {
      for (let tx = 0; tx < mapW; tx++) {
        const i = ty * mapW + tx;
        const cell = terrain ? terrain(tx, ty) : null;
        const art = cell && (cell.art || (cell.rows || cell.data || cell.canvas || cell.getContext ? cell : null));

        const lv = clampLevel(
          cell && cell.level != null ? cell.level : readAt(levelSrc, tx, ty, i, 0)
        );
        // A tile cycles if the scene says so, or if the sprite declares it —
        // `defineSprite` carries a `cycle` field and this is what it is for.
        const wet = (cell && cell.water) || (art && art.cycle) ? 1 : 0;
        const gt = grassIndexOf(cell && cell.grass != null ? cell.grass : readAt(grassSrc, tx, ty, i, null));
        const gt2 = grassIndexOf(cell && cell.grass2 != null ? cell.grass2 : readAt(contestSrc, tx, ty, i, null));

        const faceArt = (cell && cell.faceArt) || null;
        if (lv !== this._lv[i] || wet !== this._wet[i] || art !== this._art[i] || faceArt !== this._faceArt[i]) {
          structural = true;
        }
        this._faceArt[i] = faceArt;
        this._lv[i] = lv;
        this._wet[i] = wet;
        this._art[i] = art || null;
        this._ground[i] = (cell && cell.ground) || null;
        if (gt !== this._gt[i] || gt2 !== this._gt2[i]) zoning = true;
        this._gt[i] = gt;
        this._gt2[i] = gt2;
      }
    }

    // Which tiles have to be re-stamped every palette phase: every water top,
    // and every tile a waterfall LANDS on (the foam sits on the lower tile).
    this._anim = [];
    for (let ty = 0; ty < mapH; ty++) {
      for (let tx = 0; tx < mapW; tx++) {
        const i = ty * mapW + tx;
        if (this._wet[i]) {
          this._anim.push(i);
          continue;
        }
        if (this._fallsOnto(tx, ty)) this._anim.push(i);
      }
    }
    this._animRect = this._boundsOf(this._anim);

    return { structural, zoning };
  }

  /** Does a waterfall land on this tile from either of its BACK neighbours? */
  _fallsOnto(tx, ty) {
    const h = this._levelAt(tx, ty);
    const w = this.mapW;
    if (tx > 0 && this._wet[ty * w + tx - 1] && this._levelAt(tx - 1, ty) > h) return true;
    if (ty > 0 && this._wet[(ty - 1) * w + tx] && this._levelAt(tx, ty - 1) > h) return true;
    return false;
  }

  /** The cache-space bounding box of a set of tile indices, columns included. */
  _boundsOf(list) {
    if (!list || !list.length) return null;
    const b = this._world;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of list) {
      const tx = i % this.mapW;
      const ty = (i / this.mapW) | 0;
      const h = this._lv[i];
      const p = toScreen(tx, ty, null);
      const nx = p.x - b.minX;
      const ny = p.y - b.minY - h * LEVEL_H;
      const drop = Math.max(h - this._levelAt(tx + 1, ty), h - this._levelAt(tx, ty + 1), 0) * LEVEL_H;
      if (nx - HALF_W < x0) x0 = nx - HALF_W;
      if (nx + HALF_W > x1) x1 = nx + HALF_W;
      if (ny < y0) y0 = ny;
      if (ny + TILE_H + drop > y1) y1 = ny + TILE_H + drop;
    }
    return {
      x: Math.max(0, Math.floor(x0)),
      y: Math.max(0, Math.floor(y0)),
      w: Math.min(b.width, Math.ceil(x1)) - Math.max(0, Math.floor(x0)),
      h: Math.min(b.height, Math.ceil(y1)) - Math.max(0, Math.floor(y0)),
    };
  }

  /**
   * Terrain, drawn WHOLE and FIRST into the world-space cache. Rebuilt only
   * when a version changes, so per frame it costs exactly one drawImage no
   * matter how big or how tall the map is.
   */
  _buildTerrain() {
    const sc = this.scene || {};
    const key =
      `${this.mapW}x${this.mapH}:${sc.terrainVersion ?? 'none'}` +
      `:${sc.elevationVersion ?? ''}:${sc.grassVersion ?? ''}`;
    if (this._terrainKey === key && this._terrainCv) return;
    this._terrainKey = key;

    const b = this._world;
    const fresh = !this._terrainCv || this._terrainCv.width !== b.width || this._terrainCv.height !== b.height;
    if (fresh) this._terrainCv = makeCanvas(b.width, b.height);

    const { structural, zoning } = this._readTerrain();
    let repaint = structural || fresh;

    if (!this._grassInit || this.reducedMotion) {
      // The first ever build has nothing to spread FROM, and SPEC §0 says
      // prefers-reduced-motion stops idle animation. Either way the grass is
      // simply what it is — but the cache still has to be repainted, which the
      // first version forgot: with reduced motion on and no level change,
      // `structural` is false and a zoning flip silently never appeared.
      if (zoning || !this._grassInit) repaint = true;
      this._gtShown.set(this._gt);
      this._gt2Shown.set(this._gt2);
      this._grassInit = true;
      this._spread.clear();
    } else if (zoning) {
      this._scheduleSpread(sc.grassCause);
      if (this._spread.size === 0) repaint = true; // belt and braces
    }

    if (repaint) this._repaintAll();
  }

  _repaintAll() {
    const b = this._world;
    const ctx = ctxOf(this._terrainCv);
    ctx.clearRect(0, 0, b.width, b.height);
    this._paintColumns(ctx, null);
  }

  /**
   * Redraw one rectangle of the cache, correctly.
   *
   * The naive version of this — clear the tile's box and redraw the tile — is
   * wrong the moment terrain has height, and wrong in a way that is hard to
   * see: a tile's bounding box is half full of its four neighbours, and a
   * column in FRONT of it may legitimately have painted over it. So: clip to
   * the rectangle, clear it, and repaint every column whose box intersects it,
   * in draw order. Clipping is what makes it safe — repainting a column that
   * extends outside the rectangle cannot damage anything beyond it.
   */
  _stampRegion(rect) {
    if (!rect || rect.w <= 0 || rect.h <= 0 || !this._terrainCv) return false;
    const ctx = ctxOf(this._terrainCv);
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
    this._paintColumns(ctx, rect);
    ctx.restore();
    return true;
  }

  /** Every column that touches `rect` (or all of them), back to front. */
  _paintColumns(ctx, rect) {
    const b = this._world;
    const mapW = this.mapW;
    const mapH = this.mapH;
    let sLo = 0;
    let sHi = mapW + mapH - 2;
    let eLo = -(mapH - 1);
    let eHi = mapW - 1;

    if (rect) {
      // Invert the rectangle into (tx+ty) and (tx-ty) ranges. The extra
      // MAX_RISE either side is the elevation term: a column whose FLAT row is
      // well below the rectangle can still have its top inside it.
      const x0 = rect.x + b.minX;
      const x1 = rect.x + rect.w + b.minX;
      const y0 = rect.y + b.minY;
      const y1 = rect.y + rect.h + b.minY;
      eLo = Math.max(eLo, Math.floor((x0 - HALF_W) / HALF_W));
      eHi = Math.min(eHi, Math.ceil((x1 + HALF_W) / HALF_W));
      sLo = Math.max(sLo, Math.floor((y0 - TILE_H - MAX_RISE) / HALF_H));
      sHi = Math.min(sHi, Math.ceil((y1 + MAX_RISE) / HALF_H));
    }

    for (let s = sLo; s <= sHi; s++) {
      const txLo = Math.max(0, s - mapH + 1, Math.ceil((s + eLo) / 2));
      const txHi = Math.min(mapW - 1, s, Math.floor((s + eHi) / 2));
      for (let tx = txLo; tx <= txHi; tx++) {
        this._paintColumn(ctx, tx, s - tx);
      }
    }
  }

  /** One column: front faces bottom-up, then the top, then any foam on it. */
  _paintColumn(ctx, tx, ty) {
    const b = this._world;
    const i = ty * this.mapW + tx;
    const h = this._lv[i];
    const p = toScreen(tx, ty, null);
    const nx = snap(p.x - b.minX); // the top diamond's north vertex, in cache px
    const ny = snap(p.y - b.minY - h * LEVEL_H);

    // --- 1. the two camera-facing sides, where this tile stands proud -------
    //
    // WHICH neighbours those are is iso.js's to say, not this file's, and
    // `frontNeighbour` is canonical. Under this projection +tx runs down-RIGHT
    // and +ty runs down-LEFT, so the two tiles below a diamond's south vertex
    // are (tx+1, ty) and (tx, ty+1) — NOT (tx-1, ty), which is BEHIND. Getting
    // it backwards draws every cliff face, and every cave mouth set into one,
    // on the hidden side of the hill. Re-deriving it here is exactly how that
    // happens, so this asks the module that owns the answer.
    for (const side of FRONT_SIDES) {
      const n = frontNeighbour(tx, ty, side);
      const rise = Math.max(0, h - this._levelAt(n.tx, n.ty)) * LEVEL_H;
      if (rise > 0) this._paintFace(ctx, tx, ty, side, rise, nx, ny);
    }

    // --- 2. the top ---------------------------------------------------------
    // A sprite's anchor sits on the tile's CENTRE (SPEC §2), which is the
    // north vertex plus (0, HALF_H) — NOT the north vertex, and not the box's
    // corner. Getting this wrong shifts every terrain sprite half a tile and
    // opens a diagonal seam of sky between the ground tiles, which reads
    // convincingly like a lighting effect until you look at it twice.
    const g = this._gtShown[i];
    if (this._wet[i]) {
      const art = this._art[i];
      const phase = Math.max(0, this._waterPhase);
      if (art) {
        const key = `water${phase}`;
        if (!VARIANTS[key]) VARIANTS[key] = cycleWater(phase);
        const r = artRaster(art, key);
        if (r) ctx.drawImage(r.canvas, nx - r.ax, ny + HALF_H - r.ay);
      } else {
        ctx.drawImage(plainWaterTile(tx, ty, phase), nx - HALF_W, ny);
      }
    } else if (g !== 255) {
      const c = this._gt2Shown[i];
      ctx.drawImage(groundTile(tx, ty, g, c === 255 ? null : c, this._edgeBlend(tx, ty, g)), nx - HALF_W, ny);
    } else {
      const art = this._art[i];
      const r = art ? artRaster(art, 'base') : null;
      if (r) ctx.drawImage(r.canvas, nx - r.ax, ny + HALF_H - r.ay);
      else ctx.drawImage(grassTile(tx, ty), nx - HALF_W, ny);
    }

    // --- 3. foam, from a fall landing here ----------------------------------
    // Drawn with the LOWER tile, not the upper one: the lower tile's top face
    // is painted after the upper tile's column and would bury it otherwise.
    const phase = Math.max(0, this._waterPhase);
    const w = this.mapW;
    if (tx > 0 && this._wet[i - 1] && this._levelAt(tx - 1, ty) > h) {
      const big = this._levelAt(tx - 1, ty) - h >= 3;
      const f = foamCap(Math.floor(hash2(tx, ty, 5150) * 3), phase, big);
      ctx.drawImage(f, nx - 16 - (FOAM_W >> 1), ny + 8 - (FOAM_H >> 1));
    }
    if (ty > 0 && this._wet[i - w] && this._levelAt(tx, ty - 1) > h) {
      const big = this._levelAt(tx, ty - 1) - h >= 3;
      const f = foamCap(Math.floor(hash2(tx, ty, 6160) * 3), phase, big);
      ctx.drawImage(f, nx + 16 - (FOAM_W >> 1), ny + 8 - (FOAM_H >> 1));
    }
  }

  /**
   * One vertical face. A WATER tile's face is a waterfall — ELEVATION.md is
   * explicit that this is "a rendering consequence of adjacency, not a fluid
   * model", so there is no state anywhere: if water stands above a drop, it
   * falls, and the moment the player lowers the tile in front it stops.
   */
  _paintFace(ctx, tx, ty, side, rise, nx, ny) {
    const i = ty * this.mapW + tx;
    const x = side === 'se' ? nx : nx - HALF_W;
    const y = ny + HALF_H;
    if (this._wet[i]) {
      const v = Math.floor(hash2(tx, ty, side === 'se' ? 811 : 907) * WF_VARIANTS);
      ctx.drawImage(waterfallFace(side, rise, v, Math.max(0, this._waterPhase)), x, y);
      return;
    }
    const v = Math.floor(hash2(tx, ty, side === 'se' ? 313 : 419) * FACE_VARIANTS);
    ctx.drawImage(cliffFace(this._faceKind(tx, ty), side, rise, v), x, y);

    // FACE DECALS — how a cave mouth gets set INTO a cliff, which ELEVATION.md
    // says is what a cave actually is. The scene hands over a sprite per side
    // on the tile cell (`faceArt: { se, sw }`) and it is stamped onto the face,
    // anchored at the foot of the cliff and centred on the edge, because that
    // is where a mouth opens. The renderer deliberately knows nothing about
    // caves — it draws what it is given on the surface it owns.
    const cell = this._faceArt[i];
    const art = cell && cell[side];
    if (!art) return;
    const r = artRaster(art, 'base');
    if (!r) return;
    // Centre of the shared edge, at the base of the fall of rock.
    const ex = side === 'se' ? nx + HALF_W / 2 : nx - HALF_W / 2;
    const ey = ny + TILE_H - HALF_W / 4 + rise;
    ctx.drawImage(r.canvas, snap(ex - r.ax), snap(ey - r.ay));
  }

  /**
   * Which rock a cliff is made of. Seeded, so a long cliff is not a repeating
   * strip, and biased by what is growing on top — a fen on a ledge drips, so
   * its cliff is mossy. ELEVATION.md's list of faces, minus the dressed
   * retaining wall, which belongs to the connector OBJECTS rather than to
   * terrain and is `needsDesign` here.
   */
  _faceKind(tx, ty) {
    const i = ty * this.mapW + tx;
    const g = this._gtShown ? this._gtShown[i] : 255;
    // COARSE hash — 4x4 tile patches, not per tile. Per-tile material choice
    // turned a long cliff into a patchwork of planks: variety at the wrong
    // frequency reads as noise, and a real escarpment is one rock for a
    // stretch and then another.
    const r = hash2(tx >> 2, ty >> 2, 2027);
    const damp = g === GRASS_INDEX.get('fen') || this._nearWater(tx, ty);
    if (damp && r < 0.5) return 'mossy';
    return r < 0.28 ? 'earth' : 'rock';
  }

  _nearWater(tx, ty) {
    const w = this.mapW;
    const h = this.mapH;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (this._wet[y * w + x]) return true;
      }
    }
    return false;
  }

  /**
   * The one neighbouring grass type this tile softens toward, and on which of
   * its four sides. Majority wins; a tile at a three-way junction blends
   * toward the commonest neighbour and lets the contested checkerboard carry
   * the rest. Scratch arrays are instance state so a full repaint of 400 tiles
   * allocates nothing.
   */
  _edgeBlend(tx, ty, g) {
    const mask = this._edgeMaskScratch || (this._edgeMaskScratch = new Int8Array(GRASS_TYPES.length));
    const cnt = this._edgeCntScratch || (this._edgeCntScratch = new Int8Array(GRASS_TYPES.length));
    mask.fill(0);
    cnt.fill(0);
    const sides = [
      [EDGE_SE, this._grassAt(tx + 1, ty)],
      [EDGE_SW, this._grassAt(tx, ty + 1)],
      [EDGE_NW, this._grassAt(tx - 1, ty)],
      [EDGE_NE, this._grassAt(tx, ty - 1)],
    ];
    let best = -1;
    for (let k = 0; k < 4; k++) {
      const t = sides[k][1];
      // 255 is "no zoning there" (bare ground, water, off the map). Nothing to
      // blend toward, and a blend toward an invented type would be a lie.
      if (t === 255 || t === g) continue;
      mask[t] |= sides[k][0];
      cnt[t]++;
      if (best < 0 || cnt[t] > cnt[best]) best = t;
    }
    if (best < 0) return null;
    const out = this._blendOut || (this._blendOut = { other: 0, mask: 0 });
    out.other = best;
    out.mask = mask[best];
    return out;
  }

  // =========================================================================
  // GRADUAL SPREAD (docs/ZONING.md, "Flips are gradual")
  // =========================================================================
  //
  // "The grass spreads tile by tile over a few seconds rather than snapping.
  // Two reasons: the causality stays legible (you see which object you just
  // placed doing the work), and watching a change propagate is one of the
  // quiet pleasures of the genre. Animate outward from the object that caused
  // it."
  //
  // So each changed tile gets a due time proportional to its distance from the
  // CAUSE. The scene names the cause when it knows it (`grassCause` — the tile
  // the player just edited); when it does not, the centroid of the changed set
  // is used, which for a single placement is the same point and for a load is
  // harmlessly arbitrary. A little hashed jitter keeps the wavefront from
  // arriving as a hard ring.

  _scheduleSpread(cause) {
    const n = this.mapW * this.mapH;
    const changed = [];
    for (let i = 0; i < n; i++) {
      if (this._gtShown[i] !== this._gt[i] || this._gt2Shown[i] !== this._gt2[i]) changed.push(i);
    }
    if (!changed.length) return;

    let cx;
    let cy;
    if (cause && Number.isFinite(cause.tx)) {
      cx = cause.tx;
      cy = cause.ty;
    } else {
      cx = 0;
      cy = 0;
      for (const i of changed) {
        cx += i % this.mapW;
        cy += (i / this.mapW) | 0;
      }
      cx /= changed.length;
      cy /= changed.length;
    }

    const now = this._now();
    for (const i of changed) {
      const tx = i % this.mapW;
      const ty = (i / this.mapW) | 0;
      const d = Math.hypot(tx - cx, ty - cy);
      const jitter = hash2(tx, ty, 31337) * SPREAD_JITTER_MS;
      this._spread.set(i, now + SPREAD_BASE_MS + d * SPREAD_MS_PER_TILE + jitter);
    }
  }

  /** Apply whatever is due. Returns true when the cache changed. */
  _advanceSpread(now) {
    if (!this._spread.size) return false;
    let due = null;
    for (const [i, t] of this._spread) {
      if (t <= now) (due || (due = [])).push(i);
    }
    if (!due) return false;

    for (const i of due) {
      this._gtShown[i] = this._gt[i];
      this._gt2Shown[i] = this._gt2[i];
      this._spread.delete(i);
    }
    // A tile's soft edges depend on its neighbours' types, so a flip dirties a
    // one-tile skirt around itself as well as the tile.
    const dirty = new Set();
    for (const i of due) {
      const tx = i % this.mapW;
      const ty = (i / this.mapW) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= this.mapW || y >= this.mapH) continue;
          dirty.add(y * this.mapW + x);
        }
      }
    }
    this._stampRegion(this._boundsOf([...dirty]));
    return true;
  }

  /**
   * WATER ANIMATES BY PALETTE CYCLING, not by redrawing shapes (SPEC §4), and
   * so do the waterfalls and their foam — ELEVATION.md asks for exactly this
   * and for "no new animation system". One region stamp per phase covers the
   * lot; on a garden whose water is in one corner that region is small.
   */
  _restampWater() {
    if (!this._anim || !this._anim.length || !this._terrainCv) return false;
    return this._stampRegion(this._animRect);
  }

  /**
   * The field overlay, into its own world-space cache. Rebuilt only when the
   * axis or the field changes — panning is free.
   */
  _buildOverlay() {
    const sc = this.scene || {};
    const ov = sc.overlay;
    const axis = this.overlayAxis !== undefined ? this.overlayAxis : (ov && ov.axis) || null;
    const grid = ov && ov.data && ov.data.length >= this.mapW * this.mapH ? ov.data : null;
    if (!axis || !ov || (!grid && typeof ov.sample !== 'function')) {
      this._overlayCv = null;
      this._overlayKey = 'off';
      return;
    }
    // The terrain key rides along: the wash sits ON the top faces, so raising
    // a tile moves its stamp and the overlay cache has to follow the terrain.
    const key = `${axis}:${ov.version ?? sc.fieldVersion ?? 'none'}:${this.mapW}x${this.mapH}:${this._terrainKey}`;
    if (this._overlayKey === key && this._overlayCv) return;

    const b = this._world;
    if (!this._overlayCv || this._overlayCv.width !== b.width || this._overlayCv.height !== b.height) {
      this._overlayCv = makeCanvas(b.width, b.height);
    }
    const ctx = ctxOf(this._overlayCv);
    ctx.clearRect(0, 0, b.width, b.height);

    // Two ways in, and the first is the good one:
    //
    //  (a) `overlay.data` — a row-major Float32Array already compressed to
    //      0..1. This is exactly what `fields.overlay(axis)` returns, and
    //      fields.js says so in as many words. Taking it verbatim means the
    //      wash uses the field module's OWN idea of what "neutral" is (signed
    //      axes sit at 0.5 there, which is the honest reading of untouched
    //      turf) instead of my auto-range guessing at it, and it skips 400
    //      per-tile function calls.
    //  (b) `overlay.sample(tx, ty)` — raw values, auto-ranged against a floor
    //      so a nearly empty glade stays nearly clear instead of being
    //      amplified into noise.
    const n = this.mapW * this.mapH;
    let vals;
    let lo = 0;
    let hi = 1;
    if (grid) {
      vals = grid;
      if (Array.isArray(ov.range)) {
        lo = ov.range[0];
        hi = ov.range[1];
      } else {
        // Do NOT assume 0..1 spans the wash. Three of the five axes are
        // SIGNED in fields.js: they sit at 0.5 when neutral, so a brand-new
        // empty glade comes back as 0.5 everywhere and a fixed 0..1 range
        // would wash the entire map at half strength before the player has
        // placed a single thing.
        //
        // Range against the map's OWN spread instead. An untouched map has no
        // spread, so it gets no wash at all — which is the truth, and cosy.
        // As the player builds, the wash stretches to fill exactly the
        // variation they have created, which is the question the overlay is
        // there to answer: where are my regions?
        lo = Infinity;
        hi = -Infinity;
        for (let i = 0; i < n; i++) {
          const v = vals[i];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (!Number.isFinite(lo)) {
          lo = 0;
          hi = 1;
        }
        // A floor on the span, so a map that varies by a hair is not
        // amplified into a full-strength wash of noise.
        hi = Math.max(hi, lo + OVERLAY_MIN_SPAN);
      }
    } else {
      vals = new Float32Array(n);
      hi = 0;
      for (let ty = 0; ty < this.mapH; ty++) {
        for (let tx = 0; tx < this.mapW; tx++) {
          const v = +ov.sample(tx, ty) || 0;
          vals[ty * this.mapW + tx] = v;
          if (v > hi) hi = v;
          if (v < lo) lo = v;
        }
      }
      if (Array.isArray(ov.range)) {
        lo = ov.range[0];
        hi = ov.range[1];
      } else {
        lo = Math.min(0, lo);
        hi = Math.max(hi, lo + (ov.floor ?? 1));
      }
    }
    const span = hi - lo || 1;

    // A SIGNED axis — one that runs both ways from a neutral, which is three of
    // the five — is washed by how far it has moved from neutral, in a colour
    // that says which way. Neutral itself gets nothing at all. Without this the
    // wash is anchored to the map's minimum, so the moment the player lays one
    // gravel path (wildness -2) the ENTIRE glade, untouched turf and all, lifts
    // to half strength and the overlay stops distinguishing anything.
    //
    // `neutral` arrives on the view from fields.js's own AXIS_META, so the
    // renderer never has to guess which axes are signed.
    const neutral = typeof ov.neutral === 'number' ? ov.neutral : null;
    if (neutral != null) {
      let dev = 0;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(vals[i] - neutral);
        if (d > dev) dev = d;
      }
      dev = Math.max(dev, OVERLAY_MIN_SPAN / 2); // an untouched map stays clear
      const more = overlayStamps(axis, 'more');
      const less = overlayStamps(axis, 'less');
      for (let ty = 0; ty < this.mapH; ty++) {
        for (let tx = 0; tx < this.mapW; tx++) {
          const d = (vals[ty * this.mapW + tx] - neutral) / dev;
          const level = Math.max(0, Math.min(OVERLAY_LEVELS - 1, Math.round(Math.abs(d) * (OVERLAY_LEVELS - 1))));
          const stamp = (d < 0 ? less : more)[level];
          if (!stamp) continue;
          const p = toScreenAt(tx, ty, this._levelAt(tx, ty), null);
          ctx.drawImage(stamp, p.x - b.minX - HALF_W, p.y - b.minY);
        }
      }
      this._overlayKey = key;
      return;
    }

    const stamps = overlayStamps(axis, 'up');
    for (let ty = 0; ty < this.mapH; ty++) {
      for (let tx = 0; tx < this.mapW; tx++) {
        const t = (vals[ty * this.mapW + tx] - lo) / span;
        const level = Math.max(0, Math.min(OVERLAY_LEVELS - 1, Math.round(t * (OVERLAY_LEVELS - 1))));
        const stamp = stamps[level];
        if (!stamp) continue;
        const p = toScreenAt(tx, ty, this._levelAt(tx, ty), null);
        ctx.drawImage(stamp, p.x - b.minX - HALF_W, p.y - b.minY);
      }
    }
    this._overlayKey = key;
  }

  // -- draw -----------------------------------------------------------------

  /** Draw one frame. Safe to call directly (spritelab, snapshots, tests). */
  draw(scene) {
    if (scene) this.setScene(scene);
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const sc = this.scene || {};
    const ctx = this.ctx;

    // LAW 4: the camera is snapped before anything is projected through it.
    this._cam.x = snap(this.camera.x);
    this._cam.y = snap(this.camera.y);
    const cam = this._cam;
    const b = this._world;

    this._buildTerrain();
    this._buildOverlay();

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, BACKING_W, BACKING_H);

    // Off-map surround: the sky ramp's darkest, so the edge of the world reads
    // as haze rather than as a hole.
    ctx.fillStyle = RAMPS.sky.hex[0];
    ctx.fillRect(0, 0, BACKING_W, BACKING_H);

    // --- 1. terrain, whole ---
    const ox = b.minX - cam.x;
    const oy = b.minY - cam.y;
    if (this._terrainCv) ctx.drawImage(this._terrainCv, snap(ox), snap(oy));

    const drawOverlay = () => {
      if (!this._overlayCv) return;
      if (this.overlayAlpha !== 1) ctx.globalAlpha = this.overlayAlpha;
      ctx.drawImage(this._overlayCv, snap(ox), snap(oy));
      ctx.globalAlpha = 1;
    };
    // `overlayLayer: 'ground'` (the default) washes the TERRAIN and lets the
    // planting stand out of it. `'top'` washes the whole scene. Ground won on
    // sight: the load-bearing palette relationship is that trees read DARK
    // against the ground (palette.js), and a wash laid over the canopy eats
    // exactly that contrast — the map goes flat in the very regions the player
    // has worked hardest on. Washing only the ground keeps the silhouettes and
    // makes the wash read as light lying on the glade rather than as a filter
    // over a photograph.
    if (this.overlayLayer === 'ground') drawOverlay();

    // Build the sorted draw list. Objects first, creatures appended, so the
    // insertion-index tiebreak floats a creature above a co-located object.
    //
    // ELEVATION: every entry is wrapped so it carries the LEVEL it stands on,
    // because the depth key needs it and the scene is not obliged to supply
    // it. An object with no `level` reads the height of the tile underneath —
    // "raising a tile under an object is legal; the object rides up with it"
    // (ELEVATION.md) falls straight out of that, and an object can never be
    // left floating over a tile someone lowered.
    //
    // The wrappers come from a pool that is grown but never re-allocated, so a
    // map full of movers does not turn the draw loop into a GC event.
    const objects = sc.objects || [];
    const creatures = sc.creatures || [];
    const list = this._liftDrawList(objects, creatures);
    const sorted = sortForDraw(list);
    this.stats.sorted = sorted.length;

    // --- 2. contact shadows, as their own pass under everything ---
    // One pass, so no object's shadow ever lands on top of another object.
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const o = e.src;
      if (o.shadow === false) continue;
      const c = footprintCentreAt(e.tx, e.ty, e.fw, e.fh, e.level, cam);
      if (c.x < -80 || c.x > BACKING_W + 80 || c.y < -80 || c.y > BACKING_H + 80) continue;
      // `shadow` may be false (no shadow — a bird, a floating thing) or a
      // number that scales the skirt: a narrow cypress wants a smaller one
      // than a broad plane tree on the same 1x1 footprint.
      const st = shadowStamp(
        e.fw,
        e.fh,
        o.ground || this._groundKeyAt(Math.floor(e.tx), Math.floor(e.ty)) || sc.groundKey || GROUND_DEFAULT,
        typeof o.shadow === 'number' ? o.shadow : 1
      );
      ctx.drawImage(st.canvas, snap(c.x - st.ax + SHADOW_DX), snap(c.y - st.ay + SHADOW_DY));
    }

    // --- 3+4. objects and creatures, back to front ---
    let drawn = 0;
    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const o = e.src;
      const art = o.art || o.sprite;
      if (!art) continue;
      const variantKey = o.variant || (o.rung === 'visits' || o.desaturated ? 'ghost' : 'base');
      const base = artRaster(art, variantKey, o.facing || 0);
      if (!base) continue;
      // `fade` is the transit dissolve (CREATURE-MOVEMENT.md §1): a creature
      // arriving out of the dusk or wandering back off at the end of its visit.
      // Absent or 1 on everything else, and `dissolved` hands the raster
      // straight back in that case, so nothing but a mover ever pays for it.
      const fade = o.fade;
      if (fade != null && fade <= 0) continue;
      const r = fade == null ? base : dissolved(art, variantKey, base, fade);
      const c = footprintCentreAt(e.tx, e.ty, e.fw, e.fh, e.level, cam);
      const x = snap(c.x - r.ax);
      const y = snap(c.y - r.ay);
      if (x + r.w < 0 || x > BACKING_W || y + r.h < 0 || y > BACKING_H) continue;
      ctx.drawImage(r.canvas, x, y);
      drawn++;
    }
    this.stats.drawn = drawn;

    // --- 5. the field overlay ---
    if (this.overlayLayer !== 'ground') drawOverlay();

    // --- 6. ghost preview ---
    const g = this.ghost !== undefined ? this.ghost : sc.ghost;
    if (g) this._drawGhost(ctx, g, cam);

    this.stats.frames++;
    this.stats.lastMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    return this;
  }

  /**
   * The per-frame draw list, with every entry lifted onto the height of the
   * tile it stands on. Pooled: the entries are reused frame to frame.
   */
  _liftDrawList(objects, creatures) {
    const pool = this._pool || (this._pool = []);
    const out = this._drawList || (this._drawList = []);
    out.length = 0;
    let k = 0;
    const push = (o) => {
      let e = pool[k];
      if (!e) e = pool[k] = { tx: 0, ty: 0, fw: 1, fh: 1, level: 0, footprint: null, src: null };
      k++;
      const [fw, fh] = footprintOf(o);
      e.src = o;
      e.tx = o.tx || 0;
      e.ty = o.ty || 0;
      e.fw = fw;
      e.fh = fh;
      e.footprint = o.footprint;
      e.level = o.level != null ? clampLevel(o.level) : this._levelAt(Math.floor(e.tx), Math.floor(e.ty));
      out.push(e);
    };
    for (let i = 0; i < objects.length; i++) push(objects[i]);
    for (let i = 0; i < creatures.length; i++) push(creatures[i]);
    return out;
  }

  _drawGhost(ctx, g, cam) {
    const legal = g.legal !== false;
    const [fw, fh] = footprintOf(g);
    const gx = Math.floor(g.tx || 0);
    const gy = Math.floor(g.ty || 0);
    const lv = g.level != null ? clampLevel(g.level) : this._levelAt(gx, gy);

    // The plate sits on each tile's own top face, so a footprint straddling a
    // step shows the step — which is exactly the feedback the player needs
    // before dropping a 2x2 across a terrace edge.
    const plate = ghostPlate(legal);
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const p = toScreenAt(gx + x, gy + y, this._levelAt(gx + x, gy + y), cam);
        ctx.drawImage(plate, snap(p.x - HALF_W), snap(p.y));
      }
    }

    const art = g.art || g.sprite;
    if (!art) return;
    const key = legal ? 'ok' : 'bad';
    const r = artRaster(art, key, g.facing || 0);
    if (!r) return;
    // THE GHOST HAS TO SHOW THE TURN or the wheel teaches nothing: the whole
    // feedback loop for facing is "spin it, watch the preview, then click".
    const s = stippled(art, `${key}|f${g.facing || 0}`, r);
    const c = footprintCentreAt(gx, gy, fw, fh, lv, cam);
    ctx.drawImage(s.canvas, snap(c.x - s.ax), snap(c.y - s.ay));
  }

  // -- introspection --------------------------------------------------------

  /** Which tiles are on screen right now. Handy for audio's "visible region". */
  visibleTiles(pad = 1) {
    return visibleTileRange(this._cam, BACKING_W, BACKING_H, this.mapW, this.mapH, pad);
  }
}

/** Make a renderer. Attaches nothing; call `.attach().start()` when ready. */
export function createRenderer(canvas, opts) {
  return new Renderer(canvas, opts);
}

export { Renderer };
