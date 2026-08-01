// isogeom.mjs — the shape of the isometric world, as numbers a tool can check.
//
// ONE implementation, shared by three consumers, on purpose:
//
//   tools/iso-audit.mjs     the headless census — "which sprites end flat?"
//   tools/spritelab.html    the overlay — "show me WHERE, on the sprite"
//   test/iso-geometry.test.mjs  the guards, including the negative controls
//
// The audit and the lab disagreeing about what a legal edge is would be worse
// than either of them being wrong, because the disagreement is invisible: the
// lab would draw a guide the audit does not measure against, and an artist
// would align to the wrong line in good faith. Two things that must not drift
// are safest as one statement.
//
// ---------------------------------------------------------------------------
// THE GEOMETRY, stated once and imported everywhere
// ---------------------------------------------------------------------------
//
// In a 2:1 isometric projection there are exactly THREE visible planes:
//
//     the ground        a 2:1 diamond          slopes +1/2 and -1/2
//     the SE wall       a vertical face        verticals, capped by a +1/2 edge
//     the SW wall       a vertical face        verticals, capped by a -1/2 edge
//
// So there are exactly THREE straight-line families a sprite may use: rising
// 1-in-2, falling 1-in-2, and vertical. **A long horizontal run is not one of
// them.** It is the signature of a front elevation pasted into a world that has
// no front.
//
// And the silhouette of a unit cube in this projection is a HEXAGON — the
// owner's word for it, and the right envelope to draw inside. A sprite whose
// outline is an axis-aligned rectangle or a screen-facing ellipse is not
// occupying a hexagonal volume; it is a sticker.
//
// The exception, and it is a real one: ROTATIONAL forms. A column, an urn, a
// tree trunk, a boulder — anything with a vertical axis of revolution — looks
// the same from every direction and SHOULD be bilaterally symmetric on screen.
// Symmetry alone is therefore not the fault. The fault is symmetry in something
// that has a FRONT: a cave mouth, a bench, a wall, a doorway, a bridge.

// ---------------------------------------------------------------------------
// Constants. These mirror js/iso.js and are re-derived rather than imported so
// that a node tool can measure art without pulling in the game's module graph.
// The test suite asserts they agree; see test/iso-geometry.test.mjs.
// ---------------------------------------------------------------------------

export const TILE_W = 64;
export const TILE_H = 32;

/**
 * The vertical edge of a ONE-TILE-TALL box, in pixels.
 *
 * 32, not 16. `LEVEL_H` in the game is 16 because TERRAIN rises half a tile per
 * level (a true unit cube per level would read as a mountain — SPEC/ELEVATION).
 * But an OBJECT is not terrain: a chest that is one tile wide and one tile deep
 * and one tile tall is a cube, and a cube in 2:1 iso is 32 px of vertical edge.
 * Drawing the guide at 16 would teach every artist to draw everything squashed.
 */
export const CUBE_H = TILE_W / 2; // 32

/**
 * The old bar for `baseLift`, kept because `lift` is still reported and a
 * number with no scale attached to it is unreadable. IT NO LONGER VOTES — see
 * `groundRuns` for what does, and why this one had to stop.
 */
export const WANT = 0.125;

/**
 * The projection of a CIRCLE lying in the ground plane: an ellipse exactly
 * twice as wide as it is tall. This is the shape of every contact shadow,
 * every pool, every round plinth base, and every patch of grass at the foot of
 * a thing — because all of them are circles drawn on the ground.
 *
 * Getting this ratio wrong is the single most common way art stops lying in
 * the world: a 3.7:1 "ellipse" is a circle seen from a shallower angle than
 * the game's camera, so it reads as a decal stuck to the screen. And at that
 * flatness its lowest rows are nearly level, which is how a shadow ends up
 * with a sixteen-pixel horizontal edge.
 */
export const GROUND_ELLIPSE = 0.5;

const TRANSPARENT = '.';
const opaque = (ch) => ch !== undefined && ch !== TRANSPARENT;

// ---------------------------------------------------------------------------
// Projection — tile space to screen space, relative to some origin.
// ---------------------------------------------------------------------------

