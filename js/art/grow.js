// grow.js — procedural composers. Every plant in Arcadia comes out of here.
//
// A composer takes a SEED and shape parameters and returns a sprite-shaped
// object `{ name, rows, w, h, anchor, footprint, tags }` that the renderer
// rasterises exactly like a hand-authored sprite. Nothing here touches the
// DOM; the whole file imports cleanly in Node so the tests can inspect art.
//
// ---------------------------------------------------------------------------
// THE METHOD (docs/RESEARCH.md §A.6, and it is not negotiable)
//
//   1. SILHOUETTE FIRST. Every composer builds an irregular ENVELOPE mask for
//      the species before a single clump is placed. Species differentiation at
//      32-64px is silhouette and palette, not detail: a cypress is a narrow
//      vertical flame, an umbrella pine is a bare trunk under a flat table, an
//      olive is a wide low thing you can see through.
//
//   2. CLUMPED MASSES, NOT LEAVES. 3-5 mass centres at DIFFERENT HEIGHTS, of
//      unequal radius (roughly 2x spread), each assembled from 2-4 overlapping
//      hand-authored clump stamps. Clumps are clipped to the envelope, except
//      for a couple deliberately allowed to break the outline.
//
//   3. THEN SHADE, once, over the whole composition. The shading pass is where
//      volume comes from, and it works per MASS, not per stamp:
//        - a genuinely dark core, from a distance transform of the silhouette
//        - rim-light on the upper-left arc of each mass, and ONLY where that
//          arc is actually exposed (not where a mass in front covers it)
//        - a few pixels of the top highlight on the one or two masses nearest
//          the light, never on all of them
//        - the lower-right of every mass dropped a step
//        - index-0 occlusion seams where a mass in front crosses one behind
//
// The two named failure modes this exists to prevent:
//   "BROCCOLI"   — uniform round blobs on a stick. Cured by unequal radii,
//                  off-centre clustering, a trunk that forks before the canopy,
//                  and skipping rim-light on the shadowed masses.
//   "GREEN BLOB" — no internal value structure. Cured by using all five canopy
//                  values, a real dark core, and punched sky holes.
//
// ---------------------------------------------------------------------------
// AUTHORING IN CANOPY SPACE
//
// Clumps are authored in canopy keys 'abcde'. Internally this file works in a
// plain 0..4 index and only maps to a real ramp at the very end, so the same
// stamp and the same shading pass serve canopy, olive, cypress and grass.
// That is why an olive is not just a green tree tinted: it has its own
// envelope, its own sparse clump budget, and its own rim behaviour, but it
// shares every stamp and every line of shading logic.
//
// ---------------------------------------------------------------------------
// GROWTH
//
// Stages are `sprout | young | mature`, and they are parameters of the SAME
// SEED. The skeleton is generated once at full size; a younger stage keeps the
// innermost masses and scales the envelope down. A tree therefore grows into
// itself instead of being swapped for a different tree — which is the whole
// point of seeding it rather than hand-drawing three sprites.

import { RAMPS } from '../palette.js';
import { CLUMPS } from './clumps.js';

const CANOPY_KEYS = 'abcde';
const EARTH = RAMPS.earth.keys; // q r s t u, dark -> light

/* ===================================================================== *
 * Deterministic noise
 * ===================================================================== */

/** mulberry32 — small, fast, and the same stream in Node and the browser. */
export function rngFor(seed) {
  let a = (seed | 0) + 0x9e3779b9;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-pixel hash, so the shading jitter is stable across re-renders. */
function hash2(x, y, s) {
  let h = Math.imul(x + 0x1f, 374761393) ^ Math.imul(y + 0x2b, 668265263) ^ Math.imul(s | 1, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

/* ===================================================================== *
 * The composition buffer
 *
 * Three layers, because a plant is three different kinds of pixel:
 *   back  — literal keys UNDER the foliage (trunk, stems)
 *   fol   — canopy-index foliage, 0..4, the only layer the shading pass sees
 *   front — literal keys OVER the foliage (blossom, grapes, cattail heads)
 * ===================================================================== */

function makeBuf(w, h) {
  const n = w * h;
  return {
    w,
    h,
    fol: new Int8Array(n).fill(-1),
    own: new Int16Array(n).fill(-1),
    back: new Array(n).fill(0),
    front: new Array(n).fill(0),
    // Pixels punched out as sky holes. Tracked separately from plain empty
    // space because a hole is INSIDE the canopy: its edges are in shade, and
    // treating them as sky-facing rim-lights a bright ring round every hole,
    // which reads as a row of little windows.
    hole: new Uint8Array(n),
    masses: [],
  };
}

/**
 * Stamp one clump. `massId` groups several stamps into a single mass so the
 * shading pass rim-lights the MASS rather than each stamp — the difference
 * between a tree and a bag of identical shaded balls.
 */
function stamp(buf, clump, cx, cy, massId, opts = {}) {
  const { flipX = false, envelope = null, clip = true, layer = 'front', onlyEmpty = false } = opts;
  const ax = flipX ? clump.w - 1 - clump.anchor[0] : clump.anchor[0];
  const ay = clump.anchor[1];
  for (let y = 0; y < clump.h; y++) {
    const row = clump.rows[y];
    for (let x = 0; x < clump.w; x++) {
      const ch = row[flipX ? clump.w - 1 - x : x];
      if (ch === '.') continue;
      const bx = cx + (x - ax);
      const by = cy + (y - ay);
      if (bx < 0 || by < 0 || bx >= buf.w || by >= buf.h) continue;
      const i = by * buf.w + bx;
      const ci = CANOPY_KEYS.indexOf(ch);
      if (ci >= 0) {
        if (clip && envelope && !envelope[i]) continue;
        if (onlyEmpty && buf.fol[i] >= 0) continue;
        buf.fol[i] = ci;
        buf.own[i] = massId;
      } else {
        buf[layer][i] = ch;
      }
    }
  }
}

/* ===================================================================== *
 * Silhouette — the envelope
 * ===================================================================== */

/**
 * Species profiles: half-width from the top of the canopy to its bottom, as a
 * fraction of the maximum. This IS the species. Read them as squinted
 * silhouettes — that is how they were designed and how they should be edited.
 */
export const PROFILES = {
  // Wide, lumpy, widest a little below the middle. The head is deliberately
  // blunt: a pointed top plus a wobbling outline makes a faceted kite, which
  // is what the first render of this file produced.
  oak: [0.26, 0.6, 0.82, 0.95, 1.0, 0.98, 0.9, 0.74, 0.5, 0.22],
  // Broader and higher-shouldered than the oak; the naiad's shade tree.
  plane: [0.32, 0.68, 0.9, 1.0, 0.98, 0.88, 0.74, 0.58, 0.4, 0.18],
  // Tall and narrow — the width comes from the small maxHalfW, not the curve.
  poplar: [0.34, 0.66, 0.84, 0.94, 1.0, 0.98, 0.92, 0.8, 0.6, 0.3],
  // Upswept, lighter than an oak, a touch vase-shaped. The Pelian spear.
  ash: [0.24, 0.58, 0.82, 0.96, 1.0, 0.94, 0.82, 0.66, 0.46, 0.24],
  // A flame: narrow at the tip, fullest low, tapering to a point.
  cypress: [0.1, 0.3, 0.52, 0.7, 0.85, 0.96, 1.0, 0.94, 0.74, 0.4],
  // A table. Widest at the very top, collapsing under itself.
  umbrella: [0.34, 0.82, 1.0, 1.0, 0.9, 0.68, 0.44, 0.24, 0.1, 0.03],
  // Wide and low, with the bulk sitting straight on the fork.
  olive: [0.34, 0.7, 0.9, 1.0, 1.0, 0.96, 0.86, 0.7, 0.48, 0.22],
  // A rounded crown; the weeping is strands hung off it, not the envelope.
  willow: [0.36, 0.74, 0.94, 1.0, 1.0, 0.94, 0.84, 0.68, 0.5, 0.28],
  // Almost a dome sitting on the ground.
  shrub: [0.35, 0.72, 0.92, 1.0, 1.0, 0.96, 0.9, 0.82, 0.7, 0.5],

  // ---- named plants (see NAMED PLANTS at the foot of this file) ----------
  //
  // Every one of these was added because a placeable could not be told from
  // its neighbour without it. Read them squinted, as silhouettes.

  // Blackthorn: a suckering THICKET, not a bush. Nearly as wide at the ground
  // as at the shoulder, because it spreads by root and has no single stem.
  thicket: [0.42, 0.78, 0.95, 1.0, 1.0, 0.98, 0.96, 0.94, 0.92, 0.88],
  // Box under shears. Fullest at the middle, tucked in top and bottom — the
  // clipped dome. Its wobble is set to almost nothing, which is the point:
  // it is the only smooth outline in the garden and reads as tended at 1x.
  box: [0.44, 0.78, 0.94, 1.0, 1.0, 0.98, 0.94, 0.88, 0.78, 0.6],
  // A rose is arching canes: widest at the SHOULDER, gathering to a narrow
  // crown of stems at the ground. The inverse of the shrub dome.
  rose: [0.52, 0.84, 1.0, 1.0, 0.94, 0.86, 0.74, 0.58, 0.42, 0.28],
  // Oleander is leggy — a tall vase on bare shins, which is how it grows out
  // of a dry stream bed.
  oleander: [0.44, 0.8, 0.98, 1.0, 0.96, 0.88, 0.76, 0.6, 0.42, 0.26],
  // A lavender hummock: low, broad, and flat on top before the spikes go up.
  hummock: [0.62, 0.9, 1.0, 1.0, 0.98, 0.96, 0.92, 0.86, 0.78, 0.64],
  // Rosemary sprawls upward and outward at once. Fullest high, and it never
  // closes at the bottom — you see the woody legs.
  sprawl: [0.5, 0.82, 0.96, 1.0, 0.98, 0.9, 0.82, 0.72, 0.6, 0.46],
  // Hawthorn kept to one stem: a small tidy head, rounder than an oak's and
  // markedly higher-shouldered, so the bole shows.
  hawthorn: [0.36, 0.74, 0.94, 1.0, 0.98, 0.92, 0.82, 0.66, 0.44, 0.2],
  // An orchard apple: low, WIDE, and flat-topped from a century of pruning.
  apple: [0.44, 0.84, 1.0, 1.0, 0.96, 0.9, 0.8, 0.66, 0.46, 0.22],
  // Bay laurel: a tall dense ovoid you could clip to anything. Nearly a
  // column, but blunt at both ends where a cypress is a flame.
  bay: [0.4, 0.72, 0.88, 0.96, 1.0, 1.0, 0.96, 0.88, 0.74, 0.5],
  // Myrtle: a neat little dome on a short leg.
  myrtle: [0.4, 0.78, 0.96, 1.0, 0.98, 0.92, 0.84, 0.7, 0.5, 0.26],
  // Almond in blossom, and the shape IS the plant: a wide-open vase of bare
  // twigs. Sparse everywhere, widest near the top, nothing in the middle.
  almond: [0.6, 0.9, 1.0, 0.98, 0.9, 0.8, 0.68, 0.54, 0.38, 0.2],
  // Fig: broad, low and heavy, held up on a stout short bole. The lumpiness
  // comes from the leaves themselves, so the profile stays simple.
  fig: [0.46, 0.86, 1.0, 1.0, 0.94, 0.86, 0.74, 0.58, 0.38, 0.18],
};

function sampleProfile(p, t) {
  const u = clamp(t, 0, 1) * (p.length - 1);
  const i = Math.min(p.length - 2, Math.floor(u));
  return lerp(p[i], p[i + 1], u - i);
}

/**
 * A smoothed random walk in [-amp, amp]; this is what makes an outline lumpy.
 * Smoothed twice — one pass leaves long straight diagonal runs, and a canopy
 * built on those reads as a faceted kite rather than a tree.
 */
function walk(rnd, n, amp) {
  let cur = new Float64Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = clamp(v + (rnd() - 0.5) * amp * 0.9, -amp, amp);
    cur[i] = v;
  }
  for (let p = 0; p < 2; p++) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = (cur[Math.max(0, i - 1)] + cur[i] + cur[Math.min(n - 1, i + 1)]) / 3;
    }
    cur = out;
  }
  return cur;
}

/**
 * Build the species silhouette. Left and right half-widths wobble
 * independently — a bilaterally symmetric canopy reads as clip-art no matter
 * how well it is shaded.
 */
function envelopeMask(buf, rnd, o) {
  const { cx, top, bottom, halfW, profile, lean = 0, wobble = 0.14, lobeAmp = 0.1 } = o;
  const mask = new Uint8Array(buf.w * buf.h);
  const H = Math.max(1, bottom - top);
  const nL = walk(rnd, H + 1, wobble);
  const nR = walk(rnd, H + 1, wobble);
  const phL = rnd() * 6.283;
  const phR = rnd() * 6.283;
  const fL = 1 + Math.floor(rnd() * 2.5);
  const fR = 1 + Math.floor(rnd() * 2.5);
  for (let y = top; y <= bottom; y++) {
    const t = (y - top) / H;
    const base = sampleProfile(profile, t) * halfW;
    if (base <= 0.4) continue;
    const cl = cx + lean * (1 - t);
    // Two frequencies per side: a slow lobe for the big shape and a fast one
    // that keeps the outline from resolving into long straight diagonal runs.
    const lw = Math.max(
      0.6,
      base * (1 + nL[y - top] + lobeAmp * Math.sin(phL + t * 6.283 * fL) + lobeAmp * 0.45 * Math.sin(phL * 2 + t * 6.283 * (fL + 3)))
    );
    const rw = Math.max(
      0.6,
      base * (1 + nR[y - top] + lobeAmp * Math.sin(phR + t * 6.283 * fR) + lobeAmp * 0.45 * Math.sin(phR * 2 + t * 6.283 * (fR + 3)))
    );
    const x0 = Math.max(0, Math.round(cl - lw));
    const x1 = Math.min(buf.w - 1, Math.round(cl + rw));
    for (let x = x0; x <= x1; x++) mask[y * buf.w + x] = 1;
  }
  return mask;
}

/* ===================================================================== *
 * Masses
 * ===================================================================== */

/**
 * One mass per height band, so "3-4 distinct masses at different heights" is
 * structural rather than hoped for. Radius comes off a skewed roll to get the
 * ~2x spread the research demands; equal radii is half of "broccoli".
 */
