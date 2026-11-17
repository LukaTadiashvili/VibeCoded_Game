// Interactive traversal physics: Verlet suspension bridge, buoyant stepping stones,
// pendulum vines, zip-line, bounce-mushrooms, torque see-saw, rolling boulder trap, wind turbine.
import * as THREE from 'three';
import { G, clamp, damp } from './ctx.js';
import * as T from './terrain.js';
import { mats, boxGeo, addBlock } from './world.js';
import { addBox, removeBox } from './dyn.js';
import { emit, ring } from './fx.js';
import { sfx } from './audio.js';
import { attachVine, attachZip, damage, MASS } from './player.js';

const V = THREE.Vector3, Q = THREE.Quaternion;
const tmp = new V(), tmp2 = new V(), X = new V(), Y = new V(), Z = new V(), m4 = new THREE.Matrix4();
const UP = new V(0, 1, 0);
function cylBetween(mesh, a, b) { mesh.position.addVectors(a, b).multiplyScalar(0.5); tmp.subVectors(b, a); const l = tmp.length(); mesh.scale.set(1, l, 1); mesh.quaternion.setFromUnitVectors(UP, tmp.multiplyScalar(1 / (l || 1))); }

// ================= 18-plank Verlet suspension bridge =================
function buildBridge() {
  const NP = 18, a = T.s2world(52.6, 0), b = T.s2world(29.4, 0), A = new V(a.x, 0.26, a.z), B = new V(b.x, 0.26, b.z);
  const nodes = [], prev = []; for (let i = 0; i <= NP + 1; i++) { const p = new V().lerpVectors(A, B, i / (NP + 1)); nodes.push(p); prev.push(p.clone()); }
  const rest = A.distanceTo(B) / (NP + 1) * 1.001, lat = new V(T.N2.x, 0, T.N2.z);
  const MISSING = new Set([6, 12]), ROTTED = new Set([9, 15]);
  const planks = [];
  for (let i = 1; i <= NP; i++) {
    if (MISSING.has(i)) { planks.push(null); continue; }
    const rot = ROTTED.has(i); const mat = rot ? new THREE.MeshStandardMaterial({ map: mats.wood.map, color: 0x8a7a5a, roughness: 1 }) : mats.wood;
    const m = new THREE.Mesh(boxGeo(2.3, 0.14, 0.95, 1), mat); m.castShadow = m.receiveShadow = true; G.scene.add(m);
    const box = addBox({ half: new V(1.15, 0.07, 0.475), pos: nodes[i].clone(), tag: 'plank', friction: 0.9 });
    planks.push({ i, m, box, rot, stand: 0, broken: false, fall: 0 });
  }
  // ropes
  const ropeMat = new THREE.LineBasicMaterial({ color: 0x6a5230 });
  const ropes = [-1.15, 1.15].map((off) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NP + 2) * 3 * 2), 3)); const l = new THREE.LineSegments(g, ropeMat); l.frustumCulled = false; G.scene.add(l); return { off, g }; });
  const hand = [-1.15, 1.15].map((off) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((NP + 2) * 3), 3)); const l = new THREE.Line(g, ropeMat); l.frustumCulled = false; G.scene.add(l); return { off, g }; });
  for (const P of [A, B]) for (const s of [-1.25, 1.25]) addBlock(0.35, 1.9, 0.35, P.x + lat.x * s, 0.95, P.z + lat.z * s, mats.wood, { tile: 1 });
  const iceSlabs = [];
  const bridge = G.bridge = { nodes, planks, frozen: 0, broken: 0, maxSag: 0, A, B };
  function setBox(box, i, mesh) {
    Z.subVectors(nodes[i + 1], nodes[i - 1]).normalize(); X.copy(lat); Y.crossVectors(Z, X).normalize(); X.crossVectors(Y, Z);
    m4.makeBasis(X, Y, Z); box.quat.setFromRotationMatrix(m4); box.pos.copy(nodes[i]); if (mesh) { mesh.position.copy(box.pos); mesh.quaternion.copy(box.quat); }
  }
  G.freezables.push({ pos: new V().lerpVectors(A, B, 0.5), radius: 12, freeze(dur) {
    if (bridge.frozen <= 0) { for (let i = 1; i <= NP; i++) { const pl = planks[i - 1]; if (pl && !pl.broken) continue; const m = new THREE.Mesh(boxGeo(2.3, 0.2, 1.3, 1), mats.ice); G.scene.add(m); const box = addBox({ half: new V(1.15, 0.1, 0.65), pos: nodes[i].clone(), tag: 'ice' }); setBox(box, i, m); iceSlabs.push({ m, box }); } sfx('ice'); }
    bridge.frozen = dur; for (const pl of planks) if (pl && !pl.broken) emit({ pos: pl.box.pos, n: 4, color: 0xcff6ff, spread: 1.5, size: 0.25, life: 0.6 });
  } });
  G.updaters.push((dt) => {
    const p = G.player, wind = Math.sin(G.simTime * 0.9) * 0.9 + Math.sin(G.simTime * 2.3) * 0.4;
    if (bridge.frozen > 0) { bridge.frozen -= dt; if (bridge.frozen <= 0) { for (const s of iceSlabs) { removeBox(s.box); G.scene.remove(s.m); emit({ pos: s.m.position, n: 10, color: 0xcff6ff, spread: 3, size: 0.3, life: 0.6, gravity: 9 }); } iceSlabs.length = 0; } }
    else {
      let loaded = -1; for (const pl of planks) if (pl && p.groundBox === pl.box) loaded = pl.i;
      for (let i = 1; i <= NP; i++) {
        const n = nodes[i], pv = prev[i]; tmp.subVectors(n, pv).multiplyScalar(0.985); pv.copy(n); n.add(tmp);
        let ay = -9.81; if (i === loaded) ay -= MASS * 9.81 / 22; else if (Math.abs(i - loaded) === 1 && loaded > 0) ay -= MASS * 9.81 / 60;   // Cole's 82 kg
        n.y += ay * dt * dt; n.addScaledVector(lat, wind * 1.3 * dt * dt * (0.5 + Math.sin(i * 0.35)));
      }
      for (let it = 0; it < 26; it++) for (let i = 0; i <= NP; i++) {
        const a0 = nodes[i], b0 = nodes[i + 1]; tmp.subVectors(b0, a0); const d = tmp.length(), e = (d - rest) / d; if (e <= 0) continue;
        const fa = i === 0 ? 0 : (i === NP ? 1 : 0.5); a0.addScaledVector(tmp, e * fa); b0.addScaledVector(tmp, -e * (1 - fa));
      }
    }
    let sag = 0;
    for (const pl of planks) {
      if (!pl) continue;
      if (pl.broken) { if (pl.fall < 3) { pl.fall += dt; pl.m.position.y -= (2 + pl.fall * 12) * dt; pl.m.rotation.x += dt * 3; if (pl.fall >= 3) pl.m.visible = false; } continue; }
      setBox(pl.box, pl.i, pl.m); sag = Math.max(sag, 0.26 - nodes[pl.i].y);
      if (pl.rot && bridge.frozen <= 0) {
        if (p.groundBox === pl.box) { pl.stand += dt; if (pl.stand > 0.1 && Math.random() < 0.2) { sfx('creak'); emit({ pos: pl.box.pos, n: 2, color: 0x9a8a60, spread: 1, size: 0.15, life: 0.4, gravity: 6 }); } }
        if (pl.stand > 0.5) { pl.broken = true; removeBox(pl.box); bridge.broken++; sfx('smash'); emit({ pos: pl.box.pos, n: 20, color: 0x9a8a60, spread: 3, size: 0.25, life: 0.6, gravity: 10 }); }
      }
    }
    bridge.maxSag = Math.max(bridge.maxSag, sag);
  });
  G.frameUpdaters.push(() => {
    for (const r of ropes) { const a2 = r.g.attributes.position; for (let i = 0; i <= NP + 1; i++) { const n = nodes[i]; a2.setXYZ(i * 2, n.x + lat.x * r.off, n.y, n.z + lat.z * r.off); a2.setXYZ(i * 2 + 1, n.x + lat.x * r.off, n.y + 1.05 + (i === 0 || i === NP + 1 ? 0.7 : 0), n.z + lat.z * r.off); } a2.needsUpdate = true; }
    for (const r of hand) { const a2 = r.g.attributes.position; for (let i = 0; i <= NP + 1; i++) { const n = nodes[i]; a2.setXYZ(i, n.x + lat.x * r.off, n.y + 1.05 + (i === 0 || i === NP + 1 ? 0.7 : 0), n.z + lat.z * r.off); } a2.needsUpdate = true; }
  });
}

