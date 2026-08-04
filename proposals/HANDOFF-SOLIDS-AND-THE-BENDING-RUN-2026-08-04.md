# HANDOFF — SOLIDS, AND A RUN THAT BENDS

**2026-08-04, second half.** Written by the builder who shipped it.

**This is the second handoff of the day.** The first,
`HANDOFF-A-GATE-IN-ITS-WALL-2026-08-04.md`, is about **how long one tile of a
run is** and the slab primitives — read it first, it is the foundation. This one
is about what happened when the owner kept looking: a run that turns a corner,
and the primitive that makes that possible.

Their words, because every section answers one:

> *"could we just make it so its always drawn closed and the hedges that are in
> front of the other edges always overlap?"*

> *"the balistrade does not bend like the other fences. the fence is working
> perfectly. … when you made it bend 90 degrees it bends like a ribbon instead
> of a three dimensional object."*

> *"i'd also like to propose a skill that turns simple 3d objects into sprites.
> its probably too late for this game, but boy would that have helped with the
> hedges."*

> *"both the gates are open on the side. and the old stone wall gate is cropped
> on the top. the balustrade is cropped on the bottom … the low hedges and the
> high hedges have lines in the \ direction."*

---

## 1 · THE ONE FAULT, and it is worth stating once

Every art bug this week was the same bug: **somebody re-derived the projection
by hand and got it slightly wrong.**

| | |
|---|---|
| the drystone cap | a vertical band above the face → a ribbon |
| the wire mesh, twice | `for b: put(x - 2b, y + b)` writes two columns in four |
| the back edge | floored where `slab` ceils → a stroke hanging one pixel clear |
| the crown's wedge | a step down with nothing drawn in it → grass through a hedge |
| the missing end face | a raised section has ENDS; nothing drew them |
| the corner | two flat half-bars have no corner mass |
| the `\` lines | a back edge put INSIDE the top face → a stripe down the run |

**Not one of those is an artistic decision.** That is why the owner's proposal
was the right diagnosis and not a nice-to-have.

---

## 2 · `js/art/solid.js` — describe the shape, let the projection draw it

`box()` in world units, `render()`/`renderInto()` with a z-buffer, `outline()`,
`solidJoins()`. The axes are **read off `slab`'s own membership test**, not
invented, so this module and every existing sprite agree to the pixel:

```
a along +tx = (+2, +1)      b along +ty = (-2, +1)      c up = (0, -1)
x = x0 + 2a - 2b            y = yTop + a + b + lift - c
```

One tile step is 16 units of `a`; `LINE_W = 33` is 16.5 of them. **A hedge is
`box(0, 16.5, 0, D, 0, H)`.**

**Corners come free.** Two world points share a screen pixel exactly when they
differ by a multiple of **(1, 1, 2)** — check it: x by `2 − 2 + 0`, y by
`1 + 1 − 2`. That vector is the view ray, so `depth = a + b + 2c` and larger is
nearer. An L is two boxes; the outer corner fills because there is solid there
to see, and the inner corner notches because there is not.

**PER SCREEN PIXEL, NEVER PER SURFACE POINT.** Three closed forms, one per
visible face, bounds-checked and resolved by depth. This is what makes a face
hole-free by construction, and it is the trap that produced the wire mesh twice.

Captured as the portable skill **`iso-solid-sprites`** in `~/.claude/skills/`.

---

## 3 · THE STEP THAT MADE THE CONVERSION SAFE — do this first, always

Before writing a single shape, **prove the frame**: build the family's straight
bar as a solid in the family's own `x0`/`yTop`/`lift` and compare it with the
art that already ships.

```
hedge-tall mask5 vs a solid box in the same frame
  both 1573 · hand-only 33 · solid-only 0 · agreement 97.9%
