// facing.test.mjs — which way round a thing is placed. BACKLOG §4k.
//
// The owner: *"there are a few tiles that you should be able to alter the
// direction on. Currently the middle scroll wheel scrolls up and down the map,
// I think it would be better suited to pick between what direction an object
// faces in space."*
//
// ---------------------------------------------------------------------------
// THE PART THAT MUST NOT BE GOT WRONG is not the wheel. It is that every
// garden anyone has already made loads exactly as it did before, and keeps
// saving exactly as it did before, until they turn something.
//
// So `facing` is written only when non-zero, and the first three tests are
// about that one `if`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World, SAVE_VERSION } from '../js/world.js';
import { CATALOG, byId, facingsOf, turns } from '../js/catalog.js';
import { FACINGS, facingMirrored, facingDrawing, clampFacing } from '../js/iso.js';

const TURNABLE = CATALOG.filter(turns);
const FIXED = CATALOG.filter((d) => !turns(d));

// ---------------------------------------------------------------------------
// The save, both directions.
// ---------------------------------------------------------------------------

test('an untouched garden serialises exactly as it did before facing existed', () => {
  const w = new World({ w: 12, h: 12, seed: 7 });
  w.place('herm', 3, 3);
  w.place('clipped-hedge', 5, 5); // turnable, but not turned
  const objects = w.serialize(1000).objects;
  for (const o of objects) {
    assert.ok(!('facing' in o), `${o.id} wrote a facing key it did not need`);
  }
  assert.equal(w.serialize(1000).version, SAVE_VERSION);
});

test('a turned object writes its facing, and reads it back', () => {
  const w = new World({ w: 12, h: 12, seed: 7 });
  w.place('clipped-hedge', 5, 5, { facing: 1 });
  const rec = w.serialize(1000).objects.find((o) => o.id === 'clipped-hedge');
  assert.equal(rec.facing, 1);

  const back = World.deserialize(w.serialize(1000), 1000);
  assert.equal(back.objects.find((o) => o.id === 'clipped-hedge').facing, 1);
});

test('a v2 save loads with everything as it was drawn', () => {
  // A save written before facing existed: no `facing` key anywhere, version 2.
  const w = new World({ w: 12, h: 12, seed: 7 });
  w.place('clipped-hedge', 5, 5, { facing: 1 });
  const data = w.serialize(1000);
  data.version = 2;
  for (const o of data.objects) delete o.facing;

  const back = World.deserialize(data, 1000);
  for (const o of back.objects) {
    assert.ok(!o.facing, `${o.id} came back turned from a save that never said so`);
  }
  assert.deepEqual(back.loadWarnings, [], 'an old garden must load without complaint');
});

test('a facing survives a round trip through JSON, not just through objects', () => {
  const w = new World({ w: 12, h: 12, seed: 3 });
  w.place('stone-bench', 2, 2, { facing: 1 });
  const back = World.deserialize(JSON.parse(JSON.stringify(w.serialize(1000))), 1000);
  assert.equal(back.objects[0].facing, 1);
});

// ---------------------------------------------------------------------------
// The clamp. A facing that the catalogue does not offer must not exist, from
// any direction — a caller that forgot to check, or a save from a version in
// which the thing turned and this one in which it does not.
// ---------------------------------------------------------------------------

test('a thing that does not turn cannot be given a facing', () => {
  const w = new World({ w: 12, h: 12, seed: 1 });
  const o = w.place('doric-column', 4, 4, { facing: 1 });
  assert.ok(!o.facing, 'a column is a cylinder; there is nothing to turn');
});

test('a facing out of range wraps into range rather than being dropped', () => {
  const w = new World({ w: 12, h: 12, seed: 1 });
  assert.equal(w.place('clipped-hedge', 1, 1, { facing: 2 }).facing ?? 0, 0);
  assert.equal(w.place('clipped-hedge', 3, 1, { facing: 3 }).facing, 1);
  assert.equal(w.place('clipped-hedge', 5, 1, { facing: -1 }).facing, 1);
});

test('a save claiming a facing the catalogue no longer offers is clamped', () => {
  const w = new World({ w: 12, h: 12, seed: 1 });
  w.place('doric-column', 4, 4);
  const data = w.serialize(1000);
  data.objects[0].facing = 3; // as if the column used to turn
  const back = World.deserialize(data, 1000);
  assert.ok(!back.objects[0].facing);
});

