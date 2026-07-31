// test/creatures.test.mjs — the ladder's shape and the journal's manners.
//
// tools/playtest.mjs asks whether the requirements can be MET. This asks
// whether they are well formed, and whether what the player is shown obeys
// SPEC §7's firm rule:
//
//     exact ticks for counts, qualitative words for axes,
//     never a summed number, never a percentage.
//
// That rule is the difference between a cosy game and an anxious one, and it
// is exactly the sort of thing a later "helpful" edit puts a progress bar on.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Bestiary, CREATURES, CREATURE_BY_ID, RUNGS, BEATS, FLOURISHES, THESIS, proveThesis,
  atLeast, atMost, band, presence, axisPhrase, DAY_SECONDS,
} from '../js/creatures.js';
import { Fields } from '../js/fields.js';
import { CATALOG } from '../js/catalog.js';

const newFields = () => new Fields({ w: 20, h: 20 });
const at = (tx, ty, deposits = {}, tags = []) => ({ tx, ty, footprint: [1, 1], deposits, tags });

test('five creatures, one of them hidden, in a stable order', () => {
  assert.equal(CREATURES.length, 5);
  assert.deepEqual(CREATURES.map((c) => c.id), ['satyr', 'centaur', 'naiad', 'unicorn', 'pan']);
  assert.equal(CREATURES.filter((c) => c.hidden).length, 1);
  assert.equal(CREATURE_BY_ID.get('pan').hidden, true);
});

test('four rungs, every creature on every one', () => {
  assert.deepEqual([...RUNGS], ['sighted', 'visits', 'settles', 'thrives']);
  for (const c of CREATURES) {
    for (const r of RUNGS) {
      assert.ok(Array.isArray(c.rungs[r]) && c.rungs[r].length, `${c.id} has nothing on '${r}'`);
    }
  }
});

test('exactly one behavioural requirement, on settles, and nowhere else', () => {
  // SPEC §7: settling is something the player WATCHES HAPPEN. One beat, on the
  // one rung, or it stops being an event and becomes a checklist item.
  for (const c of CREATURES) {
    for (const r of RUNGS) {
      const beats = c.rungs[r].filter((q) => q.kind === 'behaviour');
      assert.equal(beats.length, r === 'settles' ? 1 : 0, `${c.id}/${r} has ${beats.length} beats`);
    }
    const beat = c.rungs.settles.find((q) => q.kind === 'behaviour');
    assert.equal(beat.beat, c.beat);
    assert.ok(BEATS[c.beat], `${c.id} declares beat '${c.beat}' which does not exist`);
  }
  assert.equal(new Set(CREATURES.map((c) => c.beat)).size, 5, 'two creatures share a beat');
});

test('every requirement kind SPEC names is actually used', () => {
  const kinds = new Set(CREATURES.flatMap((c) => RUNGS.flatMap((r) => c.rungs[r].map((q) => q.kind))));
  for (const k of ['axis', 'count', 'presence', 'behaviour']) assert.ok(kinds.has(k), `no '${k}' requirement anywhere`);
});

test('requirement objects are well formed', () => {
  for (const c of CREATURES) {
    for (const r of RUNGS) {
      for (const q of c.rungs[r]) {
        assert.equal(typeof q.evaluate, 'function', `${c.id}/${r}: a requirement with no evaluate`);
        if (q.kind === 'count') {
          assert.ok(['at-least', 'at-most'].includes(q.dir), `${c.id}: count dir '${q.dir}'`);
          assert.ok(Number.isInteger(q.n) && q.n >= 0, `${c.id}: count n ${q.n}`);
          assert.ok(q.radius > 0 && q.radius <= 8, `${c.id}: radius ${q.radius}`);
          assert.ok(!/[|]/.test(q.tag), `${c.id}: '${q.tag}' looks like a display label, not a tag`);
        }
        if (q.kind === 'axis') {
          assert.ok(q.min != null || q.max != null || q.ideal != null, `${c.id}: an empty band on ${q.axis}`);
          if (q.min != null && q.max != null) assert.ok(q.min <= q.max, `${c.id}: ${q.axis} band is inverted`);
        }
      }
    }
  }
});

