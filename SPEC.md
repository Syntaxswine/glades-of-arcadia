# ARCADIA — build contract

A cosy, low-stress isometric garden builder in late-1990s pixel art. You tend a
glade in Arcadia: place ground, water, plants, and sculpture, and wild things
come to live in it — satyrs, centaurs, naiads, unicorns.

**Visual target:** Impressions Games — *Caesar III* (1998), *Pharaoh* (1999),
and above all ***Zeus: Master of Olympus*** (2000). Warm, chunky, readable,
Mediterranean. Also *The Settlers II* (1996) for cosiness.

**The design thesis, in one line: satyrs want mess and unicorns want purity, so
one uniform garden cannot please everyone.** The player builds a landscape of
distinct *regions* with different characters. That is the whole depth of the
game and it costs the player nothing in stress.

Full research is in `docs/RESEARCH.md` — pixel-art craft, sourced myth lore, and
cosy-builder design. **Read it before authoring art or creature requirements.**

---

## 0. Cosy guarantees — non-negotiable, these define the genre

- **No fail state. No timers. No combat. No economy, no currency, no grind.**
- **Nothing is ever taken from you.** Placement is free. Removal is free and
  instant. Nothing decays. Nothing dies.
- **No score.** There is no rating number anywhere in the UI. The player is
  never given a figure that implies judgement of their garden.
- Settled creatures **never leave because of an edit**. Wreck their habitat and
  they become *restless* and relocate themselves to the best remaining spot.
  A journal entry, once filled, is **never un-filled**.
- Autosave to localStorage, continuously. Never lose a garden.
- The player may always undo. Keep a bounded undo stack (64 steps).
- `prefers-reduced-motion` is honoured: creatures still move between tiles, but
  idle animation and camera easing stop.

## 1. Hard constraints

- **One external asset, and exactly one.** No image files, no spritesheets, no
  fonts, no CDN. Every pixel is authored here as text. The single exception,
  added by `docs/AUDIO.md`, is the owner's composed score
  `audio/glades-of-arcadia.mp3` — a 5.1 MB mp3 that `js/audio.js` fetches and
  decodes. Nothing else may be added to that list; `tools/build.mjs` names the
  permitted file and still fails the build on any other module that reaches for
  the network.
- **No dependencies.** Node built-ins only, and only in `tools/` and `test/`.
- ES modules, no build step to run. `tools/build.mjs` emits **one HTML file plus
  one mp3** — the module graph, the stylesheet and the entry point are inlined
  as before, and the track is *copied beside* the page rather than base64'd into
  it. Inlining would turn 5.1 MB of audio into ~7 MB of text that the browser
  must parse before it can run a line of a 1.4 MB game, to avoid one request;
  copied, the page loads as fast as it ever did and Pages streams the audio
  separately, which is what a media file wants anyway. A missing mp3 is a note,
  not a build failure — see §9.
- Pure, DOM-free modules (`palette`, `iso`, `catalog`, `fields`, `world`,
  `creatures`, `art/format`, `art/grow`) so Node tests can import them.

## 2. Geometry and the screen

| | |
|---|---|
| Tile | **64 × 32** px — exact 2:1, clean 2-across/1-down diamond edges |
| Map | **20 × 20** tiles (screen extent 1280 × 640) |
| Logical canvas | **640 × 400**, integer-scaled to fit the window (1×, 2×, 3×) |
| Camera | pans by drag, arrow keys, and edge-scroll; clamped to map bounds |

**Projection** (W=64, H=32), with camera origin `(ox, oy)`:

```js
sx = (tx - ty) * (W / 2) - ox        // 32
sy = (tx + ty) * (H / 2) - oy        // 16
// inverse — floor for the tile index
tx = ((sx + ox) / (W/2) + (sy + oy) / (H/2)) / 2
ty = ((sy + oy) / (H/2) - (sx + ox) / (W/2)) / 2
```

**Integer scaling is law.** `imageSmoothingEnabled = false`, the backing canvas
is exactly `640 × 400`, and CSS upscales by a whole number only. A fractional
scale is the loudest possible tell that this is not period art.

**Sprite anchoring.** Every sprite declares `anchor: [x, y]` — the pixel that
sits on the tile's centre point. Never derive it; trees lean and statues have
plinths.

**Depth sort.** Terrain layer draws first, whole. Then objects sorted by
`depth = max over footprint of (tx + ty)`, tiebreak `tx`, then stable insertion
index. Movers use fractional tile positions in the same key so they never pop.
**Non-rectangular footprints are forbidden** — they create genuine occlusion
cycles that a scalar key cannot resolve.

## 3. Palette — `js/palette.js`

Authoring is against **ramps**, not loose colours. This is what makes the whole
game look like one artist drew it. Ramps run **dark → light**. Shadows shift
cool, highlights shift warm.

