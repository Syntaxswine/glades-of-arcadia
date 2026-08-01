// anchor-audit.mjs — does a sprite stand where it says it stands?
//
//   node tools/anchor-audit.mjs [--strict] [--feet] [--all]
//
// THE BUG THIS EXISTS FOR
//
// A sprite's `anchor` is the pixel that lands on its footprint's centre point.
// The base diamond of an fw x fh object is (fw+fh)*16 px tall, so its FRONT
// vertex sits (fw+fh)*8 px BELOW that centre.
//
// An object that visually occupies its footprint — a building, a plinth, a
// burial mound — must therefore have art reaching roughly that far below its
// anchor. If it does not, it hovers over the front half of its own plot. The
// taller the object the more obvious it is, which is why the heroon was spotted
// first and the tumulus (which was worse) was not.
//
// ---------------------------------------------------------------------------
// FOUR ARMS, AND WHY THE FIRST DRAFT ONLY HAD HALF OF ONE
//
// The 2026-08-01 review of this file found three holes, all of the same shape:
// the tool asked a narrower question than the fault it was named for.
//
//   1 FLOAT   the object does not reach the front of its plot.
//             THE HOLE: it measured `sprite.footprint`, but the renderer places
//             at the CATALOG footprint (`main.js` forwards `def.footprint`;
//             `render.js` calls `footprintCentreAt` with it). Eight placeables
//             declare multi-tile art that was drawn 1x1 — including the
//             sleeping satyr, this game's first object — and every one of them
//             was INVISIBLE here, because their sprite says 1x1 and 1x1 was
//             skipped. The plot an object floats over is the one it is placed
//             on, so that is the one to measure.
//             THE OTHER HOLE: it counted 'm'. A baked contact shadow is drawn
//             in 'm' and hangs below the object, so a shadow could testify that
//             its own building reached the ground. Measured on non-'m' rows now,
//             AND IT IS NOT ACADEMIC: two entries flip verdict. `fern-grotto`
//             reads 17 px of reach with its shadow counted and 2 without —
//             fifteen of its seventeen pixels of "contact" ARE the shadow —
//             and `cypress-screen` 14 against 8. Both pass the old arm and fail
//             the honest one.
//
//   2 SINK    the opposite fault, AND THE TOOL HAD NO ARM FOR IT AT ALL.
//             A human running this saw `(none)` at any depth of burial. Only
//             `test/sprite-anchors.test.mjs` could see it, and at its old
//             tolerance IT CAUGHT NONE OF THE FOUR: measured at `27b4cfe^` the
//             overshoots were +10, +14, +15 and +16 against a threshold that
//             fired above 16, so the heroon missed by one pixel of strictness
//             and the rest were never close. That is how four buildings shipped
//             standing in the air above their own shadows.
//
//   3 PLOT    catalog footprint vs sprite footprint, reported plainly. This is
//             arm 1's cause rather than a separate fault, but a mismatch is
//             worth seeing even where the art happens to reach far enough.
//
//   4 FEET    (--feet) how far each object's foot falls short of the base
//             ELLIPSE its own width demands, from `groundCentre`. Reported,
//             never voted: it is the worklist for redrawing flat feet, and it
//             would drown the other three arms if it printed by default.
//
// GROUND PAINTERS ARE NOT AUDITED. `catalog.js` is explicit — "These paint
// tiles; `footprint` is the brush" — so a 2x2 brush laying a 1x1 tile sprite is
// correct by construction, not a floating object. `isGroundPainter` is the
// catalogue's own answer to that question and is asked rather than guessed.

import {
  groundCentre,
  SHADOW_KEY,
} from './isogeom.mjs';

const strict = process.argv.includes('--strict');
const feet = process.argv.includes('--feet');
const all = process.argv.includes('--all');

// How far short of the front vertex a sprite may fall before we call it
// floating. Small shortfalls are legitimate — an object may be inset from its
// footprint edge, or sit on a plinth narrower than its plot.
const TOLERANCE = 10;

