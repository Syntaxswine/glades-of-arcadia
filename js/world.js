// world.js — the map state. Pure and DOM-free; imports cleanly in Node.
//
// A 20x20 tile grid of ground types AND HEIGHTS, a list of placed objects,
// add/remove with validation, a bounded 64-step undo stack, growth over garden
// time, and localStorage save/load with a versioned, round-trippable JSON shape.
//
// THE COSY GUARANTEES (SPEC §0) ARE ENFORCED HERE, not merely respected:
//
//   * Placement is free and removal is free. There is no cost, no cooldown, no
//     resource and no counter anywhere in this file.
//   * Nothing decays, nothing dies, nothing is ever destroyed by the passage of
//     time. `tick()` can only move a plant FORWARD along its growth ladder.
//   * Nothing is ever taken from the player. The one place the world says no is
//     when an edit would silently destroy something already standing — and it
//     says no by refusing the edit, never by deleting the object. Every refusal
//     carries a warm, plain-language reason for the UI.
//   * Waiting is rewarded and never required. Time away is added on load, so a
//     glade left alone quietly matures.
//
// The world emits change events so js/fields.js can recompute incrementally
// (SPEC §6: never rebuild the whole map per frame) and so the renderer and the
// journal can react without polling.
//
// ---------------------------------------------------------------------------
// ELEVATION (docs/ELEVATION.md)
// ---------------------------------------------------------------------------
// Every tile carries an integer `level`, 0..MAX_LEVEL. Terrain is stacked
// FLAT-TOPPED cubes — there is no auto-slope tiling, no marching squares, no
// half levels. A change of height is always a clean vertical cliff, and the
// player places a CONNECTOR object (ramp / stair / scramble) to get up it.
//
// `LEVEL_H` — the pixels of rise per level — is deliberately NOT here. It is a
// projection constant and belongs to js/iso.js; this module knows only the
// integer. Nothing in the tile model may hard-code a pixel height.
//
// Three things follow from levels, and all three live in this file because they
// are questions about the map rather than about the picture:
//
//   * TERRACES ARE NULLIFIERS. A height difference of >= TERRACE_BLOCK (2)
//     blocks influence propagation, exactly like a hedge (DECOR.md Part I).
//     A 1-level step does not block, so undulation stays connected.
//     -> `blocksAcross(ax, ay, bx, by)`, which js/fields.js consumes.
//   * WATERFALLS are a consequence of adjacency, not a fluid model: a water
//     tile beside a lower tile falls. -> `waterfallAt(tx, ty)`.
//   * CLIFF FACES are what a cave mouth is set into. -> `exposedFaces(tx, ty)`.
//
// TERRAIN EDITING IS FREE, UNLIMITED AND REVERSIBLE. SPEC §0 is absolute: there
// is no terraforming cost and there never will be. Raising a tile under an
// object is legal and THE OBJECT RIDES UP WITH IT — an object's height is read
// from the tile it stands on, so it is carried for free and can never be
// separated from its ground. A multi-tile object's whole footprint moves
// together (`_cohere` below) so nothing is ever left straddling two heights.

import {
  byId,
  footprintTiles,
  isGroundPainter,
  stageFor,
  GROUND_TYPES,
  WET_GROUND,
} from './catalog.js';

// The ceiling is a PROJECTION fact — how many levels the depth key can separate
// before it reaches into the next diagonal row — so iso.js owns it and this
// module imports it. world.js still owns the integer level itself and knows
// nothing about the pixel rise (LEVEL_H is deliberately not imported here).
import { MAP_W, MAP_H, MAX_LEVEL, FACINGS, clampFacing } from './iso.js';

/**
 * THE MAP SIZE HAS ONE HOME AND IT IS iso.js. Re-exported here only because
 * older call sites import it from world.js.
 *
 * These were a second, independent `20` for the whole life of the project. They
 * were never *read* by anything that passes explicit dimensions — main.js
 * always does — so growing the map to 60 did not visibly break, and that is
 * exactly the danger: `new World()` with no options, or a save with no `w`,
 * silently built a 20x20 world inside a 60x60 game. See
 * docs/TITLE-AND-CONTROLS.md, which made this a law after the same mistake in
 * the other direction (iso.js's pair were the dead ones then).
 */
export { MAP_W, MAP_H };

/** SPEC §0 — bounded undo stack. */
export const UNDO_LIMIT = 64;

/**
 * Save format version.
 *   1  ground + objects
 *   2  + per-tile `levels` (elevation) and the per-tile grass-type cache
 *   3  + per-object `facing` (BACKLOG §4k). Written ONLY when it is non-zero,
 *      so a garden in which nothing has been turned serialises byte for byte
 *      as it did under v2 — and a v2 save loads with every object at facing 0,
 *      which is the way it was drawn. That is the whole compatibility story
 *      and it is the part that must not be got wrong.
 * `World.deserialize` migrates every older shape forward and never refuses a
 * garden for being old. A v1 save loads as a flat glade at level 0.
 */
export const SAVE_VERSION = 3;
export const SAVE_KEY = 'arcadia.garden';

// ---------------------------------------------------------------------------
// Elevation constants — docs/ELEVATION.md
// ---------------------------------------------------------------------------

/** Ground floor. Nothing is ever below it; there is no digging into negatives. */
export const MIN_LEVEL = 0;

/** Six terraces above the floor. Seven distinct heights in all. iso.js's. */
export { MAX_LEVEL };

/**
 * A height difference of this many levels or more blocks influence, exactly as
 * a hedge does. One level does not block — gentle undulation stays connected,
 * so the player has both a soft tool and a hard one for the same job.
 */
export const TERRACE_BLOCK = 2;

/**
 * How many levels one connector may bridge. "1 up, 1 over" is the whole
 * constraint; a two-level cliff needs two flights, which is what a terraced
 * garden actually looks like.
 */
export const CONNECTOR_SPAN = 1;

/**
 * The four cardinal neighbours, labelled by the COMPASS POINT THEY OCCUPY ON
 * SCREEN. Worth deriving rather than guessing, because the tile axes are turned
 * 45° from the screen ones and getting it backwards draws every cliff face on
 * the hidden side. With sx = (tx - ty)*32 and sy = (tx + ty)*16:
 *
 *   (tx,   ty-1)  ->  sx +32, sy -16  ->  up-right   = NE
 *   (tx+1, ty  )  ->  sx +32, sy +16  ->  down-right = SE
 *   (tx,   ty+1)  ->  sx -32, sy +16  ->  down-left  = SW
 *   (tx-1, ty  )  ->  sx -32, sy -16  ->  up-left    = NW
 */
const NEIGHBOURS = Object.freeze([
  Object.freeze({ dx: 0, dy: -1, side: 'ne' }),
  Object.freeze({ dx: 1, dy: 0, side: 'se' }),
  Object.freeze({ dx: 0, dy: 1, side: 'sw' }),
  Object.freeze({ dx: -1, dy: 0, side: 'nw' }),
]);

/**
 * The faces that turn toward the CAMERA and therefore get drawn when a tile
 * stands proud of that neighbour (ELEVATION.md, "Cliff faces": SE and SW). The
 * other two sides of a raised tile are hidden behind the tile top itself.
 */
const FRONT_SIDES = Object.freeze(['se', 'sw']);

// ---------------------------------------------------------------------------
// Grass types — docs/ZONING.md. Computed by js/fields.js, CACHED here.
//
// This array is a cache and nothing else: it is derived state, it is never on
// the undo stack (undoing a placement must not undo the grass — fields.js will
// recompute it from the placement that came back), and a garden loaded without
// it is not damaged, only briefly plain until the first recompute.
// ---------------------------------------------------------------------------

export const GRASS_TYPES = Object.freeze([
  'meadow', // nobody's — the neutral base, everywhere at the start
  'thicket', // satyr
  'sward', // centaur
  'fen', // naiad
  'millefleurs', // unicorn
]);

export const DEFAULT_GRASS = 'meadow';
const GRASS_INDEX = new Map(GRASS_TYPES.map((g, i) => [g, i]));

/** One garden day. Two real minutes — a sapling is a tree inside a session. */
export const DAY_MS = 2 * 60 * 1000;

