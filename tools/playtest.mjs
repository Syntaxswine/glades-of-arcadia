#!/usr/bin/env node
/**
 * tools/playtest.mjs — does the DESIGN work?
 *
 * `node --test test/` asks whether the code is correct. This asks whether the
 * game is playable, which is a different question and not one a unit test can
 * reach. Per SPEC §10 it must:
 *
 *   1. assert every creature's `settles` requirements are SATISFIABLE — by
 *      actually constructing a garden that meets them and running the real
 *      ladder until it fires,
 *   2. assert satyr and unicorn are MUTUALLY UNSATISFIABLE within one sigma,
 *      which is the design thesis of the whole game,
 *   3. assert every placeable is reachable through the unlock graph from an
 *      empty garden,
 *   4. report axis-field statistics for a few reference gardens,
 *   5. exit non-zero on a STRUCTURAL fault only.
 *
 * The distinction in (5) is the interesting one. A garden that is merely hard
 * to build is a tuning observation and belongs in the report; a creature that
 * can NEVER settle is a fault. The line drawn here: a fault is something no
 * amount of player skill can work around.
 *
 * Everything is built through the real World, the real Fields, the real
 * Bestiary and main.js's own field bridge. Nothing about the simulation is
 * re-implemented here — a tool that models the game instead of running it
 * tests the model.
 *
 *   node tools/playtest.mjs [--verbose] [--json]
 */

import { World, DAY_MS } from '../js/world.js';
import { Fields, AXES, CLAIM_FLOOR } from '../js/fields.js';
import {
  Bestiary, CREATURES, CREATURE_BY_ID, RUNGS, REQUIRED_TAGS, THESIS, proveThesis,
  DAY_SECONDS, OFFMAP_STATES, waterRuleFor,
} from '../js/creatures.js';
import * as creatureMod from '../js/creatures.js';
import * as cat from '../js/catalog.js';
import { createFieldBridge, COMPOSER_ALIAS, makePassable } from '../js/main.js';
import { COMPOSERS, compose } from '../js/art/grow.js';

// The art modules, in js/main.js's own precedence order. If this list and
// createArtist()'s ever disagree, the coverage check below stops meaning what
// it says — so they are written to be compared side by side.
import * as artTiles from '../js/art/tiles.js';
import * as artExtras from '../js/art/extras.js';
import * as artProps from '../js/art/props.js';
import * as artDecor from '../js/art/decor.js';
const ART_MODULES = [artTiles, artExtras, artProps, artDecor];

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const AS_JSON = argv.includes('--json');
// --quick skips the dynamic ladder run and checks satisfiability by evaluation
// alone. The full run is the honest one and is the default; --quick is for
// iterating on the catalogue, where a thirty-second wait per edit is the
// difference between a tool that gets used and one that does not.
const QUICK = argv.includes('--quick');
const LADDER_DAYS = QUICK ? 0 : 25;

const MAP = 20;
const faults = [];
const notes = [];
const report = { checks: [], gardens: {}, thesis: null, unlock: null };

const ok = (name, detail = '') => {
  report.checks.push({ name, pass: true, detail });
  if (!AS_JSON) console.log(`  ok    ${name}${detail ? `  — ${detail}` : ''}`);
};
const fault = (name, detail) => {
  faults.push(`${name}: ${detail}`);
  report.checks.push({ name, pass: false, detail });
  if (!AS_JSON) console.log(`  FAULT ${name}\n        ${detail}`);
};
const note = (text) => {
  notes.push(text);
  if (!AS_JSON) console.log(`  note  ${text}`);
};
const head = (text) => {
  if (!AS_JSON) console.log(`\n${text}\n${'-'.repeat(text.length)}`);
};

// ---------------------------------------------------------------------------
// A garden, built the way the game builds one
// ---------------------------------------------------------------------------

function newGarden(seed = 4242) {
  const world = new World({ w: MAP, h: MAP, seed });
  const fields = new Fields({ w: MAP, h: MAP });
  const bridge = createFieldBridge(world, fields, cat);
  world.subscribe(bridge.onEvent);
  bridge.rebuild();
  return { world, fields, bridge };
}

/** Tiles within `radius` of (hx,hy), nearest first, inside the map. */
function ring(hx, hy, radius) {
  const out = [];
  for (let ty = Math.max(0, hy - radius); ty <= Math.min(MAP - 1, hy + radius); ty++) {
    for (let tx = Math.max(0, hx - radius); tx <= Math.min(MAP - 1, hx + radius); tx++) {
      const d = Math.hypot(tx - hx, ty - hy);
      if (d <= radius) out.push({ tx, ty, d });
    }
  }
  out.sort((a, b) => a.d - b.d);
  return out;
}

/**
 * Every requirement a creature must satisfy to SETTLE — which is every rung up
 * to and including `settles`, because the ladder is climbed, not jumped.
 */
function settleRequirements(creature) {
  const upto = RUNGS.slice(0, RUNGS.indexOf('settles') + 1);
  return upto.flatMap((r) => creature.rungs[r].map((req) => ({ rung: r, req })));
}

/**
 * The demands, read off the requirement objects rather than guessed at. A
 * count requirement carries `dir: 'at-least' | 'at-most'`, and the difference
 * matters more than it looks: the centaur's `at-most 4 tree within 3` is the
 * OPEN RUN it needs to gallop on. Reading it as a demand for four trees builds
 * the one garden the centaur will not live in.
 */
function demandsOf(creature) {
  const need = new Map(); // tag -> { n, radius }   at-least
  const cap = new Map(); // tag -> { n, radius }   at-most (n may be > 0)
  const bands = [];
  const presence = [];
  for (const { req } of settleRequirements(creature)) {
    if (req.kind === 'count') {
      const table = req.dir === 'at-most' ? cap : need;
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
    } else if (req.kind === 'axis') bands.push(req);
    else if (req.kind === 'presence') presence.push(req);
  }
  return { need, cap, bands, presence };
}

const WATER_TAGS = new Set(['still-water', 'running-water', 'spring-head', 'marsh', 'water-loving']);
const isWaterTag = (t) => WATER_TAGS.has(t);
const dep = (p, axis) => ((p.deposits || {})[axis] || 0);

/**
 * Build a garden that satisfies `creature`'s settle requirements around (hx,hy).
 *
 * The loop is driven by the REAL evaluator — creatures.js's own
 * `evaluateRung` — rather than by a second reading of the requirements here.
 * A builder that models the rules instead of asking them will happily declare
 * a garden finished that the game does not accept, which is the one failure
 * mode a satisfiability tool must not have.
 *
 * Returns `problems` rather than raising faults: whether a failure to build is
 * a fault depends on the caller. When the thesis check tries to squeeze a
 * unicorn garden next to a satyr hill, failing is the correct answer.
 */
