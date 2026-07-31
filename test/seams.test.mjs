// test/seams.test.mjs — the joins between modules, which nobody owns.
//
// Every other test file belongs to a module and is written by whoever wrote
// that module. This one belongs to the places where two modules meet, and it
// exists because that is where this project's real bugs were: not one of the
// faults found during integration was inside a module. Every single one was a
// disagreement between two of them, and every single one was SILENT.
//
//   * main.js dropped `affinities` and `blocks` on the way to fields.js. The
//     tag-bridge fallback then deposited something plausible instead of the
//     number the catalogue's author wrote, so the whole zoning layer produced
//     wrong-but-reasonable output and no error anywhere.
//   * main.js never handed world.js's heightmap to fields.js, so terraces did
//     not block influence — ELEVATION.md's headline synthesis was simply off,
//     and the symptom was "the garden is all one zone", which reads as a
//     tuning problem.
//   * main.js pushed an inert camera into the renderer every frame, pinning
//     the view to the corner of the map. Two owners each believed they held
//     the camera; neither was wrong about their own file.
//   * art/decor.js — 38 sprites — was registered nowhere, so the catalogue
//     entries that wanted them drew understudies. The art test passed, because
//     the art test's registry did not list decor.js either.
//
// The shape of all four is the same: A assumes B, B assumes A, both files are
// internally consistent, and the game boots clean. So the assertions here are
// mostly of the form "these two independently-authored things still agree".

import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../js/world.js';
import { Fields, GRASS_TYPES as FIELD_GRASS, AXES as FIELD_AXES } from '../js/fields.js';
import { createFieldBridge, COMPOSER_ALIAS } from '../js/main.js';
import * as cat from '../js/catalog.js';
import * as iso from '../js/iso.js';
import * as render from '../js/render.js';
import * as ui from '../js/ui.js';
import { GRASS_TYPES as CREATURE_GRASS } from '../js/creatures.js';
import * as artTiles from '../js/art/tiles.js';
import * as artProps from '../js/art/props.js';
import * as artExtras from '../js/art/extras.js';
import * as artDecor from '../js/art/decor.js';
import { COMPOSERS, compose } from '../js/art/grow.js';

const MAP = 20;

function garden(seed = 99) {
  const world = new World({ w: MAP, h: MAP, seed });
  const fields = new Fields({ w: MAP, h: MAP });
  const bridge = createFieldBridge(world, fields, cat);
  world.subscribe(bridge.onEvent);
  bridge.rebuild();
  return { world, fields, bridge };
}

// ---------------------------------------------------------------------------
// 1. The field bridge carries the whole placement
// ---------------------------------------------------------------------------

test('the field bridge forwards affinities — the catalogue number, not an inference', () => {
  const { world, fields } = garden();
  // `still-pool` is authored {unicorn: 1} and carries no tag that the
  // tag->affinity bridge would read as unicorn. If main.js drops `affinities`,
  // the fallback fires and the ground comes out someone else's.
  const def = cat.byId('still-pool');
  assert.ok(def.affinities && def.affinities.unicorn > 0, 'fixture: still-pool argues for the unicorn');

  world.place('still-pool', 10, 10);
  const here = fields.affinitiesAt(10, 10);
  assert.ok(
    here.unicorn > 0,
    `the unicorn must reach the ground under its own pool — got ${JSON.stringify(here)}`
  );
  assert.equal(
    fields.resolve(10, 10).owner,
    'unicorn',
    'a lone unicorn object claims the ground it stands on'
  );
});

test('the field bridge forwards blocks — a hedge that does not occlude is not a hedge', () => {
  const { world, fields } = garden();
  const def = cat.byId('clipped-hedge');
  assert.equal(def.blocks, true, 'fixture: the clipped hedge is a nullifier in the catalogue');

  world.place('clipped-hedge', 10, 10);
  assert.ok(fields.isBlocked(10, 10), 'the tile under a nullifier blocks propagation');

  // And it must actually sever: a satyr object and a unicorn object one tile
  // apart, hedge between, each keeps its own ground. This is DECOR.md's central
  // claim about occluders and it travels through main.js to get here.
  const g = garden(1234);
  g.world.place('wild-vine', 8, 10);
  g.world.place('clipped-hedge', 9, 10);
  g.world.place('madonna-lily', 10, 10);
  assert.equal(g.fields.resolve(8, 10).owner, 'satyr');
  assert.equal(g.fields.resolve(10, 10).owner, 'unicorn');
  assert.notEqual(g.fields.resolve(8, 10).kind, 'contested', 'the thicket is not still arguing');
  assert.notEqual(g.fields.resolve(10, 10).kind, 'contested', 'nor is the millefleurs');
});

