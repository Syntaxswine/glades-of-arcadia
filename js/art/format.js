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

import { GROUND_ELLIPSE, JOIN_DIRS, JOIN_MASKS, joinAxis } from '../iso.js';

const TRANSPARENT = '.';

/** Validate and freeze a sprite definition. Throws loudly on malformed art. */
export function defineSprite(def) {
  const { name, rows, anchor, footprint = [1, 1], cycle = null, tags = [], back = null, joins = null } = def;

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

  // THE SECOND DRAWING. `back` is this sprite seen from the other side — the
  // half of the compass a horizontal mirror cannot reach, because reaching it
  // would need a VERTICAL flip too and the light in this game is always from
  // the upper left. js/iso.js §FACING: bit 0 of a facing is the mirror, bit 1
  // chooses the drawing, and `back` is what bit 1 selects.
  //
  // IT LIVES ON THE ART, not in the catalogue, because the pairing is a fact
  // about the pictures: an artist who draws a ramp climbing away and the same
  // ramp climbing toward you has made ONE object with two views, and a
  // catalogue key naming the second by string is a join that can go stale.
  // js/render.js `artRaster` follows it; nothing else needs to know.
  if (back && !(back.rows && back.anchor)) {
    throw new Error(`defineSprite(${name}): back must be a sprite, not ${typeof back}`);
  }
  return Object.freeze({ name, rows: Object.freeze(rows.slice()), w, h, anchor: Object.freeze(anchor.slice()), footprint: Object.freeze(footprint.slice()), cycle, tags: Object.freeze(tags.slice()), back, joins });
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
 * A SPRITE'S ROWS ALWAYS REACH ITS ANCHOR. Pads with transparent rows if not.
 *
 * The anchor is the pixel that sits on the tile's centre point, and it is fixed
 * BEFORE the bottom of a sprite is edited — that is what stops a change to the
 * base from silently moving forty objects off their tiles. The cost of taking
 * it first is that it can end up BELOW the last row, and `defineSprite` refuses
 * a sprite in that state, correctly.
 *
 * Two edits in step 3 hit this, in the same shape from opposite directions: a
 * baked contact band being STRIPPED (the anchor was inside the band), and
 * `skirt()` no longer GROWING a generated grid (the anchor was in the rows the
 * skirt used to add). Both are "the art shrank past the anchor", and both are
 * repaired the same way: add rows back with nothing in them. The anchor stays
 * exactly where it was, the sprite's height is unchanged from the game's point
 * of view, and no pixel returns.
 */
export function padToAnchor(rows, ay) {
  if (!rows.length || ay < rows.length) return rows;
  const w = rows[0].length;
  const out = rows.slice();
  while (out.length <= ay) out.push(TRANSPARENT.repeat(w));
  return out;
}

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

// ---------------------------------------------------------------------------
// THE FOOT. Shared by props.js and decor.js, which keep separate copies of
// almost every other grid helper on purpose — but not of this one. Both files
// draw objects that stand on the same ground, and a base that meets it two
// different ways is the seam the whole shadow arc was about.
/**
 * The front half of a base diamond `ww` wide, as rows, indented by `pad`.
 *
 * Row `k` covers the columns still inside the diamond that far down, so each
 * edge steps two across for one down — the only slope this projection has. The
 * lowest row is two pixels wide, which is what a vertex looks like at this
 * scale and is nine pixels under the audit's floor.
 *
 * IT IS SHADED AS TWO FACES, and the first version was not. A solid wedge in
 * one value is geometrically correct and reads as a dark spike stuck under the
 * object — the shape says "block", the shading says "shadow", and the shading
 * wins at 20 px. The front of a square block in this projection IS two faces
 * meeting at the front vertex: the left one turned toward the light, the right
 * one away. One step of the ramp between them is the whole difference between
 * a base and a smudge, and it costs nothing.
 */
export function foot(ww, R, pad = 0, round = false) {
  const hw = ww / 2;
  const cx = (ww - 1) / 2;
  const deep = Math.max(1, Math.round(hw * GROUND_ELLIPSE));
  const rows = [];
  for (let k = 1; k <= deep; k++) {
    let s = '';
    for (let x = 0; x < ww; x++) {
      // How far this column reaches below the base's widest line. A SQUARE
      // base is a diamond, so its edge falls away linearly; a TURNED one — an
      // urn's ring, a basin's bowl — is a circle, so its edge falls away as a
      // chord. Same foreshortening, different corner.
      const d = Math.abs(x - cx) / hw;
      const reach = (round ? Math.sqrt(Math.max(0, 1 - d * d)) : 1 - d) * hw * GROUND_ELLIPSE;
      if (k > reach) { s += '.'; continue; }
      const edge = k > reach - 1; // the outline, always the darkest step
      s += edge ? R[0] : x < cx ? R[2] : R[1];
    }
    rows.push('.'.repeat(pad) + s + '.'.repeat(pad));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// LINEAR PIECES — the two numbers that decide whether a run is a RUN.
//
// Moved here from decor.js, which is where they were written and where they
// stopped being enough. The same argument as `foot` and `groundFoot` above:
// props.js and decor.js keep separate copies of nearly every grid helper on
// purpose, and NOT of the ones that state a fact about the world. Two modules
// drawing hedges that butt at different pitches is the seam this arc is about.
//
// It is not hypothetical. `js/art/extras.js` authored the palisade fence with
// its own private `slope = round(x * 2 / 5)` and its own private `RUN = 23`,
// under a header insisting that running along the tile edge "is the one thing
// that has to be right". Two-in-five is 0.4 and the projection's slope is 0.5,
// so the fence drifted two rows off true over its own length; and 23 px of run
// on a 32 px tile means a ROW of fences is a dotted line with gaps in it —
// which for a piece the field model treats as an OCCLUDER is worse than ugly.
// Neither number could have drifted if there had only ever been one of them.
// ---------------------------------------------------------------------------

/**
 * The screen width of a linear piece that spans exactly one tile along +tx.
 *
 * 33, not 32: **32 px of run plus one overlap column**. A tile step is 32 px
 * across, so a piece drawn 32 wide leaves a hairline where two meet and a
 * piece drawn 33 wide butts into a continuous object.
 */
export const LINE_W = 33;

/**
 * How far a linear piece has fallen after `x` px of run: one down per two
 * across, the only slope the ground plane has. `x >> 1` and not `x * 0.4`,
 * not `x / 2` rounded some other way — the shift is exact, integer, and
 * matches what a 2:1 line drawn as pixel PAIRS actually does.
 */
export const LINE_DROP = (x) => x >> 1;


// ---------------------------------------------------------------------------
// THE SLAB — how a linear piece gets a TOP, and why that lives here.
//
// These three were private to decor.js while props.js drew its own walls by
// hand, and the two disagreed about what a box IS. The drystone wall drew its
// cap course as a VERTICAL band directly above its face — a shape with upright
// ends — where a slab's top face is a parallelogram whose ends run along +ty,
// and whose near edge is offset `2 * depth` to the left of its far edge. That
// offset is the entire visual difference between a box and a ribbon, and the
// owner read the wall exactly as the geometry drew it: *"it also has problems
// with not being volumetric."*
//
// The note above `LINE_W` already stated the rule this now obeys — a constant
// two modules need is a constant that must have one home — and named the very
// case that broke: *"a hedge and a drystone wall that bent at different pitches
// would be the exact seam this whole arc is about."* They did not bend at
// different pitches. They disagreed about a flatter fact than that: which way
// a top face recedes. So the slab joins LINE_W and LINE_DROP here, because it
// states a fact about the PROJECTION rather than a matter of any one artist's
// taste, and a second module drawing its own was the fault, not a convenience.
// ---------------------------------------------------------------------------

/** Bounds-checked write. Both art modules had a byte-identical private copy. */
function put(g, x, y, k) {
  x = Math.round(x);
  y = Math.round(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = k;
}

/**
 * A horizontal SLAB running along the +tx axis: the top face is a
 * parallelogram, `len` px of run by `depth` units of width, and `keyFn(a, b)`
 * paints it in its own coordinates (a along the run, b across it).
 *
 * The first pass drew linear pieces as a 2 px line and every one of them —
 * bench, balustrade, hedge, rill — read as a handrail. A slab in isometric has
 * to have WIDTH in the other axis; that is the whole difference between a
 * plank and a piece of furniture. b runs from 0 at the far edge to `depth` at
 * the near edge, so `b` is also "how close to the viewer", which is what a rill
 * needs to put its water in the middle.
 */
export function slab(g, x0, yTop, len, depth, keyFn) {
  for (let y = yTop; y <= yTop + len / 2 + depth + 1; y++) {
    for (let x = x0 - 2 * depth - 1; x <= x0 + len + 1; x++) {
      const u = x - x0;
      const v = y - yTop;
      const a = (v + u / 2) / 2;
      const b = (v - u / 2) / 2;
      if (a < -0.02 || a > len / 2 || b < -0.02 || b > depth) continue;
      const k = keyFn(a, b, x, y);
      if (k) put(g, x, y, k);
    }
  }
}

/** The near long face of a slab: what you see below its front edge. */
export function slabFace(g, x0, yTop, len, depth, thick, keyFn) {
  for (let i = 0; i <= len; i++) {
    const x = x0 + i - 2 * depth;
    const y = yTop + LINE_DROP(i) + depth;
    for (let k = 0; k < thick; k++) {
      const key = keyFn(i, k);
      if (key) put(g, x, y + 1 + k, key);
    }
  }
}

/**
 * The far top edge of a slab, so it does not bleed into what is behind it.
 *
 * CEIL, NOT `LINE_DROP`, and the difference is a visible fault. `slab` decides
 * membership from the exact line y = yTop + (x - x0) / 2, so the topmost pixel
 * in a column sits at `ceil` of that; this stroke has to land one pixel above
 * THAT, in the same column. Indexing it by run position with `LINE_DROP` —
 * which floors — put it a further pixel up on every ODD column, and the result
 * was a dark line hovering one pixel clear of the mass it belongs to, on half
 * the columns of every slab in the game.
 *
 * Measured on `hedge-low` before the fix: 20 of its 50 columns had the top
 * pixel detached, all of them odd. It had been visible in every render of the
 * hedges since they were drawn and was written off as a stylistic edge.
 *
 * `keep(i)` lets a piece drawn at two heights — a gateway with a raised crown
 * over its opening — take the stroke for its own stretch of the run and leave
 * the rest to another call. It exists so nobody hand-rolls this loop again:
 * three copies of it were written the week this was fixed and all three had
 * the floor/ceil fault back in them within the hour.
 */
export function slabBackEdge(g, x0, yTop, len, key, keep) {
  for (let i = 0; i <= len; i++) {
    if (keep && !keep(i)) continue;
    put(g, x0 + i, yTop + Math.ceil(i / 2) - 1, key);
  }
}

/** Where `slabBackEdge` puts its stroke: one pixel above the slab's far edge. */
export const slabBackEdgeY = (yTop, i) => yTop + Math.ceil(i / 2) - 1;

/**
 * THE CUT END OF A RAISED SECTION — where a gateway's crown or its piers step
 * back down to the height of the run they stand in.
 *
 * A GATEWAY IS A BAR WITH A TALLER BIT IN THE MIDDLE, AND A TALLER BIT HAS
 * ENDS. Between them `slab` and `slabFace` draw a box's TOP and its near (+ty)
 * long face. Nothing drew the SHORT face across the run, and nothing needed to
 * while every bar ran the full tile: a plain bar's ends are buried in its
 * neighbours and never seen. A raised section's ends are in the middle of the
 * run, and the +tx one faces the camera.
 *
 * THE GEOMETRY, because it is worth being able to check. The raised top face
 * is the body's parallelogram lifted by `rise` and cut at a line of constant
 * run position: y = yTop - rise + iEnd - u/2, falling as u grows. The body's
 * top face BEGINS at its own far edge, y = yTop + u/2, rising. The two cross at
 * u = iEnd - rise, and past that column the raised end sits ABOVE the body's
 * far edge. The wedge between them is transparent, it grows one row per column,
 * and it is grass seen through a wall.
 *
 * Measured, with the body already drawn closed underneath: 18 px on the hedge
 * arch (rise 6) and 66 px on the drystone gateway (rise 12). The stone's is
 * larger for exactly one reason — its piers stand twice as proud.
 *
 * Only the +tx end needs this. The -tx end points away from the camera and the
 * raised section's own top face covers every pixel of it, which is why the
 * fault was one-sided and why looking at one end of a gateway proves nothing
 * about the other.
 *
 * A PLAIN COLUMN LOOP, NOT A MEMBERSHIP TEST, and that is deliberate: this face
 * is VERTICAL, so it has one contiguous run of pixels per screen column and
 * cannot alias. `b` steps by a HALF unit so every one of the `2 * depth + 1`
 * columns is written — stepping it by 1 would move x by 2 and comb the surface,
 * which is the same aliasing that made a hand-rolled cap come out as wire mesh.
 *
 * `keyFn(b, h, x, y)` paints it in its own coordinates: `b` across the run from
 * the far edge, `h` up from where the raised part meets the run. It is the
 * RIGHT face of a box in this projection — its normal points down-right, away
 * from the light — so it wants to sit a step DARKER than the near face
 * `slabFace` draws. Shading the two the same is what makes a solid read as
 * folded paper.
 *
 * Draw it AFTER the body and BEFORE the raised part: it stands in front of the
 * body's cap and behind the raised part's own top and near face.
 */
export function slabEndFace(g, x0, yTop, depth, iEnd, rise, keyFn) {
  for (let s = 0; s <= 2 * depth; s++) {
    const b = s / 2;
    const x = x0 + iEnd - s;
    const foot = yTop + iEnd / 2 + b; // where the raised part meets the run
    for (let h = 0; h <= rise; h++) {
      const k = keyFn(b, h, Math.round(x), Math.round(foot - h));
      if (k) put(g, x, foot - h, k);
    }
  }
}


/**
 * THE CUT END OF THE BAR ITSELF — the face at the very end of a linear piece,
 * dropping from its cap to its foot.
 *
 * `slabEndFace` above caps a RAISED section, standing up from the run. This one
 * caps the run, hanging down from it, and the two exist for the same reason a
 * gateway needed the first: nothing ever drew a bar's own ends, because in a
 * run they are buried in the neighbours.
 *
 * A GATE STANDING ALONE IS NOT IN A RUN. The owner, of both gateways:
 * *"both the gates are open on the side."* The body either side of the opening
 * is a stub of wall, and its end was a top face with nothing under it — a flat
 * plate hanging in the air, which is exactly what you see on a gate nobody has
 * built a wall up to yet.
 */
export function slabEndCap(g, x0, yTop, depth, iEnd, height, keyFn) {
  for (let s = 0; s <= 2 * depth; s++) {
    const b = s / 2;
    const x = x0 + iEnd - s;
    const cap = yTop + iEnd / 2 + b; // the top face at this depth
    for (let k = 0; k < height; k++) {
      const y = cap + 1 + k;
      const key = keyFn(b, k, Math.round(x), Math.round(y));
      if (key) put(g, x, y, key);
    }
  }
}

// ---------------------------------------------------------------------------
// JOINING — the sixteen ways a linear piece can meet its neighbours.
//
// js/iso.js §JOINING has the argument for why a corner cannot be a facing.
// This is the machinery, and it lives HERE for the same reason `foot` and
// `LINE_W` do: props.js and decor.js keep separate copies of nearly every grid
// helper on purpose, and NOT of the ones that state a fact about the world. A
// hedge and a drystone wall that bent at different pitches would be the exact
// seam this whole arc is about.
//
// IT NEEDS NO NEW ART, which is the good part and falls out of two facts about
// the projection rather than out of cleverness:
//
//   a bar drawn along +tx runs down-right from its anchor, so A VERTICAL CUT
//   AT THE ANCHOR COLUMN SEPARATES ITS TWO ARMS EXACTLY — everything left of
//   it reaches -tx and everything right of it reaches +tx;
//   a horizontal mirror swaps the two tile axes, so those same two halves,
//   REVERSED, are the -ty and +ty arms.
//
// So one bar gives all four arms, and any piece already built by `slab()`
// along +tx can have all sixteen states for one line.
// ---------------------------------------------------------------------------

/** Everything on one side of the hub column, as a grid the same size. */
function halfGrid(g, ax, side) {
  return g.map((row) => row.map((k, x) => ((side > 0 ? x >= ax : x <= ax) ? k : '.')));
}

/** A grid reversed about its vertical centre. The hub moves with it. */
function mirrorGrid(g) {
  return g.map((row) => row.slice().reverse());
}

/**
 * The four arms of a linear piece, each as `{ g, ax }` with its own hub column.
 * Order matches JOIN_DIRS: +tx, +ty, -tx, -ty.
 */
function armsOf(g, ax) {
  const W = g[0].length;
  const back = halfGrid(g, ax, -1); // -tx: up-left, behind
  const fore = halfGrid(g, ax, 1); //  +tx: down-right, in front
  return [
    { g: fore, ax }, // +tx
    { g: mirrorGrid(fore), ax: W - 1 - ax }, // +ty — the same arm, turned
    { g: back, ax }, // -tx
    { g: mirrorGrid(back), ax: W - 1 - ax }, // -ty
  ];
}

/**
 * Compose the arms a mask names into one sprite, registered on the hub.
 *
 * The canvas is sized from the arms actually used rather than from the widest
 * possible piece, so a corner is not padded out with the transparent columns
 * of the arm it does not have — and the anchor is stated outright rather than
 * derived from the width, which is the mistake that put the palisade's first
 * corner half a tile off its plot.
 */
function joinedPiece(name, arms, mask, ay, opts) {
  // Back arms first: -tx and -ty go away from the camera, so a front arm
  // drawn over them is what makes the bend one solid rather than two.
  const DRAW_ORDER = [2, 3, 0, 1];
  const order = DRAW_ORDER.filter((i) => mask & JOIN_DIRS[i][2]);

  /**
   * WHERE A RUN ENDS, which is the owner's finding: *"single hedges are
   * represented differently than connected hedges."*
   *
   * Measured before it was touched, on `hedge-low`: a LONE piece and a piece in
   * the MIDDLE of a run are byte-identical — 855 ink pixels, the whole bar —
   * while the two END pieces are 395 and 486. An end was HALF A BAR.
   *
   * That is the asymmetry. A hedge on its own fills its tile; the last hedge of
   * a run stopped at its tile's CENTRE, because an end had only the one arm
   * that reached its neighbour and nothing at all on the side where the run
   * finished. So a run of five covered four tiles of ground and a run of one
   * covered one, and the ends looked chopped next to any hedge standing alone.
   *
   * THE FIX IS NARROW ON PURPOSE. A piece with exactly ONE neighbour is a
   * straight end, so it also draws the arm going the other way — the same two
   * arms a lone piece uses, which is why the two now match by construction
   * rather than by a second drawing that could drift.
   *
   * IT MUST NOT APPLY TO CORNERS. Mask 3 is +tx and +ty; giving each of those
   * its opposite would make an L into a plus. A corner is right to stop at the
   * hub, because that is where its two arms already meet and there is no raw
   * cut to see. Only the one-armed masks — 1, 2, 4, 8 — have an end with
   * nothing to meet.
   */
  let use;
  if (!order.length) use = [2, 0]; // no neighbours: the straight run
  else if (order.length === 1) {
    const only = order[0];
    const opposite = (only + 2) % 4;
    use = DRAW_ORDER.filter((i) => i === only || i === opposite);
  } else use = order;
  let L = 0;
  let R = 0;
  let H = 0;
  for (const i of use) {
    const a = arms[i];
    L = Math.max(L, a.ax);
    R = Math.max(R, a.g[0].length - 1 - a.ax);
    H = Math.max(H, a.g.length);
  }
  const out = Array.from({ length: H }, () => new Array(L + R + 1).fill('.'));
  for (const i of use) {
    const a = arms[i];
    for (let y = 0; y < a.g.length; y++) {
      for (let x = 0; x < a.g[0].length; x++) {
        const k = a.g[y][x];
        if (k !== '.') out[y][L + x - a.ax] = k;
      }
    }
  }
  return defineSprite({
    name: `${name}@${mask}`,
    anchor: [L, ay],
    rows: padToAnchor(out.map((r) => r.join('')), ay),
    footprint: [1, 1],
    tags: opts.tags || [],
  });
}

/**
 * A GATE. Sixteen states, but only two drawings: this one and its mirror.
 *
 * ---------------------------------------------------------------------------
 * The owner, having built a fence and put a pergola in the middle of it:
 * *"i was trying to use the pergola as a gate. what i think we really need are
 * separate gates / archways for the various walls."*
 *
 * A gate is a piece of the WALL, not an ornament standing near one. It has to
 * butt into the run at both ends and it has to have a hole you walk through,
 * and those two facts are the whole design:
 *
 *   IT JOINS. `joins` in js/catalog.js is a GROUP NAME, defaulting to the id —
 *   which is what lets `hedge-arch` declare `joins: 'tall-hedge'` and take its
 *   place in a hedge's run rather than sitting beside it looking similar. The
 *   hedges either side see it as a neighbour and reach for it; it sees them.
 *   IT IS NOT COMPOSED FROM ARMS. `linearJoins` cuts a bar at its hub and
 *   recombines the halves, which is right for a wall and would destroy a
 *   doorway — half an arch is a post and a piece of lintel, and two of those
 *   from different directions is rubble. A gate is drawn WHOLE.
 *
 * So every mask resolves through `joinAxis` to one of two pictures: as drawn,
 * or mirrored. A gate on a corner is not a thing anybody builds; it falls back
 * to the axis it has most of, which is the least surprising answer available
 * and beats drawing nothing.
 * ---------------------------------------------------------------------------
 */
/**
 * A GATE THAT KNOWS WHETHER ANYONE HAS BUILT UP TO IT.
 *
 * `axialJoins` gives a gate two drawings, itself and its mirror, which is right
 * about the ARGUMENT — half an arch is a post and a piece of lintel, and a gate
 * must be drawn whole — and blind to one thing: whether the run it belongs to
 * actually continues past it. A gate at the end of a wall, or standing on its
 * own, shows the raw cut end of its own body.
 *
 * So: FOUR drawings from two, capped and plain in each axis, and the mask picks.
 * The cap is drawn only where the run STOPS — the same rule the solid pieces
 * follow, and for the same reason. An always-capped gate carries a face its
 * neighbour buries, which is ink lying about the piece's extent, and the
 * run-overlap guard in test/joining.test.mjs would refuse it — as it should.
 */
export function cappedAxialJoins(plain, capped) {
  const mirror = (art, name) =>
    defineSprite({
      ...art,
      name,
      rows: art.rows.map((r) => r.split('').reverse().join('')),
      anchor: [art.w - 1 - art.anchor[0], art.anchor[1]],
      joins: null,
    });
  const plainTy = mirror(plain, `${plain.name}@ty`);
  const cappedTy = mirror(capped, `${capped.name}@ty`);
  const joins = Object.freeze(
    Array.from({ length: JOIN_MASKS }, (_, m) => {
      if (joinAxis(m) === 'ty') return m & 2 ? plainTy : cappedTy;
      return m & 1 ? plain : capped;
    })
  );
  // THE BASE SPRITE IS THE CAPPED ONE, because the base sprite IS mask 0 —
  // a gate with nothing adjoining it, which is exactly when its own ends show.
  // `joining.test.mjs` asserts base === joins[0] for every family, and it is
  // right to: the catalogue names one sprite, and a piece standing alone must
  // be that sprite and not a variant of it.
  return defineSprite({ ...capped, name: plain.name, joins });
}

export function axialJoins(art) {
  const mirrored = defineSprite({
    ...art,
    name: `${art.name}@ty`,
    rows: art.rows.map((r) => r.split('').reverse().join('')),
    // The anchor moves with the mirror: the pixel at `ax` lands at `w-1-ax`.
    // Getting this wrong shifts the gate sideways by twice its anchor offset,
    // which on a centred sprite is invisible and on any other one is not.
    anchor: [art.w - 1 - art.anchor[0], art.anchor[1]],
    joins: null,
  });
  const joins = Object.freeze(
    Array.from({ length: JOIN_MASKS }, (_, m) => (joinAxis(m) === 'ty' ? mirrored : art))
  );
  return defineSprite({ ...art, joins });
}

/** A linear piece and all sixteen of its connection states. */
export function linearJoins(name, built, opts) {
  const arms = armsOf(built.g, built.ax);
  const joins = Object.freeze(
    Array.from({ length: JOIN_MASKS }, (_, m) => joinedPiece(name, arms, m, built.ay, opts))
  );
  return defineSprite({ ...joins[0], name, joins });
}

/**
 * Give a generated grid the foot its own base implies, and stamp it in place.
 *
 * The base is found rather than declared: the deepest opaque row, and the run
 * of columns that reach it. Every one of these objects already draws its base
 * as a flat line at a place its own arithmetic decided, so asking the grid
 * where that line ended up is both shorter and harder to get wrong than
 * re-deriving `cx` and a width at each call site — which is how four buildings
 * ended up hovering over their own shadows in July.
 */
export function groundFoot(g, R, { round = false } = {}) {
  let deepest = -1;
  const low = [];
  for (let x = 0; x < g[0].length; x++) {
    let y = g.length - 1;
    while (y >= 0 && g[y][x] === '.') y--;
    low[x] = y;
    if (y > deepest) deepest = y;
  }
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < low.length; x++) {
    if (low[x] < deepest) continue;
    if (x0 === -1) x0 = x;
    x1 = x;
  }
  if (x0 === -1) return;
  const rows = foot(x1 - x0 + 1, R, 0, round);
  // Make room. A base clipped by the bottom of its own grid is a flat
  // horizontal edge — the exact fault this removes, by the back door.
  while (g.length < deepest + 1 + rows.length) g.push(new Array(g[0].length).fill(TRANSPARENT));
  rows.forEach((row, i) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== TRANSPARENT) g[deepest + 1 + i][x0 + x] = row[x];
    }
  });
}

/**
 * Rows of plinth(w, dieH) DOWN TO THE ANCHOR: cap (3) + die + base (4).
 * Callers stack on this, and the foot hangs below it — see `plinth`.
 */
const plinthH = (dieH) => 3 + dieH + 4;

/**
 * Stamp a row array into a grid at (x, y), '.' meaning leave alone.
 *
 * IT MAKES ROOM DOWNWARD. `put` silently drops anything past the last row, and
 * a base clipped by the bottom of its own grid is a flat horizontal edge — the
 * exact fault `plinth`'s foot exists to remove, arriving by the back door. This
 * is the same growth `skirt()` used to do for the same reason, and it is free:
 * the anchor is measured from the TOP, so appending rows moves nothing.
 */
function stamp(g, rowsArr, x0, y0) {
  const need = y0 + rowsArr.length;
  while (g.length < need) g.push(new Array(g[0].length).fill('.'));
  rowsArr.forEach((row, i) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '.') put(g, x0 + x, y0 + i, row[x]);
  });
}
