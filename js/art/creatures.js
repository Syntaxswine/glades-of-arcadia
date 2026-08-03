// art/creatures.js — the five wild things, hand-authored pixel by pixel.
//
// These are the payoff of the whole game. Everything the player plants is in
// order that one of these walks in at dusk. They must read at 1x, from across
// a busy map, as *that creature* and no other — which at 40-56px tall means
// silhouette and palette do the work, not detail (RESEARCH §A6, §A9.7).
//
// AUTHORING MODEL. Every pixel below is placed by hand. What is *not* hand-
// repeated is the body: a frame is composed by stamping hand-authored PARTS
// (head, torso, one leg-set) into a grid, exactly the way period artists
// worked with limb layers, and exactly what RESEARCH §A8 recommends — "don't
// redraw the tree to make it sway; redraw only the top two clumps". A walk
// frame is a new leg-set over the same torso, shifted one pixel. That is why
// fourteen frames a creature is affordable and, more importantly, why fixing a
// wrong eye costs one edit instead of fourteen.
//
// FRAME BUDGET, per RESEARCH §A8 (period counts were tiny; the illusion comes
// from irregular timing, not frame count):
//   idle  4 frames, irregular holds (a long settle, two short breaths)
//   walk  4 frames per facing
//   beat  4 frames — the behavioural beat the settling rung watches happen
//
// FACINGS. `se`/`ne` are the authored geometry; `sw`/`nw` are mirrored and
// then RE-LIT, because a plain flip moves the highlight to the shadow side and
// RESEARCH §A9.6 names that as the classic consistency break. `ne`/`nw` swap
// in a back-of-head part — the period trick, cheaper than two more cycles.
//
// PALETTE SIGNATURES. Each creature owns a ramp combination so that a 40px
// smudge at the map edge is already identifiable:
//   satyr    earth flesh + rock shag        (sunburnt, dusty, shabby)
//   centaur  dark bay earth throughout      (big, calm, one animal not two)
//   naiad    water ramp + pale marble       (she is the colour of her spring)
//   unicorn  marble, nearly white           (luminous, deer-thin)
//   pan      dark earth + GOLD horns        (nobody else touches the gold ramp)
//
// LIGHT is upper-left, high, slightly in front. On every creature the screen-
// left of the body carries the highlight, the screen-right carries shadow.
//
// WHAT LOOKING AT THIS ART ON A CANVAS ACTUALLY TAUGHT, recorded so that a
// later edit does not quietly undo it. Every one of these was invisible while
// reading the rows and obvious within a second of seeing the render:
//
//  1. Body hair in earth-0 ('q') reads as a HOLE in the chest, not as hair. It
//     must be earth-1 ('r') — one step under the flesh — with a few 'q' pixels
//     for depth and no more.
//  2. A goat leg needs a real gap between the cannons. Without it the shaggy
//     haunches read as baggy shorts, and the whole creature reads as a man.
//  3. The goat half must sit a rung DARKER than its authored rock values, so
//     the creature splits into pale torso over dark underside. That split is
//     the silhouette, and the silhouette is all that survives at 1x.
//  4. A horse barrel needs a dipped topline, a tucked belly, and separate
//     haunch and shoulder masses for the legs to grow out of. A rounded
//     rectangle with legs under it is a coffee table, every time.
//  5. A remap table that misses one key is not a subtle bug: BAY without 'E'
//     put two marble-white patches on a bay horse's ribs.
//  6. In the unicorn's dip, neck, head and horn first all ran down the same
//     diagonal and fused into one striped slab. Hanging the head VERTICALLY
//     off the end of the neck separates the three directions, and the horn
//     then needs ivory between two dark edges to read where it crosses a face.
//  7. Animation offsets have a sign. Shifting the legs +2 for a "hop" buried
//     the satyr's hooves below the sprite's bottom row.

import { defineSprite } from './format.js';
import { RAMPS, ACCENT } from '../palette.js';

// ---------------------------------------------------------------------------
// A very small composition kit. Pure, no DOM.
// ---------------------------------------------------------------------------

const T = '.';

/**
 * A hand-authored part. Rows are padded to the widest so that authoring can
 * stay ragged — the strict equal-length rule that `defineSprite` enforces is
 * a property of the finished sprite, not of the scraps it is built from.
 */
function part(rows) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => r + T.repeat(w - r.length));
}

/** The same rows through a different set of keys — a horse leg, in bay. */
function remap(art, map) {
  return art.map((r) =>
    r
      .split('')
      .map((c) => (c in map ? map[c] : c))
      .join('')
  );
}

function blank(w, h) {
  const g = new Array(h);
  for (let y = 0; y < h; y++) g[y] = new Array(w).fill(T);
  return g;
}

/** Stamp a part into a grid at (ox, oy). Transparent pixels do not paint. */
function stamp(g, art, ox, oy) {
  const H = g.length;
  const W = g[0].length;
  for (let y = 0; y < art.length; y++) {
    const gy = oy + y;
    if (gy < 0 || gy >= H) continue;
    const row = art[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === T) continue;
      const gx = ox + x;
      if (gx < 0 || gx >= W) continue;
      g[gy][gx] = ch;
    }
  }
}

const toRows = (g) => g.map((r) => r.join(''));

// Mirroring, with the light put back. A plain flip sends the highlight to the
// shadow side; pulling the two extreme rungs of each ramp one step toward the
// middle flattens the mirrored sprite just enough that its light no longer
// contradicts the scene — which is the only part that reads wrong at 1x.
const RELIGHT = new Map();
for (const ramp of Object.values(RAMPS)) {
  const k = ramp.keys;
  for (let i = 0; i < k.length; i++) {
    const j = i === k.length - 1 ? i - 1 : i === 0 ? Math.min(1, k.length - 1) : i;
    RELIGHT.set(k[i], k[j]);
  }
}

function mirrorRelit(rows) {
  return rows.map((r) =>
    r
      .split('')
      .reverse()
      .map((c) => (c === T ? c : RELIGHT.get(c) || c))
      .join('')
  );
}

/**
 * Compose one frame. `layers` is a back-to-front list of [part, x, y] — the
 * draw order is the occlusion order, which is why off-side legs come before
 * the barrel that hides their tops.
 *
 * `ox`/`oy` shift every layer by a constant. It exists so a pose that needs a
 * BIGGER canvas than the creature's base size — the piping satyr needs sky over
 * his head for the notes to rise into — can still be authored in the same
 * coordinates as every other pose of that creature. A note drawn at y = -10 is
 * ten pixels above the top of the ordinary sprite, which is exactly how you
 * want to think about it while writing it. `stamp` clips, so a layer that
 * overhangs the grown canvas is dropped rather than throwing.
 */
function composeRows(w, h, layers, ox = 0, oy = 0) {
  const g = blank(w, h);
  for (const [art, x, y] of layers) {
    if (!art) continue;
    stamp(g, art, (x | 0) + ox, (y | 0) + oy);
  }
  return toRows(g);
}

// ---------------------------------------------------------------------------
// The ghost variant — how a creature looks BEFORE it is earned.
// ---------------------------------------------------------------------------
//
// SPEC §7: the `visits` rung renders the creature desaturated, and that
// monochrome visitor is the game's entire hint system. It must still read as
// the creature — so this is a value-preserving map, not a wash.
//
// Every key is replaced by the palette entry closest to it in LUMINANCE, drawn
// only from the neutral end of the declared ramps (rock + marble + the shadow
// mixer). No new colours enter the game: RESEARCH §A9.4 is not negotiable.
// Contrast is compressed toward the middle so a ghost sits *behind* the
// settled creatures visually as well as chromatically.

const LUMA = (hex) =>
  0.299 * parseInt(hex.slice(1, 3), 16) +
  0.587 * parseInt(hex.slice(3, 5), 16) +
  0.114 * parseInt(hex.slice(5, 7), 16);

const HEX = new Map();
for (const ramp of Object.values(RAMPS)) {
  ramp.keys.split('').forEach((k, i) => HEX.set(k, ramp.hex[i]));
}
for (const [k, hex] of Object.entries(ACCENT)) HEX.set(k, hex);

// The neutral ladder, ordered dark -> light by luminance.
const GHOST_LADDER = ['6', 'v', 'w', 'x', 'A', 'y', 'B', 'C', 'D', 'E'];

const GHOST_MAP = new Map();
{
  const rungs = GHOST_LADDER.map((k) => ({ key: k, l: LUMA(HEX.get(k)) }));
  for (const [key, hex] of HEX) {
    // Compress toward mid-grey: a ghost is faded, not merely grey.
    const l = 118 + (LUMA(hex) - 118) * 0.66;
    let best = rungs[0];
    for (const r of rungs) if (Math.abs(r.l - l) < Math.abs(best.l - l)) best = r;
    GHOST_MAP.set(key, best.key);
  }
}

