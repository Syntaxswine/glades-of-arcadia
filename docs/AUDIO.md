# Addendum: audio

Supersedes SPEC.md §9 and relaxes SPEC.md §1's "zero external assets" to allow
**one** audio file.

## The track

`glades-of-arcadia.mp3` — supplied by the owner. Measured, not assumed:

| | |
|---|---|
| duration | 228.3 s (3:48), stereo 44.1 kHz |
| peak | **1.0067 — clips**, 0.06 dBFS over full scale |
| RMS | −17.2 dBFS (mastered level; hot for a bed) |
| head / tail | starts instantly; fades out, 52 ms of trailing silence |
| loop seam | last 250 ms is ~10× quieter than the first 250 ms |

Consequences: **play at ~0.3 gain** (fixes the clipping and puts it under the
game rather than on top of it), and **crossfade the loop** — begin the next pass
~5 s before the end, over ~4 s. Since the tail is already near-silent this is
effectively "the next pass begins while this one dies", and the seam vanishes.

Move the file to `audio/`. The single-file dist becomes **one HTML + one mp3**
rather than base64-inlining 5 MB into the page; Pages streams it separately,
which is better anyway.

## THE TRIGGER — music starts when the first satyr enters

Not at boot. Not on first gesture. **The first time a satyr walks onto the map.**

Satyrs are the musicians of the myth — the aulos, the syrinx, the revel. The
glade is quiet until the creature who *brings* music arrives with it. The satyr
is also deliberately the easiest denizen to attract, so the player gets music
early but earns it.

### Implementation

Browser autoplay policy means audio cannot start from a game event. So:

1. **Prime silently on the first user gesture** — resume the AudioContext, load
   and decode the track, do not play. By the time a satyr arrives the player has
   certainly clicked, because placing things is how satyrs arrive.
2. **Play on the satyr's first arrival**, fading in over ~4 s as he walks in.
   Trigger on *arrival* — the `visits` rung counts, not only `settles`. The
   desaturated preview visit is a big moment and deserves it.
3. **Persist `musicUnlocked` in the save.** A garden reloaded with a satyr
   already living in it starts the music normally once primed; it does not sit
   in silence waiting for a "first" arrival that already happened.

### Before he comes

Ambient only — birdsong, water, wind. The silence must read as deliberate, or
the arrival of the music lands as a bug rather than a moment.

### The escalation that is already written

The satyr's approach tells include:

> *Pipes, thin and off-key, somewhere past the trees.*

So make it audible: as the tells fire, a **faint, off-key procedural pipe** in
the distance, panned and low. Then he walks in and the real track begins. The
hint system already promised music; this makes good on it, and it costs one
procedural voice we have already built.

## What the procedural layer keeps doing

Retire the procedural **music** — the lyre figure and the pad — so it cannot
fight the composed track's key. Keep everything **responsive**, because that is
what a fixed track cannot do:

- **Birdsong**, its rate following the `moisture` and `maturity` of the region
  on screen
- **Water**, near water, and louder near a waterfall
- **The off-key pipe** of the satyr tells, above
- **The settle cadence** when a creature takes up residence — with a ~3 dB duck
  on the music underneath it so the cue reads

Master ceiling stays as it was; the mp3 sits at ~0.3 beneath it.

## Still true

Never autoplays. Mute control persists. Never throws, and is a safe no-op with
no AudioContext or if the file fails to load — **a missing mp3 must degrade to
the ambient layer, never to a broken game.**
