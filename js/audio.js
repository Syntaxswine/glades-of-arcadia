// audio.js — the score of Arcadia.
//
// Two layers, and the split between them is the whole design (docs/AUDIO.md):
//
//   THE TRACK      one composed mp3, `audio/glades-of-arcadia.mp3`, supplied by
//                  the owner. Fixed, in a key, and beautiful — and therefore
//                  incapable of reacting to anything.
//   THE AMBIENT    procedural, and kept precisely because it CAN react:
//                  birdsong whose rate follows the moisture and maturity of the
//                  region on screen, water that gets louder near a waterfall,
//                  wind, the settle cadence, and the satyr's distant pipes.
//
// The procedural MUSIC — the lyre figure and the drone pad that used to live
// here — is retired. A generated G-Mixolydian pad underneath a composed track
// in some other key is not a layer, it is a fight. Everything that survived is
// either unpitched (wind, water, birds) or deliberately, diegetically sour
// (the pipes), so nothing can argue with the mp3 about what key we are in.
//
// ---------------------------------------------------------------------------
// THE TRIGGER
// ---------------------------------------------------------------------------
//
// Music does not start at boot, and it does not start on the first gesture.
// It starts THE FIRST TIME A SATYR WALKS ONTO THE MAP. Satyrs are the
// musicians of the myth — the aulos, the syrinx, the revel — so the glade is
// quiet until the creature who brings music arrives with it.
//
// Autoplay policy will not let a game event start audio, so this is a two-step:
//
//   1. prime()        on the first user gesture. Resume the context, fetch and
//                     decode the track, and DO NOT PLAY. Silent.
//   2. unlockMusic()  when the satyr arrives. Fades in over four seconds as he
//                     walks in. If the decode has not landed yet the intent is
//                     remembered and the music starts the moment it does.
//
// `musicUnlocked` is persisted by main.js, so a garden reloaded with a satyr
// already living in it starts the music once primed rather than sitting in
// silence waiting for a "first" arrival that already happened.
//
// ---------------------------------------------------------------------------
// Contract (SPEC §9, as amended by docs/AUDIO.md)
// ---------------------------------------------------------------------------
//   start()            from a user gesture; builds the graph, resumes the ctx
//   prime(url)         start() + fetch and decode the track. Never plays.
//   unlockMusic()      THE TRIGGER. The satyr arrived; let the music in.
//   setMusicUnlocked(b) restore the flag from a save without re-cueing it
//   stop()             ramps out and tears the graph down — no residue
//   setMood({moisture, maturity, wildness, order, seclusion, water, waterfall})
//   cue(name, opts)    a one-shot; unknown names are a no-op
//   setMuted(b)        ramps the master, keeps the clock running
//   muted, ready, musicUnlocked, musicState   live bindings
//
// Guarantees:
//   * Never throws. Every public entry point is wrapped. A browser with no
//     AudioContext gets a silent no-op module, and the game does not notice.
//   * A MISSING OR BROKEN MP3 DEGRADES TO THE AMBIENT LAYER, never to a broken
//     game. `musicState` goes to 'failed' and nothing else changes.
//   * Everything ramps. No audible parameter is ever assigned bare.
//   * No unbounded node accumulation. Persistent nodes are built once in
//     start(); one-shot voices disconnect themselves in onended and are capped.
//   * Imports cleanly in Node — nothing at module scope touches window.

// ---------------------------------------------------------------------------
// The track
// ---------------------------------------------------------------------------
//
// Measured, not assumed (docs/AUDIO.md): 228.3 s, stereo 44.1 kHz, peak 1.0067
// (it clips by 0.06 dB), RMS −17.2 dBFS, starts instantly, fades out, 52 ms of
// trailing silence, and the last 250 ms is about ten times quieter than the
// first. Every constant below falls out of those five numbers.

/** Relative to the document, so it works served from root and from dist/. */
export const MUSIC_URL = 'audio/glades-of-arcadia.mp3';

/**
 * 0.3 does two jobs at once: it pulls the 1.0067 peak back under full scale so
 * the clipping is gone, and it puts a track mastered at −17.2 dBFS RMS UNDER
 * the game rather than on top of it. It sits beneath the master ceiling like
 * everything else, so the mute control governs it for free.
 */
const MUSIC_GAIN = 0.30;

/** He walks in over about four seconds; the music arrives at the same pace. */
const MUSIC_FADE_IN = 4.0;

/**
 * THE LOOP SEAM, and the one number here that was arrived at by measurement
 * rather than by reasoning — because the reasoning was wrong.
 *
 * docs/AUDIO.md prescribes a 5 s lead on the grounds that "the tail is already
 * near-silent" by then. It is not. Measured off the decoded buffer, in 1 s
 * windows against the track's own steady middle:
 *
 *     30s left  +10.9 dB      5s left  +7.3 dB      2s left  −35.2 dB
 *     10s left  +10.6 dB      3s left  +8.8 dB      1s left  −50.1 dB
 *
 * The fade is not five seconds long, it is TWO AND A HALF, and five seconds out
 * the track is still at full level. The thing that actually makes the seam is
 * at the other end: the HEAD is a long quiet intro — −20 dB at 0.25 s, −18 dB
 * at 2 s, and it does not reach −6 dB until twelve seconds in. Loop it with a
 * short lead and the music does not click, it EVAPORATES: a fifteen-decibel
 * hole about three seconds wide, every 3:48.
 *
 * No crossfade curve can fix that, because nothing is wrong with the gains —
 * the incoming pass is quiet because the composer wrote it quiet. The fix is to
 * start the next pass early enough that its intro builds UNDERNEATH the
 * outgoing track's still-loud ending. Simulated on the real samples, summing
 * the two passes and measuring 1 s windows across the join:
 *
 *     lead   5s   −16.0 .. +2.4 dB        lead  12s   −2.2 .. +2.4 dB
 *     lead   8s   −11.3 .. +2.4 dB        lead  16s   −2.1 .. +3.0 dB
 *     lead  10s    −8.4 .. +2.4 dB        lead  25s   −4.0 .. +4.4 dB
 *
 * and for scale, the UNLOOPED track wanders −10.2 .. +4.4 dB all by itself.
 * Anywhere in 11–15 s the join is flatter than the music is, which is as close
 * to "the seam vanishes" as the phrase can be made to mean. Twelve sits in the
 * middle of that plateau with the lowest overlap peak.
 *
 * MUSIC_XFADE is kept at the specified four seconds. At this lead it is worth
 * about a tenth of a decibel — the incoming intro is 20 dB down and needs no
 * help being unobtrusive — but it costs nothing and it is what stops a hard
 * onset if this file is ever swapped for one that starts loud.
 */
