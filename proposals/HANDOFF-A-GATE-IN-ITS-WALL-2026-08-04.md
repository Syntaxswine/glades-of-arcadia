# HANDOFF — A GATE IN ITS WALL

**2026-08-04.** Written by the builder who shipped it, for whoever picks it up.

This day started as bookkeeping — closing the four open items in
`HANDOFF-JOINING-AND-THE-CUBIC-HEDGE-2026-08-03.md` §7 — and turned into
something else three messages in, because the owner was looking at gateways
while the bookkeeping was going on. All four items are closed. So are three
faults nobody had a ticket for.

The owner's three messages, because every fix below answers one:

> *"so the tall hedge gate color matches, but not the location in space and it
> does have open edges"*

> *"dry stone wall gate also has problems, something about how the wall is
> rendered. its way longer than the other walls, and so when the gate is placed
> between the segments the walls on either end cover it. it also has problems
> with not being volumetric."*

> *"the cypress screen has similar problems to the drystone wall. the preview
> that shows where its building also seems bugged."*

---

## 1 · One fault, three costumes

Every one of these is the same sentence: **a piece of a run has to agree with
its neighbours about where the run IS.** They looked like three unrelated art
bugs and they were one arithmetic bug wearing three hats.

| piece | what was wrong | how it was found |
|---|---|---|
| `drystone-wall` | 65 px of run — **1.97 tiles** | run census |
| `cypress-screen` | art along +tx, plot `[1,2]` along **+ty** | anchor-audit, both lists |
| `hedge-arch` | +4 px proud of its wall over its **whole** length | geometry measure |

A full tile of run is `LINE_W = 33`. The drystone wall's own comment called 65
"a full-tile bar ... its exact midpoint (x = 32 of 65)", and the hand-copied
`ax: 32` agreed with the wrong length, so nothing ever disagreed.

**Why it survived an entire joining arc:** a run of plain wall hides it
perfectly. Each piece covers its neighbour with more of the same masonry, and
the result is a continuous wall. It took a **GATE** — the one piece in a run
that is *not* interchangeable with its neighbours — to make the overlap
visible. Uniform things can be wrong in ways only a non-uniform neighbour can
show you.

---

## 2 · The numbers

Measured, not estimated. The "before" column was taken by stashing the fix and
re-running the probe, which is worth the ninety seconds every time.

| | before | after |
|---|---|---|
| drystone run length | 65 px | 34 |
| drystone self-overlap (mask 5) | **50.1%** | 5.0% |
| drystone-gateway self-overlap | 34.4% | 6.9% |
| every other family | — | 0.0 – 6.9% |
| hedge-arch `ay` | 54 | **50 = hedge-tall's** |
| cypress run | 66 px | 33 |
| cypress footprint | `[1, 2]` | `[1, 1]` |
| detached back-edge pixels, `hedge-low` | **20 / 50 columns** | 0 |
| anchor-audit | 10 floating / 12 mismatches | **9 / 11** |

---

## 3 · The guard, and one that was measured and thrown away

**What shipped:** a run's pieces must not cover each other. Lay a piece down,
lay its `+tx` neighbour down, count how much of the first the second buries.
20% is a third of the fault and three times the healthy maximum. It is verified
to **REFUSE** — stashing the fix fails it with *"drystone-wall covers 50.1% of
itself with its own neighbour"*.

