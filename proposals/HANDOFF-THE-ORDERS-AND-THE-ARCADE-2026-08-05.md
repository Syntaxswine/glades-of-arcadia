# HANDOFF — THE ORDERS, AND THE ARCADE

**2026-08-05, second half.** Written by the builder who shipped it.

**Fourth in the solids arc, and cumulative.** Read the other three first —
nothing here replaces them:

* `HANDOFF-A-GATE-IN-ITS-WALL-2026-08-04.md` — how long one tile of a run is.
* `HANDOFF-SOLIDS-AND-THE-BENDING-RUN-2026-08-04.md` — `js/art/solid.js`, and
  **§3 prove the frame first**.
* `HANDOFF-LAYERS-STUDS-AND-THE-VAULT-2026-08-05.md` — `layers`, `studs`,
  `extrudeInto`.

This one is about **the columns** — the last hand-drawn geometry in the
neoclassical set — and about the **arcade**, which is the first family to need
both halves of `solid.js` at once.

The owner's words, because every section answers one:

> *"this might be a good time to use that new 3d to sprite tool."*

> *"if a column is in isometric perspective the base and the capital should be
> in isometric perspective instead of viewed straight on. so they should be
> trapezoids or ellipses instead of horizontal lines."*

> *"you are getting closer, but there are still some perspective issues, when
> overlapping things, place stuff at the bottom first and then add the stuff
> above it."*

> *"lets add the arcade too."*

---

## 1 · THE SENTENCE THAT NAMED THE FAULT BY ITS INSTRUMENT

> *"trapezoids or ellipses instead of horizontal lines"*

The fault was **`hline`**. `plinth()` and all three capitals drew their SQUARE
members as stacked horizontal bands — a square seen FACE ON, right for an
elevation drawing and flat in a projection where everything around it recedes.

The shaft got away with it because a cylinder genuinely does look the same from
every horizontal direction. **A square does not.**

And "or ellipses" is the other half: ROUND members already had their primitive
in that file — `drum()`, a 2:1 elliptical top face over a cylindrical band, used
by the tholos steps and the birdbath since they were drawn. The capitals never
reached for it.

**New `slabSquare(g, cx, seatY, w, hgt, ramp)`.** `seatY` is the CENTRE of the
top face, so the slab straddles it — far half behind whatever stands on it, near
half in front.

---

## 2 · THE ARITHMETIC THAT DECIDES EVERY SQUARE MEMBER

```
a square of screen width w has a = b = w / 4,
so its top face is w / 2 TALL.
```

Not a tunable. It is what a square IS here, and it is why an abacus 19 px across
needs ten rows where five flat bands used to do, and why `plinthH` takes `w`
now: **the height of a base is a function of its width.**

**I nearly stopped the work on a bad measurement.** The first cost estimate said
+5 to +12 rows per object across eleven objects, which would have been a real
proportion change to the whole set. That was measuring to the LOWEST PIXEL. To
the **anchor** it is +1 to +4 — because an isometric base's own near half IS the
ground diamond that `foot()` was faking under a flat stack. `foot()` is gone
from `plinth`, and not by oversight.

*Measure to the thing that actually matters before letting a number veto the
work.*

---

## 3 · BOTTOM UP, BECAUSE HIGHER IS NEARER

Depth is `a + b + 2c`, so a higher member is a NEARER member: **lowest drawn
first, highest last.** Every column assembly did the reverse.

| | |
|---|---|
| colonnade studs | capital → shaft → plinth — top-down, all three |
| `columnGrid` | shaft → capital → plinth |
| urn, sundial, birdbath, obelisk, amphora, broken column | body → plinth |

The symptom: a plinth's top face covering the foot of the thing standing on it
(its FAR half belongs behind), a shaft covering its own capital's underside, and
a hairline of grass between two members that should meet.

**BOTTOM-UP NEEDS NO SECOND PASS.** I had half-designed a draw-the-near-half-
again scheme before noticing the ordering alone is sufficient: the body drawn
after the base already covers the far half, and the near half survives because
the body never reaches those rows.

**One correct instance existed and nine did not.** `fountainJetGrid` carries the
comment *"The plinth first, so the bowl draws over its cap."* Somebody worked
this out once and it stayed local to the fountain. Third time this week a fact
was written down in one place and not applied in the others.

---

## 4 · THE TORUS — the square courses step up to a round cushion

Read off the owner's reference render. Their bases go square-course → square-
course → **round torus**, and the shaft lands on the torus. Mine went from a
sharp-cornered square cap straight into a fluted cylinder, and the two read as
separate objects stacked rather than one worked base. One line in `plinth()`, so
all eleven objects that stand on one get it.

---

## 5 · THE ARCADE — both halves of `solid.js`, composing

A colonnade is TRABEATED: posts and a straight beam, and the beam is the limit
because stone spans badly in tension. An arcade is ARCUATED: each bay is an
arch, which carries in compression. **Different buildings; both belong in the
catalogue.** This is not a replacement for `colonnade`.

```
columns and cornice   solidJoins layers + studs
the arched wall       extrudeInto, a profile swept across depth
```

### `extrudeInto` gains `axis`