// ================= 9 buoyant mossy stepping stones (k = 180, c = 18, mu = 0.28) =================
function buildStones() {
  const stones = G.stones = { list: [], frozen: 0 };
  const geo = new THREE.DodecahedronGeometry(1.25, 1), iceGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.22, 16);
  for (let i = 0; i < 9; i++) {
    const x = 76.4 + i * 2.9, z = (i % 2 ? 0.45 : -0.45), rest0 = T.WATER_Y + 0.35 - 0.45;
    const m = new THREE.Mesh(geo, mats.moss); m.scale.set(1, 0.42, 1); m.castShadow = m.receiveShadow = true; G.scene.add(m);
    const ice = new THREE.Mesh(iceGeo, mats.ice); ice.visible = false; G.scene.add(ice);
    const box = addBox({ half: new V(1.0, 0.45, 1.0), pos: new V(x, rest0, z), friction: 0.28, tag: 'stone' });
    stones.list.push({ x, z, y: rest0, vy: 0, rest0, rest: rest0, sinker: i === 2 || i === 5 || i === 7, box, m, ice, minY: rest0 });
  }
  G.freezables.push({ pos: new V(88, T.WATER_Y, 0), radius: 14, freeze(dur) { stones.frozen = dur; sfx('ice'); for (const s of stones.list) emit({ pos: s.box.pos, n: 8, color: 0xcff6ff, spread: 2, vel: [0, 2, 0], size: 0.3, life: 0.7 }); } });
  G.updaters.push((dt) => {
    const p = G.player; const frozen = stones.frozen > 0; if (frozen) { stones.frozen -= dt; if (stones.frozen <= 0) sfx('ice'); }
    for (const s of stones.list) {
      const loaded = p.groundBox === s.box;
      if (frozen) { s.rest = s.rest0 + 0.12; s.y = damp(s.y, s.rest, 12, dt); s.vy = 0; s.box.friction = 1; s.box.half.x = s.box.half.z = 1.5; }
      else {
        s.box.friction = 0.28; s.box.half.x = s.box.half.z = 1.0;
        if (s.sinker && loaded) s.rest = Math.max(s.rest0 - 1.3, s.rest - 0.5 * dt); else s.rest = Math.min(s.rest0, s.rest + 0.7 * dt);
        const target = s.rest + Math.sin(G.simTime * 1.3 + s.x) * 0.035;
        const acc = -180 * (s.y - target) - 18 * s.vy - (loaded ? MASS : 0);       // Hooke spring-damper, unit-mass normalised
        s.vy += acc * dt; s.y += s.vy * dt; s.minY = Math.min(s.minY, s.y);
      }
      s.box.pos.y = s.y; s.box.vel.y = s.vy; s.m.position.set(s.x, s.y - 0.06, s.z); s.ice.visible = frozen; s.ice.position.set(s.x, s.y + 0.38, s.z);
    }
  });
}

