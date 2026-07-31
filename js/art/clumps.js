// clumps.js — the atoms of every plant in Arcadia.
//
// Period isometric trees are not drawn leaf by leaf. They are drawn as a small
// number of overlapping rounded MASSES, each 8-20px across, of unequal size,
// with a dark core and rim-light on the upper-left of each mass. See
// docs/RESEARCH.md §A.6 — "the cauliflower clump method".
//
// This file is the hand-authored half of that. Each clump below is a stamp:
// a silhouette with a default internal value structure. js/art/grow.js stamps
// them into a buffer from a seed and then re-shades the whole composition, so
// what these rows really contribute is SHAPE. Shape is what the research says
// matters at 32-64px; the shading is arithmetic and belongs in the composer.
//
// AUTHORING CONVENTION — read before adding a clump.
//
//  * Foliage clumps are authored in the CANOPY keys 'abcde' (dark -> light)
//    regardless of the plant they will end up in. grow.js remaps that 0..4
//    index onto whichever ramp the species wants (olive, cypress, grass...),
//    proportionally, so one authored shape serves an oak and a scrub bush.
//    Author against canopy; never hardcode 'f' or 'j' in a leaf.
//
//  * Clumps that are NOT foliage — a cattail head, a grape bunch, a flower —
//    are authored in their real keys and tagged 'raw'. grow.js draws those
//    straight through, above the foliage, untouched by the shading pass.
//
//  * `anchor` on a clump is its STAMP CENTRE, not a ground contact point. The
//    composer positions clumps by centre. For hanging things (willow sprays)
//    the anchor sits at the top, where the strand attaches.
//
//  * Light is upper-left, always. 'd'/'e' on the upper-left arc, 'b'/'a' on the
//    lower-right. Even though grow.js re-lights, a clump that reads correctly
//    on its own in the sprite lab is a clump you can debug.
//
//  * Keep outlines CHUNKY. Single stray pixels dissolve at 1x and shimmer when
//    the camera pans; grow.js prunes them, but do not author them.

import { defineSprite } from './format.js';

/* ------------------------------------------------------------------ *
 * BROADLEAF — three sizes plus one deliberately lopsided variant.
 * These build oaks, planes, poplars, willows, shrubs. The size spread is
 * the cure for "broccoli": clump radius must vary by roughly 2x within
 * one canopy, so the composer needs genuinely different stamps to pick.
 * ------------------------------------------------------------------ */

export const leafSmall = defineSprite({
  name: 'clump.leafSmall',
  anchor: [4, 3],
  tags: ['foliage', 'broadleaf'],
  rows: [
    '..ccc....',
    '.ddcccb..',
    'dddccccb.',
    '.dccccbb.',
    '..ccccbb.',
    '...cbbb..',
    '....bb...',
  ],
});

export const leafMed = defineSprite({
  name: 'clump.leafMed',
  anchor: [6, 4],
  tags: ['foliage', 'broadleaf'],
  rows: [
    '....cccc.....',
    '..ddccccbb...',
    '.dddcccccb...',
    'dddccccccbb..',
    '.ddcccccccbb.',
    '.dccccccccbb.',
    '..cccccccbbb.',
    '..ccccccbbb..',
    '...cccbbbb...',
    '.....cbb.....',
  ],
});

export const leafLarge = defineSprite({
  name: 'clump.leafLarge',
  anchor: [9, 6],
  tags: ['foliage', 'broadleaf'],
  rows: [
    '......ccccc.......',
    '...ddcccccccb.....',
    '..dddcccccccbb....',
    '.ddddccccccccbb...',
    'ddddcccccccccbb...',
    '.dddccccccccccbb..',
    '.ddcccccccccccbb..',
    '..dcccccccccccbbb.',
    '..ccccccccccccbbb.',
    '...cccccccccccbbb.',
    '...ccccccccccbbb..',
    '....ccccccccbbb...',
    '......cccccbb.....',
  ],
});

