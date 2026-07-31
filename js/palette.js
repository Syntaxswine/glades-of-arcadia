// palette.js — the whole game's colour, in ramps.
//
// Every sprite and every composer draws from these keys and no others. That
// single constraint is what makes a game drawn by many hands look like it was
// drawn by one. Ramps run DARK -> LIGHT. Shadows shift cool, highlights shift
// warm, roughly 10-15 degrees of hue per step, which buys apparent depth for
// free — the period trick.
//
// Values are Mediterranean and desaturated: olive greens, ochre earth, ivory
// marble. Nothing here is a pure hue and nothing should become one.

export const RAMPS = {
  // Main deciduous foliage.
  canopy: { keys: 'abcde', hex: ['#1E2A1C', '#2F4526', '#47632F', '#6B8A3E', '#9DB255'] },
  // Dry Mediterranean scrub, olive, sun-bleached leaf.
  olive: { keys: 'fghi', hex: ['#2A2E1B', '#45492A', '#62663A', '#8A8B52'] },
  // Cool dark conifer — cypress, pine.
  cypress: { keys: 'jkl', hex: ['#16221E', '#26382E', '#3C5342'] },
  // The ground the player walks on.
  grass: { keys: 'mnop', hex: ['#3B4A22', '#55672D', '#74863C', '#96A551'] },
  // Path, tilled soil, bark, timber.
  earth: { keys: 'qrstu', hex: ['#3A2A1C', '#57402A', '#7A5C3C', '#9E7D52', '#C0A176'] },
  // Warm grey stone — boulders, grotto, rubble.
  rock: { keys: 'vwxy', hex: ['#2C2823', '#474138', '#675E50', '#8A7F6D'] },
  // Marble and limestone. The Zeus signature — sculpture lives here.
  marble: { keys: 'ABCDE', hex: ['#6B6154', '#93887A', '#BAAF9E', '#DDD2BE', '#F2EADA'] },
  // Six entries because this ramp is sized for palette cycling (see cycleWater).
  //
  // Tuned deliberately: a DEEP body with one desaturated near-white glint at
  // the top, rather than an evenly bright ramp. The first version measured
  // mean luminance 0.484 with peak saturation 0.426 — legibly "tropical
  // lagoon" rather than Greek spring, and high key overall.
  //
  // The fix is not simply to darken. The shimmer the cycling produces comes
  // from the size of the jump between ADJACENT steps, so flattening the ramp
  // kills the effect (measured: shimmer 0.155 -> 0.114). What actually works
  // is that brightness reads as tropical only when it is SATURATED; a bright
  // desaturated step reads as glint. So the body drops and the top stays
  // bright but loses its colour:
  //
  //   mean luminance  0.484 -> 0.365   (25% lower key)
  //   peak saturation 0.426 -> 0.281   (out of tropical range)
  //   shimmer         0.155 -> 0.245   (58% MORE sparkle)
  //
  // SECOND PASS — the owner's call, and the important one. That ramp still
  // spanned 61% dark-to-light, and across a whole pond the dithering read as
  // churn or foam rather than as a water SURFACE. Water is mostly flat; a wide
  // value range is what makes it look agitated.
  //
  // Span is now held to 30% dark-to-light. THIS IS THE GOVERNING NUMBER —
  // if the ramp is ever retuned, keep the span at ~0.30 and move the mean.
  //
  //   span  0.614 -> 0.298   (61% -> 30%)
  //   mean  0.365 -> 0.310   (calmer and slightly deeper)
  //   steps even at ~0.06 each, so cycling still reads as movement
  //
  // Saturation still falls from dark to light (0.51 -> 0.26): the deep water
  // keeps its colour, the glint goes pale rather than bright mint. That is
  // what stops a light value reading as tropical.
  water: { keys: 'FGHIJK', hex: ['#122E38', '#1A3F4A', '#23515A', '#2F6168', '#3C7274', '#4B807F'] },
  sky: { keys: 'LMN', hex: ['#7FA8C4', '#A2C4D8', '#C6DCE7'] },
  terracotta: { keys: 'PQRS', hex: ['#4A2118', '#7A3624', '#A85238', '#D08252'] },
  gold: { keys: 'TUVW', hex: ['#5A3D12', '#8C6420', '#C08F2E', '#E9C158'] },
};