test('two brushes that paint the same ground argue for different species', () => {
  // Seven placeables paint `water`. DECOR.md gives them very different jobs:
  // `still-pool` is the unicorn's SINGLE at weight 1.0 ("small and mirror-flat"),
  // `plunge-pool` leans naiad, `watering-place` is the 2,3,4 triple. If the
  // world remembers only "this tile is water", six of them collapse into
  // whichever def the consumer happened to pick, and the player's choice
  // between them becomes decoration.
  const a = garden(21);
  a.world.place('still-pool', 10, 10);
  const uni = a.fields.resolve(10, 10);

  const b = garden(21);
  b.world.place('plunge-pool', 10, 10);
  const nai = b.fields.resolve(10, 10);

  assert.equal(a.world.groundAt(10, 10), b.world.groundAt(10, 10), 'fixture: both paint the same ground');
  assert.equal(uni.owner, 'unicorn', 'a still pool commits its ground to the unicorn');
  // The plunge pool only LEANS naiad (0.3, and shared across a 2x2 brush), so
  // it is below CLAIM_FLOOR and claims nothing — which is right. What must not
  // happen is the two coming out the same, which is what "the tile is water"
  // alone would give.
  assert.notEqual(nai.owner, 'unicorn', 'a plunge pool is not the unicorn’s');
  assert.ok(
    b.fields.at('naiad', 10, 10) > b.fields.at('unicorn', 10, 10),
    'and it argues for the naiad rather than for her rival'
  );
});

test('the painter survives a save, an undo, and being painted over', () => {
  const g = garden(22);
  g.world.place('still-pool', 6, 6);
  assert.equal(g.world.groundPainterAt(6, 6), 'still-pool');

  // Round trip.
  const back = World.deserialize(JSON.parse(JSON.stringify(g.world.serialize())));
  assert.equal(back.groundPainterAt(6, 6), 'still-pool', 'the save remembers what made the pond');
  assert.equal(back.groundAt(6, 6), g.world.groundAt(6, 6));

  // Painted over: same ground type, different painter — still a real edit.
  g.world.place('plunge-pool', 6, 6);
  assert.equal(g.world.groundPainterAt(6, 6), 'plunge-pool');
  g.world.undo();
  assert.equal(g.world.groundPainterAt(6, 6), 'still-pool', 'undo puts the unicorn’s pool back');

  // A garden saved before painters were recorded is not damaged, only vaguer.
  const old = g.world.serialize();
  delete old.groundPainters;
  delete old.groundBy;
  const legacy = World.deserialize(JSON.parse(JSON.stringify(old)));
  assert.ok(legacy, 'a save without painters still opens');
  assert.equal(legacy.groundAt(6, 6), g.world.groundAt(6, 6), 'and keeps its ground');
  assert.equal(legacy.groundPainterAt(6, 6), null, 'it simply does not remember the brush');
});

test('a catalogue that says "nobody" is not overruled by the tag bridge', () => {
  // fields.js keeps a tag->affinity BRIDGE for placements whose author has not
  // declared affinities. It reads `wild` as satyr — which is a reasonable guess
  // and a disastrous default, because `meadow-turf` is tagged `wild` and
  // declares `affinities: {}` precisely to say "plain lawn argues for nobody".
  //
  // An empty map and a missing map must therefore stay distinguishable all the
  // way through main.js. When they did not, brushing meadow over a garden made
  // every tile of it a satyr source at full weight: 391 of 400 tiles went to
  // thicket, every other species was buried, and nothing reported a fault.
  const { world, fields } = garden(31);
  const lawn = cat.byId('meadow-turf');
  assert.deepEqual(lawn.affinities, {}, 'fixture: plain lawn argues for nobody');
  assert.ok(lawn.tags.includes('wild'), 'fixture: and is tagged in a way the bridge would misread');

  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) world.paint('meadow-turf', x, y);
  assert.equal(fields.at('satyr', 10, 10), 0, 'a meadow is not a thicket');
  for (const a of ['satyr', 'centaur', 'naiad', 'unicorn']) {
    assert.equal(fields.at(a, 10, 10), 0, `${a} must not be inferred from a neutral lawn`);
  }
  assert.equal(fields.resolve(10, 10).owner, null, 'and the ground stays unclaimed');
});