**This is not a width check, deliberately.** A piece's ink is wider than its run
(a slab's top face recedes `2 * depth` to the left), so any constant bound on
width is a number nobody can defend and every artist has to work around.

**And here is the one that was tried and rejected**, because it is the obvious
idea and the next person will have it too:

> *a sprite must not be wider than the diamond of its own plot.*

It sounds right and it is useless. A 1×1 plot's diamond is `TILE_W` = **64 px**
wide, because it spans both axes; a one-tile *run* is 33, because a tile STEP is
32. The old drystone wall was 65 against that 64 — over by **one pixel**. The
old cypress was 66. Neither fault would have tripped it. A census across the
whole catalogue found exactly two sprites over their plot (`pergola` +5,
`marble-exedra` +1), both harmless overhangs.

**A guard whose resolution cannot support its question returns noise shaped like
an answer.** Check that a proposed invariant refuses the bug you already have
before you ship it.

---

## 4 · Where each fix came from

**The stone gate had the answer first.** `drystoneGrid` raises only the MIDDLE
of its run — its ends stay at wall height, so a gateway meets its neighbours
flush and no cut face is ever exposed. The hedge arch lifted its whole bar by
four instead, and since a bar has no end cap, those four pixels showed the
arch's raw lit cross-section above every neighbour. That is the owner's *"open
edges"*, exactly, and it is why the colour could match while the piece still
read as a separate object. `decor.js` now copies `props.js`.

It is also what a clipped yew arch looks like in a real garden — the hedge runs
level and a squared crown stands over the doorway. **The geometry fix and the
botany agreed, which is usually the sign of the right one.**

**`slab` states a fact about the projection, so it moved to `format.js`.** The
wall drew its cap as a vertical band directly above its face. A top face is a
parallelogram whose near edge sits `2 * depth` to the LEFT of its far edge, and
that offset is the whole difference between a box and a ribbon — the owner's
*"not being volumetric"*. The note above `LINE_W` had already demanded this and
even named the case: *"a hedge and a drystone wall that bent at different
pitches would be the exact seam this whole arc is about."* They did not bend at
different pitches. They disagreed about which way a surface recedes.

---

## 5 · DO NOT HAND-ROLL A TOP FACE

Written twice in one afternoon, wrong both times, so it gets its own section.

```js
for (let b = 0; b <= D; b++) put(g, X0 + i - 2 * b, yTop + b, key); // WRONG
```

That is not a fill. Stepping `b` moves x by **−2** while stepping `i` moves it
by **+1**, so only two screen columns in every four are ever written and the cap
comes out as **wire mesh with the grass showing through it**. `slab()` iterates
the bounding box and tests membership for exactly this reason. The keyFn is the
part an artist owns; the fill is the projection's business.

The same parity bug had been shipped for months in `slabBackEdge`, which indexed
by run position with `LINE_DROP` (floors) while `slab`'s far edge lands on
`ceil`. On odd columns the stroke went one further pixel up and hung clear of
its own mass — 20 of `hedge-low`'s 50 columns. **It was in every render of the
hedges since they were drawn, and had been written off as a stylistic edge.**

The nicks had it too, and were making it worse: a nick fired at `LINE_DROP`
punched out the slab's top pixel on even columns and *left the back edge above
it*, manufacturing the very floating stroke. They now come off the topmost
pixel. `slabBackEdgeY` exists so a caller can say that without knowing the
rounding rule, and `slabBackEdge` takes a `keep(i)` predicate so a piece drawn
at two heights never needs its own copy of the loop.

---

## 6 · Three instruments had already said so

`cypress-screen` was in **both** of anchor-audit's lists — as a float and as a
footprint mismatch, *"1x2 claimed, art is 1x1"* — and `sprite-anchors.test.mjs`
carried it as a `KNOWN_UNDERSIZED` exemption reading *"1x2 claimed: 16px
short"*. Three readings, all correct, and the diagnosis was never made.

Nobody could have satisfied that plot by adding reach, because the art and the
plot pointed at **right angles**. That is also the whole of the *"preview seems
bugged"* report: the ghost is drawn from the footprint and the art from the
sprite, and here the two genuinely disagreed about which way the object lay.
**Nothing was ever wrong with the ghost.**

- **A number that will not come right under the obvious fix is usually
  measuring something other than what its column heading says.**
- **An exemption is a bug with a note on it.** `cypress-screen` is the first
  name to leave `KNOWN_UNDERSIZED`. Eleven remain, and each is a claim that
  something is fine which nobody has re-derived.

And the reason no *test* caught the wall: `joiningFamilies()` in the test helper
scanned `decor.DECOR` and `extras.EXTRAS` — **not `props.PROPS`**, where the
drystone wall lives. Every family-level assertion silently skipped it, so a
two-tile wall ran for a whole arc behind a green suite. **A helper that decides
which modules count is a blind spot written down**, and this one named two of
the three art modules and looked complete.

---

## 7 · The second hedge family is gone

`hedgeRun`, `CLIPPED_HEDGE`, `TALL_HEDGE`, `HEDGE_ARCH` and their three `PROPS`
entries — **155 lines the game never drew a pixel of**. Two were registered
under placeable ids nothing looks up; the third was overwritten by `decor.js`.
They cost a whole edit the day before, when the owner's cubic hedge was built in
them by mistake.

They were also a second home for the constant this arc got wrong: `hedgeRun`
opened `const len = 65` and the arch cut its doorway at `gap: {x0: 21, x1: 44}`
of that 65. **Keeping a dead copy "in step" is not free — it is a second place
for a wrong number to look deliberate.**

They left a live contradiction behind, too. The `AFFINITY` note still described
the arch's opening as *"22px of genuinely transparent pixels"*, which was the
dead art. The arch the game draws has a DARK opening, and `decor.js` has the
better argument — *"a hole cut in a hedge that shows the grass behind it reads
as damage"*. Two files stated opposite rules for one object for as long as both
existed.

**NEW: `tools/registry-audit.mjs`.** Replicates `createArtist`'s precedence
exactly and reports SHADOWED (defined twice, last wins) and UNREACHED (never
resolved by `art.sprite` or `art.wanted`). It **reports and does not refuse** —
most unreached sprites are healthy, since `tiles.js` terrain is picked by name
at runtime and `art.wanted` names sprites that deliberately do not exist yet.
A census to read, not a gate to pass. Shadowed names: 3 → 2.

---

## 8 · What is open

- **`gravel-walk` is defined TWICE and asked for NEVER.** Both copies dead.
  One line of `registry-audit` output; not touched here.
- **22 `props.js` sprites are unreachable and named after placeable ids** —
  `bench`, `column`, `urn`, `ash-tree` and friends. The same trap as the hedges,
  at scale. Most are probably superseded by `decor.js` or by `grow` composers.
  Worth one pass with `registry-audit --verbose`; **not** worth deleting blind.
- **Eleven `KNOWN_UNDERSIZED` exemptions remain**, all `2x1`/`2x2` claims by
  sprites drawn `1x1`. At least some are the cypress fault again: a plot in one
  axis and art in another. Check the AXIS before adding reach.
- **The gateway's proportions were scaled, not re-judged.** `HALF_GAP` 10 → 5
  and `PIER` 6 → 3 keep the old fractions of a run that is now half as long. It
  reads correctly in `joinshot`; nobody has looked at it at 1× in a real garden.
- **`hedge-arch` renders stone-grey in `joinshot`** — still true, still
  uninvestigated. The owner confirms the colour is right IN GAME, so this is the
  instrument, not the art. `joinshot` builds its registry as
  `{...PROPS, ...DECOR, ...EXTRAS}`, which lets EXTRAS beat DECOR where the game
  has DECOR last. No name collides across those two today, so it is latent —
  but it is the same class of fault as §6 and should be brought into line.

---

## 9 · State at handoff

| | |
|---|---|
| tests | **470** (+1: the run-overlap guard) |
| playtest | 49 / 49 |
| `iso-audit --strict` | 1 of 309 — `balustrade`, the known step-4 entry |
| `anchor-audit` | **9 floating / 0 buried / 11 mismatches** (was 10 / 0 / 12) |
| `registry-audit` | 2 shadowed · 139 unreached · 0 promised |
| verified | `joinshot` renders of every configuration, and numerically |
| **NOT verified** | **in the live browser** — see below |
| commits | `d0a0b05`, `0bae2d2`, `ebb9ad0`, `199c751` |

**The browser check did not happen and this is not a claim that it passed.**
The preview pane was not displayed, so `document.hidden` was `true`, `rAF` never
ran, the game never booted past its title screen and `window.arcadia` was never
assigned. That is the documented trap, not a fault in any of this. The art path
is covered — `joinshot` imports the same modules the game does — but **a garden
with a gateway in it has not been looked at by a human or by me.** Do that
first.

**Files:** `js/art/format.js` (the slab primitives, `slabBackEdge` parity and
`keep`), `js/art/props.js` (the wall rebuilt, the dead family retired, cypress),
`js/art/decor.js` (the arch's crown, the nicks), `js/catalog.js` (cypress
footprint), `js/main.js` (the precedence note), `test/joining.test.mjs` (the
guard, and `props.PROPS` in scope), `test/sprite-anchors.test.mjs` (one
exemption fewer), `tools/registry-audit.mjs` (new).
