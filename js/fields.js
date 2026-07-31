// fields.js — species affinity propagation, and the two surviving conditions.
//
// SUPERSEDES SPEC §6 (five abstract axes) per docs/ZONING.md. What the fields
// mean has changed; what they are for has not. The map still carries a small
// stack of scalar layers, still recomputes incrementally on edit, and is still
// the single place that knows what character a patch of ground has.
//
//   satyr · centaur · naiad · unicorn    four SPECIES AFFINITIES. Whose ground
//                                        is this? The winner is painted into
//                                        the terrain as a grass type.
//   maturity                             old growth — accrues with garden time
//   seclusion                            absence of traffic and of open
//                                        sightlines; now also fed by terrain
//
// `wildness`, `order` and `moisture` are RETIRED as axes. They are not deleted
// concepts — they are expressed by *which grass grows*, which is a thing the
// player can see instead of a thing the player is told. Reads of a retired
// channel return 0 rather than throwing, so a module that has not caught up yet
// degrades quietly instead of taking the garden down with it.
//
// ---------------------------------------------------------------------------
// THE BIG CHANGE: PROPAGATION IS A FLOOD FILL, NOT A CONVOLUTION
// ---------------------------------------------------------------------------
//
// docs/DECOR.md: a nullifier does not emit negative influence — that would dig
// a dead crater around a hedge. It BLOCKS propagation. Influence radiates from
// each source and decays with distance but cannot pass through:
//
//   * a nullifier tile — hedge, wall, herm, cypress screen, gravel walk, and
//   * a height difference of 2 or more levels (docs/ELEVATION.md). A 1-level
//     step does NOT block: gentle undulation stays connected, so the player has
//     a soft tool and a hard tool.
//
// ---------------------------------------------------------------------------
// EVERY BARRIER HAS A DOORWAY. THE SAME SHAPE, TWICE.
// ---------------------------------------------------------------------------
//
//   | barrier                | the gap through it        | how it is spelled |
//   |------------------------|---------------------------|-------------------|
//   | hedge / wall / herm    | HEDGE ARCH                | a per-TILE bit-
//   |   blocks every         |   opens one axis and       mask of the eight
//   |   direction            |   nothing else             directions
//   |------------------------|---------------------------|-------------------|
//   | cliff of 2+ levels     | RAMP / STAIR / SCRAMBLE   | a per-TILE climb
//   |   blocks the EDGE      |   its sloped top reaches   height: the tile's
//   |   between two heights  |   the level above, so the  surface spans
//   |                        |   step is short enough     levels l .. l+span
//   |                        |   to cross                |
//
// ELEVATION.md, "The symmetry worth naming": *a barrier blocks propagation; its
// connector is the doorway.* One rule, learned once, met twice — so terracing a
// garden severs it into zones and deciding where the ways up are is deciding
// where the zones stay joined. Both halves live in `_crossable`, side by side,
// and neither is a special case bolted onto the other: the mask answers "may
// influence leave this tile in this direction", the climb answers "are these two
// tile surfaces close enough in height to touch".
//
// The third rule of that section is not here at all, and deliberately so. A
// SLOPE IS PERMANENTLY NEUTRAL GROUND — see `resolve()`. It is a fact about who
// may CLAIM a tile, not about what may cross it, and keeping the two apart is
// what lets influence pour through a ramp that no species will ever own.
//
// A gaussian convolution cannot express either, because a convolution has no
// notion of a path. So each source floods outward over the *passable* graph and
// decays by the length of the path it actually took. In open ground the path
// length is the straight-line distance and the profile is exactly the gaussian
// this module used before — the old calibration survives untouched. Put a hedge
// in the way and the influence goes around it, or does not arrive at all.
//
// Consequences, all of them good and all of them intended:
//   * the SHAPE of a planting matters, not only the count,
//   * two species can sit one tile apart with a hedge between them,
//   * a terraced garden zones itself without a single hedge — the elevation
//     request and the nullifier request turn out to be the same system,
//   * the hedge ARCH leaks influence through its doorway and nowhere else,
//     which is a real garden gate with a real mechanical consequence.
//
// Cost: see `Fields.cost()` and the note above `_flood`. On 20x20 a full
// rebuild is a few hundred bounded Dijkstras and lands in single-digit ms; an
// edit re-floods only the sources that could possibly have noticed it.
//
// Pure and DOM-free. Imports cleanly in Node.

// iso.js is likewise pure, and it owns the elevation ceiling. Importing it here
// costs nothing and closes the one place this file could have drifted from the
// rest of the game: a ceiling of 6 here against a taller one everywhere else
// would silently treat the top two terraces as the same height, and terraces
// that stopped blocking influence would read as a zoning bug, not a clamp.
import { MAX_LEVEL } from './iso.js';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The four species affinities, in the numbering docs/DECOR.md fixes. */
export const AFFINITIES = Object.freeze(['satyr', 'centaur', 'naiad', 'unicorn']);

/** DECOR.md numbering: 1 satyr · 2 centaur · 3 naiad · 4 unicorn. */
export const AFFINITY_NUMBER = Object.freeze({ satyr: 1, centaur: 2, naiad: 3, unicorn: 4 });

/** The conditions grass cannot express, and which therefore survive as scalars. */
export const CONDITIONS = Object.freeze(['maturity', 'seclusion']);

/**
 * Every channel the fields carry, in canonical order. Anything iterating "the
 * axes" (the overlay cycle, the playtest report) wants this list.
 */
export const AXES = Object.freeze([...AFFINITIES, ...CONDITIONS]);

/** Named so a stale reader can check rather than guess. See the header. */
export const RETIRED_AXES = Object.freeze(['wildness', 'order', 'moisture']);

/** Grass type per affinity, plus the neutral base. docs/ZONING.md. */
export const GRASS_FOR = Object.freeze({
  neutral: 'meadow',
  satyr: 'thicket',
  centaur: 'sward',
  naiad: 'fen',
  unicorn: 'millefleurs',
});

/** Grass types by code. Index is what `grassGrid()` writes. */
export const GRASS_TYPES = Object.freeze(['meadow', 'thicket', 'sward', 'fen', 'millefleurs']);

/** Grass code per affinity — 0 is meadow and belongs to nobody. */
export const GRASS_CODE = Object.freeze({ neutral: 0, satyr: 1, centaur: 2, naiad: 3, unicorn: 4 });

/**
 * Breadth costs strength — docs/DECOR.md. A placeable that declares its
 * affinities as a bare list gets the weight its breadth earns:
 * single 1.0, each half of a dual 0.7, each third of a triple 0.5.
 *
 * The fourth entry is not in the document. It is the four-way — Pan's syrinx,
 * "proposed, not built" — and it is here so that the day somebody authors it
 * the number already exists and is deliberately feeble, because an object that
 * boosts all four equally is permanently contested and that is the joke.
 */
export const AFFINITY_WEIGHT = Object.freeze([0, 1.0, 0.7, 0.5, 0.35]);

// ---------------------------------------------------------------------------
// Propagation constants
// ---------------------------------------------------------------------------

/** Falloff sigma, in tiles. Unchanged from SPEC §6 — the calibration survives. */
export const SIGMA = 2.5;

/** Truncation radius, in tiles. exp(-36/12.5) ~ 0.056 at the rim. */
export const KERNEL_RADIUS = 6;

/** Radius a creature evaluates its neighbourhood over. */
export const EVAL_RADIUS = 5;

/**
 * A step of this many levels or more blocks influence. ELEVATION.md, verbatim:
 * "A 1-level step does NOT block — gentle undulation stays connected."
 */
export const LEVEL_BLOCK = 2;

/**
 * How many levels one connector's sloped top rises above the tile it stands on.
 * "1 up, 1 over" is the whole of ELEVATION.md's constraint, and js/world.js uses
 * the same number to refuse a ramp against a taller cliff.
 *
 * This is what makes a ramp a doorway rather than an exception. A ramp on level
 * 0 has its foot at 0 and its head at 1, so the ground beside it at level 2 is
 * ONE level from the part of the ramp nearest it — a step short enough to cross,
 * through a tile whose own level still reads 0. A 3-level cliff stays shut,
 * because the head of the ramp still cannot reach it. Nothing here is a
 * dispensation: the geometry does it.
 */
export const CONNECTOR_SPAN = 1;

/** Elevation ceiling. iso.js's — imported above, re-exported here. */
export { MAX_LEVEL };

/** Time constant for the maturity accrual, in garden-seconds. */
export const AGE_TAU_SECONDS = 900;

/** Ceiling the time-accrued maturity saturates toward beside mature growth. */
export const AGE_CEILING = 8;

/** Don't re-stamp the ageing kernel more often than this (garden-seconds). */
export const AGE_STEP_SECONDS = 2;

// ---------------------------------------------------------------------------
// Resolution constants — the contest rule
// ---------------------------------------------------------------------------
//
// ZONING.md asks for a PROPORTIONAL margin and gives two worked cases:
//
//     "two objects versus three should be able to tie near the boundary, but
//      twenty versus twenty-one should not read as contested across a whole
//      meadow."
//
// Both cases have the same absolute gap — one object's worth — so no absolute
// epsilon can separate them, and a plain relative epsilon separates them the
// WRONG WAY ROUND (20 vs 21 is a 5% gap and would tie the hardest). The only
// family that answers the brief as written is a margin that SHRINKS as the
// stakes rise:
//
//     margin(top) = CONTEST_K / top,  clamped
//     contested   <=>  top - second <= margin(top)
//
// Sparse ground: two objects against three read locally as about 1.6 vs 1.4.
// margin(1.6) = 0.63, gap 0.2 — contested, a broad soft border. Dense ground:
// twenty against twenty-one read as about 8.4 vs 8.0. margin(8.4) = 0.12, gap
// 0.4 — decisive, a crisp line. Which is a better rule than the one I went
// looking for: THE MORE YOU COMMIT, THE MORE DECISIVE THE GROUND BECOMES. A
// half-planted glade has wide, forgiving, ambiguous edges; a garden you have
// argued hard for has borders you can see.
//
// The two clamps: a FLOOR so a very dense garden keeps a hairline of contested
// tiles to dither along (a hard edge between two grass types with no blend is
// the one thing that would look wrong), and a CAP proportional to `top` so that
// a lone object's faint outer fringe — where second is 0 — is not declared
// contested against nobody.

