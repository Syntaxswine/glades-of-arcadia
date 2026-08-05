// catalog.js — everything the player can put in the glade.
//
// Pure and DOM-free. Imports cleanly in Node.
//
// This file now carries the whole of docs/DECOR.md (Part I, the affinity
// vocabulary; Part II, the decor layer), the connectors and cave mouths of
// docs/ELEVATION.md, and the base ground and water the earlier wave shipped.
// The *content* is derived from docs/RESEARCH.md §B, which is sourced myth
// lore. Where the research flagged something as inference rather than source,
// the blurb says so instead of pretending otherwise. Honesty is cheap and it is
// the more interesting text.
//
// ---------------------------------------------------------------------------
// SHAPE
// ---------------------------------------------------------------------------
//
//   {
//     id, name, group, footprint: [w, h],
//     art: { kind:'grow', composer, params, wanted? }
//        | { kind:'sprite', sprite, wanted? },
//     affinities: { satyr?, centaur?, naiad?, unicorn? },   // docs/ZONING.md
//     zoneClass: 'single'|'dual'|'triple'|'nullifier'|'lean'|'none',
//     register:  'neoclassical' | 'archaic' | null,          // DECOR Part II
//     blocks:    false | true | { gap: true },               // occluder
//     deposits:  { wildness, order, seclusion, moisture, maturity },
//     tags: [...], unlockedBy: null | creatureId, blurb,
//     ground: null | GroundType,   // non-null => this PAINTS tiles, it is not
//                                  // an object. footprint is the brush size.
//     requires: 'land'|'water'|'any',
//     growth: null | { stages, at },   // `at` is garden-days per stage
//     connector: false | true,         // js/world.js connectorSpec()
//     flatFooting: true | false,       // may straddle a step (rubble, ruins)
//     needsDesign: false | true, designNote: null | string,
//   }
//
// ---------------------------------------------------------------------------
// AFFINITIES — docs/ZONING.md and DECOR.md Part I
// ---------------------------------------------------------------------------
//
// Five grass types, four of them owned: thicket (satyr), sward (centaur), fen
// (naiad), millefleurs (unicorn), over a neutral meadow. An object argues for
// whose ground it stands on, and BREADTH COSTS STRENGTH:
//
//     single 1.0   ·   dual 0.7 each   ·   triple 0.5 each
//
// Without that gradient a triple is strictly more efficient than a single and
// the optimal garden is nothing but triples — the "tyranny of the optimal
// layout" the cosy research names. Singles commit ground; pairs and triples are
// border and junction pieces.
//
// NULLIFIERS ARE OCCLUDERS, NOT NEGATIVE DEPOSITS. `blocks: true` means
// influence cannot propagate THROUGH this tile. It does not dig a crater. That
// is what makes a hedge between two rival plantings work, and it is why
// docs/ELEVATION.md can hand the same job to a two-level terrace for free.
//
// THE REGISTER LEAN is the one place a small signed weight appears. DECOR.md
// Part II asks that the player read a region's character off its architecture:
// neoclassical pieces (fluted, symmetrical, clipped, dressed) lean unicorn and
// mildly repel the satyr; archaic pieces (rough, asymmetric, weathered) lean
// satyr and mildly repel the unicorn. The lean is deliberately a THIRD of a
// single, so a colonnade colours a formal garden without ever out-voting the
// three objects that actually commit the ground.
//
// An object that already carries a class weight does not also get the lean —
// its `register` is recorded for the art and the UI, and its zoning is its
// class. Otherwise a neoclassical fountain would quietly out-weigh a single.
//
// ---------------------------------------------------------------------------
// DEPOSITS — the five axes of SPEC §6, retained
// ---------------------------------------------------------------------------
//
// docs/ZONING.md retires `wildness`, `order` and `moisture` as *player-facing*
// axes and keeps `seclusion` and `maturity` as conditions. The full five-vector
// stays on every entry because js/fields.js and js/creatures.js still read it,
// and because grass answers "whose ground is this?" while the axes answer "is
// it ready?". Do not delete them without the owners of those two files.
//
// Note hard that `order` is NOT the inverse of `wildness`. All four quadrants
// are populated on purpose. The rule that keeps them apart: only WORKED
// SURFACES AND BUILT THINGS deposit negative wildness. A cultivated lily is
// still a plant and still growth; it raises order without lowering wildness.
//
// Range is [-3, +3]. A module-load self-check enforces the shape, the axis
// range, unique ids, the affinity vocabulary and the tag vocabulary below — a
// typo is a hard error at import, never a silently dead tag.
//
// ---------------------------------------------------------------------------
// ART: `sprite` is what draws TODAY, `wanted` is what should draw
// ---------------------------------------------------------------------------
//
// Roughly two dozen hard-surface pieces in DECOR.md Part II have no sprite yet.
// Naming a sprite that does not exist would put a red X on the whole tree for
// everybody, so every entry names art that resolves right now and records the
// canonical sprite it is waiting for in `art.wanted`. When the art lands, the
// swap is one identifier per line, and `ART_WISHLIST` is the checklist.
// Nothing is ever unrendered; some things are, for a while, understudies.

// The only import this file has, and it earns it: FACINGS is the ceiling on
// `facings`, and a catalogue carrying its own copy of a geometry constant is
// the class of bug that put MAP_W = 20 in two files. js/iso.js imports nothing,
// so there is no cycle.
import { FACINGS } from './iso.js';

export const GROUPS = Object.freeze([
  'ground',
  'terrain',
  'water',
  'plants',
  'trees',
  'sculpture',
  'structure',
  'decor',
]);

export const AXES = Object.freeze([
  'wildness',
  'order',
  'seclusion',
  'moisture',
  'maturity',
]);

/** The four species that own ground. Pan owns none — he is nobody's zoning. */
export const AFFINITIES = Object.freeze(['satyr', 'centaur', 'naiad', 'unicorn']);

/** Which grass an affinity paints (docs/ZONING.md). */
export const GRASS_FOR = Object.freeze({
  satyr: 'thicket',
  centaur: 'sward',
  naiad: 'fen',
  unicorn: 'millefleurs',
});

/** Breadth costs strength. DECOR.md, "Weights". */
export const WEIGHTS = Object.freeze({
  single: 1.0,
  dual: 0.7,
  triple: 0.5,
  lean: 0.3, // the register lean — a third of a single, on purpose
  repel: -0.15, // the register's mild dislike of its opposite
});

/** Register names, for the UI and for whoever tints the palette buttons. */
export const REGISTERS = Object.freeze(['archaic', 'neoclassical']);

/** Tile ground types. `ground`-painting placeables write one of these. */
export const GROUND_TYPES = Object.freeze([
  'grass', // the default glade floor
  // Mown, level turf. It gets its own type rather than writing 'grass'
  // because the field bridge treats the DEFAULT floor as the baseline and
  // deposits nothing for it — a greensward that painted plain grass carried no
  // tags and no weight, and the naiad's `greensward` requirement, which is on
  // her settles rung, could never fire at all.
  'greensward',
  'meadow', // long, flowering, unmown
  'millefleurs', // dense low mixed planting, no bare soil
  'moss', // old, damp, shaded
  'tilled', // worked rows
  'gravel', // swept walk, and every dressed paving until paving has art
  'rock', // bare stone and scree
  'water', // open water
  'marsh', // shallow, reedy, half-land
]);

/** Ground types an object with `requires:'water'` may stand on. */
export const WET_GROUND = Object.freeze(['water', 'marsh']);

// ---------------------------------------------------------------------------
// THE TAG VOCABULARY
//
// This is the contract between this file and js/creatures.js. A creature's
// `count` requirement ("3 × water-loving within 4 tiles") matches against these
// strings and no others. Using a tag that is not here throws at import, and
// test/catalog.test.mjs asserts in BOTH directions: nothing a creature asks for
// is missing, and nothing declared here is carried by no placeable.
//
// It grew with the decor set, from 52 tags to 84. The discipline is
// unchanged: a tag exists because something asks for it by name, or because it
// is a family a creature could plausibly be told to want. A holly is still
// identified by `tree` + `evergreen` + `fruit`; only species the ancient and
// medieval sources actually name get a species tag of their own.
//
// THREE TAGS ARE LOAD-BEARING ELSEWHERE AND MUST NOT BE REUSED CASUALLY:
// js/world.js reads `connector`, `ramp` and `stair` as signals that an object
// may straddle a change of level. Only the four connectors carry `connector`,
// and `ramp` / `stair` are not in this vocabulary at all.
// ---------------------------------------------------------------------------

export const TAGS = Object.freeze({
  // What kind of thing it physically is.
  form: Object.freeze([
    'tree', 'shrub', 'flower', 'reed', 'groundcover',
    'sculpture', 'stone', 'rock', 'timber', 'fountain',
    'hedge', 'column', 'seat', 'vessel', 'path', 'ornament',
    'topiary', 'arch', 'connector',
  ]),
  // Only the species the ancient and medieval sources name by name.
  species: Object.freeze([
    'pine', 'ash', 'oak', 'plane', 'poplar', 'willow', 'cypress',
    'vine', 'ivy', 'centaury',
    'laurel', 'myrtle', 'apple', 'fig', 'almond', 'thorn',
    'lily', 'rose', 'acanthus', 'box', 'yew',
  ]),
  // How it grows and what it does to the light.
  habit: Object.freeze([
    'broadleaf', 'evergreen', 'shade', 'dense-cover', 'old-growth', 'uncut',
    'fruit', 'white-flower', 'millefleurs', 'physic', 'antidote',
    'blossom', 'aromatic', 'clipped', 'deadwood',
  ]),
  // Water, which the naiad and the unicorn both read and read differently.
  water: Object.freeze([
    'water-loving', 'still-water', 'running-water', 'spring-head', 'marsh',
    'waterfall',
  ]),
  // The character of the place. This family is where the design thesis lives.
  character: Object.freeze([
    'wild', 'tended', 'tilled', 'straight-edge', 'enclosure',
    // A WAY THROUGH one. The pair `enclosure`/`gate` is the same symmetry the
    // design already learned twice — barrier and its doorway, cliff and its
    // ramp — arriving a third time, and a tag makes it findable: a player who
    // has built a wall can be shown the ways through it.
    'gate',
    'open-ground', 'greensward', 'quiet', 'traffic',
    'nullifier', 'archaic', 'neoclassical', 'ruin', 'dressed-stone',
  ]),
  // Cult, myth and furniture.
  //
  // `tomb` is load-bearing in three places and must not be given to anything
  // that is not one of docs/TOMBS.md's five: it is how the tending pass finds
  // graves in the field's placement list, how the UI knows to look for an
  // epitaph, and how the hidden Arcadian tomb's unlock rule counts the tombs
  // that have stood a while. See TOMBS below.
  cult: Object.freeze([
    'dionysiac', 'wine', 'votive', 'syrinx', 'maiden', 'cave', 'grotto', 'tomb',
  ]),
  // Elevation — docs/ELEVATION.md.
  terrain: Object.freeze([
    'cliff', 'terrace',
  ]),
});

/** Every legal tag, flat. */
export const ALL_TAGS = Object.freeze(
  [...new Set(Object.values(TAGS).flat())].sort()
);

// ---------------------------------------------------------------------------
// Authoring helpers
// ---------------------------------------------------------------------------

/** Fill the five axes so every placeable carries a complete deposit vector. */
function dep(partial) {
  const out = {};
  for (const axis of AXES) out[axis] = partial[axis] || 0;
  return Object.freeze(out);
}

const zone = (cls, aff) => Object.freeze({ cls, aff: Object.freeze(aff || {}) });

/** One species, full strength. This is how the player COMMITS ground. */
const S1 = (a) => zone('single', { [a]: WEIGHTS.single });
/** A border piece: two species at 0.7 each. */
const D2 = (a, b) => zone('dual', { [a]: WEIGHTS.dual, [b]: WEIGHTS.dual });
/** A junction piece: three species at 0.5 each. Permanently ambiguous alone. */
const T3 = (a, b, c) =>
  zone('triple', { [a]: WEIGHTS.triple, [b]: WEIGHTS.triple, [c]: WEIGHTS.triple });
/** An occluder. Emits nothing; blocks propagation through its tiles. */
const NULLIFIER = zone('nullifier', {});
/** Furniture. Does nothing at all, which is the point of the decor layer. */
const NONE = zone('none', {});
/** A light species lean that is not a commitment — used sparingly. */
const LEAN = (aff) => zone('lean', aff);
/** The two registers, as zoning. Fluted and clipped, or rough and weathered. */
const NEO = zone('lean', { unicorn: WEIGHTS.lean, satyr: WEIGHTS.repel });
const ARCH = zone('lean', { satyr: WEIGHTS.lean, unicorn: WEIGHTS.repel });

/** Standard growth ladders, in garden-days. See js/world.js DAY_MS. */
const GROWS = {
  tree: Object.freeze({ stages: ['sprout', 'young', 'mature'], at: [0, 2, 9] }),
  slowTree: Object.freeze({ stages: ['sprout', 'young', 'mature'], at: [0, 3, 14] }),
  shrub: Object.freeze({ stages: ['sprout', 'young', 'mature'], at: [0, 1, 5] }),
  herb: Object.freeze({ stages: ['sprout', 'young', 'mature'], at: [0, 1, 3] }),
};

const grow = (composer, params, wanted) =>
  Object.freeze({ kind: 'grow', composer, params: Object.freeze(params), wanted: wanted || null });
const sprite = (name, wanted) =>
  Object.freeze({ kind: 'sprite', sprite: name, wanted: wanted || null });

// ---------------------------------------------------------------------------
// GROUND — 12. These paint tiles; `footprint` is the brush.
// ---------------------------------------------------------------------------

