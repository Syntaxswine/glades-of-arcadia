// sprite-anchors.test.mjs — a sprite must stand on the ground it claims.
//
// This is `tools/anchor-audit.mjs` promoted to a `node --test` assertion. The
// tool is the report you read; this is the part that cannot be forgotten.
//
// ---------------------------------------------------------------------------
// THE GEOMETRY, because the number 8 in here is not arbitrary.
//
// A sprite's `anchor` is the pixel that lands on its footprint's CENTRE point
// (SPEC §2; js/iso.js `footprintCentreAt` puts it at tile tx+fw/2, ty+fh/2).
// The base diamond of an fw x fh object is (fw+fh)*32 px wide and (fw+fh)*16 px
// tall, so its FRONT vertex sits (fw+fh)*8 px BELOW the anchor.
//
// An object that visually occupies its footprint — a building, a plinth, a
// burial mound — must therefore have art reaching roughly that far below its
// anchor. If it does not, it hovers over the front half of its own plot: the
// near tiles of the footprint are drawn as bare ground with the object sitting
// behind them in mid-air. The taller the object the more obvious it is, which
// is why the heroon was spotted first and the tumulus — which was worse, at 27
// px short of 32 — was not: a grassy mound on grass hides its own shadow gap.
//
// ---------------------------------------------------------------------------
// THREE THINGS THIS COULD NOT SEE UNTIL 2026-08-01, EACH OF WHICH SHIPPED A BUG
//
// 1. IT COUNTED THE SHADOW AS PART OF THE OBJECT. A baked contact skirt is
//    drawn in 'm' and hangs BELOW the art, so a sprite could reach the ground
//    entirely by way of its own shade. Two entries flip verdict once that is
//    fixed: `fern-grotto` reads 17 px of reach with 'm' counted and 2 without
//    — fifteen of its seventeen pixels of "contact" ARE the shadow — and
//    `cypress-screen` 14 against 8. Both passed. Neither should have.
//
// 2. IT MEASURED THE SPRITE'S OWN FOOTPRINT, NOT THE PLOT IT IS PLACED ON.
//    `main.js` forwards the CATALOGUE's footprint to the renderer, and ten
//    catalogue entries — including `sleeping-satyr`, the first object in this
//    game — declare multi-tile ground for art that was drawn 1x1. Every one of
//    them was skipped here, because their sprite says 1x1 and 1x1 was skipped.
//
// 3. THE SINK ARM ONLY LOOKED AT MULTI-TILE SPRITES, so `still-pool` — a 1x1
//    prop whose shadow had wandered 12 rows below its anchor — was invisible
//    to it. A shadow can run away from a small object just as easily.
//
// ---------------------------------------------------------------------------
// WHY THE FLOAT ARM IS STILL MULTI-TILE ONLY.
//
// It does NOT apply to objects that merely STAND on a tile — a herm, a stele,
// an urn. A narrow post correctly occupies only the middle of its diamond, and
// demanding it reach the front vertex would be wrong. A MULTI-TILE FOOTPRINT IS
// ITSELF THE CLAIM that the object fills that ground, which is what makes the
// assertion safe to make there and nowhere else. (For 1x1s the equivalent
// question — "does the foot reach as far forward as its own WIDTH demands?" —
// is `groundCentre().dy`, reported by `anchor-audit --feet` and not yet a gate;
// dozens of feet are cut flat under a shadow, and they get redrawn before that
// closes. See the 2026-07-31 handoff, step 4.)
//
// ---------------------------------------------------------------------------
// AND WHY THERE IS A CEILING AS WELL AS A FLOOR.
//
// The wrong fix for a float is to shift the anchor down: the object drops onto
// the grass and still occupies only the back half of its plot, which is the
// same bug wearing a hat. Pushed far enough that shows up as art hanging a long
// way BELOW the front vertex, so SINK_TOLERANCE catches it from the other side.
// That is not hypothetical — it is exactly what four buildings shipped as.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite } from '../js/art/format.js';
import { SHADOW_KEY, importArt } from '../tools/isogeom.mjs';

