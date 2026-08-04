# Arcadia

A cosy isometric garden builder. You tend a glade: paint ground and water,
plant trees and flowers, set down a herm or a cave mouth — and wild things come
to live in what you made.

![A terraced Arcadian garden: a cascade falling into a plunge pool, a formal
court of dressed paving between clipped hedges, a heroön and an inscribed tomb,
a marble exedra, and a naiad standing at the water](docs/img/hero.png)

There is no fail state, no timer, no currency and no score. Placement is free
and removal is instant. Nothing decays, nothing dies, and the journal never
un-fills. If you leave for a week the glade quietly matures without you.

**The design, in one line: satyrs want mess and unicorns want purity, so one
uniform garden cannot please everyone.** You end up building *regions* with
different characters rather than one optimised lawn — and that is the whole
depth of the game, at no cost in stress.

## The ground is the zoning

Every placeable argues for one or more of the four species, and the winner is
**painted into the terrain**. Five grasses: neutral `meadow`, the satyr's dry
tussocky `thicket`, the centaur's pale open `sward`, the naiad's wet blue-green
`fen`, and the unicorn's silvery `millefleurs` strewn with white flowers. There
is no zoning overlay to toggle — you can simply see whose ground you are
standing on.

Where two species tie, the ground is drawn as a **50% checkerboard dither of
both**, which is not a compromise render: dithering between two adjacent values
is exactly what period isometric games did at every terrain boundary. Contested
land is unclaimed, never hostile, and is one of the prettiest states in the
game. Flips spread tile by tile over a few seconds, outward from the object you
just placed, so you can see what you caused.

Breadth costs strength — a single-affinity object commits ground at 1.0, a dual
argues 0.7 each way, a triple 0.5 — so junction pieces cannot out-vote
commitment and the optimal garden is not simply "all triples".

## Terraces, cliffs and falling water

Ground carries an integer height, 0–6, and terrain is stacked flat-topped
cubes: every level change is a clean vertical cliff. **There is no auto-slope
tiling.** To get up a cliff you place a connector — an earth ramp, a stone
stair, a rock scramble, a stepped terrace wall — which bridges exactly one
level over one tile. Where the ways up go is your decision rather than an
automatic consequence of digging.

Three things fall out of that, and they are the reason elevation earns its keep:

- **A cliff of two levels or more blocks influence**, using the same occluder
  rule the hedges use. Terracing a garden zones it without a single hedge —
  which is how real terraced gardens actually feel. A one-level step does *not*
  block, so you keep a soft tool and a hard one.
- **Water above a drop is a waterfall**, automatically. It is not a fluid
  model — it is an adjacency, so it starts and stops the moment you edit the
  tile in front. The motion is palette cycling on the water ramp.
- **A cave mouth sets into a cliff face**, which is what a cave is.

Objects ride their terrace: an object's height is read from the tile beneath it
and never stored, so raising ground under a tree can never leave it floating.
Terrain editing is free, unlimited and on the same 64-step undo stack as
everything else. One drag is one undo, however large.

A connector is also a **free seam**. A ramp tile is nobody's ground — not a
weighting that enough thicket could outvote, but a hard refusal — while
influence still runs straight through it. Barrier and doorway are two different
things, and the pairing is deliberate: a hedge is the barrier and its arch is
the doorway; a cliff is the barrier and its ramp is the doorway. So a terrace
joined by a stair reads as one garden on two levels, and the seam between two
rival plantings can be a flight of steps instead of a wall.

## Where a creature may put its feet

Water is not one rule, it is a property of the animal. The naiad **dwells** —
her whole home is a pool. The satyr and the centaur **ford**: they cross on a
bridge, on stepping stones or at a rocky ford, standing *on* the crossing and
not in the water. The unicorn **never** enters, and a crossing is not a
loophole for her — she comes to the brink and dips her horn there, which is a
character decision rather than a limitation.