/** Numerator of the hyperbolic contest margin. Units: field^2. */
export const CONTEST_K = 1.0;

/** Never narrower than this, so every border keeps a dither line. */
export const CONTEST_FLOOR = 0.05;

/** Never wider than this share of the leader — stops a fringe tying with nothing. */
export const CONTEST_CAP = 0.5;

/**
 * Below this the ground is nobody's and stays meadow. Calibrated off DECOR.md
 * so the vocabulary behaves the way the document describes it:
 *   single (1.0) claims out to ~3.1 tiles — it commits ground,
 *   dual   (0.7) claims out to ~2.6 tiles — it serves a border,
 *   triple (0.5) barely claims its own tile, and ties three ways when alone,
 *     which is exactly DECOR's "placed alone in open ground they produce a wide
 *     contested patch... lay a triple, then decide later who claims it".
 */
export const CLAIM_FLOOR = 0.45;

// ---------------------------------------------------------------------------
// Seclusion terrain constants
// ---------------------------------------------------------------------------

/** How far the relief probe looks when asking "is this a hollow or a summit?" */
export const RELIEF_RADIUS = 3;

/** Seclusion per level of net surrounding rise. A hollow is quiet; a summit is not. */
export const SECLUSION_PER_LEVEL = 1.2;

/** Relief is clamped to this many levels either way before scaling. */
export const RELIEF_CLAMP = 3;

/** Seclusion for being walled in — 8/8 blocked neighbours is worth this much. */
export const ENCLOSURE_GAIN = 1.5;

/** Fallback seclusion penalty for a trafficked tile that declares none itself. */
export const TRAFFIC_SECLUSION = -1.0;

// ---------------------------------------------------------------------------
// Presentation metadata
// ---------------------------------------------------------------------------

/**
 * Per-channel presentation. `signed` channels sit at 0.5 in the overlay when
 * neutral; unsigned ones start at 0. `k` is the soft compression constant — the
 * overlay never auto-scales to the current maximum, because a wash that
 * rescales itself as you build flickers and lies.
 *
 * Affinities are unsigned: an affinity is a claim, and there is no such thing
 * as a negative claim. Disagreement is expressed by *another species* claiming
 * harder, which is the whole point of the rework.
 */
export const AXIS_META = Object.freeze({
  satyr: Object.freeze({ signed: false, k: 3, less: 'less his', more: 'his ground', label: 'Satyr', grass: 'thicket' }),
  centaur: Object.freeze({ signed: false, k: 3, less: 'less hers', more: 'her ground', label: 'Centaur', grass: 'sward' }),
  naiad: Object.freeze({ signed: false, k: 3, less: 'less hers', more: 'her water', label: 'Naiad', grass: 'fen' }),
  unicorn: Object.freeze({ signed: false, k: 3, less: 'less its', more: 'its ground', label: 'Unicorn', grass: 'millefleurs' }),
  maturity: Object.freeze({ signed: false, k: 6, less: 'younger', more: 'older', label: 'Maturity' }),
  seclusion: Object.freeze({ signed: true, k: 5, less: 'more open', more: 'quieter', label: 'Seclusion' }),
});

/**
 * Things this module ships deliberately unfinished. Named here rather than in a
 * comment nobody greps, per the standing instruction: placeholder, note, move on.
 */
export const NEEDS_DESIGN = Object.freeze([
  Object.freeze({
    id: 'seclusion-sightlines',
    needsDesign: true,
    note:
      'Seclusion currently reads terrain relief plus one-step enclosure. True ' +
      'open-sightline seclusion wants a cheap iso raycast (how far can you see ' +
      'from this tile, in the eight directions?) which needs a call on whether a ' +
      'sightline is blocked by a 1-level step or only by a 2-level one. Placeholder ' +
      'is generous and stable; it will read low on an exposed lawn and high in a ' +
      'walled hollow, which is most of the value.',
  }),
  Object.freeze({
    id: 'arch-orientation',
    needsDesign: true,
    note:
      'The hedge arch gates along a tile axis (x or y). In iso those read as the ' +
      'two diagonal screen directions, so an arch drawn facing "down-right" must ' +
      'declare gate:"x". Until catalog.js carries a rotation, gate defaults to x ' +
      'and the art owner may need a second sprite rather than a rotated one.',
  }),
  Object.freeze({
    id: 'connector-orientation',
    needsDesign: true,
    note:
      'The sibling of arch-orientation, and open for the same reason. A hedge ' +
      'arch gates ONE tile axis; a connector climbs ONE tile direction, but ' +
      'catalog.js carries no rotation for either, so a ramp currently offers its ' +
      'sloped top to all eight neighbours rather than to the one it faces. The ' +
      'over-permissive case is a ramp in the corner of an L-shaped cliff leaking ' +
      'round the inside of the corner as well as up it. When rotation lands, ' +
      '`climb` becomes a mask like `mask` and the two halves of the doorway rule ' +
      'converge completely.',
  }),
  Object.freeze({
    id: 'affinity-tag-bridge',
    needsDesign: false,
    note:
      'TAG_AFFINITY below is a BRIDGE. It infers affinities from existing catalog ' +
      'tags so the garden zones sensibly during this wave, before catalog.js ' +
      'declares `affinities` on each placeable. Delete it once it has.',
  }),
]);

// ---------------------------------------------------------------------------
// The passability graph
// ---------------------------------------------------------------------------
//
// Occlusion is represented as ONE Uint8Array over the map: a per-tile bitmask
// of the eight directions influence may cross. That is the cheapest thing that
// can express all three cases the design asks for:
//
//   0xFF  ordinary ground — cross freely
//   0x00  nullifier — hedge, wall, herm, cypress screen, gravel walk. Nothing
//         enters, nothing leaves, and the tile itself receives no influence, so
//         it renders as neutral meadow with a thin meadow band either side.
//         DECOR.md calls that "a real garden's mown border. Free legibility."
//   0x11  hedge arch gated along x  (only the +x / -x doorway is open)
//   0x44  hedge arch gated along y
//
// A crossing a -> b in direction d is legal iff a's mask has bit d AND b's mask
// has the opposite bit. Doing it from both ends means a gate never has to know
// which side you came from, and a nullifier blocks entry and exit with the same
// zero. Height blocking rides on the same test as an EDGE property, which is
// what it physically is: |level(a) - level(b)| >= LEVEL_BLOCK.

const DIRS = Object.freeze([
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
]);
const DIR_COST = Object.freeze(DIRS.map(([x, y]) => Math.hypot(x, y)));
const FULL_MASK = 0xff;
const opposite = (d) => (d + 4) & 7;

const ROOT2_1 = Math.SQRT2 - 1;

/** The shortest 8-connected walk that produces the displacement (x, y). */
function octile(x, y) {
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  return ax > ay ? ax + ROOT2_1 * ay : ay + ROOT2_1 * ax;
}

/** Parse a gate spec into a direction mask. See NEEDS_DESIGN['arch-orientation']. */
export function gateMask(spec) {
  if (spec === undefined || spec === null) return FULL_MASK;
  if (typeof spec === 'number') return spec & 0xff;
  if (Array.isArray(spec)) {
    let m = 0;
    for (const step of spec) {
      const [dx, dy] = step;
      const i = DIRS.findIndex((d) => d[0] === dx && d[1] === dy);
      if (i >= 0) m |= 1 << i;
    }
    return m;
  }
  switch (String(spec).toLowerCase()) {
    case 'x': case 'ew': case 'east-west': case 'horizontal':
      return (1 << 0) | (1 << 4);
    case 'y': case 'ns': case 'north-south': case 'vertical':
      return (1 << 2) | (1 << 6);
    case 'open': case 'none': case 'false':
      return FULL_MASK;
    default:
      return 0;
  }
}

/**
 * Tags that make a placement an occluder when it does not say so itself. The
 * five nullifiers of DECOR.md plus the low balustrade, which that document
 * flags as "also a weak nullifier" — weak is not a thing this graph can express,
 * so it blocks like the rest and the art carries the difference.
 */
const NULLIFIER_TAGS = Object.freeze([
  'nullifier', 'hedge', 'wall', 'herm', 'screen', 'cypress-screen',
  'gravel', 'gravel-walk', 'walk', 'path', 'balustrade', 'enclosure', 'fence',
]);

const ARCH_TAGS = Object.freeze(['arch', 'gate', 'gateway', 'hedge-arch']);

/**
 * The connector's tags — the cliff's doorway, and the exact sibling of
 * ARCH_TAGS above. js/catalog.js marks all four of ELEVATION.md's connectors
 * with `connector: true` AND the tag, but main.js's field bridge forwards tags
 * and not the flag, so the TAG is the signal that actually arrives at runtime
 * and it is the one that must not be got wrong.
 */
const CONNECTOR_TAGS = Object.freeze(['connector', 'ramp', 'stair', 'steps']);

/** Tags that mean feet go past here, for the seclusion fallback. */
const TRAFFIC_TAGS = Object.freeze([
  'path', 'walk', 'gravel-walk', 'connector', 'stair', 'ramp', 'steps',
]);

/**
 * BRIDGE — see NEEDS_DESIGN['affinity-tag-bridge']. Infers affinities from the
 * tags catalog.js already carries, so the ground zones during this wave. An
 * explicit `affinities` on the placeable always wins over anything here.
 */