const GROUND = [
  {
    id: 'meadow-turf',
    name: 'Meadow turf',
    group: 'ground',
    footprint: [2, 2],
    ground: 'meadow',
    art: sprite('meadow-a'),
    zone: NONE,
    deposits: dep({ wildness: 2, moisture: 1 }),
    tags: ['groundcover', 'wild', 'open-ground'],
    unlockedBy: null,
    blurb: 'Long grass left to seed, with whatever chose to flower in it. Nobody has cut this since spring.',
  },
  {
    id: 'greensward',
    name: 'Level greensward',
    group: 'ground',
    footprint: [2, 2],
    ground: 'greensward',
    art: sprite('grass-a'),
    zone: LEAN({ centaur: WEIGHTS.lean, naiad: WEIGHTS.lean }),
    deposits: dep({ order: 2, wildness: -1 }),
    tags: ['groundcover', 'greensward', 'open-ground', 'tended'],
    unlockedBy: null,
    blurb: 'Flat, short, and kept that way. Callimachus puts the nymphs dancing on ground like this at noon, and a horse-bodied thing can get up to speed on it.',
  },
  {
    id: 'millefleurs-turf',
    name: 'Millefleurs turf',
    group: 'ground',
    footprint: [1, 1],
    ground: 'millefleurs',
    art: sprite('meadow-c'),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ order: 2, wildness: 1, maturity: 1 }),
    tags: ['groundcover', 'millefleurs', 'flower', 'white-flower', 'tended'],
    unlockedBy: null,
    blurb: 'A hundred small plants packed shoulder to shoulder with no bare soil showing — the tapestry ground, and a made thing despite how wild it looks.',
  },
  {
    id: 'flowering-run',
    name: 'Flowering meadow run',
    group: 'ground',
    footprint: [2, 2],
    ground: 'meadow',
    art: sprite('meadow-b'),
    zone: D2('centaur', 'unicorn'),
    deposits: dep({ wildness: 1, order: 1, moisture: 1, maturity: 1 }),
    tags: ['groundcover', 'flower', 'open-ground', 'millefleurs'],
    unlockedBy: null,
    blurb: 'Open ground gone knee-deep in flowers, with nothing in the way for a hundred paces. Both the horned things want this, for opposite reasons: one to run on, one to stand quietly in.',
  },
  {
    id: 'mossy-ground',
    name: 'Mossy ground',
    group: 'ground',
    footprint: [1, 1],
    ground: 'moss',
    art: sprite('moss-a'),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    deposits: dep({ maturity: 2, moisture: 1, seclusion: 1, wildness: 1 }),
    tags: ['groundcover', 'shade', 'old-growth', 'quiet'],
    unlockedBy: null,
    blurb: 'Damp green velvet in the shade of something older. Moss is how a glade tells you how long it has been left alone.',
  },
  {
    id: 'tilled-rows',
    name: 'Tilled rows',
    group: 'ground',
    footprint: [1, 2],
    ground: 'tilled',
    art: sprite('earth-b'),
    zone: LEAN({ satyr: WEIGHTS.repel }),
    deposits: dep({ order: 3, wildness: -2 }),
    tags: ['tilled', 'straight-edge'],
    unlockedBy: null,
    blurb: 'Turned soil in straight lines. Useful, orderly — and the plainest way in the game to tell a satyr he is not wanted here.',
  },
  {
    id: 'gravel-walk',
    name: 'Gravel walk',
    group: 'ground',
    footprint: [1, 1],
    ground: 'gravel',
    art: sprite('gravel-a'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ order: 3, wildness: -2, seclusion: -1 }),
    tags: ['straight-edge', 'tended', 'traffic', 'path', 'nullifier', 'neoclassical'],
    unlockedBy: null,
    blurb: 'Swept pale grit that crunches underfoot. Nothing grows on it and nothing crosses it — which players discover by accident, laying a path for their own reasons and finding it has quietly divided the garden.',
  },
  {
    id: 'flagstone',
    name: 'Flagstone',
    group: 'ground',
    footprint: [2, 2],
    ground: 'gravel',
    art: sprite('flagstone-a', 'flagstone-dressed'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, wildness: -1, seclusion: -1 }),
    tags: ['path', 'tended', 'dressed-stone', 'neoclassical', 'straight-edge'],
    unlockedBy: null,
    blurb: 'Big cut slabs laid close, with moss finding the joints within a year. Unlike the gravel walk it does not break influence — it is a floor, not a border.',
  },
  {
    id: 'terrace-paving',
    name: 'Terrace paving',
    group: 'ground',
    footprint: [2, 2],
    ground: 'gravel',
    art: sprite('flagstone-b', 'terrace-paving-edged'),
    zone: NEO,
    register: 'neoclassical',
    needsDesign: true,
    designNote:
      'Paving with a moulded EDGE. The edge belongs to whichever tiles sit at the lip of a terrace, so it is a function of the neighbourhood, not of the brush — it wants the same auto-edging pass the shoreline already has, keyed on level difference rather than on wet/dry. Ships as plain paving.',
    deposits: dep({ order: 3, wildness: -1 }),
    tags: ['path', 'tended', 'dressed-stone', 'neoclassical', 'terrace'],
    unlockedBy: null,
    blurb: 'Dressed slabs for the flat top of a terrace, meant to finish at a moulded edge above the drop. For now it lies flat and the edge is imaginary.',
  },
  {
    id: 'stepping-stones',
    name: 'Stepping stones',
    group: 'ground',
    footprint: [1, 1],
    art: sprite('stepping-stones'),
    zone: ARCH,
    register: 'archaic',
    flatFooting: false,
    // A CROSSING MUST BE ALLOWED TO STAND IN THE WATER IT CROSSES. Without a
    // `ground` key this defaulted to requires:'land' (see normalise, below),
    // which refused it on water in both directions — you could not set stones
    // in a pond, and you could not paint a pond under stones already laid.
    // That made its own blurb ("or shallow water") a lie, and left the
    // per-species ford rule in js/main.js with one working crossing out of
    // three. See `crossing: true`.
    requires: 'any',
    crossing: true,
    deposits: dep({ order: 1, wildness: 1, moisture: 1 }),
    tags: ['path', 'stone', 'archaic', 'traffic'],
    unlockedBy: null,
    blurb: 'Flat rocks set a stride apart through wet grass or shallow water. A path that admits it is only a suggestion.',
  },
  {
    id: 'mosaic-panel',
    name: 'Mosaic panel',
    group: 'ground',
    footprint: [2, 2],
    art: sprite('mosaic-panel'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1, wildness: -1 }),
    tags: ['path', 'tended', 'dressed-stone', 'neoclassical', 'ornament'],
    unlockedBy: null,
    blurb: 'A panel of small tesserae — a wave-scroll border round a fish, or a jug, or somebody\'s dog. Laid into a floor it says a building stood here, whether or not one ever did.',
  },
  {
    id: 'stony-scree',
    name: 'Stony scree',
    group: 'ground',
    footprint: [2, 2],
    ground: 'rock',
    art: sprite('gravel-c'),
    zone: NONE,
    flatFooting: false,
    deposits: dep({ order: -1, moisture: -1 }),
    tags: ['rock', 'open-ground'],
    unlockedBy: null,
    blurb: 'Loose broken stone on a dry slope. Nothing tends it and nothing much grows — the quiet corner of the map that is neither wild nor kept.',
  },
];

// ---------------------------------------------------------------------------
// TERRAIN — 9. Elevation furniture: the connectors, the cliff pieces, the fall.
// docs/ELEVATION.md. The four connectors carry `connector: true` AND the tag,
// AND the ids js/world.js already recognises, because that file went out of its
// way to accept any of the three signals and it costs nothing to send all of
// them.
// ---------------------------------------------------------------------------

const TERRAIN = [
  {
    id: 'earth-ramp',
    name: 'Earth ramp',
    group: 'terrain',
    footprint: [1, 1],
    art: sprite('earth-ramp'),
    zone: ARCH,
    register: 'archaic',
    connector: true,
    flatFooting: false,
    deposits: dep({ wildness: 1, order: 1, seclusion: -1 }),
    tags: ['connector', 'path', 'archaic', 'terrace', 'traffic'],
    unlockedBy: null,
    blurb: 'A slope of trodden earth cut into the step, one level up over one tile. The cheapest way up a terrace and the one that looks like the hill agreed to it.',
  },
  {
    id: 'stone-stair',
    name: 'Stone stair',
    group: 'terrain',
    footprint: [1, 1],
    art: sprite('stone-stair'),
    zone: NEO,
    register: 'neoclassical',
    connector: true,
    flatFooting: false,
    deposits: dep({ order: 3, wildness: -1, seclusion: -1 }),
    tags: ['connector', 'path', 'dressed-stone', 'neoclassical', 'terrace', 'traffic'],
    unlockedBy: null,
    blurb: 'Six dressed steps with a moulded nosing, rising exactly one level. Stairs are where a garden stops pretending it grew and admits somebody laid it out.',
  },
  {
    id: 'rock-scramble',
    name: 'Rock scramble',
    group: 'terrain',
    footprint: [1, 1],
    art: sprite('rock-scramble'),
    zone: ARCH,
    register: 'archaic',
    connector: true,
    flatFooting: false,
    deposits: dep({ wildness: 3, order: -2, seclusion: 1 }),
    tags: ['connector', 'rock', 'wild', 'archaic', 'terrace'],
    unlockedBy: null,
    blurb: 'Tumbled blocks you go up on your hands as much as your feet. It is a way up without being a path, which is exactly the distinction a satyr cares about.',
  },
  {
    id: 'stepped-terrace-wall',
    name: 'Stepped terrace wall',
    group: 'terrain',
    footprint: [1, 1],
    art: sprite('terrace-wall-stepped'),
    zone: NEO,
    register: 'neoclassical',
    connector: true,
    flatFooting: false,
    deposits: dep({ order: 3, maturity: 1, wildness: -1, seclusion: 1 }),
    tags: ['connector', 'stone', 'dressed-stone', 'neoclassical', 'terrace', 'straight-edge'],
    unlockedBy: null,
    blurb: 'A retaining wall holding the bank up, with a flight built into its face. It does the terrace\'s work and the stair\'s work in one object — and note that it does NOT block influence, because a way through is still a way through.',
  },
  {
    id: 'cave-mouth',
    name: 'Cave mouth',
    group: 'terrain',
    footprint: [2, 1],
    art: sprite('cave-mouth'),
    zone: D2('satyr', 'naiad'),
    register: 'archaic',
    needsDesign: true,
    designNote:
      'Wants to be SET INTO an exposed cliff face (ELEVATION.md), but "must abut a face at least one level higher" has no expression in the requires vocabulary (land|water|any) that js/world.js validates. Ships placeable on flat ground; the rule wants either a new requires value agreed with world.js, or a soft placement hint the ghost preview can colour.',
    deposits: dep({ seclusion: 3, wildness: 2, maturity: 1, order: -1 }),
    tags: ['cave', 'rock', 'dense-cover', 'wild', 'cliff', 'archaic'],
    unlockedBy: null,
    blurb: 'A dark opening in the hillside with cool air coming out of it. The Hymn to Aphrodite puts silenoi and nymphs together in the depths of pleasant caves — this is the one object both of them are named in.',
  },
  {
    id: 'chirons-cave',
    name: 'Wooded hillside cave',
    group: 'terrain',
    footprint: [2, 1],
    art: sprite('cave-mouth', 'cave-mouth-wooded'),
    zone: LEAN({ centaur: WEIGHTS.lean }),
    register: 'archaic',
    deposits: dep({ seclusion: 3, maturity: 2, wildness: 1 }),
    tags: ['cave', 'rock', 'quiet', 'cliff', 'archaic', 'shade'],
    unlockedBy: 'centaur',
    blurb: 'A cave under trees, swept, with a worn threshold. Chiron kept house in one of these on Pelion and taught in it; the tutelage is sourced, the furniture is not.',
  },
  {
    id: 'rock-outcrop',
    name: 'Rock outcrop',
    group: 'terrain',
    footprint: [2, 2],
    art: sprite('gravel-c', 'rock-outcrop'),
    zone: ARCH,
    register: 'archaic',
    flatFooting: false,
    deposits: dep({ wildness: 2, order: -1, seclusion: 1, moisture: -1 }),
    tags: ['rock', 'wild', 'cliff', 'archaic', 'open-ground'],
    unlockedBy: null,
    blurb: 'Bedrock breaking through the turf in weathered grey steps. Put it at the top of a bank and the whole terrace stops looking like it was built and starts looking like it was found.',
  },
  {
    id: 'cascade-head',
    name: 'Cascade head',
    group: 'terrain',
    footprint: [1, 1],
    requires: 'land',
    art: sprite('spring-head', 'cascade-lip'),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    register: 'archaic',
    deposits: dep({ moisture: 3, wildness: 2, seclusion: 1, maturity: 1 }),
    tags: ['spring-head', 'running-water', 'waterfall', 'rock', 'cliff', 'wild'],
    unlockedBy: null,
    blurb: 'A worn stone lip for water to leave a terrace over. The fall itself is not an object — water beside a drop simply falls, and four levels of it is a thing to build a whole garden around.',
  },
  {
    id: 'plunge-pool',
    name: 'Plunge pool',
    group: 'terrain',
    footprint: [2, 2],
    ground: 'water',
    art: sprite('water-a', 'plunge-pool'),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    deposits: dep({ moisture: 3, wildness: 2, seclusion: 2 }),
    tags: ['still-water', 'waterfall', 'rock', 'wild', 'quiet'],
    unlockedBy: 'naiad',
    blurb: 'The deep dark basin a fall digs for itself, with foam turning slowly at one end. Cold enough that you can feel it from the bank.',
  },
];

// ---------------------------------------------------------------------------
// WATER — 15. Bodies, springs, and the tended fountains of DECOR Part II.
// Every fountain carries water, so it leans naiad; being dressed and
// symmetrical it also leans unicorn. Two of the four species, from one object,
// honestly — so the fountains are duals, not leans.
// ---------------------------------------------------------------------------

