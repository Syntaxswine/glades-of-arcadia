#!/usr/bin/env node
/**
 * tools/poseshot.mjs — rasterise a creature's animation frames to a PNG strip.
 *
 * The sibling of propshot.mjs, and it exists for the same reason: an artist has
 * to be able to SEE its own work, and a browser tab is not always available.
 * The difference is that an animation cannot be judged one frame at a time —
 * you have to see the whole cycle laid out side by side, on real ground, at the
 * size it will actually be played at, or you cannot tell a sweep from a jitter.
 *
 *   node tools/poseshot.mjs --id satyr --pose pipe --zoom 4
 *   node tools/poseshot.mjs --id satyr --pose drink --zoom 6 --out docs/shots/x.png
 *   node tools/poseshot.mjs --id satyr --pose pipe --sil        # silhouette only
 *
 * `--sil` is the first pass, always. If the silhouette does not read, no amount
 * of painting will save it (HANDOFF, "the traps").
 *
 * Then Read the PNG. That is the whole loop.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { CREATURE_ART, CREATURE_IDS, FACINGS, HOLDS, creaturePoses } from '../js/art/creatures.js';
import * as TILES from '../js/art/tiles.js';
import { resolve as pal, PALETTE } from '../js/palette.js';
import { lintSprite } from '../js/art/format.js';

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const has = (f) => argv.includes(f);

// --------------------------------------------------------------------- PNG
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba, w, h) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ canvas
function surface(w, h, bg) {
  const px = new Uint8ClampedArray(w * h * 4);
  if (bg) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16));
    for (let i = 0; i < w * h; i++) {
      px[i * 4] = r;
      px[i * 4 + 1] = g;
      px[i * 4 + 2] = b;
      px[i * 4 + 3] = 255;
    }
  }
  return { px, w, h };
}
function dot(s, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  const i = (y * s.w + x) * 4;
  s.px[i] = r;
  s.px[i + 1] = g;
  s.px[i + 2] = b;
  s.px[i + 3] = 255;
}
function blit(s, sp, dx, dy, flat) {
  for (let y = 0; y < sp.h; y++) {
    for (let x = 0; x < sp.w; x++) {
      const ch = sp.rows[y][x];
      if (ch === '.') continue;
      if (flat) {
        dot(s, dx + x, dy + y, 0x2a, 0x26, 0x20);
        continue;
      }
      const hex = pal(ch);
      if (!hex) continue;
      dot(s, dx + x, dy + y, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    }
  }
}
function scale(s, z) {
  if (z === 1) return s;
  const o = surface(s.w * z, s.h * z, null);
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const i = (((y / z) | 0) * s.w + ((x / z) | 0)) * 4;
      const j = (y * o.w + x) * 4;
      o.px[j] = s.px[i];
      o.px[j + 1] = s.px[i + 1];
      o.px[j + 2] = s.px[i + 2];
      o.px[j + 3] = s.px[i + 3];
    }
  }
  return o;
}

const FONT = {
  A: '01100:10010:10010:11110:10010:10010:10010', B: '11100:10010:10010:11100:10010:10010:11100',
  C: '01110:10000:10000:10000:10000:10000:01110', D: '11100:10010:10010:10010:10010:10010:11100',
  E: '11110:10000:10000:11100:10000:10000:11110', F: '11110:10000:10000:11100:10000:10000:10000',
  G: '01110:10000:10000:10110:10010:10010:01110', H: '10010:10010:10010:11110:10010:10010:10010',
  I: '11100:01000:01000:01000:01000:01000:11100', J: '00110:00010:00010:00010:10010:10010:01100',
  K: '10010:10100:11000:10000:11000:10100:10010', L: '10000:10000:10000:10000:10000:10000:11110',
  M: '10001:11011:10101:10001:10001:10001:10001', N: '10010:11010:11010:10110:10110:10010:10010',
  O: '01100:10010:10010:10010:10010:10010:01100', P: '11100:10010:10010:11100:10000:10000:10000',
  Q: '01100:10010:10010:10010:10110:10010:01101', R: '11100:10010:10010:11100:11000:10100:10010',
  S: '01110:10000:10000:01100:00010:00010:11100', T: '11111:00100:00100:00100:00100:00100:00100',
  U: '10010:10010:10010:10010:10010:10010:01100', V: '10010:10010:10010:10010:10010:01010:00100',
  W: '10001:10001:10001:10101:10101:11011:10001', X: '10010:10010:01010:00100:01010:10010:10010',
  Y: '10010:10010:01010:00100:00100:00100:00100', Z: '11110:00010:00100:01000:10000:10000:11110',
  0: '01100:10010:10110:10110:11010:11010:01100', 1: '00100:01100:00100:00100:00100:00100:01110',
  2: '01100:10010:00010:00100:01000:10000:11110', 3: '11100:00010:00010:01100:00010:00010:11100',
  4: '00010:00110:01010:10010:11110:00010:00010', 5: '11110:10000:11100:00010:00010:10010:01100',
  6: '00110:01000:10000:11100:10010:10010:01100', 7: '11110:00010:00100:00100:01000:01000:01000',
  8: '01100:10010:10010:01100:10010:10010:01100', 9: '01100:10010:10010:01110:00010:00100:11000',
  '-': '00000:00000:00000:11110:00000:00000:00000', ' ': '00000:00000:00000:00000:00000:00000:00000',
  '/': '00010:00010:00100:00100:01000:01000:01000', ':': '00000:00100:00000:00000:00100:00000:00000',
};
function text(s, str, x, y, [r, g, b]) {
  let cx = x;
  for (const raw of String(str).toUpperCase()) {
    const rows = (FONT[raw] || FONT[' ']).split(':');
    rows.forEach((row, ry) => row.split('').forEach((c, rxi) => c === '1' && dot(s, cx + rxi, y + ry, r, g, b)));
    cx += 6;
  }
}

// --------------------------------------------------------------------- run
const id = arg('--id', 'satyr');
const pose = arg('--pose', 'idle');
const facing = arg('--facing', 'se');
const zoom = Number(arg('--zoom', 4));
const sil = has('--sil');
const ground = arg('--ground', 'grass');
const out = resolve(arg('--out', `docs/shots/${id}-${pose}.png`));

const art = CREATURE_ART[id];
if (!art) {
  console.error(`no creature '${id}'. have: ${CREATURE_IDS.join(', ')}`);
  process.exit(1);
}
const all = pose === 'walk' ? art.frames.walk[facing] : art.frames[pose];
if (!all) {
  console.error(`no pose '${pose}' for ${id}. have: ${creaturePoses(id).join(', ')}`);
  process.exit(1);
}

// `--only 0,3` picks frames out of the cycle. The Read tool downsamples
// anything wider than about 2000px, so a full eight-frame strip caps out at
// roughly 4x however high you set --zoom. To actually inspect a four-pixel
// hand you have to look at one or two frames at a time.
const only = arg('--only', '');
const picked = only
  ? only.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < all.length)
  : all.map((_, i) => i);
if (!picked.length) {
  console.error(`--only picked nothing; pose has ${all.length} frames`);
  process.exit(1);
}
const set = picked.map((i) => all[i]);

// Every frame of a pose shares one cell size — the whole point is to see what
// MOVES between frames, and a cell that shrink-wraps each frame would hide
// exactly that by re-centring the drift away.
const cellW = Math.max(...set.map((s) => s.w)) + 18;
const cellH = Math.max(...set.map((s) => s.h)) + 30;
const s = surface(set.length * cellW, cellH, sil ? '#ddd2be' : '#2a2620');

// Real ground, laid continuously, so the hooves are seen to land on something.
if (!sil) {
  const t = TILES.TERRAIN[ground] || TILES.GRASS;
  const base = cellH - 22;
  for (let j = -Math.ceil(cellH / 16); j <= 3; j++) {
    for (let k = -1; k * 64 < s.w + 64; k++) {
      blit(s, TILES.variantFor(t, k, j), k * 64 - (j & 1 ? 32 : 0), base + j * 16 - 16);
    }
  }
}

const holds = HOLDS[pose] || HOLDS.idle;
set.forEach((sp, i) => {
  const cx = i * cellW + cellW / 2;
  const cy = cellH - 22;
  blit(s, sp, Math.round(cx - sp.anchor[0]), Math.round(cy - sp.anchor[1]), sil);
  const ink = sil ? [0x2a, 0x26, 0x20] : [0xe9, 0xc1, 0x58];
  text(s, `${picked[i]} ${holds[picked[i]] ?? '-'}MS`, i * cellW + 3, 3, ink);
});

const big = scale(s, zoom);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png(big.px, big.w, big.h));

const problems = [];
for (const sp of set) problems.push(...lintSprite(sp, PALETTE));
if (problems.length) console.error('LINT:\n  ' + problems.join('\n  '));

const total = holds.slice(0, set.length).reduce((a, b) => a + b, 0);
console.log(
  `${out}  ${big.w}x${big.h}  ${id}/${pose}  ${set.length} frames  ${total}ms round  ${set[0].w}x${set[0].h}px`
);
