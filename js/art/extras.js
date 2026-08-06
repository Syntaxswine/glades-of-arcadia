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

import { defineSprite, foot, LINE_W, LINE_DROP, axialJoins } from './format.js';
import { JOIN_DIRS, JOIN_MASKS, joinAxis } from '../iso.js';

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

// ---------------------------------------------------------------------------
// ...AND THEN IT LEARNED TO TURN A CORNER.
//
// The straight piece above joined perfectly in both directions and still made
// an X where two runs met: each tile drew a finished bar, so the bar on the
// corner tile carried on past the turn and its end stuck out as a spike.
//
// So the fence is no longer a BAR. It is a HUB AND UP TO FOUR ARMS, each arm a
// half-tile reach from the tile's own centre toward one neighbour, and the
// sixteen connection states are generated from one function rather than drawn
// sixteen times. A straight run is the {E,W} mask and comes out byte for byte
// the same rhythm it had before; a corner is {W,S}; a T is three arms; the
// cross is four. None of them can disagree with each other about the pitch of
// a rail or the spacing of a stake, because there is only one arm.
//
// THE ARM VECTORS, which are just the projection: half a tile step is 16 px
// across and 8 down, and the four tile directions put those together four ways.
//
//     +tx  (+16, +8)      -tx  (-16, -8)
//     +ty  (-16, +8)      -ty  (+16, -8)
//
// Stakes at 3, 8 and 13 px along each arm — never AT the centre, so the hub can
// carry its own corner post the way a real fence does, and so a straight run
// keeps a 5-6 px rhythm that crosses the tile joint without a doubled post.
// ---------------------------------------------------------------------------

const HALF = (LINE_W - 1) / 2; // 16 px: half a tile step across
const STAKE_H = 13; // tip to ground
/** How far along an arm each stake stands. Not 0 — the hub owns the centre. */
const STAKE_AT = [3, 8, 13];
const CX = HALF + 1; // the tile centre, with room for a stake's 3px body
const CY = STAKE_H + Math.round(HALF / 2); // ...on the ground line the run sits in
const FENCE_W = CX + HALF + 3;
const FENCE_H = CY + Math.round(HALF / 2) + 2;

/** Screen offset `i` px along an arm, from the tile centre. */
function armStep(dtx, dty, i) {
  // +tx is (+32, +16) per tile and +ty is (-32, +16), so the x sign is the
  // difference of the two and the y sign is their sum — which for a single
  // orthogonal step is just dtx - dty and dtx + dty.
  const sx = dtx - dty;
  const sy = dtx + dty;
  return { x: CX + sx * i, y: CY + sy * LINE_DROP(i) };
}

function stake(put, x0, base) {
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
  // Where it enters the ground: one row of the darkest earth, so the stake is
  // planted rather than resting on the grass.
  put(x0, base + 1, 'q');
  put(x0 + 1, base + 1, 'q');
}

/**
 * One palisade piece for a connection mask. `mask` is js/iso.js's — bit 1 is
 * the +tx neighbour, 2 is +ty, 4 is -tx, 8 is -ty.
 */
