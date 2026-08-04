// decor.js — the decor layer. DECOR.md Part II.
//
// Everything here is FURNITURE. It argues about nothing; it is placed because
// it looks right. That is the whole point of the layer: if every object carried
// a zoning consequence, placing would become anxious and the player would
// optimise instead of decorate.
//
// ---------------------------------------------------------------------------
// THE ONE THING THAT MATTERS: THIS IS ONE GARDEN.
//
// A bench, an urn and a round temple drawn by three different hands do not make
// a set, they make a junk shop. So the pieces are not authored one at a time —
// a small VOCABULARY is authored first, and every piece is assembled out of it:
//
//   * revolve()  — anything turned on a wheel or a lathe (amphora, krater, urn,
//                  cache-pot, column shaft, fountain stem, obelisk taper) is a
//                  half-width PROFILE swept about a vertical axis and lit by
//                  one function, roundKey(). One highlight law, everywhere.
//   * roundKey() — the rounded-form law from props.js written down once: on a
//                  turned solid the highlight sits about a third in from the
//                  LIT edge, never on the edge. It also cuts the FLUTES, which
//                  is why the flutes on the urn and the flutes on the Doric
//                  shaft are the same flutes at the same pitch.
//   * drum()     — anything circular seen from above (fountain tier, birdbath
//                  bowl, tholos step, jet basin) is a lit elliptical top face
//                  plus a shaded cylindrical band. 2:1, so ry = rx/2 always.
//   * plinth()   — the moulded square base under every standing thing: cornice
//                  overhanging by one, a die, a base overhanging by one.
//   * slab()     — everything LINEAR (bench seat, balustrade rail, hedge,
//                  rill, colonnade architrave) is a parallelogram running
//                  along the +tx axis at 2 across per 1 down, 32 px per tile,
//                  with real WIDTH across the run, so pieces butt into runs
//                  without a gap and none of them reads as a plank.
//   * steps()    — one step profile: 4 px tread, 4 px riser. The stone stair,
//                  the tholos crepidoma, the exedra base and the stepped
//                  terrace wall all climb with the same tread.
//
// If a future piece is added and it does not use these, it will not belong.
//
// ---------------------------------------------------------------------------
// THE REGISTER SPLIT (DECOR.md Part II) is carried by RAMP and by EDGE:
//
//   neoclassical  marble ABCDE   fluted, symmetric, dressed, mouldings,
//                                every edge a clean 2-px iso step
//   archaic       rock   vwxy    rough, asymmetric, weathered, no mouldings,
//                 earth  qrstu   edges deliberately notched off the true line
//
// A player should be able to name a region's register from across the map
// without reading a word. Marble = pale and clipped; rock = dark and ragged.
//
// ---------------------------------------------------------------------------
// Conventions inherited from props.js, unchanged:
//   * light from the UPPER LEFT; top face ramp[4], left face ramp[3], right
//     face ramp[1..2], outline ramp[0] — never black,
//   * contact skirt baked in the GRASS ramp as 'm' so the renderer's
//     variant({grass:'earth'}) lands it correctly on soil for free,
//   * anchor = the pixel on the footprint's centre point, given as
//     [dx, upFromBottom] for typed sprites so adding a row cannot move an
//     object's feet.
//
// DOM-free and dependency-free; imports cleanly in Node.

import {
  defineSprite,
  padToAnchor,
  foot,
  groundFoot,
  LINE_W,
  LINE_DROP,
  slab,
  slabFace,
  slabBackEdge,
  slabBackEdgeY,
  slabEndFace,
  linearJoins,
  axialJoins,
} from './format.js';
import { variant } from '../palette.js';
import { LEVEL_H, GROUND_ELLIPSE } from '../iso.js';

// ===========================================================================
// Authoring plumbing
// ===========================================================================

/** Typed sprite: anchor as [dx, upFromBottom], rows padded to the widest. */
function sprite(name, [dx, up], rows, opts = {}) {
  const w = Math.max(...rows.map((r) => r.length));
  return defineSprite({
    name,
    anchor: [((w - 1) >> 1) + dx, rows.length - 1 - up],
    rows: rows.map((r) => r.padEnd(w, '.')),
    footprint: opts.footprint || [1, 1],
    tags: opts.tags || [],
    cycle: opts.cycle || null,
  });
}

/** Generated sprite: the grid already knows exactly where its anchor is. */
function spriteAt(name, [ax, ay], g, opts = {}) {
  // NO CONTACT SHADOW IS BAKED HERE. It used to be, opt-in per sprite via
  // `contact: r`, and the reasoning for making it opt-in was sound: a blanket
  // rule would have put a dark ring around every PAVING tile in this file —
  // gravel walk, flagstone, terrace paving — which lie IN the ground plane
  // rather than standing on it, and no predicate separates the two.
  //
  // What that reasoning could not reach is that 'm' is GRASS[0], so a baked
  // shadow is grass-green wherever the object stands. render.js now draws the
  // contact pass itself, sized from the art and coloured from the tile beneath,
  // and it needs no per-sprite declaration at all: an object that stands on the
  // ground casts a shadow because it has a base, and a paving tile does not
  // because it has none. The predicate that did not exist in the art turned out
  // to exist in the scene.
  const rows = g.map((r) => r.join(''));
  const w = Math.max(...rows.map((r) => r.length));
  return defineSprite({
    name,
    anchor: [ax, ay],
    // The grids here are built to a declared height, but `skirt()` used to GROW
    // them past it, and a few anchors were placed in the rows it added. Now that
    // it is gone those anchors would fall outside the sprite — the same
    // "the art shrank past the anchor" as stripping a band. See padToAnchor.
    rows: padToAnchor(rows.map((r) => r.padEnd(w, '.')), ay),
    footprint: opts.footprint || [1, 1],
    tags: opts.tags || [],
    cycle: opts.cycle || null,
    // The view from the other side, when this object has one. See
    // format.js §defineSprite and js/iso.js §FACING.
    back: opts.back || null,
  });
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function grid(w, h) {
  return Array.from({ length: h }, () => new Array(w).fill('.'));
}
function put(g, x, y, k) {
  x = Math.round(x);
  y = Math.round(y);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = k;
}
function peek(g, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  return y >= 0 && y < g.length && x >= 0 && x < g[0].length ? g[y][x] : '.';
}
function hline(g, x0, x1, y, k) {
  for (let x = Math.round(x0); x <= Math.round(x1); x++) put(g, x, y, k);
}
function vline(g, x, y0, y1, k) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) put(g, x, y, k);
}

/** Deterministic 0..1 noise. Nothing in this file is random at runtime. */
function hash(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

// ===========================================================================
// THE FAMILY VOCABULARY
// ===========================================================================

export const MARBLE = 'ABCDE'; // neoclassical: dressed, fluted, clipped
export const ROCK = 'vwxy'; //  archaic: rough, weathered, asymmetric
export const EARTH = 'qrstu'; // timber and raw soil
export const TERRA = 'PQRS'; //  terracotta vessels
export const YEW = 'jkl'; //     tall clipped hedge — dark, cool, dense
export const BOX = 'abcde'; //   low clipped hedge — lighter, warmer

/**
 * THE ROUNDED-FORM LAW, written down once.
 *
 * props.js states it in prose: on a rounded form the highlight sits about a
 * third of the way in from the LIT edge, not on the edge itself. Every turned
 * object in this file is lit by this one function, which is most of the reason
 * the urn and the column shaft look related.
 *
 * `flutes` is the groove pitch in pixels — pass 3 and the same flute appears on
 * the same 3 px pitch whether it is cut in a shaft, an urn or a pilaster.
 */
function roundKey(dx, rx, ramp = MARBLE, flutes = 0) {
  const n = ramp.length - 1;
  const t = (dx + rx) / (2 * rx); // 0 at the lit edge, 1 at the shadow edge
  const d = t - 0.3;
  const g = d < 0 ? d / 0.3 : d / 0.7;
  // Exponent BELOW 1 on purpose. The first pass used 1.35, which flattens the
  // curve near the peak and spreads the highlight over half the form: every
  // turned object came out pale and soft, which is exactly props.js's stated
  // marble fault ("never too little highlight, always too little DARK"). 0.9
  // narrows the highlight to a third of the width and hands the rest to the
  // shadow side, where it belongs.
  let v = n - Math.abs(g) ** 0.9 * (d < 0 ? 2.6 : 4.2) * (n / 4);
  if (flutes) {
    // A flute is a HOLLOW with an ARRIS beside it. Cutting only the hollow
    // (the first pass) gives a faint stripe that vanishes at 1x; cutting the
    // hollow and lifting the ridge next to it doubles the local contrast for
    // one extra line of code, and that is what makes fluting survive.
    const ph = ((Math.round(dx + rx) % flutes) + flutes) % flutes;
    if (ph === flutes - 1) v -= 1.3;
    else if (ph === 0) v += 0.6;
  }
  return ramp[clamp(Math.round(v), 0, n)];
}

/** roundKey's index, before it is turned into a key — so a caller can clamp
 *  the result into part of a ramp (the exedra's shaded inner face does). */
function roundKeyIndex(dx, rx, n) {
  const t = (dx + rx) / (2 * rx);
  const d = t - 0.3;
  const gg = d < 0 ? d / 0.3 : d / 0.7;
  return n - Math.abs(gg) ** 0.9 * (d < 0 ? 2.6 : 4.2) * (n / 4);
}

/** A flat horizontal face: brightest to the upper left, one step down to the
 *  lower right. Used for every top face — plinth caps, basin rims, treads. */
function discKey(dx, dy, rx, ry, ramp = MARBLE) {
  const n = ramp.length - 1;
  const s = -(dx / Math.max(1, rx)) * 0.5 - (dy / Math.max(1, ry)) * 0.5;
  return ramp[clamp(n - (s < -0.45 ? 1 : 0), 0, n)];
}

/**
 * Sweep a half-width profile about a vertical axis. The workhorse: amphora,
 * krater, urn, cache-pot, column shaft, fountain stem, topiary sphere.
 */
function revolve(g, cx, y0, profile, opts = {}) {
  const { ramp = MARBLE, flutes = 0, outline = true } = opts;
  profile.forEach((hw, i) => {
    if (hw <= 0) return;
    const y = y0 + i;
    for (let dx = -hw; dx <= hw; dx++) put(g, cx + dx, y, roundKey(dx, hw + 0.5, ramp, flutes));
    if (outline) {
      put(g, cx - hw, y, ramp[0]);
      put(g, cx + hw, y, ramp[0]);
    }
  });
}

/**
 * A circular member seen from above: a lit elliptical top face plus the shaded
 * cylindrical band under it. ALWAYS 2:1 — ry is rx/2 and nothing here may
 * choose otherwise, because the ground plane is foreshortened 2:1.
 *
 * Returns the y of the front-most bottom pixel so callers can stack.
 */
function drum(g, cx, cy, rx, h, opts = {}) {
  const { ramp = MARBLE, top = null, side = null, flutes = 0, rim = false } = opts;
  const ry = Math.max(1, Math.round(rx / 2));
  // Top face.
  for (let dy = -ry; dy <= ry; dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t <= 0) continue;
    const hw = Math.round(rx * Math.sqrt(t));
    for (let dx = -hw; dx <= hw; dx++) {
      put(g, cx + dx, cy + dy, top ? top(dx, dy, hw) : discKey(dx, dy, rx, ry, ramp));
    }
    put(g, cx - hw, cy + dy, ramp[0]);
    put(g, cx + hw, cy + dy, ramp[0]);
  }
  // Cylindrical side, front arc only — the back is hidden by the top face.
  if (h > 0) {
    for (let dx = -rx; dx <= rx; dx++) {
      const t = 1 - (dx * dx) / (rx * rx);
      if (t < 0) continue;
      const front = cy + ry * Math.sqrt(t);
      for (let k = 1; k <= h; k++) {
        const key = side ? side(dx, k) : roundKey(dx, rx, ramp, flutes);
        put(g, cx + dx, front + k, key);
      }
      put(g, cx + dx, front + h, ramp[0]);
    }
    put(g, cx - rx, cy, ramp[0]);
    put(g, cx + rx, cy, ramp[0]);
  }
  if (rim) {
    // A 1 px darker line where the top face turns over the edge — the tiny
    // detail that separates a dressed rim from a painted circle.
    for (let dx = -rx; dx <= rx; dx++) {
      const t = 1 - (dx * dx) / (rx * rx);
      if (t < 0) continue;
      put(g, cx + dx, cy + ry * Math.sqrt(t), ramp[1]);
    }
  }
  return Math.round(cy + ry + h);
}

/**
 * The moulded square base under every standing thing. Cornice overhangs the
 * die by one pixel each side, base by two: that pair of overhangs is the single
 * most recognisable "this is neoclassical garden furniture" cue at 20 px, and
 * it costs four rows.
 *
 *   rows, top to bottom:  cap top face / cap / cap underside / die... / base
 *                         ...then THE FOOT, below the anchor
 *
 * ---------------------------------------------------------------------------
 * THE FOOT LIES IN THE GROUND PLANE, which is the whole of step 4.
 *
 * This used to end `'.' + R[0].repeat(w - 2) + '.'` — a flat row, the block cut
 * off square. Twelve of the twenty-nine sprites the iso audit flags come from
 * this one line, and nobody had seen it for months because every one of them
 * had a baked grass-green skirt stamped over the top (step 3 deleted those).
 *
 * A plinth is a SQUARE BLOCK. The bottom of a square block's silhouette is the
 * front half of its base square, and a square in the ground plane is a diamond
 * exactly twice as wide as it is tall — so the foot runs down 1-in-2 from each
 * side to a front vertex `(w-2)/4` rows below the anchor. That is the same
 * geometry `GROUND_ELLIPSE` states for a circle; a block and a cylinder differ
 * in the CORNERS, not in the foreshortening.
 *
 * IT IS A DIAMOND AND NOT AN ELLIPSE, deliberately. A column plinth is square,
 * and rounding it to hide a flat edge would be answering the audit rather than
 * the object — a different lie, and one the audit cannot tell from the truth.
 * Round feet (the pithos, the tree boles, the basins) get ellipses instead.
 *
 * THE ANCHOR DOES NOT MOVE. `plinthH` still counts to the last row ABOVE the
 * foot, because the anchor is the centre of the base diamond, not its lowest
 * pixel — so every call site that stacks on `base + plinthH(k)` is unchanged
 * and the object stands exactly where it did. The foot hangs below it, which is
 * what the front half of a diamond does.
 */
