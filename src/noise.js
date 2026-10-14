import { mulberry32, lerp } from './util.js';

const p = new Uint8Array(512);
{
  const r = mulberry32(7);
  const a = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function g(h, x, y) {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x * 1.4;
    case 5: return -x * 1.4;
    case 6: return y * 1.4;
    default: return -y * 1.4;
  }
}
/** Perlin-ish gradient noise, roughly -1..1 */
export function noise2(x, y) {
  const fx = Math.floor(x), fy = Math.floor(y);
  const X = fx & 255, Y = fy & 255;
  x -= fx; y -= fy;
  const u = fade(x), v = fade(y);
  const a = p[X] + Y, b = p[X + 1] + Y;
  return (
    lerp(
      lerp(g(p[a], x, y), g(p[b], x - 1, y), u),
      lerp(g(p[a + 1], x, y - 1), g(p[b + 1], x - 1, y - 1), u),
      v
    ) * 0.8
  );
}
export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