```js
export const RAMPS = {
  canopy:    { keys: 'abcde', hex: ['#1E2A1C','#2F4526','#47632F','#6B8A3E','#9DB255'] },
  olive:     { keys: 'fghi',  hex: ['#2A2E1B','#45492A','#62663A','#8A8B52'] },
  cypress:   { keys: 'jkl',   hex: ['#16221E','#26382E','#3C5342'] },
  grass:     { keys: 'mnop',  hex: ['#3B4A22','#55672D','#74863C','#96A551'] },
  earth:     { keys: 'qrstu', hex: ['#3A2A1C','#57402A','#7A5C3C','#9E7D52','#C0A176'] },
  rock:      { keys: 'vwxy',  hex: ['#2C2823','#474138','#675E50','#8A7F6D'] },
  marble:    { keys: 'ABCDE', hex: ['#6B6154','#93887A','#BAAF9E','#DDD2BE','#F2EADA'] },
  water:     { keys: 'FGHIJK',hex: ['#123A46','#1B5560','#27757C','#3E9A98','#6FC0B4','#A8DCCB'] },
  sky:       { keys: 'LMN',   hex: ['#7FA8C4','#A2C4D8','#C6DCE7'] },
  terracotta:{ keys: 'PQRS',  hex: ['#4A2118','#7A3624','#A85238','#D08252'] },
  gold:      { keys: 'TUVW',  hex: ['#5A3D12','#8C6420','#C08F2E','#E9C158'] },
};
export const ACCENT = {
  '1': '#8E1F2A', '2': '#C8414A', '3': '#E88F9E',   // blossom
  '4': '#A46EBE',                                    // iris
  '5': '#E6C64A',                                    // bloom
  '6': '#2A2620',                                    // universal shadow mixer
  '7': '#F2EADA',                                    // unicorn white / moonflower
};
```

**The load-bearing relationship:** `grass` mid `#74863C` is **lighter** than
`canopy` mid `#47632F`. Trees must read dark against the ground. Do not
"improve" this.

**Light comes from the upper left**, high and slightly in front. On a 2:1 cube:
top face = ramp index 4, left face = index 3, right face = index 1–2. One ramp
step top→left, one to two steps left→right. Consistency is law.

**Contact shadow:** a 1–2 px skirt in the *ground ramp darkened two steps*
hugging the object's base diamond, plus an optional half-diamond offset 2–4 px
away from the light. **Never translucent black** — it greys the whole scene and
is the single clearest modern tell.

**Dithering:** checkerboard between adjacent ramp values, used only on areas
≥ ~24 px across — water, sky, large stone faces, terrain transitions. Never on
foliage clumps or anything under ~16 px of shaded area; it reads as noise.

## 4. The art system — hand-authored *and* procedural

Hand-authoring every leaf of a 64×80 tree as text is neither affordable nor how
period artists worked. Split it:

**(a) Hand-authored sprites** — `defineSprite` in `js/art/format.js` (already
written; read it). Use for everything that needs precision: ground tiles,
sculpture, urns, columns, altars, benches, walls, grotto stonework, props, and
**creature frames**.

**(b) Procedural composers** — `js/art/grow.js`. Use for foliage: trees,
shrubs, flower patches, reeds, ivy, vines. A composer takes a **seed** and
shape parameters and stamps hand-authored **clump** sprites (`js/art/clumps.js`,
~12–20 px each) into a pixel buffer, then applies the shading pass.

This is not a shortcut — it is the period technique. Research §6: period trees
are *clumped masses*, never individual leaves, with a dark core, rim-light on
the upper-left of each clump, and silhouette first. Composing from clumps
reproduces exactly that, and gives every planted tree its own seed so no two
oaks in the garden are identical. That variety is worth more than any single
hand-drawn tree.

**Failure modes to avoid, named in the research:** the "broccoli" tree (uniform
round blobs on a stick) and the "green blob" (no internal value structure).
Cure: irregular silhouette, 3–4 distinct clump masses at different heights,
a genuinely dark core, and rim-light on only the upper-left of each mass.

**Water animates by palette cycling** — the period trick. Rotate the `water`
ramp keys `F..K` on a timer and re-rasterise only water tiles. Do not animate
by redrawing shapes.

**Growth:** every plant has stages (`sprout → young → mature`), which are
separate composer parameters from the same seed, so a tree visibly *grows into*
itself rather than being swapped for a different tree.

## 5. Placeables — `js/catalog.js`

