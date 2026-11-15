// The single quest: "The Four Elemental Trials of the Sun-Spire".
import * as THREE from 'three';
import { G, clamp, damp, angDiff, schedule } from './ctx.js';
import * as T from './terrain.js';
import { mats, boxGeo, addBlock, tex } from './world.js';
import { addBox, removeBox } from './dyn.js';
import { emit, ring } from './fx.js';
import { sfx } from './audio.js';
import { damage, startAction } from './player.js';
import { addMushroom } from './objects.js';

const V = THREE.Vector3, UP = new V(0, 1, 0);
const tmp = new V(), tmp2 = new V();
const CORE_COLORS = [0x35d0ff, 0xff7a1f, 0xb9e24a];

function beamMesh(color = 0xffd97a) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); G.scene.add(m); return m; }
function setBeam(m, a, b) { m.position.addVectors(a, b).multiplyScalar(0.5); tmp.subVectors(b, a); const l = tmp.length(); m.scale.set(1, l, 1); m.quaternion.setFromUnitVectors(UP, tmp.multiplyScalar(1 / l)); }
function makeCore(i, pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), new THREE.MeshStandardMaterial({ color: 0xffe9a0, emissive: CORE_COLORS[i], emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.6, flatShading: true })); g.add(ico);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 28), new THREE.MeshBasicMaterial({ color: CORE_COLORS[i] })); g.add(halo);
  G.scene.add(g); return { i, pos: pos.clone(), g, ico, halo, collected: false };
}
function shrine(x, y, z) {
  addBlock(0.7, 2.6, 0.7, x, y + 1.3, z, mats.obsidian, { tile: 1.5 });
  const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0x8dffd8 })); orb.position.set(x, y + 3.2, z); G.scene.add(orb);
  G.shrines.push(new V(x, y + 1, z)); G.frameUpdaters.push(() => { orb.rotation.y = G.simTime * 2; orb.position.y = y + 3.2 + Math.sin(G.simTime * 2 + x) * 0.15; });
}

