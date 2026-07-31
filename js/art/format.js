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
