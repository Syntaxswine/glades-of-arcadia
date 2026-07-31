# FLOURISHES — the idle life

*Addendum. Adds a layer; supersedes nothing.*

A **beat** is the settling ceremony. It happens once, it is gated on the whole
garden being ready, it fires in one hour of the day, and it writes a line in the
journal that stays written for ever. `BEATS` in `js/creatures.js`.

A **flourish** is the opposite of that in every respect. It repeats. It asks
nothing of the garden but a prop within walking distance. It leaves **no
record**. `FLOURISHES`, same file, deliberately a second table.

They share the same machinery — walk somewhere, stand there, do a thing for N
seconds, go back to what you were doing — through a merged `ACTS` lookup. The
tables stay separate so the difference in *kind* is impossible to miss when
adding to either.

## Why the record matters

`st.beats` is a Set, and two things read it: the journal, and the gate in
`_maybeBeat` that stops a ceremony happening twice.

A repeatable act reaching it would do one of two bad things — write the same
journal line over and over until the entry means nothing, or consume the
settling ceremony of a creature that has not settled. So the flourish path emits
`flourish-start` / `flourish-done` and **never** `beat-done`, which is the only
event `recordBeat` listens to.

`tools/playtest.mjs` §7 asserts this against a real running garden, and the
assertion has been mutation-tested: swap the event type back to `beat-done` and
the check fails naming the leaked act.

> **A settled creature never leaves the garden** (SPEC §0) is untouched by any of
> this. A flourish is a short walk to a prop and back. It cannot evict, relocate,
> lower a rung, or empty a journal entry, and nothing in `_maybeFlourish` writes
> to `st` at all.

## The two of them

| | `piping` | `tipple` |
|---|---|---|
| who | satyr | satyr |
| pose | `pipe` (8-frame cycle) | `drink` (6-frame one-shot) |
| started by | **main.js, by hand** | the flourish scheduler |
| site | none — where he stands | `vessel` or `wine`, within 5 |
| length | 180 s | 4 s |
| cooldown | none (fires once a session) | 140–260 s |

### piping — the arrival

**When the score starts, the satyr who caused it stands and plays for three
minutes.** The music already arrives with him (`docs/AUDIO.md`); this is the
other half of that idea, which is *seeing him make it*.

It has no site, so the scheduler skips it — `_maybeFlourish` ignores anything
with `site: null`, and the playtest asserts he never self-starts. `main.js` owns
it entirely, through `bestiary.askFlourish('satyr', 'piping')`.

The call site is a latch and one line, because `askFlourish` **refuses
politely**: offstage, mid-transit over the map rim, or already performing all
return `false`. So `main.js` arms `createRecital()` and asks on every step until
it takes, rather than running a second state machine to listen for his arrival.
He may still be dissolving in over the rim at the moment the track starts, and a
creature out there has nowhere to stand.

### Armed once per session, by whichever comes first

- the music unlocking because a satyr has just walked in,
- a satyr arriving at any later point,
- or the garden loading with a satyr already living in it.

> **This is a fix for a bug that shipped and reached the owner.** The first
> version armed the recital only on a FRESH unlock, reasoning that a
> three-minute recital on every page refresh would become a chore.
>
> But `extra.musicUnlocked` **persists in the save.** For a returning player the
> track resumed at load, `unlockSong` returned at its first line
> (`if (musicUnlocked) return`), and the recital was not merely skipped that
> once — it became *permanently unreachable*, because no later arrival could get
> past that same early return either. The owner loaded their garden, heard the
> music start immediately, and watched the satyr stand there doing nothing.
>
> **A thing seen slightly too often beats a thing that cannot be seen.**
>
> The rule now lives in `createRecital()` at the top of `main.js`, exported so a
> test can hold it, and all three call sites call `arm()` **unconditionally** —
> the `if (!restoring)` that caused this no longer exists to be got wrong.

Three minutes is the owner's number. The track itself runs 3:48, so he stops a
little before its first pass ends.

### tipple — a drink

A settled, content, idle satyr occasionally walks to a krater, pithos or amphora
and helps himself. The gates are deliberately much weaker than a beat's: no hour
window, no readiness test, nothing recorded.

Three of them are load-bearing:

- **settled only.** A desaturated `visits` preview walking over to help itself to
  the wine would undercut the whole point of the preview being a ghost of
  something not yet earned.
- **content only.** A `restless` creature is on its way to ground that is still
  its own and an `unhappy` one stays exactly where it is — that stillness is the
  never-evict promise made visible, and a satyr trotting off for wine in the
  middle of it would read as him being fine.
- **the cooldown.** Without it he fires on every scan and lives at the krater.

