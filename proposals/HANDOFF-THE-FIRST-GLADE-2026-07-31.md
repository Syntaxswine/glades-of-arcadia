# HANDOFF — The First Glade

**2026-07-31 · the keystone. Read this before you touch anything.**

Reconciled against `proposals/BACKLOG.md` in the same pass, per the standing rule.

---

## Where it stands

**LIVE:** https://syntaxswine.github.io/glades-of-arcadia/ — Pages from `main` **root**.
Repo `Syntaxswine/glades-of-arcadia`. Deployed and verified at HEAD, not merely pushed.

```
283 tests            node --test "test/*.test.mjs"
46 playtest checks   node tools/playtest.mjs        no structural faults
anchor audit         node tools/anchor-audit.mjs --strict     exit 0
art debt             ZERO   (was 28 understudy sprites)
placeables           130
dependencies         0        external assets   1 (the score)
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

**SPEC.md §5 still says "45–60 placeables". It is stale.** There are 130. The
test asserting the old range was corrected, not suppressed.

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
| `tools/spritelab.html` | every sprite and composer at 1×/4×/8× with anchors marked |

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

---

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

*(Add below this line. Never overwrite a prior builder.)*

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
chore") was precious about the wrong thing. **A thing seen slightly too often
beats a thing that cannot be seen.** The rule now lives in `createRecital()`,
exported from `main.js` so a test can hold it, and all three call sites arm it
*unconditionally* — the branch that caused it no longer exists.

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

*(Add below this line. Never overwrite a prior builder.)*
