// test/art.test.mjs — the sprite format, and every sprite in the game through it.
//
// SPEC §10: "sprite format validation (ragged rows rejected, unknown keys
// rejected, anchor bounds)". SPEC §1: zero external assets — every pixel is
// authored as text against js/palette.js's ramps and no other colour exists.
//
// The second half of this file is the part that earns its keep: it walks the
// WHOLE shipped art set — hand-authored tiles, props and creature frames, plus
// a sample of every procedural composer at every growth stage — and lints it.
// A typo in one row of one sprite is otherwise a hole in the map that nobody
// notices until a screenshot.

import test from 'node:test';
import assert from 'node:assert/strict';

import { defineSprite, lintSprite, keysUsed, decode, TRANSPARENT } from '../js/art/format.js';
import { PALETTE, RAMPS, ACCENT, resolve, shade, contactShadow, cycleWater, variant } from '../js/palette.js';
import * as tiles from '../js/art/tiles.js';
import * as props from '../js/art/props.js';
import * as extras from '../js/art/extras.js';
import * as creatureArt from '../js/art/creatures.js';
import { COMPOSERS, COMPOSER_INFO, compose, STAGES } from '../js/art/grow.js';
import * as clumps from '../js/art/clumps.js';

// ---------------------------------------------------------------------------
// The format itself
// ---------------------------------------------------------------------------

test('ragged rows are rejected', () => {
  assert.throws(
    () => defineSprite({ name: 'ragged', anchor: [0, 0], rows: ['mmm', 'mm'] }),
    /same length|expected/i
  );
});

test('a sprite needs a name, rows and an anchor', () => {
  assert.throws(() => defineSprite({ anchor: [0, 0], rows: ['m'] }), /name/);
  assert.throws(() => defineSprite({ name: 'x', anchor: [0, 0], rows: [] }), /non-empty/);
  assert.throws(() => defineSprite({ name: 'x', rows: ['m'] }), /anchor/);
  assert.throws(() => defineSprite({ name: 'x', rows: ['m'], anchor: [0] }), /anchor/);
});

test('an anchor outside the sprite is rejected', () => {
  const rows = ['mm', 'mm'];
  assert.doesNotThrow(() => defineSprite({ name: 'ok', rows, anchor: [1, 1] }));
  assert.throws(() => defineSprite({ name: 'x', rows, anchor: [2, 0] }), /outside/);
  assert.throws(() => defineSprite({ name: 'x', rows, anchor: [0, 2] }), /outside/);
  assert.throws(() => defineSprite({ name: 'x', rows, anchor: [-1, 0] }), /outside/);
});

test('unknown palette keys are caught by the linter', () => {
  const s = defineSprite({ name: 'typo', rows: ['mZm'], anchor: [0, 0] });
  const problems = lintSprite(s, PALETTE);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown palette key 'Z'/);
});

test('width and height are derived, never declared', () => {
  const s = defineSprite({ name: 'derived', rows: ['....', 'mmmm', '....'], anchor: [1, 1] });
  assert.equal(s.w, 4);
  assert.equal(s.h, 3);
});

test('decode is Node-safe and honours transparency', () => {
  const s = defineSprite({ name: 'dot', rows: ['.m.'], anchor: [1, 0] });
  const px = decode(s, resolve);
  assert.equal(px[3], 0, 'left pixel should be transparent');
  assert.equal(px[7], 255, 'middle pixel should be opaque');
  assert.equal(px[4], 0x3b, 'middle pixel should be grass index 0');
});

// ---------------------------------------------------------------------------
// The palette contract
// ---------------------------------------------------------------------------

test('the load-bearing relationship: grass mid is lighter than canopy mid', () => {
  // SPEC §3. Trees must read dark against the ground. If this ever inverts the
  // whole screen turns to mush and no amount of art fixes it.
  const lum = (hex) =>
    0.2126 * parseInt(hex.slice(1, 3), 16) +
    0.7152 * parseInt(hex.slice(3, 5), 16) +
    0.0722 * parseInt(hex.slice(5, 7), 16);
  assert.ok(lum(RAMPS.grass.hex[2]) > lum(RAMPS.canopy.hex[2]));
});

