// main.js — boot, and the loop.
//
// This module owns four things and nothing else:
//
//   1. BOOT     load the sibling modules, wire them to each other, restore the
//               player's garden or plant them a new one.
//   2. THE JOIN the places where two modules meet and neither owns the seam:
//               world edits -> field deposits, world + fields + bestiary ->
//               the render scene, input's camera -> the renderer's camera.
//   3. THE LOOP one fixed-timestep simulation, decoupled from one render frame.
//   4. AUTOSAVE continuously, into world.extra. A garden is never lost.
//
// It knows the ORDER things happen in and nothing about how any of them work.
//
// The entry point is `start(shell)`, called by index.html once the shell (the
// integer-scaled letterboxed stage) is already up. index.html hands us the
// app element, the canvas, and the three shell functions it already imported,
// so we do not import them twice or fight it for the canvas box.
//
// Everything below binds defensively — a sibling that throws costs you its own
// feature and nothing else, and `window.arcadia.boot` prints exactly what
// bound and what did not. Eight people wrote this game at once; the cost of
// that is a boot report, and the benefit is that a broken module never eats
// the player's glade.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// THE MAP SIZE COMES FROM iso.js AND FROM NOWHERE ELSE.
//
// It used to be declared here as well, and the two copies were the real trap:
// iso.js's pair were only ever used as default parameters inside iso.js, so
// they were dead — main.js's were the ones the game actually ran on, and
// editing the "obvious" declaration would have changed nothing at all.
//
// This is the only static import in this file. Everything else is loaded
// defensively so a broken sibling costs you its own feature and nothing else;
// iso.js is exempt because it is pure arithmetic with no dependencies, and a
// game that cannot project a tile has no feature left to lose.
import { MAP_W, MAP_H, VIEW_W, VIEW_H, JOIN_DIRS } from './iso.js';
import { createMinimap } from './minimap.js';

// SPEC §2 — the backing store, exactly. IMPORTED, not restated: this file used
// to declare its own 640 x 400, as did input.js and ui.js. See iso.js §VIEW_W.
const LOGICAL_W = VIEW_W;
const LOGICAL_H = VIEW_H;

const SIM_HZ = 20;
const SIM_DT = 1 / SIM_HZ; // garden seconds per simulation step
const MAX_FRAME_DT = 0.25; // clamp both ends — a slept tab must not fast-forward
const MAX_CATCHUP = 5; // spiral-of-death guard

/**
 * THE SPEED CONTROL, and the one law it must not break.
 *
 * A garden is a thing you wait for. That is the point of it — and it is also
 * the reason a builder of this kind has always had a clock you can lean on:
 * you plant a walk of cypress and you would like to SEE it be a walk of
 * cypress. Every game in the lineage has this control, in the same corner.
 *
 * **THE STEP IS NEVER SCALED. ONLY THE NUMBER OF STEPS.**
 *
 * The simulation is fixed-timestep on purpose (see the loop, below): a 144Hz
 * monitor and a 30Hz one grow the same garden because both advance in 1/20s
 * increments. The lazy way to make time go faster is `sim(SIM_DT * speed)`,
 * and it would quietly undo that: growth curves, creature legs, the field
 * ageing and the pathing would all take bigger bites, and a garden run at 4x
 * would not be the same garden run for four times as long. It would be a
 * DIFFERENT garden — coarser, and in the pathing's case measurably wrong,
 * because `_leg` integrates a position and a longer leg overshoots corners.
 *
 * So speed multiplies the ACCUMULATOR. At 4x, four times as many identical
 * 1/20s steps run per frame, which is arithmetically indistinguishable from
 * having left the tab open four times as long. Nothing downstream can tell,
 * and nothing downstream has to be told — which is why no other file in this
 * game knows this control exists.
 *
 * The catch-up guard scales with it, or the loop would hit its ceiling every
 * frame at 4x and drop the very time the player asked for.
 */
export const SPEEDS = Object.freeze([1, 2, 4]);

/**
 * How many fixed steps this frame owes, and what is left over. Pure, and
 * exported because it is the whole mechanism and the law above is worth a test
 * rather than a comment.
 *
 * `dt` is REAL seconds, already clamped. The returned `steps` is capped, and
 * `dropped` says whether the cap bit — the caller throws the debt away rather
 * than compounding it, which is the existing spiral-of-death behaviour.
 */
export function simSchedule(acc, dt, speed = 1) {
  const mult = SPEEDS.includes(speed) ? speed : 1;
  let left = acc + dt * mult;
  const cap = MAX_CATCHUP * mult;
  let steps = 0;
  while (left >= SIM_DT && steps < cap) {
    left -= SIM_DT;
    steps++;
  }
  const dropped = steps === cap;
  return { steps, acc: dropped ? 0 : left, dropped, dt: SIM_DT };
}

const LADDER_EVERY = 4; // sim steps between event drains — 5 Hz
const MOOD_EVERY = 10; // sim steps between audio mood pushes — 2 Hz
const AUTOSAVE_EVERY = 4.0; // garden seconds; only writes when something changed

const WATER_HZ = 8; // RESEARCH A§7 — a rippling shallow. render.js drives it.
const DEFAULT_GROUND = 'grass';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** mulberry32 — small, fast, and identical on every machine. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** First function found under any of these names. */
function bind(mod, names) {
  if (!mod) return null;
  for (const n of names) if (typeof mod[n] === 'function') return mod[n];
  if (mod.default && typeof mod.default === 'object') {
    for (const n of names) if (typeof mod.default[n] === 'function') return mod.default[n];
  }
  if (typeof mod.default === 'function') return mod.default;
  return null;
}

/** Call the first method the object actually has. Preserves `this`. */
function invoke(obj, names, ...args) {
  if (!obj) return undefined;
  for (const n of names) if (typeof obj[n] === 'function') return obj[n](...args);
  return undefined;
}

function has(obj, names) {
  if (!obj) return false;
  for (const n of names) if (typeof obj[n] === 'function') return true;
  return false;
}

/**
 * A subsystem that has thrown is switched off rather than allowed to kill the
 * frame. One broken module costs you its own feature and nothing else — which
 * is the whole reason a cosy game can survive being written by eight people at
 * the same time.
 */
