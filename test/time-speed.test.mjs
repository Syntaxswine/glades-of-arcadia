// test/time-speed.test.mjs — the clock lever, and the law it must not break.
//
// The speed control has exactly one way to be wrong, and it is the obvious
// implementation: scaling the timestep instead of the step COUNT. That version
// works — the garden visibly runs faster — and it silently changes the
// simulation, because growth curves, field ageing and creature legs all
// integrate per step. A 4x garden would be a coarser garden, and `_leg`
// overshoots corners when the leg gets longer.
//
// Nothing else in the game can catch that. `simSchedule` is exported for this
// test alone, and this is the test.

import test from 'node:test';
import assert from 'node:assert/strict';

import { simSchedule, SPEEDS } from '../js/main.js';

const SIM_DT = 1 / 20;

test('THE LAW: the step is never scaled, at any speed', () => {
  for (const s of SPEEDS) {
    const due = simSchedule(0, 1 / 60, s);
    assert.equal(due.dt, SIM_DT, `speed ${s} handed back a ${due.dt}s step`);
  }
});

// A whole real second, fed a frame at a time, is how the loop actually does
// it — and the accumulator has to carry the remainder across frames or the
// count comes out short.
const run = (speed, frames = 60) => {
  let acc = 0;
  let steps = 0;
  for (let f = 0; f < frames; f++) {
    const due = simSchedule(acc, 1 / 60, speed);
    acc = due.acc;
    steps += due.steps;
  }
  return steps;
};

test('a faster speed runs proportionally more steps over the same real time', () => {
  // WITHIN ONE STEP, and the slack is not slop — it is float, and it is worth
  // knowing about. Sixty additions of 1/60 come to 0.9999999999999999, so a
  // one-second run owes 19.999... steps and banks the remainder for the next
  // second. The counts below are therefore 20 / 39 / 79 and not 20 / 40 / 80.
  //
  // Nothing is lost: the shortfall is carried, not dropped (see the remainder
  // test), so it comes back on the very next frame. A test that demanded exact
  // multiples would be asserting that IEEE 754 does not exist, and would have
  // to be "fixed" by rounding — which WOULD drop time.
  for (const [speed, want] of [[1, 20], [2, 40], [4, 80]]) {
    const got = run(speed);
    assert.ok(
      Math.abs(got - want) <= 1,
      `${speed}x ran ${got} steps in a real second, wanted ${want} ± 1`
    );
  }
});

test('4x for one second is 1x for four seconds — same step size, same count', () => {
  // The claim the whole feature rests on: a sped-up garden is a garden left
  // running longer, not a different simulation. If this ever fails by more than
  // the float step, the control is a cheat.
  const march = (speed, frames) => {
    let acc = 0;
    const sizes = [];
    for (let f = 0; f < frames; f++) {
      const due = simSchedule(acc, 1 / 60, speed);
      acc = due.acc;
      for (let n = 0; n < due.steps; n++) sizes.push(due.dt);
    }
    return sizes;
  };
  const fast = march(4, 60);
  const slow = march(1, 240);
  assert.ok(Math.abs(fast.length - slow.length) <= 1, `${fast.length} steps vs ${slow.length}`);
  // The part that must be EXACT: every step either way is the same size. This
  // is the law; the count above is arithmetic.
  assert.deepEqual(new Set([...fast, ...slow]), new Set([SIM_DT]));
});

test('the catch-up guard scales, or the speed the player asked for is thrown away', () => {
  // REGRESSION. With a fixed cap of 5, a 4x frame of 1/10s owes 8 steps and the
  // loop would drop 3 of them EVERY frame — the button would read 4x and the
  // garden would run at about 2.5x. The cap is a spiral-of-death guard, not a
  // speed limit.
  const due = simSchedule(0, 0.1, 4);
  assert.equal(due.steps, 8);
  assert.equal(due.dropped, false);
});

test('the guard still bites, and drops the debt rather than compounding it', () => {
  // A frame far past anything the clamp allows. It must cap, and it must not
  // bank the leftover — that is the spiral this guard exists to stop.
  const due = simSchedule(0, 10, 1);
  assert.equal(due.steps, 5);
  assert.equal(due.dropped, true);
  assert.equal(due.acc, 0);
});

test('an unknown speed falls back to 1, it does not multiply by garbage', () => {
  // The value can arrive from a restored save or a host, and `undefined * dt`
  // is NaN — which would poison the accumulator permanently and freeze the
  // garden with no error anywhere.
  for (const bad of [0, -2, 3, 100, NaN, undefined, null, '4']) {
    const due = simSchedule(0, 1 / 60, bad);
    assert.deepEqual(
      { steps: due.steps, dt: due.dt },
      { steps: simSchedule(0, 1 / 60, 1).steps, dt: SIM_DT },
      `speed ${String(bad)} was not treated as 1x`
    );
    assert.ok(Number.isFinite(due.acc), `speed ${String(bad)} poisoned the accumulator`);
  }
});

test('the remainder is carried, not rounded away', () => {
  // 1/60 of a second owes no step at all; three of them owe one. A schedule
  // that dropped the leftover would lose a third of every second.
  let due = simSchedule(0, 1 / 60, 1);
  assert.equal(due.steps, 0);
  assert.ok(due.acc > 0.016 && due.acc < 0.017);
  due = simSchedule(due.acc, 1 / 60, 1);
  assert.equal(due.steps, 0);
  due = simSchedule(due.acc, 1 / 60, 1);
  assert.equal(due.steps, 1);
});

test('the speeds on offer start at 1 and only go up', () => {
  // A pause belongs to `game.pause`, which stops the whole frame. A 0 in this
  // list would be a second, silent way to pause that keeps rendering — two
  // owners for one state, which is how this game loses its camera.
  assert.equal(SPEEDS[0], 1);
  assert.deepEqual([...SPEEDS].sort((a, b) => a - b), [...SPEEDS]);
  assert.ok(SPEEDS.every((s) => Number.isInteger(s) && s >= 1));
});
