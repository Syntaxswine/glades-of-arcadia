# HANDOFF — The First Glade

**2026-07-31 · the keystone. Read this before you touch anything.**

Reconciled against `proposals/BACKLOG.md` in the same pass, per the standing rule.

---

## Where it stands

**LIVE:** https://syntaxswine.github.io/glades-of-arcadia/ — Pages from `main` **root**.
Repo `Syntaxswine/glades-of-arcadia`. Deployed and verified at HEAD, not merely pushed.

```
365 tests            node --test "test/*.test.mjs"
46 playtest checks   node tools/playtest.mjs        no structural faults
anchor audit         node tools/anchor-audit.mjs --strict     exit 0
iso audit            node tools/iso-audit.mjs --strict        exit 0
                     0 of 237 flat at ground (was 48). IN npm run check.
npm run check        test + playtest + build, green end to end
art debt             ZERO   (was 28 understudy sprites)
map                  60 x 60, and a new game starts on plain meadow
placeables           130, of which 17 can be turned round
save format          v3   (facing; a v2 garden loads and re-saves identical)
front door           Continue / Gardens / Recover — every garden reachable
getting about        minimap (upper right), the move tool (X), WASD/arrows
turning              the scroll wheel, when what you hold has a direction
asking               ? picks up a help cursor, and it answers about RUNGS
cheat                ?play=1&new=1&garden=all  — all four species welcome
dependencies         0        external assets   2 (the score, the title art)
```

It is a **complete, playable game**. Terrain raises and lowers, five grasses
resolve and contest, creatures arrive and settle, waterfalls fall, the music
starts when the satyr walks in. What remains is refinement, and it is in the
BACKLOG.

## READ IN THIS ORDER — and mind the trap

1. **`docs/RESEARCH.md`** — three sourced briefs: late-90s isometric pixel-art
   craft, mythological habitat lore, cosy-builder design. Nearly every good
   decision in this repo traces to one of them.
2. **`SPEC.md`** — the base contract.
3. **THE ADDENDA IN `docs/`, WHICH SUPERSEDE SPEC IN PLACES.** This is the trap
   that will cost a session if you miss it:

| addendum | what it overrides |
|---|---|
| `ZONING.md` | **Replaces SPEC §6 entirely.** Five *species affinities* painted into the grass, NOT five abstract axes. `wildness`/`order`/`moisture` are retired. |
| `ELEVATION.md` | Adds levels, terraces, connectors, caves, waterfalls. Slopes are permanently neutral. |
| `DECOR.md` | The affinity set + the ~60-item decor layer. Weight gradient 1.0 / 0.7 / 0.5. |
| `TOMBS.md` | Tombs grant maturity; nullifiers; the hidden ET IN ARCADIA EGO. |
| `AUDIO.md` | Relaxes "zero external assets" to exactly one. The satyr trigger. |
| `CREATURE-MOVEMENT.md` | The off-map invariant and per-species water rules. |
| `FLOURISHES.md` | Adds the idle life — repeatable acts that are NOT beats. Poses beyond idle/walk/beat, one-shot gestures, and why a flourish must never reach the journal. |
| `TITLE-AND-CONTROLS.md` | **Supersedes SPEC §1's asset rule and §8's key bindings.** The front door, why the wipe is a navigation, the 60x60 blank map, the letter/number keyboard, the minimap, the move pad, the `?` cursor, `?garden=all`, and the caching that makes a reload lie. |

**SPEC.md §5 still says "45–60 placeables". It is stale.** There are 130. The
test asserting the old range was corrected, not suppressed.

**SPEC.md §1 says "one external asset, and exactly one. No image files."** There
are now TWO and one of them is an image: the score and `TitleScreen.png`, both
the owner's, both outside the simulation. `TITLE-AND-CONTROLS.md` is where that
is written down. The game WORLD is still entirely authored pixels and that part
must stay true.

## The laws — do not "improve" these

Each of these is load-bearing and each has already been argued out. If one looks
wrong, read its comment before changing it; they carry the measurements.

- **`grass` mid `#74863C` is LIGHTER than `canopy` mid `#47632F`.** Trees must
  read *dark* against ground — it is how a map full of foliage stays legible at
  1×. Brightening the trees or darkening the grass turns the screen to mush.
- **The water ramp's span is held at ~30% dark→light.** A 61% span read as churn
  and foam rather than a water *surface*. **Span is the governing number**; move
  the mean if you must, never the span. And: bright reads *tropical* only when
  **saturated** — a bright *desaturated* step reads as glint. That single insight
  bought lower key and 58% more shimmer at the same time.
- **Contact shadows are the ground ramp darkened two steps. Never translucent
  black** — it greys the whole scene and is the clearest tell of a modern fake.
- **Light is upper-left. Always.** Consistency matters more than the direction.
- **`LEVEL_H` is defined in `iso.js` and nowhere else.** Do not re-type 16.
- **`MAP_W` / `MAP_H` are defined in `iso.js` and nowhere else** — and `main.js`
  carrying a second copy was worse than a duplicate, because iso.js's pair were
  DEAD (default parameters only). Editing the obvious declaration changed
  nothing. **Measure `_rescan` before growing the map again**; it is the thing
  that goes quadratic, and 60x60 is already 58 ms a scan.
- **The New Game wipe is a NAVIGATION, not a teardown.** A fresh document cannot
  inherit stale state. Do not "optimise" it into an in-place reset.
- **Cosy guarantees (SPEC §0) are absolute.** No fail state, no score, no
  economy, nothing ever taken. **A settled creature never leaves the garden** —
  it goes restless and relocates. A journal entry is never un-filled.
- **Non-rectangular footprints are forbidden.** They create genuine occlusion
  cycles no scalar depth key can resolve.

## The traps — every one of these actually bit

**Art**

- **Authoring pixel art blind does not work.** Two full passes failed, producing
  overlapping translucent capsules that read as a balloon animal. The cure is
  `tools/snap.mjs`: the page rasterises itself to a PNG on disk and the Read tool
  renders it, so an artist can **look at its own work**. Everything good-looking
  here came after that existed. *Never author art blind again.*
- **Silhouette first.** Block it in flat black on white and read it back. If the
  silhouette does not read, no amount of painting will save it.
- **The shading pass throws away every value a clump was authored with. Only
  SHAPE survives.** Lobes must be notches in the *silhouette* with real
  background in them — cut as interior holes they render as smooth blades. And
  `fillGaps` will cheerfully close the notches that *are* the fig leaf.
- **A multi-tile sprite must cover its footprint.** An fw×fh base's front vertex
  is `(fw+fh)*8` below the anchor. Three tombs floated; the owner spotted one.
  `anchor-audit.mjs` now catches it — and caught a **fourth** the same day, in a
  file written hours later. Do not fix a float by shifting the anchor: that
  drops it onto the ground while leaving it on the back half of its plot. Same
  bug wearing a hat. The test has a ceiling for exactly that.
- **The load-bearing grass rule bites back.** Asphodel's strap leaves came out at
  grass mid and were invisible *on grass*. It moved to the `olive` ramp.
- **An object held at the face must be narrow enough for the face to survive
  it.** Both of the satyr's flourish poses were rebuilt four or five times and
  every failure was this one. A syrinx fourteen pixels wide is a washboard bib;
  hung below the beard to spare it, a necklace. Six wide at the lips, with beard
  showing either side, reads as playing. Same for the cup.
- **Hue is not a read at this size; LUMINANCE is.** The syrinx moved from the
  earth ramp (his own skin) to olive and *still* vanished — olive light and flesh
  mid are 132 and 129. It took striping the lightest olive against a dark one, a
  63-unit break, so the instrument carries its own contrast rather than borrowing
  it from whatever is behind it.
- **Two pixels can be the whole animation.** The tell for the drink is his eyes
  closing. An earlier pass re-authored the head tipped back and it read as his
  head *shrinking* — fourteen rows is not enough for a rotation to look like
  anything but a different head.

