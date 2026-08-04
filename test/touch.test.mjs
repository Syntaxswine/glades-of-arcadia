// test/touch.test.mjs — two fingers, and the whole-garden overview.
//
// WHAT IS TESTABLE HERE AND WHAT IS NOT. A finger is a DOM event and Node has
// none, so the plumbing in `createInput` — the pointer book, the suppression,
// the cancel path — is verified in a browser (see the handoff). What lives here
// is everything that could be made a PURE FUNCTION of numbers, which is
// deliberately most of the decisions:
//
//   * the centroid and separation of two points,
//   * whether a pinch has travelled far enough to mean anything, and which way,
//   * where the overview panel lands and how big its pixels are,
//   * that a tap on it comes back as the tile you tapped.
//
// The last one matters most. The overview is the corner minimap MAGNIFIED, and
// the whole reason it is safe to magnify is that `pick` divides the scale back
// out. If that inverse is ever wrong the symptom is "tapping the map sends me
// somewhere else", which reads as a projection bug and is not one.

import test from 'node:test';
import assert from 'node:assert/strict';

import { twoFinger, pinchVerdict, PINCH_TRIGGER, LONG_PRESS_MS } from '../js/input.js';
import { createMinimap, MINIMAP, tileToMini } from '../js/minimap.js';
import { MAP_W, MAP_H } from '../js/iso.js';

// ---------------------------------------------------------------------------
// The arithmetic of two fingers
// ---------------------------------------------------------------------------

test('two fingers report their middle and their separation', () => {
  const r = twoFinger({ x: 0, y: 0 }, { x: 6, y: 8 });
  assert.equal(r.cx, 3);
  assert.equal(r.cy, 4);
  assert.equal(r.dist, 10); // 3-4-5
  // Order must not matter: which finger the browser numbers first is not a
  // thing the gesture may depend on.
  const s = twoFinger({ x: 6, y: 8 }, { x: 0, y: 0 });
  assert.deepEqual(s, r);
});

test('a pinch says nothing until it has travelled', () => {
  // THE WOBBLE CASE, and the reason the trigger exists at all: a two-finger PAN
  // does not hold its separation to the pixel, and every one of these must stay
  // silent or panning would flap the overview open and shut under the hand.
  for (const d of [0, 5, -5, 20, -20, PINCH_TRIGGER - 1, -(PINCH_TRIGGER - 1)]) {
    assert.equal(pinchVerdict(100, 100 + d), null, `${d}px of drift spoke`);
  }
});

test('fingers closing means show me everything, opening means back to the garden', () => {
  assert.equal(pinchVerdict(200, 200 - PINCH_TRIGGER), 'in');
  assert.equal(pinchVerdict(200, 200 - 120), 'in');
  assert.equal(pinchVerdict(60, 60 + PINCH_TRIGGER), 'out');
  assert.equal(pinchVerdict(60, 300), 'out');
});

test('the verdict is on the DISTANCE TRAVELLED, not on how far apart the fingers are', () => {
  // Two fingers held 200px apart and closed by 40 is a pinch; two fingers that
  // simply START 160 apart and stay there is not. Anchoring on the start is
  // what makes a small hand and a large hand the same gesture.
  assert.equal(pinchVerdict(200, 160), 'in');
  assert.equal(pinchVerdict(160, 160), null);
  assert.equal(pinchVerdict(120, 160), 'out');
});

// ---------------------------------------------------------------------------
// The long press
// ---------------------------------------------------------------------------
//
// The BEHAVIOUR is a timer over DOM events and is verified in the browser — the
// six-case matrix is in the handoff, §7d. What is worth pinning here is the
// DURATION, because it is the whole safety argument for a gesture that deletes
// and because a future edit that "tightens it up" to 250ms would make the
// garden hostile without failing anything.

test('the long press waits the platform’s own long-press duration', () => {
  // Android's ViewConfiguration long-press timeout is 500ms and iOS's context
  // menu is about the same. A phone player already has this duration in their
  // hands from every other app they own; inventing our own would feel broken
  // rather than safe. If this ever changes, change it because the PLATFORM did.
  assert.equal(LONG_PRESS_MS, 500);
});

test('a long press is far longer than a tap and far longer than a pinch is wide', () => {
  // A tap is ~100ms. The gap has to be big enough that nobody taps by accident
  // at the slow end of normal.
  assert.ok(LONG_PRESS_MS >= 400, 'a hold this short will fire on ordinary taps');
  assert.ok(LONG_PRESS_MS <= 800, 'a hold this long reads as the game ignoring you');
});

// ---------------------------------------------------------------------------
// The overview
// ---------------------------------------------------------------------------

const DESKTOP_VIEW = { x: 0, y: 14, w: 640, h: 286 };
const MOBILE_VIEW = { x: 0, y: 22, w: 360, h: 478 };

function mini() {
  // A world just real enough to be measured: the overview's geometry does not
  // depend on what is planted, which is the point of testing it without one.
  return createMinimap({
    world: { w: MAP_W, h: MAP_H, objects: [], groundAt: () => 'meadow', grassAt: () => null },
  });
}