// Asymmetric on purpose. A canopy assembled only from radially symmetric
// stamps reads as clip-art no matter how it is shaded.
export const leafLopsided = defineSprite({
  name: 'clump.leafLopsided',
  anchor: [7, 5],
  tags: ['foliage', 'broadleaf'],
  rows: [
    '.....cccc......',
    '...ddccccbb....',
    '.dddccccccb....',
    'ddddcccccccbb..',
    '.dddccccccccbb.',
    '..ddcccccccccb.',
    '...ccccccccccb.',
    '...cccccccccbb.',
    '....ccccccbbb..',
    '......cccbb....',
  ],
});

/* ------------------------------------------------------------------ *
 * CONIFER — a drooping spray, a flat umbrella-pine plate, a small tuft.
 * Cypress and stone pine are the two silhouettes the garden needs and they
 * could hardly be less alike: a narrow vertical flame against a bare trunk
 * carrying a flat horizontal table. Different stamps, not one recoloured.
 * ------------------------------------------------------------------ */

export const conSpray = defineSprite({
  name: 'clump.conSpray',
  anchor: [3, 5],
  tags: ['foliage', 'conifer'],
  rows: [
    '...c...',
    '..dcb..',
    '..dcb..',
    '.ddccb.',
    '.dcccb.',
    '.dcccbb',
    '.dcccb.',
    '..dccb.',
    '..dccb.',
    '...cb..',
    '...b...',
  ],
});

// The umbrella pine's signature: a plate far wider than it is tall, ragged
// at both ends, stacked two or three deep at slightly different heights.
export const conFan = defineSprite({
  name: 'clump.conFan',
  anchor: [8, 3],
  tags: ['foliage', 'conifer'],
  rows: [
    '.....dcccc.......',
    '..dddcccccccb....',
    '.ddcccccccccbbb..',
    'dddcccccccccbbbbb',
    '.dccccccccccbbb..',
    '...ccccccbb......',
  ],
});

export const conTuft = defineSprite({
  name: 'clump.conTuft',
  anchor: [3, 2],
  tags: ['foliage', 'conifer'],
  rows: [
    '..cc..',
    '.dccb.',
    'dcccbb',
    '.dccb.',
    '..cb..',
  ],
});

/* ------------------------------------------------------------------ *
 * OLIVE AND SCRUB — the gaps are the point.
 * An olive is not a small oak. It is sparse: you see through it to sky and
 * to its own branches. These stamps are authored with holes already in them
 * so a canopy assembled from them cannot seal into a green blob.
 * ------------------------------------------------------------------ */

export const oliveTuft = defineSprite({
  name: 'clump.oliveTuft',
  anchor: [6, 4],
  tags: ['foliage', 'olive'],
  rows: [
    '...cc...cc..',
    '..dccb.dcc..',
    '.dcccb.dccb.',
    'dccccbb.ccb.',
    '.cccbb..cbb.',
    '..ccb..ccb..',
    '...cb.dcb...',
    '....b..b....',
  ],
});

export const scrubTuft = defineSprite({
  name: 'clump.scrubTuft',
  anchor: [4, 3],
  tags: ['foliage', 'olive', 'scrub'],
  rows: [
    '..cc.c..',
    '.dccbcb.',
    'dcccbccb',
    '.ccbb.cb',
    '..cb..b.',
    '...b....',
  ],
});

/* ------------------------------------------------------------------ *
 * GROUND COVER — grass tufts and single blades.
 * Remapped onto the grass ramp by the composer, so these are the meadow,
 * the greensward and the base of every flower patch.
 * ------------------------------------------------------------------ */

export const grassTuft = defineSprite({
  name: 'clump.grassTuft',
  anchor: [4, 5],
  tags: ['foliage', 'ground'],
  rows: [
    '...d.c...',
    '..dc.cb..',
    '.dcc.ccb.',
    '.dcccccb.',
    '..ccccb..',
    '...ccb...',
  ],
});

export const grassBlade = defineSprite({
  name: 'clump.grassBlade',
  anchor: [2, 7],
  tags: ['foliage', 'ground'],
  rows: [
    '..d..',
    '..d..',
    '.dc..',
    '.dc.b',
    '.dc.b',
    '.ccb.',
    '.ccb.',
    '..cb.',
  ],
});