/** How far short of the front vertex a sprite may fall. Matches the tool. */
const TOLERANCE = 10;

/**
 * ...and how far past it. TIGHTENED FROM 16 TO 8 on 2026-08-01.
 *
 * AT 16 THIS ARM CAUGHT NONE OF THE FOUR BUILDINGS THAT SHIPPED FLOATING.
 * Measured at `27b4cfe^`, their art hung past the front vertex by
 *
 *     still-pool +10   arcadian-tomb +14   tumulus +15   heroon +16
 *
 * and the condition was `short < -16` — so the heroon missed by exactly one
 * pixel of strictness and the other three were never close. (Still-pool was
 * doubly invisible: the arm skipped 1x1 sprites outright.) A guard a shipped
 * bug clears by one pixel was fitted to the wrong thing.
 *
 * 8, argued three ways:
 *
 *   THE DATA HAS A GAP THERE. Excluding face art, the worst overshoot anywhere
 *   at HEAD is +4 (four hedges), and the four bugs start at +10. Nothing in the
 *   game sits between them, so 8 is chosen from an empty band rather than
 *   fitted to make today's numbers pass.
 *
 *   IT IS HALF A TERRACE. `LEVEL_H` is 16, so 16 px of downward displacement is
 *   exactly one step of elevation — the amount that makes a building read as
 *   levitating rather than as slightly low — and half of that is the outer edge
 *   of "still reads as contact".
 *
 *   IT FITS INSIDE THE CURVE ALLOWANCE. A correct circular foot on a 2x2 bulges
 *   about 13 px past the diamond's straight edges at the corners, so a few px
 *   of overshoot is a property of round feet, not a fault.
 */
const SINK_TOLERANCE = 8;

/**
 * Art that lives on a VERTICAL FACE is not standing on a plot, and the
 * (fw+fh)*8 model says nothing about it. A cliff sprite is a tile top plus one
 * `LEVEL_H` of wall hanging below it — 31 px under its anchor by construction —
 * and a cascade lip pours its sheet of water off the front of its own diamond,
 * because that is what a fall is.
 *
 * A NAMED EXEMPTION, NOT A LOOSER TOLERANCE. The fifty cliff strips overshoot
 * by exactly 7, so relaxing SINK_TOLERANCE to 15 would have admitted them — and
 * would also have admitted three of the four buildings that shipped floating.
 */
const ON_A_FACE = (s) => {
  const t = s.tags || [];
  return t.includes('cliff') || t.includes('face') || t.includes('waterfall');
};

// Every module that defines art. A module that does not exist yet is not a
// fault — this list is allowed to run ahead of the files.
const MODULES = [
  '../js/art/props.js',
  '../js/art/decor.js',
  '../js/art/tiles.js',
  '../js/art/extras.js',
  '../js/art/clumps.js',
  '../js/art/creatures.js',
];

/** The lowest row holding a pixel that satisfies `pred`, or -1. */
function lowestRow(s, pred) {
  for (let y = s.h - 1; y >= 0; y--) {
    for (let x = 0; x < s.w; x++) {
      const ch = s.rows[y][x];
      if (ch !== '.' && pred(ch)) return y;
    }
  }
  return -1;
}

/** How far the OBJECT reaches below its anchor — blind to its own shadow. */
const solidDrop = (s) => lowestRow(s, (c) => c !== SHADOW_KEY) - s.anchor[1];

/** How far ANYTHING reaches below it — shadow very much included. */
const anyDrop = (s) => lowestRow(s, () => true) - s.anchor[1];

/**
 * The audit itself, as one pure function over a list of sprites, so that the
 * negative controls below run through EXACTLY the code that guards the game.
 * A checker that is only ever fed passing input is not a checker.
 *
 * Each entry may carry `fp` — THE PLOT THE THING IS PLACED ON, which is the
 * catalogue's footprint and not necessarily the sprite's. Where it is absent
 * the sprite's own declaration is the only claim it makes, so it is the one it
 * is held to.
 */