That makes the three crossings in the catalogue mechanically real. They were
scenery; now a bridge is how you let a centaur reach the far bank, and you find
that out by building a path rather than by being told. None of them needs a
wading animation, ever: every creature either belongs in the water or refuses
it.

The predicate answers three questions in order, each owned by a different file
— *is it on the map* (`world.js`), *is something standing here* (`catalog.js`,
where a connector and a crossing are the only objects you may walk on), *is it
wet* (`creatures.js`, the table). Called without a species it returns the old
answer exactly, so a caller that has not been told about species still works.

## The visual reference

Impressions Games: *Caesar III* (1998), *Pharaoh* (1999), and above all ***Zeus:
Master of Olympus*** (2000). Warm, chunky, readable, Mediterranean, with
*The Settlers II* (1996) for cosiness.

- 64×32 tiles, a 640×400 logical screen scaled by a **whole number** only.
- **The game world is 100% authored pixels.** No spritesheets, no fonts, no CDN,
  no icon set. Every pixel of every tile, plant, creature and building is
  authored as text against eleven colour ramps in `js/palette.js` — including
  the pink bubble wordmark on the title screen.
  **Two files the page fetches are not:** the music (see [Music](#music)) and
  `TitleScreen.png`, the title backdrop. Both are the owner's, both sit outside
  the simulation, and nothing that draws a tile loads either. See
  `docs/TITLE-AND-CONTROLS.md`. The ambient audio layer — birdsong, water, wind
  and the satyr's pipes — is still Web Audio, generated live and reacting to the
  tiles on screen.
- Foliage is *composed*, not drawn — hand-authored 12–20px leaf clumps stamped
  into a buffer from a per-plant seed and then shaded, which is how period
  artists actually did it. No two oaks in your garden are the same oak.
- Water animates by palette cycling, the period trick: the ripple pixels never
  move, the ramp rotates underneath them.

## Run it

ES modules will not load over `file://`, so the game needs *a* server. It has
one, with no dependencies:

```
npm run serve            # http://localhost:8801
```

Then open <http://localhost:8801/>. That is the whole setup — there is no build
step and nothing to install. Node 22+ for the tools; the game itself is just
the browser.

The game opens on a **title screen**; New Game starts a fresh sixty-by-sixty map
of plain meadow with nothing on it. That wipe is a NAVIGATION (`?new=1&play=1`)
rather than a teardown, so starting over is a new document that cannot inherit
anything from the last one — see `js/titlescreen.js` for why that matters.

`?seed=thicket` starts a different map, reproducibly, in its own save slot.
`?new=1` starts over (your previous garden is copied aside first, because
nothing is ever taken from you). `?play=1` skips the title. **`?glade=1` plants
the old opening glade** — the small wild hollow the game used to start you in,
kept because the research behind it is sound and it is the fastest way to watch
a satyr arrive.

### On a phone

The title screen has a **Play on a phone** button, and `?mode=mobile` is what it
sets. It is the *same game* — same simulation, same catalogue, same save slots —
laid out on a **360 × 640** logical screen instead of 640 × 400.

Why a second screen size rather than a smaller scale: the game scales by whole
numbers only (SPEC §2), so on a 390px phone a 640-wide canvas cannot be shrunk
to fit without smearing every pixel of the art. 360 is the floor of the modern
phone field and 360 × 640 is exactly 9:16. `js/iso.js` `MODES` is the only place
either number is written.

What is different, and it is only the chrome:

- **The tools move to the bottom**, into a cluster at the top of the panel,
  because a thumb cannot reach the top of a phone. **Move is first and widest.**
- **The topbar is 22 rather than 14**, which is what it takes to make the speed
  lever and the brush big enough to hit.
- The category tabs scroll and keep the selected one in view; the palette drops
  to five columns; the info line sits under it rather than beside it.
- **The map rectangle is 478 tall against the desktop's 286.** A phone shows
  more garden than a monitor does.

Switching modes is a navigation back to the title screen, so you see the frame
before you commit to it, and it can never wipe a garden. Everything else — every
keyboard binding, every URL above — works unchanged in both.

**Two fingers.** Drag with two fingers to move the map *whatever you are
holding* — the move tool still works, but it costs a trip to the toolbar, and
one finger has to keep meaning "use the thing in my hand" or you could not plant
a hedge. Two fingers is the gesture every map on a phone already has.

**Pinch together for the whole garden**, tap a spot to travel there, and pinch
apart (or tap away, or `Esc`) to close. `M` does the same from a keyboard.

That is a magnified minimap and not a zoom, deliberately: the canvas is exactly
the logical screen and the upscale is a whole number (SPEC §2), so a real zoom
would mean either a fractional canvas — smearing every pixel the game has — or a
second art set at another tile size. The minimap is already the whole garden in
one picture, in the same projection as the screen, with a camera box and
tap-to-travel. Pinch makes it big.

**Hold a finger still to take something back** — the touch equivalent of a
right-click. Half a second, and it does not fire if the finger moved, if a
second finger joined, or if you are holding the move or `?` tools. It tells you
what it did, and `Ctrl+Z` is 64 steps deep.

**On a finger, placing happens when you lift, not when you touch.** Two fingers
never land at the same instant, so planting on contact meant that reaching for
the map with a tree in your hand planted a tree and then panned away from it.
A mouse still places on the press, where it always did.

To get one file you can mail to somebody:

```
npm run build            # -> dist/index.html, ~600 KB, opens from file://
```

### Playing

Drag to pan, or **`W A S D`**, or the **arrow keys**, or push the pointer to the
edge. Pick a category, pick a thing, click the map. Right-click takes it back.
`Esc` cancels, `Ctrl+Z` undoes (64 steps). `J` opens the journal.

**A letter picks a category and a number picks a thing inside it.** The letter is
printed on each tab:

| | | | |
|---|---|---|---|
| `G` Ground | `L` Land | `Q` Water | `P` Plants |
| `T` Trees | `C` Statuary | `H` Building | `F` Furniture |

Water is `Q` rather than `W`, and Statuary `C` rather than `S`, because `W` and
`S` pan the camera. `Q` is at least the key next to the one it wanted.

Then `1`–`9` select from the category you are in — which is why they no longer
select the category. Eight numbers could only ever reach eight of the 130
placeables.

**Hold `Shift`** with a movement key to nudge the tile cursor instead of the
camera, and `Enter` to place at it. Everything is still reachable from the
keyboard.

**Shaping ground.** The `Land` tab holds raise, lower and level, beside the
ramps and stairs they cut ground for. Drag out a region; right-drag inverts
raise and lower; `R` cycles the tools; `+` / `-` nudge the tile under the
cursor; `Esc` abandons a drag without committing. *Level* flattens a region to
the height of the tile you started the drag on.

**`Tab`** washes the map with one habitat field and cycles the six channels:
the four species affinities — each drawn in the ramp of the grass it grows, so
the overlay and the ground speak the same colour language — plus `maturity` and
`seclusion`, the two conditions grass cannot express. Affinity answers *whose
ground is this*; the wash answers *how hard is he arguing for it*.

## The creatures

Five, and you are told about four of them. **Satyr**, **centaur**, **naiad**,
**unicorn** — and a fifth who is not listed in the journal, not silhouetted and
not hinted at anywhere in the interface until you have seen him. He comes only
to a glade that has everything and has had it for a long time.

Each climbs a four-rung ladder — **sighted → visits → settles → thrives** — and
the trick worth knowing is on the second rung: *the creature arrives before it
is earned.* It walks in at dusk, drained of colour, wanders the region it likes
and leaves again. That preview is the entire hint system. An unmet requirement
stops being a debt and becomes an invitation.

What each one wants is for you to find out. The journal will tell you exactly
how many of a thing you have ("2 of 3 wild vines") because counts are discrete
and exactness costs nothing, and will only ever give you *words* for the
habitat axes ("wilder still", "almost quiet enough"). It will never sum your
garden into a number, and there is no percentage anywhere in the game.

Settling is not computed, it is **watched**: each creature has one thing it must
be seen to do, at its own hour of the day, at a place you built for it.

## The tombs

Five graves — a **tumulus**, a **grave stele**, a **naiskos**, a **heroön**, and
one more. They sit in the Statuary tab because a Greek grave marker *is*
sculpture, and they deposit maturity and seclusion: a garden with graves in it
is a garden that has been there a while, which is exactly what the older
creatures want. Each takes an epitaph from a pool of twenty, assigned by object
uid so a verse never changes under you — it shows on hover and on the journal's
stones page.

The fifth is not in the build menu, and it carries no empty "- - -" slot either,
because a promise is the one thing this object must not make. It appears when
some *other* tomb has stood twelve garden-days, is tended right now, and stands
where maturity has reached 10. When it is found, **nothing happens** — no toast,
no chime, no journal line. A button appears on the Statuary tab. Its inscription
is cut into the stone, two steps down with a lit pixel under each stroke, and
you have to go and read it where it stands.

![A tumulus, a heroön and an inscribed arcadian tomb standing on open turf,
with a centaur and a naiad among them](docs/img/tombs.png)

## Music

The game has a composed score, `audio/glades-of-arcadia.mp3` — and it does not
play at the start.

Two things have to happen first, and they are deliberately separate. The first
gesture you make — any click, any key — resumes the audio context, brings up the
ambient layer and fetches and decodes the track, **playing none of it**. The
track is then held, ready, in silence. It starts when **the first satyr walks
into your garden**, fading in over four seconds as he arrives. Until then the
glade has only its own sounds: birdsong that follows the moisture and maturity
of the region on screen, water that gets louder and brighter near a waterfall,
two decorrelated wind loops, and — through the satyr's four tells — a faint,
sour, off-centre set of pipes somewhere past the trees, escalating each time.
The third tell says *"Pipes, thin and off-key, somewhere past the trees"*, so
the hint system has been promising the music all along.

Once unlocked it is remembered in the save, so a garden that already has a satyr
in it starts its music on the first click and does not make you earn it twice.
`M` mutes, and mute persists; muting also skips the download entirely, because
5 MB is not worth fetching for somebody who turned the sound off last time.

The track loops by handing over rather than crossfading: the next pass starts
twelve seconds before the current one ends, so the quiet opening builds
underneath the still-loud ending. Measured on the file itself, that join varies
by about 2 dB — flatter than the music's own natural wander.

### Credit and licence

**Music by the repository owner, made with [Suno](https://suno.com).
Non-commercial use.**

**The code and the audio are licensed separately.** The code in this repository
is under the terms in `package.json`; the score is not covered by it and is not
granted for commercial use. If you fork this game, replace the mp3 or keep it
non-commercial — and note that the game degrades honestly without it: a missing
or failed track logs one line, and the glade keeps its birds.

## The instruments

```
npm test                 # node --test — 290 tests, ~9s
npm run playtest         # does the DESIGN work?  46 checks, ~40s
npm run build            # single-file dist + a self-audit
npm run check            # all three
```

**`npm test`** is correctness: projection round-trips for every tile at six
cameras, the exact plane partition that makes `floor(inverse)` a valid hit
test, depth sort with multi-tile footprints, field deposit maths (including
that `remove` is an exact inverse of `add` and that the incremental path equals
a full rebuild), sprite-format validation over every sprite the game ships,
catalogue integrity, and save/load round-trips.

There is one test file that belongs to no module: **`test/seams.test.mjs`**.
Eight people wrote this game at once, and not one of the faults found while
joining it up was inside a module — every single one was a disagreement
*between* two of them, and every single one was silent. A field bridge that
dropped `affinities` on the floor. A heightmap that never reached the fields,
so terraces quietly stopped blocking anything. An inert camera pushed into the
renderer every frame by an owner who believed he held it. Thirty-eight authored
sprites registered nowhere. That file asserts that independently-written things
still agree, which is the only kind of test that would have caught any of them.

**`npm run playtest`** is a different question, and the more interesting one. It
constructs a garden for each creature — through the real `World`, the real
`Fields` and the real `Bestiary`, driven by `creatures.js`'s own evaluator
rather than a second reading of the rules — and then runs the ladder until the
creature actually settles and is actually seen to do its beat. It then tries to
put a satyr hill and a unicorn garden on one map at every separation up to one
sigma and asserts that no such garden exists, which is the design thesis.

It also checks the **release valve**, which is the half of the thesis that says
what you *can* do. Rather than asserting a barrier works at one guessed
distance, it measures the closest the pair can be housed with and without one:
on open ground eight tiles, with a two-level terrace between them **four**. It
confirms a one-level step does *not* divide, and that a hedge severs the ground
between two rival plantings one tile apart. It reports which placeables still
draw with an understudy sprite and every `needsDesign` placeholder, and it
exits non-zero **only on a structural fault** — a garden that is merely hard to
build is a note, not a failure.

One finding is worth repeating here because it is the design working rather
than a bug: **no nullifier object rescues the satyr–unicorn pair.** Seven of
the eight carry `enclosure` or `straight-edge`, which the satyr caps at zero,
and the eighth — the herm — carries `votive`, which the unicorn caps at zero.
You cannot wall a satyr in to keep the walls away from him. The terrace is the
divider that works, because it is the only barrier that is not also an object.

Three later sections ask about the moving parts rather than the design, because
each of them shipped as a bug once and none is reachable by a unit test that
constructs its own case:

- **Nothing stands in the sky.** A creature whose home is an edge or corner tile
  spends its whole life pressed against the rim. The playtest settles every
  creature on all eight of them in turn and watches 3,600 creature-seconds,
  failing if any one is ever outside `[0, w-1]` while in a grounded state. The
  bound is the tile **centre**, not its extent — a sprite anchor sits on the
  centre point, so `x = -0.4` draws the feet out past the last diamond.
- **The right feet in the water.** Water is per species: the naiad dwells in it,
  the satyr and centaur take a crossing, the unicorn stops at the brink. Checked
  both as a table against the real predicate and dynamically, with homes on both
  banks of a pond that has one bridge over it.
- **A slope is nobody's ground.** A ramp between two heavily planted zones must
  stay neutral. The check proves the claim was **refused** rather than merely
  absent: influence on the ramp tile reaches ~10 against a `CLAIM_FLOOR` of
  0.45, and the tile still resolves to no owner.

`--verbose` shows the thesis attempts; `--json` emits the whole report;
`--quick` skips the dynamic ladder run while you are iterating on the
catalogue.

**Looking at the art.** `tools/spritelab.html` renders every sprite and composer
output at 1×/4×/8× on a neutral ground with the anchor marked, and lints the
whole catalogue. Serve the project and open
<http://localhost:8801/tools/spritelab.html>. Pixel art authored blind is
pixel art authored badly, so `tools/serve.mjs` + `tools/snap.mjs` let a page
rasterise itself to a PNG on disk to be looked at:

```
node tools/snap.mjs --port 8794 --out docs/shots
```

An animation cannot be judged one frame at a time, so `tools/poseshot.mjs` lays a
whole cycle out side by side on real ground, with each frame's hold printed:

```
node tools/poseshot.mjs --id satyr --pose pipe --zoom 6
node tools/poseshot.mjs --id satyr --pose pipe --sil          # silhouette first
node tools/poseshot.mjs --id satyr --pose drink --only 1,2,3 --zoom 14
```

`docs/shots/` is the scratch pad — contact sheets and working frames — and is
**gitignored**, so nothing there may be linked from this file. The four frames
that ship with the repository are in `docs/img/`, all captured from the running
game through `js/render.js` and nearest-neighbour enlarged:

| | |
|---|---|
| `hero.png` | the whole garden — terraces, the cascade and its plunge pool, four grass zones with contested borders, hedges, a heroön, an inscribed tomb, the marble exedra, and a naiad at the water |
| `cascade.png` | the water end to end: spring, rill, the lip, the fall, the pool — with a satyr on the wild terrace above |
| `formal-garden.png` | the dressed-paving court between clipped hedges, the exedra and the two tombs facing each other |
| `tombs.png` | the three redrawn tomb bases on open turf, standing on their own ground |

## Layout

```
index.html          the shell and the boot; the only entry point
css/style.css       all the chrome; every dimension is calc(N * var(--u))
js/palette.js       eleven ramps and seven accents. The whole game's colour.
js/iso.js           projection, elevation-aware picking, camera clamp, depth key
js/catalog.js       130 placeables — affinities, tags, blocks, connectors
js/world.js         the garden: placement, terrain ops, growth, undo, the save
js/fields.js        occluded flood per affinity + maturity and seclusion
js/creatures.js     the bestiary, the ladder, the beats, and the thesis
js/render.js        terrain columns, cliffs, falls, grass zoning, overlay, ghost
js/ui.js            tabs, palette, terrain tools, journal, the integer stage
js/input.js         pointer -> tile, camera, placement, terrain drags
js/main.js          boot, THE JOINS, one loop, autosave
js/audio.js         the score, plus live birdsong, water, wind and the pipes
js/art/format.js    the sprite format: rows of palette keys, validated
js/art/clumps.js    26 leaf and flower stamps
js/art/grow.js      nine composers — trees, shrubs, reeds, ivy, vines
js/art/tiles.js     ground tiles, all sixteen shorelines, grass sets, cliff bands
js/art/props.js     52 hand-authored sculptures, structures and affinity pieces
js/art/decor.js     38 furniture, architecture, hedges, fountains, connectors
js/art/extras.js    the two props the catalogue named and nobody drew
js/art/creatures.js 134 creature frames: idle, four facings of walk, one beat each,
                    plus the satyr piping (8) and drinking (6)
```

`SPEC.md` is the build contract; `docs/ELEVATION.md`, `docs/ZONING.md` and
`docs/DECOR.md` are addenda written after it and supersede it where they
overlap — ZONING.md replaces SPEC §6's five abstract axes with the four species
affinities, and DECOR.md supersedes SPEC §5's "roughly 45–60 placeables".
`docs/FLOURISHES.md` adds a layer rather than replacing one: the *idle life*, in
which a settled creature goes and uses a prop. Read it before adding a pose —
poses beyond idle/walk/beat are per-creature, and the rules about grown canvases
and one-shot gestures are the sort that fail silently.
`docs/RESEARCH.md` is the pixel-art craft, the sourced myth lore and the
cosy-builder design work behind all of it — read it before authoring art or
creature requirements.

### Two things a future owner should know

**There are two terrain-art implementations, and `render.js`'s is the one that
ships.** `art/tiles.js` also carries a full authored set — grass species, 60
cliff-face bands with turf caps and feet, and waterfall pieces — written in
parallel by the terrain-art owner. Its ground tiles and shorelines *are* live
(the renderer draws ground sprites from `TERRAIN`); its grass, cliff and
waterfall sets are not, because `render.js` generates those inside its own
terrain cache where the edge blending, the gradual spread, the palette cycling
and the cave-mouth face decals already live. Both name the five grasses
identically and a test asserts they still agree, so the choice can be revisited
without a hunt. `art/tiles.js`'s cliffs are the better pixels; wiring them in
means teaching `_paintFace` to stack per-level bands with a cap and a foot.

**Art debt is recorded, not hidden.** 28 placeables draw with an understudy
sprite and name the piece they actually want in `art.wanted`; `npm run
playtest` lists them. Each swap is one identifier.
