// test/creature-movement.test.mjs — docs/CREATURE-MOVEMENT.md, both halves.
//
// Two bugs the owner spotted, and the rules that close them:
//
//   1. THE SATYR IN THE SKY. A creature may be outside the map in exactly three
//      states — arriving, leaving, offstage — and in every other state its
//      position is clamped. The clamp is on the WRITE, not on any one producer
//      of targets, so these tests are written to attack the writer: they hand
//      grounded agents targets in the sky and assert the sky stays empty.
//
//   2. WALKING ON WATER. Water is species-specific. The naiad dwells in it, the
//      centaur and the satyr take a crossing, and the unicorn stops at the
//      brink. There is a test per species, against the actual predicate the
//      game runs rather than a second copy of the rule.
//
// The volume the doc asks for — several thousand creature-seconds with homes on
// EDGE AND CORNER TILES, the case a casual playthrough is least likely to reach
// — is in `the rim watch` below.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Bestiary, Agent, CREATURES, CREATURE_BY_ID,
  OFFMAP_STATES, TRANSIT_TILES, FADE_TILES,
  WATER_RULE, WATER_RULES, waterRuleFor,
} from '../js/creatures.js';
import { Fields } from '../js/fields.js';
import * as creatures from '../js/creatures.js';
import * as catalog from '../js/catalog.js';
import { makePassable, CROSSING_IDS } from '../js/main.js';
import { World } from '../js/world.js';
import { frontNeighbour, FRONT_SIDES, toScreen } from '../js/iso.js';
import { PALETTE } from '../js/palette.js';
import { installCanvas, createCanvas } from '../tools/headless-canvas.mjs';
import { creatureFrame } from '../js/art/creatures.js';

// render.js wants a canvas, so it comes in after the software one is installed.
installCanvas();
const render = await import('../js/render.js');

const W = 20;
const H = 20;
const newFields = () => new Fields({ w: W, h: H });

/** The tiles a casual playthrough least often reaches. Four corners, four edges. */
const RIM_HOMES = [
  [0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1], // corners
  [W >> 1, 0], [W >> 1, H - 1], [0, H >> 1], [W - 1, H >> 1], // edge midpoints
];

const onRim = (tx, ty) => tx === 0 || ty === 0 || tx === W - 1 || ty === H - 1;

/** The invariant, as one sentence. */
function assertGrounded(v, where) {
  if (OFFMAP_STATES.has(v.state)) return;
  assert.ok(
    v.x >= 0 && v.x <= W - 1 && v.y >= 0 && v.y <= H - 1,
    `${v.id} was at (${v.x.toFixed(3)}, ${v.y.toFixed(3)}) in state '${v.state}' — ${where}`
  );
}

/** Step the whole layer, checking every agent every tick. */
function drive(b, seconds, dt, where) {
  let ticks = 0;
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    b.fields.tick(dt);
    b.update(dt);
    for (const a of b.agents) {
      assertGrounded(a.view(), where);
      ticks++;
    }
  }
  return ticks * dt;
}

// ---------------------------------------------------------------------------
// 1. The satyr in the sky
// ---------------------------------------------------------------------------

test('the three off-map states are named, and they are the only three', () => {
  assert.deepEqual([...OFFMAP_STATES].sort(), ['arriving', 'leaving', 'offstage']);
  // Every state the Agent's own update loop can be in, taken from the switch.
  const grounded = ['idle', 'wander', 'travel', 'perform'];
  for (const s of grounded) assert.equal(OFFMAP_STATES.has(s), false, `'${s}' licenses the sky`);
});

