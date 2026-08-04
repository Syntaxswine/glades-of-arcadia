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

import {
  measure, RUN_MIN, AUDITED_MODULES, spritesIn, importArt, KNOWN_FLAT_FEET, flatFootKnown,
  elevationScore, catalogueSprites, withBackDrawings,
} from './isogeom.mjs';

const ALL = process.argv.includes('--all');
const STRICT = process.argv.includes('--strict');
const RUNS = process.argv.includes('--runs');
// The SECOND question — "does this sprite LIE IN the grid, or face the
// viewer?" — which the bottom contour cannot see. isogeom §elevationScore.
const ELEV = process.argv.includes('--elev');
// Measure only what a player can reach. See isogeom §catalogueSprites: an
// audit over every sprite in the tree answers "is the art correct", and the
// question an owner asks is "is the GAME correct".
const CATALOG = process.argv.includes('--catalog');

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

// Who draws what. Under --catalog this filters the population; otherwise it
// only annotates, so the table can say which flagged sprite is on screen and
// which is a picture nothing points at.
const known = new Set(sprites.map((x) => x.name));
const drawnBy = withBackDrawings(await catalogueSprites(known), sprites);

const rows = [];
for (const { name, sprite: s, from } of sprites) {
  const ids = drawnBy.get(name) || [];
  if (CATALOG && !ids.length) continue;
  rows.push({ name, s, from, ids, size: `${s.w}x${s.h}`, ...measure(s), elev: elevationScore(s) });
}

// ---------------------------------------------------------------------------
// --elev : the second table, and a different question.
//
// It RANKS rather than judging. The bottom contour has one legal answer, so
// the audit above can hold a ratchet against it; the top of a sprite has many
// — a canopy, a splash, a pile of rocks and a broken column all end wherever
// they like. So this prints an order of suspicion and a human looks. Every
// name that has been redrawn off the top of this list was confirmed by eye
// first, and two were dismissed the same way.
// ---------------------------------------------------------------------------
if (ELEV) {
  const list = rows.slice().sort((a, b) => b.elev.worst - a.elev.worst);
  const bad = list.filter((r) => r.elev.worst > 0);
  console.log('iso audit --elev — does the sprite LIE IN the grid, or FACE THE VIEWER?\n');
  console.log('  A horizontal screen line is the diamond\'s own W-E diagonal — a real');
  console.log('  direction, but not a GRID direction. Nothing is built along it and no');
  console.log('  face of a solid is bounded by it, so a long level edge in a sprite is a');
  console.log('  front elevation pasted into a world that has no front.\n');
  console.log('  seam = longest level SURFACE BOUNDARY inside the silhouette. The sharp');
  console.log('         one: where two faces of a solid meet, that edge runs 1-in-2.');
  console.log('  top  = longest level run along the TOP contour. A flat top is a');
  console.log('         horizontal plane, and a horizontal plane here is a DIAMOND.');
  console.log('  bar  = what a round thing of this width is allowed — a drum\'s rim and a');
  console.log('         dome\'s crown are flat for a stretch on an integer grid.');
  console.log('  REPORTED, NEVER VOTED. This table ranks; a human looks.\n');
  console.log('  sprite                     size      bar  seam   top  worst  drawn by');
  console.log('  ' + '-'.repeat(76));
  for (const r of (ALL ? list : bad)) {
    console.log(
      '  ' + r.name.padEnd(26) + r.size.padEnd(10) +
        String(r.elev.bar).padStart(3) + String(r.elev.seam).padStart(6) +
        String(r.elev.top).padStart(6) + r.elev.worst.toFixed(2).padStart(7) +
        '  ' + (r.ids.length ? r.ids.join(', ') : '(nothing — unreachable art)')
    );
  }
  console.log(
    `\n  ${rows.length} sprites measured · ${bad.length} with a level edge longer than a ` +
      `round form of that size would give` + (CATALOG ? ' · CATALOGUE ONLY' : '')
  );
  process.exit(0);
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

// --- the ratchet ----------------------------------------------------------
//
// The LIST is not the gate; the list is what the gate already knows about. The
// table above still prints every offender, excused or not, because a passive
// instrument that hides what it found is no longer an instrument. Only
// `--strict` consults KNOWN_FLAT_FEET, and it fails in BOTH directions: a new
// offender fails, and so does a name still listed after it has been fixed.
const fresh = flagged.filter((r) => !flatFootKnown(r.name));
const stale = [...KNOWN_FLAT_FEET].filter(
  (n) => !flagged.some((r) => String(r.name).replace(/@\d+$/, '') === n)
);

if (KNOWN_FLAT_FEET.size) {
  console.log(
    `  ${flagged.length - fresh.length} of them are the known step-4 worklist ` +
      `(KNOWN_FLAT_FEET in tools/isogeom.mjs)`
  );
}

if (STRICT && fresh.length) {
  console.error('\niso audit FAILED (--strict): those bases lie in the screen plane.');
  for (const r of fresh) console.error(`  ${r.name}  ${r.flat}px level, allowed ${r.min}`);
  process.exit(1);
}
if (STRICT && stale.length) {
  console.error(
    '\niso audit FAILED (--strict): these are listed as known-flat but now meet\n' +
      'the ground correctly. Delete them from KNOWN_FLAT_FEET — a ratchet that\n' +
      'only ever grows is a list of excuses.\n  ' +
      stale.join('\n  ')
  );
  process.exit(1);
}
