// js/art/title.js — the title, in soft pink bubble letters.
//
// The backdrop (`TitleScreen.png`) is the owner's. The LETTERS are ours, and
// they are pixel art like everything else in the game: authored as text,
// resolved against the same eleven ramps, integer-scaled, never a web font.
// SPEC §3's "no fonts, no CDN" survives the title screen.
//
// THE METHOD. A bubble letter is a fat rounded stroke with an outline, a
// highlight up-left and a shadow down-right. Hand-painting eleven of those four
// times over is how you get eleven letters that do not match. So each glyph is
// authored as a FLAT MASK — one character, ink or nothing — and `bubble()`
// derives the four tones from it:
//
//   outline    every empty cell touching ink (8-connected)
//   highlight  ink with nothing above or left of it
//   shade      ink with nothing below or right of it
//   fill       the rest
//
// Change the look once and every letter changes with it. It is the same trick
// `art/grow.js` plays on foliage: author the SHAPE, derive the light.
//
// Light is upper-left, as everywhere else in this game.

import { defineSprite } from './format.js';

// Soft pink, from the blossom accents that are already in the palette:
//   1  #8E1F2A  deep blossom   outline
//   2  #C8414A  blossom        shade
//   3  #E88F9E  pale blossom   fill
//   7  #F2EADA  white          highlight
const OUTLINE = '1';
const SHADE = '2';
const FILL = '3';
const HIGH = '7';
const T = '.';

/**
 * Glyph masks. `#` is ink, `.` is nothing. Twelve rows tall with a three-pixel
 * stroke — fat enough to read as a bubble once the outline and highlight are
 * added, and short enough that the whole title still fits a 640px screen at 2x.
 *
 * Only the letters "GLADES OF ARCADIA" needs. A missing letter draws nothing
 * rather than throwing, so adding a subtitle is a matter of adding masks.
 */
const MASKS = {
  G: [
    '....#####....',
    '..#########..',
    '.###########.',
    '####.....####',
    '###.......###',
    '###..........',
    '###..........',
    '###....######',
    '###....######',
    '###.......###',
    '####.....####',
    '.###########.',
    '..#########..',
    '....#####....',
  ],
  L: [
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '#############',
    '#############',
    '#############',
  ],
  A: [
    '.....###.....',
    '....#####....',
    '...#######...',
    '..####.####..',
    '.####...####.',
    '####.....####',
    '####.....####',
    '#############',
    '#############',
    '#############',
    '####.....####',
    '####.....####',
    '####.....####',
    '####.....####',
  ],
  D: [
    '##########...',
    '###########..',
    '############.',
    '####.....####',
    '####......###',
    '####.......##',
    '####.......##',
    '####.......##',
    '####.......##',
    '####......###',
    '####.....####',
    '############.',
    '###########..',
    '##########...',
  ],
  E: [
    '#############',
    '#############',
    '#############',
    '####.........',
    '####.........',
    '###########..',
    '###########..',
    '###########..',
    '####.........',
    '####.........',
    '#############',
    '#############',
    '#############',
    '.............',
  ],
  S: [
    '..##########.',
    '.############',
    '#############',
    '####.........',
    '####.........',
    '.###########.',
    '..##########.',
    '...##########',
    '.........####',
    '.........####',
    '#############',
    '############.',
    '.##########..',
    '.............',
  ],
  O: [
    '....#####....',
    '..#########..',
    '.###########.',
    '####.....####',
    '###.......###',
    '###.......###',
    '###.......###',
    '###.......###',
    '###.......###',
    '###.......###',
    '####.....####',
    '.###########.',
    '..#########..',
    '....#####....',
  ],
  F: [
    '#############',
    '#############',
    '#############',
    '####.........',
    '####.........',
    '###########..',
    '###########..',
    '###########..',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '####.........',
    '.............',
  ],
  R: [
    '##########...',
    '###########..',
    '############.',
    '####.....####',
    '####.....####',
    '############.',
    '###########..',
    '##########...',
    '####.####....',
    '####..####...',
    '####...####..',
    '####....####.',
    '####.....####',
    '####.....####',
  ],
  C: [
    '....#####....',
    '..#########..',
    '.###########.',
    '####.....####',
    '###.......###',
    '###..........',
    '###..........',
    '###..........',
    '###..........',
    '###.......###',
    '####.....####',
    '.###########.',
    '..#########..',
    '....#####....',
  ],
  I: [
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
    '#####',
  ],
};

const GLYPH_H = 14;

/** Ink at (x,y)? Out of bounds is not ink. */
function ink(mask, x, y) {
  if (y < 0 || y >= mask.length) return false;
  const row = mask[y];
  if (x < 0 || x >= row.length) return false;
  return row[x] === '#';
}