function palisadeRows(mask) {
  const g = Array.from({ length: FENCE_H }, () => new Array(FENCE_W).fill('.'));
  const put = (x, y, k) => {
    if (x >= 0 && x < FENCE_W && y >= 0 && y < FENCE_H) g[y][x] = k;
  };
  const armIdx = JOIN_DIRS.map((d, i) => i).filter((i) => mask & JOIN_DIRS[i][2]);
  // A piece with no neighbours at all is still a fence, not a lone post: it
  // draws the straight run, and js/main.js lets the facing wheel decide which
  // diagonal that is. Anything else would make the first piece a player places
  // look like a mistake until they placed the second.
  //
  // AND AN END DRAWS BOTH WAYS, for the same reason and by the same rule as
  // `joinedPiece` in art/format.js — see the long note there. THE PALISADE HAS
  // ITS OWN GENERATOR, which is why it had to be fixed twice: the hedge and the
  // drystone wall come out of `axialJoins`, the fence is built here by hand,
  // and a rule about how runs END belongs to both. Measured before: a lone
  // fence was 314 ink pixels and an end was 159 — half of one. A run of five
  // fenced four tiles.
  //
  // Corners are untouched: two arms already meet at the hub, and giving each
  // its opposite would turn every L into a crossroads.
  let use;
  if (!armIdx.length) use = [JOIN_DIRS[0], JOIN_DIRS[2]];
  else if (armIdx.length === 1) {
    const only = armIdx[0];
    use = [JOIN_DIRS[only], JOIN_DIRS[(only + 2) % 4]];
  } else use = armIdx.map((i) => JOIN_DIRS[i]);
  const arms = armIdx.map((i) => JOIN_DIRS[i]);

  // Rails first, so the stakes draw over them and read as in front. Each is
  // 2px deep — a rail seen very nearly edge-on, which is all a rail is here.
  // They run one pixel PAST the half-tile so two pieces meet rail to rail.
  // A RAIL ENDS AT ITS LAST POST. Piranesi, round 2: *"a rail that continues
  // past its last post carries nothing."* An arm with a real neighbour runs
  // its rail one pixel past the half-tile so two pieces meet rail to rail; an
  // arm drawn only for symmetry (a lone piece, an end) stops flush with the
  // outer face of its terminal stake at STAKE_AT[2].
  for (const drop of [4, 9]) {
    for (const [dtx, dty, bit] of use) {
      const lim = mask & bit ? HALF + 1 : STAKE_AT[STAKE_AT.length - 1] + 1;
      for (let i = 0; i <= lim; i++) {
        const { x, y } = armStep(dtx, dty, i);
        put(x, y - drop, 't');
        put(x, y - drop + 1, 'r');
      }
    }
  }

  // The corner post, on the hub, whenever the run actually bends or branches.
  // A straight piece must NOT have one: it would land in the middle of an
  // otherwise even rhythm and read as a repair.
  if (!joinAxis(mask) && arms.length) stake(put, CX - 1, CY);

  for (const [dtx, dty] of use) {
    for (const at of STAKE_AT) {
      const { x, y } = armStep(dtx, dty, at);
      stake(put, x - 1, y);
    }
  }

  // NOT trimmed. `sprite()` above derives its width from the longest row and
  // then places the anchor at that width's midpoint, which is right for a
  // hand-typed sprite and WRONG here: a corner reaches only one way, so its
  // rows are short on one side and the derived centre lands off the hub. Every
  // one of the sixteen keeps the full grid and states its anchor outright.
  return g.map((r) => r.join(''));
}

/**
 * The anchor sits on the TILE CENTRE — the hub, on the ground line the run is
 * planted in. With it there, a fence at tile (t+1, u) draws its -tx arm exactly
 * over the +tx arm of the one before it, at exactly the row that arm reached.
 * That is not a tuning: it is `LINE_W` and `LINE_DROP` doing what they say, and
 * it is checkable — `node tools/joinshot.mjs --ids palisade-fence --all`.
 */
const fenceAt = (mask) =>
  defineSprite({
    // Named by its mask, so a census that walks the module — iso-audit,
    // anchor-audit, the sprite lab — reports sixteen distinguishable rows
    // rather than sixteen lines all saying `palisade-fence`. The one the
    // catalogue asks for keeps the plain name; these are its states.
    name: `palisade-fence@${mask}`,
    anchor: [CX, CY],
    rows: palisadeRows(mask),
    footprint: [1, 1],
    tags: ['structure', 'enclosure', 'timber'],
  });

/** Every connection state, indexed by mask. `joins[0]` is the straight run. */
const PALISADE_JOINS = Object.freeze(
  Array.from({ length: JOIN_MASKS }, (_, mask) => fenceAt(mask))
);

export const PALISADE_FENCE = defineSprite({
  ...PALISADE_JOINS[0],
  // The spread carries `palisade-fence@0` with it, and the registries in
  // js/main.js and tools/playtest.mjs key on `sprite.name` — so without this
  // line the catalogue asks for `palisade-fence` and nothing answers. Caught
  // by test/catalog.test.mjs the moment the states were given their own names.
  name: 'palisade-fence',
  // The sixteen states ride ON THE ART, the same way `back` does and for the
  // same reason: which piece answers which neighbourhood is a fact about the
  // pictures, and a catalogue key naming them by string is a join that can go
  // stale. js/main.js follows it; nothing else needs to know.
  joins: PALISADE_JOINS,
});
export { PALISADE_JOINS };