/** Key -> key. Rewrite a sprite's rows through this for the visiting rung. */
export function ghostKey(key) {
  return GHOST_MAP.get(key) || key;
}

/** Resolver for `rasterise(sprite, ghostResolve, 'ghost')`. */
export function ghostResolve(key) {
  return HEX.get(ghostKey(key));
}

/** The ghost ladder itself, for anyone who wants to check the mapping. */
export const GHOST_RAMP = Object.freeze(GHOST_LADDER.slice());

// ===========================================================================
// Shared horse anatomy.
// ===========================================================================
//
// The centaur and the unicorn are different animals — bay draught-weight
// against pale and deer-thin — but a leg is a leg. Legs are authored once in
// marble keys and remapped: the same discipline as drawing an autumn tree
// through a shifted ramp, and it guarantees both animals are lit alike.
//
//   A B C D  =  outline, shadow, mid, light

const LEG_V = part([
  'DCB.',
  'DCB.',
  'DCBA',
  'DCBA',
  'DCBA',
  '.DCB',
  '.DCB',
  '.DCB',
  '.DCB',
  '.DCB',
  'DCBA',
  '.DCB',
  '.DCB',
  '.DCB',
  '.66.',
  '6666',
]);

const LEG_F = part([
  'DCB....',
  'DCB....',
  'DCBA...',
  '.DCBA..',
  '.DCBA..',
  '.DCB...',
  '..DCB..',
  '..DCB..',
  '..DCB..',
  '...DCB.',
  '...DCBA',
  '...DCB.',
  '....DCB',
  '....DCB',
  '....66.',
  '...6666',
]);

const LEG_B = part([
  '....DCB',
  '....DCB',
  '...DCBA',
  '..DCBA.',
  '..DCBA.',
  '..DCB..',
  '..DCB..',
  '.DCB...',
  '.DCB...',
  '.DCB...',
  'DCBA...',
  'DCB....',
  'DCB....',
  'DCB....',
  '.66....',
  '6666...',
]);

// A leg pose is [part, dx] so the hip stays put while the hoof swings.
const LEG_POSE = [
  [LEG_V, 0],
  [LEG_F, 0],
  [LEG_V, 0],
  [LEG_B, -4],
];

// E must be in these maps. It is not used by the legs, but it IS used by the
// barrel — and a bay horse with two marble-white patches on its ribs is what
// you get if you forget. Seen, and fixed.
const BAY = { A: 'q', B: 'r', C: 's', D: 't', E: 'u' };
const BAY_OFF = { A: 'q', B: 'q', C: 'r', D: 's', E: 't' };
const PALE_OFF = { A: 'A', B: 'A', C: 'B', D: 'C', E: 'D' };

const legPose = (i, keys) => {
  const [art, dx] = LEG_POSE[((i % 4) + 4) % 4];
  return [keys ? remap(art, keys) : art, dx];
};

// The barrel. Topline dips behind the withers, belly tucks up at the flank,
// and the haunch and shoulder are separate masses the legs grow out of — the
// three things that stop a horse reading as a coffee table.
const HORSE_BODY = part([
  '...AACCCCAA.................',
  '..ACDDDDDDCA......AAAAAA....',
  '.ACDDEEEEDDCAAAAACDDDDDDCA..',
  '.ACDEEEEEEDDDCCCDDEEEEEEDCA.',
  'ACDDEEEEEEEDDDDDDDEEEEEEDDCA',
  'ACDDDEEEEEDDDDDDDDDEEEEEDDCA',
  'ACDDDDDDDDDDDDDDDDDDDEEDDCCA',
  'ACDDDDDDDDDDDDDDDDDDDDDDDCBA',
  'ACCDDDDDDDDDDDDDDDDDDDDDCCBA',
  'ACCDDDDDDCCCCCCCCCCDDDDDCCBA',
  '.ACDDDDDCBBBBBBBBBCCDDDDCBA.',
  '.ACDDDDCA.......ABCDDDDCBA..',
  '.ACDDDCA.........ACDDDCBA...',
  '..ACCCA...........ACCCBA....',
  '..AAAA.............AAAA.....',
]);

// ===========================================================================
// SATYR — goat-legged, bearded, snub-nosed, cheerful and a bit shabby.
// Attic vase iconography: wedge beard, blunt upturned nose, ivy in the hair,
// short goat nubs for horns. Wiry, long in the leg. Not a Victorian faun.
// ===========================================================================

// The goat half is authored in the rock ramp and then pushed one rung DOWN.
// Left at authoring value it reads as baggy grey shorts; a step darker and the
// creature splits into a pale torso over a dark shaggy underside, which is the
// silhouette Attic painters used and the one that survives at 1x.
const goat = (rows) => remap(part(rows), { y: 'x', x: 'v' });

const SATYR_W = 24;
const SATYR_H = 44;

const S_HEAD = part([
  '..yy.....yy.',
  '..yx.....xy.',
  '.qqxqqqqqxq.',
  'qqrcdcqqcdcq',
  'qrrrrrrrrrrq',
  'qrutttttttsq',
  'qru6ttttt6ts',
  'qrstttttttus',
  'qrsttttttuuu',
  '.qsttt6ttuu.',
  '.qqrrrrrrq..',
  '..qrrrrrq...',
  '..6qrrrq....',
  '...qqqq.....',
]);

const S_HEAD_BACK = part([
  '..yy.....yy.',
  '..yx.....xy.',
  '.qqxqqqqqxq.',
  'qqrcdcqqcdcq',
  'qrrrrrrrrrrq',
  'qrrrrrrrrrrq',
  'qrrrrrrrrrrr',
  'qrrrrrrrrrrr',
  'qrrrrrrrrrrr',
  '.qrrrrrrrrr.',
  '.qqrrrrrrq..',
  '..qrrrrrq...',
  '...qqrrq....',
  '....qqq.....',
]);

// Neck, then a wiry chest. Chest hair is earth-1, one step under the flesh:
// earth-0 reads as a hole. Arms sit against the body with an 'r' crease.
const S_TORSO = part([
  '.....ttss.....',
  '.....stts.....',
  '...ssttuuts...',
  '..tsttuuutts..',
  '.utrsuuuuutss.',
  '.utrsurrruuss.',
  '.utrsurqrruss.',
  '.utrsurrrruss.',
  '.utrsstrrtuss.',
  '.utr.sstttss..',
  '.utr..sttts...',
  '.us...ssttss..',
  '......sttts...',
  '......ssss....',
]);

// Arms thrown up and out — the dance.
const S_TORSO_DANCE = part([
  'u....ttss....s',
  'tu...stts...st',
  '.tu.ssttuut.ts',
  '..tsttuuutts..',
  '..ustuuuuutss.',
  '...tsurrruus..',
  '...tsurqrrus..',
  '...tssurrrus..',
  '...tsstrrtus..',
  '....ssstttss..',
  '.....sstttts..',
  '......sttts...',
  '......ssts....',
  '......ssss....',
]);

// Goat legs: shaggy haunch, backward hock, thin cannon, cloven hoof, and a
// real gap between the cannons.
const S_LEGS_STAND = goat([
  '.xyyx....xwwx.',
  'xyywwx..xwwwwx',
  'xywwwx..xwwwwx',
  'xywwwwxxwwwwwx',
  'xywwwwwwwwwwwx',
  '.xwwwwwwwwwwx.',
  '.xwwwx..xwwwx.',
  '.xwwwx..xwwwx.',
  '..xwwx..xwwwx.',
  '..xwwx...xwwx.',
  '..vwx....vwwx.',
  '..vw......vwx.',
  '..vw......vw..',
  '..vw......vw..',
  '..vw......vw..',
  '..vw......vw..',
  '..vww.....vww.',
  '..vww.....vww.',
  '..v66.....v66.',
  '.6666....6666.',
]);

const S_LEGS_A = goat([
  '.xyyx....xwwx.',
  'xyywwx..xwwwwx',
  'xywwwx..xwwwwx',
  'xywwwwxxwwwwwx',
  'xywwwwwwwwwwwx',
  '.xwwwwwwwwwwx.',
  'xwwwwx..xwwwwx',
  'xwwwx....xwwwx',
  'xwwx......xwwx',
  'vwx........xwx',
  'vw..........vw',
  'vw..........vw',
  'vw..........vw',
  'vw..........vw',
  'vw..........vw',
  'vw..........vw',
  'vww........vww',
  'vww........vww',
  'v66........v66',
  '6666......6666',
]);

