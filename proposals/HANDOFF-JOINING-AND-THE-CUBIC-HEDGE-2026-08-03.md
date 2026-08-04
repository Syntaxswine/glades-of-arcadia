# HANDOFF — WHERE A RUN ENDS, AND THE CUBIC HEDGE

**2026-08-03.** Written by the builder who shipped it, for whoever picks it up.

**This day had two arcs and they share nothing but the date.** The other one is
`HANDOFF-MOBILE-MODE-2026-08-03.md` — a second logical screen, the touch
gestures, and tap-to-turn. This one is art and geometry. They are separate
documents on purpose: joining them would make both harder to read, and neither
depends on the other.

The owner's two messages, because every decision below answers one of them:

> *"single hedges are represented differently than connected hedges."*
> — with a picture of a hedge run and two hedges standing on their own

> *"it would be nice if you could make the hedge a little more of a cubic form
> too."*

---

## 1 · The fault, measured

Before anything was touched, on `hedge-low`:

| the piece | ink pixels |
|---|---|
| **standing alone** (mask 0) | 855 |
| **the middle of a run** (mask 5) | 855 — **byte-identical** |
| an **end** of a run, +tx (mask 1) | 395 |
| an **end** of a run, −tx (mask 4) | 486 |

**An end was half a bar.** A run of five fenced four tiles: its two ends stopped
dead at the tile *centre*, while anything standing alone filled its whole tile.
So a lone hedge really was a different-looking object from the end of a hedge,
which is what the owner saw.

True of **all five joining pieces**, not just this one — `hedge-low`,
`hedge-tall`, `hedge-arch`, `palisade-fence`, `palisade-gate`.

---

## 2 · The old rule argued for itself, and the argument was wrong

`test/joining.test.mjs` did not merely permit the behaviour; it defended it:

> *"A ONE-ARMED PIECE IS AN END, and it draws only its arm — it stops at the hub
> rather than running on into empty ground. That is a real choice and not an
> oversight: a fence that overshoots its last tile by half a step is the same
> fault as the corner spike this whole mechanism exists to remove."*

**The premise is false.** The hub is the **tile centre** (stated outright in the
anchor note in `art/extras.js`) and an arm is **half a tile**. A piece with both
arms therefore spans its own tile exactly, edge to edge, and reaches into no
neighbour at all. *There was never an overshoot to prevent.*

That is the whole reason this is a fix rather than a change of taste, and it is
why the old paragraph is **kept in the test and answered there** rather than
deleted. A future reader who wonders why an end fills its tile should find the
objection and its refutation together.

**If you ever reverse a documented decision in this codebase, do it this way.**
The decision was argued; the reversal has to out-argue it in the same place.

---

## 3 · The rule, and why it is narrow

> A mask with **exactly one** neighbour also draws the **opposite** arm.

Nothing else changes. A lone piece already drew both arms; a corner, a T and a
cross are untouched.

**IT MUST NOT BE GENERALISED.** Mask 3 is +tx and +ty; giving each of those its
opposite would turn every L into a crossroads. A corner is *right* to stop at the
hub — its two arms already meet there and there is no raw cut to see. Only the
one-armed masks have an end that meets nothing.

There is an assertion for that (`'a corner became a straight'`), and it is the
one that should fail first if somebody widens the rule.

**IT HAD TO BE FIXED TWICE.** `joinedPiece` in `js/art/format.js` serves the
hedges and the drystone wall; the palisade has its **own hand-built generator**
in `js/art/extras.js`. A rule about how runs end belongs to both, and a fix
applied to one of them looks complete and is not — the measurement table in §1 is
what caught the second one still reading 159.

---

## 4 · The cubic hedge — height, not thickness

| | before | after |
|---|---|---|
| low hedge height | 8 | **15** |
| tall hedge height | 20 | **30** |
| arch height | 24 | **34** (tracks the tall hedge at +4, as it always did) |
| `HEDGE_DEPTH` | 8 | **8 — deliberately unchanged** |

**The depth is the interesting one.** "Cubic" has an obviously-correct answer:
`HEDGE_DEPTH` of 16 is one full tile, so the hedge's plan becomes square. It was
tried, and it was **worse** — the lit top face is the largest surface in this
projection, and doubling it made the hedge read as a *pale slab lying on the
grass*. The mass it was actually missing was the dark front face, i.e. **height**.

Four settings were rendered and looked at: `D=8` (baseline), `D=16 h=14`,
`D=11 h=12`, `D=8 h=15`. Only the last one reads as a clipped block.

**The lesson, which generalises past hedges:** in a 2:1 isometric projection the
top face is lit and huge and the front face is dark and small, so *adding
thickness adds brightness, not solidity*. If something reads as flat, it usually
needs to be taller, not deeper.

