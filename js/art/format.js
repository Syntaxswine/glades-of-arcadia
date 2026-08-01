// format.js — the sprite authoring format for Arcadia.
//
// Every sprite in this game is hand-authored as text. No image files, no
// spritesheets, no external assets. A sprite is a list of equal-length strings
// where each character is a key into the shared palette (see js/palette.js),
// and '.' means transparent.
//
//   export const URN = defineSprite({
//     name: 'urn',
//     anchor: [8, 22],        // the pixel that sits on the tile's centre point
//     footprint: [1, 1],      // tiles occupied, [x, y]
//     rows: [
//       '..mmnn..',
//       '.mnnooo.',
//       ...
//     ],
//   });
//
// Authoring rules, which the validator enforces:
//
//  * Every row is the same length. Width and height are derived, never declared.
//  * Only palette keys and '.' may appear. A typo is a hard error at load, not
//    a silently missing pixel.
//  * Keys are grouped into RAMPS (see palette.js) — 'a'..'e' is the foliage
//    ramp dark-to-light, and so on. Authoring against ramps rather than loose
//    colours is what keeps the whole game looking like one artist drew it.
//
// The rasteriser caches one canvas per (sprite, palette variant). Variants are
// the cheap period trick: the same rows drawn through a shifted ramp gives you
// an autumn tree, a moonlit statue, or a dead shrub for free.

import { GROUND_ELLIPSE } from '../iso.js';

const TRANSPARENT = '.';

/** Validate and freeze a sprite definition. Throws loudly on malformed art. */
export function defineSprite(def) {
  const { name, rows, anchor, footprint = [1, 1], cycle = null, tags = [] } = def;

  if (!name || typeof name !== 'string') {
    throw new Error('defineSprite: a sprite needs a name');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`defineSprite(${name}): rows must be a non-empty array`);
  }

  const h = rows.length;
  const w = rows[0].length;

  for (let y = 0; y < h; y++) {
    if (typeof rows[y] !== 'string') {
      throw new Error(`defineSprite(${name}): row ${y} is not a string`);
    }
    if (rows[y].length !== w) {
      throw new Error(
        `defineSprite(${name}): row ${y} is ${rows[y].length}px, expected ${w}px. ` +
          `Every row must be the same length — pad with '.'`
      );
    }
  }

  if (!Array.isArray(anchor) || anchor.length !== 2) {
    throw new Error(
      `defineSprite(${name}): anchor must be [x, y] — the pixel that sits on ` +
        `the tile's centre point. Without it the sprite floats.`
    );
  }
  if (anchor[0] < 0 || anchor[0] >= w || anchor[1] < 0 || anchor[1] >= h) {
    throw new Error(
      `defineSprite(${name}): anchor [${anchor}] is outside the ${w}x${h} sprite`
    );
  }

  return Object.freeze({ name, rows: Object.freeze(rows.slice()), w, h, anchor: Object.freeze(anchor.slice()), footprint: Object.freeze(footprint.slice()), cycle, tags: Object.freeze(tags.slice()) });
}

/**
 * THE SHADOW KEY. 'm' is the darkest step of the GRASS ramp, and every baked
 * contact shadow in the game is drawn in it (`contactShadow('o') === 'm'`).
 *
 * IT IS NOT A DEDICATED SHADOW COLOUR, and that is the whole difficulty. 'm' is
 * also `GRASS[0]`, an ordinary object colour: 457 of the tumulus's 'm' pixels
 * are its own barrow turf, nowhere near its skirt. So "ignore 'm'" is a good
 * enough rule for finding a FOOT — a shadow is always the lowest thing, and
 * turf on a mound's flank is not — and a catastrophic rule for RECOLOURING.
 */
export const SHADOW_KEY = 'm';

