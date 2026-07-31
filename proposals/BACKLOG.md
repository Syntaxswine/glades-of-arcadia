# BACKLOG — Glades of Arcadia

Reconciled 2026-07-31 against `HANDOFF-THE-FIRST-GLADE-2026-07-31.md`.

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