/* ------------------------------------------------------------------ *
 * REEDS — the naiad margin. A blade is tall, narrow and arced; the cattail
 * head is authored in the earth ramp and drawn raw, above the foliage.
 * ------------------------------------------------------------------ */

export const reedBlade = defineSprite({
  name: 'clump.reedBlade',
  anchor: [2, 15],
  tags: ['foliage', 'reed'],
  rows: [
    '....d',
    '...dc',
    '...dc',
    '..dc.',
    '..dc.',
    '..dc.',
    '.dcb.',
    '.dcb.',
    '.dcb.',
    '.dcb.',
    '.dcb.',
    '.ccb.',
    '.ccb.',
    '.ccb.',
    '.ccb.',
    '..cb.',
  ],
});

export const reedHead = defineSprite({
  name: 'clump.reedHead',
  anchor: [1, 7],
  tags: ['raw', 'reed'],
  rows: ['.t.', '.s.', 'tsr', 'tsr', 'tsr', 'tsr', '.sr', '.q.'],
});

/* ------------------------------------------------------------------ *
 * FLOWER HEADS — accents, drawn raw. The palette permits these to sing;
 * everything else in the game is desaturated, which is exactly why a
 * five-pixel bloom reads from across the map.
 * ------------------------------------------------------------------ */

export const flowerWhite = defineSprite({
  name: 'clump.flowerWhite',
  anchor: [2, 2],
  tags: ['raw', 'flower', 'white'],
  rows: ['..7..', '.777.', '77577', '.777.', '..7..'],
});

export const flowerRed = defineSprite({
  name: 'clump.flowerRed',
  anchor: [2, 2],
  tags: ['raw', 'flower', 'red'],
  rows: ['.33..', '3252.', '.211.', '..1..'],
});

export const flowerYellow = defineSprite({
  name: 'clump.flowerYellow',
  anchor: [2, 2],
  tags: ['raw', 'flower', 'yellow'],
  rows: ['.55..', '55V5.', '.VV..', '..V..'],
});

export const flowerIris = defineSprite({
  name: 'clump.flowerIris',
  anchor: [2, 2],
  tags: ['raw', 'flower', 'iris'],
  // The two upright standards must touch the body. An earlier version had them
  // free-floating a pixel clear, which is a stray pixel: it dissolves at 1x and
  // shimmers when the camera pans.
  rows: ['.4.4.', '44444', '.444.', '..4..', '..a..', '..a..'],
});

// Lace/umbel — cow parsley, yarrow, the millefleurs filler.
export const flowerUmbel = defineSprite({
  name: 'clump.flowerUmbel',
  anchor: [3, 1],
  tags: ['raw', 'flower', 'white'],
  rows: ['.7.7.7.', '7777777', '.7.7.7.', '...c...'],
});

/* ------------------------------------------------------------------ *
 * FERNS — the shade floor of the grotto and the wet north slope.
 * Serrated lower edge, arching spine; mirrored freely by the composer,
 * which re-lights afterwards (mirroring alone would flip the light).
 * ------------------------------------------------------------------ */

export const fernFrond = defineSprite({
  name: 'clump.fernFrond',
  anchor: [2, 8],
  tags: ['foliage', 'fern'],
  rows: [
    '..........dcc.',
    '........ddccc.',
    '......dddccc..',
    '...dddcccbb...',
    'ddddccccbb....',
    '.dcc.ccbb.....',
    '..c.ccb.......',
    '..ccbb........',
    '..bb..........',
  ],
});

export const fernSmall = defineSprite({
  name: 'clump.fernSmall',
  anchor: [1, 5],
  tags: ['foliage', 'fern'],
  rows: ['.....dc.', '...ddcc.', '.dddccb.', 'ddccccb.', '.ccbb...', '.b......'],
});

/* ------------------------------------------------------------------ *
 * IVY AND VINE — the Dionysiac pair. Ivy drapes rock and ground; the wild
 * untrellised vine climbs. RESEARCH §B.1: no vine, no satyrs.
 * ------------------------------------------------------------------ */

