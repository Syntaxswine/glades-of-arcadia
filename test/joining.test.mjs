// joining.test.mjs — a piece that knows it is part of a run. BACKLOG §4n.
//
// The owner: *"we should also think about how we can have certain objects have
// different sprites depending on how they are rotated, so things like hedges
// and fences can go around corners."*
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT A FACING, which is the whole design and is easy to lose.
//
// An L-corner comes in four kinds — arms toward {+tx,+ty}, {-tx,-ty},
// {-tx,+ty}, {+tx,-ty} — and a horizontal mirror swaps the two tile axes, so
// it maps the first two to THEMSELVES and the last two to each other. Corners
// therefore need three drawings, plus the straight, plus caps and tees.
// `FACINGS` is 4 and it does not fit.
//
// It should not fit. A corner is not something a player should have to aim.
// So the piece reads its NEIGHBOURS, and `mirrorJoinMask` below is the same
// fact `facingMirrored` rests on, written down where it can be checked.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JOIN_DIRS, JOIN_MASKS, mirrorJoinMask, joinAxis } from '../js/iso.js';
import { CATALOG, byId } from '../js/catalog.js';

// ---------------------------------------------------------------------------
// The vocabulary.
// ---------------------------------------------------------------------------

test('the four directions are the four orthogonal tile neighbours', () => {
  assert.equal(JOIN_DIRS.length, 4);
  assert.equal(JOIN_MASKS, 16);
  const bits = JOIN_DIRS.map(([, , b]) => b);
  assert.deepEqual(bits, [1, 2, 4, 8], 'the bits are one per direction, in order');
  // Each is a unit step, and no two are the same step.
  const seen = new Set();
  for (const [dtx, dty] of JOIN_DIRS) {
    assert.equal(Math.abs(dtx) + Math.abs(dty), 1, `[${dtx},${dty}] is not one tile`);
    seen.add(`${dtx},${dty}`);
  }
  assert.equal(seen.size, 4);
});

test('the mirror swaps the tile axes, and is its own inverse', () => {
  // E <-> S and W <-> N, because mirroring the screen's x axis trades +tx for
  // +ty. This is the same statement `facingMirrored` rests on.
  assert.equal(mirrorJoinMask(1), 2);
  assert.equal(mirrorJoinMask(2), 1);
  assert.equal(mirrorJoinMask(4), 8);
  assert.equal(mirrorJoinMask(8), 4);
  for (let m = 0; m < JOIN_MASKS; m++) {
    assert.equal(mirrorJoinMask(mirrorJoinMask(m)), m, `mask ${m} did not come back`);
  }
});

test('exactly two corners are their own mirror — which is why four facings cannot do it', () => {
  const corners = [1 | 2, 4 | 8, 4 | 2, 1 | 8]; // {E,S} {W,N} {W,S} {E,N}
  const selfMirror = corners.filter((m) => mirrorJoinMask(m) === m);
  assert.equal(selfMirror.length, 2, 'the near and far corners mirror onto themselves');
  // ...so the four corners need three drawings, and with the straight that is
  // four — one more than the two the facing model can express.
  const classes = new Set(corners.map((m) => Math.min(m, mirrorJoinMask(m))));
  assert.equal(classes.size, 3);
});

test('a run along one axis is a straight, and a bend is not', () => {
  assert.equal(joinAxis(1), 'tx'); // one arm east: still a straight
  assert.equal(joinAxis(4), 'tx');
  assert.equal(joinAxis(1 | 4), 'tx');
  assert.equal(joinAxis(2), 'ty');
  assert.equal(joinAxis(2 | 8), 'ty');
  assert.equal(joinAxis(1 | 2), null); // a corner
  assert.equal(joinAxis(1 | 2 | 4), null); // a tee
  assert.equal(joinAxis(15), null); // the cross
  assert.equal(joinAxis(0), null); // nothing to be straight along
});

// ---------------------------------------------------------------------------
// The art. Sixteen states, generated from one arm rather than drawn sixteen
// times, so none of them can disagree about the pitch of a rail.
// ---------------------------------------------------------------------------

