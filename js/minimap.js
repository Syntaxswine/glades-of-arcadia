// js/minimap.js — the whole garden, one pixel per tile.
//
// WHY IT EXISTS. The map went from 20x20 to 60x60 — nine times the ground — and
// the visible window did not change. A player can now be a long walk from their
// own garden with no way to tell which way it is, and panning blind across a
// meadow that is deliberately featureless is the worst possible way to find out.
// A minimap is the period answer and it is the right one.
//
// IT IS A DIAMOND, and that is not decoration. Every isometric game of the era
// drew its minimap in the same projection as its world — Caesar III, Pharaoh,
// Zeus all do — because a square minimap of an isometric map forces the player
// to mentally rotate 45 degrees every time they glance at it. The shape on the
// minimap is the shape on screen, turned the same way, so "the pond is up-left"
// means the same thing in both places.
//
// ONE PIXEL PER TILE, exactly, with no gaps and no overlaps:
//
//     px = (tx - ty) + (mapH - 1)        py = (tx + ty) >> 1
//
// That halving looks lossy and is not. `tx - ty` and `tx + ty` always have the
// same parity, so the tiles whose sums round DOWN onto a row interleave exactly
// with the tiles whose sums round down onto it from the next diagonal: row 1
// takes the four tiles of sum 2 at even columns and the four of sum 3 at odd
// ones. The diamond fills solid. (Row 0 is the only short row — one diagonal
// instead of two — which is why the north corner looks a touch thin. It is.)
//
// The result for a 60x60 map is 120 x 60 logical pixels, which is a fifth of the
// screen's width and fits in the corner of the view without covering the garden.
//
// COST. The terrain layer is rasterised once into an offscreen canvas and
// rebuilt only when `invalidate()` is called — the same discipline render.js
// uses for its terrain cache, and for the same reason: 3600 fillRect calls per
// frame is not free at 60Hz, and the ground changes about once a minute. The
// per-frame cost is one drawImage, one loop over the object list, one over the
// creatures, and a four-line camera quad.

import { RAMPS, ACCENT } from './palette.js';
import { MAP_W, MAP_H, toTile } from './iso.js';

/** Logical-pixel geometry, derived. Nothing here is a magic number. */
export const MINIMAP = Object.freeze({
  // The corners, exactly: x runs 0 (tile 0,H-1) to W+H-2 (tile W-1,0), and the
  // last row is the one tile (W-1,H-1) lands on. Rounded UP from the map rather
  // than guessed, so there is never a dead row of surround along an edge.
  W: MAP_W + MAP_H - 1,
  H: ((MAP_W + MAP_H - 2) >> 1) + 1,
  PAD: 2, // the frame, in pixels, on every side
  MARGIN: 6, // how far it sits off the corner of the view
});

/** Tile -> minimap pixel. The whole projection, in two lines. */
export function tileToMini(tx, ty) {
  return { x: (tx - ty) + (MAP_H - 1), y: (tx + ty) >> 1 };
}

/**
 * Minimap pixel -> tile. The inverse is one-to-many (a pixel is one tile, but
 * the halved row loses the parity), so this returns the tile on the EVEN
 * diagonal, which is never more than one tile out. For centring a camera that
 * is well inside a rounding error.
 */
export function miniToTile(x, y) {
  const d = x - (MAP_H - 1); // tx - ty
  const s = y * 2 + (Math.abs(d % 2) === 1 ? 1 : 0); // tx + ty, parity restored
  return { tx: Math.round((s + d) / 2), ty: Math.round((s - d) / 2) };
}

/**
 * Ground type -> a single colour, taken from the ramps like everything else.
 *
 * These are the ramp MIDS, not the lights: a minimap is looked at out of the
 * corner of the eye and a bright one pulls focus off the garden, which is the
 * thing the player is actually here for. See docs/SPEC §7 on restraint.
 */
const GROUND_HEX = Object.freeze({
  grass: RAMPS.grass.hex[1],
  greensward: RAMPS.grass.hex[2],
  meadow: RAMPS.grass.hex[1],
  millefleurs: RAMPS.grass.hex[3],
  moss: RAMPS.cypress.hex[2],
  tilled: RAMPS.earth.hex[1],
  gravel: RAMPS.earth.hex[3],
  rock: RAMPS.rock.hex[2],
  water: RAMPS.water.hex[2],
  marsh: RAMPS.water.hex[1],
});
const GROUND_FALLBACK = RAMPS.grass.hex[1];