test('every ramp runs dark to light, monotonically', () => {
  const lum = (hex) =>
    0.2126 * parseInt(hex.slice(1, 3), 16) +
    0.7152 * parseInt(hex.slice(3, 5), 16) +
    0.0722 * parseInt(hex.slice(5, 7), 16);
  for (const [name, ramp] of Object.entries(RAMPS)) {
    assert.equal(ramp.keys.length, ramp.hex.length, `${name}: keys and hex disagree`);
    for (let i = 1; i < ramp.hex.length; i++) {
      assert.ok(lum(ramp.hex[i]) > lum(ramp.hex[i - 1]), `${name} step ${i} is not lighter`);
    }
  }
});

test('no palette key is claimed by two ramps', () => {
  const seen = new Map();
  for (const [name, ramp] of Object.entries(RAMPS)) {
    for (const k of ramp.keys) {
      assert.ok(!seen.has(k), `key '${k}' is in both ${seen.get(k)} and ${name}`);
      seen.set(k, name);
    }
  }
  for (const k of Object.keys(ACCENT)) {
    assert.ok(!seen.has(k), `accent '${k}' collides with ramp ${seen.get(k)}`);
  }
});

test('shade moves along the ramp and clamps at both ends', () => {
  assert.equal(shade('c', -1), 'b');
  assert.equal(shade('c', +1), 'd');
  assert.equal(shade('a', -5), 'a');
  assert.equal(shade('e', +5), 'e');
  assert.equal(shade('5', +1), '5', 'accents have no ramp');
  assert.equal(contactShadow('o'), 'm', 'the skirt is the ground ramp two steps down');
});

test('cycleWater rotates the water ramp and touches nothing else', () => {
  const keys = RAMPS.water.keys;
  for (let phase = 0; phase < keys.length; phase++) {
    const r = cycleWater(phase);
    for (let i = 0; i < keys.length; i++) {
      assert.equal(r(keys[i]), RAMPS.water.hex[(i + phase) % keys.length]);
    }
    for (const k of 'abcdemnopABCDE') assert.equal(r(k), resolve(k), `key '${k}' moved under cycling`);
  }
});

test('variant() recolours a ramp without leaving the palette', () => {
  const r = variant({ grass: 'earth' });
  const all = new Set(Object.values(RAMPS).flatMap((x) => x.hex).concat(Object.values(ACCENT)));
  for (const k of RAMPS.grass.keys) assert.ok(all.has(r(k)), `variant produced an off-palette ${r(k)}`);
});

// ---------------------------------------------------------------------------
// Every sprite the game actually ships
// ---------------------------------------------------------------------------

function allHandAuthored() {
  const out = new Map();
  const take = (mod) => {
    for (const v of Object.values(mod)) {
      if (v && typeof v === 'object' && Array.isArray(v.rows) && v.anchor) out.set(v.name, v);
      else if (Array.isArray(v)) for (const s of v) if (s && s.rows && s.anchor) out.set(s.name, s);
      else if (v && typeof v === 'object' && !Array.isArray(v.rows)) {
        for (const s of Object.values(v)) if (s && s.rows && s.anchor) out.set(s.name, s);
      }
    }
  };
  take(tiles);
  take(props);
  take(extras);
  for (const s of creatureArt.allCreatureSprites()) out.set(s.name, s);
  for (const c of Object.values(clumps.CLUMPS || {})) if (c && c.rows) out.set('clump:' + (c.name || ''), c);
  return out;
}

test('every hand-authored sprite lints clean against the palette', () => {
  const sprites = allHandAuthored();
  assert.ok(sprites.size > 150, `expected the whole art set, found ${sprites.size}`);
  const faults = [];
  for (const [name, s] of sprites) {
    for (const p of lintSprite(s, PALETTE)) faults.push(`${name}: ${p}`);
    if (!s.rows.every((r) => r.length === s.rows[0].length)) faults.push(`${name}: ragged rows`);
    if (s.anchor[0] < 0 || s.anchor[0] >= s.w || s.anchor[1] < 0 || s.anchor[1] >= s.h) {
      faults.push(`${name}: anchor ${s.anchor} outside ${s.w}x${s.h}`);
    }
  }
  assert.deepEqual(faults, []);
});

test('every ground tile is exactly 64x32 and anchored at its centre', () => {
  for (const [family, set] of Object.entries(tiles.TERRAIN)) {
    assert.ok(set.length > 0, `terrain family '${family}' is empty`);
    for (const t of set) {
      assert.equal(t.w, tiles.TILE_W, `${t.name} is ${t.w}px wide`);
      assert.equal(t.h, tiles.TILE_H, `${t.name} is ${t.h}px tall`);
      assert.deepEqual([...t.anchor], [...tiles.TILE_ANCHOR], `${t.name} anchor`);
    }
  }
  assert.equal(tiles.SHORE.length, 16, 'all sixteen land-vertex masks');
});

