# HANDOFF — GARDENSHOT, THE BRIDGE, AND THE PIRANESI REVIEW (2026-08-05, evening)

Seven commits, `b491522..4b1661e`. This arc stands on the two solids handoffs
from earlier today — `solidJoins` layers/studs and `extrudeInto` are the whole
toolbox here; nothing new was added to `solid.js` — and on `playtest.mjs`'s
founding rule, which this arc extended from design to pixels: **a tool that
models the game tests the model.**

Read this before: using or extending `tools/gardenshot.mjs`, touching the
bridge or its ramp, touching the arcade, or running the hostile-review loop
that §6 leaves open.

---

## 1 · gardenshot — the instrument everything else here came from (`b491522`)

The owner, after one caveat too many: *"why cant you see it in the game?
could we make some sort of testing tool for you?"*

**First, a correction that six handoffs need.** The standing note said the
preview pane could not boot this game. STALE: it boots, `rAF` runs, the title
advances, screenshots return — checked in the pane, all four. What is true is
narrower: the pane is 415x320 and ignores resize, and the game keeps no global
handle, so reaching a placed object means clicking a garden into being through
a letterbox. An instrument that unpleasant does not get used, and an unused
instrument is indistinguishable from none. Say THAT in future, not "it can't".

**Second, the real gap.** Every art instrument draws a MONTAGE — propshot a
contact sheet, decor-shot a grid, joinshot a run on its own lattice. None goes
through `catalog.js` footprints, `world.place` refusals, main.js's join-mask
resolution or `render.js`'s depth sort. A fault in the seam between art and
game had nowhere to appear.

    node tools/gardenshot.mjs --place "colonnade@6,6 x4 +tx" --zoom 3
    node tools/gardenshot.mjs --place "a@5,5 x3 +tx; b@8,5" --level 1

Real World, catalogue, artist, scene builder, renderer, headless, any size.
`createArtist` and `createSceneBuilder` are **exported from main.js** rather
than reimplemented (two words, no behaviour change). Three defensible details:
placement goes through `world.place` so it cannot photograph an unbuildable
garden; the crop is DIFFERENCED against the bare map because any colour
threshold eventually eats a marble highlight; `--level` raises the plot since
height is read from the tile.

**Its record on day one:** the arcade's lone-piece cantilever, the arcade's
wall-in-front-of-columns, the bridge's footprint-vs-water misfit, and the
capital nicks on bare grass. joinshot could not have shown ANY of these — the
first lived in the mask state joinshot never draws, the rest in game placement.

## 2 · The bridge is a barrel vault now (`e3ff899`), and it joins (`4b1661e`)

The old `props.js` BRIDGE was a 32px ELEVATION — circular hole, its own disc
of water cycling inside. Deleted, tombstoned (precedence would have kept it
rendering in probes). The new one is `archwayGrid` TURNED NINETY DEGREES: ring
in the (p,c) plane, swept across the roadway; the soffit recedes and **the
brook the player laid shows through it** — `cycle:{ramp:'water'}` gone,
nothing replaces it.

**Footprint 2x1 → 1x1.** A two-tile span arches over the boundary BETWEEN its
tiles; every stream here is one tile wide, so it could never centre on the
water. Deck OVERHANGS 4 units onto both banks — reaching the banks is the
sprite's job, not the footprint's. `KNOWN_UNDERSIZED` has now named a symptom
whose cause was the footprint TWICE (ruined-arch, bridge); the staleness
assertion caught the fix by itself.

**Joins (16 states), three rules off the mask** — owner's spec: *"modular
structure to pass over any amount of water... twice as wide and put a ramp up
to either end"*:

* ALONG the run: a neighbour trims the overhang; abutments meeting at a shared
  boundary read as one pier. Chains are viaducts.
* ACROSS the run: parapet-side neighbour drops the parapet; near-side
  neighbour EXTENDS the vault from D=5 to the full tile (16.5). **Widening is
  an extension, not an adjacency** — side-by-side decks are eleven units of
  air apart and no amount of drawing them next to each other merges them.
* ORIENTATION: masks are absolute; a ty run gets genuinely ty-swept geometry
  via `extrudeInto`'s other axis, not a mirror. More-neighbours axis wins,
  tie keeps tx. (A lone side-by-side pair therefore reads as a short ty
  viaduct, not a wide tx bridge — accepted ambiguity, documented in the code.)

**The anchor does not move with the sweep** although the extended abutments
truly touch ground: the renderer requires ONE anchor height across all sixteen
states. The extension is reaching ink, like the overhang.

**bridge-ramp** (new placeable, Building tab): masonry wedge climbing turf →
deck (`DECK_C = 24` — the bridge's SPRING 9 + ring 12 + deck 3; change one,
change both) in one tile; parapet follows the slope as a second swept profile
on the shared z-buffer. Turns with the WHEEL (`back` variant + mirror = four
directions), deliberately NOT in the join group: joins zero facing, and a ramp
that cannot point at what it serves is furniture. NOT a connector: the deck
height is the sprite's fact, not the terrain's.

## 3 · The arcade, four commits of being wrong in layers (`e878cfc..ba54e80`)

Owner's screenshots drove all of it; every diagnosis of mine that preceded a
measurement was wrong, and the ones that followed one were right.

