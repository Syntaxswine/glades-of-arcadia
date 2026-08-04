// js/art/solid.js — BUILD IT OUT OF BOXES AND LET THE PROJECTION DRAW IT.
//
// ---------------------------------------------------------------------------
// The owner, after a day of watching hand-drawn isometric geometry go wrong in
// four different ways:
//
//   *"i'd also like to propose a skill that turns simple 3d objects into
//   sprites. its probably too late for this game, but boy would that have
//   helped with the hedges. just add a skin to the geometric shape and convert
//   that into a sprite."*
//
// It is not too late, and the reason to build it is not elegance. Every fault
// in this art the whole week was the same fault: SOMEBODY RE-DERIVED THE
// PROJECTION BY HAND AND GOT IT SLIGHTLY WRONG.
//
//   the drystone cap    drawn as a vertical band above the face, so the wall
//                       read as a ribbon rather than a box.
//   the wire mesh       `for b: put(x - 2b, y + b)` writes two screen columns
//                       in four. Twice, in one afternoon.
//   the back edge       floored where the slab ceils, so a dark stroke hung one
//                       pixel clear of its own mass on every odd column.
//   the crown's wedge   a raised part stepped down and nothing was drawn in the
//                       step, so you could see grass through a hedge.
//   THE CORNER          *"when you made it bend 90 degrees it bends like a
//                       ribbon instead of a three dimensional object."*
//
// Not one of those is an artistic decision. They are all the same arithmetic,
// got wrong five times, because there was no way to say "this object is a box"
// — only ways to draw the three faces a box would have had.
//
// So: describe the SHAPE in world units, hand it a skin, and let one rasteriser
// that knows the projection do the rest. A corner stops being new art and
// becomes two boxes. A gateway is a bar with a notch and a lintel. Nothing
// downstream has to know how a top face recedes, because nothing downstream
// draws one.
// ---------------------------------------------------------------------------

/**
 * THE WORLD AXES, and they are not chosen — they are read off `slab` in
 * js/art/format.js so this module and every existing sprite agree to the pixel.
 *
 *   a   along +tx.  One unit is ( +2, +1 ) on screen.
 *   b   along +ty.  One unit is ( -2, +1 ).
 *   c   upward.     One unit is (  0, -1 ).
 *
 * From `slab`'s own membership test — a = (v + u/2)/2, b = (v - u/2)/2 with
 * u = x - x0 and v = y - yTop — inverting gives x = x0 + 2a - 2b and
 * y = yTop + a + b. Height simply lifts. So one tile STEP along +tx is 16 units
 * of `a` (32 px of screen x), and `LINE_W = 33` is those 16 units plus the one
 * overlap column.
 *
 * A hedge is therefore `box(0, 16.5, 0, 8, 0, 30)` and nothing else.
 */
export const A_STEP = 16; // units of `a` in one tile step
export const TO_X = (a, b) => 2 * a - 2 * b;
export const TO_Y = (a, b, c) => a + b - c;

/**
 * WHICH SURFACE WINS A PIXEL.
 *
 * Two world points land on the same pixel exactly when they differ by a
 * multiple of (1, 1, 2): moving one unit along +tx AND one along +ty AND two
 * upward changes x by 2 - 2 + 0 and y by 1 + 1 - 2, both zero. That vector is
 * the view ray, so the camera sits at infinity along it and the point with the
 * LARGER a + b + 2c is the nearer one.
 *
 * This is what makes a corner free. Two boxes at right angles are not composed,
 * blended or ordered by hand — each pixel simply keeps the surface closest to
 * the eye, and the outer corner fills because there is solid there to see.
 */
const depthOf = (a, b, c) => a + b + 2 * c;

/**
 * A box, in world units. `faces` supplies the skin:
 *
 *   top(a, b)    the lit upper surface, c = c1
 *   side(a, c)   the near face along +ty, b = b1 — the big dark one
 *   end(b, c)    the near face along +tx, a = a1 — the one hand-drawn bars
 *                never had, which is precisely why a raised crown showed a raw
 *                cut edge above its neighbours
 *
 * Each returns a palette key, or a falsy value to leave the pixel alone (that
 * is how a doorway is cut: skin the hole rather than subtract the solid).
 */
export function box(a0, a1, b0, b1, c0, c1, faces) {
  return { a0, a1, b0, b1, c0, c1, faces };
}

const EPS = 1e-6;

/**
 * Rasterise boxes into a character grid.
 *
 * PER SCREEN PIXEL, NOT PER SURFACE POINT, and that is the whole reason this is
 * reliable. Walking a surface in world units and plotting is what produced the
 * wire-mesh cap twice: the steps land on some columns and skip others. Here
 * every candidate pixel is visited once and asked which surfaces contain it,
 * exactly as `slab` asks, so a face cannot have holes in it by construction.
 *
 * Returns `{ g, ax, ay }` ready for `spriteAt` / `linearJoins`, with the hub
 * placed at world (a, b, c) = (`hub`, 0, 0) — the tile centre, at the ground.
 */