test('the rim watch: thousands of creature-seconds with homes on edge and corner tiles', () => {
  // Every home, every wander target and every route is forced on to the RIM of
  // the map, because that is where the reported bug lives and where a casual
  // playthrough almost never goes. A creature that spends an hour walking the
  // very edge of the world is the hardest case there is, and it is one the
  // player can genuinely produce by planting in a corner.
  const fields = newFields();
  const b = new Bestiary({ fields, seed: 91, passable: (tx, ty) => onRim(tx, ty) });

  // Settle everything on a rim tile, in turn, and let it live there.
  let seconds = 0;
  for (const [hx, hy] of RIM_HOMES) {
    for (const c of CREATURES) {
      const st = b.state.get(c.id);
      st.rungIndex = 2;
      st.rung = 'settles';
      st.home = { tx: hx, ty: hy };
      const a = b.agents.find((g) => g.creature.id === c.id && !g.companion);
      a.state = 'idle';
      a.x = hx;
      a.y = hy;
      a.homeTile = st.home;
      a.desaturated = false;
      a.visitLeft = Infinity;
      a.hold = 0.4;
    }
    seconds += drive(b, 90, 0.05, `settled at (${hx}, ${hy})`);
  }

  assert.ok(
    seconds >= 3000,
    `only ${seconds.toFixed(0)} creature-seconds simulated — the doc asks for several thousand`
  );
});

test('the rim watch, arriving and leaving: the transit is the only time off the map', () => {
  const fields = newFields();
  const b = new Bestiary({ fields, seed: 77, passable: (tx, ty) => onRim(tx, ty) });
  let seconds = 0;
  let sawArriving = false;
  let sawLeaving = false;
  let sawOffMap = false;

  for (const [hx, hy] of RIM_HOMES) {
    for (const c of CREATURES) {
      const st = b.state.get(c.id);
      st.rungIndex = 1; // visits: it walks in at dusk and wanders back off
      st.rung = 'visits';
      st.home = { tx: hx, ty: hy };
      const a = b.agents.find((g) => g.creature.id === c.id && !g.companion);
      a.enter(st.home, W, H, 20, b.zoning, b.passableFor(c.id));
    }
    const steps = 2400; // long enough to arrive, wander, run out of stay, leave
    for (let i = 0; i < steps; i++) {
      fields.tick(0.05);
      b.update(0.05);
      for (const a of b.agents) {
        const v = a.view();
        assertGrounded(v, `visiting (${hx}, ${hy})`);
        if (v.state === 'arriving') sawArriving = true;
        if (v.state === 'leaving') sawLeaving = true;
        if (v.inset < 0) sawOffMap = true;
        seconds += 0.05;
      }
    }
  }

  assert.ok(sawArriving, 'nothing ever arrived — the test is not exercising the transit');
  assert.ok(sawLeaving, 'nothing ever left — the test is not exercising the transit');
  assert.ok(sawOffMap, 'nothing was ever off the map — the transit is not happening at all');
  assert.ok(seconds >= 3000, `only ${seconds.toFixed(0)} creature-seconds simulated`);
});

test('the clamp is on the WRITE, so a target in the sky still cannot get there', () => {
  // The point of a choke point rather than a patch. `_wanderTarget` is not the
  // only thing that can produce a position, so the invariant is not enforced
  // there: it is enforced where the position is stored. This hands a grounded
  // agent legs that go straight off the map — the shape of any future pathing
  // bug — and asserts none of them lands.
  const b = new Bestiary({ fields: newFields(), seed: 3, passable: () => true });
  const a = b.agents[0];
  const env = {
    reducedMotion: false,
    homeRadius: 4,
    passable: () => true,
    zoning: b.zoning,
    emit: () => {},
  };
  const sky = [[-5, -5], [25, 10], [10, -4], [-2, 21], [W - 0.01, H - 0.01], [-0.4, 0]];
  for (const [tx, ty] of sky) {
    a.state = 'wander';
    a.pose = 'walk';
    a.x = 3;
    a.y = 3;
    a.route = [];
    a._leg(tx, ty, 3);
    for (let i = 0; i < 400; i++) {
      a.update(0.05, env);
      assertGrounded(a.view(), `after a leg aimed at (${tx}, ${ty})`);
    }
  }
});

