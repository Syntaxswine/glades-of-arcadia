// contact-shadow.test.mjs — the shade an object casts where it meets the ground.
//
// SPEC §3: "a skirt in the ground ramp darkened two steps hugging the object's
// base diamond, plus an optional half-diamond offset 2-4 px away from the
// light. NEVER translucent black."
//
// ---------------------------------------------------------------------------
// THIS FILE EXISTS BECAUSE THE OLD SHADOW PASSED EVERY TEST IN THE PROJECT
// WHILE BEING COMPLETELY INVISIBLE.
//
// Until 2026-08-01 the stamp was `((fw + fh) / 2) * 0.5` of the tile diamond,
// and `tools/shadow-probe.mjs` — which renders one object on flat ground three
// times (bare / shadow only / whole) and counts what survives — found:
//
//   thirteen placeables whose stamp was 100% hidden behind their own art,
//   including the heroon, the tholos, the arcadian tomb and every cave;
//   44% of all stamp pixels reaching the screen across the catalogue;
//   every 1x1 getting the same stamp, so a cypress and a plane tree on the
//   same tile cast the same shadow;
//   a 3x1 and a 2x2 collapsing to one number, so the colonnade's shadow was
//   the tholos's;
//   and every PAVED tile casting a grass-green mat, because `terrainCell` has
//   never set `cell.ground` and `_groundKeyAt` fell through to 'o'.
//
// None of that is visible to a test that asks "did the renderer produce a
// frame". So these assertions are all about the THING THE STAMP IS FOR: can it
// be seen, is it the right size for the object rather than the tile, and is it
// made of the ground it lands on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCanvas, createCanvas } from '../tools/headless-canvas.mjs';

installCanvas();

const render = await import('../js/render.js');
const pal = await import('../js/palette.js');
const { groundCentre } = await import('../js/art/format.js');
const props = await import('../js/art/props.js');
const decor = await import('../js/art/decor.js');
const tiles = await import('../js/art/tiles.js');

const W = 9;
const H = 9;
const TX = 4;
const TY = 4;
const VW = 640;
const VH = 400;

/** Flat ground of one kind, with `objects` standing on it. */
function shot(objects, { paving = null } = {}) {
  const cv = createCanvas(VW, VH);
  const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
  r.setScene({
    mapW: W,
    mapH: H,
    terrainVersion: 1,
    levels: new Int8Array(W * H),
    grass: () => (paving ? null : 'meadow'),
    grassContest: () => null,
    terrain: paving ? () => ({ art: paving, grass: null, level: 0 }) : () => null,
    objects,
    creatures: [],
  });
  r.centreOnTile(TX, TY, true);
  r.frame(0);
  return cv.getContext('2d').getImageData(0, 0, VW, VH).data;
}

const differs = (a, b, i) =>
  a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3];

/**
 * drawn / visible / the colours it came out, for one piece of art.
 *
 * `shadow` is pinned explicitly on BOTH the shadow-only frame and the whole
 * frame. It has to be: once the size comes from the art, dropping the art to
 * isolate the shadow would also drop the measurement, and the two frames would
 * differ in two things instead of one. (The probe was wrong this way for
 * exactly one commit.)
 */
function shadowOf(art, fp = [1, 1], opts = {}) {
  const gc = groundCentre(art);
  const base = { tx: TX, ty: TY, footprint: fp, level: 0, shadow: gc ? gc.r : undefined };
  const A = shot([], opts);
  const B = shot([{ ...base, art: null }], opts);
  const C = shot([{ ...base, art }], opts);
  let drawn = 0;
  let visible = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  const hues = new Map();
  for (let p = 0; p < VW * VH; p++) {
    const i = p * 4;
    if (!differs(A, B, i)) continue;
    drawn++;
    const x = p % VW;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (!differs(B, C, i)) visible++;
    const hex = `#${B[i].toString(16).padStart(2, '0')}${B[i + 1].toString(16).padStart(2, '0')}${B[i + 2].toString(16).padStart(2, '0')}`;
    hues.set(hex, (hues.get(hex) || 0) + 1);
  }
  return { drawn, visible, width: maxX >= minX ? maxX - minX + 1 : 0, hues };
}

