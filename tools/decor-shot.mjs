#!/usr/bin/env node
// decor-shot.mjs — render the decor sheet to a PNG without a browser.
//
// js/art/format.js decode() is DOM-free on purpose, so the whole sheet can be
// composed in Node and written out with nothing but zlib. That matters here for
// a boring reason: the Browser pane's tabs are a shared resource and an art
// owner needs to look at their work a few dozen times.
//
//   node tools/decor-shot.mjs --name d1 --scale 4 --only exedra,tholos
//   node tools/decor-shot.mjs --scene            # everything on one ground
//
// Node built-ins only (SPEC §1).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve as pres, join } from 'node:path';
import { DECOR, VARIANTS } from '../js/art/decor.js';
import { resolve as pal, RAMPS } from '../js/palette.js';
import { decode } from '../js/art/format.js';

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const has = (f) => argv.includes(f);

const SCALE = Number(arg('--scale', 4));
const NAME = arg('--name', 'decor');
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const COLS = Number(arg('--cols', 0));
const VAR = arg('--variant', '');
const OUT = pres(process.cwd(), arg('--out', 'docs/shots'));
mkdirSync(OUT, { recursive: true });

const res = VAR && VARIANTS[VAR] ? VARIANTS[VAR] : pal;

// ---------------------------------------------------------------------------
// A tiny RGBA canvas + PNG writer.
// ---------------------------------------------------------------------------
function canvas(w, h) {
  return { w, h, d: new Uint8Array(w * h * 4) };
}
function px(c, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.d[i] = r;
  c.d[i + 1] = g;
  c.d[i + 2] = b;
  c.d[i + 3] = a;
}
const hex2 = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function crc32(buf) {
  let c = ~0;
  for (let n = 0; n < buf.length; n++) {
    c ^= buf[n];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(c) {
  const raw = Buffer.alloc((c.w * 4 + 1) * c.h);
  for (let y = 0; y < c.h; y++) {
    raw[y * (c.w * 4 + 1)] = 0;
    Buffer.from(c.d.buffer, y * c.w * 4, c.w * 4).copy(raw, y * (c.w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Ground, so contrast is judged against the real lawn and never against white.
// ---------------------------------------------------------------------------
function lawn(c) {
  const G = RAMPS.grass.hex.map(hex2);
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const n = ((x * 7919) ^ (y * 104729) ^ ((x >> 2) * 31)) >>> 0;
      const g = G[n % 97 < 12 ? 1 : n % 97 > 88 ? 3 : 2];
      px(c, x, y, g[0], g[1], g[2]);
    }
  }
}

function blit(c, sp, x0, y0, s) {
  const rgba = decode(sp, res);
  for (let y = 0; y < sp.h; y++) {
    for (let x = 0; x < sp.w; x++) {
      const i = (y * sp.w + x) * 4;
      if (rgba[i + 3] === 0) continue;
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px(c, x0 + x * s + dx, y0 + y * s + dy, rgba[i], rgba[i + 1], rgba[i + 2]);
    }
  }
}

// A 3x5 bitmap alphabet, because a label is worth a lot and a font is not
// available. Only the characters the sprite ids actually use.
const FONT = {
  A: '111101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101011', V: '101101101010010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', ' ': '000000000000000',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010',
  8: '010101010101010', 9: '010101011001110', '.': '000000000000010', ',': '000000000010010',
  X_: '', ':': '000010000010000',
};
function text(c, str, x0, y0, rgb) {
  let x = x0;
  for (const ch of String(str).toUpperCase()) {
    const bits = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (bits[i] === '1') px(c, x + (i % 3), y0 + ((i / 3) | 0), rgb[0], rgb[1], rgb[2]);
    x += 4;
  }
}

// ---------------------------------------------------------------------------
// --scene: the only test that matters. Sheets prove each piece works; a scene
// proves they came out of the SAME GARDEN. Real projection, real depth sort.
// ---------------------------------------------------------------------------
if (has('--scene')) {
  const W = 64;
  const H = 32;
  const S = SCALE;
  const OX = 300 * S;
  const OY = 40 * S;
  const place = [
    // ground first, whole, then objects by depth
    ['flagstone-court', 4, 4], ['flagstone-court', 5, 4], ['flagstone-court', 4, 5], ['flagstone-court', 5, 5],
    ['mosaic-panel', 6, 6], ['gravel-walk', 3, 6], ['gravel-walk', 3, 7], ['gravel-walk', 4, 7],
    ['stepping-stones', 2, 8], ['stepping-stones', 3, 8],
    ['tholos', 2, 2],
    ['hedge-tall', 0, 5], ['hedge-tall', 1, 5], ['hedge-arch', 2, 5], ['hedge-tall', 3, 5],
    ['colonnade', 6, 1],
    ['doric-column', 0, 3], ['ionic-column', 1, 3], ['corinthian-column', 2, 3],
    ['obelisk', 7, 3], ['ruined-archway', 8, 5],
    ['rill', 5, 7], ['rill', 6, 7], ['rill', 7, 7],
    ['fountain-tiered', 5, 6],
    ['exedra', 1, 7], ['stone-bench', 3, 9],
    ['fluted-urn', 0, 6], ['amphora-plinth', 6, 4], ['krater-wide', 7, 5],
    ['topiary-cone', 4, 8], ['topiary-sphere', 5, 8], ['cache-pot', 6, 8],
    ['balustrade', 0, 9], ['balustrade', 1, 9],
    ['sundial-pedestal', 2, 6], ['birdbath', 7, 6], ['jet-basin', 8, 7],
    ['shell-fountain', 8, 3], ['wall-fountain', 9, 4],
    ['broken-column', 9, 6], ['pergola-arch', 4, 9],
    ['stone-stair', 8, 8], ['earth-ramp', 9, 8], ['rock-scramble', 9, 9], ['terrace-wall-stepped', 8, 9],
  ];
  const items = place
    .map(([id, tx, ty], i) => ({ sp: DECOR[id], tx, ty, i, id }))
    .filter((o) => o.sp);
  const ground = items.filter((o) => o.sp.tags.includes('ground'));
  const rest = items.filter((o) => !o.sp.tags.includes('ground'));
  const depth = (o) => (o.tx + o.sp.footprint[0] - 1) + (o.ty + o.sp.footprint[1] - 1);
  rest.sort((a, b) => depth(a) - depth(b) || a.tx - b.tx || a.i - b.i);

  const c = canvas(600 * S, 400 * S);
  lawn(c);
  const draw = (o) => {
    const [fw, fh] = o.sp.footprint;
    const cxT = o.tx + (fw - 1) / 2;
    const cyT = o.ty + (fh - 1) / 2;
    const sx = OX + (cxT - cyT) * (W / 2) * S;
    const sy = OY + (cxT + cyT) * (H / 2) * S;
    blit(c, o.sp, Math.round(sx - o.sp.anchor[0] * S), Math.round(sy - o.sp.anchor[1] * S), S);
  };
  ground.sort((a, b) => a.tx + a.ty - (b.tx + b.ty)).forEach(draw);
  rest.forEach(draw);
  const file2 = join(OUT, `${NAME}.png`);
  writeFileSync(file2, png(c));
  console.log(`${file2}  scene, ${items.length} placements`);
  process.exit(0);
}

const entries = Object.entries(DECOR).filter(([k]) => !ONLY.length || ONLY.includes(k));
if (!entries.length) {
  console.error('no sprites matched --only');
  process.exit(1);
}
const PAD = 8;
const LAB = 8;
const cells = entries.map(([k, s]) => ({ k, s, w: s.w * SCALE + PAD * 2, h: s.h * SCALE + PAD * 2 + LAB }));
const maxW = Math.max(...cells.map((c) => c.w));
const per = COLS || Math.max(1, Math.floor(1700 / maxW));
const rows = [];
for (let i = 0; i < cells.length; i += per) rows.push(cells.slice(i, i + per));
const W = Math.max(...rows.map((r) => r.reduce((a, c) => a + c.w, 0)));
const H = rows.reduce((a, r) => a + Math.max(...r.map((c) => c.h)), 0);

const c = canvas(W, H);
lawn(c);
let y = 0;
for (const row of rows) {
  const rh = Math.max(...row.map((r) => r.h));
  let x = 0;
  for (const cell of row) {
    for (let i = 0; i < cell.w; i++) {
      px(c, x + i, y, 20, 18, 14);
      px(c, x + i, y + rh - 1, 20, 18, 14);
    }
    for (let i = 0; i < rh; i++) px(c, x, y + i, 20, 18, 14);
    blit(c, cell.s, x + PAD, y + PAD, SCALE);
    if (!has('--no-anchor')) {
      const ax = x + PAD + cell.s.anchor[0] * SCALE;
      const ay = y + PAD + cell.s.anchor[1] * SCALE;
      for (let i = -3 * SCALE; i < 4 * SCALE; i++) {
        px(c, ax, ay + i, 255, 0, 255);
        px(c, ax + i, ay, 255, 0, 255);
      }
    }
    for (let i = 0; i < cell.w - 1; i++) for (let j = 0; j < LAB; j++) px(c, x + 1 + i, y + rh - LAB - 1 + j, 20, 18, 14);
    text(c, `${cell.k} ${cell.s.w}X${cell.s.h}`, x + 3, y + rh - LAB, [222, 215, 200]);
    x += cell.w;
  }
  y += rh;
}

const file = join(OUT, `${NAME}.png`);
writeFileSync(file, png(c));
console.log(`${file}  ${W}x${H}  ${entries.length} sprites`);
