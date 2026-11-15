// Pure terrain math for the 320m x 320m basin. +X = east, -Z = north.
export const SIZE = 320, HALF = 160, WATER_Y = -0.7;
export const CAMP = { x: 0, z: 92 };
export const C1 = { x: 122, z: 0 };     // East: Flooded Water & Mirror Ruins
export const C2 = { x: -92, z: -92 };   // North-West: Razorback Gorge & Fire-Vine Shrine
export const C3 = { x: -95, z: 95 };    // South-West: Earth Hollow
export const D2 = { x: Math.SQRT1_2, z: Math.SQRT1_2 };   // from C2 toward the basin centre
export const N2 = { x: Math.SQRT1_2, z: -Math.SQRT1_2 };  // lateral axis at C2
export const SUMMIT_Y = 28;

export function ss(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { return vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15; }

export function riverCx(z) { return 88 + 5 * Math.sin(z / 45); }
export function s2local(x, z) {
  const dx = x - C2.x, dz = z - C2.z;
  return { r: Math.hypot(dx, dz), d: dx * D2.x + dz * D2.z, l: dx * N2.x + dz * N2.z };
}
export function s2world(d, l) { return { x: C2.x + D2.x * d + N2.x * l, z: C2.z + D2.z * d + N2.z * l }; }
export function chasmMask(x, z) {
  const { r, d } = s2local(x, z);
  if (r > 52) return 0;
  const ring = ss(31, 33.5, r) * (1 - ss(48.5, 51, r));
  const cut = r < 33.5 ? ss(5, 7.5, d) * (1 - ss(14.5, 17, d)) : 0;
  return Math.max(ring, cut);
}
export function moatMask(x, z) { const r = Math.hypot(x, z); return ss(54.5, 57, r) * (1 - ss(61, 63.5, r)); }
export function riverMask(x, z) { return 1 - ss(9.5, 13, Math.abs(x - riverCx(z))); }

export function flatMask(x, z) {
  return Math.max(
    1 - ss(66, 80, Math.hypot(x, z)),
    1 - ss(52, 62, Math.hypot(x - C2.x, z - C2.z)),
    1 - ss(34, 44, Math.hypot(x - C3.x, z - C3.z)),
    1 - ss(22, 32, Math.hypot(x - C1.x, z - C1.z)),
    1 - ss(10, 18, Math.hypot(x - CAMP.x, z - CAMP.z)),
  );
}
export function heightAt(x, z) {
  const hills = fbm(x * 0.021 + 3.1, z * 0.021 + 7.7) * 6.5 + (fbm(x * 0.08, z * 0.08) - 0.5) * 1.4;
  let h = Math.max(0, hills) * (1 - flatMask(x, z));
  const nearRiver = 1 - ss(13, 24, Math.abs(x - riverCx(z)));
  h = h * (1 - nearRiver * 0.9) + nearRiver * 0.15;
  h += (-4.5 - h) * riverMask(x, z);
  h += (-24 - h) * chasmMask(x, z);
  h += (-6 - h) * moatMask(x, z);
  h += ss(146, 160, Math.max(Math.abs(x), Math.abs(z))) * 34;
  return h;
}
// Y below which the player is considered lost (river rapids, gorge, thorn moat).
export function hazardY(x, z) {
  if (chasmMask(x, z) > 0.5) return -9;
  if (moatMask(x, z) > 0.5) return -3.6;
  if (riverMask(x, z) > 0.5) return WATER_Y - 1.0;
  return -Infinity;
}
export function zoneAt(x, y, z) {
  const r0 = Math.hypot(x, z);
  if (r0 < 9 && y > 26) return 'Summit Altar';
  if (r0 < 53) return 'Sun-Spire Ziggurat';
  if (r0 < 66) return 'Thorn Moat';
  if (Math.hypot(x - C1.x, z - C1.z) < 24) return 'Flooded Mirror Ruins';
  if (Math.abs(x - riverCx(z)) < 15) return 'River Crossing';
  const s = s2local(x, z);
  if (s.r < 31) return s.d < 6 ? 'Fire-Vine Shrine' : 'Waterfall Chasm';
  if (s.r < 58) return 'Razorback Gorge';
  if (Math.hypot(x - C3.x, z - C3.z) < 38) return 'Earth Hollow';
  if (Math.hypot(x - CAMP.x, z - CAMP.z) < 20) return 'Frontier Base Camp';
  return 'Verdant Basin';
}
