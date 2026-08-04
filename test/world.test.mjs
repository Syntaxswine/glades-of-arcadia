// test/world.test.mjs — placement, undo, growth and the save file (SPEC §10).
//
// SPEC §0's cosy guarantees are not slogans, they are assertions:
//   nothing is taken from you   -> undo restores the SAME tree, not a new one
//   nothing decays              -> tick can only move a plant forward
//   never lose a garden         -> a corrupt or foreign save loads what it can
//   64 steps of undo            -> bounded, and a batch is one step

import test from 'node:test';
import assert from 'node:assert/strict';

import { World, DAY_MS, UNDO_LIMIT, SAVE_VERSION, loadOrCreate, isConnector } from '../js/world.js';
import { CATALOG, byId, isGroundPainter, GROUND_TYPES } from '../js/catalog.js';

/** A localStorage stand-in. */
function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get size() {
      return m.size;
    },
    _raw: m,
  };
}

test('placing and removing costs nothing and is exact', () => {
  const w = new World({ seed: 7 });
  const o = w.place('oak', 5, 5);
  assert.ok(o && o.uid, 'place returned nothing');
  assert.equal(w.objectAt(5, 5), o);
  assert.ok(w.removeAt(5, 5));
  assert.equal(w.objectAt(5, 5), null);
  // No counter, no currency, no cooldown anywhere in the world's own state.
  const json = JSON.stringify(w.serialize());
  assert.ok(!/cost|currency|coin|money|energy|cooldown/i.test(json));
});

test('two things cannot stand on the same tile', () => {
  const w = new World({ seed: 7 });
  w.place('oak', 5, 5);
  const r = w.canPlace('oak', 5, 5);
  assert.equal(r.ok, false);
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0, 'a refusal must say something warm, not nothing');
});

test('a refusal never deletes what is already there', () => {
  // The single place the world says no: a paint that would drown something.
  const w = new World({ seed: 7 });
  w.place('oak', 5, 5);
  const before = w.objects.length;
  w.paint('still-pool', 4, 4); // 2x2, would cover (5,5)
  assert.equal(w.objects.length, before, 'the oak was drowned instead of refused');
  assert.ok(w.objectAt(5, 5), 'the oak is gone');
});

test('undo brings back the SAME tree, not a new one', () => {
  const w = new World({ seed: 7 });
  const oak = w.place('oak', 5, 5);
  const snapshot = { ...oak };
  w.advance(DAY_MS * 40); // let it grow
  const grown = { ...w.objectAt(5, 5) };
  w.removeAt(5, 5);
  assert.equal(w.objectAt(5, 5), null);
  assert.ok(w.undo());
  const back = w.objectAt(5, 5);
  assert.ok(back, 'undo did not restore the tree');
  assert.equal(back.uid, snapshot.uid, 'a different uid — that is a new tree');
  assert.equal(back.seed, snapshot.seed, 'a different seed — it would look different');
  assert.equal(back.placedAt, snapshot.placedAt);
  assert.equal(back.stage, grown.stage, 'it came back younger than it was');
});

test('the undo stack is bounded at exactly 64 and a batch is one step', () => {
  const w = new World({ seed: 7 });
  for (let i = 0; i < UNDO_LIMIT + 20; i++) w.place('oak', i % 20, Math.floor(i / 20));
  let steps = 0;
  while (w.canUndo) {
    w.undo();
    steps++;
    assert.ok(steps <= UNDO_LIMIT + 1, 'the undo stack is not bounded');
  }
  assert.equal(steps, UNDO_LIMIT);

  const b = new World({ seed: 7 });
  b.batch(() => {
    b.place('oak', 1, 1);
    b.place('oak', 2, 2);
    b.place('oak', 3, 3);
  });
  assert.equal(b.objects.length, 3);
  b.undo();
  assert.equal(b.objects.length, 0, 'a batch must undo as one step');
});

test('growth only ever moves forward, and never dies', () => {
  const w = new World({ seed: 7 });
  const oak = w.place('oak', 5, 5);
  const order = ['sprout', 'young', 'mature'];
  let last = order.indexOf(oak.stage);
  for (let d = 0; d < 200; d++) {
    w.advance(DAY_MS);
    const i = order.indexOf(w.objectAt(5, 5).stage);
    assert.ok(i >= last, `stage went backwards on day ${d}`);
    last = i;
  }
  assert.equal(last, order.length - 1, 'an oak never reached maturity');
  assert.ok(w.objectAt(5, 5), 'the oak died');
  // And it stays there. Nothing decays.
  w.advance(DAY_MS * 500);
  assert.equal(w.objectAt(5, 5).stage, 'mature');
});

