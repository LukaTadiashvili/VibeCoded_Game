// Shared game context. Every module reads/writes through G.
export const G = {
  simTime: 0,
  started: false,
  errors: [],
  timers: [],
  targets: [],        // things bending can hit: {pos, radius, active, hit(element, kind, info)}
  interactables: [],  // {pos, range, label, active(), act()}
  freezables: [],     // {pos, radius, freeze(dur)}
  shrines: [],        // Vector3 positions of chi shrines
  enemyProjectiles: [],
  updaters: [],       // fixed-step updaters fn(dt)
  frameUpdaters: [],  // per-render-frame updaters fn(dt)
  input: { mx: 0, my: 0, held: {}, queue: [], yaw: 0, pitch: 0.28, lookIdle: 9, sprint: false },
};

export function schedule(delay, fn) { G.timers.push({ t: G.simTime + delay, fn }); }
export function runTimers() {
  for (let i = G.timers.length - 1; i >= 0; i--) {
    if (G.timers[i].t <= G.simTime) { const f = G.timers[i].fn; G.timers.splice(i, 1); f(); }
  }
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
