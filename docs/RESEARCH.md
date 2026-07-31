# Arcadia — research briefs

## A. Late-90s isometric pixel art craft

## 1. Tile geometry

**The real numbers.** Impressions' city-builder engine used a **58×30 px** isometric diamond for Caesar III, Pharaoh *and* Zeus — the same engine lineage — and Emperor: Rise of the Middle Kingdom later moved to **78×40**. This is documented in the reverse-engineered `.sg2/.555` format spec ([SG file format wiki](https://github.com/bvschaik/citybuilding-tools/wiki/SG-file-format)); community modding notes give the same 58×30 as "the minimal tile the engine operates on" ([Kushnirenko, *How to draw city in Caesar III*](https://www.linkedin.com/pulse/how-draws-city-caesar-iii-sergey-kushnirenko)).

Note 58/30 is **not** exactly 2:1 (1.933) — the extra row is edge/overlap slop. Since you're generating sprites in code, **do not copy 58×30**. Use **64×32** (or 32×16 for a smaller board): exact 2:1, power-of-two, and every diamond edge is a clean 2-across/1-down pixel run with no jaggy irregularity. Anno 1602 shipped three zoom sets (GFX/MGFX/SGFX) rather than scaling at runtime — the period answer to zoom was *separately authored art*, not interpolation.

**Projection maths** (W = tile width, H = tile height, W = 2H):

```
sx = (tx - ty) * (W/2)          // screen x
sy = (tx + ty) * (H/2)          // screen y
// inverse:
tx = ( sx/(W/2) + sy/(H/2) ) / 2
ty = ( sy/(H/2) - sx/(W/2) ) / 2   // floor() for the tile index
```

Add `originX, originY` for camera pan. With 64×32: `sx = (tx-ty)*32`, `sy = (tx+ty)*16`.

**Anchoring taller-than-one-tile objects.** Impressions stored isometric sprites as a diamond *base* (the footprint, one 1×1 diamond per tile, row-major for an N×N building) plus a compressed *top* section — "additional pixels that are not part of the base tile but stick out at the top." So the model is: the sprite hangs **upward and outward from its footprint**. In code, anchor at the **south (bottom) vertex of the footprint's front tile**:

```
drawX = sx + W/2 - spriteW/2      // horizontally centred on the diamond
drawY = sy + H     - spriteH      // sprite bottom sits on the front vertex
```

Give every sprite an explicit `(anchorX, anchorY)` offset in its definition rather than deriving it — trees lean, statues have plinths.

## 2. Depth sorting

Painter's algorithm, back-to-front, with key `depth = tx + ty`. The natural loop is `for ty: for tx:` over the map, which emits diagonal screen rows in correct order for free — draw the terrain layer entirely first, then objects.

**Failure cases.** The `x+y` key is only correct for 1×1 footprints. It breaks on:
- **Multi-tile objects.** A 3×1 wall and a 1×1 tree can each be "partly in front" of the other. There is no single scalar that orders them correctly.
- **L/T-shaped footprints** — one object can wrap another, producing a genuine occlusion *cycle*.
- **Movers between tiles** (a fractional-position citizen) — sorting by rounded tile index makes them pop in front of/behind a building as they cross the boundary.
- **Tall sprites** — a 3-tile-tall cypress on a back tile legitimately overlaps a foreground building's top pixels.