/**
 * A tile-space offset to a screen-space offset, in pixels.
 *
 *   dx = (dtx - dty) * 32        dy = (dtx + dty) * 16 - dz * 32
 *
 * `dz` is in TILES of height, so `project(0, 0, 1)` is the top of a unit cube.
 * Screen y grows downward, which is why the z term subtracts.
 */
export function project(dtx, dty, dz = 0) {
  return {
    x: (dtx - dty) * (TILE_W / 2),
    y: (dtx + dty) * (TILE_H / 2) - dz * CUBE_H,
  };
}

/**
 * The ground diamond of an `fw` x `fh` footprint, in pixels RELATIVE TO THE
 * ANCHOR — which is the pixel that lands on the footprint's centre point
 * (SPEC §2; js/iso.js `footprintCentre` puts it at tile tx+fw/2, ty+fh/2).
 *
 * Returned north-first and clockwise on screen: N, E, S, W. For a 1x1 that is
 * exactly (0,-16) (32,0) (0,16) (-32,0) — the 64x32 tile, centred on the anchor.
 *
 * THIS IS THE SHAPE THE BASE OF THE SPRITE HAS TO MEET. Every solid resting on
 * a tile touches the ground plane, and the ground plane is this diamond.
 */
export function groundDiamond(fw = 1, fh = 1) {
  const hx = fw / 2;
  const hy = fh / 2;
  return [
    project(-hx, -hy), // N — the back corner
    project(hx, -hy), // E
    project(hx, hy), // S — the front corner, the one nearest the viewer
    project(-hx, hy), // W
  ];
}

/**
 * The SILHOUETTE of a box standing on that footprint, `hz` tiles tall — the
 * hexagon. Six points, clockwise from the top-back vertex.
 *
 * It is a hexagon and not an eight-sided figure because the N corner of the
 * base and the S corner of the top are both hidden inside the outline: the top
 * face's N vertex is the highest point on screen and the base's S vertex is the
 * lowest, and the two side corners each contribute a vertical edge.
 *
 *          N'              <- top diamond, back
 *      W'      E'
 *      |        |          <- the two vertical edges
 *      W        E
 *          S              <- ground diamond, front
 */
export function boxHull(fw = 1, fh = 1, hz = 1) {
  const hx = fw / 2;
  const hy = fh / 2;
  return (
    [
      project(-hx, -hy, hz), // N' top back
      project(hx, -hy, hz), // E' top right
      project(hx, -hy, 0), // E  foot of the right vertical edge
      project(hx, hy, 0), // S  ground front — the lowest point on screen
      project(-hx, hy, 0), // W  foot of the left vertical edge
      project(-hx, hy, hz), // W' top left
    ]
      // At hz = 0 the two vertical edges have no length and the hexagon
      // degenerates to the ground diamond. Dropping the repeats makes that
      // case return four points rather than four points and two ghosts.
      .filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y)
  );
}

/**
 * The two NEAR edges of the ground diamond — W->S and S->E — sampled per pixel
 * column, as a map from x offset to the y offset of the diamond's near boundary.
 *
 * This is the ideal a sprite's bottom contour is compared against by eye in the
 * lab. A foot may sit INSIDE it (a narrow post occupies only the middle of its
 * plot, quite correctly); what it may not do is run flat across it.
 */
export function nearEdgeProfile(fw = 1, fh = 1) {
  const [, e, s, w] = groundDiamond(fw, fh);
  const out = new Map();
  const run = (a, b) => {
    const steps = Math.max(1, Math.round(Math.abs(b.x - a.x)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = a.y + (b.y - a.y) * t;
      const prev = out.get(x);
      out.set(x, prev === undefined ? y : Math.max(prev, y));
    }
  };
  run(w, s);
  run(s, e);
  return out;
}

// ---------------------------------------------------------------------------
// Measurement — what a sprite actually did.
// ---------------------------------------------------------------------------

/** Left and right silhouette edges per row, or null for an empty row. */
export function edges(s) {
  const out = [];
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y] || '';
    let l = -1;
    let r = -1;
    for (let x = 0; x < row.length; x++) {
      if (!opaque(row[x])) continue;
      if (l < 0) l = x;
      r = x;
    }
    out.push(l < 0 ? null : { l, r });
  }
  return out;
}

