# HANDOFF — MOBILE MODE

**2026-08-03.** Written by the builder who shipped it, for whoever picks it up.

The owner's instruction, in full, because every decision below is downstream of
one of its three clauses:

> *"create a new game option on the title screen specifically designed to play
> this game on mobile. some menus will have to be redesigned, and the movement
> button will be much more important for playing the game."*

**Why this is its own document rather than a §10 in
`HANDOFF-THE-IMAGE-PACK-2026-08-02.md`:** that one is 968 lines across two days
of the fidelity arc, and the note at the end of it says a third day is the point
to split. This is a different subject entirely — chrome and geometry, not art —
and joining them would make both harder to read. The image-pack handoff is
unchanged.

---

## 1 · What was already true, and what it saved

**The single hardest part of this job was done a day early and by somebody
else.** BACKLOG §4i, 2026-08-01, found that the logical screen was declared
**four times** — `iso.VIEW_W/H`, `ui.LOGICAL_W/H`, `input.LOGICAL_W/H` and a
private pair in `main.js` — all agreeing on 640 × 400, and made `js/iso.js` the
single owner with `ui.LAYOUT` derived from `TOPBAR_H` / `PANEL_H`.

That entry closed with: *"The remaining job is no longer 'make it a variable' —
it is 'pick a second size'."* It was right. Because of that work, the whole
foundation of this mode is a table:

```js
export const MODES = Object.freeze({
  desktop: Object.freeze({ id: 'desktop', w: 640, h: 400, topbar: 14, panel: 100 }),
  mobile:  Object.freeze({ id: 'mobile',  w: 360, h: 640, topbar: 22, panel: 140 }),
});
```

Everything else — `render.BACKING_W`, `input.LOGICAL_W`, `ui.LAYOUT`, the map
rectangle, the minimap's corner — followed without being touched. **Name that
work if you write about this one.** A day of de-duplication that produced no
visible change is what made a second screen size a table instead of a rewrite.

---

## 2 · The shape of the mode

| | desktop | mobile |
|---|---|---|
| logical screen | 640 × 400 | **360 × 640** (9:16) |
| topbar | 14 | **22** |
| panel | 100 | **140** |
| **map rectangle** | 286 | **478** |
| tools live in | the topbar | **a cluster at the top of the panel** |
| palette columns | 6 | 5 |
| info line | beside the grid | under it |
| tabs | all 8 fit | scroll, selected kept in view |

**The width is chosen by exactly one constraint.** `pickScale` floors, so the
logical width must be at most the narrowest phone we mean to serve, or the canvas
hangs off the edge at scale 1. 400 was the first guess and it is **wrong by ten
pixels on an iPhone 12/13/14**. 360 is the floor of the modern Android field and
clears the SE's 375 as well. `test/seams.test.mjs` now checks the mobile width
against six real device widths, so the next person to feel like rounding it up
gets told which phone they broke.

**The map rectangle is the payoff and it is guarded.** A phone shows 478 rows of
garden where a monitor shows 286. There is a test — *"the phone shows MORE garden
than the monitor, not less"* — that fails if a future edit grows the panel until
that stops being true. If you are the one who trips it: the mode has lost the only
thing it gains over the desktop, and that is worth reconsidering rather than
quietly shipping.

---

## 3 · The three things that are a different DESIGN, not a different size

Everything else in the mobile CSS block is proportional and reads `var(--sw)`.
These three are judgements:

1. **The tools move to the bottom.** Seven 38px buttons need 266 of 360 logical
   pixels, and the top of a phone is the one place a thumb cannot go. They come
   out of the bar and become a 22px cluster at the top of the panel — the nearest
   edge to the hand. **The buttons are the same DOM objects in both modes; only
   their parent changes.** Every handler and every `aria-pressed` update
   addresses them by variable, so a second layout cannot fork the behaviour,
   which is how a second layout usually rots.
2. **The grid loses a column.** Six 60px chips need 368 and there are 352.
3. **The info line goes under the grid.** At 640 there is room for a 252px
   reading column beside the palette. At 360 there is not, and one clipped line
   below beats one word beside. The full blurb is still reachable through `?`,
   which is what makes the clip a compression rather than a loss.

**The move button is first and half again as wide as its neighbours** (76 against
52). That is the owner's headline clause rendered as a number, and it is not
decoration: a 60 × 60 map seen through a 360px window is mostly somewhere you are
not, and move is the only tool on a phone with no keyboard fallback behind it.

---

## 4 · The bug the mode exposed, which was never a mobile bug

`css/style.css` carried this, written long before any of it:

