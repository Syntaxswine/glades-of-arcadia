#!/usr/bin/env node
/**
 * tools/registry-audit.mjs — IS THIS SPRITE THE ONE THE GAME DRAWS?
 *
 *   node tools/registry-audit.mjs
 *   node tools/registry-audit.mjs --verbose
 *
 * WHY THIS EXISTS.
 *
 * The owner asked for a more cubic hedge. The edit was made in js/art/props.js
 * `CLIPPED_HEDGE`, it rendered correctly in a probe, and it changed nothing in
 * the garden — because the catalogue asks for a sprite called `hedge-low`,
 * which lives in js/art/decor.js. props.js carried a whole second hedge family
 * registered under the PLACEABLE IDS, and nothing ever looked those names up.
 * A sprite's name is not its placeable's id, and the file you find first by
 * grepping for the id is the wrong file surprisingly often.
 *
 * js/main.js `createArtist` builds one registry from four modules IN ORDER —
 * tiles, extras, props, decor — and a later module silently overwrites an
 * earlier one's sprite of the same name. That precedence is a fine way to
 * CHOOSE between two drawings and a terrible way to keep one alive: the loser
 * goes on compiling, rendering in every probe, and taking edits meant for the
 * winner. This tool reports both halves of that:
 *
 *   SHADOWED   a name defined more than once. The last one wins; the others
 *              are decoration that looks like code.
 *   UNREACHED  a sprite the catalogue never resolves to, by `art.sprite` or by
 *              `art.wanted`.
 *
 * IT REPORTS AND IT DOES NOT REFUSE. Most UNREACHED entries are perfectly
 * healthy: js/art/tiles.js is full of terrain the ground painter picks by name
 * at runtime, and `art.wanted` names sprites that do not exist yet ON PURPOSE
 * — that is the understudy mechanism in js/main.js, and a name waiting to be
 * drawn is a promise, not a fault. So this is a census to read, not a gate to
 * pass, and it exits 0 whatever it finds. Compare it against what you expect;
 * the interesting line is the one you cannot explain.
 *
 * Node built-ins only (SPEC §1).
 */
import { CATALOG } from '../js/catalog.js';
import * as TILES from '../js/art/tiles.js';
import * as EXTRAS from '../js/art/extras.js';
import * as PROPS from '../js/art/props.js';
import * as DECOR from '../js/art/decor.js';

const VERBOSE = process.argv.includes('--verbose');
const ORDER = ['tiles', 'extras', 'props', 'decor'];
const MODS = { tiles: TILES, extras: EXTRAS, props: PROPS, decor: DECOR };

// ---------------------------------------------------------------------------
// The registry, built EXACTLY as js/main.js createArtist builds it. If these
// two ever disagree the tool is worse than useless, so it is copied rather
// than approximated — the same two passes, the same table names, same order.
// ---------------------------------------------------------------------------
const defined = new Map(); // name -> [modules that define it, in order]
const note = (mod, name) => {
  if (!defined.has(name)) defined.set(name, []);
  const seen = defined.get(name);
  if (seen[seen.length - 1] !== mod) seen.push(mod);
};
for (const mod of ORDER) {
  const m = MODS[mod];
  for (const [k, v] of Object.entries(m)) {
    if (v && typeof v === 'object' && v.rows && v.anchor) note(mod, v.name || k);
  }
  for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY']) {
    const table = m[key];
    if (!table || typeof table !== 'object') continue;
    for (const [k, v] of Object.entries(table)) if (v && v.rows && v.anchor) note(mod, k);
  }
}

// ---------------------------------------------------------------------------
// What the catalogue asks for. `art` is a DESCRIPTOR, not a sprite — a bare
// `def.art.joins` is undefined on every entry in the game, which is how one
// probe once concluded that nothing had ever joined. Walk it for `sprite`
// (what draws today) and `wanted` (what will draw the moment it exists).
// ---------------------------------------------------------------------------
const asked = new Map();
const walk = (a, id) => {
  if (!a || typeof a !== 'object') return;
  if (a.sprite) asked.set(a.sprite, id);
  if (a.wanted && a.kind === 'sprite') asked.set(a.wanted, `${id} (wanted)`);
  for (const v of Object.values(a)) {
    if (Array.isArray(v)) v.forEach((x) => walk(x, id));
    else if (v && typeof v === 'object') walk(v, id);
  }
};
for (const def of CATALOG) walk(def && def.art, def && def.id);

const shadowed = [...defined].filter(([, mods]) => mods.length > 1);
const unreached = [...defined].filter(([n]) => !asked.has(n));
const missing = [...asked.keys()].filter((n) => !defined.has(n));

const byMod = new Map();
for (const [n, mods] of unreached) {
  const home = mods[mods.length - 1];
  if (!byMod.has(home)) byMod.set(home, []);
  byMod.get(home).push(n);
}

console.log('\nregistry audit — is this sprite the one the game draws?\n');

console.log('  SHADOWED — defined more than once. The LAST module wins.');
console.log('    sprite                     defined in                 asked for?');
console.log('    ' + '-'.repeat(68));
if (!shadowed.length) console.log('    (none)');
for (const [n, mods] of shadowed) {
  const who = asked.get(n);
  console.log(
    '    ' + n.padEnd(26) + mods.join(' -> ').padEnd(26) + (who ? `yes — ${who}` : 'NO — both copies are dead')
  );
}

console.log('\n  UNREACHED — defined, but the catalogue never resolves to it.');
console.log('    Expect a lot of tiles: the ground painter picks those by name.');
console.log('    ' + '-'.repeat(68));
for (const mod of ORDER) {
  const list = byMod.get(mod);
  if (!list) continue;
  console.log(`    ${mod} — ${list.length}`);
  if (VERBOSE || mod !== 'tiles') {
    for (let i = 0; i < list.length; i += 4) {
      console.log('      ' + list.slice(i, i + 4).map((s) => s.padEnd(22)).join(''));
    }
  } else {
    console.log('      (pass --verbose to list them)');
  }
}

console.log('\n  PROMISED — asked for by name, not drawn yet. js/main.js §ART DISPATCH.');
console.log('    ' + '-'.repeat(68));
console.log(missing.length ? '    ' + missing.join(', ') : '    (none)');

console.log(
  `\n  ${defined.size} sprites defined · ${asked.size} named by the catalogue · ` +
    `${shadowed.length} shadowed · ${unreached.length} unreached · ${missing.length} promised\n`
);
console.log('  This is a census, not a gate. It exits 0 whatever it finds.\n');