export const ivyLeaf = defineSprite({
  name: 'clump.ivyLeaf',
  anchor: [2, 2],
  tags: ['foliage', 'ivy'],
  rows: ['d.d..', 'ddcb.', 'dcccb', '.ccb.', '..b..'],
});

export const ivyLeafSmall = defineSprite({
  name: 'clump.ivyLeafSmall',
  anchor: [1, 1],
  tags: ['foliage', 'ivy'],
  rows: ['d.d', 'dcb', '.b.'],
});

export const vineLeaf = defineSprite({
  name: 'clump.vineLeaf',
  anchor: [3, 3],
  tags: ['foliage', 'vine'],
  rows: ['d.d.d..', 'ddcccb.', 'dccccbb', '.cccccb', '..cccb.', '...cb..'],
});

export const vineBunch = defineSprite({
  name: 'clump.vineBunch',
  anchor: [2, 3],
  tags: ['raw', 'vine', 'fruit'],
  rows: ['.44..', '4446.', '.4446', '.444.', '..46.', '..4..'],
});

/* ------------------------------------------------------------------ *
 * WILLOW — the strand tip. Anchored at the TOP, because it hangs.
 * ------------------------------------------------------------------ */

export const willowSpray = defineSprite({
  name: 'clump.willowSpray',
  anchor: [2, 0],
  tags: ['foliage', 'willow'],
  rows: ['.dc.', '.dc.', '.dcb', '.dcb', '.dcb', '..cb', '..cb', '..cb', '..c.', '..b.'],
});

/* ------------------------------------------------------------------ *
 * SEEDLING — the sprout stage of every tree in the game. Two cotyledons
 * and a stem. It is deliberately species-neutral: at 8px a baby oak and a
 * baby plane are the same object, and pretending otherwise is over-detail.
 * ------------------------------------------------------------------ */

export const seedling = defineSprite({
  name: 'clump.seedling',
  anchor: [3, 7],
  tags: ['foliage', 'sprout'],
  rows: ['.d...c.', 'dcc.ccb', '.dc.cb.', '...c...', '...c...', '...c...', '...c...', '...q...'],
});

/* ================================================================== *
 * NAMED-SPECIES STAMPS
 *
 * Everything above builds the generic vocabulary: a leaf, a needle, a
 * flower. Everything below exists because ONE named plant in the
 * catalogue could not be told apart from its neighbours without it.
 *
 * The test is always the same and it is the one the research sets: at
 * 32-64px a species is its SILHOUETTE. A recoloured leafMed is not a fig
 * and never will be. So a plant gets a stamp of its own exactly when its
 * identity is a shape — the fig's hand, the acanthus's cut lobes, the
 * lavender's vertical grain — and gets no stamp at all when its identity
 * is proportion, which the composer profile already carries.
 * ================================================================== */

/* ------------------------------------------------------------------ *
 * BIG LOBED LEAVES — fig.
 * A fig crown is four or five leaves, not four hundred. At that count
 * the leaf itself has to read, so the notches are 1-2px wide and cut
 * three rows deep: any shallower and the shading pass fills them.
 * ------------------------------------------------------------------ */

export const figLeaf = defineSprite({
  name: 'clump.figLeaf',
  anchor: [8, 5],
  tags: ['foliage', 'lobed', 'fig'],
  rows: [
    '.......ccc......',
    '..cc...ccc..cc..',
    '.dccc..ccc..ccb.',
    '.dcccc.ccc.cccb.',
    '.ddcccccccccccb.',
    '..dcccccccccbb..',
    '...dccccccccb...',
    '....cccccccb....',
    '.....ccccbb.....',
    '......ccb.......',
    '......cb........',
  ],
});

export const figLeafSmall = defineSprite({
  name: 'clump.figLeafSmall',
  anchor: [5, 4],
  tags: ['foliage', 'lobed', 'fig'],
  rows: [
    '....cc....',
    '.cc.cc.cc.',
    'dcc.cc.ccb',
    '.dcccccbb.',
    '..dcccbb..',
    '...ccb....',
    '...cb.....',
  ],
});