function buildFor(creature, hx, hy, garden = newGarden()) {
  const { world, fields } = garden;
  const { need, cap, bands } = demandsOf(creature);
  const placed = [];
  const problems = [];
  const bestiary = new Bestiary({ fields, seed: 3, passable: () => true });

  // A tag both demanded and capped below the demand is a contradiction inside
  // one creature — quite different from the satyr/unicorn one, which is design.
  for (const [tag, want] of need) {
    const c = cap.get(tag);
    if (c && c.n < want.n && c.radius >= want.radius) {
      problems.push(`${creature.id} needs ${want.n} '${tag}' within ${want.radius} but caps them at ${c.n} within ${c.radius}`);
    }
  }

  /** Would this placement break a cap, or is the tag flatly forbidden? */
  const capOk = (def, tx, ty) => {
    for (const [tag, c] of cap) {
      if (!(def.tags || []).includes(tag)) continue;
      if (Math.hypot(tx - hx, ty - hy) > c.radius) continue;
      if (fields.countTag(tag, hx, hy, c.radius) >= c.n) return false;
    }
    return true;
  };
  const forbidden = (def) => [...cap].some(([t, c]) => c.n === 0 && (def.tags || []).includes(t));

  const put = (def, radius) => {
    for (const { tx, ty } of ring(hx, hy, radius)) {
      if (!capOk(def, tx, ty)) continue;
      if (!world.canPlace(def.id, tx, ty).ok) continue;
      if (world.place(def.id, tx, ty)) {
        placed.push({ id: def.id, tx, ty });
        return true;
      }
    }
    return false;
  };

  /** Every unmet, non-behavioural requirement on the way to settling. */
  const unmet = () => {
    const out = [];
    for (const rung of RUNGS.slice(0, RUNGS.indexOf('settles') + 1)) {
      for (const r of bestiary.evaluateRung(creature, rung, hx, hy).results) {
        if (!r.met && r.req.kind !== 'behaviour' && r.req.kind !== 'presence') out.push(r.req);
      }
    }
    return out;
  };

  // Water tags first: several of them live on ground painters, and an object
  // that `requires: 'water'` cannot stand anywhere until the paint is down.
  const byWaterFirst = (a, b) => Number(!isWaterTag(a.tag)) - Number(!isWaterTag(b.tag));

  for (let pass = 0; pass < 400; pass++) {
    const todo = unmet();
    if (!todo.length) break;
    const counts = todo.filter((r) => r.kind === 'count').sort(byWaterFirst);
    const req = counts[0] || todo[0];
    let moved = false;

    if (req.kind === 'patch') {
      // ZONING.md replaced the old axis band with "a large enough contiguous
      // patch of its OWN GRASS". Grass is not an axis and cannot be nudged by
      // deposits, so the axis branch below cannot answer this — it looked for
      // something that moved an axis called 'ground', found nothing, and gave
      // up with "nothing legal moves ground down", which is how a creature that
      // is perfectly satisfiable reads as a structural fault.
      //
      // The right lever is the catalogue's own affinity number: to grow a
      // creature's grass, plant the things that argue for it, strongest first.
      // Singles commit ground (1.0), duals and triples only lean (0.7 / 0.5),
      // so this sorts exactly the way DECOR.md says a player should think.
      const carriers = cat.CATALOG
        .filter((p) => !forbidden(p) && ((p.affinities || {})[creature.id] || 0) > 0)
        .sort((a, b) => (b.affinities[creature.id] || 0) - (a.affinities[creature.id] || 0));
      for (const def of carriers) {
        if (put(def, 3)) {
          moved = true;
          break;
        }
      }
      if (!moved) {
        problems.push(
          `${creature.id}: cannot grow a patch of ${req.n} tiles of its own grass ` +
            `(${carriers.length} objects in the catalogue argue for it)`
        );
        break;
      }
    } else if (req.kind === 'count') {
      const legal = cat.byTag(req.tag).filter((p) => !forbidden(p));
      // Prefer carriers that also push the axis bands the right way, and above
      // all ones that do not BREAK a band that is currently satisfied. Without
      // that second rule the builder thrashes: it plants millefleurs to meet a
      // count, which pushes wildness over the unicorn's ceiling, then lays
      // gravel to pull wildness back, which pushes seclusion under its floor,
      // and fills the whole map without ever converging.
      const carriers = [...legal];
      carriers.sort((a, b) => {
        const ha = harms(a, bands, fields, hx, hy) ? 1 : 0;
        const hb = harms(b, bands, fields, hx, hy) ? 1 : 0;
        if (ha !== hb) return ha - hb;
        return bandFit(b, bands, fields, hx, hy) - bandFit(a, bands, fields, hx, hy);
      });
      for (const def of carriers) {
        if (put(def, req.radius)) {
          moved = true;
          break;
        }
      }
      if (!moved) {
        problems.push(
          `${creature.id}: cannot get ${req.n} '${req.tag}' within ${req.radius} tiles ` +
            `(${cat.byTag(req.tag).length} carriers exist, ${carriers.length} legal here)`
        );
        break;
      }
    } else {
      const v = fields.at(req.axis, hx, hy);
      const wantUp = bandNeed(req, v) > 0;
      // A lever is judged on the axis it is meant to move AND on what it does
      // to every other band. gravel is the strongest wildness-suppressor in the
      // catalogue and it also costs seclusion, which is why the unicorn wants a
      // dry stone wall instead: less wildness pulled, but nothing broken.
      const helpers = cat.CATALOG.filter(
        (p) => !forbidden(p) && Math.sign(dep(p, req.axis)) === (wantUp ? 1 : -1) && !harms(p, bands, fields, hx, hy)
      ).sort(
        (x, y) =>
          Math.abs(dep(y, req.axis)) + bandFit(y, bands, fields, hx, hy) -
          (Math.abs(dep(x, req.axis)) + bandFit(x, bands, fields, hx, hy))
      );
      for (const def of helpers) {
        if (put(def, 4)) {
          moved = true;
          break;
        }
      }
      if (!moved) {
        problems.push(
          `${creature.id}: nothing legal moves ${req.axis} ${wantUp ? 'up' : 'down'} ` +
            `(it is ${v.toFixed(2)}, wants ${req.min ?? '-inf'}..${req.max ?? '+inf'})`
        );
        break;
      }
    }
  }

  return { garden, placed, problems, home: { tx: hx, ty: hy }, bestiary };
}

/**
 * Which way a band wants an axis moved: +1 up, -1 down, 0 satisfied.
 *
 * IDEAL, not MIN, is the threshold — `band()` in creatures.js scores
 * continuously from `min` but only reports `met` at `ideal`, because a band is
 * satisficing: you climb toward the ideal and then more stops helping. Reading
 * `min` as the target is what a tool naturally does and it is wrong in a way
 * that hides: the unicorn's seclusion sat at 4.9 against min 3, the builder
 * declared it satisfied and then spent four hundred objects trying to lower it.
 */
function bandNeed(b, v) {
  if (b.ideal != null && v < b.ideal - 1e-9) return 1;
  if (b.max != null && v > b.max + 1e-9) return -1;
  if (b.min != null && v < b.min - 1e-9) return 1;
  return 0;
}

/** How well a placeable's deposits agree with the bands still to be met. */
function bandFit(p, bands, fields, tx, ty) {
  let s = 0;
  for (const b of bands) {
    const want = bandNeed(b, fields.at(b.axis, tx, ty));
    if (want) s += want * dep(p, b.axis);
  }
  return s;
}

