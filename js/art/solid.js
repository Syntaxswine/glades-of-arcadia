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