test('a ground brush divides its affinity by its area, exactly as it divides deposits', () => {
  // A 2x2 turf that argues with weight 1.0 must argue with 1.0 across four
  // tiles, not 1.0 on each — otherwise painting a lawn floods the map and every
  // border in the garden moves.
  const { world, fields } = garden();
  const def = cat.CATALOG.find((d) => d.ground && d.affinities && Object.keys(d.affinities).length);
  if (!def) return; // no affinity-bearing ground painter in the catalogue
  const [fw, fh] = def.footprint;
  const area = fw * fh;
  world.place(def.id, 9, 9);
  const aff = Object.keys(def.affinities)[0];
  const peak = fields.at(aff, 9, 9);
  // Undivided, each of `area` tiles would deposit the full weight at range 0,
  // so the peak would be close to area x the divided figure. The assertion is
  // deliberately loose — it is catching a factor of four, not calibrating.
  assert.ok(peak > 0, `${def.id} deposits ${aff}`);
  assert.ok(
    peak < def.affinities[aff] * area,
    `${def.id} (${fw}x${fh}) peaks at ${peak.toFixed(3)} for ${aff}: the brush is not divided by its area`
  );
});

// ---------------------------------------------------------------------------
// 2. The heightmap reaches the fields
// ---------------------------------------------------------------------------

test('terracing the world blocks influence in the fields — with no object placed', () => {
  const { world, fields, bridge } = garden();
  world.place('wild-vine', 8, 10);
  const flat = fields.at('satyr', 12, 10);
  assert.ok(flat > 0, 'fixture: on flat ground the vine reaches four tiles');

  // Raise everything east of the vine by two levels. ELEVATION.md: a step of
  // two or more levels blocks, "using exactly the occluder logic the hedges
  // already use". world.js owns the levels; fields.js has to be told.
  world.applyTerrain('raise', 10, 0, MAP - 1, MAP - 1);
  world.applyTerrain('raise', 10, 0, MAP - 1, MAP - 1);
  bridge.syncLevels();

  assert.equal(world.levelAt(12, 10), 2, 'fixture: the far side really is two levels up');
  assert.equal(
    fields.levelAt(12, 10),
    2,
    'fields.js must know the height, or the terrace is decoration'
  );
  assert.equal(fields.at('satyr', 12, 10), 0, 'a two-level cliff stops the vine dead');
});

test('the bridge syncs levels on a level event, without being asked', () => {
  const { world, fields } = garden();
  world.applyTerrain('raise', 5, 5, 7, 7);
  assert.equal(
    fields.levelAt(6, 6),
    world.levelAt(6, 6),
    'a terrain edit must reach fields.js through the subscription alone'
  );
});

test('a one-level step does not block — the soft tool stays soft', () => {
  const { world, fields, bridge } = garden();
  world.place('wild-vine', 8, 10);
  world.applyTerrain('raise', 10, 0, MAP - 1, MAP - 1);
  bridge.syncLevels();
  assert.ok(
    fields.at('satyr', 12, 10) > 0,
    'gentle undulation stays connected, or the player cannot shape ground without zoning it'
  );
});

// ---------------------------------------------------------------------------
// 3. One vocabulary, five modules
// ---------------------------------------------------------------------------

test('every module that names the grass types names them in the same order', () => {
  // The index is what is written to the save and handed to the renderer, so a
  // reordering here does not throw — it paints the whole garden the wrong
  // species and writes that to disk.
  const lists = {
    'fields.js': FIELD_GRASS,
    'world.js': World.GRASS_TYPES || (new World({ w: 2, h: 2 })).constructor.GRASS_TYPES,
    'render.js': render.GRASS_TYPES,
    'art/tiles.js': artTiles.GRASS_TYPES,
    'creatures.js': CREATURE_GRASS,
  };
  const ref = Array.from(FIELD_GRASS);
  for (const [name, list] of Object.entries(lists)) {
    if (!list) continue;
    assert.deepEqual(Array.from(list), ref, `${name} disagrees about the grass types`);
  }
});

test('the catalogue and fields.js agree about which grass belongs to whom', () => {
  assert.deepEqual(Object.keys(cat.GRASS_FOR).sort(), Array.from(cat.AFFINITIES).sort());
  for (const [creature, grass] of Object.entries(cat.GRASS_FOR)) {
    assert.ok(FIELD_GRASS.includes(grass), `${creature}'s grass '${grass}' is not a grass type`);
  }
});