const WATER = [
  {
    id: 'still-pool',
    name: 'Still pool',
    group: 'water',
    footprint: [2, 2],
    ground: 'water',
    art: sprite('water-a'),
    zone: S1('unicorn'),
    deposits: dep({ moisture: 3, seclusion: 1, order: 1 }),
    tags: ['still-water', 'quiet'],
    unlockedBy: null,
    blurb: 'Water with nowhere to go, holding the sky. A pool this quiet shows you what is standing at its edge, which is most of why the white beast will come to one.',
  },
  {
    id: 'lily-pool',
    name: 'Lily pool',
    group: 'water',
    footprint: [2, 2],
    ground: 'water',
    art: sprite('lily-pool'),
    zone: D2('naiad', 'unicorn'),
    deposits: dep({ moisture: 3, order: 2, seclusion: 1, maturity: 1 }),
    tags: ['still-water', 'flower', 'white-flower', 'quiet', 'tended'],
    unlockedBy: null,
    blurb: 'A clean-edged pool with lily plates across half of it. The alicorn legend is exactly this water: the horn goes in and whatever was in it stops being poison.',
  },
  {
    id: 'brook',
    name: 'Brook',
    group: 'water',
    footprint: [1, 1],
    ground: 'water',
    art: sprite('shore-10'),
    zone: NONE, // plain moving water — the spring-head is the naiad's object
    deposits: dep({ moisture: 3, wildness: 1 }),
    tags: ['running-water'],
    unlockedBy: null,
    blurb: 'A thread of moving water finding its own line downhill. Lay it a tile at a time and let it wander.',
  },
  {
    id: 'marsh-shallows',
    name: 'Marsh shallows',
    group: 'water',
    footprint: [2, 2],
    ground: 'marsh',
    art: sprite('shore-7'),
    zone: LEAN({ naiad: WEIGHTS.lean, satyr: WEIGHTS.lean }),
    deposits: dep({ moisture: 3, wildness: 2, seclusion: 1, order: -1 }),
    tags: ['marsh', 'still-water', 'dense-cover', 'wild'],
    unlockedBy: null,
    blurb: 'Neither ground nor open water. The Greeks had a separate word for the nymphs of these — heleionomoi, the marsh-dwellers.',
  },
  {
    id: 'spring-head',
    name: 'Spring-head and basin',
    group: 'water',
    footprint: [1, 1],
    requires: 'land',
    art: sprite('spring-head'),
    zone: S1('naiad'),
    deposits: dep({ moisture: 3, seclusion: 1, maturity: 1, wildness: 1 }),
    tags: ['spring-head', 'running-water', 'stone'],
    unlockedBy: null,
    blurb: 'The place where the water actually comes out of the ground, caught in a cut stone bowl and left visible. A naiad attaches herself to one particular water, and this is how she can tell which.',
  },
  {
    id: 'rock-plunge',
    name: 'Unbasined spring',
    group: 'water',
    footprint: [1, 1],
    requires: 'land',
    art: sprite('unbasined-spring'),
    zone: D2('satyr', 'naiad'),
    register: 'archaic',
    deposits: dep({ moisture: 3, wildness: 3, seclusion: 1, order: -2 }),
    tags: ['spring-head', 'running-water', 'rock', 'wild', 'archaic'],
    unlockedBy: null,
    blurb: 'Cold water spilling straight off a rock lip into a hollow it dug itself. No masonry, no basin — the soft streams the Hymn to Pan puts on the mountain, and the sacred fountains the Cyclops chorus misses.',
  },
  {
    id: 'rocky-ford',
    name: 'Rocky ford',
    group: 'water',
    footprint: [2, 1],
    ground: 'water',
    art: sprite('rocky-ford'),
    zone: D2('centaur', 'naiad'),
    register: 'archaic',
    // The one crossing that was already placeable on water, because `ground`
    // makes requires default to 'any'. Declared anyway so all three say so.
    crossing: true,
    deposits: dep({ moisture: 2, wildness: 2, order: -1 }),
    tags: ['running-water', 'rock', 'open-ground', 'traffic', 'archaic'],
    unlockedBy: null,
    blurb: 'Where the run meets the water and the water is shallow enough to cross at speed. Pelion is full of these; the sources give the terrain, not the ford, so read it as landscape rather than lore.',
  },
  {
    id: 'watering-place',
    name: 'Clear watering place',
    group: 'water',
    footprint: [2, 2],
    ground: 'water',
    art: sprite('watering-place'),
    zone: T3('centaur', 'naiad', 'unicorn'),
    deposits: dep({ moisture: 3, order: 2, maturity: 1, seclusion: 1 }),
    tags: ['still-water', 'running-water', 'tended', 'open-ground', 'quiet'],
    unlockedBy: null,
    blurb: 'A clean shelving edge where anything can come down and drink without slipping. The civil three all use it; the satyr finds it much too well kept.',
  },
  {
    id: 'water-lilies',
    name: 'Water lilies',
    group: 'water',
    footprint: [1, 1],
    requires: 'water',
    art: grow('flowerPatch', { bloom: 'white', w: 30, h: 13, density: 0.5 }),
    zone: LEAN({ unicorn: WEIGHTS.lean, naiad: WEIGHTS.lean }),
    deposits: dep({ moisture: 1, order: 1, wildness: 1, seclusion: 1, maturity: 1 }),
    tags: ['still-water', 'flower', 'white-flower', 'quiet'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Flat green plates and a white cup or two. They will only sit on water that has stopped moving.',
  },
  {
    id: 'stone-fountain',
    name: 'Tapestry fountain',
    group: 'water',
    footprint: [1, 1],
    art: sprite('stone-basin'),
    zone: LEAN({ naiad: WEIGHTS.lean, unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ moisture: 3, order: 3, maturity: 1 }),
    tags: ['fountain', 'stone', 'running-water', 'tended', 'dressed-stone', 'neoclassical'],
    unlockedBy: null,
    blurb: 'Clean cut white stone with a spout and an outflow running away into a stream. This is the fountain of The Unicorn Purifies Water, with the antidote herbs planted round it.',
  },
  {
    id: 'tiered-fountain',
    name: 'Tiered fountain',
    group: 'water',
    footprint: [2, 2],
    art: sprite('fountain-tiered'),
    zone: LEAN({ naiad: WEIGHTS.lean, unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ moisture: 3, order: 3, maturity: 1, seclusion: -1 }),
    tags: ['fountain', 'running-water', 'dressed-stone', 'neoclassical', 'tended', 'traffic'],
    unlockedBy: null,
    blurb: 'Two dishes on a baluster stem, the upper one overflowing into the lower all day. The most symmetrical object you can put in a garden and still call it water.',
  },
  {
    id: 'wall-fountain',
    name: 'Wall fountain',
    group: 'water',
    footprint: [1, 1],
    art: sprite('wall-fountain'),
    zone: LEAN({ naiad: WEIGHTS.lean, unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ moisture: 2, order: 3, seclusion: 1 }),
    tags: ['fountain', 'running-water', 'dressed-stone', 'neoclassical', 'sculpture'],
    unlockedBy: null,
    blurb: 'A carved face in a panel with water falling from its open mouth into a trough. The mascaron is a grotesque on purpose — decorum in the stonework, mischief in the spout.',
  },
  {
    id: 'jet-basin',
    name: 'Simple jet basin',
    group: 'water',
    footprint: [1, 1],
    art: sprite('stone-basin', 'fountain-jet'),
    zone: LEAN({ naiad: WEIGHTS.lean, unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ moisture: 2, order: 2 }),
    tags: ['fountain', 'running-water', 'dressed-stone', 'neoclassical', 'tended'],
    unlockedBy: null,
    blurb: 'A plain round bowl and a single jet about as high as your knee. It is the quietest fountain in the set and the easiest to put anywhere.',
  },
  {
    id: 'shell-fountain',
    name: 'Shell fountain',
    group: 'water',
    footprint: [1, 1],
    art: sprite('shell-fountain'),
    zone: LEAN({ naiad: WEIGHTS.lean, unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ moisture: 2, order: 3, maturity: 1 }),
    tags: ['fountain', 'running-water', 'dressed-stone', 'neoclassical', 'ornament'],
    unlockedBy: 'naiad',
    blurb: 'A fluted scallop held up on a little pedestal, water sliding over the rim in a sheet. Shells belong to sea nymphs rather than fresh-water ones, so this one is decoration, not doctrine.',
  },
  {
    id: 'rill',
    name: 'Rill',
    group: 'water',
    footprint: [1, 1],
    ground: 'water',
    art: sprite('rill'),
    zone: LEAN({ naiad: WEIGHTS.lean, unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    needsDesign: true,
    designNote:
      'A rill is a RUN, not a tile: it wants straight/corner/junction/end pieces chosen from its neighbours, the way the shoreline set already picks shore-0..15 from adjacency. Ships as a one-tile channel painting plain water, so a line of them reads as a stripe rather than as a dressed channel with kerbs.',
    deposits: dep({ moisture: 2, order: 3, wildness: -1 }),
    tags: ['running-water', 'dressed-stone', 'neoclassical', 'straight-edge', 'tended'],
    unlockedBy: null,
    blurb: 'A narrow straight channel of water in a cut stone kerb, running dead level for as far as you lay it. The signature move of a formal garden, and the only water in the game with a ruled edge.',
  },
];

// ---------------------------------------------------------------------------
// PLANTS — 32. The largest group, as the spec asks. Mostly procedural.
// ---------------------------------------------------------------------------

const PLANTS = [
  {
    id: 'wild-vine',
    name: 'Wild vine',
    group: 'plants',
    footprint: [1, 1],
    art: grow('vine', {}),
    zone: S1('satyr'),
    register: 'archaic',
    deposits: dep({ wildness: 3, maturity: 1, order: -1, seclusion: 1 }),
    tags: ['vine', 'wild', 'dionysiac', 'fruit', 'dense-cover', 'archaic'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Untrellised grape hauling itself up whatever stands still. In Euripides a land with no vine is a land with no satyrs — this is the one plant they cannot do without.',
  },
  {
    id: 'ivy-boulder',
    name: 'Ivy-draped boulder',
    group: 'plants',
    footprint: [1, 1],
    art: sprite('ivy-boulder'),
    zone: S1('satyr'),
    register: 'archaic',
    flatFooting: false,
    deposits: dep({ wildness: 3, maturity: 2, seclusion: 1 }),
    tags: ['ivy', 'rock', 'evergreen', 'dionysiac', 'dense-cover', 'wild', 'archaic'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'A boulder gone completely under dark ivy, so it reads as a green lump with a stone shoulder. Ivy is the wreath and the thyrsos-wrapping both, and it makes a rock look like it has been there for ever.',
  },
  {
    id: 'ivy-drape',
    name: 'Ivy',
    group: 'plants',
    footprint: [1, 1],
    art: grow('ivy', { drape: 'ground' }),
    zone: LEAN({ satyr: WEIGHTS.lean }),
    deposits: dep({ wildness: 2, maturity: 2, seclusion: 1 }),
    tags: ['ivy', 'groundcover', 'evergreen', 'dionysiac', 'shade', 'dense-cover'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Dark evergreen creeping over rock and up bark. Plain ground ivy, spreading where nothing else wants to be, and it makes a place look older than it is.',
  },
  {
    id: 'blackthorn-thicket',
    name: 'Blackthorn thicket',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'scrub', w: 28, h: 26 }, 'blackthorn'),
    zone: D2('satyr', 'unicorn'),
    deposits: dep({ wildness: 3, order: -1, seclusion: 2, maturity: 1 }),
    tags: ['shrub', 'thorn', 'white-flower', 'wild', 'dense-cover', 'blossom'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Black spiny suckering scrub that flowers white on bare wood before a single leaf shows. Wild and white at once — the only register where mess and purity agree about anything.',
  },
  {
    id: 'white-thorn',
    name: 'White-blossom thorn',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'leaf', w: 30, h: 30 }, 'hawthorn'),
    zone: S1('unicorn'),
    deposits: dep({ order: 2, wildness: 1, seclusion: 1, maturity: 1 }),
    tags: ['shrub', 'thorn', 'white-flower', 'blossom', 'tended', 'quiet'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'A single hawthorn kept to one clean stem, smothered in white for two weeks in May. Thorn and blossom on the same branch is the whole medieval idea in one plant.',
  },
  {
    id: 'laurel-thicket',
    name: 'Laurel thicket',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'leaf' }),
    zone: LEAN({ satyr: WEIGHTS.lean }),
    deposits: dep({ wildness: 2, seclusion: 2, maturity: 1 }),
    tags: ['shrub', 'laurel', 'evergreen', 'dense-cover', 'shade'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Glossy dark leaves in a mass you cannot see through. The Hymn to Pan wreathes its wooded coombes in exactly this and ivy.',
  },
  {
    id: 'bramble-tangle',
    name: 'Bramble tangle',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'scrub', w: 30, h: 20 }),
    zone: LEAN({ satyr: WEIGHTS.lean }),
    register: 'archaic',
    deposits: dep({ wildness: 3, order: -2, seclusion: 2 }),
    tags: ['shrub', 'wild', 'dense-cover', 'fruit', 'thorn', 'archaic'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Thorny arching canes going wherever they like. Awkward to walk through, which is exactly why small shy things live in it.',
  },
  {
    id: 'broom-scrub',
    name: 'Broom scrub',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'scrub', w: 22, h: 24 }),
    zone: NONE,
    deposits: dep({ wildness: 2, moisture: -1 }),
    tags: ['shrub', 'wild', 'open-ground'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Wiry green stems that go entirely yellow for a few weeks and then think better of it. Dry hillside stuff.',
  },
  {
    id: 'fern-bank',
    name: 'Fern bank',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'fern' }),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    deposits: dep({ moisture: 2, seclusion: 1, maturity: 1, wildness: 1 }),
    tags: ['groundcover', 'shade', 'water-loving', 'dense-cover'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Fronds unrolling in the damp shade under something bigger. Ferns tell you a corner stays wet and stays dark.',
  },
  {
    id: 'reed-bed',
    name: 'Reed bed',
    group: 'plants',
    footprint: [1, 1],
    art: grow('reeds', {}),
    zone: S1('naiad'),
    deposits: dep({ moisture: 2, wildness: 1, seclusion: 2 }),
    tags: ['reed', 'water-loving', 'dense-cover', 'marsh'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Tall green blades that hiss at any wind at all. They screen the water without hiding it, which is what a shy resident wants.',
  },
  {
    id: 'iris-clump',
    name: 'Yellow iris',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'iris', w: 26, h: 20 }),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    deposits: dep({ moisture: 2, order: 1, wildness: 1 }),
    tags: ['flower', 'reed', 'water-loving'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Sword leaves and a brief, absurd yellow flag. It grows with its feet in the shallows and asks nothing else.',
  },
  {
    id: 'watercress',
    name: 'Watercress',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'white', w: 24, h: 12, density: 0.4 }),
    zone: NONE, // the spring pairing is a gardener's inference; it zones nothing
    deposits: dep({ moisture: 2, order: 1 }),
    tags: ['groundcover', 'water-loving', 'tended'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Dark peppery leaves matting a cool spring lip. It looks right at a spring-head, though no ancient source asks for it — that pairing is a gardener\'s guess, not lore.',
  },
  {
    id: 'narcissus',
    name: 'Narcissus',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'white' }),
    zone: NONE, // Ovidian and about a boy, not naiad cult — pretty, not partisan
    deposits: dep({ moisture: 1, order: 1, seclusion: 1 }),
    tags: ['flower', 'white-flower', 'water-loving', 'quiet'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Pale trumpets leaning over their own reflection. The famous story is Ovid\'s and it is about a boy, not about nymph cult — plant it because it is beautiful at a water\'s edge.',
  },
  {
    id: 'centaury-bed',
    name: 'Physic bed of centaury',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'red' }),
    zone: S1('centaur'),
    deposits: dep({ order: 2, wildness: 1, maturity: 1 }),
    tags: ['flower', 'centaury', 'physic', 'tended'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Small starry pink flowers on a bitter medicinal herb, laid out in a worked bed. It carries Chiron\'s name — the genus was once Chironia — and Pliny lists it among the cures ascribed to him.',
  },
  {
    id: 'mountain-herbs',
    name: 'Mountain herbs',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'scrub', w: 20, h: 13 }),
    zone: LEAN({ centaur: WEIGHTS.lean }),
    deposits: dep({ wildness: 2, moisture: -1 }),
    tags: ['groundcover', 'physic', 'wild', 'open-ground', 'aromatic'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Thyme, oregano and savory in grey-green cushions, growing where the soil is thin. Pelion was famous for its herbs before it was famous for its centaurs.',
  },
  {
    id: 'sage-bed',
    name: 'Sage',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'scrub', w: 24, h: 16 }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 2, wildness: 1, moisture: -1, maturity: 1 }),
    tags: ['shrub', 'physic', 'antidote', 'tended', 'aromatic'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Soft grey leaves that smell of a warm kitchen. The Cloisters tapestry puts sage right at the poisoned stream, and the Met reads it as an antidote herb placed exactly where the poison is.',
  },
  {
    id: 'pot-marigold',
    name: 'Pot marigold',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'yellow' }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 2, wildness: 1 }),
    tags: ['flower', 'physic', 'antidote', 'tended'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Flat orange daisies that open with the sun and shut when it rains. The other antidote plant at the tapestry fountain, and cheerful out of all proportion to its job.',
  },
  {
    id: 'madonna-lily',
    name: 'White lily bed',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'white', w: 24, h: 24 }),
    zone: S1('unicorn'),
    deposits: dep({ order: 2, seclusion: 1 }),
    tags: ['flower', 'lily', 'white-flower', 'tended', 'quiet', 'millefleurs'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Tall white trumpets on bare stems, planted in a block, the plainest possible statement of purity. Named among the species in The Unicorn Rests in a Garden.',
  },
  {
    id: 'lily-of-the-valley',
    name: 'Lily of the valley',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'white', w: 28, h: 12 }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 1, wildness: 1, seclusion: 1, moisture: 1, maturity: 1 }),
    tags: ['flower', 'lily', 'white-flower', 'millefleurs', 'shade', 'groundcover'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Rows of small white bells under broad leaves, in the shade and spreading quietly. One of the millefleurs ground plants of the Cluny hangings.',
  },
  {
    id: 'wild-orchid',
    name: 'Wild orchid',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'iris', w: 22, h: 16 }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 1, wildness: 1, seclusion: 1, maturity: 2 }),
    tags: ['flower', 'millefleurs', 'quiet', 'old-growth'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'A short spike of improbable purple hoods. Orchids arrive on their own terms and only in ground that has been undisturbed a long while.',
  },
  {
    id: 'thistle',
    name: 'Thistle',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'iris', ramp: 'olive', w: 22, h: 18 }),
    zone: NONE,
    deposits: dep({ wildness: 2, order: -1 }),
    tags: ['flower', 'wild', 'open-ground', 'thorn'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Grey spines and a purple tuft. It is both a weed of rough ground and a named plant of the unicorn tapestries, which is a fair summary of thistles.',
  },
  {
    id: 'wild-strawberry',
    name: 'Wild strawberry',
    group: 'plants',
    footprint: [1, 1],
    art: grow('ivy', { drape: 'ground', w: 26, h: 12 }, 'wild-strawberry'),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 1, wildness: 1, maturity: 1 }),
    tags: ['flower', 'groundcover', 'millefleurs', 'fruit', 'white-flower'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Runners, small white flowers and berries the size of a fingernail. It creeps between everything else and is named in the tapestry planting.',
  },
  {
    id: 'rose',
    name: 'Rose',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'leaf', w: 26, h: 22 }, 'rose'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 2, wildness: 1, maturity: 1 }),
    tags: ['shrub', 'rose', 'flower', 'thorn', 'tended', 'blossom'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'An old shrub rose, loose-petalled and heavily scented, that flowers itself half to death every June. It wants feeding and it wants pruning, and it repays both.',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'iris', w: 26, h: 22, density: 0.7 }, 'lavender'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 2, moisture: -1, maturity: 1 }),
    tags: ['shrub', 'flower', 'aromatic', 'tended', 'physic'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Grey hummocks that go violet all over in July and hum audibly with bees. Plant it along a path edge where people will brush it.',
  },
  {
    id: 'rosemary',
    name: 'Rosemary',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'scrub', w: 22, h: 26 }, 'rosemary'),
    zone: NONE,
    deposits: dep({ order: 2, wildness: 1, moisture: -1, maturity: 1 }),
    tags: ['shrub', 'evergreen', 'aromatic', 'physic', 'tended'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Dark needles, pale blue flowers in the middle of winter, and a smell like resin and pine. It will take clipping if you insist, or sprawl over a wall if you do not.',
  },
  {
    id: 'acanthus',
    name: 'Acanthus',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'fern', w: 32, h: 26 }, 'acanthus'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 2, wildness: 1, maturity: 1, moisture: 1 }),
    tags: ['acanthus', 'shrub', 'flower', 'tended', 'neoclassical', 'dense-cover'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Huge glossy cut leaves and a spire of hooded white-and-purple flowers. This is the plant on a Corinthian capital, so put it at the foot of one and let the joke land.',
  },
  {
    id: 'poppies',
    name: 'Poppies',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'red', w: 30, h: 20, density: 0.55 }, 'poppies'),
    zone: NONE,
    deposits: dep({ wildness: 2, order: 1 }),
    tags: ['flower', 'wild', 'open-ground'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Scarlet tissue-paper on hairy stems, up wherever the ground has been disturbed. They last about four days each and are worth it.',
  },
  {
    id: 'crocus',
    name: 'Crocus',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'iris', w: 20, h: 10, density: 0.6 }, 'crocus'),
    zone: NONE,
    deposits: dep({ order: 1, wildness: 1, maturity: 1 }),
    tags: ['flower', 'millefleurs', 'groundcover', 'quiet'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Small closed cups pushing straight out of cold grass with no leaves to speak of. The first thing that happens in the year, and it happens under the trees.',
  },
  {
    id: 'oleander',
    name: 'Oleander',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'leaf', w: 32, h: 34 }, 'oleander'),
    zone: NONE,
    deposits: dep({ order: 1, wildness: 1, moisture: 1, maturity: 1 }),
    tags: ['shrub', 'evergreen', 'flower', 'blossom', 'dense-cover'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Leathery narrow leaves and pink flowers all summer, growing out of dry stream beds all round the Mediterranean. Handsome, tough, and poisonous in every part.',
  },
  {
    id: 'box-bush',
    name: 'Box',
    group: 'plants',
    footprint: [1, 1],
    art: grow('shrub', { kind: 'leaf', w: 22, h: 18, ramp: 'cypress' }, 'box'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 2, maturity: 1 }),
    tags: ['shrub', 'box', 'evergreen', 'clipped', 'tended', 'neoclassical'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Tiny dark leaves on wood so dense it sinks, growing about two inches a year. Everything clipped in a formal garden is this plant being patient.',
  },
  {
    id: 'wildflower-tuft',
    name: 'Wildflower tuft',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'mixed', w: 24, h: 18 }, 'wildflower-tuft'),
    zone: NONE,
    deposits: dep({ wildness: 2, order: 1 }),
    tags: ['flower', 'wild', 'millefleurs', 'groundcover'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'A handful of whatever is out — vetch, campion, a daisy or two — in a clump the size of a hat. The cheapest way to stop a stretch of grass looking mown.',
  },
  {
    id: 'asphodel',
    name: 'Asphodel',
    group: 'plants',
    footprint: [1, 1],
    art: grow('flowerPatch', { bloom: 'white', w: 20, h: 30, density: 0.35 }, 'asphodel'),
    zone: NONE,
    deposits: dep({ wildness: 1, seclusion: 1, moisture: -1, maturity: 1 }),
    tags: ['flower', 'white-flower', 'wild', 'open-ground', 'quiet'],
    unlockedBy: null,
    growth: GROWS.herb,
    blurb: 'Tall pale spires over a rosette of strap leaves, on bare stony hillsides that goats have finished with. Homer gives the dead a meadow of it, which is a lot to ask of a lily.',
  },
];