test('the overview scale is a whole number, and it fits', () => {
  const m = mini();
  for (const view of [DESKTOP_VIEW, MOBILE_VIEW]) {
    const k = m.overviewScale(view);
    assert.ok(Number.isInteger(k), `scale ${k} is not a whole number`);
    assert.ok(k >= 1 && k <= 3, `scale ${k} is outside 1..3`);
    const r = m.overviewRect(view);
    assert.ok(r.w <= view.w, `the overview (${r.w}) is wider than the view (${view.w})`);
    assert.ok(r.h <= view.h, `the overview (${r.h}) is taller than the view (${view.h})`);
    assert.ok(r.x >= view.x && r.y >= view.y, 'the overview starts outside the view');
    assert.ok(r.x + r.w <= view.x + view.w, 'the overview runs off the right of the view');
    assert.ok(r.y + r.h <= view.y + view.h, 'the overview runs off the bottom of the view');
  }
});

test('the overview is BIGGER than the corner minimap — that is its whole job', () => {
  const m = mini();
  for (const view of [DESKTOP_VIEW, MOBILE_VIEW]) {
    const small = m.rect(view);
    const big = m.overviewRect(view);
    assert.ok(big.w > small.w && big.h > small.h, 'the overview is not bigger than the corner map');
    assert.ok(m.overviewScale(view) >= 2, 'the overview did not magnify at all');
  }
});

test('the overview is centred in the view', () => {
  const m = mini();
  for (const view of [DESKTOP_VIEW, MOBILE_VIEW]) {
    const r = m.overviewRect(view);
    const leftGap = r.x - view.x;
    const rightGap = view.x + view.w - (r.x + r.w);
    const topGap = r.y - view.y;
    const bottomGap = view.y + view.h - (r.y + r.h);
    assert.ok(Math.abs(leftGap - rightGap) <= 1, `not centred across: ${leftGap} vs ${rightGap}`);
    assert.ok(Math.abs(topGap - bottomGap) <= 1, `not centred down: ${topGap} vs ${bottomGap}`);
  }
});

test('the overview claims the whole view, so a tap beside it closes rather than plants', () => {
  const m = mini();
  const view = MOBILE_VIEW;
  // Closed, only its own corner is chrome.
  assert.equal(m.expanded, false);
  assert.equal(m.hit(view.x + 4, view.y + 200, view), false, 'the closed map claimed the meadow');
  m.setExpanded(true);
  // Open, every pixel of the map view belongs to it.
  for (const [sx, sy] of [
    [view.x + 1, view.y + 1],
    [view.x + view.w - 1, view.y + view.h - 1],
    [view.x + 4, view.y + 200],
    [view.x + view.w / 2, view.y + view.h / 2],
  ]) {
    assert.equal(m.hit(sx, sy, view), true, `the open overview let ${sx},${sy} through to the tools`);
  }
  // ...but never outside the map view, which is where the panel and bar live.
  assert.equal(m.hit(view.x + 10, view.y - 5, view), false, 'the overview claimed the topbar');
});

test('a tap on the magnified map comes back as the tile that was tapped', () => {
  // THE INVERSE. `pick` divides the scale back out; if it ever stops doing
  // that, tapping the overview sends the camera somewhere else entirely and it
  // looks like a projection fault rather than a missing division.
  const m = mini();
  const view = MOBILE_VIEW;
  m.setExpanded(true);
  const r = m.overviewRect(view);
  const k = m.overviewScale(view);
  assert.ok(k >= 2, 'this test is pointless at 1x');

  for (const [tx, ty] of [[0, 0], [30, 30], [59, 59], [0, 59], [59, 0], [12, 47]]) {
    const p = tileToMini(tx, ty);
    // Tap the middle of that map pixel's magnified block.
    const sx = r.x + MINIMAP.PAD + p.x * k + Math.floor(k / 2);
    const sy = r.y + MINIMAP.PAD + p.y * k + Math.floor(k / 2);
    const got = m.pick(sx, sy, view);
    assert.ok(got, `tapping tile ${tx},${ty} found nothing`);
    // miniToTile loses the parity of the halved row, so it answers with the
    // tile on the even diagonal — never more than one out, which is documented
    // and is well inside a rounding error for centring a camera.
    assert.ok(
      Math.abs(got.tx - tx) + Math.abs(got.ty - ty) <= 1,
      `tapping ${tx},${ty} landed on ${got.tx},${got.ty}`
    );
  }
});

test('the corner map still picks exactly as it did — magnifying did not move it', () => {
  const m = mini();
  const view = DESKTOP_VIEW;
  const r = m.rect(view);
  for (const [tx, ty] of [[0, 0], [30, 30], [59, 59]]) {
    const p = tileToMini(tx, ty);
    const got = m.pick(r.x + MINIMAP.PAD + p.x, r.y + MINIMAP.PAD + p.y, view);
    assert.ok(got, `the corner map lost tile ${tx},${ty}`);
    assert.ok(Math.abs(got.tx - tx) + Math.abs(got.ty - ty) <= 1);
  }
});

test('a tap outside the map area of an open overview is a miss, not a wrong tile', () => {
  const m = mini();
  const view = MOBILE_VIEW;
  m.setExpanded(true);
  // The frame itself, and the meadow showing beside the panel: both must come
  // back null so input.js closes rather than travelling somewhere arbitrary.
  assert.equal(m.pick(view.x + 1, view.y + 1, view), null);
  assert.equal(m.pick(view.x + view.w - 1, view.y + view.h - 1, view), null);
});

test('expanded is a plain switch, and it starts closed', () => {
  const m = mini();
  assert.equal(m.expanded, false, 'the overview was open before anybody asked');
  assert.equal(m.toggleExpanded(), true);
  assert.equal(m.expanded, true);
  assert.equal(m.toggleExpanded(), false);
  assert.equal(m.setExpanded(true), true);
  assert.equal(m.setExpanded(0), false, 'setExpanded did not coerce');
});
