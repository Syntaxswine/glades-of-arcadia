// iso-audit.mjs — catch sprites drawn FACING THE VIEWER instead of lying in the
// isometric grid.
//
//   node tools/iso-audit.mjs [--all] [--strict]
//
// THE FAULT THIS EXISTS FOR
//
// The owner, looking at the sprite lab: "there are several objects, like the
// cave, that are pointed straight at the viewer instead of in the direction of
// the grid like they are occupying 3D space."
//
// They are right, and the sprite lab could not have shown it, because the lab
// draws a SQUARE pixel grid and a rectangular bounds box. Both of those are the
// coordinate system of the FILE. Neither is the coordinate system of the WORLD,
// so a sprite can sit perfectly in the file's grid and be pointing at nothing
// the map contains.
//
// ---------------------------------------------------------------------------
// THE GEOMETRY, stated once
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
// them.** It is the signature of a shape drawn in the plane of the screen — a
// front elevation pasted into a world that has no front.
//
// And the silhouette of a unit cube in this projection is a HEXAGON, which is
// the owner's word for it and the right envelope to draw inside. A sprite whose
// outline is an axis-aligned rectangle or a screen-facing ellipse is not
// occupying a hexagonal volume; it is a sticker.
//
// The exception, and it is a real one: ROTATIONAL forms. A column, an urn, a
// tree trunk, a boulder — anything with a vertical axis of revolution — looks
// the same from every direction and SHOULD be bilaterally symmetric on screen.
// Symmetry alone is therefore not the fault. The fault is symmetry in something
// that has a FRONT: a cave mouth, a bench, a wall, a doorway, a bridge.
//
// ---------------------------------------------------------------------------
// WHAT IS MEASURED
// ---------------------------------------------------------------------------
//
// ONE MEASURE VOTES, and it is this:
//
//   **how far the BOTTOM SILHOUETTE rises from its lowest point toward its
//   corners, as a fraction of the sprite's width.**
//
// Every solid resting on a tile meets the ground plane, and the ground plane is
// a 2:1 diamond. So the underside of a sprite — the lowest opaque pixel in each
// column — has to be a shape lying IN that plane:
//
//     a round foot (column, urn, boulder)   a 2:1 ellipse    rises ~W/4
//     a square foot lying in the grid       a V or a peak    rises ~W/4
//     a slab drawn facing the screen        a straight line  rises ~0
//
// Near zero means the sprite ENDS in a horizontal edge, and an isometric world
// contains no horizontal edges at ground level at all. It is the one objective
// tell, it does not care whether the form is rotational, and it is exactly what
// the sprite lab's square pixel grid and rectangular bounds box both hid.
//
// THE FIRST DRAFT OF THIS TOOL SCORED FOUR THINGS AT ONCE AND WAS NOISE. It
// ranked COLUMN the fourth-worst sprite in the game. A column is a cylinder: it
// is *supposed* to be bilaterally symmetric, *supposed* to have a wide flat
// waist, and three of the four measures were punishing it for being drawn
// correctly. A checker whose resolution cannot support its question returns
// noise shaped like an answer.
//
// The other three numbers are still PRINTED, because they are useful to a human
// reading a row. They no longer vote.
//
//   flat     widest horizontal run anywhere, over the width. Normal for a
//            rotational form; suspicious for anything with a front.
//   mirror   symmetry about the vertical. Same caveat, more strongly.
//   diag     how much of the outline runs on a 2:1 slope — the positive signal.

import { basename } from 'node:path';

const ALL = process.argv.includes('--all');
const STRICT = process.argv.includes('--strict');

const modules = ['../js/art/props.js', '../js/art/decor.js', '../js/art/tiles.js'];

const sprites = [];
for (const path of modules) {
  let mod;
  try {
    mod = await import(new URL(path, import.meta.url).href);
  } catch {
    continue;
  }
  for (const [name, s] of Object.entries(mod)) {
    if (!s || !Array.isArray(s.rows) || typeof s.w !== 'number') continue;
    sprites.push({ name, s, from: basename(path) });
  }
}

const opaque = (ch) => ch !== undefined && ch !== '.';

/** The widest unbroken horizontal run of opaque pixels in a row. */
function longestRun(row) {
  let best = 0;
  let n = 0;
  for (let x = 0; x < row.length; x++) {
    if (opaque(row[x])) {
      n++;
      if (n > best) best = n;
    } else n = 0;
  }
  return best;
}