/**
 * A flat mask -> a shaded bubble letter, one pixel of outline all round.
 *
 * The returned rows are two wider and two taller than the mask, because the
 * outline lives OUTSIDE the ink. Everything downstream reads the sprite's own
 * dimensions, so a caller never has to know that.
 */
/**
 * Knock the corner off every convex right-angle: one pass of erosion applied
 * only where two perpendicular neighbours are both empty.
 *
 * This is what makes them BUBBLE letters rather than block letters, and doing
 * it in code rather than by hand means all eleven round identically. Authoring
 * the masks with rounded corners by hand was the first attempt and they came
 * out square, because a 1px chamfer is exactly the sort of thing the eye skips
 * when you are typing hashes into a grid.
 */
function roundCorners(mask) {
  const w = Math.max(...mask.map((r) => r.length));
  const out = [];
  for (let y = 0; y < mask.length; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      if (!ink(mask, x, y)) {
        row += T;
        continue;
      }
      const up = ink(mask, x, y - 1);
      const down = ink(mask, x, y + 1);
      const left = ink(mask, x - 1, y);
      const right = ink(mask, x + 1, y);
      // A convex corner has both of a perpendicular pair missing. An end-cap
      // (three sides missing) is left alone — chamfering those eats thin
      // strokes like the middle bar of an E.
      const missing = (up ? 0 : 1) + (down ? 0 : 1) + (left ? 0 : 1) + (right ? 0 : 1);
      const corner =
        missing === 2 && ((!up && !left) || (!up && !right) || (!down && !left) || (!down && !right));
      row += corner ? T : '#';
    }
    out.push(row);
  }
  return out;
}

export function bubble(rawMask) {
  const mask = roundCorners(rawMask);
  const w = Math.max(...mask.map((r) => r.length));
  const rows = [];
  for (let y = -1; y <= mask.length; y++) {
    let out = '';
    for (let x = -1; x <= w; x++) {
      if (ink(mask, x, y)) {
        // Light the TOP cap of every stroke and shade the BOTTOM one.
        //
        // The first version lit any pixel missing a neighbour above OR to the
        // left, which on a stroke only three or four wide is most of the
        // letter: the fill never appeared and they read as thin outlines
        // rather than as bubbles. Capping top and bottom leaves the fill
        // visible down the middle, which is what makes a stroke look round.
        const up = ink(mask, x, y - 1);
        const down = ink(mask, x, y + 1);
        if (!up) out += HIGH;
        else if (!down) out += SHADE;
        else out += FILL;
        continue;
      }
      // Outline: any empty cell touching ink, including diagonally, so the
      // rounded corners keep their line.
      let touching = false;
      for (let dy = -1; dy <= 1 && !touching; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (ink(mask, x + dx, y + dy)) {
            touching = true;
            break;
          }
        }
      }
      out += touching ? OUTLINE : T;
    }
    rows.push(out);
  }
  return rows;
}

/** Stamp `src` rows into `grid` at (ox, oy). Transparent does not paint. */
function stamp(grid, src, ox, oy) {
  for (let y = 0; y < src.length; y++) {
    const gy = oy + y;
    if (gy < 0 || gy >= grid.length) continue;
    for (let x = 0; x < src[y].length; x++) {
      const ch = src[y][x];
      if (ch === T) continue;
      const gx = ox + x;
      if (gx < 0 || gx >= grid[gy].length) continue;
      grid[gy][gx] = ch;
    }
  }
}

const LETTER_GAP = 2; // between glyphs, after their outlines
const WORD_GAP = 8; // a space

/**
 * Set a line of text in bubble letters. Unknown characters are skipped rather
 * than thrown on — a title is not worth a boot failure.
 */
export function setBubble(text, name = 'title') {
  const glyphs = [];
  let w = 0;
  for (const raw of String(text).toUpperCase()) {
    if (raw === ' ') {
      glyphs.push(null);
      w += WORD_GAP;
      continue;
    }
    const mask = MASKS[raw];
    if (!mask) continue;
    const rows = bubble(mask);
    glyphs.push(rows);
    w += Math.max(...rows.map((r) => r.length)) + LETTER_GAP;
  }
  w = Math.max(1, w - LETTER_GAP);
  const h = GLYPH_H + 2;

  const grid = [];
  for (let y = 0; y < h; y++) grid.push(new Array(w).fill(T));

  let x = 0;
  for (const g of glyphs) {
    if (!g) {
      x += WORD_GAP;
      continue;
    }
    stamp(grid, g, x, 0);
    x += Math.max(...g.map((r) => r.length)) + LETTER_GAP;
  }

  return defineSprite({
    name,
    anchor: [0, 0],
    rows: grid.map((r) => r.join('')),
    tags: ['title', 'text'],
  });
}

/** The title itself, built once. */
export const TITLE = setBubble('GLADES OF ARCADIA', 'title-glades-of-arcadia');

/** Everything this module draws — for the lint pass. */
export function allTitleSprites() {
  return [TITLE];
}
