// tiles.js — the ground of Arcadia. 64x32 isometric diamonds.
//
// Every tile here is a 64x32 sprite whose opaque pixels are exactly one
// isometric diamond: the classic 2-across / 1-down edge, no jaggy irregularity,
// no anti-aliasing, every pixel a palette key.
//
// AUTHORING NOTE — what is "hand-authored" about a ground tile.
//
// A prop is authored pixel by pixel because its silhouette carries meaning. A
// lawn is not: what carries meaning in a lawn is its *value structure* — which
// ramp step dominates, how big the blotches are, how sparse the speckle, where
// the dither ladder sits in a transition. So the value structure is what is
// hand-specified here, and a deterministic rasteriser lays it into the diamond.
// This is also the only way to get the 3-4 seeded variants SPEC demands: a lawn
// built from one repeated tile is the single loudest "uniform tiling" tell
// (RESEARCH A9.9), and four hand-typed near-identical 32x64 text blobs would be
// four worse tiles, not four better ones.
//
// Nothing in here is random at runtime. Every tile is a pure function of its
// seed, resolved once at module load, and frozen by defineSprite.
//
// THE LOAD-BEARING GROUND VALUE is grass index 2, 'o' (#74863C). palette.js
// calls it out: grass mid must be lighter than canopy mid so trees read dark
// against the ground. 'o' is therefore the lawn, 'n' its shade, 'p' its
// highlight, 'm' its contact shadow (== contactShadow('o')).
//
// DITHERING (RESEARCH A5): checkerboard between adjacent ramp values belongs on
// terrain transitions and large flat faces, and nowhere else. It is used here
// on the shoreline's grass->sand ladder, on sand, and on the deep-water body.
// It is not used on grass, moss or meadow — those are speckle, not dither.
//
// DOM-free and dependency-free; imports cleanly in Node.

import { defineSprite } from './format.js';
import { shade } from '../palette.js';
import { LEVEL_H } from '../iso.js';

export const TILE_W = 64;
export const TILE_H = 32;

/** The pixel that sits on the tile's centre point. */
export const TILE_ANCHOR = [32, 16];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * The opaque run on row y of a 64x32 diamond: 2 px wider each side per row.
 * Row 0 is 4 px at the top vertex; rows 15 and 16 are the full 64.
 */
export function rowSpan(y) {
  const t = y < TILE_H / 2 ? y : TILE_H - 1 - y;
  return { x0: 30 - 2 * t, len: 4 * t + 4 };
}

/**
 * Diamond-square coordinates. The diamond |u|+|v| <= 1 becomes the unit square
 * via p = u+v, q = u-v, whose corners are exactly the four tile vertices:
 *   (s,t) = (0,1) N   (1,1) E   (1,0) S   (0,0) W
 * Bilinear interpolation over those four corners is what makes all sixteen
 * shoreline masks fall out of one function instead of sixteen hand cuts.
 */
function square(x, y) {
  const u = (x - 31.5) / 32;
  const v = (y - 15.5) / 16;
  return { s: (u + v + 1) / 2, t: (u - v + 1) / 2 };
}

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * Blotch noise. Nearest-cell, but the lookup point is jittered per pixel so the
 * cell boundaries come out ragged instead of rectangular. Cells are wider than
 * they are tall because the ground plane is foreshortened 2:1 — a round patch
 * of clover on the ground is an ellipse on the screen.
 */
function blotch(x, y, cw, ch, seed, jit = 1) {
  const jx = x + Math.round((hash(x, y, seed + 5) - 0.5) * 3.4 * jit);
  const jy = y + Math.round((hash(x, y, seed + 6) - 0.5) * 2.2 * jit);
  return hash(Math.floor(jx / cw), Math.floor(jy / ch), seed);
}

/**
 * Two blotch octaves averaged. One octave gives leopard spots; two give turf.
 * The difference is the whole difference between camouflage and a lawn.
 */
function mottle(x, y, cw, ch, seed) {
  return (blotch(x, y, cw, ch, seed) + blotch(x, y, Math.max(2, cw >> 1), Math.max(1, ch >> 1), seed + 997)) / 2;
}

// The ordered 4x4 Bayer matrix, /16. RESEARCH A5: larger matrix = finer effect;
// 4x4 is right for a 64 px tile and gives a clean five-stage density ladder.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Ordered dither between two keys. d=0 -> all `a`, d=1 -> all `b`. */
function dither(a, b, d, x, y) {
  return d * 16 > BAYER4[y & 3][x & 3] ? b : a;
}

/** 50% hard checkerboard — the local blend, for small blends inside a band. */
function checker(a, b, x, y) {
  return (x + y) & 1 ? b : a;
}

// ---------------------------------------------------------------------------
// Painters — one per terrain. (x, y, seed) -> palette key.
//
// Each is a hand-tuned value structure, not a texture: a dominant ramp step, a
// blotch scale, a speckle rate. Read them as the authoring.
// ---------------------------------------------------------------------------

function grass(x, y, seed) {
  // Turf is mostly ONE value. The temptation is to mottle it hard for interest;
  // that produces camouflage, and it also fights every tree and statue standing
  // on it. Dark patches are rationed to about one pixel in eight, and most of
  // the life comes from the light step and from 1 px blade ticks.
  let k = 'o'; // the lawn
  const m = mottle(x, y, 7, 3, seed + 11);
  if (m < 0.21) k = 'n';
  else if (m > 0.63) k = 'p';

  const r = hash(x, y, seed + 3);
  if (r < 0.06) k = shade(k, -1);
  else if (r > 0.92) k = shade(k, +1);

  // Blades: sparse 1 px ticks, dark over light. Ground is a large area, so fine
  // speckle reads as texture rather than as the fuzzy-edge fault of A9.
  if (hash(x, y >> 1, seed + 71) > 0.972) k = shade(k, -1);
  return k;
}

function meadow(x, y, seed) {
  // Meadow must read LIGHTER and busier than lawn or it is just grass with
  // sprinkles. It is long uncut growth: the light step dominates.
  let k = 'p';
  const m = mottle(x, y, 6, 3, seed + 17);
  if (m < 0.42) k = 'o';
  if (m < 0.14) k = 'n';

  const r = hash(x, y, seed + 8);
  if (r < 0.06) k = shade(k, -1);
  else if (r > 0.90) k = shade(k, +1);

  // Flowers. A bloom is a single accent pixel with a dark pixel beneath it, so
  // it sits *on* the turf instead of floating in it.
  const f = hash(x, y, seed + 313);
  if (f > 0.9885) k = '5';
  else if (f > 0.9835) k = '7';
  else if (f > 0.9800) k = '3';
  else if (f > 0.9780) k = '4';
  else if (hash(x, y - 1, seed + 313) > 0.9780) k = 'n';
  return k;
}

function moss(x, y, seed) {
  // Damp shade under trees: the canopy ramp on the ground, cooled with a little
  // cypress. Deliberately darker than grass so a mossy hollow reads as a hollow.
  let k = 'c';
  if (blotch(x, y, 8, 4, seed + 13) < 0.36) k = 'b';
  else if (blotch(x, y, 6, 3, seed + 37) > 0.78) k = 'd';
  if (blotch(x, y, 11, 5, seed + 61) > 0.86) k = 'l'; // cool wet patch

  const r = hash(x, y, seed + 4);
  if (r < 0.06) k = k === 'l' ? 'k' : shade(k, -1);
  else if (r > 0.965) k = k === 'l' ? 'l' : shade(k, +1);
  return k;
}

function bareEarth(x, y, seed) {
  // Trodden dry ground, not ploughed mud: mostly smooth, warm, with a scatter
  // of clods. Heavy per-pixel noise here made it read as churned soil, which is
  // wrong for a swept glade and fights everything standing on it.
  let k = 's'; // earth index 2
  const m = mottle(x, y, 9, 4, seed + 19);
  if (m < 0.24) k = 'r';
  else if (m > 0.70) k = 't';

  // Clods: a dark pixel with a lit pixel on its upper-left. Light is upper-left,
  // so this is the smallest legal three-dimensional mark in the game.
  const c = hash(x >> 1, y >> 1, seed + 101);
  if (c > 0.94) k = (x & 1) === 0 && (y & 1) === 0 ? shade(k, +1) : shade(k, -1);

  const r = hash(x, y, seed + 7);
  if (r < 0.035) k = shade(k, -1);
  else if (r > 0.975) k = shade(k, +1);
  return k;
}

function gravel(x, y, seed) {
  // A swept path: warm earth ground with grey rock chips scattered through it.
  // Two ramps meeting is the point — gravel is greyer than soil and lighter
  // than turf, which is what makes a path read as a path from across the map.
  let k = 't';
  if (mottle(x, y, 9, 4, seed + 23) < 0.32) k = 's';
  const chip = hash(x, y, seed + 131);
  if (chip > 0.92) k = 'y';
  else if (chip > 0.84) k = 'x';
  else if (chip > 0.78) k = 'u';
  else if (chip < 0.055) k = 'w';
  else if (chip < 0.13) k = 'r';

  // A few larger pebbles, each a 2x2 with the light on its upper-left cell.
  // Uniform grit alone reads as fizz; three-dimensional marks give the path a
  // grain size the eye can measure the ground against.
  const p = hash(x >> 1, y >> 1, seed + 137);
  if (p > 0.965) k = (x & 1) === 0 && (y & 1) === 0 ? 'y' : 'w';
  else if (p < 0.02) k = (x & 1) === 0 && (y & 1) === 0 ? 'x' : 'v';
  return k;
}

function sand(x, y, seed) {
  // A large pale flat field: the textbook home of ordered dithering. The value
  // drifts up toward the light (upper-left) across the whole diamond, laid in
  // with a Bayer ladder between earth 3 and earth 4 so it never bands.
  const { s, t } = square(x, y);
  const lit = 1 - (s + t) / 2; // 1 along the NW edge, 0 at the S/E vertices

  // Wind ripples. Without them the Bayer field sits at 50% across the middle of
  // the tile and reads as a ruled crosshatch — the exact failure A5 warns about,
  // where the dither stops being a value and starts being a pattern. The ripple
  // pushes the local density up and down so no large area holds a single stage.
  const jx = x + Math.round((hash(x, y, seed + 33) - 0.5) * 5);
  const ripple = hash(Math.floor(jx / 13), (y + 1) >> 1, seed + 39);

  let d = 0.10 + lit * 0.80 + (ripple - 0.5) * 0.55;
  let k = dither('t', 'u', d, x, y);
  if (mottle(x, y, 12, 5, seed + 47) < 0.20) k = dither('s', 't', 0.55, x, y);
  const r = hash(x, y, seed + 9);
  if (r > 0.98) k = 'u';
  else if (r < 0.02) k = 's';
  return k;
}