const MUSIC_LEAD = 12.0;
const MUSIC_XFADE = 4.0;

/**
 * THE SHAPE OF THE CROSSFADE, which matters more than either constant above.
 *
 * The obvious implementation — exponentialRampToValueAtTime from silence to
 * unity over four seconds — is WRONG, and audibly so. An exponential ramp is
 * back-loaded: a quarter of the way through it is still at −60 dB and half way
 * through it is at −40 dB. Since the pass it is replacing is simultaneously
 * dying, the two of them together leave a three-second hole at every loop
 * point, which is a worse artefact than the seam it was supposed to hide.
 *
 * So the two passes get different curves, because they are doing different jobs:
 *
 *   ARRIVE   the first pass ever, fading up from real silence as the satyr
 *            walks in. Nothing underneath it, so a gentle S-curve is right —
 *            the player should not be able to name the moment it started.
 *   CROSS    every loop after that. FRONT-LOADED (u^0.7 through a sine), so
 *            the incoming pass is already at −8 dB a second in and carries the
 *            level while the outgoing tail — which the track fades by itself —
 *            gets out of the way. Their sum stays within about 3 dB.
 *
 * And the outgoing pass gets NO fade of its own. It does not need one: the
 * track is already mastered with a fade-out and ends in 52 ms of silence, so
 * fading it a second time is what would make the dip. All it gets is a 350 ms
 * safety ramp at the very end, in case the file is ever replaced with one that
 * does not end quietly, so a hard stop can never click.
 */
const CURVE_STEPS = 64;
const TAIL_SAFETY = 0.35;

function fadeCurve(fn) {
  const a = new Float32Array(CURVE_STEPS);
  for (let i = 0; i < CURVE_STEPS; i++) {
    const u = i / (CURVE_STEPS - 1);
    const v = fn(u);
    a[i] = v > 0.0001 ? (v > 1 ? 1 : v) : 0.0001;
  }
  a[CURVE_STEPS - 1] = 1;
  return a;
}

const ARRIVE = fadeCurve((u) => u * u * (3 - 2 * u));
const CROSS = fadeCurve((u) => Math.sin((Math.PI / 2) * Math.pow(u, 0.7)));

/** −3 dB, so the settle cadence reads over the bed without stopping it. */
const DUCK = Math.pow(10, -3 / 20); // 0.7079
const DUCK_HOLD = 1.6;
const DUCK_RELEASE = 1.2;

// ---------------------------------------------------------------------------
// Tuning for the procedural layer
// ---------------------------------------------------------------------------

const BASE = 196.0; // G3. Everything below is semitones from here.

/**
 * The pluck pool. This is no longer a melody — the generative figure is gone —
 * but the CUES still speak, and they speak in a pentatonic subset of G
 * Mixolydian (G A B D E). Five notes with no semitone anywhere means no two
 * sounding notes can clash, which is what lets a cue land on any bar of a
 * composed track without either of them sounding wrong.
 */
const POOL = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/**
 * And this is the opposite of that, on purpose. The satyr's pipes are "thin and
 * off-key" in the text, so the intervals are genuinely sour — quarter-tones and
 * neutral thirds that belong to no scale the rest of the game uses. He is not
 * a good musician yet. That is the joke, and it is also why the pipes can never
 * be mistaken for the score arriving early.
 */
const PIPE_POOL = [12, 13.6, 15.4, 17, 18.8, 20.4, 24];

const MASTER_CEILING = 0.18; // SPEC §9. This is a ceiling, not a suggestion.

// Scheduler. A long lookahead so a throttled background tab does not tear a
// hole in the ambience, plus a resync guard so returning from a background tab
// does not fire a burst of catch-up events.
const TICK_MS = 220;
const LOOKAHEAD = 1.6;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export let muted = false;
export let ready = false;

/** THE TRIGGER's flag. main.js persists this; see setMusicUnlocked(). */
export let musicUnlocked = false;

/** 'idle' | 'loading' | 'ready' | 'failed' | 'unsupported' */
export let musicState = 'idle';

let ctx = null;
let gen = 0; // bumped on every stop, so async teardown can't kill a new start
let timer = null;
let running = false;

let master = null;
let comp = null;
let bus = null; // the procedural layer sums here, pre-compressor
let ambBus = null;
let pluckBus = null;
let cueBus = null;
let pipeBus = null;
let spaceIn = null; // send into the delay network