function plinth(w, dieH, ramp = MARBLE, flutes = 0) {
  const R = ramp;
  const n = R.length - 1;
  const body = (ww, fl) => {
    let s = '';
    for (let x = 0; x < ww; x++) s += roundKey(x - (ww - 1) / 2, ww / 2, R, fl);
    return R[0] + s.slice(1, -1) + R[0];
  };
  const inset = (row, k) => '.'.repeat(k) + row + '.'.repeat(k);
  const out = [];
  out.push(inset(R[0] + R[n].repeat(w - 2) + R[0], 0)); // cap top face
  out.push(R[0] + body(w - 2, 0).slice(1, -1) + R[0]);
  out.push(R[0] + R[2].repeat(w - 4) + R[1] + R[1] + R[0]); // cap underside
  for (let i = 0; i < dieH; i++) out.push(inset(body(w - 4, flutes), 2));
  out.push(inset(R[0] + R[n].repeat(w - 4) + R[0], 2));
  out.push(R[0] + body(w - 2, 0).slice(1, -1) + R[0]);
  out.push(R[0] + R[1].repeat(w - 2) + R[0]);
  out.push(...foot(w - 2, R, 1));
  return out;
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
/**
 * A member running along the +tx axis. One tile step is 32 px across and 16 px
 * down, so everything linear steps 1 down per 2 across and a sprite drawn 33
 * wide (one column of overlap) butts into a run with no seam.
 *
 * BOTH NOW LIVE IN format.js and are re-exported here, not copied — see the
 * note there. extras.js drew the palisade fence to its own private slope and
 * its own private run length, and got both wrong; a constant that two modules
 * need is a constant that must have one home.
 */
export { LINE_W, LINE_DROP };

// slab / slabFace / slabBackEdge NOW LIVE IN format.js, beside LINE_W and
// LINE_DROP, and for the same reason: they state a fact about the projection.
// props.js drew the drystone wall's top by hand and got a ribbon. See the note
// there.

/**
 * The step profile. ONE riser for the whole set, so a flight climbs exactly
 * one level (16 px, ELEVATION.md) in four steps and lands on the next tile.
 * The stone stair, the tholos crepidoma, the stepped terrace wall and the
 * flight let into it all measure themselves against this number.
 */
export const RISER = 4; // 4 px of tread, 4 px of riser: four of them is one
//                         level (ELEVATION.md's LEVEL_H = 16), exactly.

// ===========================================================================
// GARDEN FURNITURE
// ===========================================================================

/**
 * Stone bench, plain. The most ordinary object in the set, and therefore the
 * one that has to establish the vocabulary: a slab() seat on two plinth()
 * blocks, running along the tx axis like every other linear piece.
 */
function benchGrid() {
  const DEPTH = 6;
  const X0 = 2 * DEPTH + 2;
  const g = grid(X0 + LINE_W + 3, 40);
  const TOP = 4;
  // Legs first, so the slab draws over them. Each is a little plinth of its
  // own — the same cornice-and-base moulding as everything else, at a tenth
  // of the size — set back 2 units so it reads as UNDER the seat.
  for (const i of [4, 25]) {
    const lx = X0 + i - 2 * (DEPTH - 2);
    const ly = TOP + LINE_DROP(i) + (DEPTH - 2) + 6;
    for (let k = 0; k < 12; k++) {
      const w = k < 1 || k > 9 ? 11 : 9;
      const x = lx + (w === 11 ? -1 : 0);
      for (let j = 0; j < w; j++) put(g, x + j, ly + k, roundKey(j - (w - 1) / 2, w / 2 + 0.5, MARBLE));
      put(g, x, ly + k, 'A');
      put(g, x + w - 1, ly + k, 'A');
      if (k === 0 || k === 10) hline(g, x + 1, x + w - 2, ly + k, 'E');
    }
  }
  // The seat: one slab, with the two joints a mason would leave in a 3 m bench.
  slabBackEdge(g, X0, TOP, LINE_W, 'A');
  slab(g, X0, TOP, LINE_W, DEPTH, (a, b) => {
    const seam = Math.abs((a - 5.5) % 5.5) < 0.3 && a > 4;
    if (seam) return 'C';
    return b < 1 ? 'D' : 'E';
  });
  slabFace(g, X0, TOP, LINE_W, DEPTH, 4, (i, k) => (k === 3 ? 'A' : k === 0 ? 'D' : 'C'));
  return g;
}
export const STONE_BENCH = spriteAt('stone-bench', [16, 30], benchGrid(), {
  tags: ['decor', 'furniture', 'marble', 'neoclassical', 'seat'],
});

/**
 * EXEDRA — the curved semicircular bench, and the most neoclassical object any
 * garden owns. It is a half-drum: the back wall is the far arc of a cylinder,
 * the seat is the elliptical annulus inside it, and the whole thing stands on
 * one step of the family tread.
 *
 * Authored in the ROCK ramp so that the marble bench DECOR.md asks for is
 * literally free — see EXEDRA_MARBLE below, which is this sprite through
 * variant({ rock: 'marble' }) and not one new pixel.
 */
function exedraGrid(ramp = ROCK) {
  const W = 66;
  const H = 32;
  const g = grid(W, H);
  const cx = 32;
  const SEAT = 20;
  const RX = 29;
  const RY = 10; // FLATTER than 2:1 on purpose — see the note below
  const WALL = 9;
  const DEPTH = 7; // a NARROW seat band
  const n = ramp.length - 1;
  const A0 = 203;
  const A1 = 337;

  // Four attempts at this object, and the thing that finally made it read is
  // not shading, it is EMPTINESS. An exedra whose interior is filled in — with
  // a deep seat, with a base pad, with anything — is a bathtub, no matter how
  // the values are arranged, because a closed elliptical outline IS a vessel.
  // So: a narrow seat band, a low back, a 134-degree arc rather than a near
  // half-circle, and the whole middle left transparent so the lawn shows
  // through it. The ellipse is also flattened below 2:1, which reads as a
  // curve seen nearly edge-on rather than as a rim seen from above.
  for (let a = A0 - 4; a <= A1 + 4; a += 0.3) {
    const th = (a * Math.PI) / 180;
    for (let r = RX - DEPTH; r <= RX; r += 0.4) {
      const x = cx + r * Math.cos(th);
      const y = SEAT + r * (RY / RX) * Math.sin(th);
      const near = (RX - r) / DEPTH;
      // The wall's cast shadow along the back of the seat, then the seat top.
      put(g, x, y, near < 0.22 ? ramp[1] : ramp[n]);
    }
    const ri = RX - DEPTH;
    const xi = cx + ri * Math.cos(th);
    const yi = SEAT + ri * (RY / RX) * Math.sin(th);
    put(g, xi, yi + 1, ramp[1]); // the seat's front edge: a slab has thickness
    put(g, xi, yi + 2, ramp[1]);
    put(g, xi, yi + 3, ramp[0]);
  }

  // Back wall: low, dark, lit the OTHER way round because it is a concave
  // inner face. That inversion is the one cue that says "a curve you sit in".
  for (let a = A0; a <= A1; a += 0.25) {
    const th = (a * Math.PI) / 180;
    const x = cx + RX * Math.cos(th);
    const foot = SEAT + RY * Math.sin(th);
    for (let k = 1; k <= WALL; k++) {
      // Clamped into the MIDDLE of the rock ramp, not its bottom. Against the
      // grass ramp, rock 0-1 reads as a hole in the lawn — in the first scene
      // test the exedra was the one object that disappeared into a silhouette.
      const v = clamp(Math.round(roundKeyIndex(-(x - cx), RX, n)), 1, n - 1);
      put(g, x, foot - k, ramp[v]);
    }
    put(g, x, foot - WALL - 1, ramp[n]); // a thin lit cap, never a bright rim
    put(g, x, foot - WALL - 2, ramp[0]);
  }

  // The arms: solid end blocks with a visible OUTER face, which is what breaks
  // the elliptical silhouette and lets the eye read a wall rather than a rim.
  for (const a of [A0, A1]) {
    const th = (a * Math.PI) / 180;
    const x0 = cx + RX * Math.cos(th);
    const foot = SEAT + RY * Math.sin(th);
    const dir = Math.cos(th) < 0 ? -1 : 1;
    for (let w = 0; w <= 4; w++) {
      const x = x0 + w * dir;
      for (let k = -WALL - 1; k <= 6; k++) {
        put(g, x, foot + k, ramp[dir < 0 ? clamp(3 - w, 1, n) : clamp(w > 2 ? 1 : 2, 1, n)]);
      }
      put(g, x, foot - WALL - 2, ramp[0]);
      put(g, x, foot - WALL - 1, ramp[n]);
      put(g, x, foot + 7, ramp[0]);
    }
  }
  return g;
}

export const EXEDRA = spriteAt('exedra', [32, 26], exedraGrid(), {
  tags: ['decor', 'furniture', 'stone', 'neoclassical', 'seat'],
});

/**
 * EXEDRA IN MARBLE — and a second, complete run at the object, because the
 * first one does not work and this is worth writing down.
 *
 * WHAT THE OLD ONE ACTUALLY READS AS. Rendered through the marble ramp, at
 * 7x, on the lawn: a BRIDGE. Two piers at the ends, a curved span between
 * them, and the seat reading as the roadway. Three separate faults compound
 * into that, and the note above it — "emptiness is what made it read" — is a
 * true observation about a different fault, which is why it did not catch
 * these:
 *
 *  1. IT IS FLATTER THAN THE GROUND PLANE. RY/RX is 1:2.9 where the world is
 *     1:2. An ellipse flatter than the projection is not a curve seen from
 *     above, it is a curve seen from the SIDE — so the seat has almost no top
 *     surface, and a bench with no visible seat is a wall.
 *  2. THE ARMS ARE FREE-STANDING. Drawn as tall blocks with air either side,
 *     they stop being the ends of a wall and become piers, and two piers under
 *     a curved span is a viaduct in any language.
 *  3. THERE IS NO DARK. The whole object lives in ramp 2-4. The catalogue's own
 *     blurb for this entry says it outright — "Marble is a value problem before
 *     it is a colour one: what sells it is the dark under the seat, not the
 *     light on top" — and there was no dark under the seat because there was
 *     nothing under the seat at all.
 *
 * So this one is built from the structure outward, in four rings at three
 * heights, on the projection's own 2:1:
 *
 *     r = RX          the back wall, rising WALL_H above the ground ellipse
 *     r = RX - T      its concave INNER face, which is what a viewer sees
 *     r = SEAT..Ri    the seat, an annulus at SEAT_H, in shadow along the wall
 *     r = SEAT        the apron under the seat, falling to the ground — DARK
 *
 * and the whole interior of the circle in front of the apron is left
 * transparent, so the lawn runs into the curve and the piece still passes the
 * emptiness test the first one was written for.
 *
 * THE ONE CUE THAT DOES ALL THE WORK is that a concave face inverts the light.
 * The inner surface of the back wall faces INWARD, so its left-hand end faces
 * east and is dark while its right-hand end faces west and is lit — the exact
 * opposite of every convex thing in this file. The arms then reverse again on
 * their outer faces (left arm lit, right arm dark). Left-dark-then-light, then
 * light-outside-left and dark-outside-right, is a shape the eye can only
 * resolve as something you sit INSIDE.
 *
 * Authored in MARBLE, so `variant({ marble: 'rock' })` — the `weathered`
 * resolver already in this file — is a stone one for nothing.
 */
function exedraMarbleGrid(ramp = MARBLE) {
  // THE PODIUM IS NOT DECORATION, IT IS THE FOOTPRINT.
  //
  // The catalogue gives this piece 2x2, and a 2x2 footprint is a claim to fill
  // 128 x 64 pixels of ground — test/sprite-anchors.test.mjs checks exactly
  // that and it caught this sprite floating thirty pixels above its own front
  // vertex. The honest fix is not to move the anchor (that drops the object on
  // the grass and leaves it sitting in the back half of its plot); it is to
  // give the exedra the thing every real one stands on, which is a stepped
  // platform. Two of the family's 4 px treads, inset ten world pixels each,
  // and the arithmetic is a small gift: the second tread's diamond is 88 x 44,
  // which is exactly the 2 * RX by 2 * RY of the seat ring that stands on it.
  const W = 132;
  const H = 92;
  const g = grid(W, H);
  const cx = 66;
  const AY = 56; //     the anchor row: the footprint diamond's own centre
  const cy = AY - 8; // the exedra's ground plane, on top of two treads
  const RX = 44;
  const RY = 22; // EXACTLY RX/2. The ground plane is 2:1 and so is this.
  const T = 6; //   the wall's thickness
  const Ri = RX - T;
  const SEAT = RX - 19; // the seat's inner radius: a real 13 px of sitting
  const WALL_H = 18; //   a LOW back. An exedra you cannot see over is an apse
  const SEAT_H = 9;
  const n = ramp.length - 1;
  const K = (v) => ramp[clamp(Math.round(v), 0, n)];

  // The back arc, exactly a half circle, drawn left to right. Everything is a
  // function of the angle, and the two ends land on the arms.
  const STEP = 0.25;
  const yOf = (a, r) => cy + RY * (r / RX) * Math.sin((a * Math.PI) / 180);
  const xOf = (a, r) => cx + r * Math.cos((a * Math.PI) / 180);

  // ---- the podium, first and underneath everything -------------------------
  for (let k = 0; k <= 2; k++) {
    const HW = 64 - k * 10;
    const HH = HW / 2;
    const top = AY - k * RISER;
    for (let dy = -HH; dy <= HH; dy++) {
      const run = HW * (1 - Math.abs(dy) / HH);
      for (let dx = -run; dx <= run; dx++) put(g, cx + dx, top + dy, K(1.6 + k * 0.35));
      put(g, cx - run, top + dy, K(0.6));
      put(g, cx + run, top + dy, K(0.6));
    }
    // The riser under this tread's two FRONT edges. k = 0's riser is the
    // ground itself, so it gets a contact skirt instead of a face.
    if (k === 0) continue;
    // ITERATE THE COLUMNS, NOT THE ROWS. A diamond edge steps two across per
    // one down, so walking `dy` and dropping a riser at the two edge pixels
    // leaves every other column empty: the podium came out as a picket fence
    // of four-pixel staves round its own front. A face is continuous in x.
    for (let x = cx - HW; x <= cx + HW; x++) {
      const dy = HH * (1 - Math.abs(x - cx) / HW);
      for (let j = 0; j < RISER; j++) {
        put(g, x, top + dy + 1 + j, K(j === RISER - 1 ? 0.3 : x < cx ? 1.5 : 0.9));
      }
    }
  }

  // ---- the ground contact ---------------------------------------------------
  // ONLY a skirt, hugging the foot of the apron. The first pass laid it over
  // the whole annulus from the seat's inner radius out to the wall, and since
  // the apron is only nine pixels tall the rest of that crescent stayed
  // uncovered: the exedra came out standing on a slab of dark green, which
  // reads as a shadow puddle, not as contact.
  // ONE ROW of it, and one radial pixel wide. Take four ran it three radial
  // pixels deep, which on the flat back of the ellipse is three whole ROWS of
  // dark green laid end to end across the arc — and a dark curved band with
  // lawn inside it and a pale mass on top is an ARCH. Between that and the
  // dark line at the apron's foot the piece had four rows of black describing
  // a semicircular opening, which is a bridge however the top is drawn.
  // AND IT IS MARBLE, not turf. The exedra stands on its own podium now, so a
  // contact shadow in the grass ramp is a green line drawn across a stone
  // floor: the shadow of a thing always belongs to the ramp of what it falls
  // ON, which is the same rule that makes the grass skirts elsewhere in this
  // file work when the renderer swaps grass for earth.
  for (let a = 178; a <= 362; a += STEP) {
    for (let r = SEAT - 1; r <= SEAT; r += 0.5) put(g, xOf(a, r), yOf(a, r) + 1, K(0.8));
  }

  // ---- the apron under the seat -------------------------------------------
  // A concave face, so it lights BACKWARD like everything else on the inside
  // of this curve.
  for (let a = 180; a <= 360; a += STEP) {
    const lit = (Math.cos((a * Math.PI) / 180) + 1) / 2; // 0 left, 1 right
    const x = xOf(a, SEAT);
    const y0 = yOf(a, SEAT);
    for (let k = 0; k <= SEAT_H; k++) {
      // THE APRON IS NOT THE DARK. This is take four and the correction that
      // finally moved the piece: nine rows of dark marble under the seat draws
      // a black ARCH with lawn under it, and an arch with two piers is a
      // bridge no matter what is on top of it. The dark the catalogue's blurb
      // asks for is the seat's own shadow, which is ONE ROW, immediately under
      // the nose. Everything below that is a plinth and takes the light like
      // every other plinth in this file — brightest at the top, falling away,
      // and standing on a base moulding.
      const up = k / SEAT_H;
      let v;
      if (k === SEAT_H) v = 0.0; //           the shadow under the seat's nose
      else if (k === 0) v = 1.4; //           where it meets the turf
      else if (k === 1) v = 2.0 + lit * 0.6; // the base moulding
      else v = 0.9 + lit * 1.5 + up * 0.7;
      put(g, x, y0 - k, K(v));
    }
  }

  // ---- the wall's inner face ----------------------------------------------
  for (let a = 180; a <= 360; a += STEP) {
    const lit = (Math.cos((a * Math.PI) / 180) + 1) / 2;
    const x = xOf(a, Ri);
    const y0 = yOf(a, Ri);
    for (let k = SEAT_H; k <= WALL_H; k++) {
      // Up the face: darkest in the angle where it meets the seat, opening out
      // toward the cap. A flat inner face reads as a painted band.
      const rise = (k - SEAT_H) / (WALL_H - SEAT_H);
      // KEPT OFF THE TOP OF THE RAMP. The inner face and the seat top were
      // both reaching ramp 3-4 and the piece came out as a half dome with
      // concentric bands — every ring the same value, so nothing was a
      // surface. A vertical face may not out-value a horizontal one: the seat
      // owns 3 and 4, the face owns 1 to 2.6, and that ordering is the reason
      // the eye reads a floor with a wall behind it.
      let v = 0.0 + lit * 1.95 + rise * 0.45;
      if (rise < 0.16) v -= 0.9; // the seat's own shadow in the angle
      // The JOINTS. A curved wall is built of wedge-shaped blocks and a mason
      // would set nine of them in a half circle; drawn, they are the piece's
      // only claim to being dressed rather than moulded, and they cost one
      // recessed pixel with a lit one beside it — the same recessed-joint-plus-
      // arris the dressed wall in art/tiles.js uses.
      const seg = ((a - 180) / 20) % 1;
      if (seg < 0.055) v -= 1.4;
      else if (seg < 0.13) v += 0.7;
      put(g, x, y0 - k, K(v));
    }
  }

  // ---- the seat, an annulus at SEAT_H, and its front edge ------------------
  for (let a = 180; a <= 360; a += STEP) {
    for (let r = SEAT; r <= Ri; r += 0.5) {
      const x = xOf(a, r);
      const y = yOf(a, r) - SEAT_H;
      // A horizontal face is the brightest thing here — EXCEPT in the band the
      // wall shadows, which is four pixels wide and two steps down and is what
      // makes the seat look like it is set into the curve rather than laid
      // across it.
      const back = (r - SEAT) / (Ri - SEAT);
      let v = n - (back > 0.84 ? 2.2 : back > 0.70 ? 1.0 : 0);
      // The light still falls from the upper left across a flat face.
      v -= (Math.cos((a * Math.PI) / 180) + 1) / 2 > 0.62 ? 0.4 : 0;
      put(g, x, y, K(v));
    }
    // The seat's own thickness at the front — a slab has an edge.
    const x = xOf(a, SEAT);
    const y = yOf(a, SEAT) - SEAT_H;
    put(g, x, y + 1, K(1.2));
    put(g, x, y + 2, K(0.3));
  }

  // ---- the coping: the wall's flat top, and a dark outer arris -------------
  // Deliberately ONE STEP BELOW THE SEAT. Two horizontal faces at the top of
  // the ramp put the brightest value in two concentric rings and the object
  // read as a half dome; the seat has to be the brightest thing an exedra
  // owns, because it is the thing the object is for.
  for (let a = 179; a <= 361; a += STEP) {
    for (let r = Ri; r <= RX; r += 0.5) {
      put(g, xOf(a, r), yOf(a, r) - WALL_H, K(n - 1 - (r > RX - 1.6 ? 1 : 0)));
    }
    put(g, xOf(a, RX), yOf(a, RX) - WALL_H - 1, K(0));
  }

  // ---- the arms: the wall's ENDS, squared off, on the family plinth --------
  // Drawn as the same moulded pier as everything else that stands up in this
  // file, and set so the wall runs INTO them: no air between arm and arc, which
  // is the whole difference between an end and a pier.
  // SIZED TO THE WALL IT ENDS. Take four made the arm sixteen pixels across
  // and sat it four pixels further in than the wall's own inner face, so the
  // arm painted OVER the darkest stretch of that face — the left-hand end,
  // which is the whole concave-inversion cue — and the piece lost the one
  // thing telling the eye it was looking into a curve. An arm spans exactly
  // the wall's thickness, from its inner radius to its outer, and no more.
  const ARM = 6; // half-width
  for (const side of [-1, 1]) {
    const ax = cx + side * (RX - 2);
    const top = cy - WALL_H; // THE SAME HEIGHT AS THE COPING, exactly
    for (let dx = -ARM; dx <= ARM; dx++) {
      const t = 1 - (dx * dx) / (ARM * ARM);
      if (t < 0) continue;
      const ry = ARM / 2;
      // The top face, at the coping's own height and the coping's own value,
      // so the moulding runs OUT OF the wall and INTO the arm without a joint.
      // Take one put a full plinth() here — cap, die and base — and the arms
      // read as two free-standing columns with a curved span between them,
      // which is a bridge. An arm is the END OF A WALL and has to be drawn as
      // one continuous member with it.
      for (let dy = -Math.round(ry * Math.sqrt(t)); dy <= Math.round(ry * Math.sqrt(t)); dy++) {
        put(g, ax + dx, top + dy, K(n - 1 - (dx + dy > ARM * 0.55 ? 1 : 0)));
      }
      // The body. One shading law, west-lit, so the left arm's outer face is
      // the brightest vertical surface on the object and the right arm's is
      // the darkest — which is the second half of the concave-inversion cue.
      const front = top + ry * Math.sqrt(t);
      for (let y = front; y <= cy - 2; y++) put(g, ax + dx, y, K(3.3 - ((dx + ARM) / (2 * ARM)) * 2.4));
      put(g, ax + dx, front, K(0.6)); // the arris under the coping
    }
    // The base moulding, overhanging by one. Its contact skirt is gone: the
    // renderer draws that now, in the colour of whatever this is standing on.
    for (let dx = -ARM - 1; dx <= ARM + 1; dx++) {
      put(g, ax + dx, cy - 1, K(3.2 - ((dx + ARM) / (2 * ARM)) * 1.6));
      put(g, ax + dx, cy, K(0.4));
    }
  }

  return g;
}

export const EXEDRA_MARBLE = spriteAt('exedra-marble', [66, 56], exedraMarbleGrid(), {
  footprint: [2, 2],
  tags: ['decor', 'furniture', 'marble', 'neoclassical', 'seat'],
});

/**
 * Amphora. The profile IS the object — a Greek jar is recognised by its
 * silhouette and nothing else — so it is a profile array, swept.
 */
const AMPHORA_PROFILE = [
  5, 5, 4, // lip
  3, 3, 3, 3, // neck
  4, 5, 7, 8, 9, 10, 10, // shoulder
  11, 11, 11, 11, 11, 10, 10, // belly
  9, 8, 8, 7, 6, 5, 4, 3, 3, // taper to the toe
  2, 2,
];
function amphoraGrid(withPlinth) {
  const H = AMPHORA_PROFILE.length + (withPlinth ? 14 : 5) + 3;
  const g = grid(28, H);
  const cx = 13;
  revolve(g, cx, 1, AMPHORA_PROFILE, { ramp: TERRA });
  // Handles: two arcs from the neck out to the shoulder. Terracotta handles are
  // thick and they SPRING — a handle drawn as a thin wire reads as a mistake.
  for (const side of [-1, 1]) {
    for (let a = 0; a <= 26; a++) {
      const th = (a / 26) * Math.PI;
      // The bulge has to clear the SHOULDER. The first pass swung out 5 px
      // against a shoulder that is 7 px at the same height, so the handle
      // landed inside the body and the jar grew a lump. 8.5 px leaves a real
      // void between handle and shoulder, and the void IS the handle.
      const x = cx + side * (3 + 8.5 * Math.sin(th));
      const y = 5 + a * 0.4;
      put(g, x, y, side < 0 ? 'S' : 'Q');
      put(g, x + side, y, side < 0 ? 'R' : 'P');
      put(g, x - side, y, 'P');
    }
  }
  const base = AMPHORA_PROFILE.length + 1;
  if (withPlinth) {
    stamp(g, plinth(20, 5, MARBLE), cx - 9, base);
    return { g, cx, ay: base + plinthH(5) - 1 };
  }
  // A small ring stand — a pointed amphora will not stand on grass by itself,
  // and drawing it leaning is a different object.
  for (let k = 0; k < 3; k++) {
    const w = 5 + k;
    for (let i = -w; i <= w; i++) put(g, cx + i, base + k, roundKey(i, w + 0.5, TERRA));
  }
  hline(g, cx - 8, cx + 8, base + 3, 'P');
  // A turned base is a circle on the ground: an ellipse, not a diamond.
  groundFoot(g, TERRA, { round: true });
  return { g, cx, ay: base + 4 };
}
{
  const a = amphoraGrid(false);
  // eslint-disable-next-line no-var
  var AMPH = spriteAt('amphora', [a.cx, a.ay], a.g, {
    tags: ['decor', 'furniture', 'terracotta', 'vessel'],
  });
  const b = amphoraGrid(true);
  // eslint-disable-next-line no-var
  var AMPH_P = spriteAt('amphora-plinth', [b.cx, b.ay], b.g, {
    tags: ['decor', 'furniture', 'terracotta', 'marble', 'neoclassical', 'vessel'],
  });
}
export const AMPHORA = AMPH;
export const AMPHORA_ON_PLINTH = AMPH_P;

/** Krater, wide-bowled — the drinking vessel, so it is squat and open. */
const KRATER_PROFILE = [
  14, 14, 13, //                     flaring lip
  12, 12, 12, 11, 11, 11, 10, 10, 10, 9, 9, // the bowl, barely tapering: a
  8, 7, 5, 4, 3, 3, //               krater is WIDE, and a bowl drawn with a
  5, 7, 9, 10, //                    steep taper reads as a trophy
  10, 9,
];
function kraterGrid() {
  const g = grid(32, KRATER_PROFILE.length + 6);
  const cx = 15;
  revolve(g, cx, 1, KRATER_PROFILE, { ramp: TERRA });
  // The mouth: a dark elliptical well, so the bowl is empty rather than solid.
  for (let dy = -3; dy <= 3; dy++) {
    const hw = Math.round(11 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 9)));
    for (let dx = -hw; dx <= hw; dx++) put(g, cx + dx, 3 + dy, dy < 0 ? 'P' : 'Q');
  }
  hline(g, cx - 12, cx + 12, 1, 'Q');
  // Volute handles.
  // Volute handles rise ABOVE the lip and scroll back down outside it. Drawn
  // below the lip, as in the first pass, they are invisible against the bowl.
  for (const side of [-1, 1]) {
    for (let a = 0; a <= 22; a++) {
      const th = (a / 22) * Math.PI * 1.1;
      const r = 12 + 3.2 * Math.sin(th);
      const y = 4 - 4.5 * Math.sin(th * 0.85);
      put(g, cx + side * r, y, side < 0 ? 'S' : 'Q');
      put(g, cx + side * (r + 1), y, 'P');
      put(g, cx + side * r, y + 1, 'R');
    }
    for (let i = 0; i <= 12; i++) {
      const t = (i / 12) * Math.PI * 1.9;
      put(g, cx + side * (14 + Math.cos(t) * 2.2), 2 - Math.sin(t) * 2.2, i > 8 ? 'P' : 'R');
    }
  }
  const base = KRATER_PROFILE.length + 1;
  // A turned base is a circle on the ground: an ellipse, not a diamond.
  groundFoot(g, TERRA, { round: true });
  return { g, cx, ay: base };
}
{
  const k = kraterGrid();
  // eslint-disable-next-line no-var
  var KRT = spriteAt('krater-wide', [k.cx, k.ay], k.g, {
    tags: ['decor', 'furniture', 'terracotta', 'vessel'],
  });
}
export const KRATER_WIDE = KRT;

/**
 * Fluted urn with lid — the neoclassical vessel, against the archaic amphora.
 * Same sweep, same lighting, but FLUTED and standing on a plinth: the register
 * split expressed on two objects that are otherwise the same object.
 */
const URN_PROFILE = [
  4, 6, 7, 6, // lid, with a knop above it
  8, 9, // rim
  10, 11, 11, 12, 12, 12, 12, 11, 11, 10, // fluted belly
  9, 8, 7, 5, 4, 3, // stem
  5, 7, 8,
];
function flutedUrnGrid() {
  const g = grid(30, URN_PROFILE.length + 22);
  const cx = 14;
  // Knop.
  revolve(g, cx, 0, [1, 2, 2, 1], { ramp: MARBLE });
  revolve(g, cx, 4, URN_PROFILE.slice(0, 6), { ramp: MARBLE });
  revolve(g, cx, 10, URN_PROFILE.slice(6, 16), { ramp: MARBLE, flutes: 3 });
  revolve(g, cx, 20, URN_PROFILE.slice(16), { ramp: MARBLE });
  hline(g, cx - 7, cx + 7, 8, 'B'); // the lid joint — an urn with no seam has no lid
  hline(g, cx - 8, cx + 8, 9, 'E');
  const base = 4 + URN_PROFILE.length;
  stamp(g, plinth(18, 3, MARBLE), cx - 8, base);
  return { g, cx, ay: base + plinthH(3) - 1 };
}
{
  const u = flutedUrnGrid();
  // eslint-disable-next-line no-var
  var FURN = spriteAt('fluted-urn', [u.cx, u.ay], u.g, {
    tags: ['decor', 'furniture', 'marble', 'neoclassical', 'vessel'],
  });
}
export const FLUTED_URN = FURN;

/** Sundial on a pedestal: fluted baluster stem, dial plate, gnomon, shadow. */
function sundialGrid() {
  const g = grid(28, 52);
  const cx = 13;
  const stem = [5, 5, 4, 4, 4, 4, 4, 5, 5, 6, 6, 6, 5, 5, 4, 4, 4, 4, 5, 6, 7];
  revolve(g, cx, 14, stem, { ramp: MARBLE, flutes: 3 });
  // Dial plate: a drum, seen at 2:1, which is what makes it a disc and not a
  // lollipop. The gnomon's shadow is drawn ON it — a sundial without a shadow
  // is a plate.
  drum(g, cx, 11, 10, 2, { ramp: MARBLE });
  // A plate reads as a plate because of its EDGE. The first pass drew a bright
  // disc with faint marks on it and got a white blob; the fix is a hard 'A'
  // rim, a 'B' chamfer inside it, and hour marks dark enough to count.
  for (let a = 0; a < 128; a++) {
    const th = (a / 128) * Math.PI * 2;
    put(g, cx + 10 * Math.cos(th), 11 + 5 * Math.sin(th), 'A');
    put(g, cx + 9 * Math.cos(th), 11 + 4.4 * Math.sin(th), 'B');
  }
  for (let a = 0; a < 12; a++) {
    const th = (a / 12) * Math.PI * 2;
    put(g, cx + 8 * Math.cos(th), 11 + 4 * Math.sin(th), 'A');
    put(g, cx + 7 * Math.cos(th), 11 + 3.4 * Math.sin(th), a % 3 ? 'B' : 'A');
  }
  for (let k = 0; k < 7; k++) put(g, cx + 1 + k, 11 + Math.round(k * 0.4), 'B'); // the shadow
  // Bronze gnomon: dark gold with its own dark edge, or it reads as a twig.
  for (let k = 0; k < 10; k++) {
    put(g, cx - 4 + k * 0.5, 11 - k, 'U');
    put(g, cx - 5 + k * 0.5, 11 - k, 'T');
  }
  const base = 35;
  stamp(g, plinth(20, 4, MARBLE), cx - 9, base);
  return { g, cx, ay: base + plinthH(4) - 1 };
}
{
  const s = sundialGrid();
  // eslint-disable-next-line no-var
  var SUND = spriteAt('sundial-pedestal', [s.cx, s.ay], s.g, {
    tags: ['decor', 'furniture', 'marble', 'neoclassical'],
  });
}
export const SUNDIAL_PEDESTAL = SUND;