test('a companion at a corner home is not placed in the sky', () => {
  // The second individual stands a little off its mate's shoulder — which at
  // home (0, 0) is y = -0.4, grounded, idle, and standing on nothing at all.
  // Loaded from a save, so this is the path a returning player takes.
  const b = new Bestiary({ fields: newFields(), seed: 5, passable: () => true });
  b.hydrate({ satyr: { rungIndex: 3, home: { tx: 0, ty: 0 }, beats: [], name: 'Marsyas' } });
  const comp = b.agents.find((a) => a.companion);
  assert.ok(comp, 'no companion was created — the test is not testing anything');
  assertGrounded(comp.view(), 'a companion loaded on to a corner home');
});

test('a wander target sits inside the tile that was actually checked', () => {
  // The latent hole the doc names: `_wanderTarget` validates the ROUNDED tile
  // and used to hand back the raw fractional point. Rounding bounds that point
  // to within half a tile of the centre, so it always LOOKS legal — but half a
  // tile is the boundary, the far side of which is a tile nobody approved, and
  // at the rim of the map that neighbour is sky. Hence the two assertions: the
  // point must be strictly inside its own tile, and at a rim home it must be
  // inside the map, which the raw fractional version was not.
  const b = new Bestiary({ fields: newFields(), seed: 8, passable: () => true });
  const a = b.agents[0];
  let sawEdgeTile = false;
  for (const [hx, hy] of RIM_HOMES) {
    a.x = hx;
    a.y = hy;
    for (let i = 0; i < 400; i++) {
      const t = a._wanderTarget({ tx: hx, ty: hy }, 4, () => true, b.zoning);
      const rx = Math.round(t.x);
      const ry = Math.round(t.y);
      assert.ok(rx >= 0 && ry >= 0 && rx < W && ry < H, `target tile (${rx}, ${ry}) is off the map`);
      assert.ok(
        Math.abs(t.x - rx) <= 0.45 && Math.abs(t.y - ry) <= 0.45,
        `target (${t.x}, ${t.y}) straddles the boundary of tile (${rx}, ${ry})`
      );
      assert.ok(
        t.x >= 0 && t.x <= W - 1 && t.y >= 0 && t.y <= H - 1,
        `target (${t.x}, ${t.y}) is a legal TILE at a position out over the sky`
      );
      if (rx === 0 || ry === 0 || rx === W - 1 || ry === H - 1) sawEdgeTile = true;
    }
  }
  assert.ok(sawEdgeTile, 'no target ever landed on an edge tile — the test never reached the case');
});

// ---------------------------------------------------------------------------
// The fade
// ---------------------------------------------------------------------------

test('the transit fades across the boundary instead of walking over the sky', () => {
  const b = new Bestiary({ fields: newFields(), seed: 21, passable: () => true });
  const a = b.agents.find((g) => g.creature.id === 'satyr');

  // Arriving, from off the map at a corner.
  a.enter({ tx: 0, ty: 0 }, W, H, 30, null, null);
  assert.equal(a.state, 'arriving');
  assert.ok(a.inset() <= -TRANSIT_TILES + 1e-9, `the entrance starts at inset ${a.inset()}`);
  assert.equal(a.fade(), 0, 'a creature appears at full strength out over the sky');

  const env = { reducedMotion: true, homeRadius: 4, passable: () => true, zoning: null, emit: () => {} };
  let sawPartial = false;
  for (let i = 0; i < 2000; i++) {
    a.update(0.05, env);
    const v = a.view();
    // The rule, both ways: out past the fade span nothing is drawn at all, and
    // anywhere on the map the creature is fully solid.
    if (v.inset <= -FADE_TILES) assert.equal(v.fade, 0, `visible at inset ${v.inset}`);
    if (v.inset >= 0) assert.equal(v.fade, 1, `not solid at inset ${v.inset} (state ${v.state})`);
    if (v.fade > 0 && v.fade < 1) sawPartial = true;
    if (v.state !== 'arriving') break;
  }
  assert.ok(sawPartial, 'the arrival never faded — it popped in');

  // And a grounded creature is never anything but solid.
  a.state = 'idle';
  a.x = 5;
  a.y = 5;
  assert.equal(a.fade(), 1);

  // Leaving, back out the same way.
  a.leave(W, H);
  assert.equal(a.state, 'leaving');
  let sawFadingOut = false;
  for (let i = 0; i < 4000 && a.state === 'leaving'; i++) {
    a.update(0.05, env);
    const v = a.view();
    if (v.inset <= -FADE_TILES) assert.equal(v.fade, 0, `still visible at inset ${v.inset}`);
    if (v.fade > 0 && v.fade < 1) sawFadingOut = true;
  }
  assert.ok(sawFadingOut, 'the exit never faded — it walked off in full colour');
  assert.equal(a.state, 'offstage');
  assert.equal(a.fade(), 0);
});

