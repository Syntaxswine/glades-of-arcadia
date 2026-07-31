# Addendum: tombs, and being remembered

> *Et in Arcadia ego* — "even in Arcadia, I am."

Poussin's shepherds find a tomb in paradise. The 18th-century landscape gardens
that consciously rebuilt Arcadia in England — Stowe, Stourhead, Shugborough —
really did install these, inscription and all. The neoclassical decor set in
`DECOR.md` Part II is already that vocabulary; this completes it.

The owner's framing, which is the design: **the ancient idea that great people
of the past might be remembered in the eyes of the divine.** That is *kleos* —
the renown that outlives the person — and hero-cult, where the honoured dead
were venerated at their tomb and could return favour.

## The mechanic

**A tomb grants `maturity` in a radius, immediately.**

`maturity` already means "this ground has been left alone long enough to feel
old", and it normally accrues with garden time. A tomb *is* a past — so ground
around it reads as having history because it demonstrably does. No new axis, no
new system: the divine noticing your glade is expressed through a value the
game already tracks.

**Tombs are also nullifiers.** Nothing grows on a grave. They block influence
propagation exactly as hedges and 2-level terraces do (`DECOR.md` Part I).

So a tomb is simultaneously: a boundary, an instant history, and the most
melancholy object in a game about making somewhere lovely.

**Tending matters.** Hero cult was a practice, not a monument — offerings were
left. A tomb with votive items, flowers, or a libation altar within 2 tiles
grants its full maturity bonus; a neglected one grants roughly half. This is
the one place in the game where an object asks to be looked after, and it asks
gently: a neglected tomb is never a penalty, only a smaller gift.

## The structures

Five, in the two registers established in `DECOR.md` Part II.

| structure | register | notes |
|---|---|---|
| **Tumulus** | archaic | A grassy grave mound. The oldest form; reads as landscape rather than architecture. Satyr-leaning. |
| **Stele** | archaic→classical | The standard Greek grave marker: an upright slab, often with a shallow relief of the dead at some ordinary task. |
| **Naiskos** | classical | A grave marker shaped like a little temple front, figures standing in the doorway. |
| **Heroön** | classical | A shrine over a hero's grave. The one that most literally means *remembered by the divine* — and the natural candidate to help draw Pan. |
| **The Arcadian tomb** | neoclassical | A plain stone sarcophagus, blank but for **ET IN ARCADIA EGO**. Poussin's. Unicorn-leaning, because it is dressed and quiet. **Not in the normal palette — see below.** |

## The Arcadian tomb is hidden

It does not appear in the build menu. It is found — unlocked once the glade is
deeply mature and at least one other tomb has stood tended for a long while.
It is never announced, never listed in the journal, and never required for
anything.

A player who never finds it loses nothing. A player who does gets a quiet joke
at the far end of a game about making a beautiful place, and it closes the loop
back to where this whole project started: a broken sculpture in a dark room.

## Epitaphs

Every tomb takes an epitaph on placement, drawn without repeat from a curated
list — **not procedurally generated**, because the register is too easy to get
wrong and mush is worse than silence. Shown on hover, and in the journal.

The voice is the real one: terse, concrete, frequently addressing the passer-by
or spoken by the dead. The pathos is in the plainness. Never grand.

```
He planted the tree you are standing under.
Stranger: I also stood where you are standing.
She kept bees. The bees are still here.
Of him nothing is known but the running.
This one was good with horses.
He heard the pipes once, and never after.
Nobody remembers her name. The ground does.
He asked for water and was given it.
She was not famous. She was here first.
Tell them below that I did as I was told.
He was quick, and it did not help.
Here lies one who was loved by a river.
She dug the channel. It still runs.
He was owed a kindness and never collected it.
Two hands, forty years, one wall.
She laughed at the wrong time, often.
He is the reason for the bend in the path.
Passer-by: it is cooler here. That was deliberate.
She knew the names of all of them.
He waited. That was the whole of it.
```

Several are quietly tuned to the denizens — the horses for centaurs, the pipes
for satyrs and Pan, the river and the channel for naiads — so a tomb placed in
the right glade can land as though it belonged to someone who lived there.

## Scope

Apply **after** the elevation/zoning/decor wave lands — that wave has catalog.js
and props.js checked out and this would collide.

Total addition: 5 structures, 1 hidden, ~20 epitaph strings, one maturity-grant
rule and one tending check. Small.