test('clampFacing is total — no input produces a facing out of range', () => {
  for (const n of [1, 2, 3, 4]) {
    for (const f of [-9, -1, 0, 1, 2, 3, 4, 9, NaN, undefined, null, '2', 1.6]) {
      const out = clampFacing(f, n);
      assert.ok(Number.isInteger(out) && out >= 0 && out < n, `clampFacing(${f}, ${n}) = ${out}`);
    }
  }
});

// ---------------------------------------------------------------------------
// The catalogue's own rules.
// ---------------------------------------------------------------------------

test('only square footprints turn', () => {
  // Mirroring the screen's x axis swaps the two tile axes, so a 2x1 would
  // mirror into a 1x2 — which means transposing the footprint through
  // canPlace, the collision test and the depth key. Not done; refused instead.
  const bad = TURNABLE.filter((d) => d.footprint[0] !== d.footprint[1]);
  assert.deepEqual(bad.map((d) => `${d.id} ${d.footprint.join('x')}`), []);
});

test('the turnable list is short, and is the things with a direction', () => {
  assert.ok(TURNABLE.length >= 10, `only ${TURNABLE.length} turn — did TURNS get lost?`);
  assert.ok(TURNABLE.length <= 40, `${TURNABLE.length} turn — "a few tiles", said the owner`);
  // The three families named in catalog.js §TURNS, spot-checked so a rename
  // fails here with the id on it rather than as a silent absence.
  for (const id of ['dry-stone-wall', 'clipped-hedge', 'stone-bench', 'exedra', 'hedge-arch']) {
    assert.ok(turns(byId(id)), `${id} stopped turning`);
  }
  // ...and the rotational forms, which must NOT, or the wheel is a control
  // that visibly does nothing.
  for (const id of ['doric-column', 'ionic-column', 'amphora', 'birdbath', 'topiary-sphere']) {
    assert.ok(!turns(byId(id)), `${id} turns, but it looks the same from every side`);
  }
});

test('everything declares a legal facing count', () => {
  for (const d of CATALOG) {
    const n = facingsOf(d);
    assert.ok(n >= 1 && n <= FACINGS, `${d.id}: facings ${n}`);
  }
  assert.ok(FIXED.length > TURNABLE.length, 'most of the catalogue is rotational');
});

// ---------------------------------------------------------------------------
// The projection. Four facings, two drawings.
// ---------------------------------------------------------------------------

test('every other facing is a mirror, and every pair shares a drawing', () => {
  assert.deepEqual([0, 1, 2, 3].map(facingMirrored), [false, true, false, true]);
  assert.deepEqual([0, 1, 2, 3].map(facingDrawing), [0, 0, 1, 1]);
  // Which is the whole economic claim: 1 drawing covers 2 facings, 2 cover 4.
  const drawings = new Set([0, 1, 2, 3].map(facingDrawing));
  assert.equal(drawings.size, 2);
});

// ---------------------------------------------------------------------------
// THE SECOND DRAWING — bit 1 of the facing, and the first placeable to use it.
//
// The owner: *"ramps can go up a hill in any direction."* They could not.
// js/art/decor.js authored one connector drawing and its section header
// claimed the other three orientations were "a horizontal flip and/or a
// re-anchor, which the renderer can do for free". The flip is free and it
// buys the second uphill-AWAY direction; the two that come downhill at the
// camera are a 180-degree rotation, which on screen needs a VERTICAL flip
// too, and this game may never do that because the light is always from the
// upper left. So they are a second drawing.
// ---------------------------------------------------------------------------

// EVERY four-facing connector, not one of them by name. These two tests were
// written against `EARTH_RAMP` because it was the only piece with a second
// drawing — and when the rock scramble got one, neither test noticed it
// existed. Same fault as the elevation probe's `ramps` scene, which had the
// earth ramp hard-coded into it: AN INSTRUMENT BUILT AROUND ONE SUBJECT
// CERTIFIES THAT SUBJECT AND NOTHING ELSE. The list is derived now, so the next
// connector is covered by authoring the art and doing nothing else.

/** Every four-facing sprite the catalogue can reach, as [id, art]. */
async function fourFacingArt() {
  const decor = await import('../js/art/decor.js');
  const props = await import('../js/art/props.js');
  const extras = await import('../js/art/extras.js');
  const reg = new Map();
  for (const table of [decor.DECOR, props.PROPS, extras.EXTRAS]) {
    for (const [k, v] of Object.entries(table || {})) if (v && v.rows) reg.set(k, v);
  }
  const out = [];
  for (const d of CATALOG) {
    if (facingsOf(d) < 4 || !d.art || d.art.kind !== 'sprite') continue;
    const s = reg.get(d.art.wanted) || reg.get(d.art.sprite);
    if (s) out.push([d.id, s]);
  }
  return out;
}