// ---------------------------------------------------------------------------
// TREES — 19. Each one must render distinctly (test/catalog.test.mjs asserts
// no two tree species compose to the same pixels), so the params vary in crown
// width, height and ramp as well as in species.
// ---------------------------------------------------------------------------

const TREES = [
  {
    id: 'umbrella-pine',
    name: 'Umbrella pine',
    group: 'trees',
    footprint: [1, 1],
    art: grow('conifer', { species: 'umbrella' }),
    zone: D2('satyr', 'centaur'),
    deposits: dep({ wildness: 1, maturity: 2, seclusion: 1 }),
    tags: ['tree', 'pine', 'evergreen', 'shade', 'timber'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'A long bare trunk and a flat parasol of needles, cones the size of a fist. The thyrsos is tipped with one of those cones, and the same tree is mountain timber for the herd.',
  },
  {
    id: 'ash-tree',
    name: 'Ash',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'ash' }),
    zone: S1('centaur'),
    deposits: dep({ wildness: 1, maturity: 2, seclusion: 1 }),
    tags: ['tree', 'broadleaf', 'ash', 'timber', 'shade'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Straight, pale-barked and light-leaved, the best spear timber there is. Chiron cut Achilles\' spear from an ash on the peak of Pelion.',
  },
  {
    id: 'plane-tree',
    name: 'Plane tree',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'plane' }),
    zone: D2('centaur', 'naiad'),
    deposits: dep({ moisture: 2, maturity: 2, wildness: 1, seclusion: 1 }),
    tags: ['tree', 'broadleaf', 'plane', 'water-loving', 'shade', 'open-ground'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Enormous flaking trunk and a canopy wide enough to hold a whole afternoon of shade. Greek water gets a plane tree over it as a matter of course, and the shade falls on open ground.',
  },
  {
    id: 'black-poplar',
    name: 'Black poplar',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'poplar' }),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    deposits: dep({ moisture: 2, maturity: 2, seclusion: 1 }),
    tags: ['tree', 'broadleaf', 'poplar', 'water-loving'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'A tall column of restless leaves that turn over silver in any breeze. Callimachus sets a sky-high poplar in Demeter\'s grove, and the nymphs used to play at noon beside it.',
  },
  {
    id: 'willow',
    name: 'Willow over water',
    group: 'trees',
    footprint: [1, 1],
    art: grow('willow', {}),
    zone: D2('naiad', 'unicorn'),
    deposits: dep({ moisture: 2, seclusion: 2, maturity: 1, wildness: 1 }),
    tags: ['tree', 'broadleaf', 'willow', 'water-loving', 'shade', 'dense-cover'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Trails its own branches into the water and makes a green room underneath. Willows and reeds are the standard furniture of a nymph\'s margin, and the room under one is as private as this garden gets.',
  },
  {
    id: 'ancient-oak',
    name: 'Ancient oak',
    group: 'trees',
    footprint: [2, 2],
    art: sprite('ancient-oak'),
    zone: T3('satyr', 'centaur', 'unicorn'),
    register: 'archaic',
    deposits: dep({ maturity: 3, seclusion: 2, wildness: 2 }),
    tags: ['tree', 'broadleaf', 'oak', 'timber', 'shade', 'old-growth', 'uncut', 'archaic'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'Limbs as thick as ordinary trunks, a hollow low down, and three hundred years of not being cut. Big, old and wild — and the tapestry unicorn lies down under trees like this one.',
  },
  {
    id: 'oak',
    name: 'Oak',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'oak' }),
    zone: NONE, // the ANCIENT oak carries the triple; a young one is just a tree
    deposits: dep({ maturity: 3, seclusion: 1, wildness: 1 }),
    tags: ['tree', 'broadleaf', 'oak', 'timber', 'shade'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'Thick crooked limbs and a canopy that takes decades to earn. Pines and high-topped oaks are the trees the hamadryads are born with, on ground never cut with axes.',
  },
  {
    id: 'holly',
    name: 'Holly',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'oak', ramp: 'cypress', w: 26, h: 32 }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ seclusion: 2, maturity: 1, wildness: 1 }),
    tags: ['tree', 'evergreen', 'dense-cover', 'fruit'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Dark spined evergreen holding its leaves all winter. One of the four specimen trees identified in the Cluny Lady and the Unicorn hangings.',
  },
  {
    id: 'sour-orange',
    name: 'Sour orange',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'oak', w: 30, h: 34 }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ order: 2, wildness: 1, maturity: 1, moisture: 1 }),
    tags: ['tree', 'evergreen', 'fruit', 'tended', 'blossom', 'antidote'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Glossy leaves carrying white blossom and ripe fruit at the same time — the tapestry weavers loved that trick and painted it in both sets. An imported tree, and it shows.',
  },
  {
    id: 'pomegranate',
    name: 'Pomegranate',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'ash', w: 26, h: 32 }),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 2, wildness: 1, maturity: 1 }),
    tags: ['tree', 'broadleaf', 'fruit', 'tended', 'blossom'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Scarlet flowers, then split fruit full of seeds. It is the tree the unicorn is tethered under in the last of the Cloisters tapestries.',
  },
  {
    id: 'apple-tree',
    name: 'Apple tree',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'oak', w: 34, h: 36, holes: 3 }, 'apple-tree'),
    zone: D2('centaur', 'unicorn'),
    deposits: dep({ order: 2, wildness: 1, maturity: 2, moisture: 1 }),
    tags: ['tree', 'apple', 'broadleaf', 'fruit', 'blossom', 'tended', 'shade'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'A low spreading orchard tree, white-and-pink in April and full of windfalls by September. Both the equine ones come for the fruit, which is as good a reason as any myth.',
  },
  {
    id: 'cypress',
    name: 'Cypress',
    group: 'trees',
    footprint: [1, 1],
    art: grow('conifer', { species: 'cypress' }),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 2, maturity: 2, seclusion: 1 }),
    tags: ['tree', 'cypress', 'evergreen', 'tended', 'straight-edge', 'neoclassical'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'A dark vertical flame, almost too narrow to shade anything. Nobody plants a cypress by accident, and a line of them reads as deliberate from right across the map.',
  },
  {
    id: 'olive-tree',
    name: 'Olive',
    group: 'trees',
    footprint: [1, 1],
    art: grow('olive', {}),
    zone: NONE,
    deposits: dep({ maturity: 2, order: 1, wildness: 1, moisture: -1 }),
    tags: ['tree', 'evergreen', 'fruit', 'old-growth'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'Silvered leaves on a trunk that twists and hollows out with age. An old olive is half sculpture already.',
  },
  {
    id: 'bay-laurel',
    name: 'Bay laurel',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'plane', ramp: 'cypress', w: 30, h: 40 }, 'bay-laurel'),
    zone: NONE,
    deposits: dep({ order: 2, maturity: 1, seclusion: 1 }),
    tags: ['tree', 'laurel', 'evergreen', 'aromatic', 'tended', 'dense-cover'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Dark aromatic leaves on a tree that will take any shape you clip it to. Its wreath belongs to Apollo rather than to anybody living here, but it smells wonderful in the sun.',
  },
  {
    id: 'myrtle',
    name: 'Myrtle',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'oak', ramp: 'olive', w: 24, h: 28 }, 'myrtle'),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 2, maturity: 1, moisture: 1 }),
    tags: ['tree', 'myrtle', 'evergreen', 'white-flower', 'aromatic', 'blossom'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Small shining leaves and white flowers with a burst of stamens, then blue-black berries. Aromatic enough that walking past it counts as an event.',
  },
  {
    id: 'almond-blossom',
    name: 'Almond in blossom',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'ash', ramp: 'grass', w: 30, h: 38 }, 'almond-blossom'),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    deposits: dep({ order: 1, wildness: 1, maturity: 1 }),
    tags: ['tree', 'almond', 'broadleaf', 'white-flower', 'blossom', 'fruit'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Bare black twigs covered in pale flowers weeks before anything else has woken up. It flowers so early it is regularly caught by frost, and does it again the next year.',
  },
  {
    id: 'fig',
    name: 'Fig',
    group: 'trees',
    footprint: [1, 1],
    art: grow('broadleaf', { species: 'plane', w: 34, h: 30, holes: 4 }, 'fig'),
    zone: NONE, // Dionysiac in practice, but no satyr-specific text: flavour only
    deposits: dep({ wildness: 1, maturity: 1, order: 1, moisture: 1 }),
    tags: ['tree', 'fig', 'broadleaf', 'fruit', 'shade', 'dionysiac'],
    unlockedBy: null,
    growth: GROWS.tree,
    blurb: 'Big hand-shaped leaves, grey limbs, and fruit that will not ripen off the tree. Strongly Dionysiac in Greek practice — but no satyr-specific text names it, so treat it as flavour rather than lore.',
  },
  {
    id: 'standing-timber',
    name: 'Uncut standing timber',
    group: 'trees',
    footprint: [1, 1],
    art: grow('olive', { ramp: 'earth', w: 22, h: 44 }),
    zone: S1('centaur'),
    register: 'archaic',
    deposits: dep({ maturity: 3, wildness: 2, seclusion: 1, order: -1 }),
    tags: ['tree', 'timber', 'uncut', 'old-growth', 'wild', 'deadwood', 'archaic'],
    unlockedBy: null,
    growth: null,
    blurb: 'A tall bole left standing where it grew, bark going and holes appearing. Pelion was the timber-store that built the Argo — the point of this one is that nobody has taken it.',
  },
  {
    id: 'mossy-trunk',
    name: 'Mossy fallen trunk',
    group: 'trees',
    footprint: [2, 1],
    art: grow('olive', { ramp: 'rock', w: 40, h: 18 }, 'fallen-trunk'),
    zone: D2('satyr', 'unicorn'),
    register: 'archaic',
    flatFooting: false,
    deposits: dep({ maturity: 3, wildness: 2, seclusion: 2, moisture: 1, order: -1 }),
    tags: ['timber', 'deadwood', 'old-growth', 'wild', 'quiet', 'archaic', 'shade'],
    unlockedBy: null,
    growth: null,
    blurb: 'A trunk down in the grass, soft with moss, with ferns growing out of the split side. Old, quiet and untended — which is the one condition both the wild one and the white one will agree to.',
  },
];

// ---------------------------------------------------------------------------
// SCULPTURE — 11. Statuary and votive furniture.
// ---------------------------------------------------------------------------

const SCULPTURE = [
  {
    id: 'herm',
    name: 'Herm',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('herm'),
    zone: NULLIFIER,
    register: 'archaic',
    blocks: true,
    deposits: dep({ order: 2, wildness: 1, maturity: 1 }),
    tags: ['sculpture', 'stone', 'votive', 'dionysiac', 'nullifier', 'archaic'],
    unlockedBy: null,
    blurb: 'A square pillar with a bearded head on top, standing where two ways meet. Herms marked property edges and crossroads in Attica, so a boundary stone that breaks a chain of influence is not a metaphor — it is the object doing its actual job.',
  },
  {
    id: 'mask-idol',
    name: 'Satyr mask on a pole',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('satyr-mask-pole'),
    zone: S1('satyr'),
    register: 'archaic',
    deposits: dep({ wildness: 2, order: 1, seclusion: 1 }),
    tags: ['sculpture', 'dionysiac', 'votive', 'wild', 'archaic'],
    unlockedBy: null,
    blurb: 'A wide-eyed painted face lashed to a post and dressed in cloth. Vase painters show this again and again on the Lenaia vases; no surviving text names it, so read it as picture-evidence rather than instruction.',
  },
  {
    id: 'sleeping-satyr',
    name: 'Sleeping satyr',
    group: 'sculpture',
    footprint: [2, 1],
    art: sprite('sleeping-satyr'),
    zone: LEAN({ satyr: WEIGHTS.lean }),
    deposits: dep({ order: 2, maturity: 2, seclusion: 1, wildness: 1 }),
    tags: ['sculpture', 'stone', 'dionysiac', 'quiet'],
    unlockedBy: 'satyr',
    blurb: 'A faun sprawled asleep on a rock, carved life-size and one arm flung back. Left long enough in a damp corner he acquires moss, and improves.',
  },
  {
    id: 'seated-maiden',
    name: 'Seated maiden',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('seated-maiden'),
    zone: LEAN({ unicorn: WEIGHTS.lean }),
    register: 'neoclassical',
    deposits: dep({ order: 2, seclusion: 1, maturity: 1 }),
    tags: ['sculpture', 'stone', 'maiden', 'quiet', 'tended', 'neoclassical'],
    unlockedBy: null,
    blurb: 'A girl carved sitting alone with empty hands and her lap open. In the medieval bestiaries this is the whole of the unicorn trap, and it works because it asks for nothing.',
  },
  {
    id: 'fallen-torso',
    name: 'Fallen torso',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('marble-torso'),
    zone: ARCH,
    register: 'archaic',
    flatFooting: false,
    deposits: dep({ maturity: 3, wildness: 2, order: -1, seclusion: 1 }),
    tags: ['sculpture', 'stone', 'old-growth', 'wild', 'quiet', 'ruin', 'archaic'],
    unlockedBy: 'unicorn',
    blurb: 'Half a marble figure lying in the grass with ivy across it. A ruin is wild and unkempt without being disorderly by accident — somebody meant this once.',
  },
  {
    id: 'votive-shelf',
    name: 'Votive shelf',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('votive-shelf'),
    zone: S1('naiad'),
    deposits: dep({ order: 2, maturity: 1, seclusion: -1 }),
    tags: ['votive', 'traffic', 'tended', 'stone'],
    unlockedBy: null,
    blurb: 'A stone ledge crowded with terracotta figurines, little flasks and knucklebones. The cave above Delphi gave up thousands of these — a shelf like this means people come, and being visited is part of what a spring nymph is.',
  },
  {
    id: 'pan-nymph-altar',
    name: 'Altar to Pan and the Nymphs',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('altar'),
    zone: T3('satyr', 'centaur', 'naiad'),
    register: 'archaic',
    deposits: dep({ order: 2, maturity: 2, moisture: 1, seclusion: 1 }),
    tags: ['votive', 'traffic', 'stone', 'dionysiac', 'archaic'],
    unlockedBy: null,
    blurb: 'A low block with a shallow dish cut in the top and two names on the face. "To Pan and the Nymphs" is an attested joint dedication — the three wild Greek ones share it, and the unicorn, who is not Greek, is not invited.',
  },
  {
    id: 'syrinx-stand',
    name: 'Syrinx and aulos',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('syrinx-post'),
    zone: LEAN({ satyr: WEIGHTS.lean }),
    deposits: dep({ wildness: 1, order: 1, seclusion: 1 }),
    tags: ['syrinx', 'dionysiac', 'timber'],
    unlockedBy: 'satyr',
    blurb: 'Reed pipes and a double flute hung on a forked stick. Leave them where they can be found; something in this glade will eventually pick them up.',
  },
  {
    id: 'axe-marker',
    name: 'Axe-forbidden marker',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('broken-column', 'axe-marker'),
    zone: LEAN({ naiad: WEIGHTS.lean }),
    register: 'archaic',
    deposits: dep({ seclusion: 2, maturity: 2, order: 2, wildness: 2 }),
    tags: ['stone', 'votive', 'uncut', 'quiet', 'archaic'],
    unlockedBy: null,
    blurb: 'A carved post declaring the trees behind it not to be cut. The hamadryad dies with her tree, and Erysichthon taking an axe to the nymphs\' poplar is the standard cautionary tale.',
  },
  {
    id: 'broken-column',
    name: 'Broken column',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('broken-column'),
    zone: ARCH,
    register: 'archaic',
    flatFooting: false,
    deposits: dep({ maturity: 3, wildness: 1, order: 1, seclusion: 1 }),
    tags: ['column', 'stone', 'ruin', 'archaic', 'old-growth', 'dressed-stone'],
    unlockedBy: null,
    blurb: 'A fluted shaft snapped off at shoulder height with the drum lying beside it. The romantic ruin, invented by eighteenth-century landowners who wanted their new gardens to have a past.',
  },
  {
    id: 'obelisk',
    name: 'Obelisk',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('obelisk'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, seclusion: -1, maturity: 1 }),
    tags: ['sculpture', 'stone', 'dressed-stone', 'neoclassical', 'straight-edge', 'ornament'],
    unlockedBy: null,
    blurb: 'A tapering square shaft on a stepped base, pointing at nothing in particular. Set one at the far end of a walk and the whole walk suddenly has a reason to exist.',
  },
];