// A handful of pixels each. Accents are outside the ramp discipline on purpose
// — they are the flowers, and flowers are allowed to sing.
export const ACCENT = {
  1: '#8E1F2A', // deep blossom
  2: '#C8414A', // blossom
  3: '#E88F9E', // pale blossom
  4: '#A46EBE', // iris
  5: '#E6C64A', // bloom / broom / celandine
  6: '#2A2620', // universal shadow mixer — the only near-black in the game
  7: '#F2EADA', // unicorn white, moonflower, narcissus
};

/**
 * THE LOAD-BEARING RELATIONSHIP.
 *
 * grass mid (#74863C) is LIGHTER than canopy mid (#47632F).
 *
 * Trees must read dark against the ground. This is how Zeus keeps a map busy
 * with foliage and still legible at a glance. If a future edit "brightens the
 * trees" or "darkens the grass" the whole screen turns to mush. Do not.
 */
export const CANOPY_MUST_BE_DARKER_THAN_GRASS = true;

// key -> '#rrggbb', built once.
const MAP = new Map();
for (const ramp of Object.values(RAMPS)) {
  ramp.keys.split('').forEach((k, i) => MAP.set(k, ramp.hex[i]));
}
for (const [k, hex] of Object.entries(ACCENT)) MAP.set(k, hex);

/** The palette as the rasteriser wants it: has(key) / get(key). */
export const PALETTE = {
  has: (k) => MAP.has(k),
  get: (k) => MAP.get(k),
  keys: () => [...MAP.keys()],
  size: MAP.size,
};

/** Resolver for `rasterise(sprite, resolve)`. */
export const resolve = (k) => MAP.get(k);

/** Which ramp a key belongs to, and its index — used by the shading pass. */
export function rampOf(key) {
  for (const [name, ramp] of Object.entries(RAMPS)) {
    const i = ramp.keys.indexOf(key);
    if (i !== -1) return { name, ramp, index: i };
  }
  return null;
}

/**
 * Step a key along its own ramp, clamped. `shade('c', -2)` is how you darken
 * something correctly — by moving down its ramp, never by multiplying RGB.
 * Accents have no ramp and are returned unchanged.
 */
export function shade(key, steps) {
  const at = rampOf(key);
  if (!at) return key;
  const i = Math.max(0, Math.min(at.ramp.keys.length - 1, at.index + steps));
  return at.ramp.keys[i];
}

/**
 * Contact shadow colour for an object sitting on a given ground key: the
 * ground ramp darkened two steps. Never translucent black — that greys the
 * whole scene and is the clearest tell of a modern fake.
 */
export function contactShadow(groundKey) {
  return shade(groundKey, -2);
}

/**
 * Palette cycling — how period isometric games animated water for free.
 * Returns a resolver that rotates the water ramp by `phase` steps and leaves
 * every other key alone. Re-rasterise only water tiles when the phase changes.
 */
export function cycleWater(phase) {
  const keys = RAMPS.water.keys;
  const hex = RAMPS.water.hex;
  const n = keys.length;
  const shifted = new Map(MAP);
  for (let i = 0; i < n; i++) {
    shifted.set(keys[i], hex[(i + Math.floor(phase) % n + n) % n]);
  }
  return (k) => shifted.get(k);
}

/**
 * A variant resolver that maps one ramp onto another — the cheap period trick
 * that gives an autumn tree or a moonlit statue for free, from the same rows.
 *   variant({ canopy: 'terracotta' })  ->  the same tree, turned.
 */
export function variant(rampSwaps) {
  const swapped = new Map(MAP);
  for (const [fromName, toName] of Object.entries(rampSwaps)) {
    const from = RAMPS[fromName];
    const to = RAMPS[toName];
    if (!from || !to) continue;
    from.keys.split('').forEach((k, i) => {
      // Map proportionally so ramps of different lengths still line up.
      const t = from.keys.length === 1 ? 0 : i / (from.keys.length - 1);
      const j = Math.round(t * (to.hex.length - 1));
      swapped.set(k, to.hex[j]);
    });
  }
  return (k) => swapped.get(k);
}