/** Clock guards. A tick never runs backwards and never jumps absurdly. */
const MAX_TICK_MS = 6 * 60 * 60 * 1000; // 6 h in one tick
const MAX_OFFLINE_MS = 30 * DAY_MS; // catch-up credited on load

const DEFAULT_GROUND = 'grass';
const GROUND_INDEX = new Map(GROUND_TYPES.map((g, i) => [g, i]));
const WET = new Set(WET_GROUND);

// ---------------------------------------------------------------------------
// Deterministic per-object seeds. Same uid + same world seed => same tree,
// forever, across saves. Nothing here consumes a shared RNG stream, so placing
// an object can never change what an already-placed object looks like.
// ---------------------------------------------------------------------------

function mix32(a, b) {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h + Math.imul(b >>> 0, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** Any number in, a legal integer level out. Never NaN, never out of range. */
export function clampLevel(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return MIN_LEVEL;
  return v < MIN_LEVEL ? MIN_LEVEL : v > MAX_LEVEL ? MAX_LEVEL : v;
}

/**
 * Normalise however a caller spelled a region into an ordered tile list plus an
 * options bag. ORDER MATTERS: the first tile is the drag anchor, and `level`
 * flattens toward it.
 *
 *   (5, 5)                      one tile
 *   (3, 3, 7, 6)                a rectangle, anchored at (3,3)
 *   ({x0,y0,x1,y1}) / ({tx,ty}) / ({x0,y0,w,h})
 *   ([[3,3],[4,3]])             an explicit brush path, in drag order
 *   (..., { to: 2 })            a trailing options bag
 */
export function parseRegion(args) {
  const a = [...args];
  let opts = {};
  const last = a[a.length - 1];
  if (a.length > 1 && last && typeof last === 'object' && !Array.isArray(last) && 'to' in last) {
    opts = a.pop();
  }

  // An explicit list of tiles.
  if (a.length === 1 && Array.isArray(a[0])) {
    const tiles = [];
    const seen = new Set();
    for (const t of a[0]) {
      const x = Math.floor(Array.isArray(t) ? t[0] : t.tx);
      const y = Math.floor(Array.isArray(t) ? t[1] : t.ty);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const k = x + ':' + y;
      if (seen.has(k)) continue;
      seen.add(k);
      tiles.push([x, y]);
    }
    return { tiles, opts };
  }

  let x0;
  let y0;
  let x1;
  let y1;
  if (a.length === 1 && a[0] && typeof a[0] === 'object') {
    const r = a[0];
    x0 = r.x0 ?? r.tx ?? r.x ?? 0;
    y0 = r.y0 ?? r.ty ?? r.y ?? 0;
    x1 = r.x1 ?? (r.w != null ? x0 + r.w - 1 : x0);
    y1 = r.y1 ?? (r.h != null ? y0 + r.h - 1 : y0);
    if (r.to != null && !('to' in opts)) opts = { ...opts, to: r.to };
  } else {
    x0 = a[0] ?? 0;
    y0 = a[1] ?? 0;
    x1 = a.length >= 4 ? a[2] : x0;
    y1 = a.length >= 4 ? a[3] : y0;
  }

  x0 = Math.floor(x0);
  y0 = Math.floor(y0);
  x1 = Math.floor(x1);
  y1 = Math.floor(y1);
  // The rectangle is walked OUTWARD FROM THE ANCHOR, so tiles[0] is the corner
  // the player started the drag on whichever way they dragged.
  const sx = x1 >= x0 ? 1 : -1;
  const sy = y1 >= y0 ? 1 : -1;
  const tiles = [];
  for (let y = y0; sy > 0 ? y <= y1 : y >= y1; y += sy) {
    for (let x = x0; sx > 0 ? x <= x1 : x >= x1; x += sx) tiles.push([x, y]);
  }
  return { tiles, opts };
}

// ---------------------------------------------------------------------------
// Connectors — the ONLY objects allowed to stand on changing ground.
//
// js/catalog.js is owned elsewhere, so this recognises a connector from any of
// four honest signals rather than demanding one. The preferred marking, for
// whoever authors the ramp and the stair, is simply:
//
//     { id: 'stone-stair', ..., connector: true }        // or { span: 1 }
//
// The id list is the fallback so that the four connectors named in
// ELEVATION.md work the moment they appear in the catalogue, marked or not.
// ---------------------------------------------------------------------------

export const CONNECTOR_IDS = Object.freeze([
  'earth-ramp',
  'stone-stair',
  'rock-scramble',
  'stepped-terrace-wall',
  'terrace-steps',
]);
const CONNECTOR_ID_SET = new Set(CONNECTOR_IDS);

/** The connector rule for a placeable, or null if it is an ordinary object. */
export function connectorSpec(def) {
  if (!def) return null;
  if (def.connector) {
    const c = typeof def.connector === 'object' ? def.connector : {};
    return { span: Number.isInteger(c.span) ? c.span : CONNECTOR_SPAN };
  }
  if (def.group === 'connector') return { span: CONNECTOR_SPAN };
  const tags = Array.isArray(def.tags) ? def.tags : [];
  if (tags.includes('connector') || tags.includes('ramp') || tags.includes('stair')) {
    return { span: CONNECTOR_SPAN };
  }
  if (CONNECTOR_ID_SET.has(def.id)) return { span: CONNECTOR_SPAN };
  return null;
}

/** True when this placeable is a ramp / stair / scramble. */
export function isConnector(def) {
  return connectorSpec(def) !== null;
}

/**
 * Does this placeable need level ground under it? Everything does by default —
 * a bench with one leg a whole terrace lower is not a bench. A def may opt out
 * with `flatFooting: false` (rubble, scree, a tumbled ruin), and a connector is
 * exempt by definition, because bridging a step IS its job.
 *
 * A 1x1 object is trivially flat, so this only ever bites on multi-tile things.
 */
function needsFlatFooting(def) {
  if (!def) return true;
  if (isConnector(def)) return false;
  return def.flatFooting !== false;
}

// ---------------------------------------------------------------------------
// Refusal reasons. Warm, lowercase, sentence fragments the UI can show as-is.
// ---------------------------------------------------------------------------

const OK = Object.freeze({ ok: true, reason: null });
const no = (reason) => Object.freeze({ ok: false, reason });

export class World {
  /**
   * @param {object} [opts]
   * @param {number} [opts.w] @param {number} [opts.h]
   * @param {string} [opts.ground] starting ground type for every tile
   * @param {number} [opts.seed] world seed — drives per-object art seeds
   * @param {number} [opts.time] starting garden clock, ms
   */
  constructor(opts = {}) {
    this.w = opts.w ?? MAP_W;
    this.h = opts.h ?? MAP_H;
    this.seed = (opts.seed ?? 0x5eed10) >>> 0;

    const base = GROUND_INDEX.get(opts.ground ?? DEFAULT_GROUND) ?? 0;
    this.ground = new Uint8Array(this.w * this.h).fill(base);

    // WHICH PAINTER laid each tile, as an index into `groundPainters` + 1.
    // Zero means "nobody, or a garden old enough not to have recorded it".
    //
    // The ground TYPE is not enough, and the gap is expensive: seven different
    // placeables paint `water`, and DECOR.md gives them quite different
    // affinities — `still-pool` is a unicorn SINGLE at weight 1.0, `lily-pool`
    // is the 3,4 dual, `watering-place` is the 2,3,4 triple, `brook` is
    // neutral. Storing only "this tile is water" throws all of that away, and
    // the consumer has no choice but to pick one def per type and apply it to
    // every tile of that type — so five of DECOR.md's thirty-three affinity
    // items argued for the wrong species, or for nobody, and the player's
    // choice between a still pool and a plunge pool became decorative.
    this.groundBy = new Uint8Array(this.w * this.h);
    this.groundPainters = [];

    /**
     * Elevation, one integer 0..MAX_LEVEL per tile. A fresh glade is flat, which
     * is the right starting state: the player raises ground because they want a
     * terrace, never because the map handed them one.
     */
    const startLevel = clampLevel(opts.level ?? MIN_LEVEL);
    this.levels = new Uint8Array(this.w * this.h).fill(startLevel);

    /**
     * The grass-type cache (docs/ZONING.md). `grass` holds the winning affinity
     * and `grassAlt` holds the one contesting it, offset by one so that 0 means
     * "not contested". Written by js/fields.js through `applyGrass`; read by the
     * renderer. Derived, never undoable, never authoritative.
     */
    this.grass = new Uint8Array(this.w * this.h); // index 0 === 'meadow'
    this.grassAlt = new Uint8Array(this.w * this.h);
    /** Bumped on every grass write so a renderer can cache against it. */
    this.grassVersion = 0;

    /** @type {Array<{uid:number,id:string,tx:number,ty:number,seed:number,placedAt:number,stage:string|null}>} */
    this.objects = [];
    /** uid -> object, for O(1) lookup. */
    this._byUid = new Map();
    /** tile index -> object, for O(1) occupancy. */
    this._occupancy = new Map();

    this.nextUid = 1;
    /** Garden clock, in ms. Only ever moves forward. */
    this.time = opts.time ?? 0;
    this._lastReal = null;

    /** @type {Array<object>} bounded, in-memory only — not saved. */
    this.undoStack = [];
    this._batch = null;

    /** Opaque passenger for other owners (journal, creature state, camera). */
    this.extra = {};

    this._listeners = new Set();
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  /** Subscribe to change events. Returns an unsubscribe function. */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(ev) {
    for (const fn of this._listeners) fn(ev);
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  _i(tx, ty) {
    return ty * this.w + tx;
  }

  /** Ground type name at a tile, or null off-map. */
  groundAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    return GROUND_TYPES[this.ground[this._i(tx, ty)]];
  }

  isWet(tx, ty) {
    return WET.has(this.groundAt(tx, ty));
  }

  /**
   * Intern a painter id and return its code (index + 1; 0 is "unrecorded").
   * The list is per-world and travels in the save as a legend, so the catalogue
   * can be reordered — or an entry removed — without repainting a garden.
   */
  _painterCode(id) {
    if (!id) return 0;
    let at = this.groundPainters.indexOf(id);
    if (at < 0) {
      if (this.groundPainters.length >= 254) return 0; // absurd; degrade, never throw
      this.groundPainters.push(id);
      at = this.groundPainters.length - 1;
    }
    return at + 1;
  }

  /**
   * Which placeable painted this tile, or null if nothing did (bare ground, or
   * a garden saved before painters were recorded). Consumers that care about a
   * tile's AFFINITY want this; consumers that care what it looks like want
   * `groundAt`.
   */
  groundPainterAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const code = this.groundBy[this._i(tx, ty)];
    return code ? this.groundPainters[code - 1] || null : null;
  }

  // ------------------------------------------------------------------- levels

  /** Height of a tile, 0..MAX_LEVEL. Off-map reads as null. */
  levelAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    return this.levels[this._i(tx, ty)];
  }

  /**
   * Off-map reads as the nearest edge tile's height rather than as a hole, so a
   * cliff at the border does not draw a face into the void and a connector at
   * the edge is not judged against nothing.
   */
  levelNear(tx, ty) {
    const x = tx < 0 ? 0 : tx >= this.w ? this.w - 1 : tx;
    const y = ty < 0 ? 0 : ty >= this.h ? this.h - 1 : ty;
    return this.levels[this._i(x, y)];
  }

  /** Height of the tile an object stands on — what makes it ride up for free. */
  levelOf(obj) {
    if (!obj) return MIN_LEVEL;
    return this.levelAt(Math.floor(obj.tx), Math.floor(obj.ty)) ?? MIN_LEVEL;
  }

  /**
   * The height range under a footprint: { min, max, flat, level }.
   * `level` is the max, which is the height an object would stand at.
   */
  footprintLevels(defOrId, tx, ty) {
    const def = typeof defOrId === 'string' ? byId(defOrId) : defOrId;
    let min = Infinity;
    let max = -Infinity;
    const tiles = def ? footprintTiles(def, tx, ty) : [[tx, ty]];
    for (const [x, y] of tiles) {
      const l = this.levelAt(x, y);
      if (l === null) continue;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    if (min === Infinity) return { min: MIN_LEVEL, max: MIN_LEVEL, flat: true, level: MIN_LEVEL };
    return { min, max, flat: min === max, level: max };
  }

  /**
   * TERRACES ARE NULLIFIERS (ELEVATION.md). Influence cannot pass between two
   * tiles whose heights differ by TERRACE_BLOCK or more — the same occluder
   * rule the hedges use, obtained from the shape of the land instead of from a
   * placed object. js/fields.js calls this while it floods.
   *
   * A sunken garden is secluded because it is SUNK, not because a rule says so.
   */
  blocksAcross(ax, ay, bx, by) {
    const a = this.levelAt(ax, ay);
    const b = this.levelAt(bx, by);
    if (a === null || b === null) return true; // off-map is a wall
    return Math.abs(a - b) >= TERRACE_BLOCK;
  }

  /** How far a neighbour steps up (+) or down (-) from this tile. */
  stepTo(tx, ty, dx, dy) {
    const a = this.levelAt(tx, ty);
    const b = this.levelAt(tx + dx, ty + dy);
    if (a === null || b === null) return null;
    return b - a;
  }

  /**
   * The cliff faces this tile exposes toward the camera, as
   * [{ side, dx, dy, drop }] with `drop` in whole levels. Advisory read-out for
   * the renderer (and for setting a cave mouth into a hillside); the renderer is
   * free to compute it itself, but this is the definition.
   */
  exposedFaces(tx, ty) {
    const here = this.levelAt(tx, ty);
    if (here === null) return [];
    const out = [];
    for (const n of NEIGHBOURS) {
      if (!FRONT_SIDES.includes(n.side)) continue;
      const there = this.inBounds(tx + n.dx, ty + n.dy)
        ? this.levels[this._i(tx + n.dx, ty + n.dy)]
        : MIN_LEVEL;
      const drop = here - there;
      if (drop > 0) out.push({ side: n.side, dx: n.dx, dy: n.dy, drop });
    }
    return out;
  }

  /** True when any neighbour stands at least one level above this tile. */
  underCliff(tx, ty) {
    const here = this.levelAt(tx, ty);
    if (here === null) return false;
    for (const n of NEIGHBOURS) {
      const there = this.levelAt(tx + n.dx, ty + n.dy);
      if (there !== null && there > here) return true;
    }
    return false;
  }

  /**
   * Where a water tile meets a drop. A waterfall is a RENDERING CONSEQUENCE OF
   * ADJACENCY, not a fluid model (ELEVATION.md): this only reports the edges.
   * Returns [{ side, dx, dy, drop, intoWater }].
   */
  waterfallAt(tx, ty) {
    if (!this.isWet(tx, ty)) return [];
    const here = this.levelAt(tx, ty);
    const out = [];
    for (const n of NEIGHBOURS) {
      const there = this.levelAt(tx + n.dx, ty + n.dy);
      if (there === null || there >= here) continue;
      out.push({
        side: n.side,
        dx: n.dx,
        dy: n.dy,
        drop: here - there,
        intoWater: this.isWet(tx + n.dx, ty + n.dy),
      });
    }
    return out;
  }

  /** Every waterfall edge on the map, for the renderer's first build. */
  waterfalls() {
    const out = [];
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        for (const f of this.waterfallAt(tx, ty)) out.push({ tx, ty, ...f });
      }
    }
    return out;
  }

  // -------------------------------------------------------------- grass cache

  /** Grass type name at a tile, or null off-map. */
  grassAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    return GRASS_TYPES[this.grass[this._i(tx, ty)]] ?? DEFAULT_GRASS;
  }

  /** The type contesting this tile, or null when the tile is settled. */
  contestedAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    const a = this.grassAlt[this._i(tx, ty)];
    return a ? GRASS_TYPES[a - 1] ?? null : null;
  }

  /** { type, second, contested } — everything the terrain rasteriser needs. */
  grassInfo(tx, ty) {
    const type = this.grassAt(tx, ty);
    const second = this.contestedAt(tx, ty);
    return { type, second, contested: second !== null };
  }

  /**
   * Write one tile of the grass cache. Returns true if anything changed.
   * `second` is the type contesting it (ZONING.md's checkerboard), or null.
   *
   * fields.js owns the DECISION; this owns the STORAGE. Nothing here is undoable
   * and nothing here is authoritative — throw the cache away and the next
   * recompute rebuilds it exactly.
   */
  setGrass(tx, ty, type, second = null) {
    if (!this.inBounds(tx, ty)) return false;
    const i = this._i(tx, ty);
    const a = GRASS_INDEX.get(type);
    const b = second == null ? 0 : (GRASS_INDEX.get(second) ?? -1) + 1;
    if (a === undefined || b < 0) return false;
    if (this.grass[i] === a && this.grassAlt[i] === b) return false;
    this.grass[i] = a;
    this.grassAlt[i] = b;
    return true;
  }

  /**
   * Bulk write, one event for the lot — [{ tx, ty, type, second }]. This is the
   * call fields.js makes after a recompute. Returns the tiles that actually
   * changed, which is what the "grass spreads tile by tile" animation animates.
   */
  applyGrass(list) {
    const changed = [];
    for (const g of list || []) {
      if (this.setGrass(g.tx, g.ty, g.type, g.second ?? null)) {
        changed.push({ tx: g.tx, ty: g.ty, type: g.type, second: g.second ?? null });
      }
    }
    if (changed.length) {
      this.grassVersion++;
      this._emit({ type: 'grass', tiles: changed });
    }
    return changed;
  }

  /**
   * Take js/fields.js's `grassGrid()` wholesale — `{ w, h, types, type, other }`
   * with `type` a code per tile and `other` the rival's code plus one, zero for
   * uncontested. The two code orders are the same list, so the common case is a
   * straight copy of two typed arrays; a grid that carries its own `types`
   * legend and disagrees is translated rather than trusted, because a silent
   * off-by-one here would paint the whole garden the wrong species.
   *
   * Returns the number of tiles that changed, which is what the "grass spreads
   * tile by tile" animation needs to know it has anything to do.
   */
  cacheGrassGrid(grid) {
    if (!grid || !grid.type) return 0;
    const legend = Array.isArray(grid.types) ? grid.types : GRASS_TYPES;
    const same =
      legend.length === GRASS_TYPES.length && legend.every((n, i) => n === GRASS_TYPES[i]);
    const remap = same ? null : legend.map((n) => GRASS_INDEX.get(n) ?? 0);
    const n = Math.min(this.grass.length, grid.type.length);
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const a = remap ? remap[grid.type[i]] ?? 0 : grid.type[i];
      const rawOther = grid.other ? grid.other[i] : 0;
      const b = rawOther ? (remap ? (remap[rawOther] ?? 0) + 1 : rawOther + 1) : 0;
      if (this.grass[i] === a && this.grassAlt[i] === b) continue;
      this.grass[i] = a;
      this.grassAlt[i] = b;
      changed++;
    }
    if (changed) {
      this.grassVersion++;
      this._emit({ type: 'grass', tiles: null, bulk: true, changed });
    }
    return changed;
  }

  /** Back to plain meadow everywhere. Used on load and by the playtest. */
  resetGrass() {
    this.grass.fill(0);
    this.grassAlt.fill(0);
    this.grassVersion++;
  }

  /** The object occupying a tile, or null. */
  objectAt(tx, ty) {
    if (!this.inBounds(tx, ty)) return null;
    return this._occupancy.get(this._i(tx, ty)) ?? null;
  }

  objectByUid(uid) {
    return this._byUid.get(uid) ?? null;
  }

  /** Objects whose origin lies within `radius` tiles (euclidean) of a point. */
  objectsNear(tx, ty, radius) {
    const r2 = radius * radius;
    return this.objects.filter((o) => {
      const dx = o.tx - tx;
      const dy = o.ty - ty;
      return dx * dx + dy * dy <= r2;
    });
  }

  /**
   * How many objects carrying `tag` sit within `radius` tiles. This is the
   * primitive behind a creature's count requirement ("3 x water-loving within
   * 4 tiles"), and it is exact — SPEC §7 wants exact ticks for counts.
   */
  countTag(tag, tx, ty, radius) {
    let n = 0;
    for (const o of this.objectsNear(tx, ty, radius)) {
      const def = byId(o.id);
      if (def && def.tags.includes(tag)) n++;
    }
    return n;
  }

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  /**
   * May this placeable go here? Returns { ok, reason }. `reason` is a plain,
   * warm fragment suitable for showing under the cursor.
   */
  canPlace(defOrId, tx, ty) {
    const def = typeof defOrId === 'string' ? byId(defOrId) : defOrId;
    if (!def) return no('nothing selected');

    const tiles = footprintTiles(def, tx, ty);
    for (const [x, y] of tiles) {
      if (!this.inBounds(x, y)) return no('that runs off the edge of the glade');
    }

    if (isGroundPainter(def)) return this._canPaint(def, tiles);

    for (const [x, y] of tiles) {
      const sitting = this.objectAt(x, y);
      if (sitting) {
        const other = byId(sitting.id);
        return no(`${other ? other.name.toLowerCase() : 'something'} is already there`);
      }
    }

    if (def.requires === 'water') {
      for (const [x, y] of tiles) {
        if (!this.isWet(x, y)) return no('that only sits on water');
      }
    } else if (def.requires === 'land') {
      for (const [x, y] of tiles) {
        if (this.isWet(x, y)) return no('that will not stand in water');
      }
    }

    return this._canStand(def, tiles);
  }

  // -------------------------------------------------------------------------
  // Elevation legality. Two rules, and the refusal always SAYS WHY — the UI
  // shows the reason under the cursor rather than the ghost just going red and
  // the player guessing (SPEC §8).
  //
  //   1. A CONNECTOR must bridge EXACTLY ONE LEVEL. That is "1 up, 1 over", and
  //      it is why a two-level cliff needs two flights, which is what a real
  //      terraced garden looks like.
  //   2. EVERY OTHER OBJECT needs a FLAT FOOTPRINT. A 1x1 is flat by
  //      definition, so this only bites on multi-tile things — and a colonnade
  //      with one end a terrace lower is not a colonnade.
  //
  // Nothing here can ever remove or damage what is already standing. The worst
  // it does is decline, warmly, and tell the player which tool fixes it.
  // -------------------------------------------------------------------------

  _canStand(def, tiles) {
    const spec = connectorSpec(def);
    if (spec) return this._canConnect(def, tiles, spec);

    if (needsFlatFooting(def) && tiles.length > 1) {
      let min = Infinity;
      let max = -Infinity;
      for (const [x, y] of tiles) {
        const l = this.levels[this._i(x, y)];
        if (l < min) min = l;
        if (l > max) max = l;
      }
      if (min !== max) {
        return no('the ground under that is not level — flatten it first');
      }
    }

    // Opt-in, for the cave mouth: a cave is a hole in a HILLSIDE, and setting
    // one into a cliff face is what finally makes it read as a cave rather than
    // as a doorway lying on the lawn (ELEVATION.md, "Caves").
    if (def.needsCliff) {
      const [x, y] = tiles[0];
      if (!this.underCliff(x, y)) {
        return no('a cave wants a hillside — raise the ground behind it');
      }
    }

    return OK;
  }

  _canConnect(def, tiles, spec) {
    const span = spec.span || CONNECTOR_SPAN;
    let min = Infinity;
    let max = -Infinity;
    for (const [x, y] of tiles) {
      const l = this.levels[this._i(x, y)];
      if (l < min) min = l;
      if (l > max) max = l;
    }

    // A connector that covers more than one tile carries the step inside its own
    // footprint: the low end and the high end are both under it.
    if (tiles.length > 1) {
      const rise = max - min;
      if (rise === span) return OK;
      if (rise === 0) return no('this ground is already level — steps need a step to climb');
      return no(
        `that is ${rise} levels; steps climb one at a time — terrace it, then run two flights`
      );
    }

    // A one-tile connector stands on the low ground and leans against whatever
    // is beside it. It needs exactly one level of cliff to lean on.
    const here = min;
    let best = 0;
    for (const n of NEIGHBOURS) {
      const there = this.levelAt(tiles[0][0] + n.dx, tiles[0][1] + n.dy);
      if (there === null) continue;
      const rise = Math.abs(there - here);
      if (rise === span) return OK;
      if (rise > best) best = rise;
    }
    if (best === 0) return no('nothing to climb here — steps want a step beside them');
    return no(
      `that cliff is ${best} levels; steps climb one at a time — terrace it, then run two flights`
    );
  }

  _canPaint(def, tiles) {
    const wet = WET.has(def.ground);
    // Water sits AT a level (ELEVATION.md) — a pond half a terrace up its own
    // bank is not a pond. Dry ground is happy on any slope, because there are no
    // slopes: every tile top is flat.
    if (wet && tiles.length > 1) {
      let min = Infinity;
      let max = -Infinity;
      for (const [x, y] of tiles) {
        const l = this.levels[this._i(x, y)];
        if (l < min) min = l;
        if (l > max) max = l;
      }
      if (min !== max) return no('water will not lie on a step — level the ground first');
    }
    for (const [x, y] of tiles) {
      const sitting = this.objectAt(x, y);
      if (!sitting) continue;
      const other = byId(sitting.id);
      const needs = other ? other.requires : 'land';
      // Refuse rather than drown or strand something. Nothing is ever taken.
      if (wet && needs === 'land') {
        return no(`the ${other ? other.name.toLowerCase() : 'thing'} standing there would be under water`);
      }
      if (!wet && needs === 'water') {
        return no(`the ${other ? other.name.toLowerCase() : 'thing'} standing there needs its water`);
      }
    }
    return OK;
  }

  // -------------------------------------------------------------------------
  // Editing. Free, instant, always undoable.
  // -------------------------------------------------------------------------

  /**
   * Place a placeable (or paint ground, if it is a painter). Returns the placed
   * object, the list of painted tiles, or null if refused. Use `canPlace` first
   * if you want the reason.
   */
  place(defOrId, tx, ty, opts = {}) {
    const def = typeof defOrId === 'string' ? byId(defOrId) : defOrId;
    if (!def) return null;
    if (!this.canPlace(def, tx, ty).ok) return null;

    if (isGroundPainter(def)) return this.paint(def, tx, ty);

    const uid = opts.uid ?? this.nextUid++;
    if (uid >= this.nextUid) this.nextUid = uid + 1;

    const obj = {
      uid,
      id: def.id,
      tx,
      ty,
      seed: opts.seed ?? mix32(this.seed, uid),
      placedAt: opts.placedAt ?? this.time,
      stage: null,
    };
    obj.stage = stageFor(def, 0);
    // Which way round. ABSENT WHEN ZERO, deliberately: facing 0 is "as drawn",
    // it is what every object in every existing garden is, and an undefined
    // key serialises to nothing. That is what keeps a v2 save round-tripping
    // byte for byte through v3. `def.facings` is the ceiling — a thing that
    // does not turn cannot be given a facing by a caller that forgot to check.
    const facing = clampFacing(opts.facing ?? 0, def.facings ?? 1);
    if (facing) obj.facing = facing;

    this._attach(obj, def);
    this._record({ kind: 'place', uid: obj.uid });
    this._emit({ type: 'place', object: obj, def });
    return obj;
  }

  /** Paint ground over a placeable's footprint. Returns the changed tiles. */
  paint(defOrId, tx, ty) {
    const def = typeof defOrId === 'string' ? byId(defOrId) : defOrId;
    if (!def || !isGroundPainter(def)) return null;
    if (!this.canPlace(def, tx, ty).ok) return null;

    const next = GROUND_INDEX.get(def.ground);
    const by = this._painterCode(def.id);
    const changed = [];
    for (const [x, y] of footprintTiles(def, tx, ty)) {
      const i = this._i(x, y);
      const prev = this.ground[i];
      const prevBy = this.groundBy[i];
      // The painter counts as a change even when the TYPE does not: painting a
      // still pool over a plunge pool leaves the water where it was and moves
      // the ground from the naiad to the unicorn, which is a real edit and has
      // to be undoable like any other.
      if (prev === next && prevBy === by) continue;
      this.ground[i] = next;
      this.groundBy[i] = by;
      changed.push({ tx: x, ty: y, prev, next, prevBy, nextBy: by });
    }
    if (changed.length === 0) return [];

    this._record({ kind: 'ground', changed });
    this._emit({ type: 'ground', tiles: changed.map((c) => ({ tx: c.tx, ty: c.ty })), def });
    return changed;
  }

  // -------------------------------------------------------------------------
  // TERRAIN — raise, lower, level.
  //
  // Classic builder verbs, click-and-drag, on the SAME 64-step undo stack as
  // placement. Free, unlimited, reversible: SPEC §0 and ELEVATION.md both say so
  // outright, so there is no cost parameter here to later "balance", and there
  // is deliberately nowhere to add one.
  //
  // Every op takes a region, in any of the shapes a caller naturally has:
  //
  //   raise(5, 5)                    one tile
  //   raise(3, 3, 7, 6)              a rectangle (x0,y0 is the drag anchor)
  //   raise({ x0, y0, x1, y1 })      the same, named
  //   raise([[3,3], [4,3], [4,4]])   an explicit brush path, in drag order
  //   flatten(3, 3, 7, 6, { to: 2 }) an explicit target height
  //
  // The ANCHOR — the first tile — is what `level` flattens toward, so the drag
  // reads as "everything here comes to the height of where I started".
  //
  // OBJECTS RIDE UP. An object's height is read from its tile, so nothing needs
  // to be moved and nothing can be left behind. The one thing that needs care is
  // a MULTI-TILE object: `_cohere` pulls its whole footprint into the edit and
  // `_groups` moves it all or none, so a 3x1 colonnade can never end up with one
  // end a terrace above the other.
  // -------------------------------------------------------------------------

  /** Raise a region by one level. Returns { ok, reason, changed, blocked }. */
  raise(...region) {
    return this.applyTerrain('raise', ...region);
  }

  /** Lower a region by one level. */
  lower(...region) {
    return this.applyTerrain('lower', ...region);
  }

  /** Flatten a region to the height of its first tile (or to `opts.to`). */
  flatten(...region) {
    return this.applyTerrain('level', ...region);
  }

  /** `level` reads better at some call sites; same op, same undo entry. */
  levelTo(...region) {
    return this.applyTerrain('level', ...region);
  }

  /** Set one tile's height outright. Undoable like any other terrain edit. */
  setLevel(tx, ty, level) {
    return this.applyTerrain('level', tx, ty, { to: level });
  }

  /**
   * Would this op do anything? Same answer as `applyTerrain`, without touching
   * the map — this is what the ghost preview and the disabled-tool state ask.
   */
  canTerrain(op, ...region) {
    return this._terrain(op, region, false);
  }

  /**
   * The one entry point. `op` is 'raise' | 'lower' | 'level'.
   * Returns { ok, reason, op, changed:[{tx,ty,prev,next}], blocked, tiles }.
   * `ok` false always carries a warm `reason`; it never means damage.
   */
  applyTerrain(op, ...region) {
    return this._terrain(op, region, true);
  }

  _terrain(op, region, commit) {
    if (op !== 'raise' && op !== 'lower' && op !== 'level') {
      return { ok: false, reason: 'unknown terrain tool', op, changed: [], blocked: 0 };
    }
    const { tiles, opts } = parseRegion(region);
    const inside = tiles.filter(([x, y]) => this.inBounds(x, y));
    if (inside.length === 0) {
      return { ok: false, reason: 'that is off the edge of the glade', op, changed: [], blocked: 0 };
    }

    const anchor = inside[0];
    const target =
      op === 'level'
        ? clampLevel(opts.to ?? this.levels[this._i(anchor[0], anchor[1])])
        : null;

    const groups = this._groups(this._cohere(inside));
    const changed = [];
    let blocked = 0;

    for (const group of groups) {
      let can = true;
      for (const i of group) {
        const cur = this.levels[i];
        const next = op === 'raise' ? cur + 1 : op === 'lower' ? cur - 1 : target;
        if (next > MAX_LEVEL || next < MIN_LEVEL) {
          can = false;
          break;
        }
      }
      if (!can) {
        blocked++;
        continue;
      }
      for (const i of group) {
        const cur = this.levels[i];
        const next = op === 'raise' ? cur + 1 : op === 'lower' ? cur - 1 : target;
        if (next === cur) continue;
        changed.push({ tx: i % this.w, ty: (i / this.w) | 0, prev: cur, next });
      }
    }

    if (changed.length === 0) {
      return { ok: false, reason: this._terrainNothing(op, blocked), op, changed: [], blocked };
    }
    if (!commit) {
      return { ok: true, reason: null, op, changed, blocked, tiles: inside };
    }

    for (const c of changed) this.levels[this._i(c.tx, c.ty)] = c.next;

    this._record({ kind: 'level', changed });
    this._emit({ type: 'level', op, tiles: changed });
    return { ok: true, reason: null, op, changed, blocked, tiles: inside };
  }

  _terrainNothing(op, blocked) {
    if (op === 'raise') {
      return blocked
        ? 'that is already as high as the glade goes'
        : 'nothing there to raise';
    }
    if (op === 'lower') {
      return blocked ? 'that is already the floor of the glade' : 'nothing there to lower';
    }
    return 'that ground is already level';
  }

  /**
   * Grow a tile set until no multi-tile object is only half inside it. Applied
   * transitively — pulling in a colonnade can pull in a bench it overlaps
   * (it cannot: footprints never overlap), and terminates in any case because
   * the set only ever grows and the map is finite.
   */
  /**
   * Expand an edited region to include the WHOLE FOOTPRINT of every object it
   * touches, so an object can never be left straddling two heights or hanging
   * over a hole in its own plot.
   *
   * ---------------------------------------------------------------------------
   * IT STOPS AT THE FOOTPRINT, AND THE STOPPING IS A FEATURE. DO NOT WIDEN IT.
   *
   * The tiles an object's ART OVERHANGS — everything outside its footprint —
   * are ordinary ground and may be dug away freely, which leaves a tall thing
   * standing on a pillar with its art hanging over air. That is the Ultima
   * Online trick, players built with it, and the owner has asked for it kept
   * (2026-08-01): "a classic bug of that era that players would use creatively
   * to build things they otherwise couldn't, so i don't want it corrected."
   *
   * Do not confuse it with the floating BUG that `tools/anchor-audit.mjs`
   * hunts. That one is in ART space — a sprite drawn too high inside its own
   * bitmap, wrong wherever the player puts it. This one is in WORLD space and
   * the player asked for it. `test/world-terrain.test.mjs` holds three
   * assertions that fail if this is "fixed", and says so in full.
   */
  _cohere(tiles) {
    const set = new Set();
    const queue = [];
    for (const [x, y] of tiles) {
      const i = this._i(x, y);
      if (!set.has(i)) {
        set.add(i);
        queue.push(i);
      }
    }
    while (queue.length) {
      const i = queue.pop();
      const obj = this._occupancy.get(i);
      if (!obj) continue;
      const def = byId(obj.id);
      if (!def) continue;
      for (const [x, y] of footprintTiles(def, obj.tx, obj.ty)) {
        if (!this.inBounds(x, y)) continue;
        const j = this._i(x, y);
        if (!set.has(j)) {
          set.add(j);
          queue.push(j);
        }
      }
    }
    return set;
  }

  /**
   * Partition a cohered tile set into the units that must move together: one
   * group per multi-tile object footprint, and one group per free tile.
   */
  _groups(set) {
    const byObject = new Map();
    const out = [];
    for (const i of set) {
      const obj = this._occupancy.get(i);
      const def = obj ? byId(obj.id) : null;
      const multi = def && (def.footprint[0] > 1 || def.footprint[1] > 1);
      if (!multi) {
        out.push([i]);
        continue;
      }
      let g = byObject.get(obj.uid);
      if (!g) {
        byObject.set(obj.uid, (g = []));
        out.push(g);
      }
      g.push(i);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Connectors, after the fact.
  //
  // A terrain edit next to a stair can leave that stair reaching for a step that
  // is no longer there. NOTHING IS EVER TAKEN FROM THE PLAYER (SPEC §0), so the
  // world does not delete it and does not refuse the edit either — the stair
  // simply reads as ADRIFT until the ground comes back, which one undo or one
  // raise will do. This is a derived read-out and stores no state, so a garden
  // can never be saved in a broken condition.
  // -------------------------------------------------------------------------

  /** The step a placed connector bridges: { min, max, rise } — or null. */
  connectorSpan(obj) {
    const def = obj && byId(obj.id);
    const spec = connectorSpec(def);
    if (!spec) return null;
    const tiles = footprintTiles(def, obj.tx, obj.ty);
    let min = Infinity;
    let max = -Infinity;
    for (const [x, y] of tiles) {
      const l = this.levelAt(x, y);
      if (l === null) continue;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    if (tiles.length === 1) {
      const here = min;
      let rise = 0;
      for (const n of NEIGHBOURS) {
        const there = this.levelAt(obj.tx + n.dx, obj.ty + n.dy);
        if (there === null) continue;
        const d = Math.abs(there - here);
        if (d === (spec.span || CONNECTOR_SPAN)) return { min: here, max: here + d, rise: d };
        if (d > rise) rise = d;
      }
      return { min: here, max: here + rise, rise };
    }
    return { min, max, rise: max - min };
  }

  /** True when a placed connector still bridges exactly its own span. */
  connectorSound(obj) {
    const spec = connectorSpec(byId(obj && obj.id));
    if (!spec) return true;
    const s = this.connectorSpan(obj);
    return !!s && s.rise === (spec.span || CONNECTOR_SPAN);
  }

  /** Every connector the land has stopped agreeing with. Advisory, for the UI. */
  adriftConnectors() {
    return this.objects.filter((o) => isConnector(byId(o.id)) && !this.connectorSound(o));
  }

  /** Remove whatever object occupies a tile. Free and instant. */
  removeAt(tx, ty) {
    const obj = this.objectAt(tx, ty);
    return obj ? this.remove(obj.uid) : null;
  }

  /**
   * Turn a thing that is already standing in the garden. Returns the new
   * facing, or null if there was nothing there or it does not turn.
   *
   * THE OWNER: *"rotate is still not implemented for mobile. perhaps if you tap
   * on the completed building with the build tool it rotates the object."*
   *
   * Until now a facing could only be chosen BEFORE placing — the wheel turns
   * what you are holding — and a phone has no wheel, so on a phone every hedge
   * went down facing whichever way it was drawn and stayed that way for ever.
   *
   * WHY THIS IS SAFE, AND WHY IT DOES NOT NEED `canPlace`. A facing in this
   * game is a MIRROR and/or a swap to the back drawing — `facingMirrored` and
   * `facingDrawing` in iso.js — and never a 90-degree rotation. `FACINGS` is 4
   * and none of the four changes the footprint. So a thing that fitted where it
   * stands still fits when it is turned: there is no tile to re-check, no
   * neighbour to re-ask, and no way for this to leave the garden in a state
   * `place` would have refused. If a future facing ever DID rotate a footprint,
   * this is the method that has to grow a legality check, and iso.js §FACING is
   * the note that would have to change first.
   *
   * Undoable like every other edit, on the same 64-step stack.
   */
  turn(uid, delta = 1) {
    const obj = this._byUid.get(uid);
    if (!obj) return null;
    const def = byId(obj.id);
    const n = Math.max(1, Math.min(FACINGS, (def && def.facings) || 1));
    if (n < 2) return null; // a thing with one drawing cannot be turned
    const from = clampFacing(obj.facing ?? 0, n);
    const to = clampFacing(from + delta, n);
    if (to === from) return null;
    // ABSENT WHEN ZERO, matching `place` — the save format writes `facing` only
    // when it is non-zero, and a stray `facing: 0` would make a v3 save differ
    // byte for byte from the one that produced it.
    if (to) obj.facing = to;
    else delete obj.facing;
    this._record({ kind: 'turn', uid, from, to });
    this._emit({ type: 'turn', object: obj, def });
    return to;
  }

  /** Turn whatever stands on a tile. Returns the new facing, or null. */
  turnAt(tx, ty, delta = 1) {
    const obj = this.objectAt(tx, ty);
    return obj ? this.turn(obj.uid, delta) : null;
  }

  /** Remove by uid. Returns the removed object, or null. */
  remove(uid) {
    const obj = this._byUid.get(uid);
    if (!obj) return null;
    const def = byId(obj.id);
    this._detach(obj, def);
    this._record({ kind: 'remove', object: { ...obj } });
    this._emit({ type: 'remove', object: obj, def });
    return obj;
  }

  _attach(obj, def) {
    this.objects.push(obj);
    this._byUid.set(obj.uid, obj);
    for (const [x, y] of footprintTiles(def, obj.tx, obj.ty)) {
      this._occupancy.set(this._i(x, y), obj);
    }
  }

  _detach(obj, def) {
    const at = this.objects.indexOf(obj);
    if (at !== -1) this.objects.splice(at, 1);
    this._byUid.delete(obj.uid);
    for (const [x, y] of footprintTiles(def, obj.tx, obj.ty)) {
      if (this._occupancy.get(this._i(x, y)) === obj) this._occupancy.delete(this._i(x, y));
    }
  }

  // -------------------------------------------------------------------------
  // Undo — bounded at 64 steps (SPEC §0). In-memory; not part of the save.
  // -------------------------------------------------------------------------

  /**
   * Group several edits into one undo step — a drag-painted path should undo
   * as the path the player drew, not one tile at a time.
   *   world.batch(() => { for (const t of path) world.paint('gravel-walk', ...); });
   */
  batch(fn) {
    if (this._batch) return fn(); // already batching; keep the outer group
    this._batch = [];
    try {
      return fn();
    } finally {
      const ops = this._batch;
      this._batch = null;
      if (ops.length === 1) this._push(ops[0]);
      else if (ops.length > 1) this._push({ kind: 'batch', ops });
    }
  }

  _record(op) {
    if (this._batch) this._batch.push(op);
    else this._push(op);
  }

  _push(op) {
    this.undoStack.push(op);
    while (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  /** Undo the last edit. Returns true if anything was undone. */
  undo() {
    const op = this.undoStack.pop();
    if (!op) return false;
    this._invert(op);
    this._emit({ type: 'undo', op });
    return true;
  }

  _invert(op) {
    switch (op.kind) {
      case 'batch':
        for (let i = op.ops.length - 1; i >= 0; i--) this._invert(op.ops[i]);
        break;
      case 'place': {
        const obj = this._byUid.get(op.uid);
        if (obj) {
          this._detach(obj, byId(obj.id));
          this._emit({ type: 'remove', object: obj, def: byId(obj.id) });
        }
        break;
      }
      case 'turn': {
        const obj = this._byUid.get(op.uid);
        if (obj) {
          if (op.from) obj.facing = op.from;
          else delete obj.facing;
          this._emit({ type: 'turn', object: obj, def: byId(obj.id) });
        }
        break;
      }
      case 'remove': {
        // Restored whole: same uid, same seed, same planting time, same stage.
        // A tree you removed and put back is the same tree, not a new one.
        const obj = { ...op.object };
        const def = byId(obj.id);
        if (def) {
          this._attach(obj, def);
          if (obj.uid >= this.nextUid) this.nextUid = obj.uid + 1;
          this._emit({ type: 'place', object: obj, def });
        }
        break;
      }
      case 'ground': {
        const tiles = [];
        for (const c of op.changed) {
          const i = this._i(c.tx, c.ty);
          this.ground[i] = c.prev;
          // Undo the painter too, or an undone still-pool leaves the water
          // behind still arguing for the unicorn.
          if (c.prevBy !== undefined) this.groundBy[i] = c.prevBy;
          tiles.push({ tx: c.tx, ty: c.ty });
        }
        this._emit({ type: 'ground', tiles, def: null });
        break;
      }
      case 'level': {
        // Terrain undo is exact — every tile goes back to the height it held,
        // and every object standing on those tiles rides back down with it,
        // because an object's height was never stored anywhere else.
        const tiles = [];
        for (const c of op.changed) {
          this.levels[this._i(c.tx, c.ty)] = c.prev;
          tiles.push({ tx: c.tx, ty: c.ty, prev: c.next, next: c.prev });
        }
        this._emit({ type: 'level', op: 'undo', tiles });
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Garden time and growth. Forward only.
  // -------------------------------------------------------------------------

  /** Age of an object in garden-days. */
  ageDays(obj) {
    return (this.time - obj.placedAt) / DAY_MS;
  }

  /**
   * Advance the garden clock and move plants along their growth ladders.
   * Pass a real-clock ms reading (`performance.now()` or `Date.now()`); the
   * delta is clamped at both ends so a slept tab or a clock jump cannot make
   * time run backwards or leap absurdly.
   *
   * Returns the transitions that happened: [{ uid, id, from, to }].
   */
  tick(realNow) {
    if (this._lastReal === null) {
      this._lastReal = realNow;
      return this.grow();
    }
    let dt = realNow - this._lastReal;
    this._lastReal = realNow;
    if (!(dt > 0)) dt = 0;
    if (dt > MAX_TICK_MS) dt = MAX_TICK_MS;
    return this.advance(dt);
  }

  /** Advance the garden clock by an explicit number of ms. Tests use this. */
  advance(dtMs) {
    if (!(dtMs > 0)) return [];
    this.time += dtMs;
    return this.grow();
  }

  /** Recompute every growth stage. Idempotent, and can only move forward. */
  grow() {
    const changes = [];
    for (const obj of this.objects) {
      const def = byId(obj.id);
      if (!def || !def.growth) continue;
      const next = stageFor(def, this.ageDays(obj));
      if (next !== obj.stage) {
        const from = obj.stage;
        obj.stage = next;
        changes.push({ uid: obj.uid, id: obj.id, from, to: next });
      }
    }
    if (changes.length) this._emit({ type: 'grow', changes });
    return changes;
  }

  // -------------------------------------------------------------------------
  // Save / load
  // -------------------------------------------------------------------------

  /**
   * Plain JSON, round-trippable. Ground and grass are each stored with their own
   * legend so a future reorder of either list still loads old gardens correctly.
   *
   * v2 adds `levels` and the grass cache. Both are plain arrays of small
   * integers: 400 tiles costs well under a kilobyte each, which keeps the save
   * inside the "small enough to write continuously" budget the tests assert.
   */
  serialize(realNow = Date.now()) {
    return {
      app: 'arcadia',
      version: SAVE_VERSION,
      savedAt: realNow,
      seed: this.seed,
      time: Math.round(this.time),
      w: this.w,
      h: this.h,
      groundTypes: [...GROUND_TYPES],
      ground: Array.from(this.ground),
      // Which placeable painted each tile. A legend of ids plus one index per
      // tile, so the catalogue can be reordered freely. Both keys are OPTIONAL
      // on the way back in: a garden without them is not damaged, it simply
      // does not remember which of the seven water brushes made its pond, and
      // the loader says so once rather than per tile.
      groundPainters: [...this.groundPainters],
      groundBy: Array.from(this.groundBy),
      // Elevation. `maxLevel` travels with it so a save made when the ceiling
      // was six can be recognised if the ceiling ever moves.
      maxLevel: MAX_LEVEL,
      levels: Array.from(this.levels),
      // The grass cache. Derived, and safe to drop — a loader that ignores these
      // two keys loses nothing but one frame of colour.
      grassTypes: [...GRASS_TYPES],
      grass: Array.from(this.grass),
      grassAlt: Array.from(this.grassAlt),
      objects: this.objects.map((o) => {
        const rec = {
          uid: o.uid,
          id: o.id,
          tx: o.tx,
          ty: o.ty,
          seed: o.seed,
          placedAt: Math.round(o.placedAt),
          stage: o.stage,
        };
        // Only when turned. See SAVE_VERSION: this one `if` is what makes a
        // v3 save of an untouched garden identical to its v2 save.
        if (o.facing) rec.facing = o.facing;
        return rec;
      }),
      nextUid: this.nextUid,
      extra: this.extra,
    };
  }

  /**
   * Rebuild a world from serialised JSON. Never throws on a damaged save and
   * never discards more than it must: an object whose id is no longer in the
   * catalogue is skipped and named in `world.loadWarnings`, and everything else
   * still loads. Losing a garden is the one unrecoverable thing in a cosy game.
   *
   * `realNow` credits time spent away, so a glade matures while you are gone.
   */
  static deserialize(data, realNow = Date.now()) {
    const warnings = [];
    if (!data || typeof data !== 'object') return null;
    if (data.app !== undefined && data.app !== 'arcadia') return null;

    const version = Number(data.version) || 0;
    if (version > SAVE_VERSION) {
      warnings.push(`this garden was saved by a newer version (${version})`);
    }

    const world = new World({
      w: Number(data.w) || MAP_W,
      h: Number(data.h) || MAP_H,
      seed: Number.isFinite(data.seed) ? data.seed : undefined,
      time: Number(data.time) || 0,
    });

    // Ground, translated through the save's own legend.
    const legend = Array.isArray(data.groundTypes) ? data.groundTypes : GROUND_TYPES;
    const raw = Array.isArray(data.ground) ? data.ground : [];
    const fallback = GROUND_INDEX.get(DEFAULT_GROUND) ?? 0;
    for (let i = 0; i < world.ground.length; i++) {
      const name = legend[raw[i]];
      const idx = GROUND_INDEX.get(name);
      world.ground[i] = idx === undefined ? fallback : idx;
    }

    // Which placeable painted each tile — same shape, same forgiveness. Both
    // keys are optional: a garden saved before painters were recorded loads
    // with every tile marked "unrecorded", which is honest rather than wrong,
    // and consumers fall back to the ground type exactly as they always did.
    // An id no longer in the catalogue is kept in the legend and simply never
    // resolves, so re-saving does not quietly rewrite the player's history.
    const painters = Array.isArray(data.groundPainters) ? data.groundPainters : null;
    const by = Array.isArray(data.groundBy) ? data.groundBy : null;
    if (painters && by) {
      world.groundPainters = painters.filter((id) => typeof id === 'string');
      const max = world.groundPainters.length;
      for (let i = 0; i < world.groundBy.length; i++) {
        const code = by[i] | 0;
        world.groundBy[i] = code > 0 && code <= max ? code : 0;
      }
      if (by.length < world.groundBy.length) {
        warnings.push('part of the garden did not record what painted it');
      }
    }

    // ---- MIGRATION, v1 -> v2 -------------------------------------------------
    // A garden saved before elevation existed is a FLAT garden, and that is a
    // complete, correct answer rather than a compromise: level 0 everywhere is
    // exactly the map the player was looking at. Any missing, short, ragged or
    // out-of-range `levels` array degrades to the same thing per tile, so a
    // half-written save still opens.
    const rawLevels = Array.isArray(data.levels) ? data.levels : null;
    if (rawLevels) {
      for (let i = 0; i < world.levels.length; i++) world.levels[i] = clampLevel(rawLevels[i]);
      if (rawLevels.length < world.levels.length) {
        warnings.push('part of the garden had no recorded height and was laid flat');
      }
    }
    // Anything above a ceiling that has since come DOWN is clamped by
    // clampLevel, and a garden is never refused for it — say so and move on.
    if (Number(data.maxLevel) > MAX_LEVEL) {
      warnings.push(`this garden had ${data.maxLevel} levels; its highest ground was brought down`);
    }

    // The grass cache. It is derived state, so a save without it is not damaged
    // and never warns — fields.js recomputes it on the first pass.
    const grassLegend = Array.isArray(data.grassTypes) ? data.grassTypes : GRASS_TYPES;
    const rawGrass = Array.isArray(data.grass) ? data.grass : null;
    const rawAlt = Array.isArray(data.grassAlt) ? data.grassAlt : null;
    if (rawGrass) {
      for (let i = 0; i < world.grass.length; i++) {
        const idx = GRASS_INDEX.get(grassLegend[rawGrass[i]]);
        world.grass[i] = idx === undefined ? 0 : idx;
        const altRaw = rawAlt ? rawAlt[i] : 0;
        const alt = altRaw ? GRASS_INDEX.get(grassLegend[altRaw - 1]) : undefined;
        world.grassAlt[i] = alt === undefined ? 0 : alt + 1;
      }
    }

    // Objects.
    for (const o of Array.isArray(data.objects) ? data.objects : []) {
      const def = byId(o && o.id);
      if (!def) {
        warnings.push(`unknown placeable '${o && o.id}' skipped`);
        continue;
      }
      if (!world.inBounds(o.tx, o.ty)) {
        warnings.push(`'${o.id}' was off the map and was skipped`);
        continue;
      }
      const obj = {
        uid: Number(o.uid) || world.nextUid,
        id: def.id,
        tx: o.tx | 0,
        ty: o.ty | 0,
        seed: Number.isFinite(o.seed) ? o.seed >>> 0 : mix32(world.seed, Number(o.uid) || 0),
        placedAt: Number(o.placedAt) || 0,
        stage: o.stage ?? null,
      };
      // v3. Absent (every v1 and v2 garden, and everything never turned) means
      // 0, which is as drawn. Clamped against the CURRENT catalogue, so a
      // placeable that stops turning does not leave objects mirrored forever.
      const facing = clampFacing(o.facing ?? 0, def.facings ?? 1);
      if (facing) obj.facing = facing;
      world._attach(obj, def);
      if (obj.uid >= world.nextUid) world.nextUid = obj.uid + 1;
    }
    if (Number(data.nextUid) > world.nextUid) world.nextUid = Number(data.nextUid);

    world.extra = data.extra && typeof data.extra === 'object' ? data.extra : {};

    // Credit time away — the world repays waiting.
    const away = Number(realNow) - Number(data.savedAt);
    if (Number.isFinite(away) && away > 0) {
      world.time += Math.min(away, MAX_OFFLINE_MS);
    }
    world.grow();

    world.loadWarnings = warnings;
    return world;
  }

  /** Continuous autosave target. Silent no-op with no storage available. */
  save(storage = defaultStorage(), key = SAVE_KEY) {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(this.serialize()));
      return true;
    } catch {
      return false; // quota, private mode, disabled storage — never throw.
    }
  }

  /** Load the autosave, or null if there is not one. Never throws. */
  static load(storage = defaultStorage(), key = SAVE_KEY, realNow = Date.now()) {
    if (!storage) return null;
    let text;
    try {
      text = storage.getItem(key);
    } catch {
      return null;
    }
    if (!text) return null;
    try {
      return World.deserialize(JSON.parse(text), realNow);
    } catch {
      return null;
    }
  }

  /** Forget the autosave. Only ever called from an explicit player action. */
  static clearSave(storage = defaultStorage(), key = SAVE_KEY) {
    if (!storage) return false;
    try {
      storage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Read-outs
  // -------------------------------------------------------------------------

  /** Counts by group and by ground type — for the playtest harness. */
  stats() {
    const byGroupCount = {};
    for (const o of this.objects) {
      const def = byId(o.id);
      if (!def) continue;
      byGroupCount[def.group] = (byGroupCount[def.group] || 0) + 1;
    }
    const groundCount = {};
    for (const g of GROUND_TYPES) groundCount[g] = 0;
    for (let i = 0; i < this.ground.length; i++) groundCount[GROUND_TYPES[this.ground[i]]]++;

    const levelCount = new Array(MAX_LEVEL + 1).fill(0);
    let relief = 0;
    for (let i = 0; i < this.levels.length; i++) {
      levelCount[this.levels[i]]++;
      if (this.levels[i] > relief) relief = this.levels[i];
    }
    const grassCount = {};
    for (const g of GRASS_TYPES) grassCount[g] = 0;
    let contested = 0;
    for (let i = 0; i < this.grass.length; i++) {
      grassCount[GRASS_TYPES[this.grass[i]]]++;
      if (this.grassAlt[i]) contested++;
    }

    return {
      objects: this.objects.length,
      byGroup: byGroupCount,
      ground: groundCount,
      levels: levelCount,
      relief, // the highest ground in the glade
      grass: grassCount,
      contested,
      waterfalls: this.waterfalls().length,
      adrift: this.adriftConnectors().length,
      days: this.time / DAY_MS,
      undoDepth: this.undoStack.length,
    };
  }
}

/** localStorage where it exists, null in Node and in locked-down browsers. */
export function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Convenience: the autosaved garden, or a fresh empty one.
 *
 * Called both as `loadOrCreate({ seed })` and as
 * `loadOrCreate(storage, key, { seed })` — the test suite uses the second form
 * — so it sniffs its first argument rather than making either caller wrong.
 * It must ALWAYS hand back a world; never losing a garden is the floor.
 */
export function loadOrCreate(a = {}, b = SAVE_KEY, c = {}) {
  const looksLikeStorage = a && typeof a.getItem === 'function';
  const storage = looksLikeStorage ? a : defaultStorage();
  const key = looksLikeStorage ? b : SAVE_KEY;
  const opts = looksLikeStorage ? c : a;
  return World.load(storage, key) ?? new World(opts || {});
}