// ---------------------------------------------------------------------------
// STRUCTURE — 19. Walls, hedges, columns, arches, grottoes, vessels.
// Every occluder in the game is here or in GROUND (the gravel walk) or in
// SCULPTURE (the herm) — and a two-level terrace does the same job for free.
// ---------------------------------------------------------------------------

const STRUCTURE = [
  {
    id: 'dry-stone-wall',
    name: 'Drystone wall',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('drystone-wall'),
    zone: NULLIFIER,
    register: 'archaic',
    blocks: true,
    deposits: dep({ order: 3, seclusion: 1, wildness: -1, maturity: 1 }),
    tags: ['enclosure', 'straight-edge', 'stone', 'nullifier', 'archaic'],
    unlockedBy: null,
    blurb: 'Field stone stacked without mortar, patient work and very solid — and every gap in it full of ferns and small living things within a season. Walls are exactly what the Cyclopes\' hill famously had none of.',
  },
  {
    id: 'drystone-gateway',
    name: 'Wall gateway',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('drystone-gateway'),
    // Not a different object — THIS wall with a hole through it, carved from
    // the same courses and the same lattice, so the masonry can never drift
    // from the wall it stands in. See js/art/props.js.
    joins: 'dry-stone-wall',
    zone: NONE,
    register: 'archaic',
    blocks: { gap: true, axis: 'x' },
    deposits: dep({ order: 2, seclusion: 1, maturity: 1 }),
    tags: ['enclosure', 'stone', 'gate', 'archaic', 'straight-edge'],
    unlockedBy: null,
    blurb: 'A gap left in the wall with a long stone laid over it. Whoever built this had to find one flat slab wide enough, and you can see they went looking.',
  },
  {
    id: 'clipped-hedge',
    name: 'Low clipped hedge',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('hedge-low'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ order: 3, wildness: -1, maturity: 1 }),
    tags: ['hedge', 'box', 'clipped', 'evergreen', 'enclosure', 'straight-edge', 'nullifier', 'neoclassical'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Box clipped to knee height with a flat top and square shoulders. You can see straight over it, and influence cannot get through it at all — which is the whole trick of a formal garden in one object.',
  },
  {
    id: 'tall-hedge',
    name: 'Tall hedge',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('hedge-tall'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ order: 3, seclusion: 2, wildness: -1, maturity: 1 }),
    tags: ['hedge', 'yew', 'clipped', 'evergreen', 'enclosure', 'dense-cover', 'nullifier', 'neoclassical'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'Yew above head height, black-green and absolutely opaque. It blocks the view as well as the influence, so what it really sells is the moment you walk round the end of it.',
  },
  {
    id: 'hedge-arch',
    name: 'Hedge arch',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('hedge-arch'),
    // ------------------------------------------------------------------
    // A GATE IS PART OF ITS WALL'S RUN.
    //
    // The owner, having built a fence and stood a pergola in the middle of
    // it: *"i was trying to use the pergola as a gate. what i think we
    // really need are separate gates / archways for the various walls."*
    //
    // This is what `joins` being a GROUP NAME rather than an id is for. The
    // arch declares itself part of `tall-hedge`'s run, so the hedges either
    // side of it reach for it and it reaches back, and a gateway set into a
    // hedge is one continuous object with a hole in it instead of an
    // ornament standing where a hedge is missing.
    //
    // It is a catalogue decision and not an art one, deliberately: an artist
    // who draws an archway should not have to know which wall a designer
    // will hang it in, and the same drawing could serve two.
    joins: 'tall-hedge',
    zone: NULLIFIER,
    register: 'neoclassical',
    // The doorway faces down-right, which is the 'x' axis in this projection —
    // stated rather than defaulted, because fields.js's default is also 'x' and
    // a silent agreement between two files is the kind that drifts. The sprite
    // and the rule now say the same thing out loud.
    blocks: { gap: true, axis: 'x' },
    needsDesign: true,
    designNote:
      'A hedge with a DOORWAY: blocks influence except through the opening, so a gateway leaks. The occluder pass in js/fields.js is currently per-tile boolean, and "blocked except along one axis" needs either a directional occluder (which way is the gap facing?) or a two-tile piece with one solid half. Ships as a full blocker, so today the gap is decorative.',
    deposits: dep({ order: 3, seclusion: 1, maturity: 1 }),
    tags: ['hedge', 'yew', 'clipped', 'arch', 'gate', 'enclosure', 'nullifier', 'neoclassical', 'traffic'],
    unlockedBy: null,
    blurb: 'A tall hedge with a clipped doorway cut through it. The most interesting thing here: it is meant to let two zones touch through one controlled opening, so you can join what you divided without knocking the hedge down.',
  },
  {
    id: 'cypress-screen',
    name: 'Cypress screen',
    group: 'structure',
    // [1, 1], not [1, 2]. The art runs along +tx and this plot ran along +ty,
    // so the build ghost was drawn at right angles to the trees it previewed.
    // A screen is a LINEAR piece like the hedges and the drystone wall: one
    // tile each, and the player builds the length they want. See the note in
    // js/art/props.js CYPRESS_SCREEN.
    footprint: [1, 1],
    art: sprite('cypress-screen'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ order: 3, seclusion: 2, maturity: 2 }),
    tags: ['hedge', 'cypress', 'evergreen', 'straight-edge', 'nullifier', 'neoclassical', 'enclosure'],
    unlockedBy: null,
    growth: GROWS.slowTree,
    blurb: 'A close-planted row of cypress, dark and vertical and taller than anything else in the garden. The most Mediterranean way there is to divide one piece of ground from another.',
  },
  {
    id: 'palisade-fence',
    name: 'Low palisade',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('palisade-fence'),
    zone: LEAN({ unicorn: WEIGHTS.lean, satyr: WEIGHTS.repel }),
    deposits: dep({ order: 3, seclusion: 2, wildness: -2 }),
    tags: ['enclosure', 'straight-edge', 'timber', 'tended'],
    unlockedBy: null,
    blurb: 'Split stakes woven low, more a statement than an obstacle. It is the hortus conclusus of the last tapestry — and the thing a centaur most dislikes seeing across a slope.',
  },
  {
    id: 'palisade-gate',
    name: 'Field gate',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('palisade-gate'),
    // A PIECE OF THE FENCE, not an ornament standing where one is missing.
    // See `hedge-arch` above for the argument; this is the same move for the
    // timber run, and it is the one the owner actually reached for when they
    // put a pergola in the middle of a fence.
    joins: 'palisade-fence',
    zone: NONE,
    register: 'archaic',
    // The gap LEAKS, exactly as the hedge arch's does: `js/fields.js` still
    // treats an occluder as a per-tile boolean, so a directional block is
    // declared here and honoured nowhere. Shipped as a piece that does not
    // block at all, which is the honest half of that pair — a gateway that
    // stopped influence would be a fence with a picture of a gate on it.
    blocks: { gap: true, axis: 'x' },
    deposits: dep({ order: 2, seclusion: 1 }),
    tags: ['enclosure', 'timber', 'gate', 'archaic', 'tended'],
    unlockedBy: null,
    blurb: 'Two stout posts, a head rail and a low leaf hung between them. You can see straight over it, which is the point: a gate says the ground beyond is somebody’s without pretending you cannot get there.',
  },
  {
    id: 'balustrade',
    name: 'Balustrade',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('balustrade'),
    zone: NEO,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ order: 3, wildness: -1, seclusion: 1 }),
    tags: ['enclosure', 'straight-edge', 'dressed-stone', 'neoclassical', 'nullifier', 'terrace'],
    unlockedBy: null,
    blurb: 'A row of little turned stone posts under a moulded rail, about waist high. It is what you put along the open edge of a terrace so that the drop stops being alarming.',
  },
  {
    id: 'doric-column',
    name: 'Doric column',
    group: 'structure',
    footprint: [1, 1],
    // Was `sprite('column')` — the plain unfluted shaft in props.js, drawn
    // before decor.js existed. `ionic-column` and `corinthian-column` beside it
    // were migrated to their own art and this one was not, so the order that
    // gives the group its name was the only one still drawing the understudy.
    // The blurb says "a stout FLUTED shaft with a plain square capital"; the
    // sprite it drew has neither. See the note on `stone-bench` below.
    art: sprite('doric-column'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1 }),
    tags: ['column', 'stone', 'dressed-stone', 'neoclassical', 'straight-edge'],
    unlockedBy: null,
    blurb: 'A stout fluted shaft with a plain square capital and no base at all. The oldest and least fussy of the orders, and the one that looks best standing on grass.',
  },
  {
    id: 'ionic-column',
    name: 'Ionic column',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('ionic-column'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1, seclusion: -1 }),
    tags: ['column', 'stone', 'dressed-stone', 'neoclassical', 'ornament'],
    unlockedBy: null,
    blurb: 'The same shaft under a capital with a pair of scrolls curling out sideways. Slimmer than the Doric and noticeably more pleased with itself.',
  },
  {
    id: 'corinthian-column',
    name: 'Corinthian column',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('corinthian-column'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1, wildness: 1 }),
    tags: ['column', 'stone', 'dressed-stone', 'neoclassical', 'ornament', 'acanthus'],
    unlockedBy: null,
    blurb: 'A bell of carved acanthus leaves on top of the shaft, the most ornamental capital the Greeks made. Plant real acanthus at the foot of it and the whole borrowing becomes visible.',
  },
  {
    id: 'colonnade',
    name: 'Colonnade',
    group: 'structure',
    // ONE BAY, AND IT JOINS. The owner: *"colonnade doesn't work like a fence
    // or rotate"*. It was a single 3x1 sprite, which is why it could do
    // neither — no join art, and §TURNS below refuses anything not square.
    // Nobody wants exactly three bays; a colonnade is a RUN. Lay four of them.
    //
    // DEPOSITS ARE PER TILE, so they come down: what used to be one placement
    // worth `order: 3` is now three placements, and leaving the number alone
    // would have tripled a colonnade's effect in silence.
    footprint: [1, 1],
    art: sprite('colonnade'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 2, maturity: 1, seclusion: 1, wildness: -1 }),
    tags: ['column', 'stone', 'dressed-stone', 'neoclassical', 'straight-edge', 'enclosure'],
    unlockedBy: null,
    blurb: 'A column under a run of entablature, standing free with sky behind it. Put four in a row and a lawn becomes a garden that has an opinion about architecture; turn the corner and it has two.',
  },
  {
    id: 'pergola',
    name: 'Pergola',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('pergola'),
    zone: NONE, // furniture: a frame is whatever you grow over it
    deposits: dep({ order: 2, seclusion: 2, maturity: 1, wildness: 1 }),
    tags: ['arch', 'timber', 'shade', 'enclosure', 'tended'],
    unlockedBy: null,
    blurb: 'Posts and cross-beams for something to climb over. Empty it is a frame; with a vine on it, it is the coolest place in the garden by two in the afternoon.',
  },
  {
    id: 'ruined-arch',
    name: 'Ruined arch',
    group: 'structure',
    // 1x1 SO IT CAN TURN. The art was rebuilt as a barrel vault — see
    // js/art/decor.js §archwayGrid — and a vault has an axis, which makes this
    // a FRONTED piece like the pergola and the wall fountain. At 2x1 it was
    // barred from §TURNS below for the same reason the colonnade was, and the
    // same answer applies: ask whether it wanted the footprint at all.
    footprint: [1, 1],
    art: sprite('ruined-arch'),
    zone: ARCH,
    register: 'archaic',
    flatFooting: false,
    deposits: dep({ maturity: 3, wildness: 2, seclusion: 1, order: -1 }),
    tags: ['arch', 'stone', 'ruin', 'archaic', 'old-growth', 'dense-cover'],
    unlockedBy: null,
    blurb: 'One span of something larger, standing because arches are stubborn. Walk through it and you are briefly indoors — you can see the underside of the vault from here, which is the part that tells you somebody built it.',
  },
  {
    // THE SAME BUILDING YOUNG. The owner: *"there should probably also be a non
    // ruined archway too."* One generator makes both, so the two cannot drift
    // into being different buildings; what separates them is the break in the
    // ring, the weathering and the register. The ruin is ARCHAIC and pays in
    // maturity and wildness; this one is DRESSED and pays in order.
    id: 'archway',
    name: 'Archway',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('archway'),
    zone: ARCH,
    register: 'archaic',
    deposits: dep({ order: 2, maturity: 1, seclusion: 2 }),
    tags: ['arch', 'stone', 'dressed-stone', 'archaic', 'enclosure', 'shade'],
    unlockedBy: null,
    blurb: 'A whole span on two piers, the voussoirs still tight and every joint where the mason left it. An arch stands up by leaning on itself, which is why the ruined ones are still standing too.',
  },
  {
    id: 'tholos',
    name: 'Tholos',
    group: 'structure',
    footprint: [2, 2],
    art: sprite('tholos'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 2, seclusion: 1, wildness: -1 }),
    tags: ['column', 'stone', 'dressed-stone', 'neoclassical', 'ornament', 'enclosure'],
    unlockedBy: 'unicorn',
    blurb: 'A little round temple: a ring of columns, a conical roof, and nothing inside but a view. The centrepiece object of the whole set — put it on the highest terrace and every walk in the garden quietly turns to face it.',
  },
  {
    id: 'grotto-basin',
    name: 'Grotto and basin',
    group: 'structure',
    footprint: [2, 1],
    art: sprite('grotto-mouth'),
    // DECOR.md fixes the naiad's three singles as the basined spring, the reed
    // bed and the votive shelf. The nymphaeum is the most naiad object in the
    // game and it still only leans — otherwise the census is a suggestion.
    zone: LEAN({ naiad: WEIGHTS.lean }),
    register: 'archaic',
    deposits: dep({ seclusion: 3, moisture: 2, maturity: 2, order: 2, wildness: 1 }),
    tags: ['grotto', 'cave', 'votive', 'stone', 'quiet', 'cliff', 'archaic'],
    unlockedBy: null,
    blurb: 'A cave dressed just enough to be a shrine: a cut stone basin catching the drip, and a niche above it for whatever people leave. This is what a real nymphaeum looked like.',
  },
  {
    id: 'fern-grotto',
    name: 'Fern grotto',
    group: 'structure',
    footprint: [2, 1],
    art: sprite('fern-grotto'),
    zone: T3('satyr', 'naiad', 'unicorn'),
    register: 'archaic',
    deposits: dep({ seclusion: 3, moisture: 3, maturity: 2, wildness: 1 }),
    tags: ['grotto', 'cave', 'shade', 'water-loving', 'quiet', 'cliff', 'dense-cover'],
    unlockedBy: null,
    blurb: 'A damp overhang with hart\'s-tongue and maidenhair growing straight out of the wet rock, and water audible somewhere behind. Secret, still, and green in the middle of winter.',
  },
  {
    id: 'half-buried-pithos',
    name: 'Half-buried pithos of wine',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('half-buried-pithos'),
    zone: D2('satyr', 'centaur'),
    register: 'archaic',
    deposits: dep({ wildness: 2, order: 1, maturity: 1 }),
    tags: ['wine', 'dionysiac', 'vessel', 'archaic'],
    unlockedBy: null,
    blurb: 'A great clay jar sunk to its shoulders in cool earth, sealed with pitch. Apollodorus has Pholus open one of these and the whole herd come down the mountain at the smell — it is literally the object that ties these two together.',
  },
  {
    id: 'krater',
    name: 'Krater and wineskin',
    group: 'structure',
    footprint: [1, 1],
    art: sprite('krater'),
    zone: LEAN({ satyr: WEIGHTS.lean }),
    register: 'archaic',
    deposits: dep({ wildness: 2, order: 1 }),
    tags: ['wine', 'dionysiac', 'vessel', 'archaic'],
    unlockedBy: 'satyr',
    blurb: 'A mixing bowl left out with a skin beside it, as on a hundred vases. Set one in a walled flower garden and you have staged the oldest argument in this game: the cup that calls satyrs is the thing the alicorn exists to purify.',
  },
  {
    id: 'level-bridge',
    name: 'Bridge',
    group: 'structure',
    footprint: [2, 1],
    art: sprite('bridge'),
    zone: NONE,
    register: 'archaic',
    flatFooting: false,
    needsDesign: true,
    designNote:
      'ELEVATION.md lists "objects spanning two levels" as NEEDS-DESIGN and this is the case that wants it: a bridge over a gorge stands on two tiles at DIFFERENT heights, which the depth key (one level per object) cannot express, and the deck must draw above the gap without the gap drawing above the deck. Ships as a flat single-level footbridge over water or a one-level dip.',
    // "Planks across the water" that could not be built across water: without a
    // `ground` key this defaulted to requires:'land'. See stepping-stones.
    requires: 'any',
    crossing: true,
    deposits: dep({ order: 2, seclusion: -1, maturity: 1, moisture: 1 }),
    tags: ['timber', 'path', 'traffic', 'archaic'],
    unlockedBy: null,
    blurb: 'Planks and a handrail across the water, wide enough for one. For now it likes both banks at the same height; a real span over a gorge is still being worked out.',
  },
];