function auditAnchors(sprites) {
  const findings = [];
  let audited = 0;
  let sunkAudited = 0;
  for (const { name, sprite: s, from, fp: given } of sprites) {
    const fp = given || s.footprint || [1, 1];
    const need = (fp[0] + fp[1]) * 8;

    // --- the floor: multi-tile only, and blind to the shadow ---------------
    if (fp[0] * fp[1] > 1) {
      audited++;
      const drop = solidDrop(s);
      const short = need - drop;
      if (short > TOLERANCE) {
        findings.push({ name, from, fp: fp.join('x'), drop, need, short, kind: 'floats' });
      }
    }

    // --- the ceiling: EVERY sprite, and the shadow counts ------------------
    // Both halves of that are deliberate. The shadow counts because a shadow
    // hanging below the plot is the bug; every sprite, because still-pool was
    // a 1x1 and was invisible while this arm skipped them.
    if (!ON_A_FACE(s)) {
      sunkAudited++;
      const drop = anyDrop(s);
      if (drop - need > SINK_TOLERANCE) {
        findings.push({
          name, from, fp: fp.join('x'), drop, need, short: need - drop, kind: 'sinks',
        });
      }
    }
  }
  return { findings, audited, sunkAudited };
}

const describe = (f) =>
  `${f.name} (${f.from}) ${f.fp}: art reaches ${f.drop}px below its anchor, ` +
  `needs ${f.need} — ${f.kind === 'floats' ? `${f.short}px SHORT of its own front vertex` : `${-f.short}px PAST it`}`;

// --- load every sprite once, at module scope ------------------------------
const sprites = [];
const loaded = [];
const registry = new Map();
for (const path of MODULES) {
  // See `importArt`: a module that exists and throws must fail the suite, not
  // quietly remove its own sprites from the audit.
  const mod = await importArt(new URL(path, import.meta.url).href);
  if (!mod) continue;
  loaded.push(path);
  const add = (name, s) => {
    if (!s || !Array.isArray(s.rows) || !Array.isArray(s.anchor)) return;
    if (!sprites.some((e) => e.sprite === s)) {
      sprites.push({ name, sprite: s, from: path.replace('../', '') });
    }
    registry.set(s.name || name, s);
  };
  for (const [name, s] of Object.entries(mod)) add(name, s);
  for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY', 'CLUMPS']) {
    const table = mod[key];
    if (!table || typeof table !== 'object') continue;
    for (const [k, v] of Object.entries(table)) if (v && v.rows && v.anchor) add(k, v);
  }
}

// --- and the catalogue, which is where the PLOT comes from ----------------
let CATALOG = [];
let isGroundPainter = () => false;
try {
  const cat = await import(new URL('../js/catalog.js', import.meta.url).href);
  CATALOG = cat.CATALOG || [];
  if (typeof cat.isGroundPainter === 'function') isGroundPainter = cat.isGroundPainter;
} catch {
  // catalog.js failing to import in node would be its own failure, in its own
  // test; here it just makes the plot arm empty, which the guard below catches.
}

/** The placeables, each paired with the plot the renderer will put it on. */
const placed = [];
for (const def of CATALOG) {
  const a = def.art;
  if (!a || a.kind !== 'sprite') continue; // `grow` composers have no fixed art
  const s = (a.wanted && registry.get(a.wanted)) || registry.get(a.sprite);
  if (!s) continue;
  // GROUND PAINTERS ARE NOT OBJECTS. catalog.js: "These paint tiles; footprint
  // is the brush." A 2x2 brush laying a 1x1 tile is correct by construction.
  if (isGroundPainter(def)) continue;
  placed.push({ name: def.id, sprite: s, from: `catalog:${a.sprite}`, fp: def.footprint || [1, 1] });
}