// ===========================================================================
// FIELD GATE — the way THROUGH a palisade.
//
// The owner, having fenced a lawn and stood a pergola in the middle of it:
// *"i was trying to use the pergola as a gate. what i think we really need are
// separate gates / archways for the various walls."*
//
// Which is exactly right, and it is a stronger request than it sounds. A gate
// is not an ornament placed where a fence is missing — it is A PIECE OF THE
// FENCE, and everything about how it is built follows from that:
//
//   IT STANDS ON THE FENCE'S OWN GEOMETRY. Same `armStep`, same `CX`/`CY`, so
//   its hanging post lands exactly where the neighbouring piece's arm arrives.
//   Nothing here is tuned; if the fence's pitch ever changed, the gate would
//   follow it, because they are the same three numbers.
//   IT JOINS. `joins: 'palisade-fence'` in the catalogue puts it in that
//   wall's group, so the fences either side reach for it and it reaches back.
//   IT IS DRAWN WHOLE, via `axialJoins` rather than `linearJoins`: half a gate
//   is a post and a piece of rail, and two of those from different directions
//   is a woodpile. Two drawings, itself and its mirror, and every mask
//   resolves to one of them.
//
// THE LEAF IS LOW AND THE HEAD IS HIGH, which is the whole readability trick.
// A gate drawn closed at full height is a wall with a line in it; a gate drawn
// as a bare gap is a hole where the fence broke. Two tall posts with a head
// rail across the top says GATEWAY, and a waist-high leaf hung between them
// says GATE — and you can still see the garden through the gap above it,
// which is what tells a player this is a way in.
// ===========================================================================

const GATE_POST_H = STAKE_H + 9; // the posts stand proud of the palings
const GATE_AT = HALF - 3; // ...at the arm ends, where the neighbours arrive

function fieldGateRows() {
  const g = Array.from({ length: FENCE_H + 9 }, () => new Array(FENCE_W).fill('.'));
  const DY = 9; // the extra headroom, pushed onto the top of the grid
  const put = (x, y, k) => {
    if (x >= 0 && x < FENCE_W && y >= 0 && y < FENCE_H + 9) g[y][x] = k;
  };
  const at = (i) => {
    const p = armStep(1, 0, i);
    return { x: p.x, y: p.y + DY };
  };

  // The two gateposts, on the run's own axis at the arm ends.
  for (const s of [-1, 1]) {
    const p = at(s * GATE_AT);
    for (let y = p.y - GATE_POST_H; y <= p.y; y++) {
      put(p.x - 1, y, 't'); // lit face, upper left
      put(p.x, y, 's');
      put(p.x + 1, y, 'r');
      put(p.x + 2, y, 'q');
    }
    for (let k = -1; k <= 2; k++) put(p.x + k, p.y + 1, 'q'); // planted
  }

  // The head rail across the top, and the leaf hung below it. Both follow the
  // run's pitch, so the gateway lies in the world rather than across the
  // screen — which is the entire point of the exercise.
  const rail = (drop, keys) => {
    for (let i = -GATE_AT; i <= GATE_AT; i++) {
      const p = at(i);
      put(p.x, p.y - drop, keys[0]);
      put(p.x, p.y - drop + 1, keys[1]);
    }
  };
  rail(GATE_POST_H - 1, ['t', 'r']); // the head
  rail(9, ['t', 'r']); // the leaf's top bar
  rail(4, ['s', 'q']); // ...and its lower one

  // One diagonal brace, corner to corner INSIDE the leaf's frame. It runs in
  // SCREEN space on purpose: a brace is a piece of timber lying against the
  // gate's own plane, not along a ground axis. Piranesi, round 2: *"a brace
  // works only corner to corner"* — the old one started mid-air and its lower
  // pixel row dipped a drop below the bottom rail, which is a brace carrying
  // nothing. This one rises from the bottom hinge corner (flush on the lower
  // bar, drop 5) to the top latch corner (under the leaf's top bar, drop 8),
  // and its second row never leaves the frame.
  // ONE TIMBER, UNBROKEN. Round 3: the brace read as "a tangle of three or
  // four overlapping diagonal strands" — the run's own pitch (a drop every
  // second column) plus the brace's rise made two-row jumps that broke the
  // line into strands. Tracking the previous row and filling every skipped
  // pixel keeps it one continuous 2px member, and nothing is drawn below its
  // own line into the bottom rail.
  {
    let prev = null;
    for (let i = -GATE_AT; i <= GATE_AT; i++) {
      const p = at(i);
      const t = (i + GATE_AT) / (2 * GATE_AT);
      // ON THE OPPOSING DIAGONAL. Round 4 counted "four diagonals where I
      // ordered one": in this projection the three rails already lie at the
      // run's own pitch, so a brace rising WITH the pitch was a fourth
      // parallel strand. Descending against it — top of the hinge side to the
      // bottom latch corner — is the one slope that visibly CROSSES the rails.
      const y = p.y - 9 + Math.round(t * 4);
      const lo = Math.min(prev === null ? y : prev, y);
      const hi = Math.max(prev === null ? y : prev, y);
      for (let yy = lo; yy <= hi; yy++) {
        put(p.x, yy, 's');
        put(p.x, yy + 1, 'q');
      }
      prev = y;
    }
  }

  return g.map((r) => r.join(''));
}