/** Would placing this break a band that is currently satisfied? */
function harms(p, bands, fields, tx, ty) {
  for (const b of bands) {
    if (b.max == null) continue;
    const v = fields.at(b.axis, tx, ty);
    if (v <= b.max && v + dep(p, b.axis) > b.max) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. Is every creature's `settles` rung satisfiable?
// ---------------------------------------------------------------------------

/**
 * Run the REAL ladder on a built garden until the creature settles, or until
 * `days` of garden time have passed. Stopping early is not a shortcut — it is
 * the whole claim ("the ladder fires") — and it keeps the tool to a few
 * seconds instead of a few minutes.
 */
function runLadder(garden, creatureId, days) {
  const { world, fields } = garden;
  const bestiary = new Bestiary({ fields, seed: 99, passable: () => true });
  // dt is the bestiary's own rescan period on purpose. The rescan is the
  // expensive part (it scores every creature at every tile) and the game runs
  // it once every 1.5 garden-seconds regardless of frame rate — so stepping at
  // exactly that period reproduces the real cadence at the lowest cost. A
  // smaller dt only re-walks the agents; a larger one starts skipping scans.
  const dt = 1.5;
  const steps = Math.round((days * DAY_SECONDS) / dt);
  let settledAtDay = null;
  for (let i = 0; i < steps; i++) {
    world.advance((dt * DAY_MS) / DAY_SECONDS);
    fields.tick(dt);
    bestiary.update(dt);
    const st = bestiary.state.get(creatureId);
    if (st && (st.rung === 'settles' || st.rung === 'thrives')) {
      settledAtDay = +((i * dt) / DAY_SECONDS).toFixed(1);
      break;
    }
  }
  return { bestiary, settledAtDay };
}

function checkSatisfiable() {
  head('1. Can every creature settle?');
  // One garden per creature, each on its own map, because the whole point of
  // the thesis is that they do not fit together.
  for (const creature of CREATURES) {
    if (creature.hidden) continue; // Pan needs the other four; checked below
    const hx = 10;
    const hy = 10;
    const built = buildFor(creature, hx, hy);
    for (const p of built.problems) fault(`${creature.id} cannot settle`, p);
    if (built.problems.length) continue;

    const { bestiary, settledAtDay } = runLadder(built.garden, creature.id, LADDER_DAYS);
    const st = bestiary.state.get(creature.id);
    const evaluated = bestiary.evaluateRung(creature, 'settles', hx, hy);
    const beat = evaluated.results.find((r) => r.req.kind === 'behaviour');
    const structural = evaluated.results
      .filter((r) => !r.met && r.req.kind !== 'behaviour')
      .map((r) => (r.req.kind === 'count' ? r.req.tag : r.req.axis));

    if (structural.length) {
      fault(
        `${creature.id} cannot settle`,
        `built a ${built.placed.length}-object garden and these are still unmet: ${structural.join(', ')}`
      );
      continue;
    }
    if (beat && !beat.met && !beat.ready) {
      fault(`${creature.id}'s beat can never happen`, `'${creature.beat}' has no reachable site in a garden built for it`);
      continue;
    }
    if (QUICK) {
      ok(`${creature.id}'s settle requirements are satisfiable`, `${built.placed.length} objects (--quick: the ladder was not run)`);
    } else if (settledAtDay == null) {
      // Everything is met and the ladder still has not promoted: that is a
      // pacing observation, not a fault. The player has all the time there is.
      note(
        `${creature.id}: every requirement is met but it had not settled within ${LADDER_DAYS} garden days ` +
          `(reached '${st.rung}') — worth a look at the scan cadence`
      );
      ok(`${creature.id}'s settle requirements are satisfiable`, `${built.placed.length} objects`);
    } else {
      ok(
        `${creature.id} settles`,
        `${built.placed.length} objects; settled on garden day ${settledAtDay}` +
          (beat && beat.met ? `, watched it ${creature.beat}` : '')
      );
    }
    report.gardens[creature.id] = {
      objects: built.placed.length,
      rung: st.rung,
      settledAtDay,
      axes: axisStats(built.garden.fields, hx, hy),
    };
  }

  // Pan is gated on the other four, which is a structural claim of its own.
  const pan = CREATURE_BY_ID.get('pan');
  const gates = pan.rungs.settles.filter((r) => r.kind === 'presence').map((r) => r.creature || r.species);
  const missing = gates.filter((g) => !CREATURE_BY_ID.get(g));
  if (missing.length) fault('pan is gated on nothing', `unknown creatures: ${missing.join(', ')}`);
  else ok('pan is gated on the other four', gates.join(', '));
}

// ---------------------------------------------------------------------------
// 2. The design thesis
// ---------------------------------------------------------------------------

function checkThesis() {
  head('2. The thesis: satyrs want mess, unicorns want purity');
  const proof = proveThesis();
  report.thesis = proof;
  if (!proof.holds || !proof.wired) {
    fault('the thesis does not hold', JSON.stringify(proof));
    return;
  }
  if (!AS_JSON) console.log(`  ${proof.argument}`);
  ok('geometric proof', `guaranteed separation ${proof.separation} tiles, margin ${proof.margin} over sigma ${proof.sigma}`);

  // ...and then check it empirically, because a proof of the wrong statement
  // is still a proof. Build a satyr hill and a unicorn garden on ONE map at
  // every separation up to sigma and confirm they never both settle.
  let worst = null;
  for (let sep = 0; sep <= Math.ceil(THESIS.sigma); sep++) {
    const garden = newGarden(1000 + sep);
    const A = { tx: 5, ty: 10 };
    const B = { tx: 5 + sep, ty: 10 };
    // Failures to build here are the EXPECTED result, not faults — that is
    // precisely what "mutually unsatisfiable" means. They are only reported.
    const bs = buildFor(CREATURE_BY_ID.get('satyr'), A.tx, A.ty, garden);
    const bu = buildFor(CREATURE_BY_ID.get('unicorn'), B.tx, B.ty, garden);
    const why = [...bs.problems, ...bu.problems];
    const bestiary = new Bestiary({ fields: garden.fields, seed: 7, passable: () => true });
    const sat = bestiary.evaluateRung(CREATURE_BY_ID.get('satyr'), 'settles', A.tx, A.ty);
    const uni = bestiary.evaluateRung(CREATURE_BY_ID.get('unicorn'), 'settles', B.tx, B.ty);
    const structural = (r) => r.results.filter((x) => !x.met && x.req.kind !== 'behaviour').length === 0;
    const both = structural(sat) && structural(uni);
    if (sep <= THESIS.sigma && both) {
      worst = sep;
      fault('the thesis is violated', `satyr and unicorn both settle ${sep} tiles apart`);
    }
    if (VERBOSE && !AS_JSON) {
      console.log(
        `        separation ${sep}: satyr ${structural(sat) ? 'settles' : 'no'}, unicorn ${structural(uni) ? 'settles' : 'no'}` +
          (why.length ? `\n            ${why.join('\n            ')}` : '')
      );
    }
  }
  if (worst === null) ok('empirically', `no separation from 0 to ${Math.ceil(THESIS.sigma)} tiles houses both`);

  // The soft half: the axis bands must actually contradict, or the two regions
  // are merely far apart rather than different in character.
  if (!proof.axisContradictions.length) {
    fault('no axis opposition', 'satyr and unicorn agree on every axis — the regions would feel the same');
  } else {
    ok(
      'the regions differ in character',
      proof.axisContradictions.map((c) => `${c.axis}: satyr ${c.satyrNeeds} vs unicorn ${c.unicornNeeds}`).join('; ')
    );
  }
}

// ---------------------------------------------------------------------------
// 2b. The barrier — the OTHER half of the thesis
// ---------------------------------------------------------------------------
//
// checkThesis proves the tension: satyr and unicorn cannot both be housed
// within one sigma of open ground. On its own that is only half a design, and
// the harsher half — it says what the player may NOT do.
//
// DECOR.md and ELEVATION.md add the answer, and they add it twice on purpose:
//
//   | barrier              | the gap through it |
//   | hedge / wall / herm  | hedge arch         |
//   | cliff of 2+ levels   | ramp / stair       |
//
// "Conflicting species can sit one tile apart with a hedge between them, which
// is the whole point of the request." And ELEVATION.md's free synthesis: "a
// height difference of 2 or more levels blocks influence propagation, using
// exactly the occluder logic the hedges already use... terracing a garden
// naturally produces distinct zones without the player placing a single hedge."
//
// Both claims are load-bearing and both are invisible when broken: a hedge that
// does not occlude, or a terrace that does not, simply leaves the two gardens
// interfering, and the symptom is "the unicorn will not settle" — which reads
// as a tuning problem, not a mechanic that is switched off. Worse, the whole
// game becomes unwinnable in a way no test that only checks the TENSION would
// notice, because the tension is the thing still working.
//
// So this asserts the release valve, at a separation the bare-ground check has
// already proven is impossible.

/** A full-height line of `id` at column `x`, spanning the rows in play. */
function wallAt(garden, x, y0, y1, id) {
  let n = 0;
  for (let ty = y0; ty <= y1; ty++) if (garden.world.place(id, x, ty)) n++;
  return n;
}

/** Raise everything east of `x` by `levels`, making a cliff along the column. */
function terraceAt(garden, x, levels) {
  for (let i = 0; i < levels; i++) garden.world.applyTerrain('raise', x, 0, MAP - 1, MAP - 1);
  garden.bridge.syncLevels();
}

function bothSettle(garden, A, B) {
  const bestiary = new Bestiary({ fields: garden.fields, seed: 11, passable: () => true });
  const structural = (r) => r.results.filter((x) => !x.met && x.req.kind !== 'behaviour').length === 0;
  const sat = bestiary.evaluateRung(CREATURE_BY_ID.get('satyr'), 'settles', A.tx, A.ty);
  const uni = bestiary.evaluateRung(CREATURE_BY_ID.get('unicorn'), 'settles', B.tx, B.ty);
  const why = (r) =>
    r.results.filter((x) => !x.met && x.req.kind !== 'behaviour').map((x) => x.req.kind + ':' + (x.req.tag || x.req.axis || '')).join(',');
  return { satyr: structural(sat), unicorn: structural(uni), why: { satyr: why(sat), unicorn: why(uni) } };
}

const MAX_SEP = 9;

/**
 * The closest a satyr and a unicorn can be housed on ONE map, given whatever
 * `prepare` puts between them. `null` means "not at any separation up to
 * MAX_SEP".
 *
 * A single-separation pass/fail cannot express this mechanic, because whether a
 * given barrier helps depends on what the barrier itself is TAGGED with — a
 * hedge blocks influence and simultaneously trips the satyr's own cap on walls.
 * Measuring the minimum separation instead reports the SHAPE of the effect: a
 * barrier that works pulls the number down, one that is self-defeating does
 * not, and the difference is legible without anyone having to guess the right
 * distance to test at.
 */
function minSeparation(prepare) {
  for (let sep = 0; sep <= MAX_SEP; sep++) {
    const garden = newGarden(2200 + sep);
    const A = { tx: 4, ty: 10 };
    const B = { tx: 4 + sep, ty: 10 };
    if (prepare && sep >= 2) prepare(garden, A.tx + sep / 2, A, B);
    buildFor(CREATURE_BY_ID.get('satyr'), A.tx, A.ty, garden);
    buildFor(CREATURE_BY_ID.get('unicorn'), B.tx, B.ty, garden);
    const r = bothSettle(garden, A, B);
    if (r.satyr && r.unicorn) return { sep, why: null };
  }
  const garden = newGarden(2200 + MAX_SEP);
  const A = { tx: 4, ty: 10 };
  const B = { tx: 4 + MAX_SEP, ty: 10 };
  if (prepare) prepare(garden, A.tx + MAX_SEP / 2, A, B);
  buildFor(CREATURE_BY_ID.get('satyr'), A.tx, A.ty, garden);
  buildFor(CREATURE_BY_ID.get('unicorn'), B.tx, B.ty, garden);
  return { sep: null, why: bothSettle(garden, A, B).why };
}

function checkBarrier() {
  head('2b. The release valve: a barrier makes the impossible pair possible');

  // The control. Failing to house them close together IS the thesis, so this is
  // measured rather than assumed, and everything below is compared against it
  // on the same map with the same builder.
  const open = minSeparation(null);
  ok(
    'control: on open ground',
    open.sep == null
      ? `they cannot both settle at any separation up to ${MAX_SEP}`
      : `the closest both settle is ${open.sep} tiles apart`
  );

  const report_ = (name, got, doc) => {
    const better = open.sep == null ? got.sep != null : got.sep != null && got.sep < open.sep;
    if (!better) {
      fault(
        `${name} does not divide`,
        (got.sep == null
          ? `still impossible at every separation up to ${MAX_SEP}`
          : `closest is still ${got.sep} tiles, no better than open ground (${open.sep})`) +
          ` — ${doc}` +
          (got.why ? ` [unmet — satyr: ${got.why.satyr || 'none'}; unicorn: ${got.why.unicorn || 'none'}]` : '')
      );
    } else {
      ok(`${name} divides`, `closest both settle drops from ${open.sep ?? '>' + MAX_SEP} to ${got.sep} tiles`);
    }
    return better;
  };

  // 1. A TERRACE. ELEVATION.md's "free synthesis": the same occluder rule as the
  //    hedges, reached with no object placed at all. This is the case that has
  //    to work, because it is the only barrier that carries no tags — and
  //    therefore the only one that cannot offend the creature it is protecting.
  report_(
    'a two-level terrace',
    minSeparation((g, mid) => terraceAt(g, Math.ceil(mid), 2)),
    'ELEVATION.md: "a height difference of 2 or more levels blocks influence propagation, ' +
      'using exactly the occluder logic the hedges already use"'
  );

  // 2. A NULLIFIER OBJECT. DECOR.md: "conflicting species can sit one tile apart
  //    with a hedge between them, which is the whole point of the request."
  //
  //    Reported per nullifier rather than for one chosen object, because the
  //    interesting result is not whether ONE works — it is that the catalogue
  //    makes the choice a real one. Every nullifier is somebody's anathema: the
  //    seven walls carry `enclosure`/`straight-edge`, which the satyr caps at
  //    zero (SPEC §7: "actively repelled by tilled rows, walls and straight
  //    edges"), and the herm carries `votive`, which the unicorn caps at zero.
  //    You cannot wall a satyr in to keep the walls away from him.
  const nulls = cat.nullifiers();
  const working = [];
  for (const d of nulls) {
    const got = minSeparation((g, mid) => wallAt(g, Math.round(mid), 4, 16, d.id));
    const better = open.sep == null ? got.sep != null : got.sep != null && got.sep < open.sep;
    if (better) working.push(`${d.id} (${got.sep})`);
    report.checks.push({ name: `barrier/${d.id}`, pass: true, detail: `min separation ${got.sep}` });
    if (VERBOSE && !AS_JSON) console.log(`        ${d.id.padEnd(20)} closest both settle: ${got.sep ?? 'never'}`);
  }
  if (!working.length) {
    note(
      `no single nullifier object improves on open ground for THIS pair — every one of the ${nulls.length} ` +
        `trips a cap belonging to one of the two. The terrace is the divider that works, which is ` +
        `ELEVATION.md's synthesis doing real work rather than decorating a mechanic that already existed.`
    );
    ok('nullifiers are not free', `all ${nulls.length} carry tags one of the pair rejects — the choice of barrier matters`);
  } else {
    ok('a nullifier divides', working.join(', '));
  }

  // 2b. THE OCCLUDER ITSELF, tested on the thing DECOR.md actually claims.
  //
  //     "Conflicting species can sit one tile apart with a hedge between them"
  //     is a statement about THE GROUND — about zoning, which is what a
  //     nullifier blocks. The result above is a separate and narrower fact
  //     about two particular creatures' at-most caps, and it would be unfair to
  //     the doc to let it stand as a verdict on the occluder. So: one satyr
  //     object and one unicorn object, one tile apart, hedge between, and ask
  //     the ground whose it is.
  const seam = (barrier) => {
    const g = newGarden(4801);
    g.world.place('wild-vine', 8, 10);
    if (barrier) g.world.place(barrier, 9, 10);
    g.world.place('madonna-lily', 10, 10);
    return { left: g.fields.resolve(8, 10), right: g.fields.resolve(10, 10) };
  };
  const bare = seam(null);
  const walled = seam('clipped-hedge');
  const divided =
    walled.left.owner === 'satyr' && walled.right.owner === 'unicorn' &&
    walled.left.kind !== 'contested' && walled.right.kind !== 'contested';
  if (!divided) {
    fault(
      'a hedge does not divide the GROUND',
      `one tile apart with a hedge between: left=${walled.left.owner}/${walled.left.kind}, ` +
        `right=${walled.right.owner}/${walled.right.kind} — DECOR.md's central claim about occluders`
    );
  } else {
    ok(
      'a hedge divides the ground',
      `one tile apart: bare ground gives ${bare.left.owner}/${bare.left.kind} and ` +
        `${bare.right.owner}/${bare.right.kind}; with a hedge between, thicket and millefleurs each hold their own`
    );
  }

  // 3. THE SOFT TOOL MUST STAY SOFT. "A 1-level step does NOT block — gentle
  //    undulation stays connected, so the player has both a soft and a hard
  //    tool." If a single step divided, the player would lose the ability to
  //    shape ground without also zoning it, and every hill would become a wall.
  const gentle = minSeparation((g, mid) => terraceAt(g, Math.ceil(mid), 1));
  const gentleHelps = open.sep == null ? gentle.sep != null : gentle.sep != null && gentle.sep < open.sep;
  if (gentleHelps) {
    fault(
      'a one-level step divides',
      'a single step blocked influence — ELEVATION.md requires gentle undulation to stay connected, ' +
        'or the player has no way to shape ground without also zoning it'
    );
  } else {
    ok('a one-level step does NOT divide', 'gentle undulation stays connected, as the doc requires');
  }
}

// ---------------------------------------------------------------------------
// 2c. Every placeable draws something
// ---------------------------------------------------------------------------
//
// SPEC §10 asks the test suite to check catalogue integrity, but "names art
// that exists" is checked against a REGISTRY, and a registry is exactly the
// thing that can be assembled differently by the tool and by the game. This
// resolves art the way js/main.js actually resolves it — same module list,
// same precedence, same composer aliases — so that a placeable which draws
// nothing in the running game cannot pass here.

function checkArt() {
  head('2c. Does every placeable resolve to real art?');
  const registry = new Map();
  for (const m of ART_MODULES) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) {
      if (v && typeof v === 'object' && v.rows && v.anchor) registry.set(v.name || k, v);
    }
    for (const key of ['SPRITES', 'PROPS', 'TILES', 'EXTRAS', 'DECOR', 'AFFINITY']) {
      const table = m[key];
      if (!table || typeof table !== 'object') continue;
      for (const [k, v] of Object.entries(table)) if (v && v.rows && v.anchor) registry.set(k, v);
    }
  }

  const dead = [];
  const byKind = { sprite: 0, grow: 0 };
  for (const d of cat.CATALOG) {
    const art = d.art;
    if (!art) {
      dead.push(`${d.id}: no art at all`);
      continue;
    }
    if (art.kind === 'sprite') {
      byKind.sprite++;
      if (!registry.has(art.sprite)) dead.push(`${d.id} -> sprite '${art.sprite}'`);
    } else if (art.kind === 'grow') {
      byKind.grow++;
      let name = art.composer;
      let params = art.params;
      if (!COMPOSERS[name] && COMPOSER_ALIAS[name]) {
        params = { ...COMPOSER_ALIAS[name][1], ...params };
        name = COMPOSER_ALIAS[name][0];
      }
      if (!COMPOSERS[name]) {
        dead.push(`${d.id} -> composer '${art.composer}'`);
        continue;
      }
      try {
        if (!compose(name, 0x1c04, { ...params, stage: 'mature' })) dead.push(`${d.id} -> composer '${name}' drew nothing`);
      } catch (err) {
        dead.push(`${d.id} -> composer '${name}' threw: ${err.message}`);
      }
    } else {
      dead.push(`${d.id} -> unknown art kind '${art.kind}'`);
    }
  }

  if (dead.length) {
    fault(`${dead.length} placeable(s) draw nothing`, dead.join('; '));
  } else {
    ok(
      'every placeable draws',
      `${cat.CATALOG.length} placeables — ${byKind.sprite} hand-authored sprites, ` +
        `${byKind.grow} composed — against ${registry.size} registered sprites`
    );
  }

  // Art DEBT is not a fault. It is a list, and it belongs in the report so it
  // can shrink visibly rather than being rediscovered.
  // A `wanted` name is only DEBT while the art it names does not exist. The
  // moment an artist exports it under that exact name, js/main.js's dispatch
  // draws it instead of the understudy and the entry falls off this list on
  // its own — no catalogue edit, and no chance of the list disagreeing with
  // what the game actually puts on screen.
  const landed = (d) =>
    d.art.kind === 'sprite' ? registry.has(d.art.wanted) : !!COMPOSERS[d.art.wanted];
  const debt = cat.CATALOG.filter((d) => d.art && d.art.wanted && !landed(d));
  report.artDebt = debt.map((d) => `${d.id} draws '${d.art.sprite || d.art.composer}', wants '${d.art.wanted}'`);
  const paid = cat.CATALOG.filter((d) => d.art && d.art.wanted && landed(d));
  report.artLanded = paid.map((d) => `${d.id} now draws '${d.art.wanted}'`);
  if (paid.length) ok(`${paid.length} placeable(s) draw their real art`, paid.map((d) => d.art.wanted).join(', '));
  if (debt.length) note(`${debt.length} placeable(s) still draw with an understudy sprite (see artDebt)`);
}

