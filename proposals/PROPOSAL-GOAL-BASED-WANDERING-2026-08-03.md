# PROPOSAL — GOAL-BASED WANDERING

**2026-08-03. Nothing here is built.** Companion to
`PROPOSAL-STAIR-CLIMBING-2026-08-03.md`, which this partly supersedes (§8).

> **The owner:** *"ideally i want wandering to be goal based … the creature is
> drawn to the highest scored area … at a minimum they move to it and look at it
> for a number of seconds equal to its desirability score, and then path to the
> next most desirable target. there is a variable that increases with time that
> adds a bonus to the desirability score … but wont be enough to bump up non
> related objects into the running."*
>
> *"…there are some neutral objects, like benches, that might be surrounded by
> other objects of a specific class, and so they are raised to a level that the
> creature will interact with them."*
>
> *"with neutral they will look like normal, with opposites they will look,
> quickly shake their head, and then walk to the next."*

**The good news is that three of the four pieces already exist in the tree and
only need reading.** The bad news is in §4: the invariant was tested, and it
broke — not because the bonus was the wrong shape, but because the *base* was.

---

## 0 · THE SHORT VERSION

| | |
|---|---|
| the desirability function | **already authored** — the ladder names 24 tags with sign, per species |
| the context term | **already computed** — `fields.js` is exactly "what is around here, per species" |
| the gesture | **~20 lines, no new art** — every species already isolates its head |
| the invariant | **broke under test.** 25% of Pan's attention went to a neoclassical courtyard |
| dwell == score | **measured 0.15 s of spread** against a 5.37 s travel confound. Do not build it |
| what must ship first | **per-facing idle art** — 12 lines, no art, and without it the feature is *anti*-rendered |
| the pure argmax | converges to an **exact period-8, 72-second loop**, seen twice in two minutes |

---

## 1 · THE SCORE IS ALREADY WRITTEN

Every species' ladder names the tags it wants and the tags it refuses. That is a
desirability function, authored, maintained, and already guarded by
`checkTagContract`:

| species | drawn to | refuses |
|---|---|---|
| satyr | vine, ivy, pine, cave, spring-head, wine | enclosure, straight-edge |
| centaur | ash, timber, cave, physic | enclosure, tree, wine |
| naiad | spring-head, reed, water-loving, grotto, willow, votive, greensward | fountain |
| unicorn | white-flower, still-water, fountain, enclosure, antidote, oak | votive, wine |
| pan | syrinx, cave, pine | — |

24 distinct tags; **91 of 137 catalogue entries carry at least one.** Weight is
simply how many times the ladder names that tag, which is a free importance
measure. Scored naively, that gives:

| species | drawn to | neutral | avoids | top |
|---|---|---|---|---|
| satyr | 13 | 102 | 22 | wild-vine 4 |
| centaur | 18 | 94 | 25 | ash-tree 5 |
| naiad | 20 | 112 | 5 | reed-bed 5 |
| unicorn | 41 | 87 | 9 | lily-pool 5 |
| pan | 6 | 131 | 0 | syrinx-stand 3 |

**Nothing here is invented and no table is hand-written.** That matters: a
per-species table of interests is a second source of truth that goes stale the
first time the catalogue grows, and this codebase has three recorded casualties
of exactly that (`flatFooting`, `shadow`, `crossing` — `catalog.js:2453-2489`).

## 2 · THE CONTEXT TERM IS ALREADY COMPUTED

The owner's asterisk — a bench promoted by its neighbours — is not a new
mechanism. It is what the influence field *is*. Measured on the same bench:

| `stone-bench` — tags `seat stone tended quiet`, no ladder tag, base 0 | satyr | unicorn | naiad |
|---|---|---|---|
| alone in a meadow | 0.00 | 0.00 | 0.00 |
| inside a thicket of wild vine | **4.86** | 0.00 | 0.00 |
| among lily pools | 0.00 | **4.06** | **4.06** |

…and it is properly local, so it cannot leak across a garden:

```
satyr context vs distance:  r=0 → 4.86   r=4 → 1.95   r=8 → 0.056   r=10 → 0.000
```