/**
 * THE BOTTOM CONTOUR: for each occupied column, the lowest opaque pixel.
 *
 * Everything the flat-base measure knows comes from this one list, and the lab
 * paints it straight onto the sprite. Seeing the contour is the whole point —
 * a number tells you a sprite is wrong, the contour tells you which 20 pixels.
 */
export function baseProfile(s) {
  const out = [];
  for (let x = 0; x < s.w; x++) {
    for (let y = s.h - 1; y >= 0; y--) {
      if (opaque((s.rows[y] || '')[x])) {
        out.push({ x, y });
        break;
      }
    }
  }
  return out;
}

/**
 * WHERE THE OBJECT MEETS THE GROUND, and the key its shadow is drawn in.
 *
 * BOTH LIVE IN js/art/format.js AND ARE RE-EXPORTED HERE, not copied. They were
 * written in this file first, and moved the moment js/render.js needed them to
 * size the runtime contact shadow — because at that point three things depend
 * on the same answer:
 *
 *   js/render.js            how big is the shadow under this object?
 *   tools/anchor-audit.mjs  is this sprite anchored where its foot is?
 *   tools/spritelab.html    show me, on the sprite
 *
 * A RENDERER AND AN AUDIT DISAGREEING ABOUT WHERE A FOOT IS would be worse than
 * either being wrong, because the disagreement is invisible: the audit passes
 * art the renderer then shades in the wrong place. Same argument as the header
 * of this file makes for the lab and the census; it just now reaches the game.
 *
 * The constants above are still re-derived rather than imported, deliberately —
 * see the note there — and a test asserts they agree with js/iso.js.
 */
export { groundCentre, SHADOW_KEY } from '../js/art/format.js';

/**
 * THE MEASURE. How far the bottom contour rises, over the sprite's width.
 *
 * A 2:1 ellipse or a diamond corner lifts by about a quarter of the width; a
 * slab drawn on the screen plane lifts by nothing. Measured against the OUTER
 * TENTH of the occupied columns rather than the absolute maximum, because one
 * stray pixel of grass at the far edge would otherwise report a perfectly flat
 * base as a deep one.
 *
 * The SHALLOWER of the two ends wins: a foot only has to lift on one side to
 * prove it is in the grid (a corner-on cube lifts toward both, a wall running
 * NE lifts toward one).
 */
export function baseLift(s) {
  const low = baseProfile(s);
  if (low.length < 4) return { lift: 1, span: low.length, deepest: 0, px: 0 };
  const deepest = Math.max(...low.map((p) => p.y));
  const k = Math.max(1, Math.round(low.length / 10));
  const leftEdge = Math.min(...low.slice(0, k).map((p) => p.y));
  const rightEdge = Math.min(...low.slice(-k).map((p) => p.y));
  // `max` of two y values is the LOWER end on screen — the one that lifted
  // least. So this is deliberately the SMALLER of the two lifts: both ends
  // must rise. See `flatShare` for why that is reported and no longer voted.
  const lift = deepest - Math.max(leftEdge, rightEdge);
  return {
    lift: lift / s.w,
    span: low.length,
    deepest,
    px: lift,
    // ...and the other reading of the same contour: the biggest lift either
    // end manages. A single wall face lifts toward one end only, quite
    // correctly, and that is what this one sees.
    bestLift: (deepest - Math.min(leftEdge, rightEdge)) / s.w,
  };
}

/**
 * The absolute floor, below which nothing is ever called an edge.
 *
 * A 2:1 line in pixels is drawn as PAIRS, so it can hold the same y for two
 * columns and never more. 12 px is three sixteenths of a tile's width —
 * visible at 1x on a 640-wide screen without looking for it.
 */
export const RUN_MIN = 12;

