// iso.js — the projection, the hit test, the camera clamp, and the depth key.
//
// PURE AND DOM-FREE. This module must import cleanly in Node so the test suite
// can exhaustively round-trip every tile on the map. Nothing in here may touch
// `document`, `window`, or a canvas.
//
// ---------------------------------------------------------------------------
// THE ONE PICTURE YOU NEED
//
// A tile is 64 x 32 — exact 2:1, so every diamond edge is a clean 2-across /
// 1-down pixel run with no jaggy irregularity (RESEARCH A1: do NOT copy
// Impressions' real 58x30, which is 1.933:1 and has edge slop).
//
//   toScreen(tx, ty) returns the tile's NORTH (top) VERTEX:
//
//                (sx, sy)  <- toScreen(tx, ty)
//                   /\
//                  /  \                 the diamond of tile (tx, ty)
//        (-32,+16)<    >(+32,+16)       centre = (sx, sy + 16)
//                  \  /                       = toScreen(tx+0.5, ty+0.5)
//                   \/
//                (0, +32)
//
// Tile (0,0)'s north vertex is the world-space origin. +tx runs down-right,
// +ty runs down-left. The camera is a screen-space offset (ox, oy) subtracted
// from every projected point.
//
// ---------------------------------------------------------------------------
// THE DEPTH KEY, AND WHY IT IS SHAPED LIKE THIS
//
// Painter's algorithm, back to front. The naive key `tx + ty` is only correct
// for 1x1 footprints (RESEARCH A2). It fails on:
//
//   * multi-tile objects — a 3x1 wall and a 1x1 tree can each be "partly in
//     front" of the other,
//   * L / T-shaped footprints — one object wraps another and you get a genuine
//     occlusion CYCLE that no scalar key can resolve,
//   * movers between tiles — sorting by a ROUNDED tile index makes a walking
//     creature pop in front of / behind a tree as it crosses the boundary.
//
// The fixes this module implements:
//
//   1. `depthOf` sorts by the FRONT-MOST tile of the footprint:
//      depth = max over footprint of (tx + ty). For a rectangle with origin
//      (tx,ty) and size fw x fh that is simply (tx+fw-1) + (ty+fh-1).
//   2. Non-rectangular footprints are FORBIDDEN by the spec, and
//      `validateFootprint` enforces it, because they are the case that has no
//      correct answer without splitting geometry.
//   3. Movers keep FRACTIONAL tx/ty and go through the very same key, so a
//      creature at tx=3.4 sorts smoothly between tiles 3 and 4 instead of
//      snapping. That is the whole fix for popping.
//
// Tiebreak chain, in order:  depth  ->  tx  ->  insertion index.
// `sortForDraw` builds the draw list as [...objects, ...creatures] and the
// insertion-index tiebreak therefore puts a creature above an object it is
// exactly co-located with, for free, without a separate creature pass that
// would wrongly draw creatures over trees they are standing behind.
//
// ---------------------------------------------------------------------------
// ELEVATION (docs/ELEVATION.md)
//
// Every tile carries an integer `level`, 0..MAX_LEVEL, and terrain is stacked
// FLAT-TOPPED cubes. The projection gains exactly one term:
//
//     sy = (tx + ty) * (H / 2) - level * LEVEL_H
//
// `LEVEL_H` is defined HERE and nowhere else in the codebase. It is a
// projection constant; world.js owns the integer level and deliberately does
// not know the pixel rise. If a garden wants to be steeper, this one number
// changes and every cliff, waterfall, hit test and depth key follows.
//
// Three consequences, and each one is a place a naive implementation breaks:
//
//   1. A RAISED TILE MOVES UP-SCREEN, which means the flat inverse transform
//      is no longer a hit test. A point on screen can be inside the top
//      diamond of SEVEN different tiles (one per level), and it can also be on
//      the vertical CLIFF FACE of a tile whose top is nowhere near it. Picking
//      therefore walks candidate columns FRONT TO BACK and returns the first
//      one that actually covers the point — the painter's algorithm run
//      backwards. See `pickColumn`, which is the single most load-bearing
//      function in this file: every click in the game goes through it.
//
//   2. THE FRONT NEIGHBOURS ARE (tx+1, ty) AND (tx, ty+1). Since +tx runs
//      DOWN-RIGHT and +ty runs DOWN-LEFT, those are the two tiles below the
//      diamond's south vertex — the south-east and south-west sides. Those are
//      the only two sides that can face the camera, so those are the only two
//      that ever grow a cliff face. `frontNeighbour()` names them so nothing
//      has to re-derive it (and get it backwards).
//
//   3. THE DEPTH KEY GAINS A Z TERM: depth = (tx + ty) * LEVELS + level, so an
//      object standing on a raised tile draws after that tile's column and
//      before anything further forward. LEVELS = MAX_LEVEL + 1 is the smallest
//      multiplier that keeps one whole diagonal row between adjacent levels.

// ---------------------------------------------------------------------------
// Geometry constants — SPEC §2.

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2; // 32
export const HALF_H = TILE_H / 2; // 16

