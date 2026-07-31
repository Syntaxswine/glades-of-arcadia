#!/usr/bin/env node
/**
 * tools/propshot.mjs — rasterise props to a PNG on disk, with no browser.
 *
 * SPEC 10 says an artist must be able to see their own work. The documented
 * route is serve + snap + a page, but a page needs a browser tab, and with
 * eight owners working in parallel the tab budget is gone. Everything needed
 * to make a PNG is a Node built-in: zlib for the IDAT stream and a CRC table
 * for the chunk checksums. Nothing is added to the project's dependency set.
 *
 *   node tools/propshot.mjs --out docs/shots/trees.png --zoom 3 \
 *        --ids ash-tree,plane-tree --cols 4 [--sil] [--ground grass]
 *
 * Then Read the PNG. That is the whole loop.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { PROPS } from '../js/art/props.js';
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
/** rgba: Uint8ClampedArray of w*h*4 */
function png(rgba, w, h) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
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
        if (ch === 'm') continue;
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

// A 5x7 stamp font, enough to caption a contact sheet. Not game art.
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
};
function text(s, str, x, y, [r, g, b]) {
  let cx = x;
  for (const raw of str.toUpperCase()) {
    const rows = (FONT[raw] || FONT[' ']).split(':');
    rows.forEach((row, ry) => row.split('').forEach((c, rxi) => c === '1' && dot(s, cx + rxi, y + ry, r, g, b)));
    cx += 6;
  }
}

// --------------------------------------------------------------------- run
const ids = (arg('--ids', '') || Object.keys(PROPS).join(',')).split(',').filter(Boolean);
const cols = Number(arg('--cols', 5));
const zoom = Number(arg('--zoom', 3));
const sil = has('--sil');
const ground = arg('--ground', 'grass');
const out = resolve(arg('--out', 'docs/shots/props.png'));

const list = ids.map((n) => PROPS[n]).filter(Boolean);
const missing = ids.filter((n) => !PROPS[n]);
if (missing.length) console.error('MISSING:', missing.join(', '));
if (!list.length) {
  console.error('nothing to draw');
  process.exit(1);
}

const cellW = Math.max(...list.map((s) => s.w)) + 26;
const cellH = Math.max(...list.map((s) => s.h)) + 44;
const rows = Math.ceil(list.length / cols);
const s = surface(cols * cellW, rows * cellH, sil ? '#ddd2be' : '#2a2620');

// Continuous ground per row of cells. Isometric tiles tile the plane on a
// 64x32 lattice with every other row offset 32 — laid as a real surface the
// objects sit ON something, and a shadow that is wrong on grass shows up
// immediately. A row of separate diamonds hides exactly that fault.
if (!sil) {
  const t = TILES.TERRAIN[ground] || TILES.GRASS;
  for (let r = 0; r < rows; r++) {
    const base = r * cellH + cellH - 26;
    for (let j = -Math.ceil(cellH / 16); j <= 3; j++) {
      for (let k = -1; k * 64 < s.w + 64; k++) {
        blit(s, TILES.variantFor(t, k, j + r * 5), k * 64 - (j & 1 ? 32 : 0), base + j * 16 - 16);
      }
    }
  }
}

list.forEach((sp, i) => {
  const cx = (i % cols) * cellW + cellW / 2;
  const cy = Math.floor(i / cols) * cellH + cellH - 26;
  blit(s, sp, Math.round(cx - sp.anchor[0]), Math.round(cy - sp.anchor[1]), sil);
  text(s, `${sp.name} ${sp.w}x${sp.h}`, (i % cols) * cellW + 3, Math.floor(i / cols) * cellH + 3,
    sil ? [0x2a, 0x26, 0x20] : [0xe9, 0xc1, 0x58]);
});

const big = scale(s, zoom);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png(big.px, big.w, big.h));

const problems = [];
for (const sp of Object.values(PROPS)) problems.push(...lintSprite(sp, PALETTE));
if (problems.length) console.error('LINT:\n  ' + problems.join('\n  '));
console.log(`${out}  ${big.w}x${big.h}  ${list.length} sprites`);