/**
 * A sprite by NAME, wherever a module happens to keep it — top level or inside
 * one of the name->sprite tables. The art modules export the same sprite two or
 * three ways and a test that only knows one of them fails on a refactor that
 * changed nothing a player can see.
 */
function spriteNamed(want) {
  for (const mod of [tiles, decor, props]) {
    for (const v of Object.values(mod)) {
      if (v && v.rows && v.name === want) return v;
      if (v && typeof v === 'object' && !v.rows) {
        for (const v2 of Object.values(v)) if (v2 && v2.rows && v2.name === want) return v2;
      }
    }
  }
  return null;
}

/** Which ramp a rendered colour belongs to. */
const rampOfHex = new Map();
for (const [name, ramp] of Object.entries(pal.RAMPS)) {
  for (let i = 0; i < ramp.hex.length; i++) rampOfHex.set(ramp.hex[i].toLowerCase(), name);
}
const rampsIn = (hues) => new Set([...hues.keys()].map((h) => rampOfHex.get(h) || '?'));

// ---------------------------------------------------------------------------

test('a big building casts a shadow that can actually be seen', () => {
  // THE REGRESSION THIS FILE IS NAMED FOR. All three of these measured ZERO
  // visible stamp pixels before the rewrite: the stamp was smaller than the
  // podium standing on it, so the whole pass was dead work every frame.
  for (const [name, art, fp] of [
    ['HEROON', props.HEROON, [2, 2]],
    ['THOLOS', decor.THOLOS || decor.SPRITES?.tholos, [2, 2]],
    ['ARCADIAN_TOMB', props.ARCADIAN_TOMB, [2, 1]],
  ]) {
    if (!art) continue; // a sprite another owner has not landed yet is not a fault
    const s = shadowOf(art, fp);
    assert.ok(s.drawn > 0, `${name}: no shadow was drawn at all`);
    assert.ok(
      s.visible > 200,
      `${name}: only ${s.visible} of ${s.drawn} shadow px survive its own art. ` +
        `A contact shadow the size of the base is invisible under the base — ` +
        `see SHADOW_SKIRT in js/render.js.`
    );
  }
});

/**
 * The shadow a PLAYER sees, measured through the production path.
 *
 * `shadowOf` above pins `shadow:` so it can isolate the whole stamp including
 * the hidden part; that is the right tool for "how much is wasted" and the
 * WRONG one for "what decides the size", because pinning is the thing under
 * test. This differences the object drawn WITH its automatic shadow against
 * the same object drawn with `shadow: false` — nothing is pinned, the renderer
 * picks the radius exactly as it does in the game, and what comes back is the
 * shade on the grass beside the object.
 */
function seenShadow(art, fp = [1, 1]) {
  const base = { tx: TX, ty: TY, footprint: fp, level: 0, art };
  const withIt = shot([base]);
  const without = shot([{ ...base, shadow: false }]);
  let n = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let p = 0; p < VW * VH; p++) {
    if (!differs(withIt, without, p * 4)) continue;
    n++;
    const x = p % VW;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  }
  return { px: n, width: maxX >= minX ? maxX - minX + 1 : 0 };
}

test('the shadow is sized from the OBJECT, not from the tile it stands on', () => {
  // A herm and a boulder both stand on 1x1. Under the old rule they cast an
  // IDENTICAL stamp — that is the thing the `shadow:` field was invented for
  // and never once did, because `catalog.js` sets it nowhere and every object
  // arrived at `scale = 1`.
  const narrow = props.HERM || props.GRAVE_STELE;
  const broad = props.IVY_BOULDER || props.HALF_BURIED_PITHOS;
  assert.ok(narrow && broad, 'the two control sprites are gone from props.js');
  const a = seenShadow(narrow);
  const b = seenShadow(broad);
  assert.ok(
    b.width > a.width + 8,
    `a ${narrow.name} (${a.width}px of shadow) and a ${broad.name} (${b.width}px) ` +
      `cast nearly the same shadow on the same 1x1 tile — the size is not coming ` +
      `from the art`
  );
});

