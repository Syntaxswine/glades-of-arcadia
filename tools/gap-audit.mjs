#!/usr/bin/env node
/**
 * tools/gap-audit.mjs — CAN YOU SEE THE GROUND THROUGH IT?
 *
 *   node tools/gap-audit.mjs
 *   node tools/gap-audit.mjs --map docs/shots/gaps.png --wall hedge-tall --gate hedge-arch
 *
 * WHY THIS EXISTS, and why nothing already here could do it.
 *
 * The owner, looking at a tall hedge with arches set into it:
 *
 *   *"could we just make it so its always drawn closed and the hedges that are
 *   in front of the other edges always overlap?"*
 *
 * There were wedges of grass showing through the hedge. Three instruments were
 * already pointed at that art and all three said it was fine:
 *
 *   propshot / joinshot   draw the art. A human has to notice, and the wedges
 *                         are four pixels wide at 1x.
 *   an enclosed-hole test flood-fills transparency inward from the frame. These
 *                         gaps are OPEN TO THE SKY at the top of the run, so
 *                         the fill reaches them and calls them background.
 *                         Result: 1 stray pixel, and the real fault invisible.
 *   a notch test          looks for a column whose topmost ink sits below its
 *                         neighbours. Scores ZERO on every sprite here, because
 *                         **no single sprite has the fault at all.**
 *
 * That last line is the point. A GATEWAY IS THE ONLY PIECE IN A RUN THAT IS NOT
 * INTERCHANGEABLE WITH ITS NEIGHBOURS, and the fault only exists once a taller
 * piece stands next to a shorter one. It is a property of the COMPOSITE. So
 * this tool composes a real run — the same masks js/main.js would pick — and
 * asks the one question that catches it:
 *
 *   is there a transparent pixel with ink ABOVE it and ink BELOW it,
 *   in the same column?
 *
 * That is a hole you can see the ground through. A plain run of any family
 * scores zero. Every gateway scored in the hundreds.
 *
 * WHAT IT DOES NOT KNOW. A doorway is a hole ON PURPOSE, and this tool cannot
 * tell an intended one from an accident — it counts both. That is why it prints
 * a count and a picture rather than passing or failing: the hedge arch's
 * opening is filled with the dark of the way through (decor.js: "a hole that
 * shows the grass behind it reads as damage"), so a CORRECT gate scores zero
 * here, but a gate drawn some other way legitimately might not. Read the map.
 *
 * Node built-ins only (SPEC §1).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createCanvas, encodePNG, zoom } from './headless-canvas.mjs';
import { PROPS } from '../js/art/props.js';
import DECOR from '../js/art/decor.js';
import * as EXTRAS from '../js/art/extras.js';
import { TILE_W, TILE_H, JOIN_DIRS } from '../js/iso.js';

const argv = process.argv.slice(2);
const arg = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const ART = { ...PROPS, ...(EXTRAS.EXTRAS || {}), ...DECOR };

/**
 * Every gate the catalogue sets into a wall, and the wall it belongs to.
 *
 * A wall with no gate is listed with a null: the census is about RUNS, and
 * three of the five run families were missing from it because the tool was
 * written the day the gateways were, and gateways were the question that day.
 * A family absent from an instrument reads exactly like a family that passed.
 */
const PAIRS = [
  ['hedge-tall', 'hedge-arch'],
  ['drystone-wall', 'drystone-gateway'],
  ['palisade-fence', 'palisade-gate'],
  ['balustrade', null],
  ['colonnade', null],
];

/**
 * A FENCE YOU CAN SEE BETWEEN IS NOT A FENCE WITH HOLES IN IT.
 *
 * The palisade is pickets with daylight between them, so it scores in the
 * hundreds here and every one of those pixels is deliberate. Naming it is the
 * honest move: the alternative is a tool that cries wolf on one family and
 * gets ignored on all three. If a family is added here, say WHY in one line —
 * "it looked wrong" is not a reason, "you are supposed to see the garden
 * through it" is.
 */
const SEE_THROUGH = new Map([
  ['palisade-fence', 'pickets with daylight between them — the gaps ARE the object'],
  ['balustrade', 'turned stone with air between it — a solid band with lines on it is a wall'],
  ['colonnade', 'columns carrying an entablature, and the sky between them is the point'],
]);

/**
 * Lay a straight +tx run of `n` pieces and return the occupied screen pixels.
 * Masks are resolved from the neighbourhood exactly as the game resolves them,
 * so this is the run a player builds and not an approximation of one.
 */
