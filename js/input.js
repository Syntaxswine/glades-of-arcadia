// input.js — pointer, keyboard and camera for Arcadia.
//
// OWNS: pointer -> tile mapping, camera pan (drag / arrow keys / edge scroll),
// placement, drag-to-paint for ground, removal, THE TERRAIN TOOLS (raise /
// lower / level), Esc, and Ctrl+Z.
//
// This module also owns two projection helpers (`tileToScreen`,
// `tileFromScreen`) that ui.js imports. They are a deliberate, tiny duplicate
// of `js/iso.js` so that ui.js and input.js come up with no hard dependency on
// a module owned by another author. When a renderer IS present its own
// `pickTile()` is used instead, because it knows the snapped camera it actually
// drew with, and picking must agree with the frame to the pixel.
//
// ---------------------------------------------------------------------------
// PICKING IS ELEVATION-AWARE, AND THIS FILE DOES NOT DO THE MATHS
// ---------------------------------------------------------------------------
// Once tiles have heights (docs/ELEVATION.md) the flat inverse projection is no
// longer the hit test. A raised tile's top diamond is drawn `level * LEVEL_H`
// pixels HIGHER than where the flat inverse says it is, so a click near the foot
// of a terrace lands on the tile behind the one the player is looking at, and a
// cliff face covers tiles that the flat test happily picks through.
//
// The honest fix is to walk the terrain columns front-to-back and take the first
// tile whose top diamond contains the point. That walk needs to know the drawn
// heights and the exact snapped camera, so it belongs to the projection and the
// renderer — NOT here. This file ASKS, in this order, and re-derives nothing:
//
//   1. `renderer.pickTile(clientX, clientY)` — best answer available, because
//      the renderer picks against the frame it actually drew, heights and all.
//   2. an elevation-aware picker exported by js/iso.js. Any one of the names in
//      ISO_PICKERS satisfies it; the contract asked for is
//
//          pick(sx, sy, cam, { levelAt, mapW, mapH }) -> { tx, ty, level? }
//
//      where `levelAt(tx, ty)` is supplied by us from world.js. `sx, sy` are
//      logical canvas pixels; a null return means "off the map".
//   3. `iso.tileAt` / the local flat inverse — correct on flat ground, and a
//      completely flat glade is what a new garden is.
//
// Falling back is not a silent wrong answer: on flat terrain (every tile at
// level 0) every one of those three agrees to the pixel, and the fallback only
// degrades as the player builds terraces, which is exactly when the elevation-
// aware picker will have arrived.
//
// ---------------------------------------------------------------------------
// THE TERRAIN TOOLS
// ---------------------------------------------------------------------------
// Three verbs, click-and-drag over a rectangle, on the same 64-step undo stack
// as everything else:
//
//   raise   the region goes up one level
//   lower   the region goes down one level
//   level   the region flattens to the height of the tile the drag STARTED on
//
// Terrain editing is free, unlimited and reversible. SPEC §0 is absolute: there
// is no terraforming cost and there never will be, so nothing in this file
// counts anything, checks a budget, or asks the player to confirm.
//
// A drag applies ONCE, on release, so a whole dragged terrace is a single undo
// step rather than forty. Right-dragging inverts raise and lower, which is the
// gesture every builder player already has in their hands.
//
// ---------------------------------------------------------------------------
// THE THING THAT IS EASY TO GET WRONG — and the half-tile that WAS wrong here
// ---------------------------------------------------------------------------
// Forward projection (SPEC §2) maps a tile index to the diamond's NORTH VERTEX,
// which is the top-CENTRE of its 64x32 bounding box, not the top-left:
//
//     sx = (tx - ty) * 32 - ox        // the north vertex
//     sy = (tx + ty) * 16 - oy
//
// The diamond occupies [sx-32, sx+32] x [sy, sy+32]; its centre — the pixel a
// sprite's anchor sits on — is (sx, sy + 16). MEASURED, not assumed: painting a
// single tile at (6,6) with the camera at (-288, 163) changes exactly the
// pixels x 256..319, y 29..60, and toScreen(6,6) is (288, 29).
//
// This file originally read that sx as the bounding box's LEFT edge, concluded
// that flooring the raw inverse would land half a tile out, and shifted the
// pointer by TILE_W/2 before flooring to "fix" it. The premise was wrong, so
// the fix WAS the bug: every click placed one tile to the left of the cursor.
// It survived review because the shift is self-consistent — the ghost drew at
// the same wrong tile the click placed at, so nothing ever disagreed with
// itself. It only shows up against the drawn terrain, or against render.js's
// pickTile, which had it right. SPEC §2's inverse is used verbatim now:
//
//     tx = ((sx + ox)/32 + (sy + oy)/16) / 2
//     ty = ((sy + oy)/16 - (sx + ox)/32) / 2
//
// The test suite holds it: for every tile, the tile's CENTRE must map back to
// that tile, and so must the centre ±15px horizontally and ±7px vertically.
//
// Screen pixels are 1x/2x/3x logical pixels. Pointer positions are divided back
// into logical space with the canvas backing size over its rendered CSS box,
// which is exact at any integer scale and does not care who set the scale.

import * as iso from './iso.js';

export const TILE_W = 64;
export const TILE_H = 32;
// RE-EXPORTED, NOT RE-DECLARED — js/iso.js owns the logical screen. This file
// used to carry its own 640 x 400, as did ui.js and main.js; see iso.js
// §VIEW_W for why four copies that agree is still the wrong shape.
export const LOGICAL_W = iso.VIEW_W;
export const LOGICAL_H = iso.VIEW_H;

/**
 * The elevation range, for the preview-mode fallback ONLY. js/world.js is the
 * authority and exports the same pair; these are not imported from it because
 * input.js is deliberately driven by an INJECTED world and must still come up
 * if that module is missing or failed to load. If they ever disagree the world
 * wins, and the only symptom is a ghost that guesses conservatively.
 */
export const MIN_LEVEL = 0;
/** iso.js's ceiling, imported rather than re-typed — see the module header. */
export const MAX_LEVEL = iso.MAX_LEVEL;

/** The three terrain verbs, in the order a toolbar should show them. */
export const TERRAIN_TOOLS = Object.freeze(['raise', 'lower', 'level']);
const TERRAIN_SET = new Set(TERRAIN_TOOLS);

/** What the tool says it is doing, for the status line and for announce(). */
const TERRAIN_VERB = Object.freeze({
  raise: 'Raised',
  lower: 'Lowered',
  level: 'Levelled',
});

/**
 * The elevation-aware pickers js/iso.js exports, most specific first.
 *
 *   pickTileAt(sx, sy, cam, { levels, mapW, mapH })
 *       -> { tx, ty, level, face, hit, inBounds }.  ALWAYS answers: `hit` false
 *          with `inBounds` true means the point is over the map but not over any
 *          tile's top face, and `inBounds` false means genuinely off the map.
 *   pickColumn(...)  the same walk, but null instead of a fallback answer.
 *
 * The rest of the list is name-tolerance, kept because the exact spelling is
 * another author's to choose and a picker that quietly stops being found is the
 * silent-wrong-click bug this whole file is most afraid of.
 *
 * `iso.tileAt` is last: it is the FLAT picker, correct only while the glade is
 * flat, which is exactly the state a new garden starts in.
 */
const ISO_PICKERS = Object.freeze([
  'pickTileAt',
  'pickColumn',
  'pickTileElevated',
  'tileAtElevated',
  'pickElevated',
]);

/**
 * Resolve the picker once, at module load. Returns `{ fn, name, elevated }` —
 * `elevated` false means only the flat one was found.
 */
function resolveIsoPicker() {
  for (const name of ISO_PICKERS) {
    if (typeof iso[name] === 'function') return { fn: iso[name], name, elevated: true };
  }
  if (typeof iso.tileAt === 'function') return { fn: iso.tileAt, name: 'tileAt', elevated: false };
  return null;
}

const ISO_PICK = resolveIsoPicker();

/** True when picking currently accounts for terrain height. Exposed for tests. */
export function pickingIsElevationAware(renderer) {
  if (renderer && typeof renderer.pickTile === 'function') return true;
  return !!(ISO_PICK && ISO_PICK.elevated);
}

/**
 * Tile index -> the diamond's NORTH VERTEX, in screen (logical) px. To blit a
 * 64x32 tile bitmap, draw it at (x - TILE_W/2, y).
 */
export function tileToScreen(tx, ty, cam = { ox: 0, oy: 0 }) {
  return {
    x: (tx - ty) * (TILE_W / 2) - (cam.ox || 0),
    y: (tx + ty) * (TILE_H / 2) - (cam.oy || 0),
  };
}

/** Centre point of a tile (the pixel a sprite anchor sits on). */
export function tileCentre(tx, ty, cam) {
  const p = tileToScreen(tx, ty, cam);
  return { x: p.x, y: p.y + TILE_H / 2 };
}

/** Screen (logical) px -> fractional tile coordinates. SPEC §2, verbatim. */
export function tileFromScreen(px, py, cam = { ox: 0, oy: 0 }) {
  const a = (px + (cam.ox || 0)) / (TILE_W / 2);
  const b = (py + (cam.oy || 0)) / (TILE_H / 2);
  return { tx: (a + b) / 2, ty: (b - a) / 2 };
}