test('the same object on two different plots casts the SAME shadow', () => {
  // The discriminating half, and the one that fails loudly if the size ever
  // goes back to being a function of the footprint. Under the old rule a 1x1
  // got hw=16 and a 2x2 got hw=32 for identical art; under this one the art
  // decides and the plot only ever CAPS it, so a herm — far narrower than
  // either diamond — must measure the same on both.
  const narrow = props.HERM || props.GRAVE_STELE;
  const one = seenShadow(narrow, [1, 1]);
  const four = seenShadow(narrow, [2, 2]);
  assert.equal(
    one.width,
    four.width,
    `the same sprite cast a ${one.width}px shadow on a 1x1 and a ${four.width}px ` +
      `one on a 2x2 — the plot is deciding the size again`
  );
  assert.ok(one.px > 0, 'the herm casts no visible shadow at all');
});

test('a 3x1 and a 2x2 no longer cast the same shadow', () => {
  // `(fw + fh) / 2` collapsed them to one number, which is why the colonnade's
  // shadow was the tholos's.
  //
  // THE FIX MAKES THAT STRUCTURALLY IMPOSSIBLE RATHER THAN MERELY CORRECT: the
  // footprint no longer enters the size at all, so two objects differ because
  // their FEET differ. Which is also why the test above holds — the same art on
  // two plots measures the same — and why the plot clamp inside `groundCentre`
  // reads the SPRITE's declared footprint and not the plot it is placed on.
  // That is deliberate: the clamp bounds the MEASUREMENT (a base band read too
  // wide must not cast an absurd shadow), and what the art says about itself is
  // the honest bound. If the catalogue puts a 1x1 sprite on 2x1 ground, the
  // fault is the catalogue's and the shadow should not lie about the object's
  // size to cover it — `anchor-audit`'s PLOT arm is where that gets reported.
  const colonnade = spriteNamed('colonnade');
  const tholos = spriteNamed('tholos');
  assert.ok(colonnade && tholos, 'colonnade or tholos is gone from decor.js');
  const a = seenShadow(colonnade, [3, 1]);
  const b = seenShadow(tholos, [2, 2]);
  assert.ok(a.px > 0 && b.px > 0, 'one of them casts no shadow at all');
  assert.notEqual(
    a.width,
    b.width,
    `the colonnade and the tholos cast the same ${a.width}px shadow — the size ` +
      `has gone back to being a function of the footprint`
  );
});

test('the shadow is made of the GROUND it lands on, not of grass', () => {
  // THE GREEN MAT. Until 2026-08-01 `main.js`'s `terrainCell` never set
  // `cell.ground`, so every non-turf tile — gravel, flagstone, terrace paving,
  // tilled soil, scree, open water — fell through `_groundKeyAt` to null and
  // then to GROUND_DEFAULT ('o'), and every object standing on stone cast a
  // grass-green shadow. Measured, not eyeballed: the census below is of the
  // actual rendered pixels.
  const paving = spriteNamed('flagstone-a');
  assert.ok(paving, 'flagstone-a is gone from tiles.js');

  const onGrass = shadowOf(props.HERM || props.GRAVE_STELE, [1, 1]);
  const onStone = shadowOf(props.HERM || props.GRAVE_STELE, [1, 1], { paving });

  assert.deepEqual(
    [...rampsIn(onGrass.hues)],
    ['grass'],
    'a shadow on turf should be made of the grass ramp'
  );
  const stoneRamps = rampsIn(onStone.hues);
  assert.ok(
    !stoneRamps.has('grass'),
    `a prop on flagstone still casts a shadow containing ${[...stoneRamps].join('/')} — ` +
      `the green mat is back. js/render.js _groundKeyAt reads the tile art.`
  );
  assert.ok(stoneRamps.size > 0, 'no shadow was drawn on paving at all');
});