/**
 * THE SHAPE OF A CIRCLE DRAWN ON THE GROUND: an ellipse exactly twice as wide
 * as it is tall. `ry = rx * GROUND_ELLIPSE`.
 *
 * It is `TILE_H / TILE_W` and it is stated here because ART needs it, not the
 * renderer. Every contact shadow, every pool, every round plinth, every patch
 * of grass at the foot of a thing is a circle lying in the ground plane, and
 * an isometric camera sees all of them as this ellipse.
 *
 * Getting the ratio wrong is the commonest way a sprite stops lying in the
 * world. `js/art/props.js` drew its contact skirt at 11 by 3 — a 3.7:1 ellipse,
 * which is a circle seen from a shallower angle than this game's camera, so it
 * reads as a decal stuck to the screen rather than a shadow on the grass. And
 * at that flatness its lowest rows are level for sixteen pixels, which is how
 * two dozen otherwise-correct props ended up with a horizontal edge at ground
 * level. See tools/iso-audit.mjs.
 */
export const GROUND_ELLIPSE = TILE_H / TILE_W; // 0.5

// ---------------------------------------------------------------------------
// FACING — which way a thing is turned. proposals/BACKLOG.md §4k.
//
// The owner: "there are a few tiles that you should be able to alter the
// direction on. Currently the middle scroll wheel scrolls up and down the map,
// I think it would be better suited to pick between what direction an object
// faces in space."
//
// THE ECONOMICS ARE BETTER THAN THEY LOOK, and this is why the field is an
// integer 0..3 rather than a boolean.
//
// A 2:1 projection is symmetric about the vertical, so a horizontal flip turns
// a thing facing SE into the same thing facing SW — EXACTLY, with no new art.
// The two remaining directions face away from the camera and need a second
// drawing (a cave from behind is a hillside with no hole in it), which is a
// real drawing and not a transform.
//
//     facing   drawing        on screen
//     0        front          front on the right-hand wall   (SE)
//     1        front, flipped front on the left-hand wall    (SW)
//     2        back           turned away, to the right      (NE)
//     3        back, flipped  turned away, to the left       (NW)
//
//     drawings   facings
//        1          2
//        2          4
//
// TODAY EVERY TURNABLE THING HAS ONE DRAWING, so the catalogue declares
// `facings: 2` and the wheel cycles two. Nothing about the stored field or the
// save has to change when a back view is drawn; only the catalogue number does.
//
// AND WHY ONLY SQUARE FOOTPRINTS MAY TURN: mirroring the screen's x axis swaps
// the two tile axes, so a 2x1 object mirrors into a 1x2 one. Handling that
// means transposing the footprint through canPlace, the collision test and the
// depth key — real work, not yet done, and the catalogue self-check refuses a
// non-square `facings` rather than letting it half-work.

/** How many facings the model can express. Storage, not availability. */
export const FACINGS = 4;

/** Is this facing drawn by flipping its drawing horizontally? */
export const facingMirrored = (f) => (f & 1) === 1;

/** Which of the (up to two) drawings this facing uses. 0 = front, 1 = back. */
export const facingDrawing = (f) => (f >> 1) & 1;

/** Clamp anything into a legal facing for a thing with `n` of them. */
export function clampFacing(facing, n = 1) {
  const count = Math.max(1, Math.min(FACINGS, Math.round(+n || 1)));
  const f = Math.round(+facing || 0);
  return ((f % count) + count) % count;
}

// ---------------------------------------------------------------------------
// JOINING — a piece that knows it is part of a run.
//
// The owner: *"things like hedges and fences can go around corners."*
//
// WHY THIS IS NOT A FACING. An L-corner comes in four kinds — arms toward
// {+tx,+ty}, {-tx,-ty}, {-tx,+ty}, {+tx,-ty} — and the mirror swaps the two
// tile axes, so it maps the first two to THEMSELVES and the last two to each
// other. Corners therefore need THREE drawings, plus the straight, plus caps
// and T-junctions. `FACINGS` is 4 and it does not fit.
//
// It should not fit. A corner is not something a player should have to aim:
// they drag a hedge round three sides of a lawn and it should turn. So the
// piece reads its NEIGHBOURS, not the wheel.
//
//     bit  dir   tile step   on screen
//     1    E     +tx         down-right
//     2    S     +ty         down-left
//     4    W     -tx         up-left
//     8    N     -ty         up-right
//
// Sixteen masks, and the art is GENERATED from the mask rather than drawn
// sixteen times: an arm from the tile centre outward for each connected
// direction, plus a hub. Every mask then falls out of one generator and they
// are consistent with each other by construction.
//
// MASK 0 KEEPS THE WHEEL. An isolated piece has no neighbours to read, so it
// obeys the facing the player chose; a connected one obeys the run. That is
// the right behaviour and not a compromise — the first hedge you put down
// still has a direction, and the second one decides what the first meant.
// ---------------------------------------------------------------------------

/** Which neighbour each bit means, as `[dtx, dty, bit]`, screen-clockwise. */
export const JOIN_DIRS = Object.freeze([
  Object.freeze([1, 0, 1]), // E — +tx, down-right
  Object.freeze([0, 1, 2]), // S — +ty, down-left
  Object.freeze([-1, 0, 4]), // W — -tx, up-left
  Object.freeze([0, -1, 8]), // N — -ty, up-right
]);

/** How many distinct connection states a joining piece has. */
export const JOIN_MASKS = 16;

/**
 * The mask a horizontal mirror turns this one into.
 *
 * Mirroring the screen's x axis swaps the two tile axes, so E trades with S
 * and W with N. Stated here rather than derived at each call site because it
 * is the same fact `facingMirrored` rests on, and because it is the reason
 * only three corner drawings exist rather than four.
 */