/**
 * ...AND THE ALLOWANCE, WHICH SCALES, because a correct curve is flat too.
 *
 * A circle of radius r in the ground plane is an ellipse with ry = r/2, and on
 * an integer grid its bottom is FLAT for a stretch. That stretch is what an
 * audit has to allow, or it convicts every large ground contact in the game
 * for being round.
 *
 * ---------------------------------------------------------------------------
 * THE FIRST DERIVATION WAS WRONG AND THE MEASUREMENT IS WHY WE KNOW.
 *
 * It solved for the row where the curve holds within half a pixel of its
 * lowest point — `ry*(1 - sqrt(1-nx^2)) < 0.5`, giving `2*sqrt(2r)`. That is
 * the right answer to the wrong question. The binding case is not that row at
 * all: when the ellipse's true bottom row ROUNDS AWAY (which it does whenever
 * the centre sits on a half pixel, i.e. whenever `skirt` is called at
 * `cx + 0.5`, i.e. usually), the widest surviving row is the chord at
 * `dy = ry - 1`:
 *
 *     nx^2 = 1 - ((ry-1)/ry)^2  ->  width = 2r*sqrt(2ry-1)/ry  =  4*sqrt(r-1)
 *
 * Drawing ideal ellipses and measuring their own contours settles it, and the
 * numbers are not close:
 *
 *     r     measured   2*sqrt(2r)   4*sqrt(r-1)
 *     10       12          8.9         12.0
 *     12       14          9.8         13.3
 *     26       20         14.4         20.0
 *     42       26         18.3         25.6
 *
 * The old formula under-predicted every wide case, which is why three
 * correctly-shadowed sprites kept failing by two or three pixels and looked
 * like art faults. THEY WERE ARITHMETIC FAULTS, MINE.
 *
 * `4*sqrt(r-1)` is an upper bound: exact where the bottom row is lost, and
 * generous where it survives (r=15 measures 10 against an allowance of 15).
 * Generous is the right direction for an instrument whose false positives cost
 * an artist a day and whose false negatives cost one flat edge.
 *
 * A CHECKER WHOSE THRESHOLD DOES NOT SCALE WITH ITS SUBJECT IS MEASURING THE
 * SUBJECT'S SIZE, not the property it claims to measure — and a threshold
 * derived rather than measured is measuring the derivation.
 */
export function curveAllowance(rBase) {
  return Math.ceil(4 * Math.sqrt(Math.max(1, rBase - 1)));
}

/**
 * THE MEASURE THAT VOTES: level runs WHERE THE OBJECT MEETS THE GROUND.
 *
 * Two earlier versions of this got it wrong in instructive ways, and both are
 * worth keeping written down because both are easy to walk back into.
 *
 * FIRST, `lift` — how far the contour's ends rise above its deepest point.
 * That question's answer depends on the sprite's overall SHAPE, and two
 * correct shapes give opposite answers: a chest sitting corner-on lifts toward
 * both ends, a single cliff face lifts toward one. Whichever end the rule
 * picked, one of those families was convicted for being right. The terrain
 * tiles are what showed it — `foot-rock-se-a` scored `diag 1.00` (every edge
 * on a 2:1 slope, i.e. perfect) and `lift 0.02` (i.e. broken) at the same time.
 *
 * SECOND, counting level runs anywhere in the bottom silhouette. That flags
 * the underside of a tree's canopy, which is not a base at all — it is leaves,
 * hanging in the air, and they are allowed to hang however they like.
 *
 * What is actually forbidden is narrow and can be said in one line: **an
 * isometric world contains no horizontal edges at ground level.** So look only
 * at the columns whose contour lands within the footprint diamond's own
 * half-height of the deepest point — that band IS the base — and find the
 * level runs in it.
 */