test('a band is satisficing — past the ideal, more is not better', () => {
  // RESEARCH §C3, "the tyranny of the optimal". If the score kept climbing
  // there would be one best garden and the player would be obliged to find it.
  const b = band('wildness', { min: 2, ideal: 6 });
  const score = (v) => b.evaluate({ field: () => v, count: () => 0 }).score;
  assert.equal(score(6), 1);
  assert.equal(score(60), 1, 'sixty is no better than six');
  assert.ok(score(4) > 0 && score(4) < 1, 'the middle of the band should be soft, not binary');
  assert.equal(score(0), 0);
  assert.equal(b.evaluate({ field: () => 6, count: () => 0 }).met, true);
  assert.equal(b.evaluate({ field: () => 5.9, count: () => 0 }).met, false);
});

test('atLeast and atMost count exactly, and report the tick', () => {
  const ctx = (n) => ({ count: () => n, field: () => 0 });
  const three = atLeast('ash', 3, 5);
  assert.deepEqual(
    [three.evaluate(ctx(0)).met, three.evaluate(ctx(2)).met, three.evaluate(ctx(3)).met],
    [false, false, true]
  );
  assert.equal(three.evaluate(ctx(2)).have, 2, 'the exact tick must be available — SPEC §7');
  const none = atMost('enclosure', 0, 6);
  assert.equal(none.evaluate(ctx(0)).met, true);
  assert.equal(none.evaluate(ctx(1)).met, false);
});

test('the thesis is wired to the requirements it claims', () => {
  const proof = proveThesis();
  assert.equal(proof.holds, true);
  assert.equal(proof.wired, true, 'proveThesis says the requirements no longer back the argument');
  // and the claim it makes is arithmetically true
  assert.ok(proof.requireRadius + proof.sigma < proof.forbidRadius, 'the triangle inequality does not close');
  const satyr = CREATURE_BY_ID.get('satyr').rungs.settles;
  const unicorn = CREATURE_BY_ID.get('unicorn').rungs.settles;
  const forbid = satyr.find((q) => q.kind === 'count' && q.tag === THESIS.tag && q.dir === 'at-most');
  const require_ = unicorn.find((q) => q.kind === 'count' && q.tag === THESIS.tag && q.dir === 'at-least');
  assert.ok(forbid, `the satyr no longer forbids '${THESIS.tag}'`);
  assert.ok(require_, `the unicorn no longer requires '${THESIS.tag}'`);
  assert.equal(forbid.n, 0);
  assert.ok(require_.n >= 1);
  assert.ok(CATALOG.some((p) => (p.tags || []).includes(THESIS.tag)), `nothing carries '${THESIS.tag}'`);
});

// ---------------------------------------------------------------------------
// What the player is shown
// ---------------------------------------------------------------------------

test('Pan is not in the journal until he is sighted', () => {
  const b = new Bestiary({ fields: newFields(), seed: 1, passable: () => true });
  assert.equal(b.card('pan'), null, 'card("pan") leaks the capstone surprise');
  assert.ok(!b.cards().some((c) => c.id === 'pan'), 'Pan is listed in the roster');
  assert.equal(b.cards().length, 4);
});

test('an unmet creature shows a silhouette and tells, never its requirement list', () => {
  const b = new Bestiary({ fields: newFields(), seed: 1, passable: () => true });
  for (const c of b.cards()) {
    assert.equal(c.revealed, false);
    assert.equal(typeof c.silhouette, 'string');
    assert.ok(c.silhouette.length > 0);
    assert.equal(c.requirements, undefined, `${c.id} shows its requirements before being sighted`);
    assert.deepEqual(c.tells, [], 'a tell you have not seen must not be listed');
  }
});

test('nothing the player can read is a score', () => {
  const fields = newFields();
  fields.add(at(10, 10, { wildness: 4, seclusion: 3 }, ['vine']));
  const b = new Bestiary({ fields, seed: 1, passable: () => true });
  for (let i = 0; i < 40; i++) b.update(1);
  const text = JSON.stringify(b.cards());
  assert.ok(!/%/.test(text), 'a percentage reached the journal');
  assert.ok(!/\bscore\b|\brating\b|\bpoints\b/i.test(text), 'a score reached the journal');
});

test('axisPhrase gives words, not numbers', () => {
  for (const v of [-9, -3, 0, 1.5, 4, 12]) {
    const s = axisPhrase('wildness', v, { min: 2, ideal: 6 });
    assert.equal(typeof s, 'string');
    assert.ok(s.length > 0);
    assert.ok(!/\d/.test(s), `axisPhrase leaked a number: "${s}"`);
  }
});

