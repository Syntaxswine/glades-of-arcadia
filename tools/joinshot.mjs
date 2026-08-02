#!/usr/bin/env node
/**
 * tools/joinshot.mjs — DOES THIS PIECE JOIN?
 *
 *   node tools/joinshot.mjs --ids hedge-low,clipped-hedge --n 4 --zoom 3
 *   node tools/joinshot.mjs --ids balustrade --corner --out docs/shots/join.png
 *
 * WHY THIS EXISTS, and it is the same lesson twice.
 *
 * Every probe in this repo isolates its subject. `propshot` puts each sprite in
 * its own cell; `decor-shot` lays out a contact sheet; the shadow probes spaced
 * objects three tiles apart *deliberately*, so their art would not cover each
 * other's shadows. Isolation keeps a reading clean, and a clean reading of the
 * wrong configuration is still the wrong reading — **a player never builds one
 * hedge**. They build a run of them, and then they turn a corner.
 *
 * That blind spot has now cost two findings:
 *
 *   the SCALLOPING   the runtime contact ellipse shipped and ran live for a
 *                    day under every hedge and wall in the game. Rhombi tile,
 *                    ellipses do not. One frame with four hedges in it showed
 *                    it instantly; every isolated probe had said it was fine.
 *   the SEAM         `LINE_W = 33` is "32 px of run plus one overlap column",
 *                    which is a promise about ADJACENCY that nothing checked.
 *
 * So this tool only ever draws things TOUCHING. Three configurations, because
 * the three are what a garden actually contains:
 *
 *   --run     n pieces along +tx, and n along +ty. Does the run read as ONE
 *             object, or as n objects standing near each other?
 *   --corner  an L: the two runs meeting at a shared tile. Where a linear
 *             piece needs a CORNER DRAWING, this is the frame that says so.
 *   --cross   a plus. The four-way junction, the hardest case.
 *
 * The ground is a real lattice, not a row of separate diamonds, for the same
 * reason `propshot` lays one: an object that floats reveals itself against a
 * continuous surface and hides against a cell background.
 *
 * Node built-ins only (SPEC §1). PNG out via tools/headless-canvas.mjs, which
 * is where this project's one PNG encoder lives.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createCanvas, encodePNG, zoom } from './headless-canvas.mjs';
import { PROPS } from '../js/art/props.js';
import DECOR from '../js/art/decor.js';
import * as TILES from '../js/art/tiles.js';
import * as EXTRAS from '../js/art/extras.js';
import { resolve as pal } from '../js/palette.js';
import { TILE_W, TILE_H } from '../js/iso.js';

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const has = (f) => argv.includes(f);

const ART = { ...PROPS, ...DECOR, ...(EXTRAS.EXTRAS || {}) };

const IDS = (arg('--ids', '') || '').split(',').filter(Boolean);
const N = Number(arg('--n', 4));
const ZOOM = Number(arg('--zoom', 3));
const GROUND = arg('--ground', 'grass');
const SIL = has('--sil');
// Leave every piece at facing 0. The rarer question: what does the art do
// UNTURNED? Useful when asking whether a mirror is even needed.
const FLAT = has('--flat');
// Draw each occupied tile's ground diamond in red under the art. The frame
// that answers "is the ANCHOR right?" for a 1x1, which anchor-audit skips.
const GRID = has('--grid');
const OUT = resolve(arg('--out', 'docs/shots/join.png'));
// Which configurations. Default is the run, because it is the one that has
// already caught two faults; the others are asked for.
const WANT = [
  has('--corner') || has('--all') ? 'corner' : null,
  has('--cross') || has('--all') ? 'cross' : null,
  has('--run') || has('--all') || (!has('--corner') && !has('--cross')) ? 'run' : null,
].filter(Boolean);

if (!IDS.length) {
  console.error('usage: node tools/joinshot.mjs --ids <name>[,<name>...] [--n 4] [--corner] [--cross] [--all]');
  process.exit(2);
}
const missing = IDS.filter((n) => !ART[n]);
if (missing.length) {
  console.error('MISSING: ' + missing.join(', '));
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The lattice. One statement of the projection, imported from js/iso.js so a
// probe and the game cannot disagree about where a tile is.
// ---------------------------------------------------------------------------

const sx = (tx, ty) => (tx - ty) * (TILE_W / 2);
const sy = (tx, ty) => (tx + ty) * (TILE_H / 2);

/**
 * The tiles each configuration occupies, as `[tx, ty, facing]`.
 *
 * THE +ty LEG IS TURNED, because a player turns it. `facings: 2` means the
 * wheel offers the mirror, js/render.js `mirroredRaster` draws it, and a
 * probe that leaves every piece at facing 0 is testing a garden nobody builds
 * — it shows a +ty run as a dotted line of stubs and blames the art. Pass
 * `--flat` to see the untuned truth, which is a different and rarer question.
 */
function layout(kind, n) {
  const out = [];
  const f = FLAT ? 0 : 1;
  if (kind === 'run') {
    for (let i = 0; i < n; i++) out.push([i, 0, 0]); //  along +tx
    for (let i = 0; i < n; i++) out.push([0, i + 2, f]); // along +ty, turned
  } else if (kind === 'corner') {
    const h = Math.max(2, Math.ceil(n / 2));
    for (let i = 0; i < h; i++) out.push([i, 0, 0]);
    for (let i = 1; i < h; i++) out.push([h - 1, i, f]);
  } else if (kind === 'cross') {
    const h = Math.max(1, Math.floor(n / 2));
    out.push([h, h, 0]);
    for (let i = 0; i < h; i++) {
      out.push([i, h, 0]);
      out.push([h + 1 + i, h, 0]);
      out.push([h, i, f]);
      out.push([h, h + 1 + i, f]);
    }
  }
  return out;
}

