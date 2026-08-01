// iso-audit.mjs — catch sprites drawn FACING THE VIEWER instead of lying in the
// isometric grid.
//
//   node tools/iso-audit.mjs [--all] [--strict] [--runs]
//
// THE FAULT THIS EXISTS FOR
//
// The owner, looking at the sprite lab: "there are several objects, like the
// cave, that are pointed straight at the viewer instead of in the direction of
// the grid like they are occupying 3D space."
//
// They are right, and the sprite lab could not have shown it, because the lab
// drew a SQUARE pixel grid and a rectangular bounds box. Both of those are the
// coordinate system of the FILE. Neither is the coordinate system of the WORLD,
// so a sprite can sit perfectly in the file's grid and be pointing at nothing
// the map contains. (The lab now has an ISO overlay that draws the ground
// diamond, the cube hexagon and this very contour — same module, same numbers.)
//
// THE GEOMETRY and THE MEASURE both live in tools/isogeom.mjs. This file is the
// census: load the art, measure it, print it, and fail on request.
//
//   lift     how far the bottom silhouette rises from its lowest point toward
//            its corners, over the width. THE ONLY NUMBER THAT VOTES.
//   flat     widest horizontal run anywhere, over the width. Normal for a
//            rotational form; suspicious for anything with a front.
//   mirror   symmetry about the vertical. Same caveat, more strongly.
//   diag     how much of the outline runs on a 2:1 slope — the positive signal.

import { measure, RUN_MIN, AUDITED_MODULES, spritesIn } from './isogeom.mjs';

const ALL = process.argv.includes('--all');
const STRICT = process.argv.includes('--strict');
const RUNS = process.argv.includes('--runs');

// The population — which modules, and why those — is stated once in isogeom
// and read by the sprite lab too, so the terminal and the screen cannot report
// different censuses of the same catalogue.
const sprites = [];
for (const name of AUDITED_MODULES) {
  let mod;
  try {
    mod = await import(new URL(`../js/art/${name}.js`, import.meta.url).href);
  } catch {
    continue; // a module that does not exist yet is not a fault
  }
  sprites.push(...spritesIn(mod, `${name}.js`));
}

const rows = [];
for (const { name, sprite: s, from } of sprites) {
  rows.push({ name, s, from, size: `${s.w}x${s.h}`, ...measure(s) });
}

rows.sort((a, b) => b.over - a.over || b.flat - a.flat);
const flagged = rows.filter((r) => !r.ok);
const show = ALL ? rows : flagged;

console.log('iso audit — does the sprite MEET THE GROUND in the ground plane?\n');
console.log(`  flat = the longest DEAD-LEVEL run where the object meets the ground, in px.`);
console.log(`         An isometric world has no horizontal edges at ground level. WANT 0.`);
console.log(`         Runs under ${RUN_MIN}px are ignored: a curve bottoming out is not an edge.`);
console.log('  over = that run over the width of the diamond it stands on. Severity.');
console.log('  lift / mirror / diag are reported for the reader; they do not vote.\n');
console.log('  sprite                     size     fp     flat   over  mirror   diag');
console.log('  ' + '-'.repeat(70));
for (const r of show) {
  const f = (n) => n.toFixed(2).padStart(7);
  console.log(
    '  ' +
      r.name.padEnd(26) +
      r.size.padEnd(9) +
      (r.s.footprint || [1, 1]).join('x').padEnd(6) +
      String(r.flat).padStart(4) +
      f(r.over) +
      f(r.mirror) +
      f(r.diag) +
      (r.ok ? '' : '  <-- FLAT AT GROUND')
  );
  // --runs locates the offence: which columns of the bottom contour are level.
  // Without it a failing row tells an artist that something is wrong; with it,
  // it tells them which twenty pixels to redraw.
  if (RUNS && !r.ok) {
    for (const run of r.runs) {
      console.log(`      level run  x ${run.x0}..${run.x1} at y ${run.y}  (${run.len}px)`);
    }
  }
}
if (!show.length) console.log('  (none — every sprite meets the ground in the ground plane)');

console.log(
  `\n  ${rows.length} sprites measured · ${flagged.length} with a level run of ` +
    `${RUN_MIN}px or more at ground level`
);

if (STRICT && flagged.length) {
  console.error('\niso audit FAILED (--strict): those bases lie in the screen plane.');
  process.exit(1);
}