The arch is pinned to the tall hedge at +4 because it declares
`joins: 'tall-hedge'` in the catalogue and stands **inside** that hedge's run. A
gateway a different height from its wall reads as a separate object standing
where a hedge is missing — the exact fault the `joins`-as-a-group-name mechanism
was built to remove.

---

## 5 · THE TRAP — a sprite's name is not its placeable's id

**Read this before editing any sprite.**

The first cubic edit went into `js/art/props.js` `CLIPPED_HEDGE`, and it changed
art **the game never draws**. It rendered fine in the probe and did nothing in
the garden.

```
catalogue `clipped-hedge`  ->  art: sprite('hedge-low')  ->  js/art/decor.js
js/art/props.js CLIPPED_HEDGE  ->  registered as 'clipped-hedge'  ->  nobody asks
```

The artist's registry is built from `[tiles, extras, props, decor]` **in that
order, later wins**, keyed on `sprite.name`. `decor.js` is last. The catalogue
asks for `hedge-low`, `hedge-tall`, `hedge-arch` — all three live in `decor.js`.
`props.js` carries a whole second hedge family under the placeables' *ids*, and
nothing looks those names up.

**So: resolve `def.art.sprite`, not the placeable id.** One line settles it:

```js
node -e "import('./js/catalog.js').then(c=>console.log(c.byId('clipped-hedge').art))"
```

The dead copies were brought into step with the new numbers rather than left to
diverge, and they now carry a header saying they are not what the game draws.
**They should be retired** — see §7.

---

## 6 · The instrument, and the blind spot it was born with

`tools/joinshot.mjs` gains **`--lone`**: a run of *n*, plus two isolated pieces
(one at each facing), on one lattice at one scale.

It is the frame that made the fault visible, and the reason it did not exist is
worth keeping. The tool's own header says:

> *"a player never builds one hedge. They build a run of them, and then they turn
> a corner."*

So it only ever drew things **touching** — and was therefore blind, *by
construction*, to every fault of the lone case. Its sibling `propshot` draws each
sprite in isolation and was blind to the scalloping for exactly the mirrored
reason. **Between them the two tools covered neither comparison**, which is the
one that mattered.

**A probe's stated reason for existing is also the shape of its blind spot.**
When you write down why a tool exists, you have also written down what it cannot
see; put that sentence in the file and check it when a finding surprises you.

---

## 7 · What is open

- **`props.js` still carries `CLIPPED_HEDGE` / `TALL_HEDGE` / `HEDGE_ARCH` that
  nothing asks for.** They are in step and labelled, but they are a second source
  and the next person to change a hedge will find them first, because they are
  named after the placeables. Retire them, or make the catalogue ask for them and
  retire decor's — but not both.
- **The dark back-edge line on `hedge-low`.** Visible in every render as a thin
  dark stroke along the far top edge, slightly detached from the mass. It is
  `slabBackEdge` and it **predates this work** — it is in the baseline shot. Not
  touched, because it is a separate question from the two the owner asked.
- **`drystone-wall` was not measured after the fix**, only `hedge-*` and
  `palisade-*`. It goes through `joinedPiece` so it is covered by construction,
  but it has never been in a `--lone` frame. One command: `node
  tools/joinshot.mjs --ids drystone-wall --lone`.
- **`hedge-arch` renders in a stone-grey palette** in `joinshot`, not foliage.
  Noticed in passing while rendering corners; not investigated, and it may well
  be intended for an arch. Worth one look.

---

## 8 · State at handoff

| | |
|---|---|
| tests | **469** — `test/joining.test.mjs` gained the reversal and the corner guard |
| playtest | 49 / 49 |
| `iso-audit --strict` | 1 of 312 — `balustrade`, the known step-4 worklist entry |
| `anchor-audit` | 10 floating / 0 buried / 12 footprint mismatches — **all unmoved** by the taller hedges |
| verified | in the running game: a run, an L, and lone pieces of **both** hedge families |
| commit | `23871d3` |

**Files:** `js/art/format.js` (the end rule), `js/art/extras.js` (the same rule in
the palisade's own generator), `js/art/decor.js` (the heights the game actually
draws), `js/art/props.js` (the dead copies, kept in step and labelled),
`test/joining.test.mjs`, `tools/joinshot.mjs` (`--lone`),
`proposals/BACKLOG.md` §4m.

**Shots worth keeping:** `docs/shots/hedge-lone-vs-run.png` is the fault;
`docs/shots/cubic-tall-after.png` and `docs/shots/cubic-tallfront.png` are the
result.
