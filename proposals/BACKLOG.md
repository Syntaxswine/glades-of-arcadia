# BACKLOG — Glades of Arcadia

Reconciled 2026-08-03 (NINTH pass, §4o — the clock lever, the back rim, the brush, the scramble, and the perception layer)
against **`HANDOFF-THE-IMAGE-PACK-2026-08-02.md`** §8, which is now the
keystone for anything about which way an object faces or how two pieces meet.
`HANDOFF-THE-FIRST-GLADE-2026-07-31.md` remains the keystone for the shadow
arc, the palette laws and the traps.

Nothing here blocks play. The game is complete and live; this is refinement.
Ordered by how much each would improve the thing a player actually sees.

---

## 1 · Legibility

**Sward and fen read too similarly.** *(highest-value item here)*
Thicket (dry, olive, tussocky) and millefleurs (pale, silver, white-flecked) are
instantly distinguishable. The centaur's sward and the naiad's fen are both
mid-greens and at a glance the four read as "greenish variations". They are
already harmonious — that was the hard half. They now need *separation*: push
fen bluer and wetter, push sward paler, drier and coarser. Measure the mean
colour distance between all five the way millefleurs was fixed (it was 8.2 units
from meadow and invisible until someone measured it).

**Terrace edges serrate.** A long cliff has a sawtooth silhouette from the
diamond tops. Inherent to the projection, softenable with corner cap tiles.

**Cave mouths read as flat black holes.** They are prominent — they want an
interior suggestion, a hint of depth or a lit lip.

## 2 · Catalogue hygiene

**130 placeables against a designed ~93.** The count grew past what anyone
deliberately specified, which means it was never audited as a set. Sweep for
near-duplicates and things that differ only by name. Then either prune, or
update `SPEC.md §5`, which still claims 45–60 and is stale either way.