export function mirrorJoinMask(mask) {
  const m = mask & 15;
  return ((m & 1) << 1) | ((m & 2) >> 1) | ((m & 4) << 1) | ((m & 8) >> 1);
}

/**
 * Is this mask a straight run, and along which axis?
 *
 * Returns `'tx'`, `'ty'` or `null`. A single arm counts as its axis: an end
 * piece drawn as a straight is right at this scale, and a run of two would
 * otherwise be two caps facing each other with nothing between them.
 */
export function joinAxis(mask) {
  const m = mask & 15;
  const tx = m & (1 | 4);
  const ty = m & (2 | 8);
  if (tx && !ty) return 'tx';
  if (ty && !tx) return 'ty';
  return null;
}

// ---------------------------------------------------------------------------
// Elevation constants — docs/ELEVATION.md. THE SINGLE SOURCE OF THE RISE.

/**
 * Pixels of rise per level. Half a tile height, on purpose: a true unit cube
 * would be 32, which makes a garden read as a mountain, buries objects behind
 * cliffs and eats the 400px viewport. 16 still gives a four-level waterfall
 * 64px of drop.
 *
 * NOTHING ELSE IN THE CODEBASE MAY HARD-CODE THIS. Import it.
 */
export const LEVEL_H = 16;

/** Six terraces above the floor; seven distinct heights in all. */
export const MAX_LEVEL = 6;

/** Distinct heights, and therefore the depth-key multiplier. */
export const LEVELS = MAX_LEVEL + 1; // 7

/** How far above its flat position the tallest tile sits. 96px. */
export const MAX_RISE = MAX_LEVEL * LEVEL_H;

/** Clamp anything into a legal level. Non-numbers become the ground floor. */
export function clampLevel(level) {
  const n = Math.round(+level || 0);
  return n < 0 ? 0 : n > MAX_LEVEL ? MAX_LEVEL : n;
}

/** Screen-space rise of a level, in pixels. The one place the two are joined. */
export function riseOf(level) {
  return clampLevel(level) * LEVEL_H;
}

/** An object's level, however it carries it. Missing means the ground floor. */
export function levelOf(obj) {
  return obj && obj.level != null ? clampLevel(obj.level) : 0;
}

/**
 * THE LOGICAL (BACKING) CANVAS, defined here and nowhere else. Integer-scaled
 * to the window, never fractional — SPEC §2.
 *
 * It used to be declared FOUR TIMES: here, and as `LOGICAL_W`/`LOGICAL_H` in
 * `input.js`, `ui.js` and `main.js`. All four said 640 x 400, so nothing was
 * ever wrong — which is the whole danger, because it is the shape of the bug
 * that once put `MAP_W = 20` in two files and `LEVEL_H` in three.
 *
 * IT IS ALSO THE WHOLE OF MOBILE MODE (proposals/BACKLOG.md §4i). A phone in
 * portrait cannot show a 640-wide canvas at an integer scale: `pickScale`
 * floors and clamps at 1, so a 390 px screen gets 640 px of canvas and the
 * rest goes off the edge. The two ways out are a fractional scale — which
 * breaks SPEC §2 and smears the art — or a SECOND LOGICAL SCREEN SIZE. This
 * is the number that would change, and until now there was no single number
 * to change.
 */
export const VIEW_W = 640;
export const VIEW_H = 400;

/**
 * The chrome's own bands, in logical pixels, and the map rectangle left over.
 *
 * `ui.js` LAYOUT is built from these rather than restating them, so a taller
 * or narrower screen moves the map rectangle without anybody editing four
 * rects by hand. The two band heights are the design; the VIEW is what remains.
 */
export const TOPBAR_H = 14;
export const PANEL_H = 100;
export const VIEW_H_MAP = VIEW_H - TOPBAR_H - PANEL_H; // 286

/**
 * THE MAP SIZE, defined here and nowhere else.
 *
 * 60 x 60 — three times the original 20 in both directions, so nine times the
 * ground. Screen extent works out at 3840 x 1920 against a 640 x 400 view, so
 * the map is comfortably larger than a screenful and panning is now a real part
 * of playing rather than a nicety.
 *
 * `main.js` used to carry its OWN copy of these two numbers. It does not any
 * more: the same trap as `LEVEL_H`, and a map that is 60 in one file and 20 in
 * another is a class of bug with no good failure mode.
 *
 * Growing this is not free. The settling scan visits every tile for every
 * creature; it was O(n^2) until `fields.grassCounts()` was memoised, and at
 * 60x60 that difference is 1205 ms against 58 ms per scan. If this number grows
 * again, MEASURE `_rescan` before shipping it — see proposals/BACKLOG.md.
 */
export const MAP_W = 60;
export const MAP_H = 60;

const ORIGIN = Object.freeze({ x: 0, y: 0 });

/** Accept `{x,y}`, `{ox,oy}`, or nothing at all. Cheap and forgiving. */
function camOf(cam) {
  if (!cam) return ORIGIN;
  if (typeof cam.x === 'number') return cam;
  if (typeof cam.ox === 'number') return { x: cam.ox, y: cam.oy || 0 };
  return ORIGIN;
}

// ---------------------------------------------------------------------------
// Projection.