test('every multi-tile sprite stands on the ground it claims', () => {
  const { findings } = auditAnchors(sprites);
  assert.deepEqual(
    findings.map(describe),
    [],
    'A multi-tile footprint is a claim to fill that ground. Redraw the BASE to ' +
      'cover the footprint — a 2x2 podium, a mound that fills its plot, a chest ' +
      'on a full-width plinth. Do not just move the anchor: that drops the ' +
      'object onto the grass and leaves it occupying the back half of its plot, ' +
      'which is the same bug wearing a hat. If the object genuinely does not ' +
      'fill that much ground, its FOOTPRINT is what is wrong.'
  );
});

/**
 * THE RATCHET: catalogue entries whose art does not fill the plot they are
 * placed on.
 *
 * These are NOT new breakage. Every one is a catalogue footprint that reserves
 * more garden than the art was ever drawn to cover — `exedra` claims 2x2 and is
 * a 66x32 bench; `sleeping-satyr` claims 2x1 and is 52 px wide — and they have
 * been like that since they were written. What is new is that anything can SEE
 * them: the old audit measured `sprite.footprint`, which for all ten says 1x1,
 * and 1x1 was skipped.
 *
 * Written as a ratchet rather than left as a report because the list IS the
 * work: each one is either a redraw (the base grows to fill the plot) or a
 * catalogue correction (the object really is 1x1 and should say so), and both
 * are decisions about how much ground an object takes. Until then the list may
 * only ever get shorter — the second assertion below is what enforces that, and
 * it is the half that actually empties a list.
 *
 * TO CLEAR ONE: fix it, run `node tools/anchor-audit.mjs`, delete the name.
 * TO ADD ONE: don't. Draw the base.
 */
const KNOWN_UNDERSIZED = new Set([
  'exedra', // 2x2 claimed, 66x32 of bench: 35px short
  'tiered-fountain', // 2x2 claimed: 32px short
  'ancient-oak', // 2x2 claimed: 32px short
  'sleeping-satyr', // 2x1 claimed, 52px wide: 25px short
  // `ruined-arch` was here at "2x1 claimed: 25px short", and the exemption was
  // measuring the FOOTPRINT, not the art. The sprite was a flat 32 px picture
  // of an arch on a plot 2 tiles long — nothing was ever going to fill that. It
  // is a barrel vault on one tile now and covers its plot outright. Check what
  // a piece CLAIMS before granting it room to be small.
  // `level-bridge` was here at "2x1 claimed: 23px short" — and that is TWICE
  // now that this list has named a symptom whose cause was the footprint. The
  // bridge was a flat 32px elevation on a plot two tiles long, and no drawing
  // was ever going to fill it. It is a barrel vault on ONE tile now, because
  // every stream in this game is one tile wide and a two-tile span puts its
  // arch over the boundary between its tiles. Check what a piece CLAIMS before
  // granting it room to be small.
  'fern-grotto', // 2x1 claimed: 22px short — 15 of its 17px of reach was shadow
  // 'ground' is its GROUP, but it has no `ground:` key, so it is not a painter:
  // it is placed as a 2x2 object drawn 1x1. 17px short.
  'mosaic-panel',
  'arbour-seat', // 2x1 claimed: 17px short
  // 'cypress-screen' WAS HERE, and it is the first name to leave this list.
  // It claimed 1x2 and was 16px short, which the audit reported and this list
  // then licensed. The reading was right and the diagnosis was never made: the
  // art ran along +tx and the plot along +ty, so the two were at right angles
  // and no amount of reach could ever have satisfied it. The art is one tile
  // now and the footprint is [1, 1]. An exemption is a bug with a note on it.
]);

test('no NEW placeable floats over the plot the catalogue gives it', () => {
  const { findings } = auditAnchors(placed);
  const fresh = findings.filter((f) => !KNOWN_UNDERSIZED.has(f.name)).map(describe);
  assert.deepEqual(
    fresh,
    [],
    'A catalogue entry reserves this much garden; the art has to cover it. ' +
      'Either grow the base or reduce the footprint — and note that the ' +
      'renderer places at the CATALOGUE footprint, so the sprite saying 1x1 ' +
      'does not save it.'
  );
});

