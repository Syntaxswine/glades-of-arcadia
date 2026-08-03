# PROPOSAL — STAIR CLIMBING

**2026-08-03. Nothing here is built.** This is the scouting report and the shape
of the fix. Read `HANDOFF-THE-IMAGE-PACK-2026-08-02.md` first for the connector
work this sits on top of.

> **The owner:** *"lets write a proposal for stair climbing. i'm guessing you
> want something like anchor points to guide the step of the character?"*

**Half right, and the half that is wrong is the interesting half.** Anchor
points are the correct instinct — but the connector art already *contains* the
anchors, and it has since the day `rampSurface` was written. What the arc
actually needs first is not anchors at all: it is a **pathing** change, without
which the fix is measurably net-negative.

---

## 0 · THE SHORT VERSION

| | |
|---|---|
| what is wrong | a creature crossing a ramp does not climb it; it pops a whole level in one frame — and for ~40% of the crossing it is drawn **inside** the ramp |
| the pop | **16 px in one sim step**, at the leg's peak-speed instant |
| for scale | a walking frame moves 1.6 px vertically. The pop is **9×** that, in one frame |
| the bigger defect | **72% of the satyr's pixels destroyed** by the ramp's raster at the worst position |
| is it a bug? | **No. It is a written decision** — `js/main.js:1430` |
| what blocks it | **pathing.** 391 of 607 measured connector crossings never change level |
| what it is not | not a contact-shadow problem. A creature's shadow on a connector tile is **0 px**, by construction |

---

## 1 · THE FINDING THAT REFRAMES THE WHOLE THING

This is not a slip. `js/main.js:1427-1435` says so, deliberately, in the first
file the next reader opens:

> *"A mover keeps FRACTIONAL tx/ty so it never pops across a tile boundary, but
> its level is the whole level of the tile it is over — **there are no half
> heights** (ELEVATION.md: no diagonal or half-level terrain), so a creature
> walking a ramp steps up a level at the top."*

`docs/ELEVATION.md:203` backs it: *"Diagonal or half-level terrain"* is listed
under **what this does NOT include**.

So this proposal is not "fix a bug". It is **"revisit a decision"**, and it has
to earn that. The decision was right when it was made: with no connectors that
turned four ways, and terrain that steps in whole levels, a whole-level mover is
consistent and cheap. What changed is that ramps, stairs and scrambles are now
first-class, turnable, and the thing a player builds a hill *for*.

**Whatever lands must amend both sentences in the same commit that falsifies
them.** A stale comment that authoritative is worse than the pop.

## 2 · THE REAL PRIZE IS NOT THE POP

The pop is what you notice. It is not what is worst.

A creature climbing a ramp is **drawn inside it**. `depthOf` is fractional for a
mover and integer for the connector, so on the uphill half of a facing-0/1
connector the creature sorts *behind* the ramp it is standing on:

| connector | creature pixels destroyed, today | with a sub-level lift |
|---|---|---|
| earth-ramp | 190 / 334 (57%) | 97 / 334 (29%) |
| earth-ramp, worst sample | **349 / 483 (72%)** | 253 / 495 (51%) |
| stone-stair | 211 / 334 (63%) | 123 (37%) |
| rock-scramble | ~70% | ~50% |

Measured on real frames through the real renderer, not estimated.

**A satyr wades through solid earth, buried to the chest, for about 40% of every
crossing.** That is the thing a player sees and cannot name. The 16 px pop is the
punctuation at the end of it.

Two consequences:

1. **This is enormously visible.** Unlike the back rim this morning, there is no
   risk of shipping a change nobody can see.
2. **The lift alone halves it** — before any depth work at all. That matters for
   sequencing (§5): the arc must not be gated on the harder half.

## 3 · WHAT WAS MEASURED

Everything below was run against the real modules, not reasoned about.

