// props.js — the sculpture and the structures. Hand-authored, pixel by pixel.
//
// Ground is a texture; a prop is a SHAPE, and a shape has to be drawn. Every
// sprite in this file is literal rows of palette keys. Nothing here is
// generated, because the silhouette of a sleeping faun is the whole point of
// the object and no rule produces it.
//
// ---------------------------------------------------------------------------
// THE SHADING LAW (SPEC 3). Light comes from the UPPER LEFT, high and slightly
// in front. On a 2:1 cube: top face = ramp index 4, left face = 3, right face
// = 1-2. Written out per ramp, that is:
//
//            top    left(lit)   right(shade)   deep / undercut / outline
//   marble    E         D          C -> B                A
//   rock      y         x            w                   v
//   earth     u         t          s -> r                q
//   terracotta S        R            Q                   P
//
// On a ROUNDED form — a column shaft, a limb, a jar belly — the same law reads
// as a gradient with the highlight about a third of the way in from the lit
// edge, not on the edge itself:  C D E E D C C B B A
//
// Never a pure black outline. 'A' (marble), 'v' (rock), 'q' (earth) are the
// outlines, and they are the object's own ramp, so nothing on screen is colder
// than the scene allows.
//
// ---------------------------------------------------------------------------
// CONTACT SHADOWS ARE NOT DRAWN HERE. SPEC 3 still wants them — the ground ramp
// darkened two steps, hugging the base, never translucent black — but they are
// the RENDERER's, laid down in their own pass under everything, sized from
// `groundCentre(art)` and coloured from the tile they land on.
//
// Until 2026-08-01 every prop also baked its own, in 'm', on the claim that the
// renderer recoloured it on soil "for free" via palette.variant({grass:'earth'}).
// THERE IS NO SUCH VARIANT AND THERE NEVER WAS. What the baked skirt actually
// did was put a grass-green mat under every object standing on stone: 16 710
// green pixels across the catalogue on flagstone, which is what a whole square
// of them looks like from across the room. Deleting them took that to 4 868 —
// the rest is real foliage — and changed the picture on GRASS by 0.36%, because
// the runtime ellipse was already covering the same ground in the same colour.
//
// So: an object's own shade is not its art. `skirt()` survives for shade on a
// surface belonging to the OBJECT (the altar standing on the heroon's podium),
// which the ground pass cannot know about. See its note.
//
// ---------------------------------------------------------------------------
// ANCHORS. Every anchor is the pixel at the CENTRE of the object's base
// ellipse, not its lowest pixel — statues have plinths and plinths have depth,
// so the point that sits on the tile centre is inside the base, halfway down
// its front face.
//
// DOM-free and dependency-free; imports cleanly in Node.

import {
  defineSprite,
  padToAnchor,
  groundFoot,
  LINE_W,
  LINE_DROP,
  slab,
  slabFace,
  slabBackEdge,
  linearJoins,
  axialJoins,
} from './format.js';
import { GROUND_ELLIPSE } from '../iso.js';

/**
 * Author rows at whatever length each row needs and let the trailing '.' be
 * filled in. The format's equal-length rule still holds — this just removes the
 * one class of authoring error (miscounting trailing transparent pixels) that
 * carries no artistic information whatsoever.
 *
 * The anchor is given as [dx, up]: `up` is rows measured UP FROM THE BOTTOM,
 * and `dx` is an offset from the horizontal centre. Absolute anchors were the
 * other half of the counting problem — every row added to a statue silently
 * moved its feet — and an anchor expressed relative to the base cannot drift.
 *
 * HAND-AUTHORED ROWS GET THEIR CONTACT BAND STRIPPED; composed grids do not.
 * That distinction used to be an `opts.contact` flag, which is why it once also
 * held a NUMBER meaning "and draw me one instead". An option bag that accepts
 * false and 12 for the same key will eventually accept a third thing, so it is
 * now a parameter of the constructor rather than an entry in the bag: this is
 * the hand-authored door and `composed()` is the other one.
 */
function sprite(name, [dx, up], rows, opts = {}) {
  const w = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => r.padEnd(w, '.'));
  // THE ANCHOR IS FIXED BEFORE THE CONTACT BAND IS TOUCHED. It is measured
  // from the top once the row count is known, and the strip removes rows at the
  // bottom — so taking it first is what stops the change from silently moving
  // forty sprites off their tiles. `padToAnchor` then repairs the one case that
  // creates: an anchor that was inside the band it just deleted.
  const anchor = [((w - 1) >> 1) + dx, padded.length - 1 - up];
  return build(name, anchor, stripContactBand(padded), opts);
}

/** The shared tail of both constructors — everything after the rows are fixed. */
function build(name, anchor, rows, opts) {
  return defineSprite({
    name,
    anchor,
    rows: padToAnchor(rows, anchor[1]),
    footprint: opts.footprint || [1, 1],
    tags: opts.tags || [],
    cycle: opts.cycle || null,
  });
}

/**
 * DELETE a hand-typed contact band. It is the renderer's job now.
 *
 * Fifty-three rows in this file looked like this at the foot of a sprite:
 *
 *     '...mmmmmmmmmmmmmmmmmmmmmmmmmmmmmm...',
 *     '..mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm..',
 *     '.....mmmmmmmmmmmmmmmmmmmmmmmmmmm.....',
 *
 * — a rectangular band of the darkest grass key, meant as the patch of shade an
 * object casts where it meets the ground. Two things are wrong with it and only
 * one of them is about shape.
 *
 * THE SHAPE. The ground is a plane seen at 2:1, so that patch is a CIRCLE, and
 * a circle in this projection is an ellipse exactly twice as wide as it is tall
 * (GROUND_ELLIPSE, js/iso.js). Drawn as a band it is a horizontal edge, and an
 * isometric world has none at ground level: `node tools/iso-audit.mjs`. This
 * function used to fix that in place, rewriting each band as an ellipse.
 *
 * THE COLOUR, which no amount of reshaping could fix. 'm' is GRASS[0]. A baked
 * skirt is grass-coloured wherever the object stands, and objects stand on
 * flagstone, gravel and terrace paving too. Measured across the catalogue on
 * flagstone: 16 710 grass-green pixels, one green mat per object, visible from
 * across the room. The file header claimed the renderer recoloured them via
 * `variant({grass:'earth'})`; no such variant has ever existed.
 *
 * So the band is not reshaped, it is REMOVED, and `render.js` draws the contact
 * shadow in its own pass — sized from `groundCentre(art)`, which reads the same
 * base contour this used to read, and coloured from the tile it actually lands
 * on. Deleting it changed the rendered picture on GRASS by 0.36% (9 of 85
 * objects, 716 px of 199 969) because the runtime ellipse was already covering
 * that ground in that colour; on flagstone it removed 11 842 green pixels.
 *
 * The band is detected rather than declared because it is unambiguous — a
 * TRAILING row containing nothing but 'm' and transparency is a contact band
 * and can be nothing else; object art has other colours in it.
 *
 * ---------------------------------------------------------------------------
 * IT MUST NOT RUN ON COMPOSED SPRITES, and that was true of the old version for
 * a subtler reason worth keeping.
 *
 * "A trailing row of nothing but 'm'" was ALSO true of the bottom few rows of a
 * correct ellipse that `skirt()` had just drawn, so on a composed sprite the old
 * code stripped the lower half of a correct shadow and rebuilt a truncated one:
 * the heroon went from a 12px level edge to a 106px one, the worst reading in
 * the catalogue, by way of a change that made eighteen other sprites right.
 * A REWRITE THAT DETECTS ITS OWN INPUT WILL EVENTUALLY DETECT ITS OWN OUTPUT.
 *
 * The reason survives the fix. A composed grid may legitimately END in pure 'm'
 * — a mound of shadowed turf, a pool of shade under a rock — and there is no
 * pixel that says which. The honest signal is not in the art at all; it is which
 * constructor the author used, so `composed()` simply does not call this.
 */
function stripContactBand(rows) {
  const isBand = (r) => /^[.m]*$/.test(r) && r.includes('m');
  let cut = rows.length;
  while (cut > 0 && isBand(rows[cut - 1])) cut--;
  // No band, or nothing BUT band — in the second case the sprite is a shadow,
  // and a sprite is not improved by deleting all of it.
  if (cut === rows.length || cut === 0) return rows;
  return rows.slice(0, cut);
}

/** A run of identical rows — a column shaft is 28 copies of one profile. */
const rep = (n, s) => new Array(n).fill(s);

// ===========================================================================
// THE SLEEPING SATYR
//
// This project began from a photograph of one, so it gets the most pixels and
// the most care. It is the Barberini Faun's pose read into 2:1 isometric: head
// thrown back and to the LEFT so the face takes the light full on, one arm
// flung above the head, the near knee drawn up as the highest point of the
// whole silhouette, the far leg sprawled away to the right.
//
// It is a FRAGMENT. The block he lies on is broken off short, the raised arm
// ends at the elbow, and the break faces are flat and dull ('B'/'A' with no
// highlight) against the polished, rounded, 'E'-lit forms of the body. That
// contrast — polish against fracture — is what makes marble read as marble
// rather than as pale plastic, and it is the only reason to draw a fragment
// instead of a statue.
//
// The silhouette test first (RESEARCH A6): blocked in solid, this reads as a
// figure because of three events — the knee peak, the drop into the waist, and
// the head thrown back below the shoulder line. Those three are load-bearing.
// Do not smooth them.
// ===========================================================================

export const SLEEPING_SATYR = sprite(
  'sleeping-satyr',
  [0, 8],
  [
    // AUTHORING NOTE — five takes on this one object, and what each taught.
    //
    // (1) SHADE ACROSS THE FORM, NOT ALONG IT. Take one ran a left-to-right
    //     C-D-E-D-C ramp down every row. A reclining body's long axis IS
    //     left-to-right, so every row got the same gradient and the torso came
    //     out a flat pale lump — the marble "green blob" of RESEARCH A6. The
    //     banding is VERTICAL: lit ridge on top, core in the middle, shadow
    //     beneath, 'A' on the underside.
    //
    // (2) A BODY READS BY ITS NOTCHES, not its lumps. Take two drew head, chest
    //     and hips as three rounded masses and got a snowman. What separates
    //     them is the dark: the neck, the band under the pectorals, the groin.
    //
    // (3) HEAD SIZE AND SPECIES DIAGNOSTICS. Takes two and three drew a round
    //     frontal head as wide as the ribcage. This head is a PROFILE at about
    //     a seventh of the body, with a beard wedge darkening below it.
    //
    // (4) DRAW THE OUTLINE FIRST. Takes one to three were built mass by mass,
    //     and the silhouette test (RESEARCH A6: block it in one flat colour and
    //     squint) showed a lump on a slab. The TOP EDGE of a reclining figure
    //     is a sequence of events and it is the whole reading: head bump, NECK
    //     DIP, shoulder rise, chest, WAIST DIP, hip, knee climbing to the
    //     highest point in the sprite, shin falling away. The two dips and the
    //     open triangle under the raised leg are load-bearing.
    //
    // (5) EDGES MOVE IN TWO-PIXEL STEPS, NEVER ONE. Take four was patched row
    //     by row and the leading-dot counts ended up alternating +1/-1 down the
    //     profile. That grows single-pixel spurs off every diagonal — the
    //     "fuzzy edge" fault of RESEARCH A9, which shimmers the moment the
    //     camera pans. Hence the fixed column table this block is generated
    //     from: the thigh's left edge steps left once every two rows and never
    //     back, and the shin's right flank is 'C'/'A' because it faces away
    //     from the light. A limb whose shaded flank is drawn light does not
    //     read as a cylinder no matter what happens in its middle.
    '....................................ABBBA',
    '...................................ABDEEDCA',
    '..................................ABDEEEDCBA',
    '..................................ABDEEDCBA',
    '..................................ABDEEDCBA',
    '.................................ABDEEDCBA.ABDEDCA',
    '.................................ABDEEDCBA.ABDEDCA',
    '................................ABDEEDCBA..ABDEDCA',
    '................................ABDEEDCBA..ABDEDCA',
    '...............................ABDEEDCBA....ABDEDCA',
    '...............................ABDEEDCBA....ABDEDCA',
    '..............................ABDEEDCBA.....ABDEDCA',
    '..............................ABDEEDCBA.....ABDEDCA',
    '.............................ABDEEDCBA......ABDEDCA',
    '.............................ABDEEDCBA......ABDEDCA',
    '................AABBBBBB....ABDEEDCBA........ABDEDCA',
    '................ABDDEEEDDC..ABDEEDCBA........ABDEDCA',
    '....AABBBBBBAA..ACDDDDDDDDC.ABDEEDCBA........ABDEDCA',
    '...ABBCCCCCBBA..ACDDDDDDDDCBABDEEDCBA........ABDEDCA',
    '..ABCDDDDDDCBA..ACCDDDDDDDCBABDEEDCBA........ABDEDCA',
    '.ABCDEEEEEDCBACCABCCDDDDDDCBABDEEDCBA........ABDEDCA',
    '.ABDEAAEEEDCBACCABBCCCCCCCBBABDEEDCBA........ABDEDCA',
    '.ABDEEEEEEDCBACCAABCCDDDDCCBABDEEDCBA........ABDEDCA',
    '..ABCDDEEEDCBACCABCDDDDDDDCBABDEEDCBA........ABDEDCA',
    '...ABCDDDDDCBACCABCDDDDDDDDCABDEEDCBA........ABDEDCA',
    '...ABBCCCCCBBACCABCCDDDDDDDDABDEEDCBA........ABDEDCA',
    '....AABBBBBBAA..ABBCCCDDDDDDDDDDDDDDCCBBAA...ABDEDCA',
    '.....AABBBBAA...AABBCCCDDDDDDDDDDDDDDDCCBBAAABCDEDCA',
    '................AAABBCCCCDDDDDDDDDDDDDDDCCCBBBBCCCBA',
    '..ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA..',
    '.ABDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBA.',
    'ABDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDBA',
    'ACDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDCA',
    'ACCCCCCCCCCCCCCCBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA',
    'ACCCCCCCCCCCCCBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA',
    'ACCCCCCCCCCCBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBAA',
    '.AACCCCCCCCCCCCCCCCCCCCCCCBBBBBBBBBBBBBBBBBBBBBBBAA.',
    '...AACCCCCCCCCCCCCCCCCCCCCBBBBBBBBBBBBBBBBBBBBBAA...',
    '.....AACCCCCCCCCCCCCCCCCCCBBBBBBBBBBBBBBBBBBBAA.....',
    '.......AACCCCCCCCCCCCCCCCCBBBBBBBBBBBBBBBBBAA.......',
    '.........AACCCCCCCCCCCCCCCBBBBBBBBBBBBBBBAA.........',
    '...........AACCCCCCCCCCCCCBBBBBBBBBBBBBAA...........',
    '.............AACCCCCCCCCCCBBBBBBBBBBBAA.............',
    '...............AACCCCCCCCCBBBBBBBBBBA...............',
    '.................AACCCCCCCBBBBBBBBAA................',
    '...................AACCCCCBBBBBBAA..................',
    '.....................AACCCBBBBAA....................',
    '.......................AACBBAA......................',
    '.........................AAA........................',
  ],
  { tags: ['sculpture', 'marble', 'satyr', 'ruin', 'wildness'] }
);

// ===========================================================================
// Marble uprights
// ===========================================================================

/**
 * NULLIFIER · THE HERM.
 *
 * Historically exactly this: herms stood at property edges and crossroads all
 * over Attica, and DECOR.md is right that a boundary stone which breaks an
 * influence chain is not a metaphor — it is the object doing its actual job.
 * So the whole brief is one sentence: IT MUST LOOK LIKE A STONE YOU WOULD NOT
 * CROSS.
 *
 * Take one was 17px wide and read as a bollard, or worse, a chess pawn — a
 * pale rounded thing you would walk straight past. Four things fix that, and
 * all four are about weight rather than detail:
 *
 *   1. WIDTH. 26px, not 17. A boundary marker that is narrower than a
 *      creature is not a boundary, and a tall thin marble reads as ornament.
 *   2. THE SHOULDER PEGS. They project a full five pixels either side and
 *      they are SQUARE. That horizontal break is the whole silhouette: it is
 *      what stops the eye running past and what makes the object read as
 *      arms-out, barring the way.
 *   3. THE BEARD. A wedge WIDER THAN THE SKULL, with the brow drawn as a hard
 *      dark bar above it. A herm without the beard is a bust; with it, it is
 *      an archaic god staring at you.
 *   4. VALUE. The shaft is C and B — the middle and lower marble — not D and
 *      E. Take one lit it like a fresh statue and it read as friendly. This
 *      is old, weathered, lichened stone standing in shade, and the only
 *      bright marble left on it is the light down its left flank.
 */
export const HERM = sprite(
  'herm',
  [0, 4],
  [
    '..........AABBAA..........',
    '.........ABBCCBBA.........',
    '........ABBCCCCBBA........',
    '.......ABBCDDDDCBBA.......',
    '......ABBCDDEEDDCBBA......',
    '......ABCDDEEEEDDCBA......',
    // The brow, drawn as a hard bar. Archaic heads read by their brow line
    // before they read by anything else.
    '......ABCDAAAAAADCBA......',
    '......ABCDDEEEEDDCBA......',
    '......ABCDAEEEEADCBA......',
    '......ABCDDECEEDDCBA......',
    '......ABCDDECCEDDCBA......',
    '......ABCDDDCCDDDCBA......',
    // The beard, wider than the skull at every row until it tapers back in.
    '.....ABBCCDDDDDDCCBBA.....',
    '....ABBCCCDDDDDDCCCBBA....',
    '...ABBCCCCDDDDDDCCCCBBA...',
    '...ABCCCCCDDDDDDCCCCCBA...',
    '...ABCCCCCCDDDDCCCCCCBA...',
    '....ABCCCCCCDDCCCCCCBA....',
    '.....ABCCCCCCCCCCCCBA.....',
    '......ABBCCCCCCCCBBA......',
    '.......AABBBBBBBBAA.......',
    '........AABBBBBBAA........',
    // The pillar's top face, then the pegs. Square, blunt, and projecting.
    '......ADDDDDDDDDDDDDA.....',
    'AADDDAADDDDDDDDDDDDDAADDDAA',
    'ADDDDDADDDDDDDDDDDDDADDDDDA',
    'ACCCCCADDDDDDDDDDDDCACCCCCA',
    'ABBBBBADDDDDDDDDDDCCABBBBBA',
    'AAAAAAAADDDDDDDDDCCCAAAAAAA',
    '.....ADDDDDCCCCCBBBBA.....',
    '.....ADDDDDCCCCCBBBBA.....',
    '.....ADDDDDCCCCCBBBBA.....',
    '.....ADDDDDCCCCBBBBBA.....',
    '.....ADDDDCCCCCBBBBBA.....',
    '.....ADDDDCCCCCBBBBBA.....',
    // Lichen and weathering: a few pixels dropped a step, never a pattern.
    '.....ADDDBCCCCCBBBBBA.....',
    '.....ADDDBBCCCCBBBBBA.....',
    '.....ADDDDCCCCCBBBBBA.....',
    '.....ADDDDCCCCCBBBBBA.....',
    '.....ADDDDCCCCBBBBBBA.....',
    '.....ADDDDCCCCBBBBBBA.....',
    '.....ADDDDCCCCBBBBBBA.....',
    '.....ADDDBCCCBBBBBBBA.....',
    '.....ADDDDCCCBBBBBBBA.....',
    '.....ADDDDCCCBBBBBBBA.....',
    '.....ADDDDCCCBBBBBBBA.....',
    '.....ADDDDCCCBBBBBBBA.....',
    '....AADDDDCCCBBBBBBBAA....',
    '...AADDDDDDCCCBBBBBBBAA...',
    '..ADDDDDDDDDCCCBBBBBBBBA..',
    '..ACCCCCCCCCBBBBBBBBBBBA..',
    '..ABBBBBBBBBBBBBBBBBBBAA..',
    '...ACCCCCCCCCBBBBBBBBBA...',
    '.....ACCCCCCCBBBBBBBA.....',
    '.......ACCCCCBBBBBA.......',
    '.........ACCCBBBA.........',
    '...........ACBA...........',
  ],
  { tags: ['nullifier', 'sculpture', 'marble', 'satyr', 'boundary', 'order'] }
);

/** A headless, armless torso on a low plinth — the classic garden fragment. */
export const MARBLE_TORSO = sprite(
  'marble-torso',
  [0, 1],
  [
    // The neck and both arms are broken off, and every break is a FLAT face:
    // 'A'/'B' with no highlight on it at all. Fractured stone does not catch
    // the light the way a polished shoulder does, and that difference is the
    // only thing in the sprite that says "antique fragment" rather than
    // "unfinished carving".
    '..........AABBAA..........',
    '.........ABBBBBBA.........',
    '.........ABBBBBBA.........',
    // The ARM STUMPS have to break the silhouette sideways. Without them the
    // shoulders and the hips make the same width and the whole thing turns on
    // a lathe — take two of this sprite read as a chess pawn.
    '..AABBAAABBBBBBAAABBAA....',
    '.ABBBBBBABCCCCCCBABBBBBA..',
    'ABCCCCBBBCDDDDDDCBBBCCCBA.',
    'ABCDDCBABCDDEEEEDDCBABCCBA',
    'AABBBAAABCDDEEEEDDCBAABBAA',
    '...AA...ABCDDEEEEDDCBA..AA',
    '........ABCDDEEEEDDCBA....',
    '........ABBCDDDDDDCBBA....',
    '........AABBCCCCCCBBAA....',
    '.........ABCDDDDDDCBA.....',
    '.........ABCDDEEDDCBA.....',
    '.........ABCDDEEDDCBA.....',
    '.........ABCDDDDDDCBA.....',
    '.........AABCDDDDCBAA.....',
    '..........ABCDDDDCBA......',
    '..........ABCDDDDCBA......',
    '.........ABCDDDDDDCBA.....',
    '........ABCDDDDDDDDCBA....',
    '........ABCDDDDDDDDCBA....',
    '........ABBCDDDDDDCBBA....',
    '........AABBCCCCCCBBAA....',
    '.........AABBBBBBBBAA.....',
    '..........AAAAAAAAAA......',
    '.....ABBBBBBBBBBBA........',
    '....ABCCCCCCCCCCCBA.......',
    '...ABDDDDDDDDDDDDDBA......',
    '...ADDDDDDDDDDDDDDDA......',
    '...ADDDDDDDDDDDDDDDA......',
    '...ACCCCCCCCBBBBBBBA......',
    '...ACCCCCCCBBBBBBBBA......',
    '...ACCCCCCBBBBBBBBAA......',
    '...ABBBBBBBBBBBBBAA.......',
    '....ACCCCCCBBBBBBA........',
    '......ACCCCBBBBA..........',
    '........ACCBBA............',
    '..........AA..............',
  ],
  { tags: ['sculpture', 'marble', 'order', 'maturity'] }
);

/** A standing Doric column, whole. */
export const COLUMN = sprite(
  'column',
  [0, 1],
  [
    '.....DDDDDDDD.....',
    '...DDEEEEEEEEDD...',
    '..DEEEEEEEEEEEED..',
    '.DEEEEEEEEEEEEEED.',
    '.CDDDDDDDDDDCCBBA.',
    '.CDDDDDDDDDCCCBBA.',
    '..CDDDDDDDCCCBBA..',
    '...CDDDDDCCCBBA...',
    '....CDEEDCCBBA....',
    ...rep(28, '....CDEEDCCBBA....'),
    '...BCDEEDCCBBAA...',
    '..BCDDEEDDCCBBAA..',
    '.BCDDDEEDDCCBBBAA.',
    '.CDDDDDDDDDCCBBBA.',
    'CDDDDDDDDDDDCCBBBA',
    'CDDDDDDDDDDCCCBBBA',
    'BCCCCCCCCBBBBBBBAA',
    'BCCCCCCCBBBBBBBBAA',
    'ABBBBBBBBBBBBBBBAA',
    '.ACCCCCCCBBBBBBBA.',
    '...ACCCCCBBBBBA...',
    '.....ACCCBBBA.....',
    '.......ACBA.......',
  ],
  { tags: ['structure', 'marble', 'order', 'maturity'] }
);

/**
 * A snapped column with its top drum fallen beside it. The break is FLAT —
 * no highlight on the fracture — which is the whole tell that stone is broken
 * rather than merely short.
 */
export const BROKEN_COLUMN = sprite(
  'broken-column',
  [0, 1],
  [
    '....BBBBAABB......',
    '...BCCBBBBCCBA....',
    '...CDDCCBCDDCBA...',
    '....CDEEDCCBBA....',
    ...rep(9, '....CDEEDCCBBA....'),
    '....CDEEDCCBBA......AABBAA......',
    '....CDEEDCCBBA....ABBCCCCBBA....',
    '....CDEEDCCBBA...ABCDDDDDCCBA...',
    '...BCDEEDCCBBAA.ABCDEEEEDDCCBA..',
    '..BCDDEEDDCCBBAAACDEEEEEEDDCCBA.',
    '.BCDDDEEDDCCBBBAACDEEEEEEDDCCBA.',
    '.CDDDDDDDDDCCBBBACDDEEEEDDCCBBA.',
    'CDDDDDDDDDDDCCBBBACCDDDDDCCBBAA.',
    'CDDDDDDDDDDCCCBBBAABCCCCCCBBAA..',
    'BCCCCCCCCBBBBBBBAAAABBBBBBBAA...',
    'BCCCCCCCBBBBBBBBAA.AAAAAAAAA....',
    'ABBBBBBBBBBBBBBBAA..............',
    '.AAAAAAAAAAAAAAAA...mmmmmmmmm...',
    '..mmmmmmmmmmmmmmmmmmmmmmmmmm....',
    '...mmmmmmmmmmmmmmmmmmmmmmm......',
    '.....mmmmmmmmmmmmmmmmmm.........',
  ],
  { tags: ['structure', 'marble', 'ruin', 'wildness', 'maturity'] }
);

/**
 * A ruined arch: one springing intact, the other broken away. Voussoirs are
 * drawn as separate stones with their own joints, which is what stops an arch
 * from reading as a bent pipe.
 */
export const RUINED_ARCH = sprite(
  'ruined-arch',
  [0, 1],
  [
    '...........AABBBBBBBAA..........',
    '.........ABBCCCCCCCCCBBA........',
    '........ABCDDDDDDDDDDDCCBA......',
    '.......ABDDDEEEDDDEEEDDDCBA.....',
    '......ABDDEEEEDDDDDEEEDDCCBA....',
    '.....ABDDEEDDCBBBBBBCDDDDCCBA...',
    '....ABDDEEDCBA.....ABCDDDCCBBA..',
    '....ADDEEDCA.........ABCDDCCBBA.',
    '...ABDEEDCA...........ABCDDCCBA.',
    '...ADDEEDA.............ACDDCCBBA',
    '...ADEEDCA.............ACDDCCBBA',
    '..ABDEEDCA..............ACDCCBBA',
    '..ADDEEDA...............ACDCCBBA',
    '..ADEEDCA...............ABCDCBBA',
    '..ADEEDCA...............ABCDCBBA',
    '..ADEEDCA...............ABCDCBBA',
    '..ADEEDCA...............ABCDCBBA',
    '..ADEEDCA...............ABBCCBBA',
    '..ADEEDCA................AABBBAA',
    '..ADEEDCA................ABBBAA.',
    '..ADEEDCA...............ABBAA...',
    '..ADEEDCA..............ABAA.....',
    '..ADEEDCA.......................',
    '..ADEEDCA.......................',
    '..ADEEDCA.......................',
    '..ADEEDCA.......................',
    '..ADEEDCA.......................',
    '..ADEEDCA.......................',
    // The fallen side leaves a STUB, not nothing. Without it the sprite reads
    // as a shepherd's crook — an arch needs two feet on the ground for the eye
    // to complete the span that is missing.
    '..ADEEDCA........AABBBBAA.......',
    '..ADEEDCA.......ABCDDDDDCBA.....',
    '.ABDEEDCBA......ACDDDDDDDCBA....',
    '.ADDEEEDCBA.....ACDDDDDDDCCBA...',
    'ABDDEEEDDCBA......ACDDDDDDCCBA..',
    'ACDDDDDDDCCBA.....ACDDDDDDCCBA..',
    'ACDDDDDDDCCBA.....ACDDDDDDCCBA..',
    'ABCCCCCCBBBAA.....ABCCCCCCCBBA..',
    'ABCCCCCBBBBAA.....ABCCCCCBBBBA..',
    '.AAAAAAAAAAA......AABBBBBBBBAA..',
    '.mmmmmmmmmmm.......AAAAAAAAAA...',
    '..mmmmmmmmm........mmmmmmmmmm...',
    '...mmmmmmm..........mmmmmmmm....',
  ],
  { tags: ['structure', 'marble', 'ruin', 'maturity', 'seclusion'] }
);

// ===========================================================================
// Vessels — terracotta, the counterweight to all that marble
// ===========================================================================