test('a ground tile paints the diamond and nothing outside it', () => {
  for (const t of [tiles.GRASS[0], tiles.WATER[0], tiles.SHORE[15]]) {
    for (let y = 0; y < t.h; y++) {
      const { x0, len } = tiles.rowSpan(y);
      for (let x = 0; x < t.w; x++) {
        const inside = x >= x0 && x < x0 + len;
        const opaque = t.rows[y][x] !== TRANSPARENT;
        assert.equal(opaque, inside, `${t.name} at ${x},${y}`);
      }
    }
  }
});

test('water is a phase field: palette cycling does not change its brightness', () => {
  // SPEC §4 animates water by rotating the ramp keys F..K. That is only a
  // shimmer if the pixel distribution over the six keys is UNIFORM; with a
  // skewed distribution over a monotone ramp, rotation makes the whole sea
  // pulse. It did: the first painter measured 0.253 -> 0.562 mean luminance
  // across the six phases, a 2.5x strobe eight times a second.
  const lum = (hex) =>
    (0.2126 * parseInt(hex.slice(1, 3), 16) +
      0.7152 * parseInt(hex.slice(3, 5), 16) +
      0.0722 * parseInt(hex.slice(5, 7), 16)) /
    255;
  for (const t of [...tiles.WATER, tiles.SHORE[0]]) {
    const means = [];
    for (let phase = 0; phase < RAMPS.water.keys.length; phase++) {
      const r = cycleWater(phase);
      let sum = 0;
      let n = 0;
      for (const row of t.rows) {
        for (const ch of row) {
          if (ch === TRANSPARENT) continue;
          sum += lum(r(ch));
          n++;
        }
      }
      means.push(sum / n);
    }
    const swing = Math.max(...means) - Math.min(...means);
    assert.ok(swing < 0.05, `${t.name} swings ${swing.toFixed(3)} in mean luminance across phases`);
  }
});

test('the water field is continuous across the tile lattice', () => {
  // Neighbouring tiles are offset by (+/-32, +/-16) px. A wavefront that stops
  // at the seam turns a lake into four tiles. Only checked on WATER, which is
  // deliberately a single-variant set for exactly this reason.
  assert.equal(tiles.WATER.length, 1, 'water must be one tile or the seams cannot join');
  const t = tiles.WATER[0];

  // Lay a 5x5 lake out on the real lattice and read the composite back.
  const N = 5;
  const W = (N + N) * 32 + 64;
  const H = (N + N) * 16 + 32;
  const OX = N * 32 + 32;
  const buf = new Array(W * H).fill(null);
  for (let ty = 0; ty < N; ty++) {
    for (let tx = 0; tx < N; tx++) {
      const px = OX + (tx - ty) * 32 - 32;
      const py = (tx + ty) * 16;
      for (let y = 0; y < t.h; y++) {
        for (let x = 0; x < t.w; x++) {
          const ch = t.rows[y][x];
          if (ch === TRANSPARENT) continue;
          buf[(py + y) * W + (px + x)] = ch;
        }
      }
    }
  }

  // A seam-crossing neighbour pair is one whose two pixels came from different
  // tiles. If the wavefronts join, seam pairs step through the ramp exactly as
  // often as interior pairs do; if they stop dead at the diamond edge, the seam
  // pairs jump much further. Steps are measured MODULO the ramp, because the
  // wrap from crest to trough is a legitimate part of a phase field.
  const idx = (ch) => RAMPS.water.keys.indexOf(ch);
  const step = (a, b) => {
    const d = Math.abs(idx(a) - idx(b));
    return Math.min(d, RAMPS.water.keys.length - d);
  };
  const tileOf = (x, y) => {
    // Which tile a composite pixel came from: invert the lattice.
    const u = (x - OX) / 32;
    const v = y / 16;
    return `${Math.floor((u + v) / 2)},${Math.floor((v - u) / 2)}`;
  };
  let seamN = 0;
  let seamSum = 0;
  let innerN = 0;
  let innerSum = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const a = buf[y * W + x];
      if (a == null) continue;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const b = buf[(y + dy) * W + (x + dx)];
        if (b == null) continue;
        const crosses = tileOf(x + 0.5, y + 0.5) !== tileOf(x + dx + 0.5, y + dy + 0.5);
        if (crosses) {
          seamN++;
          seamSum += step(a, b);
        } else {
          innerN++;
          innerSum += step(a, b);
        }
      }
    }
  }
  assert.ok(seamN > 500, `only ${seamN} seam pairs found`);
  const seam = seamSum / seamN;
  const inner = innerSum / innerN;
  assert.ok(
    seam < inner + 0.15,
    `the wavefronts stop at the seam: mean ramp step ${seam.toFixed(3)} across seams vs ${inner.toFixed(3)} inside a tile`
  );
});

