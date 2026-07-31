// sprite-anchors.test.mjs — a sprite must stand on the ground it claims.
//
// This is `tools/anchor-audit.mjs --strict` promoted to a `node --test`
// assertion. The tool was written as a report with a tolerance so that three
// known offenders could be looked at before anything was made to fail; they
// have been redrawn (TUMULUS, HEROON and ARCADIAN_TOMB, all in js/art/props.js)
// and the report is empty, so the gate closes behind them.
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
// WHY ONLY MULTI-TILE SPRITES.
//
// The check does NOT apply to objects that merely STAND on a tile — a herm, a
// stele, an urn. A narrow post correctly occupies only the middle of its
// diamond, and demanding it reach the front vertex would be wrong. A MULTI-TILE
// FOOTPRINT IS ITSELF THE CLAIM that the object fills that ground, which is
// what makes the assertion safe to make there and nowhere else.
//
// ---------------------------------------------------------------------------
// AND WHY THERE IS A CEILING AS WELL AS A FLOOR.
//
// The wrong fix for a float is to shift the anchor down: the object drops onto
// the grass and still occupies only the back half of its plot, which is the
// same bug wearing a hat. Pushed far enough that shows up as art hanging a long
// way BELOW the front vertex, so SINK_TOLERANCE catches it from the other side.
// It is deliberately loose — a contact shadow is meant to sit just outside the
// base — and only fires on genuine burial.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite } from '../js/art/format.js';

/** How far short of the front vertex a sprite may fall. Matches the tool. */
const TOLERANCE = 10;

/** ...and how far past it. Only a contact skirt belongs down there. */
const SINK_TOLERANCE = 16;

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

/** The lowest row with any opaque pixel in it, or -1 for an empty sprite. */
function lowestOpaqueRow(s) {
  for (let y = s.h - 1; y >= 0; y--) {
    if (s.rows[y].replace(/\./g, '').length) return y;
  }
  return -1;
}

/**
 * The audit itself, as one pure function over a list of sprites, so that the
 * negative control below runs through EXACTLY the code that guards the game.
 * A checker that is only ever fed passing input is not a checker.
 */
function auditAnchors(sprites) {
  const findings = [];
  let audited = 0;
  for (const { name, sprite: s, from } of sprites) {
    const fp = s.footprint || [1, 1];
    if (fp[0] * fp[1] <= 1) continue;
    audited++;

    const drop = lowestOpaqueRow(s) - s.anchor[1];
    const need = (fp[0] + fp[1]) * 8;
    const short = need - drop;

    if (short > TOLERANCE) {
      findings.push({ name, from, fp: fp.join('x'), drop, need, short, kind: 'floats' });
    } else if (short < -SINK_TOLERANCE) {
      findings.push({ name, from, fp: fp.join('x'), drop, need, short, kind: 'sinks' });
    }
  }
  return { findings, audited };
}

const describe = (f) =>
  `${f.name} (${f.from}) ${f.fp}: art reaches ${f.drop}px below its anchor, ` +
  `needs ${f.need} — ${f.kind === 'floats' ? `${f.short}px SHORT of its own front vertex` : `${-f.short}px PAST it`}`;

// --- load every sprite once, at module scope ------------------------------
const sprites = [];
const loaded = [];
for (const path of MODULES) {
  let mod;
  try {
    mod = await import(new URL(path, import.meta.url).href);
  } catch {
    continue;
  }
  loaded.push(path);
  for (const [name, s] of Object.entries(mod)) {
    if (!s || !Array.isArray(s.rows) || !Array.isArray(s.anchor)) continue;
    sprites.push({ name, sprite: s, from: path.replace('../', '') });
  }
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

// The instrument must be able to refuse, or a green result means nothing. Two
// guards, both permanent:
//
//   * the check has to have seen something — if art/ is renamed or a module
//     stops exporting its sprites, this test would otherwise pass by finding
//     nothing to look at;
//   * and it has to fail on a sprite that really does float. The control below
//     is the heroon exactly as it was when the owner spotted it: a 2x2 whose
//     art stops 9px under its anchor where 32 is needed.
test('the check is looking at something', () => {
  const { audited } = auditAnchors(sprites);
  assert.ok(loaded.length >= 3, `only ${loaded.length} art module(s) loaded`);
  assert.ok(
    audited >= 5,
    `only ${audited} multi-tile sprite(s) audited — the game has more than that, ` +
      `so either a module stopped exporting or footprints have gone missing`
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

test('the check FAILS on a sprite drawn far below its own plot', () => {
  // The other end of the same mistake: the anchor put near the TOP of the art
  // rather than at its base, so the object hangs 27px past the front vertex and
  // reads as sunk into the ground in front of the tile it belongs to.
  const sunk = defineSprite({
    name: 'control-sunk',
    rows: new Array(60).fill('.vvvvvvvvvvvvvvvvvv.'),
    anchor: [10, 0],
    footprint: [2, 2],
  });
  const { findings } = auditAnchors([{ name: 'SUNK', sprite: sunk, from: 'control' }]);
  assert.equal(findings.length, 1, 'the audit did not notice art hanging 19px below its plot');
  assert.equal(findings[0].kind, 'sinks');
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
    const drop = lowestOpaqueRow(s) - s.anchor[1];
    const need = (fp[0] + fp[1]) * 8;
    assert.ok(
      need - drop <= TOLERANCE,
      `${name} floats again: drop ${drop}, needs ${need}`
    );
  }
});