/** A volute krater. Wine left out is the satyr's standing invitation. */
export const KRATER = sprite(
  'krater',
  [0, 1],
  [
    '..PPPP........PPPP..',
    '.PQRRQP......PQRRQP.',
    'PQRSSRQPPPPPPQRSSRQP',
    'PQRSPQRSSSSSSSRQPSRQ',
    'PQRQPQRSSSSSSSSRQPRQ',
    'PQRQPPQRRRRRRRRQPPRQ',
    'PQRRQPPPPPPPPPPPPQRQ',
    '.PQRRQPPPPPPPPPQRRQP',
    '..PQRSSRRRRRRSSRRQP.',
    '..PQRSSSSSSSSSSSRQP.',
    '.PQRSSSSSSSSSSSSSRQP',
    '.PQRSSSSSSSSSSSSSRQP',
    'PQRSSSSSSSSSSSSSSSRQ',
    'PQRSSSSPPPPPPSSSSSRQ',
    'PQRSSPPQQQQQQPPSSSRQ',
    'PQRSSPQQQQQQQQPSSSRQ',
    'PQRSSSPPQQQQPPSSSSRQ',
    '.PQRSSSSSSSSSSSSSRQ.',
    '.PQRRSSSSSSSSSSSRQP.',
    '..PQRRSSSSSSSSSRQP..',
    '...PQRRRSSSSSRRQP...',
    '....PQRRRRRRRQP.....',
    '.....PPQQQQQPP......',
    '......PQRRRQP.......',
    '.....PQRRRRRQP......',
    '.....PQRRRRRQP......',
    '......PPPPPPP.......',
    '.....mmmmmmmmm......',
    '....mmmmmmmmmmm.....',
    '......mmmmmmm.......',
  ],
  { tags: ['prop', 'terracotta', 'satyr', 'wildness'] }
);

/** A lidded storage urn. */
export const URN = sprite(
  'urn',
  [0, 1],
  [
    '.....PPPP.....',
    '....PQRRQP....',
    '...PQRSSRQP...',
    '...PQRRRRQP...',
    '....PPPPPP....',
    '...PQRRRRQP...',
    '..PQRSSSSRQP..',
    '.PQRSSSSSSRQP.',
    'PQRSSSSSSSSRQP',
    'PQRSSSSSSSSRQP',
    'PQRSSSSSSSSSRQ',
    'PQRSSSSSSSSSRQ',
    'PQRSSSSSSSSSRQ',
    'PQRSSSSSSSSSRQ',
    'PQRSSSSSSSSSRQ',
    '.PQRSSSSSSSRQ.',
    '.PQRRSSSSSRQP.',
    '..PQRRSSSRQP..',
    '...PQRRRRQP...',
    '....PQRRQP....',
    '....PQRRQP....',
    '...PQRRRRQP...',
    '....PPPPPP....',
    '...mmmmmmmm...',
    '..mmmmmmmmmm..',
    '....mmmmmm....',
  ],
  { tags: ['prop', 'terracotta', 'order'] }
);

// The half-buried pithos used to be defined here, among the vessels. It moved
// down into the affinity set because it is now COMPOSED — it needs the mound
// builder and the contact-shadow helper, and those are declared further down
// the file. See "1,2 · THE HALF-BURIED PITHOS OF WINE" below.

// ===========================================================================
// Water furniture — the naiad's requirements
// ===========================================================================

/** A carved basin on a foot, standing full. Water keys cycle with the pool. */
export const STONE_BASIN = sprite(
  'stone-basin',
  [0, 1],
  [
    '.....vvvvvvvvvvvv.....',
    '...vvyyyyyyyyyyyyvv...',
    '..vyyyyyyyyyyyyyyyyv..',
    '.vyyxJJJJJJJJJJJJxyyv.',
    'vyyxJKKJJJIIIIJJJJxyyv',
    'vyxJJKKJJIIIHHIIIJJxyv',
    'vyxJJJJIIIHHHHHIIIJJxv',
    'vyxJJIIIHHHHHHHHIIJJxv',
    'vyyxJIIIHHHHHHHIIJxyyv',
    'vxyyxJIIIHHHHHIIJxyyxv',
    'vwxyyyxJJIIIIIJJxyyxwv',
    'vwwxyyyyxxJJJJxxyyxwwv',
    '.vwwxxyyyyyyyyyyxxwwv.',
    '..vwwwxxxxyyyxxxwwwv..',
    '...vvwwwwxxxxxwwwvv...',
    '.....vvwwwwwwwvv......',
    '.......vwwwxwwv.......',
    '.......vwxxywv........',
    '.......vwxxywv........',
    '......vwxxxyywv.......',
    '.....vwwxxxyyywv......',
    '....vwwwxxxxyyywv.....',
    '....vvvvvvvvvvvvv.....',
    '....mmmmmmmmmmmmm.....',
    '...mmmmmmmmmmmmmmm....',
    '......mmmmmmmmmm......',
  ],
  { tags: ['water', 'rock', 'naiad', 'moisture', 'order'], cycle: { ramp: 'water', rate: 3 } }
);

/**
 * A spring-head: water coming out of a cleft in the rock, not out of a pipe.
 * RESEARCH B3 makes that distinction the whole point of the naiad's water, so
 * the rock has to be visibly split and the water has to be visibly issuing.
 */
export const SPRING_HEAD = sprite(
  'spring-head',
  [0, 1],
  [
    '..........vvvvvv..........',
    '.......vvvwwwwwwvvv.......',
    '.....vvwwwxxxxxxxwwvv.....',
    '....vwwxxxyyyyyxxxxwwv....',
    '...vwxxxyyyyyyyyyxxxxwv...',
    '..vwxxyyyyyyyyyyyyyxxxwv..',
    '..vwxyyyyyyvvvyyyyyyyxxwv.',
    '.vwxyyyyyvvJJJvvyyyyyyxxwv',
    '.vwxyyyyvvJKKKJvvyyyyyyxwv',
    '.vwxxyyyvJKKKKKJvyyyyyyxwv',
    '.vwwxyyyvJKKKKKJvyyyyyxxwv',
    '.vwwxxyyvJJKKKJJvyyyyxxwwv',
    '..vwwxxyyvJJKJJvyyyxxxwwv.',
    '..vwwwxxyyvJJJvyyxxxwwwv..',
    '...cvwwxxyyyJJyyyxxwwvc...',
    '..bcdvwwxxxyJJyxxxwwvdcb..',
    '.abcddvwwwxxJJJxxwwvddcba.',
    '..abcddvvwwwJJJwwwvvddcb..',
    '...abccdvvJJJJJJJvvdccba..',
    '....abccvJJIIIIIJJvccba...',
    '.....abcvJIIHHHIIJvcba....',
    '......abvJIIHHHIIJvba.....',
    '.......vJJIIIIIIIJJv......',
    '.......vvJJJJJJJJJvv......',
    '........vvvvvvvvvv........',
    '.....mmmmmmmmmmmmmmmm.....',
    '....mmmmmmmmmmmmmmmmmm....',
    '.......mmmmmmmmmmmm.......',
  ],
  { tags: ['water', 'rock', 'naiad', 'satyr', 'moisture', 'wildness'], cycle: { ramp: 'water', rate: 6 } }
);

// The votive shelf moved down into the affinity set. It used to be 24x25 —
// less than half the footprint of every other single in the set, so it read
// as a detail rather than as a thing you commit ground with. See
// "3 · VOTIVE SHELF" below.

// ===========================================================================
// Structures
// ===========================================================================

// The drystone wall moved down into the nullifier family. It used to be a
// 24px stub, which meant a row of them left gaps — visibly not a barrier,
// which is fatal for an occluder — and it sat next to three full-tile hedges
// looking like a different game. See "Nullifier · drystone wall" below.

/** A stone bench with marble slab and two block legs. */
export const BENCH = sprite(
  'bench',
  [0, 1],
  [
    '.....AAAAAAAAAAAAAAAA...',
    '...AADDDDDDDDDDDDDDDDAA.',
    '.AADDDDDDDDDDDDDDDDDDDDA',
    'ADDDDDDDDDDDDDDDDDDDDDCA',
    'ACCCCCCCCCCCCCCCCCCCCCBA',
    'ABBBBBBBBBBBBBBBBBBBBBAA',
    '.AAAAAAAAAAAAAAAAAAAAAA.',
    '.ADDCA..........ADDCA...',
    '.ADDCA..........ADDCA...',
    '.ACCBA..........ACCBA...',
    '.ACCBA..........ACCBA...',
    '.ACBBA..........ACBBA...',
    '.ACBBA..........ACBBA...',
    'AADDDDAA......AADDDDAA..',
    'ACCCCBBA......ACCCCBBA..',
    'ABBBBBAA......ABBBBBAA..',
    '.AAAAAA........AAAAAA...',
    '.mmmmmmmmmmmmmmmmmmmm...',
    'mmmmmmmmmmmmmmmmmmmmmm..',
    '...mmmmmmmmmmmmmmmmm....',
  ],
  { tags: ['structure', 'marble', 'order', 'seclusion'] }
);

/**
 * A timber pergola with vine over it.
 *
 * ---------------------------------------------------------------------------
 * REDRAWN IN THE PROJECTION (2026-08-02). The owner, looking at a garden:
 * *"the pergola could use an isometric update."*
 *
 * The old one is preserved below as `PERGOLA_ELEVATION` and it is worth a look,
 * because it is the clearest example in the tree of the fault this whole arc
 * is about: four posts in a row, a flat beam grid over them, and every single
 * edge horizontal. A front elevation of a pergola, pasted into a world that
 * has no front.
 *
 * AND A PERGOLA IS THE WORST POSSIBLE OBJECT TO DRAW THAT WAY, because a
 * pergola IS a grid of beams — the one thing in a garden whose whole
 * appearance is which way its timbers run. Drawn correctly it is the most
 * isometric object in the game:
 *
 *   FOUR POSTS on the tile's own corners. The tile's N, E, S and W vertices
 *   are the corners of a square in world space, so posts there are a square
 *   pergola aligned to the grid — and the two gaps between them on each axis
 *   are the two ways you can walk through it.
 *   TOP PLATES along the four diamond edges, which run 1-in-2 by construction.
 *   RAFTERS across, parallel to the +ty edges and sitting 2 px proud of the
 *   plates, so the roof reads as two layers of timber crossing rather than as
 *   a lid.
 *   VINE on top, thicker at the back so the near beams stay legible. A vine
 *   that covers the frame evenly hides the only thing that says "pergola".
 *
 * Timber in the BARK ramp (q outline, r shade, s core, t lit) — not stone
 * grey, which is what makes it read as a built thing rather than a ruin.
 * ---------------------------------------------------------------------------
 */
/**
 * The old pergola, kept where it can be looked at rather than deleted.
 *
 * Nothing draws it and nothing should. It is here because it is the clearest
 * front elevation left in the tree — four posts in a row, a flat beam grid,
 * every edge horizontal — and reading it beside `pergolaGrid` above is the
 * fastest way to understand what "drawn in the projection" actually changes.
 * `tools/iso-audit.mjs --elev` will keep listing it as unreachable art, which
 * is correct and is the point.
 */
export const PERGOLA_ELEVATION = sprite(
  'pergola-elevation',
  [0, 1],
  [
    '....bbb....bbbb.....bbb.....',
    '..abcdcb.abcddcba..abcdb....',
    '.abcdedcbbcdeedcbabcdedcba..',
    'abcdeedcbcdeeedcbbcdeeedcba.',
    'abcdeedcbcdeedcbabcdeeedcba.',
    '.abcddcbabcddcbaabcdddcba...',
    '..abccba..abcba..abccbba....',
    'qqrrqqrrqqrrqqrrqqrrqqrrqqrr',
    'qsttsqsttsqsttsqsttsqsttsqst',
    'qrssrqrssrqrssrqrssrqrssrqrs',
    'qqrrqqqrrqqqrrqqqrrqqqrrqqqr',
    '.ab...................ba....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq...........cb...qstq....',
    'qstq..........bcdb..qstq....',
    'qstq..........abcb..qstq....',
    'qstq...........ab...qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qstq................qstq....',
    'qqtq................qqtq....',
    'qqqq................qqqq....',
    'mmmmmm............mmmmmm....',
    '.mmmm..............mmmm.....',
    '..mm................mm......',
  ],
  {
    tags: ['structure', 'timber', 'satyr', 'shade', 'seclusion'],
  }
);

/**
 * A single-span stone bridge. It is drawn along the +tx axis like the wall, so
 * a stream crossing reads continuous; the water under the arch is authored in
 * the water ramp so it cycles with the pool it spans.
 */
export const BRIDGE = sprite(
  'bridge',
  [0, 1],
  [
    '..........AAAAAAAAAAAA..........',
    '.......AAADDDDDDDDDDDDAAA.......',
    '....AAADDDDDDDDDDDDDDDDDDAAA....',
    '..AADDDDDDDDDDDDDDDDDDDDDDDDAA..',
    'AADDDDDDDDDDDDDDDDDDDDDDDDDDDDAA',
    'ACCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA',
    'ABBCCBBCCBBCCBBCCBBCCBBCCBBCCBBA',
    'ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA',
    'ACCBBACCBBACCBBACCBBACCBBACCBBAA',
    'ACCBBACCBBAAAAAAAACCBBACCBBAA...',
    'ACCBBACCBAA......AACCBBACCBBA...',
    'ACCBBACCBA........ACCBBACCBBA...',
    'ACCBBACBA..........ACCBBACCBA...',
    'ACCBBACA............ACCBBACBA...',
    'ACCBBABA.....FFF.....ACCBBABA...',
    'ACCBBABA...FFGGGF....ACCBBABA...',
    'ACCBBABA..FGGHHGGF...ACCBBABA...',
    'ACCBBABA.FGHHIIHHGF..ACCBBABA...',
    'ACCBBABAFGHIIJJIIHGF.ACCBBABA...',
    'AABBAAAAFGHIJJJJIHGFAAABBAAAA...',
    '.AAAAA..FGHIJJJJIHGF..AAAAA.....',
    'mmmmmmm.FFGHIIIIHGFF.mmmmmmm....',
    'mmmmmmm..FFGGHHGGFF..mmmmmmm....',
    '.mmmmm....FFFGGFFF....mmmmm.....',
  ],
  { tags: ['structure', 'marble', 'order', 'moisture'], cycle: { ramp: 'water', rate: 5 } }
);

/** A marble sundial: a fluted stub column with an inclined gnomon on a disc. */
export const SUNDIAL = sprite(
  'sundial',
  [0, 1],
  [
    // The dial PLATE has to be big enough to read as a disc seen at 2:1, or the
    // whole object is a column with a match on top. It is the widest thing in
    // the sprite, and the gnomon's shadow is drawn on it — a sundial with no
    // shadow is just a plate.
    '...........TT.......',
    '..........TUV.......',
    '.........TUVW.......',
    '........TUVW........',
    '.......TUVW.........',
    '......TUVW..........',
    '.....TUVW...........',
    '.....UVW............',
    '...AAAAAAAAAAAAAA...',
    '.AAEEEEEEEEEEEEEEAA.',
    'AEEEEEEEEEEEEEEEEEEA',
    'ADDDEEEEEDDDDDDDDDDA',
    'ADDBADDDDDDDDDDDDDCA',
    'ACDDBADDDDDDDDDDDCCA',
    'ACCDDBADDDDDDDDCCBBA',
    'ABCCDDDBADDDDDCCBBBA',
    'AABBCCCCCCCCCCBBBAAA',
    '..AAABBBBBBBBBAAA...',
    '.....AAAAAAAAA......',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '....CDEEDCCBA...',
    '...BCDEEDCCBBA..',
    '..BCDDEEDDCCBBA.',
    '.BCDDDDDDDDCCBBA',
    'ACDDDDDDDDDCCBBA',
    'ACCCCCCCBBBBBBAA',
    'ABBBBBBBBBBBBBAA',
    '.ACCCCCCBBBBBBA.',
    '...ACCCCBBBBA...',
    '.....ACCBBA.....',
    '.......AA.......',
  ],
  { tags: ['structure', 'marble', 'order', 'unicorn'] }
);

/**
 * A libation altar: a moulded marble block, its top face dished and darkened by
 * milk, honey and oil. The staining is the point — a clean altar is furniture,
 * a used one is cult.
 */
export const ALTAR = sprite(
  'altar',
  [0, 3],
  [
    '.....AAAAAAAAAAAAAA.....',
    '..AAADDDDDDDDDDDDDDAAA..',
    'AADDDDDDDDDDDDDDDDDDDDAA',
    'ADDDDDDBBBBBBBBBDDDDDDDA',
    'ADDDDBBAAAAAAAAABBDDDDDA',
    'ADDDDBAqqqqqqqqqABBDDDDA',
    'ADDDDBBAqqqqqqqABBDDDDCA',
    'ADDDDDBBAAAAAABBDDDDDCCA',
    'ACDDDDDDBBBBBBDDDDDCCCBA',
    'ACCCCCCCCCCCCCCCCCBBBBBA',
    'AABBBBBBBBBBBBBBBBBBBBAA',
    '.ADDDDDDDDDDDDDDDDDDDDA.',
    '.ACCCCCCCCCCCCCBBBBBBBA.',
    '.ACCCCCCCCCCCBBBBBBBBBA.',
    '.ACCDDDCCCCCBBBBBCCCBBA.',
    '.ACCDEEDCCCCBBBBCDDCBBA.',
    '.ACCDEEDCCCCBBBBCDDCBBA.',
    '.ACCDDDCCCCCBBBBBCCCBBA.',
    '.ACCCCCCCCCCBBBBBBBBBBA.',
    '.ACCCCCCCCCBBBBBBBBBBAA.',
    'AABBBBBBBBBBBBBBBBBBBAA.',
    'ADDDDDDDDDDDDDDDDDDDDDA.',
    'ACCCCCCCCCBBBBBBBBBBBBA.',
    'ABBBBBBBBBBBBBBBBBBBBAA.',
    '.ACCCCCCCCCBBBBBBBBBBA..',
    '...ACCCCCCCBBBBBBBBA....',
    '.....ACCCCCBBBBBBA......',
    '.......ACCCBBBBA........',
    '.........ACBBA..........',
    '...........A............',
  ],
  { tags: ['structure', 'marble', 'naiad', 'order', 'maturity'] }
);

// ===========================================================================
// Satyr furniture
// ===========================================================================

/** A syrinx hung on a post. Leave one out and Pan may come for it. */
export const SYRINX_POST = sprite(
  'syrinx-post',
  [0, 1],
  [
    '.....qq.....',
    '....qstq....',
    '....qstq....',
    '..UUqstqUU..',
    '.UWVqstqVWU.',
    '.UWVUUUUVWU.',
    '.UWVUWWUVWU.',
    '.UWVUWWUVWU.',
    '.UWVUWWUVWU.',
    '.UWVUWWUVWU.',
    '.UWVUWWUVWU.',
    '.UWVUWWUVWU.',
    '.UVUUWWUUVU.',
    '..UUqstqUU..',
    '...TqstqT...',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '....qstq....',
    '...qqstqq...',
    '...qqqqqq...',
    '..mmmmmmmm..',
    '...mmmmmm...',
    '....mmmm....',
  ],
  { tags: ['prop', 'timber', 'satyr', 'pan', 'wildness'] }
);

/**
 * A satyr mask on a pole, wreathed in ivy — the Lenaia-vase idol. Terracotta
 * mask so it does NOT read as another piece of marble sculpture: this is a
 * thing hung up, not a thing carved.
 */
export const SATYR_MASK_POLE = sprite(
  'satyr-mask-pole',
  [0, 1],
  [
    '.......bcb......',
    '...bcb.cdc.bcb..',
    '..bcdcbcdcbcdcb.',
    '.abcdedcdedcdcba',
    '..abcdedededcba.',
    '...PPPabcbcbaP..',
    '..PQRRQPPPQRRQP.',
    '.PQRSSSRQRSSSRQP',
    '.PQRSSSSSSSSSRQP',
    'PQRSSSSSSSSSSSRQ',
    'PQRSSPPSSSPPSSRQ',
    'PQRSSPQPSSPQPSRQ',
    'PQRSSSPSSSSPSSRQ',
    'PQRSSSSSPSSSSSRQ',
    'PQRSSSSPQPSSSSRQ',
    'PQRSSSSSPSSSSSRQ',
    'PQRSSPPPPPPPSSRQ',
    'PQRSSPQQQQQPSSRQ',
    '.PQRSSPPPPPSSRQP',
    '.PQRSSSPPPSSSRQP',
    '..PQRRSSSSSRRQP.',
    '...PQRRRRRRRQP..',
    '....PQQQQQQQP...',
    '.....qqstqq.....',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '.....qqstq......',
    '....qqqstqq.....',
    '....qqqqqqq.....',
    '...mmmmmmmmm....',
    '....mmmmmmm.....',
    '.....mmmmm......',
  ],
  { tags: ['prop', 'terracotta', 'satyr', 'wildness'] }
);

// ===========================================================================
// THE AFFINITY SET (docs/DECOR.md Part I)
//
// 33 objects that argue about whose ground this is. Numbering is fixed:
//   1 = satyr   2 = centaur   3 = naiad   4 = unicorn
//
// The lore is not a caption. Each object has to be RECOGNISABLE as the thing
// the source names, or the mechanic is arbitrary: the pithos has to look like
// a jar sunk in the earth, the herm like a stone you would not walk past, the
// lily pool like water you could drink. Where the source is specific the art
// follows the source, not the vibe.
//
// ---------------------------------------------------------------------------
// A PRIVATE CLUMP COMPOSER
//
// SPEC 4 splits the art system: precision things are hand-authored rows,
// foliage is composed from clumps. Eight of the affinity items are trees, and
// hand-typing eight canopies as text produces exactly the two failures
// RESEARCH A6 names — the broccoli tree and the green blob — because a human
// typing 'ccccddddcccc' cannot hold a value structure in their head across
// sixty rows.
//
// So the foliage here is COMPOSED. This is a small private composer, not a
// dependency on js/art/grow.js: this file must stay ownable and importable on
// its own, and these are fixed objects rather than seeded plantings, so they
// want determinism rather than variety. Same input, same tree, every load.
//
// The lighting rule is the same one the rest of the file obeys. Each clump has
// a LIGHT POINT up and to the left of its centre; value falls off with
// distance from that point, not from the clump's middle. That single change is
// the difference between a sphere and a blob: a blob is bright in the middle,
// a lit form is bright off-centre and has a long dark tail into the lower
// right. Rim pixels drop one further step so every mass keeps its own edge and
// the canopy reads as several masses rather than one lump.
// ===========================================================================

const G = (w, h) => Array.from({ length: h }, () => new Array(w).fill('.'));
const gridRows = (g) => g.map((r) => r.join(''));

function put(g, x, y, ch) {
  x = Math.round(x);
  y = Math.round(y);
  if (y < 0 || y >= g.length || x < 0 || x >= g[0].length) return;
  g[y][x] = ch;
}
function peek(g, x, y) {
  x = Math.round(x);
  y = Math.round(y);
  if (y < 0 || y >= g.length || x < 0 || x >= g[0].length) return '.';
  return g[y][x];
}
/** Deterministic 0..1 noise. Nothing random ever leaves this file. */
const nz = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ramps used by the composer, by name, so the intent reads at the call site. */
const LEAF = 'abcde'; // broadleaf canopy
const NEEDLE = 'abcd'; // pine — the same ramp with the top step withheld
const CONIFER = 'jjkl'; // cypress: mostly black-green with one lit step
const SCRUB = 'fghi'; // dry olive scrub
// Bark stops at 't'. The first pass ran trunks to 'u' and every tree in the
// set came out with a pale stripe down it that fought the canopy for
// attention. A trunk is a dark vertical in a Zeus-alike; the light on it is a
// suggestion, not an event.
const BARK = 'qqrst';
const STONE = 'vwxy';

function pergolaGrid() {
  const W = 70;
  const H = 68;
  const CX = 35; // the tile's centre column
  const GY = 50; // ...and the row its centre sits on
  const POST = 26; // clear height under the beams
  const g = G(W, H);
  const T = BARK; // 'qqrst'

  // The tile's four corners, as screen offsets from its centre. A 64x32
  // diamond, which is the only shape the ground has.
  const CORNERS = { N: [0, -16], E: [32, 0], S: [0, 16], W: [-32, 0] };
  const lift = ([dx, dy]) => [CX + dx, GY + dy - POST];

  /** A post from a tile corner up to the roof. */
  const post = (c) => {
    const [dx, dy] = CORNERS[c];
    const x = CX + dx;
    const base = GY + dy;
    for (let y = base - POST; y <= base; y++) {
      // FOUR PIXELS, not three. A 3px post at this height read as wire and the
      // whole thing came out a wrought-iron table; a pergola is sawn timber and
      // wants to look like it could hold a vine up. Outline on the shadow side
      // only, so the lit edge stays open against the grass.
      put(g, x - 2, y, T[3]);
      put(g, x - 1, y, T[4]); // lit face, toward the upper left
      put(g, x, y, T[2]);
      put(g, x + 1, y, T[0]); // and the shaded one
    }
    for (let k = -2; k <= 1; k++) put(g, x + k, base + 1, T[0]); // planted, not resting
  };

  /**
   * A timber running between two roof points along a legal 1-in-2 diagonal.
   * `deep` is how much of its side face shows; a beam with none is a line.
   */
  const beam = (a, b, deep, top = T[4]) => {
    const n = Math.abs(b[0] - a[0]);
    const sx = Math.sign(b[0] - a[0]);
    const sy = Math.sign(b[1] - a[1]);
    for (let i = 0; i <= n; i++) {
      const x = a[0] + sx * i;
      const y = a[1] + sy * (i >> 1);
      put(g, x, y, top);
      for (let k = 1; k <= deep; k++) put(g, x, y + k, k === deep ? T[0] : T[2]);
    }
  };

  const N = lift(CORNERS.N);
  const E = lift(CORNERS.E);
  const S = lift(CORNERS.S);
  const Wc = lift(CORNERS.W);

  // Back posts first — N is the highest on screen and the roof draws over it.
  post('N');
  post('W');
  post('E');

  // The plates, on the diamond's own four edges.
  beam(N, E, 2);
  beam(Wc, S, 2);
  beam(N, Wc, 2);
  beam(E, S, 2);

  // Rafters across, 2 px proud so the two layers read as crossing. Each runs
  // parallel to N->W, from a point on N->E to the matching point on W->S.
  for (const t of [0.28, 0.5, 0.72]) {
    const from = [Math.round(N[0] + (E[0] - N[0]) * t), Math.round(N[1] + (E[1] - N[1]) * t) - 2];
    const to = [Math.round(Wc[0] + (S[0] - Wc[0]) * t), Math.round(Wc[1] + (S[1] - Wc[1]) * t) - 2];
    beam(from, to, 1, T[3]);
  }

  // The near post last: it stands in FRONT of the roof it holds up.
  post('S');

  // ------------------------------------------------------------------------
  // THE VINE, and the whole difficulty is knowing when to stop.
  //
  // Take one put 190 clumps over the roof plane and produced a dark green
  // lump on four legs: the rafters vanished, the plates vanished, and with
  // them the only thing that says PERGOLA rather than SHRUB. A vine that
  // covers its frame evenly has hidden the object it is growing on.
  //
  // So: forty clumps, small, and weighted hard toward the BACK. `u + v` grows
  // toward the camera, so thinning by it leaves the two near plates and the
  // near ends of the rafters bare — which is exactly where a player looking
  // at the thing needs to see timber crossing timber.
  //
  // AND IT GROWS ALONG THE PLATES, not over the plane at random. Take two
  // scattered clumps in the roof's own (u, v) and thinned toward the camera;
  // the maths was right and it came out a horizontal smear across the middle,
  // because a uniform scatter minus its front half is a band, and a band is a
  // screen-space shape. A vine climbs a POST and runs along the TIMBER — so
  // this walks the two back plates, N->E and N->W, and drops clumps with a
  // little inward spread. That puts the foliage in a shallow V following the
  // roof's own edges, which is the shape nothing else in the sprite could be
  // mistaken for, and leaves the near half of the frame bare.
  // ------------------------------------------------------------------------
  const trail = (to, seed) => {
    const steps = 34;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Denser at the corner it climbed from, ragged at the far end.
      if (nz(i, seed) < t * 0.55) continue;
      const inward = nz(i, seed + 5) * 15; // how far it has crept across the roof
      const bx = N[0] + (to[0] - N[0]) * t;
      const by = N[1] + (to[1] - N[1]) * t;
      const ix = (E[0] + Wc[0]) / 2 - N[0];
      const iy = (E[1] + Wc[1]) / 2 - N[1];
      const x = Math.round(bx + (ix / 32) * inward);
      const y = Math.round(by + (iy / 32) * inward) - 2;
      const r = 2 + Math.round(nz(i, seed + 9) * 2.2);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r - 1; dx <= r + 1; dx++) {
          if (dx * dx * 0.5 + dy * dy > r * r) continue;
          // Foliage law: lit step on the upper left of each clump, and a leaf
          // over a leaf goes one step DARKER — which is what stops a vine
          // reading as one flat green sheet. No outline: an outlined clump at
          // this size is mostly outline, and 'a' against canopy is a hole.
          const lit = dx + dy < -r * 0.3;
          const over = peek(g, x + dx, y + dy);
          const under = LEAF.indexOf(over);
          put(g, x + dx, y + dy, under >= 0 ? LEAF[Math.max(1, under - 1)] : lit ? LEAF[4] : LEAF[3]);
        }
      }
    }
  };
  trail(E, 3);
  trail(Wc, 31);

  // ...and one strand come down the post it climbed, because a vine that
  // begins in mid-air at roof height is a hat.
  {
    const [px, py] = [CX + CORNERS.N[0], GY + CORNERS.N[1]];
    for (let k = 0; k < 13; k++) {
      if (nz(k, 61) < 0.42) continue;
      const y = py - POST + k;
      put(g, px - 2, y, LEAF[3]);
      put(g, px - 1, y, nz(k, 71) > 0.5 ? LEAF[4] : LEAF[2]);
      if (nz(k, 83) > 0.6) put(g, px, y, LEAF[2]);
    }
  }
  return g;
}

