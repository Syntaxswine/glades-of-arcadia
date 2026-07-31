// creatures.js — who comes to live in the glade, and what it takes.
//
// Five: satyr, centaur, naiad, unicorn, and Pan, who is hidden until he isn't.
//
// THE LADDER, four rungs:
//
//   sighted   a trace only — cloven prints, a torn vine, a note on the pipes
//   visits    walks in at its own hour, wanders, leaves. RENDERED DESATURATED.
//   settles   stays. Gains colour and a name. The journal entry fills.
//   thrives   a second individual keeps it company
//
// THE TRICK WE ARE STEALING (Viva Pinata, and RESEARCH section C.1a): the
// creature ARRIVES BEFORE IT IS EARNED. Once a creature is sighted and the
// visiting requirements are roughly half met, a colourless one walks in at dusk,
// wanders the best patch you have, and walks out again. That ghost is the whole
// hint system. It converts an unmet requirement from a debt into an invitation,
// and it means we never have to write a tutorial.
//
// THE REQUIREMENT TYPES, per SPEC section 7 as restated by docs/ZONING.md
// ("Creature requirements, restated"):
//
//   patch(n)               A CONTIGUOUS PATCH OF ITS OWN GRASS, n tiles of it.
//                          This REPLACES the old axis-band requirement. Grass
//                          type answers "whose ground is this?", which is the
//                          question `wildness`/`order`/`moisture` used to be
//                          three clumsy answers to.
//   atLeast(tag, n, r)     a count of a tag within a radius. Discrete, so the
//                          journal shows it exactly: "2 of 3 ash trees".
//   atMost(tag, n, r)      the repulsions. Walls, straight edges, wine.
//   band(axis, ...)        the two CONDITIONS that survive the zoning rework —
//                          `seclusion` and `maturity`. Soft-edged and
//                          satisficing: `ideal` is enough and past it MORE DOES
//                          NOTHING, which is what stops the map collapsing into
//                          one optimal tiling.
//   presence(species)      another species settled nearby.
//   near(feature, n, r)    a TERRAIN feature — waterfall, pool, cliff, hollow.
//                          Reads the elevation model (docs/ELEVATION.md), not
//                          the catalogue. Degrades to met where there is no
//                          elevation model to ask.
//   seam()                 Pan's, and only Pan's: he settles on CONTESTED
//                          ground, the seam between two species' grass. He is
//                          the one creature for whom the unresolved tile is
//                          home rather than a refusal.
//   beat(id)               exactly one behavioural requirement, on `settles`,
//                          which the player WATCHES HAPPEN. Not computed.
//
// THE DESIGN THESIS, which this file is responsible for enforcing: the satyr
// wants the un-worked hill and the unicorn wants the made garden, and they
// cannot both be housed in one place. See THESIS and proveThesis() at the
// bottom. There are now TWO independent guarantees and each is unconditional:
//
//   1. THE GRASS LEMMA. A tile resolves to exactly one grass type, and every
//      creature requires a patch of ITS OWN. No two species can ever settle on
//      the same tile — for any pair, not only this one. Free, and it is the
//      zoning model doing the work the old axis bands failed at.
//   2. THE ENCLOSURE LEMMA. The unicorn needs a wall within 3 tiles; the satyr
//      forbids one within 6; 3 + sigma = 5.5 < 6. Triangle inequality, so the
//      two homes are at least 3 tiles apart in every possible garden.
//
// (The old note stands as history: axis bands alone did NOT close this. A
// packing measured against this kernel reaches wildness 20 at one point while
// holding it under 1.5 two and a half tiles away. Geometry closes it; numbers
// did not.)
//
// COSY GUARANTEES this file must not break, and the floor is ABSOLUTE:
//   - a settled creature NEVER leaves the garden. Ever. Contested ground does
//     not evict: the creature becomes visibly restless and walks to the nearest
//     tile of its own grass. If there is none left anywhere it stays where it
//     is and looks unhappy. It does not walk off the map and it never can.
//   - a rung, once reached, is never lost. The journal never un-fills.
//   - nothing here produces a score, a percentage, or a rating for the UI.
//
// Pure and DOM-free. Imports cleanly in Node.

import { AXES, SIGMA, AXIS_META } from './fields.js';

export const RUNGS = Object.freeze(['sighted', 'visits', 'settles', 'thrives']);
const RUNG_INDEX = Object.freeze({ unknown: -1, sighted: 0, visits: 1, settles: 2, thrives: 3 });

/** Length of a garden day in seconds, for the default time-of-day clock. */
export const DAY_SECONDS = 480;

/** How far a settled creature ranges around its home tile. */
const HOME_RADIUS = 4;

/** A ghost visit needs this much of the visiting rung before it will show up. */
const PREVIEW_MIN = 0.45;

/** Full re-evaluation cadence, in garden seconds. Nothing scans per frame. */
const RESCAN_SECONDS = 1.5;

// ---------------------------------------------------------------------------
// A tiny deterministic RNG. No Math.random anywhere in this file — a creature
// that wanders differently on reload would break save/load round-trips.
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/**
 * A soft-edged, satisficing band on a habitat axis.
 *
 * `min`     below this the requirement reads as zero
 * `ideal`   at this it is MET, and going further does nothing at all
 * `max`     an optional upper bound — met while at or under it
 * `ceiling` where the upper bound has decayed to zero (default max + 3)
 *
 * Satisficing is load-bearing. RESEARCH section C.3 names "the tyranny of the
 * optimal" and its cure: once the band is met, more is not better, so there is
 * no single best garden to converge on.
 */
export function band(axis, spec) {
  const { min = null, ideal = null, max = null, ceiling = null, why = '' } = spec;
  const hardCeiling = ceiling != null ? ceiling : max != null ? max + 3 : null;
  return Object.freeze({
    kind: 'axis',
    axis,
    min,
    ideal,
    max,
    ceiling: hardCeiling,
    why,
    evaluate(ctx) {
      const v = ctx.field(axis);
      let lo = 1;
      let hi = 1;
      if (ideal != null) {
        const floor = min != null ? min : ideal - 3;
        lo = ideal <= floor ? (v >= ideal ? 1 : 0) : smoothstep((v - floor) / (ideal - floor));
      }
      if (max != null) {
        hi = v <= max ? 1 : 1 - smoothstep((v - max) / (hardCeiling - max));
      }
      const score = Math.min(lo, hi);
      const met = (ideal == null || v >= ideal - 1e-9) && (max == null || v <= max + 1e-9);
      return { score, met, value: v };
    },
  });
}

/** At least `n` placements carrying `tag` within `radius` tiles. */
export function atLeast(tag, n, radius, label = null) {
  return Object.freeze({
    kind: 'count',
    dir: 'at-least',
    tag,
    n,
    radius,
    label: label || tag.replace(/-/g, ' '),
    evaluate(ctx) {
      const have = ctx.count(tag, radius);
      return { score: n === 0 ? 1 : Math.min(1, have / n), met: have >= n, have, need: n };
    },
  });
}

/**
 * At most `n` placements carrying `tag` within `radius` tiles. This is where
 * the repulsions live — walls for the satyr, gates for the centaur, the pipe
 * that steals the naiad's water, the krater the alicorn exists to purify.
 *
 * COUNTED THROUGH THE BARRIERS, unlike `atLeast`. An at-least count asks about
 * the wood ("are there three ash trees near me"), and a screen does not
 * un-plant an ash. An at-most count asks about the PLACE ("is there a wall
 * oppressing me"), and screening a thing off is the oldest answer in gardening
 * — it is why DECOR.md's nullifiers exist and why ELEVATION.md can promise that
 * terracing zones a garden "without the player placing a single hedge".
 *
 * Without this, that promise held for the grass and failed for exactly the
 * requirements that make satyr and unicorn incompatible: the player screens off
 * the colonnade, watches the ground correctly turn back to thicket, and the
 * satyr still refuses with nothing on the card to explain it. See
 * `fields.countGridOccluded`. On open ground the two counts are identical, so
 * the design thesis is unaffected — the tension is unchanged, and only the
 * release valve the docs describe is now actually connected.
 */
export function atMost(tag, n, radius, label = null) {
  return Object.freeze({
    kind: 'count',
    dir: 'at-most',
    tag,
    n,
    radius,
    occluded: true,
    label: label || tag.replace(/-/g, ' '),
    evaluate(ctx) {
      const have = ctx.count(tag, radius, { occluded: true });
      const over = Math.max(0, have - n);
      return { score: over === 0 ? 1 : Math.max(0, 1 - over / 3), met: over === 0, have, need: n };
    },
  });
}

/**
 * Another species settled within `radius` (null radius = anywhere on the map).
 * A creature merely visiting counts half — enough to move the tells along, not
 * enough to satisfy.
 */
export function presence(species, radius = 8) {
  return Object.freeze({
    kind: 'presence',
    species,
    radius,
    evaluate(ctx) {
      const other = ctx.other(species);
      if (!other || other.rungIndex < RUNG_INDEX.visits) return { score: 0, met: false, species };
      if (other.rungIndex < RUNG_INDEX.settles) return { score: 0.5, met: false, species };
      if (radius == null) return { score: 1, met: true, species };
      if (!other.home) return { score: 0.5, met: false, species };
      const d = Math.hypot(other.home.tx - ctx.tx, other.home.ty - ctx.ty);
      return { score: d <= radius ? 1 : Math.max(0, 1 - (d - radius) / 6), met: d <= radius, species, distance: d };
    },
  });
}

/**
 * The behavioural requirement. Exactly one per creature, on the `settles` rung.
 * It is not satisfied by a layout; it is satisfied by the creature doing the
 * thing, in front of you, at its own hour. That is what makes settling feel
 * earned rather than computed.
 */
export function beat(id) {
  return Object.freeze({
    kind: 'behaviour',
    beat: id,
    evaluate(ctx) {
      if (ctx.hasBeat(id)) return { score: 1, met: true, beat: id, ready: true };
      const ready = ctx.beatSiteReady(id);
      return { score: ready ? 0.5 : 0, met: false, beat: id, ready };
    },
  });
}

// ===========================================================================
// GRASS-TYPE ZONING  (docs/ZONING.md)
//
// Five grass types. Four of them belong to a creature; `meadow` belongs to
// nobody and is where every garden starts.
//
// The whole mechanic in one sentence: **the zoning stops being an overlay you
// toggle and becomes the ground itself.** A creature settles on its own grass
// or it does not settle.
//
// This module PREFERS the host's zoning model when there is one — if
// `fields.grassAt(tx,ty)` exists we read it and compute nothing. The engine
// below is the fallback, so the ladder works the day the requirements land
// rather than the day the terrain owner ships. Both answer the same question
// and the requirement code cannot tell which one replied.
// ===========================================================================

/** The five grass types, in the canonical order of docs/ZONING.md. */
export const GRASS_TYPES = Object.freeze(['meadow', 'thicket', 'sward', 'fen', 'millefleurs']);

/** Whose ground is whose. `meadow` is nobody's, which is the point of it. */
export const GRASS_FOR = Object.freeze({
  satyr: 'thicket',
  centaur: 'sward',
  naiad: 'fen',
  unicorn: 'millefleurs',
  pan: null, // the seam creature. See seam().
});
export const SPECIES_FOR_GRASS = Object.freeze({
  thicket: 'satyr',
  sward: 'centaur',
  fen: 'naiad',
  millefleurs: 'unicorn',
});

/** DECOR.md's fixed numbering: 1 satyr · 2 centaur · 3 naiad · 4 unicorn. */
export const AFFINITY_NUMBER = Object.freeze({ satyr: 1, centaur: 2, naiad: 3, unicorn: 4 });
export const AFFINITY_ORDER = Object.freeze(['satyr', 'centaur', 'naiad', 'unicorn']);

/** DECOR.md: breadth costs strength, or the optimal garden is all triples. */
export const AFFINITY_WEIGHT = Object.freeze([0, 1.0, 0.7, 0.5, 0.35]);

/** Below this nothing has claimed the tile and it stays `meadow`. */
export const CLAIM_FLOOR = 0.8;

/**
 * Contested when the leader's margin over the runner-up is proportionally
 * small. PROPORTIONAL, not absolute, per ZONING.md: two against three should be
 * able to tie at a boundary, twenty against twenty-one should not read as
 * contested across a whole meadow.
 */
export const CONTEST_EPS = 0.18;

/** Influence decay per tile of (occluder-respecting) path distance. */
const DECAY_PER_TILE = 0.62;

/** Below this a source has stopped mattering and its flood fill stops. */
const MIN_INFLUENCE = 0.04;

/**
 * ELEVATION.md: a step of this many levels blocks influence outright, and is
 * also the step a creature cannot walk without a connector. Terraces are
 * nullifiers, which is the free synthesis that document points out — the
 * elevation request and the nullifier request turn out to be one system.
 *
 * NOTE that js/fields.js owns the authoritative `LEVEL_BLOCK` and this must
 * agree with it. It is not imported because creatures.js reads a level model
 * that may come from fields OR from world OR from neither, and a constant that
 * silently disappears with its module is worse than one that is stated twice
 * and checked. There is deliberately no MAX_LEVEL here: nothing in this file
 * needs to know how high the map goes, and a second copy of that number would
 * be a second thing to keep in step for no benefit.
 */
export const TERRACE_BLOCK = 2;

/**
 * The fallback tag -> affinity table.
 *
 * The catalogue is the authority: a placeable that declares `affinity:
 * ['satyr','naiad']` (or `[1,3]`) is read straight off. This table is what we
 * fall back to for anything that has not been given one yet, and it is a
 * transcription of docs/DECOR.md Part I, mapped onto the tag vocabulary
 * js/catalog.js already ships. Every entry here is one of the sourced items in
 * that document — the wild vine is the Cyclops diagnostic, the cave is Hymn to
 * Aphrodite 262-63, the lily pool is the alicorn legend.
 */
export const AFFINITY_BY_TAG = Object.freeze({
  // 1 · satyr, alone
  vine: ['satyr'],
  ivy: ['satyr'],
  dionysiac: ['satyr'],
  wild: ['satyr'],
  // 2 · centaur, alone
  ash: ['centaur'],
  centaury: ['centaur'],
  physic: ['centaur'],
  timber: ['centaur'],
  uncut: ['centaur'],
  // 3 · naiad, alone
  reed: ['naiad'],
  votive: ['naiad'],
  marsh: ['naiad'],
  // 4 · unicorn, alone
  'white-flower': ['unicorn'],
  millefleurs: ['unicorn'],
  maiden: ['unicorn'],
  'still-water': ['unicorn'],
  // 1,2 — the wine link (Apollodorus 2.5.4: the jar Dionysos left with them)
  wine: ['satyr', 'centaur'],
  pine: ['satyr', 'centaur'],
  // 1,3 — silenoi and nymphs "in the depths of pleasant caves"
  cave: ['satyr', 'naiad'],
  'spring-head': ['satyr', 'naiad'],
  grotto: ['satyr', 'naiad'],
  // 1,4 — the hard pair: wild AND white
  'old-growth': ['satyr', 'unicorn'],
  // 2,3 — where the run meets the water
  'water-loving': ['centaur', 'naiad'],
  plane: ['centaur', 'naiad'],
  poplar: ['centaur', 'naiad'],
  // 2,4 — both equine
  fruit: ['centaur', 'unicorn'],
  'open-ground': ['centaur', 'unicorn'],
  greensward: ['centaur', 'unicorn'],
  // 3,4 — both want the water pure
  willow: ['naiad', 'unicorn'],
  fountain: ['naiad', 'unicorn'],
  'running-water': ['naiad', 'unicorn'],
  // triples — the junction pieces
  syrinx: ['satyr', 'centaur', 'naiad'], // "to Pan and the Nymphs", attested
  oak: ['satyr', 'centaur', 'unicorn'], // big, old, wild; no water, so no naiad
  shade: ['satyr', 'naiad', 'unicorn'], // the fern grotto register
  quiet: ['centaur', 'naiad', 'unicorn'], // the civil three; too tended for him
  // and the antidote bed, which is the tapestry's own planting
  antidote: ['unicorn'],
});

/**
 * Tags that make a tile an OCCLUDER. Per DECOR.md a nullifier does not emit
 * negative influence — that digs a dead crater. It BLOCKS PROPAGATION, which is
 * why the shape of a planting matters and not only the count, and why two
 * species can sit one tile apart with a hedge between them.
 */
export const NULLIFIER_TAGS = Object.freeze(['nullifier', 'enclosure', 'straight-edge', 'tilled']);

/** Terrain features `near()` can ask about. Not catalogue tags — see near(). */
export const TERRAIN_FEATURES = Object.freeze(['waterfall', 'pool', 'cliff', 'hollow', 'summit', 'connector']);

/**
 * Things this module ships deliberately unfinished, named here rather than in a
 * comment nobody greps. Same convention as js/fields.js: placeholder, note,
 * move on. None of these blocks anything; each is a later layer.
 */
export const NEEDS_DESIGN = Object.freeze([
  Object.freeze({
    id: 'restless-and-unhappy-poses',
    needsDesign: true,
    note:
      'Agent.view() reports mood: content | restless | unhappy, and the ladder ' +
      'drives it correctly — a creature whose ground goes contested is restless ' +
      'while it walks, and stranded-with-nowhere-of-its-own is unhappy and stands ' +
      'still. There are no FRAMES for either yet, so both currently draw the idle ' +
      'pose. The art wants: restless = weight-shifting and glancing about, a fidget ' +
      'on the existing idle skeleton; unhappy = head down, still, no idle bob at ' +
      'all. Stillness is the cheaper and the better of the two — an unhappy ' +
      'creature that stops moving reads instantly beside four that have not.',
  }),
  Object.freeze({
    id: 'seam-legibility-for-pan',
    needsDesign: true,
    note:
      'Pan settles on CONTESTED ground (see seam()), which is mechanically clean ' +
      'and the best home the four-way problem in DECOR.md has. What is not designed ' +
      'is how the player is ever meant to GUESS that, given he is never listed, ' +
      'never silhouetted and never hinted at until sighted. The tells carry it for ' +
      'now (the pipes, the birds stopping). A stronger answer would be a tell that ' +
      'fires specifically ON a contested tile, so the trace and the requirement are ' +
      'the same fact — but that wants a tell system that knows WHERE it happened, ' +
      'which the current one does not.',
  }),
]);

const NULLIFIER_SET = new Set(NULLIFIER_TAGS);

/**
 * Read a placement's affinities as `[{ id, weight }]`, however the catalogue
 * chose to say it. Three shapes are accepted and the first one found wins:
 *
 *   affinities: { satyr: 1.0, naiad: 0.7 }   the catalogue's own shape. The
 *                                            weights ALREADY carry DECOR.md's
 *                                            breadth discount, and a negative
 *                                            one is a `lean` that repels, so
 *                                            they are used exactly as written.
 *   affinity:   ['satyr','naiad'] | [1,3]    the shorthand, weighted here.
 *   (neither)                                derived from `tags` — see
 *                                            AFFINITY_BY_TAG above.
 *
 * The tag fallback is not a nicety. The field bridge that hands placements to
 * fields.js copies `tags` and `deposits` and nothing else, so until somebody
 * widens it the tag path is the ONLY path, and the zoning has to work today.
 */