function guard(name, fn) {
  let dead = false;
  return function (...args) {
    if (dead) return undefined;
    try {
      return fn(...args);
    } catch (err) {
      dead = true;
      report.faults.push(`${name}: ${(err && err.message) || err}`);
      try {
        console.error(`[arcadia] ${name} disabled after an error:`, err);
      } catch (_) {}
      return undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// The boot report — every assumption, visible
// ---------------------------------------------------------------------------

const report = { loaded: [], missing: [], fallbacks: [], faults: [], notes: [] };

async function load(path) {
  try {
    const mod = await import(path);
    report.loaded.push(path);
    return mod;
  } catch (err) {
    report.missing.push({ path, error: String((err && err.message) || err) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// The opening glade
// ---------------------------------------------------------------------------
//
// RESEARCH C§5: no tutorial wall, and the first creature should arrive from an
// action you would take on turn one anyway. RESEARCH C§2: an empty canvas too
// early is an anti-pattern. So the player does not arrive to a grid. They
// arrive to a small wild hollow that already holds most of a satyr.
//
// Read against the satyr's actual rungs in creatures.js, this glade is tuned
// to land ON `visits` and one plant short of `settles`:
//
//   visits   wants 2 vine + 2 ivy within 4, wildness >= 2, order <= 1.
//            All four are planted here. So the satyr walks in DESATURATED on
//            the first dusk the player ever sees. That preview is the entire
//            hint system (SPEC §7) and it costs the player nothing.
//   settles  wants 3 vine + 2 ivy + 1 pine + 1 cave + 1 spring, wildness >= 4,
//            no enclosure, no straight edges, and the behavioural beat. The
//            pine, the cave and the spring are already here. What is missing
//            is ONE MORE VINE — and the vine is the thing the visiting satyr
//            is standing next to, tearing at.
//
// One plant. That is the whole tutorial, and it teaches the vocabulary the
// rest of the game is written in (Euripides' diagnostic, RESEARCH B§1: no
// vine, no satyrs).
//
// Nothing straight, nothing walled, nothing swept: `order` must stay under the
// satyr's ceiling, so there is no gravel, no fence and no tilled row anywhere
// in the opening.

const GLADE = {
  // Ground painted first, roughest to smoothest.
  meadow: { id: 'meadow-turf', spots: [[6, 6], [8, 5], [10, 7], [7, 9], [12, 10], [9, 12], [6, 11], [13, 13]] },
  scree: { id: 'stony-scree', spots: [[15, 4], [17, 6]] },
  moss: { id: 'mossy-ground', spots: [[13, 8], [12, 9], [14, 9]] },

  // A brook, running downhill and never in a straight line.
  brook: [[13, 7], [13, 8], [12, 9], [12, 10], [11, 11], [11, 12]],
  pool: [[10, 13]], // still-pool is a 2x2 brush

  // Three uneven clumps and two lone trees. Unequal sizes, nothing on a grid.
  trees: [
    ['umbrella-pine', 16, 8],
    ['umbrella-pine', 14, 4],
    ['oak', 6, 7],
    ['oak', 5, 9],
    ['olive-tree', 7, 6],
    ['olive-tree', 6, 11],
    ['plane-tree', 10, 11],
    ['black-poplar', 9, 14],
    ['willow', 12, 13],
    ['holly', 17, 11],
    ['standing-timber', 4, 12],
  ],

  scrub: [
    ['laurel-thicket', 8, 8],
    ['bramble-tangle', 15, 10],
    ['broom-scrub', 7, 13],
    ['fern-bank', 13, 11],
    ['bramble-tangle', 5, 6],
    ['broom-scrub', 18, 9],
  ],
  waterside: [
    ['reed-bed', 11, 13],
    ['reed-bed', 12, 12],
    ['iris-clump', 10, 12],
    ['watercress', 12, 11],
  ],

  // The Dionysiac corner. Everything here sits within the satyr's r4/r5 of
  // the cave mouth at (15,6), which is where the ladder will be read.
  cave: ['cave-mouth', 15, 6], // 2x1
  spring: ['spring-head', 13, 6],
  plunge: ['rock-plunge', 17, 7],
  vines: [
    ['wild-vine', 16, 7],
    ['wild-vine', 14, 8],
  ],
  ivy: [
    ['ivy-drape', 15, 8],
    ['ivy-drape', 17, 5],
  ],
};

function plantOpeningGlade(world, cat, rng, dayMs) {
  const known = (id) => !!(cat.byId && cat.byId(id));
  const planted = [];
  let placed = 0;
  const put = (id, tx, ty, wobble = 0) => {
    if (!id || !known(id)) {
      report.notes.push(`opening glade: no '${id}' in the catalogue`);
      return false;
    }
    let x = tx;
    let y = ty;
    if (wobble) {
      x = clamp(Math.round(tx + (rng() * 2 - 1) * wobble), 1, MAP_W - 2);
      y = clamp(Math.round(ty + (rng() * 2 - 1) * wobble), 1, MAP_H - 2);
    }
    // A jittered spot may collide; fall back to the authored one, then give up.
    const r = world.place(id, x, y) || (wobble ? world.place(id, tx, ty) : null);
    if (r) {
      placed++;
      if (r.uid !== undefined) planted.push(r);
    }
    return !!r;
  };

  world.batch(() => {
    // 1. Ground. Meadow first and widest — the glade should read as unmown.
    for (const [x, y] of GLADE.meadow.spots) put(GLADE.meadow.id, x, y, 1);
    for (const [x, y] of GLADE.scree.spots) put(GLADE.scree.id, x, y);
    for (const [x, y] of GLADE.moss.spots) put(GLADE.moss.id, x, y);

    // 2. Water. A spring-head at the top of the run — visible and unbasined,
    //    not a pipe and not a fountain (RESEARCH B§3 makes that distinction
    //    load-bearing for the naiad later, and it is a satyr requirement now).
    put(...GLADE.spring);
    for (const [x, y] of GLADE.brook) put('brook', x, y);
    for (const [x, y] of GLADE.pool) put('still-pool', x, y);
    put(...GLADE.plunge);

    // 3. Trees, in uneven clumps.
    for (const [id, x, y] of GLADE.trees) put(id, x, y, 1);

    // 4. Undergrowth, deliberately messy. Low order is half of what a satyr
    //    reads, and the player should not see a straight edge on turn one.
    for (const [id, x, y] of GLADE.scrub) put(id, x, y, 1);
    for (const [id, x, y] of GLADE.waterside) put(id, x, y);

    // 5. The Dionysiac corner: cave, vine, ivy. The reason the first creature
    //    is nearly free.
    put(...GLADE.cave);
    for (const [id, x, y] of GLADE.vines) put(id, x, y);
    for (const [id, x, y] of GLADE.ivy) put(id, x, y);
  });

  // THE GLADE IS OLD.
  //
  // Everything above was just planted, which means every tree is a sprout —
  // and a sprout is eight pixels. Left like that the player opens the game on
  // a field of twigs, and "arrive to something already pretty" is the single
  // most important thing about the first ten seconds of a cosy game.
  //
  // So the planting is backdated: this hollow has been standing for weeks
  // before the player got here. That is also the truthful reading of the
  // fiction (nobody made this glade) and of the lore — the satyr's landscape
  // is *uncut standing timber*, not a nursery bed (RESEARCH B§1).
  //
  // Two saplings are left deliberately young. They are the proof that growth
  // exists: come back tomorrow and the glade is not quite the same.
  if (dayMs > 0 && planted.length) {
    const saplings = new Set([
      planted[(rng() * planted.length) | 0],
      planted[(rng() * planted.length) | 0],
    ]);
    for (const obj of planted) {
      const days = saplings.has(obj) ? 1 + rng() * 2 : 16 + rng() * 30;
      obj.placedAt = -days * dayMs;
    }
    invoke(world, ['grow']); // apply the stages we just backdated into
  }

  // The undo stack must not begin with 64 steps of "un-plant the world you
  // were given". The glade is the starting state, not the player's first move.
  if (Array.isArray(world.undoStack)) world.undoStack.length = 0;

  report.notes.push(`opening glade: ${placed} placements`);
  return placed;
}

// ---------------------------------------------------------------------------
// THE PROVING GROUND — `?garden=all`
// ---------------------------------------------------------------------------
//
// A garden where all four of them are welcome at once, in four quadrants of the
// big map. It is a cheat code and it says so: it is reached by a URL flag, it is
// never the default, and it wipes its own undo stack like the opening glade.
//
// WHY IT IS DERIVED AND NOT AUTHORED. The obvious way to write this is to hand
// place sixty things from the lore. That garden would be right on the day it was
// written and quietly wrong for ever after — the ladder is tuned regularly, and
// a test map that no longer satisfies it is worse than no test map, because it
// LOOKS like it should work and the failure reads as a bug in the simulation.
//
// So it reads the requirements themselves. For each species it walks the rungs
// up to `settles`, and for every `at-least <n> <tag> within <r>` it plants n
// carriers of that tag inside r of that species' corner, choosing the carrier
// that argues hardest FOR that species (catalog.byAffinity). `at-most` rungs are
// honoured by omission — the centaur's `at-most 4 tree within 3` is her open run
// to gallop on, and reading it as a demand for four trees builds the one garden
// she will not live in.
//
// It cannot promise every creature settles: bands (`seclusion`, `maturity`) are
// field maths, `patch` needs the grass to spread first, and a beat has to be
// performed. What it promises is that every COUNTED demand is met and none of
// the counted refusals is present, which is the part a human cannot set up by
// hand without an afternoon.
const QUADRANTS = {
  satyr: { tx: 16, ty: 16 },
  centaur: { tx: 44, ty: 16 },
  naiad: { tx: 16, ty: 44 },
  unicorn: { tx: 44, ty: 44 },
};

/**
 * The counted demands of a species, up to and including `settles`.
 *
 * BOTH DIRECTIONS, and the caps are not a footnote. The first version of this
 * only tracked `at-most 0` as a list of forbidden tags and dropped every cap
 * with a number on it, which built the centaur six ash trees inside her
 * `at-most 4 tree within 3` and made her quadrant the one garden she refuses.
 * A cap of four is the same KIND of statement as a cap of zero — she wants an
 * open run — and the only difference is where the line is.
 */
function countedDemands(creature, rungs) {
  const upto = rungs.slice(0, rungs.indexOf('settles') + 1);
  const need = new Map(); // tag -> { n, radius }   at-least: the tightest wins
  const caps = new Map(); // tag -> { n, radius }   at-most:  the tightest wins
  for (const rung of upto) {
    for (const req of creature.rungs[rung] || []) {
      if (req.kind !== 'count') continue;
      const table = req.dir === 'at-most' ? caps : need;
      const cur = table.get(req.tag);
      if (req.dir === 'at-most') {
        table.set(req.tag, {
          n: Math.min(cur ? cur.n : Infinity, req.n),
          radius: Math.max(cur ? cur.radius : 0, req.radius),
        });
      } else {
        table.set(req.tag, {
          n: Math.max(cur ? cur.n : 0, req.n),
          radius: Math.min(cur ? cur.radius : Infinity, req.radius),
        });
      }
    }
  }
  return { need, caps };
}

/**
 * Tiles within `r` of a centre, nearest first. A spiral rather than a scan, so
 * a demand with radius 4 fills the middle of its own circle instead of hugging
 * the rim where the next species' circle is.
 */
function ringsAround(cx, cy, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 1 || y < 1 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
      out.push({ x, y, d: dx * dx + dy * dy });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

export function plantProvingGround(world, cat, creatures) {
  const RUNGS = (creatures && creatures.RUNGS) || [];
  const ALL = (creatures && creatures.CREATURES) || [];
  if (!RUNGS.length || !ALL.length) {
    report.notes.push('proving ground: creatures.js exported no ladder');
    return { placed: 0, missed: ['creatures.js exported no ladder'] };
  }
  let placed = 0;
  const missed = [];

  world.batch(() => {
    for (const creature of ALL) {
      const home = QUADRANTS[creature.id];
      if (!home) continue;
      const { need, caps } = countedDemands(creature, RUNGS);

      /**
       * Would putting `def` on this tile break one of this species' caps?
       *
       * Checked per SPOT rather than per carrier, because most conflicts are
       * about DISTANCE, not about the object. Six ash trees are not too many
       * for a centaur; six ash trees within three tiles of where she wants to
       * stand are. Pushing the sixth out to the fourth ring satisfies the
       * at-least and the at-most both, which is what the requirements were
       * always describing and what the first version could not express.
       */
      // Everything this quadrant has planted, counted here rather than read
      // back out of the world.
      //
      // `world.countTag` walks `world.objects`, and A GROUND PAINTER IS NOT AN
      // OBJECT — it writes the tile's ground type and leaves nothing behind to
      // count. (fields.js keeps a synthetic placement so the ladder can still
      // see it; the world cannot.) Counting our own placements is both exact
      // and blind to nothing, and it does not depend on the field bridge having
      // caught up inside a `batch`.
      const mine = [];
      const near = (x, y, r) => {
        const dx = x - home.tx;
        const dy = y - home.ty;
        // EUCLIDEAN, matching world/fields `objectsNear` (dx*dx + dy*dy <= r*r).
        // A Chebyshev test would call the corners of the square "inside" and
        // refuse spots the requirement never counted.
        return dx * dx + dy * dy <= r * r;
      };
      const breaksACap = (def, x, y) => {
        for (const tag of def.tags) {
          const cap = caps.get(tag);
          if (!cap) continue;
          if (!near(x, y, cap.radius)) continue; // outside the cap; it does not count
          let n = 0;
          for (const p of mine) {
            if (p.def.tags.includes(tag) && near(p.x, p.y, cap.radius)) n++;
          }
          if (n >= cap.n) return true;
        }
        return false;
      };

      // GROUND FIRST, in both senses. A placeable that paints ground (water,
      // moss, tilled) has to be down before anything that `requires` it can
      // stand on it — the naiad's whole quadrant depends on this ordering, and
      // getting it backwards fails silently as "the reeds would not place".
      const paints = (tag) => cat.byTag(tag).some((d) => d.ground);
      const wanted = [...need.entries()].sort(
        (a, b) => (paints(a[0]) ? 0 : 1) - (paints(b[0]) ? 0 : 1)
      );

      for (const [tag, want] of wanted) {
        // The carrier that argues hardest for THIS species. Ties are broken
        // toward the one carrying the FEWEST capped tags, so where a demand can
        // be met by either a plain thing or a thing that also counts against a
        // cap, the plain one goes in first and the caps stay unspent.
        const carriers = cat.byTag(tag).slice().sort((a, b) => {
          const aff = (b.affinities[creature.id] || 0) - (a.affinities[creature.id] || 0);
          if (aff) return aff;
          const cost = (d) => d.tags.filter((t) => caps.has(t)).length;
          return cost(a) - cost(b);
        });
        if (!carriers.length) {
          missed.push(`${creature.id}: nothing carries '${tag}'`);
          continue;
        }
        // Search the FULL radius, not radius-1. Shrinking it was a habit from
        // the opening glade (keep things off the rim) and here it is actively
        // wrong: the outer ring is exactly where a surplus goes to satisfy an
        // at-least without spending an at-most.
        const r = Number.isFinite(want.radius) ? Math.max(1, want.radius) : 4;
        const spots = ringsAround(home.tx, home.ty, r);
        let got = 0;
        for (const spot of spots) {
          if (got >= want.n) break;
          for (const def of carriers) {
            if (breaksACap(def, spot.x, spot.y)) continue;
            if (world.place(def.id, spot.x, spot.y)) {
              mine.push({ def, x: spot.x, y: spot.y });
              got++;
              placed++;
              break;
            }
          }
        }
        if (got < want.n) missed.push(`${creature.id}: only ${got}/${want.n} '${tag}'`);
      }
    }
  });

  if (Array.isArray(world.undoStack)) world.undoStack.length = 0;
  report.notes.push(
    `proving ground: ${placed} placements` + (missed.length ? ` — SHORT: ${missed.join('; ')}` : '')
  );
  // `missed` is the whole point of returning anything. test/proving-ground
  // asserts it is empty, so a ladder edit that this fixture can no longer
  // satisfy fails the suite instead of quietly building a broken test map.
  return { placed, missed };
}

// ---------------------------------------------------------------------------
// THE JOIN: world edits -> field deposits
// ---------------------------------------------------------------------------
//
// fields.add(p) wants a placement carrying its own deposits, tags and
// footprint, and remove(p) wants the SAME object back. The world stores lean
// objects ({uid,id,tx,ty,stage}) and the catalogue holds the weights, so
// somebody has to marry them and hold the identity. Nobody owns that seam, so
// the conductor does.

// Exported because tools/playtest.mjs builds reference gardens headlessly and
// must deposit into the fields THE SAME WAY the running game does. A second
// copy of this bridge in the tool would be a copy that can drift, and the
// playtest's whole job is to be believed.
/**
 * THE RECITAL LATCH — when the satyr should stand and play the score.
 *
 * A three-line state machine, pulled out of `boot()` so it can be tested,
 * because the bug it now prevents shipped and reached the owner.
 *
 * TWO bugs, in sequence, both about the difference between INTENT and SOUND.
 *
 * The first: the recital was armed only on a FRESH music unlock. But
 * `extra.musicUnlocked` persists in the save, so a returning player's track
 * resumed at load, `unlockSong` returned at its first line, and no later
 * arrival could arm anything — the recital was not skipped once, it was
 * permanently unreachable.
 *
 * The second was the FIX for the first, and it was worse in a quieter way. It
 * armed on every moment that *meant* music: a fresh unlock, a restore unlock,
 * an arrival. But on a returning save `unlockSong(true)` runs during boot,
 * before any gesture — so there is no AudioContext, the 5 MB has not been
 * fetched, and `beginMusic` bails at its first line. The satyr, hydrated
 * `idle`, took the recital on the FIRST simulation step and piped for three
 * full minutes to a silent glade. Then `played` latched, and when the player
 * finally clicked and the track decoded, the music started with no musician.
 * Verified in the browser: `ctx: "none"`, `load: "idle"`, `playing: false`,
 * satyr nine seconds into the recital.
 *
 * The fix for that was to arm on `audio.playing` — when a note was actually
 * sounding. It worked, and it was still backwards, which the owner heard at
 * once: **the music played before the musician did.** Unavoidably so. The score
 * started when he ARRIVED, and arriving means walking in from the map rim,
 * which takes as long as it takes; he could not raise the pipes until both feet
 * were on the grass, several bars in. Music, then a musician catching up to it.
 *
 * THE RULE, now, and it is one rule: **the score starts when he does.**
 *
 * Nothing unlocks the music on arrival any more. Arrival arms the recital; the
 * tick waits until the track is decoded and the context is running — everything
 * the score needs except a reason — and then asks him, every step, until he is
 * standing. The step he raises the pipes is the step the first note sounds, and
 * audio.js fades it in over about four seconds, so it swells under the gesture
 * rather than announcing it.
 *
 *   arm()             the garden wants its recital. Idempotent; does nothing
 *                     once he has played.
 *   hold(dt, can)     one step of waiting. `can` is "the audio could sound this
 *                     instant". Returns true when patience has run out.
 *   took()            he raised the pipes. Let the score go.
 *   release()         let the score go WITHOUT him; true only the first time.
 *
 * PATIENCE, because a held score is a held score. If he is thirty seconds into
 * something else — a revel, a long walk to the krater — the music stops waiting
 * and starts anyway. The latch stays armed, so he joins it when he is free.
 * That is the old bug's shape (music without musician) but bounded, deliberate,
 * and rare, rather than the default path.
 *
 * A muted player still mimes to nothing: `can` is false while muted, so nothing
 * is held and nothing is played.
 *
 * @param {number} patience seconds the score will wait for him.
 */
export function createRecital(patience = 30) {
  let pending = false;
  let played = false;
  let released = false;
  let held = 0;
  return {
    arm() {
      if (!played) pending = true;
      return pending;
    },
    hold(dt, can) {
      if (released || !can) return false;
      held += dt;
      return held >= patience;
    },
    release() {
      const first = !released;
      released = true;
      return first;
    },
    took() {
      pending = false;
      played = true;
      return this.release();
    },
    get pending() {
      return pending;
    },
    get played() {
      return played;
    },
    get released() {
      return released;
    },
    get held() {
      return held;
    },
  };
}

export function createFieldBridge(world, fields, cat) {
  const byUid = new Map(); // world object uid -> the placement fields holds
  const byTile = new Map(); // tile index -> the synthetic ground placement

  const idx = (tx, ty) => ty * MAP_W + tx;

  // ZONING.md turned fields.js from five abstract axes into four SPECIES
  // AFFINITIES, and DECOR.md gave every placeable an `affinities` map and a
  // `blocks` flag to drive them. Both were dropped here, and the failure was
  // completely silent: fields.js has a tag->affinity BRIDGE for placements that
  // arrive without affinities, so every object still deposited *something* —
  // just something inferred from its tags instead of the number its author
  // wrote. Measured on a 14-object reference garden, the unicorn's close did
  // not form at all (millefleurs 54 tiles -> 84, meadow 171 -> 126 once these
  // two lines were added). `blocks` is worse than wrong when missing: a hedge
  // that does not occlude is a hedge that does nothing, and the whole
  // nullifier mechanic — and with it the satyr/unicorn thesis — quietly fails.
  const placementFor = (obj, def) => ({
    uid: obj.uid,
    tx: obj.tx,
    ty: obj.ty,
    footprint: def.footprint,
    deposits: def.deposits,
    affinities: def.affinities,
    blocks: def.blocks,
    tags: def.tags,
    stage: obj.stage,
  });

  const addObject = (obj, def) => {
    if (!def || byUid.has(obj.uid)) return;
    const p = placementFor(obj, def);
    byUid.set(obj.uid, p);
    fields.add(p);
  };

  const removeObject = (obj) => {
    const p = byUid.get(obj.uid);
    if (!p) return;
    fields.remove(p);
    byUid.delete(obj.uid);
  };

  /**
   * Ground is painted per tile but authored per brush, so a 2x2 turf that
   * deposits wildness 2 must deposit 2 across its four tiles and not 2 on each
   * — otherwise painting a meadow floods the whole map with wildness and every
   * creature's band becomes meaningless. Divide by the brush area.
   */
  const shareOf = (d) => {
    const [fw, fh] = d.footprint || [1, 1];
    const area = Math.max(1, fw * fh);
    const share = {};
    for (const [k, v] of Object.entries(d.deposits || {})) share[k] = v / area;
    // Affinities are divided by the brush for exactly the same reason the
    // deposits are: a 2x2 turf that argues for the centaur with weight 1.0
    // must argue with 1.0 across its four tiles, not 1.0 on each. The gravel
    // walk's `blocks` rides along undivided — occlusion is a property of a
    // tile, not a quantity to share out.
    const affShare = {};
    for (const [k, v] of Object.entries(d.affinities || {})) affShare[k] = v / area;
    return {
      deposits: share,
      // AN EMPTY AFFINITY MAP IS AN ANSWER, AND IT MUST SURVIVE.
      //
      // fields.js distinguishes `{}` ("the author says this argues for nobody")
      // from `null`/absent ("the author has not said"), and only the second
      // falls through to the tag->affinity BRIDGE that infers a species from
      // tags. Collapsing one into the other looks like tidying and is not:
      // `meadow-turf` declares `affinities: {}` and carries the tag `wild`, so
      // erasing its empty map let the bridge read every painted tile of plain
      // lawn as a satyr source at full weight. On a garden with the meadow
      // brushed over it, that is four hundred sources of 1.0 — the satyr took
      // 391 of 400 tiles, every other species was buried, and nothing anywhere
      // reported an error. Forward what the catalogue said, exactly.
      affinities: d.affinities ? affShare : null,
      blocks: d.blocks,
      tags: d.tags || [],
    };
  };

  // Two lookups, and the difference matters more than it looks.
  //
  // BY PAINTER is the right answer: DECOR.md gives the seven placeables that
  // paint `water` quite different affinities — `still-pool` is a unicorn single
  // at 1.0, `watering-place` is the 2,3,4 triple, `brook` is neutral — and a
  // tile remembers which of them made it (world.groundBy).
  //
  // BY TYPE is the fallback, for bare ground and for gardens saved before the
  // painter was recorded. It has to pick one def per type and is therefore
  // wrong for five of DECOR.md's thirty-three affinity items; it is kept only
  // because "your old pond argues for the naiad" is a far better outcome than
  // "your old pond argues for nobody".
  const byPainter = new Map();
  const groundDefs = new Map();
  for (const d of cat.CATALOG || []) {
    if (!d.ground) continue;
    byPainter.set(d.id, shareOf(d));
    if (!groundDefs.has(d.ground)) groundDefs.set(d.ground, shareOf(d));
  }

  const setGround = (tx, ty) => {
    const i = idx(tx, ty);
    const old = byTile.get(i);
    if (old) {
      fields.remove(old);
      byTile.delete(i);
    }
    const type = world.groundAt(tx, ty);
    // The default floor is the baseline, not a deposit. If bare grass counted,
    // every tile on the map would carry weight and nothing would read as local.
    if (!type || type === DEFAULT_GROUND) return;
    const painter =
      typeof world.groundPainterAt === 'function' ? world.groundPainterAt(tx, ty) : null;
    const g = (painter && byPainter.get(painter)) || groundDefs.get(type);
    if (!g) return;
    const p = {
      tx, ty, footprint: [1, 1],
      deposits: g.deposits, affinities: g.affinities, blocks: g.blocks,
      tags: g.tags, ground: type,
    };
    byTile.set(i, p);
    fields.add(p);
  };

  /**
   * Push the world's heightmap into the fields.
   *
   * ELEVATION.md: "a height difference of 2 or more levels blocks influence
   * propagation, using exactly the occluder logic the hedges already use". That
   * is not a metaphor in fields.js — height is tested on the same edge as the
   * gate mask, one clause in `_crossable`. But fields.js keeps its OWN copy of
   * the levels to test against, so a terraced world whose heights were never
   * handed over propagates as if the garden were flat, and the single most
   * interesting thing in ELEVATION.md — terracing zones a garden without a
   * hedge — does not happen. Nothing throws; the map just stays one zone.
   */
  const syncLevels = () => {
    if (!world.levels || typeof fields.setLevels !== 'function') return;
    fields.setLevels(world.levels);
  };

  /** Deposit everything currently on the map. Used once, after a load. */
  const rebuild = () => {
    for (const p of [...byUid.values(), ...byTile.values()]) fields.remove(p);
    byUid.clear();
    byTile.clear();
    // Levels first: they are an EDGE property of the propagation graph, so a
    // source flooded before the terrain is known would have to be flooded
    // again. setLevels() is quiet here and the deposits below do the rebuild.
    if (world.levels && typeof fields.setLevels === 'function') {
      fields.setLevels(world.levels, { quiet: true });
    }
    for (const obj of world.objects) addObject(obj, cat.byId(obj.id));
    for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) setGround(tx, ty);
  };

  const onEvent = guard('fields bridge', (ev) => {
    switch (ev.type) {
      case 'place':
        addObject(ev.object, ev.def || cat.byId(ev.object.id));
        break;
      case 'remove':
        removeObject(ev.object);
        break;
      case 'ground':
        for (const t of ev.tiles) setGround(t.tx, t.ty);
        break;
      case 'level':
        // A terrain edit changes the GRAPH, not a source, so every source
        // within reach of the edit has to re-flood. fields.setLevels does that
        // itself, and does it for the whole map — which on 20x20 is a handful
        // of milliseconds and is paid only when the player actually terraces.
        syncLevels();
        break;
      case 'grass':
        // Derived state, written BY us from fields.js. Never read back into
        // the fields, or the two would chase each other every frame.
        break;
      case 'grow':
        // A plant that has matured deposits differently and starts ageing the
        // ground around it — SPEC §6, the cosiness feature.
        for (const c of ev.changes) {
          const p = byUid.get(c.uid);
          if (!p) continue;
          if (has(fields, ['setStage'])) fields.setStage(p, c.to);
          else p.stage = c.to;
        }
        break;
      case 'undo':
        // The world re-emits place/remove/ground for everything an undo
        // touched, so there is nothing extra to do here.
        break;
    }
  });

  return { rebuild, onEvent, syncLevels };
}

// ---------------------------------------------------------------------------
// THE JOIN: art
// ---------------------------------------------------------------------------
//
// The catalogue says `{kind:'grow', composer, params}` or `{kind:'sprite',
// sprite:'herm'}`. grow.js composes the first; the second needs a registry of
// hand-authored props that may not be written yet. A missing sprite must draw
// nothing rather than throw — a half-finished art set is a normal Tuesday, and
// the player's garden still has to open.

// catalog.js and art/grow.js were authored against different composer
// vocabularies: the catalogue names the SPECIES ('umbrella', 'columnar',
// 'gnarled'), grow.js names the FAMILY ('conifer', 'broadleaf', 'olive') and
// takes the species as a parameter. Twenty-one placeables sit on that gap and
// would silently draw nothing.
//
// The translation lives here, at the seam, because that is where a mismatch
// between two owners belongs — neither of their files has to change, and this
// table is a no-op the moment they agree. Every mapping is by silhouette,
// which is what species differentiation actually is at this size (RESEARCH
// A§6): a poplar and a cypress are both `columnar` because at 64px the shape
// is the whole story.
// Exported so tools/playtest.mjs can resolve art the way the GAME resolves it.
// A second copy of this table in the tool is a copy that drifts, and the one
// thing an art-coverage check must not do is disagree with the renderer about
// what draws.
export const COMPOSER_ALIAS = {
  umbrella: ['conifer', { species: 'umbrella' }],
  columnar: ['conifer', { species: 'cypress' }], // narrow vertical flame
  gnarled: ['olive', {}], // wide, low, forked, gappy
  weeper: ['willow', {}],
  climber: ['vine', {}],
  tuft: ['shrub', { kind: 'fern' }],
  carpet: ['ivy', { drape: 'ground' }],
  flowers: ['flowerPatch', {}],
  waterplants: ['flowerPatch', { bloom: 'lace' }],
};

// The catalogue passes `bloom` as an ACCENT PALETTE KEY ('7' = ivory, '5' =
// yellow); flowerPatch wants a named blend. Same gap, same fix.
const BLOOM_ALIAS = { 1: 'red', 2: 'red', 3: 'red', 4: 'iris', 5: 'yellow', 7: 'white' };

/** A poplar is a columnar broadleaf, not a conifer — corrected by ramp. */
function aliasComposer(name, params) {
  const hit = COMPOSER_ALIAS[name];
  if (!hit) return null;
  let [composer, extra] = hit;
  const p = { ...extra, ...params };
  if (name === 'columnar' && params && params.ramp === 'canopy') {
    composer = 'broadleaf';
    p.species = 'poplar';
  }
  if (p.bloom != null && BLOOM_ALIAS[p.bloom]) p.bloom = BLOOM_ALIAS[p.bloom];
  return [composer, p];
}

export function createArtist(mods) {
  const compose = bind(mods.grow, ['compose']);
  const COMPOSERS = (mods.grow && mods.grow.COMPOSERS) || {};
  const registry = new Map();
  // ORDER IS PRECEDENCE — a later module overwrites an earlier one's sprite of
  // the same name. `art/decor.js` goes last on purpose. It now collides with
  // art/props.js on exactly two names — `broken-column` and `gravel-walk` —
  // and in both the decor version is the one to draw: it is authored in the
  // same family vocabulary (one flute pitch, one plinth, one step profile) as
  // the columns and benches beside it.
  //
  // `hedge-arch` WAS a third collision and is not one any more: props.js kept a
  // whole second hedge family that nothing could reach, two of them registered
  // under placeable ids the artist never looks up, and it has been retired —
  // see the tombstone in js/art/props.js. Precedence is a fine way to choose
  // between two drawings and a terrible way to keep one alive, because the
  // loser goes on compiling, rendering in probes, and taking edits meant for
  // the winner. `tools/registry-audit.mjs` reports both cases.
  for (const m of [mods.tiles, mods.extras, mods.props, mods.decor]) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && v.rows && v.anchor) registry.set(v.name || k, v);
    }
    // A module may also export a plain name -> sprite object.
    for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY']) {
      const table = m[key];
      if (!table || typeof table !== 'object') continue;
      for (const [k, v] of Object.entries(table)) {
        if (v && v.rows && v.anchor) registry.set(k, v);
      }
    }
  }
  const cache = new Map();
  const missing = new Set();
  const aliased = new Set();

  // ART DISPATCH — `wanted` beats the understudy the moment it exists.
  //
  // catalog.js §ART: every entry names art that resolves TODAY and records the
  // piece it is actually waiting for in `art.wanted`. This is the one line that
  // makes that a promise rather than a comment: an artist exports their work
  // under the exact name the catalogue asked for and it starts drawing, with no
  // catalogue edit and no chance of the two halves being landed out of order.
  // Until then the understudy draws, which is why nothing is ever unrendered.
  const wantedFor = (art) => {
    if (!art || !art.wanted) return null;
    if (art.kind === 'sprite') return registry.has(art.wanted) ? { sprite: registry.get(art.wanted) } : null;
    if (art.kind === 'grow') return COMPOSERS[art.wanted] ? { composer: art.wanted } : null;
    return null;
  };

  const artFor = guard('art', (def, seed, stage) => {
    if (!def || !def.art) return null;
    const art = def.art;
    const want = wantedFor(art);
    if (art.kind === 'sprite') {
      const s = (want && want.sprite) || registry.get(art.sprite);
      if (!s && !missing.has(art.sprite)) {
        missing.add(art.sprite);
        report.notes.push(`no sprite '${art.sprite}' yet — '${def.id}' draws nothing`);
      }
      return s || null;
    }
    if (art.kind === 'grow' && compose) {
      const key = `${def.id}:${seed}:${stage || 'x'}`;
      let hit = cache.get(key);
      if (hit === undefined) {
        let name = (want && want.composer) || art.composer;
        let params = art.params;
        if (!COMPOSERS[name]) {
          const alias = aliasComposer(name, params);
          if (alias) {
            [name, params] = alias;
            if (!aliased.has(art.composer)) {
              aliased.add(art.composer);
              report.notes.push(`composer '${art.composer}' -> grow.js '${name}' (seam alias)`);
            }
          }
        }
        try {
          hit = compose(name, seed, stage ? { ...params, stage } : params);
        } catch (err) {
          hit = null;
          if (!missing.has(art.composer)) {
            missing.add(art.composer);
            report.notes.push(`composer '${art.composer}' failed: ${(err && err.message) || err}`);
          }
        }
        cache.set(key, hit);
      }
      return hit;
    }
    return null;
  });

  return { artFor, missingSprites: () => [...missing] };
}

// ---------------------------------------------------------------------------
// THE JOIN: where a creature may put its feet
// ---------------------------------------------------------------------------
//
// docs/CREATURE-MOVEMENT.md §2. Water used to be passable for everyone, on
// purpose, because the naiad's whole home is a pool. Right for her, wrong for a
// unicorn — so the predicate stops being one shared rule and becomes a function
// of the SPECIES, which creatures.js asks for by passing the creature id as a
// third argument.
//
// Three questions, in order, and each one is a different owner's business:
//
//   1. Is it on the map?          world.js
//   2. Is something standing on   catalog.js — and the answer is "you may walk
//      the tile?                  on a connector or a crossing, nothing else"
//   3. Is it wet?                 creatures.js — WATER_RULE, per species
//
// THE CROSSINGS ARE THE PAYOFF. A bridge, stepping stones and a rocky ford stop
// being scenery and become the way a satyr or a centaur gets across the water,
// which the player discovers by building a path rather than by being told.

/**
 * The three crossings, by id (DECOR.md and the catalogue).
 *
 * Named here rather than inferred from tags because the tag that comes closest
 * — `traffic` — is also on the gravel walk, a wall fountain, a hedge arch and
 * both votive shelves, and a satyr fording a votive shelf is worse than no
 * fording at all. A catalogue entry may opt in explicitly with `crossing: true`
 * and this list stops mattering the moment it does.
 */
export const CROSSING_IDS = new Set(['level-bridge', 'stepping-stones', 'rocky-ford']);

const isCrossingDef = (d) => !!d && (d.crossing === true || CROSSING_IDS.has(d.id));

/**
 * Build the species-aware passability predicate the Bestiary walks by.
 *
 * Exported so the test suite can put the actual predicate the game runs on a
 * bench against the table in CREATURE-MOVEMENT.md §2, rather than testing a
 * second copy of the rule written to agree with it.
 *
 * @param {object} world
 * @param {object} cat catalog module
 * @param {object} mCreatures creatures module — the water table lives there
 * @returns {(tx:number, ty:number, species?:string) => boolean}
 */
export function makePassable(world, cat, mCreatures) {
  const waterRuleFor =
    (mCreatures && mCreatures.waterRuleFor) ||
    ((id) => ((mCreatures && mCreatures.WATER_RULE) || {})[id] || 'ford');

  /**
   * Is this tile a place you can cross water dry-shod?
   *
   * Two shapes, because the catalogue has both: stepping stones and the bridge
   * are OBJECTS standing on a tile, and the rocky ford is a GROUND PAINTER that
   * lays water down and records itself as the painter. Asking both is what
   * makes all three work rather than the accidental two.
   */
  const isCrossing = (tx, ty) => {
    const o = typeof world.objectAt === 'function' ? world.objectAt(tx, ty) : null;
    if (o && isCrossingDef(cat.byId(o.id))) return true;
    const painter =
      typeof world.groundPainterAt === 'function' ? world.groundPainterAt(tx, ty) : null;
    return !!(painter && isCrossingDef(cat.byId(painter)));
  };

  return (tx, ty, species) => {
    if (!world.inBounds(tx, ty)) return false;

    // A CONNECTOR IS THE ONE OBJECT YOU MAY WALK ON — and now a crossing is the
    // other. Cliffs are handled inside creatures.js (`Zoning.stepOk` refuses a
    // step of two levels and allows a step of one only across a connector), but
    // that rule can never fire while this predicate refuses the ramp tile
    // itself for the ordinary reason that something is standing on it. The two
    // halves have to agree or the ways up are decorative: every ramp in the
    // garden would be a wall with a staircase painted on it.
    const o = typeof world.objectAt === 'function' ? world.objectAt(tx, ty) : null;
    if (o) {
      const d = cat.byId(o.id);
      if (!(d && (d.connector || isCrossingDef(d)))) return false;
    }

    if (typeof world.isWet !== 'function' || !world.isWet(tx, ty)) return true;

    // Wet. Whose feet are these?
    //
    // With no species named the answer is the OLD one — water passable — so a
    // host or a test that calls this as a plain two-argument predicate gets
    // exactly the behaviour it had before the table existed.
    if (!species) return true;
    switch (waterRuleFor(species)) {
      case 'dweller':
        return true; // she is the water
      case 'never':
        return false; // the brink, and no further
      default:
        return isCrossing(tx, ty); // 'ford' — the bridge, the stones, the ford
    }
  };
}

// ---------------------------------------------------------------------------
// THE JOIN: the render scene
// ---------------------------------------------------------------------------
//
// render.js draws a scene and does not know what a world is. Terrain is a
// function of tile, objects and creatures are flat draw lists, and the water
// tiles must be flagged so the renderer's own palette cycling can find them.

// GROUND_TYPES (catalog.js) -> TERRAIN families (art/tiles.js). The two
// vocabularies do not line up one-to-one and neither owner should have to
// know about the other, so the mapping lives at the seam. Where there is no
// exact family the nearest one in feel wins, named here so it can be argued
// with rather than discovered.
const GROUND_TO_TERRAIN = {
  grass: 'grass',
  greensward: 'grass', // mown turf: the same family, no distinct art set yet
  meadow: 'meadow',
  millefleurs: 'meadow', // dense low mixed planting — meadow is the closest set
  moss: 'moss',
  tilled: 'earth',
  gravel: 'gravel',
  rock: 'gravel', // scree: no bare-stone family yet, gravel reads closest
  water: 'water',
  marsh: 'water', // half-land; still cycles, which is what matters most
};
const WET = new Set(['water', 'marsh']);

/**
 * Which ground types a SPECIES GRASS is allowed to paint over.
 *
 * ZONING.md makes the winning affinity "the ground itself", and render.js
 * honours that literally: a tile carrying a grass type draws grass instead of
 * its terrain sprite. That is right for lawn and wrong for everything else —
 * without this set a gravel walk resolves to `meadow` (fields.js forces
 * occluders to meadow, and meadow is a grass, not an absence) and the player's
 * path disappears under turf the moment it is laid.
 *
 * So the rule is: grass zones GRASS. A surface the player deliberately laid —
 * gravel, flagstone, tilled rows, scree, moss — outranks the zoning and keeps
 * its own art, and water outranks everything. That also hands the player a
 * legible way to opt a patch out of the argument entirely: pave it.
 */
const TURF = new Set(['grass', 'greensward', 'meadow', 'millefleurs']);

export function createSceneBuilder({ world, fields, bestiary, cat, artist, mods }) {
  // fields.js normalises a SIGNED axis to 0.5 when nothing is there and an
  // unsigned one to 0. AXIS_META is where it says which is which.
  const AXIS_META = (mods.fields && mods.fields.AXIS_META) || {};
  const neutralOf = (axis) => (AXIS_META[axis] && AXIS_META[axis].signed ? 0.5 : 0);
  const tiles = mods.tiles || {};
  const TERRAIN = tiles.TERRAIN || {};
  const variantFor = bind(tiles, ['variantFor']);
  const creatureFrameAt = bind(mods.artCreatures, ['creatureFrameAt']);
  const hasPose = bind(mods.artCreatures, ['hasPose']);
  const poseIsOnce = bind(mods.artCreatures, ['poseIsOnce']);
  const CREATURE_SHADOWS = (mods.artCreatures && mods.artCreatures.CREATURE_SHADOWS) || {};
  const FACINGS = (mods.artCreatures && mods.artCreatures.FACINGS) || ['se', 'sw', 'ne', 'nw'];

  let terrainVersion = 0;
  let objectsStale = true;
  let objects = [];
  let grassCause = null;

  /**
   * Tile art for a ground painter that brought its own, or null.
   *
   * Memoised per painter id, because the terrain builder walks every tile on a
   * rebuild and this must not cost a catalogue lookup each time. `false` is the
   * cached "asked, hasn't got one" so a painter is only ever resolved once.
   */
  const paintedTile = new Map();
  const paintedArt =
    typeof world.groundPainterAt === 'function'
      ? (tx, ty) => {
          const id = world.groundPainterAt(tx, ty);
          if (!id) return null;
          let hit = paintedTile.get(id);
          if (hit === undefined) {
            const def = cat.byId(id);
            // Only a NAMED want, never the understudy: `art.sprite` on a
            // painter is the thing it borrows to appear in the palette, and
            // stamping that over the ground would flatten the variation.
            hit =
              def && def.art && def.art.kind === 'sprite' && def.art.wanted
                ? artist.artFor(def) || false
                : false;
            paintedTile.set(id, hit);
          }
          return hit || null;
        }
      : null;

  /**
   * One terrain cell, with everything ELEVATION.md and ZONING.md added.
   *
   * `level` and `grass` are handed over per tile rather than as whole arrays
   * because the world already stores them per tile and render.js reads either
   * shape; doing it here keeps the three facts about a tile — what is on it,
   * how high it is, whose it is — in one place where they can be seen to agree.
   *
   * `faceArt` is the hook ELEVATION.md's "a cave mouth is a sprite set into a
   * cliff face" needs: the renderer stamps it onto the exposed face rather than
   * onto the ground, which is what stops a cave mouth sitting on flat grass.
   */
  const terrainCell = (tx, ty) => {
    const type = world.groundAt(tx, ty) || DEFAULT_GROUND;
    const family = TERRAIN[GROUND_TO_TERRAIN[type] || 'grass'];
    let art = family && family.length ? (variantFor ? variantFor(family, tx, ty) : family[0]) : null;
    // THE PAINTER'S OWN TILE, when it has one.
    //
    // A ground painter never becomes an object — world.place() short-circuits
    // to paint() and returns nothing — so `artFor` is never asked about it and
    // its `art.wanted` would draw nowhere. Without this the ground type is the
    // whole story, and `flagstone`, `terrace-paving` and `gravel-walk` are all
    // `gravel`: three painters, one undressed tile, and two pieces of hand-cut
    // paving that the catalogue says have landed sitting unread in the
    // registry. The world already records WHICH painter laid each tile
    // (`groundBy`), so the fact was here all along and only the consumer was
    // reading the wrong source.
    //
    // Deliberately narrow: only a painter that NAMES a wanted tile and whose
    // tile actually resolves takes this path. Painters with no wanted art keep
    // the terrain family, so the per-tile variation that makes turf and gravel
    // read as ground rather than wallpaper is untouched.
    if (paintedArt) {
      const bespoke = paintedArt(tx, ty);
      if (bespoke) art = bespoke;
    }
    const level = typeof world.levelAt === 'function' ? world.levelAt(tx, ty) || 0 : 0;
    const wet = WET.has(type);

    // Grass only claims turf, and never claims water (see TURF above).
    let grass = null;
    let grass2 = null;
    if (!wet && TURF.has(type) && typeof world.grassInfo === 'function') {
      const g = world.grassInfo(tx, ty);
      if (g) {
        grass = g.type || null;
        grass2 = g.contested ? g.second || null : null;
      }
    }
    return { art, water: wet, level, grass, grass2 };
  };

  /**
   * JOINING — a linear piece picks its drawing from its NEIGHBOURS.
   *
   * The owner: *"things like hedges and fences can go around corners."* A
   * corner cannot be a facing: an L comes in four kinds and the mirror maps two
   * of them to themselves, so corners need three drawings plus the straight and
   * `FACINGS` is 4. js/iso.js §JOINING has the whole argument.
   *
   * THIS IS THE RIGHT PLACE FOR IT AND IT COSTS NOTHING, which is worth saying
   * because neighbour-dependent art usually means a cache-invalidation problem.
   * It does not here:
   *
   *   `buildObjects` is rebuilt only when the world changes — so placing a
   *   hedge re-asks every hedge, and panning and dusk re-ask nobody;
   *   js/render.js keys its raster cache on the ART OBJECT, so choosing a
   *   different member of `art.joins` simply hits a different entry rather
   *   than dirtying one.
   *
   * Two pieces connect when their `joins` group matches, which is the
   * catalogue id unless an entry says otherwise. A low hedge cornering into a
   * tall one is a design question, and same-id is the answer that cannot
   * surprise anybody.
   */
  const joinGroupOf = (def) => (def && (def.joins || def.id)) || null;
  const joinsAt = new Map(); // "tx,ty" -> group, rebuilt with the object list
  const maskFor = (o, def) => {
    const art0 = artist.artFor(def, o.seed, o.stage);
    if (!art0 || !art0.joins) return 0;
    const group = joinGroupOf(def);
    let mask = 0;
    for (const [dtx, dty, bit] of JOIN_DIRS) {
      if (joinsAt.get(`${o.tx + dtx},${o.ty + dty}`) === group) mask |= bit;
    }
    return mask;
  };

  /** Rebuilt only when the world changes — panning and dusk cost nothing. */
  const buildObjects = () => {
    const out = [];
    // Pass one: who is where, so pass two can ask about neighbours. Only
    // pieces that actually join are indexed, so a garden with no fences in it
    // pays for one empty Map.
    joinsAt.clear();
    for (const o of world.objects) {
      const def = cat.byId(o.id);
      if (!def) continue;
      const a = artist.artFor(def, o.seed, o.stage);
      if (a && a.joins) joinsAt.set(`${o.tx},${o.ty}`, joinGroupOf(def));
    }
    for (const o of world.objects) {
      const def = cat.byId(o.id);
      if (!def) continue;
      let art = artist.artFor(def, o.seed, o.stage);
      if (!art) continue;
      // A connected piece obeys the run; an isolated one keeps the wheel, so
      // the first hedge a player puts down still has a direction they chose
      // and the second one decides what the first meant.
      //
      // AND THE WHEEL MUST THEN LET GO. The sixteen states are absolute — mask
      // 6 IS the piece that reaches -tx and +ty — so mirroring one because the
      // player had turned it before it had neighbours would point a corner at
      // the wrong two tiles. The stored facing is untouched: pull the piece
      // out of the run and it turns again exactly as it did.
      let facing = o.facing || 0;
      if (art.joins) {
        const mask = maskFor(o, def);
        if (mask) {
          art = art.joins[mask] || art;
          facing = 0;
        }
      }
      out.push({
        tx: o.tx,
        ty: o.ty,
        // An object's height is READ FROM ITS TILE and never stored, which is
        // world.js's rule and the reason an object can never be separated from
        // its ground: raise the terrace and everything standing on it rides up
        // for free, with no second list to keep in step. Omitting `level`
        // entirely would work too — render.js looks the tile up itself — but
        // stating it keeps the depth key honest for multi-tile pieces, whose
        // level world.js defines as the level of their whole coherent footprint.
        level: typeof world.levelOf === 'function' ? world.levelOf(o) : 0,
        art,
        footprint: def.footprint,
        shadow: def.shadow,
        // Which way round. 0 (as drawn) for everything in every garden made
        // before the wheel could turn things, and for everything that does not
        // turn — render.js only builds a mirrored raster when it is odd. Zero
        // too for a piece that joined a run: see above.
        facing,
        uid: o.uid,
      });
    }
    return out;
  };

  /**
   * Movers carry fractional tile positions straight into the depth key, so a
   * satyr crossing a tile boundary never pops in front of the tree it is
   * walking behind (SPEC §2).
   */
  const buildCreatures = (ms) => {
    const agents = (bestiary && bestiary.agents) || [];
    const out = [];
    for (const a of agents) {
      const v = typeof a.view === 'function' ? a.view() : a;
      if (v.present === false) continue;
      // THE TRANSIT FADE (CREATURE-MOVEMENT.md §1). A creature crossing the map
      // boundary on its way in or out dissolves rather than walking visibly
      // over open sky. Fully faded is not drawn at all — which is also what
      // keeps a creature that is still technically `leaving`, out past the rim,
      // from costing a sort slot and a raster lookup every frame.
      const fade = v.fade == null ? 1 : v.fade;
      if (fade <= 0) continue;
      // Poses beyond the universal three are per-creature: the satyr has `pipe`
      // and `drink`, nobody else has either. Ask the art whether it can draw
      // what the behaviour asked for and fall back to the generic beat frames
      // if it cannot, so a pose added to creatures.js before its sprites exist
      // degrades to the old animation instead of to nothing.
      const pose =
        hasPose && hasPose(v.creature, v.pose)
          ? v.pose
          : v.pose === 'walk'
            ? 'walk'
            : v.pose === 'idle'
              ? 'idle'
              : 'beat';
      const facing = FACINGS[(v.facing >> 1) % FACINGS.length] || 'se';
      // A one-shot gesture is played from the creature's own pose clock, not
      // from the shared wall clock — otherwise the drink starts at whatever
      // frame the clock happens to be on and the cup is already at his lips.
      const once = !!(poseIsOnce && poseIsOnce(v.creature, pose));
      const at = once ? (v.poseT || 0) * 1000 : ms + (v.phase || 0) * 1000;
      let art = null;
      if (creatureFrameAt) {
        try {
          art = creatureFrameAt(v.creature, pose, facing, at, once);
        } catch (_) {
          art = null; // an unfinished creature draws nothing rather than throwing
        }
      }
      if (!art) continue;
      out.push({
        tx: v.x,
        ty: v.y,
        // A mover keeps FRACTIONAL tx/ty so it never pops across a tile
        // boundary, but its level is the whole level of the tile it is over —
        // there are no half heights (ELEVATION.md: no diagonal or half-level
        // terrain), so a creature walking a ramp steps up a level at the top.
        //
        // creatures.js already resolved that, INCLUDING for a creature in
        // transit past the rim of the map, where there is no tile and the
        // honest answer is the height of the rim tile it is walking on to. Take
        // its answer when it has one rather than re-deriving a worse one here:
        // floor(-0.2) is tile -1, which is level 0, which on a terraced edge
        // drops the creature a whole cliff for the last half tile of its walk.
        level:
          v.level != null
            ? v.level
            : typeof world.levelAt === 'function'
              ? world.levelAt(Math.floor(v.x), Math.floor(v.y)) || 0
              : 0,
        art,
        footprint: [1, 1],
        // `visits` is rendered desaturated — the Viva Piñata preview (SPEC §7).
        desaturated: !!v.desaturated,
        // 0..1. render.js dissolves the sprite with a Bayer stipple rather than
        // an alpha blend, so the frame stays palette-pure (see `dissolved`).
        fade,
        // A half-dissolved creature is halfway into the sky; a contact shadow
        // needs ground under it to lie on and there is none out there.
        shadow: fade < 1 ? false : CREATURE_SHADOWS[v.creature],
        // WHO IT IS. The scene list carried no identity at all, so `ui.js`'s
        // `creatureAt` — the whole basis of asking `?` about a creature — could
        // never match one and every question about a satyr was answered about
        // the grass he was standing on. It looked for `a.creature || a.id` on
        // entries that had neither, and for `a.x`/`a.y` on entries that carry
        // `tx`/`ty`. Nothing threw; it just quietly always said "meadow".
        creature: v.creature,
      });
    }
    return out;
  };

  return {
    bumpTerrain: () => {
      terrainVersion++;
    },
    /** Where the zoning flip the renderer is about to animate came from. */
    setGrassCause: (origin) => {
      grassCause = origin || null;
    },
    scene(ms, overlayAxis) {
      if (objectsStale) {
        objectsStale = false;
        objects = buildObjects();
      }
      return {
        mapW: MAP_W,
        mapH: MAP_H,
        terrain: terrainCell,
        // `terrainVersion` is the cache key for the whole landscape. It has to
        // move when a LEVEL moves, not only when a ground sprite does: a
        // re-terraced column re-orders occlusion and the cached bitmap is
        // simply wrong until it is repainted. Folding the two version counters
        // into the key is the cheapest correct answer — world.js already bumps
        // `grassVersion` on a zoning write, and render.js diffs the grass
        // itself and SPREADS it rather than snapping, so grass is carried in
        // separately below and never forces a structural rebuild.
        terrainVersion,
        elevationVersion: terrainVersion,
        grassVersion: world.grassVersion || 0,
        // Where the last flip started, so the grass spreads outward from the
        // object the player just placed instead of from a corner of the map
        // (ZONING.md, "Flips are gradual" — the causality has to stay legible).
        grassCause,
        fieldVersion: fields ? fields.version : 0,
        // fields.overlay(axis) is the normalised whole-map view render.js
        // accepts verbatim: it skips 400 per-tile calls, keys its raster cache
        // off `version` so panning is free, and — the part that matters — uses
        // fields.js's own notion of NEUTRAL. Three of the five axes are signed
        // and sit at 0.5 when nothing is there, so a raw `sample` fed through a
        // fixed 0..1 range washed an empty glade at half strength.
        // `neutral` rides along so render.js does not have to guess which axes
        // run both ways from zero — fields.js already knows, and a signed axis
        // washed from the map's minimum lifts the whole glade at half strength
        // the moment one gravel path is laid.
        overlay: overlayAxis && fields ? { ...fields.overlay(overlayAxis), neutral: neutralOf(overlayAxis) } : null,
        objects,
        creatures: buildCreatures(ms),
      };
    },
    invalidateObjects: () => {
      objectsStale = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Audio shim
// ---------------------------------------------------------------------------
//
// SPEC §9 says audio never throws and is a safe no-op without an AudioContext.
// This makes the same promise about the MODULE: a missing audio.js, a syntax
// error in it, or a browser that blocks Web Audio all resolve to silence, and
// the game does not branch anywhere else.

function makeAudioShim(mod) {
  const src = (mod && (mod.audio || mod.default || mod)) || null;
  let warned = false;
  const call = (name, ...args) => {
    try {
      const fn = (src && src[name]) || (mod && mod[name]);
      if (typeof fn === 'function') return fn.apply(src, args);
    } catch (err) {
      if (!warned) {
        warned = true;
        try {
          console.warn('[arcadia] audio call failed, going silent:', err);
        } catch (_) {}
      }
    }
    return undefined;
  };
  if (!src) report.fallbacks.push('audio.js unavailable — the game runs silent');
  return {
    start: () => call('start'),
    // docs/AUDIO.md's two-step trigger. `prime` is the gesture half — resume
    // the context and fetch the track without playing it; `unlockMusic` is the
    // satyr half. Both are no-ops if audio.js is not here, which is the whole
    // point of the shim: THE TRIGGER must not be able to break the boot.
    prime: (url) => call('prime', url),
    unlockMusic: () => call('unlockMusic'),
    setMusicUnlocked: (b) => call('setMusicUnlocked', b),
    stop: () => call('stop'),
    setMood: (m) => call('setMood', m),
    cue: (n, opts) => call('cue', n, opts),
    setMuted: (b) => call('setMuted', b),
    get muted() {
      try {
        return !!(src && src.muted);
      } catch (_) {
        return true;
      }
    },
    get ready() {
      try {
        return !!(src && src.ready);
      } catch (_) {
        return false;
      }
    },
    /**
     * Is a note actually SOUNDING right now?
     *
     * Not `musicUnlocked`, which only means the game intends there to be music,
     * and not `ready`, which is the AudioContext being running. This is
     * audio.js's `musicPlaying` — the track has begun a pass.
     *
     * It exists because the satyr's recital is meant to be him MAKING the
     * music, and intent is not sound: on a returning save the game unlocks the
     * music during boot, before any gesture, so there is no context and the 5 MB
     * has not been fetched. Anything armed on intent fires into silence.
     */
    get playing() {
      try {
        const s = src && typeof src.stats === 'function' ? src.stats() : null;
        return !!(s && s.music && s.music.playing);
      } catch (_) {
        return false;
      }
    },
    /**
     * Is the track DECODED and sitting in memory, ready to be started?
     *
     * The recital waits on this rather than on `playing`, because the score is
     * now started BY the gesture instead of before it: main.js needs to know
     * that the only thing the music is missing is a musician.
     */
    get loaded() {
      try {
        const s = src && typeof src.stats === 'function' ? src.stats() : null;
        return !!(s && s.music && s.music.load === 'ready');
      } catch (_) {
        return false;
      }
    },
    get musicUnlocked() {
      try {
        return !!(src && src.musicUnlocked);
      } catch (_) {
        return false;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The tag contract
// ---------------------------------------------------------------------------

/**
 * Every `count` requirement names a tag. If no placeable in the catalogue
 * carries that tag, the requirement can never tick — and if it is an
 * `at-least`, the creature can never climb past that rung no matter what the
 * player builds. An `at-most 0` for an absent tag is harmless (it is simply
 * always satisfied), so the two cases are reported differently.
 */
function checkTagContract(cat, mCreatures) {
  try {
    const list = (mCreatures && mCreatures.CREATURES) || [];
    if (!list.length || !(cat.CATALOG || []).length) return;
    const owned = new Set();
    for (const d of cat.CATALOG) for (const t of d.tags || []) owned.add(t);

    const blocking = new Map(); // tag -> ['satyr/settles', ...]
    for (const c of list) {
      for (const [rung, reqs] of Object.entries(c.rungs || {})) {
        for (const r of reqs || []) {
          if (!r || r.kind !== 'count' || !r.tag) continue;
          if (owned.has(r.tag)) continue;
          if (r.dir === 'at-most') continue; // vacuously satisfied
          if (!blocking.has(r.tag)) blocking.set(r.tag, []);
          blocking.get(r.tag).push(`${c.id}/${rung}`);
        }
      }
    }
    if (!blocking.size) return;
    for (const [tag, where] of blocking) {
      report.fallbacks.push(
        `no placeable carries the tag '${tag}' — ${where.join(', ')} can never be met`
      );
    }
  } catch (_) {
    /* a diagnostic must never be the thing that breaks the boot */
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function bootOnce(shell = {}) {
  const params = new URLSearchParams(
    typeof location !== 'undefined' ? location.search : ''
  );
  const seedParam = params.get('seed');
  const seedName = seedParam ? String(seedParam).slice(0, 48) : 'default';
  const seed = hashSeed(seedName);
  const rng = mulberry32(seed);

  const reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const app = shell.app || document.getElementById('app') || document.body;
  const canvas =
    shell.canvas ||
    document.getElementById('screen') ||
    document.getElementById('game') ||
    document.querySelector('canvas');

  if (!canvas) {
    report.fallbacks.push('no canvas in the page — nothing can be drawn');
  } else {
    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;
    const c2d = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (c2d) c2d.imageSmoothingEnabled = false;
  }

  // ---- modules ------------------------------------------------------------
  const [mCatalog, mFields, mWorld, mCreatures, mRender, mUI, mInput, mAudio, mGrow, mTiles, mArtCreatures] =
    await Promise.all([
      load('./catalog.js'),
      load('./fields.js'),
      load('./world.js'),
      load('./creatures.js'),
      load('./render.js'),
      load('./ui.js'),
      load('./input.js'),
      load('./audio.js'),
      load('./art/grow.js'),
      load('./art/tiles.js'),
      load('./art/creatures.js'),
    ]);
  // Hand-authored props may not exist yet; their absence is not a fault.
  // `art/extras.js` holds the seam-authored sprites (palisade-fence,
  // seated-maiden) that the catalogue names and no art owner shipped.
  const mProps = await import('./art/props.js').catch(() => null);
  // NOTE: there is deliberately no `art/sprites.js`. An optional import for it
  // used to sit here and always resolved to null — harmless, but it cost a real
  // 404 on every single page load, which is visible in the network panel of a
  // deployed build and looks like a broken game. The seam-authored sprites it
  // was reaching for live in `art/extras.js`. The art-source loop below still
  // tolerates a missing module, so re-adding one is a one-line change.
  const mExtras = await import('./art/extras.js').catch(() => null);
  // art/decor.js — the DECOR.md Part II furniture, architecture, hedges,
  // fountains and the four ELEVATION.md connectors. Without this line every one
  // of the thirty-seven catalogue entries that names a decor sprite draws
  // nothing at all, which is exactly the state this file was in before
  // integration: 2,494 lines of authored art that no code path could reach.
  const mDecor = await import('./art/decor.js').catch(() => null);

  const audio = makeAudioShim(mAudio);
  const cat = mCatalog || { CATALOG: [], byId: () => null };
  if (!cat.byId) cat.byId = (id) => (cat.CATALOG || []).find((d) => d.id === id) || null;
  if (!(cat.CATALOG || []).length) report.fallbacks.push('catalog.js exported no placeables');

  // ---- storage ------------------------------------------------------------
  const storage = (() => {
    try {
      const s = localStorage;
      s.setItem('__arcadia__', '1');
      s.removeItem('__arcadia__');
      return s;
    } catch (_) {
      report.notes.push('no localStorage — this garden will not be saved');
      return null;
    }
  })();

  // One autosave slot per seed, so `?seed=` is a reproducible starting glade
  // AND its own garden. Asking for a seed must never overwrite the default one.
  const BASE_KEY = (mWorld && mWorld.SAVE_KEY) || 'arcadia.garden.v1';
  const key = seedName === 'default' ? BASE_KEY : `${BASE_KEY}:${seedName}`;

  // ?new=1 starts over — but the old garden is copied aside first, because
  // "nothing is ever taken from you" is a guarantee, not a slogan.
  if (params.get('new') === '1' && storage) {
    try {
      const old = storage.getItem(key);
      if (old) {
        storage.setItem(key + '.previous', old);
        storage.removeItem(key);
      }
    } catch (_) {}
  }

  // ---- world --------------------------------------------------------------
  const World = mWorld && mWorld.World;
  let world = null;
  let restored = false;

  if (World && storage) {
    try {
      world = World.load(storage, key);
      restored = !!world;
    } catch (err) {
      report.notes.push('the autosave would not load — starting fresh');
    }
  }
  if (!world && World) world = new World({ w: MAP_W, h: MAP_H, seed });
  if (!world) {
    report.fallbacks.push('world.js did not yield a world — the glade will be empty');
    world = {
      w: MAP_W, h: MAP_H, objects: [], extra: {}, time: 0, undoStack: [],
      groundAt: () => DEFAULT_GROUND, isWet: () => false, objectAt: () => null,
      place: () => null, remove: () => null, removeAt: () => null, undo: () => false,
      batch: (fn) => fn(), subscribe: () => () => {}, advance: () => [], serialize: () => ({}),
      save: () => false, inBounds: () => false,
    };
  }
  if (Array.isArray(world.loadWarnings) && world.loadWarnings.length) {
    report.notes.push('save loaded with warnings: ' + world.loadWarnings.join('; '));
  }

  // ---- fields -------------------------------------------------------------
  const Fields = mFields && mFields.Fields;
  let fields = null;
  try {
    if (Fields) fields = new Fields({ w: MAP_W, h: MAP_H });
  } catch (err) {
    report.fallbacks.push('fields.js threw during construction: ' + err.message);
  }
  if (!fields) report.fallbacks.push('no fields — creatures will read nothing');

  const bridge = fields ? createFieldBridge(world, fields, cat) : null;
  if (bridge && has(world, ['subscribe'])) world.subscribe(bridge.onEvent);

  // ---- creatures ----------------------------------------------------------
  const Bestiary = mCreatures && mCreatures.Bestiary;
  let bestiary = null;
  if (Bestiary && fields) {
    try {
      bestiary = new Bestiary({
        fields,
        seed: seed ^ 0x9e37,
        // THE GROUND, in both senses. creatures.js takes `world` as an alias
        // for `terrain` and delegates every question it can to it — levels,
        // wetness, waterfalls, connector spans — falling back to its own
        // occluder-respecting flood fill only when the host has none. Leaving
        // it out did not break anything visibly; it just meant the naiad could
        // never find a waterfall and the unicorn could never find a pool,
        // because the only object that knows where those are was not in the
        // room.
        world,
        // The catalogue is the authority on which species an object argues
        // for. Without this the bestiary infers affinity from tags, which is
        // the same tag-bridge fallback fields.js keeps for compatibility — and
        // two different inferences of "whose object is this" is exactly the
        // divergence that makes the renderer paint one answer and the
        // creatures obey another.
        affinityOf: (id) => {
          const d = cat.byId(id);
          return (d && d.affinities) || null;
        },
        // Creatures walk the glade but not through what the player planted —
        // and WATER IS PER SPECIES. See makePassable, just above.
        passable: makePassable(world, cat, mCreatures),
      });
    } catch (err) {
      report.fallbacks.push('creatures.js threw during construction: ' + err.message);
    }
  }
  if (!bestiary) report.fallbacks.push('no bestiary — nothing will come to live here');

  // ---- the game object ----------------------------------------------------
  // ui.js reads `game.world`, `game.renderer`, `game.catalog`, `game.time`
  // (garden SECONDS, for the day readout), `game.unlocked` and `game.undo()`
  // off this object, so it is a contract surface and not just a bag.
  let dirty = false;
  const game = {
    app, canvas, world, fields, bestiary, catalog: cat, audio,
    seed, seedName, rng, reducedMotion, restored,
    renderer: null, ui: null, input: null, camera: null,
    time: 0, // garden seconds
    unlocked: null, // null means "everything available"
    boot: report,
    markDirty: () => {
      dirty = true;
    },
  };

  const doUndo = guard('undo', () => {
    const r = invoke(world, ['undo']);
    if (r) {
      dirty = true;
      audio.cue('remove');
    }
    return r;
  });
  game.undo = doUndo;

  /**
   * SPEC §5: a placeable may be gated behind a creature. The gate is computed
   * here rather than stored, so it can only ever open — and a new object is
   * built only when the set actually changes, because ui.js compares it by
   * identity to decide whether to rebuild the palette.
   */
  const GATED = (cat.CATALOG || []).some((d) => d.unlockedBy);
  const SETTLED_INDEX = ((mCreatures && mCreatures.RUNGS) || []).indexOf('settles');
  // null, not '' — on a fresh garden nothing is settled, so the settled-set key
  // is also '' and an empty starting value would make the first call a no-op.
  // `game.unlocked` would stay null, which means "everything available", and
  // every creature-gated placeable would be on the palette from turn one.
  let unlockedKey = null;
  const refreshUnlocked = guard('unlocks', () => {
    if (!GATED) return;
    const settled = new Set();
    for (const st of (bestiary && bestiary.state && bestiary.state.values()) || []) {
      if (st.rungIndex >= (SETTLED_INDEX < 0 ? 2 : SETTLED_INDEX)) settled.add(st.id);
    }
    const k = [...settled].sort().join(',');
    if (k === unlockedKey) return;
    const first = unlockedKey === null;
    unlockedKey = k;
    const open = new Set();
    for (const d of cat.CATALOG || []) {
      if (!d.unlockedBy || settled.has(d.unlockedBy)) open.add(d.id);
    }
    game.unlocked = open;
    // Silent on the first pass: restoring a garden that already has settled
    // creatures must not ring the unlock cue for things you unlocked days ago.
    if (!first) audio.cue('unlock');
  });

  // ---- restore the passengers --------------------------------------------
  // world.extra is world.js's declared "opaque passenger for other owners",
  // which makes it the right place for creature state, the aged field layer
  // and the camera: one save, one slot, one round-trip.
  const extra = (world.extra = world.extra && typeof world.extra === 'object' ? world.extra : {});
  if (bridge) bridge.rebuild();
  if (fields && extra.fields) invoke(fields, ['hydrate'], extra.fields);
  if (bestiary && extra.creatures) invoke(bestiary, ['hydrate'], extra.creatures);

  // ---- a fresh map --------------------------------------------------------
  //
  // A new game starts on PLAIN NEUTRAL MEADOW, sixty tiles square, with nothing
  // on it. The owner asked for a clean map and this is it.
  //
  // That is a deliberate departure from RESEARCH C§2 ("an empty canvas too
  // early is an anti-pattern") and C§5 ("the first creature should arrive from
  // an action you would take on turn one anyway"), which is why the opening
  // glade is KEPT rather than deleted — `?glade=1` still plants it, the docs
  // images were shot in it, and it is the fastest way to see a satyr arrive.
  // If the blank map ever feels like homework, that research is the argument
  // for putting it back, and the code is still here to do it with.
  const wantGlade = /(?:^|[?&])glade=1(?:&|$)/.test(
    (typeof location !== 'undefined' && location.search) || ''
  );
  if (wantGlade && !restored && (cat.CATALOG || []).length && has(world, ['place'])) {
    plantOpeningGlade(world, cat, rng, (mWorld && mWorld.DAY_MS) || 0);
    dirty = true;
  }

  // `?garden=all` — the proving ground. Four quadrants, one per species, built
  // from the ladder itself. A cheat code, and a test fixture you can walk about
  // in: watching all four grasses spread at once is the only way to see the
  // zoning system whole. See plantProvingGround.
  const wantAll = /(?:^|[?&])garden=all(?:&|$)/.test(
    (typeof location !== 'undefined' && location.search) || ''
  );
  if (wantAll && !restored && (cat.CATALOG || []).length && has(world, ['place'])) {
    plantProvingGround(world, cat, mCreatures);
    dirty = true;
  }

  // ---- art + scene --------------------------------------------------------
  const mods = {
    grow: mGrow, tiles: mTiles, artCreatures: mArtCreatures, props: mProps,
    extras: mExtras, decor: mDecor,
    fields: mFields, // for AXIS_META — which axes are signed
  };
  const artist = createArtist(mods);
  const builder = createSceneBuilder({ world, fields, bestiary, cat, artist, mods });

  // The scene's object list is cached; the world tells us when to drop it.
  if (has(world, ['subscribe'])) {
    world.subscribe(
      guard('scene invalidation', (ev) => {
        // A LEVEL edit is a terrain change in the strongest sense — it moves
        // columns up-screen and re-orders which of them occludes which — so it
        // must bump the terrain cache exactly as a ground edit does. It was
        // falling through to `invalidateObjects()`, which repaints the trees
        // and leaves the landscape they stand on cached at the old height.
        // A GRASS write is derived state and deliberately does NOT bump the
        // cache key: render.js diffs the grass itself and spreads it tile by
        // tile over a few seconds, and a structural rebuild would snap it.
        if (ev.type === 'ground' || ev.type === 'level') builder.bumpTerrain();
        else if (ev.type !== 'grass') builder.invalidateObjects();
        if (ev.type !== 'grow') dirty = true;
        // The minimap's terrain layer caches ground AND grass, so unlike the
        // scene it does care about a grass write — zoning is most of what it is
        // for. `grow` is a tree getting taller, which is a nothing at one pixel
        // per tile. Everything else repaints 3600 rects, once, on the next
        // frame.
        if (minimap && ev.type !== 'grow') minimap.invalidate();
      })
    );
  }

  // ---- renderer -----------------------------------------------------------
  const createRenderer = bind(mRender, ['createRenderer']);
  let renderer = null;
  if (createRenderer && canvas) {
    try {
      renderer = createRenderer(canvas, {
        reducedMotion,
        // render.js owns the water palette cycling: it holds the terrain cache,
        // knows which tiles are water, and restamps only those (SPEC §4). Main
        // supplies the rate and the reduced-motion flag and stays out of it.
        waterHz: WATER_HZ,
        // Camera easing is off because input.js owns the pan and its picking
        // must agree with what was drawn to the pixel. Two easings would put a
        // click one tile away from the cursor mid-pan.
        easing: 1,
      });
    } catch (err) {
      report.fallbacks.push('render.js threw during construction: ' + err.message);
    }
  }
  game.renderer = renderer;
  if (!renderer) report.fallbacks.push('no renderer — the canvas stays blank');

  // ---- minimap ------------------------------------------------------------
  //
  // Statically imported, unlike the rest — it is ours, it is small, and its own
  // imports are palette.js and iso.js, both of which are already in the graph.
  // A dynamic import with a fallback would be ceremony around a file that
  // cannot be missing.
  const minimap = createMinimap({
    world,
    groupOf: (id) => {
      const def = cat && typeof cat.byId === 'function' ? cat.byId(id) : null;
      return def ? def.group : null;
    },
  });
  game.minimap = minimap;

  // The shell already fits the stage on resize; re-wire it so the renderer's
  // integer scale is fitted at the same moment, by the same function.
  const fitStage = shell.fitStage || bind(mUI, ['fitStage']);
  const fit = () => {
    try {
      if (fitStage) fitStage(app, canvas, renderer);
      else if (renderer) renderer.resize();
    } catch (_) {}
  };
  fit();
  if (typeof addEventListener === 'function') addEventListener('resize', fit);

  // ---- ui -----------------------------------------------------------------
  const createUI = shell.createUI || bind(mUI, ['createUI']);
  const creatureFrame = bind(mArtCreatures, ['creatureFrame']);
  let ui = null;
  if (createUI) {
    try {
      ui = createUI({
        game,
        root: app,
        canvas,
        renderer,
        world,
        placeables: cat.CATALOG || [],
        // The BESTIARY, not the definitions: ui.js detects `.cards()` and uses
        // the live journal (rungs, ticks, tells) instead of a static list.
        creatures: bestiary || (mCreatures && mCreatures.CREATURES) || [],
        daySeconds: (mCreatures && mCreatures.DAY_SECONDS) || undefined,
        // Hand back the ART, not a canvas. Both a hand-authored sprite and a
        // composer's output are `{rows, anchor, w, h}` and neither carries a
        // `.canvas` — asking for one returned null for all sixty placeables and
        // every palette button fell back to a group-coloured chip. ui.js's
        // artCanvas() rasterises a def itself, which is also the only path that
        // shares format.js's raster cache.
        icon: (item) => artist.artFor(item, 0x1c04, 'mature'),
        portrait: (card) => {
          if (!creatureFrame || !card) return null;
          try {
            const s = creatureFrame(card.id, 'idle', 'se', 0);
            return s || null;
          } catch (_) {
            return null;
          }
        },
        on: {
          undo: doUndo,
          audio: (on) => audio.setMuted(!on),
          // The brush changed size, so the preview under the cursor is now the
          // wrong shape. input.js owns the ghost and is built after this call,
          // which is why this is a late read rather than a direct reference.
          brush: () => invoke(input, ['refreshGhost']),
        },
      });
    } catch (err) {
      report.fallbacks.push('ui.js threw during construction: ' + err.message);
    }
  }
  game.ui = ui;

  // ---- input --------------------------------------------------------------
  // input.js mutates a camera in place; the renderer reads one of its own. The
  // bridge below keeps them identical every frame.
  const camera = { ox: 0, oy: 0 };
  game.camera = camera;

  const createInput = shell.createInput || bind(mInput, ['createInput']);
  let input = null;
  if (createInput && canvas) {
    try {
      input = createInput({
        canvas,
        ui,
        world,
        // input.js prefers the RENDERER's pickTile when it has one, because the
        // renderer knows the snapped camera it actually drew the frame with.
        // Leaving this out (which it was) silently demoted every click to
        // input's own fallback projection.
        renderer,
        camera,
        // So a click on the minimap jumps the camera instead of falling through
        // to the garden drawn underneath it.
        minimap,
        map: { w: MAP_W, h: MAP_H },
        // We drive it from the one loop below, so it must not run its own rAF.
        selfDrive: false,
        on: {
          // `opts` carries `facing` — which way round the wheel left it. World
          // clamps it against the placeable's own count, so this passes it
          // straight through rather than second-guessing.
          place: (id, tx, ty, _item, opts) => {
            const r = world.place(id, tx, ty, opts || {});
            if (r) {
              dirty = true;
              audio.cue('place');
            }
            return !!r;
          },
          remove: (tx, ty) => {
            const r = invoke(world, ['removeAt'], tx, ty);
            if (r) {
              dirty = true;
              audio.cue('remove');
            }
            return !!r;
          },
          /**
           * Raise / lower / level. input.js would fall through to
           * `world.applyTerrain` on its own, but then the autosave would not
           * know the garden had changed and a terraced hillside could be lost
           * to a refresh. One handler, so the edit and the save agree.
           *
           * ELEVATION.md: "terrain editing is free, unlimited, and reversible.
           * There is no terraforming cost and never will be." Nothing here
           * checks, charges, or refuses for any reason but the physical
           * ceiling and floor, which world.js reports in `reason`.
           */
          terrain: (op, r) => {
            const res = invoke(world, ['applyTerrain'], op, r.x0, r.y0, r.x1, r.y1);
            if (res && res.ok) {
              dirty = true;
              audio.cue('place');
            }
            return res;
          },
          undo: doUndo,
          redo: () => invoke(world, ['redo']),
        },
      });
    } catch (err) {
      report.fallbacks.push('input.js threw during construction: ' + err.message);
    }
  }
  game.input = input;
  if (input && input.camera) game.camera = input.camera;

  // Start where the player left off, or centred on the glade.
  //
  // Both paths go through the RENDERER, because the renderer owns the camera
  // (see syncCamera below). `panTo(x, y, true)` is the immediate, unanimated,
  // self-clamping form — the eased one would sail the view in from the corner
  // on every reload, which is charming exactly once.
  if (extra.camera && renderer && typeof renderer.panTo === 'function') {
    renderer.panTo(extra.camera.ox || 0, extra.camera.oy || 0, true);
  } else if (renderer && typeof renderer.centreOnTile === 'function') {
    renderer.centreOnTile(MAP_W / 2 - 0.5, MAP_H / 2 - 0.5, true);
  } else {
    invoke(input, ['centreOn'], MAP_W / 2 - 0.5, MAP_H / 2 - 0.5);
  }
  // Seed game.camera from wherever that landed, so an autosave firing before
  // the first frame still records where the player is actually looking.
  if (renderer && renderer.camera && game.camera) {
    game.camera.ox = renderer.camera.x ?? 0;
    game.camera.oy = renderer.camera.y ?? 0;
  }

  // -------------------------------------------------------------------------
  // THE TRIGGER — music starts when the first satyr walks onto the map
  // -------------------------------------------------------------------------
  //
  // docs/AUDIO.md. Not at boot, not on the first gesture: the first time a
  // satyr ARRIVES. Satyrs are the musicians of the myth, so the glade is quiet
  // until the creature who brings music arrives with it — and the satyr is
  // deliberately the easiest denizen to attract, so the player gets music early
  // but earns it.
  //
  // Autoplay policy cannot be talked out of, so the work is split in two:
  //
  //   the GESTURE half   wake(), below. Resume the context, bring up the
  //                      ambient layer, fetch and decode 5 MB of mp3 — and
  //                      play none of it. By the time a satyr shows up the
  //                      player has certainly clicked, because placing things
  //                      is how satyrs arrive.
  //   the ARRIVAL half   unlockSong(), wired into the event drain below. Fades
  //                      the track in over ~4 s as he walks in.
  //
  // The flag is persisted (extra.musicUnlocked). A garden reloaded with a satyr
  // already living in it starts the music once primed rather than sitting in
  // silence waiting for a "first" arrival that already happened.
  const MUSICIAN = 'satyr';
  let musicUnlocked = false;

  /**
   * THE PERFORMANCE.
   *
   * When the score is playing, the satyr stands and plays it for three minutes.
   * He is the musician of the myth; the music arriving with him is only half
   * the idea, and the other half is seeing him make it.
   *
   * ARMED ONCE PER SESSION, by whichever of these happens first:
   *
   *   - the music unlocks because a satyr has just walked in (the intended
   *     moment, and the only one the first version handled),
   *   - a satyr arrives at any later point,
   *   - or the garden loads with a satyr already living in it.
   *
   * The first version armed it ONLY on a fresh unlock, reasoning that a
   * three-minute recital on every page refresh would become a chore. That was
   * wrong in the way that matters. `extra.musicUnlocked` PERSISTS IN THE SAVE,
   * so for a returning player — which is everyone who has played before — the
   * track resumed at load, `unlockSong` returned at its first line, and the
   * recital was not merely skipped that once but became permanently
   * unreachable: no later arrival could arm it either, because `unlockSong`
   * never gets past `if (musicUnlocked) return`. The owner reported exactly
   * this, and it made the whole feature invisible.
   *
   * A thing seen slightly too often beats a thing that cannot be seen.
   *
   * It is a LATCH rather than a direct call because at the moment it is armed
   * he may still be walking in from the map rim, half dissolved into the dusk,
   * and a creature out there has nowhere to stand. `askFlourish` refuses
   * politely in that state, so the tick simply keeps asking until he has both
   * feet on the grass — one flag and one line, rather than a second state
   * machine listening for his arrival.
   *
   * The latch itself is `createRecital()` at the top of this file, pulled out
   * so a test can hold the rule.
   */
  const recital = createRecital();

  const unlockSong = guard('music', (restoring) => {
    if (musicUnlocked) return;
    musicUnlocked = true;
    extra.musicUnlocked = true;
    dirty = true;
    // Same call either way — audio.js starts the track as soon as it is primed
    // and decoded, whichever of those lands last. The two names differ only so
    // that the call site says which of the two stories this is.
    // THE SCORE IS NOT STARTED HERE — this is the arrival, and he is still out
    // over the rim walking in. Starting it now is what put the music in front
    // of the musician. Arm the recital instead; the tick starts the track on
    // the step he raises the pipes. See createRecital above.
    //
    // `restoring` no longer changes what happens, only what the moment MEANS,
    // and it is kept because the save still records that this garden has heard
    // its music before.
    void restoring;
    recital.arm();
  });

  // Restore. Two sources, because a save written before this feature existed
  // has no flag in it and still deserves its music: the stored flag, or a satyr
  // that has already climbed to `visits` or beyond in the garden being loaded.
  {
    let already = extra.musicUnlocked === true;
    if (!already && bestiary && bestiary.state) {
      try {
        const VISITS = ((mCreatures && mCreatures.RUNGS) || []).indexOf('visits');
        const st = bestiary.state.get(MUSICIAN);
        if (st && st.rungIndex >= (VISITS < 0 ? 1 : VISITS)) already = true;
      } catch (_) {}
    }
    if (already) unlockSong(true);
  }

  const wake = () => {
    // start() then prime(): start is the SPEC §9 contract and brings up the
    // ambient layer; prime adds the fetch+decode of the track and plays
    // nothing. Silence here is deliberate and is the reason the arrival lands
    // as a moment rather than as a bug.
    audio.start();
    // Five megabytes is not worth downloading for somebody who muted the game
    // last time they played. Unmuting primes instead — see setMute below.
    if (!audio.muted) audio.prime();
    invoke(ui, ['setAudio'], !audio.muted);
  };
  if (typeof addEventListener === 'function') {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
      addEventListener(ev, wake, { once: true, passive: true });
    }
  }

  // ---- mute, and it persists ----------------------------------------------
  //
  // AUDIO.md's "still true" list: the mute control persists. It is restored
  // BEFORE the first gesture, so a muted player's first click does not put a
  // three-second fade-in of wind through their headphones on the way to
  // discovering the toggle again. audio.js reads its module-level `muted` when
  // it builds the graph, so setting it early is enough.
  //
  // `M`, because input.js owns every other letter and does not own that one.
  const MUTE_KEY = 'arcadia.muted';
  const setMute = guard('mute', (on, announce) => {
    audio.setMuted(!!on);
    // Unmuting is a gesture, so it is also a legal moment to prime: a player
    // who started muted and changed their mind still gets the track when the
    // satyr comes.
    if (!on) {
      audio.start();
      audio.prime();
    }
    try {
      if (storage) storage.setItem(MUTE_KEY, on ? '1' : '0');
    } catch (_) {}
    invoke(ui, ['setAudio'], !on);
    if (announce) invoke(ui, ['say'], on ? 'Sound off.' : 'Sound on.', 2500);
  });
  try {
    if (storage && storage.getItem(MUTE_KEY) === '1') audio.setMuted(true);
  } catch (_) {}
  if (typeof addEventListener === 'function') {
    addEventListener('keydown', (ev) => {
      if (!ev || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key !== 'm' && ev.key !== 'M') return;
      const t = ev.target;
      const tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      setMute(!audio.muted, true);
    });
  }
  game.setMuted = (on) => setMute(!!on, false);

  // ---- persistence --------------------------------------------------------
  let sinceSave = 0;

  const flush = guard('autosave', (force) => {
    if (!storage || !has(world, ['save'])) return false;
    if (!force && !dirty) return false;
    if (fields) extra.fields = invoke(fields, ['serialize']);
    if (bestiary) extra.creatures = invoke(bestiary, ['serialize']);
    if (game.camera) extra.camera = { ox: game.camera.ox, oy: game.camera.oy };
    let okSave = world.save(storage, key);
    if (!okSave) {
      // Almost certainly quota. Drop the backup copy and try once more —
      // losing a garden is the one unrecoverable thing in a cosy game.
      try {
        storage.removeItem(key + '.previous');
      } catch (_) {}
      okSave = world.save(storage, key);
    }
    if (okSave) {
      dirty = false;
      sinceSave = 0;
    }
    return okSave;
  });
  game.save = () => flush(true);

  // The two moments a garden is most likely to be lost.
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => flush(true));
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });
  }

  // -------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------
  //
  // ONE requestAnimationFrame, driving everything. render.js and input.js both
  // offer a "call me from your loop" mode and both are used in it, so there is
  // exactly one clock in the game and no two subsystems can disagree about how
  // much time has passed.
  //
  // Simulation is FIXED-TIMESTEP: growth, field ageing, creature agents and
  // the ladder all advance in 1/20s steps regardless of frame rate, so a 144Hz
  // monitor and a 30Hz one grow the same garden at the same speed. Rendering
  // runs free, once per frame.

  const stepWorld = guard('world.advance', (dt) => invoke(world, ['advance'], dt * 1000));
  const stepFields = guard('fields.tick', (dt) => invoke(fields, ['tick'], dt));

  // -------------------------------------------------------------------------
  // THE JOIN: whose ground is this?
  // -------------------------------------------------------------------------
  //
  // ZONING.md splits this question across two owners on purpose, and the split
  // is the reason it stays correct:
  //
  //   fields.js DECIDES  — resolve() per tile, from the flood with occluders.
  //   world.js  STORES   — a plain cache, never on the undo stack, not
  //                        authoritative; throw it away and the next recompute
  //                        rebuilds it exactly.
  //   render.js PAINTS   — and diffs it itself, so a flip SPREADS over a few
  //                        seconds instead of snapping.
  //
  // Nobody owned the wire between them, so nothing was ever written and the
  // whole garden stayed meadow no matter what was planted. This is that wire.
  //
  // It is cheap to call every step: `grassGrid()` is memoised on the field
  // version and returns the same frozen object until something actually moves,
  // and `cacheGrassGrid` bumps `grassVersion` only on a real change.
  let lastGrassVersion = -1;
  const syncGrass = guard('grass', () => {
    if (!fields || typeof fields.grassGrid !== 'function') return;
    if (typeof world.cacheGrassGrid !== 'function') return;
    if (fields.version === lastGrassVersion) return;
    lastGrassVersion = fields.version;
    // The origin of the change, so the renderer can radiate the spread from
    // the object that caused it rather than from a map corner.
    const delta = invoke(fields, ['grassChanges']);
    if (delta && delta.origin) builder.setGrassCause(delta.origin);
    if (world.cacheGrassGrid(fields.grassGrid())) dirty = true;
  });
  const stepCreatures = guard('bestiary.update', (dt) => {
    const events = invoke(bestiary, ['update'], dt, { reducedMotion });
    // Ask AFTER the step, so the arrival that ended this tick counts. He
    // refuses while he is still out over the rim; the first tick he is standing
    // on grass, he takes it — and THAT is the step the score starts, which is
    // the whole point. The latch stays armed across as many refusals as it
    // takes, and `took()` closes it for the session.
    if (recital.pending && typeof bestiary.askFlourish === 'function') {
      // Everything the music needs except a reason: the file decoded, the
      // context running, the player listening.
      const can = !audio.muted && audio.ready && audio.loaded;
      if (can && bestiary.askFlourish(MUSICIAN, 'piping')) {
        if (recital.took()) audio.unlockMusic();
      } else if (recital.hold(dt, can)) {
        // He has been busy too long. The score stops waiting; he joins it when
        // he is free, because `pending` is still true.
        if (recital.release()) audio.unlockMusic();
      }
    }
    return events;
  });
  const stepInput = guard('input.update', (dt) => invoke(input, ['update'], dt));
  // ui.js documents two signatures and picks by the first argument's type;
  // (dtSeconds, game) is the one it names as main.js's.
  const stepUI = guard('ui.update', (dt) => invoke(ui, ['update'], dt, game));

  let steps = 0;
  let last = 0;
  let acc = 0;
  let running = true;
  let speed = 1;

  // The control itself. ui.js reads `game.speed` to label the button and calls
  // `setSpeed` to turn it; input.js goes through ui.js. Nothing else knows.
  game.speeds = SPEEDS;
  game.speed = speed;
  game.setSpeed = (n) => {
    speed = SPEEDS.includes(n) ? n : 1;
    game.speed = speed;
    // Whatever was banked at the old rate is banked at the new one; a change of
    // speed is not a reason to skip or replay a step.
    return speed;
  };
  game.cycleSpeed = (d = 1) => {
    const at = SPEEDS.indexOf(speed);
    // Clamped, not wrapped: pressing "faster" at 4x should stay at 4x rather
    // than drop the player back to 1x without their asking.
    return game.setSpeed(SPEEDS[clamp(at + d, 0, SPEEDS.length - 1)]);
  };

  const handleEvents = guard('events', (events) => {
    for (const ev of events) {
      if (!ev || !ev.type) continue;
      // THE TRIGGER, on every rung that means "he is standing in the garden".
      // `visits` counts, not only `settles` — the desaturated preview walk-in
      // is a big moment and docs/AUDIO.md gives it the music. `settled` is here
      // too because a creature that climbs straight past the preview (the
      // requirements completed between one visit window and the next) would
      // otherwise arrive to silence.
      if (
        ev.creature === MUSICIAN &&
        (ev.type === 'visit-start' || ev.type === 'settled' || ev.type === 'settled-again')
      ) {
        unlockSong(false);
        // NOT armed here either. An arrival is what STARTS the music, but the
        // track may be seconds of decoding away, and on a returning save it may
        // already have been going for an hour. Either way the tick below is the
        // thing that knows.
      }
      switch (ev.type) {
        case 'settled':
        case 'settled-again':
          // The one sound in this game allowed to draw attention to itself.
          // It now ducks the track ~3 dB underneath itself so the cue reads.
          audio.cue(ev.creature === 'pan' ? 'pan' : 'settle');
          invoke(ui, ['say'], ev.name ? `${ev.name} has settled here.` : 'Something has settled here.', 6000);
          break;
        case 'thrives':
          audio.cue('thrive');
          invoke(ui, ['say'], 'There are two of them now.', 5000);
          break;
        case 'sighted':
          if (!ev.hidden) audio.cue('sighted');
          break;
        case 'visit-start':
          audio.cue('visit');
          break;
        case 'tell':
          // Diegetic, and — for everyone except the satyr — deliberately
          // silent. A trace is not an announcement.
          //
          // THE ESCALATION THAT WAS ALREADY WRITTEN. The satyr's third tell is
          // literally "Pipes, thin and off-key, somewhere past the trees", so
          // the hint system has been promising music all along. This makes good
          // on it with one procedural voice we already had: a faint, sour,
          // panned-off-centre pipe that grows through the four tells and then
          // stops, because the next thing you hear is him walking in with the
          // real track. Strength runs 0..1 over the tell index — the first is
          // something you might have imagined, the last is unmistakable.
          if (ev.creature === MUSICIAN) {
            const n = typeof ev.index === 'number' ? ev.index : 1;
            audio.cue('pipes', { strength: clamp((n - 1) / 3, 0, 1) });
          }
          invoke(ui, ['say'], ev.text, 7000);
          break;
        case 'relocated':
          invoke(ui, ['say'], 'It has moved to a better spot.', 5000);
          break;
      }
      invoke(ui, ['onEvent'], ev);
      dirty = true;
    }
    if (events.length) refreshUnlocked();
  });

  /**
   * The score follows the region the player is looking at, not the map as a
   * whole — a dry hillside and a reed bank should not sound the same.
   */
  const pushMood = guard('audio.setMood', () => {
    if (!fields) return;

    // iso.js's visibleTileRange returns {tx0, tx1, ty0, ty1}. This read those
    // as `x0 / x1 / minX / maxX`, got undefined from every one of them, and
    // fell through to the whole-map defaults — so the "region on screen" was
    // permanently the map centre and the score never followed the camera at
    // all. The aliases are kept because they cost nothing and the renderer is
    // not this file's to pin down.
    const vis = invoke(renderer, ['visibleTiles']) || null;
    const x0 = clamp(vis?.tx0 ?? vis?.x0 ?? vis?.minX ?? 0, 0, MAP_W - 1);
    const x1 = clamp(vis?.tx1 ?? vis?.x1 ?? vis?.maxX ?? MAP_W - 1, 0, MAP_W - 1);
    const y0 = clamp(vis?.ty0 ?? vis?.y0 ?? vis?.minY ?? 0, 0, MAP_H - 1);
    const y1 = clamp(vis?.ty1 ?? vis?.y1 ?? vis?.maxY ?? MAP_H - 1, 0, MAP_H - 1);
    const tx = clamp(Math.round((x0 + x1) / 2), 0, MAP_W - 1);
    const ty = clamp(Math.round((y0 + y1) / 2), 0, MAP_H - 1);

    const m = invoke(fields, ['sampleNorm'], tx, ty) || {};

    // Two channels the field does not carry and cannot: how much open water is
    // actually on screen, and how close the nearest waterfall is. AUDIO.md
    // asks for water that gets "louder near a waterfall", and a waterfall is a
    // fact about the TERRAIN — water standing above a drop, world.js's
    // waterfallAt() — not a value on the moisture axis. Whole-map worst case is
    // 400 isWet() calls twice a second, which is nothing.
    let wet = 0;
    let fall = 0;
    if (has(world, ['isWet'])) {
      const canFall = has(world, ['waterfallAt']);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!world.isWet(x, y)) continue;
          wet++;
          if (!canFall) continue;
          const edges = world.waterfallAt(x, y);
          if (!edges || !edges.length) continue;
          // Nearer and taller drops are louder. Distance is from the middle of
          // the screen, so panning toward a cascade brings it up smoothly
          // rather than snapping when it crosses the viewport edge.
          let drop = 0;
          for (const e of edges) if (e.drop > drop) drop = e.drop;
          const d = Math.hypot(x - tx, y - ty);
          const near = (1 / (1 + d / 3.5)) * Math.min(1, 0.55 + drop * 0.25);
          if (near > fall) fall = near;
        }
      }
    }
    const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
    // A tenth of the view being water is already "a garden with water in it".
    m.water = clamp(wet / (area * 0.10), 0, 1);
    m.waterfall = clamp(fall, 0, 1);

    audio.setMood(m);
  });

  function sim(dt) {
    // Order matters, and creatures.js says so explicitly: fields.tick(dt) must
    // run before the bestiary reads them, or the ladder is evaluated against
    // last step's maturity.
    stepWorld(dt); // growth: sprout -> young -> mature
    stepFields(dt); // maturity accrues near mature plants (SPEC §6)
    syncGrass(); // fields decided; write the ground BEFORE anyone reads it
    stepCreatures(dt); // agents walk; the ladder is evaluated inside

    game.time = (typeof world.time === 'number' ? world.time : game.time * 1000) / 1000;

    steps++;
    if (steps % LADDER_EVERY === 0) {
      const events = invoke(bestiary, ['drainEvents']);
      if (events && events.length) handleEvents(events);
    }
    if (steps % MOOD_EVERY === 0) pushMood();

    sinceSave += dt;
    if (sinceSave >= AUTOSAVE_EVERY) flush(false);
  }

  /**
   * ONE camera, and the renderer owns it.
   *
   * input.js is explicit about this: when it is handed a renderer with a
   * `dragBy`, it stops keeping a camera of its own and reads and writes the
   * renderer's (`hasRendererCam`), so that picking is always done against the
   * snapped offset the frame was actually drawn with. Its exported `camera` is
   * documented as "present (and authoritative) only when NO renderer owns the
   * camera" — an inert {ox:0, oy:0} in this configuration.
   *
   * main.js was pushing that inert object INTO the renderer every frame, which
   * pinned the view to the top-left corner of the world: `centreOn` moved the
   * renderer, and this function moved it straight back before the first frame
   * was drawn. The map could not be panned by drag, by arrow key, or by edge
   * scroll, and the glade sat off the bottom-right of a screen half full of
   * sky. Nothing errored — two owners simply each believed they held the
   * camera, which is the characteristic failure of a seam nobody owns.
   *
   * So the arrow now points the other way: the renderer is the source, and
   * `game.camera` becomes a live read of it for the autosave and for ui.js.
   */
  const syncCamera = guard('camera', () => {
    if (!renderer || !renderer.camera) return;
    const c = renderer.camera;
    game.camera.ox = c.x ?? 0;
    game.camera.oy = c.y ?? 0;
  });

  // The map rectangle, in logical pixels. ui.js owns the number; the fallback
  // is the same rectangle spelled out, for a host that swapped ui.js out.
  const VIEW = (mUI && mUI.LAYOUT && mUI.LAYOUT.VIEW) || { x: 0, y: 14, w: 640, h: 286 };

  // Tell the chrome that the minimap's corner is not garden. Once: the panel
  // does not move.
  if (minimap) invoke(ui, ['reserve'], [minimap.rect(VIEW)]);

  const drawFrame = guard('render', (nowMs) => {
    if (!renderer) return;
    const axis = invoke(ui, ['overlay']) ?? null;
    renderer.setOverlay(axis || null);
    const scene = builder.scene(nowMs, axis);
    renderer.setScene(scene);
    if (ui && 'ghost' in ui) renderer.setGhost(ui.ghost || null);
    renderer.frame(nowMs);
    // OVER the finished frame, and after it — the minimap is chrome, and chrome
    // is not part of the scene the renderer sorts. It reads the renderer's own
    // snapped camera so the border it draws is the view that was actually
    // drawn, not the one we asked for.
    if (minimap && renderer.ctx) {
      minimap.draw(renderer.ctx, renderer.camera, VIEW, scene && scene.creatures, nowMs);
    }
  });

  function frame(nowMs) {
    if (!running) return;
    requestAnimationFrame(frame);

    if (!last) last = nowMs;
    // Clamped at both ends: a backgrounded tab must not fast-forward the
    // garden, and one slow frame must not stutter the whole simulation.
    let dt = (nowMs - last) / 1000;
    last = nowMs;
    if (!(dt > 0)) dt = 0;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;

    // `simSchedule` owns the arithmetic and the speed multiplier; the step it
    // hands back is ALWAYS SIM_DT. See its note above.
    const due = simSchedule(acc, dt, speed);
    acc = due.acc;
    for (let n = 0; n < due.steps; n++) sim(due.dt);

    stepInput(dt);
    stepUI(dt);
    syncCamera();
    drawFrame(nowMs);
  }

  game.pause = () => {
    running = false;
  };
  game.resume = () => {
    if (running) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  };

  // ---- the contract check -------------------------------------------------
  //
  // SPEC §5: `tags` are what creature count requirements match against. That
  // makes the tag vocabulary a contract between catalog.js and creatures.js,
  // and nothing in either file fails loudly when it is broken — a requirement
  // for a tag no placeable carries simply never ticks, and a creature quietly
  // becomes impossible to settle. main.js is the only place both halves are in
  // the room at once, so it is the only place that can notice.
  //
  // This never changes behaviour. It reports.
  checkTagContract(cat, mCreatures);

  // ---- go -----------------------------------------------------------------
  //
  // Resolve the ground ONCE before the first frame. Without this the opening
  // glade — which is a fully planted satyr hollow — draws as flat meadow for
  // the first twentieth of a second and then flips, and because render.js
  // spreads a flip gradually on purpose, that first resolve would animate
  // itself across the whole map while the player watched. The garden should
  // already be the garden when they arrive.
  syncGrass();
  game.time = (typeof world.time === 'number' ? world.time : 0) / 1000;
  refreshUnlocked();
  pushMood();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);

  if (typeof window !== 'undefined') window.arcadia = game;

  if (report.missing.length || report.fallbacks.length) {
    try {
      console.info(
        '[arcadia] booted — %d module(s) loaded, %d missing, %d fallback(s)',
        report.loaded.length, report.missing.length, report.fallbacks.length
      );
      for (const m of report.missing) console.warn('  missing', m.path, '—', m.error);
      for (const f of report.fallbacks) console.warn('  fallback:', f);
    } catch (_) {}
  }

  return game;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
//
// index.html imports this module and calls start(shell). Booting twice would
// give you two worlds, two loops and two autosaves racing for one localStorage
// slot, so start() is idempotent: the first caller starts the game and
// everyone after gets the same promise.

let booting = null;

/** Start Arcadia. Safe to call more than once — the second call is the first. */
export function start(shell) {
  if (!booting) {
    booting = bootOnce(shell || {}).catch((err) => {
      try {
        console.error('[arcadia] boot failed:', err);
      } catch (_) {}
      throw err;
    });
  }
  return booting;
}

export default start;
export { start as boot };