/**
 * Tile space -> screen space. Returns the tile diamond's NORTH VERTEX.
 * `tx`/`ty` may be fractional (movers, camera targets, ghost previews).
 *
 *   sx = (tx - ty) * 32 - ox
 *   sy = (tx + ty) * 16 - oy
 *
 * Pass `out` to write into an existing object and allocate nothing in a hot
 * loop.
 */
export function toScreen(tx, ty, cam, out) {
  const c = camOf(cam);
  const x = (tx - ty) * HALF_W - c.x;
  const y = (tx + ty) * HALF_H - c.y;
  if (out) {
    out.x = x;
    out.y = y;
    return out;
  }
  return { x, y };
}

/**
 * The tile's CENTRE point in screen space — the point a sprite's `anchor`
 * pixel sits on (SPEC §2, "the pixel that sits on the tile's centre point").
 * Identical to `toScreen(tx + 0.5, ty + 0.5, cam)`.
 */
export function tileCentre(tx, ty, cam, out) {
  return toScreen(tx + 0.5, ty + 0.5, cam, out);
}

/**
 * The centre of a whole rectangular footprint. For a 1x1 this is exactly
 * `tileCentre`, so single-tile sprites are unaffected; a 2x2 urn garden or a
 * 3x1 wall anchors on the middle of its own base instead of on its origin
 * corner, which is what an artist expects when they place the anchor pixel.
 */
export function footprintCentre(tx, ty, fw = 1, fh = 1, cam, out) {
  return toScreen(tx + fw / 2, ty + fh / 2, cam, out);
}

// --- the same three, with height ------------------------------------------
//
// Deliberately separate functions rather than an optional 5th argument on
// `toScreen`: a level silently defaulting to 0 in a call that meant to pass one
// is a bug that draws everything at the bottom of the cliff and looks almost
// right. Two names, no ambiguity.

/** Tile space + level -> screen. The north vertex of the RAISED top diamond. */
export function toScreenAt(tx, ty, level, cam, out) {
  const p = toScreen(tx, ty, cam, out);
  p.y -= riseOf(level);
  return p;
}

/** The centre of a raised tile's top face — where a sprite's anchor sits. */
export function tileCentreAt(tx, ty, level, cam, out) {
  return toScreenAt(tx + 0.5, ty + 0.5, level, cam, out);
}

/** The centre of a whole rectangular footprint standing at `level`. */
export function footprintCentreAt(tx, ty, fw = 1, fh = 1, level = 0, cam, out) {
  return toScreenAt(tx + fw / 2, ty + fh / 2, level, cam, out);
}

/**
 * Screen space -> tile space. Returns BOTH the fractional position and the
 * floored tile index, because callers need both and computing it twice is how
 * off-by-one hit-test bugs get in.
 *
 *   { fx, fy }  fractional tile coords (fx=3.5 is the centre of column 3)
 *   { tx, ty }  the tile the point is inside — floor(fx), floor(fy)
 *
 * The floor of the inverse transform IS the exact diamond hit test: the
 * diamonds tile the plane with no gaps and no overlaps, so a point is inside
 * tile (floor(fx), floor(fy)) and no other. `pointInTile` is defined in terms
 * of this so the two can never disagree.
 */
export function toTile(sx, sy, cam) {
  const c = camOf(cam);
  const a = (sx + c.x) / HALF_W;
  const b = (sy + c.y) / HALF_H;
  const fx = (a + b) / 2;
  const fy = (b - a) / 2;
  return { fx, fy, tx: Math.floor(fx), ty: Math.floor(fy) };
}

/** True when a screen point falls inside tile (tx, ty)'s diamond. */
export function pointInTile(sx, sy, tx, ty, cam) {
  const t = toTile(sx, sy, cam);
  return t.tx === tx && t.ty === ty;
}

/**
 * The raw geometric predicate, for tests and for anything that already has a
 * point in tile-local screen coords. (u, v) are measured from the tile's NORTH
 * VERTEX. The diamond is |u| / 32 + |v - 16| / 16 <= 1.
 *
 * Note this is the closed diamond and therefore includes shared edges; use
 * `toTile` for picking, where exactly-one-owner matters.
 */
export function pointInDiamond(u, v) {
  return Math.abs(u) / HALF_W + Math.abs(v - HALF_H) / HALF_H <= 1;
}

/**
 * Pick a tile, or `null` if the point is off the map. This is what a click
 * handler wants.
 */
export function tileAt(sx, sy, cam, mapW = MAP_W, mapH = MAP_H) {
  const t = toTile(sx, sy, cam);
  if (t.tx < 0 || t.ty < 0 || t.tx >= mapW || t.ty >= mapH) return null;
  return t;
}

/** Is this tile index on the map? */
export function inBounds(tx, ty, mapW = MAP_W, mapH = MAP_H) {
  return tx >= 0 && ty >= 0 && tx < mapW && ty < mapH;
}