export const PERGOLA = composed('pergola', pergolaGrid(), [35, 51], {
  tags: ['structure', 'timber', 'satyr', 'shade', 'seclusion'],
});


/**
 * One foliage mass. `wobble` breaks the circle — a perfectly round clump is
 * the broccoli failure however well it is shaded.
 */
function clump(g, cx, cy, rx, ry, ramp = LEAF, opt = {}) {
  const n = ramp.length - 1;
  // Wobble was 0.14 and every clump still read as a circle, so a crown built
  // from six of them read as six bubbles. 0.22 is the point where the eye
  // stops finding the ellipse.
  const wob = opt.wobble === undefined ? 0.22 : opt.wobble;
  const seed = opt.seed || 0;
  const lift = opt.lift || 0;
  const hx = cx - 0.42 * rx;
  const hy = cy - 0.42 * ry;
  for (let y = Math.floor(cy - ry * 1.3); y <= Math.ceil(cy + ry * 1.3); y++) {
    for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const th = Math.atan2(ny, nx);
      const edge = 1 + wob * Math.sin(3 * th + seed) + wob * 0.55 * Math.sin(5 * th - seed * 1.7);
      const r = Math.hypot(nx, ny);
      if (r > edge) continue;
      const d = Math.hypot((x - hx) / rx, (y - hy) / ry);
      // Brighter than take one (1.08/0.85). Between the per-clump rim
      // darkening and shadeCanopy, every crown was being stepped down twice
      // and the whole set came out near-black against the grass. Trees must
      // read DARK against the ground (palette.js) — not read as holes in it.
      let i = Math.round(n * (1.18 - 0.80 * d) + lift);
      if (r > edge - 0.10) i -= 1;
      i = Math.max(0, Math.min(n, i));
      put(g, x, y, ramp[i]);
    }
  }
}

/**
 * A trunk or a limb: a tapering cylinder from (x0,y0) to (x1,y1). Shaded
 * ACROSS its width with the highlight a third in from the lit edge, which is
 * the rounded-form rule from the header comment. A limb shaded along its
 * length reads as a ribbon.
 */
function bough(g, x0, y0, x1, y1, w0, w1, ramp = BARK) {
  const n = ramp.length - 1;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = x0 + (x1 - x0) * t;
    const cy = y0 + (y1 - y0) * t;
    const hw = Math.max(0.5, (w0 + (w1 - w0) * t) / 2);
    const lo = Math.floor(cx - hw);
    const hi = Math.ceil(cx + hw);
    for (let x = lo; x <= hi; x++) {
      const u = (x - lo) / Math.max(1, hi - lo);
      let i = Math.round(n - (n + 1.6) * Math.abs(u - 0.3));
      if (x === lo || x === hi) i = 0;
      put(g, x, cy, ramp[Math.max(0, Math.min(n, i))]);
    }
  }
}

/**
 * THE DARK CORE. RESEARCH A6 names the "green blob" — a canopy with no
 * internal value structure — and clumps alone do not cure it, because each
 * clump is individually well lit and the union is therefore uniformly well
 * lit. The cure is occlusion: a leaf with foliage above and to its LEFT is in
 * the shade of that foliage and must go down the ramp.
 *
 * Sampled at a distance rather than at the adjacent pixel, so it produces
 * soft masses of shadow — the valleys between clumps — instead of a one-pixel
 * outline around everything.
 */
function shadeCanopy(g, ramp = LEAF) {
  const src = g.map((r) => r.slice());
  const at = (x, y) => (y < 0 || y >= src.length || x < 0 || x >= src[0].length ? '.' : src[y][x]);
  const probes = [[-1, -4], [-3, -3], [-4, -1], [-2, -5], [-5, -2], [0, -5], [-6, 0], [-4, -4]];
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const i = ramp.indexOf(src[y][x]);
      if (i < 0) continue;
      let cover = 0;
      for (const [dx, dy] of probes) if (ramp.indexOf(at(x + dx, y + dy)) >= 0) cover++;
      // 8 and 7, not 8 and 6. At 6 the pass darkened nearly every interior
      // pixel of a small crown and the trees went from blobs to silhouettes —
      // the cure overshooting into the disease it was written for.
      if (cover >= 8) g[y][x] = ramp[Math.max(0, i - 2)];
      else if (cover >= 7) g[y][x] = ramp[Math.max(0, i - 1)];
    }
  }
}

/**
 * Blossom, scattered over a finished canopy.
 *
 * It has to read off the canopy as it was BEFORE shadeCanopy ran, not after.
 * Take one scattered blossom on the shaded result and a hawthorn in full
 * flower came out with a white cap and a green body, because shadeCanopy had
 * already pushed nine tenths of the crown down to 'a' and 'b' and the blossom
 * rule found nothing to sit on. `pre` is the unshaded copy: WHERE flowers grow
 * is a question about the form, HOW BRIGHT they are is a question about the
 * light, and the two want different inputs.
 */
function blossomOver(g, pre, opt = {}) {
  const dens = opt.density === undefined ? 0.7 : opt.density;
  const w = g[0].length;
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < w; x++) {
      const c = g[y][x];
      if (!'abcde'.includes(c)) continue;
      const n = nz(x * 2.1, y * 1.3);
      const grade = 'abcde'.indexOf(pre[y][x]) / 4;
      if (n <= 1 - dens * (0.2 + 0.8 * grade)) continue;
      // WHITE BLOSSOM NEEDS A RAMP OR IT HAS NO FORM. Take one had only
      // accent 7 (white) and accent 3 (pink) to work with, so every flower in
      // shadow came out PINK and both thorns turned into candyfloss. White in
      // shadow is a warm grey, which is precisely what the marble ramp is —
      // so blossom is authored on marble D/C/B with accent 7 as the highlight,
      // and accent 3 kept for the handful of genuinely pink-tinged buds that
      // both these species actually carry.
      let ch = grade > 0.72 ? '7' : grade > 0.46 ? 'D' : grade > 0.22 ? 'C' : 'B';
      if (nz(x * 3.3, y * 5.1) > 0.93) ch = '3';
      put(g, x, y, ch);
    }
  }
}

/**
 * A rock. Deliberately NOT the foliage clump with a grey ramp swapped in —
 * that produces a beanbag. Stone reads by FACETS: flat planes meeting at hard
 * edges, each plane one value, the value set by how the plane faces the light.
 * The facet grid is coarse noise quantised to about four cells across the
 * boulder, which is all it takes for the eye to call it broken rather than
 * inflated.
 */
function boulder(g, cx, cy, rx, ry, ramp = STONE, opt = {}) {
  const n = ramp.length - 1;
  const seed = opt.seed || 0;
  const wob = opt.wobble === undefined ? 0.11 : opt.wobble;
  const fw = Math.max(3, rx / 2.3);
  const fh = Math.max(3, ry / 1.9);
  for (let y = Math.floor(cy - ry * 1.3); y <= Math.ceil(cy + ry * 1.3); y++) {
    for (let x = Math.floor(cx - rx * 1.3); x <= Math.ceil(cx + rx * 1.3); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const th = Math.atan2(ny, nx);
      const edge = 1 + wob * Math.sin(3 * th + seed) + wob * 0.8 * Math.sin(5 * th - seed);
      const r = Math.hypot(nx, ny);
      if (r > edge) continue;
      const facet = nz(Math.floor((x - cx) / fw) * 3 + seed, Math.floor((y - cy) / fh) * 5 + seed) - 0.5;
      const lit = (-nx - ny) * 0.7071;
      let i = Math.round(n * (0.5 + 0.52 * lit) + facet * 1.5 + (opt.lift || 0));
      if (r > edge - 0.13) i = Math.min(i, ny + nx < 0 ? n - 1 : 0);
      put(g, x, y, ramp[Math.max(0, Math.min(n, i))]);
    }
  }
}

/**
 * A felled trunk lying along the +tx axis, so it descends one pixel per two
 * across like the wall and the hedges. Shaded as a cylinder ACROSS the axis,
 * with a pale end-grain disc at the near end — the end grain is the whole tell
 * that this is cut timber and not a log-shaped rock.
 */
function logAlong(g, x0, y0, len, rad, ramp = BARK, opt = {}) {
  const n = ramp.length - 1;
  for (let k = 0; k <= len; k++) {
    const x = x0 + k;
    const cy = y0 + k * 0.5;
    const taper = 1 - 0.18 * (k / len);
    const rr = rad * taper;
    for (let y = Math.round(cy - rr); y <= Math.round(cy + rr); y++) {
      const u = (y - (cy - rr)) / (2 * rr);
      let i = Math.round(n - (n + 1.5) * Math.abs(u - 0.3));
      if (y === Math.round(cy - rr) || y === Math.round(cy + rr)) i = 0;
      if (nz(k * 0.7, y * 3) > 0.88) i = Math.max(0, i - 1); // bark ridges
      put(g, x, y, ramp[Math.max(0, Math.min(n, i))]);
    }
  }
  if (opt.endGrain !== false) {
    const cy = y0 + len * 0.5;
    const rr = rad * 0.82;
    for (let y = Math.round(cy - rr); y <= Math.round(cy + rr); y++) {
      for (let dx = 0; dx <= 3; dx++) {
        const t = Math.abs(y - cy) / rr;
        if (t > 1) continue;
        const ring = Math.round(Math.abs(y - cy) / 1.6) % 2;
        put(g, x0 + len + dx, y, dx === 3 || t > 0.86 ? 'B' : ring ? 'C' : 'D');
      }
    }
  }
}

/** Bark texture: a few dark flecks so a trunk is not an extruded gradient. */
function barkFleck(g, cx, yTop, yBot, spread, ramp = BARK) {
  for (let y = yTop; y <= yBot; y += 2) {
    for (let k = -spread; k <= spread; k++) {
      if (nz(k * 7 + 3, y) > 0.86 && peek(g, cx + k, y) !== '.') put(g, cx + k, y, ramp[0]);
    }
  }
}

/**
 * Shade on a surface OF THE OBJECT — a podium top, a step, a plinth. One call
 * site left in the game: the altar standing inside the heroon.
 *
 * IT IS NOT THE CONTACT SHADOW. render.js draws that, in its own pass, on the
 * world ground. The distinction is the whole of step 3 and it is worth stating
 * as a test the next author can apply in one look:
 *
 *     WHICH PLANE DOES THIS SHADE LIE ON?
 *       the world ground  ->  the renderer's. Do not bake it.
 *       a surface of this object  ->  yours. Bake it here.
 *
 * Forty-three call sites failed that test and were deleted; each was an object's
 * own contact with the ground, drawn in 'm' = GRASS[0], which is why the whole
 * catalogue stood on little green mats when it stood on flagstone. This one
 * passes: the altar sits on marble the heroon brought with it, the ground pass
 * has no idea that surface exists, and 'm' is right there whatever the heroon
 * itself is standing on.
 *
 * Only ever fills empty pixels, so it can be laid down last without eating the
 * thing it is bedding in.
 *
 * IT IS STILL A CIRCLE ON A PLANE seen at 2:1, so its depth is not the caller's
 * to choose — see GROUND_ELLIPSE in js/iso.js. It used to take a `ry` and every
 * call site passed 3, 4 or 5, giving ellipses at 3.7:1 and flatter: a circle
 * seen from a shallower angle than this game's camera, reading as a decal on
 * the screen rather than a patch of shade, and level enough along the bottom to
 * put a sixteen-pixel horizontal edge under two dozen props. The podium is
 * foreshortened exactly like the ground, so the rule survives its own purge.
 */
function skirt(g, cx, cy, r) {
  const ry = r * GROUND_ELLIPSE;
  // MAKE ROOM FOR IT. `put` silently drops anything past the last row, and a
  // clipped ellipse is a straight horizontal line — the very fault this shape
  // exists to avoid, arriving by the back door. Forty of the forty-eight
  // sprites the audit flagged were flagged for exactly this: their art ran off
  // the bottom of their own bitmap.
  //
  // Growing DOWNWARD is free. The anchor is measured from the top, so appending
  // rows moves nothing in the game; it only stops the grid from cutting the
  // base off.
  const need = Math.round(cy + ry) + 1;
  while (g.length < need) g.push(new Array(g[0].length).fill('.'));
  for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) {
    for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++) {
      const nx = (x - cx) / r;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1 && peek(g, x, y) === '.') put(g, x, y, 'm');
    }
  }
}

/**
 * Still water. Dark at the far (upper) edge where the far bank reflects into
 * it, lighter toward the viewer, with dithered 'K' glints — SPEC 3 allows the
 * checkerboard only on areas over ~24px, which every pool here is.
 * `rim` draws a stone lip; pass null for water that just meets the grass.
 *
 * A POOL IS A BODY OF WATER LYING IN THE GROUND PLANE, so its depth on screen
 * is not the caller's to choose: `ry = r * GROUND_ELLIPSE`, exactly as for the
 * contact shadow. This used to take an explicit `ry` and ALL EIGHT call sites
 * passed something flatter than the ground allows — ratios from 0.24 to 0.45,
 * not one of them 0.5. A 4:1 "ellipse" is a circle seen from a shallower angle
 * than this game's camera; it reads as a decal, and its lowest rows are level
 * for long enough to be a horizontal edge. `willow-water` was the one the audit
 * caught (42 px of it) but every pool in the game had the same geometry.
 *
 * It makes room for itself for the same reason `skirt` does: `put` drops
 * anything past the last row, and a clipped ellipse is a straight line.
 */
function pool(g, cx, cy, r, opt = {}) {
  const rx = r;
  const ry = r * GROUND_ELLIPSE;
  const rimRamp = opt.rim === null ? null : opt.rim || STONE;
  const rw = opt.rimW === undefined ? 3 : opt.rimW;
  const seed = opt.seed || 0;
  const wob = opt.wobble === undefined ? 0.06 : opt.wobble;
  const glint = opt.glint === undefined ? 0.6 : opt.glint;
  const need = Math.ceil(cy + ry + rw + 3);
  while (g.length < need) g.push(new Array(g[0].length).fill('.'));
  for (let y = Math.floor(cy - ry - rw - 2); y <= Math.ceil(cy + ry + rw + 2); y++) {
    for (let x = Math.floor(cx - rx - rw - 2); x <= Math.ceil(cx + rx + rw + 2); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const th = Math.atan2(ny, nx);
      const edge = 1 + wob * Math.sin(3 * th + seed) + wob * 0.7 * Math.sin(5 * th + seed * 2);
      const r = Math.hypot(nx, ny);
      if (r <= edge) {
        let i = 1 + Math.round(2.4 * (0.55 + ny * 0.45));
        if (((x + y) & 1) === 0 && nz(x * 1.3, y * 0.7) > glint) i += 1;
        if (r > edge - 0.12) i -= 1;
        put(g, x, y, 'FGHIJK'[Math.max(0, Math.min(5, i))]);
      } else if (rimRamp) {
        const rr = Math.hypot((x - cx) / (rx + rw), (y - cy) / (ry + rw * 0.62));
        if (rr > edge) continue;
        // Lit on the upper-left arc, shaded on the lower-right — a rim is a
        // torus and has to be shaded like one or the pool looks pasted on.
        const lit = (-nx - ny) * 0.7071;
        let i = Math.round(1.9 + lit * 1.5);
        if (nz(x, y * 2) > 0.72) i -= 1;
        put(g, x, y, rimRamp[Math.max(0, Math.min(rimRamp.length - 1, i))]);
      }
    }
  }
}

/**
 * Wrap a composed grid as a sprite. `[ax, ay]` is the anchor in GRID pixels —
 * absolute here rather than relative, because a composed object knows exactly
 * where its own base is and there is nothing to miscount.
 */
function composed(name, g, [ax, ay], opts = {}) {
  const r = gridRows(g);
  // NEVER strip a composed sprite's bottom rows. A generated grid may end in
  // pure 'm' as ART — shadowed turf on a barrow, shade pooled under a rock —
  // and no pixel distinguishes that from a hand-typed contact band. The signal
  // is which constructor the author reached for; this is that constructor, so
  // it goes straight to `build`. See `stripContactBand`.
  return build(name, [ax, ay], r, opts);
}

// ---------------------------------------------------------------------------
// TREES
//
// Eight species, and the silhouette test governs every one: blocked in flat
// black they must be tellable apart at a glance. Ash is a tall narrow bole
// with an upswept crown; the umbrella pine is a bare curved trunk under a flat
// parasol; the plane is a wide low dome; the apple is small and spreading; the
// willow weeps; the oak is a heavy gnarled mass; the two thorns are white.
// If two of them read the same, one of them is wrong.
// ---------------------------------------------------------------------------

/** 2 · The Pelian spear. Pelion's signature timber and Chiron's own mountain.
 *  Habit: TALL AND NARROW with an upswept crown — the tree you cut a shaft
 *  from. Its crown is barely wider than half its height, which is what tells
 *  it apart from the plane at fifty pixels. */
export const ASH_TREE = (() => {
  const g = G(54, 98);
  bough(g, 27, 92, 27, 26, 8, 4);
  bough(g, 27, 54, 14, 32, 5, 2);
  bough(g, 27, 52, 40, 30, 5, 2);
  bough(g, 27, 42, 19, 18, 4, 2);
  bough(g, 27, 40, 35, 16, 4, 2);
  barkFleck(g, 27, 40, 90, 4);
  // The crown climbs a long way down the boughs. Ash is not a lollipop: the
  // outline is a tall ellipse standing on end, tapering to a point at the top.
  clump(g, 13, 38, 11, 9, LEAF, { seed: 1.1, lift: -1 });
  clump(g, 41, 36, 11, 9, LEAF, { seed: 2.3, lift: -1 });
  clump(g, 27, 41, 12, 8, LEAF, { seed: 3.7, lift: -1 });
  clump(g, 15, 24, 12, 10, LEAF, { seed: 4.2 });
  clump(g, 39, 22, 12, 10, LEAF, { seed: 5.9 });
  clump(g, 27, 27, 13, 10, LEAF, { seed: 6.4, lift: -1 });
  clump(g, 22, 11, 12, 9, LEAF, { seed: 7.8 });
  clump(g, 33, 9, 11, 8, LEAF, { seed: 8.5 });
  shadeCanopy(g);
  return composed('ash-tree', g, [27, 93], { tags: ['tree', 'centaur', 'timber', 'maturity'] });
})();

/** 1,2 · Thyrsos finial for the satyr, mountain timber for the centaur.
 *  Habit: a long bare curving bole under a FLAT PARASOL. The bare trunk is
 *  two thirds of the sprite; a pine with foliage down its trunk is a christmas
 *  tree and reads as the wrong country entirely. */
export const UMBRELLA_PINE = (() => {
  const g = G(70, 98);
  // Take one gave this a ten-pixel bole and it came out a baobab. A pine's
  // trunk is SLENDER for its height — the crown is the mass, the trunk is a
  // line — and 6px at the base is plenty at this scale.
  bough(g, 30, 92, 34, 60, 7, 6);
  bough(g, 34, 61, 39, 30, 6, 4);
  bough(g, 39, 33, 22, 24, 3, 2);
  bough(g, 39, 33, 55, 22, 3, 2);
  barkFleck(g, 33, 40, 90, 3);
  clump(g, 37, 21, 30, 6, NEEDLE, { seed: 1.4, wobble: 0.09, lift: -1 });
  clump(g, 17, 17, 12, 5, NEEDLE, { seed: 2.8 });
  clump(g, 55, 16, 12, 5, NEEDLE, { seed: 3.1 });
  clump(g, 36, 12, 21, 6, NEEDLE, { seed: 4.6, wobble: 0.09 });
  clump(g, 25, 8, 10, 4, NEEDLE, { seed: 5.2 });
  clump(g, 47, 8, 10, 4, NEEDLE, { seed: 6.7 });
  shadeCanopy(g, NEEDLE);
  return composed('umbrella-pine', g, [29, 93], { tags: ['tree', 'satyr', 'centaur', 'shade'] });
})();

/** 2,3 · Standard Greek water-planting, and shade over open ground.
 *  Habit: a BROAD LOW DOME, as wide as it is tall — the opposite proportion
 *  to the ash, on purpose. */
export const PLANE_TREE = (() => {
  const g = G(84, 82);
  bough(g, 42, 76, 42, 34, 13, 8);
  bough(g, 42, 46, 18, 30, 8, 3);
  bough(g, 42, 44, 66, 27, 8, 3);
  // The plane's bark flakes off in pale plates. A couple of light patches on a
  // dark trunk is the whole diagnostic and it costs a dozen pixels.
  // Take one banded these in even horizontal courses and the trunk came out
  // bandaged. Real plane bark sheds in irregular VERTICAL flakes: a handful of
  // tall thin patches at unrelated heights, none of them level with another.
  for (const [k, y0, h] of [[-4, 41, 9], [1, 47, 7], [-1, 58, 11], [3, 39, 6], [-3, 66, 5], [2, 63, 8]]) {
    for (let dy = 0; dy < h; dy++) {
      const wob = Math.round(Math.sin(dy * 0.9 + k) * 0.6);
      for (let dx = 0; dx < 2 + (dy % 2); dx++) {
        if (peek(g, 42 + k + dx + wob, y0 + dy) !== '.') {
          put(g, 42 + k + dx + wob, y0 + dy, k < 0 ? (dx ? 't' : 'u') : 't');
        }
      }
    }
  }
  clump(g, 15, 30, 15, 11, LEAF, { seed: 1.9, lift: -1 });
  clump(g, 68, 28, 15, 11, LEAF, { seed: 2.2, lift: -1 });
  clump(g, 42, 32, 22, 12, LEAF, { seed: 3.3, lift: -1 });
  clump(g, 21, 16, 16, 11, LEAF, { seed: 4.8 });
  clump(g, 61, 15, 16, 11, LEAF, { seed: 5.5 });
  clump(g, 41, 11, 20, 11, LEAF, { seed: 6.1 });
  shadeCanopy(g);
  // The bole meets the ground in the ground plane — see groundFoot.
  groundFoot(g, BARK, { round: true });
  return composed('plane-tree', g, [42, 77], { tags: ['tree', 'centaur', 'naiad', 'shade', 'water-loving'] });
})();

/** 2,4 · Both of them equine, and an orchard is where you meet a horse.
 *  Habit: SMALL and low-branched — the tree a horse can reach into. */
export const APPLE_TREE = (() => {
  const g = G(58, 62);
  bough(g, 28, 56, 28, 32, 8, 6);
  bough(g, 28, 38, 12, 27, 5, 2);
  bough(g, 28, 37, 44, 25, 5, 2);
  barkFleck(g, 28, 38, 54, 3);
  clump(g, 12, 27, 12, 9, LEAF, { seed: 1.3, lift: -1 });
  clump(g, 45, 25, 12, 9, LEAF, { seed: 2.7, lift: -1 });
  clump(g, 28, 26, 15, 10, LEAF, { seed: 3.5, lift: -1 });
  clump(g, 17, 14, 12, 8, LEAF, { seed: 4.9 });
  clump(g, 40, 13, 12, 8, LEAF, { seed: 5.4 });
  clump(g, 28, 10, 13, 8, LEAF, { seed: 6.8 });
  shadeCanopy(g);
  // Fruit: two pixels each, a lit '2' with a '1' under it. One pixel is dirt,
  // three is a balloon. They hang on the OUTSIDE of the canopy — fruit buried
  // in the middle of a mass just reads as a colour fault.
  const fruit = [[12, 31], [20, 30], [34, 31], [45, 29], [16, 20], [30, 18], [39, 19], [26, 33], [8, 24], [50, 22], [23, 24]];
  for (const [fx, fy] of fruit) {
    if (!'abcde'.includes(peek(g, fx, fy))) continue;
    put(g, fx, fy, '2');
    put(g, fx, fy + 1, '1');
    put(g, fx + 1, fy + 1, '1');
    put(g, fx + 1, fy, '3');
  }
  return composed('apple-tree', g, [28, 57], { tags: ['tree', 'centaur', 'unicorn', 'fruit', 'order'] });
})();

/** 3,4 · Willow over water. Both want the water, for opposite reasons.
 *  Habit: the only WEEPING silhouette in the set. Everything above the strands
 *  is a shaggy cap; the strands themselves are the whole identity, so they run
 *  nearly to the waterline and hang in a continuous curtain. */
export const WILLOW_WATER = (() => {
  const g = G(84, 92);
  pool(g, 42, 80, 40, { rim: null, seed: 1.2, wobble: 0.1 });
  bough(g, 34, 80, 29, 44, 12, 7);
  bough(g, 29, 48, 17, 36, 5, 2);
  bough(g, 29, 47, 48, 33, 5, 2);
  clump(g, 25, 30, 19, 11, LEAF, { seed: 1.7, lift: -1 });
  clump(g, 55, 27, 17, 10, LEAF, { seed: 2.4, lift: -1 });
  clump(g, 40, 15, 23, 10, LEAF, { seed: 3.9 });
  clump(g, 11, 23, 11, 8, LEAF, { seed: 4.1, lift: -1 });
  clump(g, 70, 23, 11, 8, LEAF, { seed: 5.6, lift: -1 });
  clump(g, 40, 27, 20, 10, LEAF, { seed: 6.3, lift: -2 });
  shadeCanopy(g);
  // The curtain. Strands hang from the UNDERSIDE of the crown and stop at
  // different heights; cut level they read as a hedge on stilts. Two pixels
  // wide with the left one lighter, because a strand is still a cylinder.
  for (let s = 0; s < 56; s++) {
    const sx = 4 + Math.round(s * 1.4 + nz(s, 3) * 2);
    if (nz(s * 9, 17) > 0.86) continue; // gaps: an unbroken curtain is a hedge
    let top = -1;
    for (let y = 46; y > 4; y--) if ('abcde'.includes(peek(g, sx, y))) { top = y; break; }
    if (top < 0) continue;
    // Long, and BELL-SHAPED. Take one gave every strand the same length range
    // and the tree came out standing in a rectangle of reeds. The curtain
    // follows the crown: full length under the middle, short at the edges.
    const bell = 1 - 0.72 * Math.pow(Math.abs(sx - 40) / 38, 1.6);
    const len = Math.round((22 + nz(s * 3, 11) * 26) * bell);
    for (let y = top; y < Math.min(top + len, 79); y++) {
      const drift = Math.round(Math.sin(y * 0.16 + s * 1.3) * 1.8);
      const k = y - top;
      const deep = k > len - 7;
      if (peek(g, sx + drift, y) === '.') put(g, sx + drift, y, deep ? 'a' : nz(s, y) > 0.45 ? 'b' : 'c');
      if (peek(g, sx + drift - 1, y) === '.') put(g, sx + drift - 1, y, deep ? 'a' : k < 8 ? 'd' : 'c');
      if (k > 2 && k < len - 3 && nz(s * 5, y) > 0.72 && peek(g, sx + drift + 1, y) === '.') {
        put(g, sx + drift + 1, y, 'b');
      }
    }
  }
  return composed('willow-water', g, [40, 80], {
    tags: ['tree', 'naiad', 'unicorn', 'water-loving', 'moisture'],
    cycle: { ramp: 'water', rate: 7 },
  });
})();

/** 1,2,4 · Big, old, wild. The tapestry unicorn rests under trees; no water,
 *  so the naiad is not invited. It is the largest thing in the affinity set
 *  and it must LOOK it — a triple that reads as a shrub does no junction work.
 *  Habit: a MASSIVE short bole, flared into roots, under a heavy crown that
 *  starts low. Trunk width is the tell; nothing else in the set is this thick. */
export const ANCIENT_OAK = (() => {
  const g = G(88, 100);
  // Roots first and SPLAYED — three separate feet reaching out of the flare,
  // not a smooth cone. Take one blended the flare into the bole and the tree
  // came out a baobab: an oak's mass is in its bole and its buttresses, and a
  // buttress is only legible if you can see daylight between two of them.
  bough(g, 40, 94, 20, 93, 8, 3);
  bough(g, 44, 95, 34, 95, 9, 5);
  bough(g, 46, 94, 68, 92, 8, 3);
  bough(g, 44, 96, 44, 86, 24, 20);
  bough(g, 44, 87, 43, 52, 20, 15);
  bough(g, 43, 60, 16, 42, 13, 5);
  bough(g, 43, 58, 72, 40, 13, 5);
  bough(g, 43, 56, 32, 34, 9, 3);
  bough(g, 43, 55, 56, 32, 9, 3);
  barkFleck(g, 44, 54, 92, 9);
  // Fissured bark: long vertical grooves. An oak that is smooth is a beech.
  for (const k of [-7, -3, 1, 5]) {
    for (let y = 54; y < 92; y++) {
      if (nz(k, Math.floor(y / 6)) > 0.35 && 'qrst'.includes(peek(g, 44 + k, y))) put(g, 44 + k, y, 'q');
    }
  }
  clump(g, 14, 40, 14, 11, LEAF, { seed: 1.5, lift: -1 });
  clump(g, 73, 38, 14, 11, LEAF, { seed: 2.9, lift: -1 });
  clump(g, 43, 42, 22, 12, LEAF, { seed: 3.2, lift: -2 });
  clump(g, 21, 26, 17, 12, LEAF, { seed: 4.4, lift: -1 });
  clump(g, 66, 24, 17, 12, LEAF, { seed: 5.1, lift: -1 });
  clump(g, 43, 27, 21, 13, LEAF, { seed: 6.6, lift: -1 });
  clump(g, 33, 11, 16, 10, LEAF, { seed: 7.3 });
  clump(g, 56, 12, 15, 10, LEAF, { seed: 8.8 });
  shadeCanopy(g);
  // The bole meets the ground in the ground plane — see groundFoot.
  groundFoot(g, BARK, { round: true });
  return composed('ancient-oak', g, [44, 96], { tags: ['tree', 'satyr', 'centaur', 'unicorn', 'maturity', 'shade'] });
})();

