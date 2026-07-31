// tools/headless-canvas.mjs — enough of Canvas2D to run js/render.js in Node,
// plus a PNG writer, in Node built-ins only (SPEC §1 allows this in tools/).
//
// WHY THIS EXISTS. SPEC §10 is blunt: "Do not author pixel art blind — it does
// not work." The renderer generates art procedurally — grass types, cliff
// faces, waterfalls — and none of it can be judged without looking at it. A
// browser is one way to look; this is the other, and it has three advantages
// that turned out to matter more than expected:
//
//   * it runs in the test suite and in CI, so the checks that a picture cannot
//     make (does every click land where the player aimed? does a full map hold
//     60fps? is every pixel a palette colour?) run automatically,
//   * it is deterministic, so a rendering regression is a diff and not a
//     judgement call,
//   * it does not need a browser tab, which on a project with eight parallel
//     owners is a contended resource.
//
// SCOPE. Exactly the Canvas2D surface js/render.js uses and not one method
// more: createImageData / putImageData / getImageData, 3-argument drawImage,
// clearRect, fillRect + fillStyle, save / restore / beginPath / rect / clip,
// globalAlpha. Everything the renderer draws is per-pixel ImageData or a blit
// of another canvas, because SPEC §3 forbids path drawing for sprite edges —
// which is exactly why this shim can be this small.

import { deflateSync } from 'node:zlib';

const HEX = /^#([0-9a-f]{6})$/i;

function parseHex(s) {
  const m = HEX.exec(String(s).trim());
  if (!m) return [0, 0, 0, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

class ImageDataShim {
  constructor(w, h, data) {
    this.width = w;
    this.height = h;
    this.data = data || new Uint8ClampedArray(w * h * 4);
  }
}

class Ctx2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.imageSmoothingEnabled = true;
    this.fillStyle = '#000000';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this._clip = null; // {x0,y0,x1,y1} or null for the whole canvas
    this._path = null;
    this._stack = [];
  }

  save() {
    this._stack.push({ clip: this._clip, fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
  }

  restore() {
    const s = this._stack.pop();
    if (!s) return;
    this._clip = s.clip;
    this.fillStyle = s.fillStyle;
    this.globalAlpha = s.globalAlpha;
  }

  beginPath() {
    this._path = null;
  }

  rect(x, y, w, h) {
    this._path = { x0: x, y0: y, x1: x + w, y1: y + h };
  }

  clip() {
    if (!this._path) return;
    const p = this._path;
    this._clip = this._clip
      ? {
          x0: Math.max(this._clip.x0, p.x0),
          y0: Math.max(this._clip.y0, p.y0),
          x1: Math.min(this._clip.x1, p.x1),
          y1: Math.min(this._clip.y1, p.y1),
        }
      : { ...p };
  }

  /** The clip rectangle intersected with the canvas, as integers. */
  _bounds() {
    const c = this.canvas;
    const k = this._clip;
    return {
      x0: Math.max(0, Math.round(k ? k.x0 : 0)),
      y0: Math.max(0, Math.round(k ? k.y0 : 0)),
      x1: Math.min(c.width, Math.round(k ? k.x1 : c.width)),
      y1: Math.min(c.height, Math.round(k ? k.y1 : c.height)),
    };
  }

  createImageData(w, h) {
    return new ImageDataShim(w, h);
  }

  /** Real putImageData ignores the clip and the alpha. So does this one. */
  putImageData(img, dx, dy) {
    const c = this.canvas;
    const d = c._data;
    for (let y = 0; y < img.height; y++) {
      const ty = dy + y;
      if (ty < 0 || ty >= c.height) continue;
      for (let x = 0; x < img.width; x++) {
        const tx = dx + x;
        if (tx < 0 || tx >= c.width) continue;
        const s = (y * img.width + x) * 4;
        const t = (ty * c.width + tx) * 4;
        d[t] = img.data[s];
        d[t + 1] = img.data[s + 1];
        d[t + 2] = img.data[s + 2];
        d[t + 3] = img.data[s + 3];
      }
    }
  }

  getImageData(x, y, w, h) {
    const c = this.canvas;
    const out = new ImageDataShim(w, h);
    for (let j = 0; j < h; j++) {
      const sy = y + j;
      if (sy < 0 || sy >= c.height) continue;
      for (let i = 0; i < w; i++) {
        const sx = x + i;
        if (sx < 0 || sx >= c.width) continue;
        const s = (sy * c.width + sx) * 4;
        const t = (j * w + i) * 4;
        out.data[t] = c._data[s];
        out.data[t + 1] = c._data[s + 1];
        out.data[t + 2] = c._data[s + 2];
        out.data[t + 3] = c._data[s + 3];
      }
    }
    return out;
  }

  clearRect(x, y, w, h) {
    const c = this.canvas;
    const b = this._bounds();
    const x0 = Math.max(b.x0, Math.round(x));
    const y0 = Math.max(b.y0, Math.round(y));
    const x1 = Math.min(b.x1, Math.round(x + w));
    const y1 = Math.min(b.y1, Math.round(y + h));
    for (let j = y0; j < y1; j++) {
      c._data.fill(0, (j * c.width + x0) * 4, (j * c.width + x1) * 4);
    }
  }

  fillRect(x, y, w, h) {
    const c = this.canvas;
    const [r, g, bl] = parseHex(this.fillStyle);
    const b = this._bounds();
    const x0 = Math.max(b.x0, Math.round(x));
    const y0 = Math.max(b.y0, Math.round(y));
    const x1 = Math.min(b.x1, Math.round(x + w));
    const y1 = Math.min(b.y1, Math.round(y + h));
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        const t = (j * c.width + i) * 4;
        c._data[t] = r;
        c._data[t + 1] = g;
        c._data[t + 2] = bl;
        c._data[t + 3] = 255;
      }
    }
  }

  /** 3-argument drawImage, source-over, respecting the clip and globalAlpha. */
  drawImage(src, dx, dy) {
    const c = this.canvas;
    const d = c._data;
    const s = src._data;
    if (!s) return;
    const b = this._bounds();
    const ox = Math.round(dx);
    const oy = Math.round(dy);
    const ga = this.globalAlpha;
    const y0 = Math.max(b.y0, oy);
    const y1 = Math.min(b.y1, oy + src.height);
    const x0 = Math.max(b.x0, ox);
    const x1 = Math.min(b.x1, ox + src.width);
    for (let ty = y0; ty < y1; ty++) {
      const sy = ty - oy;
      for (let tx = x0; tx < x1; tx++) {
        const sx = tx - ox;
        const si = (sy * src.width + sx) * 4;
        let a = s[si + 3];
        if (!a) continue;
        if (ga !== 1) a = a * ga;
        const ti = (ty * c.width + tx) * 4;
        if (a >= 255) {
          d[ti] = s[si];
          d[ti + 1] = s[si + 1];
          d[ti + 2] = s[si + 2];
          d[ti + 3] = 255;
        } else {
          const al = a / 255;
          const inv = 1 - al;
          d[ti] = s[si] * al + d[ti] * inv;
          d[ti + 1] = s[si + 1] * al + d[ti + 1] * inv;
          d[ti + 2] = s[si + 2] * al + d[ti + 2] * inv;
          d[ti + 3] = Math.min(255, a + d[ti + 3] * inv);
        }
      }
    }
  }
}