/**
 * Rasterise boxes into a grid a CALLER already owns, in that caller's own
 * coordinates.
 *
 * THIS IS THE ONE THAT MATTERS FOR MIGRATING EXISTING ART. `render` below picks
 * its own frame, which is fine for a new sprite and useless for a corner that
 * has to meet a hand-drawn straight run without a seam. Here the caller states
 * the same three numbers it already passes to `slab`:
 *
 *   x0, yTop   where the run's far top corner sits, exactly as in `slab`
 *   lift       how far the top face stands above the anchor's ground line,
 *              i.e. the piece's own height — because `slab` draws the TOP and
 *              this module measures `c` up from the GROUND
 *
 *   gx = x0 + 2a - 2b        gy = yTop + a + b + lift - c
 *
 * With those, `box(0, LINE_W / 2, 0, depth, 0, height)` reproduces exactly the
 * volume that `slab` + `slabFace` draw between them — which is the check to run
 * FIRST when converting a family, and the check that tells you the frame is
 * right before any of the interesting shapes are attempted.
 */
export function renderInto(g, boxes, { x0, yTop, lift }) {
  const H = g.length;
  const W = g[0].length;
  const zbuf = new Float64Array(W * H).fill(-Infinity);
  const put = (x, y, depth, key) => {
    if (!key) return;
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const i = py * W + px;
    if (depth <= zbuf[i]) return;
    zbuf[i] = depth;
    g[py][px] = key;
  };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const bx of boxes) {
    for (const a of [bx.a0, bx.a1]) {
      for (const b of [bx.b0, bx.b1]) {
        for (const c of [bx.c0, bx.c1]) {
          const x = x0 + 2 * a - 2 * b;
          const y = yTop + a + b + lift - c;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  minX = Math.max(0, Math.floor(minX) - 1);
  maxX = Math.min(W - 1, Math.ceil(maxX) + 1);
  minY = Math.max(0, Math.floor(minY) - 1);
  maxY = Math.min(H - 1, Math.ceil(maxY) + 1);

  for (const bx of boxes) {
    const { a0, a1, b0, b1, c0, c1, faces } = bx;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const u = x - x0;
        const v = y - yTop - lift;
        const h = u / 2;
        // TOP, c = c1:  a - b = u/2,  a + b = v + c1
        if (faces.top) {
          const a = (h + v + c1) / 2;
          const b = (v + c1 - h) / 2;
          if (a >= a0 - EPS && a <= a1 + EPS && b >= b0 - EPS && b <= b1 + EPS) {
            put(x, y, depthOf(a, b, c1), faces.top(a - a0, b - b0, x, y));
          }
        }
        // SIDE, b = b1
        if (faces.side) {
          const a = h + b1;
          const c = a + b1 - v;
          if (a >= a0 - EPS && a <= a1 + EPS && c >= c0 - EPS && c <= c1 + EPS) {
            put(x, y, depthOf(a, b1, c), faces.side(a - a0, c1 - c, x, y));
          }
        }
        // END, a = a1
        if (faces.end) {
          const b = a1 - h;
          const c = a1 + b - v;
          if (b >= b0 - EPS && b <= b1 + EPS && c >= c0 - EPS && c <= c1 + EPS) {
            put(x, y, depthOf(a1, b, c), faces.end(b - b0, c1 - c, x, y));
          }
        }
      }
    }
  }
  return g;
}

export function render(boxes, { hub = A_STEP / 2, pad = 2 } = {}) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const bx of boxes) {
    for (const a of [bx.a0, bx.a1]) {
      for (const b of [bx.b0, bx.b1]) {
        for (const c of [bx.c0, bx.c1]) {
          const x = TO_X(a, b);
          const y = TO_Y(a, b, c);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }
  minX = Math.floor(minX) - pad;
  maxX = Math.ceil(maxX) + pad;
  minY = Math.floor(minY) - pad;
  maxY = Math.ceil(maxY) + pad;

  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  const g = Array.from({ length: H }, () => new Array(W).fill('.'));
  const zbuf = new Float64Array(W * H).fill(-Infinity);

  const put = (x, y, depth, key) => {
    if (!key) return;
    const px = x - minX;
    const py = y - minY;
    if (px < 0 || py < 0 || px >= W || py >= H) return;
    const i = py * W + px;
    if (depth <= zbuf[i]) return;
    zbuf[i] = depth;
    g[py][px] = key;
  };

  for (const bx of boxes) {
    const { a0, a1, b0, b1, c0, c1, faces } = bx;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const h = x / 2;
        // TOP, c = c1:  a - b = x/2  and  a + b = y + c1
        if (faces.top) {
          const a = (h + y + c1) / 2;
          const b = (y + c1 - h) / 2;
          if (a >= a0 - EPS && a <= a1 + EPS && b >= b0 - EPS && b <= b1 + EPS) {
            put(x, y, depthOf(a, b, c1), faces.top(a - a0, b - b0, x, y));
          }
        }
        // SIDE, b = b1:  a = x/2 + b1  and  c = a + b1 - y
        if (faces.side) {
          const a = h + b1;
          const c = a + b1 - y;
          if (a >= a0 - EPS && a <= a1 + EPS && c >= c0 - EPS && c <= c1 + EPS) {
            put(x, y, depthOf(a, b1, c), faces.side(a - a0, c1 - c, x, y));
          }
        }
        // END, a = a1:  b = a1 - x/2  and  c = a1 + b - y
        if (faces.end) {
          const b = a1 - h;
          const c = a1 + b - y;
          if (b >= b0 - EPS && b <= b1 + EPS && c >= c0 - EPS && c <= c1 + EPS) {
            put(x, y, depthOf(a1, b, c), faces.end(b - b0, c1 - c, x, y));
          }
        }
      }
    }
  }
  return { g, ax: TO_X(hub, 0) - minX, ay: TO_Y(hub, 0, 0) - minY + 1 };
}