test('the undersized list has not gone stale', () => {
  const { findings } = auditAnchors(placed);
  const still = new Set(findings.map((f) => f.name));
  const fixed = [...KNOWN_UNDERSIZED].filter((n) => !still.has(n));
  assert.deepEqual(
    fixed,
    [],
    'These now cover their plots. Strike them off KNOWN_UNDERSIZED — a list ' +
      'that still names fixed entries overstates the work left and, worse, ' +
      'would let one of them regress unnoticed.'
  );
});

// The instrument must be able to refuse, or a green result means nothing. Two
// guards, both permanent:
//
//   * the check has to have seen something — if art/ is renamed or a module
//     stops exporting its sprites, this test would otherwise pass by finding
//     nothing to look at;
//   * and it has to fail on a sprite that really does float. The controls below
//     are the heroon exactly as it was when the owner spotted it, and the
//     shadow-shaped version of the same lie.
test('the check is looking at something', () => {
  const { audited, sunkAudited } = auditAnchors(sprites);
  assert.ok(loaded.length >= 3, `only ${loaded.length} art module(s) loaded`);
  assert.ok(
    audited >= 5,
    `only ${audited} multi-tile sprite(s) audited — the game has more than that, ` +
      `so either a module stopped exporting or footprints have gone missing`
  );
  assert.ok(
    sunkAudited >= 100,
    `only ${sunkAudited} sprite(s) checked for burial — this arm covers EVERY ` +
      `sprite, 1x1 included, because still-pool was a 1x1`
  );
  assert.ok(
    placed.length >= 40,
    `only ${placed.length} catalogue placeables resolved to art — the registry ` +
      `is probably not matching main.js's, which makes the plot arm vacuous`
  );
});

test('the check FAILS on a sprite that floats — negative control', () => {
  // 20 rows of stone with the anchor 9 rows above the bottom: the shape the
  // three offenders had. drop 9, needs (2+2)*8 = 32, short 23.
  const floater = defineSprite({
    name: 'control-floater',
    rows: new Array(20).fill('.vvvvvvvvvvvvvvvvvv.'),
    anchor: [10, 10],
    footprint: [2, 2],
  });
  const { findings } = auditAnchors([{ name: 'FLOATER', sprite: floater, from: 'control' }]);
  assert.equal(findings.length, 1, 'the audit did not notice a sprite floating 23px up');
  assert.equal(findings[0].kind, 'floats');
  assert.equal(findings[0].short, 23);
});

test('the check FAILS on a sprite that reaches the ground ONLY by its shadow', () => {
  // THE LIE THIS ARM WAS BLIND TO UNTIL 2026-08-01, in its purest form: ten rows
  // of stone and then twelve of contact shadow. Counting every opaque pixel it
  // reaches 12px below its anchor; the OBJECT stops level with it.
  const rows = new Array(10)
    .fill('.vvvvvvvvvvvvvvvvvv.')
    .concat(new Array(12).fill('.mmmmmmmmmmmmmmmmmm.'));
  const smudge = defineSprite({
    name: 'control-shadow-only',
    rows,
    anchor: [10, 9],
    footprint: [2, 2],
  });
  assert.equal(anyDrop(smudge), 12, 'the control is not shaped the way the comment says');
  assert.equal(solidDrop(smudge), 0);
  const { findings } = auditAnchors([{ name: 'SMUDGE', sprite: smudge, from: 'control' }]);
  const floats = findings.filter((f) => f.kind === 'floats');
  assert.equal(floats.length, 1, 'a sprite standing on nothing but its own shade passed');
  assert.equal(floats[0].short, 32);
});