**`NEEDS-DESIGN` items still shipped as placeholders** (deliberately, per the
owner's "note it and move on" rule):

- **Terrace paving with an edge** — depends on the elevation-edge question
- **Garden seat under an arbour** — a seat with an overhead structure has a real
  isometric depth-sort problem; the arbour must draw both behind and in front of
  whatever sits under it. Solvable by slicing per tile.
- **Bridge spanning two levels / a gorge** — objects currently occupy one level

## 3 · Art refinement

- **Olive is the weakest tree.** Correct — gnarled, gappy, silver — but slightly
  noisy at 1×, partly because the `olive` ramp has only 4 entries so two canopy
  indices collapse onto the same hex. Consider a 5th olive value.
- **Oak / plane / ash are distinguishable side by side but not at a glance.**
  Poplar and the conifers carry the silhouette load. Push crown width and bole
  height further apart.
- **Sky holes in canopies** read as pale flecks on grass rather than as gaps.
  Defensible as dappled light; was not the intent.

## 4 · Content

- **Verify Pan actually fires.** He is gated on all four settling plus deep
  maturity. The playtest asserts reachability, but nobody has watched it happen
  in a real garden over real time.
- **The 4-way tile — a syrinx hung on a pine.** Proposed in `DECOR.md`, not
  built. Useless for zoning (it ties four ways) and therefore perfect as Pan's
  key. The best unbuilt idea in the repo.
- **A wading satyr.** Currently he uses crossings only. The naiad belongs in
  water and the unicorn refuses it by character, so **no wading animation is
  owed** — but a satyr splashing in a spring would be a delight. Additive.
- **Cave interiors.** Mouths only, deliberately. Out of scope, not forgotten.

## 4b · The idle life (new, 2026-07-31)

The flourish layer shipped with exactly two entries, both the satyr's. It is
built to take more; see `docs/FLOURISHES.md` for the shape.

- **The other four creatures have no flourish.** The satyr pipes and drinks; the
  centaur, naiad, unicorn and Pan do nothing but wander between ceremonies. The
  obvious ones, in rough order of how much they would add:
  - the **naiad** trailing a hand in still water she is standing beside
  - the **centaur** at a physic bed *outside* his graze hour — he crops it once
    as a ceremony and then never touches it again, which is odd
  - the **unicorn** lowering its horn to a fountain (art exists: its beat pose is
    already `drink`)
  Each needs art, and the art is the expensive half — budget four or five
  rebuilds per pose, not one.
- **Nothing reacts to the recital.** Three minutes of piping happens beside
  creatures who ignore it. Having others drift a tile closer and go idle for its
  duration would be cheap and would land, but it wants care: a creature that
  *walks somewhere* because of it starts to look like a system, and this should
  stay a thing you notice rather than a thing you can use.
- **The pipes are a hidden prop, not an item.** The syrinx he plays is drawn into
  the pose. The catalogue's `syrinx` tag is Pan's capstone site and the proposed
  four-way tile — worth deciding whether the satyr's pipes should relate to
  either, or stay purely his.
- **`piping` fires once a session, armed the moment the track is audibly
  playing.** If it ever wants to recur, it needs a cooldown and a reason — not
  just a flag flip. Whatever you do, do not re-tie it to `musicUnlocked` or to an
  arrival: that is *intent*, and intent fires before there is an AudioContext.
  Two bugs came out of that confusion; `docs/FLOURISHES.md` has both.
- **The drink is silent.** There is no audio hook on a flourish at all. A single
  soft sound on the sip would probably be lovely and would equally probably get
  annoying at the fifth repeat; if tried, tie it to the one-shot's start, not to
  a frame.

## 4c · Found by the reachability audit (2026-07-31)

Four agents traced "can a player actually SEE these animations, from every entry
state". THREE findings were real and are FIXED: the recital unreachable on a
restored save; the fix for THAT firing into silence before any AudioContext
existed; and `phase` animating, which ran every creature in the game ~40% fast.
The muted-player case fell out for free — nothing is playing, so nothing arms.
These are the survivors — real, but not worth stopping for:

- **`CREATURE_SHADOWS` is dead art.** `main.js` passes the authored contact
  stamp as `shadow:`, but `render.js` only reads that field as `false` or a
  number — an object falls through to `1` and it synthesises an elliptical stamp
  from the footprint instead. The shadows you see are procedural; five
  hand-authored sprites are never rasterised. Either wire them up or delete
  them, but do not leave art in the tree that nothing draws.
- **Three sprite-name collisions between modules** with mismatched dimensions:
  `broken-column` (32×29 vs 30×40), `hedge-arch` (65×86 vs 54×56), `gravel-walk`
  (64×34 vs 64×32). The raster cache is a WeakMap keyed on the object so nothing
  is *drawn* wrong, and `main.js` already documents the load order that decides
  which wins — but a name that resolves to "whichever module went last" is a
  trap waiting for someone.
- **`prefers-reduced-motion` does not damp creature animation.** It stops water
  cycling and grass motion and eases the camera, but a creature still walks and
  breathes at full rate. Worth deciding deliberately rather than by omission.
- **A reload is a free drink** — `agent.cool` is runtime-only, so the tipple
  cooldown resets on every load. Harmless in a game with no economy; noted so
  nobody is surprised.

## 4d · Reported from outside

- **Canvas2D `willReadFrequently` warnings from `render.js`** (spotted by rock
  bot in the live browser console). Repeated, non-fatal. A 2D context that gets
  `getImageData` called on it should be created with
  `getContext('2d', { willReadFrequently: true })` or the browser keeps it on
  the GPU and pays a readback stall each time. Worth finding which context is
  being read — the raster/stipple caches are the likely ones — and either
  flagging it at creation or hoisting the read out. Polish, but it is free
  performance and it is noisy in the console.

- **The settling scan still hitches at 60×60.** Fixed from 1205 ms to 58 ms (see
  `grassCounts` memoisation), which unblocked the bigger map, but 58 ms is still
  ~3½ dropped frames every 1.5 garden-seconds. The obvious next step is to
  stagger `_rescan` round-robin — one creature per tick rather than all five —
  which would put it comfortably inside a frame. Not done yet; the map was the
  goal and the freeze was the blocker.

## 4e · The front door — the SAVE SCREEN ✅ SHIPPED (2026-08-01)

The owner's words when it was deferred: *"at a later point we will scope in a
save screen."* This is that point. `js/saves.js` is the reading and the storage
arithmetic; `js/titlescreen.js` is the presentation.

| | |
|---|---|
| **Continue** | opens the most recently saved LIVE garden. Focused on arrival, because a returning player came back for their garden and New Game is the destructive one — the two used to be the same button, and only the destructive one existed |
| **Gardens** | every slot, live and archived, with what is in it. Only appears when there is more than one room behind the door |
| **Recover** | brings back a garden `?new=1` set aside. It **swaps** rather than overwrites, so recovering is itself undoable |
| **Name a new garden** | `?seed=name` has always written to its own slot, so multiple gardens were half-built by accident. Now they are deliberate |
| **Credits** | the music is the owner's own Suno track, non-commercial, licensed separately from the code. The README always said so; the front door is where someone who never reads a repo can see it |

Each row reads as a place rather than a schema: *"9 things planted · Asbolos the
centaur · 1 day ago"*. The resident line comes from `extra.creatures`, counting
only those past `visits` — a visitor does not live there.

**A DAMAGED SAVE IS STILL SHOWN**, with its size and the word *damaged*. The one
thing a save screen must never do is refuse to show you a garden.

**A browser with nothing in it is unchanged**: one button, New game, and the
same note it always had. Verified, because that is the first-run path and it is
the one nobody would notice breaking.

`js/saves.js` **imports nothing** so the title screen does not drag `world.js`
and `catalog.js` in behind it, which costs one duplicated constant — and
`test/saves.test.mjs` opens by asserting `saves.BASE_KEY === world.SAVE_KEY`.
That assertion is the entire reason the duplication is allowed to exist.

### What is NOT done

- **No delete.** Deliberate for now: nothing in this game has ever removed a
  garden, and the first thing that does deserves its own thought about
  confirmation. Storage will fill eventually; that is the trigger to revisit.
- **No rename**, and no way to name the default slot after the fact.
- **No cloud, no export.** A garden lives in one browser's localStorage. An
  export/import pair (the save is already plain JSON) is the cheap version of
  "I got a new laptop" and is not built.
- **`TitleScreen.png` is still 1.9 MB, truecolour.** It is pixel art with a
  limited palette and is almost certainly a 3–4× saving as an indexed PNG. It
  is the first thing the player waits for, so it is the one asset where load
  time is felt. Nobody has measured the colour count.
- **The bubble font is still 11 letters** — exactly `GLADES OF ARCADIA`. Every
  menu item is DOM text styled to match, which is why the font can stop there.
  Anything drawn *in the canvas* needs the rest of the alphabet;
  `js/art/title.js` derives all four tones from a flat mask, so adding a glyph
  is one mask and nothing else.

## 4f · The reload problem — half fixed

`docs/TITLE-AND-CONTROLS.md` has the full account. Two of three done:

- ✅ Dev preview now serves `no-store` (`.claude/launch.json` points at
  `tools/serve.mjs` instead of `python -m http.server`).
- ✅ Stylesheet versioned, build stamp printed on the title screen.
- ❌ **The module graph is not versioned, and on GitHub Pages that is a real
  ten-minute staleness window** (`Cache-Control: max-age=600`). Busting the entry
  does not help: a module's own relative imports resolve without the query. The
  fix is a build step that rewrites every relative specifier to carry
  `?v=<hash>` — either into a deployed tree, or by generating an import map.
  **Until then a hard reload after deploy is the workaround**, which is exactly
  the workaround a player should never need.

## 4g · Left unverified by hand — CLOSED (2026-08-01)

Recorded because "not checked" and "checked and fine" are different states. All
three have now been checked, and one of them was hiding a real bug.

- **The key bindings have been pressed in a live browser.** All eight category
  letters (`G L Q P T C H F`) select the right drawer, `1`–`9` pick within it,
  `R B J X ? Esc Tab` all do what the doc says, and every one of the eight pan
  keys (arrows and `WASD`) moves the camera in the right direction. Two traps
  for whoever tests this next: the camera is EASED, so a synthetic keypress
  needs ~500 ms before the reading means anything; and `J` opens the journal,
  which is modal and swallows everything after it — a sweep that presses `j`
  in the middle reports the rest of the keyboard as dead.
- **The suspected focus-swallow bug DOES NOT EXIST.** Focus returns to the
  canvas after a category-tab click and after an item click; `T` then `3`
  selects a plane tree. Struck off.
- **But the `?` on a creature had never worked once** — see §4h. That is what
  "never verified by hand" was protecting against, and it is why the note
  earned its place.
- **Nothing has still been PLAYED on a 60×60 map for any length of time.** The
  scan cost is measured; the *feel* — how long it takes to cross, whether the
  camera speed suits it, whether creatures now feel sparse — is not, and no
  amount of synthetic input will answer it. This one wants a person.

## 4h · Getting about, and the ? — what was NOT built (2026-08-01)

The minimap, the move pad, the `?` cursor and `?garden=all` all shipped. These
are the edges left showing.

**The minimap**

- **No overlay mode.** It shows ground + zoning, always. The obvious next one is
  for it to follow `Tab` and wash in the same affinity ramp the map does, so the
  field overlay and the minimap are one language. Cheap: the ramp function is
  already exported (`ui.overlayRamp`).
- **No toggle and no zoom.** It cannot be hidden, and on a map bigger than 60×60
  the panel would have to grow rather than scale — the projection is 1 px per
  tile by construction.
- **It ignores elevation.** A raised terrace and the ground beside it are the
  same pixel. Correct at this size, but if the map ever gets seriously terraced
  a one-step value shift per level would read.
- The rebuild is 3600 `fillRect`s on any ground/grass change. Fine at 60×60;
  it is the thing to watch if the map grows.

**The move tool**

- **Never used on an actual touch screen.** Click-to-centre and drag-to-pan are
  both verified with synthetic pointer events, which is not the same as a thumb.
  The `DRAG_SLOP` of 3 logical px is the number most likely to be wrong for a
  real hand; it was chosen because the rest of `input.js` already uses it.
- **No pinch, no two-finger pan, no momentum.** A drag stops dead when the
  finger lifts. Momentum is the single thing that would make a 60×60 map feel
  good to cross on a phone, and it is not there.
- **It has no chip in the grid**, only the topbar button and `X`. Same as `?`.

**The `?`**

- **It ANSWERS ABOUT A RUNG now** — ✅ the item this section called its
  highest-value follow-on. Asking a creature gives its name, then *"Wants to
  thrive: No open sward here yet."*, then its blurb. The FIRST unmet
  requirement only: the `?` is a glance, the journal is the ledger, and
  `requirements[].text` is used verbatim from creatures.js so the two can never
  word the same fact differently.
- **It had never identified a creature at all**, from the day it shipped.
  `creatureAt` read `a.x`/`a.y`/`a.id` from a scene list built with `tx`/`ty`
  and carrying no identity, so it matched nothing and every `?` aimed at a
  satyr was answered about the grass under him — in a perfectly good sentence
  about a meadow, which is why nobody caught it. `ui.creatureAtIn` is now pure
  and exported, and `test/seams.test.mjs` guards the reader half including a
  negative control. The WRITER half (main.js putting `creature` on the entry)
  is not reachable from node without a DOM; that test is a written-down
  contract, not a real guard, and says so.
- **`?` now keeps your selection.** It and `move` are the two tools that only
  ANSWER; neither can plant anything, so the "what does a click do must have
  one answer" rule that empties your hand for every other tool does not apply.
- No hover preview: you must click. Deliberate, but unverified against a real
  player.
- The tool has no chip in the grid, only the topbar button and the `?` key.

**`?garden=all`**

- **It cannot promise anybody settles**, only that every counted demand is met.
  Bands, patches and beats are outside what it does — see the doc.
- The four quadrant homes are hard-coded (`QUADRANTS` in main.js). They are
  comfortably outside each other's radii for the *current* requirement radii;
  nothing asserts that, and a rung that grew its radius could bring two species
  into conflict silently.
- Nothing backdates the planting, so the proving ground opens on a field of
  sprouts — unlike the opening glade, which is deliberately old. Worth copying.

## 4i · MOBILE MODE — the owner's plan, not yet started (2026-08-01)

**Owner's words: "my plan is to have a mobile mode on the title screen. Same
game just different. That's kind of low on the priority list, but it should be on
our todo."** Recorded here so it survives the session that heard it.

It is **low priority and deliberately so** — do not start it because it is
written down. But when it is started, this is the ground it has to stand on:

**The problem it exists to solve.** The game does not fit a phone in portrait.
`pickScale` floors to an integer and clamps to a minimum of 1, so on a 390 px
screen the canvas is 640 CSS px and overflows the viewport. Landscape is *close*
(400 logical against 390 available) and still short. This is not a control
problem — the move tool makes a big map navigable *once you can see it* — it is a
geometry problem, and no amount of control work touches it.

**The two ways out, and why neither is free:**

1. **A non-integer scale.** One line, and it breaks the founding law: SPEC §2's
   integer scaling is what keeps the pixel art crisp. A 0.61× canvas is a smeared
   canvas. Off the table unless the owner reverses that law explicitly.
2. **A smaller logical screen** — a second layout, e.g. 400 × 640 portrait, with
   the panel as a drawer rather than a fixed 100 px strip. This is what "same
   game just different" points at, and it is the real work.

**What a mobile mode would have to own, roughly in order of nastiness:**

- ~~`LAYOUT` in ui.js is three hard-coded rectangles and `LOGICAL_W/H` are
  module constants that `render.js`, `input.js` and `index.html` all read
  independently. **Making the logical screen a variable is the whole job.**~~
  **✅ DONE, 2026-08-01.** "Grep for `640` before estimating" found **four
  independent declarations** — `iso.VIEW_W/H`, `ui.LOGICAL_W/H`,
  `input.LOGICAL_W/H` and a private pair in `main.js` — all agreeing on
  640 × 400, which is the shape of the bug that put `MAP_W = 20` in two files.
  **js/iso.js owns it now** and the other three re-export it; `ui.LAYOUT` is
  DERIVED from `TOPBAR_H` / `PANEL_H` (every band full width, the three
  stacking to exactly the height, the map rectangle being what is left over);
  and `test/seams.test.mjs` asserts both that everybody agrees and that the
  derivation still produces the exact four rectangles the art was drawn
  against. **The remaining job is no longer "make it a variable" — it is
  "pick a second size".**
- The panel: 8 tabs × 130 placeables does not fit a phone width. A drawer that
  slides over the map, or one category at a time.
- The topbar's six buttons at 20 px each.
- The minimap is 119 × 60 and would be over a third of a 400-wide screen.
- Touch gestures the desktop build has no equivalent for: pinch, two-finger pan,
  long-press as right-click (right-click currently means *remove*).
- A choice on the title screen, which means the title screen needs a second
  button and the mode needs to persist — probably `?mode=mobile` in the URL, to
  keep the "wipe is a navigation" property that made the front door work.

**The honest sequencing note, now satisfied:** the title screen had the New Game
/ save screen work queued in §4e, and mobile mode adds a third thing to that
screen — so §4e went first and the menu was designed once. It shipped
2026-08-01 (Continue / Gardens / Recover), and a mode switch is one more button
on a panel that already knows how to swap what it offers.

## 4j · THINKING IN HEXAGONS — the art faces the viewer ✅ CLOSED (2026-08-01)

The owner, looking at the sprite lab: *"there are several objects, like the cave,
that are pointed straight at the viewer instead of in the direction of the grid
like they are occupying 3D space"* — and *"do you think you would benefit from
thinking in hexagons instead of squares since you are working in isometric
space?"*

**Yes, and the sprite lab is why it was never caught.** The lab draws a square
pixel grid and a rectangular bounds box. Both are the coordinate system of the
FILE. Neither is the coordinate system of the WORLD, so a sprite can sit
perfectly inside the lab's grid and point at nothing the map contains.

### The geometry, so it only has to be argued once

In a 2:1 isometric projection there are exactly **three visible planes**: the
ground (a 2:1 diamond), the SE-facing wall, and the SW-facing wall. So there are
exactly **three straight-line families**: rising 1-in-2, falling 1-in-2, and
vertical. A long horizontal run is not one of them — it is the signature of a
front elevation pasted into a world that has no front.

And the silhouette of a unit cube in this projection is a **hexagon**, which is
the owner's word and the right envelope to draw inside. The exception is real and
must not be forgotten: **rotational forms** (column, urn, boulder, trunk) look
the same from every side and *should* be bilaterally symmetric on screen.

### The instrument — SHIPPED

`tools/isogeom.mjs` states the geometry once and is imported by the headless
census (`tools/iso-audit.mjs`), by the sprite lab's overlay, and by the tests.
The lab and the audit disagreeing about what a legal edge is would be worse
than either being wrong, because the disagreement is invisible.

```
node tools/iso-audit.mjs [--all] [--strict] [--runs]
```

The sprite lab has the overlay the owner asked for: **ground diamond**, **cube
hexagon** at any height, **2:1 guide lattice**, and the measured **base contour
painted onto the sprite** — green where it steps, red where it runs level.
`?iso=diamond,hex,guide,base,only` in the URL, `__lab.shot('name')` to put one
sprite on disk through `snap.mjs`.

> **THE MEASURE WAS WRONG TWICE**, and both ways are easy to walk back into.
>
> *v1, `lift`* — how far the contour's ends rise above its deepest point. That
> answer depends on the sprite's overall SHAPE, and two correct shapes give
> opposite answers: a chest corner-on lifts toward both ends, a single cliff
> face toward one. The terrain tiles exposed it — `foot-rock-se-a` scored
> `diag 1.00` (every edge on a 2:1 slope) and `lift 0.02` (broken) at once.
>
> *v2* — level runs anywhere in the bottom silhouette. Convicts the underside
> of a tree canopy, which is not a base. Leaves hang in the air.
>
> *v3, shipped* — level runs WHERE THE OBJECT MEETS THE GROUND, against a bar
> that SCALES: a correct ground circle's lowest row is flat for `2*sqrt(2r)`
> columns, so a fixed threshold convicts every large contact for being round.
> A checker whose threshold does not scale with its subject is measuring its
> subject's size.
>
> And before all three, a first draft that scored four things at once and
> ranked `COLUMN` the fourth-worst sprite in the game. A column is a cylinder.

### The redraws — 48 down to 11

Three shared helpers did thirty-seven of them, which is why the census was
worth having before the art wave:

| what | where | was |
|---|---|---|
| contact skirt | `props.js skirt()` | an ellipse at 3.7:1, not 2:1 — and clipped by a grid one row too short, and a clipped ellipse is a straight line. It makes room for itself now |
| contact skirt | `decor.js skirt()` | a RECTANGULAR BAND, three rows of solid `m`, under 16 props |
| contact band | `props.js groundContact()` | 48 hand-typed `mmmm` rows, replaced with a real ground ellipse at the anchor |

`GROUND_ELLIPSE` in **js/iso.js** is the constant underneath all three: a circle
on the ground is an ellipse exactly twice as wide as it is tall.

**The three caves were individually redrawn** — the fault the owner actually
pointed at. `CLIFF_CAVE_MOUTH` is now a block (turf diamond on top, two wall
planes, foot on the ground diamond, mouth cut into the east wall with its sill
on that wall's own foot). `CAVE_MOUTH` and `GROTTO_MOUTH` use `rockKnoll()`: a
dome springing from a 2:1 ground ellipse, returning the sill function so
whatever is cut into it sits on that line and nothing else.

### What is left — NOTHING. 48 down to 0.

`node tools/iso-audit.mjs --strict` exits 0 and is **in `npm run check`**;
`test/iso-ground.test.mjs` is a clean gate with an empty list. Every sprite in
the game meets the ground in the ground plane.

**Four shared helpers and four sprites did all forty-eight**, which is the whole
argument for building the census before starting the art:

| what | where | was |
|---|---|---|
| contact skirt | `props.js skirt()` | an ellipse at 3.7:1, and clipped by a grid one row too short — a clipped ellipse is a straight line |
| contact skirt | `decor.js skirt()` | a RECTANGULAR BAND, three rows of solid `m`, under 16 props |
| contact band | `props.js groundContact()` | 48 hand-typed `mmmm` rows, converted to a real ground ellipse at the anchor |
| **every pool in the game** | `props.js pool()` | ratios from **0.24 to 0.45** where the ground plane allows exactly 0.5. Not one of the eight was right |
| nine decor props | `spriteAt({ contact: r })` | no contact shadow AT ALL — which is why their square-cut feet were the lowest thing in every column |
| the three caves | rebuilt | a block with a turf diamond and a mouth in one wall; two knolls springing from a ground ellipse |
| the ford | clipped | water is GROUND, so it is bounded by the tile diamond, not by its bitmap |

> **And the ALLOWANCE was wrong, which is the most useful thing in this
> section.** `curveAllowance` derived the flat span of a correct ground circle
> as `2*sqrt(2r)`, solving for the row where the curve holds within half a pixel
> of its lowest point. The binding case is different: when the ellipse's true
> bottom row rounds away — which it does whenever the centre sits on a half
> pixel, i.e. usually — the widest surviving row is the chord at `dy = ry-1`,
> which is `4*sqrt(r-1)`. Drawing ideal ellipses and measuring them settles it:
> at r=26 the real span is 20 and the old formula said 14.4.
>
> Three correctly-shadowed sprites kept failing by two or three pixels and
> looked exactly like art faults. **They were arithmetic faults, mine.**
> `test/iso-geometry.test.mjs` now DRAWS the ellipse and measures it rather
> than restating the algebra, because an algebra error cannot survive that.

**Fault (B), the FORM facing the viewer, is closed for the caves and open for
the arch family** — `RUINED_ARCHWAY`, `HEDGE_ARCH`, `PERGOLA_ARCH`, `EXEDRA`,
`WALL_FOUNTAIN` are still mirror-symmetric things that ought to have a front.
There is still no detector for it and the obvious one (symmetry + horizontal
major axis) is the trap the first draft fell into — it convicts every urn.
Inspection, and an art wave whenever the owner wants one.

**Two blind spots found on the way**, both from a module list written before the
module: the sprite lab's `CANDIDATES` never included `decor.js` or `extras.js`
(**47 sprites had never once appeared in it**), and `tools/propshot.mjs` printed
`MISSING` for any decor sprite. Both read `AUDITED_MODULES` now.

## 4k · FACING — the middle wheel turns things ✅ SHIPPED (2026-08-01)

Owner: *"there are a few tiles that you should be able to alter the direction on.
Currently the middle scroll wheel scrolls up and down the map, I think it would
be better suited to pick between what direction an object faces in space."*

Right on both halves — the wheel was barely earning its keep as a pan (there are
now four other ways to pan, and one of them is a whole tool) and rotation is the
thing an isometric builder always binds.

| gesture | what it does |
|---|---|
| wheel, holding something with a direction | **turns it**, and the ghost shows the turn |
| wheel, holding anything else | pans up and down, as it always did |
| `Shift`+wheel | pans left and right, never turns |

**Seventeen things turn**, listed as `TURNS` in js/catalog.js with the argument
beside them. The test for membership is not "could it be flipped" but *would
flipping it visibly change which way the thing is turned* — which rules out most
of the catalogue by its own geometry. A column is a cylinder, an urn is a solid
of revolution, a round basin is a circle. The same argument the iso audit had to
learn about rotational forms, arriving from the other side.

**Four facings cost two drawings.** `facing` is stored 0..3 with
`facingMirrored` / `facingDrawing` in js/iso.js; a horizontal flip is an exact
NE↔NW turn, so one drawing covers two facings. The other two face away from the
camera and want a real second drawing, so every entry declares `facings: 2`
today and nothing in the save changes when a back view is drawn.

**The save is the part that mattered.** `SAVE_VERSION` 3, and `facing` is
written **only when non-zero** — a garden in which nothing has been turned
serialises byte for byte as it did under v2, and every v2 garden loads with
everything as it was drawn. `test/facing.test.mjs` opens with three tests about
that one `if`, plus a clamp that is total from both directions (a caller that
forgot to check, and a save claiming a facing the catalogue no longer offers).

### What is NOT done

- **Only SQUARE footprints turn**, and the catalogue self-check throws at import
  rather than let it half-work. Mirroring swaps the tile axes, so a 2×1 mirrors
  into a 1×2 — which means transposing the footprint through `canPlace`, the
  collision test and the depth key. That is the next step, and it is what
  `cave-mouth` (2×1), `chirons-cave` (2×1), `colonnade` (3×1), `ruined-arch`,
  `fern-grotto` and `arbour-seat` are all waiting on.
- **No back views.** Facings 2 and 3 are reachable in the data model and
  unreachable in play. A cave from behind — a hillside with no hole in it — is
  the obvious first one, and it would double the value of the wheel for the
  whole cave family.
- **Placed objects cannot be turned**, only objects being placed. Turning one
  already in the ground needs its own undo record kind; the wheel over a placed
  object currently pans.
- **`seated-maiden` and `palisade-fence` declare `facings: 2` but their sprites
  are not in props.js or decor.js** — they draw understudies today, so the turn
  is real but what turns is the stand-in. Harmless, worth knowing.

## 4l · THE SHADOW ARC — steps 1–4 SHIPPED, ONE DECISION LEFT (2026-08-01)

Full write-up: `HANDOFF-THE-FIRST-GLADE-2026-07-31.md` — the `PROPOSAL — ONE
SHADOW SYSTEM` section, then `## The shadow arc` and `## Steps 3 and 4` beneath
it. The proposal's `### Sequence` is annotated with what landed.

**Shipped.** One shadow system. `render.js` draws every object's contact with the
ground in its own pass, sized from `groundCentre(art)` and coloured from the tile
beneath (`2857be6`, `024c7a7`). The art no longer draws its own: 43 `skirt()`
call sites, 53 hand-typed `'m'` bands and ~30 hand-rolled `put/hline` skirts
deleted (`92400ce`, `e3a5f8e`). Twenty-eight square-cut feet redrawn in the
ground plane (`618ec8b`, `e3a5f8e`).

| | before | after |
|---|---|---|
| grass-green px on flagstone, whole catalogue | 16 710 | **3 294** |
| `iso-audit` flat feet, of 237 sprites | 0 → 29 | **1** |
| the picture on grass | — | 0.25% of px changed |
| `anchor-audit` | 10 / 0 / 12 | **10 / 0 / 12** |

**It was never about the skirts' SHAPE.** `'m'` is `GRASS[0]`, so every baked
skirt was a green mat wherever the object stood on stone. Reshaping all
forty-three would have left every one of them. The rule that replaced them:
*which plane does this shade lie on?* — world ground is the renderer's, a surface
of the object itself is the art's. Exactly one call site survives on that test
(the altar on the heroon's podium).

### ▸ THE ONE DECISION LEFT — the stamp scallops under runs

Put four hedges, walls or balustrades in a row and each casts its own round
pool: a string of dark bubbles, not one band of shade. **A step-2 regression** —
the stamp went from rhombus to ellipse, and *rhombi tile, ellipses do not*. For
a game whose linear pieces are built to butt (`LINE_W = 33` is "32 px of run plus
one overlap column"), tiling is the property that decides the shape.

Rendered both: at `p = 1` the runs join cleanly and compact objects get thin
pointed smudges; at `p = 2` (shipped) compact objects read well and runs
scallop. **Neither shape serves both.** The stamp has to follow the object's
ORIENTATION.

**Step 4 unblocked the measurement, which is why it went first.** Compact
sprites now measure a base tilt of exactly 0.00 (13 of 13 — before step 4 it was
noise, because their feet had been flattened). Linear ones need the DOMINANT
SLOPE rather than the endpoints: `hedge-low` descends 1-in-2 for 34 of its 50
columns and then its end cap rises, so end-to-end reads 0.04 and files it as
compact. Threshold on *longest constant 1-in-2 descent / span*: a diamond is
symmetric (~0.5), a run is not (~0.7).

`KNOWN_FLAT_FEET` has one name left — **`balustrade`** — and it is blocked on
this same decision, because fixing its foot and fixing the stamp are one
question with two halves.

### ▸ NOT DONE, and named: the sleeping satyr is drawn in ELEVATION

Its block's base is now an honest fracture, so it passes the audit and the
figure did not move a pixel. But measure the silhouette: the block's top edge is
dead level and so is the figure's long axis. **It is the one sprite in the game
whose long axis is the screen horizontal, which is not a world direction** — the
owner's original complaint about the cave, in the sprite that gets the most care.
Compare with `hedge-low` at 6×.

Fixing it means re-seating the figure along +tx: a redraw of the game's signature
image. A commission, not a sweep.

### ▸ OPEN, owner's call: transparency-based shadows

Unchanged and now unblocked (step 3 was the prerequisite). **Feasible** as
palette-space darkening — read the pixel below, walk ITS ramp down two steps —
never alpha, which SPEC §3 forbids in capitals. Measured: **100% of rendered
pixels are exact palette colours** so the reverse lookup always hits, and the
remap costs **0.50 ms** of an **8.20 / 16.7 ms** frame. It also fixes two things
nobody asked about: the opaque stamp currently ERASES grass speckle and flagstone
joints, and a shadow spanning a grass/paving boundary is one wrong colour across
both. Needs a rule for the six ACCENT colours, which have no ramp to walk down —
mix toward `ACCENT[6]` and snap, which is finally what that "universal shadow
mixer" is for.

**Object-on-object shading stays OFF the table** — owner: "the shadows are fairly
high noon shadows".

### ▸ The 10 undersized placeables — a ratchet, not a to-do

`KNOWN_UNDERSIZED` in `test/sprite-anchors.test.mjs`. Ten catalogue entries
reserve more garden than their art covers. Each is either a redraw or a
catalogue correction — a decision about how much ground an object takes, so it is
the owner's. The list may only shrink; the test enforces that both ways.

### ▸ Two sweeps with a good hit rate

**Grep for a field and check who reads it.** Every fault in steps 1–2 was a
consumer that was never written — `shadow:`, `CREATURE_SHADOWS`, `cell.ground`,
`ACCENT[6]`, and a comment in `js/art/extras.js:17` describing a `variant` that
does not exist. Five in one subsystem.

**Render the thing next to a copy of itself.** Every probe here isolates its
subject so nothing contaminates the reading, and isolation is a configuration
too. The scalloping shipped and ran live for a day on every hedge and wall in the
game; one frame with four hedges in it found it.

---

## 4m · THE PILLAR TRICK — a FEATURE, do not fix (2026-08-01)

Owner: *"you can remove the ground under an object allowing it to float in
space. this is a classic bug of that era that players would use creatively to
build things they otherwise couldn't, so i don't want it corrected. that bug was
most popular in Ultima Online."*

**Not a backlog item. It is here so nobody puts it on the backlog.** This
document and the handoff both spend a lot of words treating floating as a fault,
and they mean a *different* float: art drawn too high inside its own bitmap
(`tools/anchor-audit.mjs`). This one is world-space and the player asked for it.

`_cohere()` drags an object's whole footprint along with any terrain edit, so it
can never straddle two heights — **and it stops there, which is the trick**. The
ground an object's art merely *overhangs* is ordinary ground.

Guarded by three `FEATURE:` assertions in `test/world-terrain.test.mjs`, a note
on `_cohere` in `js/world.js`, and a section in `docs/ELEVATION.md`. Kept
undoable and deliberately untaught.

---

---

## 4o · THE CLOCK LEVER, THE BACK RIM, THE BRUSH AND THE SCRAMBLE (2026-08-03)

Full write-up: **`HANDOFF-THE-IMAGE-PACK-2026-08-02.md` §8.** Both were owner
asks on the same day, and they are the same ask twice: a garden is something you
WAIT for and something you LOOK at.

### ▸ Speed of time — `1x / 2x / 4x`, beside the clock

**THE LAW: the step is never scaled, only the number of steps.** Speed
multiplies the accumulator, so 4x runs four times as many identical 1/20s steps
and is arithmetically the same as leaving the tab open four times as long.
Scaling `SIM_DT` instead would work on screen and quietly coarsen the
simulation — growth, ageing and creature legs all integrate per step.

No other file knows the control exists. `MAX_CATCHUP` scales with the speed, or
the button reads 4x while the garden runs at 2.5x. The button wraps; the keys
(`.` and `,`) clamp. **There is deliberately no 0x** — `game.pause` already
owns that, and two owners for one state is how the renderer once lost its
camera.

### ▸ The back rim — one pixel of soil, and a hill gets a back

A tile above the neighbour BEHIND it exposes a face pointing away from the
camera, so nothing is drawn and a terrace reads as flat meadow from behind.
`iso.js` gained `BACK_SIDES` / `backNeighbour`; the colour is
`contactShadow(GROUND_DEFAULT)`, which is the same byte as the cap on every
visible cliff face, because the far edge of a plateau IS the top of a cliff.

**The lesson is in the mistake.** The first version stepped by ROW, passed all
four tests, and drew a DOTTED line — a 2:1 edge moves two across per one down.
Stepping by COLUMN gives the solid stair. Only looking at the render caught it,
so the look is now a test (`THE RIM IS CONTINUOUS`) that was **checked against
the bug**: fed the old algorithm it reports 32 columns of 62 and 30 gaps.

Third blind instrument in two days. **An assertion about a picture that was
never compared to a wrong picture is one you are trusting on its own word.**

### ▸ The brush — 1 / 2 / 3 / 5, shipped the same evening

**THE BRUSH IS THE WIDTH OF THE STROKE.** The terrain tools already dragged a
rectangle, so a brush of n thickens it by n-1 — a press with no drag is then an
n x n square for free. It grows toward +tx/+ty, the corner every multi-tile
placeable already anchors at, so there is no second anchoring rule. `[` and `]`.

`doTerrain` is the one choke point, so the drag, the `+`/`-` nudge and the
keyboard tool all get it; `terrainRegion` thickens the preview by the same rule
and never feeds `doTerrain`, so they cannot double up. Partial strokes are
allowed and silent — a brush that only works on empty squares cannot be used
twice in the same place. Multi-tile placeables ignore it, per the owner's own
scoping. Still one undo step.

### ▸ The rock scramble turns — it was at facings 1, not turning at all

Owner: *"rock scramble does not rotate properly like the other stairs."* It was
never added to `TURNS` when the wheel was built and nothing asked. Fixed with
the earth ramp's own mechanism (`rampSurface`'s `near`, a `back` drawing,
`TURNS_FOUR`), plus the guard that was missing: **`EVERY CONNECTOR TURNS`**
refuses any `connector`-tagged entry with fewer than two facings.

**`near` must be GATED.** `lift` reaches 16 on the away drawing too, so an
ungated wall branch repaints a drawing that was already right. A `back` must
not change the front — verified by rendering both against `git show HEAD:` in a
throwaway worktree: byte-identical.

**Two instruments were certifying one sprite** and both are fixed: the
elevation probe's `ramps` scene had `EARTH_RAMP` hard-coded (now
`connectorScene(artName)`), and facing.test.mjs's two connector tests
destructured `EARTH_RAMP` by name, so they never saw the scramble's new
drawing. Both derive from the catalogue now.

### ▸ STILL OPEN: `stone-stair` and `stepped-terrace-wall` turn only TWO ways

Tried in the same pass and **reverted deliberately.** The mechanism takes
`near` as readily as the others, but a flight of dressed steps coming at the
camera came out a grey lid with a pale wedge: almost no tread reads, because
the near flight is nearly all end wall and dressed masonry has none of the rock
scramble's texture to carry that. **It wants an authored drawing, not a flag.**
Nothing regressed — both turn two ways as they always did.

### ▸ THE PERCEPTION LAYER ✅ SHIPPED (2026-08-03)

Owner's steer after two proposals landed and no game did: *"per-facing idle +
occlusion before deeper path logic. Those are perception-layer fixes."*

**Per-facing idle.** A creature that stops now keeps the heading it walked.
`this.facing` was always written and always handed to `creatureFrameAt`; idle
was the only cycle throwing it away. NO NEW ART — the back flag and
`mirrorRelit` were already there, so idle and walk are built by one loop.
Census 134 → 194; `docs/shots/idle-facings.png`.
**It is a PREREQUISITE, not polish:** without it the goal-based loop is
ANTI-rendered — the creature turns TO the thing and then visibly AWAY from it.

**A mover's height.** `_liftDrawList` floored a coordinate that is drawn at
+0.5, so a mover took its level from the tile BEHIND it for half of every tile.

**Two more one-subject instruments fixed:** `allCreatureSprites` and
`tools/poseshot.mjs` both named `walk` as the pose that turns, so the lint pass
threw and the shot tool could not photograph the change. Fourth and fifth of the
arc.

### ▸ THE OCCLUSION DEFECT — measured, NOT fixed, and that is deliberate

A creature climbing a ramp is drawn INSIDE it: 0% of its pixels destroyed at
tx 7.4, **21% at 6.5, 41% at 6.2, 72% at 5.8**. Mechanism exact — a mover at
(5.8, 6) keys 83.6 against the ramp tile's 84, because a mover's FRACTIONAL
tx+ty falls below the tile's INTEGER as it climbs.

**Do not reach for the obvious fix.** Pinning a riding mover's key to its tile
moves the key 3.5 — half a diagonal band — at the exact boundary the fractional
key exists to smooth, and iso.js's header names that pop as the bug it was
written to kill. It needs enumeration over facing x tread position x neighbour
level across BOTH adjacent diagonal rows. Spec in PROPOSAL-STAIR-CLIMBING §2.

### ▸ STAIR CLIMBING — proposed, not built (2026-08-03)

Full document: **`PROPOSAL-STAIR-CLIMBING-2026-08-03.md`**. Owner asked for it;
nothing is implemented.

Headline: a creature does not climb a ramp, it pops a whole level in one sim
step (16 px, 9x a walking frame) — **and for ~40% of the crossing it is drawn
INSIDE the ramp** (72% of its pixels destroyed at the worst position). The
occlusion is the real defect; the pop is its punctuation.

**IT IS NOT A BUG, IT IS A WRITTEN DECISION.** js/main.js:1430 states "there are
no half heights ... so a creature walking a ramp steps up a level at the top",
and docs/ELEVATION.md:203 lists half-level terrain under what this does NOT
include. Both must be amended by whatever falsifies them.

**THE BLOCKER: pathing lands first.** 391 of 607 measured connector crossings
never change level — creatures wander across ramps sideways and idle on them
(4,973 idle sim steps in one run). Today that is flat and correct; give the tile
a sub-tile height and every one becomes a NEW pop at a cross edge. The naive fix
is net-negative on the majority case.

**THE KEYSTONE:** decor.js's `s` and render.js's `fx` are the same number —
identical to 0.0 across all 1024 tile pixels. The height a creature should stand
at is the expression its sprite was drawn with. The owner's "anchor points" are
already in the drawing; anchors' real job is the LANE across the tile.

**Do not build:** the contact-shadow argument (0 px on a connector tile,
measured), a smoothing/slip term, or a gate on the depth fix.

### ▸ GOAL-BASED WANDERING — proposed, not built (2026-08-03)

Full document: **`PROPOSAL-GOAL-BASED-WANDERING-2026-08-03.md`**. Owner's ask;
nothing implemented.

Three of the four pieces already exist: the **ladder** names 24 tags with sign
per species (a desirability function, authored and already guarded by
checkTagContract — 91 of 137 entries carry one), **fields.js** is the context
term (a bench scores 0 alone, 4.86 in a thicket for the SATYR ONLY, 4.06 among
lily pools for the unicorn and naiad — which species a neutral object belongs to
is decided by where the player put it), and the **head-shake** is ~20 lines
because every species already isolates its head as a layer.

**ORDER OF OPERATIONS IS THE INVARIANT:** desirability = tagBase + context
(additive, MAY promote a neutral), chosen = desirability x (1 + staleness)
(multiplicative, CANNOT). Selection is by |desirability| — salience decides
where it walks, valence decides whether it admires or refuses — because the
head-shake requires opposites to stay pathable.

**THE INVARIANT WAS TESTED AND BROKE.** Staleness off: 100% of Pan's attention
on his ladder. Staleness on: **25% on a neoclassical courtyard** he has no
requirement for. The bonus was not the culprit — the BASE was, having gated on
affinity seams instead of the ladder. **LAW: the gate is the ladder, not the
field.**

**SHIP FIRST, ALONE: per-facing idle art.** ~12 lines, no new art, no sim
change. Idle has no facings today, so without it the creature turns TO the urn
and then visibly turns AWAY from it — anti-rendered, worse than today.

**Do not build dwell == score:** measured 0.15 s of spread against a 5.37 s
travel confound, narrower than the random hold already in the code.

**Do not use a strict argmax:** converges to an exact period-8, 72-second limit
cycle, seen twice in two minutes.

Retires the DESTINATION half of the stair proposal's pathing prerequisite (a
connector is not a goal). Not the transit half — and `connector` is not the
whole set: level-bridge scores 0.500 for the centaur via `timber`.

### ▸ catalog.js authors three RETIRED axes — 256 dead values

`wildness`, `order`, `moisture` are non-zero on 91 / 113 / 52 entries and read
by nothing (fields.js:111 RETIRED_AXES; `add()` reads only CONDITIONS), while
the import validator still DEMANDS all five. Every new placeable is asked for
three numbers nobody will ever read. Either the axes come back or the authoring
goes. Also `fields.js:230-235` says a dual affinity claims to ~2.6 tiles; it is
**2.35**.

### ▸ Follow-ons, none blocking

- The rim is terrain-only by design. An object standing on a back edge covers
  it, which is correct — it is a contour of the GROUND.
- The **ground painter's drag** DOES take the brush — it was written down as a
  gap first, then checked, and the claim was false. `doPlace` is called per tile
  as the pointer crosses, so a wide brush leaves a wide trail. There is now a
  test that drags rather than clicks, because a test that only clicked would
  have agreed with the wrong sentence.

## 4n · THE IMAGE PACK AND THE COMPASS (2026-08-02)

Owner: *"the image pack needs to be updated for isometric perspective ... there
are certain objects like the bench that don't follow the diagonal of the grid
pattern, they instead point at the viewer. while redoing the image packs we
should also think about how we can have certain objects have different sprites
depending on how they are rotated, so things like hedges and fences can go
around corners and ramps can go up a hill in any direction."*

Full write-up: **`HANDOFF-THE-IMAGE-PACK-2026-08-02.md`** — its own keystone as
of the end of the day, split out when the first handoff passed 1 900 lines.

### ✅ SHIPPED

| | commit |
|---|---|
| `stone-bench` and `doric-column` draw their own art at last | `503ff57` |
| `palisade-fence` makes a fence; `seated-maiden`'s baked skirt goes | `84bf404` |
| ramps climb all four ways — the first use of facing bit 1 | `3c6d53c` |

**The bench was never an art fault.** `decor.STONE_BENCH` existed the whole
time, registered under that exact id, correctly projected — and nothing pointed
at it. Nothing failed either: the sprite resolves so `playtest` is content,
there is no `wanted` so it is not art debt, and `iso-audit` measured the good
sprite and printed a green line about a picture the game does not draw.
`iso-audit --catalog` now measures only what a player can reach — **87 of 237
sprites** — which is the census that catches this.

`palisade-fence` was drawn at a slope of **0.4** under a header insisting on
0.5, and 23 px of run on a 32 px tile, so a row of them was a dotted line — for
a piece `js/fields.js` treats as an OCCLUDER. `LINE_W` and `LINE_DROP` moved to
`js/art/format.js` so the two copies cannot drift again.

`earth-ramp` gains `back`, a second drawing. The old header claimed a flip
covered all four orientations; it covers the two that climb *away*. The two that
come downhill at the camera are a 180-degree rotation, which needs a vertical
flip, which this game may never do because the light is always upper-left.

### ▸ THE CORNERS — BUILT for the fence and both hedges

`node tools/joinshot.mjs --ids hedge-low --all` — corner, cross and both runs.
An L of seven fences now draws cap, straight, straight, **corner**, straight,
straight, cap, with the wheel never touched.

Neighbour-driven, because the facing wheel cannot express it: corners need
three drawings plus the straight and `FACINGS` is 4. `js/iso.js` §JOINING has
the argument; `js/main.js` `buildObjects` is already rebuilt only on a world
change and the raster cache is keyed by the art object, so it costs nothing.

**Mask 0 keeps the wheel** — an isolated piece obeys the facing the player
chose, a connected one obeys the run — **and the wheel then lets go**, because
the sixteen states are absolute.

**The straight is byte-identical** (54x40, anchor 26,28, 855 opaque px), so
only corners are new art. **`drystone-wall` joined too**, for four lines of
call site — `linearJoins()` now lives in `js/art/format.js`, where props.js and
decor.js share it.

**`balustrade` is the one left out, and not by oversight.** Its anchor is at
x = 10 on a 46-wide sprite — the slab's far corner, not the run's midpoint —
so the arm cut would give a stub and a spar. Moving it to 22 fixes that AND the
staggering in its runs AND, almost certainly, its place in `KNOWN_FLAT_FEET`.
**One decision with three faces**, and it belongs with §4l's shadow stamp,
which is now easier: a piece knows its own mask, so the stamp can come from
`joinAxis(mask)` rather than be measured off a base contour.

### ▸ AFTER THE FIRST LOOK — both fixed (2026-08-02, same evening)

**The 2x2 preview highlighted one tile.** `js/input.js` says `w`/`h`,
`js/render.js` reads `footprint`, `js/ui.js` converted — and `js/main.js`'s draw
loop overwrote it every frame with the raw object. The tile that showed was
`(tx, ty)`, the north corner: the one detail that identifies the bug from the
sentence. `ghostShape()` is now a named export with a pixel-measured test.
**Fourth producer/consumer key-name disagreement this week.**

**The pergola was a front elevation** — the worst possible object to draw flat,
since a pergola IS a grid of beams. Redrawn on the tile's own corners with
plates on the diamond edges and rafters across. The old one is kept as
`PERGOLA_ELEVATION`, unreachable, as the clearest before/after in the tree.

**...and `--elev` scored the old pergola 0.00.** The measure saw FLAT-SHADED
elevations and was blind to TEXTURED ones — the beam grid broke its own edge
into six-pixel pieces by its grain. Fixed with the right statement (*an edge is
the same transition all along it*; a dither is one surface shuffled) and
`SEAM_KINDS = 3`, chosen by sweeping the whole catalogue at 3/4/5/6/8/12 → 24,
29, 35, 36, 39, 44 flags. Both failure modes are now controls.
**The audit is a ranking, not a verdict, and it has now been blind twice.**

### ▸ GATES — shipped for three walls (2026-08-02, same evening)

Owner: *"i was trying to use the pergola as a gate. what i think we really need
are separate gates / archways for the various walls."*

`joins` is a GROUP NAME defaulting to the id, and a gate overrides it:
`hedge-arch` → `tall-hedge`, `palisade-gate` → `palisade-fence`,
`drystone-gateway` → `dry-stone-wall`. The walls either side reach for it, so a
gateway is a hole in one continuous wall. `axialJoins` (whole drawing, two
states) rather than `linearJoins` (arms), because half an arch is rubble.

**Without one yet:** `clipped-hedge` (you step over it) and `balustrade` (not
joined — see above). **`pergola-arch` and `ruined-archway` are two more dead
arch sprites in decor.js**, both front elevations: redraw one as the
neoclassical garden arch and hang it in a hedge run, or delete them.

The **`gate` tag** is new, and the pair `enclosure`/`gate` is the
barrier-and-its-doorway symmetry this design has now learned three times —
hedge/arch, cliff/ramp, wall/gate.

### ▸ THE ELEVATION LIST — `iso-audit --elev --catalog`

Reported, never voted; the table ranks and a human looks. After the bench
dropped off it, the top is `bridge`, `naiskos`, `grave-stele`, `votive-shelf`,
`altar` — all fronted objects drawn as front elevations. `bridge` is the sorest:
its own comment says *"drawn along the +tx axis like the wall"* and it is a
32 px arch seen face-on standing on a 2x1 plot. **The three column capitals the
table flags are FINE** — a cylinder is allowed to be symmetric, the same lesson
that demoted `mirror`. Do not promote this measure to a gate.

### ▸ ALSO OPEN

- **Non-square footprints cannot turn.** `js/iso.js` names the work; it is why
  `cave-mouth` (2x1), `colonnade` (3x1) and `level-bridge` (2x1) are absent from
  a `TURNS` list they belong at the top of.
- **Ramps do not auto-orient.** A ramp placed against a cliff could default its
  facing from `world.levelAt` on the four neighbours, with the wheel still
  overriding.

### ▸ A SWEEP WITH A GOOD HIT RATE

**Read the comment as a claim and check it.** All three faults this pass were a
sentence in the source that was not true of the code beneath it: the bench's
blurb described art it was not drawing, the fence's header insisted on a slope
it did not use, the connectors' header claimed a flip could do what a flip
cannot. This codebase comments unusually well, which is exactly what makes a
stale one dangerous.

## 5 · Housekeeping

- `docs/creature-lab.html` is a dev tool committed alongside the game; decide
  whether it belongs in `tools/` instead.
- The **first-run garden** should be checked with fresh eyes — the cosy research
  is emphatic that a player must arrive to something already pretty, and that the
  first creature should be nearly free.
- No `LICENSE` file yet. If one is added it **must explicitly carve out
  `audio/`**, or an MIT header would imply the track is MIT, which it is not.

---

## Done, for the record

Shipped 2026-07-30 → 07-31: the isometric engine · elevation with terraces,
connectors, caves and waterfalls · grass-type zoning with occluders · the
130-item catalogue · five creatures and the four-rung ladder · the tomb set with
curated epitaphs · the composed score on the satyr trigger · 274 tests · the
playtest, anchor audit and snap instruments · live on Pages.

Then, same day: the **flourish layer** — poses beyond idle/walk/beat, one-shot
gestures played off the agent's own clock, the piping satyr on the music trigger
and the drinking satyr on the vessel scheduler · `docs/FLOURISHES.md` ·
`tools/poseshot.mjs` · 283 tests, 46 playtest checks.

Then, 07-31 later: the **front door** — title screen with a derived bubble
wordmark, New Game as a navigation, a blank 60×60 map, WASD + arrows + letters +
numbers, and the O(n²) settling scan (1205 ms → 58 ms) that made the big map
possible · `docs/TITLE-AND-CONTROLS.md` · 290 tests.

Then, 2026-08-01: **knowing where you are, and asking** — the minimap (diamond,
one pixel per tile, blinking creatures, square camera border, click to jump),
the move tool (`X` — click to centre, drag to pan, never places), the `?` help
cursor, and `?garden=all`, the ladder-derived proving ground with all four
species welcome. Plus the third and final recital bug: the
score now starts on the same statement that raises the pipes, instead of on his
arrival · 302 tests.

Then, 2026-08-01 later: **the save screen**, **facing on the middle wheel**, the
sprites redrawn to face the world rather than the viewer, **mobile mode**, and
the **shadow arc** — a contact shadow measured from the art instead of guessed
from the tile, and coloured by the ground it lands on. Four instruments came out
of it and are the durable half: `tools/isogeom.mjs`, `tools/shadow-probe.mjs`,
and two more arms each on `iso-audit` and `anchor-audit` · 386 tests.

Then, 2026-08-01 last: **steps 3 and 4 of the shadow arc** — the art stopped
drawing its own contact with the ground. Forty-three `skirt()` call sites,
fifty-three hand-typed `'m'` bands and about thirty hand-rolled ones deleted;
twenty-eight square-cut feet redrawn in the ground plane, a DIAMOND for a square
base and an ELLIPSE for a turned one. It was never about their shape: `'m'` is
`GRASS[0]`, so every baked skirt was a green mat wherever the object stood on
stone — **16 710 grass-green pixels on flagstone down to 3 294**, while the
picture on grass changed by 0.25%. `iso-audit` 0 → 29 → **1**, and the anchor
audit read 10 / 0 / 12 before, during and after · 386 tests.

Then, 2026-08-02: **the image pack and the compass** — `stone-bench` and
`doric-column` given the correctly projected art that had been sitting
unreachable in decor.js the whole time; `palisade-fence` rebuilt from 23 px of
0.4-slope stub into a 33 px piece on the projection's own 1-in-2, so a row of
them is a barrier rather than a dotted line; and ramps opened from two
directions to four, the first placeable ever to use bit 1 of the facing. Three
instruments: `tools/joinshot.mjs` (the only probe that draws pieces TOUCHING),
`iso-audit --elev` and `--catalog`, and a `ramps` scene in the elevation probe.
Three dead consumers found and wired or retired along the way — `def.shadow`,
the headless canvas's missing `translate`, and the second copy of `LINE_W` ·
390 tests, 47 playtest checks.
