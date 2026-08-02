// iso-ground.test.mjs — no sprite may have a horizontal edge at ground level.
//
// `tools/iso-audit.mjs --strict` promoted to an assertion, the same way
// `tools/anchor-audit.mjs` was. It reached a CLEAN GATE on 2026-08-01 and is
// a RATCHET again the same day, at 29: step 3 deleted the baked contact
// skirts, which were also the only thing covering 29 square-cut feet. See
// KNOWN_FLAT_FEET in tools/isogeom.mjs — the list is shared with the tool.
//
// ---------------------------------------------------------------------------
// IT WAS BUILT AS A RATCHET, and the ratchet is what got the list to zero.
//
// A gate that cannot be switched on until the last offender is fixed protects
// nothing in the meantime, and "meantime" is where regressions live. So this
// was written with eleven names in it and made to fail in BOTH directions: if
// a passing sprite starts failing (the point), AND if a failing sprite starts
// passing without being struck off (so the list could never quietly become a
// lie about how much was left). The second half is what emptied it — every fix
// had to come here and delete a name.
//
// It exists because of a real regression. A change that made eighteen sprites
// right made the heroon much worse — from a 12 px level edge to a 106 px one,
// the worst reading in the catalogue — and nothing in `npm test` noticed,
// because the audit was a report somebody had to remember to run.
//
// TO ADD A NAME: a name, a reason and a plan. Not a shrug.
// TO CLEAR ONE: fix the sprite, run the audit, delete the name.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDITED_MODULES, spritesIn, measure, importArt, KNOWN_FLAT_FEET,
} from '../tools/isogeom.mjs';

/**
 * THE LIST LIVES IN `tools/isogeom.mjs`, beside the population it is counted
 * against, so this test and `node tools/iso-audit.mjs --strict` — which is in
 * `npm run check` — cannot excuse different sprites. Its own doc comment holds
 * the name/reason/plan this file has always demanded of it.
 *
 * IT WAS EMPTY, AND EARNED. It had been FORTY-EIGHT, and what closed it was
 * four shared helpers and four sprites rather than forty-eight redraws:
 *
 *   props.js  skirt()          an ellipse at 3.7:1, clipped by a short grid
 *   decor.js  skirt()          a rectangular band, three rows of solid 'm'
 *   props.js  groundContact()  48 hand-typed 'mmmm' contact bands
 *   props.js  pool()           EVERY pool in the game, at ratios 0.24 to 0.45
 *                              where the ground plane allows exactly 0.5
 *
 *   plus: the three caves rebuilt as blocks and knolls, the ford's water
 *   clipped to its own tile diamond, and nine decor props given the contact
 *   shadow they never had.
 *
 * It is 29 again, and the reason is worth reading before assuming a regression:
 * those same skirts were also COVERING each object's square-cut foot. Deleting
 * them (step 3 — they were grass-green on stone) did not break 29 sprites, it
 * uncovered 29 that had been wrong since they were drawn. Step 4 redraws them.
 *
 * GET IT BACK TO EMPTY. Adding to it needs a name and a reason and a plan —
 * not a shrug — and the second test below will not let a name sit there after
 * it has been fixed.
 */
const KNOWN = KNOWN_FLAT_FEET;

const sprites = [];
for (const name of AUDITED_MODULES) {
  // A ratchet counted against a population that can silently halve is not a
  // ratchet: `importArt` rethrows anything but a missing file.
  const mod = await importArt(new URL(`../js/art/${name}.js`, import.meta.url).href);
  if (!mod) continue;
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
    'These now pass. Strike them off KNOWN_FLAT_FEET in tools/isogeom.mjs — ' +
      'a list that still ' +
      'names fixed sprites overstates the work left and, worse, would let one ' +
      'of them regress unnoticed.'
  );
});