/** Birdbath — a shallow basin on a baluster. The water cycles with the pond. */
function birdbathGrid() {
  const g = grid(30, 44);
  const cx = 14;
  const stem = [4, 4, 3, 3, 3, 3, 4, 5, 5, 5, 4, 4, 3, 3, 4, 5, 6];
  revolve(g, cx, 14, stem, { ramp: MARBLE, flutes: 3 });
  // The bowl. Water first, then the rim over it, so the rim reads as in front.
  drum(g, cx, 11, 12, 3, { ramp: MARBLE, rim: true });
  for (let dy = -4; dy <= 4; dy++) {
    const hw = Math.round(9 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 25)));
    for (let dx = -hw; dx <= hw; dx++) {
      const d = Math.hypot(dx / 9, dy / 4.5);
      put(g, cx + dx, 11 + dy, d > 0.82 ? 'H' : d > 0.5 ? 'I' : 'J');
    }
  }
  hline(g, cx - 5, cx + 2, 9, 'K'); // one glint, upper left
  const base = 31;
  stamp(g, plinth(20, 3, MARBLE), cx - 9, base);
  return { g, cx, ay: base + plinthH(3) - 1 };
}
{
  const b = birdbathGrid();
  // eslint-disable-next-line no-var
  var BBATH = spriteAt('birdbath', [b.cx, b.ay], b.g, {
    tags: ['decor', 'furniture', 'marble', 'neoclassical', 'water'],
    cycle: { ramp: 'water', rate: 7 },
  });
}
export const BIRDBATH = BBATH;

/** Cache-pot with a clipped ball of box in it. */
function cachePotGrid() {
  const g = grid(28, 44);
  const cx = 13;
  // The topiary first — the pot rim must draw over its lower edge.
  ballOfBox(g, cx, 12, 10);
  const pot = [10, 10, 10, 9, 9, 9, 9, 8, 8, 8, 8, 7, 7, 9, 9];
  revolve(g, cx, 22, pot, { ramp: TERRA });
  drum(g, cx, 23, 10, 2, { ramp: TERRA, rim: true }); // the rim, over the foliage
  const base = 37;
  // A turned base is a circle on the ground: an ellipse, not a diamond.
  groundFoot(g, TERRA, { round: true });
  return { g, cx, ay: base };
}

/**
 * A ball of clipped box. Topiary is the one plant in the game that must NOT be
 * composed from irregular clumps: the whole point of it is that a gardener cut
 * a smooth solid out of a bush. DECOR.md marks it `[P]`, but the grow.js
 * composers exist to make irregular silhouettes, which is exactly the property
 * a clipped ball must not have. So it is authored here, as a revolve() sphere
 * with a leaf speckle laid over it — same lighting law as the urn.
 */
function ballOfBox(g, cx, cy, r) {
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.round(r * Math.sqrt(Math.max(0, 1 - (dy * dy) / (r * r))));
    for (let dx = -hw; dx <= hw; dx++) {
      // Sphere shading: distance from the upper-left lit point, not from the
      // centre. A ball lit from the centre out is a disc.
      const d = Math.hypot((dx + r * 0.34) / r, (dy + r * 0.34) / r);
      let v = d < 0.42 ? 4 : d < 0.72 ? 3 : d < 0.95 ? 2 : 1;
      if (hash(cx + dx, cy + dy, 17) < 0.16) v = Math.max(1, v - 1);
      else if (hash(cx + dx, cy + dy, 23) > 0.9) v = Math.min(4, v + 1);
      put(g, cx + dx, cy + dy, BOX[clamp(v, 0, 4)]);
    }
    put(g, cx - hw, cy + dy, BOX[0]);
    put(g, cx + hw, cy + dy, BOX[0]);
  }
}
{
  const c = cachePotGrid();
  // eslint-disable-next-line no-var
  var CPOT = spriteAt('cache-pot', [c.cx, c.ay], c.g, {
    tags: ['decor', 'furniture', 'terracotta', 'plant'],
  });
}
export const CACHE_POT = CPOT;

/**
 * NEEDS-DESIGN — garden seat under an arbour.
 *
 * DECOR.md flags it `[?]` and the reason still stands: the seat is under an
 * overhead structure, so a creature walking behind the arbour must be occluded
 * by the posts and NOT by the roof, which one scalar depth key per object
 * cannot express. Two candidate fixes — split it into two objects at different
 * depths, or give the renderer an "overhead" pass drawn after all movers — are
 * both engine changes, not art changes.
 *
 * Shipped as the bench with a bare frame over it so the slot is filled and the
 * palette is not missing an entry. Do not treat this sprite as finished.
 */
function arbourSeatGrid() {
  const D = 5;
  const X0 = 2 * D + 4;
  const LEN = 26;
  const g = grid(X0 + LEN + 6, 54);
  const SEAT = 26;
  // Four posts, then the seat slab, then the open frame over it. Deliberately
  // plain: this is a PLACEHOLDER (see NEEDS_DESIGN) and it should not pretend
  // to have solved the sorting problem that keeps it a placeholder.
  for (const i of [2, LEN - 4]) {
    for (const back of [0, 1]) {
      const px = X0 + i - 2 * (back ? 0 : D);
      const py = 6 + LINE_DROP(i) + (back ? 0 : D);
      for (let k = 0; k < 34; k++) {
        put(g, px, py + k, 'q');
        put(g, px + 1, py + k, 't');
        put(g, px + 2, py + k, 'r');
      }
      put(g, px + 1, py + 34, 'q');
    }
  }
  for (const i of [3, LEN - 5]) {
    const lx = X0 + i - 2 * (D - 2);
    const ly = SEAT + LINE_DROP(i) + (D - 2) + 4;
    for (let k = 0; k < 8; k++) hline(g, lx, lx + 7, ly + k, k === 0 ? 'E' : k === 7 ? 'A' : 'C');
  }
  slabBackEdge(g, X0, SEAT, LEN, 'A');
  slab(g, X0, SEAT, LEN, D, (a, b) => (b < 1 ? 'D' : 'E'));
  slabFace(g, X0, SEAT, LEN, D, 3, (i, k) => (k === 2 ? 'A' : 'C'));
  slab(g, X0, 4, LEN, D, () => 'u');
  slabFace(g, X0, 4, LEN, D, 2, (i, k) => (k ? 'q' : 'r'));
  for (let i = 2; i < LEN; i += 5) {
    const x = X0 + i - D;
    const y = 6 + LINE_DROP(i) + Math.round(D / 2);
    vline(g, x, y, y + 2, 's');
  }
  return g;
}
export const ARBOUR_SEAT = spriteAt('arbour-seat', [18, 46], arbourSeatGrid(), {
  tags: ['decor', 'furniture', 'timber', 'seat', 'needs-design'],
});

// ===========================================================================
// PILLARS AND ARCHITECTURE
//
// The three orders are ONE shaft. DECOR.md says so — "[V] Ionic column: Doric
// shaft, new capital" — and it is right, that is how the orders actually work.
// So there is one shaft function and three capital functions, and the Doric,
// Ionic and Corinthian columns differ by about forty pixels each.
// ===========================================================================

const SHAFT_HW = 6; // half-width at the foot; entasis narrows it going up

/** The fluted shaft. Every column, pilaster and colonnade post uses this. */
function shaft(g, cx, yTop, h, ramp = MARBLE) {
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1); // 0 at the top, 1 at the foot
    // Entasis: the swell. A perfectly parallel shaft reads as a pipe.
    const hw = Math.round(SHAFT_HW - 1 + Math.sin(t * Math.PI * 0.62) * 1.4);
    for (let dx = -hw; dx <= hw; dx++) put(g, cx + dx, yTop + i, roundKey(dx, hw + 0.5, ramp, 3));
    put(g, cx - hw, yTop + i, ramp[0]);
    put(g, cx + hw, yTop + i, ramp[0]);
  }
  return SHAFT_HW;
}

/** Doric: a plain flaring echinus under a square abacus. No base. */
function doricCapital(g, cx, y, ramp = MARBLE) {
  hline(g, cx - 9, cx + 9, y, ramp[0]);
  hline(g, cx - 9, cx + 9, y + 1, ramp[4]);
  hline(g, cx - 9, cx + 9, y + 2, ramp[3]);
  hline(g, cx - 8, cx + 8, y + 3, ramp[2]);
  hline(g, cx - 8, cx + 8, y + 4, ramp[1]);
  for (let k = 0; k < 3; k++) {
    const w = 7 - k;
    for (let dx = -w; dx <= w; dx++) put(g, cx + dx, y + 5 + k, roundKey(dx, w + 0.5, ramp));
  }
  hline(g, cx - 5, cx + 5, y + 8, ramp[1]);
  return y + 9;
}

/**
 * Ionic: the same abacus, with a volute scrolling out either side.
 *
 * Authored as literal rows, not as a computed spiral. A spiral drawn by
 * trigonometry at seven pixels across is a smear — take one produced two white
 * rectangles with a dot in them. What actually reads at this size is: a dark
 * EYE, one bright turn wrapping it, and the channel between the two volutes
 * dipping in the middle. Three shapes, typed.
 */
const IONIC_ROWS = [
  '...AAAAAAAAAAAAAAAA...',
  '..AEEEEEEEEEEEEEEEEA..',
  '..ADDDDDDDDDDDDDDDDA..',
  '..ABBBBBBBBBBBBBBBBA..',
  'AADDDDAABBBBBBBBAADDDDA',
  'ADEEEDABDDDDDDDDBADEEEDA',
  'ADEABEABDEEEEEEDBAEBAEDA',
  'ADEBBEABBDDDDDDBBAEBBEDA',
  'ADDEEDAABBBBBBBBAADEEDDA',
  '.AADDAA..AACCAA..AADDAA.',
  '...AA......AA......AA...',
];
function ionicCapital(g, cx, y, ramp = MARBLE) {
  IONIC_ROWS.forEach((row, i) => {
    const off = cx - ((row.length - 1) >> 1);
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      put(g, off + x, y + i, ramp[MARBLE.indexOf(row[x])]);
    }
  });
  return y + IONIC_ROWS.length;
}

/**
 * Corinthian: the acanthus bell.
 *
 * Take one drew leaf tips as vertical dark lines with a lit pixel beside each
 * and produced tinsel. Acanthus at twenty pixels is a RHYTHM OF NOTCHES cut
 * into a lit bell — the dark between the leaves is the drawing, and the leaf
 * itself is just what is left. Two staggered tiers, because one tier reads as
 * a fringe.
 */
const CORINTH_ROWS = [
  '..AAAAAAAAAAAAAAAAAA..',
  '.AEEEEEEEEEEEEEEEEEEA.',
  '.ACCCCCCCCCCCCCCCCCCA.',
  'AEEDAADEEDAADEEDAADEEA',
  'ADEDABADEDABADEDABADEA',
  'ABDCABABDCABABDCABABDA',
  '.ABCAAABCCAAABCCAAABA.',
  '.ADEEDAADEEDAADEEDDDA.',
  '..ADEDABADEDABADEDDA..',
  '..ABDCABABDCABABDCBA..',
  '..AABCAAABCCAAABCBAA..',
  '...ABCDDDDDDDDDCCBA...',
  '...AACCCCCCCCCCBBAA...',
  '.....AAAAAAAAAAAA.....',
];
function corinthianCapital(g, cx, y, ramp = MARBLE) {
  CORINTH_ROWS.forEach((row, i) => {
    const off = cx - ((row.length - 1) >> 1);
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      put(g, off + x, y + i, ramp[MARBLE.indexOf(row[x])]);
    }
  });
  return y + CORINTH_ROWS.length;
}

function columnGrid(capital, name) {
  const H = 62;
  const g = grid(26, H);
  const cx = 12;
  const capH = capital === doricCapital ? 9 : capital === ionicCapital ? 11 : 14;
  const yCap = 1;
  const shaftTop = yCap + capH;
  const shaftH = H - shaftTop - 13;
  shaft(g, cx, shaftTop, shaftH, MARBLE);
  capital(g, cx, yCap, MARBLE);
  const base = shaftTop + shaftH;
  stamp(g, plinth(18, 1, MARBLE), cx - 8, base);
  return { g, cx, ay: base + plinthH(1) - 1, name };
}
{
  const d = columnGrid(doricCapital, 'doric-column');
  const i = columnGrid(ionicCapital, 'ionic-column');
  const c = columnGrid(corinthianCapital, 'corinthian-column');
  // eslint-disable-next-line no-var
  var DOR = spriteAt('doric-column', [d.cx, d.ay], d.g, { tags: ['decor', 'architecture', 'marble', 'neoclassical', 'column'] });
  // eslint-disable-next-line no-var
  var ION = spriteAt('ionic-column', [i.cx, i.ay], i.g, { tags: ['decor', 'architecture', 'marble', 'neoclassical', 'column'] });
  // eslint-disable-next-line no-var
  var COR = spriteAt('corinthian-column', [c.cx, c.ay], c.g, { tags: ['decor', 'architecture', 'marble', 'neoclassical', 'column'] });
}
export const DORIC_COLUMN = DOR;
export const IONIC_COLUMN = ION;
export const CORINTHIAN_COLUMN = COR;

/**
 * Broken column — the romantic ruin. The break is a FLAT face with no highlight
 * on it at all (props.js's lesson, and it is the only thing that says "broken"
 * rather than "short"), and the flutes stop raggedly at the fracture.
 */
function brokenColumnGrid() {
  const g = grid(30, 40);
  const cx = 11;
  const H = 22;
  shaft(g, cx, 5, H, MARBLE);
  // Fracture: a ragged top, dull B/A, stepping down to the right.
  for (let dx = -6; dx <= 6; dx++) {
    const top = 5 + Math.round(2 + Math.sin(dx * 1.7) * 1.2 + (dx > 2 ? 1 : 0));
    for (let y = 5; y < top; y++) put(g, cx + dx, y, '.');
    put(g, cx + dx, top, 'B');
    put(g, cx + dx, top + 1, 'B');
    put(g, cx + dx, top + 2, 'A');
  }
  const base = 5 + H;
  stamp(g, plinth(18, 1, MARBLE), cx - 8, base);
  // The fallen drum beside it. It has to lie DOWN: a horizontal cylinder with
  // one circular end face turned toward the viewer and the flutes running
  // along its length. Take one used drum(), which draws an upright cylinder,
  // and it read as a white pancake.
  const dx0 = 20;
  const dy0 = base + 2;
  for (let i = 0; i < 9; i++) {
    for (let k = -5; k <= 5; k++) {
      const t = 1 - (k * k) / 30;
      if (t < 0) continue;
      put(g, dx0 + i, dy0 + k + (i >> 2), roundKey(k, 5.5, MARBLE, 0));
    }
  }
  for (let k = -5; k <= 5; k++) {
    const hw = Math.round(3 * Math.sqrt(Math.max(0, 1 - (k * k) / 30)));
    for (let dx = -hw; dx <= hw; dx++) put(g, dx0 + 9 + dx, dy0 + k + 2, roundKey(dx * 1.6, 5, MARBLE, 3));
    put(g, dx0 + 9 - hw, dy0 + k + 2, 'A');
    put(g, dx0 + 9 + hw, dy0 + k + 2, 'A');
  }
  for (let i = 0; i < 9; i++) {
    put(g, dx0 + i, dy0 - 5 + (i >> 2), 'A');
    put(g, dx0 + i, dy0 + 5 + (i >> 2), 'A');
  }
  // ONE shadow, and it is centred on the ANCHOR rather than on the standing
  // stump: this sprite is a broken column AND the drum fallen beside it, so
  // the ground it touches is the whole pair. r 13 against a 26px foot.
  return { g, cx, ay: base + plinthH(1) - 1 };
}
{
  const b = brokenColumnGrid();
  // eslint-disable-next-line no-var
  var BCOL = spriteAt('broken-column', [b.cx, b.ay], b.g, {
    tags: ['decor', 'architecture', 'marble', 'ruin', 'archaic'],
  });
}
export const BROKEN_COLUMN_FLUTED = BCOL;

/**
 * Colonnade, 3 tiles. Four columns carrying an architrave, running along the
 * +tx axis so it butts into a longer run. The architrave is a slab(); the
 * columns are the same shaft() as the free-standing Doric.
 */
function colonnadeGrid() {
  const SPAN = 32; //   one tile step
  const D = 5; //       the entablature's own width across the run
  const OVER = 7; //    how far the cornice oversails the end columns
  const RUN = SPAN * 3 + OVER * 2;
  const COLH = 32;
  const CAPH = 9;
  const X0 = 2 * D + 2;
  const g = grid(X0 + RUN + 4, 124);
  const TOP = 6;

  // Take one drew the architrave as a flat 2 px beam spanning the whole sprite
  // and hung the columns off it: the beam over-ran the end column by twenty
  // pixels and the thing read as a handrail with pillars stuck under it. The
  // entablature is a slab like everything else linear in this file, it stops
  // seven pixels past the end columns, and the column tops are DERIVED from
  // its underside so the two cannot drift apart.
  const under = (i) => TOP + LINE_DROP(i) + D + 4;

  const posts = [OVER, OVER + SPAN, OVER + SPAN * 2, OVER + SPAN * 3];
  posts.forEach((i) => {
    const cx = X0 + i - D;
    const yTop = under(i) + CAPH;
    shaft(g, cx, yTop, COLH, MARBLE);
    doricCapital(g, cx, under(i), MARBLE);
    stamp(g, plinth(16, 0, MARBLE), cx - 8, yTop + COLH);
  });

  // Architrave, then a cornice with its own oversail and a dentil course.
  slabBackEdge(g, X0, TOP, RUN, 'A');
  slab(g, X0, TOP, RUN, D, (a, b) => (b < 1 ? 'D' : 'E'));
  slabFace(g, X0, TOP, RUN, D, 5, (i, k) => {
    if (k === 4) return 'A';
    if (k === 2) return 'B'; //                the shadow under the cornice
    if (k === 3) return i % 4 < 2 ? 'C' : 'B'; // dentils
    return k === 0 ? 'D' : 'C';
  });

  const mid = OVER + Math.round(SPAN * 1.5);
  return { g, ax: X0 + mid - D, ay: under(mid) + CAPH + COLH + plinthH(0) - 1 };
}

{
  const c = colonnadeGrid();
  // eslint-disable-next-line no-var
  var COLN = spriteAt('colonnade', [c.ax, c.ay], c.g, {
    footprint: [3, 1],
    tags: ['decor', 'architecture', 'marble', 'neoclassical', 'column'],
  });
}
export const COLONNADE = COLN;

/**
 * Balustrade — a low railing, and a weak nullifier. It reads by the RHYTHM of
 * its balusters against the gap between them, so the gaps have to be genuinely
 * transparent: a balustrade drawn as a solid band with lines on it is a wall.
 */
function balustradeGrid() {
  const DEPTH = 4;
  const X0 = 2 * DEPTH + 2;
  const g = grid(X0 + LINE_W + 3, 34);
  const TOP = 3;
  // Bottom rail, then balusters, then the top rail over their heads. The GAPS
  // are the object: a balustrade drawn as a solid band with lines on it is a
  // wall, so the balusters are narrow and the spacing is wide.
  slab(g, X0, TOP + 15, LINE_W, DEPTH, (a, b) => (b < 1 ? 'C' : 'D'));
  slabFace(g, X0, TOP + 15, LINE_W, DEPTH, 2, (i, k) => (k === 1 ? 'A' : 'C'));
  for (let i = 2; i < LINE_W - 2; i += 6) {
    const bx = X0 + i - DEPTH;
    const by = TOP + LINE_DROP(i) + Math.round(DEPTH / 2) + 4;
    revolve(g, bx, by, [2, 1, 1, 1, 2, 2, 2, 1, 1, 2], { ramp: MARBLE });
  }
  slabBackEdge(g, X0, TOP, LINE_W, 'A');
  slab(g, X0, TOP, LINE_W, DEPTH, (a, b) => (b < 1 ? 'D' : 'E'));
  slabFace(g, X0, TOP, LINE_W, DEPTH, 3, (i, k) => (k === 2 ? 'A' : k === 0 ? 'D' : 'B'));
  return g;
}
export const BALUSTRADE = spriteAt('balustrade', [10, 29], balustradeGrid(), {
  tags: ['decor', 'architecture', 'marble', 'neoclassical', 'enclosure', 'nullifier'],
});

/**
 * Pergola / trellis arch — a WALK-THROUGH, so the opening is the object. Timber
 * uprights in the earth ramp, a lattice head, and a vine over it drawn as
 * canopy clumps hanging OFF the beam (props.js: foliage centred on a built face
 * turns into a feature of that face — the grotto's "eyes" lesson).
 */
function pergolaArchGrid() {
  const g = grid(44, 54);
  const post = (px, py) => {
    for (let k = 0; k < 32; k++) {
      put(g, px, py + k, 'q');
      put(g, px + 1, py + k, 'u');
      put(g, px + 2, py + k, 't');
      put(g, px + 3, py + k, 's');
      put(g, px + 4, py + k, 'r');
      put(g, px + 5, py + k, 'q');
      if (k % 7 === 3) put(g, px + 2, py + k, 's'); // a knot in the timber
    }
    hline(g, px, px + 5, py + 32, 'q');
  };
  post(4, 16);
  post(34, 16);
  // The head: two cross-beams with a lattice between them, drawn with real
  // thickness so this is a structure to walk THROUGH rather than a doorframe.
  for (const [y, h] of [[8, 3], [14, 3]]) {
    for (let x = 2; x < 42; x++) {
      put(g, x, y, 'q');
      put(g, x, y + 1, 'u');
      for (let k = 2; k < h + 1; k++) put(g, x, y + k, 't');
      put(g, x, y + h + 1, 'r');
      put(g, x, y + h + 2, 'q');
    }
  }
  for (let x = 6; x < 39; x += 5) {
    vline(g, x, 12, 15, 's');
    vline(g, x + 1, 12, 15, 'r');
  }
  // Vine over the top, asymmetric, hanging OFF the ends. props.js's grotto
  // lesson: foliage centred on a built face becomes a feature of that face.
  for (let x = 1; x < 43; x++) {
    const n = 2 + Math.round(hash(x, 0, 5) * 4);
    for (let k = 0; k < n; k++) put(g, x, 7 - k, hash(x, k, 9) > 0.55 ? 'd' : 'c');
    put(g, x, 7 - n, 'a');
    if (hash(x, 3, 12) > 0.7) put(g, x, 6 - n, 'b');
  }
  const drape = (x0, y0, n, seed) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.round(Math.sin(i * 0.9 + seed) * 3);
      const y = y0 + i;
      put(g, x, y, 'a');
      put(g, x + 1, y, 'c');
      put(g, x + 2, y, hash(x, y, seed) > 0.5 ? 'd' : 'b');
      if (hash(x, y, seed + 3) > 0.7) put(g, x + 3, y, 'b');
    }
  };
  drape(1, 19, 15, 1);
  drape(38, 19, 8, 4);
  return g;
}
export const PERGOLA_ARCH = spriteAt('pergola-arch', [21, 48], pergolaArchGrid(), {
  tags: ['decor', 'architecture', 'timber', 'shade', 'archaic'],
});