**The standard fixes**, in ascending cost:
1. **Sort by the front-most tile** of the footprint: `depth = max over footprint of (tx+ty)`, tiebreak on `tx` then a stable insertion index. Fixes most rectangular cases.
2. **Slice multi-tile objects into per-tile strips** at author time — exactly what Impressions did by storing one diamond per tile. Each strip sorts as a 1×1. This is the robust answer and it's cheap when you're generating sprites procedurally: render the object once to an offscreen canvas, then blit diamond-clipped columns.
3. **Topological sort** over explicit "A is behind B" pairs (compare footprint AABBs in tile space). Correct in general; the theory is the standard occlusion-DAG treatment of [painter's algorithm](https://en.wikipedia.org/wiki/Painter%27s_algorithm), and cycles must be broken by splitting.
4. Use **float positions** for movers: `depth = tx + ty` with fractional tx/ty, sorted every frame.

Practical recommendation: (1) + (2), and forbid non-rectangular footprints as a design rule.

## 3. Palette

VGA gave 256 simultaneous colours from an 18-bit (262,144) space. The warmth of these games isn't nostalgia — it's that the *whole* art set was designed against one shared palette, and Mediterranean subject matter pushed every ramp toward ochre/olive/ivory. Greens are **desaturated olive**, never #00FF00. Shadows hue-shift **cool** (blue/violet), highlights hue-shift **warm** (yellow/orange) — a 10–15° shift per step buys apparent depth for free.

Here are 11 ramps, 47 colours, shadow → highlight:

**Canopy green (main deciduous foliage)** — `#1E2A1C · #2F4526 · #47632F · #6B8A3E · #9DB255`
**Olive / dry Mediterranean** — `#2A2E1B · #45492A · #62663A · #8A8B52`
**Cypress / cool dark conifer** — `#16221E · #26382E · #3C5342`
**Grass / meadow floor** — `#3B4A22 · #55672D · #74863C · #96A551`
**Earth / path / trunk** — `#3A2A1C · #57402A · #7A5C3C · #9E7D52 · #C0A176`
**Rock / grey-warm stone** — `#2C2823 · #474138 · #675E50 · #8A7F6D`
**Marble / limestone (the Zeus signature)** — `#6B6154 · #93887A · #BAAF9E · #DDD2BE · #F2EADA`
**Water (6 — sized for cycling)** — `#123A46 · #1B5560 · #27757C · #3E9A98 · #6FC0B4 · #A8DCCB`
**Sky / haze** — `#7FA8C4 · #A2C4D8 · #C6DCE7`
**Terracotta roof** — `#4A2118 · #7A3624 · #A85238 · #D08252`
**Gold / bronze** — `#5A3D12 · #8C6420 · #C08F2E · #E9C158`

Accents, a handful of pixels each, outside the count: `#8E1F2A` `#C8414A` `#E88F9E` (blossom), `#A46EBE` (iris), `#E6C64A` (bloom). Universal shadow mixer: `#2A2620`.

Key relationship: **grass mid (#74863C) is lighter than canopy mid (#47632F)** — trees must read *dark* against the ground, which is how Zeus keeps a busy map legible.

## 4. Shading conventions

Pick **one** light direction and enforce it everywhere; inconsistency is the single loudest tell of amateur work. The pixel-art convention — and the safest choice here — is **upper-left, high, slightly in front**, giving short shadows (near-noon Mediterranean). *Caveat: I could not verify from sources which side Impressions actually lit; treat the direction as your choice, the consistency as law.*

For a 2:1 cube lit from upper-left, using ramp indices (0 = darkest):

- **Top face:** index 4 (highlight)
- **Left face:** index 3 (mid) — the face turned toward the light
- **Right face:** index 1–2 (shadow)

Contrast: roughly **one ramp step** top→left, **one to two steps** left→right. Total top-to-dark spread ~35–45% lightness. More than that reads as harsh/plastic; less and the cube flattens.

**Fake ambient occlusion.** These games had no real shadows. The tricks:
- A **1–2 px contact skirt** in the darkest ground colour hugging the object's base diamond — not black, the ground ramp's index 0.
- A soft **half-diamond drop shadow** offset 2–4 px toward the anti-light direction, drawn in the ground colour darkened *two ramp steps*, never a translucent black (translucent black desaturates and greys the whole scene — it's the modern tell).
- **Darken the terrain tile itself** under large buildings by one ramp step.
- Inside crevices (between foliage clumps, under eaves) drop *two* steps, not one.

## 5. Dithering

Two colours alternating on a checkerboard read as a third middle value from a distance. Period use:

- **Where it was used:** skies, water gradients, large stone/plaster faces, terrain-type transitions (grass→sand), smoke. Anywhere the region is ≥ ~24 px across.
- **Where it was avoided:** small sprites (< ~16 px of shaded area), foliage clumps, faces, anything animated at speed — the pattern reads as noise or crawls between frames.
- **Density ladder:** build a gradient in ~5 stages — solid A → sparse A-on-B (25%) → 50% checkerboard → sparse B-on-A (25%) → solid B. The 50% checkerboard belongs in the *middle* of the transition.
- **Bayer (ordered 4×4 or 8×8)** for large flat fields like sky; hand-placed 50% checker for small local blends. Larger matrix = finer effect.
- **Rule of thumb:** if the dither doesn't clearly improve the piece, cut it. Also use it to break **banding** — the 1-px-wide-everywhere shadow band that makes shading look like contour lines.

Because you're drawing to canvas in code, a 50% dither is just `if ((px + py) & 1)` — free, and exact.

## 6. Foliage and trees (the important one)

**Silhouette first.** Block the whole tree in one flat colour (canopy index 1) at final size and squint. If it isn't identifiable as *that species* in solid black, no amount of shading saves it. At 32–64 px you have room for **shape**, not leaves. Asymmetry is mandatory: a bilaterally symmetric canopy reads as clip-art.

**The cauliflower clump method.** Do not draw leaves. Build the canopy from **3–7 overlapping rounded masses**, each 8–20 px across, of *unequal size*, with a couple of clumps breaking the outline and one or two **sky holes** punched through so branches show. Trees have gaps that expose structure; a sealed outline is the "green blob."

Per clump, in order:
1. Fill with canopy index **2** (`#47632F`).
2. **Rim-light the upper-left arc** of each clump — a 2–3 px crescent of index **3** (`#6B8A3E`), and on the 1–2 clumps nearest the light a few pixels of index **4** (`#9DB255`). Never rim every clump equally.
3. **Shade the lower-right** of each clump with index **1** (`#2F4526`).
4. **Dark core:** the interior of the canopy where clumps overlap and near the trunk gets index **0** (`#1E2A1C`), in irregular wedges. This is what creates volume — a tree lit uniformly across its mass looks like moss.
5. **Occlusion between clumps:** where clump A overlaps clump B, put a 1–2 px index-0 line on B's side of the seam.

**Failure modes and their causes.**
- **"Broccoli"** = every clump identical size, evenly spaced, each rim-lit identically, canopy on a single stick trunk. Fix: vary clump radius by 2×, cluster clumps off-centre, let the trunk fork before it meets the canopy, and skip rim-lighting the clumps in shadow.
- **"Green blob"** = only 2 values, closed outline, no dark core. Fix: 4 values minimum in the canopy plus a 5th for the highlight, and punch holes.
- **Fuzzy edge** = single-pixel leaf noise round the silhouette. Period art kept the outline *chunky*; stray single pixels dissolve at 1× and shimmer when the camera pans. Use 2×2 minimum bumps on the outline.
- **Trunk:** use the earth ramp, not brown-grey; 2–3 px wide at this scale, lit-side one step brighter, and a 1 px index-0 line where it meets the ground plus a contact skirt.

**Species differentiation** at this size is silhouette + palette, not detail: cypress = narrow vertical flame, cypress ramp, almost no clumping; olive = wide low irregular canopy, olive ramp, visible gaps and a gnarled fork; pine = flat-topped umbrella with a bare trunk; poplar = tall narrow with canopy ramp.

For a glade, author **3–4 variants per species** and pick by a hash of tile coordinates — never a single sprite repeated, and never runtime mirroring alone (mirroring flips your light source, which is the classic consistency break; mirror only if you re-rim-light).

## 7. Water

**Palette cycling.** The period trick: pixels never move; the *palette entries they index* rotate. Mark Ferrari's analogy is theatre-marquee bulbs — the bulbs don't travel, they light in sequence. Cost: virtually zero memory, one palette write per frame. The IFF/LBM `CRNG` chunk stored which index ranges rotated and at what rate, so several regions could cycle at different speeds in one image ([Old School Color Cycling with HTML5](https://www.effectgames.com/effect/article-Old_School_Color_Cycling_with_HTML5.html); [Q&A with Mark J. Ferrari](https://www.effectgames.com/effect/article-Q_A_with_Mark_J_Ferrari.html)).

**Reproducing it on canvas.** Canvas has no palette, so build one:
1. Author your water tile as an **index buffer** (`Uint8Array`, one byte per pixel, values 0–5 into the water ramp).
2. Keep a `palette` array of 6 RGBA ints.
3. Each frame, rotate the *palette*: `pal = pal.slice(1).concat(pal[0])` (or advance a fractional offset for smoother motion).
4. Write into an `ImageData` via a `Uint32Array` view: `buf32[i] = pal[idx[i]]`, then `putImageData`.

The Effect Games implementation notes the key optimisation: at load time, record **only the pixel positions whose index is in a cycling range**, and rewrite only those each frame instead of the whole surface. For a 64×32 tile this is trivial; do it once into an offscreen canvas and blit that canvas to every water tile in the scene, so the whole sea animates at the cost of one tile.

Rates: **6–12 Hz** for a rippling shallow, 2–4 Hz for a still pool. Draw the ripple bands as **irregular horizontal-ish streaks following the diamond's long axis**, indices ascending toward the light side. Ferrari's "BlendShift" refinement — interpolating between palette states to fake in-between frames — maps directly to lerping your RGBA values by a fractional cycle offset, and is worth it here since you're not index-limited.

**Shoreline.** Don't dither the water/land boundary; author explicit **edge tiles**: 4 straight edges (NE/SE/SW/NW), 4 outer corners, 4 inner corners = 12 sprites, plus a plain water and plain land. Each edge tile carries a 2–3 px band of wet sand (earth index 2 darkened one step), a 1–2 px foam line in `#A8DCCB`, and it should participate in the cycling (foam brightening in and out) so the coast doesn't sit dead against a moving sea. Pick the tile with a 4-bit bitmask of the neighbours' land/water state — standard, and it makes hand-authoring exactly 12 sprites sufficient.

## 8. Animation

The verified structural fact: Caesar III/Pharaoh characters that rotate use **eight sprites per animation frame**, one per viewing angle. That's the budget driver — every frame you add costs 8×.

How they kept it cheap, and what to copy:
- **Trees and buildings mostly didn't animate at all.** Ambient motion was concentrated in a few "attractor" spots (a fountain, a workshop, a flag) so the eye finds life without the whole screen twitching.
- **Idle/ambient loops: 2–4 frames at 4–8 fps.** Two frames is genuinely enough — a bird that alternates two head positions reads as alive; a flag with 3 frames reads as windy. The illusion comes from *irregular timing*, not frame count: hold frame 1 for 500 ms, frame 2 for 180 ms.
- **Walk cycles: 6–8 frames per direction** is the practical floor for period feel; 12 is generous.
- **Desynchronise instances.** Give each tree/bird a random phase offset. Identical-phase copies are instantly readable as fake — the single cheapest fix in the whole document.
- **Sub-sprite animation.** Don't redraw the tree to make it sway; redraw only the top 2 clumps, or shift the whole canopy 1 px horizontally on a 4-frame irregular cycle. A 1 px offset at 3 fps *is* a breeze.
- **Palette cycling is animation too** — use it for shimmer, torchlight, and the water, at zero frame cost.

## 9. Anti-patterns

The list of things that make modern "retro" attempts read wrong:

1. **Non-integer scaling.** Anything other than 2×/3×/4× produces uneven pixel rows and a visibly irregular grid. On canvas: `ctx.imageSmoothingEnabled = false`, integer scale factors only, and snap all draw positions with `Math.round()` — sub-pixel sprite positions are the same crime in motion.
2. **Mixed pixel sizes.** A 64×32 tile world with UI or detail drawn at effective 1× while sprites are at 2× is the loudest tell. One pixel size per scene, including text.
3. **Smooth anti-aliasing.** Canvas `arc()`, `lineTo()`, gradients and `globalAlpha` all produce anti-aliased edges with dozens of intermediate colours. If you're generating sprites in code, **write per-pixel into an ImageData** and pick colours from your ramp — never let the 2D path rasteriser draw a sprite edge. Hand-placed AA (1–2 pixels at a hard curve, from the ramp) is period-correct; automatic AA is not.
4. **Too many colours.** Every colour on screen must come from the declared ramps. A generated sprite that lerps RGB produces hundreds of near-duplicates that read as mush. Assert this in code — a debug mode that flags any pixel not in the palette is worth writing.
5. **Modern flat-design palettes.** High-saturation, equal-value, no hue-shift, no dark core. Impressions' look is low-saturation, wide-value-range, warm-drifting.
6. **Inconsistent light source.** Especially from mirroring sprites for the opposite facing, and from copying reference art lit differently.
7. **Over-detail for the size.** Individual leaves at 32 px, window mullions on a 20 px house, five-value shading on a 6 px object. The period discipline: detail budget scales with the *area* you actually have, and readability at 1× beats fidelity at 4×.
8. **Pure black outlines and pure black shadows.** Use the darkest ramp value, tinted toward the object's hue.
9. **Uniform tiling.** One grass tile repeated is a tell; author 3–4 variants plus a few "decal" tiles and select by coordinate hash.

**Sources:** [SG file format (bvschaik/citybuilding-tools wiki)](https://github.com/bvschaik/citybuilding-tools/wiki/SG-file-format) · [How to draw city in Caesar III](https://www.linkedin.com/pulse/how-draws-city-caesar-iii-sergey-kushnirenko) · [Painter's algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Painter%27s_algorithm) · [Old School Color Cycling with HTML5](https://www.effectgames.com/effect/article-Old_School_Color_Cycling_with_HTML5.html) · [Q&A with Mark J. Ferrari](https://www.effectgames.com/effect/article-Q_A_with_Mark_J_Ferrari.html) · [Color cycling (Wikipedia)](https://en.wikipedia.org/wiki/Color_cycling) · [Spearite: Pixel Art Dithering guide](https://spearite.com/blog/pixel-art-dithering-guide) · [Pixnote dithering guide](https://pixnote.net/en/learn/dithering/) · [Envato Tuts+: isometric pixel art tree](https://design.tutsplus.com/tutorials/how-to-create-an-isometric-pixel-art-tree-in-adobe-photoshop--cms-23606) · [Lospec tree tutorials](https://lospec.com/pixel-art-tutorials/tags/trees) · [Color theory for pixel art — ramps & hue shifting](https://www.pixel-editor.com/articles/color-theory-for-pixel-art) · [anno-1602-reader](https://github.com/Danjb1/anno-1602-reader) · [The Settlers II (ModdingWiki)](https://moddingwiki.shikadi.net/wiki/The_Settlers_II) · [Pixel Studio: Common Mistakes](https://pixelstudio.fandom.com/wiki/Common_Mistakes) · [Divoom: scaling pixel art](https://divoom.com/blogs/setup-ideas/scale-pixel-art-without-blur)

**Two caveats on things I could not verify:** the exact light direction Impressions used (I recommend upper-left as a convention, not as a reconstruction), and per-direction walk-cycle frame counts (only the 8-direction structure is sourced).

---

## B. Mythological habitat lore

# What Actually Draws Them: Sourced Landscape Brief

## 1. Satyrs / silenoi — the un-tended hill

Satyrs are not forest generalists; they belong to *uncultivated* country and to Dionysos. Hesiod (Catalogue of Women fr. 10a, preserved in Strabo 10.3.19) gives them their charter in a single phrase: from Hekateros' daughters sprang "the mountain-ranging Nymphs, goddesses, and the breed of Satyrs, worthless and unfit for work, and the Kouretes, sportive gods, dancers." Kin to mountain-nymphs and to dancers; constitutionally opposed to labour. The [Homeric] *Hymn to Aphrodite* 262–63 puts the silenoi and Hermes mating with the nymphs "in the depths of pleasant caves," and the *Hymn to Pan* (19) maps the terrain they share with Pan: wooded glens, snowy crests, close thickets, soft streams, towering crags, "woody coombes thickly wreathed with ivy and laurel."

Euripides' *Cyclops* is the best evidence for what *repels* them, because it is a satyr play about deprivation. Odysseus asks whether the land grows corn, whether they grow vines and make wine (c. 113–124); the answer is no — the Cyclopes are cave-dwelling shepherds with no city, no walls, no viticulture. The chorus laments (c. 63–80) that there is no Bromios here, no cymbals, no reeling dance, no mountain-maidens' feet by the sacred fountains. A satyr's hell is a landscape with pasture and stock-work but no vine, no music, no nymphs. Their attributes follow: the thyrsos (fennel/ivy-wrapped staff tipped with a **pine cone**), ivy crowns, wineskin and krater, aulos and syrinx.

**Placeable (satyr):**
1. **Untrellised wild vine** climbing a tree or rock — the *Cyclops* diagnostic: no vine, no satyrs.
2. **Ivy** as ground cover and rock-drape — Dionysiac wreath and thyrsos wrapping.
3. **Umbrella/stone pine** — the pine cone finial of the thyrsos.
4. **Cave mouth in a hillside** — *Hymn to Aphrodite* 262–63, where silenoi meet nymphs.
5. **Unbasined spring / plunge in the rock** — "soft streams" of *Hymn to Pan*; the *Cyclops* "sacred fountains" where maenads dance.
6. **Rough unfenced hill-pasture with no straight path** — Hesiod's "unfit for work."
7. **Aulos-and-syrinx stand / instrument prop** — their standing iconography.
8. **Krater or wineskin left out, herm, mask-on-a-pole idol** — vase-standard Dionysiac furniture. *(The mask-idol is well attested on "Lenaia vases"; treat the specific prop as iconographic inference.)*
9. **Fig tree** — *inference*: strongly Dionysiac/phallic in Greek practice, but I did not find a satyr-specific ancient text for it. Flag it as flavour, not lore.
*Repelled by:* tilled rows, walls, straight edges, herding chores, any landscape whose point is work.

## 2. Centaurs — Thessalian slope, and the wine that ruins it

Homer already has centaurs as *pheres oreskooi*, mountain-dwelling beasts. The geography is Thessaly: Mount Pelion, densely forested, herb-rich, source of the ash for Achilles' spear — *Iliad* 16.140–44, "the Pelian spear of ash, that Cheiron had given to his dear father from the peak of Pelion." Pelion also supplied the Argo's timber. Chiron, the civilised outlier, lives in a cave there and is the archetype of the herbalist: **centaury** (*Centaurium*, formerly genus *Chironia*) is named for him, and Pliny counts it among the panaceas ascribed to Chiron; Dioscorides describes its preparation.

The wild herd is defined by wine, twice. Apollodorus 2.5.4: **Pholus** — an Arcadian centaur on **Mount Pholoe** (between Arcadia and Elis, *not* Pelion; a common web error) — opens the communal jar Dionysos left with the centaurs, and the herd, maddened by the *smell*, attacks Heracles. *Odyssey* 21.295–304: wine "made foolish even the centaur, glorious Eurytion" in Peirithous' hall — the origin of the war between centaurs and men. Wine is a centaur attractor and a centaur detonator.

**Placeable (centaur):**
1. **Ash grove (*Fraxinus*)** — the Pelian spear; the mountain's signature timber.
2. **Steep wooded slope opening onto a clear run/glade** — Homer's mountain-ranging beasts; *the open run is inference* (the sources say mountains and forest, not racetracks).
3. **Cave in the hillside** — Chiron's and Pholus' dwellings are both caves.
4. **Physic bed: centaury and mountain herbs** — Chiron's pharmacology, via Pliny/Dioscorides.
5. **Uncut standing timber** — Pelion as the Argo's timber-store.
6. **Half-buried pithos of wine** — Pholus' jar; place it and the *wild* herd comes, hostile.
7. **Lyre / teaching bench at the cave mouth** — Chiron as tutor of Achilles, Jason, Asklepios (the furniture is inference; the tutelage is sourced).
8. **Rocky torrent or ford** — *inference* from Pelion's terrain, not from a text.
9. **No gates, no enclosure** — Homeric "mountain-dwelling," pre-civic.

## 3. Water nymphs — get the taxonomy right

**Naiads** are freshwater only, and subdivided by water-body: *pegaiai* (springs), *krenaiai* (fountains/wells), *potameides* (rivers), *limnades* (lakes), *heleionomoi* (marsh). **Nereids** are daughters of Nereus, salt-water Mediterranean; **Oceanids** are Okeanos' daughters, the world-river/outer-ocean class. **Dryads** are trees, and **hamadryads** are the strict case: [Homeric] *Hymn to Aphrodite* 5.264–72 — pines and high-topped oaks spring up with them, on holy ground "never cut with axes," and when the fate of death is near, the tree withers, the bark shrivels, the twigs fall, "and at last the life of the nymph and of the tree leave the light of the sun together."

Attachment is to a *particular* water, and it is defensible: Callimachus, *Hymn to Demeter* 6.37–41, has a sky-high **poplar** in Demeter's grove "nearby which the nymphs were wont to sport at noontide"; Erysichthon's axe strikes it and it "cried a woeful cry." **Flag:** the equivalent "spring dries, naiad dies" is *inference by analogy* with the hamadryad — I could not source an ancient text stating it directly. Cult was real and physical: nymph sanctuaries (*nymphaea*) were watery caves and grottoes, and the Corycian Cave above Delphi yielded thousands of votives — terracotta figurines, *aryballoi*, knucklebones. Offerings were modest: milk, honey, oil, wine, wreaths.

**Placeable (naiad):**
1. **Visible spring-head** (not a pipe) — the *pegaiai/krenaiai* distinction is the whole point.
2. **Grotto with stone basin and a votive niche** — the archaeological nymphaeum.
3. **Plane tree** over the water; **black poplar** — Callimachus' poplar and standard Greek water-tree planting.
4. **Willows and reed-beds** at the margin.
5. **Votive shelf** — figurines, small vessels, knucklebones (Corycian Cave assemblage).
6. **Libation altar** for milk/honey; **flower wreaths**.
7. **Level greensward beside the water for noon dancing** — Callimachus, nymphs at noontide.
8. **"Axe-forbidden" grove marker** — *Hymn to Aphrodite*'s uncut holy trees; Erysichthon as the negative exemplum.
9. **Narcissus and watercress at the pool lip** — *flag*: narcissus is Ovidian/Roman and about a *boy* at a pool, not naiad cult; watercress is my inference. Pretty, weakly sourced.
*Repelled by:* the axe, and by piping the water away.

## 4. Unicorn — a different lineage entirely

Be honest in the game: the unicorn is not Greek cult, it is a chain of texts. **Ctesias**, *Indica* (via Photios): Indian wild asses, white-bodied, dark-red-headed, blue-eyed, with a cubit-long forehead horn — white at the base, black in the middle, flaming red at the tip — and cups made from it protect against convulsions, epilepsy and poison. **Aristotle** notes the one-horned Indian ass and the oryx. **Pliny**, *NH* 8.31, gives the *monoceros*: horse's body, stag's head, elephant's feet, boar's tail, one black three-foot horn, deep bellow — "it is impossible to capture this animal alive." Then the 2nd-c. **Physiologus** and its medieval descendants supply the two scenes everyone actually pictures: the maiden left seated alone in the wood, the unicorn laying its head in her lap and being taken; and the alicorn dipped into water a serpent has poisoned, cleansing it so the other animals may drink.

The tapestries make that plantable. In the Cloisters *Hunt of the Unicorn*, "The Unicorn Purifies Water" sets the beast at a white fountain feeding a stream, and the surrounding flora are **medieval antidote herbs — sage, pot marigold, orange** — placed exactly where the poison is. The whole series carries 101 plant species, 85 positively identified. *The Unicorn Rests in a Garden* gives a **pomegranate** tree (fertility/marriage), plus **madonna lily, wild orchid, bistort, English bluebell, thistle, violet, daisy, iris, strawberry, daffodil**, inside a low round palisade fence. The Cluny *Lady and the Unicorn* specimen trees are identified as **oak (*Quercus robur*), holly (*Ilex aquifolium*), sour orange (*Citrus aurantium*), stone pine (*Pinus pinea*)**, over a millefleurs ground of lily of the valley, carnation, marigold, pansy, violet, bluebell, daisy.

**Placeable (unicorn):**
1. **Clear stone fountain with an outflow stream** — the purification scene's centrepiece.
2. **Antidote bed at the water: sage, pot marigold** — the Met's own reading of the planting.
3. **Sour orange in simultaneous flower and fruit** — in both tapestry sets.
4. **Pomegranate tree** — *Unicorn Rests in a Garden*.
5. **Madonna lily, wild orchid, bistort, bluebell, thistle, violet, strawberry** — named tapestry species.
6. **Oak, holly, stone pine** as specimen trees — Cluny identifications.
7. **Millefleurs turf** — dense, low, mixed, no bare soil.
8. **Low round palisade fence / hortus conclusus** — the enclosure of the final tapestry.
9. **A seated maiden (statue or figure) in a quiet clearing** — the Physiologus lure.
10. **Silence: no kennels, no horns, no hunting furniture** — Pliny's uncapturable beast; the Hunt tapestries are what *ends* the unicorn.

## Where they conflict

**Satyr vs. unicorn** is genuinely opposed in the sources, not invented. The satyr's landscape is the *un-worked* one — Hesiod's "unfit for work," the *Cyclops*' un-walled, un-tilled, uncivic hill. The unicorn's landscape as the tradition actually delivers it is a **made** one: a fenced *hortus conclusus*, a masonry fountain, an ordered millefleurs bed, imported citrus. Second axis: the Physiologus unicorn is caught by a **virgin**, and its horn's whole function is neutralising poison and corruption; the satyr is antiquity's standing figure of sexual licence, and his defining fluid is wine — the classic *maddening* draught. Put a krater in the enclosed garden and you have written the conflict from primary sources: the vessel that draws satyrs is the thing the alicorn exists to purify.

**Wine is a shared attractor with a fuse.** A pithos pulls satyrs (joy) and centaurs (both) — but the two canonical centaur-wine passages are atrocities: Pholus' jar brings the maddened herd down on Heracles (Apollodorus 2.5.4), and Eurytion's drunkenness in Peirithous' hall starts the centaur-Lapith war (*Odyssey* 21.295–304). Wine should be the mechanic that converts *Chiron*-type centaurs into *Pelion-herd* centaurs.

**Axe vs. run.** Nymphs require the grove uncut — the hamadryad dies with her tree, and Erysichthon's axe on the nymphs' poplar is the paradigm crime. Centaurs come with Pelion's felled ash and shipbuilding timber, and want unobstructed slope. Clearing for centaurs costs you dryads directly.

**Satyr vs. nymph** is intimacy *and* flight. They cohabit — silenoi and nymphs in cave depths (*Hymn to Aphrodite* 262–63) — and the satyr's own lament names "mountain-maidens' feet by sacred fountains" as what he misses. But the standard vase scene is *pursuit*, and the nymph's cult requirements (quiet grotto, uncut grove, votive order, undisturbed water) are exactly what a satyr encampment degrades. Cohabiting cave + spring should be a high-value, unstable tile.

**Unicorn vs. nymph** is the subtle one: both want clean, quiet water. But the nymph's spring is a *visited* spring — figurines, knucklebones, libations, human traffic — while the unicorn wants seclusion and, per Pliny, cannot be held at all. Votive density is a naiad plus and a unicorn minus.

Sources: [Theoi — Satyroi](https://www.theoi.com/Georgikos/Satyroi.html) · [Homeric Hymn 19 to Pan (Perseus)](https://www.perseus.tufts.edu/hopper/text?doc=Perseus:text:1999.01.0138:hymn%3D19) · [Euripides, *Cyclops* (Way, Wikisource)](https://en.wikisource.org/wiki/Euripides_(Way_1929)_v2/Cyclops) · [Hesiod, Catalogue fr. 10a (Theoi)](https://www.theoi.com/Text/HesiodCatalogues.html) · [Homeric Hymn 5 to Aphrodite (Perseus)](https://www.perseus.tufts.edu/hopper/text?doc=HH+5) · [Theoi — Chiron](https://www.theoi.com/Georgikos/KentaurosKheiron.html) · [Theoi — Pholus](https://www.theoi.com/Georgikos/KentaurosPholos.html) · [Apollodorus 2.5 (Perseus)](https://www.perseus.tufts.edu/hopper/text?doc=Apollod.+2.5&fromdoc=Perseus:text:1999.01.0022) · [Odyssey 21 (Perseus)](https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0136%3Abook%3D21%3Acard%3D256) · [Iliad 16 (Theoi)](https://www.theoi.com/Text/HomerIliad16.html) · [Mount Pelion flora & myth](https://www.pelionculture.gr/en/ancient-greek-myths-about-pelion/) · [Centaury / Chiron (A Modern Herbal)](https://www.botanical.com/botanical/mgmh/c/centau46.html) · [Theoi — Nymphai](https://www.theoi.com/Nymphe/Nymphai.html) · [Callimachus, Hymn 6 to Demeter (Theoi)](https://www.theoi.com/Text/CallimachusHymns2.html) · [National Archaeological Museum on Hymn 6.41](https://www.namuseum.gr/en/monthly_artefact/an-ecological-message-of-a-greek-goddess-from-the-3rd-c-b-c/) · [Nymphaeum forms in the Greek landscape](https://archaeotravel.eu/nymphaeum-and-its-forms-in-ancient-greek-landscape/) · [Ctesias, *Indica* (Wikipedia)](https://en.wikipedia.org/wiki/Indica_(Ctesias)) · [Theoi — Hippoi Monokerata (Ctesias, Aristotle, Pliny, Aelian)](https://www.theoi.com/Thaumasios/HippoiMonokerata.html) · [Monoceros / Pliny NH 8.31](https://en.wikipedia.org/wiki/Monoceros_(legendary_creature)) · [*Physiologus* (Britannica)](https://www.britannica.com/topic/Physiologus-Greek-scientific-text) · [Met — The Unicorn Purifies Water](https://www.metmuseum.org/art/collection/search/467638) · [Met — The Unicorn Rests in a Garden](https://www.metmuseum.org/art/collection/search/467642) · [Janick & Whipkey, *Fruits and Nuts of the Unicorn Tapestries* (Purdue, PDF)](https://www.hort.purdue.edu/newcrop/pdfs/unicorn-tapestry-plants.pdf) · [Cluny *Lady and the Unicorn* plants](https://thegardenhistory.blog/2023/09/09/the-unicorn-in-the-garden/)

---

## C. Cosy builder design

## 1. The attraction mechanic (Viva Piñata)

The ladder is **appear → visit → resident → romance**, and each rung has its own requirement set. Concrete shape, from the actual tables:

- *Buzzlegum*: appear = 2 buttercups; visit = 4 buttercups; resident = 6 buttercups; romance = eat 2 fruit.
- *Bunnycomb*: appear/visit = a carrot in the garden; resident = eat 3 carrots **and** 4% grass coverage; romance = 6% grass plus flowers.
- *Arocknid*: appear = gardener level 6; visit = 4 Taffly **residents**; resident = eat 2 Tafflies; romance = eat 2 Buzzlegum.
- *Swanana*: visit = 20% water + garden value 20,000; resident = 25% water + eat a sandwich.

Requirement **types**: object counts, percentage-of-area coverage (grass, water — these compete for the same finite ground, which is the game's real zoning tension), global value/level gates, *another species being resident*, a worn accessory, and — the key one — **behavioural requirements**: "eat 3 carrots", "eat 2 Tafflies". Residency is not granted by a layout, it is granted by *watching something happen*.

Three things make this not a checklist, and I'd steal all three:

**(a) The creature arrives before you've earned it.** A wild piñata wanders in monochrome, wanders out. That black-and-white visitor *is* the hint delivery system — the world tells you what's possible by showing you the thing you can't keep yet. It converts an unmet requirement from a debt into a preview.

**(b) Requirements chain into an ecology.** Arocknid needs Tafflies present, then eats them. Your garden acquires second-order consequences: a species you planted for becomes food. The garden runs on its own between your edits, which is why VP survives idle time better than any tile-placer.

**(c) Requirements are stated plainly, but only for creatures you've met.** The Journal encyclopedia populates on first encounter and then lists appear/visit/reside/romance verbatim. **Hide the creature, never the requirement.** Opaque requirements aren't discovery, they're a wiki tax — and VP's late tier (garden value 60,000, wear a crown) is exactly where it becomes one.

## 2. What makes a builder cosy — and what supplies the pull

The hygiene levers are known and cheap: no fail state, no timer, no combat, full-refund removal, autosave, soft audio, and an economy that meters *breadth* (what you're allowed to place) rather than *quantity*. Get those wrong and nothing else matters; get them right and you've earned exactly zero minutes of play.

The actual drive, ranked by how much work it does:

1. **Collection with visible holes.** Animal Crossing's museum is the strongest engine in the genre because the empty plinth reads as a promise, not a debt. An encyclopedia of silhouettes is worth more than any score.
2. **Per-placement feedback that agrees with beauty.** Dorfromantik's masterstroke: a perfect tile (all six edges matched) is both the higher score and the prettier landscape. Scoring and aesthetics point the same way. If your attraction score ever rewards an ugly arrangement, you have a design bug, not a difficulty curve.
3. **Gentle surprise.** Something arrives you didn't schedule. VP's wild visitors; Stardew's random events.
4. **Growth over real time.** Cloud Gardens' creep of vegetation, Tiny Glade's ivy and weathering — the world repays waiting, which makes stopping feel safe.
5. **Combination discovery.** The cheapest content you will ever author.
6. **Authorship amplification.** Tiny Glade and Summerhouse abandon scoring entirely and win on "the tool makes what I place look better than I could have." Budget real engineering for auto-detailing; it substitutes for a lot of mechanics.

## 3. Anti-patterns

- **The judging number.** Animal Crossing's island rating is the cautionary tale: a 5-star target flattens idiosyncratic islands into furniture-density optimisation. Planet Zoo's welfare percentage is honest for a management sim (low welfare → sickness, death, protesters) but it produces *guilt*, which is anti-cosy. Never display a global score of the player's whole map against an ideal.
- **Bolted-on grind.** Currency or timers gating placement destroys flow state. Removal must always be free and instant.
- **Empty canvas too early.** Dorfromantik and Terra Nil both grow the play space incrementally. Start the map small and *expand it as a reward*.
- **The tyranny of the optimal.** The fix is not removing optimisation; it's making the optimum non-unique. Two devices: (i) **satisficing thresholds** — once a creature's bands are met, more does nothing; (ii) score creatures against a *bag of neighbours*, never an exact pattern. Any adjacency bonus that resolves to a single best tiling will be solved and then dutifully rebuilt by every player, forever.

## 4. Conflicting preferences: yes, build it

This is the best idea in your brief, because it converts a single optimisation problem into a **partition problem** — and partitioning is where authorship lives. VP already contains a weak version (grass% vs water% compete for finite ground). Terra Nil's biome-diversity phase and Planet Zoo's biome-specific habitats are the explicit precedents.

Failure modes and their fixes:

- **Four boxes.** Cause: player-drawn region boundaries plus a binary purity metric. Fix: **the player never declares a region.** Score by a continuous local field; let regions be an *emergent readout* that the game recognises and names after the fact ("the wild edge", "the still hollow"). Naming what the player accidentally made is enormously satisfying and nearly free.
- **Zoo pens.** Fix: make the transitions valuable. Author one or two **ecotone creatures** that want *moderate* wildness AND *moderate* quiet — a liminal species does more for organic-looking landscapes than any amount of art.
- **Whack-a-mole.** If satyr-stuff actively poisons unicorn-stuff at long range, the player plays defence. Keep influence radii short (~5 tiles) with distance falloff, so separation is cheap to achieve but must be thought about.
- **One-slider collapse.** If "wild" and "pure" are literally the same axis inverted, your map becomes a single gradient. Use 4–6 axes; each creature reads only 2–3. Design pairs that **conflict on one axis and agree on another** — satyr and unicorn both love old growth, and disagree only on order. That yields interesting neighbours rather than pure repulsion.

## 5. Onboarding

No tutorial wall. The first creature should arrive from an action you'd take on turn one anyway (plant the one plant you're given, twice). Then *that creature* teaches the ladder: it's standing there, monochrome, with one plain-language line about what would make it stay. Undiscovered creatures appear as silhouettes with exactly one revealed axis-hint ("prefers somewhere wilder than this"). Use the same handful of words in creature requirements and in tile tooltips so the vocabulary is learned once. The visiting-but-not-staying rung is your entire tutorial system — spend your design effort there.

## 6. The model I'd implement

**Local, not global.** Maintain one blurred scalar field per axis over the map (each placed object deposits axis weight; gaussian falloff, σ ≈ 2–3 tiles, evaluation radius ~5). This is cheap, recomputes incrementally, and — critically — can be **rendered as a soft colour wash overlay**. That overlay is your single highest-value legibility feature and the main thing preventing zoo pens.

**Axes (5):** Wildness, Order (paths/geometry/tending — *not* simply inverse Wildness), Seclusion (absence of traffic and open sightlines), Moisture, Maturity (accrues with real time: moss, big trees, weathering).

**Requirements per creature, per rung** — four types, mirroring VP: an axis **band** (soft-edged min/ideal, satisficing), a **count** of a named feature within radius, a **presence** requirement (another settled species nearby), and for the settling rung exactly one **behavioural** requirement you watch happen (it drinks, it rolls in the leaf litter, it dances). The behavioural beat is what makes settling feel earned rather than computed.

**Ladder (4 rungs):** Sighted (a track, a sound at night, a silhouette at the map edge) → Visits (walks in at dusk, leaves) → Settles (permanent, gains colour and a name) → Thrives (a second individual, or a variant).

**Permanence: yes, with a soft floor.** Settled creatures never vanish because of an edit. Wreck the habitat and the creature becomes *restless* — visibly so, and it will relocate itself to the best remaining spot on your map. Only after a long grace period, and an explicit in-world warning, does it leave — and its encyclopedia entry stays filled forever. Never un-fill a collection slot.

**Showing proximity without a percentage.** Two channels. **Diegetic**, in the world: 3–4 discrete escalating tells (hoofprints → a bent reed → a sound at dusk → a glimpse at the treeline) mapped to score bands, so the number is never rendered. **Diagnostic**, on the creature card: countable requirements shown as exact ticks ("2 of 3 elder trees" — they're discrete, exactness costs nothing), continuous axes shown as a needle against a band with a qualitative gap word ("wilder still", "almost quiet enough"). The rule: **exact for counts, qualitative for fields.** And never sum them into one number.

Sources: [Viva Piñata requirement tables (speedrun.com)](https://www.speedrun.com/viva_pinata/guides/tmd2e), [Viva Piñata Journal/Encyclopedia](https://vivapinata.fandom.com/wiki/Journal), [Planet Zoo animal welfare](https://planetzoo.fandom.com/wiki/Animal_Information_Panel), [Dorfromantik scoring/aesthetics alignment](https://www.switchbladegaming.com/cozy-games/dorfromantik-guide/), [Designing for Coziness](https://www.gamedeveloper.com/design/designing-for-coziness).