const S_LEGS_B = goat([
  '.xyyx....xwwx.',
  'xyywwx..xwwwwx',
  'xywwwx..xwwwwx',
  'xywwwwxxwwwwwx',
  'xywwwwwwwwwwwx',
  '.xwwwwwwwwwwx.',
  '.xwwwwwwwwwwx.',
  '..xwwwwwwwwx..',
  '..xwwx..xwwx..',
  '..xwx....xwx..',
  '..vwx....vwx..',
  '...vw....vw...',
  '...vw....vw...',
  '...vw....vw...',
  '...vw....vw...',
  '...vw....vw...',
  '...vww..vww...',
  '...vww..vww...',
  '...v66..v66...',
  '..6666..6666..',
]);

const S_LEGS_C = goat([
  '.xyyx....xwwx.',
  'xyywwx..xwwwwx',
  'xywwwx..xwwwwx',
  'xywwwwxxwwwwwx',
  'xywwwwwwwwwwwx',
  '.xwwwwwwwwwwx.',
  '.xwwwwx.xwwwwx',
  '..xwwwx..xwwwx',
  '..xwwwx...xwwx',
  '..xwwx.....xwx',
  '..vwx.......vw',
  '..vw........vw',
  '..vw........vw',
  '..vw........vw',
  '..vw........vw',
  '..vw........vw',
  '..vww......vww',
  '..vww......vww',
  '..v66......v66',
  '.6666.....6666',
]);

// Dance: one hoof kicked high, the other bearing weight.
const S_LEGS_KICK = goat([
  '.xyyx....xwwx.',
  'xyywwx..xwwwwx',
  'xywwwx..xwwwwx',
  'xywwwwxxwwwwwx',
  'xywwwwwwwwwwwx',
  '.xwwwwwwwwwwwx',
  '.xwwwx...xwwww',
  '.xwwwx....xwww',
  '..xwwx.....vww',
  '..xwwx......66',
  '..vwx.......6.',
  '..vw..........',
  '..vw..........',
  '..vw..........',
  '..vw..........',
  '..vw..........',
  '..vww.........',
  '..vww.........',
  '..v66.........',
  '.6666.........',
]);

const S_LEGS_HOP = goat([
  '.xyyx....xwwx.',
  'xyywwx..xwwwwx',
  'xywwwx..xwwwwx',
  'xywwwwxxwwwwwx',
  'xywwwwwwwwwwwx',
  '.xwwwwwwwwwwx.',
  '.xwwwx..xwwwx.',
  '.xwwwx..xwwwx.',
  '..xwwx..xwwwx.',
  '..xwwx...xwwx.',
  '..vwx....vwwx.',
  '...vw.....vwx.',
  '...vw.....vw..',
  '...vw.....vw..',
  '...vww...vww..',
  '...vww...vww..',
  '...v66...v66..',
  '..6666...6666.',
]);

// ===========================================================================
// NAIAD — slight, water-coloured, moving like she is half current.
// Her gown does not end; it becomes the water. That is the whole design.
// ===========================================================================

const NAIAD_W = 22;
const NAIAD_H = 42;

const N_HEAD = part([
  '..GHHHHG..',
  '.GHIIIIHG.',
  'GHIIIIIIHG',
  'GHIIIIIIIG',
  'GHICDDDCIG',
  'GICDDDDDCG',
  'GIC6DD6DCG',
  'GICDDDDDCG',
  '.HCDDDDDCG',
  '.HCDD66DCG',
  '.GCDDDDDCH',
  '.GHCDDDCHG',
  '..GHHHHHG.',
]);

const N_HEAD_BACK = part([
  '..GHHHHG..',
  '.GHIIIIHG.',
  'GHIIIIIIHG',
  'GHIIIIIIIG',
  'GHIIIIIIIG',
  'GIIIIIIIIG',
  'GIIIIIIIIG',
  'GIIIIIIIIG',
  '.HIIIIIIIG',
  '.HIIIIIIIG',
  '.GIIIIIIIH',
  '.GHIIIIIHG',
  '..GHHIHHG.',
]);

const N_TORSO = part([
  '.....CDDC.....',
  '...GHDDDDHG...',
  '..GHIDDDDIHG..',
  '.CHIIDEDDIHGC.',
  '.CHIIDDDDIIGC.',
  '.CGIIIDDIIIGC.',
  '.CGHIIDDIIHGC.',
  '..CGHIIIIHGC..',
  '..CGHIJJIHGC..',
]);

// One arm lifted, tipping the jar — the pour.
const N_TORSO_POUR = part([
  '.....CDDC.....',
  '...GHDDDDHG...',
  '..GHIDDDDIHGC.',
  '.CHIIDEDDIHGCD',
  '.CHIIDDDDIIGCD',
  '.CGIIIDDIIIGC.',
  '.CGHIIDDIIHGC.',
  '..CGHIIIIHGC..',
  '..CGHIJJIHGC..',
]);

// The gown, dissolving downward into the water ramp. Frames differ only in
// which ramp step each streak carries — palette cycling, done by hand.
const N_SKIRT_A = part([
  '...GHIJIHG....',
  '..GHIJJJIHG...',
  '..GHIJJJIHG...',
  '.GHIJJKJJIHG..',
  '.GHIJJKJJIHG..',
  'GHIJJJJJJIHGC.',
  'GHIJJJJJJJIHG.',
  'GHIJJJJJJJIHG.',
  'GHIJJJJJJJIHG.',
  'GHIJJ.JJ.JIHG.',
  '.HIJ..JJ..IHG.',
  '.HII..II..IIH.',
  '.GHI..II..IHG.',
  '..GH..HH..HG..',
  '..JGH.HH.HGJ..',
  '.JKJG.GG.GJKJ.',
  '..J.......J...',
]);

const N_SKIRT_B = part([
  '...GHIJIHG....',
  '..GHIJJJIHG...',
  '..GHIJJJIHG...',
  '.GHIJKJJJIHG..',
  '.GHIJKJJJIHG..',
  'GHIJJJJJJIHGC.',
  'GHIJJJJJJJIHG.',
  'GHIJJJJJJJIHG.',
  'GHIJJJJJJJIHG.',
  'GHIJ.JJ.JJIHG.',
  '.HI..JJ..JIHG.',
  '.HII.II..IIIH.',
  '.GHI.II..IHG..',
  '..GH.HH..HG...',
  '.JGH.HH.HGJ...',
  'JKJG.GG.GJKJ..',
  '.J.......J....',
]);

const N_SKIRT_C = part([
  '...GHIJIHG....',
  '..GHIJJJIHG...',
  '..GHIJJJIHG...',
  '.GHIJJJKJIHG..',
  '.GHIJJJKJIHG..',
  'GHIJJJJJJIHGC.',
  'GHIJJJJJJJIHG.',
  'GHIJJJJJJJIHG.',
  'GHIJJJJJJJIHG.',
  'GHIJJ.JJ.JIHG.',
  '.HIJ..JJ..IHG.',
  '.HIII..II..IH.',
  '.GHII..II..IH.',
  '..GHH..HH..HG.',
  '...JGH.HH.HGJ.',
  '..JKJG.GG.GJKJ',
  '...J.......J..',
]);

// A lock over one shoulder. Without it she is a symmetrical blue dress; with
// it she has a side, and a side is most of what character costs at this size.
const N_LOCK = part(['.IHG', 'IIHG', 'IIHG', 'IHHG', 'IHHG', 'HIHG', 'HIG.', 'GHG.', '.GH.', '..G.']);

const N_JAR = part(['quuutq', 'uEEEDt', 'uEEDDt', 'qtDDtq', '.qttq.']);

const N_POUR_1 = part(['..K.', '..J.']);
const N_POUR_2 = part(['..K.', '.JK.', '.J..', '.J..']);
const N_POUR_3 = part(['..K.', '.JK.', '.J..', 'KJ..', 'JK..', '.J..', 'JKJ.']);

// ===========================================================================
// CENTAUR — a horse body with a human torso at the withers. Big and calm.
// Bay throughout, so the join reads as one animal rather than a man wearing a
// horse. The torso's lower rows flare down-left in the SAME keys as the
// barrel and are drawn OVER it: that flare is the join, and it is the single
// thing that decides whether this creature works.
// ===========================================================================

const CENTAUR_W = 44;
const CENTAUR_H = 50;

const C_HEAD = part([
  '..qqqqqqq...',
  '.qqrrrrrrq..',
  'qqrrrrrrrrq.',
  'qrrsttttsrq.',
  'qrsttttttsq.',
  'qrst6tt6tts.',
  'qrsttttttts.',
  'qrstttttttu.',
  'qrsttt6ttuu.',
  '.qqrrrrrrq..',
  '..qrrrrrq...',
  '..6qrrrq....',
  '...qqqq.....',
]);

const C_HEAD_BACK = part([
  '..qqqqqqq...',
  '.qqrrrrrrq..',
  'qqrrrrrrrrq.',
  'qrrrrrrrrrq.',
  'qrrrrrrrrrq.',
  'qrrrrrrrrr..',
  'qrrrrrrrrr..',
  'qrrrrrrrrr..',
  'qrrrrrrrrr..',
  '.qqrrrrrrq..',
  '..qrrrrrq...',
  '...qqrrq....',
  '....qqq.....',
]);