test('the fade is a function of distance, not of time', () => {
  // So a paused game, a slow-motion game and a creature that stops halfway all
  // draw it at exactly the strength its position says.
  const a = new Agent(CREATURE_BY_ID.get('naiad'), 1, { mapW: W, mapH: H });
  a.state = 'leaving';
  for (const [x, want] of [[-FADE_TILES, 0], [-FADE_TILES * 2, 0], [-0.5, 0.5], [0, 1], [4, 1]]) {
    a._place(x, 5);
    assert.equal(Math.abs(a.fade() - want) < 1e-9, true, `at x=${x} the fade was ${a.fade()}`);
  }
});

// ---------------------------------------------------------------------------
// The fade, in pixels
// ---------------------------------------------------------------------------

/** One creature on an empty glade, drawn at the given fade. Returns the frame. */
function drawCreatureAtFade(fade) {
  const n = W * H;
  const sc = {
    mapW: W,
    mapH: H,
    terrainVersion: 1,
    levels: new Int8Array(n),
    terrain: () => null,
    objects: [],
    creatures: [
      {
        tx: 7,
        ty: 7,
        art: creatureFrame('satyr', 'idle', 'se', 0),
        footprint: [1, 1],
        shadow: false,
        fade,
      },
    ],
  };
  const cv = createCanvas(640, 400);
  const r = render.createRenderer(cv, { reducedMotion: true, maxScale: 1 });
  r.setScene(sc);
  r.centreOnTile(7, 7, true);
  r.requestDraw();
  r.frame(0);
  return cv._data;
}

/** Pixels differing from the same frame drawn with no creature at all. */
function creaturePixels(fade) {
  const withIt = drawCreatureAtFade(fade);
  const without = drawCreatureAtFade(0); // fade 0 draws nothing
  let n = 0;
  for (let i = 0; i < withIt.length; i += 4) {
    if (
      withIt[i] !== without[i] ||
      withIt[i + 1] !== without[i + 1] ||
      withIt[i + 2] !== without[i + 2]
    ) {
      n++;
    }
  }
  return n;
}

test('a fully faded creature is not drawn at all', () => {
  assert.equal(creaturePixels(0), 0);
});

test('the fade thins the creature out, monotonically, in pixels', () => {
  const solid = creaturePixels(1);
  assert.ok(solid > 100, `a solid satyr covered only ${solid} pixels — nothing was drawn`);
  let last = solid;
  for (const f of [0.8, 0.6, 0.4, 0.2]) {
    const n = creaturePixels(f);
    assert.ok(n > 0, `at fade ${f} the creature vanished entirely`);
    assert.ok(n <= last, `fade ${f} drew ${n} pixels, more than the step above it (${last})`);
    last = n;
  }
  assert.ok(last < solid * 0.5, `the faintest step still covered ${last} of ${solid} pixels`);
});