/** 1,4 · The hard pair. Wild AND white — the one register where mess and
 *  purity agree, so it must read as a TANGLE that happens to be in flower. */
export const BLACKTHORN_THICKET = (() => {
  const g = G(70, 54);
  // Blackthorn flowers on BARE BLACK WOOD — no leaves at all. So the sprite is
  // built wood-first and the blossom is scattered onto it, which is the
  // opposite order from every other tree here and the reason it reads as a
  // tangle rather than as a bush that has been snowed on.
  //
  // Take one let the twigs run to their own lengths and they stuck out
  // sideways past the mass like the staves of a basket. They are clipped to
  // the envelope now: a thicket is impenetrable, and impenetrable means the
  // outline is continuous.
  const inside = (x, y) => {
    const nx = (x - 34) / 32;
    const ny = (y - 40) / 30;
    return nx * nx + ny * ny < 1;
  };
  for (let s = 0; s < 46; s++) {
    const bx = 8 + Math.round(nz(s, 1) * 54);
    const by = 47 - Math.round(nz(s, 2) * 5);
    let tx = bx + Math.round((nz(s, 3) - 0.5) * 20);
    let ty = by - 9 - Math.round(nz(s, 4) * 24);
    while (!inside(tx, ty) && ty < by - 4) { tx = Math.round((tx + bx) / 2); ty += 2; }
    bough(g, bx, by, tx, ty, 3, 1, 'qqqr');
  }
  clump(g, 15, 36, 13, 9, LEAF, { seed: 1.6 });
  clump(g, 38, 33, 16, 11, LEAF, { seed: 2.1 });
  clump(g, 57, 36, 12, 8, LEAF, { seed: 3.8 });
  clump(g, 26, 22, 13, 8, LEAF, { seed: 4.3 });
  clump(g, 48, 23, 12, 8, LEAF, { seed: 5.7 });
  const pre = g.map((r) => r.slice());
  shadeCanopy(g);
  blossomOver(g, pre, { density: 1.15 });
  // Wood shows through wherever the blossom is thin — the black twigs ARE the
  // object, and a thicket with none visible is just a snowdrift.
  for (let y = 6; y < 50; y++) {
    for (let x = 2; x < 68; x++) {
      if (!'qr'.includes(peek(g, x, y))) continue;
      const sky = peek(g, x - 1, y - 2) === '.' || peek(g, x, y - 3) === '.';
      if (sky && nz(x * 1.7, y * 2.3) > 0.42) put(g, x, y, '7');
    }
  }
  return composed('blackthorn-thicket', g, [34, 49], { tags: ['shrub', 'satyr', 'unicorn', 'thorn', 'wildness'] });
})();

/** 4 · The white-blossom thorn of the tapestries. Same species logic as the
 *  thicket, opposite habit: one tidy tree instead of a tangle. */
export const WHITE_THORN = (() => {
  const g = G(62, 72);
  bough(g, 30, 66, 30, 40, 8, 6);
  bough(g, 30, 46, 17, 35, 4, 2);
  bough(g, 30, 45, 44, 33, 4, 2);
  barkFleck(g, 30, 46, 64, 3);
  clump(g, 15, 32, 13, 10, LEAF, { seed: 1.2, wobble: 0.09 });
  clump(g, 45, 30, 13, 10, LEAF, { seed: 2.6, wobble: 0.09 });
  clump(g, 30, 30, 16, 11, LEAF, { seed: 3.4, wobble: 0.09 });
  clump(g, 19, 17, 13, 9, LEAF, { seed: 4.7, wobble: 0.09 });
  clump(g, 41, 16, 13, 9, LEAF, { seed: 5.3, wobble: 0.09 });
  clump(g, 30, 10, 14, 9, LEAF, { seed: 6.2, wobble: 0.09 });
  // In full flower a hawthorn is more white than green: the green that is left
  // is the shadow between the sprays, and that shadow is the only thing giving
  // the crown any form at all.
  const pre = g.map((r) => r.slice());
  shadeCanopy(g);
  blossomOver(g, pre, { density: 1.15 });
  return composed('white-thorn', g, [30, 67], { tags: ['tree', 'unicorn', 'thorn', 'blossom', 'order'] });
})();

// ---------------------------------------------------------------------------
// ROCK, WATER AND GROUND
// ---------------------------------------------------------------------------

/**
 * 1,2 · THE HALF-BURIED PITHOS OF WINE.
 *
 * Apollodorus 2.5.4: Pholus opens the jar Dionysos left with the centaurs, the
 * smell carries, and the herd comes. It is LITERALLY the object that binds
 * satyr and centaur, and it is the only dual in the set that is a single named
 * event rather than a kind of place — so it earns its pixels.
 *
 * Take one drew it as a small pot standing on the grass. Two things wrong with
 * that, and both are in the name. HALF-BURIED: the jar is sunk to its
 * shoulder, so what you see is a wide rim and a curve going INTO a mound of
 * disturbed earth, and the ring of turned soil is as much of the object as the
 * terracotta. And OF WINE: it is open, the inside is dark, and there is wine
 * at the bottom of the dark. Without the wine it is a storage jar.
 */
export const HALF_BURIED_PITHOS = (() => {
  const g = G(60, 48);
  // The mound of turned earth first, so the jar can sit down into it.
  for (let y = 16; y < 41; y++) {
    const t = (y - 16) / 25;
    const half = Math.round(26 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.9) + 6);
    for (let x = 30 - half; x <= 30 + half; x++) {
      const n = nz(x * 1.3, y * 2.7);
      const lit = (30 - x) / half + (24 - y) / 12;
      const i = 2 + Math.round(lit * 0.8 + (n - 0.5) * 1.6);
      put(g, x, y, 'qrstu'[Math.max(0, Math.min(4, i))]);
    }
  }
  // The jar. A pithos is BELLIED — widest above the middle — and the shoulder
  // going down into the soil is the whole reading.
  for (let y = 6; y < 35; y++) {
    const t = (y - 6) / 29;
    const half = Math.round(19 * Math.sin(0.55 + t * 1.9));
    if (half <= 0) continue;
    for (let x = 30 - half; x <= 30 + half; x++) {
      const u = (x - (30 - half)) / (2 * half);
      let i = Math.round(3 - 4.6 * Math.abs(u - 0.31));
      if (nz(x, y * 3) > 0.9) i -= 1;
      put(g, x, y, 'PQRS'[Math.max(0, Math.min(3, i))]);
    }
    put(g, 30 - half, y, 'P');
    put(g, 30 + half, y, 'P');
  }
  // The rim: a thick rolled lip, and the mouth open. Dark inside, wine at the
  // bottom of the dark — accent 1 is the same wine-red the grapes are drawn in.
  for (let y = 3; y < 17; y++) {
    for (let x = 12; x < 49; x++) {
      const nx = (x - 30) / 17;
      const ny = (y - 9.5) / 5.5;
      const d = Math.hypot(nx, ny);
      if (d > 1.18) continue;
      if (d > 0.86) { put(g, x, y, ny + nx < 0 ? 'S' : 'Q'); continue; }
      if (d > 0.66) { put(g, x, y, 'P'); continue; }
      put(g, x, y, ny > 0.1 ? '1' : '6');
      if (ny > 0.1 && nz(x * 2, y * 3) > 0.72) put(g, x, y, '2');
    }
  }
  // The lid slab, pushed off and leaning on the mound. It is what says OPENED
  // rather than merely open.
  for (let y = 22; y < 39; y++) {
    const w = Math.round(9 - Math.abs(y - 30) / 2.2);
    for (let x = 47; x < 47 + w; x++) put(g, x, y, x < 49 ? 'R' : x < 52 ? 'Q' : 'P');
  }
  // Spilled wine on the soil under the lip.
  for (let i = 0; i < 24; i++) {
    const sx = 20 + nz(i, 3) * 21;
    const sy = 32 + nz(i, 5) * 7;
    if (!'qrstu'.includes(peek(g, sx, sy))) continue;
    put(g, sx, sy, nz(i, 7) > 0.6 ? '1' : '6');
  }
  // A buried jar sits in a round hollow, so its foot is an ellipse.
  groundFoot(g, 'PQRS', { round: true });
  return composed('half-buried-pithos', g, [30, 41], {
    tags: ['prop', 'terracotta', 'satyr', 'centaur', 'wine', 'wildness'],
  });
})();

/**
 * 1 · WILD VINE, untrellised, climbing a rock.
 *
 * The Cyclops diagnostic — no vine, no satyrs — so this is the single most
 * load-bearing object the satyr has, and it must read as VINE and as WILD in
 * the same glance. Wild means untrellised: the stems go where they like, over
 * a rock rather than along a wire, and the bunches hang unequally. A vine on a
 * frame would say viticulture, which is a farm, which is the opposite species.
 */
export const WILD_VINE = (() => {
  const g = G(62, 52);
  // The rock has to stay READABLE as rock. Take one buried it under leaves and
  // the object came out a shrub in a basket: what says "untrellised" is seeing
  // the vine lie ON something that was never meant to hold it.
  boulder(g, 30, 38, 24, 11, STONE, { seed: 1.3 });
  boulder(g, 19, 33, 12, 7, STONE, { seed: 4.2, lift: 1 });
  bough(g, 14, 46, 12, 30, 3, 2, 'qqrs');
  bough(g, 12, 31, 27, 22, 2, 2, 'qqrs');
  bough(g, 27, 23, 44, 26, 2, 1, 'qqrs');
  bough(g, 40, 45, 46, 30, 3, 2, 'qqrs');
  bough(g, 46, 30, 34, 19, 2, 1, 'qqrs');
  // Vine leaves are BIG and FEW — one is a hand's width life size, so at this
  // scale each is its own clump, spaced so stone shows between them.
  const leaves = [[11, 27], [19, 21], [28, 18], [37, 20], [45, 24], [50, 31], [24, 26], [39, 30], [15, 36], [33, 25]];
  for (let i = 0; i < leaves.length; i++) {
    clump(g, leaves[i][0], leaves[i][1], 5.5, 4, LEAF, { seed: i * 1.7, wobble: 0.38 });
  }
  shadeCanopy(g);
  // Bunches HANG, and they hang below the leaf that shades them. Accent 4
  // (iris) alone came out magenta and read as blossom — a black grape is a
  // very dark red with a cool bloom on one shoulder, so the body is accent 1,
  // the shade is accent 6, and 4 appears on about a fifth of the berries.
  for (const [bx, by, h] of [[16, 26, 8], [42, 28, 7], [29, 24, 6]]) {
    for (let row = 0; row < h; row++) {
      const wide = Math.max(0, Math.round((h - row) / 2.1));
      for (let k = -wide; k <= wide; k++) {
        if (nz(bx + k, by + row) < 0.18) continue;
        const hi = (k + row * 2) % 5 === 0 && k <= 0;
        put(g, bx + k, by + row, k === wide || row === h - 1 ? '6' : hi ? '4' : '1');
      }
    }
  }
  return composed('wild-vine', g, [30, 47], { tags: ['vine', 'satyr', 'wildness', 'fruit'] });
})();

/** 1 · IVY-DRAPED BOULDER. Thyrsos-wrapping and wreath plant. Ivy CLINGS —
 *  it lies flat on the stone and hangs off the edge, never standing away from
 *  it, which is the whole difference between ivy and a bush behind a rock. */
export const IVY_BOULDER = (() => {
  const g = G(58, 50);
  boulder(g, 28, 34, 23, 14, STONE, { seed: 2.7 });
  // A cascade from the upper left over the top and down the shaded right,
  // following the stone's curve. Small dark leaves, tight together.
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const px = 8 + t * 44 + Math.sin(i * 1.9) * 4;
    const py = 26 + Math.sin(t * 3.1) * 7 + nz(i, 5) * 9;
    if (Math.hypot((px - 28) / 25, (py - 34) / 16) > 1.05) continue;
    clump(g, px, py, 3.4, 2.6, LEAF, { seed: i * 2.3, wobble: 0.4, lift: -1 });
  }
  // Tendrils hanging off the near lip — ivy always overshoots its edge.
  for (const [tx, ty, len] of [[14, 42, 6], [24, 45, 5], [37, 44, 7], [45, 40, 4]]) {
    for (let k = 0; k < len; k++) {
      put(g, tx + Math.round(Math.sin(k * 0.9)), ty + k, k > len - 3 ? 'a' : 'b');
    }
    clump(g, tx, ty + len, 3, 2, LEAF, { seed: tx, wobble: 0.4, lift: -1 });
  }
  shadeCanopy(g);
  return composed('ivy-boulder', g, [28, 46], { tags: ['rock', 'satyr', 'ivy', 'wildness', 'maturity'] });
})();

/**
 * 2 · PHYSIC BED OF CENTAURY. Named for Chiron; Pliny counts it among his
 * panaceas. A physic bed is a TENDED thing — the herbalist's plot, laid out in
 * rows so you can tell one drug from the next — so this is the one satyr-free
 * centaur object and its straight rows say so without a word.
 */
export const CENTAURY_BED = (() => {
  const g = G(66, 44);
  for (let y = 4; y < 32; y++) {
    const half = Math.round((y < 18 ? y - 3 : 32 - y) * 2.0);
    for (let x = 33 - half; x <= 33 + half; x++) {
      const n = nz(x * 1.3, y * 2.7);
      put(g, x, y, n > 0.74 ? 'u' : n > 0.4 ? 't' : 's');
      if ((x - y * 2) % 9 === 0) put(g, x, y, 'r'); // drill furrows
    }
    put(g, 33 - half, y, y < 18 ? 't' : 'r');
    put(g, 33 + half, y, y < 18 ? 's' : 'r');
  }
  // Planted on the TILE GRID, not on the screen grid: rows that run along the
  // isometric axes are what make a bed read as laid out by a person. Take one
  // spaced them in screen x and the whole plot looked scattered.
  for (let u = 0; u < 4; u++) {
    for (let v = 0; v < 4; v++) {
      const px = 33 + (u - v) * 7;
      const py = 12 + (u + v) * 4;
      const half = py < 18 ? (py - 3) * 2 : (32 - py) * 2;
      if (Math.abs(px - 33) > half - 5) continue;
      for (const [dx, dy] of [[-2, 0], [-1, 1], [0, 1], [1, 1], [2, 0], [-1, 0], [1, 0], [0, 0]]) {
        put(g, px + dx, py + dy, dy ? 'g' : 'h');
      }
      const h = 9 + Math.round(nz(u, v) * 4);
      for (let k = 1; k <= h; k++) { put(g, px, py - k, 'i'); put(g, px + 1, py - k, 'h'); }
      if (h > 10) { put(g, px - 2, py - h + 5, 'i'); put(g, px - 3, py - h + 6, 'h'); }
      // Flat-topped head of small pink stars. The pink is the last two rows
      // only; everything under it is what makes it a plant and not a smear.
      for (const [dx, dy] of [[-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [-1, -1], [1, -1], [0, -1], [-3, 0], [3, 0]]) {
        put(g, px + dx, py - h + dy, dy ? '3' : (dx & 1) ? '3' : '2');
      }
      put(g, px, py - h - 1, '5');
    }
  }
  return composed('centaury-bed', g, [33, 18], { tags: ['ground', 'centaur', 'herb', 'order', 'physic'] });
})();

/** 2 · UNCUT STANDING TIMBER — the fallen log. Pelion as the Argo's
 *  timber-store: wood that has been dropped and not yet taken away. */
export const FALLEN_LOG = (() => {
  const g = G(66, 34);
  logAlong(g, 2, 6, 54, 7);
  // A stub branch and a scatter of loose bark, so it is a felled tree and not
  // a length of dowel.
  bough(g, 26, 18, 20, 8, 4, 2);
  bough(g, 44, 27, 52, 30, 3, 2);
  for (const [bx, by] of [[14, 26], [33, 30], [49, 33]]) {
    for (let k = 0; k < 4; k++) put(g, bx + k, by - (k % 2), k < 2 ? 'r' : 'q');
  }
  return composed('fallen-log', g, [30, 31], { tags: ['timber', 'centaur', 'wildness', 'maturity'] });
})();

/**
 * 3 · SPRING-HEAD WITH STONE BASIN. The krenaiai distinction: this naiad is
 * the nymph of a spring that has been GIVEN something — a cut basin to fall
 * into. The existing `spring-head` sprite is the same water with no basin at
 * all, and the pair of them is the whole 3-versus-1,3 mechanic in two objects.
 */
export const SPRING_BASIN = (() => {
  const g = G(56, 62);
  boulder(g, 27, 20, 25, 17, STONE, { seed: 3.9 });
  // The cleft, and the water leaving it. Water issuing must have a visible
  // SOURCE — a dark slot — or it reads as a puddle stuck to a rock.
  for (let y = 14; y < 26; y++) {
    const w = y < 19 ? 2 : 3;
    for (let x = 26 - w; x <= 26 + w; x++) put(g, x, y, y < 18 ? 'v' : x < 26 ? 'J' : 'I');
  }
  for (let y = 24; y < 40; y++) {
    const w = 2 + Math.round((y - 24) / 6);
    for (let x = 27 - w; x <= 27 + w; x++) {
      put(g, x, y, nz(x, y * 2) > 0.55 ? 'K' : x < 27 ? 'J' : 'I');
    }
  }
  // The basin: dressed marble, a shallow bowl, water to the brim.
  pool(g, 28, 44, 19, { rim: 'ABCD', rimW: 5, wobble: 0.02, glint: 0.5 });
  for (let x = 10; x < 47; x++) {
    const t = (x - 10) / 36;
    put(g, x, 50 + Math.round(Math.sin(t * Math.PI) * 3), 'B');
  }
  for (let x = 12; x < 45; x++) {
    for (let k = 0; k < 3; k++) {
      const y = 49 + k + Math.round(Math.sin(((x - 12) / 32) * Math.PI) * 3);
      if (peek(g, x, y) === '.') put(g, x, y, k === 0 ? 'C' : k === 1 ? 'B' : 'A');
    }
  }
  return composed('spring-basin', g, [28, 55], {
    tags: ['water', 'naiad', 'moisture', 'order', 'spring'],
    cycle: { ramp: 'water', rate: 4 },
  });
})();

/**
 * 3 · VOTIVE SHELF.
 *
 * The Corycian Cave assemblage: figurines, small vessels, knucklebones, left
 * on a ledge over years by people who came to ask for something. Votive
 * density is a naiad plus and a unicorn minus, so the object's whole job is to
 * read as VISITED — not as a display, as an accumulation.
 *
 * Two things carry that. First, the offerings are of MIXED KINDS and mixed
 * ages, standing at slightly different heights and not evenly spaced — a
 * regular row would read as a shop shelf. Second, some of them have fallen
 * over and some are on the ground below, because nobody tidies a shrine.
 */
export const VOTIVE_SHELF = (() => {
  const g = G(58, 56);
  boulder(g, 29, 22, 27, 17, STONE, { seed: 6.3 });
  // The ledge: a cut shelf with a lit top face and a shadowed undercut. The
  // undercut is what makes it a shelf rather than a stripe.
  for (let x = 6; x < 53; x++) {
    const y0 = 30 + Math.round(nz(x * 0.4, 2) * 1.5);
    for (let k = 0; k < 4; k++) put(g, x, y0 + k, k === 0 ? 'y' : k === 1 ? 'x' : 'w');
    put(g, x, y0 + 4, 'v');
    put(g, x, y0 + 5, 'v');
  }
  // The offerings. Mixed kinds, mixed heights, unevenly spaced.
  const line = 29;
  const gifts = [
    [10, 'fig', 9], [17, 'jar', 6], [23, 'fig', 7], [29, 'bowl', 4],
    [34, 'fig', 8], [40, 'jar', 5], [46, 'fig', 6],
  ];
  for (const gift of gifts) {
    const x = gift[0], kind = gift[1], h = gift[2];
    const base = line + Math.round(nz(x * 0.4, 2) * 1.5);
    if (kind === 'fig') {
      // A psi-figurine: rounded head, flaring body, upraised arms.
      for (let k = 0; k < h; k++) {
        const w = k < h - 3 ? 1 + Math.round((h - 3 - k) / 3) : 0;
        for (let dx = -w; dx <= w; dx++) put(g, x + dx, base - k, dx < 0 ? 'S' : dx > 0 ? 'Q' : 'R');
      }
      put(g, x, base - h, 'S');
      put(g, x - 1, base - h, 'R');
      put(g, x - 2, base - h + 2, 'Q');
      put(g, x + 2, base - h + 2, 'P');
    } else if (kind === 'jar') {
      for (let k = 0; k < h; k++) {
        const w = k === 0 || k === h - 1 ? 1 : 2;
        for (let dx = -w; dx <= w; dx++) put(g, x + dx, base - k, dx < 0 ? 'R' : dx > 0 ? 'P' : 'Q');
      }
      put(g, x, base - h, 'T');
    } else {
      for (let dx = -3; dx <= 3; dx++) {
        put(g, x + dx, base - 1, Math.abs(dx) > 2 ? 'U' : 'W');
        put(g, x + dx, base, Math.abs(dx) > 2 ? 'T' : 'V');
      }
    }
  }
  // One fallen, and knucklebones scattered on the ledge and on the ground.
  for (let k = 0; k < 6; k++) put(g, 49 + Math.round(k * 0.6), 27 + k % 2, k < 3 ? 'R' : 'Q');
  for (const kb of [[13, 33], [26, 34], [37, 33], [44, 34], [20, 45], [33, 47], [42, 44]]) {
    put(g, kb[0], kb[1], 'D');
    put(g, kb[0] + 1, kb[1], 'B');
    put(g, kb[0], kb[1] + 1, 'A');
  }
  for (const gd of [[16, 46, 4], [37, 44, 3]]) {
    for (let k = 0; k < gd[2]; k++) {
      for (let dx = -1; dx <= 1; dx++) put(g, gd[0] + dx, gd[1] - k, dx < 0 ? 'R' : dx > 0 ? 'P' : 'Q');
    }
  }
  // Moss at the foot: it has stood here a long time.
  for (let i = 0; i < 18; i++) {
    const mx = 6 + nz(i, 1) * 46;
    const my = 42 + nz(i, 2) * 7;
    if (peek(g, mx, my) !== '.') continue;
    clump(g, mx, my, 3, 2, 'jkl', { seed: i * 1.7, wobble: 0.42 });
  }
  return composed('votive-shelf', g, [29, 50], {
    tags: ['prop', 'rock', 'naiad', 'votive', 'order', 'maturity'],
  });
})();

/** 3 · REED BED. Reeds stand in shallow water, lean in one prevailing
 *  direction, and carry a dark seed-head — three facts, and without all three
 *  a reed bed is a patch of tall grass. */
export const REED_BED = (() => {
  const g = G(60, 50);
  pool(g, 30, 42, 27, { rim: null, seed: 2.2, wobble: 0.12 });
  for (let i = 0; i < 44; i++) {
    const bx = 4 + Math.round(nz(i, 1) * 52);
    const by = 38 + Math.round(nz(i, 2) * 6);
    const h = 12 + Math.round(nz(i, 3) * 20);
    const lean = 0.16 + nz(i, 4) * 0.14;
    const ramp = nz(i, 9) > 0.6 ? SCRUB : 'abcd';
    let px = bx;
    for (let k = 0; k < h; k++) {
      px = bx + k * lean;
      const c = ramp[Math.min(ramp.length - 1, 1 + Math.round((1 - k / h) * 1.6) + (nz(i, k) > 0.7 ? 1 : 0))];
      put(g, px, by - k, c);
      if (k > h - 4) put(g, px + 1, by - k, ramp[0]);
    }
    // Seed head: a small dark spindle at the tip on about half of them.
    if (nz(i, 7) > 0.45) {
      for (let k = 0; k < 5; k++) {
        put(g, px + k * lean, by - h - k, k < 2 ? 's' : 'r');
        put(g, px + k * lean + 1, by - h - k, 'q');
      }
    }
  }
  return composed('reed-bed', g, [30, 43], {
    tags: ['plant', 'naiad', 'moisture', 'water-loving', 'wildness'],
    cycle: { ramp: 'water', rate: 8 },
  });
})();

/** 4 · WHITE LILY BED. Millefleurs planting from the tapestries. The madonna
 *  lily is a TRUMPET on a bare stalk above strap leaves — the flower head has
 *  to have a visible dark throat or a white blob is all it is. */
export const LILY_BED = (() => {
  const g = G(58, 52);
  // Strap leaves first: a low fountain of them, arching outward.
  // The leaves are half the plant and take one drew them as a dark smear at
  // the foot. A lily's basal leaves are broad straps that ARCH — they rise
  // steeply, turn over, and fall away — so each is two pixels wide with the
  // upper edge lit, and they reach a third of the way up the flower stems.
  for (let i = 0; i < 34; i++) {
    const bx = 13 + Math.round(nz(i, 1) * 32);
    const by = 46 - Math.round(nz(i, 2) * 4);
    const dir = nz(i, 3) > 0.5 ? 1 : -1;
    const len = 12 + Math.round(nz(i, 4) * 10);
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const lx = bx + dir * k * (0.34 + t * 1.0);
      const ly = by - k * (1.0 - t * 0.85);
      put(g, lx, ly, t < 0.5 ? 'c' : 'b');
      put(g, lx, ly - 1, t < 0.35 ? 'd' : t < 0.7 ? 'c' : 'b');
      if (t > 0.15 && t < 0.8) put(g, lx - dir, ly + 1, 'b');
    }
  }
  const stems = [[15, 45, 24], [24, 47, 31], [34, 45, 27], [43, 44, 21], [29, 48, 36], [20, 46, 17]];
  for (const [sx, sy, h] of stems) {
    for (let k = 0; k < h; k++) put(g, sx + Math.round(Math.sin(k * 0.09) * 1.5), sy - k, k % 5 === 0 ? 'b' : 'c');
    const hx = sx + Math.round(Math.sin(h * 0.09) * 1.5);
    const hy = sy - h;
    // The trumpet: six petals radiating, marble ramp for the shaded ones so
    // the flower has form, accent 7 for the two that face the light, and a
    // gold stamen in the throat.
    // A TRUMPET, not a ball, and not a bow either. Take one drew a round
    // white blob and the bed read as dandelion clocks; take two flared it
    // sideways and they read as moths. A madonna lily seen from the side is a
    // NARROW cone that opens at the top with a throat you can see into — so
    // it is authored as an explicit little bitmap rather than by rule, which
    // is what the hand-authored half of SPEC 4 is for.
    const BELL = ['..77D..', '.7776D.', '77766DC', '.7766DC', '..7DDC.', '...DC..', '...C...'];
    for (let by = 0; by < BELL.length; by++) {
      for (let bx = 0; bx < 7; bx++) {
        const ch = BELL[by][bx];
        if (ch === '.') continue;
        put(g, hx + bx - 3, hy + by - 6, ch);
      }
    }
    put(g, hx, hy - 3, 'W');
  }
  return composed('lily-bed', g, [30, 47], { tags: ['flower', 'unicorn', 'white', 'order', 'millefleurs'] });
})();

/** 4 · STILL POOL, small and mirror-flat. Stillness is the whole content, so
 *  it gets the least surface texture of any water in the game and a dressed,
 *  regular kerb — the unicorn asks for order as much as for water. */
export const STILL_POOL = (() => {
  const g = G(68, 40);
  pool(g, 34, 20, 27, { rim: 'ABCD', rimW: 4, wobble: 0.015, glint: 0.94 });
  // A single soft reflection band across the near half instead of glitter.
  for (let y = 22; y < 29; y++) {
    for (let x = 12; x < 56; x++) {
      if (!'FGHIJK'.includes(peek(g, x, y))) continue;
      if (((x + y) & 1) === 0 && y < 26) put(g, x, y, 'K');
      else if (y >= 26 && ((x + y) & 3) === 0) put(g, x, y, 'J');
    }
  }
  // AT THE ANCHOR (34, 22), not twelve rows under it. r 30 against a 63px
  // basin, inscribed in the 1x1 diamond (max 32).
  return composed('still-pool', g, [34, 22], {
    tags: ['water', 'unicorn', 'moisture', 'order', 'seclusion'],
    cycle: { ramp: 'water', rate: 11 },
  });
})();