function flagstone(x, y, seed) {
  // Half-tile slabs laid in the ground plane in a RUNNING BOND — every second
  // course offset by half a slab. A straight 2x2 grid put a hard cross through
  // the middle of every tile and the whole path read as bathroom tiling; the
  // offset is the single change that makes it read as laid paving.
  //
  // Every slab then obeys SPEC 3 on its own: highlight along its upper-left
  // arris, shadow along its lower-right, dark joint between.
  const { s, t } = square(x, y);
  const gt = t * 2;
  const cy = Math.min(1, Math.floor(gt));
  const ft = gt - cy;
  const gs = s * 2 + cy * 0.5; // the bond offset
  const cx = Math.floor(gs);
  const fs = gs - cx;

  const joint = 0.05;
  if (fs < joint || ft < joint || fs > 1 - joint || ft > 1 - joint) {
    // Joint: dark, but grouted with a little grit so it is not a drawn line.
    const g = hash(x, y, seed + 5);
    return g > 0.80 ? 'B' : g > 0.06 ? 'A' : 'w';
  }

  // Per-slab base value, so no two slabs are cut from the same block. Kept in
  // the LOWER half of the marble ramp: paving is worn limestone underfoot, and
  // if it sits at 'D'/'E' it out-shines the sculpture, which is the one thing
  // in this game that is allowed to be the brightest object on screen.
  const v = hash(cx, cy + (seed & 7) * 4, seed + 211);
  let k = v > 0.72 ? 'C' : 'B';

  // The arris. Two steps at the very edge, one on the chamfer inside it — a
  // 1 px shading band everywhere is the banding fault of RESEARCH A5.
  if (fs < 0.07 || ft < 0.07) k = shade(k, +2);
  else if (fs < 0.20 || ft < 0.20) k = shade(k, +1);
  if (fs > 0.91 || ft > 0.91) k = shade(k, -2);
  else if (fs > 0.80 || ft > 0.80) k = shade(k, -1);

  // Wear and lichen: sparse, and always *into* the ramp, never a new colour.
  const r = hash(x, y, seed + 17);
  if (r < 0.055) k = shade(k, -1);
  else if (r > 0.955) k = shade(k, +1);
  if (blotch(x, y, 5, 3, seed + 83) > 0.945) k = shade(k, -1);
  return k;
}

function water(x, y, seed) {
  // Ripple BANDS, not speckle. RESEARCH A7: irregular horizontal-ish streaks
  // following the diamond's long axis. The pixels never move — palette.cycleWater
  // rotates the ramp under them, and that only reads as flowing water if the
  // pattern is banded. Per-pixel noise cycles into a fizz.
  //
  // ---------------------------------------------------------------------------
  // WATER IS A PHASE FIELD, NOT A VALUE FIELD. This is the whole trick and it
  // took a measurement to find.
  //
  // The first version of this painter chose a ramp INDEX per pixel from a sum of
  // noise terms — a value field. That is the obvious way to write it and it is
  // wrong, because SPEC §4 animates water by rotating the ramp: key i is drawn
  // through hex[(i + phase) % 6]. Rotating a MONOTONE ramp under a skewed
  // distribution moves every pixel up the ramp at once, so the entire sea pulses.
  // Measured on the old painter, across the six phases:
  //
  //     mean luminance  0.253  0.344  0.446  0.562  0.364  0.221
  //
  // — a 2.5x brightness swing, eight times a second. On screen that is not
  // shimmer, it is a strobe, and four phases out of six the water is the wrong
  // colour entirely. (It got past its author because a still tile at phase 0
  // looks correct; you have to run the cycle to see it.)
  //
  // The cure is not to darken or to narrow the spread — narrowing makes the
  // still frame duller and the swing is still there. It is to make the pixel
  // distribution UNIFORM over the six keys. Rotation then permutes a uniform
  // histogram onto itself, so the mean, the min and the max of a water tile are
  // identical at every phase, by construction, for every seed. Measured on this
  // painter: 0.367 at all six phases, exactly.
  //
  // Uniform-over-a-ramp is what a phase field is. So author the wave, not the
  // value: `ph` below is a travelling wavefront in units of whole cycles, and
  // the six keys are six equal slices of one cycle. Palette rotation adds a
  // constant to `ph`. That is the identity the period technique rests on, and
  // it is why cycling reads as the crests moving rather than the sea flashing.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // AND THE FIELD IS CONTINUOUS ACROSS THE TILE LATTICE. Second thing found by
  // looking: with the phase field in and the strobe gone, a 2x2 pool still read
  // as four tiles, because every wavefront stopped dead at the diamond seam.
  //
  // A tile painter cannot know where on the map it will be drawn — but it does
  // not have to. Neighbouring tiles are offset by exactly (+/-32, +/-16) px, so
  // it is enough that `ph` gain EXACTLY A WHOLE NUMBER OF CYCLES over that step.
  // Hence: the y term has coefficient exactly 1 over the 16 px half-height (one
  // whole cycle per tile step), no x term at all, and both the wobble and the
  // grain are periodic — 32 px in x, 16 px in y. Every water tile is then the
  // same sprite and a lake is one surface. Break any of those three and the
  // seams come back.
  // ---------------------------------------------------------------------------
  const across = (y - 15.5) / 16; // one whole wave cycle per neighbour step

  // Bends the wavefronts so they are not ruled lines. All three terms are
  // periodic in x at the tile step (32 px) so they survive the seam. A single
  // sine here was the first thing tried and it scalloped: one regular wavelength
  // across every tile reads as a machined edge, not as water. The two hashed
  // terms — a coarse 4 px swell and a per-column ragged — are what break it.
  const swell = (hash((x >> 2) & 7, 0, 91) - 0.5) * 0.2;
  const ragged = (hash(x & 31, 0, 53) - 0.5) * 0.05;
  const wobble = Math.sin((Math.PI * x) / 16 + 0.6) * 0.09;
  // Grain: dissolves the band edges, well under one band wide, lattice-periodic.
  const grain = (hash((x >> 1) & 15, y & 15, 71) - 0.5) * 0.09;

  const ph = across + swell + ragged + wobble + grain;
  const f = ph - Math.floor(ph); // 0..1, uniform
  return 'FGHIJK'[Math.min(5, (f * 6) | 0)];
}

// ---------------------------------------------------------------------------
// Shoreline
// ---------------------------------------------------------------------------

// Mask bits: which of the four tile vertices are LAND.
export const N = 1, E = 2, S = 4, W = 8;

/**
 * Land field at a pixel for a given vertex mask: bilinear over the four corners
 * of the diamond-square, jittered so the coast is ragged rather than ruled.
 *   1 land vertex  -> an outer corner (a nub of land)
 *   2 adjacent     -> a straight edge
 *   3 land         -> an inner corner (a nub of water)
 *   2 opposite     -> a diagonal isthmus
 * All sixteen masks, including all-water (0) and all-land (15), come out of the
 * same expression, so the renderer's lookup is a flat 16-entry table.
 */
function landField(x, y, mask, seed) {
  const { s, t } = square(x, y);
  const n = mask & N ? 1 : 0;
  const e = mask & E ? 1 : 0;
  const so = mask & S ? 1 : 0;
  const w = mask & W ? 1 : 0;
  const f =
    w * (1 - s) * (1 - t) + so * s * (1 - t) + n * (1 - s) * t + e * s * t;
  // Pull the field toward its midpoint. On the corner masks the bilinear form
  // is steep near the lone vertex, which squeezed the whole beach into two or
  // three pixels and left the pond wearing a brown outline instead of a shore.
  // Compressing the range widens every band on every mask at once, and mask 15
  // still lands above the grass cut so plain shore-grass stays plain.
  const c = 0.5 + (f - 0.5) * 0.80;
  // Jitter only where the field is actually near a boundary. Applied blindly it
  // also perturbed the saturated masks, so SHORE[15] — the all-land tile that
  // sits BESIDE a pond, not in it — came out flecked with random sand, and
  // SHORE[0] could grow foam in open water. A ragged coast is wanted; a ragged
  // lawn is a bug.
  if (f > 0.98) return 1;
  if (f < 0.02) return 0;
  return c + (hash(x, y, seed + 601) - 0.5) * 0.075 + (blotch(x, y, 5, 3, seed + 607) - 0.5) * 0.095;
}

// Band edges in field units. Along a straight coast the field crosses the tile
// linearly over ~36 px, so 0.10 of field is about 3.6 px on screen. These give
// roughly: 5 px of dithered grass->sand ladder, 3 px of dry sand, 3 px of wet
// sand, 2 px of foam. A narrower set than this reads as an outline stroke round
// the pond rather than as a shore, which is exactly the fault it looked like on
// the first pass.
// A shore tile is a TRANSITION tile and nothing else — pure grass is supplied
// by the land tile next door, so almost none of it need appear here. Spending
// the whole diamond on the ladder is what turns a brown outline stroke round
// the pond into a beach you can see the stages of.
// The beach is FOUR stages down the earth ramp, not one band: pale dry sand at
// the top, mid sand, damp sand, and a thin dark line of saturated sand right at
// the waterline. Collapsing it to one value is what made the first two passes
// read as a mud collar round the pond instead of a shore.
const LADDER = 0.86; // above: pure grass
const DRY = 0.735; // above: grass/sand dither ladder
const MID = 0.635; // above: pale dry sand shelf
const WET = 0.545; // above: mid sand
const SURF = 0.475; // above: damp sand; below: foam, then water

function shorePaint(x, y, mask, seed) {
  const f = landField(x, y, mask, seed);

  if (f > LADDER) return grass(x, y, seed);

  if (f > DRY) {
    // The transition proper: the five-stage dither ladder of RESEARCH A5 —
    // solid grass, sparse sand-on-grass, 50% checker, sparse grass-on-sand,
    // solid sand. The Bayer matrix supplies all five stages from one call.
    // This is the ONE place on the ground where two ramps interleave.
    const d = 1 - (f - DRY) / (LADDER - DRY);
    const g = grass(x, y, seed);
    const s = hash(x, y, seed + 71) > 0.60 ? 'u' : 't';
    return dither(g, s, d, x, y);
  }

  if (f > MID) {
    // Dry sand: the pale top of the earth ramp, dry and sun-struck.
    let k = dither('t', 'u', 0.55, x, y);
    if (hash(x, y, seed + 91) > 0.94) k = 'u';
    // Shingle: a few grey chips where the surf sorts the coarse stuff out.
    if (hash(x, y, seed + 97) > 0.982) k = 'x';
    return k;
  }

  if (f > WET) {
    // Mid sand: firmer, one step down.
    const d = (f - WET) / (MID - WET);
    let k = dither('s', 't', 0.25 + d * 0.75, x, y);
    if (hash(x, y, seed + 97) > 0.985) k = 'w';
    return k;
  }

  if (f > SURF) {
    // Damp sand: earth index 2 darkened one step (RESEARCH A7). Thin — this is
    // the only genuinely dark band, and it belongs against the water, where it
    // reads as wetness rather than as an outline.
    const d = (f - SURF) / (WET - SURF);
    return dither('r', 's', 0.15 + d * 0.85, x, y);
  }

  if (f > SURF - 0.055) {
    // Foam. Keyed into the WATER ramp on purpose: it cycles with the sea, so
    // the coast breathes instead of sitting dead against a moving surface.
    return hash(x, y, seed + 113) > 0.30 ? 'K' : 'J';
  }

  // Shallow water pales toward the shore rather than butting deep water against
  // the foam line.
  const k = water(x, y, seed);
  const near = (SURF - 0.055 - f) / 0.14;
  if (near < 1 && hash(x, y, seed + 127) > near * 0.85) return shade(k, +1);
  return k;
}