const TAG_AFFINITY = Object.freeze({
  vine: ['satyr'], ivy: ['satyr'], mask: ['satyr'], thyrsos: ['satyr'],
  boulder: ['satyr'], ruin: ['satyr'], wild: ['satyr'],
  ash: ['centaur'], centaury: ['centaur'], physic: ['centaur'], timber: ['centaur'],
  log: ['centaur'], open: ['centaur'], meadow: ['centaur'],
  spring: ['naiad'], reed: ['naiad'], votive: ['naiad'], grotto: ['naiad'],
  basin: ['naiad'], 'water-loving': ['naiad'], water: ['naiad'],
  lily: ['unicorn'], white: ['unicorn'], pool: ['unicorn'], thorn: ['unicorn'],
  blossom: ['unicorn'], millefleurs: ['unicorn'],
  cave: ['satyr', 'naiad'],
  pithos: ['satyr', 'centaur'], pine: ['satyr', 'centaur'],
  ford: ['centaur', 'naiad'], plane: ['centaur', 'naiad'],
  apple: ['centaur', 'unicorn'],
  willow: ['naiad', 'unicorn'],
  oak: ['satyr', 'centaur', 'unicorn'],
  fern: ['satyr', 'naiad', 'unicorn'],
  altar: ['satyr', 'centaur', 'naiad'],
});

// ---------------------------------------------------------------------------
// Reading a placement
// ---------------------------------------------------------------------------

/** A tile's footprint tiles, north-west anchored. */
function* footprintTiles(tx, ty, footprint) {
  const fw = (footprint && footprint[0]) || 1;
  const fh = (footprint && footprint[1]) || 1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) yield [tx + x, ty + y];
}

/** Distance from (tx,ty) to the nearest tile a placement occupies. */
export function distanceToPlacement(p, tx, ty) {
  let best = Infinity;
  for (const [ox, oy] of footprintTiles(p.tx, p.ty, p.footprint)) {
    const d = Math.hypot(ox - tx, oy - ty);
    if (d < best) best = d;
  }
  return best;
}

const hasTag = (p, t) => !!(p && p.tags && p.tags.indexOf(t) !== -1);
const anyTag = (p, list) => list.some((t) => hasTag(p, t));

/**
 * The affinity weights a placement radiates, as a plain object. Accepts, in
 * order of precedence:
 *   affinities: { satyr: 1.0, naiad: 0.7 }   explicit, authoritative
 *   affinities: ['satyr', 'naiad']           breadth-weighted per DECOR.md
 *   affinity:   'satyr'                      the singular convenience
 *   tags                                      the bridge table, weakest
 *
 * A NEGATIVE weight is honoured, not dropped. catalog.js uses small negatives
 * (-0.15) for the register split of DECOR.md Part II — a fluted neoclassical
 * piece mildly repels the satyr, a rough archaic one mildly repels the unicorn —
 * and SPEC §7 says in as many words that the satyr is "actively repelled by
 * tilled rows, walls and straight edges". That is a real design intent and it
 * survives the rework.
 *
 * It does NOT reintroduce the dead crater that DECOR.md warns about, because
 * that warning is about NULLIFIERS: a hedge must block a chain rather than
 * subtract from it. A colonnade subtracting a little satyr is a different
 * statement, it stays small by convention, and the resolution below never lets
 * a negative score claim or contest anything.
 */
export function affinityWeights(p) {
  const out = {};
  if (!p) return out;
  const raw = p.affinities ?? (p.affinity ? [p.affinity] : null);
  if (raw && !Array.isArray(raw) && typeof raw === 'object') {
    for (const a of AFFINITIES) {
      const v = Number(raw[a]);
      if (Number.isFinite(v) && v !== 0) out[a] = v;
    }
    return out;
  }
  let list = Array.isArray(raw) ? raw.filter((a) => AFFINITIES.includes(a)) : null;
  if (!list || list.length === 0) {
    if (raw) return out; // it declared an empty list on purpose: neutral furniture
    const found = new Set();
    for (const t of (p.tags || [])) {
      const hit = TAG_AFFINITY[t];
      if (hit) for (const a of hit) found.add(a);
    }
    list = [...found];
  }
  if (list.length === 0) return out;
  const w = AFFINITY_WEIGHT[Math.min(list.length, AFFINITY_WEIGHT.length - 1)] || AFFINITY_WEIGHT[1];
  for (const a of list) out[a] = w;
  return out;
}

/**
 * Is this placement a CONNECTOR — a ramp, stair, scramble or stepped terrace
 * wall? ELEVATION.md's way through a cliff, and the second half of the
 * barrier/doorway pair named in the header.
 *
 * Four signals, matching js/world.js's `connectorSpec()` so the two files cannot
 * disagree about what a ramp is: the explicit flag, an explicit span, the group,
 * and the tags. The tags are the one that matters in the running game, because
 * main.js's bridge forwards `tags` and drops `connector`.
 */
export function isConnector(p) {
  if (!p) return false;
  if (p.connector !== undefined && p.connector !== null) return p.connector !== false;
  if (Number.isFinite(p.span) && p.span > 0) return true;
  if (p.group === 'connector') return true;
  return anyTag(p, CONNECTOR_TAGS);
}

/**
 * How far a connector's sloped top rises above its own tile, in levels — 0 for
 * anything that is not a connector. `connector: { span: n }` and a bare `span`
 * are both honoured; everything else gets CONNECTOR_SPAN.
 */
export function connectorSpan(p) {
  if (!isConnector(p)) return 0;
  const c = p.connector;
  if (c && typeof c === 'object' && Number.isInteger(c.span) && c.span > 0) return c.span;
  if (Number.isInteger(p.span) && p.span > 0) return p.span;
  return CONNECTOR_SPAN;
}

/**
 * Does this placement block propagation? Three vocabularies, because two of
 * them belong to other people: `blocks` is what js/catalog.js authors against
 * (`false | true | { gap: true }`), `nullifier` is the local spelling, and tags
 * are the fallback for anything that has not been given either yet.
 *
 * A CONNECTOR IS NEVER A NULLIFIER, and this is checked before anything else.
 * ELEVATION.md: "Connectors do NOT block influence. They are the way through."
 * The rule has to be first rather than last because three of the four
 * connectors are tagged `path` — they are things you walk on — and `path` is
 * how the gravel walk earns its occlusion. Without this line a stone stair
 * would silently become a wall, which is the precise opposite of the object.
 * The distinction is the one ELEVATION.md draws in as many words: a walk runs
 * ALONG ground and divides it; a connector runs THROUGH a cliff and joins it.
 */
export function isNullifier(p) {
  if (!p) return false;
  if (isConnector(p)) return false;
  if (p.blocks !== undefined && p.blocks !== null) return p.blocks !== false;
  if (p.nullifier !== undefined && p.nullifier !== null) return p.nullifier !== false;
  return anyTag(p, NULLIFIER_TAGS);
}

/**
 * The direction mask a placement imposes on the tiles it covers.
 *
 * `blocks: { gap: true }` is catalog.js's hedge arch — blocked except through
 * the doorway. Its axis comes from `blocks.axis` or `gate` when either is given,
 * and defaults to x. See NEEDS_DESIGN['arch-orientation'].
 */
export function maskFor(p) {
  if (!isNullifier(p)) return FULL_MASK;
  // An explicit `blocks` is the author speaking, and it is taken literally:
  // `true` is a solid screen even on a piece tagged 'arch' (a ruined arch is a
  // ruin, not a doorway), and only `{ gap: true }` opens a way through.
  if (p.blocks !== undefined && p.blocks !== null) {
    const b = p.blocks;
    if (b && typeof b === 'object') {
      return b.gap ? gateMask(b.axis ?? b.gate ?? p.gate ?? 'x') : 0;
    }
    return 0;
  }
  if (p.nullifier === 'arch') return gateMask(p.gate ?? 'x');
  if (p.gate !== undefined) return gateMask(p.gate);
  return anyTag(p, ARCH_TAGS) ? gateMask('x') : 0;
}

function isMatureDefault(p) {
  if (p.stage) return p.stage === 'mature';
  return hasTag(p, 'mature');
}

// ---------------------------------------------------------------------------
// A small binary heap, reused across floods so the hot path allocates nothing.
// ---------------------------------------------------------------------------

class MinHeap {
  constructor(cap = 256) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  clear() { this.n = 0; }
  _grow() {
    const k = new Float64Array(this.k.length * 2);
    const v = new Int32Array(this.v.length * 2);
    k.set(this.k); v.set(this.v);
    this.k = k; this.v = v;
  }
  push(key, val) {
    if (this.n === this.k.length) this._grow();
    let i = this.n++;
    this.k[i] = key; this.v[i] = val;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] <= this.k[i]) break;
      const tk = this.k[p], tv = this.v[p];
      this.k[p] = this.k[i]; this.v[p] = this.v[i];
      this.k[i] = tk; this.v[i] = tv;
      i = p;
    }
  }
  pop() {
    const top = this.v[0];
    this.topKey = this.k[0];
    const n = --this.n;
    this.k[0] = this.k[n]; this.v[0] = this.v[n];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let s = i;
      if (l < n && this.k[l] < this.k[s]) s = l;
      if (r < n && this.k[r] < this.k[s]) s = r;
      if (s === i) break;
      const tk = this.k[s], tv = this.v[s];
      this.k[s] = this.k[i]; this.v[s] = this.v[i];
      this.k[i] = tk; this.v[i] = tv;
      i = s;
    }
    return top;
  }
}

// ---------------------------------------------------------------------------
// The fields
// ---------------------------------------------------------------------------

/**
 * Affinity fields, conditions, elevation, and the resolved grass over one map.
 *
 * The world calls add()/remove() as the player edits, setLevel() as they
 * terraform, and tick(dt) once per frame with elapsed garden time. Everything
 * else reads.
 */