/* ------------------------------------------------------------------ *
 * ACANTHUS — the plant on the Corinthian capital, so the lobes are the
 * whole joke and they have to survive to 1x.
 *
 * Three stamps, not one: upright, and a side leaf that flipX turns into
 * its mirror. Six orientations out of three shapes is a rosette; a
 * single stamp repeated is a starfish.
 *
 * ANCHOR IS THE LEAF BASE, not its centre — the composer fans these out
 * of one crown point, which only works if they all pivot on their stalk.
 * ------------------------------------------------------------------ */

// A LOBE IS A NOTCH IN THE OUTLINE, not a hole in the middle. The first
// version of these three cut the sinuses into the interior and every one
// of them rendered as a smooth pointed blade — the shading pass simply
// filled them. What reads is the silhouette sawing in and out by 2px
// every other row, with the crease pixel dropped to index 0.
export const acanthusUp = defineSprite({
  name: 'clump.acanthusUp',
  anchor: [6, 15],
  tags: ['foliage', 'acanthus', 'base-anchor'],
  rows: [
    '.....dcb.....',
    '....ddccb....',
    '..ddcccccbb..',
    '...adcccba...',
    '....adcba....',
    '..ddcccccbb..',
    '.ddcccccccbb.',
    '...adcccba...',
    '.ddcccccccbb.',
    'ddcccccccccbb',
    '..adcccccba..',
    'ddcccccccccbb',
    'ddcccccccccbb',
    '..dcccccccb..',
    '...dcccccb...',
    '....dcccb....',
  ],
});

export const acanthusSide = defineSprite({
  name: 'clump.acanthusSide',
  anchor: [1, 9],
  tags: ['foliage', 'acanthus', 'base-anchor'],
  rows: [
    '...........dccb',
    '.........dcccb.',
    '........adccb..',
    '......dccccb...',
    '.....adcccb....',
    '...dcccccb.....',
    '..adccccb......',
    '.dcccccb.......',
    'adcccb.........',
    'dccb...........',
  ],
});

export const acanthusLow = defineSprite({
  name: 'clump.acanthusLow',
  anchor: [1, 5],
  tags: ['foliage', 'acanthus', 'base-anchor'],
  rows: [
    '...........dccb',
    '........dccccb.',
    '......adcccb...',
    '...dcccccb.....',
    '.adccb.........',
    'dccb...........',
  ],
});

/** The hooded spike, raw. White hood, purple bract — that is the plant. */
export const acanthusSpike = defineSprite({
  name: 'clump.acanthusSpike',
  anchor: [2, 21],
  tags: ['raw', 'flower', 'acanthus', 'base-anchor'],
  rows: [
    '..7..',
    '.747.',
    '..4..',
    '.747.',
    '..4..',
    '.747.',
    '..4..',
    '.747.',
    '..4..',
    '.747.',
    '..4..',
    '.747.',
    '..4..',
    '..4..',
    '..g..',
    '..g..',
    '..g..',
    '..g..',
    '..g..',
    '..g..',
    '..f..',
    '..f..',
  ],
});

/* ------------------------------------------------------------------ *
 * NEEDLE SPRIGS — lavender and rosemary.
 * These are the reason those two stop reading as small green bushes.
 * The grain is VERTICAL: narrow columns with a ragged side, stacked, so
 * a hummock of them has combed texture instead of curd. Authored in
 * canopy keys as usual; both plants remap onto the olive ramp.
 * ANCHOR IS THE BASE — they stand, they do not float.
 * ------------------------------------------------------------------ */

export const needleSprig = defineSprite({
  name: 'clump.needleSprig',
  anchor: [2, 10],
  tags: ['foliage', 'needle', 'base-anchor'],
  rows: ['..cc.', '.dccb', '.dcc.', 'cdccb', 'cdcc.', '.dccc', '.dccc', '.dcc.', '..cc.', '..cb.', '..b..'],
});

export const needleSprigShort = defineSprite({
  name: 'clump.needleSprigShort',
  anchor: [2, 6],
  tags: ['foliage', 'needle', 'base-anchor'],
  rows: ['..cc.', '.dccb', '.dcc.', '.dccb', '.dcc.', '..cc.', '..cb.'],
});