// The music path. Deliberately NOT through `comp`: the track is already
// mastered, and a compressor shared with the plucks would turn every settle
// cadence into an accidental sidechain pump on the music underneath it.
let musicGain = null; // the fixed 0.3
let musicDuck = null; // the ~3 dB dip under a cue
let musicBuf = null;
let musicLoad = null; // the in-flight fetch+decode promise, memoised
let musicPlaying = false;
let wantMusic = false; // the trigger fired; play as soon as we are able
let nextPassAt = 0;
let passes = []; // at most two: the one dying and the one arriving

let windSrcs = [];
let windGain = null;
let windFilter = null;
let noiseBuf = null;

let voices = 0;
const MAX_VOICES = 28;

let nextBird = 0;
let nextWater = 0;

const mood = {
  moisture: 0.3,
  maturity: 0.2,
  wildness: 0.4,
  order: 0.3,
  seclusion: 0.4,
  // Two channels the fields do not carry, supplied by main.js from the tiles
  // actually on screen: how much open water is in view, and how close the
  // nearest waterfall is. AUDIO.md asks for water "louder near a waterfall",
  // and a waterfall is a fact about the TERRAIN, not about the moisture axis.
  water: 0,
  waterfall: 0,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp01 = (x) => (typeof x === 'number' && x === x ? (x < 0 ? 0 : x > 1 ? 1 : x) : 0);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const freq = (semis) => BASE * Math.pow(2, semis / 12);

function AudioCtor() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!g) return null;
  return g.AudioContext || g.webkitAudioContext || null;
}

/** Exponential ramps hate zero. */
const EPS = 0.0001;

/** Wrap a public entry point so it can never throw into the game loop. */
function safe(fn) {
  return function (...args) {
    try {
      return fn.apply(null, args);
    } catch (err) {
      // One line, once — a broken audio graph must not spam the console of a
      // player who is trying to enjoy a garden.
      if (!safe.warned) {
        safe.warned = true;
        try {
          console.warn('[arcadia/audio] disabled after an error:', err);
        } catch (_) {}
      }
      return undefined;
    }
  };
}

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

function makeNoiseBuffer() {
  const n = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Space, without a convolver. Two short delays with lowpassed feedback give a
 * warm room for a plucked string at a fraction of the CPU of a reverb, and
 * they are four nodes that exist for the life of the session rather than a
 * megabyte of generated impulse response.
 *
 * It also carries the whole illusion of distance for the pipes: send a quiet
 * voice into this at 0.85 and what you hear is mostly the room's answer to it,
 * which is exactly what "somewhere past the trees" sounds like.
 */
function buildSpace(dest) {
  spaceIn = ctx.createGain();
  spaceIn.gain.value = 1;

  const tap = (time, fb, tone, level) => {
    const d = ctx.createDelay(1.0);
    d.delayTime.value = time;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = tone;
    const g = ctx.createGain();
    g.gain.value = fb;
    const out = ctx.createGain();
    out.gain.value = level;
    spaceIn.connect(d);
    d.connect(f);
    f.connect(g);
    g.connect(d); // feedback
    f.connect(out);
    out.connect(dest);
  };

  tap(0.191, 0.34, 2600, 0.22);
  tap(0.277, 0.29, 1900, 0.18);
}

/**
 * Wind. Unpitched by construction — two decorrelated copies of the same noise
 * buffer at different playback rates, lowpassed hard, with a slow swell. It is
 * what keeps the pre-satyr glade from sounding switched off, and because it has
 * no pitch it cannot fight the track's key when the track arrives.
 *
 * The two rates matter: one looping 2 s noise buffer has an audible two-second
 * pattern to it. Two, at incommensurate rates, do not repeat for minutes.
 */
function buildWind() {
  windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.5;

  windGain = ctx.createGain();
  windGain.gain.value = EPS;
  windFilter.connect(windGain);
  windGain.connect(ambBus);

  for (const rate of [0.83, 1.19]) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    s.connect(g);
    g.connect(windFilter);
    s.start(0, Math.random() * 1.9);
    windSrcs.push({ src: s, gain: g });
  }

  // A slow breath. Two LFOs at incommensurate rates so the swell never falls
  // into a period the ear can lock onto.
  for (const [rate, depth] of [[0.037, 0.34], [0.0113, 0.22]]) {
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    lfo.connect(amt);
    amt.connect(windSrcs[0].gain.gain);
    lfo.start();
    windSrcs.push({ src: lfo, gain: amt });
  }

  windGain.gain.exponentialRampToValueAtTime(windLevel(), ctx.currentTime + 5.0);
}

function windLevel() {
  // Open wild ground carries air; a secluded hollow is still. Never loud —
  // this is the floor of the mix, not a feature.
  return Math.max(EPS, lerp(0.012, 0.046, clamp01(mood.wildness) * 0.6 + (1 - clamp01(mood.seclusion)) * 0.4));
}

function build() {
  master = ctx.createGain();
  master.gain.value = EPS;
  master.connect(ctx.destination);

  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 14;
  comp.ratio.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.28;
  comp.connect(master);

  bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(comp);

  buildSpace(bus);

  const sub = (level, send) => {
    const g = ctx.createGain();
    g.gain.value = level;
    g.connect(bus);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(spaceIn);
    }
    return g;
  };

  pluckBus = sub(0.52, 0.34);
  ambBus = sub(0.40, 0.16);
  cueBus = sub(0.80, 0.40);
  // Quiet, and drenched. Most of what reaches the ear is the room's reply.
  pipeBus = sub(0.20, 0.85);

  // The music path, parallel to the compressor and under the same master.
  musicDuck = ctx.createGain();
  musicDuck.gain.value = 1;
  musicDuck.connect(master);
  musicGain = ctx.createGain();
  musicGain.gain.value = MUSIC_GAIN;
  musicGain.connect(musicDuck);

  noiseBuf = makeNoiseBuffer();
  buildWind();

  // Rise to the ceiling over three seconds.
  master.gain.exponentialRampToValueAtTime(muted ? EPS : MASTER_CEILING, ctx.currentTime + 3.0);
}