// ---------------------------------------------------------------------------
// ZONING (docs/ZONING.md) — the four species grasses
//
// The base is `grass()` above: ZONING calls it `meadow`, the neutral ground
// nobody has claimed. The four below are what a settled species turns it into.
//
// THE BRIEF, and it is a hard one: five grasses that are legible at a glance
// AND harmonious together, out of the existing ramps and nothing else. Those
// two demands pull opposite ways — the cheap way to make five grounds legible
// is five hues, and five hues is a paint chart, not Arcadia.
//
// What separates them here, in order of how much work each does:
//
//   1. VALUE.   thicket 0.42 < meadow 0.49 < fen ~0.45 < sward 0.55 <
//               millefleurs 0.58. Value survives squinting, and squinting is
//               what a player does with the whole map in view.
//   2. TEMPERATURE. fen is pulled cool with cypress; thicket warm with olive
//               and dry earth; millefleurs cool-pale; sward warm-pale. Two
//               grasses of the same value never share a temperature.
//   3. TEXTURE GRAIN. millefleurs is fine (cells 4x2), meadow medium (7x3),
//               sward broad and lazy (9x4), thicket coarse and tussocky (5x3
//               with a lit shoulder on every clump). Grain reads before colour
//               at 1x — it is what makes thicket look UNKEMPT rather than
//               merely olive.
//   4. ONE SIGNATURE MARK each, rationed to well under 1% of pixels: a purple
//               thistle head, a yellow herb bloom, a teal water glint, a white
//               floret. These are the "oh, that's the unicorn's ground" tell,
//               and they are the first thing to over-do. They are deliberately
//               too sparse to change the tile's average colour.
//
// THE LOAD-BEARING RULE HOLDS IN ALL FIVE: the dominant key of every grass is
// lighter than canopy mid 'c' (#47632F, luminance 0.350), so a tree reads dark
// on any of them. thicket is the tight one — olive 'h' is 0.384 — which is why
// its lit tussock crowns run at 'i' and why dry earth shows through the mat.
// Do not darken thicket further without checking a tree against it.
// ---------------------------------------------------------------------------

function thicket(x, y, seed) {
  // SATYR. Un-tended hill scrub: dry, tussocky, unkempt. The olive ramp pulled
  // warm with bleached stems and scuffed soil showing through the mat.
  const m = mottle(x, y, 5, 3, seed + 29);
  let k = m > 0.50 ? 'i' : m < 0.22 ? 'g' : 'h';

  // Every tussock gets a lit shoulder and a shaded lee. This is the whole
  // reason thicket reads as CLUMPS rather than as olive noise: it is the
  // clump-rim-light discipline of RESEARCH A6 applied at 3 px scale, by
  // sampling the same blotch field up-light and comparing. Flat mottle at this
  // cell size looked like camouflage; the gradient term is what turned it into
  // a hillside of dead grass.
  const up = mottle(x - 2, y - 1, 5, 3, seed + 29);
  if (m - up > 0.14) k = shade(k, +1);
  else if (up - m > 0.21) k = shade(k, -1);

  // THE WARM PULL, and three passes went into finding out what it is NOT.
  //
  // "The olive ramp pulled warm" reads naturally as "let bare soil show through
  // the mat", and that is what the first two passes did — earth blotches at
  // 14% of the tile, then 6% in larger patches. Both were wrong and the second
  // was worse. Earth against olive is an enormous step in both value and hue,
  // so any COHERENT patch of it stops being a thin place in the grass and
  // becomes a separate object: the tile read first as grit, then as terracotta
  // paving. 'r' (#57402A) is the specific offender — it is a red-brown, and red
  // is a hue this palette otherwise has no use for, so the eye goes straight to
  // it and stays there.
  //
  // What actually pulls a green warm is LITTER: single bleached stems and dead
  // leaf lying ON the mat, 1 px at a time, in the ochre half of the earth ramp
  // and never in the red half. Same warmth, no object, no rubble. A hillside is
  // dry because of what is lying on it, not because the soil is showing.
  const r = hash(x, y, seed + 31);
  if (r > 0.982) k = 't'; // a sun-bleached stem
  else if (r > 0.952) k = 's'; // dead leaf down in the mat
  else if (r < 0.03) k = 'f'; // deep shade between the tussocks

  // Thistle: a purple head with a dark bract under it, so it sits ON the
  // tussock instead of floating in it. One head per ~200 px — this is the
  // satyr's signature and it must stay a glimpse, not a pattern.
  if (hash(x, y, seed + 401) > 0.9950) k = '4';
  else if (hash(x, y - 1, seed + 401) > 0.9950) k = 'g';
  return k;
}

function sward(x, y, seed) {
  // CENTAUR. Open coarse running turf — the Thessalian slope you could gallop
  // across. Paler than meadow, LOW CONTRAST and broad-grained: an open run has
  // nothing in it to catch the eye, and that emptiness is the character.
  const m = mottle(x, y, 9, 4, seed + 41);
  let k = m < 0.12 ? 'n' : m < 0.40 ? 'o' : 'p';

  const r = hash(x, y, seed + 43);
  if (r > 0.930) k = 'i'; // coarse dry herb — olive, one notch duller than turf
  else if (r < 0.045) k = 'o';

  // Herb flecks: celandine yellow, and a rare olive seed-head standing proud.
  if (hash(x, y, seed + 419) > 0.9915) k = '5';
  else if (hash(x, y - 1, seed + 419) > 0.9915) k = 'o';
  return k;
}

function fen(x, y, seed) {
  // NAIAD. Lush wet green going blue. Built on the SAME grass keys as meadow
  // and cooled with cypress, deliberately: an all-cypress ground came out
  // darker than canopy mid and every tree standing on it disappeared. Cypress
  // 'l' at about a third gives the blue cast without taking the value down.
  //
  // Nothing here uses the canopy ramp either — canopy 'd' is the rim-light on
  // every tree in the game, and a ground painted in it swallows the foliage it
  // is meant to sit under.
  // COUNT THE MARKS. The first pass had six competing terms at once — cypress,
  // shade, turf, wet dither, water, rush, dark fleck — and the tile came out as
  // blue camouflage. A ground is allowed roughly three values and one accent;
  // past that it stops being a surface and becomes a pattern. So: turf, its
  // shade, one cool patch, one rare glint.
  //
  // And it needs a DOMINANT. Three values at roughly a third each is
  // camouflage, which is what the second pass looked like at 4x — the eye
  // cannot decide what colour the ground is, so it reads the tile as a pattern
  // instead of a surface. meadow works because 'o' holds half the tile. So does
  // this: 'o' at ~60%, its shade at ~25%, and cypress as the third value at
  // ~15%, which is enough to swing the whole tile cool without competing.
  const m = mottle(x, y, 5, 2, seed + 53);
  let k = m < 0.17 ? 'l' : m < 0.42 ? 'n' : 'o';

  // Wet hollows on a broad, lazy scale, so they are places rather than pixels.
  // The water keys are three pixels in a hundred and the tile is NOT flagged
  // for cycling — they are a colour here, not a surface.
  const w = blotch(x, y, 10, 5, seed + 59);
  if (w > 0.91) k = dither('l', 'k', 0.16, x, y);
  if (w > 0.978) k = 'I';

  const r = hash(x, y, seed + 61);
  if (r > 0.955) k = 'p'; // a wet blade catching the light
  else if (r < 0.02) k = 'k';

  // Rushes: 1 px ticks standing 2 px tall — halving y in the hash is what makes
  // them upright rather than specks. A rush is a silhouette, not a colour.
  if (hash(x, y >> 1, seed + 67) > 0.988) k = 'j';
  return k;
}

function millefleurs(x, y, seed) {
  // UNICORN. Fine pale silvery turf strewn with tiny white flowers — the
  // medieval tapestry ground, not a Greek one.
  //
  // "Silvery" is the hard word: there is no silver in the ramps. The nearest
  // cool near-white is water 'K' (#9DC8B6), and a sparse speckle of it through
  // pale grass optically mixes to a sage-silver that no single key can reach.
  // Speckle rather than an ordered dither on purpose — a Bayer field at this
  // density reads as a woven grid, which is charming for one tile and awful
  // for a lawn.
  const m = mottle(x, y, 4, 2, seed + 71); // FINE grain: the smallest cells here
  let k = m < 0.30 ? 'o' : 'p';

  // The silver, and it is a VEIL not a speckle. At 21% this key read as blue
  // confetti — 'K' is two full value steps above the turf and cool against a
  // warm ramp, so it is the loudest mark available and has to be spent like
  // one. Only on the LIT blades, and POOLED: an even 9% still read as static at
  // 4x, because evenly-distributed noise is the one thing nature never does.
  // Modulating the rate by a blotch field puts the sheen in drifts, the way
  // light actually catches a slope, and the same pixel count stops reading as
  // grain and starts reading as shimmer.
  const sheen = blotch(x, y, 7, 3, seed + 73);
  if (k === 'p' && hash(x, y, seed + 74) > 0.995 - sheen * 0.15) k = 'K';
  else if (hash(x, y, seed + 79) < 0.05) k = 'n';

  // The florets, in loose drifts for the same reason, at about 1 in 110
  // overall: dense enough to read as "strewn" from across the map, sparse
  // enough that the turf is still turf. One white pixel with a shade pixel
  // under it, so each floret sits ON the grass rather than in it.
  const drift = blotch(x, y, 9, 4, seed + 421) * 0.010;
  const f = hash(x, y, seed + 431);
  if (f > 0.9955 - drift) k = '7';
  else if (f > 0.9940 - drift * 0.4) k = '3'; // a rare pale blossom, for warmth
  else if (hash(x, y - 1, seed + 431) > 0.9955 - blotch(x, y - 1, 9, 4, seed + 421) * 0.010) k = 'o';
  return k;
}

// The five painters, by ZONING name. `meadow` is the neutral base and is the
// long-standing `grass()` lawn — the ground everyone starts with.
const GRASS_PAINT = {
  meadow: grass,
  thicket,
  sward,
  fen,
  millefleurs,
};

// A distinct seed base per type, so two grasses never share a blotch field.
const GRASS_SEED = { meadow: 101, thicket: 5101, sward: 5303, fen: 5507, millefleurs: 5701 };
const VARIANT_STEP = 137; // seed spacing between variants of one type

/** The painter for a grass type, already bound to its variant seed. */
function grassPainter(type, v = 0) {
  const paint = GRASS_PAINT[type] || grass;
  const base = (GRASS_SEED[type] || 0) + v * VARIANT_STEP;
  return (x, y) => paint(x, y, base);
}

// ---------------------------------------------------------------------------
// CONTESTED GROUND — one blend routine, not ten tile sets
//
// ZONING: where two species score within CONTEST_EPS of each other the tile is
// unclaimed, and it renders as a 50% checkerboard of the two grasses.
//
// This is not a compromise render, and that is worth being clear about. A 50%
// checker between two values is exactly what period isometric art did at every
// terrain boundary (RESEARCH A5) — the mechanic and the authentic technique are
// the same operation. So contested land reads as deliberately unresolved rather
// than as a bug, which is the whole design claim of that section.
//
// The checker runs on the PAINTERS, not on their output tiles: each grass is
// evaluated at its own pixel, so both textures survive the interleave at half
// density instead of one being sampled through the other's mask. Two grasses of
// similar value optically fuse into a third; two of different value shimmer
// slightly, which is precisely the "unresolved" read wanted.
// ---------------------------------------------------------------------------

/**
 * The contested painter for a pair of grass types.
 * `(x + y) & 1` — free, exact, and the period-correct 50% dither.
 */
function contestedPaint(a, b, v = 0) {
  const pa = grassPainter(a, v);
  const pb = grassPainter(b, v);
  return (x, y) => ((x + y) & 1 ? pb(x, y) : pa(x, y));
}