export function groundRuns(s, minOverride = 0) {
  const fp = s.footprint || [1, 1];
  const band = (fp[0] + fp[1]) * 8; // the diamond's half-height: W/E corner to S vertex
  const low = baseProfile(s);
  if (!low.length) {
    return { runs: [], longest: 0, over: 0, band, width: (fp[0] + fp[1]) * 32, min: RUN_MIN };
  }
  const deepest = Math.max(...low.map((p) => p.y));
  const inBand = low.filter((p) => p.y >= deepest - band);

  // The bar, derived from how wide THIS object's ground contact actually is —
  // not from the sprite, and not from the footprint. A 24px-wide post and a
  // 60px-wide boulder standing on the same tile are allowed different amounts
  // of flat, because the circles at their feet are different circles.
  const rBase = inBand.length / 2;
  const min = minOverride || Math.max(RUN_MIN, curveAllowance(rBase));

  const runs = [];
  let i = 0;
  while (i < inBand.length) {
    let j = i;
    while (
      j + 1 < inBand.length &&
      inBand[j + 1].y === inBand[i].y &&
      inBand[j + 1].x === inBand[j].x + 1
    ) {
      j++;
    }
    const len = j - i + 1;
    // STRICTLY LONGER. `min` is the longest run that is still CORRECT — the
    // flat spot a properly drawn circle of this size has — so a run of exactly
    // that length is the right answer, not a near miss. Testing `>=` here
    // failed every sprite whose ground contact was an exact ellipse, which is
    // to say every sprite that had just been fixed.
    if (len > min) runs.push({ x0: inBand[i].x, x1: inBand[j].x, y: inBand[i].y, len });
    i = j + 1;
  }
  const longest = runs.length ? Math.max(...runs.map((r) => r.len)) : 0;
  const width = (fp[0] + fp[1]) * 32; // the diamond this object claims to stand on
  return { runs, longest, over: longest / width, band, width, min };
}

/**
 * The runs of the bottom contour that are HORIZONTAL — the actual offence,
 * located. Returns `{ x0, x1, y, len }` for every level run at least `min`
 * columns long.
 *
 * `min` defaults to 6 because a 2:1 line in pixels is drawn as pairs, and a
 * shallow curve legitimately holds the same y for four or five columns near its
 * lowest point. Six is where "a curve bottoming out" becomes "an edge".
 */
export function flatRuns(s, min = 6) {
  const low = baseProfile(s);
  const runs = [];
  let i = 0;
  while (i < low.length) {
    let j = i;
    while (
      j + 1 < low.length &&
      low[j + 1].y === low[i].y &&
      low[j + 1].x === low[j].x + 1
    ) {
      j++;
    }
    const len = j - i + 1;
    if (len >= min) runs.push({ x0: low[i].x, x1: low[j].x, y: low[i].y, len });
    i = j + 1;
  }
  return runs;
}

/**
 * How much of the outline runs on a 2:1 slope.
 *
 * Walking DOWN the silhouette, a 2:1 edge moves 2 px sideways per row (or 1 and
 * 1, since a 2:1 line in pixels is drawn as pairs). A vertical wall moves 0. A
 * screen-facing curve moves 3, 4, 5+ near its waist and 0 near its poles, and
 * the giveaway is that it does BOTH within a few rows.
 *
 * Scored generously: steps of 1 or 2 count as "in the grid", 0 counts as a wall
 * and is neutral, 3+ counts against. REPORTED, NOT VOTED — see iso-audit.
 */
export function diagonalScore(s) {
  const e = edges(s);
  let good = 0;
  let bad = 0;
  for (let y = 1; y < s.h; y++) {
    const a = e[y - 1];
    const b = e[y];
    if (!a || !b) continue;
    for (const d of [Math.abs(b.l - a.l), Math.abs(b.r - a.r)]) {
      if (d === 1 || d === 2) good++;
      else if (d >= 3) bad++;
    }
  }
  const total = good + bad;
  return total ? good / total : 1;
}

/** 1.0 = a perfect mirror about the vertical centre line. REPORTED, NOT VOTED. */
export function mirrorScore(s) {
  let same = 0;
  let seen = 0;
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y] || '';
    for (let x = 0; x < s.w; x++) {
      const m = s.w - 1 - x;
      const a = opaque(row[x]);
      const b = opaque(row[m]);
      if (!a && !b) continue;
      seen++;
      if (a === b) same++;
    }
  }
  return seen ? same / seen : 0;
}

/** The widest unbroken horizontal run anywhere, over the width. REPORTED. */
export function widestFlat(s) {
  let best = 0;
  for (let y = 0; y < s.h; y++) {
    const row = s.rows[y] || '';
    let n = 0;
    for (let x = 0; x < row.length; x++) {
      if (opaque(row[x])) {
        n++;
        if (n > best) best = n;
      } else n = 0;
    }
  }
  return best / s.w;
}