// ================= pendulum canopy vines over the waterfall chasm =================
function buildVines() {
  G.vines = [];
  const postMat = mats.wood;
  for (const d of [2.6, 19]) { for (const l of [-6.5, 6.5]) { const w = T.s2world(d, l); addBlock(1.0, 13.4, 1.0, w.x, 6.7, w.z, postMat, { tile: 2, rotY: Math.PI / 4 }); } const c = T.s2world(d, 0); addBlock(14, 0.7, 0.8, c.x, 13.1, c.z, postMat, { tile: 2, rotY: Math.atan2(T.N2.x, T.N2.z) + Math.PI / 2, collide: false }); }
  for (const l of [-3, 3]) {
    const c = T.s2world(10.8, l); addBlock(0.7, 0.6, 17.5, c.x, 13.6, c.z, postMat, { tile: 2, rotY: Math.atan2(T.D2.x, T.D2.z), collide: false });
    const pv = T.s2world(10.5, l); const pivot = new V(pv.x, 13.2, pv.z);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), mats.vine); rope.castShadow = true; G.scene.add(rope);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mats.vine); G.scene.add(leaf);
    const vine = { pivot, rope, leaf, end: new V(), phase: l, len: 10.4 }; G.vines.push(vine);
    G.interactables.push({ pos: new V(pv.x, 1, pv.z), range: 9.6, label: 'Whip-grab the liana vine', active: () => !G.player.vine && !G.player.flying && G.player.pos.y > -1.5, act: () => attachVine(vine) });
  }
  G.updaters.push(() => {
    const p = G.player;
    for (const v of G.vines) {
      if (p.vine && p.vine.vine === v) v.end.set(p.pos.x, p.pos.y + 1.7, p.pos.z);
      else { const a = Math.sin(G.simTime * 0.9 + v.phase) * 0.22; v.end.set(v.pivot.x + T.D2.x * Math.sin(a) * v.len, v.pivot.y - Math.cos(a) * v.len, v.pivot.z + T.D2.z * Math.sin(a) * v.len); }
    }
    if (p.vine || p.flying || p.grounded || p.grabCd > 0 || p.zip) return;
    for (const v of G.vines) { tmp.set(p.pos.x, p.pos.y + 1.6, p.pos.z); if (tmp.distanceTo(v.end) < 1.7 || distToSeg(tmp, v.pivot, v.end) < 1.1 && tmp.y < v.pivot.y - 3) { attachVine(v); break; } }
  });
  G.frameUpdaters.push(() => {
    for (const v of G.vines) { cylBetween(v.rope, v.pivot, v.end); v.leaf.position.copy(v.end); }
  });
}
function distToSeg(p, a, b) { tmp2.subVectors(b, a); const t = clamp(tmp2.dot(X.subVectors(p, a)) / tmp2.lengthSq(), 0, 1); return X.copy(a).addScaledVector(tmp2, t).distanceTo(p); }