function teardown() {
  try {
    stopPasses(0);
    for (const w of windSrcs) {
      try {
        w.src.stop();
      } catch (_) {}
      try {
        w.src.disconnect();
        w.gain.disconnect();
      } catch (_) {}
    }
    // ctx.close() would drop these anyway, but disconnecting explicitly means
    // a context that fails to close still leaves nothing wired to the output.
    const all = [windFilter, windGain, pluckBus, ambBus, cueBus, pipeBus, spaceIn, bus, comp, musicGain, musicDuck, master];
    for (const n of all) {
      if (n) {
        try {
          n.disconnect();
        } catch (_) {}
      }
    }
  } catch (_) {}
  windSrcs = [];
  windFilter = windGain = null;
  master = comp = bus = pluckBus = ambBus = cueBus = pipeBus = spaceIn = null;
  musicGain = musicDuck = null;
  musicPlaying = false;
  nextPassAt = 0;
  noiseBuf = null;
  voices = 0;
  // musicBuf and musicState survive: the file is decoded once per page, and a
  // stop()/start() pair must not re-download five megabytes.
}

// ---------------------------------------------------------------------------
// THE TRACK
// ---------------------------------------------------------------------------

/**
 * Fetch and decode, once. Called from prime() on the first user gesture and
 * never plays anything by itself.
 *
 * Every failure path lands in the same place: `musicState = 'failed'`, one
 * console line, and the ambient layer carries on exactly as it was. A garden
 * with no mp3 is a quieter garden, not a broken one.
 */
function loadTrack(url) {
  if (musicLoad) return musicLoad;
  if (!ctx) return null;
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  if (!g || typeof g.fetch !== 'function' || typeof ctx.decodeAudioData !== 'function') {
    musicState = 'unsupported';
    return null;
  }
  musicState = 'loading';

  const decode = (data) =>
    new Promise((res, rej) => {
      // Safari only has the callback form; everyone else returns a promise.
      let p = null;
      try {
        p = ctx.decodeAudioData(data, res, rej);
      } catch (err) {
        rej(err);
        return;
      }
      if (p && typeof p.then === 'function') p.then(res, rej);
    });

  // THE ONE EXTERNAL ASSET. SPEC §1 permits exactly this file and no other;
  // tools/build.mjs's self-audit knows about it by name. A cross-origin or
  // file:// page will reject here, which is a failure path, not a crash.
  musicLoad = fetch(url)
    .then((res) => {
      if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?'));
      return res.arrayBuffer();
    })
    .then(decode)
    .then((buf) => {
      musicBuf = buf;
      musicState = 'ready';
      // The satyr may already have walked in while five megabytes were in
      // flight. If he did, this is the moment the music was waiting for.
      if (wantMusic) beginMusic();
      return buf;
    })
    .catch((err) => {
      musicState = 'failed';
      try {
        console.warn('[arcadia/audio] no music track (' + url + ') — the glade keeps its birds:', err && err.message ? err.message : err);
      } catch (_) {}
      return null;
    });

  return musicLoad;
}

/**
 * ONE PASS of the track, with its own gain, scheduled sample-accurately.
 *
 * The envelope is the whole loop mechanism. A pass rises over four seconds —
 * ARRIVE if it is the first, CROSS if it is a loop — then holds at unity for
 * the entire rest of the track and stops. It does not fade out, because the
 * file already does; see the curve note beside MUSIC_XFADE.
 *
 * Twelve seconds before it ends, `nextPassAt` says so, and the ambient
 * scheduler starts the following pass on top of it. What the ear gets in that
 * window is the track's quiet opening building underneath the track's loud
 * ending, and then the ending fading out from under it — which is not a seam,
 * it is a handover. See the note beside MUSIC_LEAD for the measurements that
 * chose twelve.
 */
function startPass(when, first) {
  if (!ctx || !musicBuf || !musicGain) return;
  if (passes.length >= 3) return; // cannot happen; a guard, not a policy

  const src = ctx.createBufferSource();
  src.buffer = musicBuf;
  const g = ctx.createGain();
  // Set as a VALUE, not as a scheduled event: setValueCurveAtTime is specified
  // to throw if any automation event falls inside its window, and an event at
  // exactly the curve's start time is a grey area that some engines refuse.
  // Both curves already begin at EPS, so the event was redundant anyway.
  g.gain.value = EPS;
  src.connect(g);
  g.connect(musicGain);

  const dur = musicBuf.duration;
  const rise = Math.min(first ? MUSIC_FADE_IN : MUSIC_XFADE, dur * 0.4);
  const ends = when + dur;

  // Up: whichever curve this pass is (see ARRIVE / CROSS above).
  g.gain.setValueCurveAtTime(first ? ARRIVE : CROSS, when, rise);
  // Down: nothing, until the last 350 ms. The track fades itself.
  g.gain.setValueAtTime(1, ends - TAIL_SAFETY);
  g.gain.exponentialRampToValueAtTime(EPS, ends);

  src.start(when);
  src.stop(ends + 0.05);

  const entry = { src, gain: g };
  passes.push(entry);
  src.onended = () => {
    const i = passes.indexOf(entry);
    if (i >= 0) passes.splice(i, 1);
    try {
      src.disconnect();
      g.disconnect();
    } catch (_) {}
  };

  // Five seconds before this pass ends, the next one begins. Never earlier
  // than the moment this one reached full level, however short a buffer
  // somebody hands us.
  nextPassAt = Math.max(when + rise, ends - MUSIC_LEAD);
  musicPlaying = true;
}