function placeMasses(rnd, mask, buf, o) {
  const { top, bottom, n, minR, maxR, spread = 0.7 } = o;
  const out = [];
  const H = Math.max(1, bottom - top);
  for (let b = 0; b < n; b++) {
    const t = (b + 0.2 + rnd() * 0.6) / n;
    const y = Math.round(top + t * H);
    let lo = -1;
    let hi = -1;
    for (let x = 0; x < buf.w; x++) {
      if (mask[y * buf.w + x]) {
        if (lo < 0) lo = x;
        hi = x;
      }
    }
    if (lo < 0) continue;
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    const x = Math.round(mid + (rnd() * 2 - 1) * half * spread);
    const r = minR + (maxR - minR) * Math.pow(rnd(), 0.65);
    out.push({ cx: x, cy: y, r });
  }
  // Draw order back-to-front: higher masses sit behind lower ones. The shading
  // pass reads this order to decide which seams are occlusion and which are rim.
  out.sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  out.forEach((m, i) => {
    m.id = i;
    m.lit = false;
    m.shadow = false;
  });

  // Nearest the light (upper-left) gets the index-4 highlight; the deepest
  // lower-right masses get no rim at all. Never rim every clump equally.
  if (out.length) {
    const byLight = [...out].sort((a, b) => a.cx + a.cy * 1.25 - (b.cx + b.cy * 1.25));
    const nLit = out.length >= 4 ? 2 : 1;
    for (let i = 0; i < nLit; i++) byLight[i].lit = true;
    const nDark = Math.max(0, Math.round(out.length * 0.28));
    for (let i = 0; i < nDark; i++) byLight[byLight.length - 1 - i].shadow = true;
  }
  return out;
}

/** Fill the envelope from a mass's stamp pool, jittered around its centre. */
function growMass(buf, rnd, mass, pool, mask, opts = {}) {
  const { count = 3, jitter = 0.7, breakOut = false } = opts;
  for (let i = 0; i < count; i++) {
    const clump = pool[Math.floor(rnd() * pool.length)];
    const a = rnd() * 6.283;
    const rr = mass.r * jitter * Math.sqrt(rnd());
    const x = Math.round(mass.cx + Math.cos(a) * rr);
    const y = Math.round(mass.cy + Math.sin(a) * rr * 0.8);
    stamp(buf, clump, x, y, mass.id, {
      envelope: mask,
      clip: !(breakOut && i === 0),
      flipX: rnd() < 0.45,
    });
  }
}

/**
 * The other way to fill a mass: stamps that STAND rather than float.
 *
 * growMass positions a clump by its centre on a disc, which is right for a
 * cauliflower lump and wrong for anything with a stalk. A lavender sprig, a
 * strap leaf or an acanthus blade is anchored at its BASE and rises from it,
 * so it has to be planted on a line and allowed to overshoot the envelope —
 * clipping the tops is what turned the first lavender into a green cushion.
 * The vertical grain that survives is the whole reason those plants read as
 * herbs rather than as small bushes.
 */
function growUpright(buf, rnd, mass, pool, opts = {}) {
  const { count = 3, jitter = 0.9, drop = 0.5 } = opts;
  for (let i = 0; i < count; i++) {
    const clump = pool[Math.floor(rnd() * pool.length)];
    const x = Math.round(mass.cx + (rnd() * 2 - 1) * mass.r * jitter);
    const y = Math.round(mass.cy + mass.r * drop * (0.4 + rnd()));
    stamp(buf, clump, x, y, mass.id, { clip: false, flipX: rnd() < 0.45 });
  }
}

/**
 * Close the worst holes left between masses without sealing the canopy. Any
 * uncovered envelope pixel deep inside the silhouette gets a stamp assigned to
 * whichever mass is nearest, which keeps the value structure honest.
 */
function fillGaps(buf, rnd, mask, masses, pool, passes = 5, cell = 4) {
  if (!masses.length) return;
  for (let p = 0; p < passes; p++) {
    const gaps = [];
    for (let y = 1; y < buf.h - 1; y += 1) {
      for (let x = 1; x < buf.w - 1; x += 1) {
        const i = y * buf.w + x;
        if (!mask[i] || buf.fol[i] >= 0) continue;
        // only interior gaps — leave the edge bitten
        if (!mask[i - 1] || !mask[i + 1] || !mask[i - buf.w] || !mask[i + buf.w]) continue;
        gaps.push([x, y]);
      }
    }
    if (!gaps.length) return;
    const taken = new Set();
    for (const [x, y] of gaps) {
      const key = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      let best = masses[0];
      let bd = Infinity;
      for (const m of masses) {
        const d = (m.cx - x) ** 2 + (m.cy - y) ** 2;
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      const clump = pool[Math.floor(rnd() * pool.length)];
      // onlyEmpty: a gap-filler must never repaint pixels a real mass already
      // owns. Letting it do so scatters ownership islands through the canopy,
      // and every island becomes a false clump edge for the shading pass.
      stamp(buf, clump, x, y, best.id, { envelope: mask, flipX: rnd() < 0.5, onlyEmpty: true });
    }
  }
}

/* ===================================================================== *
 * Silhouette hygiene
 * ===================================================================== */

/**
 * Kill single-pixel spurs. Period art kept outlines chunky; stray pixels
 * dissolve at 1x and shimmer when the camera pans. A 1px vertical strand (a
 * willow trail, a reed) has two vertical neighbours and survives on purpose.
 */
function prune(buf, passes = 2) {
  const { w, h, fol, own } = buf;
  for (let p = 0; p < passes; p++) {
    const kill = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (fol[i] < 0) continue;
        let n = 0;
        if (x > 0 && fol[i - 1] >= 0) n++;
        if (x < w - 1 && fol[i + 1] >= 0) n++;
        if (y > 0 && fol[i - w] >= 0) n++;
        if (y < h - 1 && fol[i + w] >= 0) n++;
        if (n < 2) kill.push(i);
      }
    }
    if (!kill.length) return;
    for (const i of kill) {
      fol[i] = -1;
      own[i] = -1;
    }
  }
}

/**
 * Delete foliage not connected to the main body. Composers that stamp clumps
 * outside the envelope to rag an edge (the stone pine's plate ends) will
 * occasionally drop one clear of the tree, and a tuft of leaves floating in
 * the sky two pixels from the canopy is not "irregular silhouette", it is a
 * bug the eye finds instantly.
 */
function dropIslands(buf) {
  const { w, h, fol, own } = buf;
  const label = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = [];
  for (let i = 0; i < w * h; i++) {
    if (fol[i] < 0 || label[i] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop();
      n++;
      const px = p % w;
      const py = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          const ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (fol[j] < 0 || label[j] >= 0) continue;
          label[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(n);
  }
  if (sizes.length < 2) return;
  let big = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[big]) big = i;
  const keep = sizes[big] * 0.12;
  for (let i = 0; i < w * h; i++) {
    if (fol[i] < 0) continue;
    if (label[i] !== big && sizes[label[i]] < keep) {
      fol[i] = -1;
      own[i] = -1;
    }
  }
}

/** Punch sky holes. A sealed outline is the "green blob"; trees have gaps. */
function punchHoles(buf, rnd, mask, n, rMax = 2) {
  if (n <= 0) return;
  const d = distanceToEdge(buf);
  const cands = [];
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const i = y * buf.w + x;
      if (buf.fol[i] >= 0 && d[i] >= rMax + 2) cands.push([x, y]);
    }
  }
  if (!cands.length) return;
  const used = [];
  for (let k = 0; k < n && cands.length; k++) {
    const [hx, hy] = cands[Math.floor(rnd() * cands.length)];
    if (used.some(([ux, uy]) => (ux - hx) ** 2 + (uy - hy) ** 2 < 64)) continue;
    used.push([hx, hy]);
    // Two offset lobes, not one ellipse. A canopy freckled with identical
    // round dots reads as measles; a real sky hole is a torn gap between
    // boughs and it has a lopsided outline.
    const lobes = [
      [hx, hy, 1 + rnd() * rMax, 1 + rnd() * rMax * 0.8],
      [hx + Math.round(rnd() * 3 - 1.5), hy + Math.round(rnd() * 3 - 1.5), 1 + rnd() * rMax * 0.8, 1 + rnd() * rMax * 0.6],
    ];
    for (const [ox, oy, rx, ry] of lobes) {
      for (let y = Math.floor(oy - ry); y <= Math.ceil(oy + ry); y++) {
        for (let x = Math.floor(ox - rx); x <= Math.ceil(ox + rx); x++) {
          if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) continue;
          if (((x - ox) / rx) ** 2 + ((y - oy) / ry) ** 2 > 1) continue;
          const i = y * buf.w + x;
          buf.fol[i] = -1;
          buf.own[i] = -1;
          buf.hole[i] = 1;
        }
      }
    }
  }
}

/**
 * Tidy the mass-ownership map before shading.
 *
 * This is not bookkeeping, it is the main line of defence against spaghetti.
 * Stamping leaves `own` speckled: a couple of pixels of mass A stranded inside
 * mass B, a one-pixel-wide finger of C along a seam. The shading pass reads
 * every one of those as a clump edge and rim-lights it, and the canopy comes
 * out threaded with bright wiry veins — which is exactly what the first render
 * of this file looked like.
 *
 * A 3x3 majority filter dissolves the speckle while leaving the boundaries
 * where the CLUMP SHAPES put them. That last part is why this is a filter and
 * not a Voronoi partition over the mass centres: a Voronoi region is a straight
 * -sided slab, so shading it produces long diagonal bands corner to corner, and
 * the tree comes out looking like a stack of bananas. The whole point of
 * stamping hand-authored clumps is that the seams are clump-shaped.
 */
function smoothOwn(buf, passes = 2, limit = Infinity) {
  const { w, h, fol, own } = buf;
  const counts = new Map();
  for (let p = 0; p < passes; p++) {
    const src = own.slice();
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (fol[i] < 0 || src[i] < 0 || src[i] >= limit) continue;
        counts.clear();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const o = src[(y + dy) * w + x + dx];
            if (o < 0 || o >= limit) continue;
            counts.set(o, (counts.get(o) || 0) + (dx === 0 && dy === 0 ? 2 : 1));
          }
        }
        let best = src[i];
        let bc = -1;
        for (const [o, c] of counts) {
          if (c > bc) {
            bc = c;
            best = o;
          }
        }
        own[i] = best;
      }
    }
  }
}

/**
 * Chamfer distance from a seeded set, propagating only through `mask` and only
 * between pixels `same()` accepts. Returned in HALF-pixel units (an orthogonal
 * step costs 2, a diagonal 3) — the standard cheap approximation to Euclid.
 *
 * Two forward/backward sweeps rather than one, because propagation is confined
 * to a mask and a single pair of sweeps cannot round a concave corner.
 */
function chamferFrom(w, h, mask, seedCost, same, iters = 2) {
  const BIG = 1 << 20;
  const d = new Int32Array(w * h).fill(BIG);
  for (let i = 0; i < w * h; i++) if (seedCost[i] >= 0) d[i] = seedCost[i];
  const rel = [
    [-1, 0, 2],
    [0, -1, 2],
    [-1, -1, 3],
    [1, -1, 3],
  ];
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        let m = d[i];
        for (const [dx, dy, c] of rel) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!mask[j] || !same(i, j)) continue;
          if (d[j] + c < m) m = d[j] + c;
        }
        d[i] = m;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (!mask[i]) continue;
        let m = d[i];
        for (const [dx, dy, c] of rel) {
          const nx = x - dx;
          const ny = y - dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!mask[j] || !same(i, j)) continue;
          if (d[j] + c < m) m = d[j] + c;
        }
        d[i] = m;
      }
    }
  }
  for (let i = 0; i < w * h; i++) if (d[i] > 120) d[i] = 120;
  return d;
}

/** Chamfer distance from every foliage pixel to the nearest empty pixel. */
function distanceToEdge(buf) {
  const { w, h, fol } = buf;
  const BIG = 1 << 20;
  const d = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = fol[i] < 0 ? 0 : BIG;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let m = d[i];
      if (x > 0) m = Math.min(m, d[i - 1] + 2);
      if (y > 0) m = Math.min(m, d[i - w] + 2);
      if (x > 0 && y > 0) m = Math.min(m, d[i - w - 1] + 3);
      if (x < w - 1 && y > 0) m = Math.min(m, d[i - w + 1] + 3);
      d[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (fol[i] < 0) continue;
      let m = d[i];
      if (x < w - 1) m = Math.min(m, d[i + 1] + 2);
      if (y < h - 1) m = Math.min(m, d[i + w] + 2);
      if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + 3);
      if (x > 0 && y < h - 1) m = Math.min(m, d[i + w - 1] + 3);
      d[i] = m;
    }
  }
  // back to whole pixels
  for (let i = 0; i < w * h; i++) d[i] = Math.round(d[i] / 2);
  return d;
}

/* ===================================================================== *
 * THE SHADING PASS
 * ===================================================================== */

const UL = [
  [-1, -1],
  [-1, 0],
  [0, -1],
];
const DR = [
  [1, 1],
  [1, 0],
  [0, 1],
];

/**
 * Re-light the whole composition. Everything the research asks for happens
 * here, in this order, and the order is the recipe:
 *
 *   base 2 -> dark core from depth -> lower-right step down -> rim-light the
 *   exposed upper-left arc of each mass -> highlight the lit masses -> burn
 *   index-0 occlusion seams where a mass in front crosses one behind.
 *
 * `opts.core` shifts how deep the dark core starts (sparse canopies never get
 * one, which is correct — you can see through an olive).
 * `opts.silver` lifts more rim pixels to the top of the ramp, which is how an
 * olive reads silver without leaving the olive ramp.
 */
