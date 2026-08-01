// js/saves.js — what gardens exist, and what is in them.
//
// BACKLOG §4e. The owner: *"at a later point we will scope in a save screen."*
//
// ---------------------------------------------------------------------------
// WHY THIS IS ITS OWN FILE, AND WHY IT IMPORTS NOTHING
//
// The title screen comes up before the game boots — that is the whole point of
// the front door — and it must stay cheap. `js/world.js` is where a save is
// written and read, but it pulls in `js/iso.js` and `js/catalog.js` behind it,
// and none of that is needed to answer "is there a garden, how big is it, and
// when did you last touch it". This file reads the JSON and nothing else.
//
// THE COST OF THAT is `BASE_KEY` below, which is a second copy of
// `world.SAVE_KEY`. Two copies of a constant is the class of bug that once put
// `MAP_W = 20` in two files, so it does not go unguarded:
// **`test/saves.test.mjs` asserts the two agree**, and that test is the reason
// the duplication is allowed to exist at all.
//
// ---------------------------------------------------------------------------
// WHAT A GARDEN LOOKS LIKE FROM OUT HERE
//
// A save is a plain object with `objects`, `savedAt`, `version` and an opaque
// `extra` in which main.js parks the creature ladder. Nothing in here reaches
// past that: a damaged save reports what it can and says so, because the one
// thing a save screen must never do is refuse to show you a garden.

/**
 * The storage key of the default garden.
 *
 * MUST MATCH `SAVE_KEY` in js/world.js. Guarded by test/saves.test.mjs.
 */
export const BASE_KEY = 'arcadia.garden';

/** What `?new=1` renames the old garden to, and nothing could reach until now. */
export const PREVIOUS_SUFFIX = '.previous';

/** The name main.js gives the unnamed slot. */
export const DEFAULT_NAME = 'default';

/** `'default'` -> the base key; anything else -> `arcadia.garden:name`. */
export function slotKey(name) {
  const n = String(name || DEFAULT_NAME).slice(0, 48);
  return n === DEFAULT_NAME ? BASE_KEY : `${BASE_KEY}:${n}`;
}

/** The inverse. Returns null for a key that is not one of ours. */
export function slotName(key) {
  if (key === BASE_KEY) return DEFAULT_NAME;
  if (typeof key === 'string' && key.startsWith(`${BASE_KEY}:`)) {
    return key.slice(BASE_KEY.length + 1) || null;
  }
  return null;
}

/** localStorage, or null where there is none (a private window, a test). */
export function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch (_) {
    return null;
  }
}

/**
 * How long ago, in the words a person would use. Deliberately coarse: the
 * difference between 41 and 43 minutes is not information a player wants, and
 * a save screen that ticks is a save screen that draws the eye.
 */
export function ago(then, now = Date.now()) {
  const ms = Math.max(0, Number(now) - Number(then));
  if (!Number.isFinite(ms) || !then) return 'at some point';
  const min = ms / 60000;
  if (min < 1.5) return 'just now';
  if (min < 60) return `${Math.round(min)} minutes ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.round(hr)} hour${Math.round(hr) === 1 ? '' : 's'} ago`;
  const day = hr / 24;
  if (day < 14) return `${Math.round(day)} day${Math.round(day) === 1 ? '' : 's'} ago`;
  const wk = day / 7;
  if (wk < 9) return `${Math.round(wk)} weeks ago`;
  return `${Math.round(day / 30)} months ago`;
}

/** The four rungs, in order, WITHOUT importing creatures.js. See the header. */
const RUNG_ORDER = ['sighted', 'visits', 'settles', 'thrives'];

/**
 * Who lives there — the creatures that got past merely visiting, named. This
 * is the line that makes a save screen a place rather than a list of numbers:
 * "Thistle the satyr and Reed the naiad" is a garden you remember.
 */
function residentsOf(extra) {
  const src = extra && extra.creatures;
  if (!src || typeof src !== 'object') return [];
  const out = [];
  for (const [id, st] of Object.entries(src)) {
    if (!st || typeof st !== 'object') continue;
    const rung = String(st.rung || '');
    if (RUNG_ORDER.indexOf(rung) < 2) continue; // settles or thrives
    out.push({ id, name: typeof st.name === 'string' ? st.name : null, rung });
  }
  // Thrives before settles, then by name, so the list reads the same every time.
  out.sort(
    (a, b) => RUNG_ORDER.indexOf(b.rung) - RUNG_ORDER.indexOf(a.rung) ||
      String(a.name || a.id).localeCompare(String(b.name || b.id))
  );
  return out;
}

/** "Thistle the satyr and two others", or null when nobody has settled. */
export function residentLine(residents) {
  if (!residents || !residents.length) return null;
  const say = (r) => (r.name ? `${r.name} the ${r.id}` : r.id);
  if (residents.length === 1) return say(residents[0]);
  if (residents.length === 2) return `${say(residents[0])} and ${say(residents[1])}`;
  const rest = residents.length - 1;
  return `${say(residents[0])} and ${rest} other${rest === 1 ? '' : 's'}`;
}

