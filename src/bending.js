// Four-element bending: Water (whip / cryo-freeze), Earth (boulder hurl / tectonic pillar),
// Fire (blazing arc / jet dash), Air (gale vortex / tornado lift).
import * as THREE from 'three';
import { G, schedule, clamp } from './ctx.js';
import * as T from './terrain.js';
import { mats, boxGeo, raycast, staticGroundY } from './world.js';
import { addBox, removeBox } from './dyn.js';
import { emit, ring } from './fx.js';
import { sfx } from './audio.js';
import { useChi, startAction, facingDir, DASH_T } from './player.js';

const V = THREE.Vector3;
export const ELEMENTS = {
  water: { name: 'Water', color: 0x35d0ff, x: 'Water Whip', y: 'Cryo-Freeze', cdY: 3.0, costX: 8, costY: 30 },
  earth: { name: 'Earth', color: 0xb9c23e, x: 'Boulder Hurl', y: 'Tectonic Pillar', cdY: 1.2, costX: 12, costY: 25 },
  fire: { name: 'Fire', color: 0xff5a1f, x: 'Blazing Arc', y: 'Jet Dash', cdY: 2.2, costX: 10, costY: 22 },
  air: { name: 'Air', color: 0xe6f6ff, x: 'Gale Vortex', y: 'Tornado Lift', cdY: 2.2, costX: 8, costY: 22 },
};
const origin = new V(), dir = new V(), tmp = new V(), tmp2 = new V(), tmp3 = new V();
const effects = [], boulders = [], gales = [];

function getAim(range) {
  const p = G.player, inp = G.input;
  origin.set(p.pos.x, p.pos.y + 1.25, p.pos.z);
  const e = clamp((inp.pitch - 0.28) * 0.8, -0.55, 0.5);
  dir.set(-Math.sin(inp.yaw) * Math.cos(e), -Math.sin(e), -Math.cos(inp.yaw) * Math.cos(e)).normalize();
  let best = 0.86, bt = null;                       // soft auto-aim inside ~30 degrees
  for (const t of G.targets) {
    if (!t.active()) continue; tmp.subVectors(t.pos, origin); const d = tmp.length(); if (d > range + t.radius || d < 0.5) continue;
    const c = (tmp.x * dir.x + tmp.z * dir.z) / (Math.hypot(tmp.x, tmp.z) * Math.hypot(dir.x, dir.z) + 1e-6);
    if (c > best) { best = c; bt = t; }
  }
  if (bt) dir.subVectors(bt.pos, origin).normalize();
  p.yaw = Math.atan2(dir.x, dir.z);
  return bt;
}
function doHit(t, el, kind, info) { G.bending.stats.hits++; t.hit(el, kind, info || {}); }
function hitLine(o, d, range, width, el, kind) {
  let n = 0; for (const t of G.targets.slice()) { if (!t.active()) continue; tmp.subVectors(t.pos, o); const k = tmp.dot(d); if (k < -t.radius || k > range + t.radius) continue; tmp.addScaledVector(d, -k); if (tmp.length() < width + t.radius) { doHit(t, el, kind, { dir: d.clone() }); n++; } } return n;
}
function hitCone(o, d, range, cosHalf, el, kind) {
  let n = 0; for (const t of G.targets.slice()) { if (!t.active()) continue; tmp.subVectors(t.pos, o); const len = tmp.length(); if (len > range + t.radius) continue; if (len < t.radius + 1 || tmp.dot(d) / len > cosHalf - t.radius / (len * 2)) { doHit(t, el, kind, { dir: d.clone() }); n++; } } return n;
}
function hitSphere(c, r, el, kind, skip, info) {
  let n = 0; for (const t of G.targets.slice()) { if (!t.active() || (skip && skip.has(t))) continue; if (t.pos.distanceTo(c) < r + t.radius) { if (skip) skip.add(t); doHit(t, el, kind, info); n++; } } return n;
}

