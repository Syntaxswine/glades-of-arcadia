# TITLE AND CONTROLS — the front door, and getting about once you are through it

*Addendum. **Supersedes SPEC §1's asset rule and SPEC §8's key bindings.***

---

## The asset rule, relaxed a second time

SPEC §1 said **zero** external assets. `docs/AUDIO.md` relaxed that to **one**
(the composed score). This relaxes it to **two**:

| | |
|---|---|
| `audio/glades-of-arcadia.mp3` | the score. The owner's, made with Suno, non-commercial. |
| `TitleScreen.png` | the title backdrop. The owner's. |

**The game world is still one hundred per cent authored pixels.** Both
exceptions are things the owner made and handed over, both sit outside the
simulation, and neither is loaded by anything that draws a tile. No spritesheet,
no font, no CDN, no icon set — that part of §1 is intact and should stay intact.

The wordmark on the title screen is **ours**, drawn as pixel art from the same
eleven ramps as everything else (`js/art/title.js`). That was deliberate: the
first thing on screen should be made the same way as everything after it.

---

## The front door

Loading the page with no `?play=1` shows the title screen and **does not boot the
game at all** — no world, no autosave, no simulation, no renderer.

```
/                     the title screen
?play=1               straight into the game
?new=1&play=1         what New Game navigates to
?glade=1              plant the old opening glade instead of a blank map
?garden=all           THE PROVING GROUND — see below
?seed=thicket         a different map, reproducibly, in its own save slot
```

### `?garden=all` — the proving ground

A cheat code, and a test fixture you can walk about in: four quadrants of the big
map, one per species, all of them welcome at once. `?play=1&new=1&garden=all`.

**It is derived from the ladder, not authored.** The obvious way to write this is
to hand-place sixty things from the lore. That garden is right on the day it is
written and quietly wrong for ever after — the requirements get tuned, the
fixture stops satisfying them, and the failure reads as a bug in the simulation
rather than as a stale test map. So `plantProvingGround` walks each creature's
rungs up to `settles` and, for every `at-least n <tag> within r`, plants n
carriers of that tag inside r of that species' corner, choosing the carrier that
argues hardest for it (`catalog.byAffinity`).

**What it promises:** every counted demand met, no counted refusal broken.
**What it does not:** that anybody settles. Bands are field maths, a patch needs
grass to spread over real time, and a beat has to be performed.

`test/proving-ground.test.mjs` asserts the promise, so a ladder edit this fixture
can no longer satisfy fails the suite.

> **The cap trap, recorded because it shipped once.** The first version tracked
> only `at-most 0` as a list of forbidden tags and dropped every cap with a
> number on it. The centaur's six ash trees (an `at-least`) all landed inside her
> `at-most 4 tree within 3` — and that cap IS her open run to gallop on, so the
> fixture built the one garden she refuses. A cap of four is the same *kind* of
> statement as a cap of zero. The fix pushes the surplus out past the cap's
> radius, which satisfies the at-least and the at-most together, which is what
> the two requirements were always describing between them.
>
> **And `world.countTag` cannot see painted ground.** A ground painter writes the
> tile's type and leaves no object behind, so it is invisible to
> `world.objects`. fields.js keeps a synthetic placement so the ladder can still
> count it; the world cannot. A first pass measured the fixture with
> `world.countTag`, concluded the naiad was short a greensward, and was wrong —
> the instrument was blind, not the garden. Measure zoning with `fields`.

### The wipe is a NAVIGATION, and that is the whole point

New Game does not tear the world down and build another in place. It sets
`?new=1&play=1` and lets the page boot from scratch.

A fresh document cannot inherit stale module state, a half-torn-down renderer, a
leftover interval, or a cached save — because there is nothing there to inherit
from. It costs a second and it is the only version of "start over" that cannot be
subtly wrong.

> **Why this screen exists at all.** The game autosaves continuously and restores
> on load, which is right for a cosy builder — your garden is never lost — but it
> means a reload is not a reset. Combined with the caching below, "I reloaded and
> nothing changed" had two independent causes and no cure the player could reach.
> This is the cure they can reach.

The old save is copied to `<key>.previous` before the wipe. *Nothing is ever
taken from you* is a guarantee, not a slogan, and it survives New Game.

### The map you arrive on

**60 × 60 of plain neutral meadow, with nothing on it.** Three times the original
in both directions, nine times the ground.

