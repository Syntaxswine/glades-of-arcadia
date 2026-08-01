#!/usr/bin/env node
/**
 * tools/titleshot.mjs — render the bubble title to a PNG so it can be looked at.
 *
 * Same reason as poseshot and snap: art authored blind is art authored badly.
 *   node tools/titleshot.mjs --zoom 3 [--on '#4a6a3a']
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TITLE, setBubble } from '../js/art/title.js';
import { resolve as pal, PALETTE } from '../js/palette.js';
import { lintSprite } from '../js/art/format.js';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const zoom = Number(arg('--zoom', 3));
const bg = arg('--on', '#3d5a80');
const text = arg('--text', '');
const out = resolve(arg('--out', 'docs/shots/title.png'));

const CRC = (() => { const t = new Int32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;} return t; })();
const crc32 = (b) => { let c=-1; for(let i=0;i<b.length;i++) c=CRC[(c^b[i])&0xff]^(c>>>8); return (c^-1)>>>0; };
const chunk = (ty, d) => { const l=Buffer.alloc(4); l.writeUInt32BE(d.length); const b=Buffer.concat([Buffer.from(ty,'ascii'),d]); const c=Buffer.alloc(4); c.writeUInt32BE(crc32(b)); return Buffer.concat([l,b,c]); };
function png(rgba,w,h){const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;Buffer.from(rgba.buffer,y*w*4,w*4).copy(raw,y*(w*4+1)+1);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ih),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}

const sp = text ? setBubble(text, 'probe') : TITLE;
const PAD = 8;
const W = (sp.w + PAD * 2) * zoom;
const H = (sp.h + PAD * 2) * zoom;
const px = new Uint8ClampedArray(W * H * 4);
const [br, bgc, bb] = [1,3,5].map((i) => parseInt(bg.slice(i, i+2), 16));
for (let i = 0; i < W*H; i++) { px[i*4]=br; px[i*4+1]=bgc; px[i*4+2]=bb; px[i*4+3]=255; }
for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) {
  const ch = sp.rows[y][x];
  if (ch === '.') continue;
  const hex = pal(ch);
  if (!hex) continue;
  const [r,g,b] = [1,3,5].map((i) => parseInt(hex.slice(i, i+2), 16));
  for (let dy = 0; dy < zoom; dy++) for (let dx = 0; dx < zoom; dx++) {
    const X = (x + PAD) * zoom + dx, Y = (y + PAD) * zoom + dy;
    const i = (Y * W + X) * 4;
    px[i]=r; px[i+1]=g; px[i+2]=b; px[i+3]=255;
  }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png(px, W, H));
const problems = lintSprite(sp, PALETTE);
if (problems.length) console.error('LINT:\n  ' + problems.join('\n  '));
console.log(`${out}  ${W}x${H}  glyph ${sp.w}x${sp.h}px  "${text || 'GLADES OF ARCADIA'}"`);