export function shadeFoliage(buf, seed, opts = {}) {
  const { w, h, fol, own, masses } = buf;
  const core = opts.core ?? 0;
  const silver = opts.silver ?? 0;
  const shell = opts.shell ?? 1; // how fast a mass turns away from the light
  // How much of a qualifying rim actually lights. Below 1 the edge breaks into
  // a flicker instead of a continuous pale rind — which is what saves a lacy
  // canopy like the olive, where nearly every pixel is within a step of an
  // edge and a solid rim turns the whole tree khaki.
  const rimP = opts.rim ?? 1;
  const d = distanceToEdge(buf);
  const byId = new Map(masses.map((m) => [m.id, m]));
  const exposed = new Uint8Array(w * h); // how many upper-left neighbours are sky
  const leftFace = new Uint8Array(w * h); // ...and whether any of them is to my LEFT
  const occl = new Uint8Array(w * h); // a mass in front crosses me here
  const drop = new Uint8Array(w * h); // my own lower-right edge
  const gSeed = new Int32Array(w * h).fill(-1); // sky-facing surface of the canopy
  const mSeed = new Int32Array(w * h).fill(-1); // sky-facing surface of each mass

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = own[i];
      if (k < 0) continue;
      let sky = false;
      for (let n = 0; n < 3; n++) {
        const dx = UL[n][0];
        const dy = UL[n][1];
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
          exposed[i]++;
          sky = true;
          if (dx < 0) leftFace[i] = 1;
          continue;
        }
        const j = ny * w + nx;
        if (buf.hole[j]) continue; // a hole is interior, not sky
        const o = own[j];
        if (o === k) continue;
        if (o < 0 || o < k) {
          exposed[i]++; // sky, or a mass behind me
          if (o < 0) sky = true;
          if (dx < 0) leftFace[i] = 1;
        } else {
          occl[i] = 1; // a mass in FRONT of me
        }
      }
      // Seed the two distance fields. A mass whose lit edge is covered by a
      // mass in FRONT of it is seeded at a cost rather than at zero: it is in
      // that mass's shadow, not in the sun, but it is not pitch black either.
      if (sky) gSeed[i] = 0;
      if (exposed[i] > 0) mSeed[i] = 0;
      else if (occl[i]) mSeed[i] = 8;
      for (const [dx, dy] of DR) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || own[ny * w + nx] !== k) {
          drop[i] = 1;
          break;
        }
      }
    }
  }

  // THE LIGHT DEPTH — how far a pixel is from a surface the sun can see.
  // Two of them, and between them they are the whole reason this reads as a
  // tree rather than an onion or a heap of bananas:
  //
  //   gDepth — distance from the canopy's own sky-facing surface, through the
  //            whole silhouette. This is the global gradient: upper-left
  //            bright, underside and trunk side dark. A radial "distance to
  //            the outline" instead puts the darkest pixels dead centre and
  //            the tree reads inside-out — a light rind around a hollow.
  //   mDepth — the same distance but confined to my own mass, so each mass
  //            gets its own dome and the canopy reads as several lumps rather
  //            than one smoothly graded ball.
  //
  // Both must be true DISTANCES, not counts along the up-left diagonal. A
  // diagonal ray count is anisotropic: its iso-lines are straight 45-degree
  // bands, and a canopy shaded by it comes out striped like a pile of bananas.
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = own[i] >= 0 ? 1 : 0;
  const always = () => true;
  const sameMass = (i, j) => own[i] === own[j];
  const gDepth = chamferFrom(w, h, inside, gSeed, always);
  const mDepth = chamferFrom(w, h, inside, mSeed, sameMass);

  // Thresholds scale with the plant. A fixed "4px in = dark" rule turns a 50px
  // oak almost entirely black while leaving a 12px shrub flat.
  const depth = (i) => (gDepth[i] * 0.55 + mDepth[i] * shell) / 2;
  let tMax = 0;
  for (let i = 0; i < w * h; i++) {
    if (own[i] < 0) continue;
    const t = depth(i);
    if (t > tMax) tMax = t;
  }
  // These two numbers decide whether the game is legible. THE LOAD-BEARING
  // RELATIONSHIP (palette.js): grass mid #74863C is lighter than canopy mid
  // #47632F, and trees must read DARK against the ground. Raise these and the
  // canopy drifts up into the grass's value range, the map turns to mush, and
  // no amount of silhouette work gets it back.
  const t1 = clamp(tMax * 0.22, 1.5, 8) - core;
  const t2 = clamp(tMax * 0.52, 3.5, 16) - core;

  const out = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const k = own[i];
      if (fol[i] < 0) continue;
      if (k < 0) {
        out[i] = fol[i];
        continue;
      }
      const m = byId.get(k) || { lit: false, shadow: false };
      const jt = hash2(x, y, seed);
      const s = mDepth[i] / 2;
      // Jitter the ladder by a pixel so the value boundaries do not resolve
      // into contour lines — the "banding" the research warns about.
      const t = depth(i) + (jt - 0.5) * 1.7;

      // Body value. Index 2 is the BODY colour and most of the canopy should
      // be sitting on it; index 0 is for the underside, the crevices and the
      // trunk side. Tighten this and you get a near-black silhouette with a
      // thin bright edge, which is a different failure from "green blob" but
      // just as dead.
      let v = 2;
      if (t >= t1) v = 1;
      if (t >= t2) v = 0;
      if (drop[i]) v = Math.min(v, 1);

      // Rim. Two rules make it read as foliage rather than cracked paint:
      //   - ONLY near the outer surface. A mass boundary four pixels inside
      //     the canopy is a crevice, not an edge facing the sky.
      //   - ONLY where the edge actually faces upper-LEFT. Firing on any
      //     exposed pixel wraps a continuous bright hairline right around the
      //     silhouette, which is the loudest "this was shaded by a program"
      //     tell there is.
      const surface = d[i] <= 1;
      const facing =
        (exposed[i] >= 2 || (exposed[i] === 1 && leftFace[i])) && (rimP >= 1 || hash2(x, y, seed ^ 0x77) < rimP);
      if (facing && !m.shadow && surface) {
        if (s < 1) {
          const hot = (m.lit && jt < 0.4) || (silver > 0 && jt < silver);
          v = Math.max(v, hot ? 4 : 3);
        } else if (s < 1.6) {
          v = Math.max(v, 3);
        }
      } else if (facing && m.shadow && surface && s < 1 && jt < 0.3) {
        v = Math.max(v, 2); // a shadowed mass still catches a little edge
      }

      // Occlusion seam: index 0 on the BEHIND mass's side of the crossing.
      // Inside crevices drop two steps, not one (RESEARCH §A.4).
      if (occl[i]) v = 0;
      out[i] = v;
    }
  }
  buf.fol = out;
}

/* ===================================================================== *
 * DECORATION — blossom, fruit, flower spikes
 *
 * The accents go on LAST, after the shading pass, straight into the front
 * layer, exactly like the flower heads flowerPatch has always drawn. They
 * are raw: nothing re-lights them, because five saturated pixels is the
 * loudest thing on the map and the moment they are shaded they stop being
 * an accent and become texture.
 *
 * The mechanism is deliberately one function for all of them, because the
 * white-flowering plants have to be told apart by DENSITY and where the
 * blossom sits, and that is only a fair comparison if they go through the
 * same code. Blackthorn is smothered (n large, tight spacing, on the whole
 * sky-facing rind); hawthorn is clustered (n small, wide spacing); almond
 * is scattered along bare twigs.
 * ===================================================================== */

/**
 * The pixels an accent can sit on.
 *   'surface' — the sky-facing rind: a pixel with nothing above it.
 *   'under'   — the underside: a pixel with nothing below it. Fruit hangs.
 *   'edge'    — anywhere on the outline.
 *   'any'     — anywhere in the foliage at all.
 */
function surfacePoints(buf, kind) {
  const { w, h, fol } = buf;
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // 'wood' is the odd one and the whole reason the almond works: its
      // blossom sits on BARE TWIGS, so the candidate set is the back layer.
      if (kind === 'wood') {
        if (buf.back[i] && fol[i] < 0) out.push([x, y]);
        continue;
      }
      if (fol[i] < 0) continue;
      if (kind === 'any') out.push([x, y]);
      else if (kind === 'under') {
        if (y + 1 >= h || fol[i + w] < 0) out.push([x, y]);
      } else if (kind === 'edge') {
        if (
          (x > 0 && fol[i - 1] < 0) ||
          (x < w - 1 && fol[i + 1] < 0) ||
          (y > 0 && fol[i - w] < 0) ||
          (y < h - 1 && fol[i + w] < 0)
        )
          out.push([x, y]);
      } else if (y === 0 || fol[i - w] < 0) out.push([x, y]);
    }
  }
  return out;
}

/**
 * @param {object[]} specs  [{ clumps|clump, n, where, gapX, gapY, jitter, sink }]
 *   sink pushes a BASE-ANCHORED stamp (a poppy, a lavender spike) down into
 *   the foliage so its stalk is rooted instead of hanging in the air.
 */
function decorate(buf, rnd, specs) {
  for (const spec of specs) {
    const names = spec.clumps || [spec.clump];
    const pool = names.map((n) => CLUMPS[n]).filter(Boolean);
    if (!pool.length) continue;
    let pts = surfacePoints(buf, spec.where || 'surface');
    if (!pts.length) continue;
    // A vertical band of the candidate set, as a fraction of its own extent.
    // Keeps almond blossom off the bare bole without the decoration pass
    // needing to know anything about trunks.
    if (spec.band) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        if (p[1] < lo) lo = p[1];
        if (p[1] > hi) hi = p[1];
      }
      const a = lo + spec.band[0] * (hi - lo);
      const b = lo + spec.band[1] * (hi - lo);
      const kept = pts.filter((p) => p[1] >= a && p[1] <= b);
      if (kept.length) pts = kept;
    }
    const n = Math.max(0, Math.round(spec.n || 0));
    const gapX = spec.gapX ?? 4;
    const gapY = spec.gapY ?? 3;
    const jit = spec.jitter ?? 1;
    const placed = [];
    for (let t = 0; placed.length < n && t < n * 16; t++) {
      const p = pts[Math.floor(rnd() * pts.length)];
      const x = p[0] + Math.round((rnd() * 2 - 1) * jit);
      const y = p[1] + (spec.sink || 0) + Math.round((rnd() * 2 - 1) * jit);
      if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) continue;
      if (placed.some((q) => Math.abs(q[0] - x) < gapX && Math.abs(q[1] - y) < gapY)) continue;
      placed.push([x, y]);
      stamp(buf, pool[Math.floor(rnd() * pool.length)], x, y, -1, { clip: false, layer: 'front' });
    }
  }
}

/* ===================================================================== *
 * Trunks and limbs
 * ===================================================================== */

/**
 * Earth-ramp key for a trunk column: lit side one step brighter.
 *
 * The top of the earth ramp (#9E7D52, #C0A176) is a pale sunlit sand, and on a
 * 3px trunk a third of the wood lands on it — the tree then wears a pink stick.
 * Only trunks wide enough to carry a real lit face get the bright value.
 */
function trunkKey(t, wd) {
  if (wd >= 5) {
    if (t < 0.22) return EARTH[3];
    if (t < 0.5) return EARTH[2];
    if (t < 0.8) return EARTH[1];
    return EARTH[0];
  }
  if (t < 0.36) return EARTH[2];
  if (t < 0.75) return EARTH[1];
  return EARTH[0];
}

function drawLimb(buf, x0, y0, x1, y1, w0, w1, wobble = 0, rnd = null) {
  const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  let off = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (rnd && wobble) off = clamp(off + (rnd() - 0.5) * wobble, -wobble * 3, wobble * 3);
    const cx = lerp(x0, x1, t) + off;
    const cy = lerp(y0, y1, t);
    const wd = Math.max(1, Math.round(lerp(w0, w1, t)));
    const left = Math.round(cx - (wd - 1) / 2);
    for (let k = 0; k < wd; k++) {
      const bx = left + k;
      const by = Math.round(cy);
      if (bx < 0 || by < 0 || bx >= buf.w || by >= buf.h) continue;
      buf.back[by * buf.w + bx] = trunkKey(wd === 1 ? 0.5 : k / (wd - 1), wd);
    }
  }
}

/**
 * A trunk that forks BEFORE it meets the canopy — the other half of the cure
 * for "broccoli". Returns the fork point so the caller can hang masses on it.
 */
function drawTrunk(buf, rnd, o) {
  const { baseX, baseY, topX, topY, wBase, wTop, gnarl = 0, boughs = [] } = o;
  drawLimb(buf, baseX, baseY, topX, topY, wBase, wTop, gnarl, rnd);
  for (const b of boughs) {
    drawLimb(buf, topX, topY, b[0], b[1], Math.max(1, wTop - 0.5), 1, gnarl * 0.6, rnd);
  }
  // The dark line where the trunk meets the ground. Cheap, and its absence is
  // instantly readable as a tree floating a pixel above the world.
  const half = Math.ceil(wBase / 2) + 1;
  for (let x = baseX - half; x <= baseX + half; x++) {
    if (x < 0 || x >= buf.w || baseY < 0 || baseY >= buf.h) continue;
    if (buf.back[baseY * buf.w + x]) buf.back[baseY * buf.w + x] = EARTH[0];
  }
}

/* ===================================================================== *
 * Output
 * ===================================================================== */

/** Canopy index 0..4 -> a key in whichever ramp this species uses. */
function rampKey(index, rampName) {
  const R = RAMPS[rampName] || RAMPS.canopy;
  const n = R.keys.length;
  return R.keys[clamp(Math.round((index / 4) * (n - 1)), 0, n - 1)];
}

/**
 * Remove pixels with no neighbour at all, across every layer.
 *
 * Deliberately weaker than prune(): this only kills genuinely orphaned pixels,
 * so a 1px reed blade or willow strand survives. Those orphans are the "fuzzy
 * edge" anti-pattern — invisible at 4x in the sprite lab, and at 1x they
 * dissolve into the ground and shimmer whenever the camera pans.
 */
function despeckle(buf) {
  const { w, h, fol, back, front } = buf;
  const solid = (i) => fol[i] >= 0 || back[i] || front[i];
  const kill = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid(i)) continue;
      // Orthogonal only. A pixel touching the sprite at nothing but a corner
      // still reads as a speck — diagonal contact is not contact.
      const n =
        (x > 0 && solid(i - 1)) ||
        (x < w - 1 && solid(i + 1)) ||
        (y > 0 && solid(i - w)) ||
        (y < h - 1 && solid(i + w));
      if (!n) kill.push(i);
    }
  }
  for (const i of kill) {
    fol[i] = -1;
    buf.own[i] = -1;
    back[i] = 0;
    front[i] = 0;
  }
}

