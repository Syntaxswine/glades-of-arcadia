# Fix queue: where creatures may and may not walk

Two bugs the owner spotted, and the rules that close them. Apply after the
elevation/zoning/decor integrator lands — it currently holds `creatures.js`.

## 1. The satyr in the sky

**Reported:** a satyr walked into the sky beyond the map edge.

**Diagnosis:** mostly *not* a pathing bug. `main.js`'s `passable` already
rejects out-of-bounds tiles. But `Agent.leave()` and `Agent.enter()` set
positions **deliberately off-map**:

```js
leave(mapW, mapH) {
  const outs = [ { x: -1.5, y: this.y }, { x: mapW + 0.5, y: this.y }, ... ]
```

That is the design — the `visits` rung has creatures walk in at dusk and wander
back off. The defect is that there is **no visual treatment** of the transit, so
a fully-rendered creature strolls across open sky. Correct behaviour, broken
presentation.

There is also a genuine latent hole: `_wanderTarget` validates
`passable(Math.round(tx), Math.round(ty))` but returns the **raw fractional**
`{x: tx, y: ty}`, so the accepted target can sit up to half a tile outside the
tile that was actually checked.

**Fix, in two parts:**

1. **Invariant, not a patch.** A creature may be outside the map in exactly
   three states — `arriving`, `leaving`, `offstage`. In every other state its
   position is clamped to the map. The sky becomes unreachable regardless of
   which code path produced the target, so the next pathing bug cannot put
   anything up there either.
2. **Fade the transit.** Creatures entering and leaving fade in/out across the
   boundary rather than walking visibly over the sky. Cheap, and it reads far
   better than a hard clip — a creature *arriving out of the dusk* is the mood
   the rung is going for anyway.

Plus a playtest assertion: simulate several thousand creature-seconds with homes
deliberately placed on **edge and corner tiles** — the case a casual playthrough
is least likely to reach — and fail if any creature is ever out of bounds while
in a grounded state.

## 2. Walking on water

**Reported:** creatures can walk across water. Owner is happy with either
bounding them out, or animating wading later.

`main.js` currently makes water passable for everyone, on purpose:

> *Water stays passable on purpose: the naiad's whole home is a pool.*

Right for the naiad, wrong for everyone else — a unicorn should not stroll
across a pond.

**Resolution: make it species-specific.** This is more characterful than a flat
rule *and* it costs no new art, because in every case the creature is either
genuinely of the water or never enters it.

| creature | water | why |
|---|---|---|
| **naiad** | `dweller` — enters freely | She is a water spirit. Standing in her own pool is correct, and needs no wading sprite because she belongs there. |
| **centaur** | `ford` — crossings only | Fords and bridges. He stands *on* the crossing object, not in the water. |
| **satyr** | `ford` — crossings only | He would plunge in a spring given the art, but crossings are enough for now. Revisit with a splash animation. |
| **unicorn** | `never` | She comes to the brink and dips her horn — the alicorn purification beat. Standing at the edge is more evocative than standing in it, so this is a character decision, not a limitation. |

**The payoff:** crossings — **bridge, stepping stones, rocky ford** — become
mechanically real rather than decorative. Items already in the catalogue
suddenly do something, and the player discovers it by building a path.

**And we never owe a wading animation.** The two creatures that would need one
either live in the water (naiad, no waterline cut required — she is part of it)
or never enter it (unicorn, by character). If a wading satyr is wanted later it
is additive, not a debt.

## Not doing

- Shallow vs deep water as separate tile types. One water type, plus crossings.
- Swimming. Nothing swims.