// ===========================================================================
// CAVES — the sprites the iso audit was built for
//
// The owner, looking at the sprite lab: "there are several objects, LIKE THE
// CAVE, that are pointed straight at the viewer instead of in the direction of
// the grid like they are occupying 3D space."
//
// Both caves used to be a screen-facing oval hole in a screen-facing blob,
// bilaterally symmetric about the vertical, ending in a horizontal edge and
// floating above the front half of their own tile. A front elevation, in a
// world that has no front.
//
// A cave is a HOLE IN A MASS, and in this projection a mass sitting on a tile
// has a known shape:
//
//   its foot is the ground ellipse — a circle on the ground, so twice as wide
//   as it is tall (GROUND_ELLIPSE in js/iso.js);
//   its top is a dome springing from that same ellipse;
//   the two halves take light differently, because they face different ways;
//   and the OPENING belongs to one of them. Its sill runs along the ground
//   ellipse's own front edge, so the hole travels with the rock instead of
//   being pasted onto it.
//
// The exception that keeps this honest: a knoll IS a rotational form, so it is
// *supposed* to be roughly symmetric in outline. What must not be symmetric is
// the mouth, because a mouth has a direction. See tools/isogeom.mjs.
// ===========================================================================

/**
 * A rounded mass of rock standing on the ground: a dome springing from a 2:1
 * ellipse. Returns the sill function — the front edge of its own footprint —
 * because whatever is cut into it has to sit on that line and nothing else.
 */
function rockKnoll(g, cx, base, rx, rise, opt = {}) {
  const ramp = opt.ramp || STONE;
  const seed = opt.seed || 0;
  const n = ramp.length - 1;
  const ry = rx * 0.5; // the ground ellipse. Not negotiable — see js/iso.js.
  const arc = (x) => {
    const t = (x - cx) / rx;
    return Math.sqrt(Math.max(0, 1 - t * t));
  };
  /**
   * The foot: the near half of the footprint ellipse, roughened so that it is
   * ROCK and not a machined dome.
   *
   * The roughening is not decoration. A correct ground ellipse is genuinely
   * flat across its front — `curveAllowance` in tools/isogeom.mjs works out how
   * flat, and for a 33-radius knoll it is sixteen pixels — so an exact ellipse
   * lands right on the audit's bar and a real rock has no business being that
   * exact anyway. Perturbing in THREE-PIXEL steps rather than per pixel: a
   * per-pixel wobble frays the silhouette, and SPEC calls a frayed silhouette
   * out as the thing that makes a sprite shimmer when the camera pans.
   */
  const footY = (x) => {
    const step = Math.floor(x / 3);
    const r = nz(step * 1.3, seed + 4);
    return base + ry * arc(x) + (r > 0.66 ? 1 : r < 0.3 ? -1 : 0);
  };
  // The centre of the light, in the dome's own coordinates: up and to the
  // front-left, which is where every other lit thing in this game is lit from.
  const LX = -0.45;
  const LY = -0.5;
  for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
    const a = arc(x);
    if (a <= 0) continue;
    // A rocky outline wants BLOCKY irregularity, not per-pixel fuzz: fuzz at
    // this scale just frays the silhouette, which SPEC calls out as the thing
    // that makes a sprite shimmer when the camera pans.
    const step = Math.floor((x - cx) / 5);
    const wob = 1 + (nz(step * 1.9, seed + 2) - 0.5) * 0.22;
    const top = base - rise * Math.pow(a, 0.62) * wob;
    const bot = footY(x);
    for (let y = Math.round(top); y <= Math.round(bot); y++) {
      // SHADE IT AS A DOME, in CONCENTRIC bands. The first version scored a
      // linear left-to-right ramp and the knoll came out as a flat coin: a
      // vertical terminator is what a disc has. What a round mass has is a
      // highlight with the shading falling away from it in every direction,
      // and here the bands are ellipses because everything on the ground is.
      const nx = (x - cx) / rx;
      const ny = (y - (base - rise * 0.5)) / (rise * 0.72);
      const d = Math.hypot(nx - LX, ny - LY);
      let i = Math.round((1.32 - d) * n);
      if (nz(Math.floor(x / 2) * 1.7, Math.floor(y / 2) * 1.3 + seed) > 0.8) i += 1;
      if (y > bot - 3) i -= 1; // it sits in its own shade where it meets grass
      put(g, x, y, ramp[Math.max(1, Math.min(n, i))]);
    }
  }
  return footY;
}

/**
 * A grotto mouth — a low arched opening in rock, dark inside, ivy over the lip.
 * The archaeological nymphaeum. The interior is 'v' with nothing in it: an
 * unresolved dark hole is more inviting than any painted interior at 40 px.
 */
export const GROTTO_MOUTH = (() => {
  const CX = 34;
  const BASE = 34;
  const g = G(69, 60);
  const sill = rockKnoll(g, CX, BASE, 31, 30, { seed: 3.7 });

  // The mouth, in the front-right face. Low and wide: a nymphaeum is a place
  // you stoop into, not a doorway.
  const M_CX = 45;
  const M_HALF = 12;
  const M_RISE = 21;
  for (let x = M_CX - M_HALF; x <= M_CX + M_HALF; x++) {
    const t = (x - M_CX) / M_HALF;
    const rise = Math.round(M_RISE * Math.sqrt(Math.max(0, 1 - t * t)) ** 0.86);
    // The sill sits a few pixels ABOVE the rock's own foot. A mouth cut right
    // down to the grass leaves no rock under it, and the dark of the opening
    // then runs into the dark the mass casts on itself — one flat black edge
    // where there should be a threshold you step over.
    const s = Math.round(sill(x)) - 5;
    for (let y = s - rise; y <= s; y++) put(g, x, y, 'v');
    if (rise > 3) {
      // The dressed lip: this is the IMPROVED cave, so somebody cut the arch.
      // One clean course of worked stone around the head, which is the whole
      // difference between this and CAVE_MOUTH.
      put(g, x, s - rise - 1, 'y');
      put(g, x, s - rise - 2, 'x');
    }
  }

  // Ivy over the lip. The first pass put two symmetric round clumps here and
  // they read unmistakably as EYES — a frog looking at the player. Foliage on
  // a built thing has to be asymmetric and has to hang OFF an edge; a clump
  // floating in the middle of a face becomes a feature of that face.
  clump(g, 20, 12, 12, 7, LEAF, { seed: 1.4, wobble: 0.3 });
  clump(g, 31, 8, 8, 5, LEAF, { seed: 5.1, wobble: 0.34 });
  for (let x = 10; x < 34; x++) {
    if (nz(x, 17) < 0.45) continue;
    const drop = 3 + Math.round(nz(x, 23) * 7);
    for (let k = 0; k < drop; k++) put(g, x, 18 + k, nz(x, k) > 0.5 ? 'b' : 'a');
  }
  return composed('grotto-mouth', g, [CX, BASE], {
    tags: ['structure', 'rock', 'naiad', 'seclusion', 'moisture'],
  });
})();

/**
 * A cave mouth in a hillside — bigger, rougher, unimproved. Where the silenoi
 * meet the nymphs (Hymn to Aphrodite 262-63) and where Chiron and Pholus live.
 * Deliberately NOT the grotto: no dressed lip, no basin, no votives.
 */
export const CAVE_MOUTH = (() => {
  const CX = 34;
  const BASE = 40;
  const g = G(69, 66);
  const sill = rockKnoll(g, CX, BASE, 33, 38, { seed: 8.2 });

  // Bigger, rougher, unimproved: no dressed lip, no basin, no votives. The
  // arch is lopsided and its edges are broken, and it is TALLER than the
  // grotto's because a centaur has to get in.
  const M_CX = 46;
  const M_HALF = 13;
  const M_RISE = 25;
  for (let x = M_CX - M_HALF; x <= M_CX + M_HALF; x++) {
    const t = (x - M_CX) / M_HALF;
    // Lopsided by LEANING, not by rippling. The first pass modulated the arch
    // with a sine of about a thirteen-pixel period, which put a notch in the
    // crown and read as two openings side by side. An irregular arch is one
    // arch drawn off-centre.
    const rise = Math.round(M_RISE * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + 0.14 * t));
    // The sill sits a few pixels ABOVE the rock's own foot. A mouth cut right
    // down to the grass leaves no rock under it, and the dark of the opening
    // then runs into the dark the mass casts on itself — one flat black edge
    // where there should be a threshold you step over.
    const s = Math.round(sill(x)) - 5;
    for (let y = s - rise; y <= s; y++) put(g, x, y, 'v');
    // No cut course here — just a broken edge where the rock gave way, one
    // step up from the dark so the opening has thickness.
    if (rise > 3 && nz(x, 6) > 0.3) put(g, x, s - rise - 1, 'w');
  }
  // Loose blocks fallen out of the roof, lying on the ground in front.
  for (const [bx, by, br] of [[28, 4, 5], [56, 2, 4], [40, 6, 3]]) {
    boulder(g, bx, Math.round(sill(bx)) - by, br, Math.max(2, Math.round(br * 0.5)), STONE, {
      seed: bx * 0.3,
    });
  }
  return composed('cave-mouth', g, [CX, BASE], {
    tags: ['structure', 'rock', 'satyr', 'centaur', 'seclusion', 'wildness'],
  });
})();

/**
 * 1,3 · CAVE MOUTH IN A CLIFF FACE.
 *
 * [Homeric] Hymn to Aphrodite 262-63 puts silenoi and nymphs together "in the
 * depths of pleasant caves", and ELEVATION.md moved caves where they belong:
 * a cave is a hole in a CLIFF, not a lump standing on a lawn.
 *
 * ---------------------------------------------------------------------------
 * REDRAWN, and it is the sprite the whole iso audit was built for.
 *
 * The owner, looking at the sprite lab: "there are several objects, LIKE THE
 * CAVE, that are pointed straight at the viewer instead of in the direction of
 * the grid like they are occupying 3D space."
 *
 * They were exactly right and this was the worst offender in the game: a 70x66
 * RECTANGLE of masonry with an oval hole in the middle of it, sitting entirely
 * above its own ground diamond, ending in a 64-pixel horizontal edge. A front
 * elevation, in a world that has no front. `iso-audit` scored it 1.00 — a level
 * run as wide as the whole tile it stands on.
 *
 * It is now a BLOCK, in the only shape this projection allows one:
 *
 *        N'          the top face is a 2:1 DIAMOND of turf, not a horizon
 *     W'    E'
 *     |      |       two vertical walls, meeting at the front arris
 *     W      E
 *        S            the foot follows the ground diamond: W -> S -> E
 *
 * — which is to say its silhouette is a hexagon. The mouth is cut into the
 * RIGHT-HAND wall, so it belongs TO a plane: its floor runs along that wall's
 * own foot, rising 1 in 2 to the east, and its springing line runs parallel.
 * A symmetric arch on a level floor is the thing that cannot be there.
 *
 * The right wall is the shaded one (light comes from the front-left in this
 * game), which is also where you want a dark hole.
 */
export const CLIFF_CAVE_MOUTH = (() => {
  // The block, in tile geometry. CX is the anchor column; the ground diamond is
  // centred on (CX, BASE) and is 64 x 32, so its front vertex is BASE + 16 and
  // its side corners are BASE. RISE is how tall the cliff stands above it.
  const CX = 34;
  const BASE = 59;
  const RISE = 40;
  const g = G(70, BASE + 20);

  // Every boundary in this sprite is one of the three lines the projection
  // allows. `u` is the distance from the front arris; a 2:1 edge closes half a
  // pixel of height for every pixel of it.
  const u = (x) => Math.abs(x - CX);
  const capHi = (x) => BASE - RISE - 16 + u(x) / 2; // top diamond, back edges
  const capLo = (x) => BASE - RISE + 16 - u(x) / 2; // top diamond, near edges
  const foot = (x) => BASE + 16 - u(x) / 2; // ground diamond, near edges

  // --- the two walls -------------------------------------------------------
  // Take one drew the face as a rectangle in even courses and it came out a
  // railway tunnel portal — masonry, not geology. Take two fixed the courses
  // and blacked the whole face out, because the joint test compared a block
  // index against a DIFFERENT block index and therefore fired on nearly every
  // pixel. Lesson kept below: the joint is a property of the block grid, so it
  // must be computed from the same numbers the block is.
  for (let x = 2; x <= 66; x++) {
    const west = x < CX; // the lit wall
    const y0 = Math.round(capLo(x));
    const y1 = Math.round(foot(x));
    for (let y = y0; y <= y1; y++) {
      const bh = 5 + Math.floor(nz(Math.floor(y / 6), 1) * 3);
      const band = Math.floor(y / bh);
      const bw = 7 + Math.floor(nz(band, 3) * 6);
      const cell = Math.floor((x + band * 3) / bw);
      let i = 2 + Math.round((nz(cell * 3.1, band * 5.3) - 0.5) * 1.8);
      if (((x + y) & 1) === 0 && nz(x * 2, y) > 0.7) i += 1;
      if ((x + band * 3) % bw === 0 || y % bh === 0) i -= 1; // joint
      if (y > y1 - 8) i -= 1; // a face sits in its own shadow at the foot
      if (west) i += 1; // the west wall takes the light; the east turns away
      // FLOOR AT 1, never 0. `v` is the darkest stone in the ramp and it is
      // reserved for the inside of the cave — the first version let the east
      // wall reach it, and the mouth vanished into the plane it was cut in.
      // A hole is only a hole if it is darker than everything around it.
      put(g, x, y, STONE[Math.max(1, Math.min(3, i))]);
    }
    // The top edge of each wall, so the cap reads as an overhang at 1x.
    put(g, x, y0, west ? 'y' : 'x');
  }
  // The front arris. Drawn one step up from the wall it lights, NOT in the top
  // tone: a full-height run of the lightest stone reads as a pole standing in
  // front of the cliff, which is the same mistake as the cave in miniature —
  // an edge is a change of plane, not an object.
  for (let y = Math.round(capLo(CX)); y <= Math.round(foot(CX)); y++) {
    put(g, CX, y, nz(y, 4) > 0.7 ? 'y' : 'x');
  }

  // --- the turf cap --------------------------------------------------------
  // A DIAMOND of grass, which is what the top of a one-tile block is. Without
  // it a cliff reads as a wall somebody built; drawn as a horizontal band, it
  // reads as a wall somebody built and photographed from the front.
  for (let x = 2; x <= 66; x++) {
    const hi = Math.round(capHi(x));
    const lo = Math.round(capLo(x));
    for (let y = hi; y <= lo; y++) {
      const n = nz(x * 0.7, y * 1.3);
      put(g, x, y, y > lo - 2 ? 'q' : n > 0.62 ? 'o' : n > 0.24 ? 'n' : 'm');
    }
    // Grass breaking off the lip and hanging a little way down the face.
    if (nz(x, 33) > 0.55) put(g, x, lo + 1, 'n');
    if (nz(x, 47) > 0.78) put(g, x, lo + 2, 'm');
  }

  // --- the mouth, cut into the EAST wall -----------------------------------
  // Wide, low, unimproved: no dressed lip, no basin, no votives — GROTTO_MOUTH
  // is the improved one, this is the wild one, so the arch is lopsided and its
  // edges are broken. It stops short of the arris and of the corner so the
  // wall still reads as a wall rather than as a frame.
  const M_CX = 50;
  const M_HALF = 9;
  const M_RISE = 24;
  for (let x = M_CX - M_HALF; x <= M_CX + M_HALF; x++) {
    const t = (x - M_CX) / M_HALF;
    // A round-headed arch, its edge chewed. `rise` is measured UP from the
    // sill, and the sill runs along the wall's own foot, so the whole opening
    // travels with the plane it is cut into.
    const rise = Math.round(M_RISE * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + 0.08 * Math.sin(x * 0.6)));
    const sill = Math.round(foot(x)) - 1;
    for (let y = sill - rise; y <= sill; y++) put(g, x, y, 'v');
    // The lip. A hole in a wall is a hole in something THICK: one lit pixel on
    // the near jamb and a soffit a step up from the dark, or the opening reads
    // as a sticker of black rather than as a way in.
    if (rise > 3) {
      put(g, x, sill - rise - 1, nz(x, 12) > 0.5 ? 'x' : 'w');
      if (x <= M_CX - M_HALF + 2) put(g, x, sill - rise + 1, 'w');
    }
  }

  // --- scree at the foot ---------------------------------------------------
  // Spilling forward ALONG the chevron, not across a straight line: rubble
  // falls off a face and lands on the ground in front of that face, so its
  // spread is the ground diamond's edge too.
  for (let x = 3; x <= 65; x++) {
    const h = 2 + Math.round(nz(x * 0.7, 31) * 5);
    const y0 = Math.round(foot(x));
    for (let k = 0; k < h; k++) {
      const y = y0 + k;
      const n = nz(x, y);
      if (k > h - 3 && n < 0.45) continue;
      if (peek(g, x, y) === '.') put(g, x, y, n > 0.72 ? 'x' : n > 0.34 ? 'w' : 'v');
    }
  }
  // The shade this thing casts is the tile it stands on: r = 30 against the
  // diamond's 32, centred so the ellipse's front lands on the front vertex.

  return composed('cliff-cave-mouth', g, [CX, BASE], {
    tags: ['cliff', 'cave', 'satyr', 'naiad', 'seclusion', 'wildness'],
  });
})();

/** 1,3 · UNBASINED SPRING — a plunge in bare rock. The same water as
 *  `spring-basin` with nobody's hand on it: a natural hollow, mossy lip, no
 *  masonry anywhere. The satyr will drink from this and not from the other. */
export const UNBASINED_SPRING = (() => {
  const g = G(62, 50);
  // Rock BEHIND, water IN FRONT. Take one put the plunge on top of the
  // boulder and the water vanished behind it — in a 2:1 projection anything
  // you want seen has to be nearer the viewer than the thing it belongs to.
  boulder(g, 31, 15, 26, 11, STONE, { seed: 5.5 });
  boulder(g, 13, 20, 10, 7, STONE, { seed: 8.1, lift: -1 });
  boulder(g, 50, 21, 10, 7, STONE, { seed: 2.4, lift: -1 });
  // The cleft the water comes out of, and the fall. A spring with no visible
  // source is a puddle; the dark slot is doing the naming.
  for (let y = 12; y < 22; y++) {
    for (let x = 28; x < 34; x++) put(g, x, y, y < 16 ? 'v' : x < 31 ? 'J' : 'I');
  }
  for (let y = 19; y < 30; y++) {
    const w = 3 + Math.round((y - 19) / 3);
    for (let x = 31 - w; x <= 31 + w; x++) put(g, x, y, nz(x, y * 3) > 0.5 ? 'K' : x < 31 ? 'J' : 'I');
    put(g, 31 - w - 1, y, 'H');
    put(g, 31 + w + 1, y, 'G');
  }
  // The plunge itself: an irregular hollow worn in bare rock, no masonry.
  pool(g, 31, 32, 17, { rim: STONE, rimW: 5, seed: 4.4, wobble: 0.22, glint: 0.48 });
  // Outflow over the near lip — a spring with no outlet is standing water.
  for (let y = 40; y < 47; y++) {
    const w = 1 + Math.round((y - 40) / 3);
    for (let x = 27 - w; x <= 27 + w; x++) put(g, x, y, nz(x, y * 3) > 0.6 ? 'J' : 'I');
  }
  // Moss on the wet side only — moss is a MOISTURE READING and ringing the
  // rock with it would throw that information away.
  for (let i = 0; i < 30; i++) {
    const mx = 10 + nz(i, 1) * 42;
    const my = 20 + nz(i, 2) * 8;
    if (!'vwxy'.includes(peek(g, mx, my))) continue;
    clump(g, mx, my, 3, 2, 'jkl', { seed: i, wobble: 0.42 });
  }
  return composed('unbasined-spring', g, [31, 44], {
    tags: ['water', 'rock', 'satyr', 'naiad', 'moisture', 'wildness'],
    cycle: { ramp: 'water', rate: 5 },
  });
})();

/** 1,4 · MOSSY FALLEN TRUNK. Old, quiet, untended — the second place mess and
 *  purity agree. Same log as the centaur's, decades later: no end grain left
 *  clean, moss over the whole upper surface, bracket fungus. */
export const MOSSY_TRUNK = (() => {
  const g = G(66, 34);
  logAlong(g, 2, 6, 54, 8, 'qqrst', { endGrain: false });
  // Moss takes the lit upper surface, which is also where rain sits.
  for (let k = 0; k <= 54; k++) {
    const cy = 6 + k * 0.5;
    for (let dy = -7; dy < 1; dy++) {
      const y = Math.round(cy + dy);
      if (peek(g, 2 + k, y) === '.') continue;
      const n = nz(k * 1.1, y * 2.3);
      if (dy < -6 && n > 0.5) continue;
      if (n > 0.28) put(g, 2 + k, y, dy < -4 ? (n > 0.66 ? 'l' : 'k') : 'k');
      if (dy < -5 && n > 0.82) put(g, 2 + k, y, 'l');
    }
  }
  // Bracket fungus: three shelves on the shaded flank, pale on top, dark under.
  for (const [fx, fy, w] of [[16, 20, 5], [31, 27, 4], [43, 31, 3]]) {
    for (let k = -w; k <= w; k++) {
      const h = Math.round(2.5 * Math.sqrt(Math.max(0, 1 - (k / w) * (k / w))));
      for (let j = 0; j <= h; j++) put(g, fx + k, fy - j, j === h ? 'D' : j > 0 ? 'C' : 'A');
    }
  }
  return composed('mossy-trunk', g, [30, 31], { tags: ['timber', 'satyr', 'unicorn', 'moss', 'maturity', 'seclusion'] });
})();

/** 2,3 · ROCKY FORD — where the run meets the water. A ford is legible only
 *  if you can see that it is CROSSABLE: stones proud of the surface in a line,
 *  the water broken white around them, and a worn approach on both banks. */
export const ROCKY_FORD = (() => {
  const g = G(70, 40);
  const CX = 34;
  const CY = 20; // the anchor: the tile's centre point
  /**
   * WATER IS GROUND, so it is bounded by the GROUND DIAMOND and not by the
   * edges of its bitmap. The channel used to run from row 2 to row 35 and stop
   * there, which cut it off across a straight line 32 px wide — a horizontal
   * edge at ground level, in a world that has none.
   *
   * A stream crossing a tile leaves that tile at the tile's own boundary. This
   * is that boundary: |dx|/32 + |dy|/16 <= 1, the diamond, stated as the
   * integer inequality |dx|/2 + |dy| <= 16.
   *
   * The BOULDERS are drawn after this and are deliberately NOT clipped: they
   * stand up out of the water, and a thing with height is allowed above the
   * ground plane. That distinction is the whole reason this is a clip on the
   * water rather than on the sprite.
   */
  const onTile = (x, y) => Math.abs(x - CX) / 2 + Math.abs(y - CY) <= 16;
  const wet = (x, y, k) => {
    if (onTile(x, y)) put(g, x, y, k);
  };
  // The channel, running along the -ty axis so it crosses the +tx run.
  for (let y = 2; y < 38; y++) {
    const mid = CX + (y - 18) * 0.9;
    const half = 15 - Math.abs(y - 18) * 0.18;
    for (let x = Math.round(mid - half); x <= Math.round(mid + half); x++) {
      const d = Math.abs(x - mid) / half;
      let i = 2 + Math.round((1 - d) * 1.6);
      if (((x + y) & 1) === 0 && nz(x * 1.4, y) > 0.55) i += 1;
      wet(x, y, 'FGHIJK'[Math.max(0, Math.min(5, i))]);
    }
    for (const s of [-1, 1]) {
      const x = Math.round(mid + s * half) + s;
      for (let k = 0; k < 3; k++) wet(x + s * k, y, k === 0 ? 'x' : nz(x, y) > 0.5 ? 'w' : 'v');
    }
  }
  // The crossing stones, in a line along +tx, with broken water on the
  // upstream side of each.
  for (const [sx, sy, r] of [[16, 12, 5], [27, 17, 6], [39, 22, 5], [50, 27, 6], [60, 32, 4]]) {
    boulder(g, sx, sy, r, r * 0.62, STONE, { seed: sx, lift: 1 });
    // The broken water upstream and down. Clipped like the channel — it is
    // water, and water is ground: unclipped it left blue dashes lying out on
    // the grass beyond the ford, which read as litter rather than as spray.
    for (let k = -r; k <= r; k++) {
      if (nz(sx + k, sy) > 0.4) wet(sx + k, sy - Math.round(r * 0.62) - 1, 'K');
      if (nz(sx + k, sy + 3) > 0.55) wet(sx + k + 1, sy + Math.round(r * 0.62) + 1, 'J');
    }
  }
  return composed('rocky-ford', g, [34, 20], {
    tags: ['water', 'rock', 'centaur', 'naiad', 'moisture', 'crossing'],
    cycle: { ramp: 'water', rate: 4 },
  });
})();

/** 2,4 · FLOWERING MEADOW RUN. Open ground, deep in flowers — the one
 *  affinity object that is nothing but ground cover, and the only thing in the
 *  set a horse would actually want to run across. Keeps low: anything with
 *  height here would defeat the openness the centaur is asking for. */
export const MEADOW_RUN = (() => {
  const g = G(64, 36);
  // THE INVISIBILITY PROBLEM. Take one drew this in the grass ramp — the same
  // four keys the plain meadow tile uses — and the object could not be seen at
  // all: a scatter of flowers floating on nothing. A placeable the player
  // cannot see they placed is worse than no placeable.
  //
  // The fix is not to brighten it, which would only fight the ground. A
  // flowering run is HERB-RICH — knapweed, clover, dry stalks — so it is
  // dithered between the grass ramp and the OLIVE ramp, which is a genuinely
  // different hue and reads instantly as rougher, drier, longer turf. The
  // accuracy and the legibility are the same decision.
  for (let y = 0; y < 32; y++) {
    const half = Math.round((y < 16 ? y + 1 : 32 - y) * 2);
    for (let x = 32 - half; x < 32 + half; x++) {
      const n = nz(x * 1.9, y * 2.3);
      put(g, x, y, n > 0.74 ? 'p' : n > 0.5 ? 'i' : n > 0.24 ? 'o' : 'h');
    }
  }
  // Blades standing proud of the tile edge, so the patch has a fringe rather
  // than a cut line where it meets the ground next door.
  for (let i = 0; i < 190; i++) {
    const bx = 2 + nz(i, 1) * 60;
    const by = 2 + nz(i, 2) * 30;
    const half = (by < 16 ? by + 1 : 32 - by) * 2;
    if (Math.abs(bx - 32) > half - 1) continue;
    const h = 3 + Math.round(nz(i, 3) * 5);
    const dry = nz(i, 19) > 0.6;
    for (let k = 0; k < h; k++) {
      put(g, bx + Math.round(k * 0.3), by - k, k > h - 3 ? (dry ? 'i' : 'p') : dry ? 'h' : 'o');
    }
  }
  // Flowers: white and gold, the millefleurs colours, scattered not clustered.
  for (let i = 0; i < 120; i++) {
    const fx = Math.round(2 + nz(i, 7) * 60);
    const fy = Math.round(2 + nz(i, 11) * 30);
    const half = (fy < 16 ? fy + 1 : 32 - fy) * 2;
    if (Math.abs(fx - 32) > half - 2) continue;
    const kind = nz(i, 13);
    const ch = kind > 0.62 ? '7' : kind > 0.3 ? '5' : '3';
    put(g, fx, fy, ch);
    if (nz(i, 17) > 0.6) put(g, fx + 1, fy, ch);
    put(g, fx, fy + 1, 'h');
  }
  return composed('meadow-run', g, [32, 16], { tags: ['ground', 'centaur', 'unicorn', 'flower', 'open'] });
})();

/**
 * 3,4 · LILY POOL. The alicorn legend is exactly this — the unicorn dips its
 * horn into the water to purify it — so the water has to look DRINKABLE:
 * clear, unclouded, no reeds, no mud. Pads lie FLAT on the surface (a pad
 * drawn as a sphere is the commonest mistake in a pixel pond) and each flower
 * sits proud of its pad by two pixels, which is the only height in the sprite.
 */
export const LILY_POOL = (() => {
  const g = G(70, 44);
  pool(g, 35, 22, 30, { rim: STONE, rimW: 3, seed: 3.3, wobble: 0.09, glint: 0.72 });
  const pads = [[20, 16, 7], [31, 12, 6], [44, 17, 7], [26, 24, 8], [41, 27, 6], [52, 23, 5], [15, 25, 5], [35, 20, 5], [48, 12, 5]];
  for (const [px, py, r] of pads) {
    for (let y = py - Math.round(r * 0.5); y <= py + Math.round(r * 0.5); y++) {
      for (let x = px - r; x <= px + r; x++) {
        const nx = (x - px) / r;
        const ny = (y - py) / (r * 0.5);
        const d = Math.hypot(nx, ny);
        if (d > 1) continue;
        // The notch. A lily pad has a wedge cut out of it and that notch is
        // the entire difference between a pad and a green coin.
        const th = Math.atan2(ny, nx);
        if (Math.abs(th - 1.05) < 0.34 && d > 0.32) continue;
        put(g, x, y, d > 0.86 ? 'b' : ny < -0.2 ? 'd' : 'c');
      }
    }
  }
  for (const [px, py] of [[31, 11], [26, 23], [44, 16]]) {
    for (const [dx, dy, ch] of [
      [-2, 0, 'C'], [-1, -1, '7'], [0, -1, '7'], [1, -1, 'D'], [2, 0, 'C'],
      [-1, 0, '7'], [0, 0, '7'], [1, 0, 'D'], [-1, 1, 'C'], [0, 1, 'D'], [1, 1, 'B'],
      [0, -2, '7'], [-1, -2, 'D'],
    ]) put(g, px + dx, py + dy - 2, ch);
    put(g, px, py - 3, '5');
  }
  return composed('lily-pool', g, [35, 24], {
    tags: ['water', 'naiad', 'unicorn', 'moisture', 'order', 'pure'],
    cycle: { ramp: 'water', rate: 9 },
  });
})();

