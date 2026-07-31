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
- **`piping` fires once a session and is never armed on a restore.** That is
  right for the arrival. If it ever wants to recur, it needs a cooldown and a
  reason — not just a flag flip.
- **The drink is silent.** There is no audio hook on a flourish at all. A single
  soft sound on the sip would probably be lovely and would equally probably get
  annoying at the fifth repeat; if tried, tie it to the one-shot's start, not to
  a frame.

## 4c · Found by the reachability audit (2026-07-31)

Four agents traced "can a player actually SEE these animations, from every entry
state". Two findings were real and are FIXED (the recital being unreachable on a
restored save; `phase` animating and running every creature ~40% fast). These
are the survivors — real, but not worth stopping for:

- **`CREATURE_SHADOWS` is dead art.** `main.js` passes the authored contact
  stamp as `shadow:`, but `render.js` only reads that field as `false` or a
  number — an object falls through to `1` and it synthesises an elliptical stamp
  from the footprint instead. The shadows you see are procedural; five
  hand-authored sprites are never rasterised. Either wire them up or delete
  them, but do not leave art in the tree that nothing draws.
- **A muted player still gets the full three-minute recital**, miming to a track
  they cannot hear. Defensible — it is a visual, and the garden is still worth
  looking at — but if it ever grates, gate `arm()` on `!audio.muted`.
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