const C_TORSO = part([
  '......ttss.......',
  '......stts.......',
  '....ssttuuts.....',
  '...tsttuuutts....',
  '..utrsuuuuuutss..',
  '..utrsurrrruuss..',
  '..utrsurqqrruss..',
  '..utrsurrrrruss..',
  '..utrsstrrrtuss..',
  '..utr.ssttttuss..',
  '..us..sstttttss..',
  '......sstttttts..',
  '.....qsttttttts..',
  '...qqrsstttttts..',
  '.qqrssttttttts...',
  'qrssttttttttt....',
  'qsttttttttt......',
]);

const C_TORSO_REAR = part([
  'u.....ttss.......',
  'tu....stts.......',
  '.tu.ssttuuts.....',
  '..tsttuuutts.....',
  '..ttrsuuuuuutss..',
  '..ttrsurrrruuss..',
  '..ttrsurqqrruss..',
  '..ttrsurrrrruss..',
  '..ttrsstrrrtuss..',
  '..tt..ssttttuss..',
  '..s...sstttttss..',
  '......sstttttts..',
  '.....qsttttttts..',
  '...qqrsstttttts..',
  '.qqrssttttttts...',
  'qrssttttttttt....',
  'qsttttttttt......',
]);

const C_BODY = remap(HORSE_BODY, BAY);

const C_TAIL = part([
  '....srq',
  '...srrq',
  '..srrqq',
  '..srrqq',
  '.srrqq.',
  '.srrqq.',
  '.srrqq.',
  '.srrqq.',
  '.srrqq.',
  '..srqq.',
  '..srqq.',
  '..srq..',
  '..srq..',
  '...sq..',
]);

// ===========================================================================
// UNICORN — the medieval tapestry animal. Slender, pale, deer-like, shy.
// Small head, long thin legs, arched neck, spiral horn. NOT a fat white pony.
// ===========================================================================

const UNICORN_W = 48;
const UNICORN_H = 46;

const U_BODY = HORSE_BODY;

// Neck: a diagonal band from the withers up to the poll. The crest (mane)
// rides its upper-left edge, which is where the light is.
// The last four rows drop the 'A' outline and the dark throat: they sit ON the
// barrel, and an outline there draws a hard diagonal seam across the shoulder.
const U_NECK = part([
  '.......ACDDD',
  '......ACDEED',
  '.....ACDEEED',
  '.....ACDEEED',
  '....ACDEEEDD',
  '....ACDEEDDC',
  '...ACDEEEDDC',
  '...ACDEEDDCC',
  '..ACDEEEDDCD',
  '..CDDEEDDDDD',
  '.CDDDEEDDDDD',
  '.CDDDDDDDDD.',
  'CDDDDDDDDD..',
  'CDDDDDDDD...',
]);

const U_MANE = part([
  '.......CBDC',
  '......CBDCB',
  '.....CBDCB.',
  '.....CBDCB.',
  '....CBDCB..',
  '....CBDCB..',
  '...CBDCB...',
  '...CBDCB...',
  '..CBDCB....',
  '..CBDCB....',
  '.CBDCB.....',
  '.CBDC......',
  'CBDC.......',
]);

const U_HEAD = part([
  '..B..A.....',
  '.BCB.ABA...',
  '.BCDDDDBA..',
  'ACDDEEEDDA.',
  'ACDE6EDDDDA',
  'ACDDEDDDDDA',
  '.ACDDDDDDDA',
  '..ACDDDDDCA',
  '...ACDDD6CA',
  '....AACCCA.',
]);

const U_HEAD_BACK = part([
  '..B.....B..',
  '.BCB...BCB.',
  '.BCDDDDDCB.',
  'ACDDDDDDDCA',
  'ACDDDDDDDDA',
  'ACDDDDDDDDA',
  '.ACDDDDDDA.',
  '..ACDDDDCA.',
  '...ACDDCA..',
  '....AACA...',
]);

const U_HORN = part([
  '.......E',
  '......EE',
  '.....CEE',
  '.....DE.',
  '....CEE.',
  '....DE..',
  '...CEE..',
  '...DE...',
  '..CEE...',
  '..DDE...',
]);

// The dock is the TOP-RIGHT corner and the tail is drawn AFTER the barrel, so
// it visibly grows out of the croup instead of floating alongside it.
const U_TAIL = part([
  '....EDC',
  '...EDDC',
  '..EDDCA',
  '..EDDCA',
  '.EDDCA.',
  '.EDDCA.',
  '.EDDCA.',
  '.EDDCA.',
  '.EDDCA.',
  '..EDCA.',
  '..EDCA.',
  '..EDC..',
  '..EDC..',
  '...DC..',
]);

// The dip needs its own neck, head and horn. Translating the standing head
// downward leaves the neck pointing at the sky with the skull hanging off the
// end of it — the break is obvious the moment you look at the frame.
const U_NECK_DOWN = part([
  'ACDDDDDC....',
  'ACDDEEEDC...',
  '.ACDEEEDDC..',
  '.ACDEEEDDC..',
  '..ACDEEEDDC.',
  '..ACDEEEDDC.',
  '...ACDEEEDDC',
  '...ACDEEEDDC',
  '....ACDEEEDC',
  '....ACDEEEDC',
  '.....ACDEEDC',
  '.....ACDEEDC',
  '......ACDEDC',
  '......ACDDDC',
]);

const U_HEAD_DOWN = part([
  '.B..A....',
  'BCB.ABA..',
  'BCDDDDBA.',
  'ACDDEEEDA',
  'ACDE6EDDA',
  'ACDDEDDDA',
  '.ACDDDDDA',
  '.ACDDDDCA',
  '..ACDDDCA',
  '..ACDDDCA',
  '..ACDD6CA',
  '...AACCA.',
]);

const U_HORN_DOWN = part([
  'AEA.....',
  'AEA.....',
  'AEA.....',
  '.AEA....',
  '.AEA....',
  '.AEA....',
  '..AEA...',
  '..AEA...',
  '..AEA...',
  '...AEA..',
  '...AEA..',
  '....AEA.',
]);

const U_RIPPLE = part(['.K..K...K..', 'JKJ.JKJ.JK.', '.J...J...J.']);

// ===========================================================================
// PAN — horned, goat-legged, older. He must read as THE GOD, not as a big
// satyr: heavier through the chest, a beard to the sternum, and great curling
// GOLD ram horns that no other creature in the game is allowed to borrow.
// ===========================================================================

const PAN_W = 30;
const PAN_H = 52;

// A ram horn is a thick band curling out, back and down. Outer arc catches
// the light (W), inner arc is the shadow (T).
const P_HORN_L = part([
  '...WWVU.',
  '..WVVUT.',
  '.WVUT...',
  'WVUT....',
  'WVUT....',
  'WVUT....',
  'WVUUT...',
  'WVUUT...',
  '.WVUUT..',
  '..WVUUT.',
  '...WVUT.',
  '....WVT.',
  '.....UT.',
]);

const P_HORN_R = part([
  '.UVVW...',
  '.TUVVW..',
  '...TUVW.',
  '....TUVW',
  '....TUVW',
  '....TUVW',
  '...TUUVW',
  '...TUUVW',
  '..TUUVW.',
  '.TUUVW..',
  '.TUVW...',
  '.TVW....',
  '.TU.....',
]);

const P_HEAD = part([
  '..6qqqqqqqq6..',
  '.qqrrrrrrrrqq.',
  'qqrrrrrrrrrrqq',
  'qrrsttttttsrrq',
  'qrsttttttttsrq',
  'qrst6tttt6tsrq',
  'qrstttttttttu.',
  'qrsttttttttuu.',
  'qrsttt66ttttu.',
  '.qqrrrrrrrrq..',
  '..qrrrrrrrrq..',
  '..qrrrrrrrq...',
  '...qrrrrrq....',
  '...qrrrrrq....',
  '....qrrrq.....',
  '.....qqq......',
]);

const P_HEAD_BACK = part([
  '..6qqqqqqqq6..',
  '.qqrrrrrrrrqq.',
  'qqrrrrrrrrrrqq',
  'qrrrrrrrrrrrrq',
  'qrrrrrrrrrrrrq',
  'qrrrrrrrrrrrrq',
  'qrrrrrrrrrrrr.',
  'qrrrrrrrrrrrr.',
  'qrrrrrrrrrrrr.',
  '.qqrrrrrrrrq..',
  '..qrrrrrrrrq..',
  '..qrrrrrrrq...',
  '...qrrrrrq....',
  '....qqrrq.....',
  '.....qqq......',
]);