/**
 * Ruined archway — the archaic register at full volume. Voussoirs drawn as
 * separate stones with their own joints (an arch drawn as a smooth band is a
 * bent pipe), one springing broken away, weathering and moss on the standing
 * side.
 */
function ruinedArchwayGrid() {
  const W = 48;
  const H = 56;
  const g = grid(W, H);
  const cx = 24;
  const R = 15; // an arch STANDS UP, so it is a true circle on screen and not
  const T = 6; //  foreshortened. Take one used an ellipse and got a banana.
  const SPRING = 36;

  // Piers. Both of them, full height: a ruined arch with one foot reads as a
  // shepherd's crook, and the eye needs two feet to complete the missing span.
  const pier = (px, top, rough) => {
    for (let y = top; y <= SPRING + 14; y++) {
      for (let dx = 0; dx < 10; dx++) {
        let key = roundKey(dx - 4.5, 5.2, ROCK);
        if (rough && hash(px + dx, y, 7) > 0.88) key = 'y';
        else if (hash(px + dx, y, 9) > 0.9) key = 'y';
        put(g, px + dx, y, key);
      }
      if ((y - top) % 5 === 0) hline(g, px, px + 9, y, 'w'); // bed joints
      const jog = (Math.floor((y - top) / 5) % 2) * 5;
      put(g, px + jog, y, 'v'); // perpends, staggered course to course
      put(g, px, y, 'v');
      put(g, px + 9, y, 'v');
    }
  };
  pier(cx - R - 7, SPRING - 4, false);
  pier(cx + R - 2, SPRING - 4, true);

  // Voussoirs. Rasterised over the annulus rather than swept along the arc, so
  // there are no gaps, and the JOINTS are drawn as real radial lines: an arch
  // whose stones are not separated is a bent pipe.
  const BREAK = 1.15; // radians: everything below this angle on the right is gone
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = SPRING - y;
      const r = Math.hypot(dx, dy);
      if (r < R || r > R + T || dy < -1) continue;
      const th = Math.atan2(dy, dx); // 0 at the right springing, PI at the left
      // The break: ragged, and it leaves a short springing stub on the right.
      const ragged = BREAK + (hash(Math.round(r), Math.round(th * 20), 17) - 0.5) * 0.16;
      if (th < ragged && th > 0.34) continue;
      const seg = (th / Math.PI) * 11;
      const joint = Math.abs(seg - Math.round(seg)) < 0.075;
      // Weathered limestone, not basalt. Take one put the darkest rock on both
      // faces of the ring AND on every joint, and against grass the whole arch
      // read as a black hook. The joints stay one step above the bottom of the
      // ramp and only the intrados — which really is in shade — goes dark.
      let k = joint ? 'w' : roundKey(dx, R + T, ROCK);
      if (!joint && hash(x, y, 41) > 0.86) k = 'y';
      if (r > R + T - 1.1) k = 'w';
      if (r < R + 1) k = 'v';
      put(g, x, y, k);
    }
  }

  // Moss in the joints on the shaded side, and a weathered crumble at the
  // broken end. Archaic register: nothing here is allowed to be clean.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (peek(g, x, y) === 'v' && hash(x, y, 31) > 0.88) put(g, x, y, 'j');
      if (peek(g, x, y) === 'w' && hash(x, y, 37) > 0.95) put(g, x, y, 'k');
    }
  }
  return g;
}
export const RUINED_ARCHWAY = spriteAt('ruined-archway', [24, 51], ruinedArchwayGrid(), {
  tags: ['decor', 'architecture', 'rock', 'ruin', 'archaic'],
});

/**
 * THOLOS — the small round temple folly, and the centrepiece of the set.
 *
 * Everything the family owns, at once: the crepidoma is three drum() steps on
 * the family tread, the eight columns are the same shaft() as the Doric with
 * the same flute pitch, the entablature is a drum, the roof is a cone of the
 * same marble. Nothing new is invented for it, which is the point — the
 * centrepiece has to look like the most elaborate member of the family rather
 * than an import from another game.
 *
 * The load-bearing decision is that you can SEE THROUGH IT. The gaps between
 * the near columns show the far columns in shadow and the floor between them.
 * A tholos drawn as a solid drum with lines on it is a cake.
 */
const APEXY = (ent) => ent - 6 - 22;

function tholosGrid() {
  const W = 118;
  const H = 122;
  const g = grid(W, H);
  const cx = 57;
  const GROUND = 112;

  // --- crepidoma: three steps, family tread, each a drum -------------------
  let cy = GROUND - 25 - RISER;
  drum(g, cx, cy, 50, RISER, { ramp: MARBLE });
  cy -= RISER;
  drum(g, cx, cy, 45, RISER, { ramp: MARBLE });
  cy -= RISER;
  const STYL = cy; // stylobate: the floor the columns stand on
  drum(g, cx, STYL, 40, RISER, { ramp: MARBLE });

  // --- the column ring ----------------------------------------------------
  const RX = 32;
  const RY = 16;
  const COLH = 36;
  const cols = [];
  for (let k = 0; k < 8; k++) {
    const th = ((k * 45 + 22.5) * Math.PI) / 180;
    cols.push({ x: cx + RX * Math.cos(th), y: STYL + RY * Math.sin(th), back: Math.sin(th) < 0 });
  }
  const drawCol = (c, ramp) => {
    const top = c.y - COLH;
    shaft(g, c.x, top + 8, COLH - 8, ramp);
    doricCapital(g, c.x, top - 1, ramp);
    // A small square base so the column meets the floor, not floats on it.
    hline(g, c.x - 7, c.x + 7, c.y, ramp[0]);
    hline(g, c.x - 7, c.x + 7, c.y - 1, ramp[4]);
    hline(g, c.x - 6, c.x + 6, c.y - 2, ramp[3]);
  };
  // Back columns first, one ramp step darker: they are inside, in shade, and
  // that value drop is what gives the building depth through its own gaps.
  cols.filter((c) => c.back).forEach((c) => drawCol(c, 'AABCD'));

  // --- entablature: architrave + cornice, as one overhanging drum ----------
  const ENT = STYL - COLH - 2;
  drum(g, cx, ENT, 36, 5, {
    ramp: MARBLE,
    top: (dx, dy) => discKey(dx, dy, 36, 18, MARBLE),
    side: (dx, k) => (k === 5 ? 'B' : roundKey(dx, 36, MARBLE)),
  });
  drum(g, cx, ENT - 3, 34, 3, { ramp: MARBLE }); // the frieze band above it

  // --- front columns, over the entablature's back arc ----------------------
  cols.filter((c) => !c.back).forEach((c) => drawCol(c, MARBLE));
  // ...and the entablature's FRONT arc back over their capitals.
  for (let dx = -36; dx <= 36; dx++) {
    const t = 1 - (dx * dx) / (36 * 36);
    if (t < 0) continue;
    const front = ENT + 18 * Math.sqrt(t);
    for (let k = 0; k <= 5; k++) put(g, cx + dx, front + k, k === 5 ? 'B' : roundKey(dx, 36, MARBLE));
    put(g, cx + dx, front - 1, discKey(dx, 18 * Math.sqrt(t), 36, 18, MARBLE));
  }

  // --- roof: a shallow cone, painted apex-first so the front overwrites ----
  //
  // Take one computed the ribs from atan2(dy, dx) in SCREEN space, which is not
  // the azimuth around the cone's axis: the ribs came out as jagged white
  // spikes fanning off the upper corners, like a broken parasol. The azimuth is
  // acos(dx / rx) at the level being painted, and ribs at fixed azimuth
  // converge on the apex, which is what a tiled cone actually does.
  const RH = 22; // shallower than take one's 28 — a temple, not a witch's hat
  const RR = 38;
  for (let k = 0; k <= RH; k++) {
    const f = k / RH;
    const rx = RR * f;
    const ry = rx / 2;
    const yc = APEXY(ENT) + k;
    for (let dx = -rx; dx <= rx; dx++) {
      const t = 1 - (dx * dx) / Math.max(1, rx * rx);
      if (t < 0) continue;
      const dy = ry * Math.sqrt(t);
      const az = Math.acos(clamp(dx / Math.max(1, rx), -1, 1)); // 0..PI
      const rib = Math.abs(((az * 7) / Math.PI) % 1);
      const key = rib < 0.11 || rib > 0.93 ? 'B' : roundKey(dx, Math.max(1, rx), MARBLE);
      put(g, cx + dx, yc + dy, key);
      put(g, cx + dx, yc + dy - 1, key);
    }
  }
  // The eaves: the cone's own final ellipse, so the edge is the edge and not a
  // fringe, plus one row of shadow under the overhang.
  for (let dx = -RR; dx <= RR; dx++) {
    const t = 1 - (dx * dx) / (RR * RR);
    if (t < 0) continue;
    const ye = APEXY(ENT) + RH + (RR / 2) * Math.sqrt(t);
    put(g, cx + dx, ye, 'A');
    put(g, cx + dx, ye + 1, 'A');
    put(g, cx + dx, ye + 2, 'B');
  }
  revolve(g, cx, APEXY(ENT) - 6, [1, 2, 3, 3, 2, 1, 1], { ramp: MARBLE }); // finial

  // --- contact skirt around the bottom step -------------------------------
  return g;
}
export const THOLOS = spriteAt('tholos', [57, 88], tholosGrid(), {
  footprint: [2, 2],
  tags: ['decor', 'architecture', 'marble', 'neoclassical', 'folly'],
});

/** Obelisk — a tapering square shaft with a pyramidion, on a plinth. */
function obeliskGrid() {
  const g = grid(24, 64);
  const cx = 11;
  const H = 40;
  // The pyramidion first.
  for (let k = 0; k < 5; k++) {
    const w = k;
    for (let dx = -w; dx <= w; dx++) put(g, cx + dx, 3 + k, dx < 0 ? 'E' : dx === 0 ? 'D' : 'C');
  }
  // The shaft: square in plan, so it shows TWO faces meeting at a vertical
  // arris — that arris is the only thing that stops an obelisk being a stick.
  for (let i = 0; i < H; i++) {
    const t = i / (H - 1);
    const hw = Math.round(3 + t * 2.4);
    for (let dx = -hw; dx <= hw; dx++) put(g, cx + dx, 8 + i, dx < 0 ? 'D' : dx === 0 ? 'E' : dx < hw - 1 ? 'C' : 'B');
    put(g, cx - hw, 8 + i, 'A');
    put(g, cx + hw, 8 + i, 'A');
  }
  const base = 8 + H;
  stamp(g, plinth(20, 6, MARBLE), cx - 9, base);
  return { g, cx, ay: base + plinthH(6) - 1 };
}
{
  const o = obeliskGrid();
  // eslint-disable-next-line no-var
  var OBEL = spriteAt('obelisk', [o.cx, o.ay], o.g, {
    tags: ['decor', 'architecture', 'marble', 'neoclassical'],
  });
}
export const OBELISK = OBEL;

// ===========================================================================
// HEDGES — nullifiers, two heights, plus the arch that leaks
//
// Clipped hedge is the one green thing in the game that must have a HARD
// silhouette. Everything grow.js makes is deliberately ragged; a topiary or a
// clipped yew is the opposite claim — a gardener cut a solid out of a plant —
// and the reading depends entirely on the edge being straight. So these are
// authored, not composed, and the only irregularity allowed is a 1 px nick.
// ===========================================================================

/**
 * How thick a clipped hedge is, in the slab's depth units.
 *
 * THE OWNER: *"it would be nice if you could make the hedge a little more of a
 * cubic form too."* A clipped yew IS a cuboid — that is the entire point of
 * clipping it — and at 8 this was half a tile deep against a run (`LINE_W`) of
 * a full tile: a long thin ribbon standing on the grass.
 *
 * 16 IS ONE FULL TILE. A depth unit is two pixels across and one down (see
 * `X0 = 2 * D + 2` below), so 16 units is the 32 x 16 that one tile of ty
 * measures on screen. The hedge's plan is now SQUARE — a tile long and a tile
 * deep — which is what makes it read as a clipped mass rather than a screen,
 * and it is a number checkable against the projection rather than against
 * taste.
 *
 * The heights below follow from the same argument: `LEVEL_H` is 16, so a low
 * hedge at 14 is very nearly one terrace step and the tall one at 26 is not
 * quite two. Both deliberately a little under, so a hedge never looks taller
 * than the terrace it stands on.
 */
const HEDGE_DEPTH = 8;

function hedgeGrid(h, ramp, seed, nickRate = 0.14) {
  const D = HEDGE_DEPTH;
  const X0 = 2 * D + 2;
  const g = grid(X0 + LINE_W + 3, h + D + 24);
  const TOP = 3;
  const n = ramp.length - 1;

  // The TOP is a real surface. Take one gave the hedge a 2 px top and it came
  // out a green sheet standing on edge — the same fault as the bench. A hedge
  // is a box, and the box's lit top is most of what the player sees of it.
  slabBackEdge(g, X0, TOP, LINE_W, ramp[0]);
  slab(g, X0, TOP, LINE_W, D, (a, b, x, y) => {
    let v = n;
    const r = hash(x, y, seed);
    if (r < 0.2) v -= 1;
    else if (r > 0.9) v -= 2;
    if (b > D - 1.2) v = n - 1; // the near edge turns away a little
    return ramp[clamp(v, 0, n)];
  });

  // The front face, falling into its own shadow at the foot.
  slabFace(g, X0, TOP, LINE_W, D, h, (i, k) => {
    const x = X0 + i - 2 * D;
    const t = k / Math.max(1, h - 1);
    // The yew ramp is only three steps deep, and the first pass started the
    // front face one step below the top and fell almost immediately into the
    // darkest: on grass a tall hedge came out as a black void rather than as a
    // green mass. It now starts AT the top value and uses the whole ramp.
    let v = Math.round(n - t * (n - 0.25));
    const r = hash(x, k, seed + 2);
    if (r < 0.2) v -= 1;
    else if (r > 0.88) v += 1;
    if (k === 0) v = n; // the lit edge where the top turns over
    if (k === h - 1) v = 0;
    return ramp[clamp(v, 0, n)];
  });

  // Nicks. A clipped edge is straight but not machined; one pixel, no more —
  // and it has to come off the TOPMOST pixel, which is the back edge, or it
  // punches out the row below and leaves that stroke floating over a hole.
  for (let i = 0; i < LINE_W; i++) {
    if (hash(X0 + i, 0, seed + 5) < nickRate) put(g, X0 + i, slabBackEdgeY(TOP, i), '.');
    const fx = X0 + i - 2 * D;
    const fy = TOP + LINE_DROP(i) + D;
    if (hash(fx, 9, seed + 6) < nickRate * 0.7) put(g, fx, fy, ramp[n - 1]);
  }

  return { g, ax: X0 + 16 - D, ay: TOP + LINE_DROP(16) + D + h + 1 };
}

// ---------------------------------------------------------------------------
// ...AND THE SIXTEEN WAYS A HEDGE CAN MEET ITS NEIGHBOURS. js/iso.js §JOINING.
//
// The owner: *"things like hedges and fences can go around corners."* A run of
// hedges already joined — they are drawn along +tx and the wheel mirrors them
// onto +ty — but a CORNER was two finished bars crossing, with the bar on the
// corner tile carrying on past the turn and its end sticking out as a spike.
//
// THE HEDGE DOES NOT NEED A NEW GENERATOR, which is the pleasant part, and it
// falls out of two facts about the projection:
//
//   the bar runs down-right from the hub, so A VERTICAL CUT AT THE HUB
//   SEPARATES ITS TWO ARMS EXACTLY — everything left of the anchor column
//   reaches -tx and everything right of it reaches +tx;
//   a horizontal mirror swaps the two tile axes, so the SAME two halves,
//   reversed, are the -ty and +ty arms.
//
// So one bar gives all four arms and the sixteen states are overlays of them.
// Drawn back to front — the two arms that go away from the camera first — so a
// solid mass reads as one solid rather than as two slabs meeting.
// ---------------------------------------------------------------------------

{
  const lo = hedgeGrid(15, BOX, 41);
  const hi = hedgeGrid(30, YEW, 77, 0.1);
  // eslint-disable-next-line no-var
  var HLO = linearJoins('hedge-low', lo, {
    tags: ['decor', 'hedge', 'plant', 'nullifier', 'neoclassical'],
  });
  // eslint-disable-next-line no-var
  var HHI = linearJoins('hedge-tall', hi, {
    tags: ['decor', 'hedge', 'plant', 'nullifier', 'screen', 'neoclassical'],
  });
}
export const HEDGE_LOW = HLO;
export const HEDGE_TALL = HHI;

/**
 * Hedge arch — a tall hedge with a doorway cut through it. The most interesting
 * piece in the set, because the gap is a mechanic: influence is blocked by the
 * hedge but leaks through the opening, so a player can deliberately connect two
 * zones through a controlled gate.
 *
 * The reading depends on the opening being DARK and having a visible far side.
 * A hole cut in a hedge that shows the grass behind it reads as damage.
 */
function hedgeArchGrid() {
  // ------------------------------------------------------------------------
  // ONLY THE CROWN RISES. The owner, on an arch set into a tall-hedge run:
  //
  //   *"the tall hedge gate color matches, but not the location in space and
  //   it does have open edges."*
  //
  // It used to stand FOUR ABOVE THE TALL HEDGE over its whole length — the
  // entire bar at 34 against the hedge's 30 — which is a step at both ends
  // of every gateway. And a bar has no end cap, so the four pixels standing
  // proud of each neighbour showed the arch's raw lit cross-section with
  // nothing drawn on it. That is the "open edges", exactly.
  //
  // THE STONE GATE HAD THE ANSWER FIRST. props.js `drystoneGrid` raises only
  // the middle of its run: the ends stay at wall height, so a gateway meets
  // its neighbours flush and no cut face is ever exposed. This now does the
  // same, and it is also what a clipped yew arch looks like in a garden —
  // the hedge runs level and a squared crown stands over the doorway.
  //
  // So H IS THE TALL HEDGE'S HEIGHT, not four more than it, and the two must
  // still move together: the arch stands INSIDE that run (catalog
  // `joins: 'tall-hedge'`) and a gateway of a different height reads as a
  // separate object standing where a hedge is missing.
  // ------------------------------------------------------------------------
  const H = 30; // the tall hedge, exactly — hedgeGrid(30, YEW, 77, 0.1)
  const RISE = 6; // ...and how far the crown over the doorway stands proud
  const D = HEDGE_DEPTH;
  const X0 = 2 * D + 2;
  const g = grid(X0 + LINE_W + 3, H + RISE + D + 30);
  // HEADROOM FOR THE CROWN. Every other piece in this file starts at TOP = 3;
  // this one has something standing RISE above its own hedge line, and at 3 the
  // crown's far edge was cut off by the top of the grid — measurably, the arch
  // came out 2 px proud of the hedge instead of 6. A grid is only as tall as
  // the tallest thing in it, and the crown is not the hedge.
  const TOP = 3 + RISE;
  const n = YEW.length - 1;
  const MID = 16; // the doorway is at the middle of the run
  const HALF = 6.5;
  const CROWN = 10; // half the crown: a little wider than the jambs it carries
  const crowned = (i) => Math.abs(i - MID) <= CROWN;

  /** The lit top. Same speckle as the hedge's, so the two read as one clip. */
  const top = (b, x, y) => {
    let v = n;
    const r = hash(x, y, 91);
    if (r < 0.2) v -= 1;
    else if (r > 0.9) v -= 2;
    if (b > D - 1.2) v = n - 1;
    return YEW[clamp(v, 0, n)];
  };

  // The opening. It reads only if there is something INSIDE it: a lit soffit
  // running round the head, deep shade on the far jamb, and a strip of ground
  // at the bottom showing that the way actually goes through. A hole that
  // shows the lawn behind reads as damage, not as a gate.
  const inArch = (i, k) => {
    const d = (i - MID) / HALF;
    if (Math.abs(d) >= 1) return false;
    const head = Math.sqrt(1 - d * d) * 9;
    return k < 13 + head;
  };

  /**
   * The near face at run position `i`, `kk` px above the ground.
   *
   * THE GRADIENT IS MEASURED FROM THE GROUND, not from each column's own top,
   * which is the one thing that lets a crown six pixels taller sit in the same
   * foliage as the hedge beside it. Shading each column across its own height
   * would stretch the crown's ramp and draw a visible seam down both jambs.
   */
  const face = (i, kk) => {
    const x = X0 + i - 2 * D;
    if (inArch(i, kk)) {
      if (!inArch(i, kk + 1)) return 'l'; // the soffit, lit
      if (!inArch(i - 1, kk)) return 'k'; // the near jamb catching light
      if (kk < 3) return 'n'; // the ground seen through the gap
      if (kk < 5) return 'm';
      return 'j'; // the tunnel
    }
    const t = clamp((H - 1 - kk) / (H - 1), 0, 1);
    let v = Math.round(n - t * (n - 0.25));
    const r = hash(x, H - 1 - kk, 93);
    if (r < 0.2) v -= 1;
    else if (r > 0.88) v += 1;
    if (kk === 0) v = 0;
    return YEW[clamp(v, 0, n)];
  };

  // ------------------------------------------------------------------------
  // 1 · THE WHOLE HEDGE, CLOSED, ACROSS THE ENTIRE RUN — including under the
  // crown, where none of it will be seen.
  //
  // The owner: *"could we just make it so its always drawn closed and the
  // hedges that are in front of the other edges always overlap?"* Yes, and it
  // is the right instinct. The first version skipped the crowned run positions
  // here, on the reasoning that the crown covers them anyway. It does not
  // quite: the crown's top face sits RISE higher, so where it steps back down
  // to hedge height there was a wedge with NOTHING in it, and you could see
  // the grass through the hedge. Measured on a run of five with one arch:
  // **97 transparent pixels with hedge above them and hedge below them.** A
  // plain run measured zero.
  //
  // Drawing the body first and the crown over it costs a few hundred pixels
  // that are immediately overwritten and removes the whole class of fault.
  // THE PAINTER'S ALGORITHM IS THE POINT: draw every piece whole, in depth
  // order, and let the near ones cover the far ones. A piece that draws only
  // the parts it thinks will show has to be right about occlusion, and it is
  // cheaper to be closed than to be right.
  // ------------------------------------------------------------------------
  slabBackEdge(g, X0, TOP, LINE_W, YEW[0], (i) => !crowned(i));
  slab(g, X0, TOP, LINE_W, D, (a, b, x, y) => top(b, x, y));
  slabFace(g, X0, TOP, LINE_W, D, H, (i, k) => face(i, H - 1 - k));

  // 2 · The crown's CUT END, where it steps back down to the hedge. It is a
  // real surface — the clipped end of a squared crown, turned to +tx and so
  // away from the light — and until it was drawn, the eighteen pixels between
  // the crown's end and the hedge's cap were lawn. format.js §slabEndFace.
  slabEndFace(g, X0, TOP, D, MID + CROWN, RISE, (b, h, x, y) => {
    let v = n - 1; // a step under the top, which the light reaches and this does not
    if (hash(x, y, 94) < 0.25) v -= 1;
    return YEW[clamp(v, 0, n)];
  });

  // 3 · The crown over the doorway, RISE proud of it, carried down to the foot.
  slabBackEdge(g, X0, TOP - RISE, LINE_W, YEW[0], crowned);
  slab(g, X0, TOP - RISE, LINE_W, D, (a, b, x, y) => (crowned(a * 2) ? top(b, x, y) : null));
  slabFace(g, X0, TOP - RISE, LINE_W, D, H + RISE, (i, k) =>
    crowned(i) ? face(i, H + RISE - 1 - k) : null
  );

  // Nicks. A clipped edge is straight but not machined; one pixel, no more —
  // and it has to come off the TOPMOST pixel, or it punches out the row below
  // and leaves that stroke floating over a hole.
  //
  // ONLY WHERE THERE IS SKY ABOVE IT, which arithmetic alone cannot promise.
  // On a piece drawn at TWO heights the back edge is the topmost pixel of its
  // own stretch and not of its column: the crown's top face is a parallelogram
  // that leans 2*D columns further up-run than the crown's back edge reaches,
  // so for the columns either side of the crown it lies OVER the hedge's back
  // edge — and a nick aimed there bit a pixel clean out of the middle of the
  // foliage. One pixel, and the gap audit counted it, correctly: grass through
  // a hedge is grass through a hedge however small it is.
  //
  // So ask the grid instead of trusting the sum. A nick is a bite out of the
  // SILHOUETTE, which is the honest statement of what it is anyway.
  for (let i = 0; i < LINE_W; i++) {
    if (hash(X0 + i, 0, 96) >= 0.1) continue;
    const x = X0 + i;
    const y = slabBackEdgeY(TOP - (crowned(i) ? RISE : 0), i);
    let sky = true;
    for (let yy = y - 1; yy >= 0 && sky; yy--) if (peek(g, x, yy) !== '.') sky = false;
    if (sky) put(g, x, y, '.');
  }
  return { g, ax: X0 + MID - D, ay: TOP + LINE_DROP(MID) + D + H + 1 };
}

