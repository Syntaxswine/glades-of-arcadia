# Addendum: elevation

Green-lit: elevation, terraces, slopes, stairs, caves, waterfalls.
Constraint given: **simple cubic elevation, 1-up-1-over slopes.**

## The model

Every tile carries an integer `level`, 0–6. Terrain is **stacked flat-topped
cubes**: a tile's top is the ordinary 64×32 diamond, and where it stands proud
of its neighbours its exposed sides are drawn as vertical faces.

```js
export const LEVEL_H = 16;   // px of rise per level — the one tunable constant
export const MAX_LEVEL = 6;
```

`LEVEL_H = 16` is half a tile height. A true unit cube would be 32, but 32 makes
a garden read as a mountain, buries objects behind cliffs, and eats the 400px
viewport. 16 keeps the map legible and still gives a 4-level waterfall 64px of
drop, which is plenty of presence. **Change this one constant if it wants to be
steeper — nothing else should hard-code it.**

**Projection** gains one term and nothing else changes:

```js
sy = (tx + ty) * (H / 2) - level * LEVEL_H;
```

## No auto-slope tiling. Ramps are objects.

The standard way to do iso terrain is marching-squares slope fitting: 4 cardinal
ramps, 4 outer corners, 4 inner corners, and a mess of edge cases where three
levels meet. **We are not doing that.**

Instead: **terrain is always flat-topped.** Level changes are always a clean
vertical cliff. To get up a cliff the player *places a connector object* — a
ramp or a stair — that visually bridges exactly one level over one tile. That is
precisely "1 up, 1 over".

This is simpler, more robust, and better for a builder: the player decides where
the ways up are, which is a design decision rather than an automatic
consequence of terrain editing. It also means zero tile-fitting logic.

Connectors:
- **Earth ramp** — rough, un-dressed. Archaic register.
- **Stone stair** — dressed steps. Neoclassical register.
- **Rock scramble** — informal, satyr-leaning.
- **Stepped terrace wall** — a retaining wall with steps built in.

## Cliff faces

A tile standing above its SE or SW neighbour exposes that side. Draw a vertical
face sprite per exposed side per level of difference, in the `rock` and `earth`
ramps, with seeded variants so a long cliff is not a repeating strip.

Faces needed: rock, earth, dressed retaining wall, mossy rock, and the
**contact/soil cap strip** where the grass top meets the face — the small detail
that stops a cliff looking like a pasted rectangle.

## Terraces are nullifiers — the free synthesis

**A height difference of 2 or more levels blocks influence propagation**, using
exactly the occluder logic the hedges already use (`DECOR.md`, Part I).

This means the elevation request and the nullifier request are the same system.
Terracing a garden naturally produces distinct zones without the player placing
a single hedge, which is how real terraced gardens actually feel. A sunken
garden is secluded because it is *sunk*, not because a rule says so.

A 1-level step does **not** block — gentle undulation stays connected, so the
player has both a soft and a hard tool.

Elevation also feeds the surviving `seclusion` condition: a hollow ringed by
higher ground is secluded; an exposed summit is not.

## Water

Water bodies sit **at a level**. A water tile knows its surface level, and the
shoreline logic already written extends to "where water meets a higher tile".

**Waterfalls** occur automatically where a water tile is adjacent to a drop:
render an animated water face down the cliff, plus a splash/foam cap at the
base. The motion comes from **palette cycling on the existing water ramp** —
the same trick as the pond, no new animation system. A fall of 3–4 levels is a
genuine feature to build a garden around.

This makes the naiad's habitat vastly more interesting: a spring high on a
terrace, falling to a pool below, is a far better thing to build than a puddle.

## Caves

A **cave mouth is a sprite set into a cliff face** — which is what a cave
actually is, and it retroactively fixes something that was always slightly odd:
cave mouths sitting on flat ground.

