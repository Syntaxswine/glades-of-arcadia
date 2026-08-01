// test/proving-ground.test.mjs — `?garden=all`, and the promise it makes.
//
// The proving ground is a cheat map that plants a quadrant for each of the four
// species, derived from the ladder rather than authored by hand. The reason it
// is derived is that an authored one goes stale silently: the requirements get
// tuned, the fixture stops satisfying them, and the failure reads as a bug in
// the simulation rather than as a stale test map.
//
// Deriving it only moves the staleness, though — it moves it into the DERIVATION.
// This is the test that catches that: it builds the garden headlessly and holds
// the function to exactly what it promises, which is that every COUNTED demand
// up to `settles` is met and no counted refusal is broken.
//
// It deliberately does NOT assert that the creatures settle. Bands are field
// maths, a patch needs grass to spread over real time, and a beat has to be
// performed — none of those are this function's job and pretending otherwise
// would make the test a weather report.

import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../js/world.js';
import * as cat from '../js/catalog.js';
import * as creatures from '../js/creatures.js';
import { plantProvingGround } from '../js/main.js';
import { MAP_W, MAP_H } from '../js/iso.js';

function build() {
  const world = new World({ w: MAP_W, h: MAP_H, seed: 7 });
  const result = plantProvingGround(world, cat, creatures);
  return { world, result };
}

test('every counted demand is met, in every quadrant', () => {
  const { result } = build();
  assert.deepEqual(
    result.missed,
    [],
    'the proving ground can no longer satisfy the ladder it is derived from'
  );
  assert.ok(result.placed > 20, `only ${result.placed} placements — the fixture built nothing`);
});

test('THE CENTAUR KEEPS HER OPEN RUN — caps are honoured, not just zero-caps', () => {
  // REGRESSION, and the reason the cap handling exists at all. The first
  // version tracked only `at-most 0` and dropped every cap with a number on it,
  // so the centaur's six ash trees (an at-least) all landed inside her
  // `at-most 4 tree within 3` (an at-most) and built the one garden she refuses.
  // The fix was to push the surplus out past the cap's radius, which satisfies
  // both — which is what the two requirements were always describing together.
  const { world } = build();
  const centaur = creatures.CREATURES.find((c) => c.id === 'centaur');
  assert.ok(centaur, 'no centaur');
  const home = { tx: 44, ty: 16 };

  const upto = creatures.RUNGS.slice(0, creatures.RUNGS.indexOf('settles') + 1);
  let checked = 0;
  for (const rung of upto) {
    for (const req of centaur.rungs[rung] || []) {
      if (req.kind !== 'count' || req.dir !== 'at-most') continue;
      checked++;
      const n = world.countTag(req.tag, home.tx, home.ty, req.radius);
      assert.ok(
        n <= req.n,
        `at-most ${req.n} '${req.tag}' within ${req.radius} — the fixture planted ${n}`
      );
    }
  }
  assert.ok(checked > 0, 'the centaur has no at-most requirements — this test is watching nothing');
});

test('the quadrants do not tread on each other', () => {
  // Four species, four corners, and the satyr and the unicorn in particular
  // must not be near enough to break each other (creatures.js proveThesis).
  // Objects are counted per quadrant rather than per species home, because that
  // is the property the map's LAYOUT is responsible for.
  const { world } = build();
  const q = { WN: 0, EN: 0, WS: 0, ES: 0 };
  for (const o of world.objects) {
    q[(o.tx < MAP_W / 2 ? 'W' : 'E') + (o.ty < MAP_H / 2 ? 'N' : 'S')]++;
  }
  for (const [name, n] of Object.entries(q)) {
    assert.ok(n > 0, `quadrant ${name} is empty — a species built nothing`);
  }
});

test('the fixture leaves no undo history', () => {
  // The player's first Ctrl+Z must not begin un-planting the world they were
  // handed. Same rule as the opening glade.
  const { world } = build();
  assert.equal((world.undoStack || []).length, 0);
});