// ---------------------------------------------------------------------------
// SOFT EDGES — where a species grass meets meadow
//
// The same 4-bit vertex mask the shoreline uses, and the same bilinear field,
// so a renderer that already knows how to pick a shore tile needs no new idea:
// bit set = that vertex belongs to the SPECIES, clear = it belongs to meadow.
// All sixteen masks fall out of one expression, mask 15 is plain species and
// mask 0 is plain meadow, and the twelve edges plus two isthmuses in between
// are the ones that do the work.
//
// The ladder is Bayer over a ~14 px band in the middle of the diamond: solid
// species, sparse meadow-on-species, 50% checker, sparse species-on-meadow,
// solid meadow. Five stages, per RESEARCH A5, and the 50% stage sits in the
// MIDDLE of the transition rather than at either end.
//
// Note this is a genuinely different mark from contested ground even though
// both are dithers: an edge is a directional GRADIENT that resolves on both
// sides, contested is a flat 50% that resolves nowhere. Side by side they read
// as "a border" and "an argument", which is what they are.
// ---------------------------------------------------------------------------

const EDGE_HI = 0.66; // above: pure species
const EDGE_LO = 0.34; // below: pure meadow

function edgePaint(species, base, mask, v = 0) {
  const ps = grassPainter(species, v);
  const pb = grassPainter(base, v);
  return (x, y) => {
    const f = landField(x, y, mask, GRASS_SEED[species] + 33 + v);
    if (f >= EDGE_HI) return ps(x, y);
    if (f <= EDGE_LO) return pb(x, y);
    const d = 1 - (f - EDGE_LO) / (EDGE_HI - EDGE_LO); // 0 at species, 1 at base
    return dither(ps(x, y), pb(x, y), d, x, y);
  };
}

// ---------------------------------------------------------------------------
// CLIFF FACES (docs/ELEVATION.md)
//
// Terrain is stacked flat-topped cubes. Where a tile stands proud of its SE/SW
// neighbours, those two sides are exposed and are drawn as vertical faces, one
// sprite per level of difference.
//
// GEOMETRY. A face sprite is 64 x 48 and is drawn at EXACTLY the same screen
// position as the tile diamond it hangs from — same anchor, same maths, so the
// renderer needs no second projection. Rows 0..16 are transparent; below them
// each column carries exactly LEVEL_H = 16 opaque pixels, starting one row
// under the diamond's own lowest pixel in that column. Stack them at 16 px
// intervals and a six-level cliff is one continuous wall.
//
// BOTH sides are in one sprite, split at the S vertex. That split is the point:
// SPEC §3 puts the light upper-left, so the SW face (x < 32) runs one to two
// ramp steps lighter than the SE face (x >= 32), with a highlight on the lit
// side of the arris between them. A cliff painted one flat value reads as a
// pasted rectangle no matter how much texture is on it — the two-tone crease is
// what makes it a corner.
//
// WHAT IS SHARED BETWEEN VARIANTS AND WHAT IS NOT. Depth-driven structure —
// the overhang shadow at the top, the darkening toward the base — is a function
// of `fy` alone, so it is identical in every variant and a long cliff keeps one
// coherent light. Bedding, cracks, stones and moss are seeded, so no two
// stretches repeat. Get this backwards and you either get a repeating strip or
// a cliff lit from four directions at once.
// ---------------------------------------------------------------------------

// LEVEL_H is iso.js's, re-exported rather than re-typed. ELEVATION.md calls it
// "the one tunable constant" and means it: a second copy here would let a
// steeper garden move every cliff face 4px away from the terrain it faces, and
// the symptom would be a hairline of sky along every terrace rather than an
// obviously wrong number.
export { LEVEL_H };
export const FACE_H = LEVEL_H;
export const FACE_SPRITE_H = TILE_H + LEVEL_H; // 48

/**
 * The diamond's lowest opaque row in column x — the row the face starts under.
 * Derived from rowSpan so the face can never drift off the tile edge.
 */
export function lowerEdge(x) {
  const d = Math.abs(x - 31.5);
  return TILE_H - 1 - Math.max(0, Math.ceil((d - 1.5) / 2));
}

/** Face-local depth: 0 at the top of the band, LEVEL_H-1 at the bottom. */
function faceDepth(x, y) {
  return y - lowerEdge(x) - 1;
}

/** Shared value structure for any cliff material. Depth only — never seeded. */
function faceLight(k, x, fy, seed) {
  // A FACE BAND CARRIES NO TOP AND NO BOTTOM. This is the whole reason the
  // function still exists, and it is the correction that cost the most renders.
  //
  // The obvious authoring is to shade each band: dark at the top under the turf
  // overhang, dark again at the base where the ground occludes it. It looks
  // right on one band and it is wrong on two, because a four-level cliff draws
  // the SAME sprite four times down the wall, so those two dark rows repeat
  // every 16 px and the cliff becomes a stack of separate strips with hard
  // seams between them — the exact "repeating strip" ELEVATION.md names.
  //
  // A band is a slice out of the middle of a continuous vertical plane and must
  // be authored as one: flat under directional light, seamless when stacked.
  // The two ends belong to the ENDS of the column, not to every band, so they
  // live in the cap strip (which is drawn on the top band only) and the foot
  // strip (drawn on the bottom band only).
  //
  // What is left here is a faint per-column glance of light, which is
  // lattice-safe because it varies in x and not in fy.
  if (hash(x, fy & 4, seed + 5) > 0.985) return shade(k, +1);
  return k;
}

/** The arris at the S vertex: lit edge on the near face, dark on the far. */
function arris(k, x) {
  if (x === 30 || x === 31) return shade(k, +1);
  if (x === 32 || x === 33) return shade(k, -1);
  return k;
}

function rockFace(x, fy, seed) {
  // Warm grey stone in beds. Two ramp steps between the faces (rock is a short
  // ramp, so the split has to be generous or the corner vanishes).
  const left = x < 32;
  let k = left ? 'x' : 'w';

  // Bedding planes: HORIZONTAL strata. The jitter that makes a bed wander has
  // to be sampled per BLOCK of columns, not per column — sampled per column it
  // re-rolls the bed at every x and the "strata" come out as vertical streaks,
  // which is exactly what the first pass looked like: a woven basket rather
  // than a cliff. A bed is a horizontal thing; anything that varies at 1 px in
  // x destroys it.
  // Quantised to THREE OR FOUR beds over the 16 px band, not sixteen. Sampled
  // per row it came out as a barcode — regular horizontal ruling at 1 px pitch
  // is the banding fault of RESEARCH A5 in its purest form, and it also drowned
  // the light/dark split between the two faces, which is the only thing making
  // the corner read.
  const jy = fy + Math.round((hash(x >> 3, 0, seed + 3) - 0.5) * 3.0);
  const bed = hash(0, jy >> 3, seed + 11); // two beds per band, not four
  if (bed > 0.66) k = shade(k, +1);
  else if (bed < 0.34) k = shade(k, -1);

  // Spalls: irregular blocky patches where the face has broken away, on a
  // blotch field rather than a rule. Without them rock at four beds per band
  // read as ASHLAR — indistinguishable from the dressed wall two rows down,
  // which rather defeats having two materials.
  const sp = blotch(x, fy, 7, 5, seed + 15);
  if (sp > 0.80) k = shade(k, +1);
  else if (sp < 0.18) k = shade(k, -1);

  k = faceLight(k, x, fy, seed);

  // Vertical joints: a real crack every few tiles, not a hatching. Two steps
  // down, with a lit pixel on its upper-left lip — the smallest legal 3D mark.
  const col = hash(x >> 1, 0, seed + 17);
  if (col > 0.975 && fy > 1 && fy < LEVEL_H - 1) {
    k = (x & 1) === 0 ? shade(k, -2) : shade(k, +1);
  }
  const p = hash(x >> 1, fy >> 1, seed + 23);
  if (p > 0.965) k = (x & 1) === 0 && (fy & 1) === 0 ? shade(k, +1) : shade(k, -1);

  const r = hash(x, fy, seed + 29);
  if (r > 0.98) k = shade(k, +1);
  else if (r < 0.025) k = shade(k, -1);
  return arris(k, x);
}

function earthFace(x, fy, seed) {
  // A cut bank rather than a rock face: soil in loose strata, roots at the top
  // where the turf mat is, a crumbly talus of pale grit at the bottom.
  const left = x < 32;
  let k = left ? 't' : 's';

  const jy = fy + Math.round((hash(x >> 3, 0, seed + 7) - 0.5) * 3.2);
  const bed = hash(0, jy >> 1, seed + 13);
  if (bed > 0.72) k = shade(k, +1);
  else if (bed < 0.30) k = shade(k, -1);

  k = faceLight(k, x, fy, seed);

  // Roots: thin dark threads in the upper third, wandering.
  if (fy >= 2 && fy <= 6) {
    const wob = Math.round((hash(x >> 1, 0, seed + 31) - 0.5) * 4);
    if (hash(x, 0, seed + 37) > 0.90 && fy + wob >= 3 && fy + wob <= 5) k = 'q';
  }

  // Stones in the soil. (The grit spilling out at the base belongs to the FOOT
  // strip, not to every band — see faceLight.)
  const p = hash(x >> 1, fy >> 1, seed + 41);
  if (p > 0.965) k = (x & 1) === 0 && (fy & 1) === 0 ? 'x' : 'w';

  const r = hash(x, fy, seed + 47);
  if (r > 0.97) k = shade(k, +1);
  else if (r < 0.035) k = shade(k, -1);
  return arris(k, x);
}

function dressedWall(x, fy, seed) {
  // A built retaining wall: coursed ashlar in the marble ramp, so it belongs
  // with the flagstone paths and the sculpture rather than with the rock.
  //
  // TWO courses of 8 px per band, offset half a block on the odd course — a
  // running bond. The geometry is band-periodic on purpose: stack the sprite
  // and the courses go on alternating correctly all the way up. Variants
  // therefore vary WEATHERING ONLY; move the blocks and a two-level wall
  // develops a fault line across its middle.
  const left = x < 32;
  const course = fy < 8 ? 0 : 1;
  const cy = fy - course * 8;
  const bw = 15;
  const gx = x + (course ? 7 : 0) + (seed % 3);
  const bx = Math.floor(gx / bw);
  const cx = gx - bx * bw;

  // The joint: recessed, dark, gritty rather than drawn.
  if (cy === 0 || cx === 0) {
    // Recessed, not drawn in ink. 'v' here was a black grid: the darkest rock
    // key against a pale marble face is more contrast than a 1 px joint can
    // carry, and the wall read as tiling rather than as coursed stone.
    const g = hash(x, fy, seed + 3);
    return g > 0.72 ? 'A' : g > 0.12 ? 'w' : 'x';
  }

  // WORN limestone, not fresh marble. The first pass sat this face at 'C'/'B'
  // and a retaining wall came out brighter than the grass and brighter than
  // the sculpture — and the sculpture is the one thing in this game that is
  // allowed to be the brightest object on screen (see flagstone(), same
  // lesson). One step down fixes it and reads as older stone besides.
  let k = left ? 'B' : 'A';
  // Per-block value, so no two blocks came out of the same quarry — but only
  // ever DOWNWARD. Lightening a block by a step let a block on the shaded face
  // out-value a block on the lit face, and the wall lost its corner: the two
  // planes have to stay ordered whatever the weathering does.
  if (hash(bx, course + (seed & 3) * 2, seed + 53) > 0.70) k = shade(k, -1);

  // Each block obeys the light on its own: lit along its top and left arris,
  // shaded along the bottom and right.
  if (cy === 1 || cx === 1) k = shade(k, +1);
  if (cy >= 7 || cx >= bw - 1) k = shade(k, -1);

  k = faceLight(k, x, fy, seed);

  // Weathering and lichen — always into the ramp, never a new colour.
  const r = hash(x, fy, seed + 59);
  if (r < 0.05) k = shade(k, -1);
  else if (r > 0.96) k = shade(k, +1);
  if (blotch(x, fy, 5, 3, seed + 61) > 0.93) k = shade(k, -1);
  return arris(k, x);
}