```

**Zero solid-only pixels.** The 33 spare are the hand version's back-edge stroke
and its nicks, which `slab` never drew either. So a straight built this way IS
the straight that shipped, and a corner meets it without a seam.

Without that number first, "does the corner line up with the run" is a matter of
opinion. `renderInto` exists precisely so this check is possible.

---

## 4 · What the existing instruments caught, all of it mine

Four errors, none of which needed a new check — they needed **running** one.

| error | caught by | reading |
|---|---|---|
| straight bars drew an end cap the neighbour buries | run-overlap guard | **22.6%** |
| interior faces between arms | run-overlap guard | **13.6%** → 5.4% |
| a nick that punched a hole | `gap-audit` | **0 → 10** |
| the wall built 8px too tall (`H = HIGH + D`) | looking at it | — |

The nick one is the sharpest. The hand version erased a pixel of the back-edge
**stroke**, which sits above the surface with nothing behind it. Erase a pixel of
the **top face** instead and, in a run, the neighbour's mass stands over the
hole. A nick is a bite out of the SILHOUETTE — which is what it always was, and
saying so is what makes it safe.

**A face abutting another box is coplanar with its neighbour's interior, not
behind it, so the z-buffer will not hide it.** Each arm now declares which of its
two vertical faces are on the outside. That is not an optimisation; without it
you get a seam down the middle of a solid bar.

---

## 5 · The four the owner could see and the audits could not

- **The `\` lines** were the back edge put inside the top face as "the far
  rank". A constant value at constant depth **is a line down the run**. It lives
  in `outline()` now — topmost ink per column, stroke one pixel above — which
  follows a bend and does not band the surface. (Across the run is masonry and
  the owner is happy with it; along it is a mistake.)
- **The stone gate cropped on top**: piers stand `RISE = 12` above a grid
  starting at `TOP = 3`. The hedge arch got headroom the same day and the wall
  did not — two generators sharing an assumption that nothing in a sprite stands
  higher than the run.
- **Both gates open on the side**: nothing drew a bar's own end.
  New `slabEndCap` (hangs DOWN from the cap, where `slabEndFace` stands UP from
  the run) and `cappedAxialJoins` — four drawings from two, and the mask picks.
  **The cap is drawn only where the run stops.** The base sprite is the CAPPED
  one, because the base sprite IS mask 0.
- **The balustrade cropped at the bottom**: grid 34 rows, bottom rail reaches
  row 40 at the near end.

---

## 6 · `KNOWN_FLAT_FEET` IS EMPTY — and why that is a lesson, not a trophy

That balustrade crop **was** the last entry on the list. It had been carried as

> *"a LINEAR RUN, and its contact is a STRIP along the +tx axis, not a blob …
> blocked on the same open question as the runtime shadow's scalloping."*

A real design question, confidently named, and **not the cause**. The base was
flat because the grid cut it off square. Seven pixels of grid; no shadow decision
required.

```
iso-audit: 329 sprites measured · 0 with a level edge at ground level
```

**A measurement that is correct can still be attributed to the wrong cause, and a
plausible cause written into a list stops anyone measuring again.** That note is
in `tools/isogeom.mjs` where the next name would go. If one goes back on, check
the sprite's own GRID before blaming its art.

---

## 7 · The instruments, and one that lied

- **`tools/gap-audit.mjs`** — composes a run and counts transparent pixels with
  ink *above and below* in the same column. Catches what nothing else could: an
  enclosed-hole flood fill scores 1 (these gaps are open to the sky), and a
  per-sprite notch test scores **0**, because *no single sprite has the fault*.
  It exists only in the composite, only where a piece differs from its
  neighbours. Names the palisade as see-through **by design**.
- **`tools/registry-audit.mjs`** — SHADOWED and UNREACHED sprites, replicating
  `createArtist`'s precedence exactly.
- **AND `gap-audit --map` WAS BLANK FROM THE HOUR IT SHIPPED.** It filled an
  `ImageData` and encoded the *canvas*. Every map was 100% transparent, and a
  transparent PNG opens as a white page — **indistinguishable from "no gaps"**.
  An instrument that fails silently in the direction of good news is worse than
  none. Distrust a clean picture from a young tool until you have seen it show
  you a dirty one.

---

## 8 · What is open

- **THE BALUSTRADE RIBBONS AT A BEND — the one thing left from the owner's
  list.** They noted it is the `<` and `>` corners specifically; the other two
  orientations happen to hide it. It is the last family still composed from flat
  half-bars, and it is the awkward one: **its rails sit at two heights** while
  `solidJoins` builds a single box from the ground up. It needs layered boxes
  (`box` already takes `c0`, so this is a spec change, not a rewrite) plus
  balusters placed **per arm** rather than per run position.
- **`stepped-terrace-wall` cannot bend at all**, named in `joining.test.mjs`
  with its reason: a wall that CLIMBS needs sixteen states times the step
  profile.
- **The mirrored (+ty) drawing inverts the light.** An end face is a step darker
  because it is a box's RIGHT face; mirrored it becomes a left face and reads a
  step too dark. True of `slabFace` and **every mirrored piece in the game** —
  a property of the mirror, not of this work. Fixing it means a second drawing.
- **The gates are still hand-built** and deliberately so: a hole and a lintel
  are easiest said run-position by run-position, and both measure 0.
- **`gap-audit` composes straight runs only.** Pointed at an L it reports
  thousands, for every family, before and after everything here — it would need
  to mirror the +ty leg the way the renderer does before its corner numbers mean
  anything.
- **`gravel-walk` defined twice and asked never; 22 props sprites unreachable**
  (`bench`, `column`, `urn`, `ash-tree` …), the sprite-name-vs-id trap at scale.
  Do not delete blind.
- **Eleven `KNOWN_UNDERSIZED` exemptions remain** in `sprite-anchors.test.mjs`.
  Check the AXIS before adding reach — that was the cypress fault.

---

## 9 · State at handoff

| | |
|---|---|
| tests | **471** |
| playtest | 49 / 49 |
| `gap-audit` | **0** on every plain run and both gateways |
| `iso-audit --strict` | **0 of 329** — the list is empty |
| `anchor-audit` | 9 floating / 0 buried / 11 mismatches |
| `registry-audit` | 2 shadowed · 0 promised |
| commits today | 13, `5437ca0..ef30f74` |
| deployed | verified live — the served `format.js` carries `slabEndCap` |

**NOT verified in the live browser, all day.** The preview pane stays hidden, so
`document.hidden` is true, `rAF` never runs and the game never boots past its
title screen. Everything above is measured and rendered through `joinshot` and
`gap-audit`, which import the same modules the game does — but **nobody has
walked a garden containing any of it.** The owner is verifying by eye instead,
which is how all four of §5 were found.

**New files:** `js/art/solid.js`, `tools/gap-audit.mjs`,
`tools/registry-audit.mjs`, and the skill `iso-solid-sprites`.
**Changed:** `js/art/format.js` (`slabEndFace`, `slabEndCap`,
`cappedAxialJoins`, the `slabBackEdge` parity fix), `js/art/decor.js`
(hedges and the balustrade on solids, the arch's crown), `js/art/props.js`
(the wall on solids, `drystoneSkin` extracted, the gateway's headroom),
`tools/isogeom.mjs` (the empty list), `test/joining.test.mjs`,
`test/sprite-anchors.test.mjs`, `test/iso-ground.test.mjs`.
