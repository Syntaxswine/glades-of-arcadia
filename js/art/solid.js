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
export function renderInto(g, boxes, { x0, yTop, lift, zbuf: shared = null }) {
  const H = g.length;
  const W = g[0].length;
  // ONE Z-BUFFER FOR THE WHOLE PIECE, if the caller keeps it. A family drawn in
  // several passes — rails at two heights with turned balusters between them —
  // must resolve depth ACROSS the passes, or the top rail stops hiding what is
  // behind it the moment the two are rendered separately. Passing the buffer
  // back in also lets a pass that does not use this renderer at all (a
  // `revolve`, say) sit between two that do: it writes with a plain put, leaves
  // the buffer alone, and a later solid still wins wherever it has a surface.
  const zbuf = shared || new Float64Array(W * H).fill(-Infinity);
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

/**
 * AN EXTRUDED PROFILE — a shape stated in the vertical (a, c) plane and swept
 * across `b`. A barrel vault, an arch, a moulding, a run of coping.
 *
 * ---------------------------------------------------------------------------
 * WHY A BOX IS NOT ENOUGH, and the owner found the case:
 *
 *   *"ruined archway still has outdated graphics that are not in isometric
 *   perspective."*
 *
 * It was a flat 32 px picture of an arch drawn face-on to the viewer — a
 * croquet hoop standing in a garden that has depth everywhere else. An arch is
 * the one common building form with no axis-aligned parts: its ring is a
 * circle, so `box()` can only staircase it, and drawing the three faces by hand
 * is the exact mistake this module exists to stop anybody making again.
 *
 * So state the RING and let the sweep do the rest:
 *
 *   inside(a, c)   is there material at this point of the cross-section?
 *   b0, b1         how far the vault runs across the tile
 *   skin(a, c, b, near, x, y)   the palette key, or falsy for nothing
 *
 * `near` says the pixel is on the b = b1 end — the arch's own FACE, the part a
 * flat drawing gets right. Everything else is the swept surface: the extrados
 * where it turns to the sky, and the intrados seen through the opening on the
 * left, which is the whole reason to do this at all. The skin is handed the
 * cross-section coordinates, so an author who knows their own radius can shade
 * by it without this module needing to.
 *
 * MARCHED, NOT SOLVED. `renderInto` inverts each face in closed form because a
 * box has three flat ones; an arbitrary profile has no such inverse. So each
 * screen pixel walks its view ray from near to far and stops at the first
 * material — which is the same rule (largest `a + b + 2c` wins) arrived at by
 * search instead of algebra, and it is still PER SCREEN PIXEL, so the surface
 * still cannot come out with holes in it.
 * ---------------------------------------------------------------------------
 */
/**
 * ...AND IT KNOWS WHICH PLANE IT IS IN.
 *
 * A profile stated in (a, c) and swept across `b` builds an arch spanning +tx
 * and has no idea how to build one spanning +ty. That was fine while the only
 * customer was a free-standing archway, which simply mirrors; it is not fine
 * for an ARCADE, where a bay must be able to run either way and meet its
 * neighbour. So the sweep axis is a parameter:
 *
 *   axis 'tx'   profile(a, c), swept across b.   a = h + s,  c = h + 2s - v
 *   axis 'ty'   profile(b, c), swept across a.   b = s - h,  c = 2s - h - v
 *
 * Both fall out of the same two equations — x gives a - b = h, y gives
 * a + b - c = v — solved for whichever of the pair is the sweep parameter `s`.
 * Depth rises with `s` either way (3h + 6s - 2v and 6s - 3h - 2v), so the march
 * runs from b1/a1 down and stops at the first material in both.
 */
export function extrudeInto(g, part, { x0, yTop, lift, zbuf: shared = null }) {
  const { inside, b0, b1, skin, aRange, cRange, step = 0.25, axis = 'tx' } = part;
  const ty = axis === 'ty';
  const H = g.length;
  const W = g[0].length;
  const zbuf = shared || new Float64Array(W * H).fill(-Infinity);

  // The bounding box of the whole extrusion: the caller states how far its
  // profile reaches, which is cheaper and safer than probing `inside`.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  // `aRange` is the profile's own reach and `b0..b1` the sweep, whichever pair
  // of world axes those refer to — so swap them when the plane is (b, c).
  for (const p of aRange) {
    for (const q of [b0, b1]) {
      for (const c of cRange) {
        const a = ty ? q : p;
        const b = ty ? p : q;
        const x = x0 + 2 * a - 2 * b;
        const y = yTop + a + b + lift - c;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  minX = Math.max(0, Math.floor(minX) - 1);
  maxX = Math.min(W - 1, Math.ceil(maxX) + 1);
  minY = Math.max(0, Math.floor(minY) - 1);
  maxY = Math.min(H - 1, Math.ceil(maxY) + 1);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const h = (x - x0) / 2;
      const v = y - yTop - lift;
      for (let s = b1; s >= b0 - EPS; s -= step) {
        // 'tx': sweep b = s, so a = h + s and c = a + b - v = h + 2s - v.
        // 'ty': sweep a = s, so b = s - h and c = a + b - v = 2s - h - v.
        const p = ty ? s - h : h + s;
        const c = ty ? 2 * s - h - v : h + 2 * s - v;
        if (!inside(p, c)) continue;
        const depth = ty ? s + p + 2 * c : p + s + 2 * c;
        const i = y * W + x;
        if (depth > zbuf[i]) {
          const key = skin(p, c, s, s > b1 - EPS, x, y);
          if (key) {
            zbuf[i] = depth;
            g[y][x] = key;
          }
        }
        break;
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
  const { R, D, H, x0, yTop, w, h, faces, layers } = spec;
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
  //
  // EACH ARM ALSO CARRIES ITS OWN RUN PARAMETER `t`, and that is what makes a
  // post, a baluster or a column land in the right place on a piece that BENDS.
  // `t` runs 0..R across the tile whichever way the arm points, so a family
  // states its rhythm ONCE — "a column every eight units" — and every one of the
  // sixteen states places them by filtering that rhythm to the arms it has.
  // Indexing by screen run position instead is what put the balusters of a bent
  // balustrade along the +tx axis only, and a corner with posts down one leg and
  // a bare rail down the other is the second half of reading as a ribbon.
  const ARM = {
    // +tx: its far end is outer only where the run STOPS.
    1: [C, R, 0, D, { end: !(mask & 1), side: true }, 'tx', C, R],
    // +ty: turned, so its far end is the `side`. Same rule, other axis.
    2: [C - Cb, C + Cb, Cb, Cb + HALF, { end: true, side: !(mask & 2) }, 'ty', C, R],
    // -tx: its +tx face always abuts the hub or the +tx arm. Never drawn.
    4: [0, C, 0, D, { end: false, side: true }, 'tx', 0, C],
    // -ty: likewise its +ty face.
    8: [C - Cb, C + Cb, Cb - HALF, Cb, { end: true, side: false }, 'ty', 0, C],
  };
  // The block at the crossing. Without it a bend is two arms that only touch at
  // a line, and the outer corner has nothing in it. Its two outward faces are
  // covered exactly when the arm that would cover them is present.
  const HUB = [C - Cb, C + Cb, 0, D, { end: !(mask & 1), side: !(mask & 2) }, 'hub', C, C];

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
   * WHERE A RUN ACTUALLY TURNS, as opposed to merely having a hub box in it.
   *
   * Mask 5 is +tx and -tx: a mid-run piece. It uses the hub block, because the
   * hub is what makes its two arms one bar — but nothing about it turns, and a
   * newel post dropped at its centre would sit off the family's own rhythm and
   * make a piece in the middle of a straight run differ from a piece standing
   * alone. Only a mask holding a bit from BOTH axes has a corner to mark.
   */
  const turning = Boolean(mask & 5) && Boolean(mask & 10);

  const project = (a, b, c) => [x0 + 2 * a - 2 * b, yTop + a + b + H - c];
  const ctxOf = ([a0, a1, b0, b1, , axis, t0, t1], first, zbuf) => ({
    axis,
    a0,
    a1,
    b0,
    b1,
    t0,
    t1,
    mask,
    R,
    D,
    C,
    Cb,
    HALF,
    /** True when this piece actually TURNS — see `turning` above. */
    turning: Boolean(mask & 5) && Boolean(mask & 10),
    /**
     * True for the FIRST arm only, so a family can draw its one-per-tile parts
     * — an arcade's column stands at the tile centre whatever arms the piece
     * has, and `at(C)` is that centre on either axis.
     */
    first,
    /**
     * Everything an `extrudeInto` needs to join this piece's own z-buffer, so a
     * stud pass can sweep a profile — an arch — and have it resolve against the
     * boxes around it instead of painting over them.
     */
    frame: { x0, yTop, lift: H, zbuf },
    /**
     * The centre line of this arm at run position `t`, in world (a, b).
     *
     * The hub is a POINT, not a run, so it answers its own centre whatever it
     * is asked — a stud pass that hands it a `t` meant for an arm would
     * otherwise get `Cb - C`, which is half a tile out along +ty. That put the
     * corner newel outside the rail it is supposed to hold up, and it took a
     * probe that keyed each stud to its own character to see which of the two
     * things standing there was the misplaced one.
     */
    at: (t) => (axis === 'hub' ? [C, Cb] : axis === 'tx' ? [t, Cb] : [C, Cb + t - C]),
    project,
  });

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
  /**
   * LAYERS — because not everything linear is one slab from the ground up.
   *
   * A hedge is; a wall is. A BALUSTRADE is a rail at ankle height, a rail at
   * hand height, and turned stone between them, and a COLONNADE is the same
   * object built tall: posts carrying an entablature. Given only a single box
   * from c = 0 to c = H, those two can be drawn as solid walls or not at all,
   * which is why the balustrade was still composed from flat half-bars long
   * after everything around it had volume — and why it still read as a ribbon
   * at a bend when nothing else did.
   *
   * A layer is either
   *   { c0, c1, faces }   a box extruded along the plan, at its own height
   *   { studs(g, arm) }   a pass invoked ONCE PER ARM, for members that are
   *                       turned rather than extruded
   *
   * Balusters and column shafts are objects of revolution: they look the same
   * from every horizontal direction, so a bend does not need new art for them,
   * only new POSITIONS — which is exactly what the arm context hands over.
   *
   * The z-buffer is shared across every layer, so a top rail hides what stands
   * behind it whether that thing was drawn by this renderer or stamped in by a
   * stud pass. Order is the caller's: bottom up, studs where they belong.
   */
  const parts = layers || [{ c0: 0, c1: H, faces }];
  const zbuf = new Float64Array(w * h).fill(-Infinity);
  const frame = { x0, yTop, lift: H, zbuf };
  for (const part of parts) {
    if (part.studs) {
      // THE HUB CTX IS ALWAYS OFFERED NOW, and the family decides. A colonnade
      // wants a post at the crossing only where the run TURNS; an arcade wants
      // its column at the tile centre on every mask, because that is where the
      // arch springs from. `ctx.turning` and `ctx.first` are how each says so —
      // gating it here served the first customer and would have refused the
      // second.
      let first = true;
      for (const arm of use) {
        part.studs(g, ctxOf(arm, first, zbuf));
        first = false;
      }
      continue;
    }
    const skin = part.faces || faces;
    renderInto(
      g,
      use.map(([a0, a1, b0, b1, show]) =>
        box(a0, a1, b0, b1, part.c0, part.c1, {
          top: skin.top,
          side: show.side ? skin.side : null,
          end: show.end ? skin.end : null,
        })
      ),
      frame
    );
  }
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