/**
 * WHERE AN OBJECT ACTUALLY MEETS THE GROUND — measured from the art, and blind
 * to the shadow it already casts.
 *
 *     groundCentre(art) -> { cx, cy, r, dx, dy, ... }   |   null
 *
 * THREE CONSUMERS, ONE IMPLEMENTATION, which is why it lives here rather than
 * in the tool that first needed it:
 *
 *   js/render.js            sizes the runtime contact shadow from `r`, so a
 *                           broad plane tree and a narrow cypress differ
 *   tools/isogeom.mjs       re-exports it for the audits and the sprite lab
 *   tools/anchor-audit.mjs  `dx`/`dy` ARE the mis-anchor check
 *
 * A renderer and an audit disagreeing about where an object's foot is would be
 * worse than either being wrong, because the disagreement is invisible: the
 * audit would pass art the renderer then shades in the wrong place.
 *
 * It takes anything sprite-shaped — `defineSprite` output and `grow.js`'s
 * composed trees are the same record, which is what lets one function size the
 * shadow under a hand-drawn herm and under a procedural oak.
 *
 * How:
 *
 *   the base band  the lowest opaque NON-shadow pixel in each column, kept only
 *                  where it lands within the footprint diamond's own half-
 *                  height of the deepest one. That band is the foot.
 *   cx             the midpoint of the band's span, in CONTINUOUS pixel space
 *                  (pixel `x` spans `[x, x+1)`, so its centre is `x + 0.5`).
 *   r              its half-width, clamped to the plot's `(fw+fh)*16` — an
 *                  object may not touch more ground than it stands on.
 *   cy             `deepest - r * GROUND_ELLIPSE`. The deepest row is the FRONT
 *                  of the foot, and a 2:1 foot of half-width `r` is `r/2` tall,
 *                  so its centre is that far back up the screen.
 *
 * WHY IT IS MEASURED RATHER THAN DECLARED. Every baked skirt in this game was
 * positioned by a number typed at the call site — `skirt(g, cx + 2, ay + 1, 60)`
 * — and in July 2026 four of those numbers were wrong by 12 to 27 rows, which
 * put four buildings in the air above their own shadows. They were repaired by
 * hand-measuring the bases at 115, 118, 83 and 63 px. This computes what was
 * measured, and reproduces all four to within a few pixels, which is the check
 * that it is a fair statement and not merely a plausible one.
 *
 * Returns `null` when there is nothing to measure — a sprite that is ALL shadow
 * has no foot, and reporting a centre for it would be inventing one.
 */
export function groundCentre(art, opts = {}) {
  if (!art || !Array.isArray(art.rows) || !art.w) return null;
  const shadowKey = opts.shadowKey === undefined ? SHADOW_KEY : opts.shadowKey;
  const fp = art.footprint || [1, 1];

  // The bottom contour, ignoring shadow pixels. ASK THE SHADOW WHERE THE OBJECT
  // STANDS AND IT ANSWERS "WHEREVER I AM" — the circular reasoning that let a
  // detached skirt sit 27 rows below its building with no tool objecting.
  const low = [];
  for (let x = 0; x < art.w; x++) {
    for (let y = art.h - 1; y >= 0; y--) {
      const ch = (art.rows[y] || '')[x];
      if (ch !== undefined && ch !== TRANSPARENT && ch !== shadowKey) {
        low.push({ x, y });
        break;
      }
    }
  }
  if (low.length < 2) return null;

  let deepest = 0;
  for (const p of low) if (p.y > deepest) deepest = p.y;
  const band = (fp[0] + fp[1]) * 8; // the diamond's half-height
  const inBand = low.filter((p) => p.y >= deepest - band);

  const x0 = inBand[0].x;
  const x1 = inBand[inBand.length - 1].x;
  const cx = (x0 + x1 + 1) / 2;

  const rArt = (x1 - x0 + 1) / 2;
  const rPlot = (fp[0] + fp[1]) * 16;
  const r = Math.min(rArt, rPlot);
  const cy = deepest - r * GROUND_ELLIPSE;

  const [ax, ay] = art.anchor || [Math.floor(art.w / 2), art.h - 1];
  return {
    cx,
    cy,
    r,
    x0,
    x1,
    deepest,
    span: inBand.length,
    // What the art wanted against what the plot allows, so a report can say
    // which one bound: "small because the object is narrow" and "small because
    // the tile is" are different notes to an artist.
    rArt,
    rPlot,
    clamped: r < rArt ? 'plot' : '',
    // ...and the same point as an offset from the anchor, which is what makes
    // this an AUDIT as well as a constructor. The anchor is by definition the
    // pixel on the tile's centre point, so a large `dx`/`dy` means the sprite
    // is mis-anchored, mis-drawn, or standing somewhere it does not claim to.
    // `ax + 0.5` because the anchor is a PIXEL and `cx` is between pixels.
    dx: cx - (ax + 0.5),
    dy: cy - ay,
  };
}