// ---------------------------------------------------------------------------
// TOMBS — 5, of which one is hidden. docs/TOMBS.md.
//
// They live in `sculpture` rather than in a tab of their own, and that is a
// decision rather than a shrug: a Greek grave stele IS sculpture — the finest
// relief carving that survives from the period is funerary — and putting the
// five together on the Statuary tab beside the herm and the votive shelf means
// a player meets them as one family, in the company they belong to.
//
// THE MECHANIC, and there is no new system in it:
//
//   1. A TOMB GRANTS `maturity` IN A RADIUS, IMMEDIATELY. `maturity` already
//      means "this ground has been left alone long enough to feel old" and
//      normally accrues with garden time. A tomb IS a past, so the ground round
//      it reads as having history because it demonstrably does. It is an
//      ordinary deposit through the ordinary field — nothing here is special-
//      cased in js/fields.js.
//
//   2. TOMBS ARE NULLIFIERS. Nothing grows on a grave, so they block influence
//      propagation exactly as the hedges and a two-level terrace do.
//
// Those two facts sit together only because fields.js already gets the hard
// case right: `const fromSeed = d === 0; // an object does not occlude its own
// emission`. A source that is itself an occluder still radiates outward from
// its own tiles, so a tomb can be a wall and a gift at once, which is precisely
// what TOMBS.md asks for.
//
// WHY THEY CARRY NO AFFINITY. TOMBS.md calls the tumulus satyr-leaning and the
// Arcadian tomb unicorn-leaning, and it would be easy to write those as small
// weights. It would also be a lie: a nullifier's affinity cannot leave its own
// tiles, so the weight would do nothing anywhere a player could see. The lean
// is carried by `register` instead — which is exactly what DECOR.md Part II
// says a register IS — and by the art, which is where a player actually reads
// it. Every tomb is `zone: NULLIFIER`, with an empty affinity map, honestly.
//
// TENDING is the one place in the game where an object asks to be looked after,
// and it asks gently: see TOMB_TENDING below. The deposits authored here are
// the TENDED figures. A neglected grave is served half of them — never a
// penalty, only a smaller gift, and if the tending pass never runs at all every
// tomb quietly gives its full measure. That is the correct way round for SPEC
// §0: the failure mode of the cosy mechanic has to be generosity.
// ---------------------------------------------------------------------------

const TOMBS = [
  {
    id: 'tumulus',
    name: 'Tumulus',
    group: 'sculpture',
    footprint: [2, 2],
    art: sprite('tumulus'),
    zone: NULLIFIER,
    register: 'archaic',
    blocks: true,
    flatFooting: false,
    deposits: dep({ maturity: 3, wildness: 2, seclusion: 1, order: -1 }),
    tags: ['tomb', 'nullifier', 'stone', 'archaic', 'wild', 'old-growth', 'quiet'],
    unlockedBy: null,
    blurb: 'A grassy mound with a broken ring of kerbstones round its foot, and nobody left who knows whose it is. The oldest form of grave there is — it reads as a piece of the landscape until you notice the stones.',
  },
  {
    id: 'grave-stele',
    name: 'Stele',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('grave-stele'),
    zone: NULLIFIER,
    register: 'archaic',
    blocks: true,
    deposits: dep({ maturity: 2, order: 1, seclusion: 1 }),
    tags: ['tomb', 'nullifier', 'sculpture', 'stone', 'archaic', 'quiet', 'dressed-stone'],
    unlockedBy: null,
    blurb: 'An upright slab under a palmette, with a shallow relief of the dead cut into a sunk panel: a woman standing with a small box open in her hands, looking into it. Greek grave reliefs almost never show a death. They show an afternoon.',
  },
  {
    id: 'naiskos',
    name: 'Naiskos',
    group: 'sculpture',
    footprint: [1, 1],
    art: sprite('naiskos'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ maturity: 3, order: 2, seclusion: 1 }),
    tags: ['tomb', 'nullifier', 'sculpture', 'column', 'dressed-stone', 'neoclassical', 'quiet'],
    unlockedBy: null,
    blurb: 'A grave marker built as a little temple front — two antae, an architrave, a pediment — with the dead standing in the doorway and a servant waiting at her side. The house is the point: it is where she is now.',
  },
  {
    id: 'heroon',
    name: 'Heroön',
    group: 'sculpture',
    footprint: [2, 2],
    art: sprite('heroon'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    deposits: dep({ maturity: 3, order: 2, seclusion: 2 }),
    tags: ['tomb', 'nullifier', 'votive', 'stone', 'dressed-stone', 'neoclassical', 'quiet'],
    unlockedBy: null,
    blurb: 'A canopy of four columns and a tiled roof standing over one grave, with an altar in front of it and a band of wool tied round the near post. Hero-cult was a practice rather than a monument: somebody comes here, and the glade grows old around the fact.',
  },
  {
    id: 'arcadian-tomb',
    name: 'The Arcadian tomb',
    group: 'sculpture',
    footprint: [2, 1],
    art: sprite('arcadian-tomb'),
    zone: NULLIFIER,
    register: 'neoclassical',
    blocks: true,
    // NOT IN THE BUILD MENU. `hidden` keeps it off the palette until the glade
    // finds it (js/ui.js, and ARCADIAN_UNLOCK below). It is deliberately NOT
    // gated with `unlockedBy`, which means something else entirely — that is
    // the creature gate, it puts an empty "not yet discovered" slot on the
    // palette as a promise, and a promise is the one thing this object must
    // never make. It is never announced, never listed in the journal, and
    // never required for anything. A player who never finds it loses nothing.
    hidden: true,
    deposits: dep({ maturity: 3, order: 2, seclusion: 2 }),
    tags: ['tomb', 'nullifier', 'sculpture', 'stone', 'dressed-stone', 'neoclassical', 'quiet'],
    unlockedBy: null,
    blurb: 'A plain stone sarcophagus standing in the grass, blank but for three cut words. Poussin\'s shepherds find one of these in paradise and stand reading it; the eighteenth century built them in real gardens, inscription and all.',
  },
];

// ---------------------------------------------------------------------------
// DECOR — 13. Furniture. These do NOTHING mechanically beyond their register
// lean, and that is the point: if every placement carries a zoning consequence
// then placing becomes anxious, and the player optimises instead of decorating.
// This group is the antidote to the tyranny of the optimal layout.
// ---------------------------------------------------------------------------

const DECOR = [
  {
    id: 'stone-bench',
    name: 'Stone bench',
    group: 'decor',
    footprint: [1, 1],
    // ------------------------------------------------------------------
    // THE OWNER'S NAMED EXAMPLE, and it was never an art fault.
    //
    // This drew `props.BENCH`, which is a front elevation: every edge in it
    // is horizontal, so it reads as a little table pasted onto the screen
    // rather than a thing lying in the world. `decor.STONE_BENCH` — a slab()
    // seat on two plinth() legs, running along the +tx axis like every other
    // linear piece, and the sprite decor.js's own header holds up as the
    // vocabulary the rest of the set follows — has existed the whole time,
    // registered under this very id, and NOTHING ASKED FOR IT.
    //
    // A name that differs from the id is how art goes dead without anything
    // failing: the sprite resolves, playtest is happy (it is not an
    // understudy — there is no `wanted`), and the audit measures the good
    // sprite and reports it clean while the game draws the other one.
    // `tools/iso-audit.mjs --catalog` now measures only what a player can
    // reach, which is the census that would have caught this.
    art: sprite('stone-bench'),
    zone: NONE,
    deposits: dep({ order: 2, seclusion: 1, maturity: 1 }),
    tags: ['seat', 'stone', 'tended', 'quiet'],
    unlockedBy: null,
    blurb: 'A plain slab on two blocks, cold in the morning and warm by four. Put it where you would actually want to sit, which is usually facing away from the house.',
  },
  {
    id: 'exedra',
    name: 'Exedra',
    group: 'decor',
    footprint: [2, 2],
    art: sprite('exedra'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, seclusion: 2, maturity: 1 }),
    tags: ['seat', 'stone', 'dressed-stone', 'neoclassical', 'enclosure'],
    unlockedBy: null,
    blurb: 'A curved semicircular bench with a low back, meant for a conversation rather than a rest. The most neoclassical object you can put in any garden, and it makes the ground in front of it into a room.',
  },
  {
    id: 'marble-exedra',
    name: 'Marble exedra',
    group: 'decor',
    footprint: [2, 2],
    // `exedra-marble` is registered (decor.js authors the exedra in the ROCK
    // ramp and re-resolves it through MARBLE, so this costs no pixels), which
    // means the understudy never draws. It was `bench` — an unrelated sprite,
    // and a bad thing to fall back to if the variant ever went missing.
    art: sprite('exedra-marble'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, seclusion: 2, maturity: 2 }),
    tags: ['seat', 'stone', 'dressed-stone', 'neoclassical', 'ornament'],
    unlockedBy: 'unicorn',
    blurb: 'The same curve cut in white marble instead of grey stone, and it changes the whole corner. Marble is a value problem before it is a colour one: what sells it is the dark under the seat, not the light on top.',
  },
  {
    id: 'amphora',
    name: 'Amphora',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('amphora'),
    zone: NONE,
    register: 'archaic',
    deposits: dep({ order: 2, maturity: 1 }),
    tags: ['vessel', 'ornament', 'archaic'],
    unlockedBy: null,
    blurb: 'A terracotta two-handled jar with a pointed foot, so it will not stand up on its own without a hole to sit in. Leave it lying on its side in the grass and nobody will think it odd.',
  },
  {
    id: 'amphora-plinth',
    name: 'Amphora on a plinth',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('amphora-plinth'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1, seclusion: -1 }),
    tags: ['vessel', 'ornament', 'dressed-stone', 'neoclassical'],
    unlockedBy: null,
    blurb: 'The same jar lifted onto a squared stone base at eye height, which turns a container into a monument. Two of them either side of a gap make the gap into a gate.',
  },
  {
    id: 'wide-krater',
    name: 'Wide-bowled krater',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('krater-wide'),
    zone: NONE,
    deposits: dep({ order: 2, moisture: 1 }),
    tags: ['vessel', 'ornament', 'stone'],
    unlockedBy: null,
    blurb: 'A broad shallow bowl on a short foot, big enough to bathe a small dog in. Empty it holds rainwater and leaves, which is arguably its best state.',
  },
  {
    id: 'fluted-urn',
    name: 'Fluted urn with lid',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('fluted-urn'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1 }),
    tags: ['vessel', 'ornament', 'dressed-stone', 'neoclassical'],
    unlockedBy: null,
    blurb: 'Gadrooned belly, a moulded lip, and a lid with a little acorn on top that never comes off. Purely ornamental — the eighteenth century put these on gateposts by the hundred.',
  },
  {
    id: 'sundial',
    name: 'Sundial on a pedestal',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('sundial'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1, seclusion: -1 }),
    tags: ['ornament', 'stone', 'dressed-stone', 'neoclassical', 'tended'],
    unlockedBy: null,
    blurb: 'A bronze plate with an angled gnomon on a baluster pedestal, usually a few minutes out. It wants the one spot in the garden that has sun all day, and finding that spot is the real exercise.',
  },
  {
    id: 'birdbath',
    name: 'Birdbath',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('birdbath'),
    zone: NONE,
    deposits: dep({ order: 2, moisture: 1, maturity: 1 }),
    tags: ['vessel', 'ornament', 'stone', 'still-water'],
    unlockedBy: null,
    blurb: 'A shallow dish on a stem with about an inch of water in it. Not deep enough to be a pool and not dressed enough to be a fountain, and the birds prefer it to both.',
  },
  {
    id: 'cache-pot-topiary',
    name: 'Cache-pot with topiary',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('cache-pot'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1 }),
    tags: ['vessel', 'topiary', 'clipped', 'box', 'evergreen', 'neoclassical', 'tended'],
    unlockedBy: null,
    blurb: 'A clipped box ball in a square terracotta pot with a swag moulded round it. Portable order: put one at a doorway and the doorway becomes formal without anything else changing.',
  },
  {
    id: 'topiary-cone',
    name: 'Topiary cone',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('topiary-cone'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1 }),
    tags: ['topiary', 'clipped', 'evergreen', 'yew', 'neoclassical', 'tended'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'Yew cut to a clean cone, which takes about six years and twenty minutes a season after that. Repeat it down a walk and the walk starts marching.',
  },
  {
    id: 'topiary-sphere',
    name: 'Topiary sphere',
    group: 'decor',
    footprint: [1, 1],
    art: sprite('topiary-sphere'),
    zone: NEO,
    register: 'neoclassical',
    deposits: dep({ order: 3, maturity: 1 }),
    tags: ['topiary', 'clipped', 'evergreen', 'box', 'neoclassical', 'tended'],
    unlockedBy: null,
    growth: GROWS.shrub,
    blurb: 'A box ball on a short leg, kept round by eye rather than by string. Rounder in principle than in fact, which is what makes a hand-clipped one worth looking at.',
  },
  {
    id: 'arbour-seat',
    name: 'Garden seat under an arbour',
    group: 'decor',
    footprint: [2, 1],
    art: sprite('arbour-seat'),
    zone: NEO,
    register: 'neoclassical',
    needsDesign: true,
    designNote:
      'A seat with an overhead structure is two things at two heights in one footprint, and the depth sort cannot put a creature BETWEEN them — sit somebody on the bench and the arbour either draws over their head correctly or over their feet wrongly, depending on the tile. Wants either a two-part draw (frame behind, seat in front, occupant between) or an accepted overlap. Ships as an arbour with the seat drawn into the same sprite, so nothing can sit in it yet.',
    deposits: dep({ order: 2, seclusion: 3, maturity: 1 }),
    tags: ['seat', 'arch', 'timber', 'shade', 'quiet', 'neoclassical', 'enclosure'],
    unlockedBy: null,
    blurb: 'A bench set back into a leafy frame, so you are shaded and half-hidden while you sit. The most private place in a garden that is not actually indoors.',
  },
];

