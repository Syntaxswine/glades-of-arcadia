# HANDOFF — LAYERS, STUDS, AND THE VAULT

**2026-08-05.** Written by the builder who shipped it.

**This is the third handoff in the solids arc.** Read the other two first — they
are the foundation and nothing here replaces them:

* `HANDOFF-A-GATE-IN-ITS-WALL-2026-08-04.md` — how long one tile of a run is,
  and the slab primitives.
* `HANDOFF-SOLIDS-AND-THE-BENDING-RUN-2026-08-04.md` — `js/art/solid.js`, and
  **§3 prove the frame first**, which is still the step that makes everything
  else safe.

This one is about what happens when a family is **not one slab from the ground
up**, and about the shape that has no axis-aligned parts at all.

The owner's words, because every section answers one:

> *"the balustrade is cropped on the bottom and ribbons in the < and >
> directions but not the top or bottom corners."*

> *"colonnade doesn't work like a fence or rotate"*

> *"ruined archway still has outdated graphics that are not in isometric
> perspective. there should probably also be a non ruined archway too."*

---

## 1 · WHY THE BALUSTRADE WAS LAST, and it was structural

`solidJoins` extruded **one box from the ground to H**. That is the whole truth
about a hedge and about a wall — and false about a balustrade, which is two
rails with air between them.

So it stayed on `linearJoins`, composing a bend from two flat half-bars, and a
bend built from half-bars has no corner mass. **The exact fault the owner had
already named on the hedges, surviving in the one family the fix could not
reach.** Not an oversight; a limit in the tool, which is worth saying because it
is the kind of thing that reads as neglect from outside.

The `<` and `>` are masks **9 and 6** exactly — the two whose old composition
paired a REAL arm with a MIRRORED one. They gain the most ink here (new-only
141 and 200 px), and that ink is the corner mass that was never there. The top
and bottom corners the owner exempted are masks 3 and 12, which pair two arms
of the same kind and happened to hide it.

---

## 2 · `layers` and `studs` — the two things a family may now declare

```
layers: [
  { c0, c1, faces },   a box extruded along the plan, AT ITS OWN HEIGHT
  { studs(g, arm) },   a pass invoked ONCE PER ARM
  { c0, c1, faces },
]
```

A balustrade is `rail · balusters · rail`. A colonnade is the same object built
tall: `columns · entablature`. Saying so is the whole change.

**EACH ARM CARRIES ITS OWN RUN PARAMETER `t`,** running `0..R` whichever way it
points. A family states its rhythm ONCE — "a baluster every three units", "a
column at the tile's start" — and all sixteen states place their members by
filtering that rhythm to the arms they have. Indexed by screen run position, as
it was, a bent balustrade got balusters down its +tx leg and a bare rail down
the other: the second half of reading as a ribbon.

**Balusters and column shafts are objects of revolution.** They look the same
from every horizontal direction, so a bend needs no new art for them — only new
POSITIONS, which is exactly what the arm hands over.

**One z-buffer for the whole piece**, passed between passes. A pass that does
not use the rasteriser at all (a `revolve`) writes with a plain put, leaves the
buffer alone, and a later solid still wins wherever it has a surface — which is
how the top rail hides the baluster heads without anyone ordering it to.

---

## 3 · THE FRAME, PROVEN FIRST — again, and it caught nothing, which is the point

```
the balustrade's two rails as boxes vs the straight bar that ships
  both 740 · hand-only 117 · SOLID-ONLY 0
```

The 117 are the balusters and the back-edge stroke, neither of which `slab` ever
drew. `H = 17`, bottom rail `c 0..2`, handrail `c 14..17` — and `H` was not
chosen, it was **read off** the shipping bar's own arithmetic.

It found nothing wrong. That is what a frame check looks like when it passes,
and it is still cheaper than discovering at the corner that the straight was
half a pixel out.

---

## 4 · FOUR OF MY OWN FAULTS, and the shape of each