function mossyRock(x, fy, seed) {
  // The same stone with a wet north side. Moss is heavier on the SE face (the
  // shaded one) and hangs in tongues from the top where the turf drips, which
  // is where it actually grows — and it doubles as a second reading of the
  // corner, because the lit face stays comparatively bare.
  // Wet rock is dark rock: a step down the ramp before anything grows on it,
  // otherwise the moss reads as pasted onto a dry cliff.
  let k = shade(rockFace(x, fy, seed), -1);
  const shaded = x >= 32;
  // How far down the moss reaches, per block of columns — TONGUES hanging from
  // the brow, not an even coat. Sampled per 4 px so a tongue has a width; per
  // column it was a teal fuzz spread over the whole face, which reads as mould
  // on the sprite rather than moss on the rock.
  //
  // AND IT STARTS BELOW THE CAP. The first pass hung the moss from fy 0, which
  // is precisely the four rows the turf cap strip is drawn over — so the moss
  // was authored, measured, and completely invisible. Anything living on the
  // brow of a cliff has to begin where the soil band ends.
  const hang = 5 + Math.round(hash(x >> 2, 0, seed + 71) * 7) + (shaded ? 3 : 0);
  const m = blotch(x, fy, 5, 3, seed + 73);
  if (fy >= 4 && fy <= hang && m > (shaded ? 0.34 : 0.52)) {
    // Cypress in the wet, canopy where the light gets at it — moss is a clump
    // and takes a clump's rim light.
    k = m > 0.74 ? 'c' : m > 0.52 ? 'l' : 'k';
  }
  // A few damp seeps running on down out of the moss, and only below it.
  if (fy > 8 && hash(x >> 1, 0, seed + 83) > 0.965) k = hash(x, fy, seed + 89) > 0.45 ? 'k' : 'j';
  return k;
}

// --- the cap strip: the detail that stops a cliff being a pasted rectangle ---
//
// Overlaid on the TOP face of a column. What is happening physically: the turf
// mat is a couple of centimetres of root-bound sod that overhangs the cut, so
// there is a lip, a hard shadow under it, then raw dark soil, then the face
// material fading in. Four rows. Without them the grass meets the stone on a
// mathematically perfect line, and a perfect line is the tell.
//
// It paints one row ABOVE the face band as well, over the diamond's own last
// row, which is what makes the lip look like it is hanging over rather than
// sitting flush.

function turfCap(x, fy, seed) {
  // Ragged: the lip is 1-3 px deep and varies per column, with the odd tuft
  // hanging lower. A constant-depth cap is just a stripe.
  const lip = 1 + Math.round(hash(x, 0, seed + 3) * 1.6);
  const tuft = hash(x >> 1, 0, seed + 5) > 0.88 ? 1 : 0;
  const d = lip + tuft;
  if (fy < 0) {
    // Over the diamond's last row: a shade of turf, so the edge stops being a
    // clean cut. Only where a tuft actually hangs.
    return tuft && hash(x, 0, seed + 7) > 0.35 ? 'n' : null;
  }
  if (fy < d) return hash(x, fy, seed + 11) > 0.68 ? 'o' : 'n';
  if (fy === d) return 'm'; // the hard shadow under the lip
  if (fy === d + 1) return hash(x, fy, seed + 13) > 0.80 ? 'r' : 'q';
  if (fy === d + 2) return dither('q', 'r', 0.65, x, fy);
  if (fy === d + 3) return hash(x, fy, seed + 17) > 0.55 ? 'r' : null;
  return null;
}

// --- the foot strip: the other end of the column ---------------------------
//
// The mirror of the cap, and it exists for the same reason: the darkening
// where a cliff meets the ground it stands on belongs to the BOTTOM of the
// column, not to every band. Drawn over the last face band only.
//
// Built from the material's own painter rather than authored per material, so
// a foot is always in the right ramp and any future material gets one free.
function footOf(paint) {
  return (x, fy, seed) => {
    if (fy < LEVEL_H - 5) return null;
    const d = (fy - (LEVEL_H - 5)) / 5; // 0 at the top of the strip, 1 at the base
    const k = paint(x, fy, seed);
    if (fy === LEVEL_H - 1) return shade(k, -2);
    return dither(k, shade(k, -1), 0.2 + d * 0.8, x, fy);
  };
}

function bareCap(x, fy, seed) {
  // For a cliff with no soil on it: just the eaves shadow and a chipped lip.
  const lip = hash(x >> 1, 0, seed + 3) > 0.7 ? 1 : 0;
  if (fy < 0) return null;
  if (fy < lip) return 'y';
  if (fy <= lip + 1) return shade('v', 0);
  if (fy === lip + 2) return dither('v', 'w', 0.6, x, fy);
  return null;
}

// ---------------------------------------------------------------------------
// WATERFALLS
//
// The fall is a PHASE FIELD, for exactly the reason water() is one — see its
// header, which is the longest note in this file and the load-bearing one. The
// six water keys must be hit uniformly or palette rotation makes the whole
// sheet strobe instead of flow.
//
// Two things are different from the pond:
//
//  * DIRECTION. Rotating the ramp forward makes the pattern travel toward
//    DECREASING phase. The pond's `across` term increases with y, so its
//    ripples run up-screen, away from the viewer, which is right for a pond.
//    A waterfall must run DOWN, so the y term here is NEGATIVE. Flip its sign
//    and you get water falling upwards, which looks precisely as odd as it
//    sounds and is the first thing to check if this ever looks wrong.
//
//  * TILING. Faces stack every LEVEL_H = 16 px, so the y term gains a whole
//    number of cycles over 16 px (one per 8) and every x term is periodic in
//    32 px. A four-level fall is then one unbroken sheet 64 px tall.
//
// The strand offset is what stops it being a set of horizontal bars: each
// 4 px-wide ribbon of water falls at its own phase, so the crests break up
// across the width the way real falling water does.
// ---------------------------------------------------------------------------

// WHAT MADE THE FIRST FALL LOOK LIKE A KNITTED JUMPER, because it is the same
// trap the pond painter fell into and it is worth naming twice: a smooth
// periodic term across x. The first version carried sin(pi*x/16) plus an
// eight-bucket strand offset, both period-32, and the two beat together into a
// field of chevrons — a regular wavelength across a face reads as machining.
//
// The cure is the opposite of smoothing. Falling water has NO horizontal
// coherence: each narrow ribbon falls at its own moment, so the crests never
// line up across the sheet. Two hashed offsets — a 2 px ribbon at full range
// and an 8 px spout at half — and no sine at all. Both are periodic in 32 px so
// the sheet still joins to its neighbour; the y term is one whole cycle per
// 16 px so it joins to the band above and below.
function fallPhase(x, y) {
  const ribbon = hash((x >> 1) & 15, 0, 211) * 0.42; // 2 px strands, period 32
  const spout = hash((x >> 3) & 3, 0, 223) * 0.58; // a few broader chutes
  const grain = (hash(x & 31, y & 7, 217) - 0.5) * 0.14;
  return -y / 16 + ribbon + spout + grain;
}

function fallKey(x, y) {
  const ph = fallPhase(x, y);
  const f = ph - Math.floor(ph);
  return 'FGHIJK'[Math.min(5, (f * 6) | 0)];
}

function waterfallFace(x, fy, seed) {
  // ONE VARIANT, and the reason is the same as the pond's (WATER is deliberately
  // a single tile — see its header). The first build shipped two, offset half a
  // wave from each other, and alternated them down the column "for variety".
  // That is exactly the seam bug: the y term is one whole cycle per 16 px so a
  // band joins the band below it EXACTLY, and a half-cycle offset between two
  // stacked bands puts a hard horizontal break across the sheet every level.
  // A waterfall is one surface. Its variety comes from the lip, the splash and
  // the rock either side of it, never from its middle.
  let k = fallKey(x, fy);

  // The sheet is not flat: it is thrown clear of the rock at the sides, so the
  // outer few pixels sit in the shade of the cut. Quantised to the dark half of
  // the ramp rather than shaded, which keeps them inside the cycling ramp.
  const edge = Math.min(x, 63 - x);
  if (edge < 3) {
    const i = 'FGHIJK'.indexOf(k);
    k = 'FGHIJK'[edge === 0 ? Math.min(1, i >> 2) : Math.min(2, i >> 1)];
  }
  // Spray torn off the ribbons — brightest key, sparse, only in the lower half
  // where the fall has begun to break up.
  if (fy > 6 && hash(x, fy, seed + 97) > 0.965) k = 'K';
  return k;
}

function waterfallLip(x, fy, seed) {
  // Where the water goes over. ONE bright pixel of crest per column and no
  // more: a two-row band of 'K' was a white bar across the brim, and because
  // 'K' is a cycling key that bar also swung 0.21 in luminance every rotation —
  // a strobing white line, the exact fault the pond painter's header warns
  // about. A single ragged row of it reads as the water going over and costs
  // almost nothing to the cycle.
  if (fy < 0) return null;
  // Half the crest is bright, half is whatever the sheet is doing there. A
  // solid row of the two brightest keys measured a 0.20 luminance swing across
  // the six phases — a strobe on the one line of the fall the eye goes to.
  // Interleaving it with the phase field halves that and reads as broken water
  // rather than as a drawn highlight.
  if (fy === 0) return hash(x, 0, seed + 5) > 0.50 ? 'K' : fallKey(x, 0);
  if (fy > 2) return null;
  return fallKey(x, fy);
}