test('every prop declares a rectangular footprint (SPEC §2)', () => {
  for (const s of Object.values(props.PROPS)) {
    assert.ok(Array.isArray(s.footprint) && s.footprint.length === 2, `${s.name} footprint`);
    assert.ok(s.footprint.every((n) => Number.isInteger(n) && n > 0), `${s.name} footprint ${s.footprint}`);
  }
});

test('creature frames: five creatures, every facing, every pose', () => {
  assert.deepEqual([...creatureArt.CREATURE_IDS].sort(), ['centaur', 'naiad', 'pan', 'satyr', 'unicorn']);
  for (const id of creatureArt.CREATURE_IDS) {
    for (const facing of creatureArt.FACINGS) {
      for (const pose of ['idle', 'walk']) {
        const f = creatureArt.creatureFrame(id, pose, facing, 0);
        assert.ok(f && f.rows && f.anchor, `${id}/${pose}/${facing} missing`);
      }
    }
    assert.ok(creatureArt.CREATURE_SHADOWS[id], `${id} has no contact shadow`);
  }
});

test('extra poses build, are lintable, and keep their feet under them', () => {
  // A pose on a GROWN canvas (the piping satyr needs sky over his head for the
  // notes) must still stand in the same place. The anchor is what guarantees
  // that: get it wrong and he floats or sinks by however much the canvas grew,
  // which is the multi-tile float bug wearing different clothes.
  for (const id of creatureArt.CREATURE_IDS) {
    const base = creatureArt.creatureFrame(id, 'idle', 'se', 0);
    for (const pose of creatureArt.creaturePoses(id)) {
      if (pose === 'walk' || pose === 'idle' || pose === 'beat') continue;
      const frames = creatureArt.CREATURE_ART[id].frames[pose];
      assert.ok(Array.isArray(frames) && frames.length > 0, `${id}/${pose} has no frames`);
      const holds = creatureArt.HOLDS[pose];
      assert.ok(holds, `${id}/${pose} has no HOLDS entry — it would fall back to idle timing`);
      assert.equal(
        holds.length,
        frames.length,
        `${id}/${pose}: ${frames.length} frames but ${holds.length} holds. creatureFrameAt walks ` +
          'the holds, so a mismatch drops frames off the end of the cycle silently'
      );
      for (const f of frames) {
        assert.ok(f.rows && f.anchor, `${id}/${pose} frame malformed`);
        // Same distance from anchor to the bottom of the canvas as the idle
        // frame, so the hooves land on the same pixel whatever the pose.
        assert.equal(
          f.h - 1 - f.anchor[1],
          base.h - 1 - base.anchor[1],
          `${id}/${pose} sits at a different height from its own idle frame`
        );
        assert.deepEqual(lintSprite(f, PALETTE), [], `${id}/${pose} lint`);
      }
    }
  }
});

test('a one-shot pose clamps on its last frame instead of looping', () => {
  // The drink is a gesture, not a cycle. Played past its length it must hold
  // the final frame — a satyr standing with an empty cup — rather than snap
  // back to raising a fresh one every three seconds for ever.
  assert.ok(creatureArt.poseIsOnce('satyr', 'drink'), 'drink should be declared once');
  assert.ok(!creatureArt.poseIsOnce('satyr', 'pipe'), 'pipe is a cycle, not a one-shot');

  const holds = creatureArt.HOLDS.drink;
  const total = holds.reduce((a, b) => a + b, 0);
  const last = creatureArt.creatureFrame('satyr', 'drink', 'se', holds.length - 1);
  for (const ms of [total, total + 1, total * 3, total * 100]) {
    assert.equal(
      creatureArt.creatureFrameAt('satyr', 'drink', 'se', ms, true),
      last,
      `drink at ${ms}ms should still be the last frame`
    );
  }
  // And it starts at the beginning, which is the whole reason it is played off
  // the agent's own pose clock rather than off the shared wall clock.
  assert.equal(
    creatureArt.creatureFrameAt('satyr', 'drink', 'se', 0, true),
    creatureArt.creatureFrame('satyr', 'drink', 'se', 0)
  );
});