/**
 * The species grasses, which are the point of zoning and therefore the thing
 * worth being able to see from across the map. Distinct in HUE rather than in
 * value, because at one pixel per tile a value difference reads as noise.
 */
const GRASS_HEX = Object.freeze({
  meadow: null, // the baseline. Let the ground speak.
  thicket: RAMPS.olive.hex[1],
  sward: RAMPS.grass.hex[3],
  fen: RAMPS.water.hex[1],
  millefleurs: ACCENT[3],
});

/** Object group -> dot colour. Trees dark, stone pale, water blue. */
const GROUP_HEX = Object.freeze({
  trees: RAMPS.canopy.hex[0],
  plants: RAMPS.canopy.hex[1],
  statuary: RAMPS.marble.hex[3],
  building: RAMPS.marble.hex[1],
  furniture: RAMPS.earth.hex[0],
  water: RAMPS.water.hex[4],
  land: RAMPS.rock.hex[1],
  ground: null, // painted floor; already in the terrain layer
});
const GROUP_FALLBACK = RAMPS.earth.hex[0];

const FRAME = ACCENT[6];
const EDGE = RAMPS.rock.hex[1];
/**
 * Behind the diamond. It was the sky ramp's pale blue first — the same colour
 * render.js uses for the off-map surround, which seemed like the consistent
 * choice and was wrong on sight: at this size the panel is mostly surround, so
 * a light blue rectangle sat in the corner of a green map shouting louder than
 * the garden. Dark and neutral, so the diamond floats and the eye goes to the
 * zoning.
 */
const SURROUND = RAMPS.rock.hex[0];
// The border is the palest thing in the game; the creature dot is warm, so the
// two never read as the same signal even where they overlap.
const CAMERA = ACCENT[7];
const CREATURE = ACCENT[5];

/** One blink. Slow enough to read as a pulse, quick enough to catch the eye. */
const BLINK_MS = 900;

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return cv;
}

/**
 * @param {object} opts
 * @param {object} opts.world    the World; read through groundAt/grassAt/objects
 * @param {Function} [opts.groupOf]  id -> group name, normally catalog's byId
 */