export const PALISADE_GATE = axialJoins(
  defineSprite({
    name: 'palisade-gate',
    // The hub, exactly where the fence puts it — plus the headroom the posts
    // needed, which is added to the TOP of the grid so the ground line does
    // not move. A gate whose anchor drifted from its fence's would butt
    // half a pixel out and read as a repair.
    anchor: [CX, CY + 9],
    rows: fieldGateRows(),
    footprint: [1, 1],
    tags: ['structure', 'enclosure', 'timber', 'gate'],
  })
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
    // ROUND 2 REBUILD. Piranesi: *"a pawn from a chess set nobody finished...
    // no lap — the profile falls in one unbroken taper... and she still sits
    // on grass, not on stone."* Two structural events answer him: a LAP SHELF
    // at mid-height — a highlight plane breaking forward to the right, a full
    // shadow row beneath it, then a vertical drop of skirt — and a proper 2:1
    // plinth, twenty wide with a lighter top edge, under everything.
    '.........BAAB.........',
    '........BADDAB........', // hair, parted, dark against the face
    '........ADEEDA........',
    '........ADEEDA........', // face, lit from the upper left
    '........BACCAB........', // neck in shadow — the notch that makes it a head
    '.......BCDDDCCB.......',
    '......BCDEEDDCCB......', // shoulders
    '......ACDEEDDCCBA.....',
    '......ACDEEEDDCBA.....',
    '......ACDDEDDDCBA.....',
    '......ABCDEDDCCBA.....', // arms held in, drapery folds start
    '......ABCDEDDCCBA.....',
    '......ABCDDDDCCBA.....',
    '.....ABCDDEEEEEEEDBA..', // THE LAP: knees break forward, a lit shelf
    '.....ABCDDEEEEEEEDCBA.',
    '.....ABCDAAAAAAAADCBA.', // ...and the undercut shadow that makes it real
    '.....ABCDDEDDDCCBA....', // the skirt drops vertically from the knees
    '.....ABCDDEDDDCCBA....',
    '.....AABCCDDDCCBAA....',
    '......AABBCCCBBAA.....',
    '.......AABBBBBAA......', // hem of the drapery, in shadow
    '.AEEEEEEEEEEEEEEEEEEA.', // THE PLINTH: lighter top edge...
    '.ADDDDDDDDDDDDDDDDDDA.', // ...top face...
    '.ACCCCCCCCCCCCCCCCCCA.',
    '.ABBBBBBBBBBBBBBBBBBA.', // ...front face, a step darker
    '.AABBBBBBBBBBBBBBBBAA.',
    '..AAAAAAAAAAAAAAAAAA..', // the anchor row: the base diamond's centre line
    ...foot(14, MARBLE, 3), // ...and its front half, in the ground plane
  ],
  { tags: ['sculpture', 'marble', 'maiden'] }
);

export const EXTRAS = Object.freeze({
  'palisade-fence': PALISADE_FENCE,
  'palisade-gate': PALISADE_GATE,
  'seated-maiden': SEATED_MAIDEN,
});

export default EXTRAS;