/**
 * The mirror, as js/render.js does it: every row reversed, and the anchor's
 * pixel lands at `w - 1 - ax`. Getting that second half wrong shifts the piece
 * sideways by twice its anchor offset — invisible on a centred sprite and very
 * visible on the ones this tool exists to look at.
 */
function mirrored(sp) {
  return {
    ...sp,
    rows: sp.rows.map((r) => r.split('').reverse().join('')),
    anchor: [sp.w - 1 - sp.anchor[0], sp.anchor[1]],
  };
}

// ---------------------------------------------------------------------------
// Raster
// ---------------------------------------------------------------------------

function fill(c, hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let i = 0; i < c.width * c.height; i++) {
    c._data[i * 4] = r;
    c._data[i * 4 + 1] = g;
    c._data[i * 4 + 2] = b;
    c._data[i * 4 + 3] = 255;
  }
}
function dot(c, x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
  const i = (y * c.width + x) * 4;
  c._data[i] = r;
  c._data[i + 1] = g;
  c._data[i + 2] = b;
  c._data[i + 3] = 255;
}
function blit(c, sp, dx, dy) {
  for (let y = 0; y < sp.h; y++) {
    const row = sp.rows[y] || '';
    for (let x = 0; x < sp.w; x++) {
      const ch = row[x];
      if (!ch || ch === '.') continue;
      if (SIL) {
        dot(c, dx + x, dy + y, 0x2a, 0x26, 0x20);
        continue;
      }
      const hex = pal(ch);
      if (!hex) continue;
      dot(c, dx + x, dy + y, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
    }
  }
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

const panels = [];
for (const id of IDS) {
  for (const kind of WANT) {
    const sp = ART[id];
    const tiles = layout(kind, N);
    // Screen bounds of the whole arrangement, sprite extents included.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const mir = mirrored(sp);
    for (const [tx, ty, f] of tiles) {
      const a = f ? mir : sp;
      const px = sx(tx, ty) - a.anchor[0];
      const py = sy(tx, ty) - a.anchor[1];
      x0 = Math.min(x0, px); y0 = Math.min(y0, py);
      x1 = Math.max(x1, px + sp.w); y1 = Math.max(y1, py + sp.h);
    }
    const PAD = 24;
    panels.push({ id, kind, sp, mir, tiles, x0: x0 - PAD, y0: y0 - PAD, w: x1 - x0 + PAD * 2, h: y1 - y0 + PAD * 2 });
  }
}

const cellW = Math.max(...panels.map((p) => p.w));
const cellH = Math.max(...panels.map((p) => p.h));
const cols = Math.min(panels.length, Number(arg('--cols', 2)));
const rowsN = Math.ceil(panels.length / cols);
const c = createCanvas(cols * cellW, rowsN * cellH);
fill(c, SIL ? '#ddd2be' : '#2a2620');

const terrain = (TILES.TERRAIN && TILES.TERRAIN[GROUND]) || TILES.GRASS;

panels.forEach((p, i) => {
  const ox = (i % cols) * cellW - p.x0;
  const oy = Math.floor(i / cols) * cellH - p.y0;
  const clipX0 = (i % cols) * cellW;
  const clipY0 = Math.floor(i / cols) * cellH;

  // Ground first: a continuous lattice across this panel only.
  if (!SIL) {
    for (let ty = -4; ty < N + 8; ty++) {
      for (let tx = -4; tx < N + 8; tx++) {
        const t = TILES.variantFor ? TILES.variantFor(terrain, tx, ty) : terrain;
        const px = ox + sx(tx, ty) - TILE_W / 2;
        const py = oy + sy(tx, ty) - TILE_H / 2;
        if (px + TILE_W < clipX0 || px > clipX0 + cellW || py + TILE_H < clipY0 || py > clipY0 + cellH) continue;
        blit(c, t, px, py);
      }
    }
  }

  // The ground diamond of every occupied tile, if asked. This is the frame
  // that answers "is the ANCHOR right?" — a piece whose anchor is off-centre
  // sits visibly beside its own plot, and nothing else in the toolchain shows
  // that for a 1x1 (tools/anchor-audit.mjs is multi-tile only, on purpose).
  if (GRID) {
    for (const [tx, ty] of p.tiles) {
      const cx = ox + sx(tx, ty);
      const cy = oy + sy(tx, ty);
      for (let i = 0; i <= TILE_W / 2; i++) {
        const dy = i >> 1;
        for (const [ax, ay] of [
          [cx - TILE_W / 2 + i, cy - dy], [cx - TILE_W / 2 + i, cy + dy],
          [cx + TILE_W / 2 - i, cy - dy], [cx + TILE_W / 2 - i, cy + dy],
        ]) dot(c, ax, ay, 0xd8, 0x50, 0x50);
      }
    }
  }

  // Then the pieces, back to front: painter's order in iso is tx+ty ascending.
  const order = p.tiles.slice().sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [tx, ty, f] of order) {
    const a = f ? p.mir : p.sp;
    blit(c, a, ox + sx(tx, ty) - a.anchor[0], oy + sy(tx, ty) - a.anchor[1]);
  }
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, encodePNG(ZOOM > 1 ? zoom(c, ZOOM) : c));
console.log(
  `${OUT}  ${c.width * ZOOM}x${c.height * ZOOM}  ` +
    panels.map((p) => `${p.id}:${p.kind}`).join(' ')
);