test('the palisade carries all sixteen states, and they register on the same tile', async () => {
  const { PALISADE_FENCE, PALISADE_JOINS } = await import('../js/art/extras.js');
  assert.equal(PALISADE_JOINS.length, JOIN_MASKS);
  assert.ok(PALISADE_FENCE.joins, 'the base sprite lost its states');
  for (let m = 0; m < JOIN_MASKS; m++) {
    const s = PALISADE_JOINS[m];
    assert.ok(s && s.rows, `mask ${m} has no art`);
    // THE ANCHOR IS THE HUB, identically, for all sixteen. If one of them
    // derived its anchor from its own width instead — which is what the
    // module's `sprite()` helper does, quite correctly, for a hand-typed
    // sprite — a corner would sit half a tile off its plot, because a corner
    // reaches only one way and its rows are short on the other side.
    assert.deepEqual(
      [...s.anchor],
      [...PALISADE_JOINS[0].anchor],
      `mask ${m} anchors somewhere else`
    );
    assert.equal(s.w, PALISADE_JOINS[0].w, `mask ${m} is a different width`);
    assert.equal(s.h, PALISADE_JOINS[0].h, `mask ${m} is a different height`);
  }
});

test('a straight run is the same picture whichever way it was reached', async () => {
  const { PALISADE_JOINS } = await import('../js/art/extras.js');
  const j = (m) => PALISADE_JOINS[m].rows.join('\n');
  // No neighbours at all draws the straight, not a lone post: js/main.js lets
  // the facing wheel decide which diagonal that is. Anything else would make
  // the first piece a player places look like a mistake until they placed the
  // second one.
  assert.equal(j(0), j(1 | 4), 'an isolated piece should draw the straight run');
  // ...and the mirror pair is the mirror pair: {N,S} is {E,W} turned, which
  // is the one case the facing model DOES cover and the reason the straight
  // never needed a second drawing.
  assert.notEqual(j(2 | 8), j(1 | 4), 'the two axes are different pictures');
  // A ONE-ARMED PIECE IS AN END, AND AN END FILLS ITS TILE.
  //
  // THIS ASSERTION USED TO SAY THE OPPOSITE and the reversal is deliberate, so
  // the old argument is kept here to be answered rather than quietly deleted:
  //
  //   > "it draws only its arm — it stops at the hub rather than running on
  //   > into empty ground ... a fence that overshoots its last tile by half a
  //   > step is the same fault as the corner spike."
  //
  // The premise is measurably wrong. THE HUB IS THE TILE CENTRE (see the
  // anchor note in art/extras.js) and an arm is HALF A TILE, so a piece with
  // both arms spans its own tile exactly, edge to edge, and reaches into no
  // neighbour at all. There was never an overshoot to prevent.
  //
  // What the old rule actually produced was the owner's finding: *"single
  // hedges are represented differently than connected hedges."* A lone piece
  // draws the straight (both arms, a full tile); an END drew half of one. So a
  // run of five fenced four tiles, its two ends stopped dead at the tile
  // centre, and any piece standing alone beside it looked like a different and
  // longer object. Measured on `hedge-low` before the change: lone 855 ink
  // pixels, middle-of-run 855, ends 395 and 486.
  //
  // A CORNER IS STILL RIGHT TO STOP AT THE HUB — its two arms already meet
  // there and there is no raw cut to see. The rule is only about the masks
  // with exactly one neighbour, which are the only ones with an end that meets
  // nothing. That is asserted below.
  assert.equal(j(1), j(1 | 4), 'an end should draw the straight, filling its tile');
  const ink = (rows) => rows.split('').filter((c) => c !== '.' && c !== '\n').length;
  assert.equal(ink(j(1)), ink(j(1 | 4)), 'an end should carry the same timber as a full run');
  assert.equal(j(0), j(1), 'a lone piece and an end are the same picture');
  // ...and a CORNER is emphatically not the straight. If a future edit ever
  // generalises the end rule to every mask, this is what fails: it would turn
  // every L into a crossroads.
  assert.notEqual(j(2 | 4), j(1 | 4), 'a corner became a straight');
  assert.ok(ink(j(2 | 4)) < ink(j(15)), 'a corner should carry less timber than a cross');
});