function finish(buf, o) {
  const { name, ramp = 'canopy', anchor, footprint = [1, 1], tags = [], meta = {} } = o;
  despeckle(buf);
  const { w, h, fol, back, front } = buf;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (fol[i] < 0 && !back[i] && !front[i]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    return Object.freeze({
      name,
      rows: Object.freeze(['.']),
      w: 1,
      h: 1,
      anchor: Object.freeze([0, 0]),
      footprint: Object.freeze(footprint.slice()),
      tags: Object.freeze(tags.slice()),
      ...meta,
    });
  }
  const ow = x1 - x0 + 1;
  const oh = y1 - y0 + 1;
  const rows = [];
  for (let y = y0; y <= y1; y++) {
    let s = '';
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      s += front[i] || (fol[i] >= 0 ? rampKey(fol[i], ramp) : back[i] || '.');
    }
    rows.push(s);
  }
  return Object.freeze({
    name,
    rows: Object.freeze(rows),
    w: ow,
    h: oh,
    anchor: Object.freeze([clamp(anchor[0] - x0, 0, ow - 1), clamp(anchor[1] - y0, 0, oh - 1)]),
    footprint: Object.freeze(footprint.slice()),
    tags: Object.freeze(tags.slice()),
    ...meta,
  });
}

/* ===================================================================== *
 * Growth stages
 * ===================================================================== */

export const STAGES = ['sprout', 'young', 'mature'];
const STAGE_SCALE = { sprout: 0.2, young: 0.56, mature: 1 };
const STAGE_MASSES = { sprout: 0.34, young: 0.62, mature: 1 };

function stageOf(params) {
  const s = params.stage || 'mature';
  return STAGES.includes(s) ? s : 'mature';
}

/**
 * The sprout of every tree in the game. Deliberately species-neutral: at 8px
 * a baby oak and a baby plane are the same object, and pretending otherwise is
 * over-detail for the size.
 */
function sproutSprite(seed, params, name, ramp) {
  const rnd = rngFor(seed);
  const buf = makeBuf(17, 17);
  buf.masses = [
    { id: 0, cx: 8, cy: 9, r: 4, lit: true, shadow: false },
    { id: 1, cx: 8, cy: 6, r: 3, lit: false, shadow: false },
  ];
  stamp(buf, CLUMPS.seedling, 8, 15, 0, { flipX: rnd() < 0.5 });
  stamp(buf, CLUMPS.leafSmall, 8 + (rnd() < 0.5 ? -2 : 2), 9, 0, { flipX: rnd() < 0.5 });
  stamp(buf, CLUMPS.leafSmall, 8 + Math.round(rnd() * 4 - 2), 6, 1, { flipX: rnd() < 0.5 });
  // No prune() here. A seedling is two cotyledons on a 1px stem — the spur
  // filter that keeps big canopies chunky would eat the entire plant, and the
  // player would see nothing at all where they just planted a tree.
  shadeFoliage(buf, seed);
  return finish(buf, {
    name,
    ramp,
    anchor: [8, 16],
    tags: ['plant', 'sprout'],
    meta: { seed, stage: 'sprout' },
  });
}

/* ===================================================================== *
 * COMPOSERS
 * ===================================================================== */

// At 40-60px, species is silhouette and nothing else. The differences that
// actually survive are crown WIDTH, how far up the bole the crown starts, and
// whether the outline is lumpy or smooth — so those are what these numbers set.
// Oak: heavy, low-slung, broad. Plane: taller-shouldered and wider still, with
// more sky through it. Ash: a tall clean bole under a narrower vase crown.
// Poplar: a column.
const BROADLEAF_DEFAULTS = {
  oak: { w: 48, h: 54, trunk: 0.26, wTrunk: 6, masses: 5, holes: 2, ramp: 'canopy', lean: 2 },
  plane: { w: 54, h: 58, trunk: 0.36, wTrunk: 5, masses: 5, holes: 3, ramp: 'canopy', lean: 1 },
  poplar: { w: 24, h: 66, trunk: 0.22, wTrunk: 4, masses: 5, holes: 1, ramp: 'canopy', lean: 0 },
  ash: { w: 38, h: 62, trunk: 0.46, wTrunk: 4, masses: 4, holes: 2, ramp: 'canopy', lean: -2 },

  // ---- named trees ------------------------------------------------------
  // These are reached through the named composers at the foot of the file,
  // never through COMPOSER_INFO.broadleaf.variants: three of them leave the
  // canopy ramp, and the "a broadleaf uses its whole ramp" test is written
  // against the four canopy species above and should stay that way.

  // A hawthorn kept to one clean stem — small crown, tall clear bole, thorn.
  hawthorn: { w: 30, h: 38, trunk: 0.42, wTrunk: 3, masses: 4, holes: 2, ramp: 'canopy', lean: 1 },
  // Orchard apple: broad, low, and pruned open in the middle.
  apple: { w: 38, h: 36, trunk: 0.3, wTrunk: 5, masses: 5, holes: 3, ramp: 'canopy', lean: -2 },
  // Bay: dense, dark, upright, and clipped-looking without being clipped.
  bay: { w: 26, h: 46, trunk: 0.16, wTrunk: 4, masses: 5, holes: 1, ramp: 'cypress', lean: 0 },
  // Myrtle: little, tight, glossy. Its ramp is the olive, so it sits between
  // the dark evergreens and the grass instead of on top of either.
  myrtle: { w: 24, h: 28, trunk: 0.3, wTrunk: 3, masses: 4, holes: 1, ramp: 'olive', lean: 1 },
  // Almond: a tall bare bole under an open vase of twigs. The crown is
  // deliberately starved of foliage — see the composer's `twigs`.
  almond: { w: 34, h: 46, trunk: 0.5, wTrunk: 4, masses: 4, holes: 4, ramp: 'olive', lean: -2 },
  // Fig: stout, low, and built out of five leaves you can count.
  fig: { w: 40, h: 34, trunk: 0.24, wTrunk: 6, masses: 4, holes: 2, ramp: 'canopy', lean: 2 },
};

/**
 * broadleaf — oak, plane, poplar, ash.
 * params: { species, stage, seed override via arg, w, h, ramp, masses, holes }
 */
export function broadleaf(seed, params = {}) {
  const species = BROADLEAF_DEFAULTS[params.species] ? params.species : 'oak';
  const D = { ...BROADLEAF_DEFAULTS[species], ...params };
  const stage = stageOf(params);
  const ramp = D.ramp || 'canopy';
  const name = params.name || `grow.${species}.${stage}.${seed}`;
  if (stage === 'sprout') return sproutSprite(seed, params, name, ramp);

  const sc = STAGE_SCALE[stage];
  const W = Math.max(10, Math.round(D.w * lerp(0.72, 1, sc)));
  const H = Math.max(12, Math.round(D.h * sc));
  const rnd = rngFor(seed);
  const PAD = 4;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  const trunkH = Math.round(H * D.trunk);
  const forkY = baseY - trunkH;
  const canopyTop = PAD;
  const canopyBot = Math.min(buf.h - PAD - 2, forkY + Math.round(H * 0.14));
  const halfW = (W / 2) * 0.98;
  const lean = D.lean * sc;

  const mask = envelopeMask(buf, rnd, {
    cx: baseX + lean,
    top: canopyTop,
    bottom: canopyBot,
    halfW,
    profile: PROFILES[D.profile] || PROFILES[species] || PROFILES.oak,
    lean: -lean * 0.5,
    wobble: D.wobble ?? 0.15,
    lobeAmp: D.lobeAmp ?? (species === 'poplar' ? 0.07 : 0.12),
  });

  const nMass = Math.max(3, Math.round(D.masses * STAGE_MASSES[stage]) + 1);
  const masses = placeMasses(rnd, mask, buf, {
    top: canopyTop + 2,
    bottom: canopyBot - 2,
    n: nMass,
    minR: Math.max(3, W * 0.1),
    maxR: Math.max(5, W * 0.22),
    spread: species === 'poplar' ? 0.35 : 0.75,
  });
  buf.masses = masses;

  const named = (list) => list.map((n) => CLUMPS[n]).filter(Boolean);
  const pool = D.pool
    ? named(D.pool)
    : W > 34
    ? [CLUMPS.leafLarge, CLUMPS.leafMed, CLUMPS.leafLopsided]
    : [CLUMPS.leafMed, CLUMPS.leafSmall, CLUMPS.leafLopsided];
  const smallPool = D.smallPool ? named(D.smallPool) : [CLUMPS.leafSmall, CLUMPS.leafMed];
  const cMin = D.count ? D.count[0] : 2;
  const cSpan = D.count ? D.count[1] - D.count[0] + 1 : 3;
  for (const m of masses) {
    growMass(buf, rnd, m, m.r > W * 0.17 ? pool : smallPool, mask, {
      count: cMin + Math.floor(rnd() * cSpan),
      jitter: 0.75,
      breakOut: rnd() < 0.4,
    });
  }
  fillGaps(buf, rnd, mask, masses, smallPool, D.fill ?? 5, 4);

  // Trunk and boughs, drawn to the lowest masses so the canopy sits on wood.
  const low = [...masses].sort((a, b) => b.cy - a.cy).slice(0, 3);
  drawTrunk(buf, rnd, {
    baseX,
    baseY,
    topX: Math.round(baseX + lean * 0.6),
    topY: forkY,
    wBase: Math.max(2, D.wTrunk * sc),
    wTop: Math.max(1, D.wTrunk * sc * 0.55),
    gnarl: D.gnarl ?? 0.18,
    boughs: low.map((m) => [m.cx, m.cy + Math.round(m.r * 0.4)]),
  });

  // BARE TWIGS. An almond in flower is a scaffold of black wood with pale
  // flowers stuck to it, and no arrangement of leaf clumps will ever say
  // that. Limbs are run right out through the crown to the envelope edge so
  // the blossom has something to sit on that is visibly not a leaf.
  if (D.twigs) {
    for (let i = 0; i < D.twigs; i++) {
      const m = masses[Math.floor(rnd() * masses.length)];
      const a = -Math.PI * (0.12 + rnd() * 0.76);
      const reach = m.r * (1 + rnd() * 0.9);
      drawLimb(
        buf,
        Math.round(baseX + lean * 0.6),
        forkY,
        Math.round(m.cx + Math.cos(a) * reach),
        Math.round(m.cy + Math.sin(a) * reach * 0.7),
        Math.max(1, D.wTrunk * sc * 0.4),
        1,
        0.5,
        rnd
      );
    }
  }

  prune(buf, 2);
  punchHoles(buf, rnd, mask, Math.round(D.holes * (stage === 'young' ? 0.6 : 1)), 1.4);
  prune(buf, 1);
  dropIslands(buf);
  smoothOwn(buf, 2);
  shadeFoliage(buf, seed, { core: species === 'plane' ? 1 : 0, ...(D.shade || {}) });
  if (D.deco && stage !== 'sprout') decorate(buf, rnd, D.deco);

  return finish(buf, {
    name,
    ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'tree', 'broadleaf', species],
    meta: { seed, stage, species, composer: D.composer || 'broadleaf' },
  });
}

const CONIFER_DEFAULTS = {
  cypress: { w: 22, h: 68, trunk: 0.06, wTrunk: 3, masses: 5, holes: 0, ramp: 'cypress' },
  umbrella: { w: 54, h: 58, trunk: 0.58, wTrunk: 5, masses: 4, holes: 1, ramp: 'cypress' },
};

/**
 * conifer — cypress and umbrella (stone) pine.
 *
 * These are two genuinely different silhouettes and they are built two
 * different ways. The cypress is a narrow flame with almost no clumping: small
 * sprays packed tight, so its outline is the envelope and its interior is
 * nearly solid dark. The umbrella pine is the opposite — a long BARE trunk
 * with a flat table of two or three overlapping horizontal plates on top, and
 * the empty space under the table is most of what identifies it.
 */
export function conifer(seed, params = {}) {
  const species = CONIFER_DEFAULTS[params.species] ? params.species : 'cypress';
  const D = { ...CONIFER_DEFAULTS[species], ...params };
  const stage = stageOf(params);
  const ramp = D.ramp || 'cypress';
  const name = params.name || `grow.${species}.${stage}.${seed}`;
  if (stage === 'sprout') return sproutSprite(seed, params, name, ramp);

  const sc = STAGE_SCALE[stage];
  const W = Math.max(9, Math.round(D.w * lerp(0.7, 1, sc)));
  const H = Math.max(14, Math.round(D.h * sc));
  const rnd = rngFor(seed);
  const PAD = 4;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);
  const trunkH = Math.round(H * D.trunk);
  const forkY = baseY - trunkH;
  const canopyTop = PAD;
  const canopyBot = Math.min(buf.h - PAD - 2, forkY + (species === 'umbrella' ? 2 : 0));

  // A stone pine's bole is long and bare, which makes it read as a lamp-post
  // unless it leans and wanders. The lean is most of what stops that.
  const lean = species === 'umbrella' ? (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 3) * sc : 0;
  const mask = envelopeMask(buf, rnd, {
    cx: baseX + lean,
    top: canopyTop,
    bottom: canopyBot,
    halfW: (W / 2) * 0.98,
    profile: PROFILES[species],
    lean: -lean,
    wobble: species === 'cypress' ? 0.1 : 0.14,
    lobeAmp: species === 'cypress' ? 0.09 : 0.13,
  });

  const nMass = Math.max(3, Math.round(D.masses * STAGE_MASSES[stage]) + 1);
  const masses = placeMasses(rnd, mask, buf, {
    top: canopyTop + 2,
    bottom: canopyBot - 2,
    n: nMass,
    minR: species === 'cypress' ? 3 : Math.max(4, W * 0.12),
    maxR: species === 'cypress' ? Math.max(4, W * 0.5) : Math.max(7, W * 0.26),
    spread: species === 'cypress' ? 0.3 : 0.7,
  });
  buf.masses = masses;

  if (species === 'cypress') {
    const pool = [CLUMPS.conSpray, CLUMPS.conTuft];
    for (const m of masses) growMass(buf, rnd, m, pool, mask, { count: 4, jitter: 0.9 });
    fillGaps(buf, rnd, mask, masses, [CLUMPS.conTuft, CLUMPS.conSpray], 6, 3);
  } else {
    // TIERS, not a saucer. The stone pine's identity is a small number of flat
    // plates at distinct heights with daylight between their ends — draw it as
    // one smooth dome on a stick and you have a mushroom, which is exactly what
    // the first four renders of this composer produced.
    for (const m of masses) {
      const spanW = Math.round(m.r * 1.6);
      for (let p = -1; p <= 1; p++) {
        stamp(buf, CLUMPS.conFan, m.cx + p * spanW, m.cy + Math.round((rnd() - 0.5) * 3), m.id, {
          envelope: mask,
          flipX: rnd() < 0.5,
        });
      }
      // Tufts hanging off the ends, unclipped, so the underside is ragged
      // instead of a knife-straight arc.
      for (let i = 0; i < 3; i++) {
        stamp(buf, CLUMPS.conTuft, m.cx + Math.round((rnd() * 2 - 1) * m.r * 1.15), m.cy + Math.round(rnd() * 4 - 1), m.id, {
          clip: false,
          flipX: rnd() < 0.5,
        });
      }
    }
    fillGaps(buf, rnd, mask, masses, [CLUMPS.conTuft, CLUMPS.conFan], 3, 5);
  }

  const low = [...masses].sort((a, b) => b.cy - a.cy).slice(0, 2);
  drawTrunk(buf, rnd, {
    baseX,
    baseY,
    topX: Math.round(baseX + lean),
    topY: forkY,
    wBase: Math.max(2, D.wTrunk * sc),
    wTop: Math.max(1, D.wTrunk * sc * 0.5),
    gnarl: species === 'umbrella' ? 0.34 : 0.05,
    boughs: species === 'umbrella' ? low.map((m) => [m.cx, m.cy + 2]) : [],
  });

  prune(buf, 2);
  punchHoles(buf, rnd, mask, D.holes, 1.4);
  prune(buf, 1);
  dropIslands(buf);
  smoothOwn(buf, 2);
  shadeFoliage(buf, seed, { core: species === 'cypress' ? 1 : -1, shell: species === 'cypress' ? 0.8 : 0.9 });

  return finish(buf, {
    name,
    ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'tree', 'conifer', species],
    meta: { seed, stage, species, composer: 'conifer' },
  });
}