test('the fade is a DISSOLVE, so the frame stays palette-pure', () => {
  // SPEC §3 and RESEARCH A9.4: alpha blending is the one thing that produces
  // colours palette.js never authored, and it is why the ghost preview is
  // stippled rather than blended. A creature fading through the dusk would put
  // a whole extra blend ladder into every frame it appeared in.
  const allowed = new Set(PALETTE.keys().map((k) => PALETTE.get(k).toLowerCase()));
  const strays = new Set();
  for (const f of [1, 0.75, 0.5, 0.25]) {
    const d = drawCreatureAtFade(f);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const hex =
        '#' +
        d[i].toString(16).padStart(2, '0') +
        d[i + 1].toString(16).padStart(2, '0') +
        d[i + 2].toString(16).padStart(2, '0');
      if (!allowed.has(hex)) strays.add(`${hex} at fade ${f}`);
    }
  }
  assert.deepEqual([...strays], [], 'the fade blended colours that are not in palette.js');
});

// ---------------------------------------------------------------------------
// 2. Water — the table in CREATURE-MOVEMENT.md §2
// ---------------------------------------------------------------------------

const k = (x, y) => `${x},${y}`;

function stubWorld({ wet = [], objects = {}, painters = {} } = {}) {
  const wetSet = new Set(wet.map(([x, y]) => k(x, y)));
  return {
    inBounds: (x, y) => x >= 0 && y >= 0 && x < W && y < H,
    isWet: (x, y) => wetSet.has(k(x, y)),
    objectAt: (x, y) => objects[k(x, y)] || null,
    groundPainterAt: (x, y) => painters[k(x, y)] || null,
  };
}

/** The predicate the game actually runs, not a second copy of the rule. */
const predicate = (world) => makePassable(world, catalog, creatures);

test('the water table covers every creature, with a legal rule each', () => {
  for (const c of CREATURES) {
    const rule = waterRuleFor(c.id);
    assert.ok(WATER_RULES.includes(rule), `${c.id} has water rule '${rule}'`);
  }
  // The four the doc tabulates, verbatim.
  assert.equal(WATER_RULE.naiad, 'dweller');
  assert.equal(WATER_RULE.centaur, 'ford');
  assert.equal(WATER_RULE.satyr, 'ford');
  assert.equal(WATER_RULE.unicorn, 'never');
});

test('naiad — dweller: she enters her own pool freely', () => {
  const pass = predicate(stubWorld({ wet: [[3, 3]] }));
  assert.equal(pass(3, 3, 'naiad'), true, 'the naiad was shut out of the water she IS');
  assert.equal(pass(2, 2, 'naiad'), true, 'and dry land is still dry land');
});

test('centaur — ford: open water no, a crossing yes', () => {
  const bare = predicate(stubWorld({ wet: [[3, 3]] }));
  assert.equal(bare(3, 3, 'centaur'), false, 'a centaur waded open water');
  const forded = predicate(
    stubWorld({ wet: [[3, 3]], painters: { '3,3': 'rocky-ford' } })
  );
  assert.equal(forded(3, 3, 'centaur'), true, 'the rocky ford is not a ford');
});

test('satyr — ford: same rule, and the crossings are what make it true', () => {
  const bare = predicate(stubWorld({ wet: [[3, 3]] }));
  assert.equal(bare(3, 3, 'satyr'), false);
  const bridged = predicate(
    stubWorld({ wet: [[3, 3]], objects: { '3,3': { id: 'level-bridge' } } })
  );
  assert.equal(bridged(3, 3, 'satyr'), true, 'the bridge is not a bridge');
});

test('unicorn — never: she comes to the brink, and a bridge does not change that', () => {
  const wet = [[3, 3]];
  assert.equal(predicate(stubWorld({ wet }))(3, 3, 'unicorn'), false);
  // `never` means never. The horn-dip is a beat at the water's edge, so a
  // crossing is not a loophole — it would put her in the pool by the back door.
  for (const id of CROSSING_IDS) {
    const pass = predicate(stubWorld({ wet, objects: { '3,3': { id } } }));
    assert.equal(pass(3, 3, 'unicorn'), false, `the unicorn crossed on a ${id}`);
  }
  assert.equal(predicate(stubWorld({ wet }))(3, 2, 'unicorn'), true, 'the brink is still walkable');
});

