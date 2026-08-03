// test/titlescreen.test.mjs — the front door's URL arithmetic.
//
// WHY THIS FILE EXISTS, having not existed until mobile mode needed it:
//
// Every decision the title screen makes is expressed as a URL, because the
// whole design rests on "the wipe is a navigation" (titlescreen.js, top). That
// makes the href builders the load-bearing part of the screen and the DOM the
// decoration — and until now the load-bearing part had no test at all.
//
// Mobile mode is what made that intolerable. `?mode=mobile` has to survive
// Continue, New game, a named garden and a Recover, because `iso.MODE` is read
// once at import: a mode that gets dropped from one href out of five does not
// fail loudly, it just silently puts a phone player back on a 640px canvas.
// That is a bug you can only find by playing on a phone, which is the most
// expensive place this project has to find anything.

import test from 'node:test';
import assert from 'node:assert/strict';

import { wantsPlay, newGameHref, modeHref, looksLikePhone } from '../js/titlescreen.js';
import { playHref, newHref } from '../js/saves.js';
import { modeFrom, MODES, DEFAULT_MODE } from '../js/iso.js';

// ---------------------------------------------------------------------------
// The door itself
// ---------------------------------------------------------------------------

test('only ?play=1 skips the title', () => {
  assert.equal(wantsPlay('?play=1'), true);
  assert.equal(wantsPlay('?mode=mobile&play=1'), true);
  assert.equal(wantsPlay('?play=1&seed=x'), true);
  assert.equal(wantsPlay(''), false);
  assert.equal(wantsPlay('?play=0'), false);
  // The boundary matters: `?display=1` must not open the door.
  assert.equal(wantsPlay('?display=1'), false);
});

// ---------------------------------------------------------------------------
// THE MODE SURVIVES EVERY DOOR
//
// This is the assertion the whole file was written for. Four different href
// builders, in two modules, none of which knows what a mode is — they all work
// by carrying the query string forward, and this is what proves they do.
// ---------------------------------------------------------------------------

test('mode=mobile survives every way into the garden', () => {
  const search = '?mode=mobile';
  const doors = {
    'new game': newGameHref(search),
    continue: playHref('', search),
    'a named garden': playHref('mum’s', search),
    'a new named garden': newHref('the second one', search),
  };
  for (const [name, href] of Object.entries(doors)) {
    assert.equal(modeFrom(href), 'mobile', `${name} dropped the mode`);
    assert.equal(wantsPlay(href), true, `${name} does not actually start the game`);
  }
});

test('a desktop player never picks up a mode they did not ask for', () => {
  for (const href of [newGameHref(''), playHref('', ''), newHref('x', '')]) {
    assert.equal(modeFrom(href), DEFAULT_MODE);
    assert.ok(!/mode=/.test(href), `an unasked-for mode appeared in ${href}`);
  }
});

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

test('the mode switch lands on the TITLE, never in the garden', () => {
  // Switching mode reloads the document — it has to, `iso.MODE` is read once
  // at import — and it deliberately reloads to the front door so the player
  // sees the frame before committing to it.
  const href = modeHref('mobile', '?play=1');
  assert.equal(modeFrom(href), 'mobile');
  assert.equal(wantsPlay(href), false, 'the switch dropped the player straight into the game');
});

test('the mode switch can never wipe a garden', () => {
  // `new=1` is the destructive flag. If a mode switch could carry it, changing
  // your mind about the layout would cost you the glade.
  for (const from of ['?new=1&play=1', '?new=1', '?new=1&seed=mine']) {
    for (const to of ['mobile', 'desktop']) {
      assert.ok(!/\bnew=1\b/.test(modeHref(to, from)), `${from} -> ${to} kept the wipe`);
    }
  }
});

test('switching back to the desktop removes the parameter rather than pinning it', () => {
  // A URL that says `?mode=desktop` is a URL that has opted OUT of ever
  // following a future default. The desktop is the default, so it is spelled
  // by absence.
  const href = modeHref(DEFAULT_MODE, '?mode=mobile');
  assert.ok(!/mode=/.test(href), `the desktop pinned itself: ${href}`);
  assert.equal(modeFrom(href), DEFAULT_MODE);
});

test('the switch keeps the garden you were looking at', () => {
  const href = modeHref('mobile', '?seed=mum%E2%80%99s&play=1');
  assert.match(href, /seed=/, 'the mode switch forgot which garden was chosen');
});

test('a round trip through both modes returns the query string it started with', () => {
  const start = '?seed=x';
  const there = modeHref('mobile', start);
  const back = modeHref(DEFAULT_MODE, there);
  assert.deepEqual(
    [...new URLSearchParams(back)].sort(),
    [...new URLSearchParams(start)].sort(),
    'a mode round trip left something behind'
  );
});

// ---------------------------------------------------------------------------
// The nudge
// ---------------------------------------------------------------------------

test('the phone hint fires below the desktop screen width and not above it', () => {
  assert.equal(looksLikePhone(360), true);
  assert.equal(looksLikePhone(390), true);
  assert.equal(looksLikePhone(MODES.desktop.w - 1), true);
  assert.equal(looksLikePhone(MODES.desktop.w), false, 'a screen that fits was called a phone');
  assert.equal(looksLikePhone(1280), false);
  // No window and no number is not a phone — it is an unknown, and an unknown
  // must not nag.
  assert.equal(looksLikePhone(0), false);
});