test('a settled journal entry is never un-filled', () => {
  // SPEC §0. Wreck the habitat and the creature becomes restless and moves —
  // it does not un-happen.
  const fields = newFields();
  const stuff = [];
  for (let i = 0; i < 6; i++) {
    const p = at(9 + (i % 3), 9 + ((i / 3) | 0), { wildness: 3, seclusion: 3 }, ['vine', 'ivy']);
    stuff.push(p);
    fields.add(p);
  }
  const b = new Bestiary({ fields, seed: 1, passable: () => true });
  for (let i = 0; i < 200; i++) b.update(1);
  const reached = b.state.get('satyr').rungIndex;
  for (const p of stuff) fields.remove(p);
  for (let i = 0; i < 200; i++) b.update(1);
  assert.ok(b.state.get('satyr').rungIndex >= reached, 'razing the habitat rolled the journal back');
});

test('a day is a real length of time and the beats are spread across it', () => {
  assert.ok(DAY_SECONDS >= 60, `a garden day is ${DAY_SECONDS}s — too short to watch anything happen`);
  const hours = Object.values(BEATS).map((b) => b.when[0]);
  assert.equal(new Set(hours).size, Object.values(BEATS).length, 'two beats happen at the same hour');
  for (const b of Object.values(BEATS)) {
    assert.ok(b.when[0] >= 0 && b.when[1] <= 1 && b.when[0] < b.when[1], `${b.id} window ${b.when}`);
    assert.ok(b.seconds >= 5, `${b.id} lasts ${b.seconds}s — too quick to notice`);
    assert.ok(typeof b.watch === 'string' && b.watch.length > 10, `${b.id} has no diegetic hint`);
  }
});

test('creatures move at a walking pace, not a dart', () => {
  const fields = newFields();
  fields.add(at(10, 10, { wildness: 6, seclusion: 4 }, ['vine', 'ivy']));
  const b = new Bestiary({ fields, seed: 4, passable: () => true });
  let peak = 0;
  const last = new Map();
  for (let i = 0; i < 3000; i++) {
    b.update(0.05);
    for (const a of b.agents) {
      const v = a.view();
      if (v.present === false) continue;
      const p = last.get(a);
      if (p) peak = Math.max(peak, Math.hypot(v.x - p.x, v.y - p.y) / 0.05);
      last.set(a, { x: v.x, y: v.y });
    }
  }
  assert.ok(peak < 4, `something moved at ${peak.toFixed(2)} tiles/sec — that is a dart, not a wander`);
});

test('presence requirements name real creatures', () => {
  for (const c of CREATURES) {
    for (const r of RUNGS) {
      for (const q of c.rungs[r]) {
        if (q.kind !== 'presence') continue;
        const who = q.creature || q.species;
        assert.ok(CREATURE_BY_ID.get(who), `${c.id}/${r} waits on '${who}', which is not a creature`);
        assert.notEqual(who, c.id, `${c.id} waits on itself`);
      }
    }
  }
  assert.ok(presence);
});

// ---------------------------------------------------------------------------
// Flourishes — the idle life
// ---------------------------------------------------------------------------
//
// A BEAT is the settling ceremony: once, gated on the whole garden, and it
// writes a journal line that stays written. A FLOURISH is the opposite in every
// one of those respects, and the two share machinery — so the tests that matter
// are the ones that keep the difference from eroding.

test('a flourish is not a beat, and the two tables do not collide', () => {
  for (const [id, f] of Object.entries(FLOURISHES)) {
    assert.equal(f.id, id, `${id} disagrees with its own key`);
    assert.equal(f.flourish, true, `${id} must declare itself a flourish`);
    assert.ok(f.pose, `${id} has no pose`);
    assert.ok(f.seconds > 0, `${id} has no duration`);
    assert.ok(!BEATS[id], `'${id}' is in BEATS as well — the merged ACTS lookup would shadow one`);
  }
  // No creature's settling ceremony may BE a flourish, or settling would become
  // something that happens over and over.
  for (const c of CREATURES) {
    assert.ok(!FLOURISHES[c.beat], `${c.id}'s beat '${c.beat}' is a flourish`);
  }
});

test('a sited flourish declares a radius and a cooldown; a hand-started one need not', () => {
  for (const [id, f] of Object.entries(FLOURISHES)) {
    if (!f.site) continue;
    assert.ok(Array.isArray(f.site) && f.site.length, `${id} has an empty site list`);
    assert.ok(f.radius > 0, `${id} is sited but has no radius — nearest() would search the whole map`);
    assert.ok(
      Array.isArray(f.cooldown) && f.cooldown.length === 2 && f.cooldown[0] > 0 && f.cooldown[1] >= f.cooldown[0],
      `${id} is sited but has no sane cooldown — it would fire every scan and the creature would live at the prop`
    );
  }
});