> **WHICH SPECIES A NEUTRAL OBJECT BELONGS TO IS DECIDED BY WHERE THE PLAYER PUT
> IT.** A bench in the thicket *is* the satyr's bench. Nobody authors that; the
> field already says it.

## 3 · THE THREE TERMS, AND THE ORDER OF OPERATIONS

The owner's asterisk does not weaken the invariant — it **locates the
multiplication**:

```
desirability = tagBase(object, species) + context(field, object.tile)   ← additive: MAY promote a 0
   chosen    = desirability × (1 + staleness)                           ← multiplicative: CANNOT
```

- **Context** is a property of the world. It may promote, and should.
- **Staleness** is a property of the creature's memory. It may only reorder.

A bench in open ground is 0, and staleness keeps it 0 for ever, at every value
of every constant. A bench in the thicket is 4.86, and staleness can bring it to
the front of the queue. **The invariant is structural, not tuned** — provided the
sum happens first.

### Salience and valence — what the head-shake forces

*"with opposites they will look, quickly shake their head, and then walk to the
next"* means an opposite must remain a **pathable target**. Filtering negatives
out — which "score must be positive" would have done — deletes the behaviour.

So selection is not argmax of a signed score:

```
salience = |desirability|      → what the creature notices, and walks to
valence  = sign(desirability)  → dwell and admire, or glance and refuse
```

That is the whole reaction table the owner described: positive earns its look,
context-promoted neutral reads as ordinary, opposite gets a glance and a refusal.
It teaches the player what each creature wants **without ever showing a number**,
which is SPEC's own constraint.

**Negatives need damping**, or a satyr in a formal garden spends his day walking
up to hedges to disapprove of them — funny once, wearying by the tenth. Damp
salience for negatives, and set staleness on refusal so he does not go back soon.

### The gesture is nearly free

Every species already isolates its head:

```
satyr  const head = back ? S_HEAD_BACK : S_HEAD;      naiad, centaur, unicorn, pan — identical shape
```

Frames are composed from `[part, x, y]` layers, not drawn as sheets — the
satyr's idle is legs, torso, `[head, 6, 0 + bob]`. **A shake is that list with
the head's x oscillating ±1.** No new pixels for any creature; four lines in each
of five layer functions, and it inherits every facing and the back-head for
free. The one-shot plumbing already exists — `extra: { drink: { frames: 6, once:
true } }` is exactly this shape.

## 4 · THE INVARIANT WAS TESTED, AND IT BROKE

This is the finding worth the whole exercise. An adversary ran the owner's own
sentence as an experiment: identical garden, identical everything, staleness
**off** versus **on**.

| | decisions | on Pan's ladder | on a neoclassical courtyard |
|---|---|---|---|
| bonus OFF | 153 | **100%** | 0% |
| bonus ON | 128 | 75% | **25%** |

The courtyard objects — sundial, doric-column, topiary-cone, fluted-urn — appear
in none of Pan's rungs, his beat, or any flourish. Their fresh desirability
(0.786–0.850) is strictly below every ladder object (1.090–1.304). **They could
only ever win once the ladder objects had gone stale** — which is precisely the
failure the owner named in advance.

**The bonus was not the culprit. The base was.** That design derived interest
from a *seam sum over affinity weights* rather than from the ladder, which
admitted 89 of Pan's 95 candidates on somebody else's affinity — 64 of them
register-lean decor. Multiply a wrongly-positive base by anything and it stays
wrongly positive.

> ### LAW: THE GATE IS THE LADDER, NOT THE FIELD
> A candidate is admitted because **this species' own rungs name one of its
> tags**. The field supplies the *context term* for something already admitted —
> it must never be the thing that admits. Gate on affinity seams and neutral
> decor floods the realm; the staleness bonus then does exactly what it was
> promised not to do.

A related casualty, measured: one design's source-key change made `meadow-turf`
— which declares `affinities: {}` **on purpose** — read as satyr 1.0, so plain
lawn outranked umbrella-pine and cave-mouth. **15 of 18 ground painters changed
meaning.** Ground is not an object of interest and must not enter the set.

## 5 · WHAT MUST SHIP FIRST, AND IT IS NOT THE SCORING

**Idle has no facings.** `this.facing` is written by `_leg` and already handed to
the renderer, but a creature that stops is drawn front-on regardless of where it
was going.

