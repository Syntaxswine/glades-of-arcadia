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
import { MODE, MODES, DEFAULT_MODE, IS_MOBILE } from './iso.js';
import {
  listGardens, mostRecent, recover, playHref, newHref, residentLine,
  cleanName, defaultStorage, DEFAULT_NAME,
} from './saves.js';

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
 * The URL that puts the title screen back up in a different mode.
 *
 * IT DELIBERATELY DOES NOT CARRY `play`. Switching mode is a navigation — it
 * has to be, because `iso.MODE` is decided once at import and every layout
 * constant in the game is derived from it (see iso.js §MODE) — and since we
 * are reloading anyway, we reload to the TITLE rather than into the garden.
 *
 * That is not a limitation dressed up as a feature. It means the player sees
 * the phone frame, the letterbox and the wordmark at the size they will
 * actually be, BEFORE committing to a mode. A choice you can see the result
 * of is not really a choice about a checkbox any more.
 *
 * `new` is dropped for the obvious reason: a mode switch must never be able to
 * wipe a garden.
 */
export function modeHref(mode, search) {
  const s = typeof search === 'string' ? search : (typeof location !== 'undefined' && location.search) || '';
  const params = new URLSearchParams(s);
  params.delete('play');
  params.delete('new');
  if (mode === DEFAULT_MODE) params.delete('mode');
  else params.set('mode', mode);
  const q = params.toString();
  return q ? '?' + q : '?';
}

/**
 * Does this look like a phone that has landed on the desktop layout?
 *
 * Used only to put a NOTE under the switch, never to redirect. An automatic
 * redirect would be the wrong call twice over: it would take the choice away
 * from someone who deliberately asked for the desktop on a tablet, and a
 * narrow window on a monitor is not a phone. The player is told; the player
 * decides.
 */
export function looksLikePhone(width) {
  const w = typeof width === 'number' ? width : (typeof window !== 'undefined' && window.innerWidth) || 0;
  return w > 0 && w < MODES.desktop.w;
}

// ---------------------------------------------------------------------------
// THE SAVE SCREEN — BACKLOG §4e, deferred once by the owner and now built.
//
// Three things it exists to do, in the order they matter:
//
//   CONTINUE   The commonest thing anyone wants from a front door, and until
//              now the only way to reach it was to know that `?play=1` boots
//              without wiping. A door you have to know a URL to open is a door
//              in name only.
//   GARDENS    `?seed=name` has always written to its own slot, so multiple
//              gardens were half-built by accident. This makes them deliberate.
//   RECOVER    New Game has always set the old garden aside at
//              `<key>.previous` — "nothing is ever taken from you" — and
//              nothing in the game could reach one. A PROMISE THE PLAYER
//              CANNOT COLLECT ON IS NOT A PROMISE. It is a button now.
//
// The reading and the storage arithmetic live in js/saves.js, which imports
// nothing; this file is the presentation.

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** One line summarising a garden, in a person's words rather than a schema's. */
function describe(row) {
  if (!row.ok) return `damaged — ${Math.round(row.bytes / 1024)} kB still on disk`;
  const bits = [];
  bits.push(row.objects === 0 ? 'nothing planted yet' : `${row.objects} thing${row.objects === 1 ? '' : 's'} planted`);
  const who = residentLine(row.residents);
  if (who) bits.push(who);
  bits.push(row.age);
  return bits.join(' · ');
}

/**
 * The gardens list. Built into `menu`, replacing whatever was there — the
 * title screen is one panel that changes what it offers, not two screens, so
 * the backdrop and the wordmark never flicker.
 */