// ---------- WATER ----------
function waterWhip() {
  startAction('water_x', 0.55); getAim(14); const o = origin.clone(), d = dir.clone();
  sfx('water'); G.bending.stats.waterWhips++;
  effects.push({ t: 0, dur: 0.45, update(u) { const reach = 14 * Math.min(1, u * 1.6); for (let i = 0; i < 6; i++) { const k = Math.random() * reach, a = k * 1.4 + G.simTime * 14; tmp.copy(o).addScaledVector(d, k); tmp.x += Math.cos(a) * 0.35 * d.z; tmp.z -= Math.cos(a) * 0.35 * d.x; tmp.y += Math.sin(a) * 0.35; emit({ pos: tmp, n: 1, color: 0x58d8ff, spread: 0.4, vel: [d.x * 6, d.y * 6, d.z * 6], size: 0.34, life: 0.35, drag: 2 }); } } });
  schedule(0.2, () => { hitLine(o, d, 14, 1.3, 'water', 'whip'); tmp.copy(o).addScaledVector(d, 14); emit({ pos: tmp, n: 26, color: 0xbff2ff, spread: 4, size: 0.3, life: 0.5, gravity: 8 }); });
}
function iceBridge(a, b, width = 1.7) {
  const len = a.distanceTo(b), n = Math.max(1, Math.ceil(len / 2.6)), yaw = Math.atan2(b.x - a.x, b.z - a.z), slabs = [];
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n; const m = new THREE.Mesh(boxGeo(width * 2, 0.6, len / n + 0.25, 2), mats.ice);
    m.position.lerpVectors(a, b, k); m.rotation.y = yaw; m.castShadow = true; G.scene.add(m);
    const box = addBox({ half: new V(width, 0.3, len / n / 2 + 0.12), pos: m.position.clone(), quat: m.quaternion.clone(), friction: 0.8, tag: 'ice' });
    slabs.push({ m, box }); emit({ pos: m.position, n: 14, color: 0xcff6ff, spread: 2.5, vel: [0, 2, 0], size: 0.3, life: 0.7, drag: 2 });
  }
  G.bending.ice.push({ slabs, t: 10 }); G.bending.stats.iceCreated += n;
}
function cryoFreeze() {
  const p = G.player; startAction('water_y', 0.7); getAim(22); sfx('ice'); G.bending.stats.freezes++;
  const o = origin.clone(), d = dir.clone();
  effects.push({ t: 0, dur: 0.5, update(u) { tmp.copy(o).addScaledVector(d, 2 + u * 16); emit({ pos: tmp, n: 5, color: 0xcff6ff, spread: 2, size: 0.4, life: 0.5, drag: 2, radius: 1 }); } });
  let done = false;
  for (const f of G.freezables) {                    // stepping stones, the suspension bridge...
    tmp.subVectors(f.pos, p.pos); const dist = tmp.length(); if (dist > 26) continue;
    const c = (tmp.x * d.x + tmp.z * d.z) / (Math.hypot(tmp.x, tmp.z) + 1e-6);
    if (dist < 9 || c > 0.5) { f.freeze(10); done = true; G.bending.stats.iceCreated++; }
  }
  if (!done) {
    for (let k = 1; k <= 22 && !done; k += 1) {      // open river -> crystalline ice bridge straight across
      const x = p.pos.x + d.x * k, z = p.pos.z + d.z * k;
      if (T.riverMask(x, z) > 0.35) { const cx = T.riverCx(z), s = p.pos.x < cx ? 1 : -1; iceBridge(new V(cx - 14 * s, T.WATER_Y + 0.15, z), new V(cx + 14 * s, T.WATER_Y + 0.15, z)); done = true; }
      else if (T.chasmMask(x, z) > 0.4) {             // waterfall chasm / gorge -> frozen spray bridge along the aim
        const s = T.s2local(x, z);
        if (s.r < 33 && s.d > 4 && s.d < 18) { const a = T.s2world(3.6, s.l), b = T.s2world(18.4, s.l); iceBridge(new V(a.x, -0.32, a.z), new V(b.x, -0.32, b.z)); done = true; }
      }
    }
  }
  if (!done) { tmp.copy(o).addScaledVector(d, 6); emit({ pos: tmp, n: 30, color: 0xcff6ff, spread: 3, size: 0.35, life: 0.8, gravity: 2 }); }
}