/** Lavender's July crown: a violet spike on a bare grey stalk. Raw. */
export const lavenderSpike = defineSprite({
  name: 'clump.lavenderSpike',
  anchor: [1, 9],
  tags: ['raw', 'flower', 'iris'],
  rows: ['.4.', '444', '.4.', '444', '.4.', '.4.', '.g.', '.g.', '.g.', '.f.'],
});

/** Rosemary in January — three pixels of pale blue, and the only place
 *  in the game the sky ramp is used as a colour rather than as sky. */
export const rosemaryFlower = defineSprite({
  name: 'clump.rosemaryFlower',
  anchor: [1, 1],
  tags: ['raw', 'flower', 'blue'],
  rows: ['.L.', 'LML'],
});

/* ------------------------------------------------------------------ *
 * SMALL DENSE LEAVES — box, myrtle.
 * Box grows two inches a year and is clipped; its identity is that the
 * texture is FINER than everything around it. A 5x4 stamp repeated
 * forty times is fine texture. There is no clever way to fake this.
 * ------------------------------------------------------------------ */

export const boxLeaf = defineSprite({
  name: 'clump.boxLeaf',
  anchor: [2, 1],
  tags: ['foliage', 'box'],
  rows: ['.dcc.', 'dcccb', 'dcccb', '.ccb.'],
});

/* ------------------------------------------------------------------ *
 * LANCEOLATE SPRAY — bay laurel and oleander.
 * Two narrow blades off a common base. Long and pointed reads as
 * "leathery evergreen" the way a round clump never does.
 * ------------------------------------------------------------------ */

export const lanceLeaf = defineSprite({
  name: 'clump.lanceLeaf',
  anchor: [4, 5],
  tags: ['foliage', 'lance'],
  rows: [
    '..d....c.',
    '..dc..cc.',
    '.ddc..ccb',
    '.dcc.ccb.',
    '.dcc.ccb.',
    '..cc.cbb.',
    '..ccccb..',
    '...ccb...',
    '...cb....',
  ],
});

/* ------------------------------------------------------------------ *
 * TREFOIL — wild strawberry. Three toothed leaflets on one stalk; the
 * two notches are the whole plant.
 * ------------------------------------------------------------------ */

export const trefoil = defineSprite({
  name: 'clump.trefoil',
  anchor: [4, 3],
  tags: ['foliage', 'trefoil'],
  rows: ['.dc.c.cb.', 'dcccccccb', 'dcccccccb', '.ccc.ccb.', '..cc.cb..', '...ccb...'],
});

/* ------------------------------------------------------------------ *
 * MOSS — the fallen trunk, and any wet north face later.
 * Flat, lumpy, wider than tall: a mat, not a bush.
 * ------------------------------------------------------------------ */

export const mossPatch = defineSprite({
  name: 'clump.mossPatch',
  anchor: [5, 2],
  tags: ['foliage', 'moss'],
  rows: ['..ccc.cc...', '.dcccccccb.', 'dcccccccccb', '.ccbbccbb..'],
});

export const mossSmall = defineSprite({
  name: 'clump.mossSmall',
  anchor: [3, 1],
  tags: ['foliage', 'moss'],
  rows: ['.cc.cc.', 'dcccccb', '.ccbcb.'],
});

/* ------------------------------------------------------------------ *
 * BARE THORN TWIG — blackthorn, hawthorn, rose.
 * Earth keys, so grow.js drops it straight into the wood layer BEHIND
 * the leaves. Blackthorn flowers on bare wood; without visible thorn
 * you have a white bush and the whole point is gone.
 * ------------------------------------------------------------------ */

export const thornTwig = defineSprite({
  name: 'clump.thornTwig',
  anchor: [3, 8],
  tags: ['raw', 'wood', 'twig'],
  rows: ['....q..', '...qr..', '..q.r..', '..qqr..', '...qr..', '.q.qr..', '.qqr...', '..qr...', '..q....'],
});