export function createMinimap(opts = {}) {
  const world = opts.world || null;
  const groupOf = typeof opts.groupOf === 'function' ? opts.groupOf : () => null;
  const w = MINIMAP.W;
  const h = MINIMAP.H;

  let terrain = makeCanvas(w, h);
  let stale = true;

  function rebuild() {
    if (!terrain || !world) return;
    const ctx = terrain.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const mw = world.w || MAP_W;
    const mh = world.h || MAP_H;
    const grass = typeof world.grassAt === 'function' ? (x, y) => world.grassAt(x, y) : () => null;
    for (let ty = 0; ty < mh; ty++) {
      for (let tx = 0; tx < mw; tx++) {
        const g = world.groundAt(tx, ty);
        // The species grass wins over the ground it grew on — it is the thing
        // the player made, and the thing they are trying to see.
        const sp = GRASS_HEX[grass(tx, ty)] || null;
        const hex = sp || GROUND_HEX[g] || GROUND_FALLBACK;
        const p = tileToMini(tx, ty);
        ctx.fillStyle = hex;
        ctx.fillRect(p.x, p.y, 1, 1);
      }
    }
    stale = false;
  }

  /**
   * Where the panel sits, in logical screen pixels. UPPER right of the view —
   * the owner's call, and the period one: Caesar III and Pharaoh both put it
   * there, and it keeps the minimap out of the bottom edge where the panel and
   * the ghost preview already compete.
   */
  function rect(view) {
    const v = view || { x: 0, y: 14, w: 640, h: 286 };
    const pw = w + MINIMAP.PAD * 2;
    const ph = h + MINIMAP.PAD * 2;
    return {
      x: v.x + v.w - pw - MINIMAP.MARGIN,
      y: v.y + MINIMAP.MARGIN,
      w: pw,
      h: ph,
    };
  }

  // -------------------------------------------------------------- overview --
  //
  // THE WHOLE GARDEN, BIG, IN THE MIDDLE OF THE VIEW — what a pinch opens.
  //
  // WHY THIS AND NOT A ZOOM. A phone player pinching a map means "show me more
  // of it", and Arcadia cannot answer that literally: the backing canvas is
  // exactly the logical screen, the CSS upscale is a whole number (SPEC §2),
  // and the tiles are 64x32 pixel art. Zooming out would mean either a
  // fractional canvas — which smears every pixel the game has — or a second
  // art set at another tile size. Both break a founding law to serve a
  // gesture.
  //
  // But the INTENT behind the pinch is completely servable, and the machinery
  // was already here: the minimap is the whole garden in one picture, in the
  // same projection as the screen, with a camera box and a tap-to-travel that
  // have both worked since the day it shipped. It was simply 119x60 in a
  // corner. Pinch makes it big and puts it in the middle. Same projection, same
  // pick, same draw code — magnified.
  //
  // So: pinch-in (fingers together) = "show me everything"; tap a spot to go
  // there; pinch-out or tap away to close.

  let expanded = false;

  /**
   * How many screen pixels one map pixel gets in the overview. A WHOLE NUMBER,
   * for the same reason everything else here is: this is pixel art and a 2.4x
   * minimap is a blurred minimap.
   *
   * Capped at 3 because past that the thing stops being a map and starts being
   * a mosaic — at 119 wide, 3x is already 357 and fills a phone edge to edge.
   */
  function overviewScale(view) {
    const v = view || { x: 0, y: 14, w: 640, h: 286 };
    const room = (extent, span) => Math.floor((span - MINIMAP.MARGIN * 2 - MINIMAP.PAD * 2) / extent);
    return Math.max(1, Math.min(3, Math.min(room(w, v.w), room(h, v.h))));
  }

  /** The overview panel, centred in the view. */
  function overviewRect(view) {
    const v = view || { x: 0, y: 14, w: 640, h: 286 };
    const k = overviewScale(view);
    const pw = w * k + MINIMAP.PAD * 2;
    const ph = h * k + MINIMAP.PAD * 2;
    return {
      x: Math.round(v.x + (v.w - pw) / 2),
      y: Math.round(v.y + (v.h - ph) / 2),
      w: pw,
      h: ph,
    };
  }

  /** The rect actually in use right now — corner, or the big one. */
  function liveRect(view) {
    return expanded ? overviewRect(view) : rect(view);
  }

  function liveScale(view) {
    return expanded ? overviewScale(view) : 1;
  }

  return {
    get width() {
      return w;
    },
    get height() {
      return h;
    },
    rect,
    overviewRect,
    overviewScale,
    /** The ground changed. Cheap — the redraw happens on the next frame. */
    invalidate() {
      stale = true;
    },

    /** Is the whole-garden overview up? */
    get expanded() {
      return expanded;
    },
    /** Open or close it. Returns the state, so a caller can announce it. */
    setExpanded(on) {
      expanded = !!on;
      return expanded;
    },
    toggleExpanded() {
      expanded = !expanded;
      return expanded;
    },

    /**
     * Is this logical screen point on the minimap? Input asks BEFORE it picks a
     * tile, because a click on the minimap must never also plant a tree in the
     * glade underneath it.
     */
    hit(sx, sy, view) {
      // WHEN THE OVERVIEW IS OPEN IT OWNS THE WHOLE VIEW, not just its own
      // panel. It is a modal picture of the garden laid over the garden, and a
      // tap on the meadow showing round its edge must close it rather than
      // plant a tree through it — which is exactly what would happen if this
      // reported a miss, because input.js falls through to the tools on false.
      if (expanded) {
        const v = view || { x: 0, y: 14, w: 640, h: 286 };
        return sx >= v.x && sy >= v.y && sx < v.x + v.w && sy < v.y + v.h;
      }
      const r = rect(view);
      return sx >= r.x && sy >= r.y && sx < r.x + r.w && sy < r.y + r.h;
    },

    /** Which tile a click on the minimap means, or null if it missed the map. */
    pick(sx, sy, view) {
      const r = liveRect(view);
      const k = liveScale(view);
      const x = Math.floor((sx - r.x - MINIMAP.PAD) / k);
      const y = Math.floor((sy - r.y - MINIMAP.PAD) / k);
      if (x < 0 || y < 0 || x >= w || y >= h) return null;
      const t = miniToTile(x, y);
      const mw = (world && world.w) || MAP_W;
      const mh = (world && world.h) || MAP_H;
      if (t.tx < 0 || t.ty < 0 || t.tx >= mw || t.ty >= mh) return null;
      return t;
    },

    /**
     * Draw it. `cam` is the renderer's snapped camera, `view` the map rectangle
     * in logical pixels, `creatures` the same flat list the scene carries.
     */
    draw(ctx, cam, view, creatures, nowMs) {
      if (!ctx || !terrain || !world) return;
      if (stale) rebuild();
      const r = liveRect(view);
      // ONE DRAW PATH FOR BOTH SIZES. `k` is 1 for the corner map and 2 or 3
      // for the overview; every `1` that used to be a pixel is now `k`. Writing
      // a second draw routine for the big one would be two pictures of the same
      // garden that could disagree, which is the fault this project keeps
      // finding in itself.
      const k = liveScale(view);

      ctx.fillStyle = FRAME;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = SURROUND;
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      ctx.fillStyle = EDGE;
      ctx.fillRect(r.x, r.y, r.w, 1);

      const ox = r.x + MINIMAP.PAD;
      const oy = r.y + MINIMAP.PAD;
      // Nearest-neighbour, explicitly. The context is shared with the renderer,
      // which already sets this, but a magnified minimap is the one thing here
      // that would show a smoothed upscale if anybody ever changed that.
      const smooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      if (k === 1) ctx.drawImage(terrain, ox, oy);
      else ctx.drawImage(terrain, 0, 0, w, h, ox, oy, w * k, h * k);
      ctx.imageSmoothingEnabled = smooth;

      // Objects, over the terrain. One pixel each: a tree is not bigger than a
      // tile here, and pretending otherwise turns a wood into a blot.
      const objs = (world && world.objects) || [];
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        const hex = GROUP_HEX[groupOf(o.id)];
        if (hex === null || hex === undefined) continue;
        const p = tileToMini(o.tx | 0, o.ty | 0);
        ctx.fillStyle = hex;
        ctx.fillRect(ox + p.x * k, oy + p.y * k, k, k);
      }

      // THE CAMERA, AS A SQUARE. The view is a rectangle on screen, so in TILE
      // space it is a rotated one — but the minimap is drawn in the SAME
      // projection as the screen, and that rotation cancels: the bounding box of
      // the four projected corners is upright, and it is what the player is
      // actually looking at. So a plain square border, which is the owner's ask
      // and also what every game of the period drew.
      //
      // Under the creatures, deliberately. A blinking dot that vanishes behind
      // the border every time it crosses it is a dot the player will chase.
      if (cam) {
        const v = view || { x: 0, y: 14, w: 640, h: 286 };
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (const [sx, sy] of [
          [v.x, v.y],
          [v.x + v.w, v.y],
          [v.x + v.w, v.y + v.h],
          [v.x, v.y + v.h],
        ]) {
          const t = toTile(sx, sy, cam);
          const p = tileToMini(t.fx, t.fy);
          if (p.x < x0) x0 = p.x;
          if (p.y < y0) y0 = p.y;
          if (p.x > x1) x1 = p.x;
          if (p.y > y1) y1 = p.y;
        }
        // Clamped to the panel, so a camera pushed against the world edge shows
        // a border flush with the rim rather than one drawn off into the frame.
        x0 = Math.max(0, Math.round(x0));
        y0 = Math.max(0, Math.round(y0));
        x1 = Math.min(w - 1, Math.round(x1));
        y1 = Math.min(h - 1, Math.round(y1));
        if (x1 > x0 && y1 > y0) {
          ctx.strokeStyle = CAMERA;
          ctx.lineWidth = 1;
          // +0.5 so a 1px stroke lands ON a pixel instead of across two.
          ctx.strokeRect(ox + x0 * k + 0.5, oy + y0 * k + 0.5, (x1 - x0) * k, (y1 - y0) * k);
        }
      }

      // Creatures last and brightest — "where is the satyr" is the single most
      // common reason to look at this thing at all.
      //
      // THEY BLINK, because a single static pixel among 3600 static pixels is
      // not findable. A blink is the one signal the eye picks out of a still
      // field without being told to look, and it costs one pixel: the period
      // solution, and the reason Caesar III's minimap flashes its walkers.
      // Two-thirds on, one-third off, at BLINK_MS — slow enough to read as a
      // pulse rather than as a rendering fault.
      const on = nowMs == null || (nowMs % BLINK_MS) < BLINK_MS * 0.66;
      if (on) {
        const list = creatures || [];
        ctx.fillStyle = CREATURE;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.present === false) continue;
          const p = tileToMini(Math.round(c.x), Math.round(c.y));
          if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
          ctx.fillRect(ox + p.x * k, oy + p.y * k, k, k);
        }
      }
    },
  };
}
