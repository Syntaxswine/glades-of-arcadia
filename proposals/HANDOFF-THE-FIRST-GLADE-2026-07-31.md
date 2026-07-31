# HANDOFF — The First Glade

**2026-07-31 · the keystone. Read this before you touch anything.**

Reconciled against `proposals/BACKLOG.md` in the same pass, per the standing rule.

---

## Where it stands

**LIVE:** https://syntaxswine.github.io/glades-of-arcadia/ — Pages from `main` **root**.
Repo `Syntaxswine/glades-of-arcadia`. Deployed and verified at HEAD, not merely pushed.

```
274 tests            node --test "test/*.test.mjs"
42 playtest checks   node tools/playtest.mjs        no structural faults
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
| `tools/spritelab.html` | every sprite and composer at 1×/4×/8× with anchors marked |

`npm run check` runs the lot.

## Music

`audio/glades-of-arcadia.mp3` — **the owner's own track, made with Suno,
non-commercial.** Code and audio are licensed **separately**; the README says so
and it must keep saying so.

**It starts when the first satyr walks onto the map, not before.** Satyrs are the
musicians of the myth. Autoplay policy means it is primed silently on the first
gesture and *played* on his arrival; `musicUnlocked` persists in the save.

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