**Engine**

- **Clamp at the write, not at the producer.** The off-map invariant lives in
  `Agent._place` — the single place x/y are ever written — not in
  `_wanderTarget`. Fixing the producer protects against the bug you found;
  fixing the write protects against the next one. It immediately exposed a
  second, unreported sky bug: the `thrives` companion stood in the void forever
  on a corner home, and a loaded save reinstated it.
- **Fades are a Bayer dissolve, never `globalAlpha`.** A frame audit found 59
  blended near-duplicate colours the palette never authored. Alpha would
  reintroduce that ladder on every visit.
- **Picking runs the painter's algorithm backwards.** With height, one screen
  pixel can be inside up to seven diamonds, and cliff faces are clickable pixels
  belonging to *no* diamond. First-hit in reverse draw order is by definition the
  last thing painted.
- **A test that asserts labels does not assert behaviour.** The `FRONT_SIDES`
  guard checked the strings `['se','sw']` and would have passed with the deltas
  swapped — which is exactly why a phantom bug got reported. The new test binds
  labels → deltas → the screen projection itself.

**Repo**

- **`dist/` is gitignored.** It duplicates the 5.1 MB mp3; Pages serves the module
  tree from root. Rebuild with `npm run build`.
- **`docs/shots/` is gitignored** (hundreds of iteration renders). Curated images
  live in **`docs/img/`**, which is tracked.

## The instruments, and the discipline behind them

Build the tool that proves the thing; the tool is part of the deliverable.

| tool | what it refuses to let you ship |
|---|---|
| `tools/playtest.mjs` | an unreachable creature · an hour that could deal nothing · a placeable drawing an understudy sprite (it names each and what it wants) |
| `tools/anchor-audit.mjs --strict` | a sprite floating above its own footprint. Multi-tile only, on purpose — a herm correctly stands at its tile centre |
| `tools/snap.mjs` + `serve.mjs` | art authored without ever looking at it |
| `tools/poseshot.mjs` | an animation judged one frame at a time. Lays a whole cycle out on real ground with each frame's hold printed. `--sil` first, always; `--only 0,3` to magnify past the ~2000px ceiling where a full strip stops getting bigger |
| `tools/spritelab.html` | every sprite and composer at 1×/4×/8× with anchors marked, **and now the world's coordinate system too**: `?iso=diamond,hex,guide,base,only` draws the ground diamond, the cube hexagon, a 2:1 lattice and the measured base contour painted onto the sprite. It used to draw only the FILE's square grid, and that blind spot hid a fault across a third of the art |
| `tools/iso-audit.mjs` | a horizontal edge where an object meets the ground — i.e. art drawn on the screen plane instead of the ground plane. `--runs` prints the exact columns. **11 of 237 still fail**, down from 48, and `test/iso-ground.test.mjs` ratchets that list: it fails if one regresses AND if one is fixed without being struck off |
| `tools/isogeom.mjs` | the geometry itself, stated ONCE and imported by the audit, the sprite lab and the tests. Two of them disagreeing about what a legal edge is would be invisible — the lab would draw a guide the audit does not measure against |
| `__lab.shot('name')` | in the sprite lab: one named sprite, with the iso overlay, on disk through `snap.mjs`. The redraw loop is edit / measure / **LOOK**, and the looking is the step that gets skipped unless it is one call away |

`npm run check` runs the lot.

## Music

`audio/glades-of-arcadia.mp3` — **the owner's own track, made with Suno,
non-commercial.** Code and audio are licensed **separately**; the README says so
and it must keep saying so.

**It starts when the first satyr walks onto the map, not before.** Satyrs are the
musicians of the myth. Autoplay policy means it is primed silently on the first
gesture and *played* on his arrival; `musicUnlocked` persists in the save.

**And he plays it.** When the score starts he stands and pipes for three minutes,
with notes rising off the reeds. See `docs/FLOURISHES.md` — the recital is
hand-started by `main.js` and nothing else may start it. Not armed on a restore:
a three-minute recital on every page refresh would turn the arrival into a chore.

## Open work

See **`proposals/BACKLOG.md`**. The largest item is that the catalogue drifted to
130 placeables against a designed ~93 and wants an audit for near-duplicates.
The most visible is that **sward and fen read too similarly** at a glance.

**The owner-set queue, as of 2026-08-01. Four of six closed in one session.**

| § | what | state |
|---|---|---|
| **4j** | **The art faces the viewer.** ✅ **CLOSED. 48 → 0**, and `iso-audit --strict` is in `npm run check`. FOUR SHARED HELPERS AND FOUR SPRITES did all forty-eight — both `skirt()`s, the hand-typed contact band, and `pool()`, which was wrong in *all eight* of its call sites. The three caves — the owner's own example — were rebuilt and occupy 3D space | ✅ closed · fault (B), the arch family's missing FRONT, is a separate art wave |
| **4k** | **The wheel turns what you are holding.** ✅ shipped. 17 placeables turn; four facings cost two drawings; `SAVE_VERSION` 3 with `facing` written only when non-zero, so a v2 garden round-trips byte for byte. **Only square footprints turn** — mirroring swaps the tile axes, and the catalogue self-check throws rather than half-work | shipped · multi-tile is the next step |
| **4e** | **The save screen.** ✅ shipped. Continue, Gardens, Recover, named new gardens, and the music credit. `.previous` is reachable at last — a promise the player could not collect on was not a promise | shipped · no delete, no rename, no export |
| **4i** | **Mobile mode.** Untouched, and still the owner's "kind of low on the priority list". Geometry, not controls — see the backlog body | **not started** |
| 4g | What was never verified by hand | ✅ **CLOSED** — every key pressed live, the suspected focus bug disproved, and one real bug found by doing it |
| 4h | Edges on the minimap / move tool / `?` / proving ground | partly closed — the `?` now answers about rungs, and had never identified a creature at all |

**The one thing on this list nobody has done is PLAY it.** The 60×60 map has
been measured, walked by synthetic pointer events and screenshotted. Nobody has
sat down with it for an hour. That is §4g's last line and no tool will close it.

---

## Closing the last eleven — 2026-08-01, last

**48 → 0.** The gate is on. What is worth carrying forward is not the number but
what the last eleven turned out to be, because it was the same story a fourth
time: **nine decor props had no contact shadow at all**, and **every pool in the
game was flatter than the ground plane allows** — eight call sites, ratios from
0.24 to 0.45, where a body of water lying on the ground is exactly 0.5.

`willow-water` was the only one the audit could see, because the others were
small enough or covered. The geometry was wrong in all of them.

> **THE ALLOWANCE WAS WRONG, AND THAT IS THE LESSON.** `curveAllowance` solved
> for the row where a ground circle holds within half a pixel of its lowest
> point — `2*sqrt(2r)`. The binding case is that when the true bottom row rounds
> away (whenever the centre sits on a half pixel, i.e. usually) the widest
> surviving row is the chord at `dy = ry-1`, which is `4*sqrt(r-1)`. At r=26 the
> real span is 20 and the old formula said 14.4.
>
> Three correctly-shadowed sprites failed by two or three pixels and looked
> exactly like art faults. **They were arithmetic faults, mine.** The test now
> DRAWS the ellipse and measures its own contour rather than restating the
> algebra, because an algebra error cannot survive a test that does not consult
> the algebra. If you write a threshold, measure the thing it is bounding.

**And one deliberate refusal.** The nine missing shadows could have been fixed
with an automatic pass — "any sprite without one gets one". That would have put
a dark ring around every PAVING tile in decor.js, because paving lies IN the
ground plane rather than standing on it, and no predicate separates the two.
There is only knowing which is which. Nine explicit `contact: r` at nine call
sites, and the reason written beside them.

## The world's coordinate system, the wheel, and a door — 2026-08-01, later

Four queue items in one run. The through-line is worth stating because it is
the same lesson four times: **an instrument that cannot see a fault will report
a green that means "not asked".**