/** Ramp every live pass down and let go. `at` is a fade time in seconds. */
function stopPasses(at) {
  const t = ctx ? ctx.currentTime : 0;
  for (const p of passes.slice()) {
    try {
      const gp = p.gain.gain;
      // cancelScheduledValues cannot interrupt a value CURVE that has already
      // started — it only removes events at or after `t`. cancelAndHoldAtTime
      // can, so prefer it and keep the old call as the fallback for browsers
      // that never shipped it.
      if (typeof gp.cancelAndHoldAtTime === 'function') gp.cancelAndHoldAtTime(t);
      else gp.cancelScheduledValues(t);
      if (at > 0) {
        gp.setValueAtTime(Math.max(EPS, gp.value), t);
        gp.exponentialRampToValueAtTime(EPS, t + at);
      }
      p.src.stop(t + at + 0.02);
    } catch (_) {}
  }
  if (at <= 0) passes = [];
  musicPlaying = false;
  nextPassAt = 0;
}

/** Start the track if everything it needs is true. Idempotent and silent. */
function beginMusic() {
  if (!wantMusic) return;
  if (musicPlaying) return;
  if (!ctx || !running || !musicGain) return;
  if (musicState !== 'ready' || !musicBuf) return;
  startPass(ctx.currentTime + 0.06, true);
}

// ---------------------------------------------------------------------------
// Voices — every one of these is one-shot and self-disposing
// ---------------------------------------------------------------------------

function claimVoice() {
  if (voices >= MAX_VOICES) return false;
  voices++;
  return true;
}

function releaseOn(node, parts) {
  node.onended = () => {
    voices = Math.max(0, voices - 1);
    for (const p of parts) {
      try {
        p.disconnect();
      } catch (_) {}
    }
  };
}

/**
 * A plucked string. Fast attack, long decay, four partials with the top one
 * slightly inharmonic — which is the whole difference between a lyre and an
 * organ. Higher partials decay faster; low notes ring longer than high ones.
 *
 * This is now a CUE voice only. The generative figure that used to play it in
 * a loop is gone; the composed track has that job.
 */
function pluck(t, semis, amp = 1, dest = pluckBus, decayScale = 1) {
  if (!ctx || !dest) return;
  if (!claimVoice()) return;

  const f = freq(semis);
  const out = ctx.createGain();
  out.gain.value = amp;
  out.connect(dest);

  const partials = [
    [1.0, 0.085],
    [2.0, 0.036],
    [3.0, 0.017],
    [4.18, 0.008],
  ];

  // Low notes sustain; the top of the register is short and bright.
  const ring = 2.7 * decayScale * Math.max(0.45, 1.55 - semis / 34);
  const kept = [out];
  let last = null;
  let longest = 0;

  partials.forEach(([mult, level], i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'triangle' : 'sine';
    o.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    const dur = ring / (1 + i * 0.62);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.03);
    kept.push(o, g);
    if (dur > longest) {
      longest = dur;
      last = o;
    }
  });

  // Attached AFTER the loop, so `kept` holds every node the voice owns. The
  // longest-ringing partial is the one that outlives the rest, so its onended
  // is the moment the whole voice can be disconnected — one handler, one
  // decrement, nothing orphaned.
  if (last) releaseOn(last, kept);
  else voices = Math.max(0, voices - 1);

  // The plectrum. Ten milliseconds of highpassed noise — inaudible alone,
  // and the reason the note sounds struck rather than faded in.
  if (noiseBuf) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = 1;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.03 * amp, t);
    g.gain.exponentialRampToValueAtTime(EPS, t + 0.012);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    const off = Math.random() * 1.5;
    src.start(t, off, 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        hp.disconnect();
        g.disconnect();
      } catch (_) {}
    };
  }
}

/**
 * ONE NOTE OF THE SATYR'S PIPES — "thin and off-key, somewhere past the trees".
 *
 * Thin: a triangle with a weak second partial and no low end at all, so it has
 * no body. Off-key: `semis` is fractional by construction and gets another
 * ±45 cents of drift on top, because he cannot hold a note either. Past the
 * trees: highs rolled off at ~1.1 kHz (air eats treble over distance), panned
 * off-centre, and sent into the room far harder than it is heard dry.
 */
function pipe(t, semis, amp, dur, pan) {
  if (!ctx || !pipeBus) return;
  if (!claimVoice()) return;

  const kept = [];
  const out = ctx.createGain();
  out.gain.value = amp;
  kept.push(out);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = rnd(950, 1350);
  lp.Q.value = 0.7;
  out.connect(lp);
  kept.push(lp);

  let tail = lp;
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    lp.connect(p);
    kept.push(p);
    tail = p;
  }
  tail.connect(pipeBus);

  const f = freq(semis);
  let last = null;

  // Two partials only. A reed pipe heard across a valley is barely more than a
  // sine with a wobble on it.
  [[1.0, 0.13], [2.0, 0.028]].forEach(([mult, level], i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'triangle' : 'sine';
    o.frequency.value = f * mult;
    o.detune.value = rnd(-45, 45); // he cannot hold it steady either
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.07); // breathy, not struck
    g.gain.setValueAtTime(level, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.04);
    kept.push(o, g);
    last = o;
  });

  // The breath around the note. Without it this is a synth tone; with it, it
  // is somebody blowing across a reed badly.
  if (noiseBuf) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * rnd(1.8, 2.6);
    bp.Q.value = 3.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.05);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.04);
    kept.push(src, bp, g);
  }

  if (last) releaseOn(last, kept);
  else voices = Math.max(0, voices - 1);
}