test('the check FAILS on a sprite drawn far below its own plot', () => {
  // The other end of the same mistake: the anchor put near the TOP of the art
  // rather than at its base, so the object hangs well past the front vertex and
  // reads as sunk into the ground in front of the tile it belongs to.
  const sunk = defineSprite({
    name: 'control-sunk',
    rows: new Array(60).fill('.vvvvvvvvvvvvvvvvvv.'),
    anchor: [10, 0],
    footprint: [2, 2],
  });
  const { findings } = auditAnchors([{ name: 'SUNK', sprite: sunk, from: 'control' }]);
  assert.equal(findings.filter((f) => f.kind === 'sinks').length, 1);
});

/**
 * THE CALIBRATION CONTROL, and it is the most important test in this file.
 *
 * The four sprites are not invented: each reproduces one of the four buildings
 * the owner saw floating, at its measured overshoot from `27b4cfe^`. The fifth
 * reproduces the worst overshoot that is CORRECT at HEAD. A tolerance is only
 * defensible if it separates those two groups, and this is the assertion that
 * says so in the code rather than in a comment somebody can stop believing.
 *
 * If a future edit widens SINK_TOLERANCE past 9, this fails on `still-pool`
 * before it fails on anything real — which is the point.
 */
test('the sink tolerance separates the four shipped bugs from correct art', () => {
  // A 1x1 or 2x2 slab with `over` rows of shadow past its own front vertex.
  const control = (name, [fw, fh], over) => {
    const need = (fw + fh) * 8;
    const w = (fw + fh) * 32;
    const solid = new Array(10).fill('.'.padEnd(w - 1, 'v') + '.');
    const shade = new Array(need + over).fill('.'.padEnd(w - 1, 'm') + '.');
    return {
      name,
      sprite: defineSprite({
        name,
        rows: solid.concat(shade),
        anchor: [w >> 1, 9],
        footprint: [fw, fh],
      }),
      from: 'control',
    };
  };

  // As shipped, and every one of them must fire.
  const bugs = [
    control('still-pool', [1, 1], 10),
    control('arcadian-tomb', [2, 1], 14),
    control('tumulus', [2, 2], 15),
    control('heroon', [2, 2], 16),
  ];
  for (const b of bugs) {
    const { findings } = auditAnchors([b]);
    assert.equal(
      findings.filter((f) => f.kind === 'sinks').length,
      1,
      `${b.name} shipped hanging past its plot and this arm did not see it`
    );
  }

  // ...and the worst thing at HEAD that is simply a round foot, which must not.
  const fine = control('worst-legitimate', [1, 1], 4);
  assert.equal(
    auditAnchors([fine]).findings.filter((f) => f.kind === 'sinks').length,
    0,
    'the arm convicts art that is drawn correctly — a contact shadow is MEANT ' +
      'to sit a little outside the base'
  );
});

// The three that were redrawn for this. Named so that a future edit which
// quietly re-shrinks one of their bases fails with the object's name on it
// rather than as an anonymous entry in a list.
test('the three redrawn tomb bases cover their plots', () => {
  const byName = new Map(sprites.map((s) => [s.name, s.sprite]));
  for (const [name, fp] of [
    ['TUMULUS', [2, 2]],
    ['HEROON', [2, 2]],
    ['ARCADIAN_TOMB', [2, 1]],
  ]) {
    const s = byName.get(name);
    assert.ok(s, `${name} is gone from js/art/props.js`);
    assert.deepEqual([...s.footprint], fp, `${name} changed footprint`);
    const drop = solidDrop(s);
    const need = (fp[0] + fp[1]) * 8;
    assert.ok(need - drop <= TOLERANCE, `${name} floats again: drop ${drop}, needs ${need}`);
    // ...and from the other side, which is the arm that would have caught them
    // in the first place had it existed at this tolerance.
    assert.ok(
      anyDrop(s) - need <= SINK_TOLERANCE,
      `${name} is buried again: its lowest pixel is ${anyDrop(s)}px below the ` +
        `anchor, and the front of its plot is at ${need}`
    );
  }
});