// ---------------------------------------------------------------------------
// Assembly, normalisation and the self-check.
// ---------------------------------------------------------------------------

/**
 * WHAT THE WHEEL MAY TURN. proposals/BACKLOG.md §4k, js/iso.js §FACING.
 *
 * The owner: *"there are a few tiles that you should be able to alter the
 * direction on."* A FEW — the list is deliberately short, and the test for
 * membership is not "could it be flipped" but **would flipping it visibly
 * change which way the thing is turned**.
 *
 * That rules out most of the catalogue by its own geometry. A column is a
 * cylinder, an urn is a solid of revolution, a round basin is a circle: they
 * look the same from every side and are *supposed* to, so a rotation control
 * over them is a control that visibly does nothing. The same argument the iso
 * audit had to learn about rotational forms, arriving from the other side.
 *
 * What is left are the things with a DIRECTION:
 *
 *   linear    a wall, a hedge, a bench, a balustrade — it runs along one of
 *             the two ground diagonals, and the flip swaps NE-SW for NW-SE.
 *             This is the classic isometric-builder rotate.
 *   fronted   an arch, an exedra, a niche, a wall fountain, a shelf — it has a
 *             face, and the face belongs to one of the two visible walls.
 *   a figure  a seated maiden looks somewhere.
 *
 * ONLY SQUARE FOOTPRINTS. Mirroring the screen's x axis swaps the two tile
 * axes, so a 2x1 mirrors into a 1x2 — see js/iso.js. The self-check below
 * refuses a non-square entry rather than letting it half-work, which is why
 * `cave-mouth` (2x1) is absent from a list it otherwise belongs at the top of.
 *
 * `colonnade` WAS THE OTHER NAME IN THAT SENTENCE, at 3x1, and the note read
 * as though the footprint were a fact about colonnades. It was a fact about
 * one SPRITE. The owner asked why it neither ran nor turned and the answer was
 * the same for both: it is a run, and it was drawn as a single object three
 * tiles long. One bay that joins fixes the rotate and the run together — the
 * remedy was never to teach the mirror about oblong footprints.
 */
const TURNS = new Set([
  // linear — it runs along a diagonal
  'dry-stone-wall',
  'clipped-hedge',
  'tall-hedge',
  'palisade-fence',
  'balustrade',
  'colonnade',
  'stone-bench',
  'stepped-terrace-wall',
  // fronted — it has a face, and a face belongs to a wall plane
  'hedge-arch',
  // A BARREL VAULT HAS AN AXIS. Both of these were flat pictures of arches
  // until the vault was built properly; `ruined-arch` was 2x1 and so refused
  // outright, which read as "arches cannot turn" rather than "this drawing
  // cannot".
  'ruined-arch',
  'archway',
  'pergola',
  'wall-fountain',
  'votive-shelf',
  'exedra',
  'marble-exedra',
  // it goes somewhere, or looks somewhere
  'earth-ramp',
  'stone-stair',
  'seated-maiden',
  'axe-marker',
]);

/**
 * ...AND THE ONES WITH A SECOND DRAWING, which get all four.
 *
 * `TURNS` gives two facings because two is what one drawing can honestly
 * express: the projection is symmetric about the vertical, so a horizontal
 * flip is an exact quarter-turn of the world and costs no pixels.
 *
 * A CONNECTOR NEEDS FOUR, and cannot get them that way. Mirroring turns
 * "ascends toward -tx" into "ascends toward -ty" — both of them uphill away
 * from the camera. The two that come downhill AT you are a 180-degree
 * rotation, which on screen is a horizontal flip AND a vertical one, and a
 * vertical flip is forbidden here because the light is always from the upper
 * left. So they are a second drawing, and decor.js now authors it:
 * `EARTH_RAMP.back` is the same ramp climbing the other way.
 *
 * The owner: *"ramps can go up a hill in any direction."* They could not. A
 * player who terraced a hill and wanted to climb it from the south had two of
 * the four sides available and no way to see why.
 *
 * A name here without a `back` on its art would be a wheel position that draws
 * the same picture twice, so the self-check below refuses that.
 */
const TURNS_FOUR = new Set(['earth-ramp', 'rock-scramble']);

function normalise(raw) {
  const z = raw.zone || NONE;
  const def = {
    id: raw.id,
    name: raw.name,
    group: raw.group,
    footprint: Object.freeze(raw.footprint.slice()),
    art: raw.art,
    affinities: z.aff,
    zoneClass: z.cls,
    register: raw.register ?? null,
    blocks: raw.blocks ?? (z.cls === 'nullifier' ? true : false),
    deposits: raw.deposits,
    tags: Object.freeze(raw.tags.slice()),
    unlockedBy: raw.unlockedBy ?? null,
    blurb: raw.blurb,
    ground: raw.ground ?? null,
    requires: raw.requires ?? (raw.ground === 'water' || raw.ground === 'marsh' ? 'any' : 'land'),
    growth: raw.growth ?? null,
    connector: raw.connector === true,
    // WHICH RUN THIS PIECE BELONGS TO. Two pieces join when their groups
    // match, and the group is the id unless an entry overrides it — a low
    // hedge cornering into a tall one is a design question, and same-id is
    // the answer that cannot surprise anybody. Named here explicitly because
    // this normaliser is a whitelist and a key it does not list is silently
    // dropped; see the note on `shadow` immediately below, which is the third
    // consumer in this codebase caught exactly that way.
    joins: raw.joins ?? raw.id,
    // ------------------------------------------------------------------
    // DOES THIS OBJECT CAST A CONTACT SHADOW ON THE GROUND?
    //
    // js/main.js:1255 has always passed `shadow: def.shadow` to the renderer
    // and js/render.js has always honoured `o.shadow === false`. Both halves
    // were written; the middle was not. This normaliser is an explicit
    // whitelist — "a key that is not named here is silently dropped", as the
    // note on `flatFooting` above says, having been caught by the same fault
    // — and `shadow` was not named, so `def.shadow` could never be anything
    // but `undefined` and the option was dead on arrival.
    //
    // A CONNECTOR IS GROUND. It does not stand on the tile, it IS the tile:
    // a wedge of earth or a flight of steps filling the diamond and rising to
    // meet the terrace beside it. Its silhouette has no base, and the runtime
    // stamp sized one anyway — `groundCentre` gives r = 32 on a 64px ramp, so
    // every ramp in the game sat in a dark pool wider than itself, poking out
    // at the W and E corners where the wedge is thinnest.
    //
    // Same test as everywhere else in this arc: WHICH PLANE DOES THIS SHADE
    // LIE ON? There is no gap between a ramp and the ground for a shadow to
    // fall into. `js/art/decor.js` spriteAt already argues exactly this for
    // paving — "an object that stands on the ground casts a shadow because it
    // has a base, and a paving tile does not because it has none" — and a
    // ramp is paving that climbs.
    //
    // `undefined` for everything else, deliberately: the renderer's test is
    // `=== false`, so absence means "yes, as before" and no existing object
    // changes. An entry may still say `shadow: false` for itself.
    shadow: raw.shadow !== undefined ? raw.shadow : raw.connector === true ? false : undefined,
    crossing: raw.crossing === true,
    // A place you may cross WATER on foot — the bridge, the stepping stones,
    // the rocky ford. Distinct from `connector`, which is how you cross a
    // LEVEL. js/main.js's `makePassable` documents this as the opt-in that
    // retires its hard-coded CROSSING_IDS list, so it has to survive
    // normalisation: this object is an explicit whitelist, and a key that is
    // not named here is silently dropped. It was, and the opt-in was dead.
    flatFooting: raw.flatFooting !== false,
    needsDesign: raw.needsDesign === true,
    designNote: raw.designNote ?? null,
    // Kept off the build menu until the garden turns it up. Distinct from
    // `unlockedBy`, which shows an empty slot as a promise — see the Arcadian
    // tomb, which must make no promise at all.
    hidden: raw.hidden === true,
    // How many ways round it can be placed. 1 means it does not turn, and 1 is
    // the default because most of the catalogue is rotational and would show
    // nothing. See TURNS above and js/iso.js §FACING. An entry may override
    // the list explicitly, which is how a second (back) drawing will raise one
    // of these to 4 without touching the set.
    facings: Math.max(
      1,
      Math.min(FACINGS, raw.facings ?? (TURNS_FOUR.has(raw.id) ? 4 : TURNS.has(raw.id) ? 2 : 1))
    ),
  };
  return Object.freeze(def);
}

/** How many ways round this may be placed. Anything unknown does not turn. */
export function facingsOf(def) {
  const n = def && def.facings;
  return Number.isFinite(n) && n > 1 ? Math.min(FACINGS, Math.round(n)) : 1;
}

/** Does the wheel do anything over this? */
export function turns(def) {
  return facingsOf(def) > 1;
}

export const CATALOG = Object.freeze(
  [
    ...GROUND,
    ...TERRAIN,
    ...WATER,
    ...PLANTS,
    ...TREES,
    ...SCULPTURE,
    ...TOMBS,
    ...STRUCTURE,
    ...DECOR,
  ].map(normalise)
);

const BY_ID = new Map(CATALOG.map((d) => [d.id, d]));

// --- self-check: a typo is an error at import, never a silently dead tag. ----
{
  const legal = new Set(ALL_TAGS);
  const groups = new Set(GROUPS);
  const grounds = new Set(GROUND_TYPES);
  const species = new Set(AFFINITIES);
  const registers = new Set(REGISTERS);
  const classes = new Set(['single', 'dual', 'triple', 'nullifier', 'lean', 'none']);
  const seen = new Set();

  for (const d of CATALOG) {
    const where = `catalog: ${d.id}`;
    if (!d.id || seen.has(d.id)) throw new Error(`${where}: duplicate or missing id`);
    seen.add(d.id);
    if (!d.name || !d.blurb) throw new Error(`${where}: needs a name and a real blurb`);
    if (!groups.has(d.group)) throw new Error(`${where}: unknown group '${d.group}'`);
    if (d.footprint.length !== 2 || d.footprint.some((n) => !Number.isInteger(n) || n < 1)) {
      throw new Error(`${where}: footprint must be two positive integers`);
    }
    if (!d.art || (d.art.kind !== 'grow' && d.art.kind !== 'sprite')) {
      throw new Error(`${where}: art.kind must be 'grow' or 'sprite'`);
    }
    // Only a SQUARE thing may turn. A horizontal flip swaps the two tile axes,
    // so a 2x1 mirrors into a 1x2 — which means transposing the footprint
    // through canPlace, the collision test and the depth key. That work is not
    // done, and half-doing it would put objects through each other, so this
    // refuses at import rather than at play. js/iso.js §FACING.
    if (d.facings > 1 && d.footprint[0] !== d.footprint[1]) {
      throw new Error(
        `${where}: facings ${d.facings} on a ${d.footprint.join('x')} footprint. ` +
          `Mirroring swaps the tile axes, so only square footprints may turn yet.`
      );
    }
    for (const axis of AXES) {
      const v = d.deposits[axis];
      if (!Number.isInteger(v) || v < -3 || v > 3) {
        throw new Error(`${where}: deposits.${axis} must be an integer in [-3,3]`);
      }
    }
    if (Object.keys(d.deposits).length !== AXES.length) {
      throw new Error(`${where}: deposits must carry exactly the five axes`);
    }
    if (!classes.has(d.zoneClass)) throw new Error(`${where}: unknown zoneClass '${d.zoneClass}'`);
    for (const [k, v] of Object.entries(d.affinities)) {
      if (!species.has(k)) throw new Error(`${where}: unknown affinity '${k}'`);
      if (!Number.isFinite(v) || v < -1 || v > 1) {
        throw new Error(`${where}: affinity ${k}=${v} must be a number in [-1,1]`);
      }
    }
    // Breadth costs strength: the three real classes carry their exact weight,
    // and nothing else may quietly out-weigh a single.
    const w = Object.values(d.affinities);
    const expect = { single: [1, WEIGHTS.single], dual: [2, WEIGHTS.dual], triple: [3, WEIGHTS.triple] }[d.zoneClass];
    if (expect) {
      if (w.length !== expect[0] || w.some((v) => v !== expect[1])) {
        throw new Error(`${where}: a ${d.zoneClass} must be ${expect[0]} × ${expect[1]}`);
      }
    } else if (w.some((v) => Math.abs(v) > WEIGHTS.lean)) {
      throw new Error(`${where}: a '${d.zoneClass}' may not weigh more than a lean`);
    }
    if (d.zoneClass === 'nullifier' && !d.blocks) {
      throw new Error(`${where}: a nullifier must block`);
    }
    if (d.register !== null && !registers.has(d.register)) {
      throw new Error(`${where}: unknown register '${d.register}'`);
    }
    if (d.tags.length === 0) throw new Error(`${where}: needs at least one tag`);
    for (const t of d.tags) {
      if (!legal.has(t)) throw new Error(`${where}: unknown tag '${t}' — add it to TAGS`);
    }
    // js/world.js reads `connector` as a licence to straddle a change of level.
    if (d.tags.includes('connector') !== d.connector) {
      throw new Error(`${where}: the 'connector' tag and the connector flag must agree`);
    }
    if (d.ground !== null && !grounds.has(d.ground)) {
      throw new Error(`${where}: unknown ground type '${d.ground}'`);
    }
    if (!['land', 'water', 'any'].includes(d.requires)) {
      throw new Error(`${where}: requires must be land|water|any`);
    }
    if (d.needsDesign && !d.designNote) {
      throw new Error(`${where}: needsDesign without a note is a shrug, not a flag`);
    }
    if (d.growth) {
      const { stages, at } = d.growth;
      if (!Array.isArray(stages) || stages.length !== at.length) {
        throw new Error(`${where}: growth.stages and growth.at must be the same length`);
      }
    }
  }

  // Every declared tag must be carried by something, or it is a dead string
  // that a creature requirement could be written against and never fire.
  const carried = new Set(CATALOG.flatMap((d) => d.tags));
  const dead = ALL_TAGS.filter((t) => !carried.has(t));
  if (dead.length) throw new Error(`catalog: tags nothing carries: ${dead.join(', ')}`);

  // DECOR.md Part I is a fixed census. If a wave adds a thirteenth single or
  // drops a nullifier, that is a design decision and it should be a loud one.
  const count = (cls) => CATALOG.filter((d) => d.zoneClass === cls).length;
  const CENSUS = { single: 12, dual: 12, triple: 4 };
  for (const [cls, n] of Object.entries(CENSUS)) {
    if (count(cls) !== n) {
      throw new Error(`catalog: DECOR.md wants ${n} ${cls} pieces; there are ${count(cls)}`);
    }
  }
  // The five named nullifiers of Part I must exist and must block. The hedge
  // family in Part II adds two more (tall hedge, hedge arch) and a weak one
  // (the balustrade), which is growth rather than drift — so the five are
  // checked by name and the total is left free.
  for (const id of ['herm', 'dry-stone-wall', 'clipped-hedge', 'cypress-screen', 'gravel-walk']) {
    const d = BY_ID.get(id);
    if (!d || !d.blocks) throw new Error(`catalog: '${id}' is a Part I nullifier and must block`);
  }

  // docs/TOMBS.md is five structures, and both halves of the mechanic are
  // properties of the entry rather than of some other file, so both are checked
  // here. A tomb that stopped blocking would silently become an ordinary
  // ornament; a tomb that stopped depositing maturity would silently become
  // nothing at all.
  const tombs = CATALOG.filter((d) => d.tags.includes('tomb'));
  if (tombs.length !== 5) {
    throw new Error(`catalog: docs/TOMBS.md is five structures; there are ${tombs.length}`);
  }
  for (const d of tombs) {
    if (!d.blocks) throw new Error(`catalog: '${d.id}' is a tomb — nothing grows on a grave`);
    if (!(d.deposits.maturity > 0)) {
      throw new Error(`catalog: '${d.id}' is a tomb and must grant maturity — a tomb IS a past`);
    }
    if (Object.keys(d.affinities).length) {
      throw new Error(`catalog: '${d.id}' is a nullifier; its affinity could never leave its tiles`);
    }
  }
  if (CATALOG.filter((d) => d.hidden).length !== 1) {
    throw new Error('catalog: exactly one placeable is hidden, and it is the Arcadian tomb');
  }
}