{
  const a = hedgeArchGrid();
  // eslint-disable-next-line no-var
  var HARCH = spriteAt('hedge-arch', [a.ax, a.ay], a.g, {
    tags: ['decor', 'hedge', 'plant', 'nullifier', 'gate', 'neoclassical'],
  });
}
/**
 * A GATE IN THE HEDGE'S RUN, not an ornament beside one.
 *
 * `axialJoins` gives it the sixteen connection states as two drawings — itself
 * and its mirror — so the hedges either side reach for it and it reaches back.
 * The catalogue does the other half: `joins: 'tall-hedge'` puts it in that
 * wall's group. Nothing about the ART says which wall it belongs to, which is
 * right: a gateway is a catalogue decision, and an artist who draws one should
 * not have to know what the designer will hang it in.
 */
export const HEDGE_ARCH = axialJoins(HARCH);

/** Topiary cone — clipped box, a true cone, with the same speckle as the ball. */
function topiaryConeGrid() {
  const g = grid(24, 46);
  const cx = 11;
  const H = 32;
  for (let k = 0; k < H; k++) {
    const t = k / (H - 1);
    const hw = Math.round(1 + t * 8.5);
    for (let dx = -hw; dx <= hw; dx++) {
      const d = (dx + hw * 0.4) / (hw + 1);
      let v = d < -0.35 ? 4 : d < 0.1 ? 3 : d < 0.6 ? 2 : 1;
      const r = hash(cx + dx, 3 + k, 53);
      if (r < 0.16) v -= 1;
      else if (r > 0.9) v += 1;
      put(g, cx + dx, 3 + k, BOX[clamp(v, 0, 4)]);
    }
    put(g, cx - hw, 3 + k, BOX[0]);
    put(g, cx + hw, 3 + k, BOX[0]);
  }
  // A short clipped stem, so it is a plant and not a green cone.
  for (let k = 0; k < 3; k++) {
    hline(g, cx - 1, cx + 1, 3 + H + k, 'r');
    put(g, cx - 1, 3 + H + k, 'q');
  }
  const base = 3 + H + 3;
  return { g, cx, ay: base };
}
{
  const c = topiaryConeGrid();
  // eslint-disable-next-line no-var
  var TCONE = spriteAt('topiary-cone', [c.cx, c.ay], c.g, {
    tags: ['decor', 'plant', 'topiary', 'neoclassical'],
  });
}
export const TOPIARY_CONE = TCONE;

/** Topiary sphere on a clipped stem. */
function topiarySphereGrid() {
  const g = grid(26, 44);
  const cx = 12;
  ballOfBox(g, cx, 14, 11);
  for (let k = 0; k < 9; k++) {
    hline(g, cx - 1, cx + 1, 25 + k, 'r');
    put(g, cx - 1, 25 + k, 'q');
    put(g, cx + 1, 25 + k, 'q');
  }
  const base = 34;
  return { g, cx, ay: base };
}
{
  const s = topiarySphereGrid();
  // eslint-disable-next-line no-var
  var TSPH = spriteAt('topiary-sphere', [s.cx, s.ay], s.g, {
    tags: ['decor', 'plant', 'topiary', 'neoclassical'],
  });
}
export const TOPIARY_SPHERE = TSPH;

// ===========================================================================
// FOUNTAINS
//
// All five carry water, so they lean naiad; being dressed and symmetrical they
// also lean unicorn. Water is authored in the water ramp F..K and every one of
// them declares `cycle`, so they shimmer with the pond for free.
// ===========================================================================

/** Water in a bowl: dark at the rim, light at the centre, one glint upper-left. */
function waterDisc(g, cx, cy, rx, ry) {
  for (let dy = -ry; dy <= ry; dy++) {
    const hw = rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    for (let dx = -hw; dx <= hw; dx++) {
      const d = Math.hypot(dx / rx, dy / ry);
      put(g, cx + dx, cy + dy, d > 0.86 ? 'G' : d > 0.62 ? 'H' : d > 0.3 ? 'I' : 'J');
    }
  }
  for (let dx = -Math.round(rx * 0.5); dx < 0; dx++) put(g, cx + dx, cy - Math.round(ry * 0.4), 'K');
}

/** A falling jet: two pixels wide, brightest at the top, breaking at the foot. */
function jet(g, x, y0, y1) {
  // ONE pixel of core. Take one drew a 2 px solid bar and every fountain grew
  // a teal popsicle stick; falling water is thin, brightest where it leaves the
  // nozzle, and it BREAKS on the way down.
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    put(g, x, y, t < 0.3 ? 'K' : t < 0.7 ? 'J' : 'I');
    if ((y - y0) % 4 === 1) put(g, x + ((y >> 1) & 1 ? 1 : -1), y, 'I');
  }
  put(g, x - 1, y1, 'K');
  put(g, x + 1, y1, 'K');
}

/** Tiered neoclassical fountain — three basins on one axis. The set piece. */
function tieredFountainGrid() {
  const g = grid(52, 60);
  const cx = 25;
  // Bottom basin.
  drum(g, cx, 40, 24, 6, { ramp: MARBLE, rim: true });
  waterDisc(g, cx, 40, 21, 10);
  drum(g, cx, 40, 24, 0, { ramp: MARBLE, top: (dx, dy, hw) => (Math.hypot(dx / 24, dy / 12) > 0.86 ? discKey(dx, dy, 24, 12, MARBLE) : null) || 'x' });
  // Redraw only the rim ring over the water.
  for (let dy = -12; dy <= 12; dy++) {
    const hw = 24 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 144));
    for (let dx = -hw; dx <= hw; dx++) {
      if (Math.hypot(dx / 24, dy / 12) > 0.87) put(g, cx + dx, 40 + dy, discKey(dx, dy, 24, 12, MARBLE));
    }
    put(g, cx - hw, 40 + dy, 'A');
    put(g, cx + hw, 40 + dy, 'A');
  }
  // Stem, middle basin, stem, top bowl.
  revolve(g, cx, 28, [4, 3, 3, 4, 5, 5, 4, 3, 3, 3, 4, 5], { ramp: MARBLE, flutes: 3 });
  drum(g, cx, 26, 14, 4, { ramp: MARBLE, rim: true });
  waterDisc(g, cx, 26, 11, 5);
  for (let dy = -7; dy <= 7; dy++) {
    const hw = 14 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 49));
    for (let dx = -hw; dx <= hw; dx++) if (Math.hypot(dx / 14, dy / 7) > 0.8) put(g, cx + dx, 26 + dy, discKey(dx, dy, 14, 7, MARBLE));
    put(g, cx - hw, 26 + dy, 'A');
    put(g, cx + hw, 26 + dy, 'A');
  }
  revolve(g, cx, 16, [3, 2, 2, 3, 4, 4, 3, 2, 2, 3], { ramp: MARBLE, flutes: 3 });
  drum(g, cx, 14, 8, 3, { ramp: MARBLE, rim: true });
  waterDisc(g, cx, 14, 6, 3);
  revolve(g, cx, 8, [1, 2, 2, 1, 1, 1], { ramp: MARBLE });
  // The water actually falling: top bowl to middle, middle to bottom.
  jet(g, cx - 1, 6, 12);
  for (const side of [-1, 1]) {
    for (let y = 17; y < 24; y++) put(g, cx + side * 7, y, y > 21 ? 'H' : 'J');
    for (let y = 29; y < 38; y++) put(g, cx + side * 13, y, y > 34 ? 'H' : 'J');
  }
  // A turned base is a circle on the ground: an ellipse, not a diamond.
  groundFoot(g, MARBLE, { round: true });
  return g;
}
export const FOUNTAIN_TIERED = spriteAt('fountain-tiered', [25, 58], tieredFountainGrid(), {
  tags: ['decor', 'fountain', 'marble', 'neoclassical', 'water'],
  cycle: { ramp: 'water', rate: 4 },
});

/**
 * Wall fountain with a mascaron spout. At 14 px the face reads by exactly three
 * things: two dark eye sockets, a dark open mouth with water issuing from it,
 * and a surrounding mass of hair wider than the skull. Anything else drawn on
 * it becomes noise.
 */
function wallFountainGrid() {
  const g = grid(38, 52);
  const cx = 18;
  // A dressed pier: ashlar courses, a moulded cornice at the head, a plinth at
  // the foot. Take one drew a plain slab and the whole object read as a door.
  for (let y = 5; y < 36; y++) {
    for (let x = 4; x < 33; x++) {
      let k = roundKey(x - cx, 16, MARBLE);
      if ((y - 5) % 6 === 5) k = 'B';
      else if (Math.floor((x + ((y - 5) / 6 | 0) * 5) / 10) !== Math.floor((x + 1 + ((y - 5) / 6 | 0) * 5) / 10)) k = 'B';
      if (x === 4 || x === 32) k = 'A';
      put(g, x, y, k);
    }
  }
  stamp(g, plinth(30, 0, MARBLE), 3, 0);
  // The niche: a round-headed recess. DARK, so the mascaron can be LIGHT
  // against it — take one carved a light face into a light wall and it
  // vanished. A recess is read from its inside corner, so the left cheek keeps
  // one step of light and everything else goes to the bottom of the ramp.
  for (let y = 11; y < 34; y++) {
    for (let x = 10; x < 27; x++) {
      const d = Math.hypot((x - cx) / 8, (y - 19) / 8);
      if (y < 19 && d > 1) continue;
      put(g, x, y, x < cx - 4 ? 'B' : 'A');
    }
  }
  // A fluted shell head over the niche — the family's flute, bent round again.
  for (let a = 0; a <= 180; a += 1.5) {
    const th = (a * Math.PI) / 180;
    for (let r = 4; r <= 8; r++) {
      const rib = Math.abs(((th * 7) / Math.PI) % 1);
      put(g, cx - r * Math.cos(th), 19 - r * Math.sin(th), rib < 0.2 ? 'B' : rib > 0.85 ? 'E' : 'C');
    }
  }
  for (let a = 0; a <= 180; a += 1.5) {
    const th = (a * Math.PI) / 180;
    put(g, cx - 9 * Math.cos(th), 19 - 9 * Math.sin(th), 'E');
    put(g, cx - 10 * Math.cos(th), 19 - 10 * Math.sin(th), 'A');
  }
  // The mascaron. At nine pixels a face is three things and no more: two dark
  // sockets, a dark open mouth with water coming out of it, and a mane wider
  // than the skull. Anything else drawn on it is noise.
  const my = 23;
  for (let dy = -4; dy <= 4; dy++) {
    const hw = Math.round(4 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 22)));
    for (let dx = -hw; dx <= hw; dx++) put(g, cx + dx, my + dy, roundKey(dx, hw + 0.6, MARBLE));
  }
  for (let a = 0; a < 22; a++) {
    const th = (a / 22) * Math.PI * 2;
    put(g, cx + 5.4 * Math.cos(th), my + 5.4 * Math.sin(th), a % 2 ? 'C' : 'E');
    put(g, cx + 6.6 * Math.cos(th), my + 6.4 * Math.sin(th), a % 2 ? 'A' : 'C');
  }
  put(g, cx - 2, my - 1, 'A');
  put(g, cx + 2, my - 1, 'A');
  put(g, cx - 1, my + 2, 'A');
  put(g, cx, my + 2, 'A');
  put(g, cx + 1, my + 2, 'A');
  put(g, cx, my + 3, 'A');
  jet(g, cx, my + 4, 36);
  // The basin at the foot.
  drum(g, cx, 39, 15, 5, { ramp: MARBLE, rim: true });
  waterDisc(g, cx, 39, 12, 6);
  for (let dy = -7; dy <= 7; dy++) {
    const hw = 15 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 56));
    for (let dx = -hw; dx <= hw; dx++) if (Math.hypot(dx / 15, dy / 7.5) > 0.82) put(g, cx + dx, 39 + dy, discKey(dx, dy, 15, 7, MARBLE));
    put(g, cx - hw, 39 + dy, 'A');
    put(g, cx + hw, 39 + dy, 'A');
  }
  // A turned base is a circle on the ground: an ellipse, not a diamond.
  groundFoot(g, MARBLE, { round: true });
  return g;
}
export const WALL_FOUNTAIN = spriteAt('wall-fountain', [18, 50], wallFountainGrid(), {
  tags: ['decor', 'fountain', 'marble', 'neoclassical', 'water'],
  cycle: { ramp: 'water', rate: 5 },
});

/** Simple jet basin — a low ring of dressed stone with a single jet. */
function jetBasinGrid() {
  const g = grid(46, 34);
  const cx = 22;
  drum(g, cx, 20, 21, 4, { ramp: MARBLE, rim: true });
  waterDisc(g, cx, 20, 18, 9);
  for (let dy = -10; dy <= 10; dy++) {
    const hw = 21 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 110));
    for (let dx = -hw; dx <= hw; dx++) if (Math.hypot(dx / 21, dy / 10.5) > 0.86) put(g, cx + dx, 20 + dy, discKey(dx, dy, 21, 10, MARBLE));
    put(g, cx - hw, 20 + dy, 'A');
    put(g, cx + hw, 20 + dy, 'A');
  }
  jet(g, cx - 1, 2, 19);
  // Ripple rings where it lands — a jet with no impact hangs in the air.
  for (const r of [4, 7]) {
    for (let a = 0; a < 24; a++) {
      const th = (a / 24) * Math.PI * 2;
      put(g, cx + r * Math.cos(th), 20 + (r / 2) * Math.sin(th), a % 2 ? 'K' : 'J');
    }
  }
  // A turned base is a circle on the ground: an ellipse, not a diamond.
  groundFoot(g, MARBLE, { round: true });
  return g;
}
export const JET_BASIN = spriteAt('jet-basin', [22, 32], jetBasinGrid(), {
  tags: ['decor', 'fountain', 'marble', 'neoclassical', 'water'],
  cycle: { ramp: 'water', rate: 4 },
});

/**
 * FOUNTAIN JET — the catalogue's `jet-basin`, properly dressed.
 *
 * The understudy it replaces is a ring of stone lying flat in the grass with a
 * straight blue line rising out of it, and the straight line is the problem:
 * one pixel column of water going up and stopping reads as a thermometer, a
 * pole, a flag — anything but a fountain. A jet is a PARABOLA. It leaves the
 * nozzle fast and vertical, loses, arches over, and comes down as separate
 * drops a little way out from where it started, and drawing the two falling
 * limbs is what makes the vertical core read as pressure rather than as a
 * stick. Everything else here is DECOR.md's word "dressed": the bowl stands on
 * the family plinth instead of sitting on the turf, and it has a moulded rim
 * rather than an edge.
 */
function fountainJetGrid() {
  const g = grid(46, 50);
  const cx = 22;
  const BOWL = 26; // the bowl's centre row

  // The plinth first, so the bowl draws over its cap.
  stamp(g, plinth(28, 4, MARBLE), cx - 14, BOWL + 3);

  // The bowl: a drum with a real moulded rim — a lit top annulus, a dark
  // reveal under it, then the bowl's own wall. Three rows of moulding is the
  // whole difference between "dressed" and "a ring".
  drum(g, cx, BOWL, 17, 6, { ramp: MARBLE, rim: true });
  waterDisc(g, cx, BOWL, 13, 6);
  for (let dy = -9; dy <= 9; dy++) {
    const hw = 17 * Math.sqrt(Math.max(0, 1 - (dy * dy) / 81));
    for (let dx = -hw; dx <= hw; dx++) {
      const q = Math.hypot(dx / 17, dy / 8.5);
      if (q > 0.80) put(g, cx + dx, BOWL + dy, discKey(dx, dy, 17, 8, MARBLE));
      else if (q > 0.74) put(g, cx + dx, BOWL + dy, 'B'); // the reveal
    }
    put(g, cx - hw, BOWL + dy, 'A');
    put(g, cx + hw, BOWL + dy, 'A');
  }

  // NO NOZZLE. A turned boss standing in the water is the obvious thing to
  // draw and it was the worst pixel in the piece: revolve() outlines in the
  // darkest marble, and the darkest marble against the water ramp is two black
  // bars, which met the dark rim at the back of the bowl and drew a heart in
  // the middle of the fountain. A jet leaves the surface; the surface is
  // enough.

  // The jet. Core first, then the two falling limbs.
  jet(g, cx, BOWL - 22, BOWL - 6);
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      // A parabola: fast out of the top, dropping away as it goes. Drawn from
      // the crown of the jet outward and down into the bowl's own water.
      const x = cx + side * (1 + t * 8.5);
      const y = BOWL - 22 + 1 + t * t * 17;
      // It BREAKS as it falls — a solid arc is a hoop of wire — and it breaks
      // the SAME WAY on both sides, because a jet is symmetrical and the eye
      // notices when one limb is drawn and the other dotted.
      if (t < 0.45 || (i & 1) === 0) put(g, x, y, t < 0.35 ? 'K' : t < 0.75 ? 'J' : 'I');
      if (t > 0.55 && (i & 3) === 1) put(g, x, y + 1, 'H');
    }
  }
  // Where the limbs land: a small ripple ring apiece, on the ground plane's
  // own 2:1, so the water arrives somewhere instead of merely stopping.
  for (const side of [-1, 1]) {
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      put(g, cx + side * 9 + 4 * Math.cos(th), BOWL - 3 + 2 * Math.sin(th), a & 1 ? 'K' : 'J');
    }
  }
  return g;
}
// The anchor is the plinth's own foot: 26 (the bowl) + 3 + plinthH(4) = 40,
// stated as arithmetic so adding a moulding cannot silently move its feet.
export const FOUNTAIN_JET = spriteAt('fountain-jet', [22, 26 + 3 + plinthH(4)], fountainJetGrid(), {
  tags: ['decor', 'fountain', 'marble', 'neoclassical', 'water', 'dressed-stone'],
  cycle: { ramp: 'water', rate: 4 },
});

/**
 * Shell fountain — a scallop basin on a short baluster, water spilling over the
 * lip. The shell reads by its RADIAL FLUTES, which are the same flutes as the
 * column and the urn bent around a curve. That is the family joke and it is
 * also just how a scallop works.
 */
function shellFountainGrid() {
  const g = grid(40, 40);
  const cx = 19;
  const cy = 13;
  const RX = 17;
  const RY = 9;
  // A scallop is a FAN, hinged at the back, and it reads by its radial ribs —
  // which are this file's flutes bent round a curve. Take one drew a shallow
  // dome with three faint ribs and got a mushroom.
  const HX = 0;
  const HY = -7; // the hinge, behind and above the centre
  for (let dy = HY; dy <= RY + 1; dy++) {
    const t = 1 - (dy * dy) / ((RY + 2) * (RY + 2));
    const hw = t <= 0 ? 0 : RX * Math.sqrt(Math.min(1, t + 0.35));
    for (let dx = -hw; dx <= hw; dx++) {
      const az = Math.atan2(dy - HY, dx - HX);
      const rib = Math.abs(((az * 11) / Math.PI) % 1);
      let k = roundKey(dx, RX, MARBLE);
      if (rib < 0.17) k = 'B';
      else if (rib > 0.86) k = 'E';
      put(g, cx + dx, cy + dy, k);
    }
    put(g, cx - hw, cy + dy, 'A');
    put(g, cx + hw, cy + dy, 'A');
  }
  // The hinge boss.
  revolve(g, cx, cy + HY - 2, [2, 3, 3, 2], { ramp: MARBLE });
  waterDisc(g, cx, cy + 1, 10, 4);
  // Scalloped lip: a row of small arcs, never a smooth curve.
  for (let dx = -RX; dx <= RX; dx++) {
    const t = 1 - (dx * dx) / (RX * RX);
    if (t < 0) continue;
    const y = cy + (RY + 1) * Math.sqrt(Math.min(1, t + 0.3)) - 1 + (Math.abs(dx % 5) < 2 ? 1 : 0);
    put(g, cx + dx, y, 'D');
    put(g, cx + dx, y + 1, 'B');
    put(g, cx + dx, y + 2, 'A');
  }
  for (let y = cy + RY; y < 25; y++) put(g, cx - 1 + ((y & 1) ? 0 : 1), y, y > 22 ? 'H' : 'J');
  revolve(g, cx, 22, [3, 2, 2, 3, 4, 4, 3, 3, 5, 7, 8], { ramp: MARBLE, flutes: 3 });
  const base = 33;
  return g;
}
export const SHELL_FOUNTAIN = spriteAt('shell-fountain', [19, 33], shellFountainGrid(), {
  tags: ['decor', 'fountain', 'marble', 'neoclassical', 'water'],
  cycle: { ramp: 'water', rate: 6 },
});

/**
 * RILL — a narrow straight water channel, and the formal garden's signature.
 * It is a beam() of dressed kerb either side of a strip of moving water, so a
 * run of them reads as one continuous channel with no seam.
 */
