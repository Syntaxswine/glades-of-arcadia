# HANDOFF — THE IMAGE PACK AND THE COMPASS

**2026-08-02. Read this before touching anything to do with WHICH WAY AN OBJECT
FACES or HOW TWO PIECES MEET.** For the shadow arc, the palette laws and the
traps that bite everyone, read the prior keystone first:
`HANDOFF-THE-FIRST-GLADE-2026-07-31.md`. Open work is in `BACKLOG.md` §4n,
reconciled in the same pass as this file.

> **The owner, in the morning:** *"the image pack needs to be updated for
> isometric perspective. as noted in the last handoff there are certain objects
> like the bench that don't follow the diagonal of the grid pattern, they
> instead point at the viewer. while redoing the image packs we should also
> think about how we can have certain objects have different sprites depending
> on how they are rotated, so things like hedges and fences can go around
> corners and ramps can go up a hill in any direction."*
>
> **...having played it:** *"i'm loving the other changes. this is the aesthetic
> direction i was hoping to go."* — then the pergola, the 2x2 preview cursor,
> and *"what i think we really need are separate gates / archways for the
> various walls."*

## Where it stands

| | |
|---|---|
| commits | 14, `503ff57` → `da8fc3a` |
| tests | **409** (was 386) |
| playtest | **49 / 49** (was 46) |
| `iso-audit --strict` | **1 of 311** — `balustrade`, the one known name |
| `anchor-audit` | **10 floating / 0 buried / 12 mismatches** — unmoved all day |
| elevation probe | clean; pick round-trip 0 disagreements, palette 100% |
| live | every served `.js` hashes identical to HEAD |

Nothing here is half-built. Every mechanism named below is wired end to end,
tested, and on screen.

## READ IN THIS ORDER

1. **§1 THE BENCH** — the finding that set the shape of the whole day. Two of
   the three objects the owner complained about were fixed by changing one
   string, because the correct art already existed and nothing pointed at it.
2. **§3 RAMPS** and **§5 CORNERS** — the two rotation systems, and why they are
   different systems rather than one.
3. **§4 THE INSTRUMENTS** — and read the warnings in §7 about how two of them
   were wrong before you trust the third.
4. Everything else as needed.

## THE LAWS THIS ARC ADDED — do not "improve" these

- **`joins` is a GROUP NAME, defaulting to the id.** Nothing connects to
  anything it is not. A gate overrides it to name the wall it belongs to. That
  one indirection is the entire gate mechanic.
- **A joined piece ignores the facing wheel.** The sixteen connection states
  are absolute; mirroring a corner because the player turned it before it had
  neighbours points it at the wrong two tiles. The stored facing is untouched,
  so pulling a piece out of a run makes it turnable again.
- **Mask 0 keeps the wheel.** An isolated piece obeys the facing the player
  chose. The first hedge you put down still has a direction; the second decides
  what the first meant.
- **Four facings means two drawings.** Bit 0 is the mirror, bit 1 selects
  `back`. A `facings: 4` entry whose art has no `back` draws the same picture
  twice for half the wheel's travel — `playtest` refuses it.
- **The near ramp is mostly end wall and that is CORRECT.** A unit tile
  projects to 1024 px² of ground; the away ramp's surface projects to 1536 and
  the near one's to 512. Tilting a plane toward a high camera makes it more
  edge-on, not less. Do not "fix" it.
- **`iso-audit --elev` REPORTS, it never votes.** It has been demonstrably
  blind twice. It is a ranking a human reads, and making it a gate would make
  its blind spots invisible.
- **A gateway stands proud of its wall.** The hedge arch is 4 px taller at
  every column; the drystone piers rise 12. A hole level with a knee-high wall
  is a gap you step over.

---
## What shipped

| | commit | |
|---|---|---|
| the bench was never an art fault | `503ff57` | 2 objects given the art that already existed |
| a fence with gaps in it is not a fence | `84bf404` | 23x25 -> 33x28, and the last baked skirt |
| ramps climb all four ways | `3c6d53c` | facings 2 -> 4, the first use of bit 1 |
| a fence that turns a corner | `5c4f9a0` | 16 states, generated |
| hedges turn corners too | `7f3aa87` | ...and the straight is byte-identical |
| the drystone wall turns too | `5cc707b` | the promised one line was one line |
| the 2x2 preview highlighted one tile | `fa96a07` | a fourth key-name disagreement |
| the pergola, redrawn in the projection | `250d3a6` | ...and the measure that could not see it |
| gates: a way through a wall is a piece OF the wall | `d5d2853` | three walls |

Four handoff/backlog commits interleaved, so the record was never behind the
code by more than one step.

## 1 · THE BENCH: NOTHING ASKED FOR THE GOOD ONE

`stone-bench` drew `props.BENCH` — a front elevation whose every edge is
horizontal, a little table pasted on the screen. `decor.STONE_BENCH` had existed
the whole time, **registered under that exact id**: a `slab()` seat on two
`plinth()` legs running along +tx like every other linear piece, and the sprite
decor.js's own header holds up as the vocabulary the rest of the set follows.
Nothing pointed at it.

`doric-column` was the same. Its blurb says *"a stout **fluted** shaft with a
plain square capital"*; it drew `props.column`, which has neither, while the
fluted `doric-column` sat beside it unreachable. `ionic-` and `corinthian-` had
been migrated and this one was missed — the order that gives the group its name.

**NOTHING FAILED**, and that is the whole finding:

- the sprite resolves, so `playtest` is content;
- there is no `wanted`, so it is not art debt either;
- `iso-audit` measured the GOOD sprite, found it clean, and printed a green
  line about a picture the game does not draw.

> An audit over every sprite in the tree answers *"is the ART correct"*. The
> question an owner asks is *"is the GAME correct"*, and the two differ by
> exactly the set of things nothing points at.

`iso-audit --catalog` measures the second: **87 of 237 sprites are reachable.**
Two of the other 150 were the correct drawings of things on screen.