/**
 * 1,2,3 · ALTAR TO PAN AND THE NYMPHS.
 *
 * "To Pan and the Nymphs" is an attested joint dedication formula, and it is
 * the only one of the four triples that is a single named THING rather than a
 * kind of place — so it carries more of the argument than the others and gets
 * more pixels.
 *
 * It is deliberately NOT the dressed marble of the existing `altar`. This is a
 * rustic rock-cut altar: undressed stone, a dished top black with old libation,
 * a rough inscribed panel, three small votive figures on the ledge behind for
 * the nymphs, and Pan's syrinx laid across the top. The three wild Greek ones
 * are all invited; the unicorn is not Greek and is not invited.
 */
export const ALTAR_PAN_NYMPHS = (() => {
  const g = G(60, 58);
  // BUILT AS A REAL ISOMETRIC BLOCK. Take one stacked bands of pixels by eye
  // and got a washing machine: a top that was not a diamond, sides that were
  // not parallel to the tile axes, and a syrinx standing up behind it like an
  // aerial. A block in 2:1 has a diamond top and two vertical faces meeting at
  // the near corner, and everything placed on it has to respect that diamond.
  const CX = 30, CY = 20, HW = 19, HH = 9, H = 17; // top centre, half-w/h, height
  const topY = (x) => CY - (HH - (Math.abs(x - CX) * HH) / HW);
  const botY = (x) => CY + (HH - (Math.abs(x - CX) * HH) / HW);
  // Rubble footing, one course proud all round.
  for (let x = CX - HW - 3; x <= CX + HW + 3; x++) {
    const t = Math.max(0, HH + 1 - (Math.abs(x - CX) * (HH + 1)) / (HW + 3));
    for (let y = CY + H - Math.round(t); y <= CY + H + Math.round(t) + 5; y++) {
      const n = nz(x * 1.3, y * 2.1);
      put(g, x, y, n > 0.66 ? 'x' : n > 0.3 ? 'w' : 'v');
    }
  }
  // The two vertical faces. Left is lit, right is in shade — one full ramp
  // step apart, which is the law for a 2:1 cube.
  for (let x = CX - HW; x <= CX + HW; x++) {
    const lit = x < CX;
    const base = Math.round(botY(x));
    for (let y = base; y <= base + H; y++) {
      const k = y - base;
      let i = lit ? 3 : 2;
      if (k > H - 4) i -= 1;
      if (nz(x * 1.7, y * 1.1) > 0.76) i -= 1; // undressed: the surface is rough
      put(g, x, y, STONE[Math.max(0, Math.min(3, i))]);
    }
    put(g, x, base + H + 1, 'v');
  }
  put(g, CX, Math.round(botY(CX)), 'y'); // the near arris catches the light
  // Top face: a diamond, dished, and BLACK with old libation. A clean altar is
  // furniture; a used one is cult, and the staining is the whole difference.
  for (let x = CX - HW; x <= CX + HW; x++) {
    for (let y = Math.round(topY(x)); y <= Math.round(botY(x)); y++) {
      // A STAIN, not a hole. Take one dished the top to 'v' and take two to
      // 'q', and both read as an open mouth or a cauldron — on a block this
      // small any dark circle in the middle of the top face becomes a
      // container. What is actually wanted is a shallow depression that has
      // gone dark with use: mostly lit stone, a soft off-centre patch of
      // 'x'/'w', and the warm earth key only in the last few pixels.
      const d = Math.hypot((x - CX + 1) / (HW * 0.5), (y - CY + 1) / (HH * 0.5));
      put(g, x, y, d > 1.35 ? 'y' : d > 0.95 ? 'x' : d > 0.5 ? 'w' : d > 0.22 ? 'r' : 'q');
      if (d < 1.1 && d > 0.4 && nz(x * 2.3, y * 3.1) > 0.72) put(g, x, y, 'x');
    }
  }
  // Inscription on the lit face. At this size writing is a RHYTHM, not text:
  // two sunk lines of even dashes in a lightly proud panel. The eye reads
  // "there is a dedication here" from the beat alone.
  for (let y = 26; y < 35; y++) {
    for (let x = 14; x < 29; x++) {
      put(g, x, y, y === 26 || y === 34 || x === 14 || x === 28 ? 'w' : 'y');
    }
  }
  for (const ly of [29, 32]) for (let x = 16; x < 27; x++) if (x % 3 !== 1) put(g, x, ly, 'w');
  // PAN'S SYRINX, leaning against the lit face. Laid flat on the top diamond
  // it foreshortened into a gold smudge; propped upright the graduated pipes
  // are unmistakable, and a thing leaning on an altar reads as left there.
  for (let pi = 0; pi < 7; pi++) {
    const px = 33 + pi * 2;
    const h = 13 - pi;
    const top = 38 - h;
    for (let y = top; y < 38; y++) {
      put(g, px, y, y === top ? 'W' : 'V');
      put(g, px + 1, y, y === top ? 'V' : 'U');
    }
  }
  for (let x = 32; x < 48; x++) { put(g, x, 31, 'T'); put(g, x, 32, 'U'); }
  // Three votive figures at the foot, for the three Nymphs — terracotta, so
  // they read as offerings and not as statuary, and standing on the ground
  // where people actually leave them.
  for (const v of [[10, 44], [16, 47], [46, 45]]) {
    const vx = v[0], vy = v[1];
    for (let k = 0; k < 6; k++) {
      put(g, vx, vy - k, k > 3 ? 'S' : 'R');
      put(g, vx + 1, vy - k, k > 3 ? 'R' : 'Q');
    }
    put(g, vx, vy - 7, 'S');
    put(g, vx + 1, vy - 7, 'R');
    put(g, vx, vy - 8, 'R');
    put(g, vx - 1, vy - 5, 'Q');
    put(g, vx + 2, vy - 5, 'P');
  }
  // Ivy at the foot. Nobody swept here, and nobody was ever meant to.
  for (const iv of [[7, 40], [21, 48], [43, 47], [52, 41]]) {
    clump(g, iv[0], iv[1], 5, 3.5, LEAF, { seed: iv[0], wobble: 0.42, lift: -1 });
  }
  return composed('altar-pan-nymphs', g, [30, 50], { tags: ['altar', 'satyr', 'centaur', 'naiad', 'cult', 'maturity'] });
})();

/** 1,3,4 · FERN GROTTO. Damp, secret, still. A low overhang with real dark
 *  under it, ferns spilling out of the shade, and water beading off the lip.
 *  Everything about it is about ENCLOSURE, so the rock wraps round the sides. */
export const FERN_GROTTO = (() => {
  const g = G(70, 56);
  boulder(g, 35, 22, 34, 20, STONE, { seed: 7.1 });
  // The overhang's shadow. It has to be genuinely dark and genuinely deep or
  // the whole object is a mound with plants on it.
  for (let y = 24; y < 46; y++) {
    const t = (y - 24) / 22;
    const half = Math.round(20 * Math.sqrt(Math.max(0, 1 - Math.pow(1 - t * 1.2, 2))) + 4);
    for (let x = 35 - half; x <= 35 + half; x++) put(g, x, y, 'v');
    put(g, 35 - half - 1, y, 'x');
    put(g, 35 + half + 1, y, 'w');
  }
  // Seepage: a few wet streaks and a shallow catch at the bottom.
  for (const sx of [24, 33, 44]) {
    for (let y = 27; y < 44; y++) if (nz(sx, y) > 0.35) put(g, sx + Math.round(Math.sin(y * 0.4)), y, y > 40 ? 'H' : 'G');
  }
  pool(g, 35, 46, 17, { rim: null, wobble: 0.2, glint: 0.75 });
  // Ferns. A frond is a TAPERING SPINE with pinnae stepping off it — draw it
  // as a leaf-shaped blob and it is a shrub.
  const fronds = [[12, 44, 1, 16], [19, 47, 1, 20], [27, 49, -1, 18], [44, 49, 1, 17], [52, 46, -1, 21], [58, 43, -1, 15], [35, 50, 1, 13], [8, 40, 1, 13]];
  for (const [fx, fy, dir, len] of fronds) {
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const px = fx + dir * k * (0.35 + t * 0.55);
      const py = fy - k * (1 - t * 0.4);
      put(g, px, py, t > 0.7 ? 'b' : 'c');
      const arm = Math.round((1 - Math.abs(t - 0.35) * 1.7) * 4);
      for (let a = 1; a <= arm; a++) {
        put(g, px - a, py + Math.round(a * 0.45), a > arm - 2 ? 'a' : 'b');
        put(g, px + a, py + Math.round(a * 0.45), a > arm - 2 ? 'b' : 'c');
      }
    }
  }
  // Moss over the wet rock, only where the water runs.
  for (let i = 0; i < 34; i++) {
    const mx = 10 + nz(i, 1) * 50;
    const my = 8 + nz(i, 2) * 16;
    if (!'vwxy'.includes(peek(g, mx, my))) continue;
    clump(g, mx, my, 3, 2, 'jkl', { seed: i * 1.3, wobble: 0.45 });
  }
  return composed('fern-grotto', g, [35, 51], {
    tags: ['rock', 'satyr', 'naiad', 'unicorn', 'moisture', 'seclusion', 'shade'],
    cycle: { ramp: 'water', rate: 13 },
  });
})();

/** 2,3,4 · CLEAR WATERING PLACE. The civil three. No satyr: it is too tended
 *  for him — and "tended" here is doing real work, so the apron is swept
 *  cobble laid in courses, the kerb is cut, and there is not a reed in sight.
 *  It is the place you bring an animal to drink, which is exactly the three
 *  species that would come. */
export const WATERING_PLACE = (() => {
  const g = G(74, 46);
  // Swept cobble, in the EARTH ramp not the rock ramp. Take one laid it in
  // grey stone with a joint line every few pixels and the apron came out a
  // dark slab. A swept, well-used approach is pale and dusty; the joints are
  // where the light fails to get in, not what the thing is made of.
  for (let y = 0; y < 42; y++) {
    const half = Math.round((y < 21 ? y + 2 : 44 - y) * 1.7);
    for (let x = 37 - half; x <= 37 + half; x++) {
      const cu = Math.floor((x - y * 2) / 5);
      const cv = Math.floor((x + y * 2) / 5);
      const n = nz(cu * 3.7, cv * 5.1);
      put(g, x, y, n > 0.62 ? 'u' : n > 0.26 ? 't' : 's');
      if ((x - y * 2) % 5 === 0 && (x + y * 2) % 5 === 0) put(g, x, y, 'r');
    }
    put(g, 37 - half, y, y < 21 ? 'u' : 'q');
    put(g, 37 + half, y, y < 21 ? 't' : 'q');
  }
  pool(g, 37, 21, 22, { rim: 'qrst', rimW: 3, wobble: 0.03, glint: 0.66 });
  // A cut kerb along the far edge — one dressed edge is all it takes to say
  // tended, and it is the only marble in the object.
  // Take one drew this as a straight bright bar and it floated over the pond
  // like a plank. A coping follows the water it copes: it curves with the
  // rim, it is only three pixels deep, and it is C/B marble rather than D/E
  // so it sits down into the scene instead of jumping out of it.
  for (let x = 16; x < 59; x++) {
    const t = (x - 37) / 22;
    const y = 12 - Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 6);
    put(g, x, y - 1, 'C');
    put(g, x, y, 'B');
    put(g, x, y + 1, 'A');
    if (x % 7 === 0) put(g, x, y, 'A'); // joints between the coping stones
  }
  // Two hoof-worn approaches through the cobble to the water's edge.
  for (const a of [[19, 36, 1], [58, 14, -1]]) {
    for (let k = 0; k < 11; k++) {
      for (let w = -2; w <= 2; w++) {
        const x = Math.round(a[0] + a[2] * k * 1.4 + w);
        const y = Math.round(a[1] - k * 0.95);
        if ('qrstu'.includes(peek(g, x, y))) put(g, x, y, nz(k, w) > 0.5 ? 'u' : 't');
      }
    }
  }
  return composed('watering-place', g, [37, 23], {
    tags: ['water', 'centaur', 'naiad', 'unicorn', 'moisture', 'order'],
    cycle: { ramp: 'water', rate: 6 },
  });
})();

// ---------------------------------------------------------------------------
// NULLIFIERS — occluders, DECOR.md Part I
//
// These do not deposit anything; they BLOCK propagation. So the art has one
// job above all others: look impassable, and look like a LINE. A nullifier
// that reads as a decorative clump will be placed as decoration and the player
// will never learn the mechanic.
//
// All three linear pieces run along the +tx axis and span a full tile — from
// the far neighbour's corner (0,0) to the near one (64,32) — so a row of them
// abuts into one continuous barrier with no gaps. That continuity IS the
// mechanic made visible.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// THE SECOND HEDGE FAMILY IS GONE — `hedgeRun`, CLIPPED_HEDGE, TALL_HEDGE and
// HEDGE_ARCH used to stand here, and the game never drew a pixel of any of it.
//
// js/catalog.js asks for the sprites `hedge-low`, `hedge-tall` and
// `hedge-arch`. All three live in js/art/decor.js, which is LAST in the
// artist's registry and wins. These were registered under the PLACEABLE ids
// `clipped-hedge` and `tall-hedge`, which nothing ever looks up — so they were
// unreachable by name — and this file's `hedge-arch` was simply overwritten.
//
// THEY COST A WHOLE EDIT. The owner asked for a more cubic hedge and the first
// attempt was made right here, rendered fine in a probe, and changed nothing in
// the garden — because a sprite's NAME IS NOT ITS PLACEABLE'S ID. To find the
// art the game actually draws, resolve the descriptor:
//
//   node -e "import('./js/catalog.js').then(c=>console.log(c.byId('clipped-hedge').art))"
//
// And they were a second home for the very constant this file just got wrong
// twice: `hedgeRun` opened with `const len = 65`, and the arch cut its doorway
// at `gap: {x0: 21, x1: 44}` of that 65, all measured against a full tile of
// run that is actually LINE_W = 33. Keeping a dead copy "in step" is not free:
// it is a second place for a wrong number to look deliberate.
//
// `tools/registry-audit.mjs` now reports any sprite that is defined and
// unreachable, so the next one of these gets caught rather than inherited.
// ---------------------------------------------------------------------------

/**
 * Nullifier · DRYSTONE WALL.
 *
 * Spans a full tile on the same geometry as the hedges, for the same reason: a
 * nullifier that leaves gaps between segments is not a barrier, and the player
 * will not believe a line they can see through. Take one was a 24px stub and a
 * run of them read as scattered rubble.
 *
 * Drystone has no mortar, so the JOINTS are the whole texture — dark slots
 * between stones of unrelated size, each stone with its own lit top edge and
 * its own shaded flank. A wall shaded as one slab is a plank; a wall drawn as
 * even courses is brickwork, which is the wrong register entirely.
 */
function drystoneGrid(gate = false) {
  // ------------------------------------------------------------------------
  // ONE TILE OF RUN, AND A REAL TOP. Both numbers here were wrong, and the
  // owner caught both from a screenshot:
  //
  //   *"its way longer than the other walls, and so when the gate is placed
  //   between the segments the walls on either end cover it."*
  //   *"it also has problems with not being volumetric."*
  //
  // The run was 65 px against a note claiming that was "a full-tile bar". A
  // full tile of run is LINE_W = 33; 65 is TWO of them, so every segment
  // overhung its plot by half a tile at each end and the neighbours simply
  // drew over the gateway standing between them. A run of plain wall hid the
  // fault perfectly — each piece covered its neighbour with more of the same
  // masonry — which is why it survived a whole arc of joining work. It took a
  // GATE, the one piece that is not interchangeable with its neighbours, to
  // make the overlap visible.
  //
  // And the top was drawn as a vertical band directly above the face, which is
  // not what a top face is: see the slab note in js/art/format.js. It now uses
  // the same three primitives the hedges do, so a wall and a hedge cannot
  // disagree about which way a surface recedes.
  // ------------------------------------------------------------------------
  const D = 8; // the slab's depth across the run
  const HIGH = 13; // A DRYSTONE WALL IS THIRTEEN PIXELS HIGH — unchanged, and
  const X0 = 2 * D + 2; // still the whole difficulty for the gateway below.
  const TOP = 3;
  const g = G(X0 + LINE_W + 3, TOP + LINE_W / 2 + D + HIGH + 26);

  // Stone id from a coarse, deliberately irregular lattice.
  const stoneAt = (x, y) => {
    const row = Math.floor(y / (4 + Math.floor(nz(Math.floor(y / 4), 7) * 3)));
    const w = 6 + Math.floor(nz(row, 11) * 7);
    const col = Math.floor((x + row * 5) / w);
    return { row, col, edgeX: (x + row * 5) % w === 0, key: col * 31 + row * 7 };
  };
  const clampi = (v) => Math.max(0, Math.min(3, v));
  /** The foot wanders a couple of pixels. A dry wall is not laid to a line. */
  const faceH = (i) => HIGH + Math.round(nz(i * 0.4, 3) * 2);

  /**
   * THE COPING, in the slab's own (run, depth) coordinates. Its joints run
   * ACROSS the wall, because that is how a stone is laid on top of one.
   *
   * DO NOT HAND-ROLL THIS SURFACE. It was written twice as a loop over run
   * positions — `for b in 0..D: put(X0 + i - 2b, yTop + b)` — which looks like
   * a top face and is not one: stepping `b` moves x by -2 while stepping `i`
   * moves it by +1, so only two screen columns in every four are ever written
   * and the cap comes out as a wire mesh with the grass showing through it.
   * That aliasing is precisely why `slab` iterates the bounding box and tests
   * membership instead. The keyFn below is the part an artist owns; the fill
   * is the projection's business.
   */
  const coping = (i, b) => {
    const cw = 9 + Math.floor(nz(Math.floor(i / 11), 11) * 6); // this stone's length
    const t = b / D;
    let v = t < 0.4 ? 3 : t < 0.85 ? 2 : 1;
    if (nz(i * 1.7, b * 2.3) > 0.86) v -= 1; // grain, sparse
    if (Math.floor(i) % cw === 0) v -= 2; // the joint between coping stones
    return STONE[clampi(v)];
  };

  /** The near face: courses of unmortared stone, dark slots between them. */
  const course = (i, k, y) => {
    const st = stoneAt(X0 + i - 2 * D, y);
    let v = 2 + Math.round((nz(st.key * 1.3, st.row * 2.7) - 0.5) * 1.6);
    if (k < 2) v += 1; // each course catches light on top
    if (st.edgeX || y % (4 + Math.floor(nz(st.row, 7) * 3)) === 0) v = 0; // joint
    if (k / HIGH > 0.82) v -= 1;
    return STONE[clampi(v)];
  };

  // ------------------------------------------------------------------------
  // THE GATEWAY, built out of the wall it stands in.
  //
  // The owner: *"what i think we really need are separate gates / archways for
  // the various walls."* A gateway in a drystone wall is not a different
  // object — it is this wall with a hole through it and two piers carrying a
  // lintel over the hole, drawn from the same courses and the same lattice, so
  // the masonry can never drift from the wall either side of it.
  //
  // A DRYSTONE WALL IS THIRTEEN PIXELS HIGH, which is the whole difficulty. A
  // first attempt carved a doorway INTO it and produced a dark smudge that was
  // invisible at 1x — correctly, because a hole in a knee-high wall is a gap
  // you step over rather than a way through. A gateway has to ANNOUNCE ITSELF,
  // and real gateposts do it by being the tallest thing in the field. So the
  // piers are built UP and the lintel bridges them.
  //
  // NOTE WHAT THIS PIECE GETS RIGHT THAT THE HEDGE ARCH DID NOT: only the
  // MIDDLE of the run rises. The ends stay at exactly wall height, so a gate
  // meets its neighbours flush and there is no raised cross-section standing
  // proud with nothing drawn on its cut face. The hedge arch lifted its whole
  // bar by four and showed a lit raw edge above every neighbour for it. The
  // stone gate had the answer first; decor.js now copies it.
  // ------------------------------------------------------------------------
  const CX = LINE_W / 2;
  const HALF_GAP = 5; // the clear opening, in run pixels
  const PIER = 3; // ...and the jamb either side of it
  const RISE = 12; // how far the piers stand proud of the wall's cap

  // NOTHING IS ERASED. The old code cleared a screen column and redrew it,
  // which only worked because a run position was a single column of pixels.
  // Now that the cap recedes, one screen column carries parts of many run
  // positions and clearing by column would take its neighbours' masonry with
  // it. So each pass simply declines the run positions that are not its own,
  // and the passes are ordered plain wall, passage, piers, lintel.
  const raised = (i) => gate && Math.abs(i - CX) <= HALF_GAP + PIER;
  const opening = (i) => gate && Math.abs(i - CX) <= HALF_GAP;

  // 1 · THE WALL, CLOSED, at wall height — everywhere except the way through.
  //
  // NOT "everywhere the gateway is not", which is what this said first. The
  // piers stand RISE above the wall, so where a pier steps back down to wall
  // height there was a wedge with nothing drawn in it and the ground showed
  // through the masonry. Measured on a run of five with one gateway: **192
  // transparent pixels with stone above them and stone below them.** A plain
  // run measured zero. The body is drawn whole and the piers cover it.
  //
  // THE OPENING IS THE ONE EXCEPTION and it has to be. A doorway is a hole
  // THROUGH the wall, so the wall's cap must not be laid across it — do that
  // and the way through fills with lit coping and the gate reads as blocked.
  // Closed means "no accidental holes", not "no holes".
  /**
   * WHAT YOU SEE THROUGH THE OPENING — the dark of the way, never the lawn.
   *
   * The doorway is a hole through the wall's THICKNESS, so it is not one
   * column: it is the whole parallelogram of cap the wall would have had
   * there. Leaving that transparent let the grass show straight through the
   * gateway — 147 px of it, which is most of what the first "draw it closed"
   * pass still had wrong. decor.js's rule for the hedge arch is the rule here:
   * a hole that shows what is behind it reads as damage, not as a way through.
   */
  const tunnel = (x, y) => (nz(x, y) > 0.84 ? STONE[1] : STONE[0]);

  slabBackEdge(g, X0, TOP, LINE_W, STONE[0], (i) => !raised(i));
  slab(g, X0, TOP, LINE_W, D, (a, b, x, y) =>
    opening(a * 2) ? tunnel(x, y) : coping(a * 2, b)
  );
  slabFace(g, X0, TOP, LINE_W, D, HIGH + 2, (i, k) =>
    opening(i) || k >= faceH(i) ? null : course(i, k, TOP + LINE_DROP(i) + D + 1 + k)
  );

  if (gate) {
    // 2 · The passage. A hole cut in a wall that shows the GRASS behind it
    // reads as damage — decor.js's lesson on the hedge arch, in stone — so the
    // opening is filled with the dark of the way through, from just under the
    // lintel down to the ground.
    for (let i = 0; i <= LINE_W; i++) {
      if (!opening(i)) continue;
      const fx = X0 + i - 2 * D;
      const top = TOP + LINE_DROP(i) - RISE + D + 4;
      const foot = TOP + LINE_DROP(i) + D + faceH(i);
      for (let y = top; y <= foot; y++) put(g, fx, y, nz(fx, y) > 0.84 ? STONE[1] : STONE[0]);
    }
    // 3 · The piers: this wall, built higher, their faces carried to the foot.
    slabBackEdge(g, X0, TOP - RISE, LINE_W, STONE[0], (i) => raised(i) && !opening(i));
    slab(g, X0, TOP - RISE, LINE_W, D, (a, b) =>
      raised(a * 2) && !opening(a * 2) ? coping(a * 2, b) : null
    );
    slabFace(g, X0, TOP - RISE, LINE_W, D, RISE + HIGH + 2, (i, k) =>
      raised(i) && !opening(i) && k < RISE + faceH(i)
        ? course(i, k, TOP + LINE_DROP(i) - RISE + D + 1 + k)
        : null
    );
    // 4 · The lintel: one long stone laid over the opening, drawn as a short
    // section of wall so it is the same masonry rather than a bar.
    slabBackEdge(g, X0, TOP - RISE, LINE_W, STONE[0], opening);
    slab(g, X0, TOP - RISE, LINE_W, D, (a, b) => (opening(a * 2) ? coping(a * 2, b) : null));
    slabFace(g, X0, TOP - RISE, LINE_W, D, 3, (i, k) =>
      opening(i) ? course(i, k, TOP + LINE_DROP(i) - RISE + D + 1 + k) : null
    );
  }

  return { g, ax: X0 + 16 - D, ay: TOP + LINE_DROP(16) + D + HIGH + 1 };
}

export const DRYSTONE_WALL = (() => {
  const { g, ax, ay } = drystoneGrid(false);
  // ALL SIXTEEN CONNECTION STATES, for one line — js/art/format.js §JOINING.
  // The wall is drawn as a full-tile bar running down-right from its hub,
  // which is the only thing `linearJoins` needs: it cuts the bar at the hub to
  // get the -tx and +tx arms and mirrors those two to get -ty and +ty.
  //
  // THE ANCHOR IS NO LONGER WRITTEN DOWN HERE. It used to say `ax: 32` beside
  // a note calling that "its exact midpoint (x = 32 of 65)" — true of the
  // grid, and the reason the wall was two tiles long went unnoticed for an
  // arc: a hand-copied constant agreed with the wrong length and so nothing
  // ever disagreed. The generator returns its own hub now, derived from
  // LINE_W, and there is one place left to get it wrong.
  //
  // Note what this fixes that no audit was looking at. A nullifier that leaves
  // a gap "is not a barrier, and the player will not believe a line they can
  // see through" — the note above, written about a run. The same argument
  // applies at a BEND, and until now two walls meeting at right angles crossed
  // each other and stuck a spur out past the turn.
  return linearJoins(
    'drystone-wall',
    { g, ax, ay },
    { tags: ['nullifier', 'structure', 'rock', 'order', 'enclosure'] }
  );
})();

/**
 * ...AND THE WAY THROUGH IT.
 *
 * `axialJoins`, not `linearJoins`: half a gateway is a pier and a piece of
 * lintel, and two of those arriving from different directions is a rockfall.
 * A gate is drawn WHOLE and every mask resolves to it or its mirror.
 *
 * The catalogue puts it in the wall's group (`joins: 'dry-stone-wall'`), which
 * is what makes the walls either side reach for it — so a gateway is a hole in
 * one continuous wall rather than an arch standing where a wall is missing.
 */
export const DRYSTONE_GATEWAY = (() => {
  const { g, ax, ay } = drystoneGrid(true);
  return axialJoins(
    composed('drystone-gateway', g, [ax, ay], {
      tags: ['structure', 'rock', 'order', 'enclosure', 'gate'],
    })
  );
})();

/** Nullifier · a cypress screen. The most Mediterranean way to divide ground,
 *  and the tallest thing a player can put between two zones. */
export const CYPRESS_SCREEN = (() => {
  // ------------------------------------------------------------------------
  // ONE TILE, TWO SPIRES. The owner: *"the cypress screen has similar problems
  // to the drystone wall. the preview that shows where its building also seems
  // bugged."* Both were the same fault, and the second explains the first.
  //
  // The art was 66 px of run — two tiles — with three spires in it, while the
  // catalogue gave it `footprint: [1, 2]`: ONE tile along tx and TWO along ty.
  // So the plot ran at RIGHT ANGLES to the trees standing in it. That is the
  // "bugged" preview exactly: the ghost is drawn from the footprint and the
  // art from the sprite, and here the two genuinely disagreed about which way
  // the object lay. Nothing was wrong with the ghost.
  //
  // tools/anchor-audit.mjs had been reporting it in BOTH of its lists — as a
  // float and as a footprint mismatch, "1x2 claimed, art is 1x1" — for as long
  // as the lists have existed, and test/sprite-anchors.test.mjs carried it as a
  // KNOWN_UNDERSIZED exemption. Three instruments agreed and none of them was
  // read as a bug report.
  //
  // Now the art is LINE_W of run like every other linear piece, the footprint
  // is [1, 1] like the hedges and the drystone wall, and a player builds the
  // length of screen they want — which is what "a close-planted row" is.
  // ------------------------------------------------------------------------
  const X0 = 4;
  const Y0 = 62;
  const g = G(X0 + LINE_W + 14, Y0 + 22);
  // TWO SPIRES, at run 8 and run 24, each stepping down-right by half the tile
  // slope. Sixteen run pixels apart — and because a tile step is 32, the gap
  // ACROSS a seam is also sixteen, so a row of these is evenly planted instead
  // of pairing up with a hole at every join.
  const spires = [
    [X0 + 8, Y0 + LINE_DROP(8)],
    [X0 + 24, Y0 + LINE_DROP(24)],
  ];
  for (let s = 0; s < spires.length; s++) {
    const [cx, base] = spires[s];
    const top = base - 62;
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top);
      // Flame profile: a point at the top, fattest around two-thirds down.
      let hw = 1.2 + 6.6 * Math.sin(Math.pow(t, 0.55) * Math.PI * 0.62);
      hw *= 1 + 0.1 * Math.sin(y * 0.7 + s * 2); // tufted, not turned
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const u = (x - (cx - hw)) / Math.max(1, 2 * hw);
        let i = Math.round(3 - 4.4 * Math.abs(u - 0.3));
        if (nz(x * 2, y) > 0.7) i -= 1;
        if (x === Math.round(cx - hw) || x === Math.round(cx + hw)) i = 0;
        put(g, x, y, CONIFER[Math.max(0, Math.min(3, i))]);
      }
    }
  }
  return composed('cypress-screen', g, [X0 + 16, Y0 + LINE_DROP(16) + 1], {
    tags: ['nullifier', 'tree', 'cypress', 'order', 'enclosure', 'seclusion'],
  });
})();