### The art faces the viewer — §4j

The owner: *"there are several objects, like the cave, that are pointed straight
at the viewer instead of in the direction of the grid"* and *"would you benefit
from thinking in hexagons instead of squares?"*

`tools/isogeom.mjs` states the geometry once and is imported by the headless
census, the sprite lab's overlay AND the tests, because a lab drawing a guide
the audit does not measure against lets an artist align to the wrong line in
perfectly good faith. The lab can now draw the **ground diamond**, the **cube
hexagon**, a **2:1 lattice** and the **measured base contour painted onto the
sprite**, green where it steps and red where it runs level.

**THE MEASURE WAS WRONG TWICE AND THE THRESHOLD ONCE**, and all three are the
same error wearing different clothes:

| version | what it asked | why it was noise |
|---|---|---|
| `lift` | how far the contour's ends rise | depends on the sprite's SHAPE, and a chest corner-on and a single cliff face answer oppositely. 47 perfect terrain tiles convicted — `foot-rock-se-a` scored `diag 1.00` and `lift 0.02` at once |
| flat-runs-anywhere | level runs in the bottom silhouette | convicts the underside of a tree canopy, which is not a base. Leaves hang in the air |
| fixed 12px bar | any level edge at ground | a correct ground circle IS flat across `2*sqrt(2r)` px at its front. It convicted every large contact **for being round** |

The shipped rule: level runs where the object MEETS THE GROUND, against a bar
that scales with the size of that contact. **A checker whose threshold does not
scale with its subject is measuring its subject's size.**

Then the redraws — and **three shared helpers did thirty-seven of the
forty-eight**, which is exactly why the census was worth having first. Both
`skirt()` functions and the hand-typed `mmmm` contact band in `sprite()` were
drawing the patch of shade under an object as a rectangle or a 3.7:1 ellipse. A
circle on the ground is an ellipse **twice as wide as it is tall**;
`GROUND_ELLIPSE` in js/iso.js is that constant and the reason it lives there.

> **I shipped a regression doing it.** `groundContact` detects a hand-typed band
> as "a trailing row of nothing but `m`" — which is also true of the bottom rows
> of the correct ellipse `skirt()` had just drawn. On composed sprites it
> stripped the lower half of a right answer and rebuilt it flat: the heroon went
> from 12 px of level edge to 106, the worst reading in the catalogue, by way of
> a change that made eighteen other sprites right.
>
> **A REWRITE THAT DETECTS ITS OWN INPUT WILL EVENTUALLY DETECT ITS OWN OUTPUT.**
> The honest signal was not in the pixels at all — it was which constructor the
> author used. `test/iso-ground.test.mjs` is the ratchet that would have caught
> it, and it fails in BOTH directions so the known-offender list cannot quietly
> become a lie about how much is left.

**Two blind spots found on the way, both from a module list written before the
module.** The sprite lab's `CANDIDATES` never included `decor.js` or
`extras.js` — **47 sprites had never once appeared in it** — and
`tools/propshot.mjs` printed `MISSING` for any decor sprite as though the art
did not exist.

### The wheel turns what you are holding — §4k

Seventeen things turn and the rest do not, and the test for membership is not
"could it be flipped" but *would flipping it visibly change which way the thing
is turned*. A column is a cylinder; an urn is a solid of revolution. **A
rotation control over a rotational form is a control that visibly does
nothing** — the iso audit's own lesson, arriving from the other side.

The part that mattered was never the wheel. It was that `facing` is written
**only when non-zero**, so every existing garden serialises byte for byte as it
did under v2. `test/facing.test.mjs` opens with three tests about that one `if`.

### A front door you can come back through — §4e

Continue (focused, because a returning player came back for their garden and
New Game is the destructive one), Gardens, Recover, named new gardens, and the
music credit where someone who never reads a repo can see it. **Recover swaps
rather than overwrites**, so it is itself undoable: the player reaching for that
button already lost something once.

`js/saves.js` imports nothing so the title screen stays cheap, which costs one
duplicated constant — and `test/saves.test.mjs` OPENS by asserting it equals
`world.SAVE_KEY`. That assertion is the entire reason the duplication is allowed.

### And then somebody pressed the keys — §4g

Every binding verified live. The suspected focus-swallow bug does not exist.
But the `?` on a creature **had never worked once**: `creatureAt` read
`a.x`/`a.y`/`a.id` from a scene list built with `tx`/`ty` and carrying no
identity, so it matched nothing and every question about a satyr was answered
about the grass under him — **in a perfectly good sentence about a meadow**,
which is why it survived a whole session of review.

That is the strongest argument in this document for §4g existing at all. "Not
checked" and "checked and fine" are different states, and the gap between them
is where a well-written wrong answer lives.

### Two traps for whoever tests next

- **The camera is EASED.** A synthetic keypress or wheel event needs ~500 ms
  before the camera reading means anything, and a key left held keeps panning.
  Half an hour was lost to readings taken mid-flight.
- **`J` opens the journal, which is modal and swallows everything after it.** A
  keyboard sweep that presses `j` in the middle reports the rest of the
  keyboard as dead. It is not.
- **Test in a NAMED save slot** — `?play=1&seed=probe` writes to
  `arcadia.garden:probe`. I opened `?new=1` on the default slot, which archived
  the owner's garden to `.previous`, then restored it *from the page still
  running the game loop* — whose autosave wrote my test world back over it
  seconds later. The archive-then-restore was sound; doing it while the writer
  was live was not. **A 35-object garden in the dev browser was lost.**


## PROPOSAL — ONE SHADOW SYSTEM, AND A MEASURED CENTRE POINT

**Owner's call, 2026-08-01: "the baked shadows should go... with the asterisk
that we get a fixed measured centre point variable that tracks where the middle
of the object is based on its size."** Agreed and specced here; NOT built.

### Why it came up

The owner spotted the heroon and the tumulus floating. That is fixed
(`27b4cfe`). But the investigation found **three** regressions from the same
commit series, all with one root: when `skirt()` became a correct 2:1 ground
ellipse, the baked contact shadows went from 3-4 px slivers to full ellipses --
3x to 17x more pixels -- and every latent problem with baking a shadow became
visible at once.

| # | what | status |
|---|---|---|
| 1 | four shadows placed 12-27 rows below the anchor, so the object floated over a puddle | SHIPPED FIXED |
| 2 | **the baked shadow is grass-green on every ground.** `m` is `#3B4A22`, the darkest key of the GRASS ramp. On flagstone, gravel, sand or paving every prop now stands on a dark green mat, wider than the object. Rendered and confirmed by eye | **OPEN** |
| 3 | **five shadows are cut off square by the bitmap's SIDE edge.** Both `skirt()`s grow the grid downward only; `put()` still drops out-of-range *x*. The balustrade's shadow runs hard against column 0 for 19 rows -- the same fault the downward growth exists to prevent, arriving sideways | **OPEN** |

`js/art/extras.js:17` claims the renderer's `variant({grass:'earth'})` recolours
the skirt on soil "for free". **No such variant exists.** That comment is bug
(2) in written form, and it has been wrong since it was written.

### Why a static building's shadow does not belong on the sprite

Two reasons, both specific to buildings -- the mover argument is not needed:

1. **The colour comes from the ground it lands on.** `shadowStamp(fw, fh,
   groundKey, scale)` derives it as `shade(groundKey, -2)`: grass -> `m`,
   marble -> `A`, rock -> `v`, earth -> `q`, water -> `I`. A baked shadow is one
   fixed colour, and the player can pave under anything.
2. **Draw order.** The runtime shadows are ONE PASS under everything, so no
   object's shade lands on top of a neighbour. A baked shadow draws in its own
   sprite's depth slot. Buildings are the worst case: their shadows are biggest.

There is no third reason. The baked ones exist only because sprites were
authored with hand-typed `mmmm` bands before the runtime pass was reconciled
with them.