```css
@media (max-width: 640px), (max-height: 400px) { #app { align-items: flex-start; ... } }
```

**That was the FIFTH copy of the logical screen** — in the one place a custom
property cannot reach, because a media query cannot read `var(--sw)`. §4i found
four and could not have found this one; it is not a JS constant.

The symptom only appears in mobile mode. A 375px phone running the 360px screen
**fits, exactly, at 1×** — and 375 is under 640, so the query fired, the stage
stopped centring and the game jammed itself into the top-left corner of a screen
it had room to sit in the middle of. The condition was never *"is the window
under 640"*; it was *"is the window smaller than the screen we are drawing"*, and
only JS knows the second number.

It is now `#app[data-cramped]`, set by `syncUnit()` from the mode's own
dimensions. Exact in both modes, and exact in any third.

**The general lesson, which is the one worth carrying:** a de-duplication pass
that greps the JS is not finished. The stylesheet, the media queries and the
HTML hold copies of the same constants and no test imports any of them.

---

## 5 · How this was verified, including the two probes that lied

The browser pane's screenshot pipeline was rendering at half scale while
reporting full size, so **the DOM measurements are the instrument here, not the
picture.** Three probes did the real work:

- **A chrome geometry audit** — every panel and every button, measured against
  the stage rect, checking nothing overflows and nothing is under 20 × 14. It
  returned `tooSmall: []` across 24 on-screen controls after the topbar change,
  and before it, the finding in §6.
- **Synthetic pointer gestures** on the canvas: a one-finger drag moved the
  camera exactly +120/+64 against a −120/−64 finger travel, and a no-travel tap
  re-centred. Both on the running mobile build.
- **A group-selection sweep** over all eight category ids, asserting each is
  both selected and scrolled into view.

**Two of those lied before they told the truth, and both are worth knowing:**

> **The camera is applied on the NEXT FRAME.** A synchronous read straight after
> a synthetic drag reports "nothing moved". The first pass concluded the move
> tool was broken on mobile. It was not — the probe had to be split into an
> *arm* call and a *read* call with real frames in between.

> **A sweep passed with `allVisible: true` while never changing group at all**,
> because it was fed the tab LABELS (`'furniture'`) instead of the group ids
> (`'decor'`). Every check was vacuously true. It was caught by noticing that the
> `showing` field said `G Ground` eight times.

And a third, from the same family, already in memory and hit again here: an early
reading said the speed lever was hidden on desktop *and* mobile. **`document.hidden`
was true** — the pane was backgrounded, so `requestAnimationFrame` never ran and
the loop had never set `S.game`. There was no bug. Front the tab before believing
anything about a running loop.

---

## 6 · The fault that only a measurement could find

The audit for controls under 20 × 14 returned:

```
"tooSmall": ["Speed of time: 1 times 26x10", "Brush size: 1 tile 26x10"]
```

Laid out correctly. Labelled correctly. Both about **a millimetre and a half of
glass** on a real phone. A screenshot shows you two buttons that look small on
purpose; nothing about the rendered picture says *unhittable*.

That is why the mobile topbar is 22 and not 14 — eight pixels of bar buys 18px
buttons and costs the map 8 of 486. Afterwards: **zero of 24 on-screen controls
under the threshold.**

34 × 18 is still a compromise and is named as one in the CSS: under the ~9mm
anybody would recommend, accepted because these are the two least-used controls
in the game and both keep their keyboard bindings. The tools that matter got the
big cluster instead.

---

## 7 · The gestures — shipped the same day

§7 originally read "no pinch, no two-finger pan, no long-press". The owner, on
seeing that list: *"both of those are great additions to the mobile portion, you
are greenlit for those."* Two of the three are now in. The third is still out,
and §7c says why.

### 7a · Two-finger pan

**Why it exists when the move tool already pans:** the move tool costs a trip to
the toolbar. One finger has to keep meaning "use the thing I am holding" — that
is how a hedge gets planted — so a player holding a hedge who wants to look
somewhere else must put it down, pan, and pick it up again. Two fingers is what
every map on a phone already does.

It is **additive**. The move tool is untouched, and a mouse never produces a
second pointer, so nothing here can fire on a desktop.

The arithmetic is pure and exported (`twoFinger`, `pinchVerdict` in input.js) so
Node can test the decisions without a finger; only the plumbing touches the DOM.
The pan follows the **centroid**, which is what keeps the map still when the
fingers only spread.