function rillGrid() {
  const KERB = 2;
  const CHAN = 5;
  const D = KERB * 2 + CHAN;
  const X0 = 2 * D + 2;
  const g = grid(X0 + LINE_W + 3, 30);
  const TOP = 3;
  // Far kerb.
  slabBackEdge(g, X0, TOP, LINE_W, 'A');
  slab(g, X0, TOP, LINE_W, KERB, (a, b) => (b < 1 ? 'D' : 'E'));
  slabFace(g, X0, TOP, LINE_W, KERB, 2, (i, k) => (k ? 'A' : 'B'));
  // The water, two rows lower than the kerb tops: a rill is a CHANNEL, and a
  // channel whose water is flush with its kerbs is a painted stripe.
  const wx = X0 - 2 * KERB;
  const wy = TOP + KERB + 2;
  slab(g, wx, wy, LINE_W, CHAN, (a, b, x, y) => {
    const t = b / CHAN;
    const k = t < 0.18 ? 'G' : t < 0.4 ? 'I' : t < 0.75 ? 'J' : 'H';
    return hash(x, y, 13) > 0.9 ? 'K' : k;
  });
  // Near kerb, sitting on the channel's near edge.
  const nx = wx - 2 * CHAN;
  const ny = wy + CHAN - 2;
  return { g, ax: nx + 16 - KERB, ay: ny + LINE_DROP(16) + KERB + 4 };
}
const RILL_G = rillGrid();
export const RILL = spriteAt('rill', [RILL_G.ax, RILL_G.ay], RILL_G.g, {
  tags: ['decor', 'water', 'marble', 'neoclassical', 'rill'],
  cycle: { ramp: 'water', rate: 3 },
});

// ===========================================================================
// GROUND AND PATHS
//
// 64x32 diamonds, exactly like js/art/tiles.js: the opaque pixels are one
// isometric diamond and nothing else. These are the DRESSED versions — the
// terrain module owns the plain gravel and the plain flagstone, these are the
// pieces that belong to the neoclassical family.
// ===========================================================================

export const TILE_W = 64;
export const TILE_H = 32;

/** The opaque run on row y of a 64x32 diamond. */
function rowSpan(y) {
  const t = y < TILE_H / 2 ? y : TILE_H - 1 - y;
  return { x0: 30 - 2 * t, len: 4 * t + 4 };
}

/** Diamond -> unit square, so paving joints run along the TILE axes. */
function square(x, y) {
  const u = (x - 31.5) / 32;
  const v = (y - 15.5) / 16;
  return { s: (u + v + 1) / 2, t: (u - v + 1) / 2 };
}

function tile(name, paint, opts = {}) {
  const g = grid(TILE_W, TILE_H);
  for (let y = 0; y < TILE_H; y++) {
    const { x0, len } = rowSpan(y);
    for (let x = x0; x < x0 + len; x++) put(g, x, y, paint(x, y));
  }
  return spriteAt(name, [32, 16], g, { tags: opts.tags || ['decor', 'ground'], cycle: opts.cycle || null });
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const dither = (a, b, d, x, y) => (d * 16 > BAYER4[y & 3][x & 3] ? b : a);

/**
 * Gravel walk. Raked, warm, and — this is the whole legibility trick — a
 * DARKER BAND at the diamond's edge. The band is what makes a run of gravel
 * read as a path with sides rather than as a grey field.
 */
export const GRAVEL_WALK = tile(
  'gravel-walk',
  (x, y) => {
    const { s, t } = square(x, y);
    const edge = Math.min(s, t, 1 - s, 1 - t);
    const n = hash(x, y, 3);
    // Take one framed the diamond in the darkest rock and a run of gravel came
    // out looking like a grid of black-bordered tiles. The edge band has to be
    // ONE step down and two pixels wide — enough to say "the path has a side",
    // not enough to draw a box.
    let k = dither('x', 'y', 0.62, x, y);
    if (n < 0.18) k = 'w';
    else if (n > 0.86) k = 'u'; // warm grains, so it is gravel and not concrete
    if (Math.abs((t * 11) % 1) < 0.09) k = 'w'; // rake lines
    if (edge < 0.05) k = 'w';
    return k;
  },
  { tags: ['decor', 'ground', 'path', 'nullifier', 'gravel'] }
);

/**
 * Flagstone court — large dressed slabs. Joints run along BOTH tile axes,
 * which is the only way paving reads as lying on the ground plane; a grid
 * drawn square on the screen is the loudest possible flat-art tell.
 */
export const FLAGSTONE_COURT = tile(
  'flagstone-court',
  (x, y) => {
    const { s, t } = square(x, y);
    const fs = (s * 3) % 1;
    const ft = (t * 3) % 1;
    if (fs < 0.055 || ft < 0.055) return 'A'; // the joints
    if (fs < 0.11 || ft < 0.11) return 'B';
    const cell = Math.floor(s * 3) * 3 + Math.floor(t * 3);
    const n = hash(x, y, 7 + cell);
    // Each slab gets its own value, so the court is not one grey plane, and a
    // little wear speckle inside it.
    const base = ['C', 'D', 'D', 'C', 'D'][cell % 5];
    if (n < 0.1) return base === 'D' ? 'C' : 'B';
    if (n > 0.93) return 'E';
    return base;
  },
  { tags: ['decor', 'ground', 'path', 'flagstone', 'neoclassical'] }
);

// ---------------------------------------------------------------------------
// THE DRESSED PAVINGS — flagstone-dressed and terrace-paving-edged.
//
// WHICH WAY IS UP-LEFT ON A DIAMOND, once, so neither of them has to guess.
// square() maps the diamond onto the unit square with the four tile vertices
// at W=(0,0), N=(0,1), E=(1,1), S=(1,0). Screen-left is W and screen-top is N,
// so the two edges facing the light are
//
//        s = 0   the NW edge (W->N)     fully lit
//        t = 1   the NE edge (N->E)     half lit
//
// and the two facing away are
//
//        t = 0   the SW edge (W->S)     half shaded
//        s = 1   the SE edge (S->E)     fully shaded
//
// A chamfered slab arris therefore lightens as `s` falls and as `t` RISES, and
// that asymmetry is what stops paving reading as a flat printed grid: every
// slab is a shallow box with a lit corner at the top-left and a dark one at
// the bottom-right, exactly as SPEC §3 asks of a cube.
//
// (The plain flagstone in art/tiles.js lights low-s AND low-t, i.e. it treats
// the SW edge as lit. It is a different painter with a shipped calibration and
// is left alone here; these two are authored to the rule.)
// ---------------------------------------------------------------------------

/** Ramp index -> key, so a painter can add and subtract steps arithmetically. */
const M = (i) => MARBLE[clamp(Math.round(i), 0, 4)];

/**
 * The chamfer. Two steps at the very arris, one on the slope inside it, and a
 * NARROWER band on the half-lit / half-shaded pair — a slab lit equally on all
 * four sides is a tile with a bevel filter on it, not a stone in the ground.
 */
function arrisLift(fs, ft) {
  let d = 0;
  if (fs < 0.08) d += 2;
  else if (fs < 0.19) d += 1;
  if (fs > 0.93) d -= 2;
  else if (fs > 0.82) d -= 1;
  if (ft > 0.93) d += 1;
  else if (ft > 0.84) d += 0.5;
  if (ft < 0.07) d -= 1;
  else if (ft < 0.16) d -= 0.5;
  return d;
}

/**
 * (s, t) units per pixel measured along an edge normal. The diamond is 64x32,
 * so a step of one pixel perpendicular to an edge moves `s` (or `t`) by about
 * 0.014 — which is the number that turns "five pixels of kerb" into a band
 * width, and getting it wrong by the obvious factor of ten is how the first
 * terrace tile came out with a thirteen-pixel apron round two of its sides.
 */
const PER_PX = 1 / 71.5;

/** A joint: dark, gritty, and green. Moss finds a close joint within a year. */
function jointKey(x, y, seed) {
  const j = hash(x, y, seed);
  if (j > 0.90) return 'B';
  if (j > 0.66) return 'n'; // moss, in the GRASS ramp so it belongs to the lawn
  if (j > 0.58) return 'm';
  return 'A';
}

/**
 * FLAGSTONE, DRESSED — the neoclassical paving proper, and the one the
 * catalogue's `flagstone` has been waiting for.
 *
 * FOUR slabs to the tile rather than the court's nine. That is the whole
 * difference and it is deliberate: a big slab is expensive to cut and to move,
 * so big slabs read as MONEY, which is what "dressed" has to say against the
 * gravel walk beside it. Nine small ones read as a yard.
 *
 * Values stay in the lower half of the marble ramp for flagstone()'s reason,
 * written down in art/tiles.js and worth repeating: paving that sits at D/E
 * out-shines the sculpture, and the sculpture is the one thing in this game
 * allowed to be the brightest object on screen.
 */
export const FLAGSTONE_DRESSED = tile(
  'flagstone-dressed',
  (x, y) => {
    const { s, t } = square(x, y);
    const gs = s * 2;
    const gt = t * 2;
    const cx = Math.min(1, Math.floor(gs));
    const cy = Math.min(1, Math.floor(gt));
    const fs = gs - cx;
    const ft = gt - cy;

    // A CLOSE joint — one and a half pixels. The court's is three and reads as
    // mortar; dressed paving is butted, and the joint is a line of dirt.
    const J = 0.045;
    if (fs < J || ft < J || fs > 1 - J || ft > 1 - J) return jointKey(x, y, 41 + cx * 3 + cy);

    // Per-slab value, so no two slabs came out of the same block, and only
    // ever between B and C.
    // HALF A STEP between slabs, not a whole one. The first pass drew them a
    // whole ramp step apart and four slabs to a tile came out as a chequer —
    // which is the one pattern paving must not make, because a run of them
    // then reads as a draughtboard rather than as a floor. The structure comes
    // from the arris; the per-slab value is only there to say "different
    // block", and half a step says that perfectly well.
    const cell = cx * 2 + cy;
    const base = 1.35 + (hash(cell, cell, 313) > 0.5 ? 0.25 : -0.25);
    let v = base + arrisLift(fs, ft);

    // Wear, always into the ramp. A worn hollow in the middle of a slab where
    // feet have gone over it for a century — sampled on a blotch so it is a
    // patch and not a fizz.
    const n = hash(x, y, 47 + cell);
    if (n < 0.05) v -= 1;
    else if (n > 0.955) v += 1;
    if (hash(x >> 2, y >> 1, 59 + cell) > 0.86) v -= 0.5;
    return M(v);
  },
  { tags: ['decor', 'ground', 'path', 'flagstone', 'dressed-stone', 'neoclassical'] }
);

/**
 * TERRACE PAVING WITH AN EDGE COURSE.
 *
 * ELEVATION.md shipped and the terraces are real, so the thing this piece was
 * always for finally exists: the flat top of a terrace, finished at a moulded
 * edge above the drop.
 *
 * WHAT I GOT WRONG FIRST, because it is the whole design of the piece.
 *
 * The obvious authoring is a kerb along the two DOWN-SLOPE rims only — the SW
 * and SE edges, which are the two a cliff face is ever drawn under (see
 * art/tiles.js SIDE_KEYS) — and plain paving on the two uphill sides. Rendered
 * alone that is exactly right. Rendered as a 3x3 court, which is how a player
 * actually lays ground, it is a disaster: every interior tile draws its own
 * kerb, so the terrace comes out as a lattice of dark right-angles and the
 * edge stops meaning "edge" the moment there are two of them.
 *
 * The catalogue's design note names the true fix — an auto-edging pass keyed on
 * level difference, the way the shoreline is keyed on wet/dry — and it is right,
 * and it is not a brush's job. So this tile is authored to be correct BOTH
 * WAYS, which turns out to be a real neoclassical paving pattern rather than a
 * compromise: a PANEL of field slabs inside a BORDER COURSE that runs all four
 * ways round the tile.
 *
 *   * laid as a court, adjacent borders meet and read as the wide banker course
 *     between panels, which is how any dressed terrace is actually set out;
 *   * laid along a lip, the border on the down-slope side IS the edge course —
 *     and it is told apart from the other three by a dark NOSING at the very
 *     rim, where the stone turns over the drop. Take away the nosing and the
 *     paving does not stop, it merely runs out.
 *
 * One tile, both readings, no neighbourhood pass required.
 */
export const TERRACE_PAVING_EDGED = tile(
  'terrace-paving-edged',
  (x, y) => {
    const { s, t } = square(x, y);
    // Distance in PIXELS from each of the four rims.
    const dNW = s / PER_PX;
    const dSE = (1 - s) / PER_PX;
    const dSW = t / PER_PX;
    const dNE = (1 - t) / PER_PX;
    const d = Math.min(dNW, dSE, dSW, dNE);
    const BORDER = 8; // one course of border, eight pixels of tread

    if (d < BORDER) {
      const down = d === dSE || d === dSW; // is this rim the one above the drop?

      // The nosing, and ONLY on the down-slope rims. On the two uphill rims the
      // border simply runs on into its neighbour's border, which is what lets a
      // court read as panels rather than as a grid of framed squares.
      if (d < 1.3) return down ? 'A' : jointKey(x, y, 71);
      if (d < 2.6 && down) return 'B'; // the reveal above the nosing

      // Cross joints, on the along-the-rim coordinate so the four borders
      // mitre at the vertices instead of crossing.
      const run = d === dSE || d === dNW ? t : s;
      if (Math.abs(((run * 3) % 1) - 0.5) > 0.472) return jointKey(x, y, 73);
      if (d > BORDER - 1.5) return jointKey(x, y, 75); // joint to the panel

      // The border is BETTER stone than the panel: cut square, less walked on,
      // and it carries the light across its width — a lit chamfer just inside
      // the rim falling away to the panel joint.
      let v = 1.6 + (d < 4.6 ? 0.8 : 0) - (down ? 0.35 : 0);
      const n = hash(x, y, 79);
      if (n < 0.06) v -= 1;
      else if (n > 0.965) v += 1;
      return M(v);
    }

    // The panel: exactly the paving of flagstone-dressed at a smaller gauge, so
    // a terrace top and the court below it are the same floor.
    const inner = (v, lo, hi) => (v - lo) / (hi - lo);
    const ps = inner(s, BORDER * PER_PX, 1 - BORDER * PER_PX);
    const pt = inner(t, BORDER * PER_PX, 1 - BORDER * PER_PX);
    const cx = Math.min(1, Math.max(0, Math.floor(ps * 2)));
    const cy = Math.min(1, Math.max(0, Math.floor(pt * 2)));
    const fs = clamp(ps * 2 - cx, 0, 1);
    const ft = clamp(pt * 2 - cy, 0, 1);
    const J = 0.05;
    if (fs < J || ft < J || fs > 1 - J || ft > 1 - J) return jointKey(x, y, 83 + cx * 3 + cy);
    const cell = cx * 2 + cy;
    let v = 1.35 + (hash(cell, cell, 317) > 0.5 ? 0.25 : -0.25) + arrisLift(fs, ft);
    const n = hash(x, y, 89 + cell);
    if (n < 0.055) v -= 1;
    else if (n > 0.95) v += 1;
    return M(v);
  },
  { tags: ['decor', 'ground', 'path', 'flagstone', 'dressed-stone', 'neoclassical', 'terrace'] }
);

/** Stepping stones — three slabs in the grass, on the tx diagonal. */
export const STEPPING_STONES = tile(
  'stepping-stones',
  (x, y) => {
    const { s, t } = square(x, y);
    for (const c of [0.24, 0.5, 0.76]) {
      const d = Math.hypot((s - c) / 0.16, (t - c) / 0.16);
      if (d < 1) {
        const n = hash(x, y, 19);
        // Pale worn limestone: the slabs have to be LIGHTER than the turf or
        // they read as holes in the lawn, which is what take one drew.
        if (d > 0.9) return 'w';
        return n < 0.16 ? 'x' : n > 0.9 ? 'A' : 'y';
      }
      if (d < 1.1) return 'n'; // where the slab presses into the turf
    }
    const m = hash(x, y, 5);
    return m < 0.16 ? 'n' : m > 0.9 ? 'p' : 'o';
  },
  { tags: ['decor', 'ground', 'path', 'stepping-stones'] }
);

/**
 * Mosaic panel — the one place in the game where a straight geometric pattern
 * is correct, so it is worth doing properly: a guilloche border, a meander
 * field and a rosette at the centre, in marble with terracotta accents.
 */
export const MOSAIC_PANEL = tile(
  'mosaic-panel',
  (x, y) => {
    const { s, t } = square(x, y);
    const edge = Math.min(s, t, 1 - s, 1 - t);
    // Restrained. Take one used a saturated terracotta band and a bright
    // centre and the panel shouted louder than anything else on the map;
    // RESEARCH's rule is that nothing here is a pure hue. The pattern carries
    // the reading, the colour stays in the marble ramp with two accents.
    if (edge < 0.035) return 'A';
    if (edge < 0.11) {
      const u = (s + t) * 6;
      return Math.sin(u * Math.PI) > 0 ? 'D' : 'B'; // guilloche, marble on marble
    }
    if (edge < 0.145) return 'A';
    const r = Math.hypot(s - 0.5, t - 0.5);
    if (r < 0.055) return 'Q'; // the rosette: eight pixels of terracotta
    if (r < 0.085) return 'C';
    if (r < 0.105) return 'A';
    // Meander: a stepped key on the tile axes, two values apart.
    const a = Math.floor(s * 9) % 2;
    const b = Math.floor(t * 9) % 2;
    if (a !== b) return 'B';
    return hash(x, y, 29) > 0.92 ? 'C' : 'D';
  },
  { tags: ['decor', 'ground', 'path', 'mosaic', 'neoclassical'] }
);

// ===========================================================================
// CONNECTORS — ELEVATION.md
//
// Terrain is always flat-topped; a level change is always a clean vertical
// cliff; and to get up one the player places a CONNECTOR that bridges exactly
// one level over one tile. LEVEL_H is 16, so every connector in this section
// rises exactly 16 px over one tile, and it does it in FOUR of the family's
// 4 px treads.
//
// ---------------------------------------------------------------------------
// ORIENTATION, and this comment used to be WRONG in a way that cost the player
// half the compass.
//
// It read: "all four ascend toward the UPPER LEFT (the -tx neighbour). The
// other three orientations are a horizontal flip and/or a re-anchor, which the
// renderer can do for free — authoring four rotations of each would be four
// times the pixels for no new information."
//
// The flip is real and it is free. What it gives you is the OTHER ramp that
// climbs away from the camera: mirroring the screen's x axis swaps the two
// tile axes, so ascending toward -tx becomes ascending toward -ty. Both of
// those go uphill into the screen.
//
// It cannot give you the two that come DOWNHILL AT YOU. Ascending toward +tx
// is the 180-degree rotation of ascending toward -tx, and a 180-degree
// rotation on screen is a horizontal flip AND A VERTICAL ONE — which is not a
// transform this game may use, because the light is always from the upper left
// and flipping vertically puts the lit face underneath. A ramp tilted toward
// the camera shows a different surface, a different silhouette and different
// shading. It is a second drawing, and it always was.
//
// So: TWO DRAWINGS, FOUR FACINGS. `js/iso.js` §FACING has said exactly this
// since it was written — bit 0 is the mirror, bit 1 chooses the drawing — and
// this is the first placeable to use bit 1.
//
//     facing  rise      ascends toward   on screen
//     0       1 - s     -tx              uphill, away to the upper LEFT
//     1       (mirror)  -ty              uphill, away to the upper RIGHT
//     2       s         +tx              uphill, toward the lower RIGHT
//     3       (mirror)  +ty              uphill, toward the lower LEFT
//
// `square(x, y)` puts s = 0 on the W-N edge and s = 1 on the S-E edge, so
// `1 - s` lifts the far side and `s` lifts the near one. That is the whole
// difference between the two drawings; everything else is shared.
// ===========================================================================

// iso.js's, re-exported rather than re-typed — a connector that rises by a
// different number of pixels than the terrace it climbs is the one bug in this
// file that would look like art rather than arithmetic.
export { LEVEL_H };

/**
 * The connector's plan. A tile diamond spans 64x32; a ramp climbing toward the
 * -tx neighbour lifts the W and N vertices by LEVEL_H and leaves E and S on the
 * ground, so its top surface is a sheared diamond. `surfaceY(x, y)` is the rise
 * at a point on the diamond, and everything else follows from it.
 */
function rampSurface(paintTop, paintFace, opts = {}) {
  const H = TILE_H + LEVEL_H + (opts.pad || 4);
  const g = grid(TILE_W, H);
  const Y0 = LEVEL_H; // where the un-raised diamond would sit
  const step = opts.step || 0; // >0 quantises the rise into treads
  // WHICH WAY IT CLIMBS, as a height field over the tile: 1 at the top of the
  // slope, 0 at the foot. `1 - s` is the drawing that has always existed;
  // `s` is its 180-degree twin, the one the mirror cannot reach. See the
  // section header. Anything else here would not be a ramp between two
  // adjacent levels, so the two are the whole set.
  const near = !!opts.near;
  const rise = near ? (sq) => sq.s : (sq) => 1 - sq.s;
  // BACK TO FRONT. Take one ran the loop front-to-back and every column's side
  // face was overpainted by the column behind it, which is why the earth ramp
  // came out a flat brown lozenge and the rock scramble came out solid black.
  for (let y = 0; y < TILE_H; y++) {
    const { x0, len } = rowSpan(y);
    for (let x = x0; x < x0 + len; x++) {
      const raw = LEVEL_H * clamp(rise(square(x, y)), 0, 1);
      const lift = step ? Math.floor(raw / step) * step : Math.round(raw);
      const sy = Y0 + y - lift;
      // How far down to carry the side face: enough to cover the drop to the
      // next column forward, and all the way to the ground on the two lower
      // edges of the diamond, which is where the wedge is actually visible.
      //
      // ...EXCEPT THE EDGE IT CLIMBS. A ramp only exists against a step, and
      // the step buries the edge the ramp meets it on. For the away-facing
      // drawing that edge is N-W, at the back, and a face there was hidden by
      // the ramp's own surface — so nobody ever had to say this. For the
      // near-facing one it is S-E, which is a NEAR edge, and carrying a full
      // 16 px wall down it painted a dark band straight across the terrace
      // the ramp is joining: terrain draws before objects, so the ramp's own
      // internal face lands on top of the tile that ought to hide it.
      const climbing = near && x >= x0 + len - 2;
      const edge = !climbing && y >= TILE_H / 2 && (x <= x0 + 1 || x >= x0 + len - 2);
      // A SMOOTH ramp must carry almost no face per column: adjacent columns
      // differ by half a pixel, so a 4 px face under each one showed as
      // corduroy ribbing all the way up the earth ramp. A stepped one needs a
      // full riser. Only the two lower edges of the diamond carry the wedge.
      const depth = edge ? lift + 2 : opts.face || (step ? step + 1 : 2);
      for (let k = 1; k <= depth; k++) put(g, x, sy + k, paintFace(x, y, k, lift, raw));
      put(g, x, sy, paintTop(x, y, lift, raw));
    }
  }
  return { g, H };
}

/** Earth ramp — rough, un-dressed, archaic. Bare trodden soil with a lip. */
function earthRampGrid(near = false) {
  const { g, H } = rampSurface(
    (x, y) => {
      const n = hash(x, y, 33);
      // Trodden earth: worn pale down the middle where feet go, darker at the
      // sides where the turf is creeping back in.
      const { t } = square(x, y);
      const centre = 1 - Math.abs(t - 0.5) * 2;
      let k = centre > 0.5 ? 'u' : centre > 0.2 ? 't' : 's';
      if (n < 0.16) k = 's';
      else if (n > 0.88) k = 'u';
      return k;
    },
    // The per-column face is painted in the SAME earth as the surface. Take
    // two used the darkest key and every row's one exposed pixel became a
    // stripe: the whole slope came out corduroy. The wedge's real side faces
    // are on the diamond's two lower edges, and those still go dark —
    // BUT IN TWO VALUES, NOT ONE.
    //
    // The away-facing ramp shows only a corner of its wedge and got away with
    // a single darkest key. The near-facing one is nearly ALL wedge: its high
    // end is the edge closest to the camera, so what you see is a 16 px end
    // wall with a sliver of slope above it. In one value that wall reads as a
    // hole in the ground rather than as a bank of earth — step 4's finding
    // about generated feet, arriving at the top of the object instead of the
    // bottom. The two lower edges of a diamond face opposite ways: the left
    // one is turned toward the light and the right one away.
    (x, y, k, lift) => {
      if (lift <= 3 || k <= 1) return hash(x, y + k, 44) > 0.5 ? 't' : 's';
      return x < TILE_W / 2 ? 'r' : 'q';
    },
    { face: 1, near }
  );
  // A scatter of stones holding the toe, and turf creeping over the edges.
  for (let i = 0; i < 26; i++) {
    const x = 12 + Math.floor(hash(i, 0, 61) * 40);
    const y = LEVEL_H + 14 + Math.floor(hash(i, 1, 61) * 14);
    if (peek(g, x, y) === '.') continue;
    put(g, x, y, 'w');
    put(g, x + 1, y, 'x');
    put(g, x, y + 1, 'v');
  }
  return { g, H };
}
{
  const near = earthRampGrid(true);
  const r = earthRampGrid();
  // eslint-disable-next-line no-var
  var ERAMP_NEAR = spriteAt('earth-ramp-near', [32, LEVEL_H + 16], near.g, {
    tags: ['decor', 'connector', 'earth', 'archaic', 'ramp'],
  });
  // eslint-disable-next-line no-var
  var ERAMP = spriteAt('earth-ramp', [32, LEVEL_H + 16], r.g, {
    tags: ['decor', 'connector', 'earth', 'archaic', 'ramp'],
    back: ERAMP_NEAR,
  });
}
export const EARTH_RAMP = ERAMP;
export const EARTH_RAMP_NEAR = ERAMP_NEAR;

/**
 * Stone stair — dressed steps, neoclassical. FOUR treads of the family profile,
 * which is exactly LEVEL_H. The treads run along the tile's other axis, so the
 * flight reads as climbing away from the viewer.
 */
function stoneStairGrid() {
  // The rise is QUANTISED, so the surface genuinely steps: four treads of the
  // family profile, which is exactly LEVEL_H. Take one quantised only the
  // COLOUR and left the surface a smooth plane, and it read as a white ramp
  // with stripes painted on it. The geometry has to step, not the palette.
  const { g, H } = rampSurface(
    () => 'E', // every tread the same dressed stone; the RISER does the work
    // Under each nosing: one dark line of shadow, then the riser face lit from
    // the upper left, then the bed joint. Take two put only one ramp step
    // between tread and riser and the flight read as a striped ramp.
    (x, y, k) => (k === 1 ? 'B' : k >= RISER ? 'A' : 'C'),
    { step: RISER }
  );
  // Cheek walls either side. A flight with no cheeks is a striped ramp; the
  // cheek is also what stops the treads bleeding into the grass.
  for (let y = 0; y < TILE_H; y++) {
    const { x0, len } = rowSpan(y);
    for (const [x, lit] of [[x0, 1], [x0 + 1, 1], [x0 + len - 2, 0], [x0 + len - 1, 0]]) {
      const { s } = square(x, y);
      // A cheek wall follows the RAKE of the flight — one smooth diagonal —
      // not the treads. Quantising it grew a row of teeth along the back. It
      // is also kept DARK: a bright cheek out-shouts the treads it frames.
      const raked = Math.round(LEVEL_H * clamp(1 - s, 0, 1)) + 2;
      const sy = LEVEL_H + y - raked;
      put(g, x, sy - 1, 'A');
      put(g, x, sy, lit ? 'D' : 'B');
      for (let k = 1; k <= (y >= TILE_H / 2 ? raked + 2 : 5); k++) put(g, x, sy + k, k > 2 ? 'A' : lit ? 'B' : 'A');
    }
  }
  return { g, H };
}
{
  const s = stoneStairGrid();
  // eslint-disable-next-line no-var
  var STAIR = spriteAt('stone-stair', [32, LEVEL_H + 16], s.g, {
    tags: ['decor', 'connector', 'marble', 'neoclassical', 'stair'],
  });
}
export const STONE_STAIR = STAIR;

/** Boulder cells, jittered off the lattice so no two joints line up. */
function scrambleCell(x, y) {
  const gy = Math.floor(y / 7);
  const jx = Math.floor((x + hash(0, gy, 55) * 9) / 11);
  return jx * 7 + gy * 3;
}

/**
 * Rock scramble — informal, satyr-leaning. Not steps: boulders you climb.
 *
 * FOUR WAYS ROUND, like the earth ramp and for the same reason. The owner:
 * *"rock scramble does not rotate properly like the other stairs."* It did not
 * rotate at ALL — it was never in catalog.js's `TURNS`, so the wheel passed
 * straight over it and a scramble could only ever climb toward -tx.
 *
 * `near` is `rampSurface`'s own flag and is the whole of the second drawing:
 * `s` instead of `1 - s` turns the height field round, which is the 180-degree
 * twin the mirror cannot reach (a vertical flip is forbidden — light is always
 * upper-left). See §THE CONNECTOR'S PLAN and the earth ramp above.
 */
function rockScrambleGrid(near = false) {
  const { g, H } = rampSurface(
    (x, y) => {
      // Blocky and IRREGULAR: no two boulders share a top, which is the whole
      // archaic claim against the stair's four identical treads.
      const cell = scrambleCell(x, y);
      const n = hash(cell, 0, 71);
      const m = hash(x, y, 74);
      let v = n < 0.3 ? 2 : n > 0.7 ? 3 : 2;
      if (m < 0.13) v -= 1;
      else if (m > 0.86) v += 1;
      return ROCK[clamp(v, 1, 3)];
    },
    (x, y, k, lift) => {
      // THE NEAR DRAWING IS NEARLY ALL END WALL — the earth ramp's finding,
      // arriving again unchanged. Its high end is the edge closest to the
      // camera, so what the player sees is a 16 px wall with a sliver of
      // boulder above it, and 16 px in one value reads as a HOLE in the ground
      // rather than as a heap of blocks. The two lower edges of a diamond face
      // opposite ways: the left one is turned toward the light, the right away.
      // GATED ON `near` — `lift` reaches 16 on the away drawing too, at its
      // back edge, and an ungated branch silently repaints a drawing that was
      // already right. See the stone stair, where it did exactly that.
      if (near && lift > 3 && k > 1) {
        return x < TILE_W / 2
          ? hash(x, y + k, 76) > 0.55
            ? 'x'
            : 'w'
          : hash(x, y + k, 77) > 0.55
            ? 'w'
            : 'v';
      }
      return k > 2 ? 'v' : hash(x, y + k, 73) > 0.5 ? 'w' : 'v';
    },
    { step: 3, near }
  );
  // Deep joints between the boulders, and moss where the light does not reach.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      if (peek(g, x, y) === '.') continue;
      const cell = scrambleCell(x, y);
      const right = scrambleCell(x + 1, y);
      const down = scrambleCell(x, y + 1);
      const up = scrambleCell(x, y - 1);
      // Only about two joints in three are drawn, and the boulder's UPPER edge
      // catches light instead. Take two drew every boundary in the darkest
      // rock on a regular 9x6 lattice and the scramble came out a net.
      if (cell !== up && hash(cell, 1, 88) > 0.25) put(g, x, y, 'y');
      else if ((cell !== right || cell !== down) && hash(cell, 2, 89) > 0.3) put(g, x, y, 'v');
      else if (peek(g, x, y) === 'x' && hash(x, y, 79) > 0.9) put(g, x, y, 'k');
    }
  }
  return { g, H };
}
{
  const near = rockScrambleGrid(true);
  const r = rockScrambleGrid();
  // eslint-disable-next-line no-var
  var SCRAM_NEAR = spriteAt('rock-scramble-near', [32, LEVEL_H + 16], near.g, {
    tags: ['decor', 'connector', 'rock', 'archaic', 'ramp'],
  });
  // eslint-disable-next-line no-var
  var SCRAM = spriteAt('rock-scramble', [32, LEVEL_H + 16], r.g, {
    tags: ['decor', 'connector', 'rock', 'archaic', 'ramp'],
    back: SCRAM_NEAR,
  });
}
export const ROCK_SCRAMBLE = SCRAM;
export const ROCK_SCRAMBLE_NEAR = SCRAM_NEAR;