Five further name mismatches were checked and are correct — `still-pool` and
`gravel-walk` carry `ground:` so they paint tiles and a tile sprite is right;
the two props hedges are superseded by the decor pair. That check is worth
repeating whenever art is added, and `tools/iso-audit.mjs --catalog` is where.

## 2 · A FENCE WITH GAPS IN IT IS NOT A FENCE

`palisade-fence` was neither of the two things its own header said it was.

> *"The one thing that has to be right is that it runs ALONG A TILE EDGE — 2
> across for 1 down ... Every stake therefore steps down 2 rows per 5 columns,
> which is the 2:1 diamond slope to within a pixel over the run."*

Two-in-five is 0.4. The projection's slope is 0.5. The sentence stating the
requirement sat four lines above the line breaking it, and over the fence's own
23 columns it was two and a half rows off true.

And 23 px of run on a 32 px tile means **a row of fences is a dotted line**.
props.js had already learned this on the drystone wall, in as many words — *"it
used to be a 24px stub, which meant a row of them left gaps — visibly not a
barrier, which is fatal for an occluder"*. The palisade is an occluder too;
`js/fields.js` stops influence at it while the player looks through a hole.

**The fix was to delete the second copy of the numbers.** `LINE_W` and
`LINE_DROP` now live in `js/art/format.js`; decor.js re-exports them, extras.js
imports them. Same argument the shadow arc made for `foot` and `groundFoot`:
props.js and decor.js keep separate copies of nearly every grid helper *on
purpose*, and not of the ones that state a fact about the world.

While in there, **the last baked contact skirt in the tree**: `seated-maiden`
ended with two rows of solid `'m'`. Step 3 swept this file, but only its
palisade *loop* — these were typed into a literal sprite in a module the sweep
had already visited and ticked off. Replaced with `foot(10, MARBLE, 3)`.

## 3 · RAMPS: THE COMMENT THAT COST HALF THE COMPASS

decor.js's CONNECTORS header said the other three orientations were *"a
horizontal flip and/or a re-anchor, which the renderer can do for free"*.

The flip is real and free, and it buys the second ramp that climbs **away** from
the camera: mirroring the screen's x axis swaps the tile axes, so -tx becomes
-ty. It cannot buy the two that come **downhill at you** — that is a 180-degree
rotation, i.e. a horizontal flip *and a vertical one*, and a vertical flip is
forbidden here because the light is always from the upper left.

`js/iso.js` §FACING had said exactly this since it was written — bit 0 is the
mirror, bit 1 chooses the drawing — and **this is the first placeable to use
bit 1.**

| facing | rise | ascends toward | on screen |
|---|---|---|---|
| 0 | `1 - s` | -tx | uphill, away to the upper LEFT |
| 1 | mirror | -ty | uphill, away to the upper RIGHT |
| 2 | `s` | +tx | uphill, toward the lower RIGHT |
| 3 | mirror | +ty | uphill, toward the lower LEFT |

`back` lives **on the art** (`format.js` `defineSprite`), not as a catalogue
string: an artist who draws a ramp both ways has made one object with two views,
and a name-based join can go stale. `render.js` `artRaster` follows it in one
line, and `playtest` refuses a `facings: 4` entry whose art has no `back` —
otherwise half the wheel's travel draws the same picture twice.

### The geometry is right and it is counter-intuitive

A unit tile projects to **1024 px²** of ground. The away ramp's surface projects
to **1536** and the near ramp's to **512**. Tilting a plane toward a high camera
makes it MORE edge-on, not less — so a ramp coming at you is mostly end wall,
and that is what it should look like. Do not "fix" it.

### Three things the picture found that no number would have

1. **The mirror had never been rendered by a tool.** The first offline probe to
   draw a turned object died on `ctx.translate is not a function`: the headless
   shim implements the calls render.js needed, and the flip used two it did not.
   *Half the facings in the game had only ever been seen by a human with a
   browser open.* `mirroredRaster` now reverses rows in pixels — one pass over a
   raster built once and cached forever, and every offline instrument can see a
   turned piece.
2. **`def.shadow` was a dead field.** main.js passes it, render.js honours
   `=== false`, and catalog.js `normalise` — an explicit whitelist — never named
   it. **Third consumer in this subsystem caught the same way**; `flatFooting`
   carries the same note. A CONNECTOR IS GROUND, so it casts no contact shadow:
   `groundCentre` gives r = 32 on a 64 px ramp and every ramp in the game sat in
   a dark pool wider than itself.
3. **The near ramp painted its own internal face.** A ramp exists against a step
   and the step buries the edge it climbs. For the away drawing that edge is at
   the back and its face was hidden by the ramp's own surface, so nobody had to
   say so. For the near one it is a NEAR edge, and a full 16 px wall went
   straight across the terrace it was joining.

## 4 · THE INSTRUMENTS

### `tools/joinshot.mjs` — DOES THIS PIECE JOIN?

Every probe in this repo isolates its subject, and **isolation is a
configuration a player never builds.** That blind spot has now cost three
findings: the scalloping (last session), the palisade's gaps, and the corner
problem below. So this one only ever draws things TOUCHING.

```
node tools/joinshot.mjs --ids hedge-low --corner --n 4 --zoom 4 --grid
```