```js
{
  id: 'plane-tree',
  name: 'Plane tree',
  group: 'trees',            // ground|water|plants|trees|sculpture|structure
  footprint: [1, 1],
  art: { kind: 'grow', composer: 'broadleaf', params: {...} },
  //   or { kind: 'sprite', sprite: 'urn' }
  deposits: { moisture: +2, maturity: +1, wildness: +1, order: 0, seclusion: +1 },
  tags: ['tree', 'broadleaf', 'water-loving', 'shade'],
  unlockedBy: null,          // or a creature id
  blurb: 'Wide shade over still water. The nymphs favour it.',
}
```

`deposits` are the axis weights this object contributes to the field (§6).
`tags` are what creature *count* requirements match against.

Roughly **45–60 placeables**, weighted toward plants. Every one gets a real
`blurb` — one or two sentences, warm, informative, no lore-dump.

## 6. Habitat fields — `js/fields.js`

**Five axes:** `wildness`, `order`, `seclusion`, `moisture`, `maturity`.

`order` is **not** the inverse of `wildness` — a tended flower meadow is high
order *and* high wildness is low; a ruin is high wildness and low order; bare
swept gravel is low wildness and high order. They are independent.

Each placed object deposits its `deposits` weights into a per-axis scalar
field with **gaussian falloff, σ ≈ 2.5 tiles**. Fields recompute incrementally
on edit — never rebuild the whole map per frame.

`maturity` additionally accrues with elapsed garden time near mature plants,
which is why a glade left alone quietly improves. This is a cosiness feature:
the game rewards you for coming back without demanding it.

**The field overlay is the single highest-value legibility feature in the
game.** A toggle (`Tab`) washes the map in soft colour per axis. It is what
teaches the player that they are shaping a landscape rather than filling zoo
pens. Make it beautiful — soft, translucent, period-appropriate, and readable
over the terrain.

## 7. Creatures — `js/creatures.js`

Five: **satyr**, **centaur**, **naiad**, **unicorn**, and a hidden fifth,
**Pan**, who comes only when the other four have settled and the glade is deeply
mature. Pan is the capstone surprise; he is never listed in the journal until
sighted, and never hinted at in the UI.

**The ladder — four rungs:**

| rung | what the player sees |
|---|---|
| `sighted` | a trace only: hoofprints, a bent reed, a sound at dusk, a silhouette at the map edge |
| `visits` | walks in at dusk, wanders the region, leaves — **rendered desaturated** |
| `settles` | permanent, gains full colour and a name, journal entry fills |
| `thrives` | a second individual, or a variant |

**Steal Viva Piñata's central trick:** the creature **arrives before it is
earned**, desaturated, and wanders out again. That preview converts an unmet
requirement from a debt into an invitation. It is the game's whole hint system.

**Requirements per rung** — four types:
- an **axis band** (soft-edged min/ideal — satisficing, not a threshold)
- a **count** of a tag within a radius (`3 × water-loving within 4 tiles`)
- a **presence** requirement (another species settled nearby)
- exactly one **behavioural** requirement on the `settles` rung — something the
  player *watches happen* (it drinks; it rolls in the leaf litter; it dances).
  This is what makes settling feel earned rather than computed.

