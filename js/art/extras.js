// extras.js — the two props the catalogue asks for that no art module owns.
//
// Written at the integration seam, not by an art owner: `js/catalog.js` names
// sixty placeables and `js/art/props.js` authors twenty-two sprites, and after
// every near-miss in the two vocabularies was reconciled (mask-idol ->
// satyr-mask-pole, fallen-torso -> marble-torso, pithos ->
// half-buried-pithos, ...) exactly two placeables were left with no shape at
// all. Both are load-bearing:
//
//   palisade-fence  carries the `enclosure` tag, which is one half of the
//                   design thesis — the unicorn REQUIRES an enclosure within 3
//                   tiles and the satyr FORBIDS one within 6. An enclosure the
//                   player cannot see is not an enclosure.
//   seated-maiden   is the only `maiden` in the game.
//
// Same conventions as props.js: literal palette keys, light from the upper
// left, contact skirt baked in the GRASS ramp as 'm' so the renderer's
// variant({grass:'earth'}) recolours it on soil for free, anchor given as
// [dx, upFromBottom] so adding a row cannot move an object's feet.
//
// DOM-free. Imports cleanly in Node.

import { defineSprite } from './format.js';

function sprite(name, [dx, up], rows, opts = {}) {
  const w = Math.max(...rows.map((r) => r.length));
  return defineSprite({
    name,
    anchor: [((w - 1) >> 1) + dx, rows.length - 1 - up],
    rows: rows.map((r) => r.padEnd(w, '.')),
    footprint: opts.footprint || [1, 1],
    tags: opts.tags || [],
    cycle: opts.cycle || null,
  });
}

// ===========================================================================
// PALISADE FENCE
//
// Split-timber stakes, pointed, wired to two rails. The one thing that has to
// be right is that it runs ALONG A TILE EDGE — 2 across for 1 down — because a
// fence that ignores the isometric grid is the loudest possible tell that the
// artist drew it flat and rotated it. Every stake therefore steps down 2 rows
// per 5 columns, which is the 2:1 diamond slope to within a pixel over the run.
//
// Earth ramp: q outline, r shade, s core, t lit, u top. The lit face of a round
// post is one column in from its left edge, not on the edge (props.js's
// rounded-form law) — so the profile across a 3px stake is t s r, and the tip
// steps in from the left as it narrows.
// ===========================================================================

const STAKE_X = [0, 5, 10, 15, 20]; // 5 stakes, 5px apart along the tile edge
const STAKE_H = 13; // tip to ground
const RUN = 23; // the fence's own horizontal run
const FENCE_W = 24;
const FENCE_H = 25;
const slope = (x) => Math.round((x * 2) / 5); // 2 down per 5 across
const baseAt = (x) => STAKE_H + slope(x); // stake 0's tip lands on row 0

function palisadeRows() {
  const g = Array.from({ length: FENCE_H }, () => new Array(FENCE_W).fill('.'));
  const put = (x, y, k) => {
    if (x >= 0 && x < FENCE_W && y >= 0 && y < FENCE_H) g[y][x] = k;
  };


  // Then the two rails, so the stakes draw over them and read as in front.
  // Each rail follows the same 2:5 slope and is 2px deep — a rail seen very
  // nearly edge-on, which is all a rail is at this size.
  for (const drop of [4, 9]) {
    for (let x = 0; x < RUN; x++) {
      const y = baseAt(x) - drop;
      put(x, y, 't');
      put(x, y + 1, 'r');
    }
  }

  // Stakes last, over the rails.
  STAKE_X.forEach((x0) => {
    const base = baseAt(x0);
    const tip = base - STAKE_H;
    // The point: two rows narrowing to a single lit pixel.
    put(x0 + 1, tip, 't');
    put(x0, tip + 1, 't');
    put(x0 + 1, tip + 1, 's');
    for (let y = tip + 2; y <= base; y++) {
      put(x0, y, 't');
      put(x0 + 1, y, 's');
      put(x0 + 2, y, 'r');
    }
    // Where it enters the ground: one row of the darkest earth, so the stake
    // is planted rather than resting on the grass.
    put(x0, base + 1, 'q');
    put(x0 + 1, base + 1, 'q');
  });

  return g.map((r) => r.join('').replace(/\.+$/, '') || '.');
}

export const PALISADE_FENCE = sprite('palisade-fence', [0, 6], palisadeRows(), {
  tags: ['structure', 'enclosure', 'timber'],
});

// ===========================================================================
// SEATED MAIDEN
//
// A small votive kore, seated on her own block, hands in her lap. Read against
// the props.js lessons rather than invented fresh:
//
//   * Marble's problem is never too little highlight, it is too little DARK.
//     The hair, the neck under the chin, the band beneath the arms and the
//     underside of the lap are all 'A'/'B'. Without them a marble head at this
//     size is a featureless pale ball, which is what the first pass was.
//   * Shade ACROSS the form. A seated figure's long axis is vertical, so the
//     banding runs left-to-right per row: lit edge 'D', core 'E' a third in,
//     falling through 'C' to 'B' and an 'A' outline on the shadow side.
//   * The silhouette does the identifying. Three events carry it: the small
//     head, the notch of the neck, and the lap breaking forward to the right
//     as a horizontal shelf. Seated is a SHAPE, not a pose you can shade in.
// ===========================================================================

export const SEATED_MAIDEN = sprite(
  'seated-maiden',
  [0, 2],
  [
    '......BAAB......',
    '.....BADDAB.....', // hair, parted, dark against the face
    '.....ADEEDA.....',
    '.....ADEEDA.....', // face, lit from the upper left
    '.....BACCAB.....', // neck in shadow — the notch that makes it a head
    '....BCDDDCCB....',
    '...BCDEEDDCCB...', // shoulders
    '...ACDEEDDCCBA..',
    '...ACDEEEDDCBA..',
    '...ACDDEDDDCBA..',
    '...ABCDEDDCCBA..', // arms held in, drapery folds start
    '...ABCDEDDCCBA..',
    '...ABCDDDDCCBA..',
    '..ABCDDEDDCCCBA.', // waist
    '..ABCDDEDDDCCBA.',
    '..ABCDDDDDDCCBA.',
    '.ABCDDEEDDDCCBBA', // the lap breaks forward to the right
    '.ABCDDEEEDDCCBBA',
    '.ABCDDEEEDDDCBBA',
    '.AABCCDDDDDCCBAA',
    '..AABBCCCCCBBAA.', // hem of the drapery, in shadow
    '...AABBBBBBBAA..',
    '..ABCDDDDDDDCBA.', // the block: top face lit
    '..ABCDDDDDDDCBA.',
    '..ABBCCCCCCCBBA.',
    '..ABBBBBBBBBBAA.', // front face of the block, a step darker
    '...AAAAAAAAAA...',
    '...mmmmmmmmmm...', // contact skirt, grass ramp
    '....mmmmmmmm....',
  ],
  { tags: ['sculpture', 'marble', 'maiden'] }
);

export const EXTRAS = Object.freeze({
  'palisade-fence': PALISADE_FENCE,
  'seated-maiden': SEATED_MAIDEN,
});

export default EXTRAS;