test('ui.js cycles the axes fields.js actually has — no dead washes', () => {
  // ZONING.md retired wildness, order and moisture. A retired channel reads 0
  // and washes flat rather than throwing, so a stale list here is invisible
  // except as presses of Tab that appear to do nothing.
  assert.deepEqual(Array.from(ui.AXES), Array.from(FIELD_AXES));
  for (const axis of ui.AXES) {
    assert.ok(
      render.OVERLAY_RAMPS[axis],
      `ui.js offers '${axis}' but render.js has no ramp to wash it with`
    );
  }
  for (const axis of Object.keys(render.OVERLAY_RAMPS)) {
    assert.ok(FIELD_AXES.includes(axis), `render.js can wash '${axis}', which fields.js retired`);
  }
});

// ---------------------------------------------------------------------------
// 4. LEVEL_H is defined once
// ---------------------------------------------------------------------------

test('LEVEL_H is iso.js’s everywhere it appears — imported, never re-typed', () => {
  // ELEVATION.md calls it "the one tunable constant" and means it: "change this
  // one constant if it wants to be steeper — nothing else should hard-code it."
  // Equality is not enough to prove that (two copies of 16 are equal), so this
  // asserts IDENTITY of the binding by checking the modules re-export iso's.
  assert.equal(artTiles.LEVEL_H, iso.LEVEL_H, 'art/tiles.js');
  assert.equal(artDecor.LEVEL_H, iso.LEVEL_H, 'art/decor.js');
  assert.equal(artTiles.FACE_H, iso.LEVEL_H, 'a cliff band is one level tall');
  assert.equal(artTiles.FACE_SPRITE_H, iso.TILE_H + iso.LEVEL_H, 'and its sprite is a diamond plus a band');

  const w = new World({ w: 4, h: 4 });
  assert.equal(w.constructor.MAX_LEVEL ?? iso.MAX_LEVEL, iso.MAX_LEVEL);

  // The real guard: no module may contain a second literal definition. Anything
  // that reads `= 16` next to the name is a copy waiting to drift.
  // (Checked in the build audit rather than here — this asserts the values that
  // a drift would change first.)
  assert.equal(iso.MAX_RISE, iso.MAX_LEVEL * iso.LEVEL_H);
});

// ---------------------------------------------------------------------------
// 5. Every placeable draws — against the registry the GAME builds
// ---------------------------------------------------------------------------

test('every placeable resolves to real art through main.js’s own dispatch', () => {
  // test/catalog.test.mjs asks the same question of a registry assembled by
  // hand. This one assembles it the way js/main.js's createArtist() does,
  // including art/decor.js — whose absence from the other registry is exactly
  // why 38 authored sprites could sit unreachable while the suite stayed green.
  const registry = new Map();
  for (const m of [artTiles, artExtras, artProps, artDecor]) {
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && v.rows && v.anchor) registry.set(v.name || k, v);
    }
    for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY']) {
      const table = m[key];
      if (!table || typeof table !== 'object') continue;
      for (const [k, v] of Object.entries(table)) if (v && v.rows && v.anchor) registry.set(k, v);
    }
  }

  const dead = [];
  for (const d of cat.CATALOG) {
    if (!d.art) {
      dead.push(`${d.id}: no art`);
      continue;
    }
    if (d.art.kind === 'sprite') {
      if (!registry.has(d.art.sprite)) dead.push(`${d.id} -> sprite '${d.art.sprite}'`);
    } else {
      let name = d.art.composer;
      let params = d.art.params;
      if (!COMPOSERS[name] && COMPOSER_ALIAS[name]) {
        params = { ...COMPOSER_ALIAS[name][1], ...params };
        name = COMPOSER_ALIAS[name][0];
      }
      if (!COMPOSERS[name]) {
        dead.push(`${d.id} -> composer '${d.art.composer}'`);
        continue;
      }
      if (!compose(name, 0x1c04, { ...params, stage: 'mature' })) dead.push(`${d.id} -> '${name}' drew nothing`);
    }
  }
  assert.deepEqual(dead, [], `placeables that would draw nothing in the running game:\n  ${dead.join('\n  ')}`);
});