**`state.suppress` is the load-bearing detail.** Fingers do not leave the glass
together: one lifts, and for a moment there is a single pointer down in the
middle of the map, indistinguishable from a press. Without suppression the
remaining finger becomes a fresh drag and its release becomes a click. It is set
when the gesture starts and cleared only when **every** finger is up.

`pointercancel` is bound to the same handler as `pointerup`, because a touch the
system takes back — an edge swipe, an incoming call — fires only the former.
Miss it and a phantom finger stays on the books and every later tap is swallowed
as a third one.

### 7b · Pinch, and why it is not a zoom

**A real zoom is architecturally closed.** The backing canvas is exactly the
logical screen, the CSS upscale is a whole number (SPEC §2), and the tiles are
64 × 32 pixel art. Zooming out means a fractional canvas — smearing every pixel
the game has — or a second art set at another tile size. Both break a founding
law to serve a gesture. **Do not try to route around this**; it is not an
oversight.

But the *intent* is entirely servable and the machinery was already here. The
minimap is the whole garden in one picture, in the same projection as the
screen, with a camera box and a tap-to-travel that have worked since it shipped.
It was simply 119 × 60 in a corner. **Pinch makes it big and centres it.**

- Fingers **close** = "show me everything" — the way closing your fingers on a
  map reads everywhere else. Fingers **open** = back to the garden.
- Magnified **2× on a phone, 3× on a monitor**, always a whole number, through
  **one draw path** — every `1` that was a pixel became `k`. A second draw
  routine would be two pictures of the same garden that could disagree, which is
  the fault this project keeps finding in itself.
- **`hit()` claims the entire view while it is open**, so a tap on the meadow
  showing round the edge closes it rather than planting a tree through the
  picture — input.js falls through to the tools on a false.
- `pick()` divides the scale back out. If that inverse ever breaks, the symptom
  is "tapping the map sends me somewhere else", which reads as a projection bug
  and is not one. There is a test that taps every corner.
- `M` and `Esc` reach it from a keyboard, because a gesture must never be the
  only way to reach something.

**`M` was free.** The note beside the move tool said `M` is mute; `setMuted()`
exists in js/audio.js and **nothing has ever bound a key to it**. The letter was
reserved for a control that does not exist. If mute wants a key it can have one,
but not this one back silently.

### 7c · The fault the gestures uncovered, which was never about gestures

Placement happened on `pointerdown`. **Two fingers do not land together.**

Measured on the running build, before any of this existed: with a tree in hand,
reaching for the map planted a tree — objects went 2 → 3 on the *first* finger,
and then the gesture panned away from it. A player would go to look at their
garden and find a pine in it.

**On touch, placing now waits for the release.** A mouse still places on the
press, where it always did and where the crisper feel belongs — a mouse has one
pointer, so a press can only ever mean one thing. Touch defers to `state.pending`
and:

- `beginGesture()` throws it away — the hand turned out to be reaching for the
  map, not the meadow;
- a drag past `DRAG_SLOP` **flushes it first**, so painted ground keeps the tile
  the player actually aimed at rather than starting from where the drag was
  noticed;
- `onBlur` discards it, on the same grounds the terrain drag is discarded: the
  player never finished asking.

Verified after the fix: `plantedOnDown: 0`, `plantedOnUp: 1` on touch;
`mousePlantedOnDown: 1` on desktop, unchanged.

### 7d · Long press = right click

The owner, on the objection above: *"yes, long press should be the same as right
click."* **It is built.** The concern is recorded here because it was real, not
to relitigate it — the answer to it is the design, not a refusal.

**The objection:** right-click means REMOVE, so a long press deletes whatever a
thumb happens to be resting on.

**What answers it.** One number and four cancellations:

- **500ms**, which is Android's `ViewConfiguration` long-press timeout and about
  iOS's context-menu delay. This matters more than any figure this game could
  invent: a phone player already has that duration in their hands from every app
  they own, and disagreeing with all of them by 200ms would feel *broken* rather
  than *safe*. There is a test pinning it, because a later edit that "tightens
  it up" to 250ms would make the garden hostile without failing anything.
- **Travel cancels it.** A pan or a paint stroke can never end in a deletion.
- **A second finger cancels it.** Reaching for a two-finger pan cannot raze on
  the way — the same reasoning that made placing wait for the release (§7c).
- **`move` and `ask` are excluded**, on the grounds the `?` was always excluded
  from everything: a help cursor that deletes is a trap, and so is a map-mover
  that deletes.
- **It says what it did** — *"Taken back. Ctrl+Z puts it back."* — so a mistake
  is legible instead of something you find later and cannot explain. Undo is 64
  steps deep and removing was always undoable; this does not go round that.

