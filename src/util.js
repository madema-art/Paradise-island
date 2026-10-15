export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
export const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a, b, k) => -smin(-a, -b, k);

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _r = mulberry32(20241011);
// the helpers draw from _s, which recordDraws and replayDraws swap for a while (see below); normally it is the world's stream
let _s = _r;
export const rnd = () => _s();
export const rr = (a, b) => a + (b - a) * _s();
export const pick = (arr) => arr[Math.floor(_s() * arr.length)];
export const rsign = () => (_s() < 0.5 ? -1 : 1);
/** spend n draws of the world's random stream without using them: when a builder is replaced by one with its own generator, this keeps every later placement exactly where it was */
export const burn = (n) => { for (let i = 0; i < n; i++) _r(); };
/** runs fn as usual (the world's stream is spent as normal) and returns its result with the values it drew */
export function recordDraws(fn) {
  const prev = _s, values = [];
  _s = () => { const v = prev(); values.push(v); return v; };
  try { return { result: fn(), values }; } finally { _s = prev; }
}
/** runs fn with the recorded values given back in order, so a builder makes the same choices again; the world's stream is not spent */
export function replayDraws(values, fn) {
  const prev = _s; let i = 0;
  _s = () => { if (i >= values.length) throw new Error('replayDraws: ran past the recorded draws'); return values[i++]; };
  try { return fn(); } finally { _s = prev; }
}

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