class CanvasShim {
  constructor(w = 300, h = 150) {
    this._w = 0;
    this._h = 0;
    this.style = {};
    this.width = w;
    this.height = h;
  }

  get width() {
    return this._w;
  }

  set width(v) {
    this._w = v | 0;
    this._alloc();
  }

  get height() {
    return this._h;
  }

  set height(v) {
    this._h = v | 0;
    this._alloc();
  }

  _alloc() {
    this._data = new Uint8ClampedArray(Math.max(0, this._w * this._h * 4));
    this._ctx = null;
  }

  getContext() {
    if (!this._ctx) this._ctx = new Ctx2D(this);
    return this._ctx;
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: this._w, height: this._h };
  }
}

/**
 * Install the shim as a global `document`. Idempotent, and it never replaces a
 * real DOM — so a page that imports this by accident is unharmed.
 */
export function installCanvas() {
  if (typeof globalThis.document !== 'undefined' && globalThis.document) return globalThis.document;
  const doc = {
    createElement(tag) {
      if (String(tag).toLowerCase() !== 'canvas') throw new Error(`headless-canvas: only <canvas>, not <${tag}>`);
      return new CanvasShim();
    },
  };
  globalThis.document = doc;
  return doc;
}

export function createCanvas(w, h) {
  return new CanvasShim(w, h);
}

// ---------------------------------------------------------------------------
// PNG out. Filter 0 on every scanline and one zlib block — the point is to be
// readable by a human eye, not small.

const CRC_TABLE = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** RGBA canvas (or {width,height,_data}) -> PNG bytes. */
export function encodePNG(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const src = canvas._data;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = src[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Nearest-neighbour zoom, so a 64x32 tile can be looked at honestly. */
export function zoom(canvas, k) {
  const out = new CanvasShim(canvas.width * k, canvas.height * k);
  for (let y = 0; y < out.height; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < out.width; x++) {
      const sx = (x / k) | 0;
      const s = (sy * canvas.width + sx) * 4;
      const t = (y * out.width + x) * 4;
      out._data[t] = canvas._data[s];
      out._data[t + 1] = canvas._data[s + 1];
      out._data[t + 2] = canvas._data[s + 2];
      out._data[t + 3] = canvas._data[s + 3];
    }
  }
  return out;
}