// ================= 48 m pulley zip-line =================
function buildZip() {
  const a = T.s2world(5, 14), b = T.s2world(53, 14), P0 = new V(a.x, 8.6, a.z), P1 = new V(b.x, 2.75, b.z);
  const len = P0.distanceTo(P1), dir = new V().subVectors(P1, P0).normalize();
  const zip = G.zip = { P0, P1, len, dir, slope: (P0.y - P1.y) / len, rides: 0, point(s, out) { out.lerpVectors(P0, P1, s); out.y -= Math.sin(Math.PI * s) * 0.9; return out; } };
  const ta = T.s2world(4.2, 14), tb = T.s2world(54.2, 14);
  addBlock(0.7, 9.2, 0.7, ta.x, 4.6, ta.z, mats.wood, { tile: 2 }); addBlock(0.7, 3.4, 0.7, tb.x, 1.7, tb.z, mats.wood, { tile: 2 });
  const pts = []; for (let i = 0; i <= 24; i++) pts.push(zip.point(i / 24, new V()));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a2620 })); G.scene.add(line);
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 14), mats.gold); G.scene.add(pulley);
  G.interactables.push({ pos: new V(a.x, 0.5, a.z), range: 5.5, label: 'Whip onto the zip-line', active: () => !G.player.zip, act: () => { if (attachZip(zip)) zip.rides++; } });
  G.frameUpdaters.push(() => { const p = G.player; zip.point(p.zip ? p.zip.s : 0.01, pulley.position); pulley.rotation.z = G.simTime * (p.zip ? 20 : 0); });
}