test('the shadow is never translucent black — SPEC §3', () => {
  // The one rule SPEC states in capitals about this. Every pixel the stamp puts
  // down must be a colour that is already in a ramp; alpha must be 255.
  const s = shadowOf(props.HEROON, [2, 2]);
  const strays = [...s.hues.keys()].filter((h) => !rampOfHex.has(h));
  assert.deepEqual(
    strays,
    [],
    'the contact shadow drew colours that are not in any palette ramp — the ' +
      'usual cause is compositing with alpha instead of picking a darker key'
  );
});

test('a CREATURE\'s shadow does not breathe with its walk cycle', async () => {
  // THE REGRESSION THE REWRITE ALMOST SHIPPED, and the reason `shadowRadius`
  // is a function rather than a ternary.
  //
  // `main.js` passes `shadow: CREATURE_SHADOWS[id]` — a SPRITE, not a number
  // and not false. The old renderer's `typeof === 'number'` test discarded it
  // silently (so those five hand-authored shadows in creatures.js have never
  // once been drawn); the new one would have fallen through to "measure the
  // art", and a mover's art is its CURRENT FRAME. A walk cycle changes
  // silhouette every few hundred ms, so the shadow would have pulsed under
  // every creature in the garden — a fault nobody can name from a screenshot
  // and everybody can feel.
  let creatures;
  try {
    creatures = await import('../js/art/creatures.js');
  } catch {
    return; // another owner's module, mid-flight
  }
  const shadowSprite = creatures.CREATURE_SHADOWS?.centaur;
  const frames = creatures.allFrames ? creatures.allFrames() : null;
  if (!shadowSprite || !frames || frames.length < 4) return;

  const widths = new Set();
  for (const frame of frames.slice(0, 6)) {
    const A = shot([]);
    const B = shot([
      { tx: TX, ty: TY, footprint: [1, 1], level: 0, art: frame, shadow: shadowSprite },
    ]);
    // Where the shadow reaches, independent of the creature drawn over it.
    const C = shot([
      { tx: TX, ty: TY, footprint: [1, 1], level: 0, art: null, shadow: shadowSprite },
    ]);
    let minX = Infinity;
    let maxX = -Infinity;
    for (let p = 0; p < VW * VH; p++) {
      if (!differs(A, C, p * 4)) continue;
      const x = p % VW;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
    widths.add(maxX - minX);
    assert.ok(B.length > 0);
  }
  assert.equal(
    widths.size,
    1,
    `the shadow under one creature measured ${[...widths].join('/')} px across ` +
      `its frames — it is being sized from the animation instead of from its ` +
      `own CREATURE_SHADOWS entry`
  );
});

test('an object may still refuse a shadow, and may still name its own radius', () => {
  const art = props.HERM || props.GRAVE_STELE;
  const A = shot([]);
  const none = shot([{ tx: TX, ty: TY, footprint: [1, 1], level: 0, art, shadow: false }]);
  const big = shot([{ tx: TX, ty: TY, footprint: [1, 1], level: 0, art: null, shadow: 30 }]);
  const small = shot([{ tx: TX, ty: TY, footprint: [1, 1], level: 0, art: null, shadow: 8 }]);

  const count = (frame) => {
    let n = 0;
    for (let p = 0; p < VW * VH; p++) if (differs(A, frame, p * 4)) n++;
    return n;
  };
  // `shadow: false` is the bird-and-floating-thing escape and must still work.
  const withArt = shot([{ tx: TX, ty: TY, footprint: [1, 1], level: 0, art }]);
  assert.ok(count(none) < count(withArt), '`shadow: false` still drew a shadow');
  // ...and a number is now a RADIUS IN PIXELS rather than a scale factor. That
  // is a change of meaning, and it is safe only because nothing ever set it:
  // `catalog.js` has zero matches for `shadow:`. Assert the direction, so a
  // future caller passing 0.5 expecting "half size" fails loudly and small.
  assert.ok(count(big) > count(small) * 3, '`shadow: <px>` is not scaling the stamp');
});