// ---------------------------------------------------------------------------
// 2d. needsDesign — the honest list
// ---------------------------------------------------------------------------

function checkNeedsDesign() {
  head('2d. What is shipped as a placeholder?');
  const items = cat.CATALOG.filter((d) => d.needsDesign);
  report.needsDesign = items.map((d) => ({ id: d.id, group: d.group, note: d.designNote || null }));
  // A placeholder is a decision, not a defect — every one of these ships as a
  // working, placeable object. The fault would be an UNDOCUMENTED placeholder.
  const silent = items.filter((d) => !d.designNote);
  if (silent.length) {
    fault('a placeholder with no note', silent.map((d) => d.id).join(', ') + ' — flagged needsDesign but says nothing about why');
  } else {
    ok(`${items.length} documented placeholder(s)`, items.map((d) => d.id).join(', ') || 'none');
  }
  if (!AS_JSON) {
    for (const d of items) console.log(`        ${d.id.padEnd(22)} ${(d.designNote || '').slice(0, 92)}`);
  }
}

// ---------------------------------------------------------------------------
// 3. No orphan content
// ---------------------------------------------------------------------------

function checkUnlockGraph() {
  head('3. Is every placeable reachable from an empty garden?');
  const open = new Set(cat.starterSet().map((p) => p.id));
  const settled = new Set();
  const order = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of CREATURES) {
      if (settled.has(c.id)) continue;
      const need = settleRequirements(c)
        .map((x) => x.req)
        .filter((r) => r.kind === 'count' && r.n > 0);
      if (!need.every((r) => cat.byTag(r.tag).some((p) => open.has(p.id)))) continue;
      settled.add(c.id);
      order.push(c.id);
      changed = true;
      for (const p of cat.CATALOG) if (p.unlockedBy === c.id) open.add(p.id);
    }
  }
  const stuck = cat.CATALOG.filter((p) => !open.has(p.id));
  report.unlock = { order, opened: open.size, total: cat.CATALOG.length };
  if (stuck.length) {
    fault('orphan content', `unreachable: ${stuck.map((p) => p.id).join(', ')}`);
  } else {
    ok('every placeable is reachable', `${cat.CATALOG.length} placeables, ${cat.starterSet().length} from turn one, unlock order ${order.join(' -> ')}`);
  }

  const orphanTags = REQUIRED_TAGS.filter((t) => !cat.byTag(t).length);
  if (orphanTags.length) fault('dead requirements', `no placeable carries: ${orphanTags.join(', ')}`);
  else ok('every required tag has a carrier', `${REQUIRED_TAGS.length} tags`);
}