const P_TORSO = part([
  '.......ttsss........',
  '.......sttss........',
  '.....ssttuuuts......',
  '...tssttuuuutts.....',
  '..utrsuuuuuuuutss...',
  '..utrsuurrrruutss...',
  '..utrsutrqqrtuutss..',
  '..utrsuttrrttuuuss..',
  '..utrsuuttrttuuuss..',
  '..utrssuutttttuuss..',
  '..utr..ssttttttss...',
  '..us...ssttttttss...',
  '.......sstttttss....',
  '........ssttss......',
  '.........ssss.......',
]);

// Both hands to the mouth, holding the syrinx.
const P_TORSO_PIPE = part([
  '.......ttsss........',
  '.......sttss........',
  '..tt.ssttuuuts.ss...',
  '..ututtuuuuutts.ss..',
  '..uutsuuuuuuuutss...',
  '...utsuurrrruutss...',
  '...utsutrqqrtuutss..',
  '...utsuttrrttuuuss..',
  '...utsuuttrttuuuss..',
  '...utssuutttttuuss..',
  '...ut..ssttttttss...',
  '...us..ssttttttss...',
  '.......sstttttss....',
  '........ssttss......',
  '.........ssss.......',
]);

const P_ARM_UP_L = part([
  '..uu',
  '..ut',
  '.uut',
  '.uts',
  'uts.',
  'uts.',
  'ut..',
  'ut..',
  'us..',
]);

const P_ARM_UP_R = part([
  'ts..',
  'ts..',
  'tss.',
  'tss.',
  '.tss',
  '.tss',
  '..ss',
  '..ss',
  '..s.',
]);

const P_SYRINX = part([
  'utututu',
  'qqqqqqq',
  'utututu',
  'ututut.',
  'ututu..',
  'utut...',
]);

const P_LEGS_STAND = goat([
  '.xyyyx.....xyyyx..',
  'xyyyyyx...xyyyyyx.',
  'xyyywwx...xyyywwx.',
  'xywwwwwx.xywwwwwx.',
  'xywwwwwwwwywwwwwwx',
  'xywwwwwwwwwwwwwwwx',
  '.xwwwwwwwwwwwwwwx.',
  '.xwwwwx...xwwwwwx.',
  '.xwwwwx...xwwwwwx.',
  '..xwwwx...xwwwwx..',
  '..xwwwx....xwwwx..',
  '..xwwx.....xwwwx..',
  '..vwwx......vwwx..',
  '..vwx.......vwwx..',
  '..vw.........vwx..',
  '..vw.........vw...',
  '..vw.........vw...',
  '..vw.........vw...',
  '..vw.........vw...',
  '..vww.......vww...',
  '..vww.......vww...',
  '..v66.......v66...',
  '.6666.......6666..',
]);

const P_LEGS_A = goat([
  '.xyyyx.....xyyyx..',
  'xyyyyyx...xyyyyyx.',
  'xyyywwx...xyyywwx.',
  'xywwwwwx.xywwwwwx.',
  'xywwwwwwwwywwwwwwx',
  'xywwwwwwwwwwwwwwwx',
  'xwwwwwwx.xwwwwwwwx',
  'xwwwwx.....xwwwwwx',
  'xwwwx.......xwwwwx',
  'vwwx.........xwwwx',
  'vwx...........xwwx',
  'vw.............vwx',
  'vw.............vw.',
  'vw.............vw.',
  'vw.............vw.',
  'vw.............vw.',
  'vw.............vw.',
  'vw.............vw.',
  'vw.............vw.',
  'vww...........vww.',
  'vww...........vww.',
  'v66...........v66.',
  '6666.........6666.',
]);

const P_LEGS_B = goat([
  '.xyyyx.....xyyyx..',
  'xyyyyyx...xyyyyyx.',
  'xyyywwx...xyyywwx.',
  'xywwwwwx.xywwwwwx.',
  'xywwwwwwwwywwwwwwx',
  'xywwwwwwwwwwwwwwwx',
  '.xwwwwwwwwwwwwwwx.',
  '..xwwwwwwwwwwwwx..',
  '..xwwwwx.xwwwwwx..',
  '...xwwwx.xwwwwx...',
  '...xwwx...xwwwx...',
  '...vwwx...xwwwx...',
  '...vwx.....vwwx...',
  '....vw.....vwx....',
  '....vw.....vw.....',
  '....vw.....vw.....',
  '....vw.....vw.....',
  '....vw.....vw.....',
  '....vw.....vw.....',
  '....vww...vww.....',
  '....vww...vww.....',
  '....v66...v66.....',
  '...6666...6666....',
]);

const P_LEGS_C = goat([
  '.xyyyx.....xyyyx..',
  'xyyyyyx...xyyyyyx.',
  'xyyywwx...xyyywwx.',
  'xywwwwwx.xywwwwwx.',
  'xywwwwwwwwywwwwwwx',
  'xywwwwwwwwwwwwwwwx',
  '.xwwwwwwx.xwwwwwwx',
  '..xwwwwx....xwwwwx',
  '..xwwwx......xwwwx',
  '..xwwx........xwwx',
  '..vwx..........xwx',
  '..vw............vw',
  '..vw............vw',
  '..vw............vw',
  '..vw............vw',
  '..vw............vw',
  '..vw............vw',
  '..vw............vw',
  '..vw............vw',
  '..vww..........vww',
  '..vww..........vww',
  '..v66..........v66',
  '.6666.........6666',
]);

// ---------------------------------------------------------------------------
// THE PIPING SATYR.
// ---------------------------------------------------------------------------
//
// He stands and plays when the music starts. The brief was "very limited
// animation ... just standing and moving the flute around", which is also the
// truthful animation: a piper's hands stay put and the INSTRUMENT travels
// across the lips. Moving his head instead would read as a man chewing.

// The chest without its hanging arms — they are raised, and drawn separately.
// A satyr piping is still. The dance torso would have him capering, which is
// the wrong register: this is the one moment he is doing something carefully.
const S_TORSO_PIPE = part([
  '.....ttss.....',
  '.....stts.....',
  '...ssttuuts...',
  '..tsttuuutts..',
  '...suuuuuuts..',
  '...surrruus...',
  '...surqrrus...',
  '...surrrrus...',
  '...sstrrtus...',
  '....ssstttss..',
  '.....sstttts..',
  '......sttts...',
  '......ssts....',
  '......ssss....',
]);

// Arms bent, ELBOWS OUT. This is the whole silhouette of the pose and the
// first attempt got it wrong: forearms tucked against the ribs put the pipes
// inside the head's outline, and in flat black he read as a blob holding
// nothing. The elbows have to break the body line and the fists have to stand
// proud of the ends of the reeds, or there is no instrument.
//
// Left is the lit side (earth light), right is in shadow. Light upper-left.
// Forearms sloping up and inward to the reeds, elbows DOWN and OUT past the
// ribs. The elbow is the whole reason the pose reads at all: hands tucked
// against the chest put both arms inside the body's outline and he goes back to
// being a satyr with a green smudge on his chin.
const S_ARM_PIPE_L = part([
  '...uu',
  '..uut',
  '.uut.',
  'uut..',
  'ut...',
]);

const S_ARM_PIPE_R = part([
  'ss...',
  'tss..',
  '.tss.',
  '..tss',
  '...ts',
]);

// Cut cane bound with cord.
//
// OLIVE, not earth. The third attempt authored the reeds in the same ramp as
// his skin and the instrument simply disappeared — a satyr with a faint texture
// on his face. Cane is a plant; it belongs in a plant ramp, and the value
// break against flesh is what makes it an object he is HOLDING rather than a
// marking he is wearing.
//
// FACE WIDTH, not shoulder width: an earlier pass made it fourteen by nine and
// he wore it like a washboard bib.
//
// Held AT THE LIPS, and narrow enough that the beard shows either side of it.
// An earlier pass dropped the reeds to the collarbone to spare the beard and
// he wore them like a necklace — a gap between the mouth and the instrument
// reads as jewellery, not as playing. Six wide is the number that touches the
// mouth and still leaves beard at both edges.
//
// The tubes are OLIVE MID striped against OLIVE DARKEST, and the choice of
// which olive is the whole story of this sprite.
//
// It was authored first in the earth ramp — his own skin — and vanished. Moved
// to olive light (`i`) it vanished again, because olive light and flesh mid are
// 132 and 129 in luminance: a hue difference with no value difference, and at
// twenty-four pixels hue alone is not a read. That pass compensated by striping
// `i` against a dark olive so the instrument carried its own internal contrast,
// which worked in colour and hid a second bug underneath it.
//
// THE SECOND BUG: the `visits` rung renders desaturated, and the ghost map
// compresses everything toward mid-grey. `i` and flesh `t` both land on
// #8A7F6D — a separation of ZERO. Half the syrinx was literally his skin
// colour in the preview every player sees FIRST, and it read as a muzzle.
//
// `h` is the key that survives both. Against flesh `t` it is 34 apart in
// colour and 30 in the ghost; `i` was 2 and 0.
//
// Darker than his skin, not lighter, so the notes stay the only bright thing
// in the pose. They are what the eye should go to.
const S_SYRINX = part([
  'ffffff',
  'hfhfhf',
  'hfhfhf',
  'gggggg',
  'hfhf..',
  'hf....',
]);