export function createQuest() {
  const q = G.quest = {
    cores: [], coresCollected: 0, completed: false, eclipse: 0, victoryGlow: 0, zone: '', interactions: 0, pulses: 0,
    s1: { flameOut: false, mirrorA: 5, mirrorB: 2, solved: false, mirrorTurns: 0 },
    s2: { thornBurn: 0, burned: false, brazierL: false, brazierR: false },
    s3: { wallSmashed: false },
    rings: [false, false, false], barrier: true,
  };

  // ================= Sanctum 1 — Flooded Water & Mirror Ruins (East) =================
  const c1 = T.C1;
  addBlock(29.4, 6, 1.4, c1.x, 3, -14); addBlock(29.4, 6, 1.4, c1.x, 3, 14); addBlock(1.4, 6, 28, c1.x + 14, 3, 0);
  addBlock(1.4, 6, 11.8, c1.x - 14, 3, -8.1); addBlock(1.4, 6, 11.8, c1.x - 14, 3, 8.1); addBlock(1.4, 1.6, 4.4, c1.x - 14, 5.2, 0);
  const doorPos = new V(c1.x - 14, 2, 0);
  G.targets.push({ pos: doorPos, radius: 2.3, active: () => !q.s1.flameOut, hit(el) { if (el !== 'water') return; q.s1.flameOut = true; sfx('splash'); emit({ pos: doorPos, n: 60, color: 0xdfe8ea, spread: 4, vel: [0, 4, 0], size: 0.6, life: 1.2, drag: 1.5 }); G.hud.toast('Flame trap extinguished — the mirror heat-locks release'); } });
  const E = new V(c1.x - 9, 2.4, -9), MA = new V(c1.x + 9, 2.4, -9), MB = new V(c1.x + 9, 2.4, 0), CP = new V(c1.x, 1.75, 0);
  addBlock(1, 1.7, 1, E.x, 0.85, E.z, mats.stoneDark, { tile: 2 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); crystal.position.copy(E); G.scene.add(crystal);
  const sunMat = new THREE.MeshStandardMaterial({ map: tex.sun, roughness: 0.25, metalness: 0.85, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
  function mirror(pos, key, goal) {
    addBlock(1.2, 1.3, 1.2, pos.x, 0.65, pos.z, mats.stoneDark, { tile: 2 });
    const g = new THREE.Group(); g.position.copy(pos); const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 28), [mats.gold, sunMat, sunMat]); disc.rotation.x = Math.PI / 2; disc.castShadow = true; g.add(disc);
    g.rotation.y = q.s1[key] * Math.PI / 4; G.scene.add(g);
    const turn = () => {
      if (!q.s1.flameOut) { G.hud.toast('The mirror is heat-locked — douse the flame trap first'); sfx('fizzle'); return; }
      if (q.s1.solved) return; q.s1[key] = (q.s1[key] + 1) % 8; q.s1.mirrorTurns++; sfx('mirror'); emit({ pos, n: 10, color: 0xffd97a, spread: 2, size: 0.25, life: 0.5 });
    };
    G.targets.push({ pos, radius: 1.3, active: () => !q.s1.solved, hit(el) { if (el === 'air' || el === 'water') turn(); } });
    G.interactables.push({ pos: new V(pos.x, 1, pos.z), range: 4.4, label: 'Rotate the sun-mirror', active: () => !q.s1.solved, act: turn });
    G.frameUpdaters.push((dt) => { g.rotation.y += angDiff(g.rotation.y, q.s1[key] * Math.PI / 4) * (1 - Math.exp(-10 * dt)); });
    return { ok: () => q.s1[key] === goal };
  }
  const mA = mirror(MA, 'mirrorA', 7), mB = mirror(MB, 'mirrorB', 5);
  const b1 = beamMesh(), b2 = beamMesh(), b3 = beamMesh(); setBeam(b1, E, MA); setBeam(b2, MA, MB); setBeam(b3, MB, CP);
  addBlock(1.4, 1.0, 1.4, c1.x, 0.5, 0, mats.stoneDark, { tile: 2 });
  const cage1 = new THREE.Group(); for (let i = 0; i < 10; i++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), mats.gold); const a = i / 10 * 6.283; bar.position.set(Math.cos(a) * 1.05, 1.9, Math.sin(a) * 1.05); cage1.add(bar); } cage1.position.set(c1.x, 0, 0); G.scene.add(cage1);
  const cage1Box = addBox({ half: new V(1.1, 1.7, 1.1), pos: new V(c1.x, 1.7, 0), tag: 'cage' });
  q.cores.push(makeCore(0, CP));
  shrine(c1.x - 9, 0, 9);

  // ================= Sanctum 2 — Fire-Vine Shrine (North-West) =================
  const w2 = (d, l, y = 0) => { const w = T.s2world(d, l); return new V(w.x, y, w.z); };
  const core2P = w2(-10, 0, 1.75); addBlock(1.4, 1.0, 1.4, core2P.x, 0.5, core2P.z, mats.stoneDark, { tile: 2 });
  const thorn = new THREE.Group(); thorn.position.set(core2P.x, 0, core2P.z);
  const thornMat = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 0.9 }), spikeMat = new THREE.MeshStandardMaterial({ color: 0x4a2f22, roughness: 0.7 });
  for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283, v = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 4.6, 6), thornMat); v.position.set(Math.cos(a) * 1.8, 2.1, Math.sin(a) * 1.8); v.rotation.set(Math.sin(a * 3) * 0.35, 0, Math.cos(a * 2) * 0.35); thorn.add(v); for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 4), spikeMat); s.position.set(Math.cos(a) * 2.0, 0.6 + k * 1.0, Math.sin(a) * 2.0); s.rotation.z = Math.PI / 2 * (k % 2 ? 1 : -1); s.rotation.y = -a; thorn.add(s); } }
  G.scene.add(thorn);
  const thornBox = addBox({ half: new V(1.9, 2.2, 1.9), pos: new V(core2P.x, 2.2, core2P.z), tag: 'thorns' });
  G.targets.push({ pos: new V(core2P.x, 1.8, core2P.z), radius: 2.2, active: () => !q.s2.burned, hit(el) {
    if (el !== 'fire') { if (el === 'water' || el === 'air' || el === 'earth') emit({ pos: this.pos, n: 6, color: 0x4a8a3a, spread: 2, size: 0.2, life: 0.4 }); return; }
    q.s2.thornBurn++; emit({ pos: this.pos, n: 30, color: 0xff7a1f, spread: 3, vel: [0, 4, 0], size: 0.5, life: 0.8, radius: 1.5 });
    if (q.s2.thornBurn >= 3) { q.s2.burned = true; removeBox(thornBox); sfx('fire'); G.hud.toast('The thorn cage burns away'); }
  } });
  const braziers = ['brazierL', 'brazierR'].map((key, i) => {
    const pos = w2(-5, i ? 6 : -6, 0); addBlock(1.0, 1.2, 1.0, pos.x, 0.6, pos.z, mats.stoneDark, { tile: 2 });
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.45, 0.45, 12), mats.gold); bowl.position.set(pos.x, 1.42, pos.z); G.scene.add(bowl);
    const fp = new V(pos.x, 1.8, pos.z);
    G.targets.push({ pos: fp, radius: 1.2, active: () => !q.s2[key], hit(el) { if (el !== 'fire') return; q.s2[key] = true; sfx('fire'); G.hud.toast(q.s2.brazierL && q.s2.brazierR ? 'Both braziers blaze — the shrine seal opens' : 'Brazier ignited'); } });
    return { key, fp };
  });
  q.cores.push(makeCore(1, core2P));
  const sh2 = w2(-17, 0); shrine(sh2.x, 0, sh2.z); const sh2b = w2(57, -7); shrine(sh2b.x, T.heightAt(sh2b.x, sh2b.z), sh2b.z);

  // ================= Sanctum 3 — Earth Hollow & Obsidian-Vine Goliath (South-West) =================
  const c3 = T.C3, TOP = 9;
  addBlock(44, 4.5, 44, c3.x, 2.25, c3.z, mats.stone); addBlock(28, 4.5, 28, c3.x, 6.75, c3.z, mats.stoneDark);
  addBlock(5.6, 3.4, 0.8, c3.x, TOP + 1.7, c3.z - 2.4, mats.stone, { tile: 2 }); addBlock(0.8, 3.4, 5.6, c3.x - 2.4, TOP + 1.7, c3.z, mats.stone, { tile: 2 }); addBlock(0.8, 3.4, 5.6, c3.x + 2.4, TOP + 1.7, c3.z, mats.stone, { tile: 2 });
  addBlock(6.4, 0.6, 6.4, c3.x, TOP + 3.7, c3.z, mats.stoneDark, { tile: 2 }); addBlock(0.9, 0.7, 0.9, c3.x, TOP + 0.35, c3.z, mats.stoneDark, { tile: 1 });
  const wallPos = new V(c3.x, TOP + 1.7, c3.z + 2.4);
  const wall = new THREE.Mesh(boxGeo(4.0, 3.4, 0.8, 2), new THREE.MeshStandardMaterial({ map: tex.stone, color: 0xb8a078, roughness: 1, emissive: 0x3a2a10, emissiveIntensity: 0.5 })); wall.position.copy(wallPos); wall.castShadow = true; G.scene.add(wall);
  for (let i = 0; i < 5; i++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2 + i * 0.3, 0.04), new THREE.MeshBasicMaterial({ color: 0x1a1208 })); cr.position.set(-1.4 + i * 0.7, (i % 2) * 0.4 - 0.2, 0.41); cr.rotation.z = (i - 2) * 0.35; wall.add(cr); }
  const wallBox = addBox({ half: new V(2.0, 1.7, 0.4), pos: wallPos.clone(), tag: 'crackedWall' });
  G.targets.push({ pos: wallPos, radius: 1.9, active: () => !q.s3.wallSmashed, hit(el, kind) { if (kind !== 'boulder') return; q.s3.wallSmashed = true; removeBox(wallBox); G.scene.remove(wall); sfx('smash'); emit({ pos: wallPos, n: 70, color: 0xb9a777, spread: 6, size: 0.45, life: 1, gravity: 10 }); G.hud.toast('The cracked vault wall shatters'); } });
  const core3P = new V(c3.x, TOP + 1.3, c3.z); q.cores.push(makeCore(2, core3P));
  const seal = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4dff8a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); seal.position.copy(core3P); G.scene.add(seal);
  addMushroom(c3.x, 4.5, c3.z + 18, 0.5); addMushroom(c3.x + 18, 4.5, c3.z, 0.85); addMushroom(c3.x + 26, 0, c3.z + 5, 0.3);
  shrine(c3.x + 27, 0, c3.z - 7);

  // ---- Goliath (4.2 m)
  const go = G.goliath = { pos: new V(c3.x + 9.5, TOP, c3.z + 9.5), yaw: 0, hp: 3, stunT: 0, stagger: 0, windup: 0, cd: 0, throwCd: 3, dead: false, wp: 0, hitsTaken: 0, stuns: 0, slams: 0, combo: {}, burn: 0, walk: 0 };
  const gg = new THREE.Group(); G.scene.add(gg);
  const part = (w, h, d, x, y, z, mat = mats.obsidian) => { const m = new THREE.Mesh(boxGeo(w, h, d, 1.5), mat); m.position.set(x, y, z); m.castShadow = true; gg.add(m); return m; };
  const legL = part(0.75, 1.6, 0.8, 0.55, 0.8, 0), legR = part(0.75, 1.6, 0.8, -0.55, 0.8, 0); part(2.0, 1.6, 1.2, 0, 2.35, 0); part(1.5, 0.5, 1.0, 0, 1.75, 0, mats.moss);
  const head = part(0.85, 0.8, 0.85, 0, 3.6, 0.05); part(1.1, 0.2, 1.1, 0, 4.1, 0.05, mats.moss);
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(1.35, 3.0, 0); armR.position.set(-1.35, 3.0, 0); gg.add(armL, armR);
  for (const a of [armL, armR]) { const m = new THREE.Mesh(boxGeo(0.65, 2.0, 0.7, 1.5), mats.obsidian); m.position.y = -0.9; m.castShadow = true; a.add(m); const f = new THREE.Mesh(boxGeo(0.85, 0.7, 0.9, 1.5), mats.moss); f.position.y = -2.0; a.add(f); }
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x6dff9a }); for (const sx of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), eyeMat); e.position.set(sx, 3.65, 0.5); gg.add(e); }
  const goBox = addBox({ half: new V(1.05, 2.1, 0.85), pos: new V(), tag: 'goliath' });
  const goTarget = { pos: new V(), radius: 1.9, active: () => !go.dead, hit(el, kind, info) {
    go.hitsTaken++; go.combo[el] = G.simTime; const dir = info && info.dir;
    emit({ pos: this.pos, n: 18, color: { water: 0x58d8ff, earth: 0xb9a777, fire: 0xff7a1f, air: 0xe6f6ff }[el], spread: 4, size: 0.4, life: 0.6 });
    if (kind === 'boulder') { go.hp -= 1; stun(6); }
    else if (el === 'fire') { go.burn++; go.stagger = Math.max(go.stagger, 0.35); if (go.burn >= 6) { go.burn = 0; go.hp -= 0.5; stun(3); } }
    else if (el === 'water') { go.stagger = Math.max(go.stagger, 1.5); if (dir) push(dir, 1.5); }
    else if (el === 'air') { go.stagger = Math.max(go.stagger, 1.2); if (dir) push(dir, 3.5); }
    const fresh = Object.values(go.combo).filter((t) => G.simTime - t < 6).length;
    if (fresh >= 3 && go.stunT <= 0) { stun(6); G.hud.toast('Elemental combo — the Goliath is stunned!'); }
    if (go.hp <= 0 && !go.dead) { go.dead = true; removeBox(goBox); sfx('smash'); sfx('golem'); emit({ pos: this.pos, n: 90, color: 0x6dff9a, spread: 7, size: 0.5, life: 1.2, gravity: 8 }); G.hud.toast('The Obsidian-Vine Goliath crumbles'); }
  } };
  G.targets.push(goTarget);
  function stun(t) { if (go.stunT <= 0) { go.stuns++; sfx('golem'); G.hud.toast('Goliath stunned — claim the core!'); } go.stunT = Math.max(go.stunT, t); go.windup = 0; }
  function push(dir, d) { go.pos.x += dir.x * d; go.pos.z += dir.z * d; }
  const rockGeo = new THREE.DodecahedronGeometry(0.45, 0), WPS = [[9.5, 9.5], [-9.5, 9.5], [-9.5, -9.5], [9.5, -9.5]];
  G.updaters.push((dt) => {
    const p = G.player;
    if (go.dead) { gg.position.y = Math.max(TOP - 4.5, gg.position.y - dt * 2.2); gg.rotation.x = Math.min(1.2, gg.rotation.x + dt); return; }
    go.cd -= dt; go.throwCd -= dt;
    const dx = p.pos.x - go.pos.x, dz = p.pos.z - go.pos.z, dist = Math.hypot(dx, dz);
    const inArena = p.pos.y > TOP - 1.5 && p.pos.y < TOP + 9 && Math.abs(p.pos.x - c3.x) < 15 && Math.abs(p.pos.z - c3.z) < 15;
    const aware = (inArena || (p.pos.y > 3.5 && dist < 30)) && !p.frozen; let moving = 0;
    if (go.stunT > 0) { go.stunT -= dt; if (Math.random() < 0.3) emit({ pos: tmp.set(go.pos.x, go.pos.y + 4.4, go.pos.z), n: 1, color: 0xfff29a, spread: 2, size: 0.25, life: 0.5 }); }
    else if (go.stagger > 0) go.stagger -= dt;
    else if (go.windup > 0) {
      go.windup -= dt;
      if (go.windup <= 0) { go.slams++; go.cd = 1.6; sfx('earth'); tmp.set(go.pos.x + Math.sin(go.yaw) * 2, go.pos.y, go.pos.z + Math.cos(go.yaw) * 2); ring(tmp, 0x6dff9a, 5, 0.5); emit({ pos: tmp, n: 30, color: 0xb9a777, spread: 4, vel: [0, 3, 0], size: 0.4, life: 0.7, gravity: 9 }); if (dist < 4.4 && Math.abs(p.pos.y - TOP) < 2.6) damage(25, tmp2.set(dx / (dist || 1) * 9, 6, dz / (dist || 1) * 9)); }
    } else if (aware) {
      go.yaw += angDiff(go.yaw, Math.atan2(dx, dz)) * (1 - Math.exp(-4 * dt));
      if (inArena) { if (dist > 2.7) { go.pos.x += dx / dist * 2.7 * dt; go.pos.z += dz / dist * 2.7 * dt; moving = 1; } if (dist < 3.4 && go.cd <= 0) { go.windup = 0.8; sfx('golem'); } }
      if (dist > 8 && go.throwCd <= 0) {
        go.throwCd = 4.5; const m = new THREE.Mesh(rockGeo, mats.obsidian); G.scene.add(m); const pos = new V(go.pos.x, go.pos.y + 3.4, go.pos.z);
        const vel = new V(p.pos.x, p.pos.y + 1, p.pos.z).sub(pos).normalize().multiplyScalar(15); G.enemyProjectiles.push({ pos, vel, m, t: 0, deflected: false, home: goTarget.pos }); sfx('golem');
      }
    } else { const w = WPS[go.wp], tx = c3.x + w[0] - go.pos.x, tz = c3.z + w[1] - go.pos.z, d = Math.hypot(tx, tz); if (d < 0.6) go.wp = (go.wp + 1) % 4; else { go.pos.x += tx / d * 1.6 * dt; go.pos.z += tz / d * 1.6 * dt; go.yaw += angDiff(go.yaw, Math.atan2(tx, tz)) * (1 - Math.exp(-4 * dt)); moving = 0.6; } }
    go.pos.x = clamp(go.pos.x, c3.x - 12.6, c3.x + 12.6); go.pos.z = clamp(go.pos.z, c3.z - 12.6, c3.z + 12.6);
    const lx = go.pos.x - c3.x, lz = go.pos.z - c3.z; if (Math.abs(lx) < 4.4 && Math.abs(lz) < 4.4) { if (Math.abs(lx) > Math.abs(lz)) go.pos.x = c3.x + Math.sign(lx || 1) * 4.4; else go.pos.z = c3.z + Math.sign(lz || 1) * 4.4; }
    go.walk += dt * 5 * moving; goTarget.pos.set(go.pos.x, go.pos.y + 2.3, go.pos.z);
    goBox.pos.set(go.pos.x, go.pos.y + 2.1, go.pos.z); goBox.quat.setFromAxisAngle(UP, go.yaw);
    gg.position.copy(go.pos); gg.rotation.y = go.yaw; gg.rotation.z = go.stunT > 0 ? Math.sin(G.simTime * 3) * 0.08 : 0;
    legL.position.z = Math.sin(go.walk) * 0.4; legR.position.z = -Math.sin(go.walk) * 0.4; head.rotation.x = go.stunT > 0 ? 0.5 : 0;
    const raise = go.windup > 0 ? -2.6 * (1 - go.windup / 0.8) : (go.cd > 1.2 ? -0.4 : Math.sin(go.walk) * 0.25); armL.rotation.x = raise; armR.rotation.x = go.windup > 0 ? raise : -Math.sin(go.walk) * 0.25;
    eyeMat.color.set(go.stunT > 0 ? 0xfff29a : 0x6dff9a);
    // thrown rocks (deflectable with Air)
    for (let i = G.enemyProjectiles.length - 1; i >= 0; i--) {
      const r = G.enemyProjectiles[i]; r.t += dt; r.pos.addScaledVector(r.vel, dt); r.m.position.copy(r.pos); r.m.rotation.x += dt * 6; let dead = r.t > 4;
      tmp.set(p.pos.x, p.pos.y + 1, p.pos.z);
      if (!r.deflected && tmp.distanceTo(r.pos) < 1.1) { damage(18, tmp2.copy(r.vel).multiplyScalar(0.4).setY(4)); dead = true; }
      if (r.deflected && r.pos.distanceTo(goTarget.pos) < 2.3) { goTarget.hit('earth', 'boulder', { dir: r.vel.clone().normalize() }); dead = true; }
      if (dead) { emit({ pos: r.pos, n: 14, color: 0x6a6a7a, spread: 3, size: 0.3, life: 0.5, gravity: 9 }); G.scene.remove(r.m); G.enemyProjectiles.splice(i, 1); }
    }
  });

  // ================= Finale — sky-rings, storm barrier, Summit Altar =================
  const ringPos = [new V(23, 23, 15), new V(-21, 27, -3), new V(5, 34, -13)];
  const ringMeshes = ringPos.map((rp, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.8, emissive: 0xffd97a, emissiveIntensity: 0.15 });
    const m = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.42, 8, 28), mat); m.position.copy(rp); m.rotation.y = Math.atan2(rp.x, rp.z) + Math.PI / 2; m.castShadow = true; G.scene.add(m);
    for (let k = 0; k < 3; k++) { const mono = new THREE.Mesh(boxGeo(0.8, 2.4, 0.8, 1.5), mats.obsidian); mono.position.set(rp.x + Math.cos(k * 2.1 + i) * 5.2, rp.y + Math.sin(k * 1.7) * 2, rp.z + Math.sin(k * 2.1 + i) * 5.2); mono.rotation.set(k * 0.4, k, 0.3); G.scene.add(mono); }
    return m;
  });
  const barrier = new THREE.Mesh(new THREE.SphereGeometry(7.6, 28, 18), new THREE.MeshBasicMaterial({ color: 0x8a5cff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); barrier.position.set(0, T.SUMMIT_Y + 1, 0); G.scene.add(barrier);
  shrine(-7.5, 20, 13.5); shrine(5, 0, 88);
  const altarPos = new V(0, T.SUMMIT_Y + 1, 0);
  const skyBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 500, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); skyBeam.position.set(0, T.SUMMIT_Y + 250, 0); G.scene.add(skyBeam);
  G.interactables.push({ pos: altarPos, range: 5.6, label: 'Awaken the Summit Altar', active: () => !q.completed, act() {
    if (q.coresCollected < 3) { G.hud.toast(`The altar needs all 3 Solar Cores (${q.coresCollected}/3)`); sfx('fizzle'); return; }
    victory();
  } });
  function victory() {
    const p = G.player; q.completed = true; q.completeTime = G.simTime; p.frozen = true; p.flying = false; p.vine = null; p.zip = null;
    p.pos.set(0, T.SUMMIT_Y + 0.02, 2.6); p.prevPos.copy(p.pos); p.yaw = Math.PI; p.vel.set(0, 0, 0); p.action = null;
    G.cinematic = { t: 0 }; sfx('victory'); G.hud.toast('The Sun-Spire awakens!');
    q.cores.forEach((c) => { c.g.visible = true; });
    schedule(6.5, () => G.hud.showVictory());
  }

  // ================= shared logic =================
  function collect(c) {
    c.collected = true; c.g.visible = false; q.coresCollected++; sfx('core'); ring(c.pos, CORE_COLORS[c.i], 8, 1.2); emit({ pos: c.pos, n: 80, color: CORE_COLORS[c.i], spread: 6, vel: [0, 3, 0], size: 0.45, life: 1.2, drag: 1.5 });
    G.hud.toast(`Solar Core ${['I', 'II', 'III'][c.i]} recovered (${q.coresCollected}/3)`); G.player.chi = 100;
  }
  const locked = [() => !q.s1.solved, () => !(q.s2.burned && q.s2.brazierL && q.s2.brazierR), () => !(q.s3.wallSmashed && (go.dead || go.stunT > 0))];
  q.objective = () => {
    const p = G.player;
    if (q.completed) return { text: 'Quest complete — the Sun-Spire is awake', pos: altarPos };
    if (!q.cores[0].collected) {
      if (!q.s1.flameOut) return { text: 'East: hop the river stones, douse the flame trap with Water', pos: doorPos };
      if (!mA.ok()) return { text: 'Rotate the first sun-mirror (L1 / Air / Water)', pos: MA };
      if (!mB.ok()) return { text: 'Rotate the second sun-mirror to finish the beam', pos: MB };
      return { text: 'Claim Solar Core I', pos: CP };
    }
    if (!q.cores[1].collected) {
      const s = T.s2local(p.pos.x, p.pos.z);
      if (s.r > 31.5) return { text: 'North-west: cross the 18-plank Razorback bridge', pos: G.bridge.A };
      if (s.d > 6.5) return { text: 'Swing the liana vine across the waterfall chasm (L1)', pos: w2(17.5, 3, 1) };
      if (!q.s2.burned) return { text: 'Burn the thorn cage with Fire', pos: core2P };
      if (!q.s2.brazierL) return { text: 'Ignite the twin braziers with Fire', pos: braziers[0].fp };
      if (!q.s2.brazierR) return { text: 'Ignite the twin braziers with Fire', pos: braziers[1].fp };
      return { text: 'Claim Solar Core II, then ride the zip-line back', pos: core2P };
    }
    if (!q.cores[2].collected) {
      if (!q.s3.wallSmashed) return { text: 'South-west: scale the terraces (Earth pillar / mushrooms), smash the cracked vault with a Boulder', pos: wallPos };
      if (!go.dead && go.stunT <= 0) return { text: 'Stun the Obsidian-Vine Goliath (Boulder Hurl / elemental combo)', pos: goTarget.pos };
      return { text: 'Claim Solar Core III', pos: core3P };
    }
    const ri = q.rings.indexOf(false);
    if (ri >= 0) return { text: `Fly (R1) through the sky-ring monoliths (${3 - q.rings.filter((r) => !r).length}/3)`, pos: ringPos[ri] };
    return { text: 'Awaken the Summit Altar (L1)', pos: altarPos };
  };
  q.interact = () => {
    const p = G.player; q.pulses++; sfx('pulse'); ring(p.pos, 0xffd97a, 14, 1.1); if (!p.action && !p.flying) startAction('pulse', 0.5);
    const o = q.objective(); tmp.subVectors(o.pos, p.pos); const d = tmp.length(); tmp.normalize();
    for (let i = 1; i < 14; i++) { tmp2.copy(p.pos).addScaledVector(tmp, Math.min(d, i * 1.1)); tmp2.y += 1.2; emit({ pos: tmp2, n: 2, color: 0xffd97a, spread: 0.3, vel: [tmp.x * 3, tmp.y * 3, tmp.z * 3], size: 0.3, life: 0.5 + i * 0.07, drag: 0.5 }); }
    G.hud.pulse();
    let best = null, bd = 1e9; for (const it of G.interactables) { if (!it.active()) continue; const dd = it.pos.distanceTo(p.pos); if (dd < it.range && dd < bd) { bd = dd; best = it; } }
    if (best) { q.interactions++; best.act(); }
  };
  q.prompt = () => { const p = G.player; let best = null, bd = 1e9; for (const it of G.interactables) { if (!it.active()) continue; const dd = it.pos.distanceTo(p.pos); if (dd < it.range && dd < bd) { bd = dd; best = it; } } return best ? best.label : ''; };

  G.updaters.push((dt) => {
    const p = G.player;
    if (!q.completed) q.eclipse = clamp(G.simTime / 900, 0, 0.85);
    // S1 flame trap
    if (!q.s1.flameOut) {
      if (p.pos.distanceToSquared(doorPos) < 80 * 80) for (let i = 0; i < 3; i++) emit({ pos: tmp.set(doorPos.x, 0.3 + Math.random() * 3.6, (Math.random() - 0.5) * 4.2), n: 1, color: Math.random() < 0.3 ? 0xffd35a : 0xff5a1f, spread: 0.7, vel: [0, 2.5, 0], size: 0.6, life: 0.6, drag: 1 });
      if (Math.abs(p.pos.x - doorPos.x) < 1.5 && Math.abs(p.pos.z) < 2.4 && p.pos.y < 4.4) { const side = p.pos.x < doorPos.x ? -1 : 1; p.pos.x = doorPos.x + side * 1.6; p.vel.x = side * 4; if (!(q._ft > G.simTime)) { q._ft = G.simTime + 0.8; p.iframes = 0; damage(12, tmp.set(side * 3, 3, 0)); } }
    }
    if (!q.s1.solved && q.s1.flameOut && mA.ok() && mB.ok()) { q.s1.solved = true; removeBox(cage1Box); sfx('core'); G.hud.toast('The sun-beam strikes the seal — Core I is free'); emit({ pos: CP, n: 40, color: 0xffd97a, spread: 4, size: 0.4, life: 0.9 }); }
    // braziers
    for (const b of braziers) if (q.s2[b.key] && p.pos.distanceToSquared(b.fp) < 3600) emit({ pos: b.fp, n: 1, color: 0xff7a1f, spread: 0.5, vel: [0, 2, 0], size: 0.5, life: 0.6, radius: 0.2 });
    // cores
    for (const c of q.cores) { if (c.collected || locked[c.i]()) continue; if (Math.hypot(p.pos.x - c.pos.x, p.pos.z - c.pos.z) < 2.3 && Math.abs(p.pos.y + 0.9 - c.pos.y) < 2.4) collect(c); }
    // sky rings + barrier
    for (let i = 0; i < 3; i++) if (!q.rings[i] && tmp.set(p.pos.x, p.pos.y + 0.9, p.pos.z).distanceTo(ringPos[i]) < 3.5) { q.rings[i] = true; sfx('core'); ring(ringPos[i], 0xffd97a, 7, 0.9, 0); G.hud.toast(`Sky-ring ${q.rings.filter(Boolean).length}/3 attuned`); if (q.rings.every(Boolean)) { q.barrier = false; G.hud.toast('The storm barrier around the summit dissolves'); } }
    if (q.barrier) { tmp.set(p.pos.x, p.pos.y + 0.9 - (T.SUMMIT_Y + 1), p.pos.z); const d = tmp.length(); if (d < 8) { tmp.multiplyScalar(1 / (d || 1)); p.pos.addScaledVector(tmp, 8 - d + 0.05); const vn = p.vel.dot(tmp); if (vn < 0) p.vel.addScaledVector(tmp, -vn * 1.6); if (!q._bt || G.simTime - q._bt > 3) { q._bt = G.simTime; G.hud.toast('A storm barrier shields the summit — attune the 3 sky-rings'); sfx('fizzle'); } } }
    const z = T.zoneAt(p.pos.x, p.pos.y, p.pos.z); if (z !== q.zone) { q.zone = z; G.hud.zone(z); }
  });
  G.frameUpdaters.push((dt) => {
    const t = G.simTime;
    q.cores.forEach((c, i) => { c.ico.rotation.y = t * 1.5; c.halo.rotation.x = t * 1.2 + i; c.halo.rotation.y = t * 0.8; if (!q.completed) c.g.position.y = c.pos.y + Math.sin(t * 2 + i) * 0.12; });
    b1.visible = true; b2.visible = q.s1.flameOut && mA.ok(); b3.visible = b2.visible && mB.ok(); b1.material.opacity = q.s1.flameOut ? 0.85 : 0.3; crystal.rotation.y = t;
    cage1.visible = !q.s1.solved; thorn.visible = !q.s2.burned; if (q.s2.thornBurn > 0 && !q.s2.burned) thorn.scale.setScalar(1 - q.s2.thornBurn * 0.08);
    seal.visible = !q.cores[2].collected && !go.dead && go.stunT <= 0; seal.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
    ringMeshes.forEach((m, i) => { m.material.emissiveIntensity = damp(m.material.emissiveIntensity, q.rings[i] ? 2.4 : 0.15 + Math.sin(t * 2 + i) * 0.08, 4, dt); m.rotation.z += dt * (q.rings[i] ? 1.2 : 0.2); });
    barrier.visible = q.barrier; barrier.material.opacity = 0.16 + Math.sin(t * 3) * 0.06; barrier.rotation.y = t * 0.3;
    if (G.cinematic) {
      const c = G.cinematic; c.t += dt; const u = clamp(c.t / 6, 0, 1); q.victoryGlow = damp(q.victoryGlow, 1, 1.2, dt); q.eclipse = damp(q.eclipse, 0, 1, dt);
      skyBeam.material.opacity = Math.min(0.75, c.t * 0.35); skyBeam.scale.set(1 + Math.sin(t * 6) * 0.08 + u * 1.2, 1, 1 + Math.sin(t * 6) * 0.08 + u * 1.2);
      q.cores.forEach((cr, i) => { const a = t * 1.6 + i * 2.094, r = Math.max(0.5, 3.2 - c.t * 0.5); cr.g.position.set(Math.cos(a) * r, T.SUMMIT_Y + 2 + Math.min(3, c.t * 0.6), Math.sin(a) * r); });
      if (Math.random() < 0.9) emit({ pos: tmp.set((Math.random() - 0.5) * 3, T.SUMMIT_Y + 1.4, (Math.random() - 0.5) * 3), n: 3, color: 0xffe9a0, spread: 1.2, vel: [0, 9, 0], size: 0.5, life: 1.4, drag: 0.2 });
      const a = 0.4 + c.t * 0.22, r = 9 + u * 9; G.camera.position.set(Math.sin(a) * r, T.SUMMIT_Y + 3.5 + u * 7, Math.cos(a) * r); G.camera.lookAt(0, T.SUMMIT_Y + 2 + u * 5, 0);
    }
  });
  return q;
}