| measurement | result |
|---|---|
| `decor.js`'s `s` vs `render.js`'s `fx` | **identical, 0.0 difference across all 1024 tile pixels** |
| one tile of walking | 22 sim steps = 1.10 s at `WALK_SPEED`; 34 steps at amble |
| where the boundary is crossed | at the leg's **peak speed** (smoothstep′(0.5) = 1.5× nominal) |
| lateral drift changing which TILE is reported | **never** — 500 seeds × 7 leg shapes, 0 cases |
| lateral drift crossing a sub-tile **lane** | **500 of 500 legs** on the stepped terrace wall |
| connector crossings that never change level | **391 of 607 (64%)** |
| sim steps spent standing ON a connector | 18,734 of 258,649 — **4,973 of them idle** |
| creature contact shadow on a connector tile | **0 px** (232 px on open grass) |
| with `reducedMotion` on (drift off) | max per-step jump falls to **1–4 px** on every connector |

That first row is the keystone. **The art's height field and the creature's
position are the same number.** `s`, which decides how high `rampSurface` draws
the surface at every pixel, *is* `fx`, the sub-tile coordinate a creature already
has. The height a creature should stand at is the expression its sprite was
drawn with — not an approximation of it, the same arithmetic.

That is why the owner's "anchor points" instinct is right and why it does not
need to be built: **the anchors are already in the drawing.** What is missing is
a way to ask for them.

## 4 · THE BLOCKER — PATHING MUST LAND FIRST

This is the finding that would have wasted a session.

`makePassable` (`js/main.js:1105-1121`) admits connector tiles as ordinary
walkable ground, and says why — *"the two halves have to agree or the ways up are
decorative: every ramp in the garden would be a wall with a staircase painted on
it."* Correct. But nothing anywhere constrains a creature to enter a connector
**along its climb axis**. `Zoning.route` is 4-connected and throws connector-ness
away after `stepOk`; `_wanderTarget` does not exclude connectors at all.

So creatures wander **across** ramps sideways, and stand on them, constantly:

- **391 of 607** traversals of a ramp tile never changed level.
- **4,973 sim steps idling** on a connector, in one run.

Today that is harmless — the height is a per-tile integer, so a sideways
crossing is flat, correct, and artefact-free. **Give the tile a sub-tile height
and every one of those 391 becomes a new pop**, at a cross edge, where none
exists now. Measured worst case on a sideways entry:

> `(7.596, 9.473) h=0 → (7.591, 9.519) h=15` — the creature moved **0.046 tiles**
> and levitated **15 px**.

159 jumps of ≥8 px on the earth ramp alone, in one run.

**The headline number — 16 px → 1 px — is true only on a hand-picked
axis-aligned climbing leg.** On the majority case the naive fix is a regression.

> ### LAW: THE WAY UP MUST BE A WAY UP
> A connector stops being ordinary through-passable ground. `route` costs or
> refuses a cross-edge step, `_wanderTarget` excludes connectors, and
> `makePassable`'s comment learns a direction. **This lands first, on its own,
> with its own before/after — or the height ships net-negative.**

There is a cosy-guarantee question inside this and it is the owner's, not mine
(§9).

## 5 · THE SHAPE — THREE LAYERS, IN ORDER

### Layer 1 — THE SURFACE (bedrock)

One question, one owner: **how high is the walkable surface at this point?**

- The connector's art emits the height field it already computed. Not a new
  model — `rampSurface` writes `lift` for every pixel it paints; it emits the
  same arithmetic once more as a declared surface.
- Carried as a **whole-pixel `lift` in [0, LEVEL_H]** beside the untouched
  integer `level` — *not* a float level. A float level fights
  `clampLevel`'s rounding, fights `ELEVATION.md:203`, and needs five new
  exports on `iso.js`, whose own header says *"Two names, no ambiguity."*
- The reader lives in **`main.js`**, injected as a closure. It cannot live in
  `Zoning`: `js/creatures.js` imports exactly one module (`fields.js`), and
  `objectAt` returns a placed object with **no art**. Resolving id → def → art
  descriptor → sprite is a three-hop chain only `main.js` can walk.
- `_place` still validates what it writes — it clamps the lift against a bound
  given at construction. That file's own doctrine is *"a writer-side fix
  protects against the one you have not [found]"*; a value arriving pre-cooked
  from another module breaks the choke point at the site that states it.

**Byte-identical on flat ground** is the gate. `lift` is 0 everywhere that is
not a connector.

### Layer 2 — THE WALK LINE (the owner's anchors, doing their real job)