// ---------- EARTH ----------
const boulderGeo = new THREE.DodecahedronGeometry(0.55, 0);
function boulderHurl() {
  const p = G.player; startAction('earth_x', 0.6); getAim(40); sfx('earth'); G.bending.stats.boulders++;
  const m = new THREE.Mesh(boulderGeo, mats.moss); m.castShadow = true; G.scene.add(m);
  facingDir(tmp); m.position.set(p.pos.x + tmp.x * 0.8 - tmp.z * 0.6, p.pos.y - 0.4, p.pos.z + tmp.z * 0.8 + tmp.x * 0.6);
  emit({ pos: m.position, n: 16, color: 0xb9a777, spread: 2, vel: [0, 2, 0], size: 0.3, life: 0.6, gravity: 6 });
  boulders.push({ m, t: 0, vel: new V(), launched: false });
}
function shatter(pos, color = 0xb9a777, n = 26) { emit({ pos, n, color, spread: 5, vel: [0, 2, 0], size: 0.35, life: 0.7, gravity: 12, drag: 1 }); sfx('smash'); }
function updateBoulders(dt) {
  const p = G.player;
  for (let i = boulders.length - 1; i >= 0; i--) {
    const b = boulders[i]; b.t += dt; b.m.rotation.x += dt * 5; b.m.rotation.z += dt * 3;
    if (!b.launched) {
      facingDir(tmp); tmp2.set(p.pos.x + tmp.x * 0.9 - tmp.z * 0.55, p.pos.y + 1.5, p.pos.z + tmp.z * 0.9 + tmp.x * 0.55);
      b.m.position.lerp(tmp2, 1 - Math.exp(-16 * dt));
      if (b.t >= 0.32) { getAim(40); b.vel.copy(dir).multiplyScalar(28); b.launched = true; b.m.position.copy(tmp2); }  // 28 m/s along the reticle
      continue;
    }
    b.vel.y -= 3.5 * dt; const step = b.vel.length() * dt; tmp.copy(b.vel).normalize();
    const hit = raycast(b.m.position, tmp, step + 0.5);
    b.m.position.addScaledVector(b.vel, dt);
    let dead = !!hit || b.t > 2.6;
    if (hitSphere(b.m.position, 0.6, 'earth', 'boulder', null, { dir: tmp.clone() }) > 0) dead = true;
    if (dead) { shatter(b.m.position); G.scene.remove(b.m); boulders.splice(i, 1); }
  }
}
function spawnPillar(x, z, topY, H, rise, permanent) {
  const m = new THREE.Mesh(boxGeo(1.7, H, 1.7, 2), mats.stone); m.castShadow = m.receiveShadow = true; G.scene.add(m);
  const box = addBox({ half: new V(0.85, H / 2, 0.85), pos: new V(x, topY - H / 2 - rise, z), tag: 'pillar' });
  const pl = { m, box, top: topY, H, rise, t: 0, life: permanent ? Infinity : 25, sink: 0 };
  G.bending.pillars.push(pl); G.bending.stats.pillars++;
  if (G.bending.pillars.length > 10) { const old = G.bending.pillars.find((q) => q.life !== Infinity && !q.sink) || G.bending.pillars[0]; old.life = 0; }
  tmp.set(x, topY - rise, z); ring(tmp, 0xb9c23e, 4, 0.6); emit({ pos: tmp, n: 36, color: 0xb9a777, spread: 4, vel: [0, 4, 0], size: 0.4, life: 0.8, gravity: 10 });
  return pl;
}
function tectonicPillar() {
  const p = G.player, inp = G.input; startAction('earth_y', 0.7); sfx('earth');
  const front = !p.grounded || Math.hypot(inp.mx, inp.my) > 0.5;
  if (!front) { spawnPillar(p.pos.x, p.pos.z, p.pos.y + 4.5, 5.5, 4.55, false); return; }      // launch Cole 4.5 m up
  facingDir(tmp); const x = p.pos.x + tmp.x * 2.4, z = p.pos.z + tmp.z * 2.4, g = staticGroundY(x, z, p.pos.y + 1.5);
  if (g < p.pos.y - 3) spawnPillar(x, z, p.pos.y - 0.02, 34, 6, true);                         // permanent stepping pillar across a chasm
  else spawnPillar(x, z, g + 4.5, 5.5, 4.5, false);                                           // wall: jams boulder traps
}
function updatePillars(dt) {
  const P = G.bending.pillars;
  for (let i = P.length - 1; i >= 0; i--) {
    const pl = P[i]; pl.t += dt; const restY = pl.top - pl.H / 2;
    if (pl.sink) { pl.box.vel.y = -3; pl.box.pos.y -= 3 * dt; if (pl.box.pos.y < restY - pl.rise - 1) { removeBox(pl.box); G.scene.remove(pl.m); P.splice(i, 1); continue; } }
    else if (pl.box.pos.y < restY) { const v = pl.rise / 0.45; pl.box.vel.y = v; pl.box.pos.y = Math.min(restY, pl.box.pos.y + v * dt); if (pl.box.pos.y >= restY) pl.box.vel.y = 0; }
    else { pl.box.vel.y = 0; if (pl.t > pl.life) pl.sink = 1; }
    pl.m.position.copy(pl.box.pos);
  }
}

