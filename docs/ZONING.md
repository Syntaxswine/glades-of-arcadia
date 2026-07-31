# Addendum: grass-type zoning

**Status: supersedes SPEC.md §6 (the five habitat axes) as the primary zoning
mechanic.** Written mid-build; apply after the foundations wave lands.

The axis-field machinery in `js/fields.js` is *not* wasted — the maths is
identical (deposit with gaussian falloff, incremental recompute, sample per
tile). What changes is what the fields *mean*: five abstract axes become five
**species affinities**, and the winner is painted into the terrain.

---

## The idea

The zoning stops being an overlay you toggle and becomes **the ground itself**.

Five grass types:

| type | who | look |
|---|---|---|
| `meadow` | nobody — the neutral base, everywhere at the start | ordinary green, `grass` ramp |
| `thicket` | satyr | dry, tussocky, unkempt; weeds and thistle; `olive` ramp pulled warm |
| `sward` | centaur | open coarse running turf, paler, herb-flecked |
| `fen` | naiad | lush wet green going blue, moss and rush; toward `cypress`/`water` |
| `millefleurs` | unicorn | fine pale silvery grass strewn with tiny white flowers (accent `7`) |

Every placeable declares one **or more** affinities at its base. Single-affinity
objects are partisan; multi-affinity objects are swing voters. A spring serves
both naiad and satyr; a plane tree serves naiad and centaur; a wild vine is
satyr and nothing else.

Grass follows influence, so **removing objects reverts the ground** toward
`meadow` over time. The garden is always reshapeable — that is a cosy
guarantee, not a side effect.

## Resolution — per tile, with falloff

For each tile, sum the influence of every object within radius (σ ≈ 2.5 tiles,
same kernel as before) per affinity.

```
top     = highest-scoring affinity at this tile
second  = next highest
if top.score < CLAIM_FLOOR        -> meadow      (nothing has claimed it yet)
else if (top.score - second.score) <= CONTEST_EPS -> contested(top, second)
else                              -> top.type
```

Per-tile rather than per-region, deliberately: it produces **organic, blobby
borders** instead of rectangles. The cosy research names "four zoo pens" as the
central failure mode of multi-region builders, and soft per-tile borders are
the cure. (If decisive whole-region flips are wanted instead, that is a change
to this one function and nothing else.)

`CONTEST_EPS` should be a *proportional* margin, not absolute — two objects
versus three should be able to tie near the boundary, but twenty versus
twenty-one should not read as contested across a whole meadow.

## Contested ground

Rendered as a **50% checkerboard dither of the two competing grass types**.

This is not a compromise render. Checkerboard dithering between two adjacent
values is precisely the technique period isometric games used at every terrain
boundary (RESEARCH.md §A5). The mechanic and the authentic art technique are
the same operation, so contested land reads as deliberately unresolved rather
than as a bug.

Contested tiles are **unclaimed, not hostile**:

- No creature will *settle* on contested ground.
- A creature already settled there is **never evicted**. It becomes visibly
  restless and walks to the nearest tile of its own grass.
- **A settled creature never leaves the garden. Ever.** If there is no ground
  of its type left anywhere, it stays where it is and looks unhappy — that is
  the floor, and it is absolute. A journal entry is never un-filled.
- Contested ground is not ugly. It is one of the prettiest states in the game.

## Flips are gradual

When the balance tips, the grass **spreads tile by tile over a few seconds**
rather than snapping. Two reasons: the causality stays legible (you see which
object you just placed doing the work), and watching a change propagate is one
of the quiet pleasures of the genre. Animate outward from the object that
caused it.

## What survives from the axes

Grass type answers **"whose ground is this?"**. It does not answer **"is it
ready?"**. Two scalars survive for that, because they are conditions rather
than affinities and grass cannot express them:

- **`maturity`** — accrues with garden time near mature plants. Why a glade
  left alone quietly improves, and the gate on Pan.
- **`seclusion`** — about absence: distance from paths, traffic and open
  sightlines. It is what separates a quiet corner from a busy one *within* the
  same grass type, and it is most of what the unicorn is actually asking for.

`wildness`, `order` and `moisture` are **retired** as separate axes — they are
now expressed by which grass a place grows.

## Creature requirements, restated

A creature settles where:

1. there is a large enough contiguous patch of **its own grass** (this replaces
   the old axis-band requirement), **and**
2. its **count** requirements are met within radius (`3 × ash within 4 tiles`),
   **and**
3. its `seclusion` / `maturity` conditions are met, **and**
4. its **behavioural** beat has been watched.

The journal keeps the rule from SPEC §7 exactly: **exact ticks for counts,
qualitative words for conditions, and a patch of grass shown as a picture
rather than a number.** No percentages. No score. Still no rating anywhere.

## Art work this adds

- 4 species grass tile sets, seeded variants each, plus `meadow`.
- Dithered checkerboard blends for every contested pair (10 pairs, but they
  compose from the two source tiles — one blend routine, not ten tile sets).
- Soft dithered edges where a species grass meets `meadow`.

The five must be legible at a glance and harmonious together — all drawn from
the established ramps in `js/palette.js`, nothing new and nothing saturated.
