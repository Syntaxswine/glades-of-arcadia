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

import { defineSprite, foot, LINE_W, LINE_DROP } from './format.js';

/** The marble ramp's keys, darkest first — the same letters props.js uses. */
const MARBLE = 'ABCDE';

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
// Split-timber stakes, pointed, wired to two rails.
//
// ---------------------------------------------------------------------------
// IT WAS NEITHER OF THE TWO THINGS ITS OWN HEADER SAID IT WAS.
//
// The header read: "The one thing that has to be right is that it runs ALONG A
// TILE EDGE — 2 across for 1 down ... Every stake therefore steps down 2 rows
// per 5 columns, which is the 2:1 diamond slope to within a pixel over the
// run." Two-in-five is 0.4. The projection's slope is 0.5. Over the fence's own
// 23 columns that is two and a half rows off true, and the sentence stating the
// requirement and the line violating it were four lines apart.
//
// And 23 px of run on a 32 px tile means A ROW OF FENCES IS A DOTTED LINE. Put
// five down and you get five separate little fences with grass between them.
// props.js had already learned this exact lesson on the drystone wall — "it
// used to be a 24px stub, which meant a row of them left gaps — visibly not a
// barrier, which is FATAL FOR AN OCCLUDER" — and the palisade is an occluder
// too: js/fields.js stops influence at it, and the player is looking through a
// hole. The lesson was learned for one sprite and never carried to its sibling.
//
// Both numbers now come from format.js, so neither can drift again. Six stakes
// at `round(i * 32 / 6)` — 0, 5, 11, 16, 21, 27 — which keeps the original
// density AND lands the next tile's first stake exactly 5 px past the last, so
// the rhythm crosses the joint without a doubled post.
//
// Found with tools/joinshot.mjs, which is the only probe here that draws
// pieces TOUCHING. Every other one spaces its subjects out, and a fence spaced
// out from itself looks fine.
// ---------------------------------------------------------------------------
//
// Earth ramp: q outline, r shade, s core, t lit, u top. The lit face of a round
// post is one column in from its left edge, not on the edge (props.js's
// rounded-form law) — so the profile across a 3px stake is t s r, and the tip
// steps in from the left as it narrows.
// ===========================================================================

const STAKES = 6; // per tile
/** Stake feet along the run, spaced so the rhythm continues across the joint. */
const STAKE_X = Array.from({ length: STAKES }, (_, i) => Math.round((i * (LINE_W - 1)) / STAKES));
const STAKE_H = 13; // tip to ground
const RUN = LINE_W - 1; // 32 px of run; the 33rd column is the overlap
const FENCE_W = LINE_W;
const baseAt = (x) => STAKE_H + LINE_DROP(x); // stake 0's tip lands on row 0
// Exactly as tall as the last stake's planted row, so there are no dead rows
// under it. `up` in the anchor is measured from the bottom, so a sprite with
// slack at the bottom is a sprite whose anchor arithmetic has a fudge in it.
const FENCE_H = baseAt(STAKE_X[STAKES - 1]) + 2;

function palisadeRows() {
  const g = Array.from({ length: FENCE_H }, () => new Array(FENCE_W).fill('.'));
  const put = (x, y, k) => {
    if (x >= 0 && x < FENCE_W && y >= 0 && y < FENCE_H) g[y][x] = k;
  };


  // Then the two rails, so the stakes draw over them and read as in front.
  // Each rail follows the tile edge's own slope and is 2px deep — a rail seen
  // very nearly edge-on, which is all a rail is at this size. It runs the FULL
  // width including the overlap column, so two pieces meet rail to rail.
  for (const drop of [4, 9]) {
    for (let x = 0; x < FENCE_W; x++) {
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

/**
 * The anchor sits at the MIDPOINT OF THE RUN — column 16, on the ground line
 * the stakes are planted in — because that is the pixel a linear piece puts on
 * its tile's centre. With it there, a fence at tile (t+1, u) draws its first
 * stake exactly where this one's 33rd column falls, at exactly the row this
 * one's rail has reached. That is not a tuning: it is `LINE_W` and `LINE_DROP`
 * doing what they say, and it is checkable — `node tools/joinshot.mjs --ids
 * palisade-fence`.
 */
export const PALISADE_FENCE = sprite(
  'palisade-fence',
  [0, FENCE_H - 1 - (STAKE_H + LINE_DROP(RUN / 2))],
  palisadeRows(),
  { tags: ['structure', 'enclosure', 'timber'] }
);

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

/**
 * ...AND THE SKIRT STEP 3 MISSED.
 *
 * This sprite ended with two rows of solid `'m'`. `'m'` is `SHADOW_KEY` and it
 * is also `GRASS[0]`, so a baked contact shadow is GRASS-GREEN WHEREVER THE
 * OBJECT STANDS — a green mat under a marble kore set on flagstone. Step 3
 * deleted forty-three `skirt()` calls, fifty-three typed bands and thirty
 * hand-rolled ones across props.js and decor.js, and swept this file too, but
 * only its palisade loop: these two rows are typed into a literal sprite in a
 * module the sweep had already visited.
 *
 * The rule, restated because it is the whole of it: **which plane does this
 * shade lie on?** The world ground is the renderer's — js/render.js draws every
 * object's contact in its own pass, sized from the art and coloured from the
 * tile beneath. Only a surface of THIS OBJECT is the art's.
 *
 * What replaces them is what belongs there: her block is a square block, and
 * the bottom of a square block in this projection is the front half of a
 * diamond. The anchor does not move — it stays on the block's last full row,
 * which is the base diamond's CENTRE, and the foot hangs below it.
 */
export const SEATED_MAIDEN = sprite(
  'seated-maiden',
  [0, 3],
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
    '...AAAAAAAAAA...', // the anchor row: the base diamond's centre line
    ...foot(10, MARBLE, 3), // ...and its front half, in the ground plane
  ],
  { tags: ['sculpture', 'marble', 'maiden'] }
);

export const EXTRAS = Object.freeze({
  'palisade-fence': PALISADE_FENCE,
  'seated-maiden': SEATED_MAIDEN,
});

export default EXTRAS;