test('a connector has a second drawing, and it is a different picture', async () => {
  const all = await fourFacingArt();
  assert.ok(all.length >= 2, `only ${all.length} four-facing connectors — the list stopped deriving`);
  for (const [id, art] of all) {
    assert.ok(art.back, `${id} lost its back drawing`);
    assert.notEqual(art.rows.join('|'), art.back.rows.join('|'), `${id}'s back is the same picture`);
    // ...and NOT merely its mirror, which is the whole point: if the second
    // drawing were reachable by flipping the first, it would not need to exist.
    const flipped = art.rows.map((r) => r.split('').reverse().join('')).join('|');
    assert.notEqual(flipped, art.back.rows.join('|'), `${id}'s back is only its mirror`);
  }
});

test('the two drawings tilt opposite ways', async () => {
  // The top of the silhouette per column. `square()` puts s = 0 on the N-W
  // edge of the tile and s = 1 on the S-E one, so the away drawing lifts the
  // LEFT of the sprite and the near drawing lifts the RIGHT. Lower y is
  // higher on screen.
  const topAt = (s, x) => {
    let y = 0;
    while (y < s.h && s.rows[y][x] === '.') y++;
    return y;
  };
  for (const [id, art] of await fourFacingArt()) {
    const away = { l: topAt(art, 6), r: topAt(art, 57) };
    const near = { l: topAt(art.back, 6), r: topAt(art.back, 57) };
    assert.ok(away.l < away.r, `${id} away should be high on the left: ${JSON.stringify(away)}`);
    assert.ok(near.r < near.l, `${id} near should be high on the right: ${JSON.stringify(near)}`);
  }
});

test('EVERY CONNECTOR TURNS — a way up you cannot aim is half a way up', () => {
  // THE GUARD THAT WAS MISSING, and the reason the owner had to report this.
  // `rock-scramble` sat at facings 1 for the entire life of the facing wheel:
  // it was simply never added to catalog.js's `TURNS`, and nothing anywhere
  // asked. A connector that cannot be turned is a way up the hill that exists
  // on one of its four sides, with no reason given.
  const stuck = CATALOG.filter((d) => d.tags.includes('connector') && facingsOf(d) < 2);
  assert.deepEqual(
    stuck.map((d) => d.id),
    [],
    'a connector that cannot be turned — add it to TURNS, or to TURNS_FOUR with a back drawing'
  );
});

test('four facings means two drawings — nothing claims four with one', async () => {
  const decor = await import('../js/art/decor.js');
  const props = await import('../js/art/props.js');
  const extras = await import('../js/art/extras.js');
  const reg = new Map();
  for (const table of [decor.DECOR, props.PROPS, extras.EXTRAS]) {
    for (const [k, v] of Object.entries(table || {})) if (v && v.rows) reg.set(k, v);
  }
  for (const d of CATALOG) {
    if (facingsOf(d) < 4 || !d.art || d.art.kind !== 'sprite') continue;
    const s = reg.get(d.art.wanted) || reg.get(d.art.sprite);
    assert.ok(
      s && s.back,
      `${d.id} offers four wheel positions but its art has one drawing — ` +
        `facings 2 and 3 would repeat 0 and 1 and the control would do nothing ` +
        `for half its travel`
    );
  }
});

// ---------------------------------------------------------------------------
// A CONNECTOR IS GROUND, so it casts no contact shadow.
//
// js/main.js has always passed `shadow: def.shadow` to the renderer and
// js/render.js has always honoured `o.shadow === false`. The middle was never
// written: js/catalog.js `normalise` is an explicit whitelist and `shadow` was
// not in it, so the field could only ever be `undefined`. Third consumer in
// this subsystem caught the same way — see `flatFooting`'s own note.
// ---------------------------------------------------------------------------

test('connectors lie in the ground plane and cast no contact shadow', () => {
  const conn = CATALOG.filter((d) => d.connector);
  assert.ok(conn.length >= 4, 'lost the connectors');
  for (const d of conn) {
    assert.equal(d.shadow, false, `${d.id} would sit in a dark pool wider than itself`);
  }
  // ...and NOTHING ELSE changed. The renderer tests `=== false`, so absence
  // means "yes, as before"; a stray `false` here would silently delete the
  // shadow under a statue.
  for (const d of CATALOG) {
    if (d.connector) continue;
    assert.notEqual(d.shadow, false, `${d.id} quietly lost its contact shadow`);
  }
});
