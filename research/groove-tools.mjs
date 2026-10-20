// SPDX-License-Identifier: GPL-3.0-only
// Pattern ideas after MerthSloop's groove browser and ristiisa's DICE, independently
// implemented for BRKLOOP's native SLOOP preview representation (16 drum lanes).
// Deterministic seeds make preview and apply identical; no browser or audio dependencies.
export const GROOVE_STYLES = Object.freeze([
  ['HOUSE', 'Four-to-the-floor'],
  ['BREAK', 'Broken beat'],
  ['BOOM_BAP', 'Boom bap'],
  ['DNB', 'Drum & bass'],
  ['AMAPIANO', 'Amapiano'],
]);

const styles = new Set(GROOVE_STYLES.map(([key]) => key));
function random(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6D2B79F5) >>> 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function empty() {
  return {on: 0, lvl: Array(16).fill(0), rat: Array(16).fill(0)};
}
function hit(s, lane, level = 2) {
  s.on |= 1 << lane;
  s.lvl[lane] = level;
}
function patternBar(style, rng, bar) {
  const out = Array.from({length: 16}, empty);
  const place = (lane, steps, level = 2) => {
    for (const index of steps) hit(out[index], lane, level);
  };
  if (style === 'HOUSE') {
    place(0, [0,4,8,12], 2); place(2, [4,12], 3);
    place(4, [2,6,10,14], 2); place(5, [7,15], 1);
  } else if (style === 'BREAK') {
    place(0, [0,6,10], 2); place(2, [4,12], 3);
    place(4, [0,2,4,6,8,10,12,14], 1); place(7, [3,11], 1);
  } else if (style === 'BOOM_BAP') {
    place(0, [0,7,10], 3); place(2, [4,12], 3);
    place(4, [2,6,10,14], 1); place(3, [12], 1);
  } else if (style === 'DNB') {
    place(0, [0,3,10], 3); place(2, [4,12], 3);
    place(4, [0,2,4,6,8,10,12,14], 1);
    place(5, [7,15], 1);
  } else if (style === 'AMAPIANO') {
    place(0, [0,7,11], 2); place(2, [4,12], 2);
    place(4, [2,6,10,14], 1);
    place(7, [3,11], 1); place(9, [6,14], 1);
  }
  // Musically bounded mutations: preserve main snare backbeats and beat-1 kick.
  // Only hats/percussion/optional offbeat kicks vary; a seed is fully reproducible.
  for (const step of [1,3,5,7,9,11,13,15]) {
    if (rng() < 0.12) hit(out[step], 4, 1);
    if (rng() < 0.06) hit(out[step], 13, 1);
  }
  if (bar > 0 && rng() < 0.45) hit(out[15], 7, 1);
  if (rng() < 0.42) hit(out[14], 0, 1);
  if (bar % 2 === 1 && rng() < 0.32) hit(out[14], 2, 1);
  return out;
}
export function generateDrumGroove({length = 16, style = 'HOUSE', seed = 1} = {}) {
  if (!Number.isInteger(length) || length < 1 || length > 64)
    throw new RangeError('Groove LEN must be 1..64');
  if (!styles.has(style)) throw new RangeError('Unknown groove style');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF)
    throw new RangeError('Groove seed must be an unsigned 32-bit integer');
  const rng = random(seed);
  const steps = Array.from({length: 64}, empty);
  for (let base = 0; base < length; base += 16) {
    const bar = patternBar(style, rng, base / 16);
    for (let i = base; i < Math.min(length, base + 16); i++) steps[i] = bar[i - base];
  }
  return {style, seed, length, steps};
}
export function grooveSummary(groove) {
  if (!groove || !Array.isArray(groove.steps)) throw TypeError('Invalid groove');
  const counts = {kick:0, snare:0, hats:0, percussion:0};
  for (const step of groove.steps.slice(0,groove.length)) {
    if (step.on & (1<<0)) counts.kick++;
    if (step.on & (1<<2)) counts.snare++;
    if (step.on & ((1<<4)|(1<<5))) counts.hats++;
    if (step.on & ((1<<7)|(1<<9)|(1<<13))) counts.percussion++;
  }
  return counts;
}