test('startFlourish refuses a creature that is not standing in the garden', () => {
  const fields = newFields();
  const b = new Bestiary({ fields, seed: 5, passable: () => true });
  const agent = b.agents.find((a) => a.creature.id === 'satyr' && !a.companion);

  // Offstage: it is not in the garden at all.
  assert.equal(agent.state, 'offstage');
  assert.equal(b.askFlourish('satyr', 'piping'), false, 'an offstage satyr cannot play');
  assert.equal(agent.pose, 'idle');

  // Mid-transit across the rim: it is over open sky, with nowhere to stand.
  agent.enter({ tx: 10, ty: 10 }, 20, 20, 1000, b.zoning, null);
  assert.equal(agent.state, 'arriving');
  assert.equal(b.askFlourish('satyr', 'piping'), false, 'a satyr still walking in cannot plant and play');

  // Once he has arrived, he takes it.
  for (let i = 0; i < 4000 && agent.state === 'arriving'; i++) b.update(0.05);
  assert.equal(agent.state, 'idle', 'he never finished walking in');
  assert.equal(b.askFlourish('satyr', 'piping'), true);
  assert.equal(agent.pose, 'pipe');
  assert.equal(agent.flourish, true);
  assert.equal(agent.beatT, FLOURISHES.piping.seconds);

  // And not twice at once.
  assert.equal(b.askFlourish('satyr', 'piping'), false, 'he cannot start a second recital mid-recital');
});

test('an unknown flourish is refused rather than stranding the creature', () => {
  const fields = newFields();
  const b = new Bestiary({ fields, seed: 6, passable: () => true });
  const agent = b.agents.find((a) => a.creature.id === 'satyr' && !a.companion);
  agent.enter({ tx: 10, ty: 10 }, 20, 20, 1000, b.zoning, null);
  for (let i = 0; i < 4000 && agent.state === 'arriving'; i++) b.update(0.05);
  assert.equal(b.askFlourish('satyr', 'nonesuch'), false);
  assert.equal(b.askFlourish('nobody', 'piping'), false);
  assert.equal(agent.state, 'idle');
  assert.equal(agent.pose, 'idle');
});

test('the recital ends and hands him back, and never touches the ceremony record', () => {
  const fields = newFields();
  const b = new Bestiary({ fields, seed: 7, passable: () => true });
  const agent = b.agents.find((a) => a.creature.id === 'satyr' && !a.companion);
  const st = b.state.get('satyr');
  agent.enter({ tx: 10, ty: 10 }, 20, 20, 1e6, b.zoning, null);
  for (let i = 0; i < 4000 && agent.state === 'arriving'; i++) b.update(0.05);
  assert.ok(b.askFlourish('satyr', 'piping'));

  let played = 0;
  for (let i = 0; i < 20000; i++) {
    b.update(0.05);
    if (agent.pose === 'pipe') played += 0.05;
    else if (played > 0) break;
  }
  assert.ok(
    Math.abs(played - FLOURISHES.piping.seconds) < 1,
    `played ${played.toFixed(1)}s, declared ${FLOURISHES.piping.seconds}s`
  );
  assert.equal(agent.state, 'idle');
  assert.equal(agent.pose, 'idle');
  assert.equal(agent.flourish, false);
  assert.equal(agent.beat, null);

  // THE LINE THAT MATTERS. `st.beats` is what the journal is written from and
  // what gates the settling ceremony. A repeatable act must never reach it.
  assert.ok(!st.beats.has('piping'), 'the recital was recorded as a settling ceremony');
});

test('poseT restarts on a pose change, so a one-shot gesture starts at its beginning', () => {
  const fields = newFields();
  const b = new Bestiary({ fields, seed: 8, passable: () => true });
  const agent = b.agents.find((a) => a.creature.id === 'satyr' && !a.companion);
  agent.enter({ tx: 10, ty: 10 }, 20, 20, 1e6, b.zoning, null);
  for (let i = 0; i < 4000 && agent.state === 'arriving'; i++) b.update(0.05);

  // Let some time build up in `idle` first — that is exactly the accumulated
  // clock a one-shot must NOT inherit.
  for (let i = 0; i < 40; i++) b.update(0.05);
  assert.ok(agent.view().poseT > 1, 'no time accumulated to be wrongly inherited');

  b.askFlourish('satyr', 'piping');
  assert.equal(agent.pose, 'pipe');
  assert.equal(agent.view().poseT, 0, 'the new pose inherited the previous pose clock');
  b.update(0.05);
  assert.ok(Math.abs(agent.view().poseT - 0.05) < 1e-9);
});
