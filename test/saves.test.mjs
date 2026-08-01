// saves.test.mjs — what gardens exist, and the promise that none is ever lost.
//
// BACKLOG §4e. `js/saves.js` is deliberately import-free so the title screen
// stays cheap, which costs one duplicated constant. THE FIRST TEST HERE IS THE
// REASON THAT DUPLICATION IS ALLOWED TO EXIST.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAVE_KEY } from '../js/world.js';
import {
  BASE_KEY, PREVIOUS_SUFFIX, DEFAULT_NAME,
  slotKey, slotName, ago, readSlot, listGardens, mostRecent, recover,
  playHref, newHref, residentLine, cleanName,
} from '../js/saves.js';

/** A localStorage that behaves like the real one, including its ordering. */
function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

const garden = (o) => JSON.stringify({
  app: 'arcadia', version: 3, savedAt: o.savedAt ?? 1000,
  objects: new Array(o.objects ?? 0).fill({ id: 'herm' }),
  extra: o.extra ?? {},
});

// ---------------------------------------------------------------------------

test('saves.js and world.js agree about the storage key', () => {
  // js/saves.js imports nothing so the title screen does not drag world.js and
  // catalog.js in behind it. That is worth a duplicated string ONLY while this
  // assertion exists: `MAP_W = 20` in two files is the bug this prevents.
  assert.equal(BASE_KEY, SAVE_KEY);
});

test('slot names and keys are inverses', () => {
  assert.equal(slotKey(DEFAULT_NAME), BASE_KEY);
  assert.equal(slotKey('orchard'), `${BASE_KEY}:orchard`);
  assert.equal(slotName(BASE_KEY), DEFAULT_NAME);
  assert.equal(slotName(`${BASE_KEY}:orchard`), 'orchard');
  assert.equal(slotName('someone.elses.app'), null, 'another app\'s key is not ours');
});

test('a damaged save is still shown, and says so', () => {
  // The one thing a save screen must never do is refuse to show you a garden.
  const s = fakeStorage({ [BASE_KEY]: '{not json' });
  const row = readSlot(s, BASE_KEY, 2000);
  assert.equal(row.ok, false);
  assert.equal(row.bytes, 9);
  assert.equal(row.name, DEFAULT_NAME);
});

test('an empty slot reads as nothing at all, not as an empty garden', () => {
  assert.equal(readSlot(fakeStorage(), BASE_KEY), null);
  assert.equal(readSlot(null, BASE_KEY), null);
});

test('a garden reports its size, its age and who lives there', () => {
  const s = fakeStorage({
    [BASE_KEY]: garden({
      objects: 12,
      savedAt: 1_000_000,
      extra: {
        creatures: {
          satyr: { rung: 'thrives', name: 'Thistle' },
          naiad: { rung: 'settles', name: 'Reed' },
          centaur: { rung: 'visits', name: 'Ash' }, // has not moved in
        },
      },
    }),
  });
  const row = readSlot(s, BASE_KEY, 1_000_000 + 3 * 3600_000);
  assert.equal(row.objects, 12);
  assert.equal(row.age, '3 hours ago');
  assert.deepEqual(row.residents.map((r) => r.name), ['Thistle', 'Reed'], 'thrives before settles; a visitor does not live there');
  assert.equal(residentLine(row.residents), 'Thistle the satyr and Reed the naiad');
});

test('residentLine stays a sentence however many there are', () => {
  const r = (id, name) => ({ id, name, rung: 'settles' });
  assert.equal(residentLine([]), null);
  assert.equal(residentLine([r('satyr', 'Thistle')]), 'Thistle the satyr');
  assert.equal(residentLine([r('satyr', null)]), 'satyr', 'an unnamed one is still someone');
  assert.equal(residentLine([r('satyr', 'A'), r('naiad', 'B'), r('unicorn', 'C')]), 'A the satyr and 2 others');
});

test('ago is coarse on purpose', () => {
  const t = 1_000_000_000;
  assert.equal(ago(t, t + 30_000), 'just now');
  assert.equal(ago(t, t + 20 * 60_000), '20 minutes ago');
  assert.equal(ago(t, t + 3600_000), '1 hour ago');
  assert.equal(ago(t, t + 2 * 86_400_000), '2 days ago');
  assert.equal(ago(t, t + 30 * 86_400_000), '4 weeks ago');
  assert.equal(ago(0, t), 'at some point', 'a save with no timestamp is not "55 years ago"');
});

// ---------------------------------------------------------------------------
// The listing.
// ---------------------------------------------------------------------------