/**
 * Stepped terrace wall — a retaining wall with the steps built into it. The
 * piece that makes a terraced garden legible: a wall face on the low side, the
 * family tread climbing through it, and the turf of the upper level visible on
 * top. Dressed courses, so it is the neoclassical member of the connector set.
 */
function terraceWallGrid() {
  const H = TILE_H + LEVEL_H + 8;
  const g = grid(TILE_W, H);
  const Y0 = LEVEL_H;
  const flank = (t) => t <= 0.34 || t >= 0.66;

  // PASS 1 — the upper terrace's turf, whole. Take three interleaved turf and
  // masonry in one loop and each row's wall ate the row behind it, leaving a
  // one-pixel sliver of green along the back. The two surfaces have to be
  // painted in separate passes, turf first.
  for (let y = 0; y < TILE_H; y++) {
    const { x0, len } = rowSpan(y);
    for (let x = x0; x < x0 + len; x++) {
      const { t } = square(x, y);
      if (!flank(t)) continue;
      const n = hash(x, y, 5);
      put(g, x, Y0 + y - LEVEL_H, n < 0.2 ? 'n' : n > 0.85 ? 'p' : 'o');
    }
  }

  // PASS 2 — the retaining wall, hung under the FRONT edge of the turf only.
  for (let x = 0; x < TILE_W; x++) {
    let front = -1;
    for (let y = 0; y < TILE_H; y++) {
      const { x0, len } = rowSpan(y);
      if (x < x0 || x >= x0 + len) continue;
      if (flank(square(x, y).t)) front = y;
    }
    if (front < 0) continue;
    const top = Y0 + front - LEVEL_H;
    put(g, x, top + 1, 'B'); // the coping course, in the turf's own shadow
    // Stop AT THE GROUND for this column. Carrying every column the same
    // fixed distance left the wall hanging in mid-air where the turf's front
    // edge runs back — a comb of white teeth along the upper flank.
    for (let k = 2; k <= LEVEL_H; k++) {
      const course = Math.floor((k - 2) / RISER);
      let key = ['D', 'C', 'C', 'B'][(k - 2) % RISER];
      if ((k - 2) % RISER === RISER - 1) key = 'A'; // bed joint
      else if (Math.floor((x + course * 4) / 9) !== Math.floor((x + 1 + course * 4) / 9)) key = 'B';
      else if (hash(Math.floor((x + course * 4) / 9), course, 83) > 0.82) key = 'C';
      put(g, x, top + k, key);
    }
  }

  // PASS 3 — the flight let into the middle third, drawn last so its nosings
  // sit in front of the wall on both sides.
  for (let y = 0; y < TILE_H; y++) {
    const { x0, len } = rowSpan(y);
    for (let x = x0; x < x0 + len; x++) {
      const { s, t } = square(x, y);
      if (flank(t)) continue;
      const lift = Math.floor((LEVEL_H * clamp(1 - s, 0, 1)) / RISER) * RISER;
      const sy = Y0 + y - lift;
      const cheek = t < 0.37 || t > 0.63;
      put(g, x, sy, cheek ? 'C' : 'E');
      for (let k = 1; k <= RISER + 1; k++) put(g, x, sy + k, k === 1 ? 'B' : k > RISER ? 'A' : cheek ? 'B' : 'C');
    }
  }
  return g;
}
export const TERRACE_WALL_STEPPED = spriteAt('terrace-wall-stepped', [32, LEVEL_H + 16], terraceWallGrid(), {
  tags: ['decor', 'connector', 'marble', 'neoclassical', 'retaining'],
});

// ===========================================================================
// THE ARCHAIC LANDSCAPE PIECES
//
// Everything above this line is FURNITURE — it was made, it is symmetrical,
// and it belongs to the marble ramp. These three were not made: an outcrop, a
// cave in a wood, and a post that somebody cut once and left. They are the
// other half of DECOR.md's register split, and the vocabulary inverts
// accordingly — rock and earth rather than marble, no mouldings, and every
// edge deliberately off the true line.
//
// The one rule that does NOT invert is the light. Upper left, everywhere,
// forever; an archaic piece is rougher, not differently lit.
// ===========================================================================

/**
 * Broken stone, the archaic counterpart of roundKey(). A mass of rock is a
 * heap of BLOCKS, each one taking the light on its own upper-left corner and
 * losing it into the joint on its lower right, and the joint is the part that
 * does the work: on a four-key ramp a lit corner alone is one step, which is
 * nothing across a whole object.
 */
function crag(x, y, seed, scale = 1, bias = 0) {
  const bh = 5 * scale;
  const bw = 8 * scale;
  const by = Math.floor((y + hash(x >> 3, 0, seed + 3) * bh * 0.7) / bh);
  const bx = Math.floor((x + hash(0, by, seed + 5) * bw * 0.8) / bw);
  const n = hash(bx, by, seed + 7);
  let i = n > 0.74 ? 3 : n > 0.4 ? 2 : 1;
  const fx = (x + hash(0, by, seed + 5) * bw * 0.8) / bw - bx;
  const fy = (y + hash(x >> 3, 0, seed + 3) * bh * 0.7) / bh - by;
  if (fx < 0.2 || fy < 0.2) i += 1;
  if (fx > 0.88 || fy > 0.88) i -= 2;
  else if (fx > 0.7 || fy > 0.7) i -= 1;
  const r = hash(x, y, seed + 11);
  if (r > 0.955) i += 1;
  else if (r < 0.06) i -= 1;
  // `bias` is the GLOBAL form, and on anything bigger than a boulder it is
  // what the whole mass is made of. Block-by-block value alone is camouflage:
  // over a 128 px outcrop it reads as a pile of rubble because nothing tells
  // the eye which way the mass turns. One light term across the whole object,
  // added on top of the local texture, is the difference between a heap and a
  // shape — and it is the same claim SPEC §3 makes about a cube.
  return ROCK[clamp(Math.round(i + bias), 0, 3)];
}

/**
 * ROCK OUTCROP — bedrock breaking through the turf.
 *
 * 2x2, and it has to fill the footprint, because the whole use the catalogue
 * describes for it is "put it at the top of a bank and the terrace stops
 * looking built and starts looking found". A small tidy boulder cannot do that
 * job; it has to be a piece of the hill.
 *
 * Three things make rock read as rock rather than as a grey blob:
 *
 *   * A SILHOUETTE WITH NO SYMMETRY. The mass is built from four overlapping
 *     lumps at four different heights on four different centres, and the
 *     highest is deliberately off to one side. A single dome is a bun.
 *   * LEDGES. Bedrock breaks along its beds, so the profile has flat steps in
 *     it, not a smooth curve — the "weathered grey steps" of the blurb.
 *   * THE TURF LAPPING AT IT. Grass does not stop at a stone in a clean line;
 *     it runs up the low side and gives out on the high one. That transition,
 *     three or four pixels of it, is most of what makes the rock look like it
 *     is COMING THROUGH the ground rather than lying on it.
 */
function rockOutcropGrid() {
  // A 2x2 FOOTPRINT IS A CLAIM TO FILL 128 x 64 PIXELS OF GROUND, and
  // test/sprite-anchors.test.mjs enforces it. That is not a formality for this
  // piece, it is the design: the catalogue says to put it at the top of a bank
  // so the terrace "stops looking built and starts looking found", and a tidy
  // boulder sitting in the middle of its plot cannot do that job. The mass has
  // to run out to the edges of the ground it occupies, the way real bedrock
  // does — which also means its FOOT is the footprint diamond itself, and the
  // silhouette's bottom edge is the plot's own two front edges.
  const W = 132;
  const H = 82;
  const g = grid(W, H);
  const cx = 66;
  const AY = 48; // the anchor row: the footprint diamond's centre
  const HW = 64;
  const HH = 32;
  // The plot's front edge and back edge at column x.
  const front = (x) => AY + HH * (1 - Math.abs(x - cx) / HW);
  const back = (x) => AY - HH * (1 - Math.abs(x - cx) / HW);

  // Four lumps: [dx, rx, height]. The tallest is off to one side on purpose —
  // a single dome centred on the plot is a bun.
  const lumps = [
    [-20, 30, 21],
    [4, 34, 15],
    [26, 24, 10],
    [-44, 20, 7],
  ];

  const top = new Array(W).fill(null);
  for (let x = 0; x < W; x++) {
    if (Math.abs(x - cx) > HW) continue;
    let h = 0;
    for (const [dx, rx, ht] of lumps) {
      const u = (x - (cx + dx)) / rx;
      if (Math.abs(u) >= 1) continue;
      h = Math.max(h, ht * (1 - u * u) ** 0.6);
    }
    // LEDGED, not domed. Quantising to the family's own 4 px tread is what
    // gives bedrock its beds; a smooth profile is a heap of gravel.
    const stepped = Math.round(h / RISER) * RISER + (hash(x >> 2, 0, 91) - 0.5) * 2.4;
    top[x] = back(x) - stepped;
  }

  for (let x = 0; x < W; x++) {
    if (top[x] === null) continue;
    const lo = Math.round(front(x));
    for (let y = Math.round(top[x]); y <= lo; y++) {
      // The mass turns away from the light twice over: to the right across the
      // plot, and downward toward the viewer as the face rolls under.
      const across = -((x - cx) / HW) * 1.0;
      const down = -((y - top[x]) / Math.max(6, lo - top[x])) * 1.1;
      let k = crag(x, y, 313, 2.2, across + down + 0.5);
      // The brow: the first two rows under the skyline take the light, which
      // is what stops the silhouette reading as a hole cut in the lawn.
      if (y < top[x] + 2) k = ROCK[3];
      put(g, x, y, k);
    }
    // THE RISERS. Quantising the profile gives the silhouette its steps, but a
    // step you can only see against the sky is half a step: where the profile
    // drops, the scar has to be drawn down the face as well.
    const prev = top[x - 1];
    if (prev != null && Math.abs(top[x] - prev) >= 2) {
      const drop = Math.round(Math.abs(top[x] - prev)) + 2;
      for (let k = 0; k < drop; k++) {
        const y = Math.round(Math.max(top[x], prev)) + k;
        if (peek(g, x, y) === '.') continue;
        put(g, x, y, ROCK[k < 1 ? 3 : 0]);
      }
    }
    // Lichen in the crevices — cypress green, sparse, and only on the shaded
    // side, because that is where it grows and because the lit side is
    // carrying the shape.
    for (let y = Math.round(top[x]) + 3; y <= lo; y++) {
      if (x > cx - 8 && hash(x >> 1, y >> 1, 97) > 0.965) put(g, x, y, hash(x, y, 99) > 0.5 ? 'k' : 'j');
    }
    // The turf lapping at the foot: grass climbing a few pixels up the mass,
    // ragged and thinning. Three or four pixels of this is most of what makes
    // the rock look like it is COMING THROUGH the ground rather than lying on
    // it, and it is also what softens the plot's own hard diamond edge.
    // Deepest at the SIDES, where the mass is thinnest and the plot's own
    // diamond edge would otherwise draw two hard straight lines across the
    // lawn. Bedrock does not have a boundary; it has a place where the soil
    // gives out, and the place moves.
    const lap = 2 + Math.round(hash(x >> 1, 0, 101) * 3) + Math.round(7 * (Math.abs(x - cx) / HW) ** 1.6);
    for (let k = 0; k < lap; k++) {
      const y = lo - k;
      if (peek(g, x, y) === '.') continue;
      if (hash(x, k, 103) > 0.18 + (k / lap) * 0.8) put(g, x, y, k > 1 ? 'n' : 'o');
    }
  }

  // The contact skirt, continuous along the plot's front edges. Drawn per
  return { g, ay: AY };
}
{
  const r = rockOutcropGrid();
  // eslint-disable-next-line no-var
  var ROUT = spriteAt('rock-outcrop', [66, r.ay], r.g, {
    footprint: [2, 2],
    tags: ['terrain', 'rock', 'archaic', 'wild', 'cliff'],
  });
}
export const ROCK_OUTCROP = ROUT;

/**
 * A FOLIAGE MASS, authored the way RESEARCH §6 says period trees were: not
 * leaves, not one round blob, but three or four CLUMPS at different heights
 * with a genuinely dark core and rim light on the upper left of each. This is
 * the same law art/grow.js applies to a whole tree, written small so a bank of
 * trees behind a cave mouth can be drawn without importing a composer.
 */
function canopyMass(g, cx, cy, rx, ry, seed, clumps = 5) {
  for (let i = 0; i < clumps; i++) {
    const a = (i / clumps) * Math.PI * 2 + hash(i, 0, seed) * 2;
    const ox = Math.cos(a) * rx * 0.5 * (0.5 + hash(i, 1, seed));
    const oy = Math.sin(a) * ry * 0.55 * (0.4 + hash(i, 2, seed)) - ry * 0.15;
    const cr = rx * (0.34 + hash(i, 3, seed) * 0.22);
    for (let dy = -cr; dy <= cr; dy++) {
      for (let dx = -cr * 1.25; dx <= cr * 1.25; dx++) {
        const d = Math.hypot(dx / (cr * 1.25), dy / cr);
        if (d > 1 - (hash(Math.round(dx), Math.round(dy), seed + i) - 0.5) * 0.3) continue;
        const x = cx + ox + dx;
        const y = cy + oy + dy;
        // Rim light on the UPPER LEFT of each clump, a dark core, and the
        // canopy's darkest key wherever two clumps overlap — which is what
        // gives the mass an inside.
        const lit = -dx / (cr * 1.25) - dy / cr;
        let i2 = lit > 1.15 ? 4 : lit > 0.45 ? 3 : lit > -0.35 ? 2 : 1;
        if (peek(g, x, y) !== '.') i2 = Math.min(i2, 1);
        if (hash(Math.round(x), Math.round(y), seed + 7) > 0.94) i2 = clamp(i2 + 1, 0, 4);
        put(g, x, y, 'abcde'[clamp(i2, 0, 4)]);
      }
    }
  }
}