| | |
|---|---|
| `face[k - 1]` | **`k` IS NOT AN INTEGER ON ODD COLUMNS.** `face[0.5]` is `undefined`, `put` skips falsy, and both rails had a one-pixel hole down every second column. old-only **29 → 1**. |
| `at(0)` on a hub | a hub is a **POINT**, not a run, and answered the `ty` parameterisation — putting the corner newel half a tile out along +ty. |
| head at `c = 13` | `revolve` sweeps a silhouette in **SCREEN** space, so a baluster 5 px wide is 5 px at ONE world point, and the rail above it is a sheared parallelogram. The shaft runs to `c = 17` now; the upper half is never seen. |
| `D = 8` on the vault | the view ray drops **two units of height per unit of depth**, so the arch swallowed its own opening and came out a culvert. |

The first is the same class as the wire mesh and the detached back edge:
**arithmetic that is right about the projection and wrong about the raster.**
Three instances now. If a fourth appears, the fix is a helper that owns the
rounding rather than four call sites that each remember.

The second was found by **keying each stud to its own character and printing
the grid** — `1` for a tx arm, `2` for a ty arm, `#` for the hub. Two things
stood at that corner and only the marked render said which was the wrong one.

---

## 5 · THE COLONNADE — a footprint that was never a fact about colonnades

It could neither run nor rotate, and the two were ONE fault. A single sprite
three tiles long: no join art, so a second laid beside the first did not meet
it; and a 3×1 footprint, which `catalog.js` §TURNS refuses outright.

The note in §TURNS **named it by hand** —

> *"which is why `cave-mouth` (2x1) and `colonnade` (3x1) are absent from a list
> they otherwise belong at the top of"*

— and was right about the mechanism and wrong about the remedy. It read as
though 3×1 were a fact about COLONNADES. It was a fact about one SPRITE.

**Before teaching a mirror about oblong footprints, ask whether the thing wanted
a footprint at all.** Nobody wants exactly three bays.

A run of three still stands **four** columns, because the far one is drawn only
where there is no next tile to carry it — the same rule the gateways and the cut
ends follow. A junction stands its column ON the turn and skips its own start
column, or a T would have two half a tile apart.

**Deposits came down, order 3 → 2.** They are per tile now, so what used to be
one placement is three; leaving the number alone would have tripled a
colonnade's effect in silence. Flagging this because it is a balance change made
as a *consequence* of an art change, which is the kind that goes unnoticed.

---

## 6 · THE VAULT — `extrudeInto`, and why a box could not do it

An arch is the one common building form with **no axis-aligned parts**. Its ring
is a circle, so `box()` can only staircase it, and drawing its three faces by
hand is the exact mistake `solid.js` exists to prevent.

So state the profile in the vertical `(a, c)` plane and sweep it across `b`:

```
inside(a, c)                is there material here?
skin(a, c, b, near, x, y)   `near` = the b1 end — the arch's own FACE
```

**MARCHED, NOT SOLVED.** `renderInto` inverts each face in closed form because a
box has three flat ones; an arbitrary profile has no such inverse. Each screen
pixel walks its view ray near-to-far and stops at the first material — the same
"largest `a + b + 2c` wins" rule reached by search instead of algebra, and still
**per screen pixel**, so a surface still cannot come out with holes in it.

What it buys, and what no flat drawing can have, is the **INTRADOS**: the
underside of the vault, seen through the opening on the left, receding. That
surface is the difference between a hoop and something you walk through.

### THE DEPTH IS ARITHMETIC, NOT TASTE

The view ray drops **two units of height per unit of depth**. A vault `D` deep
swallows `2D` of its own opening: enter at the springing on the axis, leave at
`(AC − D, SPRING − 2D)`. At `D = 8` that is 8 units off-axis against an opening
6 wide — solid stone. The first pass was a **culvert**. At 4 it is 4 against 6
and daylight runs through the middle, which is the entire point of an arch.

### TWO MORE, both found by looking

- **A flat extrados read as a rounded block.** Lit by ANGLE now: the outward
  normal is `(cos θ, sin θ)`, +a runs down-right and +c is up, so it takes
  `sin θ − cos θ / 2`.
- **A pier exactly as wide as the ring it carries has no moment of "the arch
  starts here".** Two pixels of projecting impost over a pier half a pixel
  stouter, and it stops being a staple.

### THREE DRAWINGS OF ONE OBJECT