### What the investigation established, that changes the plan

- **`shadow:` is DEAD API.** `js/catalog.js` never sets it -- zero matches -- so
  `main.js` forwards `undefined` for every placeable and every object gets
  `scale = 1`. The per-object scale documented at `render.js:76` has never once
  been used.
- **The two systems do not agree on SHAPE.** The runtime stamp is
  `|u| + |v| <= 1` -- a rhombus, the tile diamond. The baked skirt is
  `nx^2 + ny^2 <= 1` -- a true ellipse.
- **The runtime stamp is small, and behind a big object it is invisible.**
  `SHADOW_SCALE = 0.5`, so a 2x2 stamp's bottom tip is anchor+18 against a front
  vertex at anchor+32 -- and it is 100% hidden behind the heroon's 115 px
  podium. **Deleting the baked shadows without enlarging the runtime one would
  leave big buildings with no visible shade at all.** This is the step that must
  not be skipped.
- **26 sprites pass `iso-audit` ONLY because of their baked shadow.** Strip
  every `m` pixel and re-run: 0 flagged becomes 26. Their own feet are still
  flat cuts under a smudge. So the audit has partly been measuring the shadow
  rather than the object -- an effect-hack standing where bedrock should be.

### THE ASTERISK: a measured centre point

Today every baked shadow's position and radius is a magic number typed at the
call site -- `skirt(g, cx + 2, ay + 1, 60)` -- and the four floating sprites were
fixed by hand-measuring their bases at 115, 118, 83 and 63 px. **Those numbers
should be computed, not typed.**

```js
/** The object's own ground centre, from the ART, ignoring shadow pixels. */
groundCentre(sprite) -> { cx, cy, r }
```

- **the base band** -- the lowest opaque NON-`m` pixel in each column;
- **`cx`** -- the midpoint of that band's span;
- **`r`** -- its half-width, clamped to `(fw+fh)*16` (the footprint diamond) and
  to the bitmap, which is what kills regression 3 by construction;
- **`cy = deepestRow - r * GROUND_ELLIPSE`** -- back off from the front of the
  foot by the foot's own half-height, because a 2:1 foot of half-width `r` is
  `r/2` tall.

**It reproduces the anchors we already have**, which is the check that it is
right: heroon -> anchor-0.75, still-pool -> anchor-2.75. So it can also become a
NEW audit -- *"a sprite whose measured ground centre is far from its anchor is
mis-anchored"* -- which is the fault `anchor-audit` only catches for multi-tile
sprites, generalised to all of them and derived rather than tolerated.

### Sequence

1. ~~**`groundCentre()` in `tools/isogeom.mjs`**, plus the mis-anchor audit.~~
   **DONE 2026-08-01, `2857be6`.** It landed in `js/art/format.js` rather than
   the tool, because step 2 needed the renderer to call it too; `isogeom`
   re-exports it. Reproduces all four hand-repaired buildings. The audit gained
   the two arms it never had and lost two blind spots -- see below.
2. ~~**Make the runtime shadow do the whole job.**~~ **DONE 2026-08-01,
   `024c7a7`.** Sized from `groundCentre(art).r`, drawn as an ELLIPSE, coloured
   from the tile it lands on. `tools/shadow-probe.mjs` is the instrument.
3. **Delete the baked skirts from static props.** Regressions 2 and 3 die here.
   Keep the SECONDARY ones (the altar inside the heroon) -- those belong to
   sub-objects, not to the building.
4. **28 flat feet reappear.** Put them in `test/iso-ground.test.mjs`'s KNOWN
   list -- it is a ratchet, designed for exactly this -- and redraw them as real
   2:1 bases: an ELLIPSE for a round foot, a DIAMOND for a square plinth. Both
   satisfy "no horizontal edges at ground level"; a column plinth is a square
   block and drawing it round would be a different lie.
5. **Teach the tools to draw the ground themselves.** `propshot` and the sprite
   lab render sprites with no renderer, which is the only honest reason a baked
   shadow ever helped. The lab already draws the ground diamond.

~~**Do not skip step 2.**~~ Step 2 is done and the warning is discharged: the
runtime pass now carries the load. Measured, `tools/shadow-probe.mjs`:

| | before | after |
|---|---|---|
| placeables whose stamp was 100% hidden | **13** | **1** (`cascade-head`) |
| stamp px visible across the catalogue | 16 004 (44.4%) | **47 260** (46.2%) |
| heroon / tholos / marble-exedra / tomb | 0 / 0 / 0 / 0 | 1770 / 874 / 2543 / 779 |

The heroon's runtime shade (1770 px) is now larger than its entire baked skirt
(1397 px of `m`), which is the precondition step 3 was waiting on.

### STEP 3 IS DE-RISKED, and here is the measurement that says so

Run before starting it, with both `skirt()` implementations and `groundContact`
temporarily stubbed out (`git checkout` after -- do not leave the guard in):

- **On grass, deleting the baked skirts is a VISUAL NO-OP.** Rendered side by
  side at 4x, `ionic-column`, `fluted-urn` and `obelisk` go from 91/91/113 `m`
  pixels to **zero** and the two pictures are indistinguishable. The runtime
  ellipse now covers the same ground in the same colour. On paving it is a
  strict improvement, because that shade is stone and the baked one is grass.
- **`iso-audit` goes from 0 to 28**, not 26. Worst first:
  `sleeping-satyr` 36px of level edge (allowed 20), `wall-fountain` 33 (16),
  `jet-basin` 33 (19), `half-buried-pithos` 29 (22), `ancient-oak` 25 (21),
  `fountain-tiered` 25 (20), `arbour-seat` 24 (18), `axe-marker` 24 (15),
  then a long tail of plinths and column bases at 15-22 against ~12-16.
  **None of it is visible** -- every one of those feet sits inside the runtime
  shadow. That is why step 4 may follow step 3 rather than block it.
- **THE TRAP IN THE OBVIOUS EDIT.** There are TWO mechanisms, not one.
  `skirt()` calls draw an ellipse; hand-typed `mmmm` bands are converted into
  one by `groundContact`. Stubbing `skirt` alone leaves the bands **as literal
  flat rows** -- the original fault, restored. So step 3 is:
  `groundContact` changes from *convert the band* to *strip the band*, which
  removes all 48 hand-typed rows across 68 sprites with **no art edits at
  all**, and then the ~43 `skirt()` call sites go by hand so the secondary
  ones can be kept.

### VERIFIED -- a five-lens investigation, each lens adversarially checked

Numbers below survived a second agent trying to refute them.

**The landed fix is right and needs no rework.** At HEAD: heroon +1/5, tumulus
-1/1, arcadian-tomb -1/0, still-pool 0/3 (past/gap), 365 tests, `iso-audit`
0/237, `anchor-audit` 0 floating, and all four shadows still VISIBLE
(1397 / 1359 / 696 / 123 px).

**THE TRAP IN THE OBVIOUS FIX.** Do NOT solve the green mat by remapping `m`
per ground. **`m` is also `GRASS[0]` and is used as OBJECT colour** -- 457 of
the tumulus's `m` pixels are its own barrow turf, nowhere near the skirt. A
blanket remap repaints the mound. The fix needs a **reserved shadow key** the
palette maps per ground, or the skirt lifted out of the sprite. Step 3 gets
this for free, which is another argument for doing it rather than patching.