test('live gardens come before archives, and recent before old', () => {
  const s = fakeStorage({
    [`${BASE_KEY}:orchard`]: garden({ objects: 3, savedAt: 500 }),
    [BASE_KEY + PREVIOUS_SUFFIX]: garden({ objects: 40, savedAt: 9000 }),
    [BASE_KEY]: garden({ objects: 9, savedAt: 800 }),
    'unrelated.app.thing': 'x',
  });
  const rows = listGardens(s, 10_000);
  assert.deepEqual(
    rows.map((r) => `${r.name}${r.previous ? '(prev)' : ''}`),
    ['default', 'orchard', 'default(prev)'],
    'the archive sorts last even though it is the most recently written'
  );
  assert.equal(rows.length, 3, 'another app\'s storage is not ours to list');
});

test('Continue opens the most recent LIVE garden, never an archive', () => {
  const s = fakeStorage({
    [BASE_KEY]: garden({ objects: 9, savedAt: 800 }),
    [`${BASE_KEY}:orchard`]: garden({ objects: 3, savedAt: 5000 }),
    [BASE_KEY + PREVIOUS_SUFFIX]: garden({ objects: 40, savedAt: 9999 }),
  });
  assert.equal(mostRecent(s, 10_000).name, 'orchard');
});

test('a browser with nothing in it offers nothing to continue', () => {
  assert.equal(mostRecent(fakeStorage(), 1), null);
  assert.deepEqual(listGardens(fakeStorage(), 1), []);
  assert.deepEqual(listGardens(null, 1), []);
});

// ---------------------------------------------------------------------------
// Recovery — the promise being collected on.
// ---------------------------------------------------------------------------

test('recovering SWAPS, so it is itself undoable', () => {
  // The player reaching for this button already lost something once. Making
  // recovery destructive in the other direction would be the same wound again.
  const s = fakeStorage({
    [BASE_KEY]: garden({ objects: 1, savedAt: 100 }),
    [BASE_KEY + PREVIOUS_SUFFIX]: garden({ objects: 40, savedAt: 90 }),
  });
  assert.equal(recover(s, BASE_KEY + PREVIOUS_SUFFIX), true);
  assert.equal(readSlot(s, BASE_KEY, 1).objects, 40, 'the archive is now live');
  assert.equal(readSlot(s, BASE_KEY + PREVIOUS_SUFFIX, 1).objects, 1, 'and the live one was kept');
  // ...and again, which puts it back exactly.
  assert.equal(recover(s, BASE_KEY + PREVIOUS_SUFFIX), true);
  assert.equal(readSlot(s, BASE_KEY, 1).objects, 1);
});

test('recovering into an empty slot clears the archive rather than duplicating it', () => {
  const s = fakeStorage({ [BASE_KEY + PREVIOUS_SUFFIX]: garden({ objects: 7, savedAt: 90 }) });
  assert.equal(recover(s, BASE_KEY + PREVIOUS_SUFFIX), true);
  assert.equal(readSlot(s, BASE_KEY, 1).objects, 7);
  assert.equal(readSlot(s, BASE_KEY + PREVIOUS_SUFFIX, 1), null);
});

test('recover refuses anything that is not an archive', () => {
  const s = fakeStorage({ [BASE_KEY]: garden({ objects: 1 }) });
  assert.equal(recover(s, BASE_KEY), false, 'a live garden is not a thing to recover');
  assert.equal(recover(s, null), false);
  assert.equal(recover(null, BASE_KEY + PREVIOUS_SUFFIX), false);
  assert.equal(recover(s, `${BASE_KEY}:gone${PREVIOUS_SUFFIX}`), false, 'nothing there');
});

// ---------------------------------------------------------------------------
// The links.
// ---------------------------------------------------------------------------

test('Play never carries ?new, and New always does', () => {
  // The whole front-door guarantee in one assertion: opening a garden from the
  // list must be incapable of wiping it, whatever was in the URL before.
  assert.equal(playHref(DEFAULT_NAME, '?new=1&play=1&seed=orchard'), '?play=1');
  assert.equal(playHref('orchard', ''), '?play=1&seed=orchard');
  assert.equal(newHref(DEFAULT_NAME, ''), '?new=1&play=1');
  assert.equal(newHref('orchard', ''), '?new=1&play=1&seed=orchard');
});

test('a garden name is what a person typed, minus the one character that breaks the key', () => {
  assert.equal(cleanName("mum's garden"), "mum's garden");
  assert.equal(cleanName('the-second-one'), 'the-second-one', 'a hyphen is a name, not a separator');
  assert.equal(cleanName('a:b'), 'a b', 'the colon is the key format\'s own');
  assert.equal(cleanName('   '), '', 'nothing is not a name');
  assert.equal(cleanName('default'), '', 'and neither is the word for the unnamed slot');
  assert.equal(cleanName('x'.repeat(80)).length, 32);
});