`--run`, `--corner`, `--cross`, `--grid` (the tile diamond in red, which is how
you check a 1x1's anchor — `anchor-audit` is multi-tile only), `--flat`.

**It corrected me on its first outing.** A +ty run of hedges came out as four
separate stubs and looked like an art fault. It is not: the pieces are drawn
along +tx and the player TURNS them. A probe that leaves everything at facing 0
tests a garden nobody builds, so the +ty leg is now turned by default.

### `iso-audit --elev` — the second fault

Everything the audit measured before is ONE EDGE, the bottom contour. The
sleeping satyr proved that is not the whole question: its base is an honest
fracture, it passes cleanly, and it is still drawn in elevation.

- **seam** — longest level SURFACE BOUNDARY inside the silhouette. The sharp
  one: where two faces of a solid meet, that edge runs 1-in-2. `props.BENCH`
  puts D over C over B across twenty-one columns.
- **top** — longest level run along the TOP contour. A flat top is a horizontal
  plane, and a horizontal plane in this projection is a DIAMOND.

A horizontal screen line is **not** illegal — `project(1, -1)` is `(64, 0)`, the
diamond's own W–E diagonal. What it is not is a GRID direction.

**REPORTED, NEVER VOTED.** The bottom contour has one legal answer so a ratchet
can hold it; the top of a sprite has many. The table ranks and a human looks —
and the first thing looking said was that the three column capitals it flags are
FINE, a cylinder being allowed to be symmetric. Same lesson that demoted
`mirror`. **Do not promote this to a gate.**

### `elevation-probe.mjs` gains a `ramps` scene

A plateau with a way up on all four sides, each ramp on the low ground with the
step it climbs beside it — the only configuration that can tell a ramp from a
wedge. On flat grass in a contact sheet the near drawing reads as a box.

## 5 · THE CORNERS — BUILT, for two families

`node tools/joinshot.mjs --ids hedge-low,balustrade,palisade-fence,drystone-wall
--corner` failed on all four. The straight runs were fine; **a corner was two
finished bars crossing**, with the bar on the corner tile carrying on past the
turn and its end sticking out as a spike.

### Why the facing wheel cannot solve it

An L-corner has four kinds — `{+tx,+ty}`, `{-tx,-ty}`, `{-tx,+ty}`, `{+tx,-ty}`
— and the mirror (which swaps tx and ty) maps the first two to *themselves* and
the last two to each other. So corners need **three drawings**, plus the
straight, plus caps and tees. `FACINGS` is 4. It does not fit, and it should
not: a corner is not something a player should have to aim.

### What was built

**Neighbour-driven, and it costs nothing.** `js/main.js` `buildObjects` is
*"rebuilt only when the world changes"*, and `js/render.js` keys its raster
cache on the ART OBJECT — so choosing a different member of `art.joins` hits a
different cache entry rather than dirtying one. There is no invalidation
problem at all.

| | |
|---|---|
| `js/iso.js` §JOINING | the four bits, `mirrorJoinMask`, `joinAxis` |
| `js/catalog.js` | `joins`, a group defaulting to the id |
| `js/art/extras.js` | the fence: a hub and four arms, `armStep` |
| `js/art/decor.js` | `linearJoins`: cut an existing bar at its hub |
| `js/main.js` | two passes — who is where, then who touches whom |

**MASK 0 KEEPS THE WHEEL**, and this is the part worth preserving. An isolated
piece has no neighbours to read, so it obeys the facing the player chose; a
connected one obeys the run. The first hedge you put down still has a direction,
and the second decides what the first meant. **And the wheel then lets go** —
the sixteen states are absolute, so mirroring a corner because the player had
turned it before it had neighbours would point it at the wrong two tiles. The
stored facing is untouched; pull the piece out of the run and it turns again.

### The hedge needed no new art code

Two facts about the projection, not cleverness:

- the bar runs down-right from the hub, so **a vertical cut at the anchor
  column separates its two arms exactly**;
- a horizontal mirror swaps the tile axes, so those same two halves, reversed,
  **are** the -ty and +ty arms.

One bar gives all four arms and the sixteen states are overlays, drawn back to
front so a bend reads as one mass. `linearJoins(name, built, opts)` is the whole
thing, and **any piece built by `slab()` along +tx can have it for one line** —
`balustrade` and `drystone-wall` are next and are the same shape of work.

**The straight is byte-identical**: 54x40, anchor 26,28, 855 opaque pixels
before and after. Only a corner is new art, and a test asserts it.

### Three things that only showed up when built

1. **A corner's anchor cannot be derived from its width.** extras.js's
   `sprite()` helper takes the longest row and centres on it, which is right for
   a hand-typed sprite. A corner reaches only ONE way, so its rows are short on
   the other side and the derived centre landed half a tile off the plot.
2. **The E arm and the N arm run to the same screen column.** +tx is (+32,+16)
   and -ty is (+32,-16), so `dtx - dty` is +1 for both, and a 13 px stake on the
   E arm rises straight through the row where the N arm's foot would be. Two
   drafts of the test reported an arm that was not there. It now looks for
   `'q'`, the planting key, used in exactly one place. **A tall subject needs a
   short window.**
3. **The census could not see any of it.** `spritesIn` walks a module's
   exports; the palisade's states happen to be exported as an array and were
   audited, the hedges' hang only on `.joins` and were invisible. Two families,
   one mechanism, one measured — worse than auditing neither, because the green
   result reads as coverage. It now follows `joins` and `back`. **286 sprites,
   still 1 flagged**: every generated corner meets the ground correctly, because
   an arm inherits its parent's foot.

### Carried, and the one that was not

`drystone-wall` took it for four lines of call site and no new art, which is
the only real test of "any piece built by `slab()` along +tx can have it for
one line" — a helper that turns out to need its subject reshaped was never the
helper it claimed to be. The wall qualified without knowing it: already a
full-tile bar running down-right from an anchor at its exact midpoint. Three
families join now, and `linearJoins` lives in **format.js**, because props.js
and decor.js share the helpers that state a fact about the world and nothing
else.

**`balustrade` is still out, and not by oversight.** Its anchor is at x = 10 on
a 46-wide sprite — X0, the slab's far corner, not the run's midpoint — so
`armsOf` would cut it into a stub and a spar. Moving it to 22 would fix that
AND the visible staggering in its runs AND, almost certainly, its place in
`KNOWN_FLAT_FEET`, all at once.

That is the shape of the thing: **one decision with three faces.** It belongs
with the shadow-stamp work it has been blocked on since the last arc, and that
work is now easier than it was, because a piece knows its own mask — the stamp
can be chosen from `joinAxis(mask)` instead of measured off a base contour.
`groundCentre` on a corner would give an even worse circle than on a straight,
so the two should land together and neither alone.

## 6 · STILL OPEN, and where

- **The sleeping satyr is drawn in ELEVATION.** Unchanged. Owner's commission —
  re-seating the figure along +tx is a redraw of the signature image.
- **The scalloping.** Unchanged, and now visibly the same question as the
  corners — with the difference that the art can now answer it: a piece knows
  its mask, so the stamp could be chosen from `joinAxis(mask)` instead of
  measured off the base contour.
- **`bridge`, `naiskos`, `grave-stele`, `votive-shelf`, `altar`** — the top of
  `iso-audit --elev --catalog` after the bench dropped off it. All fronted
  objects drawn as front elevations. `bridge` is the sorest: its own comment
  says *"It is drawn along the +tx axis like the wall"* and it is not, it is a
  32 px arch seen face-on standing on a 2x1 plot.
- **Non-square footprints cannot turn.** `js/iso.js` names the work (transpose
  the footprint through `canPlace`, the collision test and the depth key) and it
  is why `cave-mouth` (2x1), `colonnade` (3x1) and `level-bridge` (2x1) are
  absent from a `TURNS` list they belong at the top of. Doing it would let the
  bridge cross a stream running either way.
- **Ramps do not auto-orient.** The player has all four now; a ramp placed
  against a cliff could *default* its facing from the surrounding levels and
  still let the wheel override. `world.levelAt` on the four neighbours is all it
  needs.
- **`balustrade` joins nothing**, and it is one decision with three faces — see
  §5 *Still to carry*.
- **`pergola-arch` and `ruined-archway`** are dead arch sprites in decor.js,
  both front elevations. See §7 *Still without a gate*.

### If you want the order I would take them in

1. **Ramp auto-orientation.** Smallest, and the largest felt improvement per
   line: the player stops choosing among four things the terrain already knows.
   Default the facing at placement from `world.levelAt`, leave the wheel as an
   override. Nothing else has to change.
2. **The balustrade.** Move its anchor from the slab's far corner to the run's
   midpoint and three faults close together — the arm cut, the staggered runs,
   and almost certainly its place in `KNOWN_FLAT_FEET`. Land it with the shadow
   stamp, which the connection mask has just made tractable.
3. **The bridge.** The sorest name on `--elev`, and the one whose fix is
   blocked on real engineering rather than on drawing: it wants non-square
   footprints to turn.
4. **The satyr.** Last, deliberately. It is a commission, not a sweep, and it
   should be done when someone has an afternoon and wants to draw.


---

## 7 · AFTER THE FIRST LOOK — 2026-08-02, same evening

The owner played it and sent back two things. Both were worth more than they
looked.

> *"the pergola could use an isometric update. i'm loving the other changes
> though. this is the aesthetic direction i was hoping to go. one other minor
> change, there are items, like the paths, that are two tiles by two tiles, but
> the preview cursor only shows the upper most tile of the 4 highlighted."*

### The 2x2 preview — a FOURTH producer/consumer disagreement

`js/input.js` states a ghost's size as `w`/`h`. `js/render.js` reads it through
`footprintOf`, which wants `footprint: [w, h]` like every other object.
`js/ui.js` **did** convert — in the one call it makes to the renderer — and
`js/main.js`'s draw loop then handed `ui.ghost` STRAIGHT to `renderer.setGhost`
on every frame, raw, overwriting it. The per-frame path always wins. The
conversion that existed was dead code.

**The one tile drawn is `(tx, ty)`** — the north corner of the block, first cell
of the row-major loop, top of the diamond on screen. Which is exactly what the
owner described, and it is the kind of detail that identifies a bug from a
sentence: no other failure mode draws that tile and only that tile.

`ghostShape(g)` is now a named export stating the one shape a ghost has, so
both paths deliver the same object. **A shape two modules must agree on wants a
name and a test**; four lines inside `setGhost` had neither. The test renders
two frames and diffs them, because a ghost carrying the right numbers under the
wrong key passes every structural assertion and still draws one tile.

### The pergola — and the hole it opened in the instrument

A pergola IS a grid of beams: the one object in a garden whose whole appearance
is which way its timbers run, and therefore the worst possible thing to have
drawn as a front elevation. Redrawn: four posts on the tile's own corners, top
plates on the four diamond edges, rafters across parallel to the +ty edges and
2 px proud so the roof reads as two layers crossing.

**The vine took three goes and the lesson was the same each time — a vine that
covers its frame has hidden the object it grows on.** 190 clumps over the roof
plane gave a dark lump on four legs. 44 clumps thinned toward the camera gave a
horizontal SMEAR, because a uniform scatter minus its front half is a band and
a band is a screen-space shape. What works is to **walk the two back plates**
and drop clumps along them: a vine climbs timber, so putting it where the
timber is gives a shallow V following the roof's own edges.

The old sprite is kept as `PERGOLA_ELEVATION`, unreachable and deliberately so.
Read it beside the new generator and the difference is the whole arc in one
object.

#### `iso-audit --elev` scored the old pergola 0.00

The measure this handoff describes as catching elevation drawings caught
**flat-shaded** ones. `props.BENCH` is D over C over B across twenty-one solid
columns and was caught instantly; the pergola's beam grid is just as flat and
scored nothing, because the timber repeats every five pixels and every fifth
column happens to hold the same key in both rows. **The edge was broken into
six-pixel pieces by its own grain.**

Letting a run survive one column of agreement fixed that and promoted every
dithered ground tile in the game to the top of the table — `plunge-pool` at
1.00, a 64px "seam" on every row.

> **AN EDGE IS THE SAME TRANSITION ALL ALONG IT.** Where two faces of a solid
> meet, one surface is above the line and the other below, so the transition
> repeats. A dither is a different pair almost every column, because both sides
> are ONE surface shuffled.

`SEAM_KINDS = 3`, chosen by sweeping 3/4/5/6/8/12 and reading the whole
catalogue at each: **24, 29, 35, 36, 39, 44** flags. Three is tightest AND
catches the pergola at 0.96 — fewer flags than the original strict version's 26
while seeing a fault it was blind to. Both mistakes are now controls in
`test/iso-geometry.test.mjs`.

**This is the third time this week an instrument has been wrong in a way only a
picture could show.** The audit is a ranking, not a verdict, and the reason it
must never become a gate is that it has been demonstrably blind twice.


### Gates — the ask that the group name was already waiting for

> *"in the original picture i was trying to use the pergola as a gate. what i
> think we really need are separate gates / archways for the various walls."*

`joins` in js/catalog.js is a GROUP NAME defaulting to the id, so nothing
connects to anything it is not — **and a gate overrides it.** `hedge-arch`
declares `joins: 'tall-hedge'`, the hedges either side reach for it and it
reaches back, and a gateway set into a hedge becomes one continuous object with
a hole in it rather than an ornament standing where a hedge is missing.

It is a **catalogue** decision, not an art one, and deliberately: an artist who
draws an archway should not have to know which wall a designer will hang it in.

| wall | its gate | |
|---|---|---|
| `tall-hedge` | `hedge-arch` | art already existed; only the group was missing |
| `palisade-fence` | `palisade-gate` | new |
| `dry-stone-wall` | `drystone-gateway` | new |

**`axialJoins`, not `linearJoins`.** `linearJoins` cuts a bar at its hub and
recombines the halves — right for a wall, fatal for a doorway, because half an
arch is a post and a piece of lintel and two of those from different directions
is rubble. A gate is drawn WHOLE; every mask resolves through `joinAxis` to
itself or its mirror.

#### Two things the art had to learn

**A GATEWAY HAS TO ANNOUNCE ITSELF.** A drystone wall is thirteen pixels high,
and carving a doorway into it gave a dark smudge invisible at 1x — correctly,
because a hole in a knee-high wall is a gap you step over. The hedge arch had
already solved this by standing four pixels proud of its hedge (a uniform rise
at every column, measured; not a ragged seam). So the piers build UP and a
lintel bridges them.

**A PIER IS MASONRY.** Drawn as bare four-pixel strokes they came out as a wire
bracket hovering over the stones. The wall's own cap-and-face painting is now
`column(x, far, foot)` and the piers are built with it: if a pier does not get
the same treatment as the wall it stands in, it is not the same wall.

#### The tests guard the sharing

`every entry declares which run it belongs to` used to assert all join groups
were DISTINCT, which is now deliberately false. It splits: a group with more
than one member must be a wall plus pieces tagged `gate`, the wall must be the
one whose id names the group, and no gate may join only itself. **It caught
`hedge-arch` immediately**, sharing tall-hedge's run without being tagged.

The `gate` tag is new. The pair `enclosure`/`gate` is the barrier-and-its-
doorway symmetry this design has now learned three times — hedge/arch,
cliff/ramp, wall/gate.

#### Still without a gate

`clipped-hedge` (you step over a knee-high hedge — a gate would be odd) and
`balustrade` (not joined yet; see its note above). `pergola-arch` and
`ruined-archway` are two more DEAD arch sprites in decor.js, both drawn as
front elevations — either redraw one as the neoclassical garden arch and hang
it in a hedge run, or delete them.

#### And a warning about how this was nearly lost

The drystone gateway went in by string-replacing a block whose pattern —
`for (let x = 0; x < len; x++) { const far = y0 + x / 2;` — also matched a
DIFFERENT generator in the same file that happens to share those four variable
names. It spliced the wall's helper into the hedge screen and broke props.js.
`git diff --stat` showed 101 insertions against 115 deletions on a change that
should have been additive, which is the tell; `git checkout` cost nothing
because the pergola work was already committed. **Commit before surgery, and
read the stat line before the error message.**

## 8 · THE DAY AFTER — 2026-08-03

Two asks, and they are the same ask wearing different clothes: **a garden is
something you WAIT for and something you LOOK at, and both were slightly
broken.**

### The clock lever — `1x / 2x / 4x` on the topbar

> *"it might be nice to have a tool to make time advance faster up on the top
> bar"*

Every builder in this lineage has one, in this corner, and a game about growing
things has the strongest case of any of them. It is **one cycling button** and
not three, because the bar is 640 logical pixels wide and already carries six.
It sits **beside the clock rather than with the tools**, and that placement is
the argument: everything in `bar-right` does something to the GARDEN, this does
something to the WATCHING, and `day 3 · afternoon  2x` reads as one sentence.

**THE LAW, and it is the whole feature:**

> **THE STEP IS NEVER SCALED. ONLY THE NUMBER OF STEPS.**

The simulation is fixed-timestep on purpose — a 144Hz monitor and a 30Hz one
grow the same garden because both advance in 1/20s increments. The obvious
implementation is `sim(SIM_DT * speed)`, it works, and it quietly undoes that:
growth curves, field ageing, the ladder and creature legs all integrate per
step, so a 4x garden would be a COARSER garden, and `_leg` measurably overshoots
corners when the leg gets longer. So speed multiplies the ACCUMULATOR. At 4x,
four times as many identical 1/20s steps run per frame — arithmetically the
same as having left the tab open four times as long.

Which is why **no other file in the game knows this control exists.** main.js
owns a number; ui.js reads it to label a button; input.js goes through ui.js.
`fields.js`, `creatures.js` and `world.js` were not touched and cannot tell.

| | |
|---|---|
| `main.js` | `SPEEDS`, `simSchedule(acc, dt, speed)` — pure, exported, tested |
| | `game.speed` / `setSpeed` / `cycleSpeed`, and the catch-up guard scales |
| `ui.js` | `btnSpeed`, `syncSpeed`, `cycleSpeed`; hides itself if the host has no control |
| `input.js` | `.` `>` faster, `,` `<` slower |
| `css` | `.bar-btn.is-narrow` |

**The guard had to scale with the speed.** `MAX_CATCHUP` is a spiral-of-death
guard, not a speed limit: left at a fixed 5, a 4x frame owing 8 steps would drop
three of them EVERY frame, the button would read 4x and the garden would run at
about 2.5x. There is a regression test for exactly that number.

**The button WRAPS and the keys CLAMP**, deliberately. A one-direction button
that goes dead at 4x strands the player; a key you can hold has to have an end.

**Measured in the running game**, not just asserted: 2.00 / 4.00 / 8.15 garden
seconds per two real seconds — ratios 2.00 and 4.08.

**There is no 0x.** `game.pause` already stops the frame; a zero in `SPEEDS`
would be a second, silent way to pause that keeps rendering, and two owners for
one state is how this renderer lost its camera once already. A test refuses it.

### The back rim — one pixel, and a hill gets a back

> *"we need a line on the back edge of the grassy hill tops, otherwise they are
> invisible."*

He is right, and the cause is **projection, not art**. A tile standing above the
neighbour BEHIND it exposes a face pointing away from the camera, so nothing is
drawn — correctly — and grass on a terrace meets grass on the floor with no
mark between them. A three-level hill reads as flat meadow until you find its
front. This is the oldest fix in draughtsmanship: an **occluding contour**.

- **`iso.js` gained `BACK_SIDES` and `backNeighbour`**, the mirror of
  `FRONT_SIDES` / `frontNeighbour`, so which edges those are stays owned by the
  module that owns the projection. Re-deriving it at the call site is precisely
  how the front faces once ended up on the hidden side of the hill.
- **The colour is soil** — `contactShadow(GROUND_DEFAULT)`, the ground ramp
  darkened two steps, palette.js's own rule and never a translucent black. It is
  the same colour, to the byte, as the cap at the top of every visible cliff
  face. That is not a coincidence dressed up as one: **the far edge of a plateau
  IS the top of a cliff**, and the player is looking at the one line of it that
  clears the brow. Front and back agree without anyone matching them by eye, and
  the palette gains nothing.
- **The line is taken from `tileMask()`**, so it cannot land a pixel off the
  diamond it belongs to and cannot bleed onto the tile behind — which, in this
  painter's order, is a tile that was already finished.

#### THE MISTAKE, and it is the one worth reading

The first version walked the sixteen ROWS and marked the outermost pixel of
each. **All four tests passed.** The rim existed, it was the right colour, it
stayed inside its diamond, flat ground got none. And on screen it was a
**DOTTED** line — because a 2:1 edge moves two pixels across for every one
down, so those marks touched only at their corners. It read as a UI overlay laid
over the grass rather than as an edge of the ground, which is worse than the
problem it was fixing.

Walking the THIRTY-TWO COLUMNS instead and marking the topmost pixel of each
gives two pixels per row — the solid stair every other 1-in-2 line in this game
is drawn with, and the same rule as `LINE_DROP` in art/format.js.

**Nothing caught it but rendering the thing and looking at it.** So the look is
now written down as `THE RIM IS CONTINUOUS`, which walks both stamps as one
brow and asserts 62 columns with no gap and no jump greater than a row. Fed the
old by-row algorithm it reports **32 columns of 62 and 30 gaps** — the test was
checked against the bug it exists for, rather than only against the fix.

That is the third instrument in two days that was blind when it was written.
The pattern is now unmistakable: **an assertion about a picture that was never
compared to a wrong picture is an assertion you are trusting on its own word.**

### The brush — `1 / 2 / 3 / 5`, and hills stop being forty clicks

> *"it would be nice if you could change the size of your selection like
> changing the size of your brush in a painting application, 1 square, 2 square,
> 3 square, 5 square. this is especially useful for hills. the easiest way to
> implement it is to make it work on any one tile placements."*

**THE BRUSH IS THE WIDTH OF THE STROKE**, and that is the whole mechanism.

The terrain tools already dragged a rectangle, so a brush of n is not a second
concept bolted alongside — it THICKENS that rectangle by n-1, which is exactly
what a wide brush does to a stroke in any paint program. A press with no drag is
then an n x n square **for free**, and that is the case the owner asked for. A
five-brush dragged five tiles paints a 7 x 5 terrace in one gesture.

**It grows toward +tx / +ty**, the same corner every multi-tile placeable in the
catalogue already anchors at. A brush that grew from its centre would be a
SECOND anchoring rule, and the 2x2 path under the cursor would sit somewhere
the 3x3 brush did not.

**Sizes are 1, 2, 3, 5 — not 4.** The useful sizes in a paint program are the
ones you can tell apart at a glance; 4 reads as 3-or-5 and doubles the wheel's
travel for nothing. Past 5 it stops being a brush and starts being a fill.

| where | what |
|---|---|
| `ui.js` | `BRUSHES`, `btnBrush`, `syncBrush`, `cycleBrush`; `on.brush` pushes the change |
| `input.js` | `brushSize` / `brushable` / `brushTiles` / `withBrush`; `placeOne` and `removeOne` split out |
| `main.js` | `on.brush` → `input.refreshGhost` (a late read — input.js is built after ui.js) |
| keys | `[` smaller, `]` bigger — what every painting application binds |

**ONE CHOKE POINT, and it matters.** `doTerrain` applies the brush, so every
caller — the drag, the `+`/`-` nudge, the keyboard tool — arrives with a centre
line and leaves with a stroke. `terrainRegion` thickens the PREVIEW by the same
rule, and its output never reaches `doTerrain`, so the two cannot double up.
Verified by grep before it was written: `terrainRegion` has exactly one caller.

**A stroke does not refuse itself because one tile is occupied.** Each tile is
asked separately and the ones that say no are simply not painted — a brush that
only works on perfectly empty squares is a brush you cannot use twice in the
same place. The reason is spoken only when NOTHING took, which is the one case
the player is owed an explanation. The ghost uses the same any-tile rule, so the
preview cannot promise what the click refuses.

**A multi-tile placeable ignores the brush**, per the owner's own scoping. A 2x2
path repeated on a 3x3 brush overlaps itself six ways and the player cannot
predict which nine of the sixteen tiles they are about to cover.

**The ground painter's drag takes it too**, and that is worth recording because
it was nearly written down as a gap. `doPlace` is called per tile as the pointer
crosses, so a wide brush leaves a wide trail — but that was a guess until it was
tested, and the first draft of the backlog said the opposite. The test DRAGS
rather than clicks, because a test that only clicked would have agreed with the
wrong sentence. Same disease as everything else in this handoff: a claim about
the code that nobody made the code answer.

**A brush stroke is still ONE undo step** — the property the terrain drag
already had, and the one a brush is likeliest to break. Measured live: a
5-brush drag plus a 3-brush click made 48 raised tiles; one undo left 9, the
second left 0.

### The rock scramble — it was not turning BADLY, it was not turning AT ALL

> *"rock scramble does not rotate properly like the other stairs."*

`rock-scramble` sat at **facings 1**. It was never added to catalog.js's
`TURNS` when the facing wheel was built, and **nothing anywhere asked** — so
the one connector a satyr garden actually wants could only ever climb toward
-tx, and a player who terraced a hill and wanted up from another side was given
no reason why.

The fix is the earth ramp's, unchanged: `rampSurface` already takes `near`, and
`s` instead of `1 - s` turns the height field round — the 180-degree twin the
mirror cannot reach, because a vertical flip is forbidden here (light is always
upper-left). `ROCK_SCRAMBLE.back = ROCK_SCRAMBLE_NEAR`, and `TURNS_FOUR` gains
one name.

**The near drawing needed the wall treatment, for the third time.** Its high end
is the edge closest to the camera, so what the player sees is a 16 px face with
a sliver of boulder above it, and 16 px in one value reads as a HOLE in the
ground. Split by side — the left lower edge is turned toward the light, the
right away.

#### `near` HAD TO BE GATED, and that is the part worth reading

The first version keyed the wall branch on `lift > 3` alone. But `lift` reaches
16 on the AWAY drawing too — at its back edge, where the face is a hairline
nobody sees — so the branch fired on a drawing that was already right and
repainted it. On the stone stair (tried at the same time) the treads stopped
reading; on the scramble it was subtler and might have shipped.

**A `back` drawing must not change the front.** That is now checked the only way
it can be: render both connectors' away drawings and compare them against
`git show HEAD:` in a throwaway worktree. All three came back BYTE-IDENTICAL.

#### Two instruments were certifying one sprite

Fixing the scramble exposed the same shape of fault in the tools twice:

- `elevation-probe.mjs`'s `ramps` scene had `EARTH_RAMP` **hard-coded**, so the
  four-sided look could only ever be taken of the earth ramp. It is
  `connectorScene(artName)` now, with a `scramble` scene beside `ramps`.
- `test/facing.test.mjs`'s two connector tests — *"a second drawing, and it is a
  different picture"* and *"the two drawings tilt opposite ways"* — both
  destructured `EARTH_RAMP` by name. When the scramble gained a second drawing,
  **neither test noticed it existed.** Both derive their list from the catalogue
  now, so the next connector is covered by authoring art and nothing else.

**AN INSTRUMENT BUILT AROUND ONE SUBJECT CERTIFIES THAT SUBJECT AND NOTHING
ELSE.** Fourth blind instrument in three days.

#### The guard that was actually missing

`EVERY CONNECTOR TURNS` — a new test refusing any entry tagged `connector` with
fewer than two facings. That is the check that would have caught this without
the owner having to notice, and there was none.

#### NOT DONE: the stone stair still only turns two ways

It was tried in the same pass and **reverted, deliberately.** The mechanism
works — it takes `near` as readily as the others — but a flight of dressed steps
coming at the camera came out a grey lid with a pale wedge on it: almost no
tread reads, because the near flight is nearly all end wall and dressed masonry
has none of the rock scramble's texture to carry that. It wants an authored
drawing, not a flag. `stepped-terrace-wall` is in the same position.

Both still turn TWO ways, which is what they did before, so nothing regressed —
they simply cannot yet be climbed from the camera's side.

### Where it stands after these four

| | |
|---|---|
| tests | **432** (was 409) — 8 clock, 5 rim, 8 brush, 1 connector guard |
| playtest | 49 / 49 |
| `iso-audit --strict` | 1 of 311 — `balustrade`, unchanged |
| elevation probe | clean; palette purity 0 offending colours |
| verified | in the running game, in a NAMED garden — never the owner's default |
| the hill | a two-level terrace in TWO gestures, its back edges drawn |

## 9 · THE PERCEPTION LAYER — 2026-08-03, later

Two proposals were written and then the ratio was called out, correctly: **the
plan had grown faster than the game.** The owner's steer, and it is a good rule
to inherit —

> *"per-facing idle + occlusion before deeper path logic. Those are
> perception-layer fixes: they make today's satyr readable before asking the
> player to notice tomorrow's intent."*

### 9a · A creature that stops keeps the way it was going ✅

**Idle had no facings.** `this.facing` is written by `_leg` and `js/main.js:1413`
has ALWAYS resolved it to one of the four art names and handed it to
`creatureFrameAt` for every pose. Idle was the only cycle that threw it away, so
a creature that walked north-west and halted snapped round to face the camera at
the end of every leg, and had done since the day it was drawn.

**No new art.** `spec.layers(kind, i, back)` already took the back flag for every
kind and `mirrorRelit` already re-lit a mirrored frame, so idle and walk are now
built by the same loop — they were always the same problem. Measured, all five
creatures: four distinct drawings. The mirror is the big change (satyr 276 px,
centaur 1000, unicorn 1011); the head turning away is the small one (51, 53, 25).
Census 134 → 194. Sheet: `docs/shots/idle-facings.png`.

> ### WHY THIS IS A PREREQUISITE AND NOT A POLISH ITEM
> Everything in `PROPOSAL-GOAL-BASED-WANDERING` rests on "the creature is
> looking at that". Without facings the loop is not half-rendered, it is
> **ANTI-rendered**: the creature walks to the urn, turns to face it, and then
> visibly turns away to stand front-on. It says the opposite of what it means.

**And the same fault twice more, in the things that WATCH it.** Both
`allCreatureSprites` and `tools/poseshot.mjs` named `walk` as *the* pose that
turns, so the lint pass — the only consumer that sees every frame — threw
instead of counting, and the instrument could not photograph the change it
exists to photograph. Both ask the pose its shape now. **Fourth and fifth
one-subject instrument of the arc.**

### 9b · A mover takes its height from the tile it is over ✅

`_liftDrawList` read a mover's level at `Math.floor(tx)`, but a mover is DRAWN at
`(tx + 0.5, ty + 0.5)` — so the tile it stands over is `Math.round(tx)`. It took
its height from the tile BEHIND it for the whole second half of every tile.
Invisible on flat ground; a whole level on a terrace edge.

The test asserts the SHAPE — the height must change exactly once crossing one
step, and at the half-tile — so it fails on the bug rather than merely agreeing
with the fix.

### 9c · THE OCCLUSION DEFECT — measured, characterised, DELIBERATELY NOT FIXED

A creature climbing a ramp is drawn INSIDE it. Verified by first-hand
measurement, not taken on an agent's report:

| creature x, walking uphill | pixels destroyed |
|---|---|
| 7.4 | 0% |
| 6.8 | 0% |
| 6.5 | **21%** |
| 6.2 | **41%** |
| 5.8 | **72%** |

**The mechanism is exact.** A mover at `(5.8, 6)` keys `(5.8+6)*7 + 1 = 83.6`;
the ramp tile at `(6,6)` keys `12*7 + 0 = 84`. The ramp draws last and paints
over him. **A mover's FRACTIONAL `tx+ty` falls below the tile's INTEGER as it
climbs**, and the level term does not cover the gap.

**Why it did not ship.** The obvious fix — pin a riding mover's key to the tile
it rides — moves the key by up to **3.5, half a diagonal band**, at exactly the
boundary the fractional key exists to smooth. `iso.js`'s own header names that
pop as the bug it was written to kill. Certifying it needs enumeration over
facing x tread position x neighbour level 0..6 across BOTH adjacent diagonal
rows. **A screenshot cannot certify it, so it was specified rather than guessed
at.** See `PROPOSAL-STAIR-CLIMBING-2026-08-03.md` §2.

### The two proposals, and what they are for

| document | the finding that justifies it |
|---|---|
| `PROPOSAL-STAIR-CLIMBING-2026-08-03.md` | the pop is a WRITTEN DECISION (`main.js:1430`), not a bug; and 391 of 607 connector crossings never change level, so pathing must land first |
| `PROPOSAL-GOAL-BASED-WANDERING-2026-08-03.md` | the ladder is already a desirability function; and the owner's invariant BROKE under test — 25% of Pan's attention went to a courtyard he has no requirement for |

**Neither is started.** Both are ordered, both name what must land first, and
both record what NOT to build.

### Where it stands at the close

| | |
|---|---|
| tests | **436** |
| playtest | 49 / 49 |
| `iso-audit --strict` | 1 of 312 — `balustrade`, unchanged all arc |
| elevation probe | clean; palette purity 0 |
| commits this arc | 22, `503ff57` → `28fa7dc` |

## Maker's mark

Fourteen commits, and the thing worth handing on is not any of the features.

**Every fault today was a sentence that was not true of the code beneath it.**
The bench's blurb described art it was not drawing — *"a stout **fluted** shaft
with a plain square capital"*, on a sprite with neither. The fence's header
insisted on a 1-in-2 slope four lines above the line using 0.4, under the words
*"the one thing that has to be right"*. The connectors' header claimed a
horizontal flip could reach all four orientations, and it cannot reach two of
them. The pergola's own note said it ran along the tile axis; it was a front
elevation.

This codebase comments unusually well, and **that is exactly what makes a stale
comment dangerous**: a reader trusts it, the next author trusts it, and the
claim outlives the code it was written about. So the sweep I would hand on is
one sentence long — **read the comment as a claim and check it.** It has a
better hit rate here than any search I ran.

The smaller sibling: **ask what nothing points at.** `iso-audit --catalog` says
87 of 237 sprites are reachable. Two of the day's three named objects were fixed
by editing one string, because the good picture already existed, unreachable,
registered under the very id that was not asking for it. Before drawing
anything, check whether you are about to make something the tree already has.

### The part I got wrong, three times

I shipped three instruments today and **two of them were blind when I wrote
them**, in ways only a picture revealed:

- the elevation measure caught flat-shaded elevations and missed **textured**
  ones, so the most blatant front elevation in the game scored zero;
- loosening it turned every dithered ground tile into a 1.00, because I had
  measured *how much changes* rather than *whether it is the same change*;
- and `joinshot`'s own gate probe put its gate on an end piece, at the frame
  edge, where a gate proves nothing.

None of those was caught by a test. All three were caught by rendering the
thing and looking at it. Which is the argument for `--elev` never becoming a
gate, and for `SPEC §10` — *an artist must be able to see their own work* —
applying to instruments as much as to art. **A measure you have not looked
through is a measure you are trusting on its own word.**

### And one near-loss

The drystone gateway went in by string-replacing a pattern that also matched a
different generator sharing four variable names. `git diff --stat` read 101
insertions against **115 deletions** on a change that should have been purely
additive. That line is the tell, and it is faster to read than the error. The
restore cost nothing because the previous piece was already committed.
**Commit before surgery.**

## The forward dream

That a player drags a hedge round three sides of a lawn and it turns both
corners without being asked — which, as of tonight, it does — and hangs a gate
in it that the hedge grows up to meet, which it also does.

What is left is the half the garden cannot yet answer for itself. **A ramp
placed against a terrace still does not know which way is up**: the player has
all four directions now and has to choose among them, when `world.levelAt` on
four neighbours would choose correctly every time. **The balustrade still
cannot join anything**, because its anchor sits at the slab's far corner
instead of the run's midpoint — one decision with three faces, and it waits on
the shadow stamp it has waited on since the last arc.

And the sleeping satyr is still drawn in elevation. He has been since the day
the project began, in the one sprite that gets the most care, and he is the
last object in the game that would have to be redrawn rather than reasoned
about. That one is not a sweep. It is a commission, and it is still the owner's.

*— Claude Opus 5, 2026-08-02*