Height is a function of one axis. **Position across the tile is the other axis**,
and that is where anchors actually earn their keep: the connector declares the
lane its flight occupies, and the creature is kept in it.

This is not optional decoration. The stepped terrace wall's flight is a
**0.32-tile lane** inside a **0.44-tile drift envelope** — 500 of 500 climbing
legs leave it, onto flanks that are the upper terrace's turf at a flat
`LEVEL_H`. Without the lane the creature pops *up* onto the turf, drops 12 px
onto the flight, climbs, and pops again: **three discontinuities where today
there is one.**

> ### LAW: A DECLARED FIELD MUST BE READ
> `flatFooting`, `shadow` and `crossing` each shipped dead and stayed dead —
> `catalog.js:2453-2489` records all three casualties in its own comments.
> A `lane` that is declared and never consulted is that failure a fourth time.
> **Either the lane constrains position, or it is not declared.**

### Layer 3 — THE GAIT (what makes it read as climbing, not floating)

Geometry alone may not be visible enough. The whole climb is 16 px over 63
frames — 0.25 px/frame — against a creature already moving 1.6 px/frame down
the screen. Correct, and possibly imperceptible.

The gait is what sells it, and it is **per-material**: a satyr *heaves* up a rock
scramble; he *treads* up a dressed stair. The stair's height field is already
quantised (`step: RISER`), so the tread is free — the creature's foot lands on
each one because the surface says so.

**This layer is the one to judge by looking, and the one to ship last.**

## 6 · THE SPINE — what lands, in what order

Each of these is its own commit with its own before/after. Nothing bundles.

| # | commit | why here |
|---|---|---|
| 1 | **`Math.floor` → `Math.round` corrections**, one per commit | `render.js:3023` and `:2960` both floor a mover's tile — but a mover is drawn at `(x+0.5, y+0.5)`, so the tile under it is `round`, not `floor`. `:2960` feeds `_groundKeyAt`, so fixing it **changes every creature's contact-shadow colour on flat ground** — it must land and be diffed *before* the byte-identical gate exists, or the gate can never pass |
| 2 | **A world-backed `Bestiary` fixture** | Not one `Bestiary` in `test/` or `tools/` passes a `world` — 27 construction sites, and only `js/main.js:1810` passes the real thing. **Zoning's connector branch is exercised by exactly one caller: the running game.** Climb assertions written today would pass while measuring nothing |
| 3 | **Pathing: the way up is a way up** (§4) | or the rest is net-negative |
| 4 | **`surface` through `spriteAt`**, with a load-time refusal | see §7 |
| 5 | **Layer 1**, earth ramp + scramble + stair only | byte-identical on flat ground |
| 6 | **Layer 2**, the lane | unblocks the terrace wall |
| 7 | **The depth fix**, verified by enumeration | facing × tread position × neighbour level 0–6, across *both* adjacent diagonal rows — not by a screenshot |
| 8 | **Layer 3**, the gait | judged by looking |

## 7 · FIVE TRAPS, ALL CONFIRMED IN THE TREE

1. **`spriteAt` is a FOURTH whitelist.** `js/art/decor.js:101-116` forwards
   `name, anchor, rows, footprint, tags, cycle, back` and silently drops
   everything else — **it already drops `joins` today.** All six connector
   drawings are built through it. Declare `surface` only on `defineSprite` and
   it arrives dead on every one of them, `liftAt` returns 0, and nothing throws
   anywhere. That is precisely how `flatFooting`, `shadow` and `crossing` died.
2. **`inTile` already exists**, `js/creatures.js:2066` — a ±0.4 clamp on a
   *delta*. An import of the same name at module scope is a `SyntaxError`, and
   because `main.js` loads its siblings by dynamic import, **the game boots to a
   blank canvas** rather than to an error anyone can read.
3. **The rock scramble tops at 15 px, not 16.** Its quantiser is
   `Math.floor(raw/3)*3`, so `floor(16/3)*3 = 15`. Any load-time assertion of
   `=== LEVEL_H` refuses to boot. **Derive every tolerance from the art.**