// The notes.
//
// Marble, not gold: this is breath through cut reed, not treasure — gold is
// the game's divine/precious register and would promise a reward. The fade as
// they rise is done in VALUE (E -> C -> B), never in alpha, because alpha puts
// colours in the frame that the palette never authored. Same law as the
// creature dissolve.
const NOTE_NEAR = part([
  '.EE',
  '.ED',
  '.E.',
  'EE.',
  'EE.',
]);

const NOTE_MID = part([
  '.CC',
  '.C.',
  'CC.',
  'CC.',
]);

const NOTE_FAR = part([
  '.B',
  'BB',
]);

const NOTE_GLYPHS = [NOTE_NEAR, NOTE_NEAR, NOTE_MID, NOTE_MID, NOTE_FAR, NOTE_FAR];

/**
 * Where a note is, `age` frames after it left the pipes. Returns null once it
 * has gone. Three of these are in flight at once at staggered ages, which is
 * what makes a stream rather than a pulse — and the stagger is uneven (0, 3, 5)
 * for the same reason the HOLDS are uneven: regular spacing reads as a machine.
 *
 * They rise SLOWLY and stay near him. The first pass sent them up three pixels
 * a frame and they were off over his horns and gone before the eye found them,
 * which read as specks of dust rather than as music.
 */
function noteAt(age) {
  if (age < 0 || age >= NOTE_GLYPHS.length) return null;
  // They leave from the RIGHT end of the reeds — where the short tubes are and
  // where the breath is going — and climb away over his shoulder. Starting
  // them level with his horns made them read as feathers in his hair.
  return [NOTE_GLYPHS[age], 16 + Math.round(age * 1.2), 7 - Math.round(age * 2.4)];
}

// ---------------------------------------------------------------------------
// THE DRINKING SATYR.
// ---------------------------------------------------------------------------

// A kantharos — the deep two-handled cup a satyr is holding on almost every
// Attic vase that has a satyr on it. The handles stand proud of the rim, which
// is the one detail that makes it a kantharos and not a bucket, and it is worth
// two pixels a side to keep.
//
// Dark body, light rim. The first pass filled it with the bright end of the
// terracotta ramp and it read as a red blob against his chest — a cup is an
// object he is holding, so it wants an outline and an interior, not a colour.
const S_CUP = part([
  'P....P',
  'PSSSRP',
  'PSRRQP',
  '.SRRQ.',
  '..RQ..',
  '.PPPP.',
]);

// The cup as seen while he is drinking OUT of it: upended, foot uppermost, rim
// at the lips. Five wide, and the two pixels that decide the frame are the ones
// either side of it — his eyes stay visible, so it reads as a satyr behind a
// cup rather than as a satyr wearing one.
//
// The pass before this tilted the full six-wide cup on a diagonal and it lay
// across his face like a bandana. Same lesson the syrinx taught: at this size
// an object at the mouth must be NARROW enough for the face to survive it.
const S_CUP_SIP = part([
  '.PPP.',
  'PQRQP',
  'PSRQP',
  '.PPP.',
]);

// The forearm that lifts it. Only drawn while the cup is up — with the cup at
// his side the torso's own hanging arm already reads, and a second forearm
// there gives him three.
const S_ARM_CUP = part([
  '.uu',
  '.ut',
  '.ut',
  '.ut',
  '.st',
  '.s.',
]);

// Eyes shut. This is the whole tell for the drink, and it is two pixels.
//
// The first attempt re-authored the entire head tipped back — jutting beard,
// chin up — and it read as his head shrinking, because at fourteen rows tall
// there is no room for a rotation to look like anything but a different head.
// Closing his eyes and lifting him one pixel says the same thing and keeps the
// face he has.
const S_HEAD_SHUT = part([
  '..yy.....yy.',
  '..yx.....xy.',
  '.qqxqqqqqxq.',
  'qqrcdcqqcdcq',
  'qrrrrrrrrrrq',
  'qrutttttttsq',
  'qrustttttsts',
  'qrstttttttus',
  'qrsttttttuuu',
  '.qsttt6ttuu.',
  '.qqrrrrrrq..',
  '..qrrrrrq...',
  '..6qrrrq....',
  '...qqqq.....',
]);

// ---------------------------------------------------------------------------
// Frame assembly.
// ---------------------------------------------------------------------------

function satyrLayers(kind, i, back) {
  const head = back ? S_HEAD_BACK : S_HEAD;
  if (kind === 'idle') {
    const bob = [0, -1, -1, 0][i];
    return [
      [S_LEGS_STAND, 5, 24],
      [S_TORSO, 5, 11 + bob],
      [head, 6, 0 + bob],
    ];
  }
  if (kind === 'walk') {
    const legs = [S_LEGS_A, S_LEGS_B, S_LEGS_C, S_LEGS_B][i];
    const rise = [0, -1, 0, -1][i];
    return [
      [legs, 5, 24],
      [S_TORSO, 5, 11 + rise],
      [head, 6, 0 + rise],
    ];
  }
  if (kind === 'pipe') {
    // The pipes sweep across the lips and back over eight frames; the body
    // only breathes. `sweep` is the instrument, `breath` is the chest, and the
    // head follows the pipes by HALF as much — enough to look like he is
    // following his own hands, not enough to look like he is nodding.
    const sweep = [0, 1, 2, 2, 1, 0, -1, -1][i];
    const breath = [0, 0, -1, 0, 0, -1, 0, 0][i];
    const tilt = [0, 0, 1, 1, 0, 0, 0, 1][i];
    const notes = [0, 3, 5]
      .map((off) => noteAt((i + off) % 8))
      .filter(Boolean)
      .map(([g, x, y]) => [g, x + sweep, y]);
    return [
      [S_LEGS_STAND, 5, 24],
      [S_TORSO_PIPE, 5, 11 + breath],
      [head, 6, 0 + breath + tilt],
      [S_ARM_PIPE_L, 5 + sweep, 10 + breath],
      [S_ARM_PIPE_R, 14 + sweep, 10 + breath],
      [S_SYRINX, 9 + sweep, 9 + breath + tilt],
      ...notes,
    ];
  }
  if (kind === 'drink') {
    // Six frames, played ONCE: appear, raise, sip, sip, lower, stand. The cup
    // exists from frame 0 — it "appears in his hand" because his hand is empty
    // in every other pose he has, which is a cleaner read than an animated
    // fade-in and costs nothing.
    //
    // The body is the ORDINARY standing torso. Only the cup, one forearm and
    // his eyelids change; everything the player already recognises stays put.
    const sip = i === 2 || i === 3;
    const cupX = [14, 12, 10, 10, 12, 14][i];
    const cupY = [19, 14, 7, 6, 14, 19][i];
    const raised = cupY < 17;
    return [
      [S_LEGS_STAND, 5, 24],
      [S_TORSO, 5, 11],
      [sip && !back ? S_HEAD_SHUT : head, 6, 0],
      [raised ? S_ARM_CUP : null, cupX + 3, cupY + (sip ? 4 : 6)],
      [sip ? S_CUP_SIP : S_CUP, cupX, cupY],
    ];
  }
  // The hop lifts the WHOLE creature — legs included. Shifting the legs down
  // instead pushes the hooves off the bottom of the sprite and he reads as
  // sunk into the ground up to the fetlock.
  const legs = [S_LEGS_HOP, S_LEGS_KICK, S_LEGS_HOP, S_LEGS_KICK][i];
  const air = [-2, 0, -2, 0][i];
  const lean = [0, 1, 0, -1][i];
  return [
    [legs, 5, 24 + air],
    [S_TORSO_DANCE, 5 + lean, 11 + air],
    [head, 6 + lean, 0 + air],
  ];
}

function naiadLayers(kind, i, back) {
  const head = back ? N_HEAD_BACK : N_HEAD;
  const skirt = [N_SKIRT_A, N_SKIRT_B, N_SKIRT_C, N_SKIRT_B][i];
  if (kind === 'idle') {
    const bob = [0, -1, 0, 0][i];
    return [
      [skirt, 4, 24],
      [N_TORSO, 4, 15 + bob],
      [head, 6, 3 + bob],
      [N_LOCK, 4, 13 + bob],
    ];
  }
  if (kind === 'walk') {
    const drift = [0, 1, 0, -1][i];
    const bob = [0, -1, 0, -1][i];
    return [
      [skirt, 4 + drift, 24],
      [N_TORSO, 4, 15 + bob],
      [head, 6, 3 + bob],
      [N_LOCK, 4 - drift, 13 + bob],
    ];
  }
  const jarY = [16, 16, 17, 17][i];
  const stream = [null, N_POUR_1, N_POUR_3, N_POUR_2][i];
  return [
    [skirt, 4, 24],
    [N_TORSO_POUR, 4, 15],
    [head, 6, 3],
    [N_LOCK, 4, 13],
    [N_JAR, 15, jarY],
    [stream, 17, jarY + 5],
  ];
}