function compose(wall, gate, n, gi) {
  const tiles = [];
  for (let i = 0; i < n; i++) tiles.push([i, 0]);
  const here = new Set(tiles.map(([a, b]) => `${a},${b}`));
  const cells = new Set();
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  tiles.forEach(([tx, ty], idx) => {
    const base = ART[idx === gi ? gate : wall];
    if (!base) return;
    let mask = 0;
    for (const [dtx, dty, bit] of JOIN_DIRS) if (here.has(`${tx + dtx},${ty + dty}`)) mask |= bit;
    const sp = base.joins ? base.joins[mask] || base : base;
    const ox = (tx - ty) * (TILE_W / 2) - sp.anchor[0];
    const oy = (tx + ty) * (TILE_H / 2) - sp.anchor[1];
    sp.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '.') continue;
        const X = ox + x;
        const Y = oy + y;
        cells.add(`${X},${Y}`);
        if (X < box.minX) box.minX = X;
        if (X > box.maxX) box.maxX = X;
        if (Y < box.minY) box.minY = Y;
        if (Y > box.maxY) box.maxY = Y;
      }
    });
  });
  return { cells, ...box };
}

/** Transparent pixels with ink above AND below, in the same column. */
function gaps({ cells, minX, minY, maxX, maxY }) {
  const out = [];
  for (let x = minX; x <= maxX; x++) {
    let seen = false;
    let pend = [];
    for (let y = minY; y <= maxY; y++) {
      if (cells.has(`${x},${y}`)) {
        if (seen && pend.length) out.push(...pend);
        pend = [];
        seen = true;
      } else if (seen) pend.push([x, y]);
    }
  }
  return out;
}

const MAP = arg('--map', '');
if (MAP) {
  const wall = arg('--wall', 'hedge-tall');
  const gate = arg('--gate', 'hedge-arch');
  const c = compose(wall, gate, 5, 2);
  const found = gaps(c);
  const W = c.maxX - c.minX + 3;
  const H = c.maxY - c.minY + 3;
  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;
  const set = (x, y, r, g, b) => {
    const i = (y * W + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, 120, 150, 80);
  for (const k of c.cells) {
    const [x, y] = k.split(',').map(Number);
    set(x - c.minX + 1, y - c.minY + 1, 45, 60, 45);
  }
  for (const [x, y] of found) set(x - c.minX + 1, y - c.minY + 1, 255, 0, 200);
  // WITHOUT THIS LINE THE MAP IS BLANK, and blank is the worst possible
  // failure for this particular tool. `createImageData` hands back a DETACHED
  // buffer; painting into it and then encoding the CANVAS writes the canvas,
  // which nothing has touched. Every --map PNG written before this fix was
  // 100% transparent — and a fully transparent PNG opens as a white page,
  // which is indistinguishable from "there are no gaps" to anyone looking at
  // it. An instrument that fails silently in the direction of GOOD NEWS is
  // worse than no instrument. Found by an agent that decoded the output and
  // counted the pixels instead of trusting the picture.
  ctx.putImageData(img, 0, 0);
  mkdirSync(dirname(resolve(MAP)), { recursive: true });
  writeFileSync(resolve(MAP), encodePNG(zoom(cv, 6)));
  console.log(`${MAP}  ${W}x${H}  ${wall} + ${gate}  ${found.length} gap px (magenta)`);
  process.exit(0);
}

console.log('\ngap audit — can you see the ground through a run?\n');
console.log('  configuration                          gap px   verdict');
console.log('  ' + '-'.repeat(62));
let worst = 0;
for (const [wall, gate] of PAIRS) {
  if (!ART[wall]) continue;
  const why = SEE_THROUGH.get(wall);
  const plain = gaps(compose(wall, wall, 5, -1)).length;
  console.log(
    ('  ' + wall + ', plain run').padEnd(41) + String(plain).padStart(6),
    why ? '   by design' : plain ? '   <-- a plain run should be solid' : '   solid'
  );
  if (!ART[gate]) continue;
  const withGate = gaps(compose(wall, gate, 5, 2)).length;
  if (!why) worst = Math.max(worst, withGate);
  console.log(
    ('  ' + wall + ' + ' + gate).padEnd(41) + String(withGate).padStart(6),
    why ? '   by design' : withGate ? '   <-- look at it: --map' : '   solid'
  );
  if (why) console.log('        ' + wall + ': ' + why);
}
console.log(
  '\n  A plain run of any family must be 0. A gate should be too, because a\n' +
    '  doorway is filled with the dark of the way through rather than left\n' +
    '  transparent. Anything else is grass seen through masonry.\n'
);
console.log('  This is a census, not a gate. It exits 0 whatever it finds.\n');