**Touch only.** A mouse has a real right button and has always used it. Giving
the mouse a second, slower route to the same thing would only mean a player who
paused mid-click lost a tree.

It is armed for the **panning** branch too, which is the case that matters most:
with nothing selected one finger pans, and that is exactly when a player is
looking at the garden and wants something out of it. A right-click removes
whether or not you are holding something, so this does too.

**Verified on the running build — the six cases, and four of them are the ones
that must NOT delete:**

| gesture | result |
|---|---|
| hold still, one finger | **removed 1**, and the release planted 0 |
| drag, then rest | deleted 0 |
| two fingers resting | deleted 0 |
| hold with the `move` tool | deleted 0 |
| quick tap | planted 1 |
| **mouse** held past 500ms | planted on press, deleted 0 |

That the release plants 0 is not a detail: without it a long press would delete
a tree and immediately plant another in its place.

### 7e · Still not built

Nothing outstanding from the owner's list. The gesture set is: one finger uses
the tool, two fingers move the map, pinch shows the garden, hold removes.
- **The `?` tool is the phone's escape hatch for the clipped info line.** If you
  widen the info line later, check you have not made `?` redundant — it is
  carrying more weight in this mode than in the desktop one.
- **No orientation handling.** Landscape on a phone gets the desktop or the
  mobile layout depending only on what the URL says. `watchStage` already listens
  for `orientationchange` and refits, so nothing breaks; it just does not
  *switch*. Switching would have to be a navigation (see §8).

---

## 8 · The one law of this mode

**`iso.MODE` is decided once, at import, and switching is a NAVIGATION.**

Every layout constant in the game — `ui.LAYOUT`, `render.BACKING_W`,
`input.LOGICAL_W`, the four CSS custom properties — is derived from it at module
scope. A mode that could change after boot would leave all of them describing a
screen that no longer exists.

This is the same reasoning that made New Game a navigation, and it buys the same
thing: a fresh document cannot inherit a stale layout, because there is nothing
there to inherit from. The title screen's switch therefore reloads **to the front
door, not into the garden** — which turned out to be better anyway, because the
player sees the phone frame, the letterbox and the wordmark at the size they will
actually be *before* committing. It can never carry `new=1`; there is a test.

**If you ever want a live toggle, you are not adding a button — you are making
every one of those constants a function.** Do not start that without reading §1.

---

## 9 · State at handoff

| | |
|---|---|
| tests | **461** (440 before; +4 seams, +9 new `test/titlescreen.test.mjs`, +12 new `test/touch.test.mjs` — the front door and the gestures had none at all until now) |
| playtest | 49 / 49 |
| `iso-audit --strict` | 1 of 312 — `balustrade`, the known step-4 worklist entry |
| build stamp | bumped — **it cache-busts `style.css`, and this arc touches the stylesheet.** Leaving it would have served returning players new JS with old CSS: desktop geometry under a mobile layout, silently |
| verified in-browser | title screen, boot, layout, all 24 controls, drag, tap-to-centre, planting, all 8 tabs, two-finger pan with a tree in hand, pinch in and out, tap-to-travel, `M`, `Esc`, and that a desktop mouse still places on the press |

**Files that changed:** `js/iso.js` (the MODES table), `js/ui.js` (`layoutFor`,
the CSS properties, `data-cramped`, the tool cluster, `keepTabVisible`),
`js/titlescreen.js` (`modeHref`, `looksLikePhone`, the switch),
`js/input.js` (`twoFinger`, `pinchVerdict`, the pointer book, `suppress`,
`pending`, `pointercancel`, `M`, `Esc`), `js/minimap.js` (the overview — one
draw path at scale `k`), `css/style.css` (four hard-coded 640s made variable,
`[data-cramped]`, and one additive `[data-mode="mobile"]` block at the end),
`index.html` (build stamp), `test/seams.test.mjs`, `test/titlescreen.test.mjs`
(new), `test/touch.test.mjs` (new), `README.md`, `proposals/BACKLOG.md`.

**`js/main.js` was not touched at all**, including for the overview: the minimap
owns whether it is expanded, and `draw`/`hit`/`pick` switch on it, so the one
call site in main.js needed no change.

**The desktop is byte-identical in behaviour.** The only shared edits were the
four that turned a hard-coded 640 into `var(--sw)` and the media query in §4 —
redundancies removed, not designs changed. `test/seams.test.mjs` still asserts
`{ TOPBAR: 640×14, VIEW: 640×286, PANEL: 640×100 }` exactly, and now also asserts
that a Node import lands on the desktop mode, which is what pins it.