// ---------------------------------------------------------------------------
// ELEVATION-AWARE PICKING.
//
// This is the function every click in the game depends on, so it is spelled
// out rather than compressed.
//
// THE PROBLEM. Flat, the inverse transform IS the hit test: the diamonds tile
// the plane exactly once, so `floor` of the inverse names the one owner. With
// height that guarantee is gone in both directions at once:
//
//   * OVERLAP — a tile raised by L levels draws L*16px higher, which is L
//     diagonal rows further forward. So one screen pixel can sit inside the top
//     diamond of up to MAX_LEVEL+1 different tiles, and the one the player sees
//     is whichever was painted LAST.
//   * NEW SURFACES — the vertical cliff faces are real, clickable pixels that
//     belong to no diamond at all. A point 40px below a plateau's south vertex
//     is on that plateau's face, not on the meadow behind it.
//
// THE ALGORITHM. Run the painter's algorithm backwards.
//
//   1. Enumerate the columns whose bounding box could possibly cover the point.
//      That set is small and computable in closed form (below), about 22 tiles
//      for MAX_LEVEL 6 — never the whole map.
//   2. Walk them FRONT TO BACK: descending (tx+ty), then descending tx. That is
//      the exact reverse of the terrain draw order.
//   3. For each, test the top diamond first, then its two front faces. The
//      first hit is by definition the last thing painted at that pixel, which
//      is what the player sees and therefore what they meant to click.
//
// THE CANDIDATE WINDOW, derived. Write the point in world screen coords
// (wx, wy) — camera already added. A column (tx, ty) at level h has its top
// north vertex at ((tx-ty)*32, (tx+ty)*16 - 16h) and its bounding box is 64
// wide and 32 + rise tall, rise <= MAX_RISE.
//
//   horizontal:  |wx - (tx-ty)*32| <= 32          ->  (tx-ty) within +-1 of wx/32
//   vertical:    0 <= wy - ((tx+ty)*16 - 16h) <= 32 + rise
//                with 0 <= h <= MAX_LEVEL and rise <= MAX_RISE this gives
//                (tx+ty)*16 in [wy - 32 - MAX_RISE, wy + MAX_RISE]
//
// so `e = tx-ty` takes 3 values and `s = tx+ty` takes 2*MAX_LEVEL+3 values, of
// which only those matching parity are real tiles. Cheap, exact, no search.
//
// NOTE ON A FLAT MAP: with every level 0 there are no faces and exactly one
// diamond owns the point, so `pickColumn` returns precisely what `toTile`
// returns. Elevation is a strict extension of the old behaviour, which is why
// the test suite can assert the two agree everywhere on a flat glade.

/** The two sides that can face the camera, and the neighbour beyond each. */
export const FRONT_SIDES = Object.freeze(['se', 'sw']);

/**
 * The neighbour a front face looks at.
 *   'se' -> (tx+1, ty)   down-RIGHT on screen  (the shaded face, ramp 1-2)
 *   'sw' -> (tx, ty+1)   down-LEFT on screen   (the lit face, ramp 3)
 *
 * Worth stating because it is easy to get backwards: +tx runs down-right and
 * +ty runs down-left, so the two tiles below a diamond's south vertex are
 * (tx+1, ty) and (tx, ty+1) — NOT (tx-1, ty).
 */
export function frontNeighbour(tx, ty, side) {
  return side === 'se' ? { tx: tx + 1, ty } : { tx, ty: ty + 1 };
}

/**
 * THE OTHER TWO SIDES, and the reason they need naming.
 *
 * A tile standing above the neighbour BEHIND it exposes a face the camera can
 * never see — it points away. Nothing is drawn there, correctly, and the
 * consequence is that the back edge of a plateau is grass meeting grass with
 * no mark between them. A hill you are looking at from behind is invisible.
 *
 * That is not a rendering bug; it is what this projection does. The remedy is
 * an OCCLUDING CONTOUR — one dark pixel along the silhouette — which every
 * draughtsman since the Renaissance has drawn for the same reason, and which
 * needs to know which edges those are. So they are named here, next to their
 * opposites, rather than derived at the call site.
 *
 *   'nw' -> (tx-1, ty)   up-LEFT on screen
 *   'ne' -> (tx, ty-1)   up-RIGHT on screen
 */
export const BACK_SIDES = Object.freeze(['nw', 'ne']);

/** The neighbour a back edge looks at — the mirror of `frontNeighbour`. */
export function backNeighbour(tx, ty, side) {
  return side === 'nw' ? { tx: tx - 1, ty } : { tx, ty: ty - 1 };
}

/** Normalise a level source: a function, a row-major array, or a constant. */
export function levelReader(levels, mapW = MAP_W, mapH = MAP_H, floor = 0) {
  if (typeof levels === 'function') {
    return (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return floor;
      return clampLevel(levels(tx, ty));
    };
  }
  if (levels && typeof levels.length === 'number') {
    return (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) return floor;
      return clampLevel(levels[ty * mapW + tx]);
    };
  }
  const k = clampLevel(levels || 0);
  return () => k;
}

/**
 * How far tile (tx, ty) stands proud of each of its two front neighbours, in
 * PIXELS. Zero means no face is exposed on that side. Off-map neighbours are
 * treated as the ground floor so the edge of the world reads as a plateau edge
 * rather than as a clean cut.
 */
export function exposedRise(tx, ty, levelAt) {
  const h = levelAt(tx, ty);
  return {
    se: Math.max(0, h - levelAt(tx + 1, ty)) * LEVEL_H,
    sw: Math.max(0, h - levelAt(tx, ty + 1)) * LEVEL_H,
  };
}

/**
 * The raw per-column predicate, in TILE-LOCAL screen coords measured from the
 * raised top diamond's north vertex.
 *
 *   u across (-32 .. +32), v down (0 at the north vertex)
 *
 * The top diamond is tested through the very same inverse-and-floor that
 * `toTile` uses, so the mask, the hit test and the renderer's tile mask can
 * never disagree. The faces hang off the two lower edges, both of which are
 * the single line  v = 32 - |u| / 2.
 *
 * @returns {'top'|'se'|'sw'|null}
 */