/**
 * Nullifier · the gravel walk. DECOR calls this the best teaching object in
 * the set, because players lay paths for their own reasons and discover the
 * mechanic by accident — so it has to look like a path a player WANTS, not
 * like a mechanic. A full tile diamond, raked pale grit, with a darker kerb
 * line on the two down-light edges to lift it off the grass.
 */
export const GRAVEL_WALK = (() => {
  const g = G(64, 34);
  for (let y = 0; y < 32; y++) {
    const half = y < 16 ? (y + 1) * 2 : (32 - y) * 2;
    const x0 = 32 - half;
    const x1 = 32 + half - 1;
    for (let x = x0; x <= x1; x++) {
      const n = nz(x * 1.7, y * 2.9);
      // Grit, in a fine dither. Below ~24px SPEC forbids dithering as noise;
      // a full tile is 64 across, so this is exactly the case it is for.
      //
      // Take one keyed this on 's'/'t'/'u' and the walk came out the colour of
      // TILLED SOIL — a player laying a path would have got a vegetable bed.
      // Raked gravel is PALE: the top of the earth ramp for the body, and a
      // scatter of marble C/D for the stones that catch the light.
      let ch = n > 0.55 ? 'u' : n > 0.16 ? 't' : 's';
      if (n > 0.9) ch = 'C';
      if (n > 0.975) ch = 'D';
      put(g, x, y, ch);
    }
    // Kerb: the two lower edges catch no light and read as the path's lip.
    if (y >= 16) {
      put(g, x0, y, 's');
      put(g, x1, y, 's');
      put(g, x0 + 1, y, 't');
      put(g, x1 - 1, y, 't');
    } else {
      put(g, x0, y, 'C');
      put(g, x1, y, 'u');
    }
  }
  return composed('gravel-walk', g, [32, 16], { tags: ['nullifier', 'path', 'ground', 'order'] });
})();

// ===========================================================================
// THE TOMBS  (docs/TOMBS.md)
//
// Five funerary structures, and they are the most melancholy objects in a game
// about making somewhere lovely. Two things govern the whole set:
//
//  1. A TOMB IS A PAST. Mechanically it hands the ground around it `maturity`
//     outright, so the art must look OLD — weathered, lichened, settled into
//     the turf — rather than freshly cut. Everything here is authored a step or
//     two down its ramp from the equivalent living object: the naiskos is the
//     same temple front as the tholos in duller stone, and that difference is
//     the sentence the object is saying.
//
//  2. THEY ARE NULLIFIERS, so like the hedges and the drystone wall they must
//     look IMPASSABLE. Nothing grows on a grave. The three carved pieces are
//     upright slabs with real thickness; the tumulus is a landform you would
//     walk round rather than over; the heroon is a fenced precinct.
//
// The two registers of DECOR.md Part II both appear, and the register IS the
// zoning lean: the tumulus is archaic (rough, asymmetric, weathered) and the
// Arcadian tomb is neoclassical (dressed, symmetrical, quiet).
// ===========================================================================

/**
 * A flat-topped rectangular block in 2:1 isometric, sized in TILES.
 *
 * `a` is the half-extent along +tx, `b` the half-extent along +ty, both in
 * tiles, so a sarcophagus that should sit inside a 2x1 footprint without
 * touching its edges is `a = 0.82, b = 0.40`. `hgt` is the height of the two
 * visible vertical faces, in pixels.
 *
 * The inside test is done in TILE SPACE rather than by clipping four screen
 * edges, which is the whole trick: invert the projection at each pixel and the
 * quad becomes an axis-aligned rectangle, so there are no corner cases where
 * three edges meet and no half-pixel gaps at the west and east vertices.
 *
 *     u = (x/32 + y/16) / 2      inside iff |u| <= a and |v| <= b
 *     v = (y/16 - x/32) / 2
 *
 * Faces obey SPEC §3: top = the ramp's lightest step, the +ty face (screen
 * LEFT of the near corner) one step down, the +tx face one further. `face` is
 * an optional (x, y, k, lit) hook — used for the inscription, which has to be
 * stamped in the face's own coordinates and slope with it.
 */
function isoBox(g, cx, cy, a, b, hgt, ramp, opt = {}) {
  const n = ramp.length - 1;
  const kTop = opt.top === undefined ? n : opt.top;
  const kLit = opt.lit === undefined ? n - 1 : opt.lit;
  // SPEC §3 on a 2:1 cube: top = the ramp's last step, left one below it, right
  // ONE TO TWO below that. Take one used n-3, which on the four-step rock ramp
  // put the shaded face at 'v' — the outline colour — and the heroon's podium
  // came out as a black pyramid with white sticks on it.
  const kDark = opt.dark === undefined ? Math.max(0, n - 2) : opt.dark;
  const kEdge = opt.edge === undefined ? 0 : opt.edge;
  const rough = opt.rough === undefined ? 0 : opt.rough;
  const xw = Math.ceil((a + b) * 32) + 1;
  const yw = Math.ceil((a + b) * 16) + 1;
  const southX = 32 * a - 32 * b; // screen x of the near corner
  const out = { x0: cx - xw, x1: cx + xw, base: [] };
  for (let x = -xw; x <= xw; x++) {
    let y0 = null;
    let y1 = null;
    for (let y = -yw; y <= yw; y++) {
      const u = (x / 32 + y / 16) / 2;
      const v = (y / 16 - x / 32) / 2;
      if (Math.abs(u) <= a + 1e-6 && Math.abs(v) <= b + 1e-6) {
        if (y0 === null) y0 = y;
        y1 = y;
      }
    }
    if (y0 === null) continue;
    for (let y = y0; y <= y1; y++) {
      let k = kTop;
      if (rough && nz(x * 1.7 + 11, y * 2.3) > 1 - rough) k -= 1;
      if (y === y0 || y === y1) k = Math.min(k, kTop - 1);
      put(g, cx + x, cy + y, ramp[Math.max(0, Math.min(n, k))]);
    }
    const lit = x < southX;
    for (let d = 1; d <= hgt; d++) {
      const y = y1 + d;
      let k = lit ? kLit : kDark;
      if (rough && nz(x * 2.1, y * 1.3 + 7) > 1 - rough) k -= 1;
      if (d > hgt - 2) k -= 1; // the foot loses the light
      if (x === -xw + 1 || x === xw - 1) k = kEdge;
      if (opt.face) {
        const over = opt.face(x - (lit ? -xw : 0), d, lit, x, y);
        if (over) k = over === true ? kEdge : ramp.indexOf(over);
      }
      put(g, cx + x, cy + y, typeof k === 'string' ? k : ramp[Math.max(0, Math.min(n, k))]);
    }
    out.base.push([cx + x, cy + y1 + hgt]);
    if (x === Math.round(southX)) put(g, cx + x, cy + y1, ramp[n]); // the near arris
  }
  return out;
}

/**
 * A 3x5 Roman capital, for the one object in the game that carries writing.
 *
 * Everywhere else an inscription is drawn as a RHYTHM — even dashes in a sunk
 * panel — because at this scale letterforms turn to noise and a rhythm reads as
 * "there is a dedication here" without pretending to be legible. The Arcadian
 * tomb is the exception, and it has to be, because the joke IS the text: a
 * player who cannot read ET IN ARCADIA EGO has found a blank box.
 *
 * Three pixels is the narrowest a capital can be and still keep its counters,
 * and only ten letters are needed, so each one is drawn rather than derived.
 */
const CAPS_3x5 = {
  A: ['010', '101', '111', '101', '101'],
  C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'],
  G: ['011', '100', '101', '101', '011'],
  I: ['111', '010', '010', '010', '111'],
  N: ['101', '111', '111', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  R: ['110', '101', '110', '101', '101'],
  T: ['111', '010', '010', '010', '010'],
  ' ': ['000', '000', '000', '000', '000'],
};

/**
 * Stamp a word onto a vertical face that runs along the +tx axis, so the
 * baseline drops half a pixel per pixel across exactly as the face does. Cut
 * letters, not painted ones: the stroke goes two steps DOWN the ramp (the
 * shadow inside the incision) with a single lit pixel under each stroke where
 * the far wall of the cut catches the light. That one pixel is the whole
 * difference between carved and printed.
 */
function cutWord(g, word, x0, y0, cut, lip) {
  const pitch = 4;
  const w = word.length * pitch - 1;
  let cx = x0 - ((w / 2) | 0);
  for (const ch of word) {
    const rows = CAPS_3x5[ch] || CAPS_3x5[' '];
    const bl = y0 + Math.round((cx - x0) * 0.5);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (rows[r][c] !== '1') continue;
        put(g, cx + c, bl + r, cut);
        if (rows[r + 1] === undefined || rows[r + 1][c] !== '1') put(g, cx + c, bl + r + 1, lip);
      }
    }
    cx += pitch;
  }
}

/**
 * TUMULUS — the archaic register, and the oldest form there is.
 *
 * TOMBS.md asks for something that "reads as landscape rather than
 * architecture", which is a harder brief than it sounds, because the two
 * obvious readings are both wrong: a smooth green dome is a hill and says
 * nothing, and a mound with a door in it is a building. What makes a barrow a
 * barrow is the KERB — the ring of set stones round its foot that says a
 * person put this here. So the mound is drawn as pure landform, grass all the
 * way over, and the only worked thing in the sprite is a broken ring of kerb
 * stones half swallowed by the turf.
 *
 * TAKE ONE READ AS A GREEN DISC PAINTED ON THE LAWN, and the diagnosis is the
 * one palette.js warns about from the other direction. The mound is made of the
 * SAME material as the ground it stands on, so it has none of the free
 * separation a tree or a statue gets, and the only thing that can make it a
 * solid is its own value range. Take one used about a step and a half of the
 * grass ramp; this one uses all four and pushes hard at both ends:
 *
 *   * the crown and the upper-left flank go to 'p', the ramp's top, which is
 *     LIGHTER than any pixel in the meadow tile;
 *   * the lower-right flank and the whole foot go to 'm', which is darker than
 *     any pixel in it;
 *   * and the lower-right silhouette carries two rows of 'm' regardless, so
 *     the mound is cut out of the ground rather than blended into it.
 *
 * The other half of the cure is the PLAN. A circle in 2:1 isometric is an
 * ellipse of exactly 2:1, and a 2:1 ellipse of flat colour is the single most
 * synthetic shape there is. The radius is modulated by angle so the barrow is
 * lopsided, which is what a three-thousand-year-old heap of earth is.
 */
export const TUMULUS = (() => {
  const g = G(144, 112);
  const cx = 72;
  const cy = 66; // centre of the base ellipse — and the sprite's ANCHOR
  // THE MOUND FILLS ITS GROUND. The base ellipse is 2:1 because a circle in
  // 2:1 isometric is, and 58 x 29 is that circle inscribed in the 2x2 plot's
  // 128 x 64 base diamond with a hand's breadth of turf left at the vertices.
  //
  // Take four had 56 x 24 with the anchor on the ellipse's FRONT vertex rather
  // than at its centre, which is the same error twice over: the plan was too
  // shallow to be a circle at all, and the whole barrow was then hoisted a full
  // half-diamond up the screen so it covered only the back half of its own
  // plot. On grass that is nearly invisible — a mound made of the ground's own
  // four colours hides its own shadow gap, which is exactly why the heroon was
  // caught floating first and this, the worse offender, was not. The anchor is
  // now the ellipse's CENTRE, so the turf under the near flank is the turf the
  // object actually stands on.
  const rx = 56;
  const ry = 28;
  // Rise of the crown above the far edge. A real barrow is four to six times as
  // wide as it is high, and take two used 30 against a half-width of 50 — a
  // hemisphere, which in silhouette is a circle, which reads as a bush. 26
  // against 58 puts the whole outline at about 1.6 : 1, and THAT is a landform.
  const H = 26;
  const GRASS = 'mnop';
  // 2x2 ordered dither. Four ramp steps cannot hold a smooth dome across a
  // hundred pixels: take two banded into hard diagonal edges that read as a
  // folded paper hat. Dithering the fractional part between adjacent steps is
  // both the cure and the period technique, and the mound is 112px across —
  // comfortably over SPEC §3's ~24px floor for a checkerboard.
  const BAYER = [0, 2, 3, 1];
  const step = (v, x, y) => {
    const base = Math.floor(v);
    const th = (BAYER[(x & 1) * 2 + (y & 1)] + 0.5) / 4;
    return Math.max(0, Math.min(3, base + (v - base > th ? 1 : 0)));
  };

  // ------------------------------------------------------------------------
  // The mound is drawn from its PLAN, not from its silhouette.
  //
  // Take three shaded it by "how far up the outline is this pixel", which is a
  // function of the shape rather than of the form, and produced a flat pale
  // disc lit from the side — a bare patch of earth, not a hill. A dome only
  // reads as a dome when its value comes from its own SURFACE NORMAL, so the
  // barrow is walked in plan coordinates (px, py) over the unit disc, lifted
  // into screen space, and lit properly:
  //
  //     screen x = cx + rx*px
  //     screen y = cy + ry*py − H*sqrt(1 − px² − py²)
  //     normal  ∝ (px, py, sqrt(1 − px² − py²) * rx / 2H)
  //
  // Two things fall out of this for free and neither could be faked:
  //
  //   * the value falls away fast at the RIM and slowly across the crown,
  //     which is what the eye reads as roundness;
  //   * the far slope beyond the mound's own horizon is genuinely hidden,
  //     because plan rows are painted far-to-near and the crown overwrites
  //     what it stands in front of. A barrow you can see the whole far side of
  //     is a plate.
  // ------------------------------------------------------------------------
  // The surface normal of z = H*sqrt(1 - r^2) is proportional to
  // (K*px/s, K*py/s, 1) with s = sqrt(1 - r^2). The 1/s is the whole point:
  // the normal tilts SLOWLY across the crown and then very fast at the rim,
  // and that non-linearity is exactly what the eye reads as roundness. Take
  // three used a normal linear in px and got a disc.
  const K = 0.85;
  for (let py = -1; py <= 1; py += 0.0035) {
    for (let px = -1; px <= 1; px += 0.0035) {
      const r2 = px * px + py * py;
      if (r2 > 1) continue;
      // A BARROW IS NOT A HEMISPHERE. Its top is flattened and its flanks are
      // steep — raising the profile to a power under a half is the difference
      // between a hill and a lens, and it is what puts a readable crown on the
      // object instead of a smooth continuous curve from rim to rim.
      const hz = Math.pow(1 - r2, 0.42);
      // Lopsided: a real barrow has been ploughed at on one side and slumped on
      // the other. A perfect ellipse in 2:1 is the loudest tell there is.
      // Widened when the plan grew to fill the plot: at 56 px of half-width a
      // 6 % wobble is under four pixels and the outline came back as a clean
      // ellipse — an avocado lying on the lawn. Three terms, none of them
      // harmonics of each other, is what stops the eye finding the period.
      const th = Math.atan2(py, px);
      const lop =
        1 +
        0.085 * Math.sin(th * 2 + 0.7) +
        0.045 * Math.sin(th * 3 - 1.4) +
        0.025 * Math.sin(th * 5 + 2.1);
      const sx = Math.round(cx + rx * px * lop);
      const sy = Math.round(cy + ry * py * lop - H * hz);
      const sc = Math.max(0.16, Math.sqrt(1 - r2));
      const nxv = (K * px) / sc;
      const nyv = (K * py) / sc;
      const len = Math.hypot(nxv, nyv, 1);
      const litv = (-0.44 * nxv - 0.44 * nyv + 0.78) / len;
      // 1.0 + 3.05, not 0.85 + 3.3. Growing the plan to fill the plot made the
      // shaded flank five pixels taller, and at the old contrast that whole
      // area bottomed out on 'm' with no dither left in it — a black-green mass
      // with a hard edge against the crown, which reads as a boulder half sunk
      // in the lawn rather than as turf turning away from the light.
      let i = 1.0 + litv * 3.05;
      // Tussocks, sampled in PLAN space so the patches of rough grass wrap over
      // the form instead of lying across it like wallpaper.
      const n = nz(Math.round(px * 13) * 1.7, Math.round(py * 13) * 2.9);
      if (n > 0.70) i += 0.9;
      else if (n < 0.24) i -= 0.9;
      // The turf turning under at the foot, ramped rather than switched. A step
      // change on a contour line draws that contour, and a barrow with a ring
      // ruled round it is a dish.
      if (r2 > 0.82) i -= 1.35 * ((r2 - 0.82) / 0.18);
      put(g, sx, sy, GRASS[step(i, sx, sy)]);
    }
  }

  // The silhouette. The far edge takes a light rim where the sky is behind it;
  // the near edge takes the ramp's floor, and THAT is the line that lifts the
  // whole thing off a meadow made of the same four colours. Both are faded out
  // toward the two extreme ends, where the mound is barely proud of the ground
  // and a full-strength line reads as a bar ruled across the sprite.
  const prof = (x) => {
    const u = (x - cx) / rx;
    if (Math.abs(u) >= 1) return null;
    const s = Math.sqrt(1 - u * u);
    return { u, s, top: cy - ry * s - H * Math.pow(1 - u * u, 0.42), bot: cy + ry * s };
  };
  for (let x = cx - rx; x <= cx + rx; x++) {
    const pr = prof(x);
    if (!pr) continue;
    if (Math.abs(pr.u) < 0.92) {
      put(g, x, Math.round(pr.bot), 'm');
      put(g, x, Math.round(pr.bot) - 1, GRASS[pr.u > 0.1 ? 0 : 1]);
    }
  }

  // THE KERB. A broken ring of set stones round the foot, on the near arc only
  // — the far arc is behind the mound and drawing it would flatten the whole
  // thing into a plate. Every stone is placed ON the profile, so the ring
  // follows the barrow's own lopsided plan instead of a tidy ellipse of its
  // own; every third one is missing and no two are the same size, because a
  // kerb that survived three thousand years is not a border.
  // Each stone is a real little isoBox rather than a shaded lump, so it agrees
  // with every other worked stone in the game about which way the light comes
  // from. Take two shaded them by hand and the whole ring came out as a line of
  // near-black chips, because the outline case swallowed a 5px-wide stone.
  // The stones are held DOWN the rock ramp — top face 'x', not 'y'. At the old
  // values a row of evenly-sized pale blocks along the near arc read as a line
  // of sheep grazing under the barrow. These are lichened kerbstones standing
  // in the mound's own shadow, so the brightest thing on any of them is one
  // step below the brightest thing on the mound.
  for (let k = -10; k <= 10; k++) {
    if (nz(k * 5.1, 3) < 0.34) continue; // gaps: the ring is broken
    const x = Math.round(cx + (k / 11.5) * rx);
    const p = prof(x);
    if (!p) continue;
    const a = 0.05 + nz(k, 9) * 0.06;
    const b = 0.045 + nz(k, 4) * 0.05;
    const sink = 2 + Math.round(nz(k * 2.7, 1) * 4); // how far the turf took it
    isoBox(g, x, Math.round(p.bot) - sink, a, b, 3 + Math.round(nz(k, 6) * 4), STONE, {
      rough: 0.3,
      top: 2,
      lit: 2,
      dark: 1,
    });
  }

  // THISTLE AND BRAMBLE, AND WHERE THEY MAY NOT GO.
  //
  // The original set five evenly spaced tufts of one size along the crest, and
  // took its own opening line — NOTHING GROWS ON A GRAVE — as licence anyway.
  // At the old plan the crown was too small to notice; grown to fill the plot
  // it is a broad lit surface, and five dark ellipses scattered across it read
  // unmistakably as a flock of birds. Moving them to the east and west tips was
  // no better: an outline whose two widest points are foliage lumps is a shrub,
  // and the whole barrow started reading as a bush with stones round it.
  //
  // They belong on the NEAR ARC at the foot. They still break the line where
  // the mound meets the meadow — which is the line that matters, and where
  // scrub really grows — and the crown and both long flanks are left as pure
  // landform, which is what TOMBS.md asked for in the first place.
  clump(g, cx - Math.round(rx * 0.70), cy + 13, 7, 4.2, SCRUB, { seed: 2.2, wobble: 0.45, lift: -1 });
  clump(g, cx + Math.round(rx * 0.64), cy + 15, 5.5, 3.4, SCRUB, { seed: 5.7, wobble: 0.45, lift: -1 });
  clump(g, cx - 16, cy + 24, 4, 2.4, SCRUB, { seed: 3.4, wobble: 0.45, lift: -1 });

  // A skirt offset a little away from the light, AT THE ANCHOR.
  //
  // Take one used the full base radius and put a black bar the width of two
  // tiles under the barrow, so take two made it low and tight — which was
  // right when `skirt` took an explicit 3px depth. It is not right now that
  // depth is r/2: a tight r AND a low centre put the shade fifteen pixels
  // past the tile's own front vertex, and the barrow read as floating over a
  // puddle. r 60 against a 118px mound, inscribed in the 2x2 diamond (max 64).
  return composed('tumulus', g, [cx, cy], {
    footprint: [2, 2],
    tags: ['tomb', 'nullifier', 'grass', 'archaic', 'maturity'],
  });
})();

/**
 * STELE — the standard Greek grave marker, and after the sleeping satyr the
 * finest carving in the game. Hand-authored, pixel by pixel, because the
 * subject is a RELIEF and a relief is nothing but its light.
 *
 * The subject is the one TOMBS.md asks for: the dead at some ordinary task.
 * She stands in profile facing left, head bowed, holding a small casket open in
 * both hands and looking into it — the Hegeso composition, which is the most
 * copied grave relief there is precisely because it is so undramatic. Nothing
 * is happening. That is the point, and it is what the epitaphs are doing too.
 *
 * HOW A RELIEF IS SHADED, because it is not how a statue is shaded:
 *
 *   * The PANEL GROUND is recessed, so it is a step DARKER than the face of the
 *     slab around it ('B'/'C' against 'C'/'D'). Without that step the panel is
 *     a painting.
 *   * The FIGURE stands proud of that ground. Its upper-left surfaces take 'D'
 *     and 'E' — the same values as the slab face, because they are at the same
 *     depth — and its lower-right falls to 'C' and 'B'.
 *   * Every place the figure meets the panel ground on its lower-right side
 *     gets a hard 'A' UNDERCUT. That single dark line is the entire difference
 *     between carved stone and a drawing on stone, and it is the first thing
 *     the eye reads.
 *
 * The slab is weathered: the crowning palmette has lost its left volute, the
 * moulding is chipped, and lichen ('B' flecks) has taken the shaded flank.
 */
export const GRAVE_STELE = sprite(
  'grave-stele',
  [0, 4],
  [
    // The crowning palmette. Chipped away on the left, which is both truthful
    // and the one asymmetry that stops the object reading as a machine part.
    '...........BBB..........',
    '..........BCDCB.........',
    '.........ACDDDCA........',
    '........ACDDEDDCA.......',
    '.......ABCDDEDDCBA......',
    '.......ABCDDEDDCBA......',
    '......AABCCDEDCCBAA.....',
    '.....ABBCCCDEDCCCBBA....',
    '....ABCCDDCCDCCDDCCBA...',
    '...ABCCDDDCCCCCCDDDCCBA.',
    '...ABBCCDDDCCCCDDDCCBBA.',
    '....AABBCCCDDDDCCCBBAA..',
    // The cornice: a projecting moulding, lit on its top face and undercut
    // hard beneath. This band is what gives the slab a head.
    '..ADDDDDDDDDDDDDDDDDDA..',
    '.ADDDDDDDDDDDDDDDDDDDDA.',
    '.ACCCCCCCCCCCCCCCCCCCCA.',
    '.ABBBBBBBBBBBBBBBBBBBBA.',
    '.AAAAAAAAAAAAAAAAAAAAAA.',
    // The shaft. 'D' down the lit left flank, 'C' across the face, 'B' down the
    // shaded right — a slab is very slightly rounded and reads dead flat without
    // it.
    '..ADDDCCCCCCCCCCCCCBBBA.',
    '..ADDDCCCCCCCCCCCCCBBBA.',
    // The sunk panel opens. Its ground is a step DOWN from the shaft face and
    // its top edge carries the shadow the cut throws. Without that step the
    // relief would be a painting.
    '..ADDDAAAAAAAAAAAAACBBA.',
    '..ADDDABBBBBBBBBBBBCBBA.',
    '..ADDDABBBBBBBBBBBBCBBA.',
    // Head, bowed, in profile facing LEFT: brow, nose and chin make the
    '..ADDDABBBBCDDCBBBBCBBA.',
    // silhouette and the cheek takes the light. Every place she meets the
    '..ADDDABBBCDDEDCABBCBBA.',
    // panel ground on her lower-right gets a hard 'A' undercut — that one
    '..ADDDABBCDDEEDCABBCBBA.',
    // line is the entire difference between carved stone and a drawing on it.
    '..ADDDABCDDEEEDCABBCBBA.',
    '..ADDDABBCDEEDDCABBCBBA.',
    '..ADDDABBBCDDDCAABBCBBA.',
    '..ADDDABBBBCDDCAABBCBBA.',
    // Shoulders, and the himation falling off the left one. Drapery reads
    '..ADDDABBCDDDDDDCABCBBA.',
    // by its FOLDS, and a fold is a dark valley with a lit ridge beside it.
    '..ADDDABCDDEEDDDDCACBBA.',
    '..ADDDABCDEEDCDDDCACBBA.',
    '..ADDDABCDEDCCDDDCACBBA.',
    '..ADDDABCDEDCCDDDCACBBA.',
    // The casket, open, held in both hands at the waist, and she is looking
    '..ADDDABCDDDCCDDDCACBBA.',
    // down into it. That is the whole event: the ordinary task.
    '..ADDDABCDDCCCCCDCACBBA.',
    '..ADDDABCDDDEEEDDCACBBA.',
    '..ADDDABCDDDEEEDDCACBBA.',
    '..ADDDABCDDCCCCCDCACBBA.',
    '..ADDDABCDDBAAABDCACBBA.',
    // Below the waist the chiton falls straight to the feet in vertical
    '..ADDDABCDEDCDDECDACBBA.',
    // folds, widening a little into the hem.
    '..ADDDABCDEDCDDECDACBBA.',
    '..ADDDABCDDECDDDCCACBBA.',
    '..ADDDABCDDECDDDCCACBBA.',
    '..ADDDABCDEDCDDECDACBBA.',
    '..ADDDABCDEDCDDECDACBBA.',
    '..ADDDABCDDECDDDCCACBBA.',
    '..ADDDABCDDECDDDCCACBBA.',
    '..ADDDABCDEDCDDECDACBBA.',
    '..ADDDABCDEDCDDECDACBBA.',
    '..ADDDABCDDDCDDDDCACBBA.',
    '..ADDDABCDDCCCCCDCACBBA.',
    // The hem, and the two bare feet under it.
    '..ADDDABCCDDDDDDCCACBBA.',
    '..ADDDABBCCDDDDCCABCBBA.',
    '..ADDDABBBCCCCCCABBCBBA.',
    '..ADDDABBBCCBBCCABBCBBA.',
    '..ADDDABBBBAABBAABBCBBA.',
    '..ADDDABBBBBBBBBBBBCBBA.',
    '..ADDDAAAAAAAAAAAAACBBA.',
    // Lichen has taken the shaded flank below the panel. Nobody scrubs a grave
    // marker; they leave flowers at it, which is a different verb.
    '..ADDDCCCCCCCCCCCCCBBBA.',
    '..ADDDCCCCCCCCCCCCBBBBA.',
    '..ADDDCCCCCCCCCCCCBBBBA.',
    '..ADDDCCCCCCCCCCCCCBBBA.',
    // The base moulding and the plinth, settled a little out of square.
    '.ADDDDDDDDDDDDDDDDDDDDA.',
    'ADDDDDDDDDDDDDDDDDDDDDDA',
    'ACCCCCCCCCCCCCCCCCCCCCCA',
    'ABBBBBBBBBBBBBBBBBBBBBBA',
    'ACCCCCCCCCCCBBBBBBBBBBBA',
    '..ACCCCCCCCCBBBBBBBBBA..',
    '....ACCCCCCCBBBBBBBA....',
    '......ACCCCCBBBBBA......',
    '........ACCCBBBA........',
    '..........ACBA..........',
  ],
  { tags: ['tomb', 'nullifier', 'marble', 'relief', 'maturity'] }
);

/**
 * NAISKOS — a grave marker shaped like a little temple front, with the dead
 * standing in the doorway. Classical register.
 *
 * The whole object is a quotation of a building, so it has to be BUILT: a
 * two-step crepidoma, two antae, an architrave, a pediment with a raking
 * cornice and three acroteria. Get any one of those wrong and it reads as a
 * doghouse. The pediment's tympanum is recessed and therefore darker than the
 * cornice around it, exactly as the stele's panel is.
 *
 * Inside the frame is genuine DEPTH: the chamber behind the figures runs to
 * 'A', the darkest marble there is, and the figures are lit against it. That
 * contrast — a bright edge on a dark ground — is the only thing at this size
 * that makes a doorway look like a doorway rather than a painted rectangle.
 *
 * Two figures, because a naiskos almost always has two and because one figure
 * centred in an arch is a niche saint. The dead stands frontal, right hand at
 * the chin in the mourning gesture; a small servant waits at her left, half her
 * height, holding the box. The height difference does more work than either
 * figure's detail.
 */