test('ground painting writes the ground type, not an object', () => {
  const w = new World({ seed: 7 });
  const gravel = CATALOG.find((p) => isGroundPainter(p) && p.ground === 'gravel');
  w.place(gravel.id, 3, 3);
  assert.equal(w.groundAt(3, 3), 'gravel');
  assert.equal(w.objectAt(3, 3), null, 'a painter left an object behind');
});

test('countTag is exact and respects the radius', () => {
  const w = new World({ seed: 7 });
  w.place('oak', 10, 10);
  w.place('ash-tree', 12, 10);
  w.place('ash-tree', 10, 17);
  assert.equal(w.countTag('tree', 10, 10, 3), 2);
  assert.equal(w.countTag('tree', 10, 10, 8), 3);
  assert.equal(w.countTag('ash', 10, 10, 3), 1);
});

test('subscribe emits the events fields.js needs', () => {
  const w = new World({ seed: 7 });
  const seen = [];
  w.subscribe((ev) => seen.push(ev.type));
  const oak = w.place('oak', 5, 5);
  w.paint('gravel-walk', 8, 8);
  w.advance(DAY_MS * 200);
  w.removeAt(5, 5);
  w.undo();
  for (const t of ['place', 'ground', 'grow', 'remove', 'undo']) {
    assert.ok(seen.includes(t), `never emitted '${t}' — fields would drift`);
  }
  assert.ok(oak);
});

// ---------------------------------------------------------------------------
// The save file
// ---------------------------------------------------------------------------

function busyWorld() {
  const w = new World({ seed: 42 });
  w.place('oak', 4, 4);
  w.place('plane-tree', 9, 3);
  w.place('reed-bed', 12, 12);
  w.paint('still-pool', 11, 11);
  w.paint('gravel-walk', 2, 2);
  w.place('herm', 6, 14);
  w.advance(DAY_MS * 30);
  w.extra.journal = { satyr: 'settles' };
  w.extra.camera = { x: -288, y: 163 };
  return w;
}

test('save / load round-trips a garden exactly', () => {
  const w = busyWorld();
  const store = memStore();
  w.save(store, 'k');
  const back = World.load(store, 'k');
  assert.ok(back, 'World.load returned nothing');
  assert.deepEqual(back.serialize().objects, w.serialize().objects);
  assert.deepEqual(back.serialize().ground, w.serialize().ground);
  assert.equal(back.seed, w.seed);
  assert.deepEqual(back.extra, w.extra, 'extra is an opaque passenger and must survive');
  assert.deepEqual(back.loadWarnings || [], []);
});

test('a save is small enough to write continuously', () => {
  const w = busyWorld();
  const bytes = JSON.stringify(w.serialize()).length;
  assert.ok(bytes < 64 * 1024, `${bytes} bytes is too much to autosave every four seconds`);
});

test('groundTypes is a legend in the save, so reordering them cannot corrupt a garden', () => {
  const w = new World({ seed: 1 });
  w.paint('still-pool', 5, 5);
  const save = w.serialize();
  assert.ok(Array.isArray(save.groundTypes), 'the save must carry its own legend');
  // Rewrite the save as if GROUND_TYPES had been reordered under it.
  const reordered = [...GROUND_TYPES].reverse();
  const remap = save.ground.map((i) => reordered.indexOf(save.groundTypes[i]));
  const foreign = { ...save, groundTypes: reordered, ground: remap };
  const back = World.deserialize(foreign);
  assert.equal(back.groundAt(5, 5), 'water');
  assert.equal(back.groundAt(0, 0), w.groundAt(0, 0));
});