/** Left and right silhouette edges per row, or null for an empty row. */
function edges(s) {
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
 * How much of the outline runs on a 2:1 slope.
 *
 * Walking DOWN the silhouette, a 2:1 edge moves 2 px sideways per row (or 1 and
 * 1, since a 2:1 line in pixels is drawn as pairs). A vertical wall moves 0. A
 * screen-facing curve moves 3, 4, 5+ near its waist and 0 near its poles, and
 * the giveaway is that it does BOTH within a few rows.
 *
 * Scored generously: steps of 1 or 2 count as "in the grid", 0 counts as a wall
 * and is neutral, 3+ counts against.
 */
function diagonalScore(s) {
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

/** 1.0 = a perfect mirror about the vertical centre line. */
function mirrorScore(s) {
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

/**
 * THE MEASURE. How far the bottom silhouette rises, over the sprite's width.
 *
 * For each column, the lowest opaque pixel. The spread between the deepest of
 * those and the shallowest at the outer edges is the "lift" of the foot. A 2:1
 * ellipse or a diamond corner lifts by about a quarter of the width; a slab
 * drawn on the screen plane lifts by nothing.
 *
 * Measured against the OUTER TENTH of the occupied columns rather than the
 * absolute maximum, because one stray pixel of grass or a shadow tuft at the
 * far edge would otherwise report a perfectly flat base as a deep one.
 */
function baseLift(s) {
  const low = [];
  for (let x = 0; x < s.w; x++) {
    let y = -1;
    for (let yy = s.h - 1; yy >= 0; yy--) {
      if (opaque((s.rows[yy] || '')[x])) {
        y = yy;
        break;
      }
    }
    if (y >= 0) low.push({ x, y });
  }
  if (low.length < 4) return { lift: 1, span: low.length };
  const deepest = Math.max(...low.map((p) => p.y));
  // The outer tenth at each end, and take the SHALLOWER end — a foot only has
  // to lift on one side to prove it is in the grid (a corner-on cube lifts
  // toward both, a wall running NE lifts toward one).
  const k = Math.max(1, Math.round(low.length / 10));
  const leftEdge = Math.min(...low.slice(0, k).map((p) => p.y));
  const rightEdge = Math.min(...low.slice(-k).map((p) => p.y));
  const lift = deepest - Math.max(leftEdge, rightEdge);
  return { lift: lift / s.w, span: low.length };
}

function widestFlat(s) {
  let best = 0;
  for (let y = 0; y < s.h; y++) best = Math.max(best, longestRun(s.rows[y] || ''));
  return best / s.w;
}

/**
 * What a correctly-footed sprite lifts by. A 2:1 ellipse across the full width
 * lifts W/4; real feet are inset and often partly hidden by a shadow tuft, so
 * the bar is set at half of that. Below it, the sprite ends in a flat edge.
 */
const WANT = 0.125;

const rows = [];
for (const { name, s, from } of sprites) {
  if (s.w < 8 || s.h < 8) continue; // a 6px pebble has no geometry to get wrong
  const { lift } = baseLift(s);
  rows.push({
    name,
    from,
    size: `${s.w}x${s.h}`,
    lift,
    flat: widestFlat(s),
    mirror: mirrorScore(s),
    diag: diagonalScore(s),
  });
}

rows.sort((a, b) => a.lift - b.lift);
const flagged = rows.filter((r) => r.lift < WANT);
const show = ALL ? rows : flagged;

console.log('iso audit — does the sprite MEET THE GROUND in the ground plane?\n');
console.log(`  lift = how far the bottom silhouette rises, over the width. WANT >= ${WANT}.`);
console.log('  flat / mirror / diag are reported for the reader; they do not vote.\n');
console.log('  sprite                     size      lift    flat  mirror    diag');
console.log('  ' + '-'.repeat(64));
for (const r of show) {
  const f = (n) => n.toFixed(2).padStart(6);
  console.log(
    '  ' +
      r.name.padEnd(26) +
      r.size.padEnd(9) +
      f(r.lift) +
      f(r.flat) +
      f(r.mirror) +
      f(r.diag) +
      (r.lift < WANT ? '   <-- ENDS FLAT' : '')
  );
}
if (!show.length) console.log('  (none — every sprite meets the ground in the ground plane)');

console.log(
  `\n  ${rows.length} sprites measured · ${flagged.length} end in a flat edge ` +
    `(lift < ${WANT})`
);

if (STRICT && flagged.length) {
  console.error('\niso audit FAILED (--strict): those bases lie in the screen plane.');
  process.exit(1);
}