/**
 * olive — gnarled, sparse, silver.
 *
 * The three adjectives are three separate mechanisms: a trunk that wanders and
 * forks low, a clump budget deliberately too small to close the canopy (you
 * should see sky and branch through it), and a rim-light lifted to the top of
 * the olive ramp far more often than a canopy tree would allow.
 */
export function olive(seed, params = {}) {
  const D = { w: 44, h: 42, trunk: 0.4, wTrunk: 7, masses: 5, holes: 3, ramp: 'olive', ...params };
  const stage = stageOf(params);
  const ramp = D.ramp || 'olive';
  const name = params.name || `grow.olive.${stage}.${seed}`;
  if (stage === 'sprout') return sproutSprite(seed, params, name, ramp);

  const sc = STAGE_SCALE[stage];
  const W = Math.max(12, Math.round(D.w * lerp(0.7, 1, sc)));
  const H = Math.max(14, Math.round(D.h * sc));
  const rnd = rngFor(seed);
  const PAD = 4;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);
  const trunkH = Math.round(H * D.trunk);
  const forkY = baseY - trunkH;

  const mask = envelopeMask(buf, rnd, {
    cx: baseX,
    top: PAD,
    bottom: Math.min(buf.h - PAD - 2, forkY + Math.round(H * 0.12)),
    halfW: (W / 2) * 0.98,
    profile: PROFILES.olive,
    wobble: 0.2,
    lobeAmp: 0.16,
  });

  const nMass = Math.max(3, Math.round(D.masses * STAGE_MASSES[stage]) + 1);
  const masses = placeMasses(rnd, mask, buf, {
    top: PAD + 2,
    bottom: forkY,
    n: nMass,
    minR: Math.max(3, W * 0.1),
    maxR: Math.max(5, W * 0.2),
    spread: 0.85,
  });
  buf.masses = masses;

  // leafSmall is in the pool on purpose: an olive built purely from the gappy
  // olive/scrub stamps dissolves into khaki scribble at 1x and stops reading as
  // a tree at all. The solid stamps give it a body; punchHoles gives back the
  // see-through, but as a few real gaps rather than allover perforation.
  const pool = [CLUMPS.oliveTuft, CLUMPS.scrubTuft, CLUMPS.leafSmall];
  for (const m of masses) growMass(buf, rnd, m, pool, mask, { count: 3, jitter: 0.8, breakOut: rnd() < 0.5 });
  fillGaps(buf, rnd, mask, masses, [CLUMPS.leafSmall, CLUMPS.scrubTuft], 3, 5);

  // A gnarled trunk: it wanders, it forks low, and one limb goes its own way.
  const low = [...masses].sort((a, b) => b.cy - a.cy);
  drawTrunk(buf, rnd, {
    baseX,
    baseY,
    topX: baseX + Math.round((rnd() * 2 - 1) * 3),
    topY: forkY,
    wBase: Math.max(3, D.wTrunk * sc),
    wTop: Math.max(2, D.wTrunk * sc * 0.5),
    gnarl: 0.5,
    boughs: low.slice(0, 3).map((m) => [m.cx, m.cy + 2]),
  });
  // The hollow. Old olives are half air, and one dark notch sells eighty years.
  if (stage === 'mature') {
    const hy = forkY + Math.round(trunkH * (0.3 + rnd() * 0.4));
    for (let y = hy; y < hy + Math.max(2, Math.round(trunkH * 0.25)); y++) {
      const i = y * buf.w + baseX + (rnd() < 0.5 ? 0 : 1);
      if (buf.back[i]) buf.back[i] = EARTH[0];
    }
  }

  prune(buf, 2);
  punchHoles(buf, rnd, mask, D.holes, 1.4);
  prune(buf, 1);
  dropIslands(buf);
  smoothOwn(buf, 2);
  // "Silver" is a handful of top-of-ramp pixels on the rim, not a tint. Push
  // this past ~0.1 and the olive stops reading as a dark Mediterranean tree
  // and starts reading as dead khaki brush.
  shadeFoliage(buf, seed, { core: 1, silver: 0.1, shell: 1.2, rim: 0.5 });

  return finish(buf, {
    name,
    ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'tree', 'olive'],
    meta: { seed, stage, species: 'olive', composer: 'olive' },
  });
}

/**
 * willow — weeping.
 *
 * A rounded crown, then strands hung from the underside of that crown down
 * past it. Strands are their own masses so the shading pass gives each one a
 * lit left edge and a dark right edge, which is what stops a curtain of green
 * lines reading as a comb.
 */
export function willow(seed, params = {}) {
  const D = { w: 50, h: 56, trunk: 0.26, wTrunk: 5, masses: 4, holes: 2, ramp: 'canopy', strands: 16, ...params };
  const stage = stageOf(params);
  const ramp = D.ramp || 'canopy';
  const name = params.name || `grow.willow.${stage}.${seed}`;
  if (stage === 'sprout') return sproutSprite(seed, params, name, ramp);

  const sc = STAGE_SCALE[stage];
  const W = Math.max(14, Math.round(D.w * lerp(0.72, 1, sc)));
  const H = Math.max(16, Math.round(D.h * sc));
  const rnd = rngFor(seed);
  const PAD = 4;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);
  const trunkH = Math.round(H * D.trunk);
  const forkY = baseY - trunkH;
  const crownBot = forkY - Math.round(H * 0.1);

  const mask = envelopeMask(buf, rnd, {
    cx: baseX,
    top: PAD,
    bottom: crownBot,
    halfW: (W / 2) * 0.92,
    profile: PROFILES.willow,
    wobble: 0.14,
    lobeAmp: 0.12,
  });

  const nMass = Math.max(3, Math.round(D.masses * STAGE_MASSES[stage]) + 1);
  const masses = placeMasses(rnd, mask, buf, {
    top: PAD + 2,
    bottom: crownBot - 2,
    n: nMass,
    minR: Math.max(3, W * 0.11),
    maxR: Math.max(5, W * 0.2),
    spread: 0.7,
  });
  buf.masses = masses;
  const pool = [CLUMPS.leafMed, CLUMPS.leafLopsided, CLUMPS.leafSmall];
  for (const m of masses) growMass(buf, rnd, m, pool, mask, { count: 3, jitter: 0.8 });
  fillGaps(buf, rnd, mask, masses, [CLUMPS.leafSmall], 4, 4);

  // Crown hygiene happens BEFORE the strands are hung. prune() eats 1px tips,
  // and a pruned willow strand reads as dripping paint rather than foliage.
  prune(buf, 2);
  punchHoles(buf, rnd, mask, D.holes, 1.4);
  prune(buf, 1);
  dropIslands(buf);
  smoothOwn(buf, 2, masses.length);

  // Strands, hung from the crown's own lower boundary so they start where the
  // foliage actually ends rather than from a guessed rectangle. Each strand is
  // its own mass, which is what gives it a lit left edge and a dark right one
  // — the difference between a weeping willow and a comb.
  const nStr = Math.max(3, Math.round(D.strands * lerp(0.5, 1, sc)));
  let nextId = masses.length;
  for (let s = 0; s < nStr; s++) {
    const t = (s + 0.5) / nStr;
    const sx = Math.round(lerp(PAD + 2, buf.w - PAD - 3, t) + (rnd() * 2 - 1) * 2);
    let sy = -1;
    for (let y = crownBot + 2; y >= PAD; y--) {
      if (sx >= 0 && sx < buf.w && buf.fol[y * buf.w + sx] >= 0) {
        sy = y;
        break;
      }
    }
    if (sy < 0) continue;
    const id = nextId++;
    // Longest at the edges of the crown, shortest under the middle — that is
    // the weeping silhouette, and getting it backwards makes a green jellyfish.
    const edge = Math.abs(t - 0.5) * 2;
    const len = Math.round(H * (0.14 + 0.2 * (0.4 + edge * 0.6)) * (0.8 + rnd() * 0.4));
    buf.masses.push({ id, cx: sx, cy: sy + len / 2, r: 3, lit: t < 0.35, shadow: t > 0.86 });
    let drift = 0;
    let x = sx;
    for (let k = 0; k < len; k++) {
      const y = sy + k;
      if (y >= buf.h - 2) break;
      drift += (rnd() - 0.5) * 0.42;
      x = Math.round(sx + drift);
      // Wide where it leaves the crown, tapering to a point: a strand of
      // constant width is a comb tooth, and sixteen of them are a comb.
      const u = k / len;
      const wd = u < 0.35 ? 3 : u < 0.72 ? 2 : 1;
      for (let dx = 0; dx < wd; dx++) {
        const bx = x + dx;
        if (bx < 1 || bx >= buf.w - 1) continue;
        const i = y * buf.w + bx;
        buf.fol[i] = 2;
        buf.own[i] = id;
      }
    }
    if (rnd() < 0.75) stamp(buf, CLUMPS.willowSpray, x, sy + Math.round(len * 0.35), id, { clip: false, flipX: rnd() < 0.5 });
  }

  const low = [...masses].sort((a, b) => b.cy - a.cy).slice(0, 2);
  drawTrunk(buf, rnd, {
    baseX,
    baseY,
    topX: baseX + Math.round((rnd() * 2 - 1) * 2),
    topY: forkY,
    wBase: Math.max(2, D.wTrunk * sc),
    wTop: Math.max(1, D.wTrunk * sc * 0.5),
    gnarl: 0.22,
    boughs: low.map((m) => [m.cx, m.cy + 2]),
  });

  shadeFoliage(buf, seed, { core: 0, shell: 1.2 });

  return finish(buf, {
    name,
    ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'tree', 'willow', 'water-loving'],
    meta: { seed, stage, species: 'willow', composer: 'willow' },
  });
}

/** shrub — a low dome, no visible trunk. The workhorse of the middle ground. */
export function shrub(seed, params = {}) {
  const kind0 = params.kind || 'leaf';
  // A scrub bush belongs on the olive ramp by default — it is dry Mediterranean
  // maquis, not a small oak. The caller can still override.
  const D = { w: 28, h: 24, masses: 4, holes: 1, ramp: kind0 === 'scrub' ? 'olive' : 'canopy', kind: 'leaf', ...params };
  const stage = stageOf(params);
  const ramp = D.ramp;
  const name = params.name || `grow.shrub.${D.kind}.${stage}.${seed}`;

  const sc = STAGE_SCALE[stage];
  const W = Math.max(7, Math.round(D.w * lerp(0.5, 1, sc)));
  const H = Math.max(6, Math.round(D.h * lerp(0.42, 1, sc)));
  const rnd = rngFor(seed);
  const PAD = 3;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  const mask = envelopeMask(buf, rnd, {
    cx: baseX,
    top: PAD,
    bottom: baseY - 1,
    halfW: (W / 2) * 0.98,
    profile: PROFILES[D.profile] || PROFILES.shrub,
    wobble: D.wobble ?? 0.18,
    lobeAmp: D.lobeAmp ?? 0.16,
  });

  const nMass = Math.max(2, Math.round(D.masses * STAGE_MASSES[stage]) + 1);
  const masses = placeMasses(rnd, mask, buf, {
    top: PAD + 1,
    bottom: baseY - 2,
    n: nMass,
    minR: Math.max(2, W * 0.13),
    maxR: Math.max(4, W * 0.26),
    spread: D.spread ?? 0.8,
  });
  buf.masses = masses;
  const named = (list) => list.map((n) => CLUMPS[n]).filter(Boolean);
  const pool = D.pool
    ? named(D.pool)
    : D.kind === 'scrub'
    ? [CLUMPS.scrubTuft, CLUMPS.oliveTuft]
    : D.kind === 'fern'
    ? [CLUMPS.fernFrond, CLUMPS.fernSmall]
    : [CLUMPS.leafMed, CLUMPS.leafSmall, CLUMPS.leafLopsided];
  const cMin = D.count ? D.count[0] : 2;
  const cSpan = D.count ? D.count[1] - D.count[0] + 1 : 2;
  for (const m of masses) {
    if (D.upright) growUpright(buf, rnd, m, pool, { count: cMin + Math.floor(rnd() * cSpan), jitter: D.jitter ?? 0.9, drop: D.drop ?? 0.5 });
    else growMass(buf, rnd, m, pool, mask, { count: cMin + Math.floor(rnd() * cSpan), jitter: D.jitter ?? 0.8, breakOut: rnd() < 0.5 });
  }
  fillGaps(
    buf,
    rnd,
    mask,
    masses,
    D.fillPool ? named(D.fillPool) : [CLUMPS.leafSmall, CLUMPS.scrubTuft],
    D.fill ?? (D.kind === 'scrub' ? 2 : 4),
    4
  );

  // Bare wood, drawn BEFORE the shading pass so the leaves keep their own
  // values: blackthorn flowers on naked spiny twigs, and a rose is canes.
  if (D.twigs) {
    for (let i = 0; i < D.twigs; i++) {
      stamp(
        buf,
        CLUMPS.thornTwig,
        Math.round(baseX + (rnd() * 2 - 1) * W * 0.4),
        Math.round(baseY - 1 - rnd() * H * 0.55),
        -1,
        { clip: false, flipX: rnd() < 0.5, layer: 'back' }
      );
    }
  }

  // A stub of woody stem, only where the foliage actually reaches the ground.
  if (D.stem !== false) drawLimb(buf, baseX, baseY, baseX + 1, baseY - Math.round(H * 0.3), 2, 1, 0.2, rnd);

  prune(buf, D.prune ?? 2);
  punchHoles(buf, rnd, mask, D.holes, 1);
  dropIslands(buf);
  smoothOwn(buf, 2);
  shadeFoliage(buf, seed, {
    core: D.kind === 'scrub' ? 1 : 0,
    silver: D.kind === 'scrub' ? 0.14 : 0,
    shell: 1.3,
    ...(D.shade || {}),
  });
  if (D.deco && stage !== 'sprout') decorate(buf, rnd, D.deco);

  return finish(buf, {
    name,
    ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'shrub', D.kind],
    meta: { seed, stage, composer: D.composer || 'shrub', kind: D.kind },
  });
}