// ---------- FIRE ----------
function fireArc() {
  const b = G.bending; startAction('fire_x', 0.5, b.combo++); getAim(12); sfx('fire'); b.stats.fireArcs++;
  const o = origin.clone(), d = dir.clone(); let tick = 0;
  effects.push({ t: 0, dur: 0.45, update(u, dt) {
    for (let i = 0; i < 9; i++) { const s = 8 + Math.random() * 16; emit({ pos: o, n: 1, color: Math.random() < 0.3 ? 0xffd35a : 0xff5a1f, spread: 2.6, vel: [d.x * s, d.y * s + 0.5, d.z * s], size: 0.55, life: 0.5, drag: 1.3, gravity: -2 }); }
    tick -= dt; if (tick <= 0) { tick = 0.12; hitCone(o, d, 12, 0.9, 'fire', 'arc'); }
  } });
}
function jetDash() {
  const p = G.player; startAction('fire_y', DASH_T); sfx('fire'); sfx('flight'); G.bending.stats.dashes++;
  const m = Math.hypot(G.input.mx, G.input.my);
  if (m > 0.3) { const y = G.input.yaw; p.dashDir.set(-Math.sin(y) * G.input.my + Math.cos(y) * G.input.mx, 0, -Math.cos(y) * G.input.my - Math.sin(y) * G.input.mx).normalize(); } else facingDir(p.dashDir);
  p.dashT = DASH_T; p.rollT = 0; p.flying = false; p.vine = null; p.pos.y += 0.05; p.grounded = false;
  ring(p.pos, 0xff7a1a, 3, 0.4);
}

