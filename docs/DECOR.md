# Addendum: the decoration set

Companion to `ZONING.md`. Defines the **affinity-bearing** placeables — the
vocabulary the player uses to say "this ground is his".

Creature numbering, fixed: **1 = satyr · 2 = centaur · 3 = naiad · 4 = unicorn.**

| class | count | each | total |
|---|---|---|---|
| single-affinity | 4 species × 3 | 1 affinity | **12** |
| dual-affinity | 6 pairs × 2 | 2 affinities | **12** |
| triple-affinity | 4 triples × 1 | 3 affinities | **4** |
| nullifiers | — | blocks influence | **5** |
| | | | **33** |

Ground tiles, water, and non-affinity scenery are *not* in this count and still
exist. This set is only the affinity vocabulary.

## Weights — breadth costs strength

| class | deposit per affinity |
|---|---|
| single | **1.0** |
| dual | **0.7** each |
| triple | **0.5** each |

Singles are how you *commit* ground; pairs and triples serve borders and
junctions. Without this gradient a triple would be strictly more efficient than
a single and the optimal garden would be nothing but triples — the "tyranny of
the optimal layout" the cosy research warns about.

## Nullifiers are OCCLUDERS, not negative deposits

A nullifier does not emit negative influence — that would dig a dead crater
around it. It **blocks propagation**: influence radiates from each object and
decays with distance, but cannot pass *through* a null tile.

This changes `fields.js` from a gaussian convolution to a **flood fill with
distance decay that respects occluders** (a BFS from each source, or a single
multi-source pass per affinity). On a 20×20 grid this is cheap.

Consequences, all good:
- The **shape** of a planting matters, not only the count.
- Conflicting species can sit one tile apart with a hedge between them, which
  is the whole point of the request.
- Hedges and walls become genuinely tactical, and they are things players want
  to build anyway.
- Null tiles render as neutral `meadow` beneath and leave a thin meadow band
  either side — a real garden's mown border. Free legibility.

## The 12 singles

**1 · Satyr** — un-tended, Dionysiac
- **Wild vine**, untrellised, climbing a rock. *The* Cyclops diagnostic: no vine, no satyrs.
- **Ivy-draped boulder.** Thyrsos-wrapping and wreath plant.
- **Satyr mask on a pole.** The Lenaia-vase idol.

**2 · Centaur** — Thessalian slope
- **Ash tree.** The Pelian spear; Pelion's signature timber.
- **Physic bed of centaury.** Named for Chiron; Pliny counts it among his panaceas.
- **Uncut standing timber / fallen log.** Pelion as the Argo's timber-store.

**3 · Naiad** — one particular fresh water
- **Spring-head with stone basin.** The *krenaiai* distinction.
- **Reed bed.**
- **Votive shelf.** Figurines, small vessels, knucklebones — the Corycian Cave assemblage.

**4 · Unicorn** — the medieval tradition, not the Greek one
- **White lily bed.** Millefleurs planting from the tapestries.
- **Still pool**, small and mirror-flat.
- **White-blossom thorn.** Hawthorn/blackthorn, tapestry flora.

## The 12 pairs

**1,2 Satyr + Centaur** — the wine link
- **Half-buried pithos of wine.** Apollodorus 2.5.4: *literally* the object that binds them — Pholus opens the jar Dionysos left with the centaurs.
- **Umbrella pine.** Thyrsos finial for one, mountain timber for the other.

**1,3 Satyr + Naiad** — the sourced pairing
- **Cave mouth.** [Homeric] *Hymn to Aphrodite* 262–63 puts silenoi and nymphs together "in the depths of pleasant caves". This pair is in the text.
- **Unbasined spring**, a plunge in bare rock.

**1,4 Satyr + Unicorn** — the hard pair, and deliberately so
- **Blackthorn thicket in white flower.** Wild *and* white — the only register where mess and purity agree.
- **Mossy fallen trunk.** Old, quiet, untended.

**2,3 Centaur + Naiad**
- **Rocky ford.** Where the run meets the water.
- **Plane tree.** Standard Greek water-planting, and shade over open ground.

**2,4 Centaur + Unicorn** — both equine
- **Apple tree.**
- **Flowering meadow run.** Open ground, deep in flowers.

**3,4 Naiad + Unicorn** — both want water pure
- **Lily pool.** The alicorn legend is exactly this: the unicorn dips its horn to purify the water.
- **Willow over water.**

## The 4 triples

- **1,2,3 — Altar to Pan and the Nymphs.** "To Pan and the Nymphs" is an attested joint dedication formula. The three wild Greek ones; the unicorn is not Greek and is not invited.
- **1,2,4 — Ancient oak.** Big, old, wild; the tapestry unicorn rests under trees. No water, so no naiad.
- **1,3,4 — Fern grotto.** Damp, secret, still.
- **2,3,4 — Clear watering place.** The civil three. No satyr: it is too tended for him.

Triples are **junction pieces** — their value is at a three-way border, where
one tile does partial work for three zones. Placed alone in open ground they
produce a wide contested patch, because they tie three ways. That ambiguity is
a feature: lay a triple, then decide later who claims it by adding singles.

## The 5 nullifiers

- **Herm.** Historically *exactly* this — herms were boundary markers at property
  edges and crossroads in Attica. A boundary stone that breaks influence chains
  is not a metaphor, it is the object's actual job.