/**
 * Read one slot. NEVER THROWS. A save that will not parse still comes back as
 * a row, with `ok: false` and its size, because a player whose garden is
 * damaged needs to be told it is there and broken — not shown an empty screen.
 */
export function readSlot(storage, key, now = Date.now()) {
  if (!storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(key);
  } catch (_) {
    return null;
  }
  if (raw == null) return null;

  const previous = key.endsWith(PREVIOUS_SUFFIX);
  const liveKey = previous ? key.slice(0, -PREVIOUS_SUFFIX.length) : key;
  const row = {
    key,
    liveKey,
    previous,
    name: slotName(liveKey) || DEFAULT_NAME,
    bytes: raw.length,
    ok: false,
    objects: 0,
    savedAt: 0,
    version: 0,
    residents: [],
  };

  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return row;
  }
  if (!data || typeof data !== 'object') return row;

  row.ok = true;
  row.objects = Array.isArray(data.objects) ? data.objects.length : 0;
  row.savedAt = Number(data.savedAt) || 0;
  row.version = Number(data.version) || 0;
  row.residents = residentsOf(data.extra);
  row.age = ago(row.savedAt, now);
  return row;
}

/** Is this one of our keys at all? Guards against another app's storage. */
function ours(key) {
  if (typeof key !== 'string') return false;
  if (key === BASE_KEY || key === BASE_KEY + PREVIOUS_SUFFIX) return true;
  return key.startsWith(`${BASE_KEY}:`);
}

/**
 * Every garden in storage, most recently saved first, with the archived
 * `.previous` copies alongside the live ones.
 *
 * THE `.previous` COPIES ARE THE POINT OF THIS FUNCTION. New Game has always
 * set the old garden aside — "nothing is ever taken from you" is a guarantee,
 * not a slogan — and until now nothing in the game could reach one. A promise
 * the player cannot collect on is not a promise.
 */
export function listGardens(storage = defaultStorage(), now = Date.now()) {
  if (!storage) return [];
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (ours(k)) keys.push(k);
    }
  } catch (_) {
    return [];
  }
  const rows = keys.map((k) => readSlot(storage, k, now)).filter(Boolean);
  // Live gardens first, then archives; within each, most recent first. A
  // player looking for "the one I was just in" should not have to read dates.
  rows.sort(
    (a, b) => Number(a.previous) - Number(b.previous) || (b.savedAt || 0) - (a.savedAt || 0)
  );
  return rows;
}

/** The garden a Continue button should open: the most recent live one. */
export function mostRecent(storage = defaultStorage(), now = Date.now()) {
  return listGardens(storage, now).find((r) => !r.previous && r.ok) || null;
}

/**
 * Bring an archived garden back, WITHOUT throwing the current one away: the
 * live slot is set aside as the new `.previous` and the two swap places. So
 * recovering is itself undoable, which matters because a player reaching for
 * this button is already someone who lost something once.
 *
 * Returns true when the swap happened.
 */
export function recover(storage, key) {
  if (!storage || typeof key !== 'string' || !key.endsWith(PREVIOUS_SUFFIX)) return false;
  const live = key.slice(0, -PREVIOUS_SUFFIX.length);
  try {
    const archived = storage.getItem(key);
    if (archived == null) return false;
    const current = storage.getItem(live);
    storage.setItem(live, archived);
    if (current == null) storage.removeItem(key);
    else storage.setItem(key, current);
    return true;
  } catch (_) {
    return false;
  }
}

/** The URL that opens a named garden without wiping anything. */
export function playHref(name, search = '') {
  const params = new URLSearchParams(search);
  params.delete('new');
  params.set('play', '1');
  if (name && name !== DEFAULT_NAME) params.set('seed', name);
  else params.delete('seed');
  return '?' + params.toString();
}

/** The URL that starts a genuinely new garden, optionally a named one. */
export function newHref(name, search = '') {
  const params = new URLSearchParams(search);
  params.set('new', '1');
  params.set('play', '1');
  if (name && name !== DEFAULT_NAME) params.set('seed', String(name).slice(0, 48));
  else params.delete('seed');
  return '?' + params.toString();
}

/**
 * A name a player typed, made safe to key on. Kept liberal — this is a garden
 * called "mum's" or "the second one", not an identifier — but it may not be
 * empty and it may not contain the colon the key format uses.
 */
export function cleanName(input) {
  const n = String(input == null ? '' : input)
    // The COLON is the key format's own separator, so it is the one character
    // that cannot survive; control characters go because they are not typing.
    // Everything else a person might write - an apostrophe, a hyphen, an
    // accent - is part of a garden's name and stays.
    .replace(/[:\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32);
  return n && n !== DEFAULT_NAME ? n : '';
}