Which means, if the loop ships before the art:

> The creature walks purposefully to the urn, **turns to face it, and then
> visibly turns away from it** to stand there front-on and look at nothing.

That is not half-rendered, it is *anti*-rendered — worse than today's ambling,
where the same snap reads harmlessly as "it stopped and looked around".

**Per-facing idle is ~12 lines in the build loop plus one in `creatureFrame`, and
needs no new art.** It is the only commit in the arc with no sim change, no
determinism risk, no RNG reordering, no save bump and no test churn — and it
makes today's game better on its own. **Ship it alone, first, and stop for a
day.**

## 6 · "DWELL == SCORE" — measured, and I would talk you out of it

| | |
|---|---|
| dwell spread across the satyr's realm, shipped proving ground | **0.15 s** (sd 0.073) |
| travel-time spread in the same garden | **5.37 s** |
| signal-to-confound | **74 : 1 against** |
| dwell spread in a hand-decorated glade | 2.92–4.67 s, sd 0.678 |
| today's existing random hold `2 + rng()*4` | sd **1.155** |

**Scores in a real garden are too flat for the dwell to be legible, and the
proposed dwell varies LESS than the random one already in the code.** The
mechanism would ship, be correct, and produce nothing a player could perceive —
the exact trap the back rim fell into this morning.

**What actually reads is the walk and the turn**, not the seconds. My
recommendation: keep `this.hold = 2 + this.rng() * 4` verbatim, and spend the
expressiveness budget on the head-shake and the facing instead. If you want dwell
to carry meaning, it needs a *wider* mapping than the raw score — but that is a
knob to tune against a picture, not a formula to derive.

## 7 · THE PURE ARGMAX IS A METRONOME

A deterministic argmax over a fixed set plus a deterministic clock converges to
an exact limit cycle. Measured on the shipped proving ground:

| species | period | wall time | repeats in 20 min |
|---|---|---|---|
| satyr | 8 picks | 72.2 s | 16.6× |
| pan | 8 picks | 71.9 s | 16.7× |
| naiad | 10 picks | 86.3 s | 13.9× |
| unicorn | 22 picks | 199.2 s | — |
| centaur | 24 picks | 214.5 s | — |

Two objects gives perfect ABAB, for ever. A player watching for two minutes sees
the identical eight-object loop twice.

The irony is exact: *"the chooser consumes zero random numbers"* was offered as a
determinism virtue, and it is precisely what buys the metronome. Today's
rejection sampler is immune because it is random.

**Fix: sample uniformly from a satisficing band** `{ p : desire ≥ max − ε }`
rather than taking the strict argmax. One draw per decision. It costs the
zero-RNG property, which was never worth having.

## 8 · WHAT THIS DOES TO THE STAIR PROPOSAL

`PROPOSAL-STAIR-CLIMBING` names a pathing change as a hard prerequisite: creatures
wander onto connectors with no reason to be there (391 of 607 crossings never
changed level; 4,973 idle sim steps on ramps). **Goal-based wandering retires the
destination half of that** — a connector is not a goal, so nothing aims at one.

**It does not retire the transit half**, and there is a trap: `connector` is not
the whole set. Measured — `level-bridge` (tags `timber path traffic archaic`, no
`connector` tag) scores **0.500 for the centaur** because `timber` is one of her
at-least tags, and she picked it 8 times in 400 garden-seconds. `stepping-stones`
0.231 satyr and pan; `rocky-ford` 0.583 pan. **Exclude crossings, not just
connectors** — `js/main.js:1070` already exports the set.

## 9 · FIVE MORE TRAPS, ALL MEASURED

1. **On terraced ground the design inverts into the thing it replaces.** Satyr
   home on a 2-level plateau, related objects below: **6 goal picks against 66
   random fallbacks — 92% of decisions** — after paying three whole-map BFS
   floods each to rediscover what was true last time. **198 wasted floods in 600
   garden-seconds.** Cache route refusal and drop unroutable candidates from the
   set, not from the top-3 loop.
2. **19 of 60 decisions route to the tile the creature is already standing on** —
   the whole "journey" is a half-second lean. Three in a row parks it on one tile
   for **15.1 s** against today's 5.99 s. Refuse a goal you are already at.