const BLOOMS = {
  white: [CLUMPS.flowerWhite, CLUMPS.flowerUmbel],
  red: [CLUMPS.flowerRed],
  yellow: [CLUMPS.flowerYellow],
  iris: [CLUMPS.flowerIris],
  lace: [CLUMPS.flowerUmbel],
  mixed: [CLUMPS.flowerWhite, CLUMPS.flowerRed, CLUMPS.flowerYellow, CLUMPS.flowerIris, CLUMPS.flowerUmbel],
};

/**
 * flowerPatch — a tuft mat with heads on top.
 *
 * The grass goes through the shading pass on the grass ramp; the blooms are
 * raw accents drawn over it. Accents are the only saturated colour in the
 * game, which is exactly why five pixels of one reads from across the map.
 */
export function flowerPatch(seed, params = {}) {
  const D = { w: 36, h: 18, ramp: 'grass', bloom: 'mixed', density: 1, ...params };
  const stage = stageOf(params);
  const name = params.name || `grow.flowers.${D.bloom}.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(9, Math.round(D.w * lerp(0.42, 1, sc)));
  const H = Math.max(6, Math.round(D.h * lerp(0.5, 1, sc)));
  const rnd = rngFor(seed);
  const PAD = 3;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  // An isometric footprint: wider than tall, and elliptical, so a patch reads
  // as lying ON the diamond rather than standing up out of it.
  const rx = W / 2;
  const ry = H * 0.62;
  const mask = new Uint8Array(buf.w * buf.h);
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const nx = (x - baseX) / rx;
      const ny = (y - (baseY - ry * 0.55)) / ry;
      if (nx * nx + ny * ny <= 1) mask[y * buf.w + x] = 1;
    }
  }

  const nMass = Math.max(2, Math.round(3 * sc) + 1);
  const masses = [];
  for (let i = 0; i < nMass; i++) {
    masses.push({
      id: i,
      cx: Math.round(baseX + (rnd() * 2 - 1) * rx * 0.6),
      cy: Math.round(baseY - ry * (0.2 + rnd() * 0.7)),
      r: rx * 0.4,
      lit: i === 0,
      shadow: false,
    });
  }
  buf.masses = masses;
  const tuftA = CLUMPS[D.tuftA] || CLUMPS.grassTuft;
  const tuftB = CLUMPS[D.tuftB] || CLUMPS.grassBlade;
  const tufts = Math.round((6 + W * 0.5) * D.density);
  for (let i = 0; i < tufts; i++) {
    const a = rnd() * 6.283;
    const rr = Math.sqrt(rnd());
    const x = Math.round(baseX + Math.cos(a) * rx * rr * 0.92);
    const y = Math.round(baseY - ry * 0.4 + Math.sin(a) * ry * rr * 0.8);
    const m = masses[Math.floor(rnd() * masses.length)];
    stamp(buf, rnd() < (D.tuftMix ?? 0.65) ? tuftA : tuftB, x, y, m.id, { envelope: mask, clip: rnd() < 0.7, flipX: rnd() < 0.5 });
  }
  prune(buf, 1);
  shadeFoliage(buf, seed, { core: 1, ...(D.shade || {}) });

  // Heads, over the top. Not on the tallest pixel of each column — that puts
  // every bloom on one flat line and the patch reads as a hedge with icing.
  // Scatter them through the depth of the ellipse instead, some standing proud
  // at the back, some down among the leaves at the front.
  const heads = (D.heads && D.heads.map((n) => CLUMPS[n]).filter(Boolean)) || BLOOMS[D.bloom] || BLOOMS.mixed;
  const nHead = stage === 'sprout' ? 1 : Math.round((4 + W * 0.28) * (D.headDensity ?? D.density));
  const gapX = D.headGapX ?? 4;
  const gapY = D.headGapY ?? 3;
  const sink = D.headSink ?? 0;
  const placed = [];
  for (let i = 0; i < nHead; i++) {
    const a = rnd() * 6.283;
    const rr = Math.sqrt(rnd());
    const x = Math.round(baseX + Math.cos(a) * rx * rr * 0.88);
    const yy = Math.round(baseY - ry * 0.4 + Math.sin(a) * ry * rr * 0.85);
    // Find the foliage surface near this point rather than the column's top.
    let top = -1;
    for (let y = Math.max(0, yy - 5); y < buf.h; y++) {
      if (x >= 0 && x < buf.w && buf.fol[y * buf.w + x] >= 0) {
        top = y;
        break;
      }
    }
    if (top < 0) continue;
    top += Math.round(rnd() * 3 - 1) + sink;
    // Blooms of the same species do not grow shoulder to shoulder in a solid
    // bar; keep a little air between heads or a white patch reads as foam.
    if (placed.some(([px, py]) => Math.abs(px - x) < gapX && Math.abs(py - top) < gapY)) continue;
    placed.push([x, top]);
    stamp(buf, heads[Math.floor(rnd() * heads.length)], x, top, -1, { clip: false, layer: 'front' });
  }

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'flowers', D.bloom],
    meta: { seed, stage, composer: 'flowerPatch', bloom: D.bloom },
  });
}

/**
 * reeds — the naiad margin, and the "bent reed" that is the satyr's first
 * sighting tell. Blades are drawn as parametric arcs rather than stamped,
 * because a reed's identity is its curve; stamps go on top for mass.
 */
export function reeds(seed, params = {}) {
  const D = { w: 28, h: 30, ramp: 'grass', blades: 11, cattails: 2, ...params };
  const stage = stageOf(params);
  const name = params.name || `grow.reeds.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(8, Math.round(D.w * lerp(0.5, 1, sc)));
  const H = Math.max(8, Math.round(D.h * sc));
  const rnd = rngFor(seed);
  const PAD = 4;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  const n = Math.max(3, Math.round(D.blades * lerp(0.45, 1, sc)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const id = i;
    const x0 = Math.round(lerp(baseX - W / 2, baseX + W / 2, t) + (rnd() - 0.5) * 2);
    // Tallest in the middle, so the clump reads as a mound not a fence.
    const tall = 1 - Math.abs(t - 0.5) * 1.3;
    const len = Math.max(4, Math.round(H * (0.45 + 0.5 * tall) * (0.75 + rnd() * 0.5)));
    const bend = (rnd() * 2 - 1) * len * 0.35;
    buf.masses.push({ id, cx: x0, cy: baseY - len / 2, r: 2, lit: t < 0.45, shadow: t > 0.85 });
    for (let k = 0; k <= len; k++) {
      const u = k / len;
      const y = baseY - k;
      const x = Math.round(x0 + bend * u * u);
      const wd = u < 0.5 ? 2 : 1;
      for (let dx = 0; dx < wd; dx++) {
        const bx = x + dx;
        if (bx < 0 || bx >= buf.w || y < 0 || y >= buf.h) continue;
        const j = y * buf.w + bx;
        buf.fol[j] = 2;
        buf.own[j] = id;
      }
    }
    if (rnd() < 0.4) {
      stamp(buf, CLUMPS.reedBlade, Math.round(x0 + bend * 0.5), baseY, id, { flipX: bend < 0, clip: false });
    }
  }
  shadeFoliage(buf, seed, { core: 2 });

  // Cattails last, raw, on the tallest blades.
  const nCat = stage === 'mature' ? D.cattails : stage === 'young' ? Math.min(1, D.cattails) : 0;
  for (let i = 0; i < nCat; i++) {
    const x = Math.round(baseX + (rnd() * 2 - 1) * W * 0.3);
    let top = -1;
    for (let y = 0; y < buf.h; y++) {
      if (buf.fol[y * buf.w + x] >= 0) {
        top = y;
        break;
      }
    }
    if (top < 0) continue;
    stamp(buf, CLUMPS.reedHead, x, top + 3, -1, { clip: false, layer: 'front' });
  }

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'reed', 'water-loving'],
    meta: { seed, stage, composer: 'reeds' },
  });
}

/**
 * ivy — ground mat or rock drape.
 *
 * RESEARCH §B.1: ivy is the Dionysiac wreath and the thyrsos wrapping, so it
 * wants to look like it is COVERING something, not growing out of the soil.
 * Stems run first, leaves are stamped along them alternately mirrored.
 */
export function ivy(seed, params = {}) {
  const D = { drape: 'ground', ramp: 'canopy', runners: 7, ...params };
  const stage = stageOf(params);
  const wall = D.drape === 'wall';
  // A ground mat has to cover the tile's diamond, so it needs real vertical
  // extent as well as width — 16px tall was a worm lying on the grass.
  const base = wall ? { w: 26, h: 34 } : { w: 36, h: 22 };
  const name = params.name || `grow.ivy.${D.drape}.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(8, Math.round((D.w || base.w) * lerp(0.45, 1, sc)));
  const H = Math.max(6, Math.round((D.h || base.h) * lerp(0.45, 1, sc)));
  const rnd = rngFor(seed);
  const PAD = 3;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  // Ground ivy is a CARPET before it is a set of runners. Stems alone, however
  // many, resolve into a sparse asterisk; the leaves have to cover the diamond
  // first, and the runners then read as structure laid over that cover.
  // A named ground plant swaps the leaf, keeps the runner: a strawberry is
  // ivy's habit with a trefoil on it, and the trefoil is the whole tell.
  const leafBig = CLUMPS[D.leafBig] || CLUMPS.ivyLeaf;
  const leafSmall = CLUMPS[D.leafSmall] || CLUMPS.ivyLeafSmall;

  if (!wall) {
    const carpet = Math.round(W * H * (D.cover ?? 0.035) * lerp(0.5, 1, sc));
    for (let i = 0; i < carpet; i++) {
      const a = rnd() * 6.283;
      const rr = Math.sqrt(rnd());
      const cx = Math.round(baseX + Math.cos(a) * W * 0.5 * rr);
      const cy = Math.round(baseY - H * 0.45 + Math.sin(a) * H * 0.45 * rr);
      buf.masses.push({ id: 100 + i, cx, cy, r: 3, lit: rnd() < 0.3, shadow: rnd() < 0.2 });
      stamp(buf, rnd() < 0.6 ? leafBig : leafSmall, cx, cy, 100 + i, {
        clip: false,
        flipX: rnd() < 0.5,
      });
    }
  }

  const n = Math.max(2, Math.round(D.runners * lerp(0.5, 1, sc)) + (wall ? 0 : 2));
  for (let r = 0; r < n; r++) {
    const id = r;
    const t = (r + 0.5) / n;
    // A ground mat spreads over a footprint. Running every stem out from one
    // point along one line makes a caterpillar, not ground cover — the mat has
    // to occupy the tile's diamond, so origins scatter across an ellipse.
    // Runners start scattered through the footprint's ellipse and crawl
    // outward, so the mat fills a diamond instead of tracing one line.
    const a0 = rnd() * 6.283;
    const rr = Math.sqrt(rnd()) * 0.55;
    let x = wall
      ? Math.round(lerp(PAD + 1, buf.w - PAD - 2, t))
      : Math.round(baseX + Math.cos(a0) * W * 0.5 * rr);
    let y = wall ? PAD + 1 : Math.round(baseY - H * 0.45 + Math.sin(a0) * H * 0.42 * rr);
    const len = Math.round((wall ? H : W * 0.3) * (0.65 + rnd() * 0.5));
    const dir = wall ? 0 : rnd() < 0.5 ? -1 : 1;
    const climb = wall ? 0 : rnd() < 0.55 ? 1 : -1;
    buf.masses.push({ id, cx: x, cy: y, r: 4, lit: t < 0.45, shadow: t > 0.8 });
    for (let k = 0; k < len; k++) {
      if (wall) {
        y += 1;
        x += rnd() < 0.32 ? (rnd() < 0.5 ? -1 : 1) : 0;
      } else {
        x += dir;
        y += rnd() < 0.45 ? climb : 0;
      }
      if (x < 1 || y < 1 || x >= buf.w - 1 || y >= buf.h - 1) break;
      buf.back[y * buf.w + x] = EARTH[1];
      if (k % 2 === 1) {
        stamp(buf, rnd() < 0.65 ? leafBig : leafSmall, x, y - 1, id, { clip: false, flipX: rnd() < 0.5 });
      }
    }
  }
  prune(buf, 1);
  shadeFoliage(buf, seed, { core: 0, shell: 0.8, ...(D.shade || {}) });
  if (D.deco && stage !== 'sprout') decorate(buf, rnd, D.deco);

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'ivy', D.drape],
    meta: { seed, stage, composer: D.composer || 'ivy', drape: D.drape },
  });
}

/**
 * vine — untrellised, wild, climbing. The Cyclops diagnostic: no vine, no
 * satyrs (RESEARCH §B.1). It leans, it throws tendrils sideways, and a mature
 * one carries fruit.
 */
export function vine(seed, params = {}) {
  const D = { w: 30, h: 44, ramp: 'canopy', bunches: 2, ...params };
  const stage = stageOf(params);
  const name = params.name || `grow.vine.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(9, Math.round(D.w * lerp(0.5, 1, sc)));
  const H = Math.max(10, Math.round(D.h * sc));
  const rnd = rngFor(seed);
  const PAD = 3;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w * 0.42);

  // The main stem, climbing with a lean. The wander is deliberately small: a
  // vine that snakes across a third of its own width reads as a green serpent,
  // not as something gripping its way up a rock.
  const lean = (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.12);
  const nodes = [];
  let x = baseX;
  for (let y = baseY; y > PAD; y--) {
    const u = (baseY - y) / (baseY - PAD);
    x = Math.round(baseX + lean * (baseY - PAD) * u * u + Math.sin(u * 4.5 + seed) * 1.2);
    if (x < 1 || x >= buf.w - 1) x = clamp(x, 1, buf.w - 2);
    buf.back[y * buf.w + x] = EARTH[y % 3 === 0 ? 2 : 1];
    if (x + 1 < buf.w - 1 && y % 2 === 0) buf.back[y * buf.w + x + 1] = EARTH[1];
    if ((baseY - y) % 3 === 2) nodes.push([x, y]);
  }

  // Tendrils and leaves off the nodes.
  let id = 0;
  for (const [nx, ny] of nodes) {
    const dir = rnd() < 0.5 ? -1 : 1;
    const reach = 2 + Math.floor(rnd() * (W * 0.3));
    buf.masses.push({ id, cx: nx + (dir * reach) / 2, cy: ny, r: 4, lit: dir < 0, shadow: false });
    let tx = nx;
    let ty = ny;
    for (let k = 0; k < reach; k++) {
      tx += dir;
      ty += rnd() < 0.5 ? 1 : 0;
      if (tx < 1 || ty < 1 || tx >= buf.w - 1 || ty >= buf.h - 1) break;
      buf.back[ty * buf.w + tx] = EARTH[1];
    }
    stamp(buf, CLUMPS.vineLeaf, nx + dir * 2, ny - 1, id, { clip: false, flipX: dir > 0 });
    stamp(buf, CLUMPS.vineLeaf, Math.round((nx + tx) / 2), ny + 1, id, { clip: false, flipX: rnd() < 0.5 });
    if (rnd() < 0.8) stamp(buf, CLUMPS.vineLeaf, tx, ty, id, { clip: false, flipX: rnd() < 0.5 });
    if (rnd() < 0.7) stamp(buf, CLUMPS.ivyLeafSmall, nx - dir * 2, ny + 1, id, { clip: false });
    id++;
  }
  prune(buf, 1);
  shadeFoliage(buf, seed, { core: 2 });

  const nB = stage === 'mature' ? D.bunches : stage === 'young' ? Math.min(1, D.bunches) : 0;
  for (let i = 0; i < nB && nodes.length; i++) {
    const [nx, ny] = nodes[Math.floor(rnd() * nodes.length)];
    stamp(buf, CLUMPS.vineBunch, nx + (rnd() < 0.5 ? -3 : 3), ny + 3, -1, { clip: false, layer: 'front' });
  }

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'vine', 'climber'],
    meta: { seed, stage, composer: 'vine' },
  });
}