test('deserialize never throws — it loads what it can and names the rest', () => {
  const w = busyWorld();
  const save = w.serialize();
  save.objects.push({ uid: 9001, id: 'a-tree-from-a-later-version', tx: 1, ty: 1, seed: 1, placedAt: 0 });
  save.objects.push({ uid: 9002, id: 'oak', tx: 999, ty: -4, seed: 1, placedAt: 0 });
  const back = World.deserialize(save);
  assert.ok(back);
  assert.equal(back.objectAt(1, 1), null, 'an unknown placeable should be skipped');
  assert.equal((back.loadWarnings || []).length, 2, 'both bad objects should be named');
  assert.ok(back.objectAt(4, 4), 'the rest of the garden must still be there');
});

test('rubbish in localStorage does not lose the garden', () => {
  const store = memStore();
  for (const junk of ['', '{', 'null', '[]', '{"app":"not-arcadia"}', '{"app":"arcadia"}']) {
    store.setItem('k', junk);
    const back = World.load(store, 'k');
    assert.ok(back === null || back instanceof World, `load('${junk}') returned something odd`);
  }
  const w = loadOrCreate(store, 'k', { seed: 3 });
  assert.ok(w instanceof World, 'loadOrCreate must always hand back a world');
});

test('the save declares its own version', () => {
  assert.equal(new World({ seed: 1 }).serialize().version, SAVE_VERSION);
  assert.equal(new World({ seed: 1 }).serialize().app, 'arcadia');
});

test('time away is credited, but capped', () => {
  const w = new World({ seed: 5 });
  w.place('oak', 5, 5);
  const store = memStore();
  w.save(store, 'k');
  const raw = JSON.parse(store.getItem('k'));
  raw.savedAt = Date.now() - 1000 * 60 * 60 * 24 * 365; // a year
  store.setItem('k', JSON.stringify(raw));
  const back = World.load(store, 'k');
  assert.ok(back.time <= DAY_MS * 31, `credited ${back.time / DAY_MS} garden days for a year away`);
  assert.ok(back.time > 0, 'a glade should mature a little while you are gone');
});

test('the same seed builds the same garden', () => {
  const a = new World({ seed: 2024 });
  const b = new World({ seed: 2024 });
  for (const w of [a, b]) {
    w.place('oak', 3, 3);
    w.place('oak', 4, 8);
    w.place('willow', 9, 9);
  }
  assert.deepEqual(
    a.objects.map((o) => o.seed),
    b.objects.map((o) => o.seed),
    'per-object art seeds are not reproducible from the world seed'
  );
  const c = new World({ seed: 2025 });
  c.place('oak', 3, 3);
  assert.notEqual(c.objects[0].seed, a.objects[0].seed, 'two world seeds gave the same tree');
});

test('every placeable in the catalogue can actually be placed somewhere', () => {
  for (const p of CATALOG) {
    const w = new World({ seed: 11 });
    // Water objects need water under them; give the whole map some.
    if (p.requires === 'water') w.paint('marsh-shallows', 4, 4);
    // A connector needs a STEP to climb — a ramp lying on flat ground is not a
    // ramp (docs/ELEVATION.md). "Somewhere it can be placed" therefore has to
    // include somewhere with a cliff in it, exactly as it already includes
    // somewhere with water in it.
    if (isConnector(p)) w.raise(9, 8, 12, 12);
    const target = p.requires === 'water' ? [4, 4] : [8, 8];
    const r = w.canPlace(p.id, target[0], target[1]);
    assert.ok(r.ok, `${p.id} cannot be placed on a clear map: ${r.reason}`);
    assert.ok(w.place(p.id, target[0], target[1]), `${p.id} refused a legal placement`);
  }
  assert.ok(byId('oak'));
});

// ---------------------------------------------------------------------------
// TURNING SOMETHING ALREADY STANDING — the owner's mobile rotate
// ---------------------------------------------------------------------------
//
// The owner: *"rotate is still not implemented for mobile. perhaps if you tap
// on the completed building with the build tool it rotates the object."*
//
// Until this existed, a facing could only be chosen BEFORE placing — the wheel
// turns what you are holding — so on a phone, which has no wheel, every hedge
// went down facing whichever way it was drawn and stayed that way for ever.