export function affinitiesOf(p, lookup = null) {
  if (!p) return [];
  const raw =
    (lookup && lookup(p)) ||
    p.affinities ||
    p.affinity ||
    (p.def && (p.def.affinities || p.def.affinity)) ||
    null;

  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    const out = [];
    for (const id of AFFINITY_ORDER) {
      const w = Number(raw[id]);
      if (w) out.push({ id, weight: w });
    }
    if (out.length) return out;
  }
  if (Array.isArray(raw) && raw.length) {
    const ids = [];
    for (const a of raw) {
      const id = typeof a === 'number' ? AFFINITY_ORDER[a - 1] : String(a);
      if (GRASS_FOR[id] && !ids.includes(id)) ids.push(id);
    }
    const w = AFFINITY_WEIGHT[Math.min(ids.length, AFFINITY_WEIGHT.length - 1)] || 0;
    return ids.map((id) => ({ id, weight: w }));
  }

  const ids = [];
  for (const t of p.tags || []) {
    for (const id of AFFINITY_BY_TAG[t] || []) if (!ids.includes(id)) ids.push(id);
  }
  if (!ids.length) return [];
  const w = AFFINITY_WEIGHT[Math.min(ids.length, AFFINITY_WEIGHT.length - 1)] || 0;
  return ids.map((id) => ({ id, weight: w }));
}

/**
 * Is this placement a nullifier — an OCCLUDER rather than a source?
 *
 * DECOR.md is emphatic on why this is not a negative deposit: a negative would
 * dig a dead crater round the hedge. Blocking propagation instead means the
 * SHAPE of a planting matters, two species can sit one tile apart with a hedge
 * between them, and the gravel walk teaches the mechanic by accident because
 * players lay paths for their own reasons.
 */
export function isNullifier(p) {
  if (!p) return false;
  if (p.blocks === true || p.nullifier === true) return true;
  if (p.def && (p.def.blocks === true || p.def.nullifier === true)) return true;
  if (p.zoneClass === 'nullifier' || (p.def && p.def.zoneClass === 'nullifier')) return true;
  for (const t of p.tags || []) if (NULLIFIER_SET.has(t)) return true;
  return false;
}

/**
 * The zoning + elevation reader.
 *
 * Everything about the ground that a creature needs to know goes through here,
 * and every single query has a defined answer when the host has not built that
 * part of the world yet. That is deliberate: eight owners are working on this
 * tree at once and a requirement that throws because a sibling module has not
 * landed is a requirement that cannot be shipped.
 *
 * `supports` records what is actually MODELLED rather than defaulted, and the
 * requirements read it: a terrain requirement in a world with no elevation is
 * satisfied, not failed. A game must never ask for something it has no way to
 * express.
 */
export class Zoning {
  constructor(fields, opts = {}) {
    this.fields = fields;
    this.w = fields.w;
    this.h = fields.h;
    this.host = opts.terrain || null; // world.js / fields.js, when they exist
    /**
     * Optional `(placement) => {satyr:1.0,...}`. The field bridge in main.js
     * copies only `tags` and `deposits` off a catalogue entry, so a host that
     * wants the catalogue's authored weights rather than the tag fallback can
     * hand a lookup in here — e.g. `(p) => catalog.byId(p.id)?.affinities`.
     */
    this.affinityOf = opts.affinityOf || null;
    this._version = -1;
    this._grass = null;
    this._scores = null;
    this._levels = null;
    this._water = null;
    this._connect = null;
    this._patchCache = new Map();
    /**
     * WHO ACTUALLY ANSWERS EACH QUESTION.
     *
     * js/fields.js grew the whole zoning model (resolve / grassGrid / patch /
     * levelAt) and js/world.js grew the elevation (levelAt / isWet /
     * waterfallAt / connectors) while this file was being written. Where they
     * answer, they are the authority and nothing below is used — one model, one
     * truth, and the grass a creature stands on is the same grass the terrain
     * renderer paints. The engine in this class is the fallback for the case
     * where they do not, which is the case the tests exercise directly and the
     * case a smaller host (spritelab, a probe script) will always be in.
     */
    this.supports = {
      grass: typeof fields.resolve === 'function' && typeof fields.patch === 'function',
      elevation:
        typeof fields.levelAt === 'function' ||
        !!(this.host && (typeof this.host.levelAt === 'function' || this.host.levels)),
      water: !!(
        this.host &&
        (typeof this.host.isWet === 'function' ||
          typeof this.host.isWater === 'function' ||
          typeof this.host.groundAt === 'function')
      ),
      waterfall: !!(this.host && typeof this.host.waterfallAt === 'function'),
    };
  }

  /** The version everything caches against: fields + whatever terrain says. */
  get version() {
    const t = this.host ? this.host.terrainVersion || this.host.version || 0 : 0;
    return this.fields.version * 8191 + t;
  }

  _fresh() {
    if (this._version === this.version) return;
    this._version = this.version;
    this._grass = null;
    this._scores = null;
    this._levels = null;
    this._water = null;
    this._connect = null;
    this._patchCache.clear();
  }

  // ------------------------------------------------------------- elevation --