export class Fields {
  constructor(opts = {}) {
    const {
      w = 20, h = 20, sigma = SIGMA, radius = KERNEL_RADIUS,
      isMature = isMatureDefault, levels = null,
    } = opts;
    this.w = w;
    this.h = h;
    this.sigma = sigma;
    this.radius = radius;
    this.isMature = isMature;

    /** @type {Record<string, Float64Array>} one layer per channel. */
    this.data = Object.create(null);
    for (const c of AXES) this.data[c] = new Float64Array(w * h);

    /** Maturity accrued by elapsed garden time. Kept separate so that removing
     *  a tree does not un-age the ground it stood on. Moss does not un-grow. */
    this.aged = new Float64Array(w * h);

    /** Terrain level per tile, 0..MAX_LEVEL. ELEVATION.md. */
    this.levels = new Int8Array(w * h);
    if (levels) this.setLevels(levels, { quiet: true });

    /** Direction mask per tile — the occlusion graph. See the block comment. */
    this.mask = new Uint8Array(w * h).fill(FULL_MASK);

    /**
     * Climb per tile: how far a connector's sloped top rises above this tile's
     * own level, 0 on ordinary ground. The doorway through a cliff, and the
     * exact counterpart of `mask` — one array per half of the barrier rule.
     *
     * A tile's surface therefore spans `levels[i] .. levels[i] + climb[i]`,
     * which is a single number doing three jobs: it opens the step a ramp
     * bridges (`_levelGap`), it marks the ground permanently neutral
     * (`resolve`), and it tells the renderer where the meadow seams run
     * (`grassGrid().slope`).
     */
    this.climb = new Uint8Array(w * h);

    /** Seclusion contributed by the terrain itself, recomputed lazily. */
    this.terrain = new Float64Array(w * h);
    this._terrainStale = true;

    /** Bumped on every edit and on every ageing step. Renderers and the
     *  bestiary cache against this rather than re-scanning per frame. */
    this.version = 0;

    /** Elapsed garden time, seconds. */
    this.time = 0;

    /** Insertion-ordered placements currently on the map. */
    this.placements = [];

    // placement -> the exact stamp we applied, so remove() is an exact inverse
    // even if the caller has since mutated the object.
    this._stamped = new Map();
    this._byTag = new Map();
    this._maturing = new Map(); // placement -> last aged-at time
    this._occluders = new Map(); // tile index -> Set of records masking it
    this._slopes = new Map(); // tile index -> Set of connector records on it
    this._overlayCache = new Map();
    this._grass = null;
    this._grassVersion = -1;
    this._lastGrass = null;
    this._dirty = null;
    this._origin = null; // the tile of the last edit — the renderer animates from it
    this._heap = new MinHeap(512);
    this._stats = { floods: 0, relaxations: 0, rebuilds: 0 };
  }

  // ---------------------------------------------------------------- geometry

  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  index(tx, ty) {
    return ty * this.w + tx;
  }

  // --------------------------------------------------------------- elevation

  levelAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.levels[ty * this.w + tx] : 0;
  }

  /**
   * Raise or lower one tile. Terrain edits change what influence can cross, so
   * every source that could have crossed here is re-floodied — which is a
   * bounded set: a source only reaches `radius` tiles, so only sources within
   * `radius` of the change can have noticed it.
   */
  setLevel(tx, ty, level) {
    if (!this.inBounds(tx, ty)) return false;
    const v = Math.max(0, Math.min(MAX_LEVEL, level | 0));
    const i = ty * this.w + tx;
    if (this.levels[i] === v) return false;
    this.levels[i] = v;
    this._terrainStale = true;
    this._repassNear([[tx, ty]]);
    this._origin = { tx, ty };
    this._touch([[tx, ty]]);
    return true;
  }

  /** Bulk terrain load — a whole regraded map, or a save being hydrated. */
  setLevels(source, opts = {}) {
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const v = Number(source[i]) || 0;
      this.levels[i] = Math.max(0, Math.min(MAX_LEVEL, v | 0));
    }
    this._terrainStale = true;
    if (opts.quiet) return this;
    this.rebuild();
    return this;
  }

  /**
   * The height a step really has to cross between two tiles.
   *
   * A tile's surface is not a point. Ordinary ground is flat, so its surface is
   * the single level `l` and this returns the plain `|la - lb|` the module used
   * before — every calibration and every old test still means what it meant.
   * A CONNECTOR is sloped, so its surface is the interval `l .. l + climb`, and
   * the step to a neighbour is measured from whichever end of the ramp is
   * nearest that neighbour. Two intervals that overlap are level with each
   * other and the gap is 0.
   *
   * That is the whole of connector permeability, and it is geometry rather than
   * a rule: a ramp on level 0 reaches up to level 1, so ground at level 2 is one
   * step away instead of two, and a 2-level cliff opens exactly where a ramp
   * stands and nowhere else along its length.
   */
  _levelGap(ia, ib) {
    const a0 = this.levels[ia], a1 = a0 + this.climb[ia];
    const b0 = this.levels[ib], b1 = b0 + this.climb[ib];
    if (b0 > a1) return b0 - a1;
    if (a0 > b1) return a0 - b1;
    return 0;
  }

  /**
   * Can influence cross from (ax,ay) to its neighbour in direction `d`?
   * Three gates, in the order that rejects soonest — and the first two of them
   * are the two barriers of the header, each with its doorway folded in:
   *
   *   mask   the HEDGE and its ARCH.  Blocked unless both tiles open that
   *          direction; an arch opens one axis, so a gateway leaks.
   *   climb  the CLIFF and its RAMP.  Blocked at LEVEL_BLOCK levels unless a
   *          connector's slope shortens the step (`_levelGap`).
   *
   * `self` is set only for the step OUT of a source's own tile: an object does
   * not occlude itself. Without it a tall hedge could not lend its seclusion to
   * the ground beside it and a gravel walk could not spread its traffic — both
   * of which are the point of those objects. Note that `self` deliberately does
   * NOT excuse the height test: a hedge is a thing the influence owns and may
   * ignore, a cliff is the shape of the ground and belongs to nobody.
   */
  _crossable(ax, ay, d, self = false) {
    const [dx, dy] = DIRS[d];
    const bx = ax + dx, by = ay + dy;
    if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) return false;
    const ia = ay * this.w + ax;
    const ib = by * this.w + bx;
    if (!self && ((this.mask[ia] >> d) & 1) === 0) return false;
    if (((this.mask[ib] >> opposite(d)) & 1) === 0) return false;
    if (this._levelGap(ia, ib) >= LEVEL_BLOCK) return false;
    // No cutting the corner of a hedge: a diagonal needs both of its cardinals.
    if (dx !== 0 && dy !== 0) {
      if (!this._crossableCardinal(ax, ay, dx, 0, self)) return false;
      if (!this._crossableCardinal(ax, ay, 0, dy, self)) return false;
    }
    return true;
  }

  _crossableCardinal(ax, ay, dx, dy, self = false) {
    const d = dx === 1 ? 0 : dx === -1 ? 4 : dy === 1 ? 2 : 6;
    const bx = ax + dx, by = ay + dy;
    if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) return false;
    const ia = ay * this.w + ax;
    const ib = by * this.w + bx;
    if (!self && ((this.mask[ia] >> d) & 1) === 0) return false;
    if (((this.mask[ib] >> opposite(d)) & 1) === 0) return false;
    return this._levelGap(ia, ib) < LEVEL_BLOCK;
  }

  // ------------------------------------------------------------------- edits

  /**
   * Deposit a placement's affinities and conditions into the fields.
   *
   * @param {{tx:number, ty:number, footprint?:number[],
   *          affinities?:object|string[], affinity?:string,
   *          deposits?:object, nullifier?:boolean|'arch', gate?:string,
   *          tags?:string[], stage?:string}} p
   */
  add(p) {
    if (!p || this._stamped.has(p)) return p;

    const tiles = [...footprintTiles(p.tx, p.ty, p.footprint)]
      .filter(([x, y]) => this.inBounds(x, y));

    const aff = affinityWeights(p);
    const cond = {};
    for (const c of CONDITIONS) {
      const v = p.deposits ? Number(p.deposits[c]) : 0;
      if (Number.isFinite(v) && v) cond[c] = v;
    }
    // A trafficked tile that never got round to declaring it is still traffic.
    if (cond.seclusion === undefined && anyTag(p, TRAFFIC_TAGS)) {
      cond.seclusion = TRAFFIC_SECLUSION;
    }

    // One flat list of (channel, amount) so the stamp loop allocates nothing.
    const channels = [];
    for (const a of AFFINITIES) if (aff[a]) channels.push([a, aff[a]]);
    for (const c of CONDITIONS) if (cond[c]) channels.push([c, cond[c]]);

    const record = {
      p,
      tiles,
      aff,
      cond,
      channels,
      tags: p.tags ? [...p.tags] : [],
      mask: maskFor(p),
      // The barrier and the doorway, one field each. `mask` is a hedge or its
      // arch; `climb` is a ramp against a cliff. A placement is at most one of
      // the two — `isNullifier` refuses to call a connector an occluder — so
      // these never both bite on the same tile from the same object.
      climb: connectorSpan(p),
      idx: null,
      decay: null,
    };

    this._stamped.set(p, record);
    this.placements.push(p);
    for (const t of record.tags) {
      let set = this._byTag.get(t);
      if (!set) this._byTag.set(t, (set = new Set()));
      set.add(p);
    }

    // Order matters: a nullifier must be in the graph BEFORE anything floods,
    // including itself, or a hedge would leak on the frame it was planted. A
    // connector is the same statement upside down — it must be in the graph
    // before anything floods or a ramp would fail to join two terraces until
    // the next unrelated edit happened to re-flood the neighbourhood.
    if (record.mask !== FULL_MASK) this._addOccluder(record);
    if (record.climb) this._addConnector(record);
    if (record.mask !== FULL_MASK || record.climb) {
      this._repassNear(record.tiles, record);
    }

    this._flood(record);
    this._applyStamp(record, +1);
    if (this.isMature(p)) this._maturing.set(p, this.time);
    this._origin = { tx: p.tx, ty: p.ty };
    this._touch(record.tiles);
    return p;
  }

  /** Remove a placement. Removal is free and instant — SPEC §0. */
  remove(p) {
    const record = this._stamped.get(p);
    if (!record) return false;
    this._applyStamp(record, -1);
    this._stamped.delete(p);
    this._maturing.delete(p);
    const i = this.placements.indexOf(p);
    if (i !== -1) this.placements.splice(i, 1);
    for (const t of record.tags) {
      const set = this._byTag.get(t);
      if (set) {
        set.delete(p);
        if (set.size === 0) this._byTag.delete(t);
      }
    }
    if (record.mask !== FULL_MASK) this._removeOccluder(record);
    if (record.climb) this._removeConnector(record);
    if (record.mask !== FULL_MASK || record.climb) {
      this._repassNear(record.tiles.length ? record.tiles : [[p.tx, p.ty]]);
    }
    this._origin = { tx: p.tx, ty: p.ty };
    this._touch(record.tiles);
    return true;
  }

  /** Move a placement without a remove/add round trip through the catalog. */
  move(p, tx, ty) {
    if (!this._stamped.has(p)) return false;
    this.remove(p);
    p.tx = tx;
    p.ty = ty;
    this.add(p);
    return true;
  }

  /**
   * A plant reaching `mature` starts ageing the ground around it, and usually
   * bumps its own weights too — call with the new deposits if they changed.
   */
  setStage(p, stage, deposits = null) {
    if (!this._stamped.has(p)) {
      p.stage = stage;
      if (deposits) p.deposits = deposits;
      return this.add(p);
    }
    this.remove(p);
    p.stage = stage;
    if (deposits) p.deposits = deposits;
    return this.add(p);
  }

  // ------------------------------------------------------- the occlusion set

  _addOccluder(record) {
    for (const [x, y] of record.tiles) {
      const i = y * this.w + x;
      let set = this._occluders.get(i);
      if (!set) this._occluders.set(i, (set = new Set()));
      set.add(record);
      this._recomputeMask(i);
    }
    this._terrainStale = true;
  }

  _removeOccluder(record) {
    for (const [x, y] of record.tiles) {
      const i = y * this.w + x;
      const set = this._occluders.get(i);
      if (!set) continue;
      set.delete(record);
      if (set.size === 0) this._occluders.delete(i);
      this._recomputeMask(i);
    }
    this._terrainStale = true;
  }

  /** Two hedges on one tile is not a thing the world allows, but AND is free. */
  _recomputeMask(i) {
    const set = this._occluders.get(i);
    let m = FULL_MASK;
    if (set) for (const r of set) m &= r.mask;
    this.mask[i] = m;
  }

  // ---------------------------------------------------- the connector set
  //
  // Line for line the occluder set above, because a doorway is bookkept exactly
  // like the barrier it opens. The only difference is the combine: occluders AND
  // their masks together (two hedges on a tile block more), connectors take the
  // MAX of their spans (two ramps on a tile reach as high as the taller).

  _addConnector(record) {
    for (const [x, y] of record.tiles) {
      const i = y * this.w + x;
      let set = this._slopes.get(i);
      if (!set) this._slopes.set(i, (set = new Set()));
      set.add(record);
      this._recomputeClimb(i);
    }
    this._terrainStale = true;
  }

  _removeConnector(record) {
    for (const [x, y] of record.tiles) {
      const i = y * this.w + x;
      const set = this._slopes.get(i);
      if (!set) continue;
      set.delete(record);
      if (set.size === 0) this._slopes.delete(i);
      this._recomputeClimb(i);
    }
    this._terrainStale = true;
  }

  _recomputeClimb(i) {
    const set = this._slopes.get(i);
    let c = 0;
    if (set) for (const r of set) if (r.climb > c) c = r.climb;
    this.climb[i] = c;
  }

  /**
   * The passability graph changed at (tx,ty). Re-flood every source that could
   * have crossed it. A source's influence dies at `radius`, so any source whose
   * path went through this tile is within `radius` of it — which makes this a
   * bounded, local operation and not a full rebuild.
   */
  _repassNear(tiles, skip = null) {
    const r = this.radius + 1;
    for (const p of this.placements) {
      const rec = this._stamped.get(p);
      if (!rec || rec === skip || !rec.idx) continue;
      let near = false;
      for (const [tx, ty] of tiles) {
        if (distanceToPlacement(p, tx, ty) <= r) { near = true; break; }
      }
      if (!near) continue;
      this._applyStamp(rec, -1);
      this._flood(rec);
      this._applyStamp(rec, +1);
    }
  }

  // --------------------------------------------------------------- the flood
  //
  // One bounded Dijkstra per source over the passable graph. The distance it
  // decays by is DISPLACEMENT PLUS DETOUR:
  //
  //     dist = |v|  +  (L - octile(v))
  //
  // where `v` is the vector back to the source (Danielsson-style propagation),
  // `L` is the length actually walked, and octile(v) is the shortest walk that
  // could have produced that displacement on an 8-connected grid. The bracket
  // is therefore exactly the ground wasted going round something.
  //
  // Both halves are load-bearing and neither works alone:
  //
  //   * In open ground L == octile(v), the bracket vanishes, and dist is the
  //     true straight-line distance. The profile is the SAME truncated gaussian
  //     this module used before — bit for bit, in every direction — so every
  //     number ever calibrated against it still means what it meant, and a zone
  //     with nothing in its way is a circle rather than an octagon. Plain path
  //     length alone would have made every zone an octagon, which on a map
  //     whose whole job is to show the player soft organic borders is not a
  //     rounding error, it is the feature going wrong.
  //
  //   * A detour costs what it costs. Vector propagation ALONE is blind to
  //     detours — a one-tile hedge would simply be walked around and the
  //     influence would arrive at full strength, so hedges would only work in
  //     unbroken screens and DECOR.md's "two species one tile apart with a
  //     hedge between them" would quietly not be true.
  //
  // Cost per source: a window of (2r+1)^2 = 169 nodes, 8 edges each, and a heap
  // of at most that. A full rebuild of a heavily planted 20x20 — call it 300
  // sources counting painted ground — is a few hundred thousand relaxations and
  // lands in single-digit milliseconds; it runs on load and on nothing else. A
  // single placement costs ONE flood, plus (only if it occludes, or if terrain
  // moved) a re-flood of the sources within reach of the change.

  _flood(record) {
    const R = this.radius;
    const tiles = record.tiles;
    if (tiles.length === 0) {
      record.idx = new Int32Array(0);
      record.decay = new Float32Array(0);
      return;
    }

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of tiles) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    x0 = Math.max(0, x0 - R); y0 = Math.max(0, y0 - R);
    x1 = Math.min(this.w - 1, x1 + R); y1 = Math.min(this.h - 1, y1 + R);

    const W = x1 - x0 + 1;
    const H = y1 - y0 + 1;
    const n = W * H;
    if (!this._sd || this._sd.length < n) {
      this._sd = new Float64Array(n);
      this._sl = new Float64Array(n);
      this._svx = new Int16Array(n);
      this._svy = new Int16Array(n);
    }
    const dist = this._sd;
    const walk = this._sl;
    const vx = this._svx;
    const vy = this._svy;
    dist.fill(Infinity, 0, n);
    const heap = this._heap;
    heap.clear();

    for (const [x, y] of tiles) {
      const li = (y - y0) * W + (x - x0);
      if (dist[li] === 0) continue;
      dist[li] = 0;
      walk[li] = 0;
      vx[li] = 0; vy[li] = 0;
      heap.push(0, li);
    }

    const twoSigmaSq = 2 * this.sigma * this.sigma;
    let relax = 0;

    while (heap.n > 0) {
      const li = heap.pop();
      const d = heap.topKey;
      if (d > dist[li] + 1e-12) continue;
      if (d >= R) continue;
      const lx = li % W;
      const ly = (li / W) | 0;
      const ax = lx + x0;
      const ay = ly + y0;
      const fromSeed = d === 0; // an object does not occlude its own emission
      for (let dir = 0; dir < 8; dir++) {
        const [dx, dy] = DIRS[dir];
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        relax++;
        if (!this._crossable(ax, ay, dir, fromSeed)) continue;
        const mi = ny * W + nx;
        const nvx = vx[li] + dx;
        const nvy = vy[li] + dy;
        const nl = walk[li] + DIR_COST[dir];
        const straight = Math.sqrt(nvx * nvx + nvy * nvy);
        const nd = straight + (nl - octile(nvx, nvy));
        if (nd > R) continue;
        if (nd < dist[mi] - 1e-12) {
          dist[mi] = nd;
          walk[mi] = nl;
          vx[mi] = nvx;
          vy[mi] = nvy;
          heap.push(nd, mi);
        }
      }
    }

    // Collect. A tile the flood never reached is simply absent from the stamp,
    // which is the whole point: a hedge does not attenuate influence, it ends it.
    let count = 0;
    for (let i = 0; i < n; i++) if (dist[i] !== Infinity) count++;
    const idx = new Int32Array(count);
    // Float64, not Float32. The stamp IS the field's arithmetic; storing it at
    // single precision would put an 1e-8 wobble under every reading and cost
    // remove() its exactness, which is the one property this module must not
    // lose. 300 sources of 169 tiles is 400 kB — a cheap price for a clean zero.
    const decay = new Float64Array(count);
    let k = 0;
    for (let ly = 0; ly < H; ly++) {
      for (let lx = 0; lx < W; lx++) {
        const li = ly * W + lx;
        const d = dist[li];
        if (d === Infinity) continue;
        idx[k] = (ly + y0) * this.w + (lx + x0);
        decay[k] = Math.exp(-(d * d) / twoSigmaSq);
        k++;
      }
    }
    record.idx = idx;
    record.decay = decay;
    this._stats.floods++;
    this._stats.relaxations += relax;
  }

  _applyStamp(record, sign) {
    const { idx, decay, channels } = record;
    if (!idx) return;
    for (let c = 0; c < channels.length; c++) {
      const field = this.data[channels[c][0]];
      if (!field) continue;
      const v = channels[c][1] * sign;
      for (let k = 0; k < idx.length; k++) field[idx[k]] += v * decay[k];
    }
  }

  _touch(tiles) {
    this.version++;
    this._overlayCache.clear();
    const r = this.radius;
    for (const [ox, oy] of tiles) {
      const box = { x0: ox - r, y0: oy - r, x1: ox + r, y1: oy + r };
      if (!this._dirty) this._dirty = box;
      else {
        this._dirty.x0 = Math.min(this._dirty.x0, box.x0);
        this._dirty.y0 = Math.min(this._dirty.y0, box.y0);
        this._dirty.x1 = Math.max(this._dirty.x1, box.x1);
        this._dirty.y1 = Math.max(this._dirty.y1, box.y1);
      }
    }
  }

  /** The bounding box changed since the last clearDirty(), or null. */
  get dirtyRect() {
    return this._dirty;
  }

  clearDirty() {
    this._dirty = null;
  }

  /** The tile of the most recent edit — ZONING.md animates grass flips outward from it. */
  get lastEditOrigin() {
    return this._origin;
  }

  // -------------------------------------------------------------------- time

  /**
   * Advance garden time. Maturity accrues near mature plants, saturating toward
   * AGE_CEILING with time constant AGE_TAU_SECONDS. This is the cosiness
   * feature: a glade left alone quietly improves, so coming back is rewarded and
   * not coming back is never punished.
   *
   * The ageing uses the plant's own flood stamp, so moss creeps round a hedge
   * exactly as influence does and stops dead at a terrace wall.
   */
  tick(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    if (this._maturing.size === 0) return;
    let changed = false;
    for (const [p, last] of this._maturing) {
      const elapsed = this.time - last;
      if (elapsed < AGE_STEP_SECONDS) continue;
      this._maturing.set(p, this.time);
      const gain = 1 - Math.exp(-elapsed / AGE_TAU_SECONDS);
      const record = this._stamped.get(p);
      if (!record || !record.idx) continue;
      const { idx, decay } = record;
      for (let k = 0; k < idx.length; k++) {
        const i = idx[k];
        this.aged[i] += (AGE_CEILING - this.aged[i]) * gain * decay[k];
      }
      changed = true;
    }
    if (changed) {
      this.version++;
      this._overlayCache.clear();
    }
  }

  // ----------------------------------------------------------------- reading

  _ensureTerrain() {
    if (!this._terrainStale) return;
    this._terrainStale = false;
    const { w, h } = this;
    const R = RELIEF_RADIUS;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const own = this.levels[i];
        // Relief: is the ground around me higher than I am? A hollow ringed by
        // higher ground is secluded; an exposed summit is not. ELEVATION.md.
        let sum = 0;
        let weight = 0;
        for (let dy = -R; dy <= R; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= w) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 === 0 || d2 > R * R) continue;
            const wgt = 1 / (1 + Math.sqrt(d2));
            sum += (this.levels[ny * w + nx] - own) * wgt;
            weight += wgt;
          }
        }
        const relief = weight > 0 ? sum / weight : 0;
        const clamped = Math.max(-RELIEF_CLAMP, Math.min(RELIEF_CLAMP, relief));
        // Enclosure: how many of the ways out are shut? A walled corner is
        // quiet for the same reason a hollow is. This is the placeholder for
        // real sightlines — see NEEDS_DESIGN['seclusion-sightlines'].
        //
        // The map edge is NOT a wall. It is the way in: creatures arrive over
        // it and leave over it, so the border of the glade is the least private
        // ground on the map, not the most. Off-map directions are therefore
        // left out of the count entirely rather than counted as shut — which
        // also keeps an untouched garden at exactly neutral everywhere, and an
        // overlay that is not neutral on an empty map is an overlay that lies.
        let shut = 0;
        let ways = 0;
        for (let d = 0; d < 8; d++) {
          const nx = x + DIRS[d][0];
          const ny = y + DIRS[d][1];
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          ways++;
          if (!this._crossable(x, y, d)) shut++;
        }
        const enclosure = ways > 0 ? shut / ways : 0;
        this.terrain[i] = clamped * SECLUSION_PER_LEVEL + enclosure * ENCLOSURE_GAIN;
      }
    }
  }

  /** One channel at one tile. The hot path. Unknown channels read 0. */
  at(channel, tx, ty) {
    if (!this.inBounds(tx, ty)) return 0;
    const field = this.data[channel];
    if (!field) return 0; // a retired axis, or a typo. Never throw at a reader.
    const i = ty * this.w + tx;
    if (channel === 'maturity') return field[i] + this.aged[i];
    if (channel === 'seclusion') {
      this._ensureTerrain();
      return field[i] + this.terrain[i];
    }
    return field[i];
  }

  /** Every channel at one tile, as a fresh object. Convenience, not hot path. */
  sample(tx, ty) {
    const out = {};
    for (const c of AXES) out[c] = this.at(c, tx, ty);
    return out;
  }

  /** Just the four affinities at one tile. */
  affinitiesAt(tx, ty) {
    const out = {};
    for (const a of AFFINITIES) out[a] = this.at(a, tx, ty);
    return out;
  }

  /** Every channel at one tile, compressed to 0..1 for display. */
  sampleNorm(tx, ty) {
    const out = {};
    for (const c of AXES) out[c] = normaliseAxis(c, this.at(c, tx, ty));
    return out;
  }

  /** One channel at one tile, compressed to 0..1. */
  norm(channel, tx, ty) {
    return normaliseAxis(channel, this.at(channel, tx, ty));
  }

  /** Is this tile a nullifier? Renders as meadow, claims nothing, blocks all. */
  isBlocked(tx, ty) {
    if (!this.inBounds(tx, ty)) return true;
    return this.mask[ty * this.w + tx] === 0;
  }

  /** The raw direction mask at a tile. 0xFF open, 0 blocked, else a gate. */
  maskAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.mask[ty * this.w + tx] : 0;
  }

  /**
   * Is this tile sloped — a ramp, stair, scramble or stepped wall standing on
   * it? Sloped ground renders as meadow and is never claimed, and it does not
   * block: ELEVATION.md's "free seam", which is the prettier alternative to a
   * hedge between two zones.
   */
  isSlope(tx, ty) {
    return this.inBounds(tx, ty) ? this.climb[ty * this.w + tx] > 0 : false;
  }

  /** How far the slope on this tile rises above it, in levels. 0 = flat. */
  climbAt(tx, ty) {
    return this.inBounds(tx, ty) ? this.climb[ty * this.w + tx] : 0;
  }

  // -------------------------------------------------------------- resolution

  /**
   * Whose ground is this? ZONING.md's rule, with the contest margin worked out
   * in the constants block above.
   *
   * @returns {{kind:'neutral'|'claimed'|'contested', type:string, owner:string|null,
   *            other:string|null, top:number, second:number, strength:number}}
   */
  resolve(tx, ty) {
    if (!this.inBounds(tx, ty)) return NEUTRAL_RESULT;
    const i = ty * this.w + tx;
    // A nullifier tile is nobody's, always. DECOR.md wants the mown border.
    if (this.mask[i] === 0) return NEUTRAL_RESULT;
    // AND SLOPED GROUND IS NOBODY'S, ALWAYS. ELEVATION.md, rule 1: a ramp or
    // stair tile "renders as plain meadow and can never be claimed by a
    // species, no matter what surrounds it".
    //
    // A HARD RULE AND NOT A WEIGHTING, ON PURPOSE. It is returned here, before
    // a single affinity is read, so that no amount of planting on either side
    // can outvote it — a weighting can always be beaten by enough thicket, and
    // then the rule is a suggestion. Two lines up, the nullifier does exactly
    // the same thing for exactly the same reason, and the pair of them is the
    // whole of "a barrier and its doorway are both neutral ground".
    //
    // WHY THE RULE IS RIGHT RATHER THAN ARBITRARY: objects need a flat
    // footprint (js/world.js refuses anything else), so NOTHING CAN EVER BE
    // PLANTED ON A SLOPE. There is no source standing there to argue for it,
    // and the ground is neutral because nobody is in a position to claim it.
    // The rule falls out of the geometry; this line only refuses to let the
    // gaussian tails of the neighbours pretend otherwise.
    //
    // Note what it does NOT do: it does not touch `data`, so `at('satyr', ...)`
    // on a ramp still reads whatever crossed it. Influence pours through the
    // doorway (see `_levelGap`) and merely declines to settle on the doorstep.
    // That separation is what makes rule 3 and rule 1 co-exist instead of
    // fighting, and it is why the overlay shows an unbroken flow through a ramp
    // while the grass shows a neutral seam — both of which are true.
    if (this.climb[i]) return NEUTRAL_RESULT;

    let owner = null, other = null;
    let top = 0, second = 0;
    for (const a of AFFINITIES) {
      const v = this.data[a][i];
      if (v > top) {
        second = top; other = owner;
        top = v; owner = a;
      } else if (v > second) {
        second = v; other = a;
      }
    }

    if (top < CLAIM_FLOOR) return NEUTRAL_RESULT;

    const margin = Math.min(Math.max(CONTEST_K / top, CONTEST_FLOOR), CONTEST_CAP * top);
    const strength = Math.min(1, (top - CLAIM_FLOOR) / (CLAIM_FLOOR + 1.5));

    if (second > 0 && top - second <= margin) {
      return {
        kind: 'contested', type: GRASS_FOR[owner], owner, other,
        top, second, strength,
      };
    }
    return {
      kind: 'claimed', type: GRASS_FOR[owner], owner, other: null,
      top, second, strength,
    };
  }

  /** The grass type name at one tile. Contested ground reports the leader. */
  grassAt(tx, ty) {
    return this.resolve(tx, ty).type;
  }

  /**
   * The whole-map view the terrain renderer wants, cached against `version`.
   *
   *   type      grass code per tile (0 meadow .. 4 millefleurs)
   *   other     the RIVAL's code on contested tiles, 0 elsewhere. Non-zero
   *             `other` is exactly "dither these two together at 50%", which is
   *             one blend routine and not ten tile sets.
   *   strength  0..1 how firmly claimed — for fading a young zone in
   *   blocked    1 where a nullifier sits, so the mown border draws itself
   *   slope      1 where a connector sits. Always type 0 / meadow, and the two
   *              arrays are the barrier and its doorway again: `blocked` is a
   *              seam the influence stops at, `slope` is a seam it runs
   *              through. A renderer that wants the earth-and-stone treatment
   *              on a ramp instead of grass reads this rather than re-deriving
   *              it from the object list.
   */
  grassGrid() {
    if (this._grass && this._grassVersion === this.version) return this._grass;
    const n = this.w * this.h;
    const type = new Uint8Array(n);
    const other = new Uint8Array(n);
    const strength = new Float32Array(n);
    const blocked = new Uint8Array(n);
    const slope = new Uint8Array(n);
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const i = ty * this.w + tx;
        const r = this.resolve(tx, ty);
        type[i] = r.owner ? GRASS_CODE[r.owner] : 0;
        other[i] = r.kind === 'contested' && r.other ? GRASS_CODE[r.other] : 0;
        strength[i] = r.strength;
        blocked[i] = this.mask[i] === 0 ? 1 : 0;
        slope[i] = this.climb[i] ? 1 : 0;
      }
    }
    this._grass = Object.freeze({
      w: this.w, h: this.h, version: this.version,
      types: GRASS_TYPES, type, other, strength, blocked, slope,
    });
    this._grassVersion = this.version;
    return this._grass;
  }

  /**
   * Tiles whose grass has changed since the last call, with the edit that
   * caused it. ZONING.md: flips spread tile by tile over a few seconds, animated
   * outward from the object that caused them — so the renderer wants the delta
   * and the origin, not a whole grid to diff for itself.
   */
  grassChanges() {
    const grid = this.grassGrid();
    const prev = this._lastGrass;
    const changed = [];
    if (!prev) {
      this._lastGrass = { type: Uint8Array.from(grid.type), other: Uint8Array.from(grid.other) };
      return { origin: this._origin, changed };
    }
    for (let i = 0; i < grid.type.length; i++) {
      if (prev.type[i] === grid.type[i] && prev.other[i] === grid.other[i]) continue;
      changed.push({
        tx: i % this.w,
        ty: (i / this.w) | 0,
        from: GRASS_TYPES[prev.type[i]],
        to: GRASS_TYPES[grid.type[i]],
        fromOther: prev.other[i] ? GRASS_TYPES[prev.other[i]] : null,
        toOther: grid.other[i] ? GRASS_TYPES[grid.other[i]] : null,
      });
      prev.type[i] = grid.type[i];
      prev.other[i] = grid.other[i];
    }
    // Sort by distance from the cause, so the renderer can just walk the list
    // and get the ripple for free.
    const o = this._origin;
    if (o) {
      changed.sort((a, b) =>
        (a.tx - o.tx) ** 2 + (a.ty - o.ty) ** 2 - ((b.tx - o.tx) ** 2 + (b.ty - o.ty) ** 2));
    }
    return { origin: o, changed };
  }

  /**
   * The largest run of contiguous tiles of one grass type touching (tx,ty), and
   * its size. ZONING.md's settle rule is "a large enough contiguous patch of its
   * own grass", and contiguity is the thing a flood fill is for.
   * Contested tiles do NOT count — no creature settles on contested ground.
   */
  patch(affinity, tx, ty, limit = 400) {
    const want = GRASS_CODE[affinity];
    if (!want || !this.inBounds(tx, ty)) return { size: 0, tiles: [] };
    const grid = this.grassGrid();
    const start = ty * this.w + tx;
    if (grid.type[start] !== want || grid.other[start] !== 0) return { size: 0, tiles: [] };
    const seen = new Uint8Array(this.w * this.h);
    const stack = [start];
    const tiles = [];
    seen[start] = 1;
    while (stack.length && tiles.length < limit) {
      const i = stack.pop();
      const x = i % this.w;
      const y = (i / this.w) | 0;
      tiles.push({ tx: x, ty: y });
      for (let d = 0; d < 8; d += 2) { // 4-connected: a patch you can walk
        const [dx, dy] = DIRS[d];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) continue;
        const j = ny * this.w + nx;
        if (seen[j]) continue;
        seen[j] = 1;
        if (grid.type[j] !== want || grid.other[j] !== 0) continue;
        stack.push(j);
      }
    }
    return { size: tiles.length, tiles };
  }

  /** How many tiles on the whole map each grass type holds. */
  grassCounts() {
    const grid = this.grassGrid();
    const out = {};
    for (const t of GRASS_TYPES) out[t] = 0;
    out.contested = 0;
    for (let i = 0; i < grid.type.length; i++) {
      out[GRASS_TYPES[grid.type[i]]]++;
      if (grid.other[i]) out.contested++;
    }
    return out;
  }

  /**
   * The normalised view the overlay renderer wants: a whole-map Float32Array of
   * 0..1, cached against `version` so toggling the overlay costs one pass and
   * panning costs nothing.
   */
  overlay(channel) {
    const key = `${channel}@${this.version}`;
    const hit = this._overlayCache.get(key);
    if (hit) return hit;
    const out = new Float32Array(this.w * this.h);
    const field = this.data[channel];
    if (field) {
      if (channel === 'seclusion') this._ensureTerrain();
      for (let i = 0; i < out.length; i++) {
        let v = field[i];
        if (channel === 'maturity') v += this.aged[i];
        else if (channel === 'seclusion') v += this.terrain[i];
        out[i] = normaliseAxis(channel, v);
      }
    } else {
      const neutral = normaliseAxis(channel, 0);
      out.fill(neutral);
    }
    const meta = AXIS_META[channel];
    const view = {
      axis: channel, w: this.w, h: this.h, data: out, version: this.version,
      neutral: normaliseAxis(channel, 0),
      grass: meta && meta.grass ? meta.grass : null,
    };
    this._overlayCache.set(key, view);
    return view;
  }

  /** min / max / mean for one channel. Used by tools/playtest.mjs reporting. */
  stats(channel) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const v = this.at(channel, i % this.w, (i / this.w) | 0);
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { axis: channel, min, max, mean: sum / n };
  }

  allStats() {
    const out = {};
    for (const c of AXES) out[c] = this.stats(c);
    return out;
  }

  /** What the propagation has cost since construction. For the playtest report. */
  cost() {
    return { ...this._stats, sources: this.placements.length, tiles: this.w * this.h };
  }

  // -------------------------------------------------------- placement lookup
  //
  // The fields module already sees every placement the player makes, so it is
  // the natural home for the tag index that creature `count` requirements read.
  // Keeping it here means js/creatures.js depends on exactly one module.

  /** Every placement carrying a tag. Never mutate the returned set. */
  taggedWith(tag) {
    return this._byTag.get(tag) || EMPTY_SET;
  }

  /** Every tag currently present on the map, with counts. */
  tagCounts() {
    const out = new Map();
    for (const [tag, set] of this._byTag) out.set(tag, set.size);
    return out;
  }

  /** How many placements carrying `tag` lie within `radius` tiles of (tx,ty). */
  countTag(tag, tx, ty, radius) {
    let n = 0;
    for (const p of this.taggedWith(tag)) {
      if (distanceToPlacement(p, tx, ty) <= radius) n++;
    }
    return n;
  }

  /** Nearest placement carrying any of `tags` within `radius`, or null. */
  nearest(tags, tx, ty, radius = Infinity) {
    const list = Array.isArray(tags) ? tags : [tags];
    let best = null;
    let bestD = Infinity;
    for (const tag of list) {
      for (const p of this.taggedWith(tag)) {
        const d = distanceToPlacement(p, tx, ty);
        if (d <= radius && d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best ? { placement: best, distance: bestD } : null;
  }

  /**
   * A whole-map count grid for one (tag, radius) pair, in one pass over the
   * tagged placements rather than one pass per tile. This is what makes a
   * full-map "where would this creature be happiest" scan cheap.
   *
   * Straight-line and NOT occluded, which is right for an AT-LEAST count: "are
   * there three ash trees near me" is a fact about the wood, not about whether
   * you can walk to it. A hedge does not un-plant an ash.
   *
   * `opts.occluded` asks the opposite question, and `countGridOccluded` below
   * explains why the two are different questions rather than a setting.
   */
  countGrid(tag, radius, opts = {}) {
    if (opts.occluded) return this.countGridOccluded(tag, radius);
    const grid = new Int16Array(this.w * this.h);
    const set = this._byTag.get(tag);
    if (!set || set.size === 0) return grid;
    const r = Math.ceil(radius);
    const rSq = radius * radius;
    let epoch = 0;
    const seen = new Int32Array(this.w * this.h);
    for (const p of set) {
      epoch++;
      for (const [ox, oy] of footprintTiles(p.tx, p.ty, p.footprint)) {
        for (let dy = -r; dy <= r; dy++) {
          const ty = oy + dy;
          if (ty < 0 || ty >= this.h) continue;
          for (let dx = -r; dx <= r; dx++) {
            const tx = ox + dx;
            if (tx < 0 || tx >= this.w) continue;
            if (dx * dx + dy * dy > rSq) continue;
            const i = ty * this.w + tx;
            if (seen[i] === epoch) continue; // count a multi-tile object once
            seen[i] = epoch;
            grid[i]++;
          }
        }
      }
    }
    return grid;
  }

  /**
   * The same count, but measured through the propagation graph instead of
   * across open air: an object is counted only if it can be REACHED within
   * `radius` steps without crossing a nullifier, a closed gate, or a step of
   * LEVEL_BLOCK levels or more. Diagonals need both their cardinals, exactly as
   * influence does, so a hedge corner is sealed here too.
   *
   * WHY THIS IS A SECOND FUNCTION AND NOT A FLAG ON THE FIRST.
   *
   * The two count directions are asking genuinely different questions, and the
   * doc's reasoning for straight-line counting only covers one of them:
   *
   *   AT-LEAST — "are there three ash trees near me?" A fact about the wood. A
   *     screen between you and an ash does not un-plant it, and if it counted
   *     you could break a settled centaur by tidying a hedge fifty tiles away.
   *     Straight line. Unchanged.
   *
   *   AT-MOST — "is there a wall oppressing me?" This is not a fact about the
   *     wood, it is a fact about the PLACE, and a thing you cannot see past is
   *     the oldest fix in gardening. The satyr is "actively repelled by tilled
   *     rows, walls and straight edges" (SPEC §7) — repelled by their presence
   *     in his glade, not by their existence in the county.
   *
   * Without this distinction DECOR.md's central promise is quietly false.
   * "Conflicting species can sit one tile apart with a hedge between them,
   * which is the whole point of the request" holds for the grass, because
   * affinity is occluded — and fails for exactly the requirements that make
   * satyr and unicorn incompatible in the first place, because those are
   * at-most counts. The player screens off the unicorn's colonnade, watches the
   * ground correctly turn back to thicket, and the satyr still refuses to
   * settle with nothing on the card to explain why.
   *
   * It also makes ELEVATION.md's "free synthesis" true rather than partial: a
   * two-level terrace now divides a garden in the same two ways a hedge does,
   * with no object placed, which is what "the elevation request and the
   * nullifier request are the same system" was supposed to mean.
   */
  countGridOccluded(tag, radius) {
    const n = this.w * this.h;
    const grid = new Int16Array(n);
    const set = this._byTag.get(tag);
    if (!set || set.size === 0) return grid;

    const dist = new Int16Array(n);
    const seen = new Int32Array(n);
    const queue = new Int32Array(n);
    const r = Math.ceil(radius);
    let epoch = 0;

    for (const p of set) {
      epoch++;
      let head = 0;
      let tail = 0;
      // Seed every tile of the footprint at distance 0. A source does not
      // occlude itself — the same rule `_flood` uses, and for the same reason:
      // a hedge must still be able to be "a hedge that is here".
      for (const [ox, oy] of footprintTiles(p.tx, p.ty, p.footprint)) {
        if (ox < 0 || oy < 0 || ox >= this.w || oy >= this.h) continue;
        const i = oy * this.w + ox;
        if (seen[i] === epoch) continue;
        seen[i] = epoch;
        dist[i] = 0;
        grid[i]++;
        queue[tail++] = i;
      }
      while (head < tail) {
        const i = queue[head++];
        const d = dist[i];
        if (d >= r) continue;
        const ax = i % this.w;
        const ay = (i / this.w) | 0;
        const self = d === 0;
        for (let k = 0; k < DIRS.length; k++) {
          const bx = ax + DIRS[k][0];
          const by = ay + DIRS[k][1];
          if (bx < 0 || by < 0 || bx >= this.w || by >= this.h) continue;
          const j = by * this.w + bx;
          if (seen[j] === epoch) continue;
          if (!this._crossable(ax, ay, k, self)) continue;
          // The radius stays EUCLIDEAN and measured from the placement, so on
          // open ground this counts exactly the tiles `countGrid` counts. Only
          // REACHABILITY is new — the shape of the neighbourhood is unchanged,
          // which is what lets the thesis check keep its meaning: with no
          // occluders anywhere, the two grids are identical.
          if (distanceToPlacement(p, bx, by) > radius) continue;
          seen[j] = epoch;
          dist[j] = d + 1;
          grid[j]++;
          queue[tail++] = j;
        }
      }
    }
    return grid;
  }

  // ------------------------------------------------------- emergent readouts

  /**
   * Name the character of a place, after the fact. The player never declares a
   * region; the game recognises what they accidentally made and gives it a
   * name, which is the cheapest satisfying thing in the whole design.
   *
   * Now it reads the ground rather than a stack of abstractions, so the name
   * and the grass under it always agree — which they could not be relied on to
   * do when the name came from five axes and the terrain came from none.
   */
  regionName(tx, ty) {
    const r = this.resolve(tx, ty);
    if (r.kind === 'contested') {
      const key = [r.owner, r.other].sort().join('+');
      return CONTESTED_NAMES[key] || 'the debated ground';
    }
    if (r.kind === 'claimed') {
      const secluded = this.at('seclusion', tx, ty) > 2.5;
      const old = this.at('maturity', tx, ty) > 4;
      const names = CLAIMED_NAMES[r.owner];
      if (old && names.old) return names.old;
      if (secluded && names.quiet) return names.quiet;
      return names.plain;
    }
    // Nobody's ground still has a character, and it is worth naming.
    if (this.at('maturity', tx, ty) > 4) return 'the old glade';
    if (this.at('seclusion', tx, ty) > 2.5) return 'the quiet corner';
    if (this.at('seclusion', tx, ty) < -1.5) return 'the open walk';
    return null;
  }

  /** A short adjective for how one channel reads here. */
  axisWord(channel, tx, ty) {
    const meta = AXIS_META[channel];
    if (!meta) return '';
    const v = this.at(channel, tx, ty);
    if (meta.signed) return v > 1.5 ? meta.more : v < -1.5 ? meta.less : 'even';
    return v > 3 ? meta.more : v < 1 ? meta.less : 'middling';
  }

  // ------------------------------------------------------------ verification

  /**
   * Rebuild every field from scratch, re-flooding every source. The incremental
   * path is the one the game uses; this exists so a test can prove the two
   * agree, which is the only honest way to trust an incremental update.
   */
  rebuild() {
    for (const c of AXES) this.data[c].fill(0);
    this.mask.fill(FULL_MASK);
    this.climb.fill(0);
    this._occluders.clear();
    this._slopes.clear();
    // Both halves of the graph go back in before anything floods, and for the
    // same reason: a rebuild that forgot the ramps would quietly re-sever every
    // terrace the player had joined, and the only symptom would be the grass.
    for (const p of this.placements) {
      const rec = this._stamped.get(p);
      if (!rec) continue;
      if (rec.mask !== FULL_MASK) this._addOccluder(rec);
      if (rec.climb) this._addConnector(rec);
    }
    this._terrainStale = true;
    for (const p of this.placements) {
      const rec = this._stamped.get(p);
      if (!rec) continue;
      this._flood(rec);
      this._applyStamp(rec, +1);
    }
    this._stats.rebuilds++;
    this.version++;
    this._overlayCache.clear();
  }

  /** Largest absolute disagreement between the live fields and a rebuild. */
  verifyIncremental() {
    const snapshot = {};
    for (const c of AXES) snapshot[c] = Float64Array.from(this.data[c]);
    this.rebuild();
    let worst = 0;
    let axis = null;
    for (const c of AXES) {
      for (let i = 0; i < snapshot[c].length; i++) {
        const d = Math.abs(snapshot[c][i] - this.data[c][i]);
        if (d > worst) {
          worst = d;
          axis = c;
        }
      }
    }
    return { worst, axis };
  }

  // ------------------------------------------------------------ persistence

  /**
   * Only the aged layer, the clock and the terrain need saving — the affinity
   * fields are a pure function of the placements, which the world serialises
   * itself. Levels are saved here too so a garden loads at the height it was
   * left at even if the world module has not yet taken elevation over.
   */
  serialize() {
    return {
      w: this.w,
      h: this.h,
      time: this.time,
      aged: Array.from(this.aged, (v) => Math.round(v * 1000) / 1000),
      levels: Array.from(this.levels),
    };
  }

  hydrate(save) {
    if (!save) return this;
    if (save.w !== this.w || save.h !== this.h) return this;
    this.time = save.time || 0;
    if (Array.isArray(save.aged) && save.aged.length === this.aged.length) {
      this.aged.set(save.aged);
    }
    if (Array.isArray(save.levels) && save.levels.length === this.levels.length) {
      this.setLevels(save.levels, { quiet: true });
      this.rebuild();
    }
    for (const p of this.placements) if (this.isMature(p)) this._maturing.set(p, this.time);
    this._terrainStale = true;
    this.version++;
    this._overlayCache.clear();
    return this;
  }
}

// ---------------------------------------------------------------------------
// Free functions the rest of the game reads
// ---------------------------------------------------------------------------

/**
 * Soft compression to 0..1 for the overlay wash. Signed channels map 0 -> 0.5 so
 * neutral ground reads as "nothing in particular here", which is exactly what a
 * translucent wash should say about untouched turf.
 */
export function normaliseAxis(channel, v) {
  const meta = AXIS_META[channel];
  const k = meta ? meta.k : 5;
  if (meta && meta.signed) return 0.5 + 0.5 * (v / (Math.abs(v) + k));
  const p = Math.max(0, v);
  return p / (p + k);
}

/**
 * The gaussian stamp the old convolution used. Kept exported because the flood
 * decays by exactly this profile in open ground, and a test that wants to check
 * "no hedge, no hill, same numbers as before" needs the reference to hand.
 */
export function gaussianKernel(sigma = SIGMA, radius = KERNEL_RADIUS) {
  const size = radius * 2 + 1;
  const w = new Float64Array(size * size);
  const twoSigmaSq = 2 * sigma * sigma;
  const rSq = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      w[(dy + radius) * size + (dx + radius)] = d2 > rSq ? 0 : Math.exp(-d2 / twoSigmaSq);
    }
  }
  return Object.freeze({ sigma, radius, size, w });
}