/**
 * ...and how far PAST the front vertex anything may hang before we call it
 * buried. Argued three ways, because a tolerance nobody can defend is a
 * tolerance somebody will quietly widen:
 *
 *   THE DATA HAS A GAP THERE. Excluding face art, the worst overshoot anywhere
 *   at HEAD is +4 (four hedges), and the four shipped floats start at +10.
 *   Nothing in the game sits between them, so 8 is chosen from an empty band
 *   rather than fitted to make today's numbers pass.
 *
 *   IT IS HALF A TERRACE. `LEVEL_H` is 16, so 16 px of downward displacement is
 *   exactly one step of elevation — the amount that makes a building read as
 *   levitating rather than as slightly low. Half of that is the outer edge of
 *   "still reads as contact".
 *
 *   IT FITS INSIDE THE CURVE ALLOWANCE. A correct circular foot on a 2x2 plot
 *   bulges about 13 px past the diamond's straight edges at the corners, so a
 *   few px of overshoot is a property of round feet, not a fault.
 */
const SINK_TOLERANCE = 8;

/**
 * ...AND WHAT THE ARM DOES NOT DESCRIBE AT ALL: art that lives on a VERTICAL
 * FACE rather than on a plot.
 *
 * A cliff sprite is a tile top plus one `LEVEL_H` of wall hanging below it, so
 * it reaches 31 px under its own anchor BY CONSTRUCTION — 16 for the diamond's
 * half-height and 16 for the course of rock. A cascade lip pours its sheet of
 * water off the front of its diamond, because that is what a fall IS. Neither
 * is standing on the ground; `(fw+fh)*8` is a statement about the ground plane
 * and simply does not apply to them.
 *
 * A NAMED EXEMPTION, NOT A WIDER TOLERANCE. Fifty cliff strips overshoot the
 * front vertex by 15 and the cascade lip by 15, so relaxing SINK_TOLERANCE far
 * enough to admit them would also have admitted all four of the buildings that
 * shipped floating (+10, +14, +15, +16). An instrument that loosens until its
 * false positives go away has stopped measuring.
 */
const ON_A_FACE = (s) => {
  const t = s.tags || [];
  return t.includes('cliff') || t.includes('face') || t.includes('waterfall');
};

// ---------------------------------------------------------------------------
// The population: every sprite, and the catalogue that places them.
// ---------------------------------------------------------------------------

const modules = ['tiles', 'extras', 'props', 'decor'];
const sprites = [];
const registry = new Map();

for (const m of modules) {
  let mod;
  try {
    mod = await import(new URL(`../js/art/${m}.js`, import.meta.url).href);
  } catch {
    continue; // a module that does not exist yet is not a fault
  }
  const add = (name, s) => {
    if (!s || !Array.isArray(s.rows) || !Array.isArray(s.anchor)) return;
    if (!sprites.some((e) => e.sprite === s)) sprites.push({ name: s.name || name, sprite: s, from: `js/art/${m}.js` });
    // THE SAME PRECEDENCE main.js USES, and for the same reason: decor.js goes
    // last and wins the three names it collides with props.js on. An audit that
    // resolved names differently from the game would audit art nobody sees.
    registry.set(s.name || name, s);
  };
  for (const [name, s] of Object.entries(mod)) add(name, s);
  // ...and the name -> sprite TABLES, because main.js reads those too and a
  // registry half the size of the game's silently resolves catalogue entries to
  // null. A skipped entry looks exactly like a passing one in a report.
  for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY', 'CLUMPS']) {
    const table = mod[key];
    if (!table || typeof table !== 'object') continue;
    for (const [k, v] of Object.entries(table)) if (v && v.rows && v.anchor) add(k, v);
  }
}

let CATALOG = [];
let isGroundPainter = () => false;
try {
  const cat = await import(new URL('../js/catalog.js', import.meta.url).href);
  CATALOG = cat.CATALOG || [];
  if (typeof cat.isGroundPainter === 'function') isGroundPainter = cat.isGroundPainter;
} catch (e) {
  console.error(`  (catalog.js did not import: ${e.message} — arms 1 and 3 will be thin)`);
}

/** The sprite a catalogue entry actually draws, resolved as main.js resolves it. */
function artOf(def) {
  const a = def && def.art;
  if (!a || a.kind !== 'sprite') return null; // `grow` composers have no fixed art
  if (a.wanted && registry.has(a.wanted)) return registry.get(a.wanted);
  return registry.get(a.sprite) || null;
}