test('hasPose tells the truth, so the renderer can fall back', () => {
  assert.ok(creatureArt.hasPose('satyr', 'pipe'));
  assert.ok(creatureArt.hasPose('satyr', 'drink'));
  assert.ok(creatureArt.hasPose('satyr', 'idle'));
  assert.ok(creatureArt.hasPose('satyr', 'walk'));
  // Nobody else has the satyr's poses. main.js falls back to `beat` for these,
  // so a pose added to creatures.js before its art exists degrades to the old
  // animation rather than to an invisible creature.
  for (const id of creatureArt.CREATURE_IDS) {
    if (id === 'satyr') continue;
    assert.ok(!creatureArt.hasPose(id, 'pipe'), `${id} unexpectedly has a pipe pose`);
    assert.ok(!creatureArt.hasPose(id, 'drink'), `${id} unexpectedly has a drink pose`);
  }
  assert.ok(!creatureArt.hasPose('satyr', 'somersault'));
  assert.ok(!creatureArt.hasPose('nobody', 'idle'));
});

test('the ghost variant introduces no new colours', () => {
  // The desaturated `visits` preview (SPEC §7) must stay inside the palette —
  // a globalAlpha ghost is what puts off-ramp pixels on screen.
  const all = new Set(Object.values(RAMPS).flatMap((r) => r.hex).concat(Object.values(ACCENT)));
  for (const key of PALETTE.keys()) {
    const g = creatureArt.ghostResolve(key);
    if (g == null) continue;
    assert.ok(all.has(g), `ghost of '${key}' is ${g}, which is not in the palette`);
  }
});

// ---------------------------------------------------------------------------
// The procedural composers
// ---------------------------------------------------------------------------

test('every composer produces a valid, deterministic sprite at every stage', () => {
  const names = Object.keys(COMPOSERS);
  assert.ok(names.length >= 9, `expected the nine composers, found ${names.length}`);
  for (const name of names) {
    const info = COMPOSER_INFO[name];
    const variants = info.key ? info.variants : [null];
    for (const v of variants) {
      for (const stage of STAGES) {
        const params = { stage };
        if (info.key && v) params[info.key] = v;
        const a = compose(name, 1234, params);
        const b = compose(name, 1234, params);
        assert.ok(a && a.rows && a.rows.length, `${name}/${v}/${stage} produced nothing`);
        assert.deepEqual(a.rows, b.rows, `${name}/${v}/${stage} is not deterministic`);
        assert.equal(a.w, a.rows[0].length);
        assert.ok(a.rows.every((r) => r.length === a.w), `${name}/${v}/${stage} is ragged`);
        assert.ok(
          a.anchor[0] >= 0 && a.anchor[0] < a.w && a.anchor[1] >= 0 && a.anchor[1] < a.h,
          `${name}/${v}/${stage} anchor ${a.anchor} outside ${a.w}x${a.h}`
        );
        assert.deepEqual(lintSprite(a, PALETTE), [], `${name}/${v}/${stage} lint`);
      }
    }
  }
});

test('a plant grows into itself — same seed, three sizes, one plant', () => {
  // SPEC §4: stages are composer parameters from the same seed, not three
  // different sprites. The test that catches a swap is monotone size.
  for (const [name, info] of Object.entries(COMPOSER_INFO)) {
    const params = info.key ? { [info.key]: info.variants[0] } : {};
    const sizes = STAGES.map((stage) => {
      const s = compose(name, 77, { ...params, stage });
      return s.w * s.h;
    });
    assert.ok(sizes[0] < sizes[1], `${name}: sprout is not smaller than young`);
    assert.ok(sizes[1] < sizes[2], `${name}: young is not smaller than mature`);
  }
});

test('two seeds give two different plants', () => {
  const a = compose('broadleaf', 1, { species: 'oak' });
  const b = compose('broadleaf', 2, { species: 'oak' });
  assert.notDeepEqual(a.rows, b.rows, 'every oak in the garden would be identical');
});

test('a broadleaf canopy uses its whole ramp — no "green blob"', () => {
  // RESEARCH's named failure mode: a canopy with no internal value structure.
  // All five canopy keys must appear on a mature broadleaf.
  for (const species of COMPOSER_INFO.broadleaf.variants) {
    const s = compose('broadleaf', 4242, { species });
    const used = new Set(keysUsed(s));
    for (const k of RAMPS.canopy.keys) {
      assert.ok(used.has(k), `${species} never uses canopy key '${k}'`);
    }
  }
});