function centaurLayers(kind, i, back) {
  const head = back ? C_HEAD_BACK : C_HEAD;
  const near = (n) => legPose(n, BAY);
  const off = (n) => legPose(n, BAY_OFF);

  function legs(phase) {
    const [hn, hnDx] = near(phase);
    const [fn, fnDx] = near(phase + 2);
    const [ho, hoDx] = off(phase + 2);
    const [fo, foDx] = off(phase);
    return {
      behind: [
        [ho, 12 + hoDx, 33],
        [fo, 28 + foDx, 33],
      ],
      front: [
        [hn, 9 + hnDx, 34],
        [fn, 25 + fnDx, 34],
      ],
    };
  }

  const build = (phase, bodyDy, torsoDy, torsoDx, headDx, headDy, tailDy, torsoArt) => {
    const L = legs(phase);
    return [
      ...L.behind,
      [C_BODY, 6, 25 + bodyDy],
      [C_TAIL, 3, 26 + bodyDy + tailDy],
      ...L.front,
      [torsoArt || C_TORSO, 21 + torsoDx, 12 + torsoDy],
      [head, 25 + headDx, 0 + headDy],
    ];
  };

  if (kind === 'idle') {
    const bob = [0, 0, -1, 0][i];
    const tail = [0, 1, 0, -1][i];
    return build(0, 0, bob, 0, 0, bob, tail);
  }
  if (kind === 'walk') {
    const rise = [0, -1, 0, -1][i];
    const tail = [0, 1, 0, -1][i];
    return build(i, rise, rise, 0, 0, rise, tail);
  }
  // beat — he grazes: the human half folds down until a hand is in the grass.
  const fold = [0, 3, 6, 3][i];
  return build(
    0,
    0,
    fold,
    Math.round(fold * 0.4),
    Math.round(fold * 1.0),
    Math.round(fold * 2.0),
    0,
    C_TORSO
  );
}

function unicornLayers(kind, i, back) {
  const head = back ? U_HEAD_BACK : U_HEAD;
  const near = (n) => legPose(n, null);
  const off = (n) => legPose(n, PALE_OFF);

  function legs(phase) {
    const [hn, hnDx] = near(phase);
    const [fn, fnDx] = near(phase + 2);
    const [ho, hoDx] = off(phase + 2);
    const [fo, foDx] = off(phase);
    return {
      behind: [
        [ho, 12 + hoDx, 29],
        [fo, 28 + foDx, 29],
      ],
      front: [
        [hn, 9 + hnDx, 30],
        [fn, 25 + fnDx, 30],
      ],
    };
  }

  const build = (phase, dy, neckDy, headDx, headDy, ripple) => {
    const L = legs(phase);
    return [
      ...L.behind,
      [U_BODY, 6, 17 + dy],
      [U_TAIL, 3, 18 + dy],
      ...L.front,
      [U_MANE, 25, 13 + neckDy],
      [U_NECK, 25, 14 + neckDy],
      [head, 33 + headDx, 7 + headDy],
      [U_HORN, 37 + headDx, 0 + headDy],
      [ripple ? U_RIPPLE : null, 34, 40],
    ];
  };

  if (kind === 'idle') {
    const bob = [0, 0, -1, 0][i];
    return build(0, bob, bob, 0, bob, false);
  }
  if (kind === 'walk') {
    const rise = [0, -1, 0, -1][i];
    return build(i, rise, rise, 0, rise, false);
  }
  // beat — the horn goes down to still water and the water answers.
  // Frames 1 and 3 are the same half-lowered pose; 2 is the touch.
  const L = legs(0);
  const down = [null, [26, 16, 32, 26, 37, 27, false], [26, 19, 32, 30, 37, 31, true], [26, 16, 32, 26, 37, 27, false]][i];
  if (!down) return build(0, 0, 0, 0, 0, false);
  const [nx, ny, hx, hy, gx, gy, ripple] = down;
  return [
    ...L.behind,
    [U_BODY, 6, 17],
    [U_TAIL, 3, 18],
    ...L.front,
    [U_NECK_DOWN, nx, ny],
    [U_HEAD_DOWN, hx, hy],
    [U_HORN_DOWN, gx, gy],
    [ripple ? U_RIPPLE : null, 33, 42],
  ];
}

function panLayers(kind, i, back) {
  const head = back ? P_HEAD_BACK : P_HEAD;
  if (kind === 'idle') {
    const bob = [0, -1, -1, 0][i];
    return [
      [P_LEGS_STAND, 6, 28],
      [P_TORSO, 5, 13 + bob],
      [head, 8, 0 + bob],
      [P_HORN_L, 0, 1 + bob],
      [P_HORN_R, 22, 1 + bob],
    ];
  }
  if (kind === 'walk') {
    const legs = [P_LEGS_A, P_LEGS_B, P_LEGS_C, P_LEGS_B][i];
    const rise = [0, -1, 0, -1][i];
    return [
      [legs, 6, 28],
      [P_TORSO, 5, 13 + rise],
      [head, 8, 0 + rise],
      [P_HORN_L, 0, 1 + rise],
      [P_HORN_R, 22, 1 + rise],
    ];
  }
  const tilt = [0, 1, 1, 0][i];
  // Breath moves the pipes a pixel, not the god.
  const puff = [0, 1, 0, 1][i];
  return [
    [P_LEGS_STAND, 6, 28],
    [P_TORSO, 5, 13],
    [head, 8, 0 + tilt],
    [P_HORN_L, 0, 1 + tilt],
    [P_HORN_R, 22, 1 + tilt],
    [P_ARM_UP_L, 6, 13 + puff],
    [P_ARM_UP_R, 20, 13 + puff],
    [P_SYRINX, 11, 10 + tilt + puff],
  ];
}

// ---------------------------------------------------------------------------
// The catalogue.
// ---------------------------------------------------------------------------

/**
 * `extra` declares poses beyond the universal idle/walk/beat. Each names its
 * own frame count, because a slow act wants a longer cycle than a four-beat
 * walk, and may `grow` the canvas by [width, height] — width symmetrically,
 * height added at the TOP so the feet stay put and the anchor stays at the
 * bottom centre. Growing downward would push the creature into the ground.
 */
const SPECS = {
  satyr: {
    w: SATYR_W,
    h: SATYR_H,
    layers: satyrLayers,
    beat: 'dances',
    extra: {
      // Sky over his head for the notes to rise into, and a little width for
      // the ones that drift off to the right before they go.
      pipe: { frames: 8, grow: [12, 14] },
      // `once`: not a cycle but a gesture with a beginning and an end. It is
      // played from the elapsed time in the pose and CLAMPS on the last frame
      // rather than snapping back to the cup half-raised.
      drink: { frames: 6, once: true },
    },
  },
  centaur: { w: CENTAUR_W, h: CENTAUR_H, layers: centaurLayers, beat: 'grazes' },
  naiad: { w: NAIAD_W, h: NAIAD_H, layers: naiadLayers, beat: 'pours' },
  unicorn: { w: UNICORN_W, h: UNICORN_H, layers: unicornLayers, beat: 'dips-horn' },
  pan: { w: PAN_W, h: PAN_H, layers: panLayers, beat: 'pipes' },
};

/** Every pose this creature has art for, in a stable order. */
export function creaturePoses(id) {
  const spec = SPECS[id];
  if (!spec) return [];
  return ['idle', 'walk', 'beat', ...Object.keys(spec.extra || {})];
}

export const FACINGS = Object.freeze(['se', 'sw', 'ne', 'nw']);
const BACK_FACING = { se: false, sw: false, ne: true, nw: true };
const MIRROR_FACING = { se: false, sw: true, ne: false, nw: true };

/**
 * Irregular holds, in milliseconds. RESEARCH §A8: the illusion of life comes
 * from uneven timing, not from frame count. A long settle then two quick
 * breaths reads as a living thing; four equal frames reads as a metronome.
 */