/* ===================================================================== *
 * ROSETTE — acanthus, and anything else built as radiating leaves.
 *
 * Not a dome. A dome composer given big leaves produces a lumpy dome made
 * of big leaves, which is what the first acanthus looked like. The plant
 * is a FAN: every leaf shares one crown point at the ground, splays out on
 * its own line, and is its own mass so the shading pass gives it a lit
 * upper-left edge and a dark underside. That per-leaf relighting is what
 * makes the cut lobes survive — the notch has a shadow in it.
 *
 * It is the plant on a Corinthian capital, so it has one job the others do
 * not: it must be recognisable standing at the foot of a column.
 * ===================================================================== */
export function rosette(seed, params = {}) {
  const D = { w: 34, h: 24, ramp: 'canopy', leaves: 9, spike: true, ...params };
  const stage = stageOf(params);
  const name = params.name || `grow.rosette.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(11, Math.round(D.w * lerp(0.36, 1, sc)));
  const H = Math.max(8, Math.round(D.h * lerp(0.36, 1, sc)));
  const rnd = rngFor(seed);
  const PAD = 3;
  const spikeH = stage === 'mature' && D.spike ? 20 : 0;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2 + spikeH);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);
  const crownY = baseY - Math.round(H * 0.1);

  const n = Math.max(3, Math.round(D.leaves * lerp(0.4, 1, sc)));
  const leaves = [];
  for (let i = 0; i < n; i++) {
    // Fan from just west of upright round to just east of it. Jittered, or
    // the leaves land on a protractor and the plant reads as a compass rose.
    const t = (i + 0.5) / n + (rnd() - 0.5) * 0.09;
    const ang = Math.PI * (0.95 - 0.9 * clamp(t, 0, 1));
    const cs = Math.cos(ang);
    const up = Math.abs(Math.sin(ang));
    const clump = up > 0.8 ? CLUMPS.acanthusUp : up > 0.4 ? CLUMPS.acanthusSide : CLUMPS.acanthusLow;
    // The leaves have to SEPARATE. The shading pass throws away every value a
    // clump was authored with and relights from depth, so a lobe only reads as
    // a lobe if there is real background in the notch — which means the fan
    // has to splay far enough that neighbouring blades do not overlap.
    const reach = W * (0.16 + rnd() * 0.2);
    leaves.push({
      x: Math.round(baseX + cs * reach),
      y: Math.round(crownY - up * reach * 0.55),
      flip: cs < 0,
      clump,
      up,
      cs,
    });
  }
  // Back to front: upright leaves stand behind the splayed ones, so the low
  // outer leaves are the ones that occlude and the plant has depth.
  leaves.sort((a, b) => b.up - a.up);
  buf.masses = leaves.map((L, i) => ({
    id: i,
    cx: L.x,
    cy: L.y,
    r: 6,
    lit: L.cs < -0.2 && L.up > 0.5,
    shadow: L.cs > 0.55 && L.up < 0.6,
  }));
  leaves.forEach((L, i) => {
    stamp(buf, L.clump, L.x, L.y, i, { clip: false, flipX: L.flip });
  });

  prune(buf, 1);
  dropIslands(buf);
  // shell high, rim low: each blade domes hard across its own width and the
  // rim only catches in flecks, which is what keeps a nine-leaf fan from
  // turning into nine pale outlines stacked on each other.
  shadeFoliage(buf, seed, { core: 0, shell: 1.7, rim: 0.7, ...(D.shade || {}) });

  if (spikeH) {
    const nS = 1 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < nS; i++) {
      stamp(buf, CLUMPS.acanthusSpike, baseX + Math.round((rnd() * 2 - 1) * W * 0.22), crownY - Math.round(H * 0.15), -1, {
        clip: false,
        layer: 'front',
      });
    }
  }

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'rosette', 'acanthus'],
    meta: { seed, stage, composer: D.composer || 'rosette' },
  });
}

/* ===================================================================== *
 * SPIRES — asphodel. A low rosette of strap leaves with tall pale stems
 * standing clear above it.
 *
 * The reason this is not flowerPatch with a white bloom: in a flower patch
 * the heads sit ON the foliage, and asphodel's whole silhouette is stalk
 * ABOVE foliage. Homer's meadow of the dead is a field of vertical lines.
 * ===================================================================== */
export function spires(seed, params = {}) {
  const D = { w: 22, h: 34, ramp: 'grass', spires: 3, leaves: 9, ...params };
  const stage = stageOf(params);
  const name = params.name || `grow.spires.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(8, Math.round(D.w * lerp(0.42, 1, sc)));
  const H = Math.max(9, Math.round(D.h * lerp(0.34, 1, sc)));
  const rnd = rngFor(seed);
  const PAD = 3;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  const n = Math.max(3, Math.round(D.leaves * lerp(0.4, 1, sc)));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = Math.round(baseX + (t * 2 - 1) * W * 0.46 + (rnd() - 0.5) * 3);
    const y = baseY - Math.round(rnd() * 3);
    buf.masses.push({ id: i, cx: x, cy: y - 5, r: 4, lit: t < 0.42, shadow: t > 0.82 });
    stamp(buf, rnd() < 0.75 ? CLUMPS.strapLeaf : CLUMPS.grassBlade, x, y, i, { clip: false, flipX: t > 0.5 });
  }
  prune(buf, 1);
  shadeFoliage(buf, seed, { core: 0, shell: 1.1, ...(D.shade || {}) });

  // The spires, raw and pale, straight out of the ground so the stalk is
  // continuous from the rosette to the flower.
  const nS = stage === 'mature' ? D.spires : stage === 'young' ? Math.max(1, D.spires - 2) : 1;
  for (let i = 0; i < nS; i++) {
    // Spaced on a line rather than rolled and rejected: a meadow of asphodel
    // is a stand of separate stems, and rejection sampling kept giving two.
    const t = nS === 1 ? 0.5 : (i + 0.5) / nS;
    const x = Math.round(baseX + (t * 2 - 1) * W * 0.36 + (rnd() - 0.5) * 2);
    const tall = stage === 'mature' && rnd() < 0.7;
    stamp(buf, tall ? CLUMPS.asphodelSpire : CLUMPS.asphodelSpireShort, x, baseY - Math.round(rnd() * 2), -1, {
      clip: false,
      layer: 'front',
    });
  }

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, baseY],
    tags: ['plant', 'flowers', 'asphodel'],
    meta: { seed, stage, composer: D.composer || 'spires' },
  });
}

/* ===================================================================== *
 * FALLEN LOG — deadwood on the ground.
 *
 * The only composer here that does not grow upward. It is a cylinder laid
 * along the isometric long axis (2 across, 1 down, exactly the tile slope),
 * with the cut end facing the camera, moss along the top and ferns out of
 * the split. A tree composer with its parameters flattened gives a squashed
 * tree, which is what `olive` was standing in for and why it never read.
 * ===================================================================== */
export function fallenLog(seed, params = {}) {
  const D = { w: 58, h: 26, ramp: 'canopy', moss: 9, ferns: 2, ...params };
  const stage = stageOf(params);
  const name = params.name || `grow.fallenLog.${stage}.${seed}`;
  const sc = STAGE_SCALE[stage];
  const W = Math.max(14, Math.round(D.w * lerp(0.34, 1, sc)));
  const rnd = rngFor(seed);
  const PAD = 3;
  // The log lies along the tile's own long axis: two across and one down, so
  // its vertical extent is HALF its length plus its own girth. Deriving the
  // buffer from that rather than from a free `h` is what stops the far end
  // being sliced off by the top of the buffer — which is exactly what the
  // first render did, and it read as a plank rather than as deadwood.
  const r = clamp(Math.round(W * 0.145), 2, 8);
  const rise = Math.round((W - 2) * 0.5);
  const H = rise + r * 2 + 2;
  const buf = makeBuf(W + PAD * 2, H + PAD * 2);
  const baseY = buf.h - PAD - 1;
  const baseX = Math.round(buf.w / 2);

  const x0 = PAD;
  const x1 = buf.w - PAD - 1;
  const yNear = baseY - r; // the near end rests on the ground
  const span = Math.max(1, x1 - x0);

  // The barrel. Depth across the cylinder picks the earth key, so the log is
  // lit on its upper-left face and black underneath — the same one-step-per-
  // face rule the cubes use, which is what keeps it in the same world.
  for (let x = x0; x <= x1; x++) {
    const u = (x - x0) / span;
    const cy = Math.round(yNear - (1 - u) * span * 0.5);
    const rr = Math.max(1.6, r * (0.72 + 0.28 * u));
    const top = Math.round(cy - rr);
    const bot = Math.round(cy + rr);
    for (let y = top; y <= bot; y++) {
      if (y < 0 || y >= buf.h) continue;
      const d = (y - top) / Math.max(1, bot - top);
      let k = d < 0.16 ? EARTH[3] : d < 0.42 ? EARTH[2] : d < 0.74 ? EARTH[1] : EARTH[0];
      // Bark: broken longitudinal grain, never a smooth airbrushed tube.
      if (hash2(x, y, seed) < 0.16 && d > 0.2 && d < 0.9) k = EARTH[Math.max(0, EARTH.indexOf(k) - 1)];
      buf.back[y * buf.w + x] = k;
    }
    // The line of contact with the ground, and the shadow side of the bark.
    if (bot >= 0 && bot < buf.h) buf.back[bot * buf.w + x] = EARTH[0];
  }

  // The sawn end, facing the camera: a pale ellipse with heartwood rings.
  const ex = x1 - 2;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -3; dx <= 2; dx++) {
      const x = ex + dx;
      const y = yNear + dy;
      if (x < 0 || y < 0 || x >= buf.w || y >= buf.h || !buf.back[y * buf.w + x]) continue;
      const rad = Math.hypot(dx / 3.4, dy / r);
      if (rad > 1) continue;
      buf.back[y * buf.w + x] = rad > 0.78 ? EARTH[1] : rad > 0.3 ? EARTH[2] : EARTH[3];
    }
  }

  // Moss along the crown of the log. It is what the object is FOR — the
  // catalogue calls it a mossy trunk and deposits maturity — so it runs the
  // whole length rather than sitting on it as a garnish.
  const nM = Math.max(3, Math.round(D.moss * lerp(0.4, 1, sc)));
  for (let i = 0; i < nM; i++) {
    const u = 0.04 + (i + rnd() * 0.8) / nM;
    const x = Math.round(x0 + clamp(u, 0, 1) * span);
    const cy = Math.round(yNear - (1 - clamp(u, 0, 1)) * span * 0.5);
    const rr = Math.max(1.6, r * (0.72 + 0.28 * u));
    buf.masses.push({ id: i, cx: x, cy: Math.round(cy - rr), r: 4, lit: rnd() < 0.4, shadow: rnd() < 0.2 });
    stamp(buf, rnd() < 0.55 ? CLUMPS.mossPatch : CLUMPS.mossSmall, x, Math.round(cy - rr + 1), i, {
      clip: false,
      flipX: rnd() < 0.5,
    });
    // A second patch a little down the lit flank. One row of moss along the
    // crown reads as a green pencil line on a beam; the trunk only reads as
    // SOFT when the moss wraps far enough down the side to have a shape.
    if (rnd() < 0.65) {
      stamp(buf, CLUMPS.mossSmall, x + Math.round(rnd() * 4 - 2), Math.round(cy - rr * 0.15), i, {
        clip: false,
        flipX: rnd() < 0.5,
      });
    }
  }
  const nF = stage === 'mature' ? D.ferns : stage === 'young' ? Math.min(1, D.ferns) : 0;
  for (let i = 0; i < nF; i++) {
    const u = 0.2 + rnd() * 0.6;
    const x = Math.round(x0 + u * span);
    const cy = Math.round(yNear - (1 - u) * span * 0.5);
    const id = nM + i;
    buf.masses.push({ id, cx: x, cy: cy - r, r: 5, lit: true, shadow: false });
    stamp(buf, rnd() < 0.5 ? CLUMPS.fernFrond : CLUMPS.fernSmall, x, cy - r, id, { clip: false, flipX: rnd() < 0.5 });
  }

  prune(buf, 1);
  dropIslands(buf);
  shadeFoliage(buf, seed, { core: 0, shell: 1.2, ...(D.shade || {}) });

  // ANCHOR. This is the only object in the file whose base is not under the
  // middle of its own bounding box, and getting it wrong is not cosmetic.
  //
  // SPEC §2 and test/sprite-anchors.test.mjs: the anchor sits on the
  // FOOTPRINT's centre point, and a fw x fh footprint's FRONT VERTEX is
  // (fw+fh)*8 px below that. A 2x1 log lying along the tile axis has its near
  // end resting exactly on that vertex — so the near end's underside must be
  // 24px below the anchor, not at the bottom of the buffer. Anchored at the
  // buffer floor (which every upright plant does correctly) the trunk hovered
  // a third of a tile above the grass with the front tile drawn bare.
  const fp = D.footprint || [2, 1];
  const yAnchor = Math.round(yNear + r - (fp[0] + fp[1]) * 8);

  return finish(buf, {
    name,
    ramp: D.ramp,
    anchor: [baseX, clamp(yAnchor, 0, buf.h - 1)],
    footprint: fp,
    tags: ['plant', 'deadwood', 'log'],
    meta: { seed, stage, composer: D.composer || 'fallenLog' },
  });
}

