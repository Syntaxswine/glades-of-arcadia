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
//   flat/bar the longest DEAD-LEVEL run where the object meets the ground,
//            against the allowance a correctly drawn circle of that size gets.
//            THE ONLY NUMBER THAT VOTES.
//   over     that run over the width of the diamond it stands on. Severity.
//   mirror   symmetry about the vertical. 1.0 is CORRECT for a rotational form
//            — a column is a cylinder — and suspicious for anything with a
//            front. Reported, never voted; the first draft of this tool voted
//            on it and ranked COLUMN the fourth-worst sprite in the game.
//   diag     how much of the outline runs on a 2:1 slope — the positive signal.

import { measure, RUN_MIN, AUDITED_MODULES, spritesIn, importArt } from './isogeom.mjs';

const ALL = process.argv.includes('--all');
const STRICT = process.argv.includes('--strict');
const RUNS = process.argv.includes('--runs');

// The population — which modules, and why those — is stated once in isogeom
// and read by the sprite lab too, so the terminal and the screen cannot report
// different censuses of the same catalogue.
const sprites = [];
for (const name of AUDITED_MODULES) {
  // `importArt` rethrows anything that is not "no such module" — see its note.
  // A missing module is not a fault; a module that throws while loading must
  // never be allowed to shrink the census silently.
  const mod = await importArt(new URL(`../js/art/${name}.js`, import.meta.url).href);
  if (!mod) continue;
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
console.log(`  bar  = what a correctly drawn circle of THIS SIZE is allowed. A ground`);
console.log(`         circle's lowest row is flat for 2*sqrt(2r) columns, so the bar`);
console.log(`         scales; a fixed one convicts every large contact for being round.`);
console.log(`         Never below ${RUN_MIN}px.`);
console.log('  over = that run over the width of the diamond it stands on. Severity.');
console.log('  mirror / diag are reported for the reader; they do not vote.\n');
console.log('  sprite                     size     fp     flat/bar  over  mirror   diag');
console.log('  ' + '-'.repeat(70));
for (const r of show) {
  const f = (n) => n.toFixed(2).padStart(7);
  console.log(
    '  ' +
      r.name.padEnd(26) +
      r.size.padEnd(9) +
      (r.s.footprint || [1, 1]).join('x').padEnd(6) +
      String(r.flat).padStart(4) +
      (" /" + r.min).padEnd(5) +
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
  `\n  ${rows.length} sprites measured · ${flagged.length} with a level edge at ` +
    `ground level longer than a curve of that size would give`
);

if (STRICT && flagged.length) {
  console.error('\niso audit FAILED (--strict): those bases lie in the screen plane.');
  process.exit(1);
}