export const HOLDS = Object.freeze({
  idle: Object.freeze([520, 180, 300, 220]),
  walk: Object.freeze([150, 130, 150, 130]),
  beat: Object.freeze([360, 200, 420, 240]),
  /**
   * Piping is eight frames and nearly three seconds round. It has to be: he
   * does this for three minutes, and anything that scans as a loop inside the
   * first ten seconds will scan as a stuck sprite for the remaining hundred and
   * seventy. The long holds are the two where he is only breathing; the short
   * ones carry the notes, which need to move steadily or they read as blinking
   * rather than rising.
   */
  pipe: Object.freeze([300, 340, 300, 380, 300, 340, 300, 420]),
  /**
   * Drinking is a gesture with a shape — raise, tip, hold, hold, lower, done —
   * so the holds are not a cycle. `drinkFrameAt` walks it ONCE and clamps on
   * the last frame; these are the segment lengths of that single pass and they
   * sum to 3.1 s, the floor of the owner's 3-5 s.
   */
  drink: Object.freeze([420, 380, 700, 620, 480, 500]),
});

function buildFrames(id) {
  const spec = SPECS[id];
  const anchor = [spec.w >> 1, spec.h - 1];
  const out = { idle: {}, walk: {}, beat: [] };

  for (let i = 0; i < 4; i++) {
    out.beat.push(
      defineSprite({
        name: `${id}-${spec.beat}-${i}`,
        anchor,
        rows: composeRows(spec.w, spec.h, spec.layers('beat', i, false)),
        tags: ['creature', id, 'beat', spec.beat],
      })
    );
  }

  // The extra poses. Each may stand on a bigger canvas than the creature's
  // base size; the anchor moves with it so the hooves land in the same place.
  for (const [pose, cfg] of Object.entries(spec.extra || {})) {
    const [gw, gh] = cfg.grow || [0, 0];
    const w = spec.w + gw;
    const h = spec.h + gh;
    const ox = gw >> 1;
    const oy = gh;
    const poseAnchor = [(spec.w >> 1) + ox, h - 1];
    out[pose] = [];
    for (let i = 0; i < cfg.frames; i++) {
      out[pose].push(
        defineSprite({
          name: `${id}-${pose}-${i}`,
          anchor: poseAnchor,
          rows: composeRows(w, h, spec.layers(pose, i, false), ox, oy),
          tags: ['creature', id, pose],
        })
      );
    }
  }

  // WALK AND IDLE BOTH TURN, and they are built by the same loop because they
  // are the same problem.
  //
  // A creature that stops does not stop FACING anywhere — `this.facing` is
  // written by `_leg` (creatures.js) and js/main.js already resolves it to one
  // of these four names and hands it to `creatureFrameAt` for EVERY pose. Idle
  // was the only cycle that threw it away, so a creature that walked north-west
  // and halted snapped round to face the camera, every time, at the end of
  // every leg.
  //
  // That reads as a shrug on a random amble. It reads as a REFUSAL the moment
  // the creature had a reason to go there: it walks to the thing, turns to look
  // at it, and then pointedly turns away. Anything built on top of "the
  // creature is looking at that" needs this first or it says the opposite of
  // what it means.
  //
  // No new art. `spec.layers(kind, i, back)` already takes the back flag for
  // every kind, and `mirrorRelit` already re-lights a mirrored frame so the
  // light stays upper-left (SPEC §3) — the two tables below are the whole of
  // the turn, and they were already written for walking.
  for (const kind of ['idle', 'walk']) {
    for (const facing of FACINGS) {
      out[kind][facing] = [];
      for (let i = 0; i < 4; i++) {
        let rows = composeRows(spec.w, spec.h, spec.layers(kind, i, BACK_FACING[facing]));
        if (MIRROR_FACING[facing]) rows = mirrorRelit(rows);
        out[kind][facing].push(
          defineSprite({
            name: `${id}-${kind}-${facing}-${i}`,
            anchor,
            rows,
            tags: ['creature', id, kind, facing],
          })
        );
      }
    }
  }
  return out;
}

/** Every frame of every creature, built once at module load. */
export const CREATURE_ART = Object.freeze(
  Object.fromEntries(
    Object.keys(SPECS).map((id) => {
      const spec = SPECS[id];
      return [
        id,
        Object.freeze({
          id,
          w: spec.w,
          h: spec.h,
          anchor: Object.freeze([spec.w >> 1, spec.h - 1]),
          beat: spec.beat,
          frames: buildFrames(id),
          holds: HOLDS,
        }),
      ];
    })
  )
);

export const CREATURE_IDS = Object.freeze(Object.keys(SPECS));

/**
 * One frame. `anim` is 'idle' | 'walk' | 'beat' | any pose in the creature's
 * `extra`. `facing` is ignored for everything but walk — the rest are authored
 * front-facing only, as period games did.
 */
export function creatureFrame(id, anim = 'idle', facing = 'se', i = 0) {
  const art = CREATURE_ART[id];
  if (!art) throw new Error(`creatureFrame: no creature '${id}'`);
  // A pose is EITHER a flat cycle or a set of four turned ones, and which it is
  // belongs to the pose rather than to a list of names here. Naming 'walk'
  // explicitly is what kept idle flat when idle grew facings — the caller was
  // already passing the right one and this line dropped it on the floor.
  const raw = art.frames[anim];
  const set = Array.isArray(raw) ? raw : raw && (raw[facing] || raw.se);
  if (!set) throw new Error(`creatureFrame: no animation '${anim}' for '${id}'`);
  return set[((i % set.length) + set.length) % set.length];
}

/** Does this creature have art for this pose? Cheap enough to call per frame. */
export function hasPose(id, pose) {
  const art = CREATURE_ART[id];
  if (!art) return false;
  return pose === 'walk' ? !!art.frames.walk : !!art.frames[pose];
}

/** True if the pose is a one-shot gesture rather than a cycle. */
export function poseIsOnce(id, pose) {
  const spec = SPECS[id];
  return !!(spec && spec.extra && spec.extra[pose] && spec.extra[pose].once);
}

/**
 * Pick a frame from elapsed milliseconds, honouring the irregular holds.
 *
 * A CYCLE wraps. A one-shot (`once`) is played from the time elapsed *in the
 * pose* and clamps on its last frame — so a satyr who finishes drinking before
 * the behaviour layer takes the pose away stands there holding an empty cup,
 * which is right, instead of raising a fresh one every 3.1 seconds forever.
 */
export function creatureFrameAt(id, anim, facing, ms, once = false) {
  const holds = HOLDS[anim] || HOLDS.idle;
  const total = holds.reduce((a, b) => a + b, 0);
  let t;
  if (once) {
    t = Math.max(0, ms);
    if (t >= total) return creatureFrame(id, anim, facing, holds.length - 1);
  } else {
    t = ((ms % total) + total) % total;
  }
  let i = 0;
  while (i < holds.length - 1 && t >= holds[i]) {
    t -= holds[i];
    i++;
  }
  return creatureFrame(id, anim, facing, i);
}

/** Flat list — for the sprite lab and the lint pass. */
export function allCreatureSprites() {
  const out = [];
  // SHAPE-AGNOSTIC, and it has to be: this named `idle` and `beat` as flat
  // cycles and `walk` as the turned one, so the day idle grew facings the lint
  // pass stopped being able to iterate it — and the lint pass is the ONLY
  // consumer that sees every frame. A census that knows the shape of what it is
  // counting stops counting the moment the shape changes.
  for (const id of CREATURE_IDS) {
    for (const set of Object.values(CREATURE_ART[id].frames)) {
      if (Array.isArray(set)) out.push(...set);
      else for (const facing of FACINGS) if (set[facing]) out.push(...set[facing]);
    }
  }
  return out;
}

/**
 * A contact shadow to lay under a creature before it is drawn. Authored in
 * grass index 0 — the caller may re-key it to whatever ground it stands on
 * with `contactShadow(groundKey)` from palette.js. Never translucent black.
 */
export const CREATURE_SHADOWS = Object.freeze({
  satyr: defineSprite({
    name: 'shadow-satyr',
    anchor: [7, 2],
    rows: ['..mmmmm..', '.mmmmmmm.', '..mmmmm..'],
  }),
  naiad: defineSprite({
    name: 'shadow-naiad',
    anchor: [6, 2],
    rows: ['..mmmm..', '.mmmmmm.', '..mmmm..'],
  }),
  pan: defineSprite({
    name: 'shadow-pan',
    anchor: [8, 2],
    rows: ['..mmmmmmm..', '.mmmmmmmmm.', '..mmmmmmm..'],
  }),
  centaur: defineSprite({
    name: 'shadow-centaur',
    anchor: [13, 2],
    rows: ['...mmmmmmmmmmmmm...', '.mmmmmmmmmmmmmmmmm.', '...mmmmmmmmmmmmm...'],
  }),
  unicorn: defineSprite({
    name: 'shadow-unicorn',
    anchor: [12, 2],
    rows: ['...mmmmmmmmmmm...', '.mmmmmmmmmmmmmmm.', '...mmmmmmmmmmm...'],
  }),
});