/** A bird: two to four narrow-band noise chirps with a glide. */
function bird(t) {
  if (!ctx || !ambBus || !noiseBuf) return;
  if (!claimVoice()) return;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = rnd(14, 22);

  const g = ctx.createGain();
  g.gain.setValueAtTime(EPS, t);

  src.connect(bp);
  bp.connect(g);
  g.connect(ambBus);

  const n = 2 + Math.floor(Math.random() * 3);
  const centre = rnd(2900, 4300);
  const level = 0.055 * lerp(0.7, 1.15, clamp01(mood.seclusion));
  let at = t;
  for (let i = 0; i < n; i++) {
    const up = Math.random() < 0.6;
    const a = centre * rnd(0.9, 1.1);
    const b = a * (up ? rnd(1.15, 1.4) : rnd(0.7, 0.88));
    const dur = rnd(0.045, 0.085);
    bp.frequency.setValueAtTime(a, at);
    bp.frequency.exponentialRampToValueAtTime(b, at + dur);
    g.gain.setValueAtTime(EPS, at);
    g.gain.exponentialRampToValueAtTime(level, at + 0.007);
    g.gain.exponentialRampToValueAtTime(EPS, at + dur);
    at += dur + rnd(0.07, 0.16);
  }

  src.start(t, Math.random() * 1.5);
  src.stop(at + 0.1);
  releaseOn(src, [src, bp, g]);
}

/**
 * Water: a slow swell of low-band noise. Never a loop, always an event.
 *
 * A waterfall changes it in three ways at once, which is what makes it read as
 * a different body of water rather than the same one turned up: it is louder,
 * it is brighter (falling water has hiss in it that a pond does not), and its
 * swell is faster. `mood.waterfall` is 0..1 by nearness, so walking the camera
 * toward the drop brings the sound up continuously.
 */
function water(t) {
  if (!ctx || !ambBus || !noiseBuf) return;
  if (!claimVoice()) return;

  const fall = clamp01(mood.waterfall);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = rnd(700, 1400) * lerp(1, 1.9, fall);
  bp.Q.value = rnd(0.8, 1.6) * lerp(1, 0.6, fall); // wider = more hiss

  const g = ctx.createGain();
  const wet = Math.max(clamp01(mood.moisture), clamp01(mood.water));
  const level = 0.05 * lerp(0.4, 1.0, wet) * lerp(1, 2.3, fall);
  const dur = rnd(1.1, 2.0) * lerp(1, 0.6, fall);
  g.gain.setValueAtTime(EPS, t);
  g.gain.exponentialRampToValueAtTime(level, t + dur * lerp(0.35, 0.18, fall));
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);

  src.connect(bp);
  bp.connect(g);
  g.connect(ambBus);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
  releaseOn(src, [src, bp, g]);
}

// ---------------------------------------------------------------------------
// The ambient scheduler
// ---------------------------------------------------------------------------

/**
 * How often each ambient layer fires, in seconds between events.
 *
 * AUDIO.md: birdsong follows the MOISTURE and MATURITY of the region on screen.
 * An old, damp, shaded glade is full of birds; a fresh gravel yard has almost
 * none, and the difference is the single clearest way the score tells the
 * player what they have made.
 */
function rates() {
  const m = clamp01(mood.maturity);
  const w = clamp01(mood.wildness);
  const wet = Math.max(clamp01(mood.moisture), clamp01(mood.water));
  const fall = clamp01(mood.waterfall);
  return {
    bird: lerp(15.0, 3.0, m * 0.55 + wet * 0.3 + w * 0.15),
    // Below a trickle there is nothing to hear at all; Infinity means "never".
    water: wet < 0.06 && fall < 0.02 ? Infinity : lerp(11.0, 1.6, Math.max(wet, fall * 0.9)),
  };
}

function pump() {
  if (!running || !ctx) return;
  const myGen = gen;
  try {
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const r = rates();

    // Resync guard. If a background tab froze the timer, the "next" times are
    // far in the past; catching up would fire a burst. Jump forward instead.
    if (nextBird < now - 2) nextBird = now + rnd(1, 4);
    if (nextWater < now - 2) nextWater = now + rnd(1, 4);

    let guard = 0;
    while (nextBird < horizon && guard++ < 12) {
      bird(nextBird);
      nextBird += r.bird * rnd(0.5, 1.8);
    }
    guard = 0;
    while (isFinite(r.water) && nextWater < horizon && guard++ < 12) {
      water(nextWater);
      nextWater += r.water * rnd(0.6, 1.6);
    }
    if (!isFinite(r.water)) nextWater = now + 4;

    // THE CROSSFADE, scheduled from the same lookahead as everything else.
    // `nextPassAt` was set by the pass that is currently playing, five seconds
    // before it ends. A frozen tab can push it into the past; max() then makes
    // the overlap shorter rather than restarting the track from a jump cut.
    if (musicPlaying && musicBuf && nextPassAt > 0 && nextPassAt < horizon) {
      startPass(Math.max(nextPassAt, now + 0.05), false);
    }
  } catch (err) {
    // A scheduling fault stops the ambience, not the game.
    running = false;
    try {
      console.warn('[arcadia/audio] scheduler stopped:', err);
    } catch (_) {}
    return;
  }
  if (gen === myGen && running) timer = setTimeout(pump, TICK_MS);
}

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

/**
 * Dip the music so a cue can be heard through it. Three decibels — enough that
 * the ear notices the cadence and not the duck. If there is no music playing
 * this does nothing at all, which is the whole reason it lives on its own node
 * rather than inside the cue.
 */