This is a deliberate departure from RESEARCH C§2 ("an empty canvas too early is
an anti-pattern") and C§5 ("the first creature should arrive from an action you
would take on turn one anyway"). The owner asked for a clean map. **The opening
glade is kept, not deleted** — `?glade=1` still plants it, the docs images were
shot in it, and it is the fastest way to watch a satyr arrive. If the blank map
ever reads as homework, that research is the argument for putting it back and the
code is right there to do it with.

### Growing the map again

`MAP_W` / `MAP_H` live in **`js/iso.js` and nowhere else.**

They used to be declared in `main.js` as well, and *iso.js's pair were dead* —
used only as default parameters inside iso.js — so the obvious declaration was
the one that did nothing.

**Measure `_rescan` before you grow it again.** The settling scan visits every
tile for every creature. It was O(n²) until `fields.grassCounts()` was memoised,
and at 60×60 that is the difference between 1205 ms and 58 ms per scan against a
16 ms frame. 58 ms is still ~3½ dropped frames every 1.5 garden-seconds; the next
step is staggering the scan round-robin across creatures. See the backlog.

The terrain cache is one canvas the size of the whole map in screen space:
**3840 × 2016, about 29.5 MB** at this size. It builds in 11 ms and is only
rebuilt when terrain or zoning changes, but it is the thing that will hurt first
if the map grows again.

---

## The keyboard

**`W A S D` and the arrow keys both pan the camera.** They used to disagree —
arrows panned, WASD nudged a tile cursor — which is the one thing a player will
never guess and never forgive on a map sixty tiles square.

**Hold `Shift`** with any of them to move the **tile cursor** instead, and
`Enter` to place at it. The cursor could not simply be deleted (SPEC §8 wants the
whole game reachable from the keyboard) and giving it its own letters would have
cost four more out of an alphabet already carrying the categories.

### A letter picks a category; a number picks a thing inside it

The letter is **printed on every tab**, because a mnemonic nobody can see is not
a mnemonic.

| key | category | key | category |
|---|---|---|---|
| `G` | Ground | `T` | Trees |
| `L` | Land | `C` | Statuary |
| `Q` | Water | `H` | Building |
| `P` | Plants | `F` | Furniture |

**Water is `Q` and Statuary is `C` because `W` and `S` now pan.** Q is at least
the key next to the one it wanted. `B` was unavailable to Building because `B`
razes.

`1`–`9` select from the category you are in. They used to select the *category*,
which capped the keyboard at eight of the 130 placeables. Numbering counts only
what is on screen — a locked or hidden placeable has no chip, so `3` cannot mean
a different thing depending on what the player has discovered.

### `?` — the question mark

**Press `?`, or the `?` in the topbar, and the next thing you click is described
instead of changed.** Creature first, then the object on the tile, then the
ground; it never answers "nothing", because bare meadow gets a sentence too and
a player who asks a question and is told there is no answer stops asking.

Every builder of the period had one. It is the right shape for this game in
particular because **Arcadia never shows a number** (SPEC §7) and therefore has
nowhere else to put an answer. The text is the same text the info box and the
journal use — `affinityWords()` for an object, so "what does this attract" is
answered in the vocabulary the player is already learning, and one table each
for the five grasses and the ten ground types.

It is a TOOL, not a hover tip. A tooltip that follows the pointer around a
garden you are trying to look at is noise; a question you asked is not.

`input.js` dispatches it **before** every other branch, so a help cursor can
never plant, raze, terrace or pan. That ordering is the whole safety property.

### Everything else, unchanged

`R` cycles the terrain tools · `B` raze · `J` journal · `X` move · `?` ask ·
`Tab` field overlay ·
`Esc` cancel · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `+` / `-` raise and lower
the tile under the cursor · `Space` drag-pan · `Backspace` remove.

### The move tool — `X`, or the four-arrow mark left of the `?`

Pick it up and **the map answers your clicks instead of the garden**. Click to
centre on that spot; click and drag to shove the map about. Nothing you do with
it can plant, clear or terrace anything.

**Why it exists.** On a touch screen there is no keyboard and no middle mouse
button, so the only way to cross the map was a drag — and a drag is exactly the
gesture that also *places* things. A player holding a plant had no way to move at
all without putting it down first. That is not an inconvenience, it is a dead
end.

**It is the `?`'s sibling and is built the same way.** Both take the click away
from the garden; both keep whatever is selected; both suppress the ghost, because
a ghost hovering under a cursor that will not plant is a promise the click does
not keep. The pointer changes (`#app.is-moving`, `#app.is-asking`) — the only
feedback there is once the player's eyes have left the toolbar.

**It is the one tool that does NOT take your plant out of your hand.** Every
other tool clears the selection, because "what does a click do" must have one
answer. Move is the exception *on purpose*: crossing the map without putting your
plant down is the entire thing drag-to-pan could never offer.

**The icon is drawn per pixel, not lettered**, and specifically not a unicode
glyph — `✥` and its neighbours are not in Consolas, so the button would show a
tofu box on exactly the machines the icon matters most on. 9 × 9: odd so the
shaft has a true centre column, and one pixel inside the 10-logical-pixel bar
button, because the topbar is 14 tall in total and there is no room to grow the
button instead.

**A press that never travelled is a click, not a drag** — the threshold is the
same `DRAG_SLOP` (3 logical px) the rest of `input.js` uses, so a hand that
shakes three pixels on a touch screen reads as a tap rather than as a pan of
three pixels that then snaps nowhere.

> **What this replaced.** The first version was a held four-way d-pad in the
> bottom-left corner. It worked, and it was not the gesture anybody actually has
> in their hands — every builder of the period lets you grab the map itself. The
> owner asked for the tool instead, and the tool is better on its merits: it
> resolves the drag-conflict at the source rather than routing round it, and it
> costs one topbar button instead of a permanent 42 × 42 patch of meadow.
>
> Two traps died with the pad and are worth remembering if anything like it ever
> comes back: `.ui > *` turns pointer-events on for **every** direct child, so a
> transparent container swallows clicks on the garden through its empty corners;
> and a held button on a phone needs `touch-action: none` or the browser claims
> the press as a scroll, the `pointerup` never arrives, and **the pan runs away**.

### The minimap

Upper right of the view. `js/minimap.js`, 119 × 60 logical pixels, **one pixel
per tile**, always on.

**It is a diamond** because every isometric game of the era drew its minimap in
the same projection as its world — a square minimap of an isometric map forces
the player to mentally rotate 45° every time they glance at it. The shape on the
minimap is the shape on screen, turned the same way.

The projection is two lines:

```
px = (tx - ty) + (mapH - 1)        py = (tx + ty) >> 1
```

That halving looks lossy and is not: `tx - ty` and `tx + ty` always have the same
parity, so the tiles rounding onto a row interleave exactly with the ones
rounding onto it from the next diagonal. `test/minimap.test.mjs` holds it — no
collisions, no holes, and an exact round trip for all 3600 tiles.

| | |
|---|---|
| ground + zoning | cached, rebuilt only on a `ground`/`level`/`grass` event |
| objects | one pixel each, coloured by group |
| creatures | **blinking**, 900 ms, two thirds on |
| the camera | a plain square border |

**They blink** because a single static pixel among 3600 static pixels is not
findable. A blink is the one signal the eye picks out of a still field without
being told to look, and it costs one pixel — the period solution, and why
Caesar III flashes its walkers. The border is drawn UNDER them: a dot that
vanishes behind it every time it crosses is a dot the player will chase.

**The camera is a square** even though the view is a rotated rectangle in tile
space — because the minimap is drawn in the same projection as the screen, so
the rotation cancels and the bounding box of the projected corners is upright
and is what the player is actually looking at.

**Clicking it jumps there.** `ui.reserve()` registers the panel as chrome so a
click cannot fall through and plant a tree behind it, and `input.js` checks the
minimap *before* that test, since ui.js has by then already swallowed the click.

Two colours worth keeping: the surround is `rock[0]`, not the sky ramp
render.js uses off-map — a pale blue rectangle in the corner of a green map
shouts louder than the garden. The camera border is the palest thing in the
game and the creature dot is warm, so they never read as the same signal.

### The map in `ui.js`

`GROUP_KEY` is the single source for the letters, and `selectGroupByKey` /
`selectItemIndex` are the API. `input.js` owns no letter table of its own — it
asks. Adding a category means adding one entry, and the tab prints itself.

---

## The dev loop

**The preview server must send `no-store`.**

`tools/serve.mjs` always has. The preview in `.claude/launch.json` was
`python -m http.server`, which sends no cache headers at all, so the browser
cached ES modules against a heuristic and served them back for the rest of the
session. That cost **three false readings in one session** — including one where
a title screen was "verified" that was not running, and one where a fix was
declared working while the old code was on screen.

`launch.json` now points at the repo's own server.

On **GitHub Pages the same problem is real and not fully solved**: Pages serves
assets at `Cache-Control: max-age=600`, so for ten minutes after a deploy a
normal reload can serve stale modules. Two mitigations are in place and one is
not:

- ✅ `css/style.css?v=<build>` — a versioned URL, so styles cannot go stale.
- ✅ The **build stamp is printed on the title screen**, so "am I even running
  the new code?" has an answer visible on the page. It did not before.
- ❌ The **module graph is not versioned.** Busting the entry does not help,
  because a module's own relative imports resolve without the query. The real fix
  is a build step that stamps `?v=` through every relative specifier. It is in the
  backlog. Until then, **a hard reload after a deploy is the workaround** — and
  that is exactly the workaround the player should not need, which is why it is
  written down rather than forgotten.