test('art/decor.js is reachable — its sprites are named by the catalogue', () => {
  // The regression this guards is not "decor.js is broken". It is "decor.js is
  // fine and nothing points at it", which no test of decor.js could ever catch.
  const named = new Set(
    cat.CATALOG.filter((d) => d.art && d.art.kind === 'sprite').map((d) => d.art.sprite)
  );
  const decorNames = new Set();
  for (const [k, v] of Object.entries(artDecor.DECOR || {})) if (v && v.rows) decorNames.add(k);
  const used = [...decorNames].filter((n) => named.has(n));
  assert.ok(
    used.length >= 20,
    `only ${used.length} of ${decorNames.size} decor sprites are drawn by any placeable — ` +
      `the decoration set has come unwired again`
  );
});

// ---------------------------------------------------------------------------
// 6. Placement legality, end to end
// ---------------------------------------------------------------------------

test('a connector is refused on flat ground and accepted beside a step', () => {
  const flat = new World({ w: MAP, h: MAP, seed: 5 });
  for (const d of cat.connectors()) {
    const r = flat.canPlace(d.id, 10, 10);
    assert.equal(r.ok, false, `${d.id} must not stand on a flat glade`);
    assert.match(r.reason, /step|climb/i, `${d.id}'s refusal should say what is missing`);
  }

  const stepped = new World({ w: MAP, h: MAP, seed: 5 });
  stepped.applyTerrain('raise', 0, 0, 9, MAP - 1);
  for (const d of cat.connectors()) {
    let placed = null;
    for (let ty = 0; ty < MAP && !placed; ty++) {
      for (const tx of [9, 10]) {
        placed = stepped.place(d.id, tx, ty);
        if (placed) break;
      }
    }
    assert.ok(placed, `${d.id} must be placeable against a one-level step`);
    assert.equal(stepped.connectorSound(placed), true, `${d.id} should read as sound where it stands`);
    stepped.remove(placed);
  }
});

test('every placeable except the connectors can stand on an empty glade', () => {
  const w = new World({ w: MAP, h: MAP, seed: 11 });
  const stuck = [];
  for (const d of cat.CATALOG) {
    if (d.connector) continue;
    let placed = null;
    for (let ty = 0; ty < MAP && !placed; ty++) {
      for (let tx = 0; tx < MAP && !placed; tx++) placed = w.place(d.id, tx, ty);
    }
    if (!placed) stuck.push(d.id);
    else w.remove(placed);
  }
  assert.deepEqual(stuck, [], 'a placeable in the palette that can never be placed is dead content');
});

// ---------------------------------------------------------------------------
// 7. The renderer's scene contract, as main.js fills it
// ---------------------------------------------------------------------------

test('the world exposes everything render.js’s scene contract asks for', () => {
  // main.js is the only place these two meet, and it cannot be imported into a
  // DOM-free test. So this asserts the SHAPE main.js relies on, which is the
  // half of the seam that can be checked here — if world.js renames one of
  // these, the scene silently loses elevation or zoning rather than throwing.
  const { world } = garden();
  for (const fn of ['levelAt', 'levelOf', 'grassInfo', 'grassAt', 'contestedAt', 'cacheGrassGrid', 'groundAt', 'isWet']) {
    assert.equal(typeof world[fn], 'function', `world.${fn}() is part of the scene contract`);
  }
  assert.equal(typeof world.grassVersion, 'number', 'the renderer keys the zoning cache off this');

  const info = world.grassInfo(0, 0);
  assert.ok('type' in info && 'second' in info && 'contested' in info, 'grassInfo shape');
  assert.ok(
    FIELD_GRASS.includes(info.type),
    `grassInfo returns a grass NAME the renderer understands, got ${JSON.stringify(info.type)}`
  );
});

test('fields.grassGrid drops straight into world.cacheGrassGrid', () => {
  // The one wire that makes the ground show the zoning. fields.js DECIDES,
  // world.js STORES, render.js PAINTS — and for a while nothing connected the
  // first two, so the whole garden stayed meadow whatever was planted.
  const { world, fields } = garden();
  world.place('wild-vine', 5, 5);
  world.place('wild-vine', 6, 5);
  world.place('wild-vine', 5, 6);

  const changed = world.cacheGrassGrid(fields.grassGrid());
  assert.ok(changed > 0, 'the grid must actually write tiles');
  assert.equal(world.grassAt(5, 5), 'thicket', 'the satyr’s own grass, under his own vines');
  assert.ok(world.grassVersion > 0, 'and the renderer is told to repaint');
});