export function columnFaceAt(u, v, riseSE, riseSW) {
  if (u < -HALF_W || u > HALF_W) return null;
  // Top face: the exact diamond, by the exact inverse.
  const a = u / HALF_W;
  const b = v / HALF_H;
  if (Math.floor((a + b) / 2) === 0 && Math.floor((b - a) / 2) === 0) return 'top';
  // Below the two lower edges: a vertical face, if one is exposed there.
  const edge = TILE_H - Math.abs(u) / 2;
  if (v < edge) return null;
  const rise = u >= 0 ? riseSE : riseSW;
  return rise > 0 && v <= edge + rise ? (u >= 0 ? 'se' : 'sw') : null;
}

/**
 * PICK A COLUMN UNDER A SCREEN POINT. The elevation-aware replacement for
 * `tileAt`, and the thing every click ultimately calls.
 *
 * @param {number} sx screen x (logical canvas px, camera not yet applied)
 * @param {number} sy screen y
 * @param {object} cam {x,y} or {ox,oy}
 * @param {object} [opts]
 *   levels    function(tx,ty)->level, a row-major array, or a number. Default 0.
 *   mapW/mapH default 20x20
 *   maxLevel  default MAX_LEVEL — shrink it and the candidate window shrinks
 *   faces     default true; false tests only tops (a cheaper ground-only pick)
 * @returns {{tx,ty,level,face,fx,fy}|null} null when the point is over sky.
 */
export function pickColumn(sx, sy, cam, opts = {}) {
  const c = camOf(cam);
  const mapW = opts.mapW ?? MAP_W;
  const mapH = opts.mapH ?? MAP_H;
  const maxLevel = Math.min(MAX_LEVEL, opts.maxLevel ?? MAX_LEVEL);
  const wantFaces = opts.faces !== false;
  const levelAt = levelReader(opts.levels, mapW, mapH, 0);

  const wx = sx + c.x;
  const wy = sy + c.y;
  const maxRise = maxLevel * LEVEL_H;

  // The candidate window, from the derivation above.
  const eMid = wx / HALF_W;
  const eLo = Math.ceil(eMid - 1);
  const eHi = Math.floor(eMid + 1);
  const sLo = Math.ceil((wy - TILE_H - maxRise) / HALF_H);
  const sHi = Math.floor((wy + maxRise) / HALF_H);

  // Front to back: descending depth, then descending tx — the exact reverse of
  // the terrain draw order, so the first hit is the last thing painted.
  for (let s = sHi; s >= sLo; s--) {
    for (let e = eHi; e >= eLo; e--) {
      if (((s + e) & 1) !== 0) continue; // tx = (s+e)/2 must be a whole tile
      const tx = (s + e) / 2;
      const ty = (s - e) / 2;
      if (tx < 0 || ty < 0 || tx >= mapW || ty >= mapH) continue;

      const h = levelAt(tx, ty);
      const u = wx - (tx - ty) * HALF_W;
      const v = wy - ((tx + ty) * HALF_H - h * LEVEL_H);
      if (v < 0) continue;

      let face;
      if (wantFaces) {
        const r = exposedRise(tx, ty, levelAt);
        face = columnFaceAt(u, v, r.se, r.sw);
      } else {
        face = columnFaceAt(u, v, 0, 0);
      }
      if (!face) continue;

      if (face === 'top') {
        const a = u / HALF_W;
        const b = v / HALF_H;
        return { tx, ty, level: h, face, fx: tx + (a + b) / 2, fy: ty + (b - a) / 2 };
      }
      return { tx, ty, level: h, face, fx: tx + 0.5, fy: ty + 0.5 };
    }
  }
  return null;
}

/**
 * What a click handler wants: always an answer, with `inBounds` and `hit` so
 * the caller can tell "the meadow behind the cliff" from "a real surface".
 *
 * When nothing is hit the flat inverse is used, which is exactly the old
 * behaviour — so a UI that ignores `hit` degrades to the pre-elevation game
 * instead of going dead.
 */
export function pickTileAt(sx, sy, cam, opts = {}) {
  const hit = pickColumn(sx, sy, cam, opts);
  if (hit) {
    return { ...hit, hit: true, inBounds: true };
  }
  const mapW = opts.mapW ?? MAP_W;
  const mapH = opts.mapH ?? MAP_H;
  const t = toTile(sx, sy, cam);
  return {
    tx: t.tx,
    ty: t.ty,
    fx: t.fx,
    fy: t.fy,
    level: 0,
    face: null,
    hit: false,
    inBounds: t.tx >= 0 && t.ty >= 0 && t.tx < mapW && t.ty < mapH,
  };
}

// ---------------------------------------------------------------------------
// Camera.

/**
 * The screen-space bounding box of the whole map, camera at origin. The union
 * of all tile diamonds is exactly this rectangle — nothing sticks out.
 * For 20x20: x in [-640, 640], y in [0, 640]  =>  1280 x 640, as SPEC §2 says.
 */