test('a placed thing can be turned, and it comes back round', () => {
  const w = new World({ w: 12, h: 12, seed: 5 });
  const turnable = CATALOG.filter((p) => (p.facings || 1) > 1 && p.group !== 'terrain');
  assert.ok(turnable.length, 'fixture: something in the catalogue turns');
  const def = turnable[0];

  assert.ok(w.place(def.id, 4, 4), `fixture: ${def.id} can be placed on open ground`);
  const obj = w.objectAt(4, 4);
  const n = def.facings;

  // A full cycle returns to where it started, and `facing` is ABSENT at zero —
  // the save format writes it only when non-zero, so a stray `facing: 0` would
  // make a round trip differ byte for byte from the save that produced it.
  assert.equal(obj.facing ?? 0, 0);
  assert.ok(!('facing' in obj), 'facing 0 was written rather than left absent');
  for (let i = 1; i < n; i++) {
    assert.equal(w.turnAt(4, 4), i, `turn ${i} did not land on facing ${i}`);
    assert.equal(w.objectAt(4, 4).facing, i);
  }
  assert.equal(w.turnAt(4, 4), 0, 'the last turn did not come back round to 0');
  assert.ok(!('facing' in w.objectAt(4, 4)), 'coming back to 0 left a stray facing');
});

test('turning never moves a thing or changes what it occupies', () => {
  // THE REASON THIS IS SAFE WITHOUT A LEGALITY CHECK. A facing in this game is
  // a mirror and/or a swap to the back drawing (iso.js §FACING) and never a
  // 90-degree rotation, so a thing that fitted still fits. If a future facing
  // ever DID rotate a footprint, this test is the one that should fail first.
  const w = new World({ w: 12, h: 12, seed: 5 });
  const def = CATALOG.filter((p) => (p.facings || 1) > 1 && p.group !== 'terrain')[0];
  w.place(def.id, 4, 4);
  const before = { ...w.objectAt(4, 4) };
  const countBefore = w.objects.length;
  w.turnAt(4, 4);
  const after = w.objectAt(4, 4);
  assert.equal(after.tx, before.tx);
  assert.equal(after.ty, before.ty);
  assert.equal(after.uid, before.uid, 'turning replaced the object instead of turning it');
  assert.equal(after.id, before.id);
  assert.equal(w.objects.length, countBefore, 'turning changed how many things are in the garden');
});

test('a thing with one drawing refuses to turn, and says so by answering null', () => {
  // This is what lets input.js fall through to the ordinary "there is already
  // something here" explanation instead of a bench silently ignoring a tap.
  const w = new World({ w: 12, h: 12, seed: 5 });
  const fixed = CATALOG.filter((p) => (p.facings || 1) === 1 && p.group !== 'terrain' && p.group !== 'ground');
  assert.ok(fixed.length, 'fixture: something in the catalogue does not turn');
  let placed = null;
  for (const d of fixed) if (w.place(d.id, 6, 6)) { placed = d; break; }
  assert.ok(placed, 'fixture: one of them could be placed');
  assert.equal(w.turnAt(6, 6), null);
});

test('turning empty ground is nothing at all', () => {
  const w = new World({ w: 12, h: 12, seed: 5 });
  assert.equal(w.turnAt(3, 3), null);
  assert.equal(w.turn(999), null, 'an unknown uid turned something');
});

test('a turn is undoable, and undoing it restores the exact previous facing', () => {
  const w = new World({ w: 12, h: 12, seed: 5 });
  const def = CATALOG.filter((p) => (p.facings || 1) > 1 && p.group !== 'terrain')[0];
  w.place(def.id, 4, 4);
  w.turnAt(4, 4);
  const turned = w.objectAt(4, 4).facing;
  assert.ok(turned > 0);
  assert.equal(w.undo(), true);
  assert.ok(!('facing' in w.objectAt(4, 4)), 'undo left a facing behind rather than removing it');
  // ...and the object is still there. An undone TURN must not undo the PLACE.
  assert.ok(w.objectAt(4, 4), 'undoing a turn removed the object');
  assert.equal(w.undo(), true);
  assert.equal(w.objectAt(4, 4), null, 'the second undo did not take the placement back');
});

test('a turned facing survives a save and reload', () => {
  const w = new World({ w: 12, h: 12, seed: 5 });
  const def = CATALOG.filter((p) => (p.facings || 1) > 1 && p.group !== 'terrain')[0];
  w.place(def.id, 4, 4);
  const to = w.turnAt(4, 4);
  const back = World.deserialize(w.serialize());
  assert.equal(back.objectAt(4, 4).facing, to, 'the turn was lost in the save');
});