// ================= bioluminescent bounce-mushrooms (restitution 1.65) =================
export function addMushroom(x, y, z, hue = 0.45) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const glow = new THREE.Color().setHSL(hue, 0.9, 0.55);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.5, 10), new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.8 })); stem.position.y = 0.75; g.add(stem);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1.7, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2a6a, roughness: 0.5, emissive: glow, emissiveIntensity: 0.55 })); cap.scale.y = 0.42; cap.position.y = 1.25; g.add(cap);
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), new THREE.MeshBasicMaterial({ color: glow })); const a = i * 0.7, r = 0.5 + (i % 3) * 0.42; s.position.set(Math.cos(a) * r, 1.25 + 0.7 * Math.sqrt(Math.max(0, 1 - (r / 1.7) ** 2)), Math.sin(a) * r); g.add(s); }
  stem.castShadow = cap.castShadow = true; G.scene.add(g);
  const box = addBox({ half: new V(1.35, 0.32, 1.35), pos: new V(x, y + 1.55, z), bounce: 1.65, glow: glow.getHex(), squash: 0, tag: 'mushroom' });
  const mu = { g, box, bounces: 0 }; (G.mushrooms = G.mushrooms || []).push(mu);
  G.updaters.push((dt) => { if (box.squash > 0) { if (box.squash === 1) mu.bounces++; box.squash = Math.max(0, box.squash - dt * 2.5); } const s = box.squash; g.scale.set(1 + 0.25 * Math.sin(s * 9) * s, 1 - 0.35 * Math.sin(s * 9) * s, 1 + 0.25 * Math.sin(s * 9) * s); });
  return mu;
}

// ================= counter-balanced see-saw beam (tau = r x F) =================
function buildSeesaw() {
  const pivot = new V(0, 0.70, 59), half = new V(1.25, 0.15, 6.5), LIM = 0.123, I = (1 / 12) * 600 * 13 * 13;
  addBlock(1.6, 7.2, 1.2, 0, -2.9, 59, mats.stoneDark, { tile: 2 });
  const m = new THREE.Mesh(boxGeo(2.5, 0.3, 13, 2), mats.stone); m.castShadow = m.receiveShadow = true; G.scene.add(m);
  const box = addBox({ half, pos: pivot.clone(), tag: 'seesaw' });
  const ss = G.seesaw = { theta: LIM, omega: 0, box, minTheta: LIM, maxTheta: LIM };
  G.updaters.push((dt) => {
    const p = G.player; let tau = Math.sign(ss.theta || 1) * 260;                                  // weak counter-balance spring
    if (p.groundBox === box) tau += (p.pos.z - pivot.z) * Math.cos(ss.theta) * MASS * 9.81;   // torque from Cole's weight
    ss.omega += (tau / I - ss.omega * 1.6) * dt; ss.theta += ss.omega * dt;
    if (ss.theta > LIM) { ss.theta = LIM; if (ss.omega > 0.25) sfx('land'); ss.omega = 0; } if (ss.theta < -LIM) { ss.theta = -LIM; if (ss.omega < -0.25) sfx('land'); ss.omega = 0; }
    ss.minTheta = Math.min(ss.minTheta, ss.theta); ss.maxTheta = Math.max(ss.maxTheta, ss.theta);
    box.quat.setFromAxisAngle(X.set(1, 0, 0), ss.theta); box.pos.copy(pivot); m.position.copy(pivot); m.quaternion.copy(box.quat);
  });
}