export function mapScreenBounds(mapW = MAP_W, mapH = MAP_H) {
  return {
    minX: -mapH * HALF_W,
    maxX: mapW * HALF_W,
    minY: 0,
    maxY: (mapW + mapH) * HALF_H,
    width: (mapW + mapH) * HALF_W,
    height: (mapW + mapH) * HALF_H,
  };
}

/**
 * The world-space rectangle the TERRAIN CACHE has to cover. Same as
 * `mapScreenBounds` but with headroom above for raised tiles: a column at
 * MAX_LEVEL draws MAX_RISE px higher than its flat position, and a back-row
 * plateau would otherwise be sliced off the top of the cache.
 */
export function worldBounds(mapW = MAP_W, mapH = MAP_H, headroom = MAX_RISE) {
  const b = mapScreenBounds(mapW, mapH);
  return {
    minX: b.minX,
    maxX: b.maxX,
    minY: b.minY - headroom,
    maxY: b.maxY,
    width: b.width,
    height: b.height + headroom,
  };
}

/** A margin may be one number or a per-side object. Normalise it. */
function marginOf(m) {
  if (typeof m === 'number') return { left: m, right: m, top: m, bottom: m };
  if (!m) return { left: 0, right: 0, top: 0, bottom: 0 };
  const x = m.x || 0;
  const y = m.y || 0;
  return { left: m.left ?? x, right: m.right ?? x, top: m.top ?? y, bottom: m.bottom ?? y };
}

/**
 * Legal camera offsets, so the viewport never shows past the edge of the map.
 * When an axis of the map is SMALLER than the viewport the camera is pinned to
 * the centre on that axis (min === max) rather than allowed to wander.
 *
 * `margin` is a number or `{left, right, top, bottom}`. The renderer passes
 * `{top: MAX_RISE}` so a plateau on the back row can be scrolled fully into
 * view — a symmetric margin would also let the player pan off the bottom into
 * empty sky, which is the wrong trade.
 */
export function cameraBounds(mapW = MAP_W, mapH = MAP_H, viewW = VIEW_W, viewH = VIEW_H, margin = 0) {
  const b = mapScreenBounds(mapW, mapH);
  const m = marginOf(margin);
  const minX = b.minX - m.left;
  const maxX = b.maxX + m.right;
  const minY = b.minY - m.top;
  const maxY = b.maxY + m.bottom;

  let loX = minX;
  let hiX = maxX - viewW;
  if (hiX < loX) loX = hiX = (minX + maxX) / 2 - viewW / 2;

  let loY = minY;
  let hiY = maxY - viewH;
  if (hiY < loY) loY = hiY = (minY + maxY) / 2 - viewH / 2;

  return { minX: loX, maxX: hiX, minY: loY, maxY: hiY };
}

/** Clamp a camera offset into `cameraBounds`. Returns a new `{x, y}`. */
export function clampCamera(cam, mapW = MAP_W, mapH = MAP_H, viewW = VIEW_W, viewH = VIEW_H, margin = 0) {
  const c = camOf(cam);
  const b = cameraBounds(mapW, mapH, viewW, viewH, margin);
  return {
    x: Math.min(b.maxX, Math.max(b.minX, c.x)),
    y: Math.min(b.maxY, Math.max(b.minY, c.y)),
  };
}

/** The camera offset that puts tile (tx, ty) in the middle of the viewport. */
export function cameraCentredOn(tx, ty, viewW = VIEW_W, viewH = VIEW_H) {
  const p = toScreen(tx + 0.5, ty + 0.5, null);
  return { x: p.x - viewW / 2, y: p.y - viewH / 2 };
}

/**
 * The inclusive tile range that could touch the viewport. Used to stamp
 * terrain and the field overlay without walking all 400 tiles when only a
 * fraction is on screen. `pad` widens the range — pass 1 or 2 when the thing
 * being stamped is taller than one tile.
 */
export function visibleTileRange(cam, viewW = VIEW_W, viewH = VIEW_H, mapW = MAP_W, mapH = MAP_H, pad = 1, rise = MAX_RISE) {
  let lox = Infinity;
  let hix = -Infinity;
  let loy = Infinity;
  let hiy = -Infinity;
  // The two extra corners are the elevation term: a tile raised MAX_LEVEL
  // draws MAX_RISE px higher, so a column whose FLAT position is that far below
  // the viewport can still have its top on screen.
  const corners = [
    [0, 0],
    [viewW, 0],
    [0, viewH + rise],
    [viewW, viewH + rise],
    [0, viewH],
    [viewW, viewH],
  ];
  for (let i = 0; i < corners.length; i++) {
    const t = toTile(corners[i][0], corners[i][1], cam);
    if (t.fx < lox) lox = t.fx;
    if (t.fx > hix) hix = t.fx;
    if (t.fy < loy) loy = t.fy;
    if (t.fy > hiy) hiy = t.fy;
  }
  return {
    tx0: Math.max(0, Math.floor(lox) - pad),
    tx1: Math.min(mapW - 1, Math.ceil(hix) + pad),
    ty0: Math.max(0, Math.floor(loy) - pad),
    ty1: Math.min(mapH - 1, Math.ceil(hiy) + pad),
  };
}

// ---------------------------------------------------------------------------
// Footprints.

/**
 * Footprints are RECTANGLES, always, and this is the guard that keeps it so.
 * SPEC §2 forbids non-rectangular footprints because an L or a T can wrap
 * another object and produce a real occlusion cycle — no scalar depth key can
 * order a cycle, so the only honest fix is to not create one.
 */