`props.js` had a flat 32 px `ruined-arch` — the one the catalogue served.
`decor.js` had a second, better, flat one under `ruined-archway`, **unreachable
since the day it was written** because the catalogue asks for `ruined-arch`.
`registry-audit` had been reporting it for weeks. Both deleted; one generator
makes the ruin and the whole arch, so they cannot drift into being different
buildings.

---

## 7 · `KNOWN_UNDERSIZED` loses `ruined-arch`, and the note was measuring the plot

> *"2x1 claimed: 25px short"*

That reads as a note about art. It was a note about a **footprint**: a flat 32 px
sprite on a plot two tiles long was never going to fill it, and the exemption
stopped anyone asking why the footprint was 2×1 at all.

**Check what a piece CLAIMS before granting it room to be small.** This is the
second time in two days an exemption list turned out to name a symptom and hide
its cause — `KNOWN_FLAT_FEET` did it yesterday with the balustrade's grid.

---

## 8 · `gap-audit` listed three run families of five

It was written the day the gateways were, and gateways were that day's question.
`balustrade` and `colonnade` were simply absent. **A family absent from an
instrument reads exactly like a family that passed.** Both added, both named
see-through by design with a reason, as the tool requires.

```
balustrade, plain run    333    by design
colonnade,  plain run    759    by design
```

---

## 9 · What is open

- **`stepped-terrace-wall` still cannot bend**, named in `joining.test.mjs` with
  its reason: a wall that CLIMBS needs sixteen states times the step profile.
  It is now the only run family not on solids.
- **The mirrored (+ty) drawing inverts the light** — for every mirrored piece in
  the game. The balustrade escaped it by being drawn rather than mirrored (which
  is why its ty masks recoloured ~380 px), but `axialJoins` still mirrors, so
  every gateway still has it.
- **`gap-audit` composes straight runs only.** Pointed at an L it reports
  thousands for every family. It would need to mirror the +ty leg the way the
  renderer does before its corner numbers mean anything.
- **`extrudeInto` has no `solidJoins` equivalent** — a swept profile cannot yet
  take part in a run. If an archway is ever wanted as a gate set into a wall
  (the way `hedge-arch` is), that is the gap.
- **The elbow seam.** A run's corner shows a one-pixel dark line where the
  neighbour's outline crosses it. `hedge-low` has it, the balustrade now has it
  identically, and the owner has accepted the hedges — but it is one artifact,
  not two, and it would be fixed once for everything.
- **21 unreachable props sprites, 10 `KNOWN_UNDERSIZED` exemptions.** Both lists
  shrank by one today, both by finding the cause rather than by deleting.

---

## 10 · State at handoff

| | |
|---|---|
| tests | **471** / 0 fail |
| playtest | 49 / 49 |
| `iso-audit --strict` | **0 of 329** |
| `anchor-audit` | 8 floating / 0 buried / 10 mismatches *(was 9 / 0 / 11)* |
| `registry-audit` | 2 shadowed · 0 promised · 138 unreached |
| `gap-audit` | 0 on every solid family and both gateways |
| run-overlap, balustrade mid-run | **6.3%** (hedge-low 6.4%) |
| commits | 3, `b196da7..a6b48b8`, all pushed |

**Byte-identity checked** for `hedge-low`, `hedge-tall` and `drystone-wall`
across the `solid.js` refactor, by sha against HEAD before and after. The three
families already on solids did not move.

**NOT verified in the live browser.** Same as yesterday: the preview pane stays
hidden, so `document.hidden` is true, `rAF` never runs and the game never boots
past its title screen. Everything above is measured and rendered through
`joinshot` and `gap-audit`, which import the same modules the game does — and
every visual judgement in this document was made by rendering a PNG and looking
at it. **Nobody has walked a garden containing any of it.**

**Changed:** `js/art/solid.js` (`layers`, `studs`, the shared z-buffer,
`extrudeInto`), `js/art/decor.js` (balustrade, colonnade, both archways),
`js/art/props.js` (the flat arch deleted), `js/catalog.js` (colonnade 3×1 → 1×1,
ruined-arch 2×1 → 1×1, `archway` added, three names into §TURNS),
`tools/gap-audit.mjs`, `test/sprite-anchors.test.mjs`,
`docs/TITLE-AND-CONTROLS.md`, and the `iso-solid-sprites` skill (§5a, §5b, §9).