// ---------------------------------------------------------------------------
// THE TOMBS — epitaphs, tending, and the one thing the player is never told
// ---------------------------------------------------------------------------

/** The five of docs/TOMBS.md, in the order the doc lists them. */
export const TOMB_IDS = Object.freeze(CATALOG.filter((d) => d.tags.includes('tomb')).map((d) => d.id));

/** True for the five funerary structures and nothing else. */
export function isTomb(def) {
  return !!(def && def.tags && def.tags.includes('tomb'));
}

/**
 * THE EPITAPHS.
 *
 * Curated, verbatim from docs/TOMBS.md, and NEVER procedurally generated. The
 * register is terse, concrete, and frequently addressed to the passer-by or
 * spoken by the dead; the pathos is entirely in the plainness. That voice is
 * far too easy to get wrong by machine, and mush is worse than silence.
 *
 * Several are quietly tuned to the denizens — the horses for the centaur, the
 * pipes for the satyr and for Pan, the river and the channel for the naiad — so
 * a tomb placed in the right glade can land as though it belonged to somebody
 * who lived there. That is the whole reason the list is hand-written: a
 * generator cannot know that this garden has horses in it.
 */
export const EPITAPHS = Object.freeze([
  'He planted the tree you are standing under.',
  'Stranger: I also stood where you are standing.',
  'She kept bees. The bees are still here.',
  'Of him nothing is known but the running.',
  'This one was good with horses.',
  'He heard the pipes once, and never after.',
  'Nobody remembers her name. The ground does.',
  'He asked for water and was given it.',
  'She was not famous. She was here first.',
  'Tell them below that I did as I was told.',
  'He was quick, and it did not help.',
  'Here lies one who was loved by a river.',
  'She dug the channel. It still runs.',
  'He was owed a kindness and never collected it.',
  'Two hands, forty years, one wall.',
  'She laughed at the wrong time, often.',
  'He is the reason for the bend in the path.',
  'Passer-by: it is cooler here. That was deliberate.',
  'She knew the names of all of them.',
  'He waited. That was the whole of it.',
]);

/** A small integer hash. Stable across sessions, which is the entire point. */
function mixUid(n) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Assign an epitaph to every tomb on the map, without repeat.
 *
 * Takes the tomb uids and returns `Map<uid, string>`. It is a PURE FUNCTION OF
 * THE SET, not a stateful allocator, and that is deliberate: a garden is saved
 * and reloaded constantly, world.js does not store an epitaph on the object,
 * and an allocator that handed them out in call order would give a tomb a
 * different epitaph every time the page was refreshed. A verse that changes
 * when you look away is worse than no verse.
 *
 * Each uid hashes to a starting index and probes forward for the first free
 * slot, taken in ascending uid order. Twenty epitaphs and (in practice) a
 * handful of tombs means collisions are rare and resolve identically every
 * time. Past twenty tombs the list is exhausted and repeats begin, which is
 * the honest behaviour: the curated list is twenty long and there is no
 * twenty-first line worth having.
 */
export function epitaphsFor(uids) {
  const out = new Map();
  const taken = new Set();
  const list = [...uids].filter((u) => Number.isFinite(u)).sort((a, b) => a - b);
  for (const uid of list) {
    let i = mixUid(uid) % EPITAPHS.length;
    for (let probe = 0; probe < EPITAPHS.length && taken.has(i); probe++) {
      i = (i + 1) % EPITAPHS.length;
    }
    taken.add(i);
    if (taken.size >= EPITAPHS.length) taken.clear(); // past twenty, go round again
    out.set(uid, EPITAPHS[i]);
  }
  return out;
}

/**
 * TENDING. docs/TOMBS.md: "A tomb with votive items, flowers, or a libation
 * altar within 2 tiles grants its full maturity bonus; a neglected one grants
 * roughly half."
 *
 * Hero cult was a practice, not a monument — offerings were left — so this is
 * the one object in the game that asks to be looked after. It asks gently, and
 * the asymmetry is absolute: A NEGLECTED GRAVE IS NEVER A PENALTY, ONLY A
 * SMALLER GIFT. Half of a generous deposit is still a gift. SPEC §0 does not
 * bend for atmosphere.
 */
export const TOMB_TENDING = Object.freeze({
  radius: 2,
  /** Half. Which is a gift, not a fine. */
  neglectedShare: 0.5,
  /**
   * What counts as an offering. `votive` covers the votive shelf, the herm, the
   * grotto niche and the altar to Pan and the Nymphs — the libation altar the
   * doc names is a `votive` object and did not need a tag of its own. The three
   * flower tags cover everything a person would actually leave at a grave,
   * including the white-blossom thorn, which carries no `flower` tag but is
   * exactly the plant you would plant.
   */
  tags: Object.freeze(['votive', 'flower', 'white-flower', 'blossom']),
});

/** Does this placeable count as an offering left near a grave? */
export function isOffering(def) {
  if (!def || !def.tags) return false;
  if (isTomb(def)) return false; // a tomb does not tend itself, or its neighbour
  return def.tags.some((t) => TOMB_TENDING.tags.includes(t));
}

/**
 * Is there an offering within two tiles of this tomb?
 *
 * `world` needs `objects` (or `objectAt`) and nothing else, so this is callable
 * from a test, from the playtest harness and from the running game without any
 * of them agreeing on anything but the world's public shape. Distance is
 * measured between FOOTPRINTS, not origins — a 2x2 heroon whose corner is two
 * tiles from a lily bed is tended, and measuring from origins would make the
 * bigger tombs quietly harder to keep.
 */
export function tombTended(world, obj, def) {
  if (!world || !obj) return false;
  const d = def || BY_ID.get(obj.id);
  if (!isTomb(d)) return false;
  const objects = world.objects || [];
  const [fw, fh] = d.footprint;
  const r = TOMB_TENDING.radius;
  for (const other of objects) {
    if (other === obj || other.uid === obj.uid) continue;
    const od = BY_ID.get(other.id);
    if (!isOffering(od)) continue;
    const [ow, oh] = od.footprint;
    // Chebyshev gap between two rectangles: zero when they touch.
    const dx = Math.max(0, Math.max(obj.tx - (other.tx + ow - 1), other.tx - (obj.tx + fw - 1)));
    const dy = Math.max(0, Math.max(obj.ty - (other.ty + oh - 1), other.ty - (obj.ty + fh - 1)));
    if (Math.max(dx, dy) <= r) return true;
  }
  return false;
}

/**
 * Reconcile every tomb's maturity deposit with whether it is being tended.
 *
 * `fields.placements` is the live list the field holds, each entry carrying the
 * `uid`, `tags` and `deposits` js/main.js's bridge copied off the catalogue, and
 * `fields.setStage(p, stage, deposits)` is the supported way to change a
 * placement's weights in place — it removes, re-stamps and re-floods, exactly
 * as a plant maturing does. So the whole rule is a few lines and needs no new
 * machinery anywhere.
 *
 * Idempotent and cheap: it costs one pass over the placement list, and it only
 * ever touches the field when a tomb's tending has actually changed. Returns
 * the number of tombs it re-stamped, which is 0 on almost every call.
 *
 * THE SEAM, named honestly. The natural caller is js/main.js, which owns the
 * bridge and already subscribes to world edits — one line beside the existing
 * `grow` case would be the tidiest home for it. That file is not mine this
 * wave, so js/ui.js drives it from the same quarter-second tick that refreshes
 * the journal. It is the wrong owner and the right behaviour; when main.js
 * next opens, move the call and delete four lines of ui.js.
 */
export function retendTombs(world, fields) {
  if (!world || !fields || !Array.isArray(fields.placements)) return 0;
  let changed = 0;
  for (const p of [...fields.placements]) {
    if (!p || !p.tags || p.tags.indexOf('tomb') === -1) continue;
    const obj = typeof world.objectByUid === 'function' ? world.objectByUid(p.uid) : null;
    if (!obj) continue;
    const def = BY_ID.get(obj.id);
    if (!def) continue;
    const full = def.deposits.maturity || 0;
    const want = tombTended(world, obj, def) ? full : full * TOMB_TENDING.neglectedShare;
    const have = (p.deposits && p.deposits.maturity) || 0;
    if (Math.abs(have - want) < 1e-9) continue;
    const next = { ...def.deposits, maturity: want };
    if (typeof fields.setStage === 'function') fields.setStage(p, p.stage, next);
    else p.deposits = next;
    changed++;
  }
  return changed;
}

/**
 * THE HIDDEN TOMB.
 *
 * docs/TOMBS.md: "It is found — unlocked once the glade is deeply mature and at
 * least one other tomb has stood tended for a long while."
 *
 * Both halves are read off ONE tomb, not off the map in general, because the
 * sentence is about a place and not about a statistic: some grave in your
 * garden has been kept, and the ground around it has gone old. That is a corner
 * of a glade a player built on purpose, and it is the right thing to reward.
 *
 * THE GROUND ROUND IT, NOT THE GROUND UNDER IT. A tomb is a nullifier, and
 * js/fields.js's `_crossable` refuses entry to a blocked tile as well as exit
 * from one — so nothing any other object deposits can ever reach a grave's own
 * square, and a reading taken there is the tomb's own deposit and the ambient
 * and nothing else. Measured in the running game: a stele ringed by twelve
 * maturity-3 ruins still read 2.29 on its own tile. So the sample is the ring
 * of tiles immediately outside the footprint, which is both the only reading
 * that can move and the one the sentence actually meant.
 *
 * `maturity` is on the same scale js/creatures.js bands against, so the numbers
 * are calibrated against the one creature they have to sit beside: Pan settles
 * at maturity 8 and thrives at 12. Ten puts this find past the capstone's gate
 * and short of its ceiling — deep in the endgame, and reachable without
 * chasing it.
 */
export const ARCADIAN_UNLOCK = Object.freeze({
  id: 'arcadian-tomb',
  /** Maturity at the tomb's own tile. Pan settles at 8 and thrives at 12. */
  maturity: 10,
  /** Garden-days the tomb must have stood. world.js's DAY_MS is two minutes. */
  days: 12,
});

/**
 * Has the glade turned the Arcadian tomb up yet?
 *
 * Returns true when some tomb — any of the other four — has stood for
 * ARCADIAN_UNLOCK.days, is being tended right now, and is standing on ground
 * whose maturity has reached ARCADIA_UNLOCK.maturity.
 *
 * `sampleMaturity(tx, ty)` is passed in rather than reached for, so this stays
 * pure and testable; the caller supplies `fields.at('maturity', tx, ty)`.
 *
 * NOTE, and it is a deliberate simplification: "has stood TENDED a long while"
 * is checked as "is tended now, and is old", because nothing in the save
 * records how long an object has had flowers by it. Storing that would mean a
 * new per-object field owned by js/world.js. The approximation is generous in
 * the player's favour — you can tend an old grave today and find the tomb — and
 * generous in the player's favour is the correct direction for every rounding
 * decision in this game.
 */
export function arcadianTombFound(world, sampleMaturity) {
  if (!world || typeof sampleMaturity !== 'function') return false;
  const objects = world.objects || [];
  for (const obj of objects) {
    const def = BY_ID.get(obj.id);
    if (!isTomb(def) || def.hidden) continue;
    const age = typeof world.ageDays === 'function' ? world.ageDays(obj) : 0;
    if (!(age >= ARCADIAN_UNLOCK.days)) continue;
    if (!tombTended(world, obj, def)) continue;
    const [fw, fh] = def.footprint;
    let best = -Infinity;
    for (let y = -1; y <= fh; y++) {
      for (let x = -1; x <= fw; x++) {
        if (x >= 0 && x < fw && y >= 0 && y < fh) continue; // the grave itself
        const v = Number(sampleMaturity(obj.tx + x, obj.ty + y));
        if (Number.isFinite(v) && v > best) best = v;
      }
    }
    if (best >= ARCADIAN_UNLOCK.maturity) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/** The placeable with this id, or undefined. */
export function byId(id) {
  return BY_ID.get(id);
}

/** Every placeable in a group, in catalogue order. */
export function byGroup(group) {
  return CATALOG.filter((d) => d.group === group);
}

/** Every placeable carrying a tag. */
export function byTag(tag) {
  return CATALOG.filter((d) => d.tags.includes(tag));
}

/** Every placeable that argues for this species, strongest first. */
export function byAffinity(species) {
  return CATALOG.filter((d) => (d.affinities[species] || 0) > 0).sort(
    (a, b) => b.affinities[species] - a.affinities[species]
  );
}

/** Every occluder — hedges, walls, the herm, the gravel walk. */
export function nullifiers() {
  return CATALOG.filter((d) => d.blocks);
}

/** Every ramp, stair and scramble. js/world.js also detects these itself. */
export function connectors() {
  return CATALOG.filter((d) => d.connector);
}

/** True if this placeable paints tiles rather than standing on them. */
export function isGroundPainter(def) {
  return !!(def && def.ground);
}

/** True if influence may not propagate through this placeable's tiles. */
export function blocksInfluence(def) {
  return !!(def && def.blocks);
}

/** Tiles this placeable would occupy at (tx, ty). */
export function footprintTiles(def, tx, ty) {
  const out = [];
  for (let y = 0; y < def.footprint[1]; y++) {
    for (let x = 0; x < def.footprint[0]; x++) out.push([tx + x, ty + y]);
  }
  return out;
}

/** Growth stage name for an age in garden-days, or null for inert things. */
export function stageFor(def, ageDays) {
  if (!def || !def.growth) return null;
  const { stages, at } = def.growth;
  let i = 0;
  for (let k = 0; k < at.length; k++) if (ageDays >= at[k]) i = k;
  return stages[i];
}

/** Creature ids that gate content, and what each one opens. */
export function unlockGraph() {
  const out = new Map();
  for (const d of CATALOG) {
    if (!d.unlockedBy) continue;
    if (!out.has(d.unlockedBy)) out.set(d.unlockedBy, []);
    out.get(d.unlockedBy).push(d.id);
  }
  return out;
}

/** Placeables available before any creature has settled. */
export function starterSet() {
  return CATALOG.filter((d) => d.unlockedBy === null);
}

/**
 * Everything shipped as a placeholder, with the reason. Read this before
 * calling the decor set finished — and delete an entry only by solving it.
 */
export function needsDesign() {
  return CATALOG.filter((d) => d.needsDesign).map((d) => ({
    id: d.id,
    name: d.name,
    group: d.group,
    note: d.designNote,
  }));
}

/**
 * The art debt: every entry drawing with an understudy, and the sprite it is
 * waiting for. When a wanted sprite exists, swap `art.sprite` to it here.
 */
export const ART_WISHLIST = Object.freeze(
  CATALOG.filter((d) => d.art.wanted).map((d) =>
    Object.freeze({
      id: d.id,
      wanted: d.art.wanted,
      drawnBy: d.art.kind === 'sprite' ? d.art.sprite : `grow:${d.art.composer}`,
    })
  )
);

/** Counts by group — used by tools/playtest.mjs and the report. */
export function census() {
  const out = {};
  for (const g of GROUPS) out[g] = 0;
  for (const d of CATALOG) out[d.group]++;
  out.total = CATALOG.length;
  return out;
}

/** Counts by zoning class — the DECOR.md Part I census, plus the decor layer. */
export function zoneCensus() {
  const out = { single: 0, dual: 0, triple: 0, nullifier: 0, lean: 0, none: 0 };
  for (const d of CATALOG) out[d.zoneClass]++;
  out.archaic = CATALOG.filter((d) => d.register === 'archaic').length;
  out.neoclassical = CATALOG.filter((d) => d.register === 'neoclassical').length;
  out.total = CATALOG.length;
  return out;
}