**Showing proximity without a number** — two channels, and this rule is firm:
- **Diegetic**, in the world: 3–4 escalating tells mapped to score bands.
- **Diagnostic**, on the creature card: **exact ticks for counts** ("2 of 3 ash
  trees" — they are discrete, exactness costs nothing), **qualitative words for
  axes** ("wilder still", "almost quiet enough").
- **Never sum requirements into one number. Never show a percentage.**

**Habitat design, grounded in `docs/RESEARCH.md` §B — use the sourced lore:**

- **Satyr** — un-tended hill country. Wild vine (the *Cyclops* diagnostic: no
  vine, no satyrs), ivy, umbrella pine (the thyrsos finial), cave mouth,
  unbasined spring, no straight paths. High wildness, **low order**. Actively
  repelled by tilled rows, walls and straight edges.
- **Centaur** — Thessalian slope. Ash grove (the Pelian spear), open run,
  cave, physic bed of centaury, uncut standing timber, **no enclosure**. Wants
  openness; walls and fences repel.
- **Naiad** — one particular water. A visible spring-head (not a pipe), grotto
  with basin and votive niche, plane tree and black poplar, willows and reeds,
  level greensward for noon dancing. High moisture, high seclusion.
- **Unicorn** — the medieval tradition, not the Greek one. Purity, quiet, deep
  seclusion, a still pool, white flowers and millefleurs planting. High
  seclusion, high order, **low wildness** — the direct opposite of the satyr.
- **Pan** — all four settled, high maturity, and a syrinx left somewhere.

**The tension is the point.** Satyr and unicorn requirements must be genuinely
incompatible in one place, so the player is pushed to build two regions with
different characters. Verify this in the playtest (§10).

## 8. UI — `js/ui.js`

Late-90s chunky **beveled panel** chrome — the Impressions look. A bottom or
side toolbar of grouped icon buttons, 2px light bevel top-left and dark bevel
bottom-right on raised elements, inverted when pressed. Small bitmap-ish type
(system monospace at an integer size, never scaled fractionally).

- Category tabs → placeable palette → hover shows name + blurb.
- Ghost preview of the placeable under the cursor, snapped to the tile, tinted
  green where legal and red where not.
- Right-click or a bulldoze tool removes. `Esc` cancels.
- **The journal**: one card per creature, filled as they are met. Shows the
  diagnostic requirements per §7. Unmet creatures show a silhouette and the
  tells you have seen so far — never the full requirement list before `sighted`.
- Field overlay toggle (`Tab`), cycling axes.
- Number keys select categories. Everything reachable by keyboard.

## 9. Audio — `js/audio.js`

**Superseded in full by `docs/AUDIO.md`. Read that before touching audio.** The
summary below is the contract; the addendum is the reasoning and the numbers.

Two layers, and the split is the design. **The track** is the owner's composed
`audio/glades-of-arcadia.mp3` — fixed, in a key, and therefore incapable of
reacting to anything. **The ambient layer** is procedural and is kept precisely
because it *can* react. The procedural **music** — the lyre figure and the pad
this section used to specify — is **retired**: a generated mode underneath a
composed track in another key is not a layer, it is a fight.

**The trigger.** Music does not start at boot and does not start on the first
gesture. It starts **the first time a satyr walks onto the map** — satyrs are
the musicians of the myth, so the glade is quiet until the creature who *brings*
music arrives with it. Autoplay policy forbids starting audio from a game event,
so it is two steps: `prime()` on the first user gesture resumes the context and
fetches and decodes the track **without playing it**, and `unlockMusic()` on the
satyr's arrival fades it in over ~4 s. Arrival means the **`visits`** rung, not
only `settles`. `musicUnlocked` is persisted in the save, so a garden reloaded
with a satyr already living in it starts normally rather than waiting for a
"first" arrival that already happened.

**Playback.** Gain **0.3** beneath the master ceiling — which both pulls the
track's 1.0067 peak back under full scale and puts it under the game. The loop
is a **crossfade**: the next pass begins **12 s** before the end and rises over
4 s. Twelve, not the five the addendum first guessed, because measurement said
so — the track's fade-out is only 2.5 s long but its *intro* is ~20 dB down for
the first ten seconds, so a short lead loops into a fifteen-decibel hole. See
the note beside `MUSIC_LEAD` in `js/audio.js` for the numbers.

**What the ambient layer still does** — everything a fixed track cannot:
birdsong whose rate follows the `moisture` and `maturity` of the region on
screen; water, louder and brighter near a waterfall; wind; the satyr's faint
off-key pipes as his approach tells fire; and the settle cadence, still the only
sound in the game allowed to draw attention to itself — now with a **~3 dB duck**
on the music beneath it so the cue reads.

**API.** `start()` (from a user gesture), `prime(url)`, `unlockMusic()`,
`setMusicUnlocked(b)`, `stop()`, `setMood({...})`, `cue(name, opts)`,
`setMuted(b)`, and the live bindings `muted`, `ready`, `musicUnlocked`,
`musicState`. Never throws; safe no-op with no AudioContext; everything ramps;
master ceiling **0.18** through a compressor (the mp3 runs parallel to the
compressor and under the same master, so mute governs it and the plucks cannot
pump it). **A missing or failed mp3 degrades to the ambient layer, never to a
broken game.** Mute persists.

## 10. Verification

`tools/spritelab.html` — a page that renders **every** sprite and composer
output at 1×/4×/8× on a neutral ground with a grid and the anchor marked. This
is how art gets reviewed. It must also run `lintSprite` over the whole
catalogue and list every fault.

**Artists: you can see your own work.** `tools/serve.mjs` + `tools/snap.mjs`
let a page rasterise itself to a PNG on disk, and the Read tool renders PNGs.
Render your sprite, read it back, look at it, fix it, repeat. Do not author
pixel art blind — it does not work.

`tools/playtest.mjs` must:
- assert every creature's `settles` requirements are **satisfiable** — construct
  a garden that meets them and verify the ladder actually fires,
- assert satyr and unicorn requirements are **mutually unsatisfiable within one
  σ-radius**, which is the design thesis,
- assert every placeable is reachable through the unlock graph from an empty
  garden (no orphan content),
- report axis-field statistics for a few reference gardens,
- exit non-zero on a structural fault only.

`test/*.test.mjs` under `node --test`: projection round-trips for every tile,
depth-sort correctness including multi-tile footprints, field deposit/decay
maths, sprite format validation (ragged rows rejected, unknown keys rejected,
anchor bounds), catalogue integrity (unique ids, every tag used by some
requirement, every `unlockedBy` refers to a real creature), save/load round-trip.
