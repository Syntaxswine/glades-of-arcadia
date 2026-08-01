// js/titlescreen.js — the title screen, and the clean slate behind it.
//
// WHY THIS EXISTS AT ALL, beyond wanting a front door:
//
// The game autosaves continuously and restores on load, which is right for a
// cosy builder — your garden is never lost — but it means a reload is NOT a
// reset. Combined with GitHub Pages serving ES modules at `max-age=600`, "I
// reloaded and nothing changed" had two independent causes and no cure the
// player could reach. This is the cure they can reach: a front door with a New
// Game behind it that genuinely starts over.
//
// THE WIPE IS A NAVIGATION, ON PURPOSE. New Game does not tear down the running
// world and build another one in place — it sets `?new=1&play=1` and lets the
// page boot from scratch. A fresh document cannot inherit stale module state,
// a half-torn-down renderer, a leftover interval or a cached save, because
// there is nothing there to inherit from. It costs a second and it is the only
// version of "start over" that cannot be subtly wrong.
//
// The backdrop is the owner's picture. The wordmark is ours, drawn as pixel art
// against the same palette as the game (see js/art/title.js) so that the first
// thing on screen is made the same way as everything after it.

import { TITLE } from './art/title.js';
import { resolve as pal } from './palette.js';

/** Where the picture lives, relative to the page. */
export const BACKDROP = 'TitleScreen.png';

/**
 * Rasterise a sprite (rows of palette keys) to a canvas at an integer scale.
 * Nearest-neighbour, always — this is pixel art and a fractional scale would
 * smear it.
 */
function rasterise(sprite, scale) {
  const cv = document.createElement('canvas');
  cv.width = sprite.w * scale;
  cv.height = sprite.h * scale;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < sprite.h; y++) {
    const row = sprite.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      const hex = pal(ch);
      if (!hex) continue;
      ctx.fillStyle = hex;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

/**
 * Should the game start immediately, skipping the title?
 *
 * `?play=1` means "the player has already chosen" — it is what New Game
 * navigates to, and what a future Continue will use. Everything else lands on
 * the title.
 */
export function wantsPlay(search) {
  const s = typeof search === 'string' ? search : (typeof location !== 'undefined' && location.search) || '';
  return /(?:^|[?&])play=1(?:&|$)/.test(s);
}

/** The URL that starts a genuinely new garden. */
export function newGameHref(search) {
  const s = typeof search === 'string' ? search : (typeof location !== 'undefined' && location.search) || '';
  const params = new URLSearchParams(s);
  params.set('new', '1');
  params.set('play', '1');
  return '?' + params.toString();
}

/**
 * Put the title screen up inside `stage`.
 *
 * `onStart(href)` is called when the player chooses New Game. The default
 * navigates, which is the whole point; it is injectable so a test can watch the
 * decision without leaving the page.
 */
export function showTitle(stage, opts = {}) {
  if (!stage || typeof document === 'undefined') return null;
  const onStart = opts.onStart || ((href) => { location.href = href; });
  const build = opts.build || '';

  const root = document.createElement('div');
  root.id = 'title';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Glades of Arcadia — title screen');

  const bg = document.createElement('img');
  bg.className = 'title-bg';
  bg.src = BACKDROP;
  bg.alt = '';
  bg.decoding = 'async';
  root.appendChild(bg);

  // The wordmark. Scale is chosen so it lands at roughly two thirds of the
  // stage width whatever the stage is — integer only, and never below 1.
  const wrap = document.createElement('div');
  wrap.className = 'title-plate';
  const scale = Math.max(1, Math.floor(((stage.clientWidth || 1280) * 0.62) / TITLE.w));
  wrap.appendChild(rasterise(TITLE, scale));
  root.appendChild(wrap);

  const menu = document.createElement('div');
  menu.className = 'title-menu';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'title-btn';
  start.textContent = 'New game';
  start.addEventListener('click', () => onStart(newGameHref()));
  menu.appendChild(start);

  const note = document.createElement('p');
  note.className = 'title-note';
  note.textContent = 'A new garden. Sixty tiles square, and nothing on it yet.';
  menu.appendChild(note);
  root.appendChild(menu);

  // The build stamp. Small, dim, and in a corner — but present, because
  // "am I even running the new code?" cost the owner a whole test session and
  // the answer was not visible anywhere on the page.
  if (build) {
    const stamp = document.createElement('p');
    stamp.className = 'title-stamp';
    stamp.textContent = build;
    root.appendChild(stamp);
  }

  stage.appendChild(root);
  // Focus so Enter and Space work without a click, and so a screen reader lands
  // on the one thing there is to do.
  try {
    start.focus({ preventScroll: true });
  } catch (_) {
    try { start.focus(); } catch (_) {}
  }

  return {
    el: root,
    remove() {
      try { root.remove(); } catch (_) {}
    },
  };
}