/** Screen (logical) px -> integer tile index. */
export function tileAtScreen(px, py, cam) {
  const f = tileFromScreen(px, py, cam);
  return { tx: Math.floor(f.tx), ty: Math.floor(f.ty) };
}

/** The rectangle the whole map occupies in world px, for camera clamping. */
export function mapBounds(mw, mh) {
  const minX = (0 - (mh - 1)) * (TILE_W / 2);
  const maxX = (mw - 1) * (TILE_W / 2) + TILE_W;
  return { x: minX, y: 0, w: maxX - minX, h: (mw - 1 + mh - 1) * (TILE_H / 2) + TILE_H };
}

const PAN_KEY_SPEED = 260; // logical px / second
const PAN_EDGE_SPEED = 220;
const EDGE_MARGIN = 10; // logical px from the viewport edge
const DRAG_SLOP = 3; // logical px before a press counts as a drag
const INTERNAL = Symbol('internal-tick');

// ---------------------------------------------------------------------------
// TWO FINGERS
// ---------------------------------------------------------------------------
//
// The arithmetic of a two-finger gesture, as pure functions, so the decisions
// can be tested in Node where there is no such thing as a finger. Only the
// plumbing below them touches the DOM.
//
// WHY TWO-FINGER PAN EXISTS AT ALL, given the move tool already pans: because
// the move tool costs you a TRIP TO THE TOOLBAR. One finger has to mean "use
// the thing I am holding" — that is how you plant a hedge — so a player with a
// hedge in their hand who wants to see somewhere else must put the hedge down,
// pan, and pick it up again. Two fingers is the gesture every map on a phone
// already has, and it means "move the map" no matter what is in your hand.
//
// It is ADDITIVE. The move tool keeps working exactly as it did, and on a
// desktop mouse there is never a second pointer, so none of this can fire.

/** How far the fingers must separate or close before it counts as a pinch. */
export const PINCH_TRIGGER = 40;

