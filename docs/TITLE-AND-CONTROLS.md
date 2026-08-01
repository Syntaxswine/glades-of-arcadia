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
?seed=thicket         a different map, reproducibly, in its own save slot
```

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

### Everything else, unchanged

`R` cycles the terrain tools · `B` raze · `J` journal · `Tab` field overlay ·
`Esc` cancel · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo · `+` / `-` raise and lower
the tile under the cursor · `Space` drag-pan · `Backspace` remove.

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
