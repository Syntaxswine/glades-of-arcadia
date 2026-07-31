// anchor-audit.mjs — catch sprites that float above their own footprint.
//
//   node tools/anchor-audit.mjs [--strict]
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
// taller the object the more obvious it is, which is why the heroon was
// spotted first and the tumulus (which was worse) was not.
//
// The check does NOT apply to objects that merely STAND on a tile — a herm, a
// stele, an urn. A narrow post correctly occupies only the middle of its
// diamond, and demanding it reach the front vertex would be wrong. That is why
// this is a report with a tolerance and not a blanket assertion: only
// multi-tile sprites are audited, because a multi-tile footprint is itself the
// claim that the object fills that ground.
//
// Promote to a `node --test` assertion once the known offenders are redrawn.

import { readFileSync } from 'node:fs';

const strict = process.argv.includes('--strict');

// How far short of the front vertex a sprite may fall before we call it
// floating. Small shortfalls are legitimate — an object may be inset from its
// footprint edge, or sit on a plinth narrower than its plot.
const TOLERANCE = 10;

const modules = ['../js/art/props.js', '../js/art/decor.js', '../js/art/tiles.js'];

const sprites = [];
for (const path of modules) {
  let mod;
  try {
    mod = await import(new URL(path, import.meta.url).href);
  } catch {
    continue; // a module that does not exist yet is not a fault
  }
  for (const [name, s] of Object.entries(mod)) {
    if (!s || !Array.isArray(s.rows) || !Array.isArray(s.anchor)) continue;
    sprites.push({ name, sprite: s, from: path.replace('../', '') });
  }
}

function lowestOpaqueRow(s) {
  for (let y = s.h - 1; y >= 0; y--) {
    if (s.rows[y].replace(/\./g, '').length) return y;
  }
  return -1;
}

const findings = [];
let audited = 0;

for (const { name, sprite: s, from } of sprites) {
  const fp = s.footprint || [1, 1];
  if (fp[0] * fp[1] <= 1) continue; // see the note above: 1x1 is not audited
  audited++;

  const drop = lowestOpaqueRow(s) - s.anchor[1];
  const need = (fp[0] + fp[1]) * 8;
  const short = need - drop;

  if (short > TOLERANCE) {
    findings.push({ name, from, fp: fp.join('x'), drop, need, short });
  }
}

findings.sort((a, b) => b.short - a.short);

console.log('anchor audit — multi-tile sprites vs their base diamond\n');
console.log('  sprite                 fp     drop   needs   short by');
console.log('  ' + '-'.repeat(58));
for (const f of findings) {
  console.log(
    '  ' +
      f.name.padEnd(22) +
      f.fp.padEnd(6) +
      String(f.drop).padStart(5) +
      String(f.need).padStart(8) +
      String(f.short).padStart(11) +
      '  FLOATS'
  );
}
if (!findings.length) console.log('  (none)');

console.log(
  `\n  ${sprites.length} sprites loaded · ${audited} multi-tile audited · ` +
    `${findings.length} floating (tolerance ${TOLERANCE}px)`
);

if (findings.length && strict) {
  console.error('\nanchor audit FAILED: redraw the bases above, or correct their footprints.');
  process.exit(1);
}