export function validateFootprint(footprint, name = 'object') {
  if (footprint == null) return [1, 1];
  if (!Array.isArray(footprint) || footprint.length !== 2) {
    throw new Error(
      `${name}: footprint must be [w, h]. Non-rectangular footprints are ` +
        `forbidden (SPEC §2) — they create occlusion cycles a scalar depth ` +
        `key cannot resolve.`
    );
  }
  const w = footprint[0];
  const h = footprint[1];
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
    throw new Error(`${name}: footprint [${w}, ${h}] must be positive whole tiles`);
  }
  return [w, h];
}

/** Normalise whatever an object carries into `[w, h]`, without throwing. */
export function footprintOf(obj) {
  const fp = obj && obj.footprint;
  if (!Array.isArray(fp) || fp.length !== 2) return [1, 1];
  const w = fp[0] | 0;
  const h = fp[1] | 0;
  return [w > 0 ? w : 1, h > 0 ? h : 1];
}

/** Every tile a placed object occupies, row-major. Origin tile first. */
export function footprintTiles(obj) {
  const [fw, fh] = footprintOf(obj);
  const tx = Math.floor(obj.tx || 0);
  const ty = Math.floor(obj.ty || 0);
  const out = [];
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) out.push([tx + x, ty + y]);
  }
  return out;
}

/** Do two rectangular footprints share a tile? */
export function footprintsOverlap(a, b) {
  const [aw, ah] = footprintOf(a);
  const [bw, bh] = footprintOf(b);
  const ax = Math.floor(a.tx || 0);
  const ay = Math.floor(a.ty || 0);
  const bx = Math.floor(b.tx || 0);
  const by = Math.floor(b.ty || 0);
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

// ---------------------------------------------------------------------------
// Depth.

/**
 * Depth of a bare tile at a level. The diagonal screen row it lives on, scaled
 * so a whole row of levels fits between adjacent rows.
 */
export function depthOfTile(tx, ty, level = 0) {
  return (tx + ty) * LEVELS + clampLevel(level);
}

/**
 * THE DEPTH KEY.  depth = max over footprint of (tx + ty), times LEVELS, plus
 * the level the object stands on (ELEVATION.md, "Depth sorting with height").
 *
 * For a rectangle the (tx+ty) term is the far (south) corner:
 * (tx+fw-1) + (ty+fh-1). For a 1x1 — including every mover, whose footprint is
 * [1,1] — it collapses to plain tx + ty, evaluated on the object's FRACTIONAL
 * coordinates, which is exactly what stops a walking satyr popping across a
 * tile boundary. The level term is an integer added on top, so it orders
 * objects that share a diagonal row without ever reaching into the next one.
 *
 * The scale factor is why nothing may compare a depth against a raw tx+ty:
 * depths are only ever compared with each other.
 */
export function depthOf(obj) {
  const tx = obj.tx || 0;
  const ty = obj.ty || 0;
  const [fw, fh] = footprintOf(obj);
  return (tx + fw - 1 + (ty + fh - 1)) * LEVELS + levelOf(obj);
}

/**
 * The full sort key as a tuple, for tests and debugging:
 * [depth, tx, insertionIndex].
 */
export function depthKey(obj, insertionIndex = 0) {
  return [depthOf(obj), obj.tx || 0, insertionIndex];
}

/**
 * The comparator, spelled out. depth -> tx -> insertion index.
 * Returns < 0 when `a` draws FIRST (further back).
 */
export function compareDepth(a, ai, b, bi) {
  const d = depthOf(a) - depthOf(b);
  if (d !== 0) return d;
  const x = (a.tx || 0) - (b.tx || 0);
  if (x !== 0) return x;
  return ai - bi;
}

/**
 * Back-to-front draw order for a mixed list of objects and creatures.
 *
 * Returns a NEW array; the caller's objects are never mutated and never
 * decorated with a private field. The insertion index is taken from the input
 * order, so the intended call is:
 *
 *   sortForDraw([...objects, ...creatures])
 *
 * and a creature sharing a tile exactly with an object lands on top of it,
 * because it was inserted later. That is the "creatures layer" of SPEC's layer
 * list, obtained without a separate pass — a separate pass would draw a
 * creature over a tree it is standing BEHIND, which is a real, visible bug.
 */
export function sortForDraw(items) {
  const n = items.length;
  const dec = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = items[i];
    dec[i] = { i, d: depthOf(o), x: o.tx || 0, o };
  }
  dec.sort((a, b) => a.d - b.d || a.x - b.x || a.i - b.i);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = dec[i].o;
  return out;
}

/**
 * In-place variant for the render hot path: sorts `items` itself and returns
 * it. Still stable on insertion order because the index is captured first.
 */
export function sortForDrawInPlace(items) {
  const idx = new Map();
  for (let i = 0; i < items.length; i++) idx.set(items[i], i);
  items.sort((a, b) => depthOf(a) - depthOf(b) || (a.tx || 0) - (b.tx || 0) || idx.get(a) - idx.get(b));
  return items;
}

// ---------------------------------------------------------------------------
// Snapping.

/**
 * Sub-pixel sprite positions are the same crime as fractional scaling
 * (RESEARCH A9.1) — they make the pixel grid crawl when the camera pans.
 * Every draw position goes through here.
 */
export function snap(n) {
  return Math.round(n);
}