// ================= rolling boulder trap on the Sun-Spire ramp + stone wind-turbine =================
function buildBoulderTrap() {
  const trap = G.trap = { list: [], t: 2, gateT: 0, spawned: 0, jammed: 0, hits: 0, dodged: 0 };
  const geo = new THREE.IcosahedronGeometry(1.3, 1);
  // turbine
  const tp = new V(7.5, 0, 45); addBlock(1.0, 3.2, 1.0, tp.x, 1.6, tp.z, mats.stoneDark, { tile: 2 });
  const rotor = new THREE.Group(); rotor.position.set(tp.x, 3.6, tp.z + 0.7); G.scene.add(rotor);
  for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(boxGeo(0.5, 2.2, 0.16, 1), mats.stone); bl.position.y = 1.2; const h = new THREE.Group(); h.rotation.z = i * Math.PI / 2; h.add(bl); rotor.add(h); bl.castShadow = true; }
  const turbine = G.turbine = { spin: 0, spins: 0 };
  G.targets.push({ pos: new V(tp.x, 3.6, tp.z + 0.7), radius: 1.6, active: () => true, hit(el) { if (el !== 'air') return; turbine.spin = 14; turbine.spins++; trap.gateT = 25; G.hud && G.hud.toast('Wind-turbine spun — the boulder gate grinds shut'); sfx('mirror'); } });
  G.updaters.push((dt) => {
    const p = G.player; turbine.spin = Math.max(0, turbine.spin - dt * 0.5); rotor.rotation.z += turbine.spin * dt; trap.gateT -= dt; trap.t -= dt;
    const onRamp = Math.abs(p.pos.x) < 14 && p.pos.z > 8 && p.pos.z < 52 && p.pos.y < 24;
    if (trap.t <= 0 && onRamp && trap.gateT <= 0 && !G.quest.completed) {
      trap.t = 4.2; const lane = [-1.7, 0, 1.7][(Math.random() * 3) | 0]; const m = new THREE.Mesh(geo, mats.stoneDark); m.castShadow = true; G.scene.add(m);
      trap.list.push({ m, x: lane, z: 15.5, v: 2, hit: false }); trap.spawned++; sfx('golem');
    } else if (trap.t <= 0) trap.t = 1;
    for (let i = trap.list.length - 1; i >= 0; i--) {
      const b = trap.list[i]; b.v = Math.min(13, b.v + 5 * dt); b.z += b.v * 0.78 * dt; const y = Math.max(0, (41 - b.z) * 0.8) + 1.3; b.m.position.set(b.x, y, b.z); b.m.rotation.x += b.v * dt / 1.3;
      let dead = b.z > 47;
      for (const pl of G.bending.pillars) if (Math.abs(pl.box.pos.x - b.x) < 2.1 && Math.abs(pl.box.pos.z - b.z) < 2.1 && pl.top > y - 1) { dead = true; trap.jammed++; }
      tmp.set(p.pos.x, p.pos.y + 0.9, p.pos.z);
      if (!b.hit && tmp.distanceTo(b.m.position) < 2.0) { b.hit = true; if (p.iframes > 0) trap.dodged++; else if (damage(30, tmp2.set((p.pos.x - b.x) * 3, 5, 9))) trap.hits++; }
      if (dead) { emit({ pos: b.m.position, n: 30, color: 0xb9a777, spread: 5, size: 0.4, life: 0.7, gravity: 10 }); sfx('smash'); G.scene.remove(b.m); trap.list.splice(i, 1); }
    }
  });
}

export function buildObjects() {
  buildBridge(); buildStones(); buildVines(); buildZip(); buildSeesaw(); buildBoulderTrap();
  addMushroom(-9, 0, 87, 0.45); addMushroom(-14, T.heightAt(-14, 70), 70, 0.8);
}