/** The centroid and separation of two points. */
export function twoFinger(a, b) {
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
    dist: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

/**
 * Has this pinch travelled far enough to mean something, and which way?
 *
 * `'in'` — fingers CLOSED. Read as "show me everything", because that is what
 * closing your fingers on a map means everywhere else: zoom out, see the whole
 * thing. `'out'` — fingers OPENED: back to the garden.
 *
 * `null` until the trigger, so a two-finger PAN — where the separation wobbles
 * by a few pixels because hands are not machines — never accidentally opens the
 * overview mid-drag. 40 logical pixels is comfortably more than that wobble and
 * comfortably less than a deliberate pinch.
 */
export function pinchVerdict(startDist, dist, trigger = PINCH_TRIGGER) {
  const d = dist - startDist;
  if (d <= -trigger) return 'in';
  if (d >= trigger) return 'out';
  return null;
}

/**
 * createInput(opts) -> input
 *
 * main.js constructs this as
 *   { canvas, game, world, fields, creatures, catalog, renderer, ui, audio }
 * and drives it with `input.update(dt, game)`. The extra options are for
 * standalone use:
 *
 *   canvas     the 640x400 canvas (required). Default `#screen`.
 *   ui         the object from createUI(). Every call into it is guarded.
 *   world      world.js instance:
 *                canPlace(idOrDef, tx, ty) -> { ok, reason } (or a boolean)
 *                place(idOrDef, tx, ty)    -> object | tiles | null
 *                removeAt(tx, ty)          -> object | null
 *                objectAt(tx, ty)          -> object | null
 *                undo() / redo()
 *   renderer   render.js instance. When present it owns the camera
 *              (dragBy/panBy/centreOnTile) and the picking (pickTile).
 *   game       main.js's game object; `game.undo()` and `game.markDirty()`.
 *   camera     an explicit { ox, oy } to drive instead. Exposed as
 *              `input.camera` when no renderer is present.
 *   map        { w, h } tile extent. Default 20x20 (SPEC §2).
 *   on         { place, remove, undo, redo, hover, cancel } overrides.
 *   selfDrive  default true: run an internal rAF for smooth key/edge pan. The
 *              first EXTERNAL `update(dt)` call turns it off automatically, so
 *              a host with its own loop never double-pans.
 */
export function createInput(opts = {}) {
  const game = opts.game || null;
  const canvas = opts.canvas || (game && game.canvas) || document.getElementById('screen');
  if (!canvas) throw new Error('createInput: no canvas');

  const ui = opts.ui || (game && game.ui) || null;
  const world = opts.world || (game && game.world) || null;
  const renderer = opts.renderer || (game && game.renderer) || null;
  const on = opts.on || {};
  // The minimap, if the host built one. Optional: preview mode and the tests
  // run without it and must keep working.
  const minimap = opts.minimap || (game && game.minimap) || null;
  // Defaulted from iso.js rather than re-typed. A hard-coded 20 here was the
  // shape of an old bug — see docs/TITLE-AND-CONTROLS.md, "Growing the map".
  const map = { w: iso.MAP_W, h: iso.MAP_H, ...(opts.map || {}) };

  // The camera is the renderer's when there is one — it eases, it clamps, and
  // it is the camera the frame was actually drawn with. The local one is for
  // preview mode and for tests.
  const localCam = opts.camera || { ox: 0, oy: 0 };
  const hasRendererCam = !!(renderer && typeof renderer.dragBy === 'function');

  const keys = new Set();
  const state = {
    pointerIn: false,
    px: 0, // logical px in canvas space
    py: 0,
    lastX: 0,
    lastY: 0,
    tx: 0,
    ty: 0,
    button: -1,
    dragging: false,
    panning: false,
    painting: false,
    moved: 0,
    lastPaint: null,
    downX: 0,
    downY: 0,
    keyCursor: null,
    /**
     * Which way round each placeable was last turned, by id. Per placeable and
     * not global: turning the hedge and then picking up a bench must not hand
     * you a bench somebody else already turned.
     */
    facings: new Map(),
    /** The live terrain drag: { op, x0, y0, x1, y1 } or null. */
    terrain: null,
    /** Every pointer currently down, by id. One entry is a mouse or a finger. */
    touches: new Map(),
    /** The live two-finger gesture: { startDist, cx, cy, fired } or null. */
    gesture: null,
    /**
     * A touch press that has not been allowed to place anything yet: the tile
     * it landed on, or null. See the long note at the paint branch in
     * `onPointerDown` — this is what lets a second finger cancel a placement
     * that a mouse would already have committed.
     */
    pending: null,
    /**
     * Set while a gesture is running and NOT cleared until every finger is up.
     *
     * This is the whole difference between a two-finger pan that works and one
     * that plants a tree when you let go. Fingers do not leave the glass
     * together: one lifts, and for a moment there is a single pointer down in
     * the middle of the map, indistinguishable from a press. Without this the
     * remaining finger becomes a fresh drag, and its release becomes a click.
     */
    suppress: false,
    lastSaid: null,
    disposed: false,
  };

  const reduced =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- camera --

  function viewRect() {
    return (ui && typeof ui.viewport === 'function' && ui.viewport()) || {
      x: 0,
      y: 0,
      w: LOGICAL_W,
      h: LOGICAL_H,
    };
  }

  /** The camera as { ox, oy }, whoever owns it. */
  function camOf() {
    if (renderer && renderer.camera) {
      const c = renderer.camera;
      return { ox: c.x ?? c.ox ?? 0, oy: c.y ?? c.oy ?? 0 };
    }
    return localCam;
  }

  function clampLocal() {
    const b = mapBounds(map.w, map.h);
    const v = viewRect();
    const minOx = b.x - v.x;
    const maxOx = b.x + b.w - (v.x + v.w);
    const minOy = b.y - v.y;
    const maxOy = b.y + b.h - (v.y + v.h);
    localCam.ox = b.w <= v.w ? (minOx + maxOx) / 2 : Math.max(minOx, Math.min(maxOx, localCam.ox));
    localCam.oy = b.h <= v.h ? (minOy + maxOy) / 2 : Math.max(minOy, Math.min(maxOy, localCam.oy));
    // Whole logical pixels only: a fractional camera puts every sprite in the
    // scene on a half pixel, which is the loudest non-period tell there is.
    localCam.ox = Math.round(localCam.ox);
    localCam.oy = Math.round(localCam.oy);
  }

  /** Eased pan — keys and edge scroll. */
  function panBy(dx, dy) {
    if (!dx && !dy) return;
    if (hasRendererCam) {
      renderer.panBy(dx, dy);
    } else {
      localCam.ox += dx;
      localCam.oy += dy;
      clampLocal();
    }
    refreshGhost();
  }

  /** Unsmoothed pan — a drag must keep the map under the pointer. */
  function dragBy(dx, dy) {
    if (!dx && !dy) return;
    if (hasRendererCam) {
      renderer.dragBy(dx, dy);
    } else {
      localCam.ox += dx;
      localCam.oy += dy;
      clampLocal();
    }
  }

  function centreOn(tx, ty) {
    if (renderer && typeof renderer.centreOnTile === 'function') {
      renderer.centreOnTile(tx, ty, true);
      return;
    }
    const c = tileCentre(tx, ty, { ox: 0, oy: 0 });
    const v = viewRect();
    localCam.ox = c.x - (v.x + v.w / 2);
    localCam.oy = c.y - (v.y + v.h / 2);
    clampLocal();
  }

  // ------------------------------------------------------------ coordinates --

  /** Client px -> logical canvas px. Correct at any scale and any DPR. */
  function toLogical(ev) {
    const r = canvas.getBoundingClientRect();
    const sx = r.width ? canvas.width / r.width : 1;
    const sy = r.height ? canvas.height / r.height : 1;
    return { x: (ev.clientX - r.left) * sx, y: (ev.clientY - r.top) * sy };
  }

  /** Tile height, straight from world.js. Flat 0 when there is no world yet. */
  function levelAt(tx, ty) {
    if (world && typeof world.levelAt === 'function') {
      const l = world.levelAt(tx, ty);
      return Number.isFinite(l) ? l : 0;
    }
    if (typeof opts.levelAt === 'function') return opts.levelAt(tx, ty) || 0;
    return 0;
  }

  /**
   * Ask js/iso.js. Two call shapes are attempted because the elevation-aware
   * picker is another author's to name and to sign: the opts-bag shape this
   * file's header asks for, then the positional `(sx, sy, cam, mapW, mapH)`
   * shape `iso.tileAt` already uses. A throw or a nonsense answer from either
   * falls through rather than propagating — a picker that is not there yet must
   * never be able to break a click.
   */
  function pickViaIso(px, py, cam) {
    if (!ISO_PICK) return null;
    // `levels` is iso.js's own key and takes a reader function; the aliases cost
    // nothing and make a differently-named opts bag work too.
    const bag = {
      levels: levelAt,
      levelAt,
      mapW: map.w,
      mapH: map.h,
      w: map.w,
      h: map.h,
    };
    const shapes = ISO_PICK.elevated
      ? [[px, py, cam, bag], [px, py, cam, map.w, map.h]]
      : [[px, py, cam, map.w, map.h]];
    for (const args of shapes) {
      let t;
      try {
        t = ISO_PICK.fn(...args);
      } catch (_) {
        continue;
      }
      if (!t || !Number.isFinite(t.tx) || !Number.isFinite(t.ty)) continue;
      const tx = Math.floor(t.tx);
      const ty = Math.floor(t.ty);
      // An explicit `inBounds: false` is a real answer — "off the map" — and is
      // passed straight through so the ghost hides, rather than being treated as
      // a failure and retried with a shape that would answer differently.
      if (t.inBounds === false) return { tx, ty, level: 0, offMap: true };
      if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) continue;
      return { tx, ty, level: Number.isFinite(t.level) ? t.level : levelAt(tx, ty) };
    }
    return null;
  }

  /**
   * The camera the frame was DRAWN with. The renderer snaps its camera to whole
   * logical pixels before drawing (a fractional camera puts every sprite on a
   * half pixel), so picking against the eased, unsnapped value would disagree
   * with the picture by up to half a pixel. Rounding is the whole of the fix and
   * is not elevation maths.
   */
  function drawnCam() {
    const c = camOf();
    return hasRendererCam ? { ox: Math.round(c.ox), oy: Math.round(c.oy) } : c;
  }

  /**
   * Client px -> tile, ELEVATION-AWARE.
   *
   * Order of preference, and the reason for it: use the answer that ACCOUNTS
   * FOR HEIGHT. The renderer's own pick is the best of all — it picks against
   * the exact frame it drew — but only once it walks the terrain columns, and
   * it tells us it does by returning a `level`. A renderer whose pick is still
   * the flat inverse is worse than iso.js's elevated picker, so it loses.
   *
   * On a flat map every one of these agrees to the pixel (js/iso.js's own test
   * suite proves the elevated pick IS the flat inverse when every level is 0),
   * so the ordering can only ever help and can never introduce a disagreement
   * where there was none.
   *
   * The renderer's `scale` is checked against the canvas box first: a stale
   * scale there would put every click a long way out, and a silently wrong
   * click is the worst bug this file can have.
   *
   * NOTHING HERE RE-DERIVES THE HEIGHT MATHS. See the module header.
   */
  function pick(ev) {
    let rendererAnswer = null;
    if (renderer && typeof renderer.pickTile === 'function') {
      const box = canvas.getBoundingClientRect();
      const boxScale = box.width ? box.width / LOGICAL_W : 1;
      if (Math.abs((renderer.scale || 1) - boxScale) < 0.01) {
        const t = renderer.pickTile(ev.clientX, ev.clientY);
        if (t && Number.isFinite(t.tx)) {
          const tx = Math.floor(t.tx);
          const ty = Math.floor(t.ty);
          // A `level` on the answer means the renderer walked the columns.
          if (Number.isFinite(t.level)) return { tx, ty, level: t.level };
          rendererAnswer = { tx, ty, level: levelAt(tx, ty) };
        }
      }
    }

    const p = toLogical(ev);
    const cam = drawnCam();
    if (ISO_PICK && ISO_PICK.elevated) {
      const viaIso = pickViaIso(p.x, p.y, cam);
      if (viaIso) return viaIso;
    }
    if (rendererAnswer) return rendererAnswer;
    const viaIsoFlat = pickViaIso(p.x, p.y, cam);
    if (viaIsoFlat) return viaIsoFlat;
    const flat = tileAtScreen(p.x, p.y, cam);
    return { ...flat, level: levelAt(flat.tx, flat.ty) };
  }

  function inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < map.w && ty < map.h;
  }

  function footprintOf(item) {
    const f = (item && item.footprint) || [1, 1];
    return { w: (f[0] | 0) || 1, h: (f[1] | 0) || 1 };
  }

  /**
   * Ground painters are the only thing that drags. world.js marks them with a
   * `ground` key; the catalogue's `ground` group is the same set by another
   * name, and either is enough.
   */
  function paintable(item) {
    return !!item && (item.ground != null || item.group === 'ground' || item.paintable === true);
  }

  // ------------------------------------------------------- placement legality

  /**
   * Is this placeable a connector — a ramp, a stair, a scramble, a stepped
   * retaining wall? Recognised from any honest signal, because js/catalog.js is
   * another author's file and the marking there is theirs to choose. World.js
   * carries the same list; when a world is present its answer is the one used.
   */
  const CONNECTOR_IDS = new Set([
    'earth-ramp',
    'stone-stair',
    'rock-scramble',
    'stepped-terrace-wall',
    'terrace-steps',
  ]);
  function isConnector(item) {
    if (!item) return false;
    if (item.connector) return true;
    if (item.group === 'connector') return true;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    if (tags.includes('connector') || tags.includes('ramp') || tags.includes('stair')) return true;
    return CONNECTOR_IDS.has(item.id);
  }

  /**
   * THE TWO ELEVATION PLACEMENT RULES, as this file states them to the player:
   *
   *   1. A CONNECTOR MAY ONLY BRIDGE EXACTLY ONE LEVEL. That is what "1 up,
   *      1 over" means. A two-level cliff wants two flights and a landing
   *      between them, which is what a terraced garden actually looks like.
   *   2. EVERYTHING ELSE NEEDS A FLAT FOOTPRINT. A 1x1 is flat by definition,
   *      so this only ever bites a multi-tile object: a colonnade with one end
   *      a terrace below the other is not a colonnade.
   *
   * world.js is the authority and enforces both; this is the copy used when
   * input is driven WITHOUT a world (preview mode, tests), and it exists so the
   * ghost never goes green on ground the world would refuse. Both give the same
   * warm reason, because the player reads the reason, not the rule.
   */
  function elevationLegality(item, tx, ty) {
    const f = footprintOf(item);
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const l = levelAt(tx + x, ty + y);
        if (l < min) min = l;
        if (l > max) max = l;
      }
    }
    if (!Number.isFinite(min)) return { ok: true, reason: null };

    if (isConnector(item)) {
      if (f.w * f.h > 1) {
        const rise = max - min;
        if (rise === 1) return { ok: true, reason: null };
        if (rise === 0) {
          return { ok: false, reason: 'this ground is already level — steps need a step to climb' };
        }
        return {
          ok: false,
          reason: `that is ${rise} levels; steps climb one at a time — terrace it, then run two flights`,
        };
      }
      let worst = 0;
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        if (!inBounds(tx + dx, ty + dy)) continue;
        const rise = Math.abs(levelAt(tx + dx, ty + dy) - min);
        if (rise === 1) return { ok: true, reason: null };
        if (rise > worst) worst = rise;
      }
      if (worst === 0) {
        return { ok: false, reason: 'nothing to climb here — steps want a step beside them' };
      }
      return {
        ok: false,
        reason: `that cliff is ${worst} levels; steps climb one at a time — terrace it, then run two flights`,
      };
    }

    if (min !== max && item.flatFooting !== false) {
      return { ok: false, reason: 'the ground under that is not level — flatten it first' };
    }
    return { ok: true, reason: null };
  }

  /** { ok, reason } for placing `item` at a tile. world.js owns the reasons. */
  function legality(item, tx, ty) {
    if (!item) return { ok: false, reason: null };
    const f = footprintOf(item);
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        if (!inBounds(tx + x, ty + y)) {
          return { ok: false, reason: 'that runs off the edge of the glade' };
        }
      }
    }
    let r;
    if (typeof opts.canPlace === 'function') r = opts.canPlace(item.id, tx, ty);
    else if (world && typeof world.canPlace === 'function') r = world.canPlace(item.id, tx, ty);
    else return elevationLegality(item, tx, ty);
    if (r && typeof r === 'object') return { ok: !!r.ok, reason: r.reason || null };
    return { ok: !!r, reason: null };
  }

  /**
   * SAY WHY, don't just refuse. A red ghost tells the player "no"; it does not
   * tell them "flatten it first", and the difference between those two is the
   * difference between a cosy builder and a fussy one (SPEC §8).
   *
   * Deduped against the last thing said, so dragging along a cliff repeats the
   * reason once rather than forty times.
   */
  function explain(reason) {
    if (!reason) return;
    if (state.lastSaid === reason) return;
    state.lastSaid = reason;
    if (ui && typeof ui.say === 'function') ui.say(reason);
    else if (ui && typeof ui.announce === 'function') ui.announce(reason);
  }

  function hasSomething(tx, ty) {
    if (!world || typeof world.objectAt !== 'function') return true;
    return !!world.objectAt(tx, ty);
  }

  // --------------------------------------------------------------- the ghost --

  /** The current tool, whichever of the five it is. */
  function toolNow() {
    return (ui && ui.tool && ui.tool()) || 'place';
  }

  /** The rectangle a live terrain drag covers, or the single hovered tile. */
  // -------------------------------------------------------------- the brush --
  //
  // The owner: *"it would be nice if you could change the size of your
  // selection like changing the size of your brush in a painting application
  // ... this is especially useful for hills."*
  //
  // ui.js owns the number (see its §THE BRUSH); this file is what makes a
  // number mean something. The whole mechanism is one idea:
  //
  //   THE BRUSH IS THE WIDTH OF THE STROKE.
  //
  // The terrain tools already drag a rectangle, so a brush of n does not add a
  // second concept — it thickens that rectangle by n-1, which is exactly what
  // a wide brush does to a stroke in any paint program. A press with no drag
  // is then an n x n square for free, and that is the case the owner asked for.
  //
  // IT GROWS TOWARD +tx / +ty, which is down-right and down-left on screen —
  // the same corner every multi-tile placeable in the catalogue already anchors
  // at. A brush that grew from the centre would be a SECOND anchoring rule, and
  // the 2x2 path under the cursor would sit somewhere the 3x3 brush did not.

  /** Tiles a side. ui.js is the owner; a host without one gets a single tile. */
  function brushSize() {
    const n = ui && typeof ui.brush === 'function' ? ui.brush() : 1;
    return Number.isFinite(n) && n >= 1 ? Math.min(9, Math.round(n)) : 1;
  }

  /**
   * Does the brush apply to this placeable? Only to one-tile ones, which is the
   * owner's own scoping — *"the easiest way to implement it is to make it work
   * on any one tile placements"* — and it is also the right line. A 2x2 path
   * repeated on a 3x3 brush would overlap itself six ways and the player could
   * not predict which nine of the sixteen tiles they were about to cover.
   */
  function brushable(item) {
    const f = footprintOf(item);
    return f.w === 1 && f.h === 1;
  }

  /** Every tile a brush of `n` covers from an anchor, in painter's order. */
  function brushTiles(tx, ty, n) {
    const out = [];
    for (let dy = 0; dy < n; dy++) {
      for (let dx = 0; dx < n; dx++) {
        if (inBounds(tx + dx, ty + dy)) out.push([tx + dx, ty + dy]);
      }
    }
    return out;
  }

  /** A region thickened by the brush — the stroke, rather than its centre line. */
  function withBrush(r) {
    const n = brushSize();
    if (n <= 1) return r;
    return {
      ...r,
      x0: Math.min(r.x0, r.x1),
      y0: Math.min(r.y0, r.y1),
      x1: Math.min(map.w - 1, Math.max(r.x0, r.x1) + n - 1),
      y1: Math.min(map.h - 1, Math.max(r.y0, r.y1) + n - 1),
    };
  }

  function terrainRegion(tx, ty) {
    const t = state.terrain;
    if (!t) return withBrush({ op: null, x0: tx, y0: ty, x1: tx, y1: ty });
    return withBrush({ op: t.op, x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 });
  }

  // ------------------------------------------------------------------ facing --
  //
  // The owner: "there are a few tiles that you should be able to alter the
  // direction on. Currently the middle scroll wheel scrolls up and down the
  // map, I think it would be better suited to pick between what direction an
  // object faces in space."
  //
  // Right on both halves. The wheel was barely earning its keep as a pan —
  // there are now four other ways to pan, and one of them is a whole tool —
  // and rotation is the thing an isometric builder always binds.
  //
  // FACING IS PER PLACEABLE, NOT GLOBAL. Turning the hedge and then picking up
  // a bench should not hand you a bench somebody else already turned; the
  // player's mental model is that each thing remembers how they last placed
  // it, which is also how every builder of the period behaved.

  /** How many ways round this may be placed. 1 means the wheel does nothing. */
  function facingsOf(item) {
    const n = item && item.facings;
    return Number.isFinite(n) && n > 1 ? Math.round(n) : 1;
  }

  /** The facing this placeable was last turned to. */
  function facingFor(item) {
    if (!item) return 0;
    const n = facingsOf(item);
    if (n <= 1) return 0;
    return state.facings.get(item.id) || 0;
  }

  /**
   * Turn the selection. Returns false when there is nothing to turn, so the
   * caller can fall through to panning — a wheel that silently did nothing
   * over a column would read as a broken wheel, not as a column that has no
   * sides.
   */
  function turnBy(delta) {
    const item = (ui && ui.selection && ui.selection()) || null;
    const n = facingsOf(item);
    if (!item || n <= 1) return false;
    const next = (((facingFor(item) + delta) % n) + n) % n;
    state.facings.set(item.id, next);
    refreshGhost();
    if (ui && ui.announce) ui.announce(`${item.name || item.id} facing ${next + 1} of ${n}`);
    return true;
  }

  // --------------------------------------------------------------- the ghost --

  function refreshGhost() {
    if (!ui || typeof ui.setGhost !== 'function') return;
    const overUI = state.pointerIn && ui.blocks && ui.blocks(state.px, state.py);
    const cursor = state.keyCursor;
    const tx = cursor ? cursor.tx : state.tx;
    const ty = cursor ? cursor.ty : state.ty;
    const visible = (cursor != null || (state.pointerIn && !overUI)) && inBounds(tx, ty);
    if (!visible) {
      ui.setGhost(null);
      return;
    }
    const tool = toolNow();

    // The terrain preview. It carries `mode:'terrain'` plus a plain
    // tx/ty/w/h/legal rectangle, so a ui.js that has never heard of the terrain
    // tools still draws the right box in the right colour instead of nothing.
    if (TERRAIN_SET.has(tool)) {
      const r = terrainRegion(tx, ty);
      const op = r.op || tool;
      const x0 = Math.min(r.x0, r.x1);
      const y0 = Math.min(r.y0, r.y1);
      const x1 = Math.max(r.x0, r.x1);
      const y1 = Math.max(r.y0, r.y1);
      const check = previewTerrain(op, r);
      ui.setGhost({
        mode: 'terrain',
        op,
        tx: x0,
        ty: y0,
        w: x1 - x0 + 1,
        h: y1 - y0 + 1,
        anchor: { tx: r.x0, ty: r.y0 },
        level: levelAt(r.x0, r.y0),
        legal: check.ok,
        reason: check.reason,
      });
      return;
    }

    if (tool === 'raze') {
      const n = brushSize();
      // Legal if there is anything at all under the stroke. Asking for ALL of
      // it would grey out the ordinary case of clearing a patch with one thing
      // in it, which is the case the brush is for.
      const any = brushTiles(tx, ty, n).some(([x, y]) => hasSomething(x, y));
      ui.setGhost({ mode: 'raze', tx, ty, w: n, h: n, legal: any });
      return;
    }
    const item = (ui.selection && ui.selection()) || null;
    if (!item) {
      ui.setGhost(null);
      return;
    }
    const f = footprintOf(item);
    const n = brushSize();
    const wide = n > 1 && brushable(item);
    const l = legality(item, tx, ty);
    // A wide stroke is legal if ANY tile under it will take the thing — the
    // same rule the placement itself uses, so the preview cannot promise
    // something the click then refuses, or refuse something it would have done.
    const anywhere = wide
      ? brushTiles(tx, ty, n).some(([x, y]) => legality(item, x, y).ok)
      : l.ok;
    ui.setGhost({
      mode: 'place',
      id: item.id,
      tx,
      ty,
      w: wide ? n : f.w,
      h: wide ? n : f.h,
      legal: anywhere,
      reason: anywhere ? null : l.reason,
      facing: facingFor(item),
    });
  }

  // ------------------------------------------------------------------ actions --

  function touched() {
    if (game && typeof game.markDirty === 'function') game.markDirty();
    if (renderer) {
      if (typeof renderer.invalidateTerrain === 'function') renderer.invalidateTerrain();
      if (typeof renderer.invalidateFields === 'function') renderer.invalidateFields();
      if (typeof renderer.requestDraw === 'function') renderer.requestDraw();
    }
  }

  function doPlace(tx, ty) {
    const item = (ui && ui.selection && ui.selection()) || null;
    if (!item) return false;

    // THE BRUSH, for placement. A stroke lays the same thing on every tile it
    // covers, and it does NOT refuse the whole stroke because one tile in it is
    // occupied — a brush that only works on perfectly empty squares is a brush
    // you cannot use twice in the same place. Each tile is asked separately and
    // the ones that say no are simply not painted, which is what every paint
    // program does at the edge of a mask.
    const n = brushSize();
    if (n > 1 && brushable(item)) {
      const tiles = brushTiles(tx, ty, n);
      let laid = 0;
      let refused = null;
      for (const [x, y] of tiles) {
        const ok = placeOne(item, x, y, true);
        if (ok) laid++;
        else if (!refused) refused = ok;
      }
      // Silence on a partial stroke; the reason only when NOTHING took, which
      // is the only case where the player is owed an explanation.
      if (!laid) explain(legality(item, tx, ty).reason);
      else state.lastSaid = null;
      return laid > 0;
    }
    return placeOne(item, tx, ty, false);
  }

  /** One tile of a placement. `quiet` is true for every tile of a brush. */
  function placeOne(item, tx, ty, quiet) {
    const l = legality(item, tx, ty);
    // A refusal that says nothing is a refusal the player has to guess at. The
    // reason comes from world.js and is already a warm plain-language fragment,
    // so it can go straight to the status line.
    if (!l.ok) {
      if (!quiet) explain(l.reason);
      return false;
    }
    if (!quiet) state.lastSaid = null;
    const facing = facingFor(item);
    let ok;
    if (typeof on.place === 'function') ok = on.place(item.id, tx, ty, item, { facing }) !== false;
    // world.place() routes ground painters into paint() itself, so there is one
    // call site here and no chance of the two drifting apart. `facing` is
    // clamped there against the placeable's own count, so a host that ignores
    // the fifth argument above still cannot produce an illegal facing.
    else if (world && typeof world.place === 'function') ok = !!world.place(item.id, tx, ty, { facing });
    else ok = false;
    if (ok) touched();
    return ok;
  }

  // ------------------------------------------------------------ terrain tools --

  /**
   * Would this terrain op do anything, and if not, why not? world.js answers
   * when it is there — it knows the ceiling, the floor, and that a multi-tile
   * object's whole footprint has to move together. The local answer is a
   * bounds-only estimate for preview mode.
   */
  function previewTerrain(op, r) {
    if (world && typeof world.canTerrain === 'function') {
      const res = world.canTerrain(op, r.x0, r.y0, r.x1, r.y1);
      return { ok: !!(res && res.ok), reason: (res && res.reason) || null };
    }
    if (op === 'level') return { ok: true, reason: null };
    const x0 = Math.min(r.x0, r.x1);
    const y0 = Math.min(r.y0, r.y1);
    const x1 = Math.max(r.x0, r.x1);
    const y1 = Math.max(r.y0, r.y1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!inBounds(x, y)) continue;
        const l = levelAt(x, y);
        if (op === 'raise' && l < MAX_LEVEL) return { ok: true, reason: null };
        if (op === 'lower' && l > MIN_LEVEL) return { ok: true, reason: null };
      }
    }
    return {
      ok: false,
      reason:
        op === 'raise'
          ? 'that is already as high as the glade goes'
          : 'that is already the floor of the glade',
    };
  }

  /**
   * Commit a terrain op. ONE call, ONE undo step, however big the drag was.
   * Free and reversible — there is no cost here and there is nowhere to put one.
   */
  function doTerrain(op, rect) {
    // THE ONE PLACE the brush reaches the world for terrain. Every caller —
    // the drag, the `+`/`-` nudge, the keyboard tool — arrives here with a
    // centre-line rectangle and leaves with a stroke. `terrainRegion` thickens
    // the PREVIEW by the same rule and its output never reaches this function,
    // so the two cannot double up.
    const r = withBrush(rect);
    let res;
    if (typeof on.terrain === 'function') res = on.terrain(op, r);
    else if (world && typeof world.applyTerrain === 'function') {
      res = world.applyTerrain(op, r.x0, r.y0, r.x1, r.y1);
    } else if (world && typeof world[op === 'level' ? 'flatten' : op] === 'function') {
      res = world[op === 'level' ? 'flatten' : op](r.x0, r.y0, r.x1, r.y1);
    } else return false;

    const ok = res === true || (res && res.ok);
    if (ok) {
      state.lastSaid = null;
      touched();
      if (ui && ui.say) ui.say(`${TERRAIN_VERB[op] || 'Changed'}.`);
    } else {
      explain((res && res.reason) || null);
    }
    refreshGhost();
    return !!ok;
  }

  /** One-shot raise/lower of the tile under the cursor — the `+` / `-` keys. */
  function nudgeTerrain(op) {
    const c = state.keyCursor || { tx: state.tx, ty: state.ty };
    if (!inBounds(c.tx, c.ty)) return false;
    return doTerrain(op, { x0: c.tx, y0: c.ty, x1: c.tx, y1: c.ty });
  }

  function doRemove(tx, ty) {
    // Clearing is a one-tile tool like any other, and it is the one you most
    // want wide — undoing a five-square planting one square at a time is the
    // tedium the brush exists to remove.
    const n = brushSize();
    if (n > 1) {
      let cleared = 0;
      for (const [x, y] of brushTiles(tx, ty, n)) if (removeOne(x, y)) cleared++;
      return cleared > 0;
    }
    return removeOne(tx, ty);
  }

  function removeOne(tx, ty) {
    if (!inBounds(tx, ty)) return false;
    let ok;
    if (typeof on.remove === 'function') ok = on.remove(tx, ty) !== false;
    else if (world && typeof world.removeAt === 'function') ok = !!world.removeAt(tx, ty);
    else if (world && typeof world.objectAt === 'function' && typeof world.remove === 'function') {
      const o = world.objectAt(tx, ty);
      ok = o ? !!world.remove(o.uid ?? o.id ?? o) : false;
    } else ok = false;
    if (ok) touched();
    return ok;
  }

  function doUndo() {
    let r;
    if (typeof on.undo === 'function') r = on.undo();
    else if (game && typeof game.undo === 'function') r = game.undo();
    else if (world && typeof world.undo === 'function') r = world.undo();
    else return false;
    touched();
    refreshGhost();
    if (ui && ui.say) ui.say(r ? 'Undone.' : 'Nothing left to undo.');
    return r;
  }

  function doRedo() {
    let r;
    if (typeof on.redo === 'function') r = on.redo();
    else if (game && typeof game.redo === 'function') r = game.redo();
    else if (world && typeof world.redo === 'function') r = world.redo();
    else return false;
    touched();
    refreshGhost();
    return r;
  }

  function paintAt(tx, ty) {
    const key = tx + ',' + ty;
    if (state.lastPaint === key) return;
    state.lastPaint = key;
    const razing = state.button === 2 || (ui && ui.tool && ui.tool() === 'raze');
    if (razing) doRemove(tx, ty);
    else doPlace(tx, ty);
    refreshGhost();
  }

  // ------------------------------------------------------------------ pointer --

  /**
   * Abandon whatever one finger had started, WITHOUT committing it, and take
   * up the two-finger gesture instead.
   *
   * `state.terrain = null` rather than `doTerrain(...)` is the important line
   * and it is the same choice `Escape` makes: a terrace half dragged out when
   * the second finger lands was never asked for, and building it would be the
   * gesture quietly editing the garden on its way past.
   */
  function beginGesture() {
    const pts = [...state.touches.values()];
    const r = twoFinger(pts[0], pts[1]);
    state.terrain = null;
    state.painting = false;
    state.panning = false;
    state.dragging = false;
    state.lastPaint = null;
    // THE LINE THE WHOLE DEFERRAL EXISTS FOR: the tree the first finger was
    // about to plant is thrown away, because the hand turned out to be
    // reaching for the map rather than for the meadow.
    state.pending = null;
    state.gesture = { startDist: r.dist, cx: r.cx, cy: r.cy, fired: false };
    state.suppress = true;
    refreshGhost();
  }

  /** Fingers closed = show me everything; fingers opened = back to the garden. */
  function onPinch(dir) {
    if (!minimap || typeof minimap.setExpanded !== 'function') return;
    const open = dir === 'in';
    if (minimap.expanded === open) return;
    minimap.setExpanded(open);
    if (ui && ui.announce) ui.announce(open ? 'the whole garden' : 'back to the glade');
  }

  function onPointerDown(ev) {
    if (ui && ui.isModal && ui.isModal()) return;
    const p = toLogical(ev);

    // Book the pointer FIRST, before any of the single-pointer reasoning below
    // can act on it, so that the second finger is known to be down at the
    // moment we decide what this press means.
    state.touches.set(ev.pointerId, { x: p.x, y: p.y });
    if (state.touches.size === 2) {
      beginGesture();
      ev.preventDefault();
      return;
    }
    // A third finger, or a finger put back down while the others are still on
    // the glass, is noise. Swallow it rather than let it start an edit.
    if (state.touches.size > 2 || state.suppress) {
      ev.preventDefault();
      return;
    }

    state.px = p.x;
    state.py = p.y;
    state.lastX = p.x;
    state.lastY = p.y;
    state.pointerIn = true;

    // THE MINIMAP, before the chrome test that would otherwise swallow it. On a
    // 60x60 map, jumping is the minimap's whole reason for being — a picture of
    // where you are is half the answer and "take me there" is the other half.
    // Checked first because ui.js RESERVES the same rectangle, so by the next
    // line the click is already gone.
    if (minimap && typeof minimap.hit === 'function' && minimap.hit(p.x, p.y, viewRect())) {
      const t = typeof minimap.pick === 'function' ? minimap.pick(p.x, p.y, viewRect()) : null;
      if (t) {
        centreOn(t.tx, t.ty);
        if (ui && ui.announce) ui.announce(`looking at ${t.tx}, ${t.ty}`);
      }
      // THE OVERVIEW CLOSES ON A TAP, whether or not the tap found a tile.
      //
      // It is a picture you opened to answer one question — where is the thing
      // I want to look at — so it should get out of the way the moment it has
      // answered, rather than making you dismiss it separately. A tap on the
      // garden showing round its edge missed the map and simply closes: `hit`
      // claims the whole view while it is open, precisely so that tap lands
      // here instead of planting a tree through the picture.
      if (minimap.expanded && typeof minimap.setExpanded === 'function') {
        minimap.setExpanded(false);
      }
      return;
    }

    if (ui && ui.blocks && ui.blocks(p.x, p.y)) return; // the chrome owns this pixel

    const t = pick(ev);
    state.tx = t.tx;
    state.ty = t.ty;
    state.button = ev.button;
    state.dragging = true;
    state.moved = 0;
    state.downX = p.x;
    state.downY = p.y;
    state.lastPaint = null;
    state.keyCursor = null;
    state.terrain = null;

    const tool = (ui && ui.tool && ui.tool()) || 'place';
    const item = (ui && ui.selection && ui.selection()) || null;

    // THE MOVE TOOL. Drag to shove the map about; a press that never moves is
    // a click, and lands as "centre me there" in onPointerUp.
    //
    // It comes before the ordinary pan branch below because that one only fires
    // when NOTHING is selected — the whole point of this tool is that you can
    // move the map with a plant still in your hand.
    if (tool === 'move') {
      state.painting = false;
      state.terrain = null;
      state.panning = true;
      return;
    }

    // THE QUESTION MARK asks and changes nothing. Before every other branch,
    // because "click a thing to find out what it is" must not also plant,
    // raze, terrace or pan — a help cursor that edits the garden is a trap.
    if (tool === 'ask') {
      state.dragging = false;
      state.painting = false;
      state.panning = false;
      if (ui && typeof ui.explainTile === 'function') ui.explainTile(t.tx, t.ty);
      return;
    }

    // Left-drag with nothing selected pans, which is what a player reaches for
    // first. Middle-drag and space-drag always pan.
    if (ev.button === 1 || keys.has(' ') || (ev.button === 0 && tool === 'place' && !item)) {
      state.panning = true;
    } else if (TERRAIN_SET.has(tool)) {
      // Begin a terrain drag. Nothing is applied yet: the region grows under the
      // pointer and lands as ONE edit on release, so a dragged terrace is one
      // undo step. Right-dragging inverts raise and lower — the gesture every
      // builder player already has in their hands.
      state.panning = false;
      state.painting = false;
      const op =
        ev.button === 2 && tool !== 'level' ? (tool === 'raise' ? 'lower' : 'raise') : tool;
      state.terrain = { op, x0: t.tx, y0: t.ty, x1: t.tx, y1: t.ty };
      refreshGhost();
    } else {
      state.panning = false;
      state.painting = true;
      /**
       * ON A FINGER, PLACING WAITS FOR THE RELEASE. On a mouse it does not.
       *
       * A mouse has exactly one pointer, so a press can only ever mean "do the
       * thing" and doing it immediately is the crisper feel — that is the
       * behaviour this game has always had and it is untouched.
       *
       * A finger cannot promise that. Two fingers do not land together: there
       * are tens of milliseconds between them, and for that moment a
       * two-finger pan is indistinguishable from a one-finger press. Planting
       * on contact meant that reaching for the map with a tree in your hand
       * PLANTED A TREE and then panned away from it — measured, on the running
       * build, before this existed: two objects became three.
       *
       * Deferring to the release costs a touch player nothing they can feel (a
       * tap is a hundred milliseconds) and it lets `beginGesture` simply throw
       * the pending placement away. Dragging to paint ground still works: the
       * pending tile is flushed by the first move that passes DRAG_SLOP, so a
       * drag paints from where it started rather than from where it noticed.
       */
      if (ev.pointerType === 'touch') state.pending = { tx: t.tx, ty: t.ty };
      else paintAt(t.tx, t.ty);
    }

    canvas.focus({ preventScroll: true });
    if (canvas.setPointerCapture && ev.pointerId != null) {
      try {
        canvas.setPointerCapture(ev.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    ev.preventDefault();
  }

  function onPointerMove(ev) {
    const p = toLogical(ev);

    // THE GESTURE OWNS THE MOVE. Pan by how far the CENTROID travelled, which
    // is what keeps the map under two fingers the same way `dragBy` keeps it
    // under one, and leaves the map still when the fingers only spread.
    if (state.touches.has(ev.pointerId)) state.touches.set(ev.pointerId, { x: p.x, y: p.y });
    if (state.gesture && state.touches.size >= 2) {
      const pts = [...state.touches.values()];
      const r = twoFinger(pts[0], pts[1]);
      dragBy(-(r.cx - state.gesture.cx), -(r.cy - state.gesture.cy));
      state.gesture.cx = r.cx;
      state.gesture.cy = r.cy;
      // Once per gesture. A pinch that has already spoken must not keep
      // toggling the overview as the fingers carry on moving.
      if (!state.gesture.fired) {
        const verdict = pinchVerdict(state.gesture.startDist, r.dist);
        if (verdict) {
          state.gesture.fired = true;
          onPinch(verdict);
        }
      }
      ev.preventDefault();
      return;
    }
    // A finger still down after its partner left: it moves nothing and picks
    // nothing until the glass is clear.
    if (state.suppress) return;

    const dx = p.x - state.lastX;
    const dy = p.y - state.lastY;
    state.lastX = p.x;
    state.lastY = p.y;
    state.px = p.x;
    state.py = p.y;
    state.pointerIn = true;

    if (state.dragging) {
      state.moved = Math.max(
        state.moved,
        Math.abs(p.x - state.downX) + Math.abs(p.y - state.downY)
      );
      // The map follows the pointer, so the camera moves the other way.
      if (state.panning) dragBy(-dx, -dy);
    }

    const t = pick(ev);
    const changed = t.tx !== state.tx || t.ty !== state.ty;
    state.tx = t.tx;
    state.ty = t.ty;

    // Stretch the terrain region. The anchor stays where the press landed, so
    // `level` always flattens toward the tile the drag STARTED on however the
    // player drags out of it.
    if (state.terrain && changed) {
      state.terrain.x1 = Math.max(0, Math.min(map.w - 1, t.tx));
      state.terrain.y1 = Math.max(0, Math.min(map.h - 1, t.ty));
    }

    if (state.painting && changed && state.moved > DRAG_SLOP) {
      const item = (ui && ui.selection && ui.selection()) || null;
      const razing = state.button === 2 || (ui && ui.tool && ui.tool() === 'raze');
      // Only ground paints continuously. Dragging a tree across the glade
      // planting one on every tile is not what anybody meant.
      if (razing || paintable(item)) {
        // A touch drag has now travelled far enough to be a stroke rather than
        // the first half of a pinch, so the tile it STARTED on is painted
        // before the one it has reached. Without this a dragged path would be
        // missing its first tile — the one the player actually aimed at.
        if (state.pending) {
          paintAt(state.pending.tx, state.pending.ty);
          state.pending = null;
        }
        paintAt(t.tx, t.ty);
      }
    }

    if (changed && typeof on.hover === 'function') on.hover(t.tx, t.ty);
    refreshGhost();
  }

  function onPointerUp(ev) {
    state.touches.delete(ev.pointerId);

    // Coming out of a gesture. The remaining finger — and its eventual release
    // — must do nothing at all: no pan, no tile, no "take me there". See
    // `state.suppress`, which is why this stays true until the glass is clear
    // rather than until the gesture ends.
    if (state.gesture || state.suppress) {
      if (state.touches.size < 2) state.gesture = null;
      if (state.touches.size === 0) state.suppress = false;
      state.dragging = false;
      state.panning = false;
      state.painting = false;
      state.terrain = null;
      state.pending = null;
      state.button = -1;
      state.lastPaint = null;
      refreshGhost();
      return;
    }

    if (state.dragging && ev.pointerId != null && canvas.releasePointerCapture) {
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch (_) {
        /* ignore */
      }
    }
    // THE MOVE TOOL'S CLICK. A press that never travelled is not a drag, it is
    // "take me there" — the same gesture the minimap answers, on the map itself.
    //
    // `state.moved` is the accumulated travel in logical pixels; the threshold
    // is the same DRAG_SLOP the rest of the file uses, so a hand that shakes
    // three pixels on a touch screen still reads as a tap rather than as a pan
    // of three pixels that then snaps nowhere.
    if (state.panning && (ui && ui.tool && ui.tool()) === 'move' && state.moved <= DRAG_SLOP) {
      centreOn(state.tx, state.ty);
      if (ui && ui.announce) ui.announce(`looking at ${state.tx}, ${state.ty}`);
    }
    // THE TAP LANDS HERE. A touch press that never became a drag and never
    // became a gesture is what a mouse would have committed on the way down;
    // this is the same placement, a hundred milliseconds later, and the only
    // moment at which it is finally certain that one finger is all there was.
    if (state.pending) {
      const q = state.pending;
      state.pending = null;
      paintAt(q.tx, q.ty);
    }
    // The terrain drag lands here, once, as a single undoable edit. A press with
    // no movement is a one-tile region, which is the ordinary click.
    if (state.terrain) {
      const r = state.terrain;
      state.terrain = null;
      doTerrain(r.op, r);
    }
    state.dragging = false;
    state.panning = false;
    state.painting = false;
    state.button = -1;
    state.lastPaint = null;
    refreshGhost();
  }

  function onPointerLeave() {
    state.pointerIn = false;
    refreshGhost();
  }

  function onContextMenu(ev) {
    // Right-click removes. Never show the browser menu over the garden.
    ev.preventDefault();
  }

  function onWheel(ev) {
    // No zoom: the scale is integer and owned by the shell.
    if (ui && ui.isModal && ui.isModal()) return;
    if (ui && ui.blocks && ui.blocks(state.px, state.py)) return;
    ev.preventDefault();
    const step = 32;
    const dir = Math.sign(ev.deltaY);
    // THE WHEEL TURNS WHAT YOU ARE HOLDING, and pans when you are holding
    // nothing that turns. Shift keeps the horizontal pan it always had, and
    // shift is also the escape hatch for panning WITHOUT putting your hedge
    // down — the same reason the move tool keeps your selection.
    if (!ev.shiftKey && turnBy(dir)) return;
    if (ev.shiftKey) panBy(dir * step, 0);
    else panBy(0, dir * step);
  }

  // ----------------------------------------------------------------- keyboard --

  /** True when a key event belongs to the chrome rather than the garden. */
  function inChrome(ev) {
    const t = ev.target;
    if (!t || t === canvas || t === document.body || t === document.documentElement) return false;
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return true;
    return !!(t.closest && t.closest('.ui'));
  }

  function moveKeyCursor(dx, dy) {
    const c = state.keyCursor || { tx: state.tx, ty: state.ty };
    const tx = Math.max(0, Math.min(map.w - 1, c.tx + dx));
    const ty = Math.max(0, Math.min(map.h - 1, c.ty + dy));
    state.keyCursor = { tx, ty };
    keepCursorInView();
    refreshGhost();
    if (ui && ui.announce) ui.announce(`tile ${tx}, ${ty}`);
  }

  function keepCursorInView() {
    const c = state.keyCursor;
    if (!c) return;
    const v = viewRect();
    const n = tileToScreen(c.tx, c.ty, camOf());
    const p = { x: n.x - TILE_W / 2, y: n.y }; // the bounding box's top-left
    const pad = 48;
    let dx = 0;
    let dy = 0;
    if (p.x < v.x + pad) dx = p.x - (v.x + pad);
    else if (p.x + TILE_W > v.x + v.w - pad) dx = p.x + TILE_W - (v.x + v.w - pad);
    if (p.y < v.y + pad) dy = p.y - (v.y + pad);
    else if (p.y + TILE_H > v.y + v.h - pad) dy = p.y + TILE_H - (v.y + v.h - pad);
    if (dx || dy) panBy(dx, dy);
  }

  function onKeyDown(ev) {
    if (inChrome(ev)) return;
    const k = ev.key;

    if (ev.ctrlKey || ev.metaKey) {
      const low = k.toLowerCase();
      if (low === 'z') {
        ev.preventDefault();
        if (ev.shiftKey) doRedo();
        else doUndo();
      } else if (low === 'y') {
        ev.preventDefault();
        doRedo();
      }
      return;
    }

    switch (k) {
      case 'Tab':
        // Tab cycles the field overlay while the garden has focus. With focus
        // inside the chrome (handled by `inChrome` above) Tab does what Tab
        // always does, so the whole UI stays keyboard-traversable.
        ev.preventDefault();
        if (ui && ui.cycleOverlay) ui.cycleOverlay(ev.shiftKey ? -1 : 1);
        return;
      // The question mark, on the question mark key. It is the only punctuation
      // the game binds, and it is bound to the thing it is drawn as.
      case '?':
        ev.preventDefault();
        if (ui && ui.toggleTool) ui.toggleTool('ask');
        return;
      case 'Escape':
        ev.preventDefault();
        // The overview is the outermost thing on screen, so it is the first
        // thing Esc takes off — the same order the journal already follows.
        if (minimap && minimap.expanded && typeof minimap.setExpanded === 'function') {
          minimap.setExpanded(false);
          return;
        }
        // A terrain drag in progress is abandoned rather than committed — Esc
        // has always meant "never mind", and it must not quietly build a
        // terrace on the way out.
        if (state.terrain) {
          state.terrain = null;
          refreshGhost();
          return;
        }
        if (ui && ui.isModal && ui.isModal()) ui.closeJournal();
        else if (ui && ui.clearSelection) ui.clearSelection();
        state.keyCursor = null;
        if (typeof on.cancel === 'function') on.cancel();
        refreshGhost();
        return;
      // ---- moving about ----------------------------------------------------
      //
      // WASD AND the arrows both pan the camera. They used to disagree — the
      // arrows panned, WASD nudged a tile cursor — which is the one thing a
      // player will never guess and never forgive on a map sixty tiles square.
      //
      // The tile cursor is still there and still places things; it moved to
      // SHIFT + the same keys. SPEC section 8 wants the whole game reachable
      // from the keyboard, so the cursor could not simply be deleted, and
      // giving it its own letters would have cost four more out of an alphabet
      // that is already carrying the categories.
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        ev.preventDefault();
        if (ev.shiftKey) {
          moveKeyCursor(
            k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0,
            k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0
          );
          return;
        }
        keys.add(k);
        return;
      }
      case 'w':
      case 'W':
      case 'a':
      case 'A':
      case 's':
      case 'S':
      case 'd':
      case 'D': {
        ev.preventDefault();
        const low2 = k.toLowerCase();
        const dx = low2 === 'a' ? -1 : low2 === 'd' ? 1 : 0;
        const dy = low2 === 'w' ? -1 : low2 === 's' ? 1 : 0;
        if (ev.shiftKey) {
          moveKeyCursor(dx, dy);
          return;
        }
        // Held, like the arrows: `keys` is drained by the pan loop, and the
        // arrow name is what that loop already understands.
        keys.add(dx < 0 ? 'ArrowLeft' : dx > 0 ? 'ArrowRight' : dy < 0 ? 'ArrowUp' : 'ArrowDown');
        return;
      }
      case 'Enter': {
        ev.preventDefault();
        const c = state.keyCursor || { tx: state.tx, ty: state.ty };
        const t = toolNow();
        if (TERRAIN_SET.has(t)) doTerrain(t, { x0: c.tx, y0: c.ty, x1: c.tx, y1: c.ty });
        else if (t === 'raze') doRemove(c.tx, c.ty);
        else doPlace(c.tx, c.ty);
        refreshGhost();
        return;
      }
      // Raise and lower the tile under the cursor outright, whatever tool is
      // selected. Two keys, and the whole of elevation is reachable without
      // ever opening a toolbar — SPEC §8 wants everything on the keyboard.
      case '+':
      case '=':
      case 'PageUp':
        ev.preventDefault();
        nudgeTerrain('raise');
        return;
      case '-':
      case '_':
      case 'PageDown':
        ev.preventDefault();
        nudgeTerrain('lower');
        return;
      case 'r':
      case 'R':
        // Cycle raise -> lower -> level -> back to placing.
        ev.preventDefault();
        if (ui && ui.toggleTool) {
          const at = TERRAIN_TOOLS.indexOf(toolNow());
          const next = at === -1 ? TERRAIN_TOOLS[0] : TERRAIN_TOOLS[at + 1] || 'place';
          ui.toggleTool(next);
          if (ui.announce) ui.announce(next === 'place' ? 'placing' : `${next} ground`);
        }
        refreshGhost();
        return;
      case 'Backspace':
      case 'Delete': {
        ev.preventDefault();
        const c = state.keyCursor || { tx: state.tx, ty: state.ty };
        doRemove(c.tx, c.ty);
        refreshGhost();
        return;
      }
      case 'b':
      case 'B':
        ev.preventDefault();
        if (ui && ui.toggleTool) ui.toggleTool('raze');
        refreshGhost();
        return;
      case 'j':
      case 'J':
        ev.preventDefault();
        if (ui && ui.toggleJournal) ui.toggleJournal();
        return;
      /**
       * THE WHOLE GARDEN. What a pinch opens, on a keyboard.
       *
       * It is here because a gesture must never be the ONLY way to reach
       * something: a phone is not the only place this game runs, and a control
       * with no keyboard route is a control a keyboard player does not have.
       * Every other tool in the game obeys that rule and this one does too.
       *
       * `M` for map. The note beside the move tool below used to say `M` is
       * mute — `setMuted()` exists in js/audio.js but NOTHING HAS EVER BOUND A
       * KEY TO IT, so the letter was reserved for a control that does not
       * exist. If mute ever wants a key it can have one; it cannot have this
       * one back without saying so.
       */
      case 'm':
      case 'M':
        ev.preventDefault();
        if (minimap && typeof minimap.toggleExpanded === 'function') {
          const open = minimap.toggleExpanded();
          if (ui && ui.announce) ui.announce(open ? 'the whole garden' : 'back to the glade');
        }
        return;
      // The move tool. `V` reads as "view" but is one letter from the
      // categories' alphabet, and X is the only other free key that nothing
      // else in the game wants.
      case 'x':
      case 'X':
        ev.preventDefault();
        if (ui && ui.toggleTool) ui.toggleTool('move');
        refreshGhost();
        return;
      // HOW FAST TIME RUNS. Punctuation rather than letters, because every
      // letter this game has is spoken for — eight of them name the categories
      // (GROUP_KEY in ui.js) and the rest are tools — and because `,` and `.`
      // carry `<` and `>` on the same keys, which is the only pair on the board
      // that means slower and faster on its face. `+`/`-` are the zoom.
      //
      // They CLAMP, unlike the button, which wraps: a key you can hold has to
      // have an end, or the garden stops dead when you overshoot.
      case ',':
      case '<':
      case '.':
      case '>':
        ev.preventDefault();
        if (ui && ui.cycleSpeed) ui.cycleSpeed(k === ',' || k === '<' ? -1 : 1);
        return;
      // BRUSH SIZE. `[` and `]` are what every painting application binds, and
      // this control was asked for in exactly those terms. They clamp, like the
      // speed keys and for the same reason.
      case '[':
      case '{':
      case ']':
      case '}':
        ev.preventDefault();
        if (ui && ui.cycleBrush) ui.cycleBrush(k === '[' || k === '{' ? -1 : 1);
        refreshGhost();
        return;
      case ' ':
        ev.preventDefault();
        keys.add(' ');
        return;
      default:
        break;
    }

    // NUMBERS pick the thing, LETTERS pick the drawer it is in.
    //
    // The numbers used to pick the category, which capped the keyboard at the
    // eight categories and left the other hundred-and-some placeables reachable
    // only with a pointer. Categories are letters now (see GROUP_KEY in ui.js,
    // and they are printed on the tabs), so 1-9 can mean what they look like
    // they mean.
    if (k >= '1' && k <= '9') {
      ev.preventDefault();
      if (ui && ui.selectItemIndex) ui.selectItemIndex(Number(k) - 1);
      else if (ui && ui.selectGroupIndex) ui.selectGroupIndex(Number(k) - 1);
      refreshGhost();
      return;
    }

    // A single letter that names a category. Reached only after the switch
    // above, so a letter already spoken for by a tool (R, B, J) never gets
    // here, and neither do W A S D.
    if (/^[a-z]$/i.test(k) && ui && ui.selectGroupByKey) {
      if (ui.selectGroupByKey(k)) {
        ev.preventDefault();
        refreshGhost();
      }
    }
  }

  /** W A S D are held under the arrow name they pan as. */
  const PAN_ALIAS = {
    w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight',
  };

  function onKeyUp(ev) {
    keys.delete(ev.key);
    // AND the alias, or releasing D leaves 'ArrowRight' held and the camera
    // slides east for ever. `keys` is a Set drained by the pan loop; it does
    // not care who put a name in it, so whoever puts one in owes it a delete.
    const alias = PAN_ALIAS[String(ev.key).toLowerCase()];
    if (alias) keys.delete(alias);
    if (ev.key === ' ') state.panning = false;
  }

  function onBlur() {
    keys.clear();
    state.dragging = false;
    state.panning = false;
    state.painting = false;
    // Losing focus mid-drag abandons the terrain edit rather than committing a
    // region the player never finished choosing.
    state.terrain = null;
    // A window that loses focus mid-gesture never sees those pointers come up,
    // so the book has to be closed here or the next tap arrives to find two
    // fingers still down and is swallowed as noise for ever.
    state.touches.clear();
    state.gesture = null;
    state.suppress = false;
    // A deferred placement whose release will never arrive is not placed. Same
    // reasoning as the terrain drag above: the player did not finish asking.
    state.pending = null;
  }

  // --------------------------------------------------------------------- loop --

  let raf = 0;
  let last = 0;

  function update(dt, tag) {
    if (state.disposed) return;
    // A host that drives us takes the wheel: stop the internal loop the first
    // time it calls in, so key and edge pan never run at double speed.
    if (tag !== INTERNAL && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    const step = typeof dt === 'number' && dt > 0 ? Math.min(0.05, dt) : 0;
    if (!step) return;

    let dx = 0;
    let dy = 0;
    if (keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('ArrowRight')) dx += 1;
    if (keys.has('ArrowUp')) dy -= 1;
    if (keys.has('ArrowDown')) dy += 1;
    if (dx || dy) panBy(dx * PAN_KEY_SPEED * step, dy * PAN_KEY_SPEED * step);

    // Edge scroll: only with the pointer genuinely over the map, never while
    // dragging, never over the chrome, never with the journal open.
    if (
      state.pointerIn &&
      !state.dragging &&
      !(ui && ui.isModal && ui.isModal()) &&
      !(ui && ui.blocks && ui.blocks(state.px, state.py))
    ) {
      const v = viewRect();
      let ex = 0;
      let ey = 0;
      if (state.px - v.x < EDGE_MARGIN) ex = -1;
      else if (v.x + v.w - state.px < EDGE_MARGIN) ex = 1;
      if (state.py - v.y < EDGE_MARGIN) ey = -1;
      else if (v.y + v.h - state.py < EDGE_MARGIN) ey = 1;
      if (ex || ey) panBy(ex * PAN_EDGE_SPEED * step, ey * PAN_EDGE_SPEED * step);
    }
  }

  function frame(t) {
    if (state.disposed) return;
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    update(dt, INTERNAL);
    if (raf) raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------- attach --

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  // A touch the browser takes back — a system edge-swipe, a call arriving —
  // fires `pointercancel` and NEVER `pointerup`. Without this the finger stays
  // on the books for ever and every later tap is swallowed as a third finger.
  window.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  if (!hasRendererCam) {
    clampLocal();
    centreOn((map.w - 1) / 2, (map.h - 1) / 2);
  }

  if (opts.selfDrive !== false) raf = requestAnimationFrame(frame);

  return {
    /** Present (and authoritative) only when no renderer owns the camera. */
    camera: localCam,
    cameraOf: camOf,
    reducedMotion: reduced,
    update,
    centreOn,
    panBy,
    /** True when the current pick accounts for terrain height. */
    get elevationAware() {
      return pickingIsElevationAware(renderer);
    },
    hovered() {
      const c = state.keyCursor ? { ...state.keyCursor } : { tx: state.tx, ty: state.ty };
      c.level = levelAt(c.tx, c.ty);
      return c;
    },
    /** The live terrain drag rectangle, or null. For the renderer's overlay. */
    terrainDrag() {
      return state.terrain ? { ...state.terrain } : null;
    },
    /**
     * Run a terrain op directly — for a toolbar button, a test, or a script.
     * `region` is { x0, y0, x1, y1 }, or a single { tx, ty }.
     */
    terrain(op, region) {
      const r = region || {};
      const x0 = r.x0 ?? r.tx ?? state.tx;
      const y0 = r.y0 ?? r.ty ?? state.ty;
      return doTerrain(op, { x0, y0, x1: r.x1 ?? x0, y1: r.y1 ?? y0 });
    },
    /** { ok, reason } for placing an item at a tile — the ghost's own answer. */
    legality,
    setMap(w, h) {
      map.w = w;
      map.h = h;
      if (!hasRendererCam) clampLocal();
    },
    refreshGhost,
    destroy() {
      state.disposed = true;
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