function buildGardens(menu, ctx) {
  menu.textContent = '';
  const rows = listGardens(ctx.storage, ctx.now);

  const list = el('div', 'title-list');
  list.setAttribute('role', 'list');
  if (!rows.length) list.appendChild(el('p', 'title-note', 'No gardens saved in this browser yet.'));

  for (const row of rows) {
    const item = el('div', `title-row${row.previous ? ' is-previous' : ''}`);
    item.setAttribute('role', 'listitem');
    const label = el('div', 'title-row-text');
    const title = row.name === DEFAULT_NAME ? 'Your glade' : row.name;
    label.appendChild(el('span', 'title-row-name', row.previous ? `${title} — set aside` : title));
    label.appendChild(el('span', 'title-row-meta', describe(row)));
    item.appendChild(label);

    const go = el('button', 'title-btn title-btn-small', row.previous ? 'Recover' : 'Play');
    go.type = 'button';
    go.disabled = !row.ok;
    go.addEventListener('click', () => {
      if (row.previous) {
        // Swaps rather than overwrites, so recovering is itself undoable. The
        // player reaching for this button already lost something once.
        if (recover(ctx.storage, row.key)) buildGardens(menu, { ...ctx, now: Date.now() });
        return;
      }
      ctx.onStart(playHref(row.name, ctx.search));
    });
    item.appendChild(go);
    list.appendChild(item);
  }
  menu.appendChild(list);

  // A named new garden. The field is optional: an empty name is the default
  // slot, which is what "New game" on the front panel already does.
  const form = el('form', 'title-new');
  const input = el('input', 'title-input');
  input.type = 'text';
  input.placeholder = 'name a new garden';
  input.maxLength = 32;
  input.setAttribute('aria-label', 'Name for a new garden');
  const make = el('button', 'title-btn title-btn-small', 'Start it');
  make.type = 'submit';
  form.appendChild(input);
  form.appendChild(make);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    ctx.onStart(newHref(cleanName(input.value) || DEFAULT_NAME, ctx.search));
  });
  menu.appendChild(form);

  const back = el('button', 'title-btn title-btn-small', 'Back');
  back.type = 'button';
  back.addEventListener('click', () => ctx.buildMain(menu, ctx));
  menu.appendChild(back);

  try { (list.querySelector('button') || back).focus({ preventScroll: true }); } catch (_) {}
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

  const ctx = {
    onStart,
    storage: opts.storage !== undefined ? opts.storage : defaultStorage(),
    search: (typeof location !== 'undefined' && location.search) || '',
    now: opts.now || Date.now(),
    buildGardens,
    buildMain,
  };

  /**
   * The front panel: Continue if there is anything to continue, New game
   * always, Gardens when there is more than one thing in storage.
   *
   * CONTINUE COMES FIRST AND IS FOCUSED, because a returning player's garden
   * is the thing they came back for and New Game is the destructive one. The
   * two were the same button until now and only the destructive one existed.
   */
  function buildMain(host, c) {
    host.textContent = '';
    const rows = listGardens(c.storage, c.now);
    const last = mostRecent(c.storage, c.now);

    let first = null;
    if (last) {
      const cont = el('button', 'title-btn', 'Continue');
      cont.type = 'button';
      cont.addEventListener('click', () => c.onStart(playHref(last.name, c.search)));
      host.appendChild(cont);
      host.appendChild(el('p', 'title-note', describe(last)));
      first = cont;
    }

    const start = el('button', 'title-btn', 'New game');
    start.type = 'button';
    start.addEventListener('click', () => c.onStart(newGameHref()));
    host.appendChild(start);
    if (!last) {
      host.appendChild(el('p', 'title-note', 'A new garden. Sixty tiles square, and nothing on it yet.'));
      first = start;
    }

    // Only worth a door when there is more than one room behind it.
    if (rows.length > 1 || (rows.length === 1 && !last)) {
      const more = el('button', 'title-btn title-btn-small', 'Gardens');
      more.type = 'button';
      more.addEventListener('click', () => c.buildGardens(host, { ...c, now: Date.now() }));
      host.appendChild(more);
    }

    // THE MODE SWITCH — BACKLOG §4i, the owner's "same game just different".
    //
    // It sits BELOW Continue and New game and above the credit, because it is
    // not a way to start the game: it is a statement about the shape of the
    // screen, and it applies to whichever of the two you then press. Putting it
    // level with them would offer the player three doors when there are two.
    //
    // The label names the DESTINATION, not the current state. "Play on a phone"
    // is a thing you can do; "Desktop mode: on" is a thing you have to decode.
    const other = IS_MOBILE ? DEFAULT_MODE : 'mobile';
    const swap = el(
      'button',
      'title-btn title-btn-small title-mode',
      IS_MOBILE ? 'Play on a computer' : 'Play on a phone'
    );
    swap.type = 'button';
    swap.addEventListener('click', () => c.onStart(modeHref(other, c.search)));
    host.appendChild(swap);

    // The nudge, and only a nudge. See `looksLikePhone` for why this never
    // redirects on its own.
    if (!IS_MOBILE && looksLikePhone()) {
      host.appendChild(el('p', 'title-note', 'This screen is narrower than the garden. The phone layout will fit it.'));
    } else if (IS_MOBILE) {
      host.appendChild(el('p', 'title-note', 'Taller, narrower, and the tools are under your thumb.'));
    }

    // The music is the owner's own track, made with Suno, and licensed
    // SEPARATELY from the code. The README has always said so; a front door is
    // the honest place for it to be visible to someone who never reads a repo.
    host.appendChild(el('p', 'title-credit', 'Music by the author · non-commercial · code and audio licensed separately'));

    try { (first || start).focus({ preventScroll: true }); } catch (_) {}
  }

  buildMain(menu, ctx);
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
  // on the thing the player most likely came back for. `buildMain` chooses
  // which that is — Continue when there is a garden, New game when there is
  // not — and focuses it again on every panel change, which is what keeps the
  // keyboard working across Gardens and Back.
  try {
    const f = menu.querySelector('button');
    if (f) f.focus({ preventScroll: true });
  } catch (_) {}

  return {
    el: root,
    /** For tests and for a host that wants to drive the panel itself. */
    showGardens() {
      buildGardens(menu, { ...ctx, now: Date.now() });
    },
    remove() {
      try { root.remove(); } catch (_) {}
    },
  };
}