/**
 * Everything about one sprite, in the order a reader wants it. `flat` — the
 * longest level run at ground level — is the ONLY number that votes; the rest
 * are for a human reading the row.
 *
 * THE FIRST DRAFT OF THIS SCORED FOUR THINGS AT ONCE AND WAS NOISE. It ranked
 * COLUMN the fourth-worst sprite in the game. A column is a cylinder: it is
 * *supposed* to be bilaterally symmetric, *supposed* to have a wide flat waist,
 * and three of the four measures were punishing it for being drawn correctly.
 * A checker whose resolution cannot support its question returns noise shaped
 * like an answer.
 */
export function measure(s) {
  const g = groundRuns(s);
  const bl = baseLift(s);
  return {
    flat: g.longest, // px of dead-level edge at ground level. THE VOTE.
    over: g.over, // ...as a fraction of the diamond it stands on. Severity.
    runs: g.runs, // ...and exactly which columns, so it can be redrawn.
    min: g.min, // ...against the allowance a correct curve of this size gets.
    band: g.band,
    lift: bl.lift, // reported: how far both ends rise. Shape-dependent.
    bestLift: bl.bestLift, // reported: how far the better end rises.
    span: bl.span,
    widest: widestFlat(s), // reported: widest horizontal run ANYWHERE.
    mirror: mirrorScore(s), // reported: rotational forms are meant to be 1.0.
    diag: diagonalScore(s), // reported: the positive signal.
    ok: g.longest === 0,
  };
}

/** Is this sprite big enough for its geometry to be worth judging? */
export function measurable(s) {
  return !!s && Array.isArray(s.rows) && typeof s.w === 'number' && s.w >= 8 && s.h >= 8;
}

// ---------------------------------------------------------------------------
// THE POPULATION. Which art is judged, and which is not.
// ---------------------------------------------------------------------------

/**
 * The art modules the flat-base measure applies to.
 *
 * These are the SOLIDS: things that rest on a tile and therefore have to meet
 * the ground plane. Two modules are deliberately absent:
 *
 *   creatures.js  a mover's contour is two feet and a gap. `lift` measures the
 *                 rise from the deepest column to the OUTER columns, and for a
 *                 figure the outer columns are its elbows. The number would be
 *                 large, meaningless, and — worse — reassuring.
 *   grow.js       procedural trees. Same shape of error from the other side: a
 *                 wide canopy over a narrow trunk passes trivially, because
 *                 the outermost columns end high up in the leaves. Not a false
 *                 alarm, but a free pass, which is its own kind of lie.
 *
 * A measure that cannot see a fault must not be pointed at art where the fault
 * would be invisible; a green result there means "not asked", not "fine".
 *
 * THE LAB AND THE AUDIT READ THIS SAME LIST. They used to count different
 * populations — 87 of 190 on screen against 32 of 103 on the terminal — and a
 * census that reports two numbers is a census nobody can act on.
 */
export const AUDITED_MODULES = ['props', 'decor', 'tiles', 'extras', 'clumps'];

/**
 * Every measurable sprite a module exports — top level, and one level inside a
 * plain object, because `clumps.js` exports its sprites as a CLUMPS map as well
 * as individually and the map is where most of them live.
 *
 * Deduplicated by identity, so a sprite exported both ways is counted once.
 */
export function spritesIn(mod, from = '') {
  const out = [];
  const seen = new Set();
  const push = (name, s) => {
    if (!measurable(s) || seen.has(s)) return;
    seen.add(s);
    out.push({ name: s.name || name, sprite: s, from });
  };
  for (const [k, v] of Object.entries(mod || {})) {
    if (measurable(v)) push(k, v);
    else if (Array.isArray(v)) v.forEach((s, i) => push(`${k}[${i}]`, s));
    else if (v && typeof v === 'object') {
      for (const [k2, v2] of Object.entries(v)) push(`${k2}`, v2);
    }
  }
  return out;
}