/* ------------------------------------------------------------------ *
 * BLOSSOM AND FRUIT — the accents that finish a named plant.
 * All raw, all drawn over the foliage, all deliberately tiny: five
 * saturated pixels is the loudest thing on the map.
 * ------------------------------------------------------------------ */

/** Blackthorn / hawthorn / myrtle — white on a yellow eye. */
export const blossomWhite = defineSprite({
  name: 'clump.blossomWhite',
  anchor: [2, 1],
  tags: ['raw', 'flower', 'white'],
  rows: ['.7.7.', '7757.', '.777.', '..7..'],
});

/** Almond, weeks before anything else wakes up: pale pink, not white. */
export const blossomPink = defineSprite({
  name: 'clump.blossomPink',
  anchor: [2, 1],
  tags: ['raw', 'flower', 'pink'],
  rows: ['.7.3.', '7737.', '.377.', '..3..'],
});

export const roseBloom = defineSprite({
  name: 'clump.roseBloom',
  anchor: [2, 1],
  tags: ['raw', 'flower', 'rose'],
  rows: ['.22..', '2123.', '.221.', '..2..'],
});

export const oleanderBloom = defineSprite({
  name: 'clump.oleanderBloom',
  anchor: [2, 1],
  tags: ['raw', 'flower', 'pink'],
  rows: ['.33..', '3532.', '.332.', '..3..'],
});

/** Scarlet tissue paper on a hairy stem. The stem is canopy index 0 so
 *  it darkens into whatever ramp the patch is drawn on. */
export const poppyHead = defineSprite({
  name: 'clump.poppyHead',
  anchor: [2, 6],
  tags: ['raw', 'flower', 'red', 'base-anchor'],
  rows: ['.22..', '2262.', '.121.', '..a..', '..a..', '..a..', '..a..'],
});

export const crocusCup = defineSprite({
  name: 'clump.crocusCup',
  anchor: [2, 5],
  tags: ['raw', 'flower', 'iris', 'base-anchor'],
  rows: ['.4.4.', '.454.', '.444.', '..4..', '..a..', '..a..'],
});

export const crocusGold = defineSprite({
  name: 'clump.crocusGold',
  anchor: [2, 5],
  tags: ['raw', 'flower', 'yellow', 'base-anchor'],
  rows: ['.5.5.', '.5V5.', '.555.', '..V..', '..a..', '..a..'],
});

export const berryRed = defineSprite({
  name: 'clump.berryRed',
  anchor: [1, 1],
  tags: ['raw', 'fruit', 'red'],
  rows: ['.3.', '221', '.1.'],
});

export const appleFruit = defineSprite({
  name: 'clump.appleFruit',
  anchor: [1, 1],
  tags: ['raw', 'fruit', 'red'],
  rows: ['.32.', '2221', '.11.'],
});

export const figFruit = defineSprite({
  name: 'clump.figFruit',
  anchor: [1, 1],
  tags: ['raw', 'fruit'],
  rows: ['.4.', 'a4a', '.a.'],
});

/* ------------------------------------------------------------------ *
 * ASPHODEL — the flower of the dead, and the one plant in the garden
 * whose blooms are drawn in MARBLE rather than in an accent. That is
 * deliberate: it stands beside the tombs, and a bone-pale spire reads
 * as kin to the stelae instead of as another wildflower.
 * ------------------------------------------------------------------ */

export const asphodelSpire = defineSprite({
  name: 'clump.asphodelSpire',
  anchor: [2, 24],
  tags: ['raw', 'flower', 'pale', 'base-anchor'],
  rows: [
    '..7..',
    '.7D7.',
    '..D..',
    '.7D7.',
    '..D..',
    '.7D7.',
    '..D..',
    '.7D7.',
    '..D..',
    '.7D7.',
    '..D..',
    '.7D7.',
    '..D..',
    '.7D7.',
    '..D..',
    '..D..',
    '..C..',
    '..C..',
    '..C..',
    '..C..',
    '..C..',
    '..B..',
    '..B..',
    '..B..',
    '..A..',
  ],
});