/** The lowest row holding a pixel that satisfies `pred`, or -1. */
function lowestRow(s, pred) {
  for (let y = s.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.w; x++) {
      const ch = s.rows[y][x];
      if (ch !== '.' && pred(ch)) return y;
    }
  }
  return -1;
}

const lowestSolid = (s) => lowestRow(s, (c) => c !== SHADOW_KEY);
const lowestAny = (s) => lowestRow(s, () => true);

// The plot each sprite is actually placed on, largest claim wins. A sprite the
// catalogue places on 2x1 gets a 2x1 diamond even though its own art says 1x1 —
// that IS the mismatch, and the sink arm must not convict it for the float
// arm's fault.
const placedOn = new Map();
for (const def of CATALOG) {
  const s = artOf(def);
  if (!s || !def.footprint) continue;
  const prev = placedOn.get(s) || [1, 1];
  placedOn.set(s, [Math.max(prev[0], def.footprint[0]), Math.max(prev[1], def.footprint[1])]);
}
const plotOf = (s) => {
  const c = placedOn.get(s) || [1, 1];
  const o = s.footprint || [1, 1];
  return [Math.max(c[0], o[0]), Math.max(c[1], o[1])];
};

// ---------------------------------------------------------------------------
// ARM 1 — FLOAT
// ---------------------------------------------------------------------------

const floats = [];
const seenFloat = new Set();
let auditedFloat = 0;

for (const def of CATALOG) {
  const s = artOf(def);
  if (!s) continue;
  if (isGroundPainter(def)) continue; // footprint is a brush, not a plot
  const fp = def.footprint || [1, 1];
  if (fp[0] * fp[1] <= 1) continue; // a narrow post rightly occupies the middle
  auditedFloat++;
  const drop = lowestSolid(s) - s.anchor[1];
  const need = (fp[0] + fp[1]) * 8;
  const short = need - drop;
  if (short > TOLERANCE) {
    seenFloat.add(s);
    floats.push({
      what: def.id,
      via: s.name,
      fp: fp.join('x'),
      drop,
      need,
      short,
      why: (s.footprint || [1, 1]).join('x') !== fp.join('x') ? `art is ${(s.footprint || [1, 1]).join('x')}` : '',
    });
  }
}

// ...and the sprites the catalogue never places: sub-parts, terrain, anything
// exported but not yet wired. Their own declared footprint is the only claim
// they make, so it is the one they are held to.
for (const { name, sprite: s } of sprites) {
  if (placedOn.has(s) || seenFloat.has(s)) continue;
  const fp = s.footprint || [1, 1];
  if (fp[0] * fp[1] <= 1) continue;
  auditedFloat++;
  const drop = lowestSolid(s) - s.anchor[1];
  const need = (fp[0] + fp[1]) * 8;
  const short = need - drop;
  if (short > TOLERANCE) {
    floats.push({ what: name, via: s.name, fp: fp.join('x'), drop, need, short, why: 'unplaced' });
  }
}

floats.sort((a, b) => b.short - a.short);

// ---------------------------------------------------------------------------
// ARM 2 — SINK
// ---------------------------------------------------------------------------

const sinks = [];
let auditedSink = 0;
for (const { name, sprite: s } of sprites) {
  if (ON_A_FACE(s)) continue;
  auditedSink++;
  const [fw, fh] = plotOf(s);
  const limit = (fw + fh) * 8 + SINK_TOLERANCE;
  const drop = lowestAny(s) - s.anchor[1];
  if (drop > limit) {
    sinks.push({ what: name, fp: `${fw}x${fh}`, drop, limit, over: drop - limit });
  }
}
sinks.sort((a, b) => b.over - a.over);

// ---------------------------------------------------------------------------
// ARM 3 — FOOTPRINT DISAGREEMENT
// ---------------------------------------------------------------------------

const mismatched = [];
for (const def of CATALOG) {
  const s = artOf(def);
  if (!s || isGroundPainter(def)) continue;
  const c = def.footprint || [1, 1];
  const a = s.footprint || [1, 1];
  if (c[0] !== a[0] || c[1] !== a[1]) {
    mismatched.push({ what: def.id, via: s.name, cat: c.join('x'), art: a.join('x') });
  }
}

