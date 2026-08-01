// test/ask.test.mjs — the question mark's ground answers.
//
// `ASKED` is hand-written prose keyed against two enums that live in OTHER
// files. Adding a ground type to catalog.js or a grass to world.js is a normal,
// small edit that would silently give the new one the "Off the map" fallback —
// the `?` would answer a question about solid ground by saying there is no
// ground. Nothing else would break, so nothing else would notice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { ASKED } from '../js/ui.js';
import { GROUND_TYPES } from '../js/catalog.js';
import { GRASS_TYPES, DEFAULT_GRASS } from '../js/world.js';

test('every ground type has an answer', () => {
  const missing = GROUND_TYPES.filter((g) => !ASKED.ground[g]);
  assert.deepEqual(missing, [], `no ? text for: ${missing.join(', ')}`);
});

test('every species grass has an answer, and the baseline deliberately does not', () => {
  for (const g of GRASS_TYPES) {
    if (g === DEFAULT_GRASS) {
      assert.equal(
        ASKED.grass[g],
        undefined,
        `${g} is the baseline nobody claimed — it must fall through to the GROUND underneath`
      );
      continue;
    }
    assert.ok(ASKED.grass[g], `no ? text for the ${g}`);
  }
});

test('nothing is answered for a thing that does not exist', () => {
  // The other direction: prose for a retired ground type is dead text that
  // reads as coverage. ZONING.md retired three axes once already.
  const grounds = new Set(GROUND_TYPES);
  const grasses = new Set(GRASS_TYPES);
  for (const k of Object.keys(ASKED.ground)) {
    assert.ok(grounds.has(k), `'${k}' is not a ground type any more`);
  }
  for (const k of Object.keys(ASKED.grass)) {
    assert.ok(grasses.has(k), `'${k}' is not a grass any more`);
  }
});

test('every answer is a name and a sentence, and the sentence is a sentence', () => {
  for (const table of [ASKED.ground, ASKED.grass]) {
    for (const [k, v] of Object.entries(table)) {
      assert.ok(Array.isArray(v) && v.length === 2, `${k}: expected [name, text]`);
      const [name, text] = v;
      assert.ok(name && name.length <= 24, `${k}: '${name}' will not fit the info box`);
      assert.ok(text && text.length > 20, `${k}: the text is not saying anything`);
      assert.match(text, /[.!?]$/, `${k}: the text does not end in a full stop`);
      // SPEC section 7: no numbers, ever. The ? is the one place it would be
      // most tempting to leak one.
      assert.doesNotMatch(text, /\d/, `${k}: a number got into the ? text`);
    }
  }
});