3. **Every route is a hard L.** `Zoning.route` is 4-connected BFS in a fixed
   neighbour order, so it emits all of one axis then all of the other. Today's
   2.5-tile wanders hide it; goal-based raises the mean journey to **5.77
   manhattan steps**, and in isometric that reads as walking down one diamond
   lane, stopping dead, and turning ninety degrees. Nobody costed this.
4. **`bestSpotFor` is a whole-map argmax** — 18–40 ms per creature, 5.1 µs per
   tile. It cannot run per decision for 12 movers. The cheap reads are
   `fields.at()` at **37 ns** and `resolve()` at **183 ns**.
5. **`fields.js` can say how strong a place is, never what made it strong.** The
   stamp is one-way, source → tiles; there is no tile → sources index for
   affinities. A creature that must *face a thing* needs the object list, not the
   field. This is why the design is two-tier whether or not anyone chooses it.

## 10 · THE SPINE

| # | commit | note |
|---|---|---|
| 1 | **per-facing idle** | ~12 lines, no art, no sim change. Better on its own. **Stop here for a day** |
| 2 | **exclude crossings + connectors from candidacy** | tiny, and it retires half the stair prerequisite |
| 3 | **the derived interest table + a catalogue census test** | data only, nothing consumes it yet |
| 4 | **D-weighted sampling inside today's `_wanderTarget`** | the cheap first version: visibly better, cannot be wrong, keeps the random hold |
| 5 | **the appraisal loop** — choose, walk, face, dwell, rescore | with the satisficing band, not a strict argmax |
| 6 | **the head-shake** | `refuse` pose in five layer functions |
| 7 | **staleness** | last, because §4 says it is the term that exposes a bad base |

## 11 · QUESTIONS FOR THE OWNER

1. **Do you still want dwell == score, knowing it measures 0.15 s of spread?**
   My recommendation is no — keep the existing random hold and spend the budget
   on the facing and the gesture. *(§6)*
2. **May the chooser consume a random number?** Breaking the metronome needs one
   draw per decision. *(§7)*
3. **Should context be allowed to lift a NEGATIVE object into positive** — is a
   satyr drawn to a fence smothered in vines? I lean yes; `at-most` only ever
   meant "won't settle near it", not "won't look at it".
4. **How often should a creature disapprove?** The damping on negative salience
   is the knob that decides whether the head-shake reads as character or as a tic.

## 12 · AND ONE THING FOUND IN PASSING

**`js/catalog.js` still authors five axes; three of them are retired and read by
nothing.** `wildness`, `order` and `moisture` are non-zero on 91, 113 and 52
entries respectively — **256 authored, range-validated values that `fields.js`
discards** (`fields.js:111 RETIRED_AXES`, and `add()` reads only `CONDITIONS`).
The import validator still *demands* all five. Either the axes come back or the
authoring goes; today every new placeable is asked for three numbers nobody will
ever read. Its own backlog line, not this arc's.

Also: `fields.js:230-235` claims a dual affinity "claims out to ~2.6 tiles". It
is **2.35**. And `contestMargin` is not monotone — it peaks at `top = √2` and
falls after, and `CONTEST_FLOOR` binds only above `top > 20`, which no buildable
garden reaches.

---

## Maker's mark

Thirteen agents over two workflows; twelve returned. **The most valuable single
output was not a design — it was an experiment on the owner's own sentence**, and
it came back negative: the staleness bonus *did* admit unrelated objects, 25% of
one creature's attention, in a garden the project already ships.

That result did not kill the idea. It relocated the fault, from the term everyone
was arguing about to the one nobody was: **a bonus can only ever amplify what the
base already admitted.** The owner's instinct — that the bonus needed a fence —
was right; the fence just belongs one term earlier than any of us put it.

Three things in this document contradict what I said earlier in the session, and
all three were corrected by measurement rather than by argument: the lateral
drift does not walk creatures off ramps; the pop is not the worst defect; and
dwell-proportional-to-score, which I called workable at 1–5 seconds from the tag
weights alone, produces **0.15 s of spread** once real gardens and real travel
times are in the picture. The first estimate was arithmetic. The second was a
measurement. They disagreed, and the measurement wins.

*— Claude Opus 5, 2026-08-03*