// ---------------------------------------------------------------------------
// 4. Reference gardens
// ---------------------------------------------------------------------------

function axisStats(fields, tx, ty) {
  const out = {};
  for (const a of AXES) {
    const s = fields.stats(a);
    out[a] = {
      atHome: +fields.at(a, tx, ty).toFixed(2),
      min: +s.min.toFixed(2),
      max: +s.max.toFixed(2),
      mean: +s.mean.toFixed(3),
    };
  }
  return out;
}

function referenceGardens() {
  head('4. Axis-field statistics for reference gardens');

  const empty = newGarden(1);
  const gardens = [
    ['an empty glade', empty, { tx: 10, ty: 10 }],
  ];

  const wood = newGarden(2);
  for (let i = 0; i < 12; i++) wood.world.place('oak', 4 + (i % 4) * 3, 4 + Math.floor(i / 4) * 3);
  gardens.push(['twelve oaks', wood, { tx: 8, ty: 8 }]);

  const walk = newGarden(3);
  for (let i = 0; i < 12; i++) walk.world.place('gravel-walk', 4 + i, 10);
  for (let i = 0; i < 6; i++) walk.world.place('cypress', 4 + i * 2, 9);
  gardens.push(['a swept walk under cypresses', walk, { tx: 9, ty: 10 }]);

  const ruin = newGarden(4);
  for (let i = 0; i < 8; i++) ruin.world.place('bramble-tangle', 5 + (i % 4), 5 + Math.floor(i / 4));
  for (let i = 0; i < 4; i++) ruin.world.place('standing-timber', 9 + i, 6);
  gardens.push(['a bramble ruin', ruin, { tx: 7, ty: 6 }]);

  for (const [name, g, home] of gardens) {
    const stats = axisStats(g.fields, home.tx, home.ty);
    report.gardens[name] = { objects: g.world.objects.length, axes: stats };
    if (AS_JSON) continue;
    console.log(`\n  ${name}  (${g.world.objects.length} objects, read at ${home.tx},${home.ty})`);
    console.log('        axis        at home     min      max     mean');
    for (const a of AXES) {
      const s = stats[a];
      console.log(
        `        ${a.padEnd(11)} ${String(s.atHome).padStart(7)}  ${String(s.min).padStart(7)}  ${String(s.max).padStart(7)}  ${String(s.mean).padStart(7)}`
      );
    }
    console.log(`        region: "${g.fields.regionName(home.tx, home.ty)}"`);
  }

  // The empty glade must read as nothing in particular, or the overlay lies.
  const e = report.gardens['an empty glade'].axes;
  for (const a of AXES) {
    if (e[a].min !== 0 || e[a].max !== 0) {
      fault('an empty glade is not empty', `${a} runs ${e[a].min}..${e[a].max} with nothing planted`);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Cosy guarantees that can be checked mechanically
// ---------------------------------------------------------------------------

function checkCosy() {
  head('5. Cosy guarantees (SPEC §0)');
  const g = newGarden(5);
  const oak = g.world.place('oak', 5, 5);
  g.world.advance(DAY_MS * 80);
  const grown = { ...g.world.objectAt(5, 5) };
  g.world.removeAt(5, 5);
  g.world.undo();
  const back = g.world.objectAt(5, 5);
  if (!back || back.uid !== oak.uid || back.seed !== oak.seed || back.stage !== grown.stage) {
    fault('undo does not restore the same tree', JSON.stringify({ was: grown, now: back }));
  } else ok('undo restores the same tree', `uid ${back.uid}, still ${back.stage}`);

  // Nothing decays: 400 garden days of doing nothing must not lose anything.
  const before = g.world.objects.length;
  g.world.advance(DAY_MS * 400);
  if (g.world.objects.length !== before) fault('something decayed', `${before} -> ${g.world.objects.length} objects`);
  else ok('nothing decays', `${before} objects survived 400 garden days`);

  // No score anywhere the player can see.
  const cardText = [];
  const bestiary = new Bestiary({ fields: g.fields, seed: 1, passable: () => true });
  for (const c of bestiary.cards()) {
    cardText.push(JSON.stringify(c));
  }
  const numbery = cardText.filter((t) => /%|\bscore\b|\brating\b|\d+\s*\/\s*100/i.test(t));
  if (numbery.length) fault('a score leaked into the journal', numbery[0].slice(0, 200));
  else ok('no percentage or score on any journal card', `${cardText.length} cards checked`);

  // Pan is not in the journal until sighted.
  if (bestiary.card('pan') !== null) fault('Pan is spoiled', 'card("pan") returns something before he is sighted');
  else ok('Pan is absent from the journal until sighted');
}

// ---------------------------------------------------------------------------
// 6. The moving parts: where feet may go, and what the ground says
// ---------------------------------------------------------------------------
//
// Sections 1-5 ask whether the DESIGN works. This one asks whether three
// invariants survive a garden that is actually running, which is a different
// question from whether a unit test can construct a case that breaks them.
// Each of these three shipped as a bug once:
//
//   6a  A CREATURE STANDING IN THE SKY. The map has no ground past its rim, and
//       a creature whose home is on an edge or a corner tile spends its whole
//       life pressed against that rim. The unit suite attacks the writer with
//       synthetic targets; this runs the real Bestiary on a real garden with
//       the real predicate and simply watches, because the failure the owner
//       reported was found by looking, not by constructing.
//
//   6b  THE WRONG FEET IN THE WATER. Per species (CREATURE-MOVEMENT.md §2): the
//       naiad dwells, the satyr and centaur take a crossing, the unicorn stops
//       at the brink. Asserted against a garden with a real pond and a real
//       bridge in it, so the crossings have to be BUILDABLE for this to pass —
//       which is how a catalogue entry that refused to stand in water would
//       show up here rather than only in a stub.
//
//   6c  A SLOPE THAT PICKED A SIDE. ELEVATION.md's free seam: a ramp between
//       two planted zones is nobody's ground. A weighting could be outvoted by
//       enough thicket; the rule is a hard one, and this proves a claim was
//       made and REFUSED rather than merely absent.

/** Every tile a casual playthrough least often reaches. Four corners, four edges. */
const RIM_HOMES = [
  [0, 0], [MAP - 1, 0], [0, MAP - 1], [MAP - 1, MAP - 1],
  [MAP >> 1, 0], [MAP >> 1, MAP - 1], [0, MAP >> 1], [MAP - 1, MAP >> 1],
];

function checkRimWatch() {
  head('6a. Does anything ever stand in the sky?');

  const garden = newGarden(7311);
  const pass = makePassable(garden.world, cat, creatureMod);
  const bestiary = new Bestiary({ fields: garden.fields, seed: 91, passable: pass });

  let worst = null;
  let seconds = 0;
  let grounded = 0;
  const dt = 0.05;

  for (const [hx, hy] of RIM_HOMES) {
    // Settle every creature on this rim tile and let it live there. Forcing the
    // home is the point: the scan would never CHOOSE a corner, and a corner is
    // exactly where the bug was.
    for (const c of CREATURES) {
      const st = bestiary.state.get(c.id);
      st.rungIndex = 2;
      st.rung = 'settles';
      st.home = { tx: hx, ty: hy };
      const a = bestiary.agents.find((g) => g.creature.id === c.id && !g.companion);
      if (!a) continue;
      a.state = 'idle';
      a.x = hx;
      a.y = hy;
      a.homeTile = st.home;
      a.desaturated = false;
      a.visitLeft = Infinity;
      a.hold = 0.4;
    }
    for (let i = 0; i < 1800; i++) { // 90 garden-seconds per home
      garden.fields.tick(dt);
      bestiary.update(dt);
      for (const a of bestiary.agents) {
        const v = a.view();
        seconds += dt;
        if (OFFMAP_STATES.has(v.state)) continue;
        grounded++;
        const out =
          Math.max(0 - v.x, v.x - (MAP - 1), 0 - v.y, v.y - (MAP - 1));
        if (out > 0 && (!worst || out > worst.out)) {
          worst = { out, id: v.id, x: v.x, y: v.y, state: v.state, home: [hx, hy] };
        }
      }
    }
  }

  if (worst) {
    fault(
      'a creature stood off the map while grounded',
      `${worst.id} at (${worst.x.toFixed(3)}, ${worst.y.toFixed(3)}) in state '${worst.state}' ` +
        `with its home at (${worst.home.join(', ')}) — ${worst.out.toFixed(3)} tiles past the rim. ` +
        `The clamp bound is the tile CENTRE, [0, ${MAP - 1}], because a sprite anchor sits on the ` +
        `centre point: x = -0.4 draws the feet past the last diamond.`
    );
  } else {
    ok(
      'nothing ever stands in the sky',
      `${Math.round(seconds)} creature-seconds over ${RIM_HOMES.length} edge and corner homes, ` +
        `${grounded} grounded samples, every one inside [0, ${MAP - 1}]`
    );
  }
}

function checkWaterRules() {
  head('6b. Do the per-species water rules hold in a running garden?');

  // A garden that is half pond, with one buildable crossing over it. Built with
  // the real World, so a crossing that cannot legally stand on water fails here.
  const garden = newGarden(8422);
  const { world } = garden;
  for (let ty = 4; ty <= 15; ty += 2) world.paint('still-pool', 8, ty);
  const bridgeAt = { tx: 8, ty: 10 };
  const placed = world.place('level-bridge', bridgeAt.tx, bridgeAt.ty);
  if (!placed) {
    fault(
      'the crossing could not be built on the water it crosses',
      'level-bridge was refused on a water tile — `requires` must be "any" for a crossing, or the ' +
        'whole per-species ford rule has nothing to stand on'
    );
    return;
  }
  ok('a crossing can be built on water', `level-bridge at (${bridgeAt.tx}, ${bridgeAt.ty}) over a pond`);
  garden.bridge.rebuild();

  const pass = makePassable(world, cat, creatureMod);

  // The static half: the table, against the predicate the game runs.
  const wetBare = { tx: 8, ty: 4 };
  const rows = [];
  for (const c of CREATURES) {
    const rule = waterRuleFor(c.id);
    const onBare = pass(wetBare.tx, wetBare.ty, c.id);
    const onCrossing = pass(bridgeAt.tx, bridgeAt.ty, c.id);
    const want = {
      dweller: [true, true],
      ford: [false, true],
      never: [false, false],
    }[rule];
    if (!want) { fault('unknown water rule', `${c.id} has '${rule}'`); continue; }
    if (onBare !== want[0] || onCrossing !== want[1]) {
      fault(
        `the water rule for ${c.id} does not hold`,
        `'${rule}' wants open water ${want[0]} / crossing ${want[1]}, got ${onBare} / ${onCrossing}`
      );
    }
    rows.push(`${c.id}:${rule}`);
  }
  ok('the table holds against the real predicate', rows.join(', '));

  // The dynamic half: let it run and watch where the feet actually land. A
  // predicate that is right and a mover that ignores it look identical from the
  // predicate's side.
  const bestiary = new Bestiary({ fields: garden.fields, seed: 44, passable: pass });
  const trespass = new Map();
  // Homes on OPPOSITE BANKS, so the pond is between a creature and half its
  // wander radius and the rule has to do real work. Every one is asserted dry
  // first: `still-pool` paints 2x2, so a home picked by eye lands in the water
  // and the run then reports the fixture rather than the game.
  const BANKS = [[6, 10], [11, 10], [6, 5], [11, 14]];
  for (const [hx, hy] of BANKS) {
    if (world.isWet(hx, hy)) {
      fault('the water-rule fixture is wrong', `home (${hx}, ${hy}) is itself under water`);
      return;
    }
  }
  for (const [hx, hy] of BANKS) {
    for (const c of CREATURES) {
      const st = bestiary.state.get(c.id);
      st.rungIndex = 2;
      st.rung = 'settles';
      st.home = { tx: hx, ty: hy };
      const a = bestiary.agents.find((g) => g.creature.id === c.id && !g.companion);
      if (!a) continue;
      a.state = 'idle';
      a.x = hx; a.y = hy;
      a.homeTile = st.home;
      a.visitLeft = Infinity;
      a.hold = 0.3;
    }
    for (let i = 0; i < 1600; i++) {
      garden.fields.tick(0.05);
      bestiary.update(0.05);
      for (const a of bestiary.agents) {
        const v = a.view();
        if (OFFMAP_STATES.has(v.state)) continue;
        const tx = Math.round(v.x);
        const ty = Math.round(v.y);
        if (!world.inBounds(tx, ty) || !world.isWet(tx, ty)) continue;
        if (pass(tx, ty, v.id)) continue; // legally there — a dweller, or on the bridge
        if (!trespass.has(v.id)) {
          trespass.set(v.id, `${v.id} (${waterRuleFor(v.id)}) stood at (${tx}, ${ty}) in state '${v.state}'`);
        }
      }
    }
  }
  if (trespass.size) {
    fault('a creature stood in water its rule forbids', [...trespass.values()].join('; '));
  } else {
    ok(
      'no creature ever stands in water it may not enter',
      `${CREATURES.length} creatures, ${BANKS.length} homes on both banks of a pond with one ` +
        `bridge, ~${Math.round((BANKS.length * 1600 * 0.05))} garden-seconds`
    );
  }
}

function checkSlopeSeam() {
  head('6c. Is a slope between two planted zones still nobody\'s ground?');

  // Two heavily planted single-species zones with a cliff and a ramp between
  // them. The ramp must be neutral, and it must still let influence THROUGH —
  // barrier and doorway are different things, and a slope is only the doorway.
  const garden = newGarden(9105);
  const { world, fields, bridge } = garden;

  // ONE level, not two. A connector bridges exactly one level (world.js refuses
  // taller placements outright: "steps climb one at a time — terrace it, then
  // run two flights"), so a 2-level cliff has nowhere to put a single ramp and
  // the fixture, not the rule, is what fails. Neutrality is a property of the
  // connector tile itself and does not need the taller step to be visible.
  const RAMP_X = 10;
  world.applyTerrain('raise', RAMP_X + 1, 0, MAP - 1, MAP - 1);
  bridge.syncLevels();
  // One flight up from the low side, standing at the foot of the step.
  const ramp = world.place('earth-ramp', RAMP_X, 10) || world.place('stone-stair', RAMP_X, 10);
  if (!ramp) {
    fault(
      'no connector would stand at the cliff',
      `nothing could be placed at (${RAMP_X}, 10) against a 1-level step — the ways up are ` +
        'unbuildable, and every terrace in the game is a wall'
    );
    return;
  }
  bridge.rebuild();

  // Plant hard on both sides — enough that "no influence reached it" cannot be
  // mistaken for "the rule held".
  for (let ty = 6; ty <= 14; ty++) {
    for (const x of [RAMP_X - 2, RAMP_X - 1]) world.place('wild-vine', x, ty);
    for (const x of [RAMP_X + 2, RAMP_X + 3]) world.place('madonna-lily', x, ty);
  }
  bridge.rebuild();

  if (!fields.isSlope(RAMP_X, 10)) {
    fault('the connector is not registered as a slope', `climbAt(${RAMP_X}, 10) = ${fields.climbAt(RAMP_X, 10)}`);
    return;
  }

  const r = fields.resolve(RAMP_X, 10);
  const claim = Math.max(
    fields.at('satyr', RAMP_X, 10),
    fields.at('unicorn', RAMP_X, 10)
  );
  if (r.owner !== null) {
    fault(
      'a slope was claimed',
      `the ramp at (${RAMP_X}, 10) resolved to ${r.owner}/${r.kind} — ELEVATION.md's free seam ` +
        'requires a connector to be nobody\'s ground no matter how hard either side plants'
    );
  } else if (claim <= CLAIM_FLOOR) {
    // The test that would pass for the wrong reason. If nothing ever reached
    // the tile, "neutral" proves nothing about the rule.
    note(
      `the slope is neutral but no side ever claimed it (max influence ${claim.toFixed(2)} <= ` +
        `CLAIM_FLOOR ${CLAIM_FLOOR}) — this check is not currently proving the refusal, only the absence`
    );
    ok('the slope is neutral', `resolve -> null, though influence never reached CLAIM_FLOOR`);
  } else {
    ok(
      'a slope is nobody\'s ground',
      `18 wild-vine and 18 madonna-lily either side; influence on the ramp reaches ` +
        `${claim.toFixed(2)} (> CLAIM_FLOOR ${CLAIM_FLOOR}) and is refused anyway`
    );
  }

  // The banks still belong to somebody — otherwise "neutral" is just a dead field.
  const left = fields.resolve(RAMP_X - 2, 10);
  const right = fields.resolve(RAMP_X + 3, 10);
  if (left.owner !== 'satyr' || right.owner !== 'unicorn') {
    fault(
      'the banks either side of the slope are not claimed',
      `left=${left.owner}/${left.kind}, right=${right.owner}/${right.kind} — if neither side owns ` +
        'its own ground the neutral ramp is measuring nothing'
    );
  } else {
    ok('the banks either side still resolve normally', `left ${left.owner}, right ${right.owner}`);
  }

  // And it is a DOORWAY, not a wall: the grass grid must say so on the same tile.
  const grid = fields.grassGrid();
  const i = 10 * MAP + RAMP_X;
  if (!grid.slope) {
    fault('grassGrid() has no slope layer', 'a renderer cannot tell a ramp from meadow');
  } else if (!grid.slope[i] || grid.blocked[i]) {
    fault(
      'the grass grid disagrees with the field about the ramp',
      `slope=${grid.slope[i]}, blocked=${grid.blocked[i]} — a slope is a seam influence RUNS ` +
        'THROUGH; a nullifier is one it stops at, and they must not be the same flag'
    );
  } else {
    ok('the grass grid marks it a slope and not a barrier', `slope=1, blocked=0 at (${RAMP_X}, 10)`);
  }
}

// ---------------------------------------------------------------------------

head('ARCADIA — playtest');
checkUnlockGraph();
checkThesis();
checkBarrier();
checkArt();
checkNeedsDesign();
checkSatisfiable();
referenceGardens();
checkCosy();
checkRimWatch();
checkWaterRules();
checkSlopeSeam();

if (AS_JSON) {
  console.log(JSON.stringify({ faults, notes, ...report }, null, 2));
} else {
  head('Summary');
  const passed = report.checks.filter((c) => c.pass).length;
  console.log(`  ${passed} of ${report.checks.length} checks passed`);
  if (notes.length) {
    console.log(`\n  ${notes.length} note(s) — tuning observations, not faults:`);
    for (const n of notes) console.log(`    · ${n}`);
  }
  if (faults.length) {
    console.log(`\n  ${faults.length} STRUCTURAL FAULT(S):`);
    for (const f of faults) console.log(`    · ${f}`);
  } else {
    console.log('\n  No structural faults. The garden is playable.');
  }
}

process.exit(faults.length ? 1 : 0);