It could only state its profile in the (a, c) plane, so it could build an arch
spanning +tx and had no idea how to build one spanning +ty — fine for a
free-standing archway, which just mirrors, useless for a run that turns. Both
cases fall out of the same two equations — x gives `a - b = h`, y gives
`a + b - c = v` — solved for whichever of the pair is the sweep parameter.

The arm ctx now carries **`frame`** (including the piece's own z-buffer), so a
stud pass can sweep a profile and have it resolve against the boxes around it
instead of painting over them. Also `first`, `turning`, `Cb`, `HALF`.

### THE HUB CTX IS ALWAYS OFFERED NOW, and the family decides

A colonnade wants a post at the crossing only where the run TURNS; an arcade
wants its column at the tile centre on every mask. Gating it inside `solidJoins`
served the first customer and would have refused the second.

**The balustrade's newel had been relying on that gating**, and masks 5 and 10
started sprouting posts. Its `turning` check moved into `decor.js` where the
decision belongs. **The tests did not catch this — the byte-identity check
against HEAD did.**

### Three things the arcade taught

- **The column stands at the TILE CENTRE, not its start**, and that one choice
  makes the joining work. Adjacent columns are then exactly one tile apart, so a
  bay has span R and its CROWN lands on the tile BOUNDARY — which means each
  tile draws two QUARTER-arches, one per arm, and the arm structure is already
  exactly that shape. A corner gets two quarter-arches at right angles off one
  column, which is what a real arcade does on a turn.
- **AN ARCADE IS A WALL WITH HOLES IN IT.** Pass one drew the voussoir ring
  alone and left the spandrels open; the arches read as thin bands hung between
  columns with sky behind them. An arch is only legible against solid — it is
  the ABSENCE the eye names, not the ring. `inside` describes the WALL and the
  opening is where it says no.
- **THE RING IS ELLIPTICAL IN WORLD UNITS, and that is a judgement call, not a
  shortcut — flag it if you disagree.** A true semicircle here is FOUR TO ONE
  wide-to-tall (a unit of `a` is 2 px of x, a unit of `c` is 1 px of y), so a
  one-tile bay rises eight pixels. Passes one and two drew that hairline swoop
  and no radius fixes it, because the flatness IS the projection. But this
  game's art already exaggerates height everywhere — a level is 16 units and a
  tall hedge is 30, a column 50. Matching the arch to the vertical scale the
  rest of the art actually uses is CONSISTENCY; the alternative is the only arch
  in the game obeying a rule no other object does. Stilted on jambs as well,
  which is what real arcades with this problem do. **It is one constant if the
  owner would rather it stayed strictly circular.**

Engaged columns, drawn AFTER the wall so their near half stands proud — the
Colosseum's motif, the arcade carrying the load and the order applied to its
face. Where the run stops, a solid ABUTMENT: a cornice hanging over open air
with half an arch under it is not an end.

---

## 6 · What is open

- **The arcade's corner.** The two legs' walls meet with a visible seam and the
  corner column sits behind the turn rather than on it. It works; it is not
  finished.
- **The orders are Doric where the reference is Corinthian**, and the cornice is
  one course where the reference has four. No new machinery needed — that is
  authoring, detail by detail.
- **`stepped-terrace-wall` still cannot bend** — the only run family not on
  solids.
- **The mirrored (+ty) drawing inverts the light**, for every mirrored piece in
  the game. `axialJoins` still mirrors, so every gateway still has it.
- **`gap-audit` composes straight runs only.** Pointed at an L it reports
  thousands for every family.
- **The one-pixel elbow seam** where a run turns: `hedge-low`, the balustrade
  and the colonnade all share it. One artifact, fixable once for everything.
- **21 unreachable props sprites, 10 `KNOWN_UNDERSIZED` exemptions.**

---

## 7 · State at handoff

| | |
|---|---|
| tests | **471** / 0 fail |
| playtest | **50 / 50** (the arcade added one) |
| `iso-audit --strict` | **0** |
| `anchor-audit` | 8 floating / 0 buried / 10 mismatches — unchanged all day |
| `registry-audit` | 229 sprites · 91 named · 2 shadowed · 0 promised |
| `gap-audit` | 0 on every solid family and both gateways |
| commits | 4, `d93c927..78dbd55`, all pushed |

**Byte-identity checked twice today** — once across the `layers`/`studs`
refactor and once across the `axis` generalisation — for `hedge-low`,
`hedge-tall`, `balustrade`, `colonnade`, both archways and `drystone-wall`. Both
times by sha against HEAD, and the second time it caught a real regression the
471 tests did not.

**NOT verified in the live browser**, same as the last three handoffs: the
preview pane stays hidden, so `document.hidden` is true, `rAF` never runs and
the game never boots past its title screen. Every visual judgement in this
document was made by rendering a PNG through `joinshot` and looking at it.
**Nobody has walked a garden containing any of it.**

**Changed:** `js/art/solid.js` (`extrudeInto` axis, the arm ctx's `frame` /
`first` / `turning`, the hub ctx always offered), `js/art/decor.js`
(`slabSquare`, `standOn`, `plinth` on solids with a torus, `doricCapital`,
bottom-up ordering in nine assemblies, `arcadeSolid`), `js/catalog.js` (the
`arcade` entry, into §TURNS), `tools/gap-audit.mjs`, and the `iso-solid-sprites`
skill (§8a bottom-up).