export const asphodelSpireShort = defineSprite({
  name: 'clump.asphodelSpireShort',
  anchor: [2, 13],
  tags: ['raw', 'flower', 'pale', 'base-anchor'],
  rows: ['..7..', '.7D7.', '..D..', '.7D7.', '..D..', '.7D7.', '..D..', '..C..', '..C..', '..C..', '..C..', '..B..', '..B..', '..A..'],
});

/** The strap leaf under it — arched, flat, and lying half on the ground. */
export const strapLeaf = defineSprite({
  name: 'clump.strapLeaf',
  anchor: [1, 11],
  tags: ['foliage', 'strap', 'base-anchor'],
  rows: [
    '....dc',
    '...dcc',
    '...dcc',
    '..dcc.',
    '..dcc.',
    '.dcc..',
    '.dcb..',
    '.dcb..',
    '.ccb..',
    '.ccb..',
    '.ccb..',
    '.cb...',
  ],
});

/* ------------------------------------------------------------------ */

/** Every clump, by short name — the composer's stamp library. */
export const CLUMPS = {
  leafSmall,
  leafMed,
  leafLarge,
  leafLopsided,
  conSpray,
  conFan,
  conTuft,
  oliveTuft,
  scrubTuft,
  grassTuft,
  grassBlade,
  reedBlade,
  reedHead,
  flowerWhite,
  flowerRed,
  flowerYellow,
  flowerIris,
  flowerUmbel,
  fernFrond,
  fernSmall,
  ivyLeaf,
  ivyLeafSmall,
  vineLeaf,
  vineBunch,
  willowSpray,
  seedling,
  // named-species stamps
  figLeaf,
  figLeafSmall,
  acanthusUp,
  acanthusSide,
  acanthusLow,
  acanthusSpike,
  needleSprig,
  needleSprigShort,
  lavenderSpike,
  rosemaryFlower,
  boxLeaf,
  lanceLeaf,
  trefoil,
  mossPatch,
  mossSmall,
  thornTwig,
  blossomWhite,
  blossomPink,
  roseBloom,
  oleanderBloom,
  poppyHead,
  crocusCup,
  crocusGold,
  berryRed,
  appleFruit,
  figFruit,
  asphodelSpire,
  asphodelSpireShort,
  strapLeaf,
};

/** Grouping for the sprite lab, so a reviewer sees related stamps together. */
export const CLUMP_GROUPS = {
  broadleaf: ['leafSmall', 'leafMed', 'leafLarge', 'leafLopsided'],
  conifer: ['conSpray', 'conFan', 'conTuft'],
  olive: ['oliveTuft', 'scrubTuft'],
  ground: ['grassTuft', 'grassBlade'],
  reed: ['reedBlade', 'reedHead'],
  flower: ['flowerWhite', 'flowerRed', 'flowerYellow', 'flowerIris', 'flowerUmbel'],
  fern: ['fernFrond', 'fernSmall'],
  climber: ['ivyLeaf', 'ivyLeafSmall', 'vineLeaf', 'vineBunch'],
  willow: ['willowSpray'],
  sprout: ['seedling'],
  lobed: ['figLeaf', 'figLeafSmall'],
  acanthus: ['acanthusUp', 'acanthusSide', 'acanthusLow', 'acanthusSpike'],
  needle: ['needleSprig', 'needleSprigShort', 'lavenderSpike', 'rosemaryFlower'],
  dense: ['boxLeaf', 'lanceLeaf', 'trefoil'],
  moss: ['mossPatch', 'mossSmall', 'thornTwig'],
  blossom: ['blossomWhite', 'blossomPink', 'roseBloom', 'oleanderBloom'],
  accent: ['poppyHead', 'crocusCup', 'crocusGold', 'berryRed', 'appleFruit', 'figFruit'],
  asphodel: ['asphodelSpire', 'asphodelSpireShort', 'strapLeaf'],
};

/** Size classes the composers ask for by name. */
export const BROADLEAF_BY_SIZE = {
  small: [leafSmall],
  medium: [leafMed, leafLopsided],
  large: [leafLarge],
};

/** True when a clump should bypass the foliage shading pass entirely. */
export function isRaw(clump) {
  return clump.tags.includes('raw');
}