**THE OTHER TRAP: do not re-centre without growing `r`.** Moving `cy` to the
anchor at the OLD radius measures out at: tumulus **0 px** of shadow (entirely
inside its own silhouette), heroon ~340 (95% of its contact gone), tomb 226,
still-pool 51. And the growth must be **per sprite** -- a blanket `r * 1.5`
pushes the arcadian-tomb back outside its own 2x1 vertex, whose window is
`r <= 46`. The old objection to a full-width tumulus skirt ("a black bar two
tiles wide", props.js) no longer applies: at 2:1 depth that is a crescent.

**Four more faults, ranked by confidence:**

1. **Catalog footprint != sprite footprint, and nothing measures it.**
   `anchor-audit` audits `sprite.footprint`; the renderer places at the
   **catalog** footprint's centre. **12 placeable entries declare multi-tile
   with a 1x1 sprite** -- `exedra`, `tiered-fountain`, `ancient-oak`,
   `sleeping-satyr`, `ruined-arch`, `level-bridge`, `fern-grotto`,
   `mosaic-panel`, `arbour-seat`, `cypress-screen`, `grotto-basin`,
   `cave-mouth`. **The same CLASS of float the owner reported**, and it
   predates everything here.
2. **`pool()` took the identical `ry` doubling and its collateral went
   unchecked.** `willow-water`'s curtain now stops **32 rows short of the
   waterline**; `spring-basin`'s marble apron slid 3 rows forward and its
   unguarded `B` arc runs through the rim; `unbasined-spring`'s outflow starts
   inside the pool. Only `unbasined-spring` is reachable in-world.
3. **`tools/anchor-audit.mjs` HAS NO SINK ARM AT ALL** -- a human running the
   tool sees `(none)` at any depth of burial. Only `test/sprite-anchors.test.mjs`
   has it, and it caught the heroon by a margin of **exactly zero**
   (`short = -16`, fires on `< -16`); it would not have caught the tumulus or
   the tomb. Separately its `lowestOpaqueRow` **counts `m`**, so a runaway
   shadow can testify that its own object reaches the ground. The float arm
   must measure the lowest NON-`m` row, the overshoot arm the `m`.
4. **The runtime stamp is dead work on wide objects and wrong on non-square
   plots.** On heroon/tumulus/arcadian-tomb/exedra-marble/tholos/rock-outcrop
   **0 of 1224** stamp pixels survive occlusion. On the 3x1 colonnade the
   rhombus falls **outside the parallelogram plot by 104 px**, 838 visible.
   `(fw+fh)/2` also collapses a 3x1 and a 2x2 to the same stamp.

**THE INVARIANT, with its tolerance argued.** A second arm on `anchor-audit`,
measured on RENDERED PIXELS rather than at the call site, and extend the tool to
1x1 sprites -- it `continue`s on them today, which is exactly why `still-pool`
was invisible to it:

```
lowest 'm' row - anchor[1]  <=  (fw + fh) * 8 + 8
```

**Tolerance 8**, three ways: the data has an empty band there (worst legitimate
overshoot at HEAD is +4; the four bugs were +10..+16, so 8 is the middle of a
gap rather than a guess); `LEVEL_H = 16`, so 16 px of downward displacement is
exactly one terrace and is what makes a building read as levitating, and half of
that is the outer bound of "still reads as contact"; and it sits inside the
derived corner-circle allowance for a 2x2 (13.25 px).

A tile-space clause enforced at the CALL SITE was proposed and **rejected**: its
tolerance uses `min(fw,fh)`, which is picked rather than derived (a 2x1's true
corner spill is 19.78 px, not 7); it convicts deliberately off-plot sub-objects
that the same proposal exempts in prose; and it needs anchor + footprint
threaded through **43** call sites, not the ~25 claimed.

**Residue, low urgency:** the heroon's ash altar,
`skirt(g, ALT_X - 2, ALT_Y + 19, 13)`, still carries the same authoring error
(~8 px overhang). It is currently MASKED by the podium's new r=60 skirt. When it
is fixed the rule is **not** "centre on the sprite anchor": the altar is a
sub-object standing on grass 46 px left of the building, and its centre is its
own base diamond, about `ALT_Y + 10`.

### What steps 1 and 2 corrected in the record above

Written down because three of the numbers in this proposal were wrong, and the
corrections are all in the direction of *the fault was worse than reported*:

- **The catalogue-footprint fault is 10, not 12** -- seven of the 25 raw
  mismatches are GROUND PAINTERS, whose footprint is a brush by design
  (`catalog.js`: "These paint tiles"). It is still the same class of float the
  owner reported, it still includes `sleeping-satyr`, and it is now a ratchet in
  `test/sprite-anchors.test.mjs` (`KNOWN_UNDERSIZED`).
- **The old sink arm caught NONE of the four buildings, not "the heroon by a
  margin of zero".** Measured at `27b4cfe^` the overshoots were +10 / +14 / +15
  / +16 against a threshold firing *above* 16. Tolerance is now 8, and the
  calibration is a test: four controls at the four measured overshoots must all
  fire, one at +4 (the worst legitimate overshoot in the game) must not.
- **Ignoring `m` in the float arm is not academic.** `fern-grotto` reads 17px of
  reach with its shadow counted and **2** without; `cypress-screen` 14 against
  8. Both passed the old arm.
- **The green mat was in BOTH systems.** `main.js`'s `terrainCell` has never set
  `cell.ground`, so every non-turf tile fell through `_groundKeyAt` to the grass
  default and the RUNTIME shadow was grass-green on stone too. Fixed by asking
  the tile art's modal key rather than by adding a table.
- **`CREATURE_SHADOWS` is dead art.** `main.js` passes the sprite as `shadow:`
  and the old `typeof === 'number'` test discarded it, so those five
  hand-authored shadows have never once drawn. The renderer now reads their
  WIDTH (the rows are all `m`; drawing them would put a green patch under every
  creature on paving). **The table could honestly be five numbers.**
- **A bitmap clamp on `groundCentre().r` was written and deleted.** It can never
  bind -- the band is measured *from* the bitmap -- and a guard that cannot fire
  reads as protection while providing none. The five side-clipped shadows are a
  BAKING fault, not a sizing one, and die in step 3.

**And two of my own claims did not survive.** The comment I wrote on `pergola`
("no contact shadow at all") is FALSE -- rows 35-37 were already the post feet
in `m`, and an explicit radius forces `cut = rows.length`, so it now draws
**two** shadows. And "48 hand-typed contact bands" is 48 ROWS; **68 sprites**
carry hand-typed `m`. Also worth knowing before facing grows: `groundContact`
centres on `ax + 0.5` in index space, giving a **1 px swing between mirrored
facings**.

## Maker's mark

Built 2026-07-30 → 07-31, in one long session, from a photograph of a Hellenistic
sleeping-satyr fragment the owner dropped in — the same image that became
[Red Under Green](https://github.com/Syntaxswine/WPGFI). That game asked what it
is like to *be* the broken thing in the dark room. This one asks what it is like
to build somewhere worth waking up in.

The two best ideas in it are the owner's, not mine: **grass types as the zoning
medium** (I had proposed a toggleable overlay, which is strictly worse — putting
it in the terrain means the player never has to remember to look), and **the
music arriving with the satyr**, which turned a background track into the first
thing in the game you earn.

The best thing I contributed was not a feature. It was noticing that agents
cannot draw what they cannot see, and building `snap.mjs` so they could look.
Everything beautiful here is downstream of that.

**The forward dream:** that someone opens this, plants a vine because it looks
right rather than because a card told them to, and hears the pipes start.

*— Claude Opus 5, 2026-07-31*

---

## The idle life — 2026-07-31, later

Two animations, asked for in one sentence each: the satyr playing his pipes when
the music cuts in, and a cup appearing in his hand at a drinking vessel.

They needed a layer that did not exist. Poses collapsed to exactly three
(`idle`/`walk`/`beat`) in two places, and the settling **beat** — once, gated,
journal-writing — was the only thing a creature could walk somewhere and do. So
this adds `FLOURISHES` beside `BEATS`: same machinery, opposite contract. It
repeats, it asks nothing of the garden, and it leaves no record. The line that
matters is that a flourish emits `flourish-done` and never `beat-done`, because
`beat-done` is what writes the journal — and a journal entry that fills over and
over would cheapen the one that does not.

**`docs/FLOURISHES.md` is the addendum.** Read it before adding a pose.

What this cost, and what it taught: the art was rebuilt four or five times and
every single failure was the same one — *an object held at the face must be
narrow enough for the face to survive it*. The syrinx was a washboard bib at
fourteen wide, a necklace when I dropped it below the beard to spare him, and an
instrument at six, at the lips, with beard showing either side. Under that sat a
subtler one: I moved the reeds out of his own skin ramp into olive and they
**still** disappeared, because olive light and flesh mid are 132 and 129 in
luminance. Hue is not a read at 24 pixels. It took striping the lightest olive
against a dark one so the thing carried its own contrast instead of borrowing it
from whatever was behind it.

`tools/poseshot.mjs` is the new instrument and it is the reason any of that got
found. `snap.mjs` let an agent see a picture; this lets one see a *cycle* — the
whole loop on real ground with each frame's hold printed, because a sweep and a
jitter look identical one frame at a time.

Two bugs the work turned up, both fixed:

- `poseT` reset only inside `update()`, so a gesture begun from the frame loop
  rendered one frame on the previous pose's clock. For a one-shot that one frame
  is the *end* of the gesture: the cup flashed empty and then started rising.
- The playtest check I wrote first placed the krater around the map centre and
  then settled the satyr — who settles wherever the scan puts him, not where the
  garden was centred. It passed by accident when he happened to land nearby. It
  now settles him first and places the prop at the far edge of his actual reach,
  and both halves are mutation-tested.

**The forward dream:** that the pipes are the second thing the player earns
without being told either was a reward — the music, and then the musician.

*— Claude Opus 5, 2026-07-31*

### Two fixes, immediately after — and how they were found

The owner loaded their garden and reported: the music started at load, and the
satyr just stood there. Both halves of that were information.

**The recital was unreachable for every returning player.** `extra.musicUnlocked`
persists in the save, so their track resumed at load, `unlockSong` returned at
its first line, and — because *every* later arrival hits that same early return
— the recital was not skipped once but permanently. My reasoning for arming it
only on a fresh unlock ("a three-minute recital on every refresh would be a
chore") was precious about the wrong thing.

**And then my fix for that was wrong too, in the same way.** It armed on every
moment that *meant* music — fresh unlock, restore unlock, arrival — but on a
returning save `unlockSong(true)` runs during boot, **before any gesture**: no
AudioContext, nothing fetched. The hydrated satyr took the recital on the first
simulation step and piped for three minutes to a silent glade, latched, and the
music started later with no musician.

I missed it *while verifying the first fix*. My browser check confirmed "he
pipes on a restored save" and I called that success — when the evidence in my own
output (`pose: pipe` recorded **before** the gesture line ran) was the bug.
**A check that confirms the thing happened is not a check that it happened for
the right reason.**

The rule is now one rule, and it is about SOUND rather than intent:
`if (!recital.played && audio.playing) recital.arm()`, checked every step, where
`audio.playing` is audio.js's `musicPlaying`. Not `musicUnlocked` (intent), not
`ready` (the context is running). One arming call site, whose condition is a
direct read of whether a note is coming out. Verified end to end: 521 frames of
silence with zero piping, then music at t=8.7 s and piping at t=8.7 s — the same
frame. A muted player getting no recital falls out for free.

**The syrinx was invisible in the ghost.** The `visits` preview compresses toward
mid-grey, and olive-light `i` and flesh `t` both land on `#8A7F6D` — separation
**zero**. Half the instrument was literally his skin colour in the variant every
player sees *first*. `poseshot --ghost` exists now because of it. **Check both
variants. The ghost is not a filter over finished art; it is the first
impression.**

Then a four-agent reachability audit — "can a player actually SEE this, from
every entry state" — turned up something that had nothing to do with this work:

**Every creature in the game animated ~40% fast with a ~1 s stutter every
2.9 s.** `phase` is a fixed per-agent offset (constructor, beside `drift`) and
its only consumer treats it as constant milliseconds — but `update()` advanced
it 0.35/s and wrapped it. A constant had been turned into a sawtooth. Measured:
idle ran 9.84 cycles' worth in 14, with four backward jumps of ~978 ms per
twelve seconds. It has been true since the creatures were written; the new
8-frame pipe cycle merely made it visible.

The lesson worth keeping: **a field with one consumer still has two meanings if
two places write it.** Nothing in the tests could see this, because every test
asserted the *frame lookup*, which was always correct — the clock handed to it
was what lied. Measure the dynamic, not the end state.

*— Claude Opus 5, 2026-07-31*

---

## A front door, and a map nine times the size — 2026-07-31, later still

The owner reported that reloading did not reset the game and proposed the cure:
a title screen with a New Game behind it. They were right about the symptom and
their fix was the right one, but there were **two** causes and a title screen
only addresses one.

**The other is HTTP caching, and it had been lying to me all session.** The
preview server was `python -m http.server`, which sends no cache headers, so the
browser kept ES modules against a heuristic and served them back. It cost three
false readings — including one where I "verified" a title screen that was not
running, and one where I declared a fix working with the old code on screen.
`launch.json` now points at `tools/serve.mjs`, which has always sent `no-store`
and was sitting unused in the repo the whole time. On Pages the window is real
and only half closed; `docs/TITLE-AND-CONTROLS.md` says exactly how far.

**Then the map could not be made bigger.** 3x in both directions is 9x the tiles
and `_rescan` cost **1205 ms** at 60x60, every 1.5 garden-seconds. The cause was
one line whose comment asserted the opposite — `Zoning.claimed` calls
`fields.grassCounts()`, commented *"cheap, because grassGrid is cached"*.
grassGrid is cached. grassCounts walked the whole map on every call, and
`claimed` is read once per tile. 1205 ms -> **58 ms**, and the live 20x20 game
picked up 2.7x it had been losing since it shipped.

I guessed wrong twice before measuring properly — per-tile context allocation,
then per-tile flood fills. Both were real, both are fixed, neither was the cause.
**Attributing cost per requirement is what named it in one line.** The lesson is
not "profile first"; it is that a comment claiming something is cheap is a claim,
and claims about cost are the ones that rot silently as a project grows.

**On the art:** the wordmark's letters are derived, not painted. Each glyph is a
flat mask; the code computes outline, highlight, shade and fill, plus one erosion
pass that knocks the corner off every convex right angle. That last pass is the
whole difference between bubble letters and block letters, and doing it in code
is why all eleven round identically — my hand-authored chamfers came out square,
because a one-pixel corner is exactly what the eye skips while typing hashes into
a grid.

**What is NOT done is written down** in BACKLOG §4e-4g: the save screen the owner
explicitly deferred, Continue, the unversioned module graph, and — honestly — the
fact that nobody has yet pressed the new keys in a real browser. "Not checked"
and "checked and fine" are different states and the backlog now says which is
which.

**The forward dream:** that someone opens the front door, sees sixty tiles square
of empty meadow, and finds that daunting for about four seconds before they put
down a vine.

*— Claude Opus 5, 2026-07-31*

*(Add below this line. Never overwrite a prior builder.)*

---

## Knowing where you are, and asking what things are — 2026-08-01

The owner confirmed the piping works, reported one bug, and asked for three
things. All four are done and one of them turned into the most interesting fix
of the session.

**The bug: "the music plays before the satyr playing music starts."** It did,
structurally, and the previous fix is why. Two bugs had already shipped here,
both of them the confusion between INTENT and SOUND, and the rule that came out
of them — *arm the recital when a note is actually sounding* — was correct as far
as it went and still had the arrow backwards. The score was started by his
ARRIVAL, and arriving means walking in from the map rim; he could not raise the
pipes until both feet were on the grass, several bars in.

The rule now is one line and it is the same statement twice: **the score starts
when he does.** Arrival arms the recital; the tick waits for the track to be
decoded and the context to be running, asks him every step, and the step he
raises the pipes is the step `audio.unlockMusic()` is called. audio.js fades in
over ~4 s, so the music swells under the gesture instead of announcing it.

There is a 30-second patience so a satyr deep in a revel cannot hold the score
hostage; `pending` survives it, so he joins the music late rather than never.
That is the old bug's shape — bounded, deliberate, and rare, instead of the
default path. `docs/FLOURISHES.md` has the whole three-bug sequence.

**The lesson worth keeping:** the first two fixes were about *when* to arm and
the third was about *who is upstream*. The satyr is not reacting to the music; he
is the reason there is any. Two things that must not drift are safest as one
statement, and no amount of tightening the condition on the follower gets you
there.

### The minimap

`js/minimap.js`, upper right, one pixel per tile, and a diamond — the same
projection as the world, because a square minimap of an isometric map makes the
player rotate 45° in their head every time they glance at it. The projection is
two lines and the halving that looks lossy is not: `tx-ty` and `tx+ty` share
parity, so the diagonals interleave and the diamond fills solid. Creatures blink
(one static pixel among 3600 static pixels is not findable); the camera is a
plain square because the rotation cancels in this projection.

The surround started as the sky ramp — consistent with render.js's off-map haze,
and wrong on sight: at this size the panel is mostly surround, so a pale blue
rectangle sat in the corner shouting louder than the garden.

### The move tool and the `?` — two tools that answer instead of building

Both take the click away from the garden, both keep whatever is selected, both
suppress the ghost (a ghost under a cursor that will not plant is a promise the
click does not keep), and both change the pointer, which is the only feedback
there is once the player's eyes leave the toolbar.

**Move** is `X` or the four-arrow mark immediately left of the `?`. Click to
centre, drag to shove. It is the one tool that does **not** take your plant out
of your hand, on purpose: crossing the map without putting it down is the entire
thing drag-to-pan could never offer, because dragging is *also* how you place.

> **I built this twice.** The first version was a held four-way d-pad in the
> corner. It worked and the owner did not want it — "I imagine a logo just to the
> left of the question mark ... a move cursor that does not place items, but
> rather centers the map on that spot on a click, or moves the map with a click
> and drag." They were right, and not only as taste: the tool resolves the
> drag-conflict **at its source** instead of routing round it, and it costs one
> topbar button rather than a permanent 42 × 42 patch of meadow.
>
> The lesson I want to keep is that I solved the *stated* problem (no way to pan
> on touch) with the first thing that solved it, rather than asking what the
> gesture should be. Every builder of the period lets you grab the map itself.
> The research was on the shelf and I did not go and look.

The `?` is a tool, not a tooltip, and `input.js` dispatches both before every
other branch so a help cursor can never plant, raze, terrace or pan. It reuses
`affinityWords()`, so "what does this attract" is answered in the vocabulary the
player is already learning rather than in a second one.

### The proving ground, and two things I got wrong building it

`?garden=all` plants four quadrants, one per species. **Derived from the ladder,
not authored** — an authored fixture is right on the day it is written and
quietly wrong afterwards, and a stale test map is worse than none because the
failure reads as a bug in the simulation.

Deriving it only moves the staleness into the derivation, so
`test/proving-ground.test.mjs` holds it to exactly what it promises: every
counted demand met, no counted refusal broken. Not that anybody settles — bands
are field maths, a patch needs real time, a beat has to be performed.

Two mistakes, both worth the space:

1. **I tracked `at-most 0` and dropped every cap with a number on it.** So the
   centaur's six ash trees all landed inside her `at-most 4 tree within 3` — and
   that cap *is* her open run to gallop on. The fixture built the one garden she
   refuses. A cap of four is the same kind of statement as a cap of zero; the
   fix pushes the surplus past the cap's radius, satisfying both, which is what
   the two requirements were always describing between them.
2. **I measured the result with `world.countTag` and it cannot see painted
   ground.** A ground painter writes the tile's type and leaves no object behind.
   I concluded the naiad was short a greensward and started fixing a garden that
   was already correct — the instrument was blind, not the fixture. `fields`
   keeps a synthetic placement for exactly this; measure zoning with `fields`.

The second is the one I want a future builder to actually absorb. **A negative
result from an instrument you have not checked is not a finding.** It cost twenty
minutes here; it would cost a session on something subtler.

### Two dead defaults, fixed on the way past

`world.js` exported its own `MAP_W = 20` and `input.js` defaulted `map` to
`{w:20,h:20}`. Neither was read, because main.js always passes explicit
dimensions — so growing the map to 60 did not break, which is precisely the
danger: `new World()` with no options, or a save with no `w`, silently built a
20×20 world inside a 60×60 game. Both now come from iso.js. The law was already
written down from the same mistake in the other direction; it had simply never
been swept for.

### The sprite lab has a blind spot, and it is a third of the art

The owner, looking at the lab: *"there are several objects, like the cave, that
are pointed straight at the viewer instead of in the direction of the grid like
they are occupying 3D space"*, and *"do you think you would benefit from thinking
in hexagons instead of squares since you are working in isometric space?"*

Yes — and **the lab is why it was never caught.** It draws a square pixel grid
and a rectangular bounds box. Both are the coordinate system of the *file*.
Neither is the coordinate system of the *world*, so a sprite can sit perfectly
inside the lab's grid and point at nothing the map contains. The instrument was
answering a question nobody had asked.

The geometry, so it never has to be re-derived: three visible planes (ground
diamond, SE wall, SW wall), therefore three straight-line families (rising 1-in-2,
falling 1-in-2, vertical). **A long horizontal run is not one of them.** The cube
silhouette is a hexagon. The exception that makes it hard: rotational forms —
column, urn, boulder — look the same from every side and *should* be mirrored.

`tools/iso-audit.mjs` measures one thing, and **I had to rebuild it before it was
worth anything.** The first draft scored four properties at once and ranked
`COLUMN` the fourth-worst sprite in the game — a cylinder, punished by three of
four measures for being drawn correctly. Narrowed to a single objective claim
(how far the bottom silhouette lifts toward its corners), it reports **32 of 103
sprites ending in a flat edge**, four of them at exactly 0.00.

**Be honest about what it does not measure.** The fault the owner actually
pointed at is the *form* facing the viewer — the cave's opening is a
horizontal-axis ellipse that should be sheared onto a wall plane. That is
listed by inspection in `BACKLOG §4j`, not detected, because the obvious detector
(symmetry + horizontal major axis) is the same trap the first draft fell into: it
convicts every urn in the catalogue.

### On the owner's desk, not started: MOBILE MODE

> "My plan is to have a mobile mode on the title screen. Same game just
> different. That's kind of low on the priority list, but it should be on our
> todo."

`BACKLOG §4i`, and read it before you touch anything shaped like it. The short
version: **the game does not fit a phone in portrait**, and that is geometry, not
controls. `pickScale` floors to an integer and clamps at 1, so a 390 px screen
gets a 640 px canvas. The only two ways out are a non-integer scale (which breaks
SPEC §2 and smears the art) or a **second logical screen size** — and
`LOGICAL_W/H` are module constants that render.js, input.js and index.html each
read for themselves. **Making the logical screen a variable is the whole job.**
Grep for `640` before estimating.

It is low priority by the owner's own word. Do not start it because it is
written down.

### And the one after the art: FACING ON THE WHEEL

> "There are a few tiles that you should be able to alter the direction on.
> Currently the middle scroll wheel scrolls up and down the map, I think it would
> be better suited to pick between what direction an object faces in space."

`BACKLOG §4k`. The wheel is barely earning its keep as a pan now that there are
four other ways to move, and rotation is what an isometric builder always binds
it to.

**The economics are better than they look:** in 2:1 iso a horizontal flip turns
an NE-facing wall into an NW-facing one *exactly*, so one drawing gives two
facings and two drawings give all four. The mirror is a cache key, not a sprite.

The cost is not in the art, it is in the save: `facing` becomes a per-object
field and `SAVE_VERSION` bumps, and **every existing garden must load at facing 0
and look identical to today.** That is the part that must not be got wrong.

**Sequencing, and it matters: §4j before §4k.** Give things a front, then let the
player turn it. A rotation control over sprites that all face the viewer is a
control that visibly does nothing.

**The forward dream:** that the blinking dot in the corner is the thing you catch
out of the corner of your eye, and you click it, and there he is, playing.

*— Claude Opus 5, 2026-08-01*

---

## The shadow arc — 2026-08-01

Steps 1 and 2 of the shadow proposal above, built and shipped. Step 3 measured
but not started. Plus one owner decision that is not about shadows at all and
matters more than any of it.

**Read the proposal's `### Sequence` first** — it is annotated with what
actually landed, and with six corrections to its own numbers.

### What shipped

| what | commit | |
|---|---|---|
| `groundCentre()` + three audit holes closed | `2857be6` | 375 tests |
| the contact shadow does the whole job | `024c7a7` | 383 tests |
| step 3 measured before starting it | `d511599` | — |
| the pillar trick defended | `dc28b5a` | 386 tests |

### The thing worth carrying forward

**Every fault in this arc was a consumer that was never written.** Not a bug in
working code — a piece of infrastructure somebody designed carefully, and then
nothing ever called:

- `shadow:` on a scene object. Documented at `render.js:76` as a per-object
  scale. `catalog.js` sets it **nowhere**, so every object in the game arrived
  with `scale = 1` and the field had never once been used.
- `CREATURE_SHADOWS` — five hand-authored contact shadows in `creatures.js`.
  `main.js` passes them, the old renderer's `typeof === 'number'` test threw
  them away, and **not one of them has ever been drawn**.
- `cell.ground` on a terrain cell. `_groundKeyAt` reads it; `terrainCell` has
  never set it. Result: every paved tile in the game cast a grass-green shadow.
- `ACCENT[6] = '#2A2620' // universal shadow mixer — the only near-black in the
  game`. Named for a job nothing does. It is used as grape and poppy pixels and
  as the minimap frame; **nothing mixes toward it.**
- `js/art/extras.js:17` claims the renderer recolours the baked skirt on soil
  "for free" via a `variant({grass:'earth'})`. **No such variant exists**, and
  that comment has been wrong since it was written.

Five of them, in one subsystem. If you are looking for what to fix next in this
codebase, **grep for a field and check who reads it** — that has a far better
hit rate here than reading code for mistakes.

### The instruments, which are the durable part

- **`tools/shadow-probe.mjs`** (new). Renders one object on flat ground three
  times — bare / shadow only / whole — and differences them. `--paved`,
  `--png`, and a per-pixel colour census. It is what turned "the stamp looks
  small" into "thirteen placeables draw a stamp that is 100% invisible".
- **`tools/anchor-audit.mjs`** now has four arms (FLOAT, SINK, PLOT, `--feet`)
  and reads the CATALOGUE footprint, because that is the plot the renderer
  places on.
- **`groundCentre(art)`** in `js/art/format.js` — where an object meets the
  ground, blind to its own shadow. One implementation, three consumers.

### A trap I fell into, twice, in one session

**A differencing probe must pin everything except the one variable.** The first
version of `shadow-probe` isolated the shadow by passing `art: null` — which
worked perfectly until the shadow's SIZE started coming from the art. Then
dropping the art dropped the measurement too, and the tool cheerfully reported
numbers that were the difference between two different shadows.

The same shape of error got into a test: a "3x1 and 2x2 do not collapse"
assertion that was equally true under the old code, so it could not fail for the
reason it named. **A test that passes on the broken version is not a test.**

### Step 3 is de-risked — do this before you touch 68 sprites

Stub both `skirt()` implementations and `groundContact` behind a flag, render,
`git checkout`. It takes ten minutes and it establishes the two facts that make
step 3 safe:

1. **On grass, deleting the baked skirts is a visual no-op.** The runtime
   ellipse already covers the same ground in the same colour.
2. **There are TWO mechanisms.** Stubbing `skirt()` alone leaves the 48
   hand-typed `mmmm` bands as literal flat rows — the original fault, restored.
   `groundContact` must change from *convert the band* to *strip the band*,
   which clears all 68 sprites with no art edits at all.

### OPEN, and the owner's to call: transparency-based shadows

The owner asked whether shadows could be transparency-based "so they work with
anything underneath them". **Feasible, and better than what is there** — but as
palette-space darkening, not alpha: read the pixel underneath and walk ITS OWN
ramp down two steps. Alpha is forbidden by SPEC §3 in capitals and would break
the palette-purity assertions.

Measured, both numbers:

- **100% of rendered pixels are exact palette colours** (256 000 of 256 000, on
  a scene with buildings, trees and terrain), so the reverse lookup always hits.
  That is the fact the whole idea rests on and it is not a near miss.
- **0.50 ms/frame** over realistic shadow bounding boxes, 1.37 ms for the whole
  viewport, against a current **8.20 ms of a 16.7 ms budget**.

What it buys beyond the owner's ask: the ground's own texture survives (today an
opaque stamp *erases* grass speckle and flagstone joints), and a shadow spanning
a grass/paving boundary stops being one wrong colour across both.

Two caveats. **Six accent colours have no ramp to walk down**, so flowers under
a shadow would stay bright — they need a mix-toward-`ACCENT[6]`-and-snap rule,
which is finally what that "universal shadow mixer" is for. And it makes **step
3 a prerequisite**: a baked opaque skirt cannot participate in a blend and would
sit as a flat patch inside the new shade.

**Not needed:** shadows falling on other objects. The owner settled it —
"the shadows are fairly high noon shadows, so i don't think they would ever
truly drop down to another level except for maybe very tall cliff faces". That
was the expensive half, and it is off the table.

### AND THE ONE TO READ TWICE: the pillar trick is a FEATURE

Owner, 2026-08-01: *"you can remove the ground under an object allowing it to
float in space. this is a classic bug of that era that players would use
creatively to build things they otherwise couldn't, so i don't want it
corrected. that bug was most popular in Ultima Online."*

**This document spends thousands of words treating floating as a fault. It is
talking about a different float.**

- **ART space** — a sprite drawn too high inside its own bitmap, hovering over
  its own plot wherever the player puts it. Nobody asked for it. A bug.
- **WORLD space** — the art is correct; the player dug the ground away on
  purpose. A toy.

`_cohere()` drags an object's whole FOOTPRINT along with any edit touching part
of it, so it can never straddle two heights. **It stops at the footprint and the
stopping is the trick**: the tiles an object's art merely *overhangs* are
ordinary ground. Dig the glade out but one tile and you get an oak on a pillar.

Guarded by three `FEATURE:` assertions in `test/world-terrain.test.mjs`, a note
on `_cohere` in `js/world.js`, and a section in `docs/ELEVATION.md`. Kept
**undoable** (a toy you cannot take back is a trap) and **untaught** (nothing in
the UI mentions it; it is something a player finds by digging).

## Maker's mark

I came in to finish a specced list and spent most of the session discovering
that the specification's own numbers were wrong — in every case in the direction
of the fault being *worse* than reported. The catalogue mismatch was 10 and not
12 because seven were ground painters. The old sink guard caught none of the
four floating buildings rather than one. The green mat was in both shadow
systems, not just the baked one.

What I would want a successor to take from that is not "check the numbers". It
is that **the corrections all came from building an instrument and pointing it
at the thing, and none of them came from reading the code more carefully.** I
read `_groundKeyAt` twice and saw nothing; I rendered a prop on flagstone and
the bug was a green mat you could see from across the room.

The best thing here is `shadow-probe.mjs`, and it is the smallest. Three frames
and a subtraction.

**The forward dream:** that someone digs a hole for no reason, finds their oak
standing on a pillar of earth, and spends the next hour building something
nobody designed.

*— Claude Opus 5, 2026-08-01*