1. `e878cfc` — bay moved INSIDE one tile (opening at centre, piers at ends,
   colonnade's rule). Fixed Piranesi's *"accident awaiting a lawsuit"* lone
   piece. I then wrongly declared it sound.
2. `9e8aa23` — wall D 6→4: three units of masonry stood in front of every
   capital. Measured the sprite for gaps FIRST this time (there were none —
   the "floating" was the wall's near face). Exemption from `e878cfc` removed
   the same pass it stopped being earned.
3. `69628f8` — the owner's own diagnosis, all three counts: extrados now lands
   ON the column axis (`EX = C`, was `C+1` with springing 2 inboard); a corner
   is a SOLID PIER (it used to carve its arch through its own corner column);
   the hub crossing block is drawn on turning pieces (`walls` returned early on
   the hub — invisible on straights, fatal at corners: the piers stood under a
   hole). Plus: dropping one `!turning` guard makes the pier rule identical to
   the colonnade's, and a corner stands three piers.
4. `ba54e80` — layer order `columns, walls`: the wall honours the z-buffer,
   the column trio is raw puts, so drawn columns-last a capital always won and
   painted over the archivolt foot. The SAME swap was tried at D=6 and
   rejected (capitals swallowed); the order was never wrong, the wall was.

Guards: `SOLID_CORNER = { arcade: 1.9, bridge: 2.7 }` and
`THIN_SLICE = { bridge: 0.26 }` in `test/joining.test.mjs`, each with its
arithmetic written down; floors untouched for everyone.

## 4 · The table, not the export (`4b1661e`)

`joiningFamilies()` scans `DECOR/EXTRAS/PROPS` tables. The bridge was a bare
export — a joining family NO guard had ever seen. Third instance of the
drystone lesson; the helper's own comment even warns about it. Registered,
the guards immediately caught two real things. **A joining sprite must be in
its module's table.**

## 5 · The Piranesi review — round 1 verdicts (standing queue)

Four parallel critics in Piranesi's voice reviewed 47 gardenshot renders
(`docs/shots/piranesi/`). **17 approved, 30 rejected.** Fixed since: arcade
(4 commits above), bridge (rebuilt before the verdict arrived, then widened).
His per-batch worst, still open:

* **Architecture**: ruined-arch (*"ruin as erasure — no rubble, a croissant"*:
  wants a squared radial break + fallen voussoirs on the grass), archway (no
  impost, flat ring values), colonnade entablature (*"butter-slab"*: split
  cornice proud, shadow line under the beam), corinthian capital (bell must
  FLARE; leaves light-tipped not dark holes), balustrade (*"a comb"*: balusters
  must bulge 3px at mid-height, undercut below the rail).
* **Walls/tombs/seats**: palisade-fence (no rail — worst of its batch), exedra
  (no end-section thickness, no plinth — *"the marble-exedra beside it proves
  you know how"*), dry-stone-wall (tapering ends; ends must be square, courses
  in the face), stone-bench (supports at wrong ends), tumulus (kerb ring must
  continue round the far arc), grave-stele, pergola (vine floats above the
  frame), arbour-seat (one support missing), palisade-gate (no opening).
* **Water**: shell-fountain (worst: no landing, no lip), grotto-basin (named
  for a basin it does not contain), votive-shelf (shelf has no top face),
  stone-fountain (no source/outlet, unlit cylinder), sundial (plate must be
  4:1 ellipse + gnomon must cast its shadow), pan-nymph-altar, axe-marker.
* **Vessels/figures**: seated-maiden (worst: needs a lap plane + a block),
  sleeping-satyr (plinth needs a cap course; limbs need mass), mask-idol
  (needs a base), krater (mouth to 4:1, foot spreads), wide-krater (mouth
  ellipse + bowl/stem joint), half-buried-pithos (right handle: two
  attachment points), fallen-torso (off-centre, stagger the break).

**And what he ordered LEFT ALONE** (do not "improve" these): tholos step stack
+ peristyle shadow; Doric abacus overhang and the Doric/Ionic width
difference; obelisk's two-value pyramidion; broken-column's drum joints;
marble-exedra's krepis; heroon's corner returns; naiskos's shadowed niche;
arcadian-tomb's lid overhang; amphora's two-point handles; the amphora plinth
(copy it under mask-idol and seated-maiden); birdbath's marked junctions;
tiered-fountain's rim highlight and visible circuit; wall-fountain's
circle-vs-ellipse distinction; fern-grotto's overhang.

**The loop's standing instruction** (owner): keep fixing and re-submitting
until a Piranesi-styled critic approves EVERYTHING. Round 1 critiques are
verbatim in the four agent outputs; re-render with gardenshot, fix from his
"smallest change" lines, re-critique in batches. My round-1 mistake, do not
repeat: I reported after one pass instead of looping to the condition.

## 6 · Traps found this arc

* **A raw-put stud pass always beats a z-buffered sweep** — order is the only
  tool. Bottom-up within studs, studs-before-sweeps when the sweep must land
  on them.
* **The fraction lies for thin pieces** (run-overlap guard): same 2px seam is
  5% of a hedge and 23% of the bridge's slice.
* **`hub` on a turning piece is the tile centre** — anything centred on `hub`
  is centred on the corner column.
* **Bash heredoc ate a `PY` delimiter again** — write the python to the
  scratchpad and run it by path. Fourth time.
* Session-long: measure before diagnosing. Every arcade guess made before a
  pixel scan was wrong; both after were right.

## 7 · Verified state

HEAD `4b1661e`, pushed. 471 tests / 0 fail · playtest 51/51 (bridge-ramp
reachable) · `iso-audit --strict` 0 · anchor-audit unchanged · registry-audit
2 shadowed / 0 promised · build clean, dist current. All judgements via
gardenshot renders at 3–6x; the live pane was used only to falsify the stale
boot caveat.
