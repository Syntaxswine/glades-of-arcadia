// iso-ground.test.mjs — no sprite may GROW a horizontal edge at ground level.
//
// `tools/iso-audit.mjs --strict` promoted to an assertion, the same way
// `tools/anchor-audit.mjs` was — but as a RATCHET rather than a clean gate,
// because the list is eleven long and not yet zero.
//
// ---------------------------------------------------------------------------
// WHY A RATCHET, AND WHY IT FAILS IN BOTH DIRECTIONS
//
// A gate that cannot be turned on until the last offender is fixed protects
// nothing in the meantime, and "meantime" is where regressions live. This one
// fails if a passing sprite starts failing (the point), AND if a failing sprite
// starts passing without being struck off the list (so the list cannot quietly
// become a lie about how much is left).
//
// It exists because of a real one. A change that made eighteen sprites right
// made the heroon much worse — from a 12px level edge to a 106px one, the worst
// reading in the catalogue — and nothing in `npm test` noticed, because the
// audit was a report you had to remember to run. The instrument found it on the
// next manual pass. This is that pass, automated.
//
// TO CLEAR A NAME: fix the sprite, run `node tools/iso-audit.mjs`, delete the
// name. That is the whole ceremony, and the second test below insists on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDITED_MODULES, spritesIn, measure } from '../tools/isogeom.mjs';

/**
 * The sprites that still end in a horizontal edge where they meet the ground,
 * as of 2026-08-01. Every one is an individual redraw, not a helper: see
 * proposals/BACKLOG.md §4j for what each of them actually needs.
 *
 * It was FORTY-EIGHT. What cleared the other thirty-seven was three shared
 * helpers, not thirty-seven redraws — the contact skirt in props.js and
 * decor.js, and the hand-typed contact band in the sprite() constructor.
 */
const KNOWN = new Set([
  'willow-water', // the pool's own rim, cut straight across the front
  'wall-fountain', // a front elevation — the cave family, still to do
  'jet-basin', // the basin's lower rim
  'rocky-ford', // the water strip's front cut
  'fountain-tiered', // the bowl's lower rim
  'arbour-seat', // the seat frame's feet
  'axe-marker', // the marker's base block
  'balustrade', // the balustrade's plinth
  'pergola', // the post feet
  'broken-column', // decor's, not props' — the drum lying on its side
  'stone-bench', // the bench's two supports
]);

const sprites = [];
for (const name of AUDITED_MODULES) {
  let mod;
  try {
    mod = await import(new URL(`../js/art/${name}.js`, import.meta.url).href);
  } catch {
    continue;
  }
  sprites.push(...spritesIn(mod, `${name}.js`));
}

const flagged = new Map();
for (const { name, sprite: s } of sprites) {
  const q = measure(s);
  if (!q.ok) flagged.set(name, q);
}

test('the audit is looking at something', () => {
  assert.ok(
    sprites.length >= 200,
    `only ${sprites.length} sprites measurable — did a module stop exporting?`
  );
});

test('no sprite has GROWN a horizontal edge at ground level', () => {
  const fresh = [...flagged.entries()]
    .filter(([name]) => !KNOWN.has(name))
    .map(([name, q]) => `${name}: ${q.flat}px level at ground, allowed ${q.min}`);
  assert.deepEqual(
    fresh,
    [],
    'An isometric world has no horizontal edges at ground level. Run ' +
      '`node tools/iso-audit.mjs --runs` for the exact columns, and open the ' +
      'sprite lab with ?iso=diamond,base to see them painted on. The usual ' +
      'cause is a contact shadow drawn as a band or a flat ellipse rather than ' +
      'a circle in the ground plane — GROUND_ELLIPSE in js/iso.js.'
  );
});

test('the known-offender list has not gone stale', () => {
  const fixed = [...KNOWN].filter((name) => !flagged.has(name));
  assert.deepEqual(
    fixed,
    [],
    'These now pass. Strike them off KNOWN in this file — a list that still ' +
      'names fixed sprites overstates the work left and, worse, would let one ' +
      'of them regress unnoticed.'
  );
});