/**
 * THE SIXTEEN STATES OF A RUN, BUILT AS SOLIDS — the corner the owner asked for.
 *
 *   *"when you made it bend 90 degrees it bends like a ribbon instead of a
 *   three dimensional object."*
 *
 * `joinedPiece` in format.js composes a bend by overlaying two flat half-bars.
 * That is exactly right for a PICKET FENCE, where a corner genuinely is two
 * half-runs of posts meeting — the owner confirms the palisade "is working
 * perfectly" — and it is wrong for anything with volume, because two overlaid
 * half-bars have no corner MASS. There is no outer vertical edge and no L-shaped
 * top, so the eye reads a folded sheet.
 *
 * Here a bend is two boxes and the z-buffer does the rest.
 *
 * THE FRAME IS THE FAMILY'S OWN, which is the part that makes this usable on art
 * that already exists. Verified before any of it was written: a solid
 * `box(0, R, 0, D, 0, H)` drawn at the family's own `x0`/`yTop`/`lift` covers the
 * hand-built bar's pixels EXACTLY — 1573 shared, **zero** solid-only. The 33 the
 * hand version has spare are its back-edge stroke and its nicks, which `slab`
 * never drew either. So a straight built here is the straight that shipped, and
 * a corner built here meets it without a seam.
 *
 * `spec` carries the family's numbers and its own skin, so the foliage speckle
 * and the stone lattice come out of the SAME functions the straight run uses:
 *
 *   R, D, H     run (LINE_W / 2), depth, height — the box the family already is
 *   x0, yTop    where its run's far top corner sits, exactly as passed to `slab`
 *   w, h        one grid size for all sixteen states, so the hub is trivially
 *               the hub — the renderer allows states to differ in width but the
 *               anchor's Y must match, and one size makes that unarguable
 *   faces       { top, side, end } in the family's own vocabulary
 */