function splashPaint(x, y, seed) {
  // The foam where the fall lands, drawn on the diamond of the tile BELOW.
  // Heaviest at the N vertex — the fall comes over the back edge of that tile —
  // and thinning outward, with spray thrown up above the tile.
  //
  // Sprite space: 64 x 48, the diamond occupying rows 16..47, so rows 0..15 are
  // air and can carry spray. Anchor is [32, 32] — the tile centre — so the
  // renderer positions it exactly like a ground tile.
  const dy = y - 16;
  if (dy < 0) {
    // Spray, thrown up from the impact: thins fast with height, hugs the middle.
    const up = (16 - y) / 16;
    const near = 1 - Math.min(1, Math.abs(x - 32) / 20);
    if (hash(x, y, seed + 101) > 0.20 + up * 0.72 + (1 - near) * 0.45) return fallKey(x, y * 2 + 40);
    return null;
  }
  const { x0, len } = rowSpan(dy);
  if (x < x0 || x >= x0 + len) return null;
  const { s, t } = square(x, dy);
  // Distance from the N vertex, which is (s,t) = (0,1) — the back edge of the
  // tile, where the fall comes over.
  const d = Math.hypot(s * 1.05, (1 - t) * 1.05);
  const j = d + (hash(x, dy, seed + 103) - 0.5) * 0.16 + (blotch(x, dy, 5, 3, seed + 107) - 0.5) * 0.26;
  if (j > 0.95) return null; // beyond the foam: let the ground below show
  // Churn: a turbulent phase field rather than a directional one, so the foam
  // boils in place while the fall above it runs. It is DENSE — the first pass
  // feathered it away to a scatter of blue specks on the grass, which reads as
  // litter, not as water landing. A splash is a mass with a ragged edge.
  const churn = fallKey(x * 2 + 7, dy * 3 + (seed & 7));
  if (j > 0.70) return hash(x, dy, seed + 109) > 0.42 ? churn : null;
  return churn;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function makeTile(name, paint, opts = {}) {
  const { seed = 0, cycle = null, tags = [] } = opts;
  const rows = [];
  for (let y = 0; y < TILE_H; y++) {
    const line = new Array(TILE_W).fill('.');
    const { x0, len } = rowSpan(y);
    for (let i = 0; i < len; i++) line[x0 + i] = paint(x0 + i, y, seed);
    rows.push(line.join(''));
  }
  return defineSprite({ name, anchor: TILE_ANCHOR, footprint: [1, 1], rows, cycle, tags });
}

const WATER_CYCLE = { ramp: 'water', rate: 8 };

// --- Grass: four seeds, because one repeated lawn is wallpaper ---------------
export const GRASS = [
  makeTile('grass-a', grass, { seed: 101, tags: ['ground', 'grass'] }),
  makeTile('grass-b', grass, { seed: 227, tags: ['ground', 'grass'] }),
  makeTile('grass-c', grass, { seed: 359, tags: ['ground', 'grass'] }),
  makeTile('grass-d', grass, { seed: 487, tags: ['ground', 'grass'] }),
];

export const MEADOW = [
  makeTile('meadow-a', meadow, { seed: 613, tags: ['ground', 'grass', 'meadow'] }),
  makeTile('meadow-b', meadow, { seed: 751, tags: ['ground', 'grass', 'meadow'] }),
  makeTile('meadow-c', meadow, { seed: 887, tags: ['ground', 'grass', 'meadow'] }),
];

export const MOSS = [
  makeTile('moss-a', moss, { seed: 1013, tags: ['ground', 'moss', 'damp'] }),
  makeTile('moss-b', moss, { seed: 1153, tags: ['ground', 'moss', 'damp'] }),
  makeTile('moss-c', moss, { seed: 1291, tags: ['ground', 'moss', 'damp'] }),
];

export const EARTH = [
  makeTile('earth-a', bareEarth, { seed: 1427, tags: ['ground', 'bare'] }),
  makeTile('earth-b', bareEarth, { seed: 1559, tags: ['ground', 'bare'] }),
  makeTile('earth-c', bareEarth, { seed: 1697, tags: ['ground', 'bare'] }),
];

export const GRAVEL = [
  makeTile('gravel-a', gravel, { seed: 1831, tags: ['ground', 'path', 'order'] }),
  makeTile('gravel-b', gravel, { seed: 1973, tags: ['ground', 'path', 'order'] }),
  makeTile('gravel-c', gravel, { seed: 2111, tags: ['ground', 'path', 'order'] }),
];

export const FLAGSTONE = [
  makeTile('flagstone-a', flagstone, { seed: 2251, tags: ['ground', 'path', 'order', 'stone'] }),
  makeTile('flagstone-b', flagstone, { seed: 2393, tags: ['ground', 'path', 'order', 'stone'] }),
  makeTile('flagstone-c', flagstone, { seed: 2531, tags: ['ground', 'path', 'order', 'stone'] }),
];

export const SAND = [
  makeTile('sand-a', sand, { seed: 2677, tags: ['ground', 'sand', 'bare'] }),
  makeTile('sand-b', sand, { seed: 2819, tags: ['ground', 'sand', 'bare'] }),
];

// ONE water tile, on purpose, and the only single-variant set in the file.
// `water()` is a lattice-continuous phase field (see its header): every tile
// carries the same wavefronts and they join at the seams, so a lake reads as
// one surface. Seeded variants would break exactly the property that makes it
// work — the pattern must not change from tile to tile. The variety a lake
// needs comes from the sixteen shore tiles at its edge, not from its middle.
export const WATER = [
  makeTile('water-a', water, { seed: 2963, cycle: WATER_CYCLE, tags: ['ground', 'water'] }),
];

// The plunge pool is one tile for exactly the same reason (see plungePool()).
export const PLUNGE_POOL = [
  makeTile('plunge-pool', plungePool, {
    seed: 2963,
    cycle: WATER_CYCLE,
    tags: ['ground', 'water', 'deep', 'waterfall', 'quiet'],
  }),
];

/**
 * The sixteen shore tiles, indexed by the land-vertex bitmask (N|E|S|W).
 * SHORE[0] is open water, SHORE[15] is plain shore-grass; the fourteen between
 * are the twelve classic edges plus the two diagonal isthmuses.
 */
export const SHORE = [];
for (let mask = 0; mask < 16; mask++) {
  SHORE.push(
    makeTile(`shore-${mask}`, (x, y, seed) => shorePaint(x, y, mask, seed), {
      seed: 3400 + mask * 37,
      cycle: WATER_CYCLE,
      tags: ['ground', 'shore', mask === 0 ? 'water' : mask === 15 ? 'grass' : 'transition'],
    })
  );
}

/** Pick the shore tile for a 4-bit land mask of the tile's N/E/S/W vertices. */
export function shoreTileFor(mask) {
  return SHORE[mask & 15];
}

/**
 * Deterministic variant pick, so the same tile coordinate always draws the same
 * blade of grass. Never Math.random — a lawn that reshuffles on redraw crawls.
 */
export function variantFor(list, tx, ty) {
  return list[Math.floor(hash(tx, ty, 90210) * list.length) % list.length];
}

// ---------------------------------------------------------------------------
// Build: the zoning grasses
// ---------------------------------------------------------------------------

/** The five ZONING grass types, in the order the ground palette shows them. */
export const GRASS_TYPES = Object.freeze(['meadow', 'thicket', 'sward', 'fen', 'millefleurs']);

const VARIANTS = 4; // per type. Three is visibly a pattern on a big lawn; four is not.

function makeGrassSet(type) {
  const set = [];
  for (let v = 0; v < VARIANTS; v++) {
    set.push(
      makeTile(`${type}-${'abcd'[v]}`, grassPainter(type, v), {
        tags: ['ground', 'grass', type],
      })
    );
  }
  return set;
}

export const THICKET = makeGrassSet('thicket');
export const SWARD = makeGrassSet('sward');
export const FEN = makeGrassSet('fen');
export const MILLEFLEURS = makeGrassSet('millefleurs');

/**
 * Grass by ZONING type. `meadow` is the long-standing GRASS lawn — the neutral
 * ground the garden starts as — so claiming and un-claiming a tile moves it
 * between these five sets and nothing else has to know.
 */
export const GRASS_SETS = Object.freeze({
  meadow: GRASS,
  thicket: THICKET,
  sward: SWARD,
  fen: FEN,
  millefleurs: MILLEFLEURS,
});

/** Deterministic pick, keyed on the tile — never Math.random. */
function pick(list, tx, ty, salt = 0) {
  return list[Math.floor(hash(tx, ty, 90210 + salt * 7919) * list.length) % list.length];
}

/** The plain grass tile for a claimed tile. */
export function grassTile(type, tx, ty) {
  return pick(GRASS_SETS[type] || GRASS, tx, ty);
}

// --- contested and edge tiles: generated on demand, then kept ----------------
//
// Eagerly building every pair and every mask is 10 x 2 + 4 x 16 = 84 more
// 64x32 rasters at module load, most of which a given garden never shows. They
// are pure functions of (pair, mask, variant), so a memo table gives exactly
// the same determinism at a fraction of the start-up cost. `materialiseAll()`
// fills the table for the sprite lab and the linter.

const CONTESTED = new Map();
const EDGES = new Map();

/** Canonical pair order, so contested(a,b) and contested(b,a) are one tile. */
function pairKey(a, b) {
  const ia = GRASS_TYPES.indexOf(a);
  const ib = GRASS_TYPES.indexOf(b);
  return ia <= ib ? [a, b] : [b, a];
}

/**
 * A 50% checkerboard of two grass types — ZONING's contested ground.
 * Two variants per pair; more is wasted, because the checker itself is already
 * the dominant texture.
 */
export function contestedTile(a, b, tx = 0, ty = 0) {
  const [p, q] = pairKey(a, b);
  if (p === q) return grassTile(p, tx, ty);
  const v = Math.floor(hash(tx, ty, 31337) * 2) % 2;
  const key = `${p}|${q}|${v}`;
  let sp = CONTESTED.get(key);
  if (!sp) {
    sp = makeTile(`contested-${p}-${q}-${'ab'[v]}`, contestedPaint(p, q, v), {
      tags: ['ground', 'grass', 'contested', p, q],
    });
    CONTESTED.set(key, sp);
  }
  return sp;
}

/**
 * The soft dithered edge where `species` grass meets `base` (meadow by
 * default). `mask` is the 4-bit vertex mask, exactly as the shoreline uses it:
 * N|E|S|W, bit set = that vertex belongs to the species.
 *
 * mask 0 is plain base, mask 15 is plain species — both are returned straight
 * from the plain sets so the common case costs nothing.
 */
export function grassEdgeTile(species, mask, tx = 0, ty = 0, base = 'meadow') {
  const m = mask & 15;
  if (species === base) return grassTile(species, tx, ty);
  if (m === 15) return grassTile(species, tx, ty);
  if (m === 0) return grassTile(base, tx, ty);
  const v = Math.floor(hash(tx, ty, 60613) * 2) % 2;
  const key = `${species}|${base}|${m}|${v}`;
  let sp = EDGES.get(key);
  if (!sp) {
    sp = makeTile(`edge-${species}-${base}-${m}-${'ab'[v]}`, edgePaint(species, base, m, v), {
      tags: ['ground', 'grass', 'transition', species, base],
    });
    EDGES.set(key, sp);
  }
  return sp;
}

// ---------------------------------------------------------------------------
// Build: cliffs and waterfalls
// ---------------------------------------------------------------------------

// THE SIDES ARE SEPARATE SPRITES, and finding that out cost a render.
//
// The obvious build is one sprite carrying both exposed sides of a tile, since
// they are always drawn together — except that they are NOT always drawn
// together. A terrace that steps down along one axis exposes ONE side of every
// tile along its front; only the outside corner of a terrace exposes both. A
// combined sprite drew a right-hand face hanging in the air over ground that
// was level with it, or, when the renderer refused to draw it, drew nothing at
// all and the terraces floated.
//
// So: 'sw' is columns 0..31, 'se' is columns 32..63, and the renderer draws
// whichever sides actually drop. Both halves carry their own share of the arris
// at the S vertex, so a corner composed of the two is identical to the combined
// sprite would have been.
const SIDES = { sw: [0, 32], se: [32, 64], both: [0, 64] };

function faceRows(paint, seed, side, fromRow) {
  const [x0, x1] = SIDES[side] || SIDES.both;
  const rows = [];
  for (let y = 0; y < FACE_SPRITE_H; y++) rows.push(new Array(TILE_W).fill('.'));
  for (let x = x0; x < x1; x++) {
    const top = lowerEdge(x) + 1;
    for (let fy = fromRow; fy < LEVEL_H; fy++) {
      const k = paint(x, fy, seed);
      if (k) rows[top + fy][x] = k;
    }
  }
  return rows.map((r) => r.join(''));
}

/** A vertical side face: 64 x 48, drawn at the same position as the tile. */
function makeFace(name, paint, opts = {}) {
  const { seed = 0, cycle = null, tags = [], side = 'both' } = opts;
  return defineSprite({
    name,
    anchor: TILE_ANCHOR,
    footprint: [1, 1],
    rows: faceRows(paint, seed, side, 0),
    cycle,
    tags,
  });
}

/** A cap strip: the same geometry, but the painter may return null, and may
 *  paint one row ABOVE the face band, over the diamond's own last row. */
function makeCap(name, paint, opts = {}) {
  const { seed = 0, cycle = null, tags = [], side = 'both' } = opts;
  return defineSprite({
    name,
    anchor: TILE_ANCHOR,
    footprint: [1, 1],
    rows: faceRows(paint, seed, side, -1),
    cycle,
    tags,
  });
}

/** The splash: a diamond with 16 px of air above it for spray. Anchor [32,32]. */
function makeSplash(name, paint, opts = {}) {
  const { seed = 0, cycle = null, tags = [] } = opts;
  const rows = [];
  for (let y = 0; y < FACE_SPRITE_H; y++) {
    const line = new Array(TILE_W).fill('.');
    for (let x = 0; x < TILE_W; x++) {
      const k = paint(x, y, seed);
      if (k) line[x] = k;
    }
    rows.push(line.join(''));
  }
  return defineSprite({
    name,
    anchor: [32, 32],
    footprint: [1, 1],
    rows,
    cycle,
    tags,
  });
}

const FACE_SEEDS = [401, 619, 863];

/** The two exposed sides of a tile. A tile may show either, both, or neither. */
export const SIDE_KEYS = Object.freeze(['sw', 'se']);

function makeSided(base, paint, build, seeds, tags, extra = {}) {
  const out = { sw: [], se: [] };
  for (const side of SIDE_KEYS) {
    seeds.forEach((seed, i) => {
      out[side].push(build(`${base}-${side}-${'abc'[i]}`, paint, { seed, side, tags, ...extra }));
    });
  }
  return Object.freeze(out);
}

/**
 * Cliff side faces by material and side, three seeded variants each so a long
 * cliff is not a repeating strip. `wall` keeps its course geometry across
 * variants on purpose — see dressedWall().
 */
export const CLIFF_FACES = Object.freeze({
  rock: makeSided('cliff-rock', rockFace, makeFace, FACE_SEEDS, ['cliff', 'face', 'rock']),
  earth: makeSided('cliff-earth', earthFace, makeFace, FACE_SEEDS, ['cliff', 'face', 'earth']),
  wall: makeSided('cliff-wall', dressedWall, makeFace, FACE_SEEDS, ['cliff', 'face', 'wall']),
  mossy: makeSided('cliff-mossy', mossyRock, makeFace, FACE_SEEDS, ['cliff', 'face', 'mossy']),
});

export const CLIFF_MATERIALS = Object.freeze(['rock', 'earth', 'wall', 'mossy']);

/**
 * The cap strips, overlaid on the TOP face of a column: `turf` where grass
 * grows to the edge, `bare` for a naked stone brow.
 */
export const CLIFF_CAPS = Object.freeze({
  turf: makeSided('cap-turf', turfCap, makeCap, [1201, 1409, 1613], ['cliff', 'cap', 'turf']),
  bare: makeSided('cap-bare', bareCap, makeCap, [1801, 2003, 2213], ['cliff', 'cap', 'bare']),
});

/**
 * The foot strips, overlaid on the BOTTOM face band of a column: the ground
 * contact shadow, in each material's own ramp. One per material.
 */
export const CLIFF_FEET = Object.freeze({
  rock: makeSided('foot-rock', footOf(rockFace), makeCap, FACE_SEEDS, ['cliff', 'foot', 'rock']),
  earth: makeSided('foot-earth', footOf(earthFace), makeCap, FACE_SEEDS, ['cliff', 'foot', 'earth']),
  wall: makeSided('foot-wall', footOf(dressedWall), makeCap, FACE_SEEDS, ['cliff', 'foot', 'wall']),
  mossy: makeSided('foot-mossy', footOf(mossyRock), makeCap, FACE_SEEDS, ['cliff', 'foot', 'mossy']),
});

// ===========================================================================
// THE CASCADE PAIR — cascade-lip and plunge-pool.
//
// With ELEVATION.md shipped, the best thing in this game to build is a spring
// on a terrace falling to a pool below, and until now both ENDS of it were
// understudies: the top drew the flat spring-head and the bottom drew open
// lake. The middle — the sheet, the brim, the foam — has been real since the
// waterfall painters above. These two are the ends.
//
// Both are authored against the painters directly above them rather than as
// new inventions, which is the point: the lip's tongue is fallKey(), the same
// travelling phase field as the sheet it turns into, so the water that leaves
// the lip and the water on the cliff face below are literally the same wave.
// ===========================================================================

/** A blank pixel grid, for the two pieces here that are objects, not tiles. */
function pgrid(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill('.'));
}
function pput(g, x, y, k) {
  x = Math.round(x);
  y = Math.round(y);
  if (k && y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = k;
}

/**
 * CASCADE LIP — the worn stone sill water leaves a terrace over.
 *
 * The whole tile is a rock shelf, not a little spout sitting on grass. That is
 * the correction that made it read: a spout drawn as an object on turf looks
 * like a garden ornament leaking, because water does not pour off a lawn. It
 * pours off ROCK, and the rock has to be the size of the ground it replaces.
 *
 * Then three things carry the reading, in this order of importance:
 *
 *   1. THE NOTCH. A sill with a low place in it. Water finds the low place;
 *      without one the sheet has no reason to be where it is, and a lip drawn
 *      with an even brim reads as a bath overflowing on all sides.
 *   2. THE HELD WATER. A pool behind the sill, level and still, using the pond
 *      painter so it is the same water as everything else — the contrast
 *      between still-behind and falling-through is the event.
 *   3. THE TONGUE. Where the pool goes through the notch it stops being a
 *      surface and becomes a sheet: fallKey() from here down, so it joins the
 *      cliff face's waterfall exactly, and one ragged row of crest at the brim
 *      and no more (waterfallLip() explains why a solid bright row strobes).
 *
 * 64 x 52, anchor [32, 20]: the diamond occupies rows 4..35 and the sixteen
 * rows below it are one LEVEL_H of fall, hanging over the drop.
 */
const LIP_H = 52;
const LIP_TOP = 4; // the diamond's first row inside the sprite
const LIP_ANCHOR_Y = LIP_TOP + TILE_H / 2;

/** Rock shelf: blocky, weathered, in beds, lit from the upper left. */
function shelfKey(x, dy, seed) {
  // Blocks, jittered off the lattice, each with its own value and its own lit
  // upper-left arris. Same idea as the rock scramble in art/decor.js, at half
  // the scale, because this shelf is one tile and not a climb.
  const by = Math.floor((dy + hash(x >> 3, 0, seed + 3) * 4) / 6);
  const bx = Math.floor((x + hash(0, by, seed + 5) * 7) / 9);
  const n = hash(bx, by, seed + 7);
  let i = n > 0.74 ? 3 : n > 0.42 ? 2 : 1;
  // The arris, and the JOINT. The first pass lit the block corners and left
  // it there, and the shelf came out a flat beige plateau — because on a short
  // four-key ramp a lit corner alone is one step, and one step over a whole
  // tile is nothing. What makes broken rock read is the dark BETWEEN the
  // blocks: the joint is two steps down and it is drawn on the block's lower
  // right, where the next block's shoulder would shade it.
  const fx = (x + hash(0, by, seed + 5) * 7) / 9 - bx;
  const fy = (dy + hash(x >> 3, 0, seed + 3) * 4) / 6 - by;
  if (fx < 0.18 || fy < 0.18) i += 1;
  if (fx > 0.90 || fy > 0.90) i -= 2;
  else if (fx > 0.74 || fy > 0.74) i -= 1;
  const r = hash(x, dy, seed + 11);
  if (r > 0.955) i += 1;
  else if (r < 0.06) i -= 1;
  return 'vwxy'[Math.max(0, Math.min(3, i))];
}

function cascadeLipGrid(seed) {
  const g = pgrid(TILE_W, LIP_H);
  // The notch: where the sill is low and the water goes through, centred on
  // the S vertex, because that is the corner of the diamond nearest the viewer
  // and therefore the one a fall can actually be seen leaving. NARROW: take
  // one cut it eighteen pixels wide and the sheet came out a blue pillar as
  // broad as the tile, which reads as a dam sluice, not as a cascade.
  const NOTCH = 6;
  const wet = (x) => Math.max(0, 1 - Math.abs(x - 32) / (NOTCH + 3));

  // ---- the shelf, over the whole diamond -----------------------------------
  for (let dy = 0; dy < TILE_H; dy++) {
    const { x0, len } = rowSpan(dy);
    for (let x = x0; x < x0 + len; x++) pput(g, x, LIP_TOP + dy, shelfKey(x, dy, seed));
  }

  // ---- the held water ------------------------------------------------------
  // NOT an ellipse. An ellipse of water in a rock tile is a bath, and take one
  // was exactly that, down to the dark ring round the rim reading as an
  // overflow. What is actually happening is that the water is standing in a
  // hollow of the shelf and DRAINING toward the notch, so its shape is a
  // catchment — wide at the back, pulled forward to a throat at the low point.
  // A TEARDROP, widest across the middle of the shelf and drawn out to a stem
  // at the throat. Take two made it widest at the BACK and it came out as a
  // wishbone: two wings and a stalk, which the eye reads as an object lying on
  // the rock rather than as an absence in it. A hollow is widest where it is
  // deepest, and that is the middle.
  const throat = (dy) =>
    (dy < 12
      ? 14 * Math.max(0, (dy - 3) / 9) ** 0.8
      : Math.max(3.0, 14 * Math.max(0, 1 - (dy - 12) / 16) ** 1.3)) *
    // Ragged, per column-block, so the water's edge is a shoreline and not a
    // drawn curve. A perfectly smooth pool boundary is the whole reason take
    // one read as a bath: baths have rims, hollows in rock do not.
    (0.86 + hash(0, dy >> 1, seed + 47) * 0.28);
  for (let dy = 4; dy < TILE_H - 2; dy++) {
    const { x0, len } = rowSpan(dy);
    const half = throat(dy);
    // The back of the catchment: the water does not reach the shelf's far
    // corner, it fades out into wet stone.
    if (dy < 7 && half < 6) continue;
    for (let x = Math.round(32 - half); x <= Math.round(32 + half); x++) {
      if (x < x0 + 2 || x >= x0 + len - 2) continue;
      const edge = half - Math.abs(x - 32);
      // One pixel of wet stone where the water meets the rock, so the surface
      // sits IN the shelf rather than on top of it. Two pixels of the darkest
      // rock — take one — drew a hard black outline round the pool and the
      // whole thing read as a crack in the ground.
      if (edge < 1.1) {
        pput(g, x, LIP_TOP + dy, hash(x, dy, seed + 43) > 0.4 ? 'w' : 'v');
        continue;
      }
      // Still at the back, already running by the time it reaches the throat.
      // Blending the two over several rows is what makes the water look like
      // it ACCELERATES into the fall rather than changing character on a line.
      const run = (dy - 8) / 12;
      const k = run > hash(x, dy, seed + 41) ? fallKey(x, dy * 2 - 26) : water(x, dy + 6, seed + 17);
      pput(g, x, LIP_TOP + dy, k);
    }
  }

  // ---- the brim, the front face of the sill, and the fall -------------------
  for (let x = 0; x < TILE_W; x++) {
    const le = lowerEdge(x); // the diamond's last opaque row in this column
    const w = wet(x);
    if (w <= 0 || Math.abs(x - 32) > NOTCH) {
      // Dry sill: a short rock face below the rim so the shelf has thickness,
      // and a dark under-edge. Four pixels — enough to say "this stands proud
      // of what is below it" without competing with a real cliff band.
      for (let k = 1; k <= 4; k++) {
        pput(g, x, LIP_TOP + le + k, k === 4 ? 'v' : shelfKey(x, le + k * 3, seed + 23));
      }
      // Wet stone beside the throat: water spills a little wider than its
      // channel and darkens the rock it runs over. Two pixels of that is the
      // difference between a spout and a cascade.
      if (w > 0) {
        for (let k = -2; k <= 3; k++) {
          const y = LIP_TOP + le + k;
          if (g[y] && 'vwxy'.includes(g[y][x])) pput(g, x, y, hash(x, k, seed + 31) > 0.55 ? 'v' : 'w');
        }
      }
      continue;
    }
    // Wet: the crest, then the sheet, all the way down.
    // ONE ragged row of crest, for waterfallLip()'s reason — a solid bright
    // brim is a bar of 'K' across the tile and 'K' cycles, so the bar strobes.
    const brim = LIP_TOP + le - 1;
    pput(g, x, brim, hash(x, 0, seed + 29) > 0.62 ? 'K' : fallKey(x, 0));
    for (let y = brim + 1; y < LIP_H; y++) {
      // The sheet is thrown clear of the notch and TAPERS as it falls, tearing
      // at the sides. Below the sprite's own rows the cliff's fall-face takes
      // over, and it is the same phase field, so the join is exact.
      const half = NOTCH - 0.6 - (y - brim) * 0.09;
      if (Math.abs(x - 32) > half) break;
      pput(g, x, y, fallKey(x, y - brim));
    }
  }
  return g;
}

function makeCascadeLip(name, seed) {
  const g = cascadeLipGrid(seed);
  return defineSprite({
    name,
    anchor: [32, LIP_ANCHOR_Y],
    footprint: [1, 1],
    rows: g.map((r) => r.join('')),
    cycle: { ramp: 'water', rate: 10 },
    tags: ['terrain', 'rock', 'water', 'waterfall', 'spring-head', 'archaic', 'wild'],
  });
}

export const CASCADE_LIP = makeCascadeLip('cascade-lip', 3121);

/**
 * PLUNGE POOL — the deep basin a fall digs for itself.
 *
 * THE TRAP, and it is the same one the pond painter's header spends forty
 * lines on. "Deep and dark" wants to be authored by pushing the water keys
 * down the ramp. It must not be: SPEC §4 animates water by ROTATING the ramp,
 * so a tile whose six keys are not equally used changes its mean brightness at
 * every phase, and a pond that pulses is worse than a pond that is too pale.
 *
 * SO THE DARKNESS IS SPENT KEY-BLIND. Every pixel of the tile, whatever wave
 * key it landed on, is replaced by peat dark in the ROCK ramp with the SAME
 * probability. The six keys therefore keep exactly the uniform histogram the
 * pond painter constructed, only scaled down, and rotation still permutes it
 * onto itself: measured across the six phases, this tile's mean luminance is
 * constant to 0.001, the same as open water's.
 *
 * It also happens to be the physically true statement. Deep water is not
 * darker water — it is water with nothing under it, so a share of what you see
 * is the light that went down and did not come back, and that share is the
 * same wherever the wave happens to be. Dark keyed to the TROUGHS is the
 * version that looks right in a still frame and is wrong the moment it moves;
 * this was that version, measured at a 0.073 luminance swing, before the
 * substitution was made blind.
 *
 * Everything else about it is the pond: the same lattice-continuous phase
 * field, the same period in x and y, so a 2x2 plunge pool is ONE surface and
 * joins the open water beside it without a seam.
 */
function plungePool(x, y, seed) {
  const k = water(x, y, seed);

  // Foam, torn off the fall and turning slowly. Sparse, and on a blotch rather
  // than at a fixed place: the first version put one curl at the N vertex and
  // a 2x2 pool came out as four curls in a row.
  if (blotch(x, y, 11, 5, seed + 151) > 0.965) return 'K';

  // The deep. A gentle blotch modulates HOW deep, so the dark gathers into
  // holes rather than laying an even screen over the whole basin, but the
  // modulation is on position only — never on the wave key.
  //
  // AND THE THRESHOLD IS JITTERED. Plain Bayer at forty per cent is a strong
  // regular screen, and over a whole pool it stops reading as water and starts
  // reading as halftone printing — a modern tell, and a loud one. Shaking the
  // ordered threshold with a hash keeps the dispersion Bayer is for while
  // destroying its period, which is the difference between a stipple and a
  // mesh.
  //
  // AND THE MODULATION IS DEEP ENOUGH TO CLEAR BOTH ENDS. A constant forty per
  // cent, however the threshold is jittered, is still forty per cent
  // everywhere, and forty per cent of anything laid over a whole pool reads as
  // a mesh thrown across the water. Swinging it from near nothing to near
  // solid gives what a real basin has: patches you can see into and patches
  // you cannot, with the dither only ever appearing in the ground between.
  //
  // The blotch's CELL SIZE was chosen by measuring, not by eye. The darkening
  // is key-blind by construction, but `deep` and the wave phase are both
  // functions of position, so a cell size close to the wave's own period
  // correlates with it by accident and the phase-invariance leaks: 13x6
  // measured a 0.0164 swing, 9x5 the same, 17x8 measured 0.0058 — flatter than
  // open water's own 0.0069. Bigger cells also give the patchier, more
  // basin-like read, so the number that measures best is also the one that
  // looks best. Do not retune this by eye alone.
  const deep = Math.max(0, Math.min(1, 0.33 + (blotch(x, y, 17, 8, seed + 157) - 0.5) * 1.2));
  const th = (BAYER4[y & 3][x & 3] + 0.5 + (hash(x, y, seed + 167) - 0.5) * 5) / 16;
  // Two keys, not one: the rim of a dark patch is scoured stone catching a
  // little light, its middle is water with nothing under it.
  if (deep > th) return deep - th < 0.22 || hash(x, y, seed + 163) > 0.88 ? 'w' : 'v';
  return k;
}

const WATERFALL_CYCLE = { ramp: 'water', rate: 12 }; // faster than the pond: it is falling

export const WATERFALL = Object.freeze({
  // ONE variant per side, on purpose — see waterfallFace().
  face: makeSided('fall-face', waterfallFace, makeFace, [0], ['cliff', 'face', 'water'], {
    cycle: WATERFALL_CYCLE,
  }),
  lip: makeSided('fall-lip', waterfallLip, makeCap, [2207, 2411], ['cliff', 'cap', 'water'], {
    cycle: WATERFALL_CYCLE,
  }),
  splash: [
    makeSplash('fall-splash-a', splashPaint, { seed: 2609, cycle: WATERFALL_CYCLE, tags: ['ground', 'foam', 'water'] }),
    makeSplash('fall-splash-b', splashPaint, { seed: 2803, cycle: WATERFALL_CYCLE, tags: ['ground', 'foam', 'water'] }),
  ],
});

/**
 * A cliff face. `side` is 'sw' or 'se' — draw one call per exposed side per
 * level of drop, all at the tile's own screen position, offset down by
 * level * LEVEL_H.
 */
export function cliffFaceFor(material, side, tx, ty, level = 0) {
  const set = (CLIFF_FACES[material] || CLIFF_FACES.rock)[side] || CLIFF_FACES.rock.sw;
  return pick(set, tx + level * 31, ty - level * 17, 1);
}

/** The cap strip for the brow of a column, drawn over the TOP face band. */
export function cliffCapFor(kind, side, tx, ty) {
  const set = (CLIFF_CAPS[kind] || CLIFF_CAPS.turf)[side] || CLIFF_CAPS.turf.sw;
  return pick(set, tx, ty, 2);
}

/** The foot strip, drawn over the BOTTOM face band of a column. */
export function cliffFootFor(material, side, tx, ty) {
  const set = (CLIFF_FEET[material] || CLIFF_FEET.rock)[side] || CLIFF_FEET.rock.sw;
  return pick(set, tx, ty, 5);
}

/** One band of falling water. */
export function waterfallFaceFor(side) {
  return (WATERFALL.face[side] || WATERFALL.face.sw)[0];
}

/** The lip at the brim, and the foam where it lands. */
export function waterfallLipFor(side, tx, ty) {
  return pick(WATERFALL.lip[side] || WATERFALL.lip.sw, tx, ty, 3);
}
export function waterfallSplashFor(tx, ty) {
  return pick(WATERFALL.splash, tx, ty, 4);
}

/** Everything, by name — for the sprite lab and the catalogue. */
export const TILES = {};
for (const set of [
  GRASS,
  MEADOW,
  MOSS,
  EARTH,
  GRAVEL,
  FLAGSTONE,
  SAND,
  WATER,
  PLUNGE_POOL,
  [CASCADE_LIP],
  SHORE,
  THICKET,
  SWARD,
  FEN,
  MILLEFLEURS,
  ...Object.values(CLIFF_FACES).flatMap((m) => Object.values(m)),
  ...Object.values(CLIFF_CAPS).flatMap((m) => Object.values(m)),
  ...Object.values(CLIFF_FEET).flatMap((m) => Object.values(m)),
  ...Object.values(WATERFALL.face),
  ...Object.values(WATERFALL.lip),
  WATERFALL.splash,
]) {
  for (const sp of set) TILES[sp.name] = sp;
}

/**
 * Force every lazily-generated blend into existence and register it, so the
 * sprite lab and the linter can see the whole inventory. Never called by the
 * game — a garden only pays for the blends it actually shows.
 */
export function materialiseAll() {
  for (let i = 0; i < GRASS_TYPES.length; i++) {
    for (let j = i + 1; j < GRASS_TYPES.length; j++) {
      for (let v = 0; v < 2; v++) {
        const [p, q] = pairKey(GRASS_TYPES[i], GRASS_TYPES[j]);
        const key = `${p}|${q}|${v}`;
        if (!CONTESTED.has(key)) {
          CONTESTED.set(
            key,
            makeTile(`contested-${p}-${q}-${'ab'[v]}`, contestedPaint(p, q, v), {
              tags: ['ground', 'grass', 'contested', p, q],
            })
          );
        }
      }
    }
  }
  for (const species of GRASS_TYPES) {
    if (species === 'meadow') continue;
    for (let m = 1; m < 15; m++) {
      for (let v = 0; v < 2; v++) {
        const key = `${species}|meadow|${m}|${v}`;
        if (!EDGES.has(key)) {
          EDGES.set(
            key,
            makeTile(`edge-${species}-meadow-${m}-${'ab'[v]}`, edgePaint(species, 'meadow', m, v), {
              tags: ['ground', 'grass', 'transition', species],
            })
          );
        }
      }
    }
  }
  for (const sp of [...CONTESTED.values(), ...EDGES.values()]) TILES[sp.name] = sp;
  return TILES;
}

/** Terrain families, in the order a palette would show them. */
export const TERRAIN = {
  grass: GRASS,
  meadow: MEADOW,
  moss: MOSS,
  earth: EARTH,
  gravel: GRAVEL,
  flagstone: FLAGSTONE,
  sand: SAND,
  water: WATER,
  // The zoning grasses. `meadow` above is the long, flowering, unmown ground
  // type from the catalogue; ZONING's neutral base is `grass`. Two vocabularies
  // that happen to share a word — the seam is in main.js, not here.
  thicket: THICKET,
  sward: SWARD,
  fen: FEN,
  millefleurs: MILLEFLEURS,
};

export default TILES;