function duckMusic(t, depth = DUCK) {
  if (!musicDuck || !musicPlaying) return;
  const g = musicDuck.gain;
  try {
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(EPS, g.value), t);
    g.linearRampToValueAtTime(depth, t + 0.18);
    g.setValueAtTime(depth, t + DUCK_HOLD);
    g.linearRampToValueAtTime(1, t + DUCK_HOLD + DUCK_RELEASE);
  } catch (_) {}
}

const CUES = {
  /**
   * The settle cadence. The only moment in the whole game the music is
   * allowed to be noticed: an ascending arpeggio that lands on the tonic two
   * octaves up. It used to swell the pad underneath itself; now it ducks the
   * TRACK underneath itself instead, which is the same gesture pointed the
   * other way and works with a piece of music we did not write.
   */
  settle(t) {
    const arp = [-5, 0, 4, 7, 12, 16, 19, 24];
    arp.forEach((s, i) => {
      const last = i === arp.length - 1;
      pluck(t + i * 0.115, s, last ? 1.25 : 0.85, cueBus, last ? 1.7 : 1.0);
    });
    duckMusic(t);
  },

  /** A trace, not a creature. One high note and a bird answering it. */
  sighted(t) {
    pluck(t, 19, 0.55, cueBus, 1.2);
    bird(t + 0.45);
  },

  /** It walked in. Two notes rising, unresolved — an invitation. */
  visit(t) {
    pluck(t, 7, 0.6, cueBus);
    pluck(t + 0.19, 14, 0.7, cueBus, 1.3);
  },

  /** A second individual. The settle cadence's smaller cousin. */
  thrive(t) {
    [0, 7, 12, 16].forEach((s, i) => pluck(t + i * 0.13, s, 0.8, cueBus, i === 3 ? 1.5 : 1));
    duckMusic(t, lerp(DUCK, 1, 0.4)); // a smaller moment, a smaller dip
  },

  /** Placement. Barely there — a soft low note, felt more than heard. */
  place(t) {
    pluck(t, POOL[Math.floor(Math.random() * 4)], 0.32, pluckBus, 0.7);
  },

  /** Removal. Lower, shorter. Nothing was lost; nothing sounds lost. */
  remove(t) {
    pluck(t, -5, 0.26, pluckBus, 0.5);
  },

  /** New content became available. Warm, brief, no fanfare. */
  unlock(t) {
    pluck(t, 12, 0.6, cueBus);
    pluck(t + 0.14, 16, 0.6, cueBus, 1.3);
  },

  /** Pan. Held back to one very low note and its two answers. */
  pan(t) {
    pluck(t, -12, 1.0, cueBus, 2.2);
    pluck(t + 0.9, -5, 0.7, cueBus, 2.0);
    pluck(t + 1.7, 0, 0.9, cueBus, 2.4);
    duckMusic(t, lerp(DUCK, 1, 0.2));
  },

  /**
   * THE PIPES. "Pipes, thin and off-key, somewhere past the trees."
   *
   * The satyr's approach tells are the game's hint system promising music. This
   * is the promise being kept before the track arrives: as the tells escalate
   * the figure gets longer, a shade louder and a shade nearer, and then he
   * walks in and the real music starts. Cost: one procedural voice we already
   * had, and no new assets.
   *
   * `opts.strength` is 0..1 — main.js derives it from the tell index, so tell
   * one is three sour notes you might have imagined and tell four is unmistakable.
   */
  pipes(t, opts) {
    const s = clamp01(opts && typeof opts.strength === 'number' ? opts.strength : 0.5);
    const n = 3 + Math.floor(s * 3 + Math.random());
    // Off to one side. Never centred: a sound in front of you is not "past the
    // trees", it is in the garden.
    const pan = (Math.random() < 0.5 ? -1 : 1) * rnd(0.45, 0.85);
    const amp = lerp(0.30, 0.85, s);
    let at = t + rnd(0, 0.25);
    let ix = Math.floor(Math.random() * PIPE_POOL.length);
    for (let i = 0; i < n; i++) {
      // A drunken walk through a scale that is not a scale. He is noodling.
      ix = Math.max(0, Math.min(PIPE_POOL.length - 1, ix + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2))));
      const dur = rnd(0.22, 0.55);
      pipe(at, PIPE_POOL[ix] + rnd(-0.25, 0.25), amp * rnd(0.7, 1.0), dur, pan);
      at += dur * rnd(0.75, 1.1) + rnd(0.03, 0.22);
    }
  },
};

// Cues that are aliases of each other, so callers can use whichever verb
// their module already speaks without needing to know ours.
const CUE_ALIAS = {
  settled: 'settle',
  settles: 'settle',
  visits: 'visit',
  visited: 'visit',
  thrives: 'thrive',
  sight: 'sighted',
  placed: 'place',
  removed: 'remove',
  unlocked: 'unlock',
  pipe: 'pipes',
  tell: 'pipes',
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the graph and start the clock. Must be called from a user gesture. */
export const start = safe(function start() {
  if (running && ctx) return true;
  const Ctor = AudioCtor();
  if (!Ctor) return false; // no Web Audio: the game is silent and fine

  if (!ctx) {
    ctx = new Ctor();
    build();
  }
  running = true;
  gen++;

  const t = ctx.currentTime;
  nextBird = t + rnd(3, 8);
  nextWater = t + rnd(2, 6);

  const go = () => {
    ready = ctx ? ctx.state === 'running' : false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(pump, 40);
    // A garden restored with the trigger already fired, or a satyr who arrived
    // while the file was still downloading: either way, this is where it lands.
    beginMusic();
  };

  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    const p = ctx.resume();
    if (p && typeof p.then === 'function') p.then(go, go);
    else go();
  } else {
    go();
  }
  return true;
});