/* ===================================================================== *
 * NAMED PLANTS
 *
 * Nine generic composers cover the shapes a garden needs. They do not cover
 * the NAMES a garden needs: nineteen catalogue entries were drawing with a
 * generic shrub, broadleaf, flowerPatch, ivy or olive and were therefore
 * telling the player that lavender, box and a rose are the same object in
 * three sizes. Each entry below is one plant, and it exists to be told apart
 * from its neighbour at 1x on grass.
 *
 * A plant earns its own composer only when its STRUCTURE differs (acanthus
 * is a fan, asphodel is stalks above foliage, a fallen trunk is horizontal).
 * Everything else is a profile plus a stamp pool plus decoration, run
 * through the same machinery as the generics — which is the only way the
 * white-flowering trio can be compared honestly, because they differ by
 * numbers in the same code rather than by three separate hands.
 *
 * THE THREE WHITE ONES, since they are the ones that must not collide:
 *   blackthorn — a dense DARK thicket with no stem, smothered edge to edge
 *                in blossom on bare spiny wood. Widest at the ground.
 *   hawthorn   — a small TREE: one clean bole, a tidy high crown, blossom
 *                in a dozen separate corymbs with leaf showing between.
 *   almond     — TALL, half bole, and the crown is a scaffold of bare twigs
 *                carrying PINK-white flowers with almost no leaf at all.
 * Silhouette, height and blossom density all differ. Colour differs too, so
 * they survive being desaturated behind a visiting creature.
 * ===================================================================== */

const NAMED_PLANTS = {
  /* ---- shrubs and flowers ------------------------------------------- */

  blackthorn: [
    shrub,
    {
      w: 30, h: 26, ramp: 'canopy', profile: 'thicket',
      wobble: 0.26, lobeAmp: 0.2, masses: 5, holes: 3, spread: 0.9,
      pool: ['leafSmall', 'scrubTuft', 'boxLeaf'], fillPool: ['boxLeaf', 'leafSmall'],
      count: [3, 4], fill: 4, twigs: 8, stem: false,
      shade: { core: 2, shell: 1.4, rim: 0.7 },
      deco: [{ clump: 'blossomWhite', n: 22, where: 'edge', gapX: 4, gapY: 3, jitter: 1 }],
    },
  ],

  hawthorn: [
    broadleaf,
    {
      // `twigs` here is the THORN. The blurb's claim is that thorn and blossom
      // sit on the same branch, and a tidy leafy crown with white on top says
      // nothing of the sort — three bare limbs run out through the canopy so
      // there is visible spiny wood between the corymbs.
      species: 'hawthorn', ramp: 'canopy', count: [2, 3], holes: 3, fill: 3, twigs: 3,
      shade: { core: 1 },
      deco: [{ clump: 'blossomWhite', n: 12, where: 'surface', gapX: 6, gapY: 4, band: [0, 0.6] }],
    },
  ],

  'wild-strawberry': [
    ivy,
    {
      drape: 'ground', w: 28, h: 16, ramp: 'canopy', runners: 6, cover: 0.05,
      leafBig: 'trefoil', leafSmall: 'ivyLeafSmall',
      shade: { core: 0, shell: 0.9 },
      deco: [
        { clump: 'flowerWhite', n: 4, where: 'surface', gapX: 7, gapY: 3 },
        { clump: 'berryRed', n: 5, where: 'edge', gapX: 5, gapY: 3 },
      ],
    },
  ],

  rose: [
    shrub,
    {
      w: 26, h: 26, ramp: 'canopy', profile: 'rose',
      wobble: 0.22, lobeAmp: 0.18, masses: 4, holes: 3,
      pool: ['trefoil', 'leafSmall'], fillPool: ['leafSmall'], count: [2, 3], fill: 2,
      twigs: 5, shade: { core: 0, shell: 1.3 },
      deco: [{ clump: 'roseBloom', n: 6, where: 'surface', gapX: 7, gapY: 5 }],
    },
  ],

  // Grey, upright, aromatic — and NOT a leafy shrub. Both of these are built
  // out of base-anchored needle sprigs on the olive ramp, so the texture runs
  // vertically. Lavender is the neat hummock with a violet crown; rosemary is
  // taller, darker, ragged and legs-out, with three pixels of winter blue.
  lavender: [
    shrub,
    {
      w: 26, h: 20, ramp: 'olive', profile: 'hummock',
      wobble: 0.1, lobeAmp: 0.08, masses: 4, holes: 0,
      upright: true, pool: ['needleSprigShort', 'needleSprig'],
      count: [5, 7], fill: 0, drop: 0.9, jitter: 1, stem: false, prune: 1,
      shade: { core: -1, silver: 0.26, shell: 0.9, rim: 0.85 },
      deco: [{ clump: 'lavenderSpike', n: 15, where: 'surface', gapX: 3, gapY: 2, sink: 2 }],
    },
  ],

  rosemary: [
    shrub,
    {
      w: 20, h: 28, ramp: 'olive', profile: 'sprawl',
      wobble: 0.26, lobeAmp: 0.2, masses: 4, holes: 2,
      upright: true, pool: ['needleSprig'], masses: 5,
      count: [6, 8], fill: 0, drop: 0.8, jitter: 1.1, stem: false, prune: 1,
      shade: { core: -1, silver: 0.2, shell: 1, rim: 0.85 },
      deco: [{ clump: 'rosemaryFlower', n: 8, where: 'edge', gapX: 4, gapY: 3 }],
    },
  ],

  acanthus: [rosette, { w: 38, h: 30, ramp: 'canopy', leaves: 8, spike: true }],

  poppies: [
    flowerPatch,
    {
      w: 30, h: 20, ramp: 'grass', density: 0.75, tuftMix: 0.45,
      heads: ['poppyHead'], headDensity: 0.55, headGapX: 5, headGapY: 4, headSink: 3,
    },
  ],

  crocus: [
    flowerPatch,
    {
      w: 20, h: 12, ramp: 'grass', density: 0.55, tuftA: 'grassBlade', tuftB: 'grassBlade', tuftMix: 0.5,
      heads: ['crocusCup', 'crocusCup', 'crocusGold'], headDensity: 0.8, headGapX: 4, headGapY: 3, headSink: 2,
    },
  ],

  oleander: [
    shrub,
    {
      w: 30, h: 36, ramp: 'canopy', profile: 'oleander',
      wobble: 0.16, lobeAmp: 0.12, masses: 5, holes: 2,
      pool: ['lanceLeaf'], fillPool: ['lanceLeaf'], count: [3, 4], fill: 3,
      shade: { core: 1, shell: 1.2 },
      deco: [{ clump: 'oleanderBloom', n: 9, where: 'surface', gapX: 5, gapY: 4, band: [0, 0.6] }],
    },
  ],

  // Two inches a year and clipped. Its identity is that the outline is SMOOTH
  // and the texture FINER than anything beside it — hence wobble ~0 and a
  // stamp four pixels across. Nothing else in the garden is drawn this way.
  box: [
    shrub,
    {
      w: 24, h: 20, ramp: 'cypress', profile: 'box',
      wobble: 0.05, lobeAmp: 0.03, masses: 4, holes: 0,
      pool: ['boxLeaf'], fillPool: ['boxLeaf'], count: [5, 6], fill: 5,
      stem: false, shade: { core: 1, shell: 1.1, rim: 0.7 },
    },
  ],

  'wildflower-tuft': [
    flowerPatch,
    {
      w: 22, h: 20, ramp: 'grass', density: 0.8, tuftMix: 0.4,
      heads: ['flowerUmbel', 'flowerYellow', 'flowerWhite', 'flowerIris', 'flowerRed'],
      headDensity: 1.1, headGapX: 4, headGapY: 3,
    },
  ],

  asphodel: [spires, { w: 26, h: 40, ramp: 'olive', spires: 4, leaves: 13, shade: { core: 1, shell: 1.1 } }],

  /* ---- trees --------------------------------------------------------- */

  'apple-tree': [
    broadleaf,
    {
      species: 'apple', ramp: 'canopy', count: [2, 4], holes: 3,
      shade: { core: 1 },
      deco: [{ clump: 'appleFruit', n: 8, where: 'under', gapX: 6, gapY: 4, band: [0.15, 1] }],
    },
  ],

  'bay-laurel': [
    broadleaf,
    {
      species: 'bay', ramp: 'cypress',
      pool: ['lanceLeaf', 'leafSmall'], smallPool: ['lanceLeaf'],
      count: [3, 4], holes: 1, fill: 4,
      shade: { core: 2, shell: 1.1, rim: 0.8 },
    },
  ],

  myrtle: [
    broadleaf,
    {
      species: 'myrtle', ramp: 'olive',
      pool: ['boxLeaf', 'leafSmall'], smallPool: ['boxLeaf'],
      count: [4, 5], holes: 1, fill: 4,
      shade: { core: 1, silver: 0.06, shell: 1.3 },
      deco: [{ clump: 'blossomWhite', n: 4, where: 'edge', gapX: 7, gapY: 4, band: [0.05, 0.8] }],
    },
  ],

  'almond-blossom': [
    broadleaf,
    {
      species: 'almond', ramp: 'olive',
      count: [1, 1], fill: 0, holes: 5, twigs: 8, gnarl: 0.3,
      smallPool: ['leafSmall'],
      shade: { core: -1, shell: 0.8, rim: 0.5 },
      deco: [{ clump: 'blossomPink', n: 26, where: 'wood', gapX: 3, gapY: 3, jitter: 1, band: [0, 0.66] }],
    },
  ],

  // Big hand-shaped leaves you can count. `fill: 0` is load-bearing: the gap
  // filler exists to close holes between masses and it cheerfully closed the
  // notches between the fig's lobes, which is the entire silhouette.
  fig: [
    broadleaf,
    {
      species: 'fig', ramp: 'canopy',
      w: 34, wobble: 0.3, lobeAmp: 0.26, masses: 5,
      pool: ['figLeaf', 'figLeafSmall'], smallPool: ['figLeafSmall'],
      count: [1, 2], fill: 2, holes: 2,
      shade: { core: 2, shell: 1.5, rim: 0.75 },
      deco: [{ clump: 'figFruit', n: 5, where: 'under', gapX: 7, gapY: 5, band: [0.25, 1] }],
    },
  ],

  /* ---- deadwood ------------------------------------------------------ */

  'fallen-trunk': [fallenLog, { w: 64, ramp: 'canopy', moss: 12, ferns: 2 }],
};

/**
 * Named plants take only the STAGE from their caller. The plant owns its own
 * dimensions, ramp, stamp pool and decoration — that is what "a real profile"
 * means, and letting a caller half-override it is how a fig ends up on the
 * grass ramp.
 */
function plantComposer(fn, cfg) {
  return (seed, params = {}) => fn(seed, { ...cfg, stage: params.stage, name: params.name });
}

/** Every named plant, by the id the catalogue asks for in `art.wanted`. */
export const PLANTS = Object.freeze(
  Object.fromEntries(Object.entries(NAMED_PLANTS).map(([id, [fn, cfg]]) => [id, plantComposer(fn, { ...cfg, composer: id })]))
);

/* ===================================================================== *
 * Registry
 * ===================================================================== */

export const COMPOSERS = {
  broadleaf,
  conifer,
  olive,
  willow,
  shrub,
  flowerPatch,
  reeds,
  ivy,
  vine,
  rosette,
  spires,
  fallenLog,
  ...PLANTS,
};

/** What the sprite lab needs to build its controls, and the catalogue to pick. */
export const COMPOSER_INFO = {
  broadleaf: { variants: ['oak', 'plane', 'poplar', 'ash'], key: 'species' },
  conifer: { variants: ['cypress', 'umbrella'], key: 'species' },
  olive: { variants: ['olive'], key: null },
  willow: { variants: ['willow'], key: null },
  shrub: { variants: ['leaf', 'scrub', 'fern'], key: 'kind' },
  flowerPatch: { variants: ['mixed', 'white', 'red', 'yellow', 'iris', 'lace'], key: 'bloom' },
  reeds: { variants: ['reeds'], key: null },
  ivy: { variants: ['ground', 'wall'], key: 'drape' },
  vine: { variants: ['vine'], key: null },
  rosette: { variants: ['rosette'], key: null },
  spires: { variants: ['spires'], key: null },
  fallenLog: { variants: ['fallenLog'], key: null },
  ...Object.fromEntries(Object.keys(NAMED_PLANTS).map((id) => [id, { variants: [id], key: null }])),
};

/** `compose('broadleaf', 7, { species: 'oak', stage: 'mature' })` */
export function compose(name, seed, params = {}) {
  const fn = COMPOSERS[name];
  if (!fn) throw new Error(`grow: no composer named '${name}'`);
  return fn(seed >>> 0, params);
}