test('a bend has a corner post and a straight does not', async () => {
  const { PALISADE_JOINS } = await import('../js/art/extras.js');
  const ink = (m) => PALISADE_JOINS[m].rows.join('').split('').filter((c) => c !== '.').length;
  // The hub post is the difference between "the run bends here" and "someone
  // repaired the fence in the middle of an even rhythm".
  const straight = PALISADE_JOINS[1 | 4];
  const corner = PALISADE_JOINS[4 | 2];
  const at = (s, x, y) => (s.rows[y] || '')[x];
  const [ax, ay] = straight.anchor;
  assert.equal(at(straight, ax, ay - 6), '.', 'a straight grew a post at its middle');
  assert.notEqual(at(corner, ax, ay - 6), '.', 'a corner has no post at the bend');
  assert.ok(ink(15) > ink(1 | 4), 'the cross should carry more timber than the straight');
});

test('every corner reaches exactly the tiles its mask names', async () => {
  const { PALISADE_JOINS } = await import('../js/art/extras.js');
  // An arm is half a tile: 16 px across and 8 down, signed by the direction.
  // Rather than trust the generator, check the ink actually lands out there.
  // ---------------------------------------------------------------------
  // LOOK FOR THE PLANTING, NOT FOR INK. Two drafts of this probe were wrong
  // in the same way and it is worth writing down, because it is a property of
  // the projection rather than a slip.
  //
  // The E arm and the N arm run to the SAME SCREEN COLUMN: +tx is (+32, +16)
  // per tile and -ty is (+32, -16), so `dtx - dty` is +1 for both. They differ
  // only in the sign of the drop. A stake is thirteen pixels tall, so the E
  // arm's outermost post rises straight through the row where the N arm's
  // FOOT would be — and any probe that accepts "some ink near here" reports an
  // arm that is not there.
  //
  // `'q'` is the darkest earth key and it is used in exactly one place: the
  // row where a stake enters the ground. That makes it unambiguous where a
  // silhouette is not.
  // ---------------------------------------------------------------------
  const reaches = (s, dtx, dty) => {
    const [ax, ay] = s.anchor;
    const x = ax + (dtx - dty) * 13;
    const y = ay + (dtx + dty) * 6 + 1;
    const row = s.rows[y] || '';
    return row[x - 1] === 'q' || row[x] === 'q';
  };
  // THE RULE, restated for the end pieces. A mask with two or more neighbours
  // reaches exactly the tiles it names — that is the corner invariant and it is
  // untouched. A mask with EXACTLY ONE reaches its neighbour AND the opposite
  // way, because that is its own tile's other half and an end fills its tile;
  // see the long note in the straight-run test above.
  const armsOfMask = (m) => {
    const bits = JOIN_DIRS.filter(([, , bit]) => m & bit);
    if (bits.length !== 1) return (dtx, dty) => JOIN_DIRS.some(([x, y, bit]) => (m & bit) && x === dtx && y === dty);
    const [ox, oy] = bits[0];
    return (dtx, dty) => (dtx === ox && dty === oy) || (dtx === -ox && dty === -oy);
  };
  for (let m = 1; m < JOIN_MASKS; m++) {
    const s = PALISADE_JOINS[m];
    const want = armsOfMask(m);
    for (const [dtx, dty] of JOIN_DIRS) {
      const expected = want(dtx, dty);
      assert.equal(
        reaches(s, dtx, dty),
        expected,
        `mask ${m}: arm toward [${dtx},${dty}] should be ${expected ? 'present' : 'absent'}`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// The catalogue key, which is a whitelist and has now dropped three fields.
// ---------------------------------------------------------------------------

test('every entry declares which run it belongs to', () => {
  // `normalise` builds an explicit object, so a key it does not name is
  // silently dropped — that is how `flatFooting` and then `shadow` came to be
  // read by a consumer that could never receive them. This is the third, and
  // it is asserted rather than assumed.
  for (const d of CATALOG) {
    assert.equal(typeof d.joins, 'string', `${d.id} has no join group`);
  }
  assert.equal(byId('palisade-fence').joins, 'palisade-fence');
});

test('a gate belongs to its wall, and only a gate shares a group', () => {
  // ------------------------------------------------------------------------
  // The owner: *"i was trying to use the pergola as a gate. what i think we
  // really need are separate gates / archways for the various walls."*
  //
  // Same group means "these connect", and defaulting to the id means nothing
  // connects to anything it is not. Sharing one is therefore a DECISION, and
  // this test is where it has to be made on purpose: a hedge arch declaring
  // itself part of the tall hedge's run is the whole gate mechanic, and two
  // unrelated pieces sharing a group by accident would have them reaching for
  // each other across a garden.
  // ------------------------------------------------------------------------
  const shared = new Map();
  for (const d of CATALOG) {
    if (!shared.has(d.joins)) shared.set(d.joins, []);
    shared.get(d.joins).push(d.id);
  }
  const pairs = [...shared].filter(([, ids]) => ids.length > 1);

  // Every group with more than one member is a wall and its gates, and the
  // wall is the one whose id names the group.
  for (const [group, ids] of pairs) {
    assert.ok(ids.includes(group), `join group '${group}' has no wall of that name: ${ids}`);
    for (const id of ids) {
      if (id === group) continue;
      assert.ok(
        byId(id).tags.includes('gate'),
        `${id} shares ${group}'s run but is not tagged a gate — a piece that ` +
          `joins a wall it is not a way through will reach for its neighbours ` +
          `and butt into them as if it were more wall`
      );
    }
  }

  // ...and the gates that exist are in a wall's run, not in their own.
  const gates = CATALOG.filter((d) => d.tags.includes('gate'));
  assert.ok(gates.length >= 2, 'the gate family lost members');
  for (const g of gates) {
    assert.notEqual(g.joins, g.id, `${g.id} is a gate to nowhere — it joins only itself`);
    assert.ok(byId(g.joins), `${g.id} joins '${g.joins}', which is not a placeable`);
  }
});

// ---------------------------------------------------------------------------
// EVERY FAMILY, not just the one that was built first.
//
// The palisade proved the mechanism; the hedges are what a player actually
// builds. They share nothing but the contract — the fence is generated from a
// hub and four arms, and the hedge is generated by CUTTING an existing bar at
// its hub and mirroring the halves, because a bar drawn along +tx separates
// into its two arms at exactly the anchor column. Two implementations, one
// promise, so the promise is what gets tested.
// ---------------------------------------------------------------------------

async function joiningFamilies() {
  const decor = await import('../js/art/decor.js');
  const extras = await import('../js/art/extras.js');
  // props.js IS IN THIS LIST NOW, and its absence was a real hole. The
  // drystone wall and its gateway live there, they carry all sixteen states,
  // and every family test below silently skipped them — so the wall ran for a
  // whole arc at TWO TILES of length with a full green suite behind it. A
  // helper that decides which modules count is a test's blind spot written
  // down; this one named two of the three art modules and looked complete.
  const props = await import('../js/art/props.js');
  const out = [];
  for (const table of [decor.DECOR, extras.EXTRAS, props.PROPS]) {
    for (const [k, v] of Object.entries(table || {})) if (v && v.joins) out.push([k, v]);
  }
  return out;
}

test('more than one family joins, and the hedges are among them', async () => {
  const fams = await joiningFamilies();
  const names = fams.map(([k]) => k);
  assert.ok(names.includes('palisade-fence'), 'the fence stopped joining');
  assert.ok(names.includes('hedge-low'), 'the low hedge does not join');
  assert.ok(names.includes('hedge-tall'), 'the tall hedge does not join');
});

test('every joining family keeps one hub for all sixteen states', async () => {
  for (const [name, art] of await joiningFamilies()) {
    assert.equal(art.joins.length, JOIN_MASKS, `${name} has the wrong number of states`);
    // The anchor is the pixel that lands on the tile centre, so a state whose
    // anchor sits somewhere else puts that piece on the wrong tile. It is NOT
    // required that they all be the same SIZE — a corner reaches one way and
    // is honestly narrower — only that the hub is the hub.
    for (let m = 0; m < JOIN_MASKS; m++) {
      const s = art.joins[m];
      assert.ok(s && s.rows, `${name}@${m} has no art`);
      assert.equal(s.anchor[1], art.joins[0].anchor[1], `${name}@${m} sits at a different height`);
      assert.ok(s.anchor[0] >= 0 && s.anchor[0] < s.w, `${name}@${m} anchors outside itself`);
    }
  }
});

test('anything the catalogue says JOINS has the art to do it', async () => {
  // ---------------------------------------------------------------------
  // The owner: *"the balistrade does not bend like the other fences."*
  //
  // It could not. js/catalog.js declared `joins: 'balustrade'` — which puts a
  // piece in a run group and makes its neighbours reach for it — but the ART
  // was never passed through `linearJoins`, so it carried no sixteen states
  // and every piece drew the straight bar whatever it stood next to.
  //
  // A JOIN GROUP IS A PROMISE MADE IN THE CATALOGUE THAT ONLY THE ART CAN
  // KEEP, and until now the two halves were never checked against each other.
  // Everything else about the mechanism was tested — the masks, the mirror,
  // the hub, the corners — on the families that HAD art. A piece that never
  // reached the mechanism at all sailed past every one of those tests.
  // ---------------------------------------------------------------------
  const decor = await import('../js/art/decor.js');
  const extras = await import('../js/art/extras.js');
  const props = await import('../js/art/props.js');
  const ART = { ...props.PROPS, ...(extras.EXTRAS || {}), ...(decor.DECOR || decor.default) };

  // THERE IS NO DECLARATIVE "THIS IS A RUN" FLAG, which is worth knowing before
  // reading the rest. `joins` defaults to the id on EVERY entry
  // (`joins: raw.joins ?? raw.id`), so it cannot be the signal — a herm and a
  // lily pool have one too. Only three entries author it explicitly, and all
  // three are gates naming the wall they belong to. So this comes in two parts.

  // PART ONE, derivable and therefore strong: if an entry names a group that is
  // not its own id, it is a GATE, and both it and the wall it names must bend.
  // A gate whose wall cannot turn a corner is a gate that falls out of the run.
  const derived = [];
  const byGroup = new Map();
  for (const def of CATALOG) byGroup.set(def.joins, [...(byGroup.get(def.joins) || []), def]);
  for (const def of CATALOG) {
    if (!def.joins || def.joins === def.id) continue;
    for (const member of byGroup.get(def.joins) || []) {
      const sp = member.art && member.art.kind === 'sprite' ? ART[member.art.sprite] : null;
      if (sp && !sp.joins) derived.push(`${member.id} -> ${member.art.sprite}`);
    }
  }
  assert.deepEqual(derived, [], 'a gate and its wall must both carry the sixteen states');

  // PART TWO, a list, because the catalogue cannot express it yet. These are the
  // pieces a player builds in LINES and expects to turn corners. `balustrade` is
  // here because it was the one that got away: the owner reported *"the
  // balistrade does not bend like the other fences"*, and it had run for the
  // whole joining arc with a join group, no join art, and a green suite —
  // because every other test in this file starts from the art and so could only
  // ever check the families that already had some.
  const RUN_FAMILIES = ['balustrade', 'clipped-hedge', 'tall-hedge', 'dry-stone-wall', 'palisade-fence'];
  // Declared a run and deliberately not built yet. Say WHY, or it is just a mute.
  const NOT_YET = new Map([
    [
      'stepped-terrace-wall',
      'a wall that CLIMBS. Its states are a function of the level change either ' +
        'side as well as of the neighbours, so it is not sixteen drawings but ' +
        'sixteen times the step profile — a real design question, not an oversight.',
    ],
  ]);
  const missing = [];
  for (const id of RUN_FAMILIES) {
    if (NOT_YET.has(id)) continue;
    const def = byId(id);
    assert.ok(def, `${id} is not in the catalogue any more — fix this list`);
    const sp = def.art && def.art.kind === 'sprite' ? ART[def.art.sprite] : null;
    assert.ok(sp, `${id} names a sprite that does not exist: ${def.art && def.art.sprite}`);
    if (!sp.joins) missing.push(`${id} -> ${def.art.sprite}`);
  }
  assert.deepEqual(
    missing,
    [],
    'these are built in lines and cannot bend: their sprite never went through linearJoins'
  );
});

test('a piece of a run spans ONE tile, and does not cover its own neighbour', async () => {
  // ---------------------------------------------------------------------
  // The owner, on the drystone wall: *"its way longer than the other walls,
  // and so when the gate is placed between the segments the walls on either
  // end cover it."* It was drawn 65 px long against a note calling that "a
  // full-tile bar". A full tile of run is LINE_W = 33. 65 is two of them.
  //
  // THIS IS NOT A WIDTH CHECK, deliberately. A piece's ink is wider than its
  // run — a slab's top face recedes 2*depth to the left — so any constant
  // bound on width is a number nobody can defend and every artist has to
  // work around. The invariant that actually matters is about ADJACENCY:
  // lay the piece down, lay its +tx neighbour down, and see how much of the
  // first the second buries. That is a fact about runs, not about taste.
  //
  //   drystone-wall, before   50.1%   ...half the wall was drawn twice
  //   drystone-gateway         34.4%
  //   every family, after      0.0% – 6.9%
  //
  // A run wants a HAIRLINE of overlap and gets one: LINE_W is "32 px of run
  // plus one overlap column", so a few per cent is the seam doing its job.
  // 20% is a third of the fault and three times the healthy maximum.
  // ---------------------------------------------------------------------
  /**
   * ONE FAMILY IS ALLOWED MORE, and the reason is stated here rather than in a
   * bare list, because a list that names a symptom hides its cause.
   *
   * The ARCADE's piers stand ON the tile boundaries — that is what makes a bay
   * fit inside one tile, and it is what let Piranesi's *"a mass cantilevered
   * off a single shaft"* be fixed at all. A member on a boundary is SHARED:
   * both neighbours draw it, in the same place, in the same shape. This guard
   * cannot tell "my neighbour buries me" from "my neighbour and I are drawing
   * the same stone", and for a pier the second is the truth.
   *
   * It is pinned just over the measured value, not doubled, so the arcade
   * getting genuinely longer than a tile still fails. Everything else keeps
   * the flat 20%: drystone-wall was 50.1% when the owner reported it, and the
   * healthy families sit between 0.0% and 6.9%.
   */
  const SHARED_MEMBER = { arcade: 0.22 };
  const { TILE_W, TILE_H } = await import('../js/iso.js');
  for (const [name, art] of await joiningFamilies()) {
    const sp = art.joins[5]; // +tx and -tx: the middle of a straight run
    const ink = new Set();
    sp.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '.') ink.add(`${x - sp.anchor[0]},${y - sp.anchor[1]}`);
      }
    });
    let buried = 0;
    for (const k of ink) {
      const [x, y] = k.split(',').map(Number);
      if (ink.has(`${x - TILE_W / 2},${y - TILE_H / 2}`)) buried++;
    }
    const frac = buried / ink.size;
    assert.ok(
      frac < (SHARED_MEMBER[name] || 0.2),
      `${name} covers ${(frac * 100).toFixed(1)}% of itself with its own neighbour — ` +
        'it is longer than one tile, and anything set between two of them will be buried'
    );
  }
});

test('an unconnected piece is exactly the sprite the catalogue names', async () => {
  // The whole compatibility claim in one line: a garden full of straight
  // hedges renders as it always did, and only a corner is new art. If this
  // fails, every existing garden just changed.
  for (const [name, art] of await joiningFamilies()) {
    assert.equal(art.rows.join('\n'), art.joins[0].rows.join('\n'), `${name} moved its default`);
    assert.deepEqual([...art.anchor], [...art.joins[0].anchor], `${name} moved its anchor`);
    assert.equal(art.name, name, `${name} is registered under '${art.name}'`);
  }
});

test('a bend carries the same timber as the run it bends', async () => {
  // A corner made by dropping half of each arm would pass every geometric
  // check here and look like a gap on screen. The two arms of a corner are
  // half a straight each, so a corner should weigh about what a straight
  // does — allow a wide band, because a hub post and the overlap at the bend
  // are both real and both add.
  for (const [name, art] of await joiningFamilies()) {
    const ink = (m) => art.joins[m].rows.join('').split('').filter((c) => c !== '.').length;
    const straight = ink(1 | 4);
    for (const corner of [1 | 2, 4 | 8, 4 | 2, 1 | 8]) {
      const c = ink(corner);
      assert.ok(
        c > straight * 0.55 && c < straight * 1.6,
        `${name}@${corner} weighs ${c} against a straight's ${straight}`
      );
    }
    assert.ok(ink(15) >= straight, `${name}'s cross is lighter than its straight`);
  }
});