/**
 * STEP ONE OF THE TRIGGER. Call from the first user gesture.
 *
 * Resumes the context, brings up the ambient layer, and starts the download and
 * decode of the track — and plays NOTHING. Autoplay policy will not let a game
 * event start audio, so the expensive, permission-requiring half of the work
 * happens on the click that places a plant and the cheap half happens later,
 * when the satyr walks in. By then the player has certainly clicked, because
 * placing things is how satyrs arrive in the first place.
 */
export const prime = safe(function prime(url) {
  start();
  if (!ctx) return false;
  loadTrack(typeof url === 'string' && url ? url : MUSIC_URL);
  return true;
});

/**
 * STEP TWO OF THE TRIGGER — the owner's key requirement.
 *
 * A satyr has walked onto the map. Satyrs are the musicians; the glade has been
 * quiet until now on purpose, so that this reads as an arrival and not as a
 * bug. Fires on the `visits` rung, not only on `settles`: the desaturated
 * preview visit is a big moment and deserves the music.
 *
 * Safe to call any number of times. If the decode has not finished the intent
 * is remembered and the track starts the instant it does.
 */
export const unlockMusic = safe(function unlockMusic() {
  musicUnlocked = true;
  wantMusic = true;
  if (ctx && musicState === 'idle') loadTrack(MUSIC_URL);
  beginMusic();
  return musicPlaying;
});

/**
 * Restore the flag from a save. Same effect as unlockMusic() — a garden that
 * already has a satyr living in it should start its music once primed rather
 * than sit in silence waiting for a "first" arrival that already happened.
 * Named separately so the call site reads as restoration, not as an event.
 */
export const setMusicUnlocked = safe(function setMusicUnlocked(b) {
  if (!b) {
    musicUnlocked = false;
    wantMusic = false;
    return false;
  }
  return unlockMusic();
});

/** Ramp out and let go of the graph. A later start() rebuilds from scratch. */
export const stop = safe(function stop() {
  running = false;
  ready = false;
  gen++;
  const mine = gen;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!ctx) return;
  const c = ctx;
  try {
    stopPasses(0.25);
  } catch (_) {}
  try {
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setTargetAtTime(EPS, c.currentTime, 0.12);
  } catch (_) {}
  setTimeout(() => {
    if (gen !== mine) return; // something started again; leave it alone
    teardown();
    try {
      if (c.close) c.close();
    } catch (_) {}
    if (ctx === c) ctx = null;
  }, 600);
});

/**
 * Tell the score what the player is looking at. Fields are 0..1; partial
 * objects are fine — anything omitted keeps its previous value. Called a
 * couple of times a second by main.js from the visible region.
 */
export const setMood = safe(function setMood(m) {
  if (!m || typeof m !== 'object') return;
  for (const k of Object.keys(mood)) {
    if (typeof m[k] === 'number') mood[k] = clamp01(m[k]);
  }
  if (!ctx || !running) return;
  const t = ctx.currentTime;
  // Only the continuous parameters move here; the event rates are read fresh
  // by the scheduler, so they need no ramping at all.
  if (windGain) windGain.gain.setTargetAtTime(windLevel(), t, 3.0);
  if (windFilter) {
    // A wilder, more overgrown slope has more for the air to catch on.
    windFilter.frequency.setTargetAtTime(lerp(320, 620, clamp01(mood.wildness)), t, 4.0);
  }
  if (ambBus) {
    // A secluded corner is quieter overall; an open one carries further.
    ambBus.gain.setTargetAtTime(lerp(0.30, 0.48, 1 - mood.seclusion * 0.5), t, 2.0);
  }
});

/**
 * Fire a one-shot. Unknown names are a deliberate no-op.
 * `opts` is passed straight through — only `pipes` reads it (`{strength}`).
 */
export const cue = safe(function cue(name, opts) {
  if (!ctx || !running || !name) return;
  const key = CUE_ALIAS[name] || name;
  const fn = CUES[key];
  if (!fn) return;
  fn(ctx.currentTime + 0.03, opts);
});

/** Mute without stopping. The clock keeps running so unmuting is seamless. */
export const setMuted = safe(function setMuted(b) {
  muted = !!b;
  if (!ctx || !master) return;
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setTargetAtTime(muted ? EPS : MASTER_CEILING, t, 0.18);
});

/** Diagnostics for the sprite lab / console. Never used by the game itself. */
export const stats = safe(function stats() {
  return {
    ready,
    muted,
    running,
    voices,
    state: ctx ? ctx.state : 'none',
    music: {
      unlocked: musicUnlocked,
      load: musicState,
      playing: musicPlaying,
      passes: passes.length,
      // 1 normally, ~0.71 while a cue is ducking it. Visible here so the duck
      // can be checked without a pair of ears.
      duck: musicDuck ? Math.round(musicDuck.gain.value * 1000) / 1000 : 1,
      duration: musicBuf ? Math.round(musicBuf.duration * 10) / 10 : 0,
      nextPassIn: musicPlaying && ctx && nextPassAt ? Math.round(nextPassAt - ctx.currentTime) : null,
    },
    mood: Object.assign({}, mood),
  };
});

const audio = {
  start,
  prime,
  unlockMusic,
  setMusicUnlocked,
  stop,
  setMood,
  cue,
  setMuted,
  stats,
  MUSIC_URL,
  get muted() {
    return muted;
  },
  get ready() {
    return ready;
  },
  get musicUnlocked() {
    return musicUnlocked;
  },
  get musicState() {
    return musicState;
  },
};

export { audio };
export default audio;