- **Drystone wall.** Low, rubble, hard edge.
- **Clipped hedge.** Dense, formal, soft edge.
- **Cypress screen.** A tall row; the most Mediterranean way to divide ground.
- **Gravel walk.** A *walkable* interrupter. The best teaching object in the set,
  because players lay paths for their own reasons and discover the mechanic by
  accident.

## Open: the 4-way

`1,2,3,4` is the one subset not requested, and there is a good reason to hold
it back — a tile boosting all four equally ties four ways and is permanently
contested, which reads as "does nothing".

Unless it is **Pan's**. He is the hidden fifth, gated on all four settling. One
object sacred to every denizen at once — a syrinx hung on a pine, say — that is
useless as zoning and *is* the key to the capstone, is a better joke and a
better secret than anything else in this list. Proposed, not built.

---

# Part II: the decor layer

Everything above is *affinity-bearing* — it argues about whose ground this is.
This part is the **furniture**: things you place because they look right.

**A cosy builder needs objects that do nothing mechanically.** If every
placement carries a zoning consequence, placing becomes anxious and the player
starts optimising instead of decorating. This layer is the antidote to the
"tyranny of the optimal layout".

## The register split — architecture IS the order axis

Two visual registers, and the difference between them is load-bearing:

| register | look | zoning effect |
|---|---|---|
| **Archaic / wild** | rough-hewn, asymmetric, weathered, un-tended | leans satyr; repels unicorn |
| **Neoclassical / tended** | fluted, symmetrical, clipped, dressed stone | leans unicorn; repels satyr |

So the player reads a region's character off its **architecture**, not off a
meter. A colonnade and a clipped hedge say "this is a formal garden" without a
single number. This is a free reinforcement of the core tension and it costs no
new mechanic — a light `order` lean on the neoclassical pieces is enough.

It is also thematically continuous with the project's origin: the photograph
that started all of this was a plaster cast in red bole and verdigris — a
neoclassical cast-collection object.

## Cost key

`[P]` procedural — a new parameter set for an existing composer, nearly free.
`[H]` hand-authored sprite.
`[V]` palette variant of an existing sprite — free.
`[?]` **NEEDS-DESIGN** — ship a placeholder, revisit.

## Garden furniture — neutral

- `[H]` Stone bench, plain
- `[H]` Exedra — the curved semicircular bench. The most neoclassical object in any garden.
- `[V]` Marble bench (exedra variant, marble ramp)
- `[H]` Amphora, terracotta
- `[H]` Amphora on plinth
- `[H]` Krater, wide-bowled
- `[H]` Fluted urn with lid — neoclassical
- `[H]` Sundial on pedestal
- `[H]` Birdbath / shallow basin
- `[H]` Cache-pot with topiary
- `[?]` Garden seat under an arbour — needs a read on how seat + overhead structure sort in iso

## Pillars and architecture

- `[H]` Doric column
- `[V]` Ionic column — Doric shaft, new capital
- `[V]` Corinthian column — acanthus capital
- `[H]` Broken column — the romantic ruin
- `[H]` Colonnade section, 3 tiles
- `[H]` Balustrade — low railing *(also a weak nullifier)*
- `[H]` Pergola / trellis arch
- `[H]` Ruined arch
- `[H]` Tholos — small round temple folly. The centrepiece object of the set.
- `[H]` Obelisk
- `[?]` Terrace steps — needs a design pass on elevation, which the engine does not currently have. **Flat placeholder for now.**

## Hedges — nullifiers, two heights

- `[H]` **Low clipped hedge** (box). Blocks influence but is visually see-over.
- `[H]` **Tall hedge** (yew). Full block, full visual screen.
- `[H]` **Hedge arch** — a hedge with a doorway. Blocks influence *except* through
  the gap, so a gateway leaks. The most interesting piece in the set: it lets a
  player deliberately connect two zones through a controlled opening.
- `[P]` Topiary cone
- `[P]` Topiary sphere

## Fountains — water, tended

- `[H]` Tiered neoclassical fountain
- `[H]` Wall fountain with mascaron spout
- `[H]` Simple jet basin
- `[H]` Shell fountain
- `[H]` **Rill** — a narrow straight water channel. Formal-garden signature, and
  it tiles into runs, so it doubles as a linear water feature.

All fountains carry water, so they lean naiad; being *dressed and symmetrical*
they also lean unicorn. Two of the four species, from one object, honestly.

## Trees — mostly procedural

`[P]` cypress · olive · black poplar · oak · umbrella pine · bay laurel ·
myrtle · almond in blossom · pomegranate · fig · plane · willow

## Flowers and bushes — procedural

`[P]` rose · lavender · rosemary · **acanthus** (the Corinthian plant — plant it
at the foot of a Corinthian column and the joke lands) · iris bed · poppies ·
crocus · oleander · box · fern clump · wildflower tuft · asphodel

## Ground and paths

- `[H]` Gravel walk *(nullifier — see Part I)*
- `[H]` Flagstone
- `[H]` Stepping stones
- `[H]` Mosaic panel
- `[?]` Terrace paving with an edge — depends on the elevation question above

## Scope note

Roughly 60 entries here on top of the 33 affinity items. Most of the plants are
`[P]` and effectively free; the cost sits in the hard-surface `[H]` pieces,
which share a small vocabulary (fluting, plinths, dressed blocks, mouldings) and
should be authored as a family so they read as one garden.

Ship the `[?]` items as placeholders with a `needsDesign: true` flag in the
catalogue. Balance passes come after there is something to look at.