// ---------- AIR ----------
const galeGeo = new THREE.IcosahedronGeometry(1, 1);
function galeVortex() {
  startAction('air_x', 0.5); getAim(18); sfx('air'); G.bending.stats.gales++;
  const o = origin.clone(), d = dir.clone();
  schedule(0.12, () => {
    const m = new THREE.Mesh(galeGeo, new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.22, depthWrite: false, wireframe: true })); m.position.copy(o); G.scene.add(m);
    gales.push({ m, d, dist: 0, seen: new Set() });
  });
}
function updateGales(dt) {
  for (let i = gales.length - 1; i >= 0; i--) {
    const g = gales[i]; g.dist += 24 * dt; g.m.position.addScaledVector(g.d, 24 * dt); const r = 1 + g.dist / 18 * 1.4; g.m.scale.setScalar(r); g.m.rotation.y += dt * 9; g.m.rotation.x += dt * 5;
    emit({ pos: g.m.position, n: 3, color: 0xe6f6ff, spread: 2.5, size: 0.3, life: 0.35, drag: 2, radius: r * 0.7, alpha: 0.5 });
    hitSphere(g.m.position, r, 'air', 'gale', g.seen, { dir: g.d });
    for (const ep of G.enemyProjectiles) if (!ep.deflected && ep.pos.distanceTo(g.m.position) < r + 1) { ep.deflected = true; ep.vel.copy(ep.home).sub(ep.pos).normalize().multiplyScalar(22); G.bending.stats.deflected++; sfx('air'); }
    if (g.dist > 18) { ring(g.m.position, 0xe6f6ff, 3, 0.4, 0); G.scene.remove(g.m); g.m.material.dispose(); gales.splice(i, 1); }
  }
}
function tornadoLift() {
  const p = G.player; startAction('air_y', 0.8); sfx('air'); sfx('flight'); G.bending.stats.tornados++;
  p.vel.y = 14; p.grounded = false; p.airJumps = 0; p.rollT = 0; p.dashT = 0; p.pos.y += 0.05;
  const c = p.pos.clone(); ring(c, 0xe6f6ff, 6, 0.6); hitSphere(c, 6, 'air', 'tornado', null, { dir: new V(0, 1, 0) });
  effects.push({ t: 0, dur: 0.8, update(u) { for (let i = 0; i < 5; i++) { const a = G.simTime * 12 + i * 1.26, r = 0.6 + u * 1.2; tmp.set(p.pos.x + Math.cos(a) * r, p.pos.y + Math.random() * 1.8 - 0.6, p.pos.z + Math.sin(a) * r); emit({ pos: tmp, n: 1, color: 0xe6f6ff, spread: 0.6, vel: [-Math.sin(a) * 5, 3, Math.cos(a) * 5], size: 0.3, life: 0.45, drag: 2, alpha: 0.6 }); } } });
}

export function createBending() {
  const b = G.bending = {
    element: 'water', cdX: 0, cdY: 0, cdYMax: 1, combo: 0, pillars: [], ice: [], boulders, gales,
    stats: { hits: 0, waterWhips: 0, freezes: 0, iceCreated: 0, boulders: 0, pillars: 0, fireArcs: 0, dashes: 0, gales: 0, tornados: 0, deflected: 0, switches: 0 },
    setElement(e) {
      if (!ELEMENTS[e]) return; if (b.element !== e) b.stats.switches++; b.element = e;
      G.rig && G.rig.setElementColor(ELEMENTS[e].color); G.hud && G.hud.setElement(e); sfx('ui');
      if (G.player) { ring(G.player.pos, ELEMENTS[e].color, 2.2, 0.45); G.player.attackGlow = 0.4; }
    },
    primary() {
      const p = G.player; if (b.cdX > 0 || p.frozen || p.rollT > 0 || p.vine || p.zip) return false;
      const E = ELEMENTS[b.element]; if (!useChi(E.costX)) return false; b.cdX = 0.5;
      ({ water: waterWhip, earth: boulderHurl, fire: fireArc, air: galeVortex })[b.element](); return true;
    },
    heavy() {
      const p = G.player; if (b.cdY > 0 || p.frozen || p.rollT > 0 || p.vine || p.zip) return false;
      if (b.element === 'earth' && p.flying) { sfx('fizzle'); return false; }
      const E = ELEMENTS[b.element]; if (!useChi(E.costY)) return false; b.cdY = b.cdYMax = E.cdY;
      ({ water: cryoFreeze, earth: tectonicPillar, fire: jetDash, air: tornadoLift })[b.element](); return true;
    },
  };
  G.updaters.push((dt) => {
    b.cdX -= dt; b.cdY -= dt;
    for (let i = effects.length - 1; i >= 0; i--) { const e = effects[i]; e.t += dt; e.update(Math.min(1, e.t / e.dur), dt); if (e.t >= e.dur) effects.splice(i, 1); }
    updateBoulders(dt); updatePillars(dt); updateGales(dt);
    for (let i = b.ice.length - 1; i >= 0; i--) { const s = b.ice[i]; s.t -= dt; if (s.t <= 0) { for (const q of s.slabs) { emit({ pos: q.m.position, n: 12, color: 0xcff6ff, spread: 3, size: 0.3, life: 0.6, gravity: 9 }); removeBox(q.box); G.scene.remove(q.m); } b.ice.splice(i, 1); sfx('ice'); } }
  });
  return b;
}