// ---------------------------------------------------------------------------
// The report.
// ---------------------------------------------------------------------------

const pad = (v, n) => String(v).padEnd(n);
const num = (v, n) => String(v).padStart(n);

console.log('anchor audit — do sprites stand where they say they stand?\n');

console.log(`  FLOAT — art that does not reach the front of its plot (tol ${TOLERANCE}px)`);
console.log('    what                    via                   plot   drop  needs  short');
console.log('    ' + '-'.repeat(70));
for (const f of floats) {
  console.log(
    '    ' + pad(f.what, 24) + pad(f.via, 22) + pad(f.fp, 7) +
      num(f.drop, 5) + num(f.need, 7) + num(f.short, 7) + '  FLOATS' +
      (f.why ? `  (${f.why})` : '')
  );
}
if (!floats.length) console.log('    (none)');

console.log(`\n  SINK — anything hanging past the front vertex (tol ${SINK_TOLERANCE}px)`);
console.log('    what                    plot   drop  limit   over');
console.log('    ' + '-'.repeat(70));
for (const s of sinks) {
  console.log(
    '    ' + pad(s.what, 24) + pad(s.fp, 7) + num(s.drop, 5) + num(s.limit, 7) + num(s.over, 7) + '  BURIED'
  );
}
if (!sinks.length) console.log('    (none)');

console.log('\n  PLOT — catalogue footprint vs the footprint the art was drawn for');
if (!mismatched.length) console.log('    (none)');
else {
  console.log('    what                    via                   catalog  art');
  console.log('    ' + '-'.repeat(70));
  for (const m of mismatched) {
    console.log('    ' + pad(m.what, 24) + pad(m.via, 22) + pad(m.cat, 9) + m.art);
  }
}

if (feet) {
  console.log('\n  FEET — how far each foot falls short of the base ellipse its width demands');
  console.log('    (REPORTED, NEVER VOTED. This is the redraw worklist, not a verdict:');
  console.log('     a negative dy means the foot is cut flat where a 2:1 ellipse would');
  console.log('     have carried it forward. See tools/iso-audit.mjs for the other half.)');
  console.log('    what                    plot     r     dy      dx');
  console.log('    ' + '-'.repeat(70));
  const rows = [];
  for (const { name, sprite: s } of sprites) {
    const gc = groundCentre(s);
    if (!gc) continue;
    if (!all && Math.abs(gc.dy) < 6 && Math.abs(gc.dx) < 4) continue;
    rows.push({ what: name, fp: plotOf(s).join('x'), r: gc.r, dy: gc.dy, dx: gc.dx });
  }
  rows.sort((a, b) => a.dy - b.dy);
  for (const r of rows) {
    console.log(
      '    ' + pad(r.what, 24) + pad(r.fp, 7) + num(r.r.toFixed(1), 6) +
        num(r.dy.toFixed(2), 7) + num(r.dx.toFixed(2), 8)
    );
  }
  console.log(`    ${rows.length} shown of ${sprites.length}`);
}

console.log(
  `\n  ${sprites.length} sprites · ${CATALOG.length} catalogue entries · ` +
    `${auditedFloat} plots audited · ${auditedSink} sink-audited\n` +
    `  ${floats.length} floating · ${sinks.length} buried · ${mismatched.length} footprint mismatches`
);

// STRICT FAILS ON THE SINK ARM ONLY.
//
// Not on FLOAT: eight of those are a shipped, pre-existing disagreement between
// the catalogue and the art, and the fix is either a redraw or a design call
// about how much ground an object takes. A gate that cannot be switched on
// protects nothing, but a gate that fails on work nobody has agreed to do just
// gets bypassed. The float list lives in `test/sprite-anchors.test.mjs` as a
// RATCHET instead — named, with a reason, and unable to grow quietly.
if (sinks.length && strict) {
  console.error(
    '\nanchor audit FAILED: something is drawn below the front of its own plot.\n' +
      'That is how an object ends up standing in the air over its own shadow —\n' +
      'see the 2026-07-31 handoff. Move the skirt up to the anchor, or widen the\n' +
      'footprint if the object really is that big.'
  );
  process.exit(1);
}