export function solidJoins(mask, spec) {
  const { R, D, H, x0, yTop, w, h, faces } = spec;
  const g = Array.from({ length: h }, () => new Array(w).fill('.'));

  const C = R / 2; // the tile centre along the run
  const Cb = D / 2; // ...and across it: the bar is D thick, centred here
  const HALF = R / 2; // half a tile, the reach of one arm

  // THE ARMS, in the family's own (a, b). The +tx pair laid end to end is the
  // straight bar the family already draws; the +ty pair is that same bar turned,
  // which is why its cross-section is D wide about the centre of the run.
  //
  // Each carries WHICH OF ITS TWO VERTICAL FACES ARE ON THE OUTSIDE of the
  // union, because the z-buffer cannot work that out for you. A face that abuts
  // another box of the same set is coplanar with its neighbour's interior, not
  // behind it, so nothing hides it and it draws a seam straight down the middle
  // of a solid bar. Visible on a run of four before this was made explicit.
  //
  //   `end`  is the face at a = a1, turned +tx (down-right)
  //   `side` is the face at b = b1, turned +ty (down-left)
  const ARM = {
    // +tx: its far end is outer only where the run STOPS.
    1: [C, R, 0, D, { end: !(mask & 1), side: true }],
    // +ty: turned, so its far end is the `side`. Same rule, other axis.
    2: [C - Cb, C + Cb, Cb, Cb + HALF, { end: true, side: !(mask & 2) }],
    // -tx: its +tx face always abuts the hub or the +tx arm. Never drawn.
    4: [0, C, 0, D, { end: false, side: true }],
    // -ty: likewise its +ty face.
    8: [C - Cb, C + Cb, Cb - HALF, Cb, { end: true, side: false }],
  };
  // The block at the crossing. Without it a bend is two arms that only touch at
  // a line, and the outer corner has nothing in it. Its two outward faces are
  // covered exactly when the arm that would cover them is present.
  const HUB = [C - Cb, C + Cb, 0, D, { end: !(mask & 1), side: !(mask & 2) }];

  const bits = [1, 2, 4, 8].filter((b) => mask & b);
  let use;
  if (bits.length <= 1) {
    // WHERE A RUN ENDS — the rule from HANDOFF-JOINING-AND-THE-CUBIC-HEDGE. A
    // piece with one neighbour or none draws BOTH arms of its axis, so a lone
    // piece and the end of a run fill their tile identically, by construction.
    use = bits.length && (bits[0] === 2 || bits[0] === 8) ? [ARM[2], ARM[8]] : [ARM[1], ARM[4]];
  } else {
    use = [HUB, ...bits.map((b) => ARM[b])];
  }

  /**
   * A CAP ONLY WHERE THERE IS NOTHING TO CUT IT.
   *
   * Where a neighbour stands, it buries the outward face — and drawing one
   * anyway is not merely wasted ink. The run-overlap guard in
   * test/joining.test.mjs measures how much of a piece its own neighbour
   * covers, and a gratuitous end cap took `hedge-low` from 5.1% to **22.6%**,
   * through a threshold set at 20% to catch a wall that was two tiles long.
   * The guard was right to refuse: ink that is always hidden is ink that lies
   * about the piece's extent.
   *
   * So a cap appears exactly where the run STOPS — the same rule, seen from
   * the other side, that makes a lone piece and the end of a run identical.
   */
  renderInto(
    g,
    use.map(([a0, a1, b0, b1, show]) =>
      box(a0, a1, b0, b1, 0, H, {
        top: faces.top,
        side: show.side ? faces.side : null,
        end: show.end ? faces.end : null,
      })
    ),
    { x0, yTop, lift: H }
  );
  return g;
}

/**
 * THE FAR TOP EDGE OF A SOLID, whatever plan it has.
 *
 * `slabBackEdge` draws a stroke one pixel above a straight bar's far edge so
 * the mass does not bleed into whatever stands behind it. It is indexed by run
 * position, which stops meaning anything the moment the plan can turn a corner.
 *
 * THE SILHOUETTE IS THE HONEST STATEMENT OF THE SAME THING: take the topmost
 * ink in each column and put the stroke one pixel above it. That follows a
 * straight, an L, a T and a cross for nothing, and — unlike shading the far
 * RANK of the top face — it does not paint a line down the length of the run.
 * The owner caught that immediately: *"the low hedges and the high hedges have
 * lines in the \ direction."* A constant value at constant depth IS a line down
 * the run.
 *
 * `nick` gets a say per column, and a skipped stroke is a bite out of the
 * silhouette that leaves the mass untouched — which is what a nick always was,
 * and why it cannot punch a hole through a piece the way an erased top-face
 * pixel did.
 */
export function outline(g, key, nick = null) {
  const h = g.length;
  const w = g[0].length;
  for (let x = 0; x < w; x++) {
    let top = -1;
    for (let y = 0; y < h; y++) {
      if (g[y][x] !== '.') {
        top = y;
        break;
      }
    }
    if (top < 1) continue;
    if (nick && nick(x, top - 1)) continue;
    g[top - 1][x] = key;
  }
  return g;
}

/**
 * THE COMMON SKIN: one ramp, lit from the upper left, which SPEC §3 fixes and
 * this module must not be the one place that argues with.
 *
 * `top` is the brightest because it faces the sky; `side` falls away down its
 * height; `end` is darkest, because in this projection it faces down-right and
 * away from the light. An `end` that reads as bright is the single fastest way
 * to make a solid look like folded paper — which is exactly what the hand-drawn
 * corner did by having no end face at all and letting the arm behind show.
 */
export function litSkin(ramp, { grain = null, height = 1 } = {}) {
  const n = ramp.length - 1;
  const pick = (v, x, y) => {
    let i = v;
    if (grain) i += grain(x, y);
    return ramp[Math.max(0, Math.min(n, Math.round(i)))];
  };
  return {
    top: (a, b, x, y) => pick(n - (b > 0 ? 0.3 : 0), x, y),
    side: (a, k, x, y) => pick(n - (k / Math.max(1, height)) * (n - 0.25), x, y),
    end: (b, k, x, y) => pick(n - 1 - (k / Math.max(1, height)) * (n - 1.25), x, y),
  };
}