test('every crossing in the catalogue is real, and works in both of its shapes', () => {
  // Two shapes, because the catalogue has both: the bridge and the stepping
  // stones are OBJECTS standing on a tile, the rocky ford is a GROUND PAINTER
  // that lays water down and records itself. Asking only one makes two of the
  // three quietly decorative.
  for (const id of CROSSING_IDS) {
    assert.ok(catalog.byId(id), `the catalogue has no '${id}' — the crossing set is stale`);
    const asObject = predicate(stubWorld({ wet: [[4, 4]], objects: { '4,4': { id } } }));
    const asPainter = predicate(stubWorld({ wet: [[4, 4]], painters: { '4,4': id } }));
    assert.equal(asObject(4, 4, 'centaur'), true, `${id} as an object is not passable`);
    assert.equal(asPainter(4, 4, 'centaur'), true, `${id} as a ground painter is not passable`);
  }
});

test('every crossing can actually be BUILT on water — against the real World', () => {
  // THE HOLE THE STUB LEFT. Every crossing test above hands `stubWorld` a tile
  // that is already both wet and occupied, which no player can ever produce:
  // the stub has no placement rules, so it cannot see a catalogue entry that
  // REFUSES to stand in water. Two of the three did. `level-bridge` and
  // `stepping-stones` declare no `ground`, so `requires` defaulted to 'land'
  // and the real World answered "that will not stand in water" — leaving the
  // whole per-species ford payoff resting on `rocky-ford` alone, and making
  // the stepping stones' own blurb ("or shallow water") false.
  //
  // So this one uses the real World and the real placement rules, and it
  // checks BOTH orders a player can build in, because `requires:'land'` broke
  // each of them separately.
  for (const id of CROSSING_IDS) {
    const def = catalog.byId(id);
    // The rocky ford is a GROUND PAINTER — it lays the water down and records
    // itself as the painter, so it has no "build it on water" order to test:
    // painting it IS the water arriving. The other two are objects.
    const isPainter = !!def.ground;

    // Order A: dig the pond, then lay the crossing into it.
    const a = new World({ seed: 1 });
    a.paint('still-pool', 10, 10);
    assert.equal(a.isWet(10, 10), true, 'the pond did not take');
    if (isPainter) {
      a.paint(id, 10, 10);
      assert.equal(a.groundPainterAt(10, 10), id, `${id} did not take over the pond`);
    } else {
      const canA = a.canPlace(id, 10, 10);
      assert.ok(canA.ok, `${id} cannot be built on water: ${canA.reason}`);
      a.place(id, 10, 10);
    }
    assert.equal(predicate(a)(10, 10, 'centaur'), true, `${id} is built on water and still not a crossing`);
    assert.equal(predicate(a)(11, 11, 'centaur'), false, 'open water became passable too');

    if (isPainter) continue;

    // Order B: lay the crossing on dry ground, then flood under it. This is the
    // order that broke separately — world.js refuses to paint water beneath an
    // object whose `requires` is 'land' ("would be under water").
    const b = new World({ seed: 1 });
    assert.ok(b.place(id, 4, 4), `${id} would not go down on dry land`);
    b.paint('still-pool', 4, 4);
    assert.equal(b.isWet(4, 4), true, `water would not flow under a ${id}`);
    assert.ok(b.objectAt(4, 4), `the ${id} was lost when the water came`);
    assert.equal(predicate(b)(4, 4, 'centaur'), true, `${id} is wet, standing, and still not a crossing`);
  }
});

