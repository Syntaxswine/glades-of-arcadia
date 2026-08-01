# BACKLOG — Glades of Arcadia

Reconciled 2026-07-31 (twice — second pass after the flourish layer) against
`HANDOFF-THE-FIRST-GLADE-2026-07-31.md`.

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

## 4g · Left unverified by hand

Recorded because "not checked" and "checked and fine" are different states.

- **The new key bindings were never pressed in a live browser.** Both halves are
  verified directly (`ui.selectGroupByKey` over all eight letters plus two that
  must be ignored; `ui.selectItemIndex` at 1/2/3/9 and out of range) and the
  event code was reviewed — but the preview pane runs hidden, so rAF is
  suspended and synthetic key events get eaten by the tab strip's own arrow
  handler. Somebody should press the keys.
- **SUSPECTED, from that same session: selecting a category by letter may move
  focus into the toolbar and swallow the next keypress.** `selectGroup` focuses
  the tab, and `input.js` ignores keys while focus is in the chrome. It looked
  exactly like that while testing, but the hidden pane makes it unsafe to call
  it confirmed. If pressing `T` then `3` does nothing, this is why, and the fix
  is to return focus to the canvas after a keyboard-driven category change.
- **Nothing has been played on a 60×60 map for any length of time.** The scan
  cost is measured; the *feel* of a map nine times the size — how long it takes
  to cross, whether the camera speed still suits it, whether creatures now feel
  sparse — is not.

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

- **It only answers about the tile.** It says nothing about a *rung* — "this is
  what the satyr is still waiting for" is the answer a player most wants and it
  lives in the journal instead. Wiring the `?` to a creature's unmet requirement
  is the highest-value follow-on in this section.
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

- `LAYOUT` in ui.js is three hard-coded rectangles and `LOGICAL_W/H` are module
  constants that `render.js`, `input.js` and `index.html` all read independently.
  **Making the logical screen a variable is the whole job**; everything else is
  layout taste. Grep for `640` before estimating.
- The panel: 8 tabs × 130 placeables does not fit a phone width. A drawer that
  slides over the map, or one category at a time.
- The topbar's six buttons at 20 px each.
- The minimap is 119 × 60 and would be over a third of a 400-wide screen.
- Touch gestures the desktop build has no equivalent for: pinch, two-finger pan,
  long-press as right-click (right-click currently means *remove*).
- A choice on the title screen, which means the title screen needs a second
  button and the mode needs to persist — probably `?mode=mobile` in the URL, to
  keep the "wipe is a navigation" property that made the front door work.

**The honest sequencing note:** the title screen already has the New Game / save
screen work queued in §4e. Mobile mode adds a third thing to that screen. Doing
§4e first and mobile mode second means designing the menu once.

## 4j · THINKING IN HEXAGONS — the art faces the viewer (2026-08-01)

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

### What is left — eleven sprites, each its own job

`test/iso-ground.test.mjs` is the ratchet: it fails if a passing sprite starts
failing, AND if one of these starts passing without being struck off the list.

| sprite | px | what it needs |
|---|---|---|
| `willow-water` | 42 | the pool rim, cut straight across the front |
| `wall-fountain` | 33 | a front elevation — the cave family. Wants a wall plane |
| `jet-basin` | 33 | the basin's lower rim drawn as a line, not an ellipse |
| `rocky-ford` | 32 | the water strip's front cut |
| `fountain-tiered` | 25 | the bowl's lower rim |
| `arbour-seat` | 24 | the seat frame's feet |
| `axe-marker` | 24 | the base block |
| `balustrade` | 21 | the plinth |
| `pergola` | 14 | the post feet |
| `broken-column` (decor) | 14 | the drum lying on its side |
| `stone-bench` | 14 | the two supports |

**Fault (B), the FORM facing the viewer, is closed for the caves and open for
the arch family**: `RUINED_ARCHWAY`, `HEDGE_ARCH`, `PERGOLA_ARCH`, `EXEDRA`,
`WALL_FOUNTAIN`. There is still no detector for it, and the obvious one
(symmetry + horizontal major axis) is the trap the first draft fell into — it
convicts every urn in the catalogue. Inspection, for now.

**And two blind spots found on the way**, both from the same cause — a module
list written before the module:

- the sprite lab's `CANDIDATES` never included `decor.js` or `extras.js`, so
  **47 sprites had never once appeared in it**;
- `tools/propshot.mjs` only ever imported `PROPS`, so asking it for a decor
  sprite printed `MISSING` as though the art did not exist.

Both now read `AUDITED_MODULES`.

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