The affinity items that wanted caves finally make sense:
- the satyr+naiad cave (*Hymn to Aphrodite* — silenoi and nymphs in "the depths
  of pleasant caves") now needs a hillside, which is correct,
- Chiron's cave wants a wooded slope, which is Pelion, which is correct.

Cave interiors are **not** modelled. A cave is a dark mouth with something
suggested inside. Flagged as a possible later feature, deliberately out of
scope now.

## Depth sorting with height

The existing key gains a z term. Draw order:

1. Terrain columns back-to-front by `tx + ty`; within a column, bottom face to
   top face by level.
2. Then objects, keyed `depth = (tx + ty) * (MAX_LEVEL + 1) + level`, tiebreak
   `tx`, then stable insertion index.

Objects standing on a raised tile therefore draw after that tile's column and
before anything further forward. Tall objects on low ground in front of a cliff
are the remaining hard case — accept minor overlap rather than building a
topological sort; the spec already forbids non-rectangular footprints for the
same reason.

## Editing tools

Classic builder verbs, click-and-drag:
- **Raise** / **Lower** a tile or a dragged region by one level
- **Level** — flatten a dragged region to the height of its first tile
- Terrain edits are undoable on the same 64-step stack as placement
- Raising a tile under an object is legal; the object rides up with it

Cosy guarantee holds absolutely: terrain editing is free, unlimited, and
reversible. There is no terraforming cost and never will be.

### The pillar trick is a FEATURE. Do not fix it.

An object rides with its **own footprint** and no further. The tiles its art
merely *overhangs* are ordinary ground, so you can dig them out and leave a tall
thing standing on a pillar with its art hanging over air — and if you dig the
whole glade but one tile, that is exactly what you get.

Owner's call, 2026-08-01: *"this is a classic bug of that era that players would
use creatively to build things they otherwise couldn't, so i don't want it
corrected. that bug was most popular in Ultima Online."*

**It is not the same thing as the floating bug `tools/anchor-audit.mjs` hunts.**
That one lives in ART space — a sprite drawn too high inside its own bitmap,
wrong wherever the player puts it, and a fault. This one lives in WORLD space:
the art is right and the player dug the ground away on purpose. Anyone who reads
the anchor audit and then goes to `world.js` to "finish the job" is about to
delete a toy.

Guarded by three `FEATURE:` assertions in `test/world-terrain.test.mjs` and a
note on `_cohere` in `js/world.js`. It is also **undoable**, like every other
edit — a toy you cannot take back is a trap.

And it is deliberately **not taught**. Nothing in the UI mentions it; it is
something a player finds by digging.

## Slopes are neutral; terraces are ordinary ground

Three rules, from the owner:

1. **Sloped ground is always neutral.** A ramp or stair tile renders as plain
   `meadow` and can never be claimed by a species, no matter what surrounds it.
2. **Terrace flats are ordinary ground.** A raised level is just ground — it
   takes a grass type, or stays neutral, exactly like everything else.
3. **Connectors join levels, and influence passes through them.** A ramp does
   not block. It is the way through.

### Why this is right, not arbitrary

Objects need a flat footprint, so **nothing can ever be planted on a slope** —
there is no source to claim it. The ground is neutral because nobody is able to
argue for it. The rule falls out of the geometry.

### The symmetry worth naming

This is the same pattern the hedges already use, and a player who learns it
once knows it twice:

| barrier | the gap through it |
|---|---|
| hedge / wall / herm | **hedge arch** |
| cliff of 2+ levels | **ramp / stair** |

A barrier blocks propagation; its connector is the doorway. So terracing a
garden severs it into zones, and then *deciding where the ways up are* is
deciding where the zones stay connected. Terrain shaping becomes a zoning tool
in two directions at once — cliffs divide, ramps rejoin — and the player is
never given a rule they have not already met somewhere else.

### Consequence: slopes are free seams

Because a slope is permanently neutral, a player who wants two zones adjacent
but visually separate can run a ramp between them and get a neutral strip for
nothing. That is a second, softer alternative to a hedge, and it is prettier.

**Note on the gravel walk**, which is a nullifier and *does* block: a walk runs
**along** ground and divides it; a connector runs **through** a cliff and joins
it. Different jobs, and the shapes make the difference legible without a
tooltip.

## What this does NOT include

- Cave interiors (mouths only)
- Diagonal or half-level terrain
- Auto-smoothing between levels
- Objects spanning two levels (a bridge over a gorge) — **NEEDS-DESIGN**
- Water flowing *downhill* as a simulation. Waterfalls are a rendering
  consequence of adjacency, not a fluid model.