test('the crossing opt-in survives normalisation', () => {
  // js/main.js documents `crossing: true` as the way a future catalogue entry
  // joins the set without editing CROSSING_IDS. `normalise` in catalog.js is
  // an explicit whitelist and simply dropped the key, so that opt-in was dead
  // on arrival: a new crossing would have declared itself and been ignored.
  for (const id of CROSSING_IDS) {
    assert.equal(catalog.byId(id).crossing, true, `${id} lost its crossing flag in normalise`);
  }
  // And it is the flag, not the id list, that the predicate actually reads.
  const invented = { id: 'not-in-the-id-list', crossing: true };
  const pass = makePassable(
    { inBounds: () => true, isWet: () => true, objectAt: () => invented, groundPainterAt: () => null },
    { byId: () => invented },
    creatures
  );
  assert.equal(pass(1, 1, 'centaur'), true, 'crossing:true did not make a crossing');
});

test('a crossing on dry land is walkable, and an ordinary object is not', () => {
  const pass = predicate(
    stubWorld({ objects: { '4,4': { id: 'stepping-stones' }, '5,5': { id: 'ash-tree' } } })
  );
  assert.equal(pass(4, 4, 'satyr'), true, 'stepping stones across wet grass are still a path');
  assert.equal(pass(5, 5, 'satyr'), false, 'a creature walked through a tree');
});

test('a connector is still the way up, for every species', () => {
  // The elevation half of the same predicate. `Zoning.stepOk` allows a step of
  // one level only across a connector, and that rule can never fire if this
  // predicate refuses the ramp tile for the ordinary reason that something is
  // standing on it. Every ramp in the garden would be a wall with a staircase
  // painted on it.
  const connector = catalog.CATALOG.find((d) => d.connector);
  assert.ok(connector, 'the catalogue has no connectors at all');
  const pass = predicate(stubWorld({ objects: { '6,6': { id: connector.id } } }));
  for (const c of CREATURES) assert.equal(pass(6, 6, c.id), true, `${c.id} cannot use a ${connector.id}`);
});

test('out of bounds is impassable for everyone, water or not', () => {
  const pass = predicate(stubWorld({}));
  for (const c of CREATURES) {
    assert.equal(pass(-1, 5, c.id), false);
    assert.equal(pass(W, 5, c.id), false);
    assert.equal(pass(5, -1, c.id), false);
    assert.equal(pass(5, H, c.id), false);
  }
});

test('with no species named the predicate is exactly what it was before the table', () => {
  // Back-compat, and it matters: tools/playtest.mjs and half the suite call
  // this as a plain two-argument predicate, and a host that has not been told
  // about species must not have its naiad walled out of her own pool.
  const pass = predicate(stubWorld({ wet: [[3, 3]] }));
  assert.equal(pass(3, 3), true, 'water became impassable for an un-named caller');
});

test('a species-blind host still works — the Bestiary asks, it does not require', () => {
  // `passable: () => true` is what every existing test passes. The third
  // argument is offered, never demanded.
  const b = new Bestiary({ fields: newFields(), seed: 2, passable: () => true });
  const pass = b.passableFor('unicorn');
  assert.equal(typeof pass, 'function');
  assert.equal(pass(3, 3), true);
});

test('a unicorn is never sited in a pond, and a naiad may be', () => {
  // The table doing its work where a HOME is chosen, not only where a foot is
  // put down: bestSpotFor filters by the creature's own predicate.
  const fields = newFields();
  const wet = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x > 8) wet.push([x, y]);
  const world = stubWorld({ wet });
  const b = new Bestiary({ fields, seed: 6, passable: predicate(world) });
  for (let i = 0; i < 40; i++) b.update(1);
  const uni = b.bestSpotFor('unicorn', 'settles');
  assert.ok(uni, 'the unicorn could not be sited anywhere at all');
  assert.equal(world.isWet(uni.tx, uni.ty), false, `the unicorn was sited in water at ${uni.tx},${uni.ty}`);
  // And the water is not off limits to the one creature it belongs to.
  const naiadPass = b.passableFor('naiad');
  assert.equal(naiadPass(12, 4), true, 'the naiad was shut out of the whole lake');
});