/**
 * CAVE MOUTH IN A WOODED SLOPE — Chiron's, and deliberately NOT the bare-rock
 * one in art/props.js.
 *
 * The catalogue calls it a wooded hillside cave and the existing understudy is
 * a bare grey lump, so the whole job of this sprite is the WOOD. What makes a
 * cave read as being in a wood rather than in a quarry:
 *
 *   * The trees are BEHIND AND ABOVE, growing out of the top of the bank, and
 *     their mass is wider than the rock — so the rock is a hole in a hillside
 *     rather than a boulder with shrubs on it.
 *   * Two trunks come down to the ground either side of the mouth. Trunks are
 *     the thing that says "trees" at twenty pixels; a green mass with no wood
 *     in it is a hedge.
 *   * ROOTS over the lip of the cave. A tree above a hollow puts roots down
 *     across it, and three of them drawn over the rock is the single detail
 *     that ties the two halves into one object.
 *   * The interior is FLAT DARK with nothing in it. props.js found that first
 *     and it is right: an unresolved hole is more inviting at forty pixels
 *     than any painted interior, and anything drawn inside reads as a face.
 *
 * The threshold — the catalogue says "swept, with a worn threshold" — is a
 * pale flattened band of trodden earth across the opening, and it is the only
 * pixel in the piece that says somebody LIVES here.
 */
function caveMouthWoodedGrid() {
  // 2x1, so the plot is 96 x 48 and the front vertex is 24 px below the anchor
  // (test/sprite-anchors.test.mjs). The bank therefore has to run down to it,
  // which is not a compromise: a cave in a hillside has a TOE of trodden earth
  // spilling out of it, and the toe is the ground the plot is claiming.
  const W = 104;
  const H = 100;
  const g = grid(W, H);
  const cx = 52;
  const AY = 72; // the anchor row
  const HW = 48;
  const HH = 24;
  const front = (x) => AY + HH * (1 - Math.abs(x - cx) / HW);
  const inPlot = (x) => Math.abs(x - cx) <= HW;

  // ---- the bank of rock ----------------------------------------------------
  const brow = (x) => {
    const u = (x - cx) / 46;
    if (Math.abs(u) >= 1) return null;
    return AY - 8 - 30 * (1 - u * u) ** 0.5 + (hash(x >> 2, 0, 131) - 0.5) * 4;
  };
  for (let x = 0; x < W; x++) {
    const b = brow(x);
    if (b === null || !inPlot(x)) continue;
    for (let y = Math.round(b); y <= Math.round(front(x)); y++) {
      // Lit up-left across the bank, like the outcrop — see crag()'s `bias`.
      const across = -((x - cx) / HW) * 0.9;
      put(g, x, y, crag(x, y, 137, 1.9, across + 0.35));
    }
  }

  // ---- the wood, over the brow ---------------------------------------------
  // Wider than the rock, and with its own trunks. Drawn AFTER the rock so it
  // hangs over the lip, which is what "in a wooded slope" has to mean visually.
  // [dx, trunk foot, canopy centre, rx, ry, seed] — the trunk foot and the
  // canopy centre are stated SEPARATELY rather than derived from one number.
  // Tying them together is how take one ended up with the whole wood growing
  // off the top of the sprite: the bank's brow is only thirty rows down from
  // the ceiling, so a canopy that hangs a fixed distance above its own roots
  // has nowhere to be.
  for (const [tx, foot, cany, rx, ry, sd] of [
    // The canopy centres are DELIBERATELY at five different heights. Five
    // trees at the same height give a flat-topped green band, and a
    // flat-topped green band is a hedge — RESEARCH §6's silhouette rule
    // applies to a wood exactly as it does to one tree.
    [-27, 40, 27, 21, 14, 211],
    [-3, 36, 17, 24, 17, 227],
    [20, 40, 24, 20, 14, 239],
    [41, 50, 33, 15, 11, 251],
    [-46, 52, 31, 14, 10, 263],
  ]) {
    // Trunk first, so the canopy closes over its top — and it STARTS INSIDE
    // the canopy, not below it. Take one ran each trunk from the clump's
    // centre down to the bank and the wood came out as five lollipops on
    // poles; a stand of trees shows you the bottom third of its trunks and
    // nothing else, because the rest is inside the leaves.
    const bx = cx + tx + 3;
    for (let y = cany + Math.round(ry * 0.75); y <= foot; y++) {
      const w = 1 + Math.round((y - cany - ry * 0.75) / 12);
      for (let d = -w; d <= w; d++) put(g, bx + d, y, d < 0 ? 's' : d === w ? 'q' : 'r');
    }
    canopyMass(g, cx + tx, cany, rx, ry, sd);
  }

  // ---- the mouth -----------------------------------------------------------
  // A LOW arch, wider than it is tall, and set a little off the bank's centre:
  // a symmetrical hole in a symmetrical lump is a mask.
  const mx = cx - 3;
  const my = AY + 2;
  const MW = 19;
  const MH = 20;
  for (let y = my; y > my - MH * 2; y--) {
    for (let x = mx - MW; x <= mx + MW; x++) {
      const u = (x - mx) / MW;
      const v = (my - y) / MH;
      if (u * u + v * v > 1) continue;
      put(g, x, y, 'v');
    }
  }
  // The lip: two rows of rock round the opening, so the hole has a thickness
  // and is not a sticker. a = 0 is the LEFT jamb, 90 the crown, 180 the right
  // — so the lit side of the opening is the low half of that sweep. Take one
  // had the test the wrong way round and lit the right-hand jamb, which is the
  // one face of the whole object that is turned away from the sun.
  for (let a = 0; a <= 180; a += 0.6) {
    const th = (a * Math.PI) / 180;
    for (let k = 1; k <= 2; k++) {
      const x = mx - (MW + k) * Math.cos(th);
      const y = my - (MH + k) * Math.sin(th);
      put(g, x, y, a < 108 ? ROCK[3] : a < 132 ? ROCK[2] : ROCK[1]);
    }
  }

  // ---- roots over the lip --------------------------------------------------
  // A tree above a hollow puts roots down across it, and three of them drawn
  // over the rock is the single detail that ties the two halves into one
  // object rather than a bush standing behind a boulder.
  for (const [rx0, dir] of [[-19, -1], [-6, 1], [11, 1], [22, -1]]) {
    let x = cx + rx0;
    let y = AY - 36;
    for (let i = 0; i < 24; i++) {
      y += 1;
      x += dir * (hash(i, rx0, 271) > 0.55 ? 1 : 0);
      if (peek(g, x, y) === '.') continue;
      put(g, x, y, i < 6 ? 'q' : 'r');
      if (hash(i, 1, 277) > 0.5) put(g, x + 1, y, 'q');
    }
  }

  // ---- the threshold and the toe -------------------------------------------
  // Trodden earth, swept flat, spilling out of the opening and down the front
  // of the bank to the plot's own front vertex. The ONE part of the piece that
  // says somebody lives here.
  // A PATH, not an apron. Take one spilled it to the full width of the mouth
  // and all the way to the plot's front vertex, and a hundred square pixels of
  // pale earth is the brightest thing on the object — it out-shouted the cave
  // it was supposed to lead into. It wants to be about a third that.
  for (let x = mx - MW + 1; x <= mx + MW - 1; x++) {
    const u = (x - mx) / (MW - 1);
    const spill = (front(x) - (my - 1)) * 0.55;
    const d = Math.round(spill * Math.max(0, 1 - u * u * 2.2) ** 0.8);
    if (d <= 0) continue;
    for (let k = -1; k <= d; k++) {
      const y = my - 1 + k;
      // Pale swept earth in the middle of the path, scuffed at its edges.
      put(g, x, y, k <= 0 ? 't' : hash(x, y, 281) > 0.72 ? 's' : k < d - 2 ? 't' : 's');
    }
  }

  return g;
}
export const CAVE_MOUTH_WOODED = spriteAt('cave-mouth-wooded', [52, 72], caveMouthWoodedGrid(), {
  footprint: [2, 1],
  tags: ['terrain', 'rock', 'cave', 'archaic', 'wild', 'shade'],
});

/**
 * AXE MARKER — the boundary of the axe-forbidden grove.
 *
 * The lore is sourced and specific: the [Homeric] Hymn to Aphrodite has the
 * nymphs' trees standing uncut and sacred, and Erysichthon putting an axe to
 * the grove of Demeter is the standard cautionary tale for what happens next.
 * The catalogue's requirement is one word — "it should read as a prohibition"
 * — and a prohibition is not a decoration. It has to be legible AS A SIGN at
 * a glance, which means it needs to say the same thing three times:
 *
 *   1. THE POST IS DRESSED ON ONE FACE ONLY. Rough-hewn everywhere except a
 *      flat panel, because a flat panel on a rough stone means somebody made
 *      it a surface to put something ON.
 *   2. THE AXE IS CARVED AND STRUCK THROUGH. Incised, so the glyph is DARK
 *      with a lit arris on its upper left — a carving, not a painting — and a
 *      bar cut across it. An axe alone is a woodcutter's mark and would mean
 *      the opposite of what is wanted here.
 *   3. THE WOOL FILLET. A band of red wool tied round a stone or a tree is the
 *      Greek sign for "this is not yours", and it is the only saturated colour
 *      on the object, which is exactly why the eye goes to it first.
 *
 * Archaic register throughout: rock ramp, no mouldings, and the post set a
 * little out of plumb, because nobody surveyed it.
 */
function axeMarkerGrid() {
  const g = grid(30, 50);
  const cx = 15;
  const FOOT = 44;
  const TOP = 5;

  // The post: rough-hewn, tapering, and a pixel out of plumb.
  for (let y = TOP; y <= FOOT; y++) {
    const t = (y - TOP) / (FOOT - TOP);
    const hw = 6.2 + t * 1.8;
    const lean = Math.round((1 - t) * 1.4);
    for (let dx = -hw; dx <= hw; dx++) {
      const x = cx + dx + lean;
      // The rounded-form law still applies to a squared post — it is just a
      // very square one, so the highlight sits a third in from the lit edge
      // and the shadow side keeps two full steps.
      let k = roundKey(dx, hw + 0.5, ROCK);
      // Rough-hewn: the tool marks are horizontal, because that is how a
      // stone is dressed, and they are broken, because it was done by hand.
      if (hash(Math.round(dx / 2), y, 311) > 0.88) k = ROCK[clamp('vwxy'.indexOf(k) - 1, 0, 3)];
      put(g, x, y, k);
    }
    put(g, cx - Math.round(hw) + lean, y, ROCK[0]);
    put(g, cx + Math.round(hw) + lean, y, ROCK[0]);
  }
  // A squared, weathered top with a lit cap — the one horizontal face.
  for (let dx = -5; dx <= 5; dx++) {
    put(g, cx + dx + 1, TOP - 1, dx < 2 ? ROCK[3] : ROCK[2]);
    put(g, cx + dx + 1, TOP - 2, ROCK[0]);
  }

  // The dressed panel. Kept at ROCK[2] — the MIDDLE of the ramp — and that is
  // the whole reason the carving works: an incision needs a dark cut AND a lit
  // arris, so it needs a step of ramp on either side of the ground it is cut
  // into. Take one dressed the panel at ROCK[3], the top of the ramp, and the
  // lit arris had nowhere to go: the axe came out as a dark smear.
  const PY = 16;
  const PW = 6;
  for (let y = PY - 2; y < PY + 18; y++) {
    for (let dx = -PW; dx <= PW; dx++) put(g, cx + dx + 1, y, dx < -3 ? ROCK[3] : ROCK[2]);
  }

  // THE AXE, incised. Hand-authored rather than computed, because a glyph this
  // small is all silhouette and there is no formula for "reads as an axe": a
  // triangular blade at the top right and a haft running down to the left,
  // thirteen by twelve.
  //
  // AND IT IS CUT IN RELIEF, not filled. Take one filled the whole mask with
  // the darkest rock and the axe came out as a black stain — because a solid
  // dark shape on stone reads as a shadow or a stain long before it reads as a
  // carving. A carving is three values: the floor of the cut one step down,
  // the edge of the cut at the bottom of the ramp, and a lit arris along its
  // upper left where the chisel broke the surface. Three values on a panel
  // held at ramp 2 is the whole trick, and it is the same trick the recessed
  // joints in the dressed wall use.
  const AXE = [
    '.......#####.',
    '......#######',
    '.....########',
    '.....########',
    '......#######',
    '.......#####.',
    '......##.....',
    '.....##......',
    '....##.......',
    '...##........',
    '..##.........',
    '.##..........',
  ];
  const solid = (i, j) => (AXE[j] || '')[i] === '#';
  for (let j = 0; j < AXE.length; j++) {
    for (let i = 0; i < AXE[j].length; i++) {
      if (!solid(i, j)) continue;
      const x = cx - 5 + i;
      const y = PY + 1 + j;
      if (peek(g, x, y) === '.') continue;
      const edge = !solid(i - 1, j) || !solid(i + 1, j) || !solid(i, j - 1) || !solid(i, j + 1);
      put(g, x, y, edge ? ROCK[0] : ROCK[1]);
      if (edge && !solid(i - 1, j - 1) && peek(g, x - 1, y - 1) === ROCK[2]) put(g, x - 1, y - 1, ROCK[3]);
    }
  }

  // Struck through: one bar cut clean across the panel on the diagonal. An axe
  // by itself is a woodcutter's mark and would mean the OPPOSITE of what this
  // post is for; the bar is what turns a sign into a refusal, and it is the
  // reason a player who has never read the lore still stops at it.
  // ON THE OTHER DIAGONAL. Take one ran the bar parallel to the haft, which
  // put a dark line exactly along the one line that was already dark: the sign
  // read as a long thin blade and nothing was struck through at all. A bar has
  // to CROSS what it cancels.
  for (let i = 0; i <= 17; i++) {
    const x = Math.round(cx - 6 + i * 0.78);
    const y = Math.round(PY + 2 + i * 0.80);
    if (peek(g, x, y) === '.') continue;
    put(g, x, y, ROCK[0]);
    put(g, x + 1, y, ROCK[0]);
    if (peek(g, x - 1, y - 1) !== '.') put(g, x - 1, y - 1, ROCK[3]);
  }

  // The wool fillet, wound twice under the cap. ACCENT 1, 2 and 3 — the reds —
  // and the only saturated colour on the object, which is exactly why the eye
  // goes to it first. A band of wool tied round a stone is the Greek sign for
  // "this is not yours".
  for (let k = 0; k < 2; k++) {
    const y = TOP + 3 + k * 3;
    for (let dx = -6; dx <= 6; dx++) {
      const x = cx + dx + 1;
      if (peek(g, x, y) === '.') continue;
      put(g, x, y, dx < -3 ? '2' : dx > 3 ? '1' : dx < 0 ? '3' : '2');
      if (peek(g, x, y + 1) !== '.') put(g, x, y + 1, dx > 2 ? '1' : '2');
    }
  }
  // The loose ends, hanging.
  for (let i = 0; i < 7; i++) put(g, cx + 8 - Math.round(i * 0.3), TOP + 7 + i, i > 4 ? '1' : '2');

  // Uncut stones at the foot — the boundary is marked on the ground as well as
  // in the air — each one lit on its own top and dark on its own right.
  for (const [dx, w] of [[-9, 3], [9, 2], [-13, 2]]) {
    for (let y = FOOT - 2; y <= FOOT + 1; y++) {
      for (let d = -w; d <= w; d++) {
        put(g, cx + dx + d, y, y <= FOOT - 1 ? (d > w - 2 ? ROCK[1] : ROCK[3]) : ROCK[1]);
      }
    }
  }
  return g;
}
export const AXE_MARKER = spriteAt('axe-marker', [15, 46], axeMarkerGrid(), {
  tags: ['sculpture', 'rock', 'archaic', 'votive', 'quiet'],
});

// ===========================================================================
// [V] PALETTE VARIANTS — free objects
//
// The period trick, used as hard as DECOR.md asks. Each of these is a resolver
// for `rasterise(sprite, resolve, variantName)`; not one new pixel is authored.
// ===========================================================================

export const VARIANTS = Object.freeze({
  /** The marble bench: the exedra (authored in rock) through the marble ramp. */
  marble: variant({ rock: 'marble' }),
  /** Any neoclassical piece, weathered into the archaic register. */
  weathered: variant({ marble: 'rock' }),
  /** Terracotta pieces rendered as stone — a stone amphora is a real object. */
  stone: variant({ terracotta: 'marble' }),
  /** Yew clipped hedge as box, and box as yew: two hedge heights, four looks. */
  box: variant({ cypress: 'canopy' }),
  yew: variant({ canopy: 'cypress' }),
  /** Moonlit: everything marble goes to sky, for a night pass if one is ever
   *  wanted. Costs nothing to declare and is the cheapest mood in the game. */
  moonlit: variant({ marble: 'sky' }),
});

/**
 * The `[V]` catalogue entries DECOR.md names explicitly. A consumer reads this
 * and gets a second placeable out of a sprite it already has.
 */
export const VARIANT_PIECES = Object.freeze([
  { id: 'exedra-marble', sprite: 'exedra', variant: 'marble', name: 'Marble bench' },
  { id: 'amphora-stone', sprite: 'amphora', variant: 'stone', name: 'Stone amphora' },
  { id: 'krater-stone', sprite: 'krater-wide', variant: 'stone', name: 'Stone krater' },
  { id: 'doric-column-weathered', sprite: 'doric-column', variant: 'weathered', name: 'Weathered column' },
  { id: 'obelisk-weathered', sprite: 'obelisk', variant: 'weathered', name: 'Old obelisk' },
  { id: 'hedge-low-yew', sprite: 'hedge-low', variant: 'yew', name: 'Low yew hedge' },
  { id: 'hedge-tall-box', sprite: 'hedge-tall', variant: 'box', name: 'Tall box hedge' },
  { id: 'topiary-cone-yew', sprite: 'topiary-cone', variant: 'yew', name: 'Yew cone' },
  { id: 'topiary-sphere-yew', sprite: 'topiary-sphere', variant: 'yew', name: 'Yew ball' },
]);

// ===========================================================================
// NEEDS-DESIGN
// ===========================================================================

export const NEEDS_DESIGN = Object.freeze({
  'arbour-seat': {
    needsDesign: true,
    note:
      'Seat under an overhead structure. A single scalar depth key cannot both ' +
      'occlude a mover behind the posts and let the roof draw over one in ' +
      'front. Needs either a two-object split at different depths or an ' +
      '"overhead" render pass after all movers. Shipped as a bench under a ' +
      'bare frame so the palette slot is filled.',
  },
});

// ===========================================================================
// Registry
// ===========================================================================

/**
 * What a catalogue owner needs that the sprites themselves do not carry:
 * which visual REGISTER each piece belongs to (DECOR.md Part II — archaic
 * leans satyr and repels unicorn, neoclassical the reverse), and which pieces
 * are meant to occlude influence rather than deposit it.
 *
 * Deliberately not `deposits`. Balance is not this file's job and guessing at
 * it here would put a second, stale copy of the numbers in the tree.
 */
export const REGISTER = Object.freeze({
  neoclassical: [
    'stone-bench', 'amphora-plinth', 'fluted-urn', 'sundial-pedestal', 'birdbath',
    'doric-column', 'ionic-column', 'corinthian-column', 'colonnade', 'balustrade',
    'tholos', 'obelisk', 'hedge-low', 'hedge-tall', 'hedge-arch', 'topiary-cone',
    'topiary-sphere', 'fountain-tiered', 'wall-fountain', 'jet-basin',
    'shell-fountain', 'rill', 'flagstone-court', 'mosaic-panel', 'stone-stair',
    'terrace-wall-stepped', 'exedra-marble', 'fountain-jet', 'flagstone-dressed',
    'terrace-paving-edged',
  ],
  archaic: [
    'exedra', 'amphora', 'krater-wide', 'cache-pot', 'broken-column',
    'pergola-arch', 'ruined-archway', 'arbour-seat', 'gravel-walk',
    'stepping-stones', 'earth-ramp', 'rock-scramble',
    'rock-outcrop', 'cave-mouth-wooded', 'axe-marker',
  ],
});

/** Pieces that block influence propagation rather than emitting it (Part I). */
export const OCCLUDERS = Object.freeze([
  'hedge-low', 'hedge-tall', 'balustrade', 'gravel-walk',
  // hedge-arch blocks EXCEPT through its opening — the gate leaks, on purpose.
  'hedge-arch',
]);

export const DECOR = Object.freeze({
  // furniture
  'stone-bench': STONE_BENCH,
  exedra: EXEDRA,
  'exedra-marble': EXEDRA_MARBLE,
  amphora: AMPHORA,
  'amphora-plinth': AMPHORA_ON_PLINTH,
  'krater-wide': KRATER_WIDE,
  'fluted-urn': FLUTED_URN,
  'sundial-pedestal': SUNDIAL_PEDESTAL,
  birdbath: BIRDBATH,
  'cache-pot': CACHE_POT,
  'arbour-seat': ARBOUR_SEAT,
  // architecture
  'doric-column': DORIC_COLUMN,
  'ionic-column': IONIC_COLUMN,
  'corinthian-column': CORINTHIAN_COLUMN,
  'broken-column': BROKEN_COLUMN_FLUTED,
  colonnade: COLONNADE,
  balustrade: BALUSTRADE,
  'pergola-arch': PERGOLA_ARCH,
  'ruined-archway': RUINED_ARCHWAY,
  tholos: THOLOS,
  obelisk: OBELISK,
  // hedges
  'hedge-low': HEDGE_LOW,
  'hedge-tall': HEDGE_TALL,
  'hedge-arch': HEDGE_ARCH,
  'topiary-cone': TOPIARY_CONE,
  'topiary-sphere': TOPIARY_SPHERE,
  // fountains
  'fountain-tiered': FOUNTAIN_TIERED,
  'wall-fountain': WALL_FOUNTAIN,
  'jet-basin': JET_BASIN,
  'fountain-jet': FOUNTAIN_JET,
  'shell-fountain': SHELL_FOUNTAIN,
  rill: RILL,
  // ground and paths
  'gravel-walk': GRAVEL_WALK,
  'flagstone-court': FLAGSTONE_COURT,
  'flagstone-dressed': FLAGSTONE_DRESSED,
  'terrace-paving-edged': TERRACE_PAVING_EDGED,
  'stepping-stones': STEPPING_STONES,
  'mosaic-panel': MOSAIC_PANEL,
  // connectors (ELEVATION.md)
  'earth-ramp': EARTH_RAMP,
  // The uphill-toward-the-viewer drawing. Reachable through EARTH_RAMP.back,
  // registered here so the shot tools and the sprite lab can look at it.
  'earth-ramp-near': EARTH_RAMP_NEAR,
  'stone-stair': STONE_STAIR,
  'rock-scramble': ROCK_SCRAMBLE,
  // Its uphill-toward-the-viewer twin, reachable through ROCK_SCRAMBLE.back and
  // registered here for the same reason `earth-ramp-near` is: so the shot tools
  // and the sprite lab can look at a drawing the catalogue never names.
  'rock-scramble-near': ROCK_SCRAMBLE_NEAR,
  'terrace-wall-stepped': TERRACE_WALL_STEPPED,
  // the archaic landscape pieces
  'rock-outcrop': ROCK_OUTCROP,
  'cave-mouth-wooded': CAVE_MOUTH_WOODED,
  'axe-marker': AXE_MARKER,
});

export default DECOR;