export const NAISKOS = sprite(
  'naiskos',
  [0, 6],
  [
    // Three acroteria — two at the corners, one on the ridge. The left one
    // has gone, because everything in this set is old.
    '................DD..............',
    '...............DEED.............',
    '...............CDDC.............',
    // The pediment. Raking cornice lit down its left slope and shaded down
    // its right; the tympanum behind both is RECESSED and therefore a step
    // darker, exactly as the stele's panel is.
    '..............ADDDDA............',
    '.............ADDBBDDA...........',
    '............ADDBBBBDDA..........',
    '...........ADDBBBBBBCDA.........',
    '..........ADDBBBBBBBBCDA........',
    '.........ADDBBBBBBBBBBCDA.......',
    '........ADDBBBBBBBBBBBBCDA......',
    '.......ADDBBBBBBBBBBBBBBCDA.....',
    '......ADDBBBBBBBBBBBBBBBBCDA....',
    '.....ADDBBBBBBBBBBBBBBBBBBCDA...',
    '....ADDBBBBBBBBBBBBBBBBBBBBCDA..',
    '...ADDCCCCCCCCCCCCCCCCCCCCCCCDA.',
    // The horizontal cornice: lit top face, hard undercut beneath it.
    '..ADDDDDDDDDDDDDDDDDDDDDDDDDDDDA',
    '..ADDDDDDDDDDDDDDDDDDDDDDDDDDDDA',
    '..ACCCCCCCCCCCCCCCCCCCCCCCCCCCCA',
    '..AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    // The architrave, then the two antae with the chamber between them.
    '..ADDDDDDDDDDDDDDDDDDDDDDDDCCBBA',
    '..ADDDDDDDDDDDDDDDDDDDDDDDCCBBBA',
    '..AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    '..ADDDDAAAAAAAAAAAAAAAAAAAABBBBA',
    '..ADDDDAAAAAAAAAAAAAAAAAAAABBBBA',
    // The dead, frontal. Head first: brow, cheek, jaw. She is lit hard on
    '..ADDDDAAAAABCDCBAAAAAAAAAABBBBA',
    // her left against the black of the chamber, and that contrast is the
    '..ADDDDAAAAABDDDCAAAAAAAAAABBBBA',
    // only thing at this size that makes a doorway read as a doorway.
    '..ADDDDAAAAACDEEDBAAAAAAAAABBBBA',
    '..ADDDDAAAAACDEEDBAAAAAAAAABBBBA',
    '..ADDDDAAAAABCDDCBAAAAAAAAABBBBA',
    // Shoulders, and the right hand coming up to the chin — the mourning
    '..ADDDDAAAABCDDDCBAAAAAAAAABBBBA',
    // gesture, and the one thing here that is a POSE rather than a shape.
    '..ADDDDAAAABCDEEEDCBAAAAAAABBBBA',
    '..ADDDDAAABCDEEEDDCAAAAAAAABBBBA',
    '..ADDDDAAABCDEEEDDCBAAAAAAABBBBA',
    '..ADDDDAAABCDDEDDDCBAAAAAAABBBBA',
    // The servant arrives at her left, half her height, holding the box.
    '..ADDDDAAABCDDEDDDCBAABCBAABBBBA',
    // The height difference does more work than either figure's detail.
    '..ADDDDAAABCDDEDDDCBABCDCBABBBBA',
    '..ADDDDAAABCDDEDDDCBABDDDBABBBBA',
    '..ADDDDAAABCDEEEDDCBABCDCBABBBBA',
    '..ADDDDAAABCDEEEDDCBBCDDDCABBBBA',
    '..ADDDDAAABCDEEEDDCBBCDDDCABBBBA',
    '..ADDDDAAABCDDEDDDCBBCDCCDABBBBA',
    '..ADDDDAAABCDDEDDDCBBCDBCDABBBBA',
    // Below the waist the chiton falls in vertical folds: a lit ridge, a
    '..ADDDDAAABCDEDDEDCBBCDCCDABBBBA',
    // dark valley, repeated, widening a little into the hem.
    '..ADDDDAAABCDEDDEDCBBCDDDDABBBBA',
    '..ADDDDAAABCDEDDEDCBABCDDCABBBBA',
    '..ADDDDAAABCDEDDEDCBABCDDCABBBBA',
    '..ADDDDAAABCDDEEDDCBABCDDCABBBBA',
    '..ADDDDAAABBCDDDDCBAABCDDCABBBBA',
    '..ADDDDAAAABBCCCCBAAABBCCBABBBBA',
    '..ADDDDAAAAABBBBBAAAAABBBAABBBBA',
    '..ADDDDAAAAAAAAAAAAAAAAAAAABBBBA',
    // The crepidoma: two steps, each lit on its tread and dark on its riser.
    '.ADDDDDDDDDDDDDDDDDDDDDDDDDDDDDA',
    '.ADDDDDDDDDDDDDDDDDDDDDDDDDDDDDA',
    '.ACCCCCCCCCCCCCCCCCCCCCCCCCCCCCA',
    '.ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBA',
    'ADDDDDDDDDDDDDDDDDDDDDDDDDDDDDDA',
    'ADDDDDDDDDDDDDDDDDDDDDDDDDDDDDDA',
    'ACCCCCCCCCCCCCCCCCCCCCCCCCCCCCCA',
    'ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA',
    'ACCCCCCCCCCCCCCCBBBBBBBBBBBBBBBA',
    '..ACCCCCCCCCCCCCBBBBBBBBBBBBBA..',
    '....ACCCCCCCCCCCBBBBBBBBBBBA....',
    '......ACCCCCCCCCBBBBBBBBBA......',
    '........ACCCCCCCBBBBBBBA........',
    '..........ACCCCCBBBBBA..........',
    '............ACCCBBBA............',
    '..............ACBA..............',
  ],
  { tags: ['tomb', 'nullifier', 'marble', 'relief', 'maturity'] }
);

/**
 * HEROON — a shrine over a hero's grave, and the one structure in the set that
 * most literally means "remembered by the divine". Composed rather than typed,
 * because it is architecture: a stepped podium, four columns, a terracotta
 * roof, a grave slab under it and an altar in front of it where the offerings
 * actually go.
 *
 * The terracotta roof is deliberate. Everything else here is marble or grey
 * stone, and one warm mass at the top of the object is what stops a small pale
 * building disappearing into a pale sky — it is also simply what a Greek roof
 * was. Zeus does this on every temple in the game it came from.
 *
 * Painter's order matters and is the whole reason this is composed: back
 * column, roof underside, then the two side columns, then the near column, then
 * the altar. Drawn in any other order the canopy either has no depth or eats
 * its own posts.
 */
export const HEROON = (() => {
  const g = G(140, 142);
  const cx = 70;
  const ay = 104; // the ANCHOR: the centre of the 2x2 plot's base diamond

  // THE CREPIDOMA, AND THE WHOLE POINT OF THIS REVISION.
  //
  // isoBox's half-extents are in tiles, and for a=b the box's base diamond is
  // 64(a+b) px wide and 32(a+b) tall — so a 2x2 footprint, whose base diamond
  // is 128 x 64, is a = b = 1.0 exactly. Take one used 0.58 and 0.50, which is
  // a podium 74 px across claiming ground 128 px across, and then anchored the
  // sprite at the podium's own foot rather than at the plot's centre. The two
  // errors compound: the building ends up hovering over the FRONT half of its
  // own plot with turf showing through underneath, and at nine pixels of drop
  // against thirty-two needed it was the one an owner could actually see.
  //
  // 0.90 and 0.76 put the bottom step at 118 px across — inside the plot with a
  // hand's breadth of turf at the vertices, the same margin the tholos keeps —
  // and the box is placed so its BOTTOM diamond is centred on the anchor. A
  // stepped podium that fills its ground is also just what a heroon is: the
  // shrine is small, the platform it is raised on is not.
  const STEP = 7;
  isoBox(g, cx, ay - STEP, 0.90, 0.90, STEP, STONE, { rough: 0.26 });
  isoBox(g, cx, ay - STEP * 2, 0.76, 0.76, STEP, STONE, { rough: 0.22 });

  const STYL = ay - STEP * 2; // the stylobate: the floor the columns stand on
  const PLAT = 0.76; // ...and its half-extent

  // The grave slab lying on the platform under the canopy. Dark, plain and
  // unlit: what is under a heroon is a grave, not a floor.
  isoBox(g, cx, STYL - 9, 0.30, 0.30, 4, STONE, { top: 1, lit: 1, dark: 0, rough: 0.35 });

  const COL_H = 34;
  const post = (px, py) => {
    for (let y = py - COL_H; y <= py; y++) {
      const t = (py - y) / COL_H;
      for (let dx = -4; dx <= 4; dx++) {
        // Rounded shaft: the highlight sits a third in from the LIT edge, never
        // on the edge itself — the header's law for any turned form.
        const u = (dx + 4) / 8;
        let i = Math.round(4.6 - 6.2 * Math.abs(u - 0.30));
        if (Math.abs(dx) === 4) i = 0;
        if (Math.abs(dx) === 2 && nz(dx, y) > 0.55) i -= 1; // a hint of fluting
        if (t > 0.94 || t < 0.03) i = Math.min(i, 2);
        put(g, px + dx, y, 'ABCDE'[Math.max(0, Math.min(4, i))]);
      }
    }
    // Capital: a plain Doric echinus under a square abacus.
    for (let dx = -6; dx <= 6; dx++) {
      const k = Math.abs(dx) === 6 ? 'A' : dx < -1 ? 'E' : dx < 2 ? 'D' : 'C';
      put(g, px + dx, py - COL_H - 1, k);
      put(g, px + dx, py - COL_H - 2, Math.abs(dx) === 6 ? 'A' : dx < -1 ? 'D' : 'C');
    }
  };

  // The four posts stand on the platform diamond's four half-axis points:
  // (±64a, 0) east and west, (0, ±32a) south and north. Back first, near last,
  // so the canopy has a genuine inside.
  const EW = Math.round(64 * PLAT * 0.70);
  const NS = Math.round(32 * PLAT * 0.70);
  post(cx, STYL - NS);
  post(cx - EW, STYL);
  post(cx + EW, STYL);

  // The entablature: one thin slab spanning the four capitals.
  isoBox(g, cx, STYL - COL_H - 6, PLAT, PLAT, 4, 'ABCDE', { rough: 0.14 });

  // THE ROOF — a low four-sided pyramid in terracotta, drawn as a stack of
  // shrinking diamonds one pixel apart. Each course overdraws the middle of the
  // one below, so what survives is a one-pixel band per course, which at this
  // scale is a tiled slope rather than a staircase.
  //
  // Terracotta is deliberate and it is the only warm mass in the object. A
  // small pale building under a pale sky has nothing to separate it from the
  // background; a red roof settles the whole silhouette, and it is also simply
  // what a Greek roof was.
  //
  // Which face a pixel belongs to is decided in TILE space, by whichever of
  // |u|,|v| is larger. On screen +tx runs down-right and +ty down-left, so with
  // the light in the upper left the −tx slope is the brightest, +ty next, and
  // the +tx slope — facing straight away from the sun — is the darkest.
  //
  // The course table is derived from the span, not copied: the roof oversails
  // the entablature by 0.06 of a tile, and the rise is held at about three
  // quarters of the half-width so the pitch is the one take one arrived at.
  // Left at twelve courses over the wider plan it came out as a pancake.
  const roofY = STYL - COL_H - 10;
  for (let r = 0; r <= 20; r++) {
    const a = PLAT + 0.06 - r * 0.041;
    if (a <= 0.02) break;
    const xw = Math.ceil(a * 64) + 1;
    const yw = Math.ceil(a * 32) + 1;
    for (let x = -xw; x <= xw; x++) {
      for (let y = -yw; y <= yw; y++) {
        const u = (x / 32 + y / 16) / 2;
        const v = (y / 16 - x / 32) / 2;
        if (Math.abs(u) > a || Math.abs(v) > a) continue;
        // The away-facing slope is 'Q', not 'P'. SPEC 3 puts a right face at
        // ramp index 1-2 and 'P' is the terracotta OUTLINE; at the old plan it
        // was a small dark triangle and got away with it, but over a roof this
        // size it became a black hole with a red edge. The eaves below still
        // take 'P', so the silhouette keeps its outline.
        let i;
        if (Math.abs(u) >= Math.abs(v)) i = u < 0 ? 3 : 1;
        else i = v > 0 ? 2 : 1;
        if ((x + y + r) % 3 === 0) i -= 1; // pantile ridges down the slope
        if (r === 0 && (Math.abs(u) > a - 0.03 || Math.abs(v) > a - 0.03)) i = 0; // eaves
        put(g, cx + x, roofY - r * 2 + y, 'PQRS'[Math.max(0, Math.min(3, i))]);
      }
    }
  }

  post(cx, STYL + NS); // the near post, drawn last so it stands in front

  // A FILLET tied round the near column — a strip of wool knotted at a hero's
  // shrine. It is the single detail in the object that says CULT rather than
  // architecture, and it is why the heroon is the one that draws Pan.
  const fy = STYL + NS - 20;
  for (let dx = -5; dx <= 5; dx++) {
    put(g, cx + dx, fy, Math.abs(dx) > 4 ? '1' : Math.abs(dx) > 2 ? '2' : '3');
    put(g, cx + dx, fy + 1, Math.abs(dx) > 4 ? '1' : Math.abs(dx) > 3 ? '2' : '3');
    put(g, cx + dx, fy + 2, Math.abs(dx) > 4 ? '1' : '2');
  }
  // The two loose ends, hanging. A band round a post is a stripe; a band with
  // ends is something a person tied there this year.
  for (let k = 0; k < 5; k++) {
    put(g, cx - 6 - (k > 2 ? 1 : 0), fy + 3 + k, k > 3 ? '1' : '2');
    put(g, cx + 6 + (k > 1 ? 1 : 0), fy + 3 + k, k > 2 ? '1' : '2');
  }

  // The altar, on the lit side, where the offerings actually go. When the
  // podium grew to fill the plot the altar lost the open turf it used to stand
  // on, and the first attempt to squeeze it against the steps turned it into a
  // dark chip of fallen masonry. It belongs where a real one stands: ON THE
  // GRASS AT THE FOOT OF THE STEPS, its top face overlapping the crepidoma's
  // near-left face so there is no gap between them, and its own foot a clear
  // sixteen pixels lower so it reads unambiguously in front. It overhangs the
  // plot to the front-left, which every tree in the game does too.
  const ALT_X = cx - 44;
  const ALT_Y = ay + 8;
  isoBox(g, ALT_X, ALT_Y, 0.22, 0.22, 10, STONE, { rough: 0.3 });
  for (let x = -6; x <= 6; x++) {
    for (let y = -3; y <= 3; y++) {
      if (x * x + y * y * 4 > 30) continue;
      if (nz(x * 3.1, y * 5.3) < 0.42) continue;
      put(g, ALT_X + x, ALT_Y + y, nz(x, y) > 0.7 ? 'q' : 'r'); // old ash
    }
  }

  // The SHADE UNDER THE ALTAR, inside the peristyle — the last baked skirt in
  // the game, and the one that proves the rule the other forty-two broke.
  //
  // The building's own shade is gone: it lay on the WORLD GROUND, which is the
  // plane render.js draws its contact pass on, so baking it was doing the
  // renderer's job in grass-green paint. This one lies on the PODIUM, a surface
  // that belongs to the heroon and that the ground pass knows nothing about. No
  // runtime shadow can ever replace it, and its 'm' is correct wherever the
  // building stands, because what it darkens is the building.
  skirt(g, ALT_X - 2, ALT_Y + 19, 13);
  return composed('heroon', g, [cx, ay], {
    footprint: [2, 2],
    tags: ['tomb', 'nullifier', 'marble', 'cult', 'maturity'],
  });
})();

/**
 * THE ARCADIAN TOMB — a plain stone sarcophagus, blank but for ET IN ARCADIA
 * EGO. Poussin's, by way of Stowe and Shugborough, who really did build these.
 *
 * The design brief is a refusal. Everything else in this set is decorated: the
 * stele has its relief, the naiskos its pediment, the heroon its fillet and its
 * ash. This one has a moulding, a lid and three words, and the restraint is
 * what makes it land — a player who finds it at the far end of a long game
 * should get a plain box with a joke on it, not a monument.
 *
 * So the only craft on show is the LETTERING, and the letters are CUT, not
 * painted: two steps down the ramp for the shadow inside the incision, with one
 * lit pixel under each stroke where the far wall of the cut catches the light.
 * That lit pixel is the whole illusion, and it is why the inscription is
 * authored on the LIT face — on the shaded face there would be no light for the
 * cut to catch and the words would read as ink.
 */
export const ARCADIAN_TOMB = (() => {
  const g = G(108, 104);
  const cx = 54;
  const cy = 32; // the chest's top-face centre
  const A = 0.78;
  const B = 0.38; // half-extents in tiles: long along +tx, as a chest is

  // THE PLINTH, WHICH IS WHAT THE SARCOPHAGUS STANDS ON AND THEREFORE WHAT
  // DECIDES WHERE THE WHOLE OBJECT SITS.
  //
  // A 2x1 plot's base diamond is 96 x 48, which in isoBox's tile half-extents
  // is a = 1.0, b = 0.5. Take one used A+0.06 / B+0.06 — a plinth 82 px across
  // claiming ground 96 px across — and then, worse, ran it off the bottom of a
  // 78-row grid so its front course was literally cut off, and anchored the
  // sprite at the plinth's TOP face. The tomb hovered eleven pixels short of
  // its own front vertex with turf visible under the near end.
  //
  // 0.98 / 0.48 is that diamond with a pixel of turf at the vertices, and the
  // box is placed so its BOTTOM diamond is centred on the anchor: a course of
  // masonry the full size of the ground the tomb claims, which is what a
  // sarcophagus is set on and the reason it does not sink into a lawn.
  const PA = 0.98;
  const PB = 0.48;
  const PH = 7;
  const ay = cy + 30 + PH; // the ANCHOR: the centre of the 2x1 base diamond
  isoBox(g, cx, ay - PH, PA, PB, PH, STONE, { rough: 0.32 });

  // The chest.
  isoBox(g, cx, cy, A, B, 28, 'ABCDE', { rough: 0.16 });

  // THE INSCRIPTION, on the lit (+ty) face, centred and in three lines as every
  // real one of these is cut.
  //
  // The face's top edge runs from the WEST vertex (u=-A, v=+B) to the NEAR
  // corner (u=+A, v=+B) at the constant 2:1 slope, so its horizontal midpoint
  // is exactly halfway between them and its top edge at that midpoint is
  // 16*A px below the west vertex. Take one guessed both and put ET IN half off
  // the left end of the box.
  const westX = 32 * (-A - B);
  const westY = 16 * (-A + B);
  const midX = Math.round(westX + 16 * (A + B)); // half the face's run
  const midY = Math.round(westY + 8 * (A + B)); // ...and half its drop
  for (const [word, dy] of [['ET IN', 5], ['ARCADIA', 12], ['EGO', 19]]) {
    cutWord(g, word, cx + midX, cy + midY + dy, 'A', 'D');
  }

  // The lid: a slab overhanging the chest on every side, then a slightly
  // smaller course on top of it. A sarcophagus without an overhang is a crate.
  //
  // Both lid faces are held DOWN a step from the chest's — top 'D', not 'E'.
  // The lid's top diamond is the single largest flat area in the sprite, and at
  // full 'E' it blew out into a white lozenge that took the eye off the words,
  // which are the entire object. The roughness dithers it between D and E,
  // which is exactly the case SPEC §3 allows a checkerboard for.
  isoBox(g, cx, cy - 5, A + 0.08, B + 0.07, 5, 'ABCDE', { top: 3, lit: 3, dark: 2, rough: 0.22 });
  isoBox(g, cx, cy - 11, A, B, 4, 'ABCDE', { top: 3, lit: 3, dark: 2, rough: 0.22 });
  // A true checkerboard along the lid's far edge, where the light rakes across
  // it. SPEC §3 permits dithering only on flat areas over about 24px, and the
  // lid's top diamond — 100px across — is exactly the case the rule is for.
  for (let x = -46; x <= 46; x++) {
    for (let y = -26; y <= 26; y++) {
      if (peek(g, cx + x, cy - 11 + y) !== 'D') continue;
      if (((x + y) & 1) === 0 && y < -2) put(g, cx + x, cy - 11 + y, 'E');
    }
  }

  // Weathering, held to a whisper: lichen in the shaded lower-right of the
  // chest and one chip out of the near corner of the lid. Enough to say the
  // thing has stood here a long time; not enough to make it a ruin. It is not a
  // ruin. It is a tomb, and somebody keeps it.
  for (let x = cx + 6; x < cx + 34; x++) {
    for (let y = cy + 16; y < cy + 40; y++) {
      if (peek(g, x, y) !== 'C') continue;
      if (nz(x * 1.9, y * 2.7) > 0.82) put(g, x, y, 'B');
    }
  }
  for (let k = 0; k < 5; k++) put(g, cx + 3 + k, cy + 6 - Math.round(k / 2), 'B');

  // AT THE ANCHOR. r 44 against an 83px chest, inscribed in the 2x1 diamond
  // (max 48).
  return composed('arcadian-tomb', g, [cx, ay], {
    footprint: [2, 1],
    tags: ['tomb', 'nullifier', 'marble', 'neoclassical', 'maturity'],
  });
})();

// ===========================================================================
// Registry
// ===========================================================================

export const PROPS = {
  'sleeping-satyr': SLEEPING_SATYR,
  herm: HERM,
  'marble-torso': MARBLE_TORSO,
  column: COLUMN,
  'broken-column': BROKEN_COLUMN,
  'ruined-arch': RUINED_ARCH,
  krater: KRATER,
  urn: URN,
  'half-buried-pithos': HALF_BURIED_PITHOS,
  'stone-basin': STONE_BASIN,
  'spring-head': SPRING_HEAD,
  'votive-shelf': VOTIVE_SHELF,
  'grotto-mouth': GROTTO_MOUTH,
  'cave-mouth': CAVE_MOUTH,
  'drystone-wall': DRYSTONE_WALL,
  'drystone-gateway': DRYSTONE_GATEWAY,
  bench: BENCH,
  pergola: PERGOLA,
  bridge: BRIDGE,
  sundial: SUNDIAL,
  altar: ALTAR,
  'syrinx-post': SYRINX_POST,
  'satyr-mask-pole': SATYR_MASK_POLE,

  // --- the affinity set ---------------------------------------------------
  'ash-tree': ASH_TREE,
  'umbrella-pine': UMBRELLA_PINE,
  'plane-tree': PLANE_TREE,
  'apple-tree': APPLE_TREE,
  'willow-water': WILLOW_WATER,
  'ancient-oak': ANCIENT_OAK,
  'blackthorn-thicket': BLACKTHORN_THICKET,
  'white-thorn': WHITE_THORN,
  'cypress-screen': CYPRESS_SCREEN,
  'gravel-walk': GRAVEL_WALK,
  'wild-vine': WILD_VINE,
  'ivy-boulder': IVY_BOULDER,
  'centaury-bed': CENTAURY_BED,
  'fallen-log': FALLEN_LOG,
  'spring-basin': SPRING_BASIN,
  'reed-bed': REED_BED,
  'lily-bed': LILY_BED,
  'still-pool': STILL_POOL,
  'cliff-cave-mouth': CLIFF_CAVE_MOUTH,
  'unbasined-spring': UNBASINED_SPRING,
  'mossy-trunk': MOSSY_TRUNK,
  'rocky-ford': ROCKY_FORD,
  'meadow-run': MEADOW_RUN,
  'lily-pool': LILY_POOL,
  'altar-pan-nymphs': ALTAR_PAN_NYMPHS,
  'fern-grotto': FERN_GROTTO,
  'watering-place': WATERING_PLACE,

  // --- the tombs (docs/TOMBS.md) ------------------------------------------
  // All five are nullifiers and all five hand `maturity` to the ground round
  // them. The Arcadian tomb is registered here like any other sprite — the art
  // has no business knowing that the catalogue keeps it off the build menu.
  tumulus: TUMULUS,
  'grave-stele': GRAVE_STELE,
  naiskos: NAISKOS,
  heroon: HEROON,
  'arcadian-tomb': ARCADIAN_TOMB,
};

/**
 * THE AFFINITY TABLE — docs/DECOR.md Part I, in machine-readable form.
 *
 * It lives here rather than in the catalogue because it is a property of what
 * each object IS, and because every one of these sprites was drawn to argue
 * for exactly these species. If a future edit moves an object between classes,
 * the art has to move with it: a single is partisan and looks it, a triple is
 * a junction piece and looks ambiguous on purpose.
 *
 *   1 = satyr   2 = centaur   3 = naiad   4 = unicorn
 *
 * BREADTH COSTS STRENGTH, which is the rule that stops the optimal garden
 * being nothing but triples: single 1.0, dual 0.7 each, triple 0.5 each.
 * Nullifiers deposit nothing at all — they are OCCLUDERS, and a nullifier
 * implemented as a negative deposit would dig a dead crater around itself
 * instead of drawing a line.
 */
export const AFFINITY_WEIGHT = { single: 1.0, dual: 0.7, triple: 0.5 };

const aff = (species, klass) => {
  const w = AFFINITY_WEIGHT[klass] || 0;
  const deposits = {};
  for (const sp of species) deposits[sp] = w;
  return { species, class: klass, occluder: false, weight: w, deposits };
};
const nul = (opt) => Object.assign(
  { species: [], class: 'nullifier', occluder: true, weight: 0, deposits: {} },
  opt || {}
);

export const AFFINITY = {
  // --- 12 singles ---------------------------------------------------------
  'wild-vine': aff([1], 'single'),
  'ivy-boulder': aff([1], 'single'),
  'satyr-mask-pole': aff([1], 'single'),
  'ash-tree': aff([2], 'single'),
  'centaury-bed': aff([2], 'single'),
  'fallen-log': aff([2], 'single'),
  'spring-basin': aff([3], 'single'),
  'reed-bed': aff([3], 'single'),
  'votive-shelf': aff([3], 'single'),
  'lily-bed': aff([4], 'single'),
  'still-pool': aff([4], 'single'),
  'white-thorn': aff([4], 'single'),

  // --- 12 duals -----------------------------------------------------------
  'half-buried-pithos': aff([1, 2], 'dual'),
  'umbrella-pine': aff([1, 2], 'dual'),
  'cliff-cave-mouth': aff([1, 3], 'dual'),
  'unbasined-spring': aff([1, 3], 'dual'),
  'blackthorn-thicket': aff([1, 4], 'dual'),
  'mossy-trunk': aff([1, 4], 'dual'),
  'rocky-ford': aff([2, 3], 'dual'),
  'plane-tree': aff([2, 3], 'dual'),
  'apple-tree': aff([2, 4], 'dual'),
  'meadow-run': aff([2, 4], 'dual'),
  'lily-pool': aff([3, 4], 'dual'),
  'willow-water': aff([3, 4], 'dual'),

  // --- 4 triples ----------------------------------------------------------
  'altar-pan-nymphs': aff([1, 2, 3], 'triple'),
  'ancient-oak': aff([1, 2, 4], 'triple'),
  'fern-grotto': aff([1, 3, 4], 'triple'),
  'watering-place': aff([2, 3, 4], 'triple'),

  // --- 5 nullifiers -------------------------------------------------------
  // `gap` marks the one occluder that LEAKS. The hedge arch blocks influence
  // everywhere except through its doorway, which is the most interesting piece
  // in the set: it is how a player deliberately connects two zones through a
  // controlled opening.
  //
  // THIS NOTE USED TO SAY the opening was "22px of genuinely transparent pixels
  // centred on the sprite", and it described the dead props.js arch that was
  // removed above — art the game never drew. The arch it actually draws is in
  // js/art/decor.js and its opening is DARK, not transparent: a lit soffit
  // round the head, shade on the far jamb, a strip of ground at the bottom.
  // The two files stated opposite rules for one object for as long as both
  // existed. decor.js's is the live one, and its argument is the better one —
  // *"a hole cut in a hedge that shows the grass behind it reads as damage"*.
  // What matters to the mechanic is that the way through is VISIBLY a way
  // through, which a dark tunnel says and a transparent hole does not.
  herm: nul(),
  'drystone-wall': nul(),
  'clipped-hedge': nul(),
  'cypress-screen': nul(),
  'gravel-walk': nul({ walkable: true }),

  // Part II hedges. Same mechanic, listed here so the occluder test has one
  // source of truth rather than two.
  'tall-hedge': nul(),
  'hedge-arch': nul({ gap: { axis: 'tx', halfWidth: 11 } }),
};

/** The 33 of DECOR.md Part I. The two Part II hedges are not in the count. */
export const AFFINITY_SET = Object.keys(AFFINITY).filter(
  (k) => k !== 'tall-hedge' && k !== 'hedge-arch'
);

export default PROPS;