test('a full run with real water never puts the wrong feet in it', () => {
  // The behavioural end of the same claim, over a few thousand creature-seconds
  // with a genuine pond in the middle of the glade.
  const fields = newFields();
  const wet = [];
  for (let y = 7; y <= 12; y++) for (let x = 7; x <= 12; x++) wet.push([x, y]);
  const world = stubWorld({ wet });
  const pass = predicate(world);
  const b = new Bestiary({ fields, seed: 44, passable: pass });

  for (const c of CREATURES) {
    const st = b.state.get(c.id);
    st.rungIndex = 2;
    st.rung = 'settles';
    // Settle each one right on the shore, so every wander has the pond in reach.
    st.home = { tx: 6, ty: 9 };
    const a = b.agents.find((g) => g.creature.id === c.id && !g.companion);
    a.state = 'idle';
    a.x = 6;
    a.y = 9;
    a.homeTile = st.home;
    a.visitLeft = Infinity;
    a.hold = 0.3;
  }

  let seconds = 0;
  for (let i = 0; i < 12000; i++) {
    fields.tick(0.05);
    b.update(0.05);
    for (const a of b.agents) {
      const v = a.view();
      assertGrounded(v, 'walking beside the pond');
      seconds += 0.05;
      if (OFFMAP_STATES.has(v.state)) continue;
      const tx = Math.round(v.x);
      const ty = Math.round(v.y);
      if (!world.isWet(tx, ty)) continue;
      assert.notEqual(
        waterRuleFor(v.creature), 'never',
        `${v.creature} stood in the pond at (${tx}, ${ty}) — she comes to the brink and stops`
      );
      if (waterRuleFor(v.creature) === 'ford') {
        assert.fail(`${v.creature} forded open water at (${tx}, ${ty}) with no crossing there`);
      }
    }
  }
  assert.ok(seconds >= 3000, `only ${seconds.toFixed(0)} creature-seconds simulated`);
});

// ---------------------------------------------------------------------------
// The cross-module front-neighbour agreement
// ---------------------------------------------------------------------------

test('the front neighbours are (tx+1, ty) and (tx, ty+1) — and every module agrees', () => {
  // The bug the elevation owner flagged: label `dx:+1` as 'ne' and `dx:-1` as
  // 'sw' and FRONT_SIDES resolves to (tx, ty+1) and (tx-1, ty). Under this
  // projection (tx-1, ty) is BEHIND, so that ships cliff faces — and the cave
  // mouths set into them (ELEVATION.md) — on the hidden side of every hill.
  //
  // iso.frontNeighbour is canonical. Assert it against the PROJECTION first, so
  // this test is anchored to the geometry rather than to another opinion.
  const here = toScreen(5, 5, null);
  for (const side of FRONT_SIDES) {
    const n = frontNeighbour(5, 5, side);
    const there = toScreen(n.tx, n.ty, null);
    assert.ok(there.y > here.y, `the '${side}' neighbour is not DOWN-screen — it is behind`);
  }
  assert.deepEqual(frontNeighbour(5, 5, 'se'), { tx: 6, ty: 5 });
  assert.deepEqual(frontNeighbour(5, 5, 'sw'), { tx: 5, ty: 6 });

  // world.js's exposedFaces reports the same sides with the same deltas. The
  // existing suite checks the LABELS; this checks what they resolve to, which
  // is the half that was wrong.
  const w = new World({ seed: 18 });
  w.raise(5, 5);
  const faces = w.exposedFaces(5, 5);
  assert.deepEqual(faces.map((f) => f.side).sort(), ['se', 'sw']);
  for (const f of faces) {
    const n = frontNeighbour(5, 5, f.side);
    assert.deepEqual(
      { tx: 5 + f.dx, ty: 5 + f.dy }, n,
      `world.js resolves '${f.side}' to (${5 + f.dx}, ${5 + f.dy}); iso.js says (${n.tx}, ${n.ty})`
    );
  }
  // And the tile BEHIND grows no face of its own from this raise.
  assert.deepEqual(w.exposedFaces(4, 5), [], '(tx-1, ty) is behind and must not face the camera');
});