It refuses the same way a beat does if the vessel is across a cliff with no way
round: `goPerform` returns false and it tries again on the next scan, rather than
walking through rock.

Satyr-only, by `creature: 'satyr'` on the entry. A unicorn at the krater would
undo the joke the catalogue is built on — *the cup that calls satyrs is the thing
the alicorn exists to purify.*

## The art side

Poses beyond the universal `idle` / `walk` / `beat` are per-creature, declared in
`SPECS[id].extra` in `js/art/creatures.js`. Each names its own frame count and
may `grow` the canvas — width symmetrically, **height at the top only**, so the
feet stay put and the anchor stays at the bottom centre. The piping satyr is
36×58 against his ordinary 24×44 because the notes need sky to rise into.

Two rules, both enforced by `test/art.test.mjs`:

- **An extra pose stands at the same height as its own idle frame.** Get the
  anchor wrong on a grown canvas and the creature floats or sinks by exactly
  however much the canvas grew. This is the multi-tile float bug in other
  clothes, and `anchor-audit.mjs` will not catch it — that tool audits footprints.
- **`HOLDS[pose].length === frames.length`.** `creatureFrameAt` walks the holds,
  so a mismatch silently drops frames off the end of the cycle.

`main.js` asks `hasPose(creature, pose)` and falls back to `beat` if the art is
not there, so a pose added to `creatures.js` before its sprites exist degrades to
the old animation rather than to an invisible creature.

### One-shots

`drink` is declared `once: true`. It is a gesture with a beginning and an end —
raise, sip, sip, lower — not a cycle, so it is played from **the agent's own pose
clock** (`view().poseT`), not the shared wall clock, and it **clamps** on its last
frame instead of wrapping.

Both halves matter. Off the wall clock, a satyr who raises his cup half a second
before the frame lands starts the animation halfway through and the cup appears
already at his lips. Without the clamp, overrunning the 3.1 s of art restarts it,
and he raises a fresh cup every three seconds for ever. With it, he stands
holding an empty one, which is right.

`poseT` is reset in two places on purpose: derived in `update()` (which catches
every ordinary transition without needing a write at each of the ten sites that
assign `pose`), and explicitly in `_beginAct` (because `askFlourish` is called
from the frame loop, not the step, and one frame at the *end* of a one-shot is
exactly the wrong frame to show first).

## Instruments

- `node tools/poseshot.mjs --id satyr --pose pipe --zoom 6` — the whole cycle laid
  out on real ground, with each frame's hold printed. `--sil` for silhouette
  first, `--only 0,3` to magnify individual frames past the ~2000px limit at
  which a full strip stops getting bigger.
- `node tools/playtest.mjs` §7 — settles a satyr for real, stands a krater at the
  far edge of his reach, and watches for two garden-days.

## Adding one

1. Art: a pose in `SPECS[id].extra`, a `HOLDS` entry of the same length, frames in
   the creature's `layers()`.
2. Behaviour: an entry in `FLOURISHES` with `flourish: true`, a pose, seconds, and
   either a site + radius + cooldown, or `site: null` if something else starts it.
3. Look at it with `poseshot`, silhouette first. **Never author art blind** — see
   the handoff's traps, and the notes below.

### What the satyr's two poses cost to get right

Both were rebuilt several times, and every failure was the same failure: **an
object held at the face has to be narrow enough for the face to survive it.**

- The syrinx was authored in the earth ramp, the same ramp as his skin, and
  vanished — a faint texture on his chin. Olive light and flesh mid are 132 and
  129 in luminance, so moving it to olive light did not fix it either.
- **And check the GHOST.** Striping olive-light against a dark olive made the
  instrument carry its own contrast, which worked in colour and hid a second
  bug: the `visits` preview compresses everything toward mid-grey, and olive
  light `i` and flesh `t` both land on `#8A7F6D` — a separation of **zero**.
  Half the syrinx was literally his skin colour in the preview every player sees
  *first*, and it read as a muzzle. Olive mid `h` is the key that survives both:
  34 from flesh in colour and 30 in the ghost, where `i` was 2 and 0.
  `poseshot --ghost` exists for exactly this.
- At fourteen wide it read as a washboard bib. At ten, hung below the beard, as a
  necklace. Six, at the lips, with beard showing either side, reads as playing.
- The cup went the same way: upright at the mouth it was a bib, tilted on a
  diagonal it lay across his face like a bandana. Five wide and four tall, with
  his eyes visible either side of it, reads as drinking.
- The tell for the sip is **two pixels** — his eyes closing. An earlier pass
  re-authored the whole head tipped back and it read as his head shrinking;
  fourteen rows is not enough for a rotation to look like anything but a
  different head.