/** Every distinct palette key used by a sprite, in first-seen order. */
export function keysUsed(sprite) {
  const seen = new Set();
  for (const row of sprite.rows) {
    for (const ch of row) if (ch !== TRANSPARENT) seen.add(ch);
  }
  return [...seen];
}

/**
 * Check a sprite against a palette before drawing. Returns an array of
 * problems (empty when clean) rather than throwing, so a sprite lab can list
 * every fault in the whole catalogue in one pass.
 */
export function lintSprite(sprite, palette) {
  const problems = [];
  for (const key of keysUsed(sprite)) {
    if (!palette.has(key)) {
      problems.push(`${sprite.name}: unknown palette key '${key}'`);
    }
  }
  // A sprite whose every edge pixel is opaque is almost always a mistake in an
  // isometric scene — it means the silhouette was never cut out.
  const solidEdges =
    sprite.rows[0].indexOf(TRANSPARENT) === -1 &&
    sprite.rows[sprite.h - 1].indexOf(TRANSPARENT) === -1;
  if (solidEdges && sprite.w > 8) {
    problems.push(`${sprite.name}: top and bottom rows are fully opaque — is the silhouette cut out?`);
  }
  return problems;
}

const cache = new Map();

function cacheKey(sprite, variant) {
  return `${sprite.name}::${variant || 'base'}`;
}

/**
 * Rasterise a sprite to a canvas, once, and keep it. `resolve(key)` returns a
 * '#rrggbb' for a palette key — pass a variant resolver to recolour a sprite
 * through a different ramp without touching its rows.
 */
export function rasterise(sprite, resolve, variant = 'base') {
  const key = cacheKey(sprite, variant);
  const hit = cache.get(key);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = sprite.w;
  cv.height = sprite.h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(sprite.w, sprite.h);
  const data = img.data;

  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const ch = row[x];
      if (ch === TRANSPARENT) continue;
      const hex = resolve(ch);
      if (!hex) continue;
      const i = (y * sprite.w + x) * 4;
      data[i] = parseInt(hex.slice(1, 3), 16);
      data[i + 1] = parseInt(hex.slice(3, 5), 16);
      data[i + 2] = parseInt(hex.slice(5, 7), 16);
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}

/** Drop cached rasters — call after a live palette edit in the sprite lab. */
export function clearRasterCache() {
  cache.clear();
}

/**
 * Pure decode to a flat RGBA array. Node-safe (no canvas), so the test suite
 * and the headless linter can inspect art without a browser.
 */
export function decode(sprite, resolve) {
  const out = new Uint8ClampedArray(sprite.w * sprite.h * 4);
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < sprite.w; x++) {
      const ch = row[x];
      if (ch === TRANSPARENT) continue;
      const hex = resolve(ch);
      if (!hex) continue;
      const i = (y * sprite.w + x) * 4;
      out[i] = parseInt(hex.slice(1, 3), 16);
      out[i + 1] = parseInt(hex.slice(3, 5), 16);
      out[i + 2] = parseInt(hex.slice(5, 7), 16);
      out[i + 3] = 255;
    }
  }
  return out;
}

export { TRANSPARENT };