4. **`rampSurface` is not the true surface of all six drawings.**
   `stoneStairGrid` overpaints raked cheek walls *after* it returns;
   `terraceWallGrid` never calls it at all and hand-rolls its own quantiser at
   `decor.js:3023`. A byte-identical re-render proves the pixel loop is
   unchanged — **it does not prove the field is the surface.** Validate the
   declared height against the **finished raster** (topmost opaque pixel at every
   `(s,t)`), not against the generator.
5. **`fields.js` already owns a surface model** — `climb` (`:697`), `climbAt`
   (`:1403`), consumed by the renderer through `grassGrid().slope` — *and*
   carries a registered open item, `connector-orientation` (`:306`), whose stated
   resolution is *"`climb` becomes a mask like `mask`"*. **fields.js is the
   declared future owner of connector direction.** Shipping a second answer
   beside it without reconciling is the exact second-source-of-truth failure this
   design exists to prevent. **Say where direction lives, in writing, or retire
   the open item.**

## 8 · THREE THINGS I WOULD NOT BUILD

- **The contact-shadow argument.** It is worth **0 pixels**. The shadow pass runs
  entirely before the object pass, and the connector's raster is opaque across
  the whole diamond — measured: 232 px on open grass, 86 at the very foot edge,
  **exactly 0** across the uphill two-thirds of the tile. Three of four designs
  led with it. Do not make it visible either: breaking the one-pass rule puts one
  object's shadow on top of another, which is what the rule is for.
- **A smoothing/slip term.** The only number in the design not derived from the
  art, judgeable only by eye, and keyed on tile change it misses **both** cases
  that would justify it — the intra-tile flank crossing and a ramp deleted under
  a climbing creature (same tile, both times).
- **Gating the arc on the depth fix.** The lift alone halves the occlusion at
  every position on every connector. Gate on it and the visible win waits behind
  the hard part for no reason.

## 9 · WHAT I NEED FROM THE OWNER

1. **May a creature be refused a connector tile as a wander target?** §4 needs
   connectors to stop being ordinary ground. That is a small narrowing of where
   creatures go, and the cosy guarantees are yours, not mine. *(My read: it makes
   them look more purposeful, not less free — a creature that lounges in a
   doorway reads as a bug either way. But it is a behaviour change and it is
   your call.)*
2. **Does a creature idling on a stair stand on a tread, or refuse to idle
   there?** 4,973 idle sim steps happened on a connector in one run.
3. **Is the terrace wall's flight a lane you want creatures constrained into**,
   or should that connector simply not carry a surface? It is the one whose art
   was not built for this.
4. **How much gait do you want?** Layer 3 is the only part that is taste rather
   than geometry, and it is the part you will actually feel.

## 10 · THE INSTRUMENT

One new tool, `tools/climb-probe.mjs`, and it must do the thing **no existing
tool can**: drive a real creature over real terrain *and* see the result.

The drive side and the see side have never been crossed in this project.
`playtest.mjs` imports World, Fields, Bestiary and the catalogue — and never
touches `render.js`. `elevation-probe.mjs` imports `render.js` — and its own
header says its scenes are *"built for render.js directly — no world.js, no
catalog.js"*, with creatures as plain draw entries.

The probe sweeps a creature across each connector at each of four facings and
emits **both**: a per-sim-step table of drawn foot height (so the pop is a
number) and a contact sheet (so the gait is a picture).

> **And it must be shown to fail before it is trusted.** Feed it a popping
> creature and watch it report the pop. Three instruments in three days were
> blind when they were written — that is now the house rule, not a caution.

---

## Maker's mark

Thirteen agents, four independent designs, three judges and two adversaries, and
**the winning design was killed by the adversary rather than the losers.**

The thing worth handing on is not the shape of the fix. It is that **every
serious finding in this document came from running the code, not from reading
it.** The pathing blocker, the 0-pixel shadow, the 72% occlusion, the 500-of-500
lane crossings, the fact that `s` and `fx` are the same number — none of it is
visible in the source. All of it changed the answer.

Two claims in my own earlier reasoning were wrong and are corrected here: I said
the lateral drift would walk a creature off a ramp (it never changes which tile
a creature reports — 500 seeds, 0 cases), and I framed the pop as the defect
(the occlusion is worse, and the pop is its punctuation). Both were plausible.
Both were checkable. **Neither was checked until something checked it.**

*— Claude Opus 5, 2026-08-03*
