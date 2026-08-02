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
  // A ONE-ARMED PIECE IS AN END, and it draws only its arm — it stops at the
  // hub rather than running on into empty ground. That is a real choice and
  // not an oversight: a fence that overshoots its last tile by half a step is
  // the same fault as the corner spike this whole mechanism exists to remove,
  // just at the end of the run instead of the bend.
  assert.notEqual(j(1), j(1 | 4), 'an end piece should stop at the hub');
  const ink = (rows) => rows.split('').filter((c) => c !== '.' && c !== '\n').length;
  assert.ok(ink(j(1)) < ink(j(1 | 4)), 'an end piece should carry less timber than a full run');
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
  for (let m = 1; m < JOIN_MASKS; m++) {
    const s = PALISADE_JOINS[m];
    for (const [dtx, dty, bit] of JOIN_DIRS) {
      const want = !!(m & bit);
      assert.equal(
        reaches(s, dtx, dty),
        want,
        `mask ${m}: arm toward [${dtx},${dty}] should be ${want ? 'present' : 'absent'}`
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
  // Same group means "these connect". Defaulting to the id means nothing
  // connects to anything it is not, which is the answer that cannot surprise
  // a player — a low hedge cornering into a tall one is a design decision and
  // this is not where it gets made by accident.
  const groups = new Set(CATALOG.map((d) => d.joins));
  assert.equal(groups.size, CATALOG.length, 'two entries share a join group by default');
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
  const out = [];
  for (const table of [decor.DECOR, extras.EXTRAS]) {
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