/** The contest margin at a given leading score. Exported so a test can pin it. */
export function contestMargin(top) {
  if (!(top > 0)) return 0;
  return Math.min(Math.max(CONTEST_K / top, CONTEST_FLOOR), CONTEST_CAP * top);
}

const EMPTY_SET = new Set();

const NEUTRAL_RESULT = Object.freeze({
  kind: 'neutral', type: 'meadow', owner: null, other: null,
  top: 0, second: 0, strength: 0,
});

// Claimed ground, named three ways: plainly, when it is old, and when it is
// quiet. Vocabulary from docs/DECOR.md and RESEARCH §B so the names teach the
// lore rather than describing a number.
const CLAIMED_NAMES = Object.freeze({
  satyr: Object.freeze({ plain: 'the wild slope', old: 'the old thicket', quiet: 'the hidden hollow' }),
  centaur: Object.freeze({ plain: 'the open run', old: 'the standing timber', quiet: 'the far pasture' }),
  naiad: Object.freeze({ plain: 'the reed bank', old: 'the willow water', quiet: 'the still spring' }),
  unicorn: Object.freeze({ plain: 'the white garden', old: 'the ancient close', quiet: 'the quiet close' }),
});

const CONTESTED_NAMES = Object.freeze({
  'centaur+satyr': 'the wine slope',
  'naiad+satyr': 'the cave spring',
  'satyr+unicorn': 'the blackthorn edge',
  'centaur+naiad': 'the ford',
  'centaur+unicorn': 'the flowering run',
  'naiad+unicorn': 'the lily water',
});

export default Fields;