  /** Integer level, 0..MAX_LEVEL. Flat ground everywhere when unmodelled. */
  levelAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return 0;
    this._fresh();
    if (!this._levels) {
      const g = new Int8Array(this.w * this.h);
      const host = this.host;
      if (typeof this.fields.levelAt === 'function') {
        // fields.js is the one both the influence flood and the grass already
        // read their heights from. Agreeing with it is not optional: a creature
        // that thought a terrace was flat would walk up a cliff that the
        // zoning treats as a wall.
        for (let i = 0, y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++, i++) g[i] = this.fields.levelAt(x, y) | 0;
      } else if (host && typeof host.levelAt === 'function') {
        for (let i = 0, y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++, i++) g[i] = host.levelAt(x, y) | 0;
      } else if (host && host.levels && host.levels.length === this.w * this.h) {
        for (let i = 0; i < g.length; i++) g[i] = host.levels[i] | 0;
      }
      this._levels = g;
    }
    return this._levels[ty * this.w + tx];
  }

  isWater(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    this._fresh();
    if (!this._water) {
      const g = new Uint8Array(this.w * this.h);
      const host = this.host;
      for (let i = 0, y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++, i++) {
          if (host && typeof host.isWet === 'function') g[i] = host.isWet(x, y) ? 1 : 0;
          else if (host && typeof host.isWater === 'function') g[i] = host.isWater(x, y) ? 1 : 0;
          else if (host && typeof host.groundAt === 'function') {
            const t = host.groundAt(x, y);
            g[i] = t === 'water' || t === 'marsh' ? 1 : 0;
          }
        }
      }
      // No terrain host: fall back to the placements, which is what the naiad's
      // own requirements already read. A still pool IS a water tile.
      if (!host) {
        for (const p of this.fields.placements) {
          const tags = p.tags || [];
          if (!tags.includes('still-water') && !tags.includes('running-water') && !tags.includes('marsh')) continue;
          const i = p.ty * this.w + p.tx;
          if (i >= 0 && i < g.length) g[i] = 1;
        }
      }
      this._water = g;
    }
    return this._water[ty * this.w + tx] === 1;
  }

  /**
   * Is there a CONNECTOR on this tile — an earth ramp, a stone stair, a rock
   * scramble, a stepped terrace wall? ELEVATION.md: terrain is always
   * flat-topped and level changes are always a clean vertical cliff, so the
   * only way up is a connector the player put there. That makes the ways up a
   * design decision instead of an automatic consequence of terrain editing,
   * and it means creature pathing has something honest to read.
   */
  connectorAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    this._fresh();
    if (!this._connect) {
      const g = new Uint8Array(this.w * this.h);
      const host = this.host;
      if (host && typeof host.connectorAt === 'function') {
        for (let i = 0, y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++, i++) g[i] = host.connectorAt(x, y) ? 1 : 0;
      } else if (host && typeof host.objectAt === 'function' && typeof host.connectorSpan === 'function') {
        // world.js's shape: the connectors are placed OBJECTS, and it will tell
        // us which ones still bridge their own step. A stair left reaching for
        // a step that a later terrain edit took away is not a way up, and a
        // creature must not treat it as one.
        for (let y = 0; y < this.h; y++) {
          for (let x = 0; x < this.w; x++) {
            const obj = host.objectAt(x, y);
            if (!obj) continue;
            let span = null;
            try {
              span = host.connectorSpan(obj);
            } catch (_) {
              span = null;
            }
            if (!span) continue;
            if (typeof host.connectorSound === 'function' && !host.connectorSound(obj)) continue;
            g[y * this.w + x] = 1;
          }
        }
      } else {
        for (const p of this.fields.placements) {
          const tags = p.tags || [];
          const isConn = p.connector === true || tags.includes('connector') || tags.includes('ramp') || tags.includes('stair');
          if (!isConn) continue;
          const fw = (p.footprint && p.footprint[0]) || 1;
          const fh = (p.footprint && p.footprint[1]) || 1;
          for (let dy = 0; dy < fh; dy++) {
            for (let dx = 0; dx < fw; dx++) {
              const x = p.tx + dx;
              const y = p.ty + dy;
              if (x >= 0 && y >= 0 && x < this.w && y < this.h) g[y * this.w + x] = 1;
            }
          }
        }
      }
      this._connect = g;
    }
    return this._connect[ty * this.w + tx] === 1;
  }

  /**
   * May a creature step from one tile to an adjacent one?
   *
   * Level ground: yes. One level of difference: only across a connector — that
   * is exactly "1 up, 1 over". Two or more: never; a cliff is a cliff.
   */
  stepOk(ax, ay, bx, by) {
    if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) return false;
    const d = Math.abs(this.levelAt(bx, by) - this.levelAt(ax, ay));
    if (d === 0) return true;
    if (d > 1) return false;
    return this.connectorAt(ax, ay) || this.connectorAt(bx, by);
  }

  /**
   * A waterfall is not a simulation, it is an ADJACENCY: water standing above
   * a drop. ELEVATION.md is explicit that this is a rendering consequence
   * rather than a fluid model, and the same adjacency is what the naiad reads.
   */
  isWaterfall(tx, ty) {
    if (this.supports.waterfall) {
      // world.js already defines a waterfall as the set of edges where a wet
      // tile meets a drop. Same definition, one implementation.
      const edges = this.host.waterfallAt(tx, ty);
      return !!(edges && edges.length);
    }
    if (!this.isWater(tx, ty)) return false;
    const lvl = this.levelAt(tx, ty);
    for (const [dx, dy] of NEIGHBOURS4) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (this.levelAt(nx, ny) <= lvl - 1) return true;
    }
    return false;
  }

  /** Still water with nothing falling into it. The unicorn's mirror. */
  isPool(tx, ty) {
    return this.isWater(tx, ty) && !this.isWaterfall(tx, ty);
  }

  /** Ringed by higher ground — ELEVATION.md's "a sunken garden is secluded
   *  because it is SUNK, not because a rule says so". */
  isHollow(tx, ty) {
    const lvl = this.levelAt(tx, ty);
    let higher = 0;
    for (const [dx, dy] of NEIGHBOURS8) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (this.levelAt(nx, ny) > lvl) higher++;
    }
    return higher >= 5;
  }

  isSummit(tx, ty) {
    const lvl = this.levelAt(tx, ty);
    if (lvl === 0) return false;
    for (const [dx, dy] of NEIGHBOURS8) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (this.levelAt(nx, ny) > lvl) return false;
    }
    return true;
  }

  isCliff(tx, ty) {
    const lvl = this.levelAt(tx, ty);
    for (const [dx, dy] of NEIGHBOURS4) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
      if (Math.abs(this.levelAt(nx, ny) - lvl) >= TERRACE_BLOCK) return true;
    }
    return false;
  }

  /** How many tiles within `radius` carry a terrain feature. */
  featureCount(feature, tx, ty, radius) {
    const r = Math.ceil(radius);
    let n = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
        if (this.hasFeature(feature, x, y)) n++;
      }
    }
    return n;
  }

  hasFeature(feature, tx, ty) {
    switch (feature) {
      case 'waterfall':
        return this.isWaterfall(tx, ty);
      case 'pool':
        return this.isPool(tx, ty);
      case 'cliff':
        return this.isCliff(tx, ty);
      case 'hollow':
        return this.isHollow(tx, ty);
      case 'summit':
        return this.isSummit(tx, ty);
      case 'connector':
        return this.connectorAt(tx, ty);
      default:
        return false;
    }
  }

  // ----------------------------------------------------------------- grass --

  /**
   * Per-affinity influence over the whole map.
   *
   * DECOR.md turns this from a gaussian convolution into a FLOOD FILL WITH
   * DISTANCE DECAY THAT RESPECTS OCCLUDERS: influence radiates from each source
   * and decays with distance but cannot pass *through* a null tile. A hedge is
   * therefore a genuine tool and the shape of a planting matters, not only its
   * count. ELEVATION.md then hands us the same behaviour for free — a step of
   * two levels or more blocks propagation exactly as a hedge does, so terracing
   * a garden produces distinct zones without a single hedge, which is how real
   * terraced gardens actually feel.
   *
   * One multi-source BFS per affinity over a 20x20 grid. Four passes over four
   * hundred tiles, on edit only. Cheap enough that it is not worth being clever.
   */
  _resolve() {
    this._fresh();
    if (this._grass) return;
    const n = this.w * this.h;
    const scores = {};
    for (const id of AFFINITY_ORDER) scores[id] = new Float32Array(n);

    // Occluders first: the null tiles influence cannot cross.
    const blocked = new Uint8Array(n);
    for (const p of this.fields.placements) {
      if (!isNullifier(p)) continue;
      const fw = (p.footprint && p.footprint[0]) || 1;
      const fh = (p.footprint && p.footprint[1]) || 1;
      for (let dy = 0; dy < fh; dy++) {
        for (let dx = 0; dx < fw; dx++) {
          const x = p.tx + dx;
          const y = p.ty + dy;
          if (x >= 0 && y >= 0 && x < this.w && y < this.h) blocked[y * this.w + x] = 1;
        }
      }
    }

    // Sources, grouped by affinity. Breadth costs strength (DECOR.md) — either
    // because the catalogue said so in its weights, or because affinitiesOf()
    // applied the discount for a shorthand that did not.
    const sources = {};
    for (const id of AFFINITY_ORDER) sources[id] = [];
    let anySource = false;
    for (const p of this.fields.placements) {
      if (isNullifier(p)) continue;
      const aff = affinitiesOf(p, this.affinityOf);
      if (!aff.length) continue;
      const fw = (p.footprint && p.footprint[0]) || 1;
      const fh = (p.footprint && p.footprint[1]) || 1;
      const share = 1 / (fw * fh); // a 2x2 is not four times a 1x1
      for (const { id, weight } of aff) {
        if (!weight) continue;
        for (let dy = 0; dy < fh; dy++) {
          for (let dx = 0; dx < fw; dx++) {
            const x = p.tx + dx;
            const y = p.ty + dy;
            if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
            sources[id].push([y * this.w + x, weight * share]);
            anySource = true;
          }
        }
      }
    }
    this.anySource = anySource;

    // One BFS per source, ACCUMULATING into the affinity's field. Accumulate,
    // not max: two vines a tile apart must claim more ground than one vine
    // does, or planting a second one of anything would be pointless. The BFS
    // measures OCCLUDER-RESPECTING path distance, which is the whole reason
    // this is a flood fill and not a convolution — a hedge does not make a
    // thing quieter, it makes it unreachable.
    const dist = new Int16Array(n).fill(-1);
    const epoch = new Int32Array(n);
    let stamp = 0;
    const REACH = Math.max(1, Math.ceil(Math.log(MIN_INFLUENCE) / Math.log(DECAY_PER_TILE)));
    for (const id of AFFINITY_ORDER) {
      const field = scores[id];
      for (const [origin, weight] of sources[id]) {
        stamp++;
        epoch[origin] = stamp;
        dist[origin] = 0;
        field[origin] += weight;
        const q = [origin];
        for (let head = 0; head < q.length; head++) {
          const i = q[head];
          const d = dist[i];
          if (d >= REACH) continue;
          const x = i % this.w;
          const y = (i / this.w) | 0;
          for (const [dx, dy] of NEIGHBOURS4) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
            const j = ny * this.w + nx;
            if (epoch[j] === stamp) continue;
            if (blocked[j]) continue; // a nullifier stops the chain dead
            if (Math.abs(this.levelAt(nx, ny) - this.levelAt(x, y)) >= TERRACE_BLOCK) continue;
            epoch[j] = stamp;
            dist[j] = d + 1;
            field[j] += weight * Math.pow(DECAY_PER_TILE, d + 1);
            q.push(j);
          }
        }
      }
    }

    // Resolve. Per tile, deliberately: it produces organic blobby borders
    // instead of rectangles, and the cosy research names "four zoo pens" as the
    // central failure mode of a multi-region builder.
    const grass = new Uint8Array(n); // index into GRASS_TYPES
    const second = new Uint8Array(n);
    const contested = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let topId = null;
      let topV = 0;
      let secId = null;
      let secV = 0;
      for (const id of AFFINITY_ORDER) {
        const v = scores[id][i];
        if (v > topV) {
          secId = topId;
          secV = topV;
          topId = id;
          topV = v;
        } else if (v > secV) {
          secId = id;
          secV = v;
        }
      }
      if (blocked[i] || topV < CLAIM_FLOOR || !topId) {
        grass[i] = 0; // meadow. A null tile renders as a real garden's mown border.
        continue;
      }
      grass[i] = GRASS_TYPES.indexOf(GRASS_FOR[topId]);
      if (secId && secV > 0 && (topV - secV) <= CONTEST_EPS * topV) {
        contested[i] = 1;
        second[i] = GRASS_TYPES.indexOf(GRASS_FOR[secId]);
      }
    }
    this._scores = scores;
    this._grass = { grass, second, contested, blocked };
  }

  /**
   * The grass at one tile: `{ type, second, contested }`.
   *
   * Contested tiles are UNCLAIMED, NOT HOSTILE (ZONING.md). No creature will
   * settle on one. A creature already settled there is never evicted. And it is
   * one of the prettiest states in the game — a 50% checkerboard dither of the
   * two competing types, which is precisely the technique period isometric
   * games used at every terrain boundary.
   */
  grassAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return MEADOW_CELL;
    if (this.supports.grass) {
      // fields.resolve() is the authority. Note that its `grassAt()` reports
      // the LEADER on a contested tile, which is right for the renderer and
      // wrong for us — a creature must see the argument, not the front-runner.
      const r = this.fields.resolve(tx, ty);
      if (!r || r.kind === 'neutral') return MEADOW_CELL;
      return {
        type: r.type || 'meadow',
        second: r.kind === 'contested' && r.other ? GRASS_FOR[r.other] || null : null,
        contested: r.kind === 'contested',
        strength: r.strength,
      };
    }
    this._resolve();
    const i = ty * this.w + tx;
    return {
      type: GRASS_TYPES[this._grass.grass[i]] || 'meadow',
      second: this._grass.contested[i] ? GRASS_TYPES[this._grass.second[i]] : null,
      contested: this._grass.contested[i] === 1,
    };
  }

  /** Has anything on this map claimed any ground at all? */
  get claimed() {
    if (this.supports.grass) {
      // "Has anything taken sides yet?" — cheap, because grassGrid is cached
      // on the fields version and the terrain renderer wants it anyway.
      if (typeof this.fields.grassCounts === 'function') {
        const c = this.fields.grassCounts();
        for (const t of GRASS_TYPES) if (t !== 'meadow' && c[t] > 0) return true;
        return false;
      }
      return true;
    }
    this._resolve();
    return !!this.anySource;
  }

  /**
   * The size of the contiguous, uncontested patch of `type` that (tx,ty) sits
   * in. Four-connected, and it does not cross a level step of two or more —
   * a creature's home ground is ground it can walk without a ladder.
   *
   * `cap` stops a whole-map meadow costing a whole-map flood fill for a
   * requirement that only ever asks for nine tiles.
   */
  patchAt(tx, ty, type, cap = 64) {
    if (!type) return 0;
    const key = `${tx},${ty},${type},${cap}`;
    this._fresh();
    const hit = this._patchCache.get(key);
    if (hit !== undefined) return hit;
    if (this.supports.grass) {
      // fields.patch() is keyed by AFFINITY (the species), not by grass name,
      // and already refuses contested tiles and 8-connectivity for the same
      // reason we would: a patch is ground you can walk.
      const species = SPECIES_FOR_GRASS[type];
      const r = species ? this.fields.patch(species, tx, ty, cap) : null;
      const size = r ? r.size : 0;
      this._patchCache.set(key, size);
      return size;
    }
    const here = this.grassAt(tx, ty);
    if (here.type !== type || here.contested) {
      this._patchCache.set(key, 0);
      return 0;
    }
    const seen = new Set([ty * this.w + tx]);
    const stack = [[tx, ty]];
    let size = 0;
    while (stack.length && size < cap) {
      const [x, y] = stack.pop();
      size++;
      for (const [dx, dy] of NEIGHBOURS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const j = ny * this.w + nx;
        if (seen.has(j)) continue;
        if (Math.abs(this.levelAt(nx, ny) - this.levelAt(x, y)) >= TERRACE_BLOCK) continue;
        const g = this.grassAt(nx, ny);
        if (g.type !== type || g.contested) continue;
        seen.add(j);
        stack.push([nx, ny]);
      }
    }
    this._patchCache.set(key, size);
    return size;
  }

  /** Is this tile the seam — contested, or with two species meeting on it? */
  seamAt(tx, ty) {
    const here = this.grassAt(tx, ty);
    if (here.contested) return { seam: true, between: [here.type, here.second] };
    const kinds = new Set();
    for (const [dx, dy] of NEIGHBOURS8) {
      const g = this.grassAt(tx + dx, ty + dy);
      if (g.type !== 'meadow') kinds.add(g.type);
      if (g.contested && g.second) kinds.add(g.second);
    }
    if (here.type !== 'meadow') kinds.add(here.type);
    return { seam: kinds.size >= 2, between: [...kinds].slice(0, 2) };
  }

  /**
   * The nearest walkable tile of `type` to (tx,ty), or null.
   *
   * This is the whole of the never-evict promise: when a settled creature's
   * ground goes contested it walks HERE. It does not leave, it does not lose
   * its journal entry, and if this returns null it simply stays put.
   */
  nearestOwnGrass(tx, ty, type, maxR = 12) {
    if (!type) return null;
    for (let r = 0; r <= maxR; r++) {
      let best = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx;
          const y = ty + dy;
          if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
          const g = this.grassAt(x, y);
          if (g.type !== type || g.contested) continue;
          const d = Math.hypot(dx, dy);
          if (d < bestD) {
            bestD = d;
            best = { tx: x, ty: y, distance: d };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A walking route from one tile to another, using the connectors and refusing
   * the cliffs. Breadth-first over a 20x20 grid: the shortest path in tiles is
   * also the one a wandering creature looks like it chose, and there is no
   * budget in this game worth an A* for.
   *
   * Returns an array of waypoints INCLUDING the destination, or null if no
   * route exists — in which case the caller must leave the creature where it
   * is, because walking through a cliff is worse than standing still.
   */
  route(from, to, passable = null) {
    const sx = Math.round(from.x != null ? from.x : from.tx);
    const sy = Math.round(from.y != null ? from.y : from.ty);
    const gx = Math.round(to.x != null ? to.x : to.tx);
    const gy = Math.round(to.y != null ? to.y : to.ty);
    if (sx === gx && sy === gy) return [];
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return null;
    const n = this.w * this.h;
    const prev = new Int32Array(n).fill(-1);
    const seen = new Uint8Array(n);
    const start = sy * this.w + sx;
    const goal = gy * this.w + gx;
    seen[start] = 1;
    const q = [start];
    let head = 0;
    let found = false;
    while (head < q.length) {
      const i = q[head++];
      if (i === goal) {
        found = true;
        break;
      }
      const x = i % this.w;
      const y = (i / this.w) | 0;
      for (const [dx, dy] of NEIGHBOURS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const j = ny * this.w + nx;
        if (seen[j]) continue;
        if (!this.stepOk(x, y, nx, ny)) continue; // a cliff is impassable
        if (passable && j !== goal && !passable(nx, ny)) continue;
        seen[j] = 1;
        prev[j] = i;
        q.push(j);
      }
    }
    if (!found) return null;
    const out = [];
    for (let i = goal; i !== start && i !== -1; i = prev[i]) {
      out.push({ x: i % this.w, y: (i / this.w) | 0 });
    }
    out.reverse();
    return out;
  }
}

const MEADOW_CELL = Object.freeze({ type: 'meadow', second: null, contested: false });
const NEIGHBOURS4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
const NEIGHBOURS8 = Object.freeze([
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
]);

// ---------------------------------------------------------------------------
// The zoning-era requirements
// ---------------------------------------------------------------------------

/**
 * A contiguous patch of the creature's OWN GRASS, `n` tiles of it.
 *
 * This is the requirement that replaced the axis band, and it is the one the
 * journal must show AS A PICTURE rather than as a number (ZONING.md, and the UI
 * does exactly that). A patch is a shape; a shape has a picture; a number would
 * be both less legible and an invitation to count.
 *
 * Two soft edges, both of them cosy guarantees rather than niceties:
 *   - contested ground never satisfies this, but it never fails a creature that
 *     has already settled either. That is handled by the ladder, not here: a
 *     rung once reached is never lost.
 *   - a world where NOTHING has claimed any ground yet reports met. A garden
 *     with no affinity vocabulary in it at all must not be a garden where
 *     nothing can ever live.
 */
export function patch(n, opts = {}) {
  const { why = '' } = opts;
  return Object.freeze({
    kind: 'patch',
    // Named so that another owner's diagnostics — tools/playtest.mjs prints
    // `req.tag ?? req.axis` — say 'ground' rather than an empty string. A
    // requirement that cannot say what it is makes somebody else's tool lie.
    axis: 'ground',
    n,
    why,
    evaluate(ctx) {
      const g = ctx.grass();
      const type = ctx.ownGrass;
      if (!ctx.zoningClaimed()) {
        return { score: 1, met: true, have: n, need: n, type, unclaimed: true, contested: false };
      }
      const have = ctx.patchSize(n * 3);
      const contested = !!g.contested;
      const own = g.type === type && !contested;
      const score = own ? Math.min(1, have / Math.max(1, n)) : contested ? 0.35 : 0;
      return {
        score,
        met: own && have >= n,
        have: Math.min(have, n * 3),
        need: n,
        type,
        standing: g.type,
        second: g.second,
        contested,
      };
    },
  });
}

/**
 * Pan's, and Pan's alone. He settles on the SEAM — contested ground, or ground
 * where two species' grass meet. DECOR.md's open question about the four-way
 * ends here: a tile that ties is useless as zoning and is exactly the key to
 * the capstone, which is a better joke and a better secret than a fifth grass.
 */
export function seam(opts = {}) {
  const { why = '' } = opts;
  return Object.freeze({
    kind: 'patch',
    axis: 'the seam',
    seam: true,
    n: 1,
    why,
    evaluate(ctx) {
      if (!ctx.zoningClaimed()) return { score: 1, met: true, seam: true, unclaimed: true, between: [] };
      const s = ctx.seam();
      return { score: s.seam ? 1 : 0, met: s.seam, seam: true, between: s.between || [] };
    },
  });
}

/**
 * A terrain feature within a radius — waterfall, pool, cliff, hollow, summit.
 *
 * This reads the ELEVATION model, not the catalogue, which is why it is not a
 * `count`: no placeable carries "waterfall", because a waterfall is what
 * happens when water stands above a drop. `TERRAIN_FEATURES` is the vocabulary
 * and it is deliberately kept out of `REQUIRED_TAGS`.
 *
 * In a world with no elevation model this reports MET. A requirement the world
 * has no way to express must never be a requirement the player cannot meet.
 */
export function near(feature, n, radius, label = null) {
  return Object.freeze({
    kind: 'terrain',
    axis: feature,
    feature,
    n,
    radius,
    label: label || feature,
    evaluate(ctx) {
      if (!ctx.hasElevation()) return { score: 1, met: true, have: n, need: n, feature, unmodelled: true };
      const have = ctx.feature(feature, radius);
      return { score: n === 0 ? 1 : Math.min(1, have / n), met: have >= n, have, need: n, feature };
    },
  });
}

// ---------------------------------------------------------------------------
// The behavioural beats
//
// Each has a site (a tag it needs something to do it AT), an hour of the day it
// happens in, and a pose the renderer draws. Five creatures, five different
// hours — the naiad dances at noon because Callimachus says the nymphs sported
// by Demeter's poplar at noontide, and the unicorn dips its horn at first light
// because the Physiologus has it cleansing the water before the beasts drink.
// Free content, entirely from the sources.
// ---------------------------------------------------------------------------

export const BEATS = Object.freeze({
  revel: Object.freeze({
    id: 'revel',
    verb: 'dances',
    pose: 'dance',
    site: ['spring-head', 'wine', 'vine'],
    radius: 4,
    when: [0.7, 0.95], // dusk into night
    seconds: 8,
    watch: 'It will dance at the water after dark, if there is wine or a wild vine by it.',
    done: 'The satyr stamped and turned by the spring until the light went.',
  }),
  graze: Object.freeze({
    id: 'graze',
    verb: 'grazes',
    pose: 'graze',
    site: ['physic'],
    radius: 4,
    when: [0.15, 0.4], // early morning
    seconds: 10,
    watch: 'It will come down to a physic bed in the early morning and crop it over.',
    done: 'The centaur worked slowly along the herb bed, choosing.',
  }),
  'noon-dance': Object.freeze({
    id: 'noon-dance',
    verb: 'dances at noon',
    pose: 'dance',
    site: ['greensward'],
    radius: 3,
    when: [0.42, 0.58], // noontide
    seconds: 9,
    watch: 'She will dance on level turf beside the water, but only at noon.',
    done: 'She danced on the greensward at noon, and the water went quiet.',
  }),
  purify: Object.freeze({
    id: 'purify',
    verb: 'touches its horn to the water',
    pose: 'drink',
    site: ['still-water', 'fountain'],
    radius: 3,
    when: [0.04, 0.18], // first light
    seconds: 7,
    watch: 'At first light it will put its horn into still water, before anything else drinks.',
    done: 'It lowered the horn into the pool at first light. The water cleared.',
  }),
  pipe: Object.freeze({
    id: 'pipe',
    verb: 'plays',
    pose: 'pipe',
    site: ['syrinx'],
    radius: 4,
    when: [0.78, 0.95],
    seconds: 12,
    watch: 'Leave the pipes where they will be found.',
    done: 'Seven notes, in order, at dusk. Everything in the glade stopped to hear it.',
  }),
});

// ---------------------------------------------------------------------------
// FLOURISHES — the things a creature does that are not ceremonies.
// ---------------------------------------------------------------------------
//
// A BEAT above is the settling rite: it happens ONCE, it is gated on the whole
// garden being ready, and it writes a line in the journal that stays written.
// That is why `st.beats` is a Set and why `_maybeBeat` refuses to run one
// twice.
//
// A flourish is the opposite in every one of those respects. It repeats, it
// asks nothing of the garden but a prop within walking distance, and it leaves
// NO record — a journal entry that filled in over and over would cheapen the
// one that does not, and the promise that an entry is never un-filled only
// means anything if entries are rare.
//
// They share the travel/perform machinery through `ACTS` below, because
// "walk somewhere, stand there, do a thing for N seconds, go back to what you
// were doing" is one behaviour whatever the reason for it.
export const FLOURISHES = Object.freeze({
  /**
   * He stands and plays. Started by hand, not by the scheduler: main.js fires
   * it when the score starts, which is the moment the first satyr walks into
   * the garden. He is the reason there is music, so he is seen to make it.
   *
   * Three minutes is the owner's number and it is a long time to stand still on
   * purpose — this is the arrival, and it should feel like it is happening
   * rather than like it has been noted. (The track itself runs 3:48, so he
   * stops a little before the first pass of it ends.)
   */
  piping: Object.freeze({
    id: 'piping',
    flourish: true,
    pose: 'pipe',
    site: null, // wherever he is standing
    seconds: 180,
  }),
  /**
   * A drink from whatever is standing about. Satyrs are the reason the krater
   * is in the catalogue at all.
   */
  tipple: Object.freeze({
    id: 'tipple',
    flourish: true,
    // The satyr's, and only his. He is the one with the art for it, and a
    // unicorn helping itself to the krater would undo the joke the catalogue is
    // built on — the cup that calls satyrs is the thing the alicorn exists to
    // purify.
    creature: 'satyr',
    pose: 'drink',
    site: ['vessel', 'wine'],
    radius: 5,
    // The drink animation is a one-shot 3.1 s long and it CLAMPS on its last
    // frame, so overrunning it looks like a satyr standing with an empty cup —
    // which is exactly right, and lets this be the owner's "3 to 5 seconds"
    // without the art and the clock having to agree to the millisecond.
    seconds: 4,
    // Long enough that he is not commuting between the krater and the vine all
    // afternoon. He is meant to be enjoying himself, not employed.
    cooldown: [140, 260],
  }),
});

/**
 * Everything a creature can walk somewhere and DO. The two tables stay separate
 * above so that the difference in kind is impossible to miss; the machinery
 * only ever needs one lookup.
 */
const ACTS = Object.freeze({ ...BEATS, ...FLOURISHES });

// ---------------------------------------------------------------------------
// The creatures
//
// Every requirement below is grounded in docs/RESEARCH.md section B. The tags
// are the vocabulary the catalog establishes; REQUIRED_TAGS at the bottom is
// the contract, and tools/playtest.mjs should assert the catalog covers it.
// ---------------------------------------------------------------------------

const SATYR = {
  id: 'satyr',
  name: 'Satyr',
  order: 0,
  hidden: false,
  beat: 'revel',
  blurb:
    'Hesiod calls them worthless and unfit for work, and means it kindly. They want the hill left alone: wild vine, ivy over the rock, a spring nobody has put a basin round.',
  silhouette: 'A hunched shape with horns, on a slope.',
  hint: 'Something is waiting for the hill to go untended.',
  names: ['Marsyas', 'Skirtos', 'Komos', 'Simos', 'Terpon', 'Hybris'],
  tells: [
    'Cloven prints in the soft ground by the rocks.',
    'A vine shoot torn down and stripped of its leaves.',
    'Pipes, thin and off-key, somewhere past the trees.',
    'A shape on the ridge at dusk. Gone when you look straight at it.',
  ],
  grass: 'thicket',
  rungs: {
    // The Cyclops diagnostic: no vine, no satyrs. Two rather than one, so the
    // approach has room in it — the tells below escalate on how close this rung
    // is, and a rung you can only be 0% or 100% of the way to skips straight
    // past three of the four traces the player was supposed to find first.
    // Two also happens to be RESEARCH section C.5's onboarding prescription:
    // the first creature arrives from planting the one plant you are given,
    // twice, which is what you would have done on turn one anyway.
    //
    // NOTE the shape of the ladder after the zoning rework: `sighted` asks for
    // no ground at all (a trace is a trace), `visits` wants a toehold, and
    // `settles` wants a real patch. The grass is what you watch spread while
    // you climb it.
    sighted: [atLeast('vine', 2, 5, 'wild vine')],
    visits: [
      patch(3, { why: 'somewhere the thicket has taken' }),
      atLeast('vine', 2, 4, 'wild vine'),
      atLeast('ivy', 2, 4, 'ivy|ivy'),
    ],
    settles: [
      patch(9, { why: 'un-worked hill country, and enough of it to be a hill' }),
      band('seclusion', { min: 0, ideal: 3 }),
      atLeast('vine', 3, 4, 'wild vine'),
      atLeast('ivy', 2, 4, 'ivy|ivy'),
      atLeast('pine', 1, 4, 'stone pine'), // the thyrsos finial
      atLeast('cave', 1, 5, 'cave mouth'), // Hymn to Aphrodite 262-63
      atLeast('spring-head', 1, 5, 'unbasined spring'),
      atMost('enclosure', 0, 6, 'wall or fence|walls or fences'), // THE THESIS. See proveThesis().
      atMost('straight-edge', 0, 5, 'straight path or tilled row|straight paths or tilled rows'),
      beat('revel'),
    ],
    thrives: [
      patch(16, { why: 'a whole hillside gone over to him' }),
      band('maturity', { min: 2, ideal: 4 }),
      atLeast('vine', 5, 4, 'wild vine'),
      atLeast('wine', 1, 4, 'krater or wineskin'),
      presence('naiad', 8), // silenoi and nymphs in the depths of pleasant caves
    ],
  },
};

const CENTAUR = {
  id: 'centaur',
  name: 'Centaur',
  order: 1,
  hidden: false,
  beat: 'graze',
  blurb:
    'Thessalian, off Pelion, where the ash for the great spears grew. It wants standing timber, an open run to move on, a cave, and a bed of herbs. It will not come near a gate.',
  silhouette: 'Tall, four-legged, standing where the trees stop.',
  hint: 'Something wants a clear run, and no fence across it.',
  names: ['Pholos', 'Hyleus', 'Asbolos', 'Amykos', 'Chariklo', 'Nessos'],
  tells: [
    'Hoofprints, deep, and too large for any deer.',
    'A branch of ash broken off higher than you can reach.',
    'Drumming on the ground, far off, at a canter, and then nothing.',
    'A tall silhouette at the treeline. It waited, and then it did not.',
  ],
  grass: 'sward',
  rungs: {
    sighted: [atLeast('ash', 2, 5, 'ash tree')],
    visits: [
      patch(4, { why: 'open turf to move on' }),
      atLeast('ash', 3, 5, 'ash tree'),
      atLeast('timber', 2, 5, 'stand of uncut timber|stands of uncut timber'),
      atMost('enclosure', 0, 6, 'gate or fence|gates or fences'),
    ],
    settles: [
      // The largest patch in the game, and the reason is the creature: an open
      // run is a thing you need ROOM for, and sward is the only grass whose
      // whole character is "space to move". The satyr wants a hill, the naiad
      // wants one particular water; the centaur wants distance.
      patch(12, { why: 'Thessalian slope — an open run, and room to take it' }),
      band('seclusion', { min: 0, ideal: 2 }),
      band('maturity', { min: 2, ideal: 5, why: 'uncut standing timber' }),
      atLeast('ash', 4, 5, 'ash tree'), // the Pelian spear
      atLeast('timber', 2, 5, 'stand of uncut timber|stands of uncut timber'),
      atLeast('cave', 1, 5, 'cave mouth'), // Chiron's and Pholus' dwellings
      atLeast('physic', 2, 4, 'physic herb|physic herbs'), // centaury, named for Chiron
      atMost('tree', 4, 3, 'tree crowding the run|trees crowding the run'), // the open run
      atMost('enclosure', 0, 6, 'gate or fence|gates or fences'), // Homeric: no walls
      beat('graze'),
    ],
    thrives: [
      patch(20, { why: 'a run worth a canter' }),
      band('maturity', { min: 4, ideal: 7 }),
      atLeast('physic', 4, 4, 'physic herb|physic herbs'),
      atLeast('ash', 6, 5, 'ash tree'),
      // Pholus opened the jar and the herd came down maddened. A pithos near the
      // home is exactly what stops a centaur settling deeper here.
      atMost('wine', 0, 6, 'open wine|open wine'),
    ],
  },
};

const NAIAD = {
  id: 'naiad',
  name: 'Naiad',
  order: 2,
  hidden: false,
  beat: 'noon-dance',
  blurb:
    'Freshwater, and one particular water. She wants a spring-head you can see, a grotto with a basin and a niche for offerings, plane and willow over it, and level turf to dance on at noon.',
  silhouette: 'A figure at the water, only from the waist up.',
  hint: 'Something is waiting on water that has not been piped away.',
  names: ['Kastalia', 'Arethousa', 'Peirene', 'Daphne', 'Kyane', 'Salmakis'],
  tells: [
    'The spring is running clearer than it was.',
    'A bent reed, and a wreath of flowers turning on the water.',
    'Laughter over the water at noon, with nobody there.',
    'Wet footprints on the stone, drying while you watch them.',
  ],
  grass: 'fen',
  rungs: {
    sighted: [atLeast('spring-head', 1, 5, 'spring-head'), atLeast('reed', 2, 4, 'reed bed')],
    visits: [
      patch(3, { why: 'wet ground at the water' }),
      atLeast('water-loving', 2, 4, 'water-loving tree'),
      atLeast('reed', 2, 3, 'reed bed'),
      atMost('fountain', 0, 5, 'pipe or conduit|pipes or conduits'), // repelled by piping the water away
    ],
    settles: [
      // The SMALLEST settling patch in the game, and that is the character: a
      // naiad is not the nymph of water, she is the nymph of ONE water. A wide
      // fen would be several of her. A small one is her.
      patch(7, { why: 'one particular water, and the wet ground it makes' }),
      band('seclusion', { min: 3, ideal: 6 }),
      atLeast('spring-head', 1, 3, 'spring-head'), // pegaiai, not a pipe
      atLeast('grotto', 1, 4, 'grotto with a basin|grottoes with basins'), // the archaeological nymphaeum
      atLeast('water-loving', 3, 4, 'water-loving tree'), // plane and black poplar
      atLeast('willow', 1, 4, 'willow'),
      atLeast('reed', 2, 3, 'reed bed'),
      atLeast('votive', 2, 4, 'votive offering'), // the Corycian Cave assemblage
      atLeast('greensward', 1, 3, 'level greensward|level greenswards'), // Callimachus, noontide
      atMost('fountain', 0, 5, 'pipe or conduit|pipes or conduits'),
      beat('noon-dance'),
    ],
    thrives: [
      // ELEVATION.md, and this is the single best thing that document gave the
      // creature layer: "a spring high on a terrace, falling to a pool below,
      // is a far better thing to build than a puddle." So the naiad's last
      // rung is the one place the game asks the player to build UPWARD. On a
      // flat map with no elevation model this reports met and costs nothing.
      patch(11, { why: 'wet ground enough to keep' }),
      near('waterfall', 1, 6, 'water falling'),
      band('maturity', { min: 3, ideal: 6 }),
      atLeast('votive', 4, 4, 'votive offering'),
      atLeast('willow', 3, 4, 'willow'),
    ],
  },
};

const UNICORN = {
  id: 'unicorn',
  name: 'Unicorn',
  order: 3,
  hidden: false,
  beat: 'purify',
  blurb:
    'Not the Greek one. This is the tapestry beast: a made garden, a low fence round it, clear water it can clean with its horn, and a thousand small flowers with no bare soil showing.',
  silhouette: 'Small, white, narrow-hooved, at a distance.',
  hint: 'Something is waiting for somewhere quieter, and much more kept.',
  names: null, // named for the place it settles — see nameFor()
  tells: [
    'One white hair, caught on a thorn at the height of your knee.',
    'The pool was perfectly still and perfectly clear this morning.',
    'A cloven print in the turf, small and narrow, and only one.',
    'Something white at the far edge of the garden, at first light.',
  ],
  grass: 'millefleurs',
  rungs: {
    sighted: [atLeast('white-flower', 2, 4, 'white flower')],
    visits: [
      patch(3, { why: 'a corner of fine flowered turf' }),
      band('seclusion', { min: 1, ideal: 4 }),
      atLeast('white-flower', 3, 4, 'white flower'),
      atLeast('still-water', 1, 4, 'still pool'),
    ],
    settles: [
      patch(9, { why: 'the hortus conclusus is a MADE place, and a whole one' }),
      band('seclusion', { min: 3, ideal: 7, why: 'Pliny: impossible to capture alive' }),
      atLeast('fountain', 1, 3, 'stone fountain'), // The Unicorn Purifies Water
      atLeast('still-water', 1, 3, 'still pool'),
      atLeast('white-flower', 5, 4, 'white flower'), // madonna lily, and the rest
      // NOTE what is NOT here any more: `atLeast('millefleurs', 3, 3)`. Under
      // the zoning model that requirement and the patch above are the same
      // sentence said twice in two vocabularies — the millefleurs GRASS is the
      // millefleurs planting, and asking for both made the ground-cover count
      // the thing the player optimised and the patch a thing that happened to
      // them. ZONING.md is explicit: the patch REPLACES it.
      atLeast('enclosure', 1, 3, 'low palisade'), // THE THESIS. See proveThesis().
      // AND NOT THE PINE. It used to be here on the Cluny reading (the tapestry
      // background is Pinus pinea, shared with the satyr), and under the axis
      // model that was harmless. Under the zoning model it was a contradiction
      // the audit caught: DECOR.md fixes the umbrella pine as the 1,2 piece —
      // satyr and centaur, thyrsos finial for one and mountain timber for the
      // other — so it carries NO unicorn affinity and a positive satyr one.
      // Requiring it meant requiring the unicorn to grow thicket on its own
      // lawn, and in the reference garden that is exactly what happened: the
      // home tile resolved to the satyr at 5.8 against the unicorn's 3.6.
      //
      // THE LAW THIS ESTABLISHES, worth keeping: a creature must never be
      // required to place an object with zero affinity for it and a positive
      // affinity for a rival. See auditGroundConflicts() below, which checks it.
      atMost('votive', 0, 4, 'votive offering|votive offerings'), // a visited spring is not a secluded one
      atMost('wine', 0, 6, 'open wine|open wine'), // the vessel the alicorn exists to purify
      beat('purify'),
    ],
    thrives: [
      patch(14, { why: 'a garden, not a bed' }),
      near('pool', 1, 5, 'still water to look into'), // the alicorn dips its horn
      band('maturity', { min: 3, ideal: 6 }),
      band('seclusion', { min: 6, ideal: 9 }),
      atLeast('antidote', 3, 4, 'antidote herb|antidote herbs'), // sage and pot marigold, per the Met
      atLeast('oak', 1, 5, 'oak'),
    ],
  },
};

const PAN = {
  id: 'pan',
  name: 'Pan',
  order: 4,
  hidden: true, // never listed, never hinted at, until sighted
  beat: 'pipe',
  blurb:
    'He came because the whole glade was worth coming to, and because someone left the pipes out. He keeps to the seam between the wild ground and the kept ground, and does not seem to prefer either.',
  silhouette: null,
  hint: null,
  names: ['Pan'],
  tells: [
    'Every bird in the glade stopped at the same moment.',
    'Seven reed-notes, in order, from nowhere in particular.',
    'The pipes have been moved, and put back.',
    'Something is sitting at the edge of the old grove, and it is not shy.',
  ],
  grass: null, // he has none, and that IS his requirement. See seam().
  rungs: {
    // The ecotone creature RESEARCH section C.4 asks for. Under the old axis
    // model he was expressed as moderate wildness AND moderate order, which was
    // a fussy way of saying "the seam" and needed four numbers to say it.
    //
    // Under the grass model he says it in one word: he settles on CONTESTED
    // GROUND. He is the only creature in the game who does, and every other
    // creature refuses it — so the tile the zoning rules call unresolved is
    // precisely and exclusively his. DECOR.md left the 1,2,3,4 four-way open
    // with the note that a tile tying four ways "reads as does nothing, unless
    // it is Pan's". It is Pan's.
    sighted: [
      presence('satyr', null),
      presence('naiad', null),
      band('maturity', { min: 4, ideal: 7 }),
    ],
    visits: [
      presence('satyr', null),
      presence('centaur', null),
      presence('naiad', null),
      presence('unicorn', null),
      band('maturity', { min: 6, ideal: 9 }),
      atLeast('syrinx', 1, 5, 'set of pipes|sets of pipes'),
    ],
    settles: [
      seam({ why: 'the seam between two grounds, and not either side of it' }),
      presence('satyr', null),
      presence('centaur', null),
      presence('naiad', null),
      presence('unicorn', null),
      band('maturity', { min: 8, ideal: 11, why: 'a glade that has been left to get old' }),
      atLeast('syrinx', 1, 4, 'set of pipes|sets of pipes'),
      atLeast('cave', 1, 5, 'cave mouth'),
      atLeast('pine', 1, 5, 'stone pine'),
      beat('pipe'),
    ],
    thrives: [band('maturity', { min: 12, ideal: 15 }), atLeast('syrinx', 2, 5, 'set of pipes|sets of pipes')],
  },
};

export const CREATURES = Object.freeze([SATYR, CENTAUR, NAIAD, UNICORN, PAN].map(Object.freeze));
export const CREATURE_BY_ID = Object.freeze(new Map(CREATURES.map((c) => [c.id, c])));

/**
 * Every tag any requirement in this file reads. The catalog must supply all of
 * these, and (per SPEC section 10) no tag should exist that nothing wants.
 */
export const REQUIRED_TAGS = Object.freeze(
  [
    ...new Set(
      CREATURES.flatMap((c) =>
        Object.values(c.rungs).flatMap((rs) => rs.filter((r) => r.kind === 'count').map((r) => r.tag))
      ).concat(Object.values(BEATS).flatMap((b) => b.site))
    ),
  ].sort()
);

// Load-time self-check. Display labels carry a 'singular|plural' form and tags
// never do; a careless edit that puts one in the other position silently makes
// a requirement unsatisfiable, because no catalog entry will ever carry a tag
// with a bar in it. Fail loudly at import instead of quietly in play.
for (const tag of REQUIRED_TAGS) {
  if (/[|]/.test(tag) || tag !== tag.trim() || tag === '') {
    throw new Error(`creatures.js: '${tag}' is not a usable tag — a display label has ended up in a tag position`);
  }
}
for (const c of CREATURES) {
  const settles = c.rungs.settles.filter((r) => r.kind === 'behaviour');
  if (settles.length !== 1) {
    throw new Error(`creatures.js: ${c.id} must have exactly one behavioural requirement on settles, has ${settles.length}`);
  }
  if (settles[0].beat !== c.beat || !BEATS[c.beat]) {
    throw new Error(`creatures.js: ${c.id} declares beat '${c.beat}' which is not the one on its settles rung`);
  }
  for (const rung of RUNGS) {
    if (!Array.isArray(c.rungs[rung]) || c.rungs[rung].length === 0) {
      throw new Error(`creatures.js: ${c.id} has no requirements on rung '${rung}'`);
    }
  }
  // ZONING.md: a creature settles where there is a large enough contiguous
  // patch of ITS OWN grass. That is requirement (1) of four, and a creature
  // that lost it in an edit would silently go back to being housed anywhere.
  const ground = c.rungs.settles.filter((r) => r.kind === 'patch');
  if (ground.length !== 1) {
    throw new Error(`creatures.js: ${c.id} must ask for exactly one ground on settles, asks for ${ground.length}`);
  }
  if (c.grass !== (GRASS_FOR[c.id] || null)) {
    throw new Error(`creatures.js: ${c.id} claims grass '${c.grass}', GRASS_FOR says '${GRASS_FOR[c.id]}'`);
  }
  if (!!c.grass === !!ground[0].seam) {
    throw new Error(`creatures.js: ${c.id} must ask for either its own grass or the seam, never both or neither`);
  }
}

// ---------------------------------------------------------------------------
// THE THESIS
//
// "Satyrs want mess and unicorns want purity, so one uniform garden cannot
// please everyone." That has to be TRUE, not merely discouraged, or the player
// finds the one clever layout that houses both and the whole landscape
// collapses back into a single optimisation problem.
//
// The axis bands oppose on two axes (wildness 7 vs at most 2; order at most -2
// vs at least 2) and that settles the single-tile case outright. It does NOT
// settle the sigma-radius case: the fields are smooth but not smooth enough,
// and a packing measured against this kernel reaches wildness 20 at one point
// while holding it under 1.5 two and a half tiles away.
//
// So the guarantee rests on geometry instead, and it is unconditional:
//
//   the unicorn REQUIRES an enclosure within 3 tiles  (the hortus conclusus of
//     The Unicorn Rests in a Garden — the low round palisade)
//   the satyr FORBIDS any enclosure within 6 tiles    (Cyclops: no walls, no
//     tillage, nothing whose point is work)
//
//   3 + sigma = 5.5 < 6
//
// Triangle inequality, and there is nothing the player can build to get round
// it. The half-tile is the margin; the guaranteed separation is 3 tiles.
// ---------------------------------------------------------------------------

export const THESIS = Object.freeze({
  a: 'satyr',
  b: 'unicorn',
  tag: 'enclosure',
  requireRadius: 3, // unicorn: at least one, within this
  forbidRadius: 6, // satyr: none at all, within this
  sigma: SIGMA,
  axisOppositions: Object.freeze([
    Object.freeze({ axis: 'grass', satyr: 'a thicket patch', unicorn: 'a millefleurs patch' }),
    Object.freeze({ axis: 'enclosure', satyr: 'none within 6', unicorn: 'one within 3' }),
  ]),
});

/**
 * Machine-checkable proof that the satyr and the unicorn cannot both settle
 * within one sigma of each other. tools/playtest.mjs asserts `holds`.
 */
export function proveThesis(sigma = SIGMA) {
  const uni = UNICORN.rungs.settles.find((r) => r.kind === 'count' && r.dir === 'at-least' && r.tag === THESIS.tag);
  const sat = SATYR.rungs.settles.find((r) => r.kind === 'count' && r.dir === 'at-most' && r.tag === THESIS.tag);
  const wired = !!uni && !!sat && uni.n >= 1 && sat.n === 0;
  const separation = wired ? sat.radius - uni.radius : 0;
  const holds = wired && separation > sigma;

  // LEMMA 1, and it is new with the zoning model: a tile resolves to exactly
  // ONE grass type, and every creature requires a patch of its OWN. So no two
  // species can settle on one tile — not just these two, ANY two. The old axis
  // bands never managed that; the ground does it for free by being ground.
  const grassPairs = [];
  for (let i = 0; i < CREATURES.length; i++) {
    for (let j = i + 1; j < CREATURES.length; j++) {
      const a = CREATURES[i];
      const b = CREATURES[j];
      const ga = requiredGrass(a);
      const gb = requiredGrass(b);
      if (!ga || !gb) continue; // Pan asks for the seam, which is nobody's
      if (ga !== gb) grassPairs.push({ a: a.id, b: b.id, aGrass: ga, bGrass: gb });
    }
  }
  const grassLemma = grassPairs.length === 6; // every pair of the four

  // LEMMA 2, the single-tile half. Under the zoning model the two creatures'
  // fundamental opposition is which grass they stand on, so that is the first
  // contradiction listed; the surviving CONDITIONS (seclusion, maturity) are
  // checked after it in case a later edit puts them in opposition too.
  const contradictions = [];
  const sg = requiredGrass(SATYR);
  const ug = requiredGrass(UNICORN);
  if (sg && ug && sg !== ug) {
    contradictions.push({ axis: 'grass', satyrNeeds: `a ${sg} patch`, unicornNeeds: `a ${ug} patch` });
  }
  for (const axis of AXES) {
    const s = SATYR.rungs.settles.find((r) => r.kind === 'axis' && r.axis === axis);
    const u = UNICORN.rungs.settles.find((r) => r.kind === 'axis' && r.axis === axis);
    if (!s || !u) continue;
    if (s.ideal != null && u.max != null && s.ideal > u.max) {
      contradictions.push({ axis, satyrNeeds: `>= ${s.ideal}`, unicornNeeds: `<= ${u.max}` });
    }
    if (u.ideal != null && s.max != null && u.ideal > s.max) {
      contradictions.push({ axis, satyrNeeds: `<= ${s.max}`, unicornNeeds: `>= ${u.ideal}` });
    }
  }

  return Object.freeze({
    holds: holds && grassLemma,
    wired,
    sigma,
    requireRadius: wired ? uni.radius : null,
    forbidRadius: wired ? sat.radius : null,
    separation, // minimum tiles that must lie between the two homes
    margin: separation - sigma,
    grassLemma,
    grassPairs: Object.freeze(grassPairs.map(Object.freeze)),
    axisContradictions: contradictions,
    argument:
      `Ground: a tile has one grass. The satyr settles only on ${sg}, the unicorn only on ${ug}, ` +
      `so no tile can hold both — and that holds for all ${grassPairs.length} pairs, not just this one. ` +
      `Distance: the unicorn needs an ${THESIS.tag} within ${wired ? uni.radius : '?'} tiles of its home B. ` +
      `The satyr needs none within ${wired ? sat.radius : '?'} tiles of its home A. ` +
      `If |A-B| <= ${sigma} then that enclosure lies within ${wired ? uni.radius + sigma : '?'} of A, ` +
      `which is inside ${wired ? sat.radius : '?'}. Contradiction, for every possible garden.`,
  });
}

/**
 * THE GROUND-CONFLICT AUDIT.
 *
 * Under the zoning model a creature's count requirements and its grass
 * requirement can quietly fight each other, and the failure is invisible in
 * every individual rule: each requirement is sourced, each is reasonable, and
 * together they tell the player to plant something that hands their own ground
 * to a rival.
 *
 * The law: **a creature must never be required to place an object with zero
 * affinity for it and a positive affinity for somebody else.** A tie is fine —
 * the cave really is shared between satyr and naiad and the willow really is
 * shared between naiad and unicorn, and that dilution is the designed tension.
 * A carrier that is purely a rival's is not tension, it is a contradiction.
 *
 * This caught exactly one live fault (the unicorn's pine) and it caught it only
 * because it was written down; reading the rules one at a time does not find
 * it. Pass the catalogue and fields.js's `affinityWeights` — creatures.js does
 * not import either, so the audit is the caller's to run and the rule is ours
 * to state.
 *
 * @param {Array} catalog          every placeable
 * @param {Function} weightsOf     (def) => { satyr?, centaur?, naiad?, unicorn? }
 * @returns {Array<{creature,rung,tag,carriers,worst}>} the conflicts, empty when clean
 */
export function auditGroundConflicts(catalog, weightsOf) {
  const out = [];
  if (!Array.isArray(catalog) || typeof weightsOf !== 'function') return out;
  for (const c of CREATURES) {
    const mine = c.id;
    if (!GRASS_FOR[mine]) continue; // Pan wants the seam; nothing can conflict
    for (const rung of RUNGS) {
      for (const req of c.rungs[rung]) {
        if (req.kind !== 'count' || req.dir !== 'at-least') continue;
        const carriers = catalog.filter((d) => (d.tags || []).includes(req.tag));
        if (!carriers.length) continue;
        let bestNet = -Infinity;
        let worst = null;
        for (const d of carriers) {
          const w = weightsOf(d) || {};
          const own = w[mine] || 0;
          let rivalTop = 0;
          let rival = null;
          for (const id of AFFINITY_ORDER) {
            if (id === mine) continue;
            const v = w[id] || 0;
            if (v > rivalTop) {
              rivalTop = v;
              rival = id;
            }
          }
          const net = own - rivalTop;
          if (net > bestNet) {
            bestNet = net;
            worst = { id: d.id, own, rival, rivalTop };
          }
        }
        // Strictly negative: even the FRIENDLIEST carrier grows a rival more
        // than it grows this creature. A tie (net === 0) is a shared object and
        // is exactly what the dual-affinity pieces are for.
        if (bestNet < 0) {
          out.push({
            creature: mine,
            grass: GRASS_FOR[mine],
            rung,
            tag: req.tag,
            carriers: carriers.length,
            worst,
            note:
              `${mine} must plant '${req.tag}', but the best carrier (${worst.id}) ` +
              `gives it ${worst.own} and gives ${worst.rival} ${worst.rivalTop} — ` +
              `it would be growing ${GRASS_FOR[worst.rival]} on its own ground.`,
          });
        }
      }
    }
  }
  return out;
}

/** The grass a creature's `settles` rung asks for, or null (Pan's seam). */
export function requiredGrass(creature) {
  if (!creature) return null;
  const p = (creature.rungs.settles || []).find((r) => r.kind === 'patch');
  if (!p || p.seam) return null;
  return creature.grass || GRASS_FOR[creature.id] || null;
}

// ---------------------------------------------------------------------------
// WATER, PER SPECIES — docs/CREATURE-MOVEMENT.md §2
//
// Water used to be passable for everyone, on purpose, because the naiad's whole
// home is a pool. Right for her, wrong for a unicorn. So the predicate stops
// being one shared rule and becomes a property of the ANIMAL, which is more
// characterful than a flat ban and — the part that matters — costs no new art:
// in every case the creature is either genuinely of the water or never enters
// it, so nothing here ever needs a wading sprite.
//
//   dweller  enters freely. She is a water spirit; standing in her own pool is
//            correct, and she needs no waterline cut because she is part of it.
//   ford     crossings only — a bridge, stepping stones, a rocky ford. He
//            stands ON the crossing object, not in the water. THIS IS THE
//            PAYOFF: three items that were decorative become mechanically real,
//            and the player discovers it by building a path.
//   never    comes to the brink and stops. The unicorn dips her horn from the
//            edge (the alicorn purification beat) — standing at the water's
//            edge is more evocative than standing in it, so this is a character
//            decision and not a limitation.
//
// Deliberately NOT modelled (the doc says so outright): shallow vs deep water
// as separate tile types, and swimming. Nothing swims.
// ---------------------------------------------------------------------------

/** The three ways a creature can relate to water. */
export const WATER_RULES = Object.freeze(['dweller', 'ford', 'never']);

/** Which one each species takes. The table in CREATURE-MOVEMENT.md §2. */
export const WATER_RULE = Object.freeze({
  satyr: 'ford', // would plunge in a spring given the art; crossings for now
  centaur: 'ford', // fords and bridges — Thessalian rivers, on the crossing
  naiad: 'dweller', // she IS the water
  unicorn: 'never', // the brink, and the horn goes in, and she does not
  // Pan is the hidden fifth and the doc's table does not reach him. He keeps
  // the satyr's company and the satyr's feet, so he takes the satyr's rule.
  pan: 'ford',
});

/**
 * The water rule for a species. Unknown species get `ford` — the middle of the
 * three, so a creature added without a row in the table neither drowns the
 * illusion by strolling across a pond nor finds itself walled in by a puddle.
 */
export function waterRuleFor(speciesId) {
  return WATER_RULE[speciesId] || 'ford';
}

// ---------------------------------------------------------------------------
// Agents — what the player actually watches
//
// Cosy pacing is the whole brief. Nothing darts. A leg of a walk is one to
// three tiles, taken at a bit over a tile a second, easing out of the start and
// into the end, and then it stands still for several seconds and looks around.
// The wander is a slight lateral drift along the leg, not a swerve.
// ---------------------------------------------------------------------------

// Tiles per second. The eased leg peaks at 1.5x these, so a walking creature
// tops out a little under 1.5 tiles/sec — a stroll at a 64px tile. Nothing in
// Arcadia darts, and these two numbers are the whole reason.
const WALK_SPEED = 0.95;
const AMBLE_SPEED = 0.6;

/**
 * THE INVARIANT (docs/CREATURE-MOVEMENT.md §1).
 *
 * A creature may be outside the map in EXACTLY THESE THREE STATES and no
 * others. `arriving`, `leaving` and `offstage` are the walks-in-at-dusk-and-
 * wanders-back-off behaviour of the `visits` rung, which is design and not a
 * defect. Every other state is grounded, and a grounded creature's position is
 * clamped into the map at the one place a position is ever written.
 *
 * Stated as a set rather than checked inline so that adding a state is a
 * decision someone has to make here, in front of this comment, rather than
 * something that quietly opens the sky again.
 */
export const OFFMAP_STATES = Object.freeze(new Set(['arriving', 'leaving', 'offstage']));

/**
 * How far outside the map the entrance and the exit sit, in tiles. Both ends of
 * the transit use it, so a creature arrives from exactly as far out as it left.
 */
export const TRANSIT_TILES = 1.5;

/**
 * Over how much of that transit the sprite dissolves. Solid at the rim of the
 * map, gone one tile out — comfortably before the far end of the walk at
 * TRANSIT_TILES, so nothing is ever visible over open sky.
 */
export const FADE_TILES = 1.0;

/**
 * How far from a tile's CENTRE a wander target may sit. `_wanderTarget` checks
 * a tile and then hands back a fractional point; at half a tile that point is
 * on the boundary of a tile nobody validated, and at the rim of the map that
 * boundary is sky. 0.4 keeps the point provably inside what was checked while
 * leaving the wander organic rather than snapping every stroll to a grid.
 */
const TILE_INSET = 0.4;

const inTile = (d) => (d < -TILE_INSET ? -TILE_INSET : d > TILE_INSET ? TILE_INSET : d);

export class Agent {
  constructor(creature, seed, opts = {}) {
    this.creature = creature;
    this.id = creature.id + (opts.companion ? ':companion' : '');
    this.companion = !!opts.companion;
    this.rng = mulberry32(seed);
    this.x = 0;
    this.y = 0;
    /**
     * The map this agent is bounded by. Zero means "not told yet", in which
     * case nothing is clamped — an Agent constructed bare in a test is not
     * silently pinned to a 1x1 world. Bestiary always tells it, and `enter`
     * and `leave` are handed the dimensions anyway and record them too.
     */
    this.mapW = opts.mapW > 0 ? opts.mapW : 0;
    this.mapH = opts.mapH > 0 ? opts.mapH : 0;
    /**
     * This creature's own passability predicate, which is species-specific
     * because water is (see WATER_RULE). Null falls back to whatever the
     * environment hands over, which is how a bare Agent still walks.
     */
    this.passable = opts.passable || null;
    this.state = 'offstage';
    this.pose = 'idle';
    this.facing = 2;
    this.speed = 0;
    this.t = 0;
    this.hold = 0;
    this.from = null;
    this.to = null;
    this.legT = 0;
    this.legLen = 0;
    this.drift = this.rng() * Math.PI * 2; // desynchronised, per RESEARCH A.8
    this.phase = this.rng();
    this.desaturated = true; // until it settles, it has no colour
    this.beat = null;
    this.beatT = 0;
    this.homeTile = null;
    this.visitLeft = 0;
    /**
     * Seconds elapsed in the current pose. The renderer needs this for a
     * one-shot gesture like the drink, which is played from its own start
     * rather than from the wall clock — otherwise a satyr who raises his cup
     * half a second before the frame lands starts the animation halfway
     * through, and the cup appears already at his lips.
     */
    this.poseT = 0;
    this._lastPose = 'idle';
    /** True while the act being performed is a flourish rather than a beat. */
    this.flourish = false;
    /** Garden seconds until this flourish may be offered again, per id. */
    this.cool = new Map();

    /**
     * How the creature is FEELING, which is a rendering hint and never a score.
     *
     *   content   the ordinary state
     *   restless  its ground went contested or stopped being its own; it is on
     *             its way to the nearest tile that still is
     *   unhappy   there is no ground of its type left anywhere on the map. It
     *             stays exactly where it is and looks miserable. It does NOT
     *             leave. SPEC section 0 and ZONING.md both make this the floor
     *             and it is absolute.
     */
    this.mood = 'content';

    /** Remaining waypoints of the current route. Ramps and stairs live here. */
    this.route = [];
  }

  get present() {
    return this.state !== 'offstage';
  }

  /** True when the CURRENT state licenses a position outside the map. */
  get offmapAllowed() {
    return OFFMAP_STATES.has(this.state);
  }

  // ------------------------------------------------------------ the position
  //
  // THE CHOKE POINT. Every write of `x` and `y` goes through `_place`, and
  // `_place` is the only code in this file that enforces the invariant above.
  //
  // It is deliberately NOT a patch to `_wanderTarget`, or to `leave`, or to any
  // other producer of targets. The point of putting it on the WRITE rather than
  // on each producer is that the sky becomes unreachable regardless of which
  // code path produced the position — so the next pathing bug, the next
  // relocation, the next hand-placed companion offset, cannot put anything up
  // there either. A producer-side fix protects against the bug you have found.
  // A writer-side fix protects against the one you have not.

  /**
   * Move to (x, y), clamped into the map unless the state says otherwise.
   * @param {number} x @param {number} y
   */
  _place(x, y) {
    if (OFFMAP_STATES.has(this.state)) {
      this.x = x;
      this.y = y;
      return;
    }
    this.x = this._onMapX(x);
    this.y = this._onMapY(y);
  }

  /**
   * A coordinate brought on to the map — the bound `_place` enforces, on its
   * own so a producer can aim at a legal point rather than at one that will be
   * corrected. Zero width means "not told which map yet", and nothing is moved.
   *
   * The bound is the TILE CENTRE, not the tile's extent: a sprite's anchor sits
   * on the centre point (SPEC §2), so a creature at x = -0.4 is drawn with its
   * feet four tenths of a tile out past the last diamond, over open sky. Tile 0
   * being legal does not make all of tile 0 legal to stand on.
   */
  _onMapX(x) {
    if (!(this.mapW > 0)) return x;
    return x < 0 ? 0 : x > this.mapW - 1 ? this.mapW - 1 : x;
  }

  /** @see _onMapX */
  _onMapY(y) {
    if (!(this.mapH > 0)) return y;
    return y < 0 ? 0 : y > this.mapH - 1 ? this.mapH - 1 : y;
  }

  /**
   * Re-assert the invariant against the state the agent is in NOW.
   *
   * `_place` clamps as it writes, but a state transition happens AFTER the
   * write that preceded it — an agent finishing its arrival becomes `idle`
   * holding a position that was legal a microsecond ago. This is the same one
   * rule applied again at the end of the tick, and it is what makes the
   * invariant hold for every state, not merely for the ones that move.
   */
  _clampToMap() {
    this._place(this.x, this.y);
  }

  /**
   * How far inside the map this agent is, in tiles. Zero on the rim, negative
   * out over the sky. Used for the transit fade and by the tests.
   */
  inset() {
    if (!(this.mapW > 0 && this.mapH > 0)) return 1;
    return Math.min(this.x, this.y, this.mapW - 1 - this.x, this.mapH - 1 - this.y);
  }

  /**
   * Opacity, 0..1 — how solid the renderer should draw this creature.
   *
   * A grounded creature is always 1. Only the transit fades, and it fades on
   * DISTANCE rather than on time, so a creature that stops halfway out (or is
   * watched at 1/4 speed, or is paused) is exactly as faint as its position
   * says it should be. Solid at the rim, gone one tile out.
   *
   * This is the whole of the "satyr in the sky" presentation fix: the walk is
   * unchanged and still correct, but nothing is drawn over open sky. And a
   * creature arriving out of the dusk is the mood the `visits` rung was going
   * for in the first place.
   */
  fade() {
    if (this.state === 'offstage') return 0;
    if (!OFFMAP_STATES.has(this.state)) return 1;
    return clamp01(1 + this.inset() / FADE_TILES);
  }

  /**
   * Follow a route — a list of tile waypoints from Zoning.route(), which has
   * already refused the cliffs and gone round by the connectors.
   */
  _follow(waypoints, speed) {
    this.route = Array.isArray(waypoints) ? waypoints.slice() : [];
    return this._nextLeg(speed);
  }

  _nextLeg(speed) {
    if (!this.route.length) return false;
    const w = this.route.shift();
    this._leg(w.x, w.y, speed || this.speed || WALK_SPEED);
    return true;
  }

  /**
   * Walk to a tile, by the ways up if the ways up are what it takes.
   *
   * With no zoning (or no route) it walks straight there, which is the right
   * answer on a flat map and the only answer on a map whose elevation model has
   * not landed yet.
   */
  goTo(tx, ty, speed, zoning, passable) {
    const pass = passable || this.passable || null;
    if (zoning) {
      const r = zoning.route({ x: this.x, y: this.y }, { x: tx, y: ty }, pass);
      if (r === null) return false; // no way there without walking through a cliff
      if (r.length) {
        this.route = r.slice();
        // Trim: the last waypoint is the tile, and we want the exact target.
        this.route[this.route.length - 1] = { x: tx, y: ty };
        return this._nextLeg(speed);
      }
    }
    this.route = [];
    this._leg(tx, ty, speed);
    return true;
  }

  /** Walk on from the nearest map edge, heading for `home`. */
  enter(home, mapW, mapH, seconds, zoning = null, passable = null) {
    if (mapW > 0) this.mapW = mapW;
    if (mapH > 0) this.mapH = mapH;
    this.homeTile = home;
    const T = TRANSIT_TILES;
    const edges = [
      { x: -T, y: home.ty, gx: 0, gy: home.ty },
      { x: mapW - 1 + T, y: home.ty, gx: mapW - 1, gy: home.ty },
      { x: home.tx, y: -T, gx: home.tx, gy: 0 },
      { x: home.tx, y: mapH - 1 + T, gx: home.tx, gy: mapH - 1 },
    ];
    let best = edges[0];
    let bestD = Infinity;
    for (const e of edges) {
      const d = Math.hypot(e.x - home.tx, e.y - home.ty);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.visitLeft = seconds;
    // The state goes in FIRST: `_place` reads it to decide whether the position
    // it is being handed is legal, and the whole point of an entrance is that
    // it starts outside. Setting the position before the state would have the
    // clamp snap the creature onto the rim and there would be no arrival.
    this.state = 'arriving';
    this.pose = 'walk';
    this._place(best.x, best.y);
    // Step on to the map first, then take the ways up from there. A route
    // cannot start off the edge of the world.
    this.route = [];
    this._leg(best.gx, best.gy, WALK_SPEED);
    if (zoning) {
      const r = zoning.route({ x: best.gx, y: best.gy }, home, passable);
      if (r && r.length) this.route = r;
      else if (r === null) this.route = [{ x: home.tx, y: home.ty }];
      else this.route = [{ x: home.tx, y: home.ty }];
    } else {
      this.route = [{ x: home.tx, y: home.ty }];
    }
  }

  leave(mapW, mapH) {
    if (mapW > 0) this.mapW = mapW;
    if (mapH > 0) this.mapH = mapH;
    const T = TRANSIT_TILES;
    const w = (this.mapW || mapW || 1) - 1;
    const h = (this.mapH || mapH || 1) - 1;
    const outs = [
      { x: -T, y: this.y },
      { x: w + T, y: this.y },
      { x: this.x, y: -T },
      { x: this.x, y: h + T },
    ];
    let best = outs[0];
    let bestD = Infinity;
    for (const o of outs) {
      const d = Math.hypot(o.x - this.x, o.y - this.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    // State first, again: `leaving` is one of the three that licenses the sky,
    // and the exit leg's target is out in it.
    this.state = 'leaving';
    this.pose = 'walk';
    this._leg(best.x, best.y, WALK_SPEED);
  }

  _leg(tx, ty, speed) {
    this.from = { x: this.x, y: this.y };
    this.to = { x: tx, y: ty };
    this.legLen = Math.hypot(tx - this.x, ty - this.y);
    this.legT = 0;
    this.speed = speed;
    if (this.legLen > 0.001) {
      const a = Math.atan2(ty - this.y, tx - this.x);
      this.facing = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    }
  }

  _advance(dt, reducedMotion) {
    if (!this.to || this.legLen < 0.001) {
      this._clampToMap();
      return true;
    }
    this.legT += (this.speed * dt) / this.legLen;
    if (this.legT >= 1) {
      this.legT = 1;
      this._place(this.to.x, this.to.y);
      return true;
    }
    // Ease out of the start and into the end. Nothing in this game starts at
    // full speed and nothing stops dead.
    const e = smoothstep(this.legT);
    let x = this.from.x + (this.to.x - this.from.x) * e;
    let y = this.from.y + (this.to.y - this.from.y) * e;
    if (!reducedMotion) {
      // A slight lateral drift along the leg, so the path is not a ruled line.
      // Note this can push a leg that runs ALONG the rim of the map a fifth of
      // a tile out over the sky, which is one of the ways the reported bug
      // happened and one of the reasons the clamp belongs on the write.
      const nx = -(this.to.y - this.from.y) / this.legLen;
      const ny = (this.to.x - this.from.x) / this.legLen;
      const amp = 0.22 * Math.sin(this.legT * Math.PI) * Math.sin(this.drift + this.legT * 3.1);
      x += nx * amp;
      y += ny * amp;
    }
    // Progress is tracked by `legT`, not by the position, so clamping here can
    // never stall a leg: the walk still completes on schedule, it simply does
    // not leave the map to do it.
    this._place(x, y);
    return false;
  }

  /**
   * Somewhere nearby worth ambling to. With a zoning model in hand the
   * candidate must be REACHABLE — a creature that keeps choosing a spot across
   * a cliff and then teleporting to it is the loudest possible tell that the
   * elevation is painted on rather than real.
   */
  _wanderTarget(home, radius, passable, zoning) {
    for (let i = 0; i < 10; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 0.6 + this.rng() * radius;
      const tx = home.tx + Math.cos(a) * r;
      const ty = home.ty + Math.sin(a) * r;
      const d = Math.hypot(tx - this.x, ty - this.y);
      if (d < 1.2 || d > 4) continue;
      const rx = Math.round(tx);
      const ry = Math.round(ty);
      if (passable && !passable(rx, ry)) continue;
      if (zoning && zoning.route({ x: this.x, y: this.y }, { x: rx, y: ry }, passable) === null) {
        continue;
      }
      // WHAT WAS CHECKED WAS THE TILE. The raw fractional target sits up to
      // half a tile from that tile's centre — on its boundary, which is to say
      // in a tile nobody validated, and on the rim of the map that neighbour is
      // sky. Hand back a point provably inside what was actually approved.
      //
      // And then hand back a point on the MAP, which is a second thing: an
      // approved EDGE tile still owns half a diamond of sky, so (-0.39, 2.83)
      // is a legal tile at an illegal position. `_place` would clamp it, but a
      // creature spending a whole leg pressed against the clamp reads as stuck
      // — better that it never aims out there in the first place.
      return { x: this._onMapX(rx + inTile(tx - rx)), y: this._onMapY(ry + inTile(ty - ry)) };
    }
    return { x: home.tx, y: home.ty };
  }

  update(dt, env) {
    this.t += dt;
    this.phase = (this.phase + dt * 0.35) % 1;
    const rm = !!env.reducedMotion;
    // Its OWN predicate first: water is species-specific (WATER_RULE), so a
    // shared environment predicate is only the fallback for an Agent nobody
    // told which animal it is.
    const pass = this.passable || env.passable;

    switch (this.state) {
      case 'offstage':
        return;

      case 'arriving':
        if (this._advance(dt, rm)) {
          if (this._nextLeg(this.speed)) break; // still on the route
          this.state = 'idle';
          this.pose = 'idle';
          this.hold = 1.5 + this.rng() * 2.5;
        }
        break;

      case 'wander':
        if (this._advance(dt, rm)) {
          if (this._nextLeg(this.speed)) break;
          this.state = 'idle';
          this.pose = 'idle';
          this.hold = 2 + this.rng() * 4; // long, unhurried pauses
        }
        break;

      case 'idle':
        this.hold -= dt;
        if (this.hold <= 0) {
          // An unhappy creature does not wander. It stays where it is, which is
          // the whole of the never-evict promise made visible: it has not left,
          // it is not going anywhere, and it is not pretending to be fine.
          if (this.mood === 'unhappy') {
            this.hold = 3 + this.rng() * 3;
            this.pose = 'idle';
            break;
          }
          const home = this.homeTile || { tx: this.x, ty: this.y };
          const target = this._wanderTarget(home, env.homeRadius || HOME_RADIUS, pass, env.zoning);
          this.goTo(target.x, target.y, this.rng() < 0.3 ? AMBLE_SPEED : WALK_SPEED, env.zoning, pass);
          this.state = 'wander';
          this.pose = 'walk';
        }
        break;

      case 'travel':
        if (this._advance(dt, rm)) {
          if (this._nextLeg(this.speed)) break;
          this._beginAct(env);
        }
        break;

      case 'perform':
        this.beatT -= dt;
        if (this.beatT <= 0) {
          const done = this.beat;
          const wasFlourish = this.flourish;
          this.beat = null;
          this.flourish = false;
          this.state = 'idle';
          this.pose = 'idle';
          this.hold = 2 + this.rng() * 2;
          // A flourish announces itself so the renderer and the tests can see
          // it, but it is NOT a `beat-done` — that event is what writes the
          // ceremony into the bestiary, and a repeatable act must never reach
          // it. See recordBeat, which is the only listener that matters.
          env.emit({
            type: wasFlourish ? 'flourish-done' : 'beat-done',
            creature: this.creature.id,
            beat: done,
            tx: this.x,
            ty: this.y,
          });
        }
        break;

      case 'leaving':
        if (this._advance(dt, rm)) {
          if (this._nextLeg(this.speed)) break;
          this.state = 'offstage';
          this.pose = 'idle';
          env.emit({ type: 'visit-end', creature: this.creature.id });
        }
        break;
    }

    if (this.state !== 'offstage' && this.state !== 'leaving' && this.visitLeft > 0) {
      this.visitLeft -= dt;
    }

    // Cooldowns run on garden time whatever the creature is doing.
    if (this.cool.size) {
      for (const [id, left] of this.cool) {
        if (left - dt <= 0) this.cool.delete(id);
        else this.cool.set(id, left - dt);
      }
    }

    // Time elapsed IN THE CURRENT POSE, reset on the tick the pose changes.
    // Derived here rather than written at each of the ten places that assign
    // `pose`, because one missed assignment is a gesture that starts halfway
    // through and there would be no way to see which one.
    if (this.pose !== this._lastPose) {
      this._lastPose = this.pose;
      this.poseT = 0;
    } else {
      this.poseT += dt;
    }

    // THE INVARIANT, re-asserted after this tick's transitions have landed.
    // Everything above that MOVED the agent clamped as it wrote; this catches
    // the case where the state changed after the write — an arrival becoming
    // `idle`, a leg ending as the route ran out — and it is what lets the
    // playtest assert "never out of bounds in a grounded state" as a fact about
    // the observable position rather than as a hope about the code paths.
    this._clampToMap();
  }

  /** Arrived at the site: stand up straight and start doing the thing. */
  _beginAct(env) {
    const a = ACTS[this.beat];
    if (!a) {
      // The act was retired out from under it. Do not strand the agent in
      // `travel` for ever waiting for a pose that no longer exists.
      this.beat = null;
      this.flourish = false;
      this.state = 'idle';
      this.pose = 'idle';
      return;
    }
    this.state = 'perform';
    this.pose = a.pose;
    // Reset the pose clock HERE as well as in update(). The derived tracking in
    // update() catches every ordinary transition, but an act begun between
    // ticks — askFlourish is called from the frame loop, not from the step —
    // would render one frame before update() noticed, and for a one-shot that
    // one frame is the END of the gesture. The cup would flash empty and then
    // start rising.
    this.poseT = 0;
    this._lastPose = a.pose;
    this.beatT = a.seconds;
    this.flourish = !!a.flourish;
    if (a.cooldown) {
      const [lo, hi] = a.cooldown;
      this.cool.set(a.id, lo + this.rng() * (hi - lo));
    }
    if (env && env.emit) {
      env.emit({
        type: this.flourish ? 'flourish-start' : 'beat-start',
        creature: this.creature.id,
        beat: this.beat,
        tx: this.x,
        ty: this.y,
      });
    }
  }

  /** Send it to perform an act at a site, by the ways up if need be. */
  goPerform(beatId, site, zoning = null, passable = null) {
    this.beat = beatId;
    if (!this.goTo(site.x, site.y, AMBLE_SPEED, zoning, passable || this.passable)) {
      this.beat = null;
      return false; // no route: the site is across a cliff. Try again later.
    }
    this.state = 'travel';
    this.pose = 'walk';
    return true;
  }

  /**
   * Start an act WHERE IT IS STANDING, with no journey first.
   *
   * This is how the piping starts: the score begins the moment he walks into
   * the garden, and sending him off to find a spot to play in would put a
   * thirty-second walk between the music and the musician.
   *
   * Refuses if it is mid-transit or already performing — a satyr who is still
   * dissolving in over the map rim has nowhere to stand yet.
   */
  startFlourish(id, env) {
    const a = FLOURISHES[id];
    if (!a) return false;
    if (!this.present) return false;
    if (OFFMAP_STATES.has(this.state)) return false;
    if (this.state === 'travel' || this.state === 'perform') return false;
    if (this.cool.has(id)) return false;
    this.route = [];
    this.from = null;
    this.to = null;
    this.beat = id;
    this._beginAct(env);
    return true;
  }

  /** The renderer's whole read of this agent. */
  view() {
    return {
      id: this.id,
      creature: this.creature.id,
      x: this.x,
      y: this.y,
      depth: this.x + this.y, // fractional, so it never pops past a tree
      facing: this.facing,
      pose: this.pose,
      /**
       * Seconds spent in this pose. The renderer plays a ONE-SHOT gesture from
       * this rather than from the wall clock, so a drink always starts with the
       * cup at his side instead of wherever the shared clock happened to be.
       */
      poseT: this.poseT,
      phase: this.phase,
      desaturated: this.desaturated,
      companion: this.companion,
      present: this.present,
      /**
       * Opacity, 0..1. Solid everywhere except the transit across the map
       * boundary, where the creature dissolves into (and out of) the dusk
       * instead of walking visibly over open sky — CREATURE-MOVEMENT.md §1.
       * The renderer stipples rather than alpha-blends; the number is the
       * coverage it quantises.
       */
      fade: this.fade(),
      /** Tiles inside the map. Negative means over the sky, which only the
       *  three OFFMAP_STATES may ever be — the tests assert exactly this. */
      inset: this.inset(),
      state: this.state,
      // A rendering hint, not a rating. 'restless' should read as fidget and
      // glance-about; 'unhappy' as head-down and still.
      mood: this.mood,
      level: this.level || 0,
    };
  }
}

// ---------------------------------------------------------------------------
// The bestiary — the ladder, the agents, the journal, and the events
// ---------------------------------------------------------------------------

export class Bestiary {
  /**
   * `passable` is called as `(tx, ty, speciesId)`. The third argument is what
   * makes water species-specific (WATER_RULE): the host's predicate decides,
   * per creature, whether a water tile is home, a ford, or a wall. A host that
   * ignores the argument gets exactly the old one-rule-for-everyone behaviour,
   * which is what every existing caller passing `() => true` relies on.
   *
   * @param {{fields: Fields, seed?: number,
   *          passable?: (tx:number,ty:number,species?:string)=>boolean,
   *          daySeconds?: number}} opts
   */
  constructor(opts = {}) {
    const {
      fields, seed = 20000, passable = null, daySeconds = DAY_SECONDS,
      // `world` is accepted as an alias because that is what the host actually
      // has in its hand, and a creature layer that silently loses its waterfalls
      // because the option was spelled the other way is a bad trade for strictness.
      terrain = opts.world || null,
      affinityOf = null,
    } = opts;
    if (!fields) throw new Error('Bestiary: needs the Fields instance');
    this.fields = fields;
    this.passable = passable;
    this.daySeconds = daySeconds;
    /**
     * The ground, in both senses. `terrain` is the optional host object that
     * knows about levels, water and grass — main.js passes the world. Without
     * one, Zoning computes the grass itself from the placements and reports a
     * flat map, so nothing here has to care which sibling modules have landed.
     */
    this.zoning = new Zoning(fields, { terrain, affinityOf });
    this.rng = mulberry32(seed);
    this.events = [];
    this.time = 0;
    this._sinceScan = Infinity;
    this._fieldsVersion = -1;
    this._grids = new Map();
    this._gridVersion = -1;
    this._lastTod = 0;

    /** @type {Map<string, object>} per-creature persistent state. */
    this.state = new Map();
    /** @type {Agent[]} everything the renderer should draw. */
    this.agents = [];
    /** Memoised per-species passability predicates. @type {Map<string, Function>} */
    this._passableBy = new Map();

    let n = 0;
    for (const c of CREATURES) {
      this.state.set(c.id, {
        id: c.id,
        rung: 'unknown',
        rungIndex: -1,
        restless: false,
        // No ground of its type left anywhere. It stays put and looks unhappy;
        // this flag is never a reason to remove anything.
        stranded: false,
        restlessSince: null,
        home: null,
        candidate: null,
        name: null,
        beats: new Set(),
        tellsSeen: 0,
        firstSighted: null,
        settledAt: null,
        // last computed scores, for the tells and the card. Never rendered raw.
        scores: { sighted: 0, visits: 0, settles: 0, thrives: 0 },
        nextVisitAfter: 0,
        nextTellAfter: 0,
      });
      const a = new Agent(c, seed + 977 * ++n, {
        // The map it is bounded by, so the invariant can be enforced at the
        // one place a position is written rather than at each caller.
        mapW: this.fields.w,
        mapH: this.fields.h,
        passable: this.passableFor(c.id),
      });
      this.agents.push(a);
      this._agentFor = this._agentFor || new Map();
      this._agentFor.set(c.id, a);
    }
    this._companions = new Map();
  }

  /**
   * Ask a creature to perform a hand-started flourish where it stands.
   *
   * The only caller is the music trigger in main.js: the score begins when the
   * first satyr walks in, and this is how he is seen to be the one making it.
   *
   * Returns false — harmlessly, and every time it is asked — if the creature is
   * not on the map, is already busy, or is still dissolving in over the rim.
   * The caller is expected to keep asking rather than to check first; that is
   * what makes "start playing once he has actually arrived" a two-line job at
   * the call site instead of a state machine.
   */
  askFlourish(creatureId, flourishId) {
    const agent = this._agentFor && this._agentFor.get(creatureId);
    if (!agent) return false;
    return agent.startFlourish(flourishId, { emit: (e) => this._emit(e) });
  }

  // ------------------------------------------------------------- passability

  /**
   * This species' passability predicate, memoised.
   *
   * One predicate per creature rather than one per game, because water is a
   * property of the ANIMAL (CREATURE-MOVEMENT.md §2): the naiad's pool is her
   * home, the centaur takes the ford, the unicorn stops at the brink. Bound
   * once so `Zoning.route`, `_wanderTarget` and everything else can keep taking
   * a plain `(tx, ty) => boolean` and none of them has to know why.
   *
   * @param {string} creatureId
   * @returns {((tx:number,ty:number)=>boolean)|null}
   */
  passableFor(creatureId) {
    const base = this.passable;
    if (!base) return null;
    let fn = this._passableBy.get(creatureId);
    if (!fn) {
      fn = (tx, ty) => !!base(tx, ty, creatureId);
      this._passableBy.set(creatureId, fn);
    }
    return fn;
  }

  /** This species' rule for water. See WATER_RULE. */
  waterRuleFor(creatureId) {
    return waterRuleFor(creatureId);
  }

  // ------------------------------------------------------------------ clocks

  /** 0..1 through the garden day. Dusk is ~0.8, noon ~0.5. */
  timeOfDay() {
    return (this.fields.time / this.daySeconds) % 1;
  }

  // ------------------------------------------------------------- evaluation

  _grid(tag, radius, occluded = false) {
    if (this._gridVersion !== this.fields.version) {
      this._grids.clear();
      this._gridVersion = this.fields.version;
    }
    // The occluded grid is a DIFFERENT grid, so it needs a different cache key
    // — sharing one would hand whichever caller asked first its answer to the
    // other, and the symptom would be a repulsion that respects hedges only
    // when the map happened to be evaluated in a particular order.
    const key = `${tag}@${radius}${occluded ? '#occ' : ''}`;
    let g = this._grids.get(key);
    if (!g) this._grids.set(key, (g = this.fields.countGrid(tag, radius, { occluded })));
    return g;
  }

  /** The evaluation context for one creature at one tile. */
  _ctx(creature, tx, ty) {
    const st = this.state.get(creature.id);
    const self = this;
    const own = creature.grass || GRASS_FOR[creature.id] || null;
    return {
      tx,
      ty,
      ownGrass: own,
      field: (axis) => self.fields.at(axis, tx, ty),
      count: (tag, radius, opts) =>
        self._grid(tag, radius, !!(opts && opts.occluded))[ty * self.fields.w + tx] | 0,
      grass: () => self.zoning.grassAt(tx, ty),
      patchSize: (cap) => self.zoning.patchAt(tx, ty, own, cap),
      seam: () => self.zoning.seamAt(tx, ty),
      zoningClaimed: () => self.zoning.claimed,
      hasElevation: () => self.zoning.supports.elevation,
      feature: (name, radius) => self.zoning.featureCount(name, tx, ty, radius),
      other: (id) => {
        const o = self.state.get(id);
        return o ? { rungIndex: o.rungIndex, home: o.home } : null;
      },
      hasBeat: (id) => st.beats.has(id),
      beatSiteReady: (id) => {
        const b = BEATS[id];
        if (!b) return false;
        return !!self.fields.nearest(b.site, tx, ty, b.radius);
      },
    };
  }

  /** Score one rung at one tile. Returns { score, met, results }. */
  evaluateRung(creature, rungName, tx, ty, ctx = null) {
    const reqs = creature.rungs[rungName] || [];
    const c = ctx || this._ctx(creature, tx, ty);
    let sum = 0;
    let met = true;
    const results = [];
    for (const r of reqs) {
      const out = r.evaluate(c);
      sum += out.score;
      if (!out.met) met = false;
      results.push({ req: r, ...out });
    }
    return { score: reqs.length ? sum / reqs.length : 1, met, results };
  }

  /**
   * The best tile on the map for this creature to live at, by its settling
   * requirements. This is what picks the candidate home for a ghost visit and
   * what a restless creature relocates to.
   */
  bestSpotFor(creatureId, rungName = 'settles') {
    const creature = CREATURE_BY_ID.get(creatureId);
    if (!creature) return null;
    let best = null;
    let bestScore = -1;
    // Its OWN predicate: a unicorn is never sited in a pond and a naiad may be,
    // which is the water table doing its work at the point where a home is
    // chosen rather than only at the point where a foot is put down.
    const pass = this.passableFor(creatureId);
    for (let ty = 0; ty < this.fields.h; ty++) {
      for (let tx = 0; tx < this.fields.w; tx++) {
        if (pass && !pass(tx, ty)) continue;
        const r = this.evaluateRung(creature, rungName, tx, ty);
        // A tie-break, not a requirement, and it never appears in the journal:
        // it only decides WHICH of two equally good tiles a creature walks to.
        const score = r.score + this._siting(creature, tx, ty);
        if (score > bestScore) {
          bestScore = score;
          best = { tx, ty, score: r.score, met: r.met };
        }
      }
    }
    return best;
  }

  /**
   * A creature's taste in a place, over and above what it requires.
   *
   * The naiad is the reason this exists. ELEVATION.md: "a spring high on a
   * terrace, falling to a pool below, is a far better thing to build than a
   * puddle" — so given two equally legal fens she takes the one with the fall
   * in it, and a player who builds a waterfall SEES her choose it. That is
   * worth more than another requirement, because it costs the player nothing
   * and rewards them anyway.
   *
   * Tiny by construction (at most 0.09 against a rung score of 1) so it can
   * never promote a tile that does not meet the requirements. It is a
   * preference, not a back door.
   */
  _siting(creature, tx, ty) {
    const z = this.zoning;
    let s = 0;
    switch (creature.id) {
      case 'naiad':
        if (z.featureCount('waterfall', tx, ty, 4) > 0) s += 0.06;
        if (z.featureCount('pool', tx, ty, 3) > 0) s += 0.02;
        break;
      case 'unicorn':
        // The hortus conclusus: a hollow is enclosed by being sunk.
        if (z.isHollow(tx, ty)) s += 0.04;
        if (z.featureCount('pool', tx, ty, 3) > 0) s += 0.03;
        break;
      case 'satyr':
        // Un-tended hill country, and the cave mouth wants a hillside.
        if (z.isSummit(tx, ty)) s += 0.04;
        if (z.featureCount('cliff', tx, ty, 3) > 0) s += 0.03;
        break;
      case 'centaur':
        // An open run is a level one. Nothing rewards a centaur for a cliff.
        if (z.featureCount('cliff', tx, ty, 2) === 0) s += 0.03;
        break;
      case 'pan':
        if (z.featureCount('cliff', tx, ty, 4) > 0) s += 0.02;
        break;
      default:
        break;
    }
    return s;
  }

  _rescan() {
    for (const creature of CREATURES) {
      const st = this.state.get(creature.id);

      // Where is this creature judged? Settled creatures are judged at home.
      // Everyone else is judged at the best spot the garden currently offers,
      // which is also where the ghost will come to wander.
      let where = st.home;
      if (!where) {
        const best = this.bestSpotFor(creature.id, 'settles');
        st.candidate = best;
        where = best ? { tx: best.tx, ty: best.ty } : { tx: (this.fields.w / 2) | 0, ty: (this.fields.h / 2) | 0 };
      }

      const ctx = this._ctx(creature, where.tx, where.ty);
      const per = {};
      for (const rn of RUNGS) per[rn] = this.evaluateRung(creature, rn, where.tx, where.ty, ctx);
      st.scores = { sighted: per.sighted.score, visits: per.visits.score, settles: per.settles.score, thrives: per.thrives.score };
      st.lastResults = per;
      st.where = where;

      // The ladder only ever goes up. A journal entry, once filled, is never
      // un-filled — SPEC section 0.
      let reached = -1;
      for (let i = 0; i < RUNGS.length; i++) {
        if (per[RUNGS[i]].met) reached = i;
        else break;
      }
      if (reached > st.rungIndex) this._promote(creature, st, reached, where);

      // ------------------------------------------------------ restlessness --
      //
      // THE FLOOR, and it is absolute (SPEC section 0, ZONING.md "Contested
      // ground"). A settled creature is never evicted, by anything. Contested
      // ground does not throw it out; razing its whole habitat does not throw
      // it out; there is no state of the garden that makes it leave.
      //
      // What CAN happen is three things, in this order:
      //   1. its ground stops being its own (contested, or flipped to another
      //      species) — it becomes visibly restless,
      //   2. it walks to the nearest tile of its own grass and lives there,
      //   3. and if there is no such tile left anywhere on the map, it stays
      //      exactly where it is and looks unhappy.
      //
      // Note what is NOT here: any branch that removes an agent, lowers a rung,
      // or empties a journal entry.
      if (st.rungIndex >= RUNG_INDEX.settles) {
        const agent = this._agentFor.get(creature.id);
        const own = creature.grass || GRASS_FOR[creature.id] || null;
        const here = this.zoning.grassAt(st.home.tx, st.home.ty);
        const groundOk = own
          ? !this.zoning.claimed || (here.type === own && !here.contested)
          : this.zoning.seamAt(st.home.tx, st.home.ty).seam || !this.zoning.claimed;
        const homeOk = per.settles.met && groundOk;

        if (!homeOk && !st.restless) {
          st.restless = true;
          st.restlessSince = this.fields.time;
          this.events.push({
            type: 'restless',
            creature: creature.id,
            home: { ...st.home },
            // The renderer and the journal both want to know WHY, because
            // "the ground under it went contested" is a much better sentence
            // than "requirements no longer met".
            reason: !groundOk ? (here.contested ? 'contested' : 'ground-lost') : 'habitat',
            contested: !!here.contested,
          });
        } else if (homeOk && st.restless) {
          st.restless = false;
          st.stranded = false;
          this.events.push({ type: 'settled-again', creature: creature.id, home: { ...st.home } });
        }

        if (st.restless) {
          // Step 2: the nearest tile of its own grass. Preferred over the
          // best-scoring tile on the map, because "it walked to the nearest
          // patch of thicket" is legible and "it teleported to the global
          // optimum" is not.
          let target = null;
          if (own) {
            const near = this.zoning.nearestOwnGrass(st.home.tx, st.home.ty, own, 14);
            if (near) target = { tx: near.tx, ty: near.ty };
          }
          if (!target) {
            const best = this.bestSpotFor(creature.id, 'settles');
            if (best && best.score > per.settles.score + 0.03) target = { tx: best.tx, ty: best.ty };
          }

          if (target && (target.tx !== st.home.tx || target.ty !== st.home.ty)) {
            const from = { ...st.home };
            st.home = { tx: target.tx, ty: target.ty };
            st.stranded = false;
            if (agent) {
              agent.homeTile = st.home;
              agent.mood = 'restless';
              // By the connectors. If the patch is up a terrace it walks round
              // to the ramp; if there is genuinely no way, it stays put rather
              // than walking through a cliff.
              if (agent.goTo(target.tx, target.ty, AMBLE_SPEED, this.zoning, this.passableFor(creature.id))) {
                agent.state = 'wander';
                agent.pose = 'walk';
              }
            }
            this.events.push({ type: 'relocated', creature: creature.id, from, to: { ...st.home } });
          } else if (own && !this.zoning.nearestOwnGrass(st.home.tx, st.home.ty, own, 20)) {
            // Step 3. There is nowhere of its own left in the whole garden.
            // It stays. It does not leave. It is just unhappy, and the player
            // can fix that whenever they like, at no cost, forever.
            if (!st.stranded) {
              st.stranded = true;
              this.events.push({ type: 'stranded', creature: creature.id, home: { ...st.home }, grass: own });
            }
            if (agent) agent.mood = 'unhappy';
          } else if (agent) {
            agent.mood = 'restless';
          }
        } else if (agent) {
          agent.mood = 'content';
          st.stranded = false;
        }
      }

      // Diegetic tells — the traces that escalate toward first sight. Hoofprints,
      // then a torn vine, then a sound at dusk, then a shape at the treeline,
      // which is the sighting itself. The band number driving them is never
      // rendered anywhere — SPEC section 7.
      //
      // Two rules learned the hard way:
      //  * the band is HALF the mean and HALF the worst requirement, so a
      //    centaur does not leave a broken ash branch in a garden with no ash
      //    tree in it. A mean alone will happily do that.
      //  * one tell per emission, gated on a quarter-day, so the escalation
      //    always plays through in order even when the player plants ten things
      //    at once. Skipping straight to tell four throws away the other three.
      if (st.rungIndex < RUNG_INDEX.sighted) {
        const r = per.sighted;
        const worst = r.results.length ? Math.min(...r.results.map((x) => x.score)) : 1;
        const tellScore = 0.5 * r.score + 0.5 * worst;
        const n = creature.tells.length;
        const want = Math.min(n, Math.floor(clamp01((tellScore - 0.15) / 0.7) * n + 1e-6));
        if (want > st.tellsSeen && this.fields.time >= st.nextTellAfter && !creature.hidden) {
          st.tellsSeen += 1;
          st.nextTellAfter = this.fields.time + this.daySeconds * 0.25;
          this.events.push({
            type: 'tell',
            creature: creature.id,
            text: creature.tells[st.tellsSeen - 1],
            index: st.tellsSeen,
          });
        }
      } else if (st.tellsSeen < creature.tells.length) {
        // Once it has been seen, the record of the traces is complete. A journal
        // entry, once filled, is never un-filled.
        st.tellsSeen = creature.tells.length;
      }
    }
  }

  _promote(creature, st, reached, where) {
    for (let i = st.rungIndex + 1; i <= reached; i++) {
      st.rungIndex = i;
      st.rung = RUNGS[i];
      if (i === RUNG_INDEX.sighted) {
        st.firstSighted = this.fields.time;
        this.events.push({ type: 'sighted', creature: creature.id, hidden: creature.hidden });
      }
      if (i === RUNG_INDEX.settles) {
        st.home = { tx: where.tx, ty: where.ty };
        st.settledAt = this.fields.time;
        st.name = this.nameFor(creature, st.home);
        const agent = this._agentFor.get(creature.id);
        if (agent) {
          agent.desaturated = false; // gains full colour, per SPEC section 7
          agent.homeTile = st.home;
          if (!agent.present) {
            // State first, then `_place`: `offstage` licenses the sky and
            // `idle` does not, so the order is what decides whether this
            // position is checked. It is a home tile and therefore in bounds,
            // but the ordering is the rule and the rule does not get exceptions.
            agent.state = 'idle';
            agent._place(st.home.tx, st.home.ty);
            agent.hold = 1;
          }
          agent.visitLeft = Infinity; // it lives here now
        }
        this.events.push({
          type: 'settled',
          creature: creature.id,
          name: st.name,
          home: { ...st.home },
          region: this.fields.regionName(st.home.tx, st.home.ty),
        });
      }
      if (i === RUNG_INDEX.thrives) {
        const c2 = new Agent(creature, (this.rng() * 1e9) | 0, {
          companion: true,
          mapW: this.fields.w,
          mapH: this.fields.h,
          passable: this.passableFor(creature.id),
        });
        c2.desaturated = false;
        c2.homeTile = st.home;
        c2.state = 'idle';
        // The second individual stands a little off its mate's shoulder. On a
        // CORNER home that offset was straight off the map — (0,0) put the
        // companion at y = -0.4 and it was drawn standing on the sky, grounded
        // and idle, forever. The choke point catches it, which is precisely the
        // kind of thing a choke point is for.
        c2._place(st.home.tx + 0.8, st.home.ty - 0.4);
        c2.hold = 2;
        c2.visitLeft = Infinity;
        this._companions.set(creature.id, c2);
        this.agents.push(c2);
        this.events.push({ type: 'thrives', creature: creature.id, name: st.name });
      }
    }
  }

  /** A settled creature gets a name. The unicorn takes the name of the place. */
  nameFor(creature, home) {
    if (!creature.names) {
      const region = this.fields.regionName(home.tx, home.ty);
      return region ? `the unicorn of ${region}` : 'the unicorn';
    }
    const i = Math.floor(this.rng() * creature.names.length);
    return creature.names[i];
  }

  // ---------------------------------------------------------------- the loop

  /**
   * Advance the creature layer. `dt` is garden seconds. Call fields.tick(dt)
   * first so maturity and the clock are current.
   */
  update(dt, opts = {}) {
    if (!(dt > 0)) return this.events;
    this.time += dt;
    const tod = opts.timeOfDay != null ? opts.timeOfDay : this.timeOfDay();
    const reducedMotion = !!opts.reducedMotion;

    this._sinceScan += dt;
    if (this._sinceScan >= RESCAN_SECONDS || this._fieldsVersion !== this.fields.version) {
      this._sinceScan = 0;
      this._fieldsVersion = this.fields.version;
      this._rescan();
    }

    const env = {
      reducedMotion,
      homeRadius: HOME_RADIUS,
      // Replaced per creature below. Kept on the object so a bare Agent still
      // has something to walk by, but every agent Bestiary owns carries its own.
      passable: null,
      zoning: this.zoning,
      emit: (e) => this._emit(e),
    };

    for (const creature of CREATURES) {
      const st = this.state.get(creature.id);
      const agent = this._agentFor.get(creature.id);
      if (!agent) continue;
      env.passable = this.passableFor(creature.id);
      agent.homeTile = st.home || (st.candidate ? { tx: st.candidate.tx, ty: st.candidate.ty } : agent.homeTile);

      this._scheduleVisit(creature, st, agent, tod);
      this._maybeBeat(creature, st, agent, tod, env);
      this._maybeFlourish(creature, st, agent, env);

      agent.update(dt, env);
      // The renderer needs to know which terrace it is standing on, or a
      // creature on a raised tile draws at the height of the ground below it.
      //
      // Read the CLAMPED tile, because an arriving or leaving creature is out
      // past the rim where there is no tile at all and off-map reads as level
      // zero. On a terraced edge that is a 64px pop at the exact moment the
      // creature becomes solid — so in transit it takes the height of the rim
      // tile it is walking on to, which is where it is going anyway.
      agent.level = this.zoning.levelAt(
        Math.round(agent._onMapX(agent.x)),
        Math.round(agent._onMapY(agent.y))
      );
      const comp = this._companions.get(creature.id);
      if (comp) {
        comp.homeTile = st.home || comp.homeTile;
        comp.mood = agent.mood;
        comp.update(dt, env);
        comp.level = this.zoning.levelAt(
          Math.round(comp._onMapX(comp.x)),
          Math.round(comp._onMapY(comp.y))
        );
      }

      // A visitor that has run out of its stay wanders back off the map.
      if (
        st.rungIndex < RUNG_INDEX.settles &&
        agent.present &&
        agent.state !== 'leaving' &&
        agent.state !== 'travel' &&
        agent.state !== 'perform' &&
        agent.visitLeft <= 0
      ) {
        agent.leave(this.fields.w, this.fields.h);
      }
    }

    this._lastTod = tod;
    return this.events;
  }

  /**
   * THE PREVIEW. A creature that is sighted, and whose visiting requirements are
   * roughly half met, walks in anyway — colourless, at its own hour, for a
   * while, and then walks out. It is not earned. That is the point: the player
   * sees exactly what they are nearly close to, standing in their garden.
   */
  _scheduleVisit(creature, st, agent, tod) {
    if (st.rungIndex >= RUNG_INDEX.settles) return; // it lives here
    if (agent.present) return;
    if (st.rungIndex < RUNG_INDEX.sighted) return;
    if (this.fields.time < st.nextVisitAfter) return;

    // The visit lands in the beat's hour once the creature is ready to perform
    // it, and at dusk otherwise. That means finishing a naiad's greensward
    // changes WHEN she shows up, from dusk to noon, which is a lovely tell in
    // its own right and costs nothing.
    const b = BEATS[creature.beat];
    const readyForBeat = this._beatReady(creature, st);
    const window = readyForBeat && b ? b.when : [0.72, 0.9];
    const inWindow = tod >= window[0] && tod <= window[1];
    const entered = inWindow && !(this._lastTod >= window[0] && this._lastTod <= window[1]);
    if (!entered) return;

    const score = st.scores.visits;
    if (score < PREVIEW_MIN && !readyForBeat) return;
    const earned = st.rungIndex >= RUNG_INDEX.visits;
    const chance = earned ? 1 : clamp01((score - PREVIEW_MIN) / (1 - PREVIEW_MIN)) * 0.7 + 0.15;
    if (this.rng() > chance) {
      st.nextVisitAfter = this.fields.time + this.daySeconds * 0.5;
      return;
    }

    const home = st.home || (st.candidate ? { tx: st.candidate.tx, ty: st.candidate.ty } : null);
    if (!home) return;
    const stay = (earned ? 90 : 45) + 110 * score;
    agent.desaturated = true;
    agent.mood = 'content';
    agent.enter(home, this.fields.w, this.fields.h, stay, this.zoning, this.passableFor(creature.id));
    this.events.push({
      type: 'visit-start',
      creature: creature.id,
      preview: !earned,
      home: { ...home },
    });
  }

  /** Everything on the settling rung except the beat itself is met. */
  _beatReady(creature, st) {
    if (st.rungIndex >= RUNG_INDEX.settles) return false;
    if (st.rungIndex < RUNG_INDEX.visits) return false;
    if (st.beats.has(creature.beat)) return false;
    const res = st.lastResults && st.lastResults.settles;
    if (!res) return false;
    for (const r of res.results) {
      if (r.req.kind === 'behaviour') continue;
      if (!r.met) return false;
    }
    return true;
  }

  /**
   * When the garden is ready and the hour is right and the creature is standing
   * in it, send it to do the thing. This is the moment settling is made of.
   */
  _maybeBeat(creature, st, agent, tod, env) {
    if (!agent.present) return;
    if (agent.state === 'travel' || agent.state === 'perform' || agent.state === 'leaving') return;
    if (st.beats.has(creature.beat)) return;
    if (!this._beatReady(creature, st)) return;
    const b = BEATS[creature.beat];
    if (!b) return;
    if (tod < b.when[0] || tod > b.when[1]) return;
    const where = st.home || st.where || { tx: Math.round(agent.x), ty: Math.round(agent.y) };
    const site = this.fields.nearest(b.site, where.tx, where.ty, b.radius);
    if (!site) return;
    const p = site.placement;
    const pass = this.passableFor(creature.id);
    // If the site turns out to be across a cliff with no way round, goPerform
    // refuses and we simply try again on the next scan. A creature that walked
    // through a rock face to reach its own beat would undo the elevation in one
    // frame — the model has to be true for the animals too, not only the paint.
    agent.goPerform(creature.beat, this._beatStand(creature, p, pass), this.zoning, pass);
    void env;
  }

  /**
   * WHERE A CREATURE STANDS TO PERFORM ITS BEAT.
   *
   * Ordinarily just short of the site, which is what the `+0.7` has always
   * been. But the unicorn's beat site is a still pool, and her water rule is
   * `never` — she comes to the brink and dips the horn from there. So when the
   * site itself is somewhere this creature may not stand, the stand-point moves
   * to the nearest neighbouring tile that it may, and the alicorn beat happens
   * at the water's edge exactly as CREATURE-MOVEMENT.md §2 describes.
   *
   * This is a nicer piece of staging than a rule: standing at the edge of the
   * pool is more evocative than standing in it, so the character decision and
   * the passability decision turn out to be the same decision.
   */
  /**
   * The idle life. A creature that lives here, is happy, and has a prop within
   * a few tiles occasionally goes and uses it.
   *
   * Deliberately much weaker than `_maybeBeat`: no hour window, no readiness
   * gate, no record kept. It asks only that the creature has SETTLED — a
   * desaturated preview visitor walking over to help itself to the wine would
   * undercut the whole point of the preview being a ghost of something not yet
   * earned.
   */
  _maybeFlourish(creature, st, agent, env) {
    if (!agent.present) return;
    if (st.rungIndex < RUNG_INDEX.settles) return;
    if (agent.mood !== 'content') return;
    if (agent.state !== 'idle') return;
    for (const f of Object.values(FLOURISHES)) {
      if (!f.site) continue; // hand-started; not this scheduler's business
      if (f.creature && f.creature !== creature.id) continue;
      if (agent.cool.has(f.id)) continue;
      const where = st.home || { tx: Math.round(agent.x), ty: Math.round(agent.y) };
      const site = this.fields.nearest(f.site, where.tx, where.ty, f.radius);
      if (!site) continue;
      const pass = this.passableFor(creature.id);
      // Same refusal as a beat: if the krater is across a cliff with no way
      // round, he does not walk through the rock to reach it.
      if (agent.goPerform(f.id, this._beatStand(creature, site.placement, pass), this.zoning, pass)) {
        // Set here as well as on arrival, so a satyr who is intercepted on the
        // way — restless, evicted from his ground — does not immediately try
        // again on the very next scan.
        const [lo, hi] = f.cooldown;
        agent.cool.set(f.id, lo + this.rng() * (hi - lo));
      }
      return;
    }
  }

  _beatStand(creature, p, pass) {
    const on = { x: p.tx, y: p.ty + 0.7 };
    if (!pass || pass(p.tx, p.ty)) return on;
    let best = null;
    let bestD = Infinity;
    for (const [dx, dy] of NEIGHBOURS8) {
      const nx = p.tx + dx;
      const ny = p.ty + dy;
      if (nx < 0 || ny < 0 || nx >= this.fields.w || ny >= this.fields.h) continue;
      if (!pass(nx, ny)) continue;
      // Nearest to where it is now, so it walks to the near shore rather than
      // round to the far one.
      const agent = this._agentFor.get(creature.id);
      const fromX = agent ? agent.x : p.tx;
      const fromY = agent ? agent.y : p.ty;
      const d = Math.hypot(nx - fromX, ny - fromY);
      if (d < bestD) {
        bestD = d;
        // Face the water: stand on the brink tile, leaning the last fraction
        // of a tile toward the site it has come to touch.
        best = { x: nx + (p.tx - nx) * 0.3, y: ny + (p.ty - ny) * 0.3 };
      }
    }
    return best || on;
  }

  /**
   * Every event goes through here, so a completed beat is folded back into the
   * ladder immediately whether or not anyone is listening. Settling must not
   * depend on the UI remembering to drain a queue.
   */
  _emit(e) {
    if (e.type === 'beat-done') this.recordBeat(e.creature, e.beat);
    this.events.push(e);
  }

  /** Fold a completed beat back into the ladder — the watched moment landing. */
  recordBeat(creatureId, beatId) {
    const st = this.state.get(creatureId);
    if (!st) return;
    if (st.beats.has(beatId)) return;
    st.beats.add(beatId);
    this._sinceScan = Infinity; // re-evaluate immediately; the rung just opened
  }

  /** Drain the event queue. The caller (world/ui/audio) decides what to do. */
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ----------------------------------------------------------- journal cards

  /**
   * The diagnostic view for one journal card.
   *
   * The rule from SPEC section 7, and it is firm: EXACT TICKS FOR COUNTS,
   * QUALITATIVE WORDS FOR AXES. Counts are discrete, so exactness costs
   * nothing and reads as honest. Fields are continuous, so a number would be
   * both meaningless and an invitation to optimise. Nothing here is ever summed
   * into one figure and there is no percentage anywhere.
   */
  card(creatureId) {
    const creature = CREATURE_BY_ID.get(creatureId);
    const st = this.state.get(creatureId);
    if (!creature || !st) return null;

    // Pan is not in the journal at all until he is sighted. He is not hinted at,
    // not silhouetted, not listed. That is the entire point of him.
    if (creature.hidden && st.rungIndex < RUNG_INDEX.sighted) return null;

    const known = st.rungIndex >= RUNG_INDEX.sighted;
    const tells = creature.tells.slice(0, st.tellsSeen);

    if (!known) {
      // Before sighting: a silhouette, the tells you have found, and exactly one
      // plain-language axis hint. Never the requirement list.
      return {
        id: creature.id,
        name: 'Unknown',
        revealed: false,
        silhouette: creature.silhouette,
        hint: creature.hint,
        tells,
        rung: 'unknown',
        restless: false,
      };
    }

    const nextIndex = Math.min(st.rungIndex + 1, RUNGS.length - 1);
    const showRung = st.rungIndex >= RUNGS.length - 1 ? RUNGS[RUNGS.length - 1] : RUNGS[nextIndex];
    const res = (st.lastResults && st.lastResults[showRung]) || { results: [] };

    const requirements = res.results.map((r) => this._describe(creature, r, st));

    return {
      id: creature.id,
      name: st.name || creature.name,
      species: creature.name,
      revealed: true,
      blurb: creature.blurb,
      rung: st.rung,
      rungIndex: st.rungIndex,
      nextRung: st.rungIndex >= RUNGS.length - 1 ? null : showRung,
      complete: st.rungIndex >= RUNGS.length - 1,
      restless: st.restless,
      // Nowhere of its own left. The card says so plainly and warmly, because
      // the player can fix it whenever they like and nothing is at stake.
      stranded: !!st.stranded,
      grass: creature.grass || GRASS_FOR[creature.id] || null,
      standing: st.home ? this.zoning.grassAt(st.home.tx, st.home.ty) : null,
      home: st.home ? { ...st.home } : null,
      region: st.home ? this.fields.regionName(st.home.tx, st.home.ty) : null,
      tells,
      requirements,
    };
  }

  /** Every card the journal should show, in order. Hidden ones are absent. */
  cards() {
    return CREATURES.map((c) => this.card(c.id)).filter(Boolean);
  }

  _describe(creature, r, st) {
    const req = r.req;
    if (req.kind === 'count') {
      // Exact. "2 of 3 ash trees" — they are discrete and countable and the
      // player can go and count them, so hiding the number would be a lie.
      if (req.dir === 'at-least') {
        // Clamped to the need on purpose. A sixth vine when five were asked for
        // is not progress — the band is satisficing and "5 of 5" says so. This
        // is the one place the UI quietly teaches that more does nothing.
        const shown = Math.min(r.have, r.need);
        return {
          kind: 'count',
          met: r.met,
          have: r.have,
          need: r.need,
          text: `${shown} of ${r.need} ${plural(req.label, r.need)} within ${req.radius}`,
        };
      }
      return {
        kind: 'count',
        met: r.met,
        have: r.have,
        need: r.need,
        text: r.met
          ? `no ${singular(req.label)} within ${req.radius} — good`
          : `${r.have} ${plural(req.label, r.have)} too close`,
      };
    }
    if (req.kind === 'axis') {
      return {
        kind: 'axis',
        axis: req.axis,
        met: r.met,
        text: axisPhrase(req, r.value, r.met),
        why: req.why || '',
      };
    }
    if (req.kind === 'patch') {
      return this._describeGround(creature, req, r);
    }
    if (req.kind === 'terrain') {
      // Terrain is countable the way objects are — a fall is a fall — so it
      // gets the same exact tick a count does, and the same honesty.
      const label = TERRAIN_PHRASE[req.feature] || req.feature;
      if (r.unmodelled) return { kind: 'terrain', met: true, feature: req.feature, text: `${cap(label)} — nothing more wanted here.` };
      return {
        kind: 'terrain',
        met: r.met,
        feature: req.feature,
        have: r.have,
        need: r.need,
        text: r.met
          ? `${cap(label)} within reach.`
          : `${cap(label)} — none within ${req.radius}. Falling water wants a drop under it.`,
      };
    }
    if (req.kind === 'presence') {
      const other = CREATURE_BY_ID.get(req.species);
      const label = other ? other.name.toLowerCase() : req.species;
      return {
        kind: 'presence',
        met: r.met,
        species: req.species,
        text: r.met
          ? `a ${label} lives near here`
          : req.radius == null
            ? `a ${label} has not settled yet`
            : `no ${label} settled within reach`,
      };
    }
    if (req.kind === 'behaviour') {
      const b = BEATS[req.beat];
      return {
        kind: 'behaviour',
        met: r.met,
        beat: req.beat,
        text: r.met ? b.done : r.ready ? `Not yet seen. ${b.watch}` : b.watch,
        watched: st.beats.has(req.beat),
      };
    }
    return { kind: 'unknown', met: r.met, text: '' };
  }

  /**
   * THE GROUND LINE, and it is the one place in this game where the journal
   * deliberately declines to give a figure it has.
   *
   * ZONING.md: "exact ticks for counts, qualitative words for conditions, and a
   * patch of grass shown AS A PICTURE rather than a number." So this returns a
   * `picture` — a small blob of tiles in the shape the requirement wants, with
   * the ones you have filled in — and ui.js draws it. There is no "7 of 9"
   * anywhere in the string, because a patch is a shape and a shape is not a
   * quantity: two gardens with nine tiles each can be a lawn and a corridor,
   * and the one thing a number could never tell you is which one you built.
   *
   * The picture is generated as a compact spiral so it always reads as a
   * rounded clump — a shape a garden actually makes — rather than a bar chart
   * with the numbers filed off.
   */
  _describeGround(creature, req, r) {
    const own = creature.grass || GRASS_FOR[creature.id] || null;
    if (req.seam) {
      const between = (r.between || []).map((g) => GRASS_PHRASE[g] || g);
      return {
        kind: 'ground',
        seam: true,
        met: r.met,
        grass: null,
        text: r.met
          ? between.length >= 2
            ? `Where the ${between[0]} meets the ${between[1]}. He wants the seam, and this is one.`
            : 'The seam. He wants exactly this and nothing on either side of it.'
          : 'Not a seam. He keeps to where two grounds argue, and this ground has made up its mind.',
      };
    }

    const need = req.n;
    const have = Math.max(0, Math.min(r.have | 0, need));
    const picture = patchPicture(need, have);
    const phrase = GRASS_PHRASE[own] || own;

    let text;
    if (r.unclaimed) text = `Any ground will do for now — nothing here has taken sides yet.`;
    else if (r.contested) {
      const other = GRASS_PHRASE[r.second] || 'something else';
      text = `The ${phrase} and the ${other} are still arguing over this ground.`;
    } else if (r.standing && r.standing !== own && r.standing !== 'meadow') {
      text = `This is ${GRASS_PHRASE[r.standing] || r.standing} ground. It wants ${phrase}.`;
    } else if (!r.met && have === 0) text = `No ${phrase} here yet.`;
    else if (!r.met) text = `The ${phrase} has taken, but not enough of it.`;
    else text = `Enough ${phrase}, and all of a piece.`;

    return {
      kind: 'ground',
      met: r.met,
      grass: own,
      standing: r.standing || null,
      contested: !!r.contested,
      second: r.second || null,
      // For the picture. Deliberately NOT rendered as "have of need" text.
      picture,
      text,
      why: req.why || '',
    };
  }

  // ------------------------------------------------------------- persistence

  serialize() {
    const out = {};
    for (const [id, st] of this.state) {
      out[id] = {
        rung: st.rung,
        rungIndex: st.rungIndex,
        restless: st.restless,
        stranded: !!st.stranded,
        home: st.home ? { ...st.home } : null,
        name: st.name,
        beats: [...st.beats],
        tellsSeen: st.tellsSeen,
        firstSighted: st.firstSighted,
        settledAt: st.settledAt,
      };
    }
    return out;
  }

  hydrate(save) {
    if (!save) return this;
    for (const creature of CREATURES) {
      const s = save[creature.id];
      if (!s) continue;
      const st = this.state.get(creature.id);
      // Monotone on load too. A save can only ever raise a rung.
      st.rungIndex = Math.max(st.rungIndex, s.rungIndex != null ? s.rungIndex : -1);
      st.rung = RUNGS[st.rungIndex] || 'unknown';
      st.restless = !!s.restless;
      st.stranded = !!s.stranded;
      st.home = s.home ? { ...s.home } : null;
      st.name = s.name || null;
      st.beats = new Set(s.beats || []);
      st.tellsSeen = Math.max(st.tellsSeen, s.tellsSeen || 0);
      st.firstSighted = s.firstSighted != null ? s.firstSighted : null;
      st.settledAt = s.settledAt != null ? s.settledAt : null;
      if (st.rungIndex >= RUNG_INDEX.settles && st.home) {
        const agent = this._agentFor.get(creature.id);
        if (agent) {
          agent.desaturated = false;
          agent.homeTile = st.home;
          agent.state = 'idle';
          agent._place(st.home.tx, st.home.ty);
          agent.hold = 1;
          agent.visitLeft = Infinity;
        }
      }
      if (st.rungIndex >= RUNG_INDEX.thrives && !this._companions.has(creature.id)) {
        this._promoteCompanion(creature, st);
      }
    }
    this._sinceScan = Infinity;
    return this;
  }

  _promoteCompanion(creature, st) {
    const c2 = new Agent(creature, (this.rng() * 1e9) | 0, {
      companion: true,
      mapW: this.fields.w,
      mapH: this.fields.h,
      passable: this.passableFor(creature.id),
    });
    c2.desaturated = false;
    c2.homeTile = st.home;
    c2.state = 'idle';
    // See _promote: the shoulder offset walks straight off a corner home, and
    // `_place` is what stops a loaded garden coming back with a second satyr
    // standing in the sky.
    if (st.home) c2._place(st.home.tx + 0.8, st.home.ty - 0.4);
    c2.hold = 2;
    c2.visitLeft = Infinity;
    this._companions.set(creature.id, c2);
    this.agents.push(c2);
  }
}

/** How each grass is spoken about in the journal. Never "type 3 turf". */
export const GRASS_PHRASE = Object.freeze({
  meadow: 'plain meadow',
  thicket: 'thicket',
  sward: 'open sward',
  fen: 'wet fen',
  millefleurs: 'flowered turf',
});

const TERRAIN_PHRASE = Object.freeze({
  waterfall: 'falling water',
  pool: 'a still pool',
  cliff: 'a rock face',
  hollow: 'a sunken hollow',
  summit: 'high ground',
  connector: 'a way up',
});

/**
 * The PICTURE of a required patch — the thing the journal shows instead of a
 * number.
 *
 * `need` tiles laid out as a compact clump, `have` of them filled. The layout
 * is a square spiral from the centre, which is what a spreading patch of grass
 * actually looks like from above and, more to the point, is a SHAPE: the player
 * reads "about that much ground, in a blob" at a glance and never reads a
 * quantity. That distinction is the whole of ZONING.md's journal rule.
 *
 * Returns `{ w, h, cells }` where cells are `{ x, y, filled }` on a small
 * integer grid — ui.js draws them as little iso diamonds in the grass colour.
 */
export function patchPicture(need, have) {
  const n = Math.max(1, need | 0);
  const cells = [];
  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;
  let leg = 1;
  let stepsInLeg = 0;
  let legsDone = 0;
  const seen = new Set();
  while (cells.length < n) {
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push({ x, y, filled: cells.length < Math.max(0, Math.min(have | 0, n)) });
    }
    x += dx;
    y += dy;
    stepsInLeg++;
    if (stepsInLeg === leg) {
      stepsInLeg = 0;
      const t = dx;
      dx = -dy;
      dy = t;
      legsDone++;
      if (legsDone % 2 === 0) leg++;
    }
  }
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;
  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  for (const c of cells) {
    c.x -= minX;
    c.y -= minY;
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1, need: n, cells };
}

/**
 * The vocabulary a band is reported in. AXIS_META carries the comparatives
 * ('wilder', 'tamer'); this carries the plain adjectives, because "nothing like
 * wilder enough" is not English and the journal has to read like prose.
 *
 * RESEARCH section C.5: use the same handful of words in creature requirements
 * and in tile tooltips, so the vocabulary is learned once.
 */
const AXIS_VOICE = Object.freeze({
  wildness: { up: 'wild', down: 'tame', both: 'Wild in about the right measure.' },
  order: { up: 'tidy', down: 'loose', both: 'Kept in about the right measure.' },
  seclusion: { up: 'quiet', down: 'open', both: 'Quiet in about the right measure.' },
  moisture: { up: 'wet', down: 'dry', both: 'Damp in about the right measure.' },
  maturity: { up: 'old', down: 'young', both: 'Old in about the right measure.' },
});

/**
 * A qualitative word for how far an axis is from its band. NEVER A NUMBER —
 * SPEC section 7. "Wilder still." / "Almost quiet enough." / "Wild enough here."
 */
export function axisPhrase(req, value, met) {
  const meta = AXIS_META[req.axis] || { more: 'more', less: 'less' };
  const v = AXIS_VOICE[req.axis] || { up: 'right', down: 'right', both: 'As it should be here.' };
  if (met) {
    if (req.ideal != null && req.max != null) return v.both;
    return req.max != null ? `${cap(v.down)} enough here.` : `${cap(v.up)} enough here.`;
  }
  if (req.max != null && value > req.max) {
    const span = (req.ceiling != null ? req.ceiling : req.max + 3) - req.max;
    const t = clamp01((value - req.max) / span);
    if (t < 0.34) return `Almost ${v.down} enough.`;
    if (t < 0.7) return `${cap(meta.less)} still.`;
    return `Far too ${v.up} here.`;
  }
  if (req.ideal != null && value < req.ideal) {
    const floor = req.min != null ? req.min : req.ideal - 3;
    const t = clamp01((value - floor) / Math.max(1e-6, req.ideal - floor));
    if (t > 0.7) return `Almost ${v.up} enough.`;
    if (t > 0.34) return `${cap(meta.more)} still.`;
    return `Nothing like ${v.up} enough.`;
  }
  return `${cap(v.up)} enough here.`;
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Count labels are authored as 'singular|plural' where naive -s would be wrong
 * ('ivy|ivy', 'patch of millefleurs|patches of millefleurs'). Guessing English
 * plurals produces "3 ivys" and "2 millefleurs turfs", which reads as machine
 * output in a journal that is supposed to sound like someone's notebook.
 */
function plural(label, n) {
  const bar = label.indexOf('|');
  if (bar !== -1) return n === 1 ? label.slice(0, bar) : label.slice(bar + 1);
  if (n === 1) return label;
  return /s$/.test(label) ? label : `${label}s`;
}

/** The label as it should read in running text, singular form. */
function singular(label) {
  const bar = label.indexOf('|');
  return bar === -1 ? label : label.slice(0, bar);
}

export default Bestiary;
