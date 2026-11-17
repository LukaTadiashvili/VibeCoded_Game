// Player controller: 60 Hz capsule physics (three-mesh-bvh sweeps), ground/air/roll/dash,
// 6-DOF flight, vine pendulum, zip-line, plus the third-person camera.
import * as THREE from 'three';
import { G, clamp, damp, angDiff } from './ctx.js';
import * as T from './terrain.js';
import { resolveStatic, raycast, treesNear, staticGroundY } from './world.js';
import { resolveDyn, dynTopY } from './dyn.js';
import { emit, ring } from './fx.js';
import { sfx } from './audio.js';

const V = THREE.Vector3;
export const RADIUS = 0.34, HEIGHT = 1.82, MASS = 82, GRAV = 18;
const JUMP_V = 7.6, HOP_V = 7.0, SNEAK = 1.8, JOG = 4.6, SPRINT = 7.6, ROLL_V = 9.5, ROLL_T = 0.55;
export const FLY_CRUISE = 14, FLY_BOOST = 22, DASH_V = 16, DASH_T = 1.2;

const seg = new THREE.Line3(), before = new V(), d1 = new V(), delta = new V(), newPos = new V(), n = new V();
const move = new V(), fwd = new V(), right = new V(), tmp = new V(), tmp2 = new V();
const dynRes = { box: null, ny: 0, any: false }, near = [];

export function createPlayer() {
  const p = G.player = {
    pos: new V(T.CAMP.x, 0.3, T.CAMP.z), prevPos: new V(T.CAMP.x, 0.3, T.CAMP.z), vel: new V(), yaw: Math.PI,
    grounded: false, groundedAnim: false, coyote: 0, airJumps: 0, flying: false, chi: 100, chiDelay: 0, hp: 100, hurtT: 0,
    rollT: 0, rollDur: ROLL_T, rollDir: new V(), dashT: 0, dashDir: new V(), iframes: 0, vine: null, zip: null, grabCd: 0,
    groundBox: null, friction: 1, checkpoint: new V(T.CAMP.x, 0.3, T.CAMP.z), cpT: 0, frozen: false, action: null, attackGlow: 0,
    speedH: 0, yawRate: 0, landImpact: 0, sneaking: false, stepT: 0, respawns: 0, maxAlt: 0, distance: 0,
  };
  return p;
}

export function useChi(n) { const p = G.player; if (p.chi < n) { sfx('fizzle'); G.hud && G.hud.flashChi(); return false; } p.chi -= n; p.chiDelay = 0.7; return true; }
export function damage(n, knock) {
  const p = G.player; if (p.iframes > 0 || p.frozen) return false;
  p.hp -= n; p.hurtT = 5; p.iframes = 0.7; sfx('hurt'); G.hud && G.hud.flashHurt();
  if (knock) { p.vel.add(knock); p.grounded = false; p.flying = false; p.dashT = 0; }
  if (p.hp <= 0) respawn('Cole was overwhelmed');
  return true;
}
export function respawn(msg) {
  const p = G.player; p.pos.copy(p.checkpoint); p.prevPos.copy(p.pos); p.vel.set(0, 0, 0); p.hp = 100; p.chi = Math.max(p.chi, 60);
  p.flying = false; p.vine = null; p.zip = null; p.dashT = 0; p.rollT = 0; p.iframes = 1.5; p.respawns++; camInit = false;
  G.hud && G.hud.toast(msg || 'Swept away — back to solid ground');
}
export function startAction(name, dur, alt = 0) { const p = G.player; p.action = { name, t: 0, dur, alt }; p.attackGlow = dur + 0.25; }
export function setFlying(on) {
  const p = G.player; if (on === p.flying) return;
  if (on) {
    if (p.chi < 10) { sfx('fizzle'); G.hud && G.hud.flashChi(); return; }
    p.flying = true; p.vine = null; p.zip = null; p.dashT = 0; p.rollT = 0; p.vel.y = Math.max(p.vel.y, 5.5); p.grounded = false;
    sfx('flight'); ring(p.pos, 0xdff4ff, 5, 0.7); emit({ pos: p.pos, n: 40, color: 0xcfeeff, spread: 5, vel: [0, 2, 0], size: 0.4, life: 0.7, drag: 2 });
  } else { p.flying = false; sfx('air'); emit({ pos: p.pos, n: 20, color: 0xcfeeff, spread: 3, size: 0.35, life: 0.5, drag: 2 }); }
}
function stickDir(out) {
  const i = G.input, yaw = i.yaw; fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  out.set(0, 0, 0).addScaledVector(fwd, i.my).addScaledVector(right, i.mx); const m = Math.min(1, out.length()); if (m > 1e-4) out.normalize(); return m;
}
export function aimForward(out) { const y = G.input.yaw; return out.set(-Math.sin(y), 0, -Math.cos(y)); }
export function facingDir(out) { const p = G.player; return out.set(Math.sin(p.yaw), 0, Math.cos(p.yaw)); }

function handleButton(name) {
  const p = G.player, B = G.bending;
  switch (name) {
    case 'A_JUMP':
      if (p.vine) { releaseVine(true); break; }
      if (p.zip) { p.zip = null; p.grabCd = 1; break; }
      if (p.flying) break;
      if ((p.grounded || p.coyote > 0) && p.rollT <= 0) { p.vel.y = JUMP_V; p.grounded = false; p.coyote = 0; p.airJumps = 0; sfx('jump'); emit({ pos: p.pos, n: 8, color: 0xc8b890, spread: 1.5, size: 0.25, life: 0.4, drag: 3 }); }
      else if (p.airJumps < 1 && p.dashT <= 0) { p.airJumps++; p.vel.y = HOP_V; sfx('jump'); ring(p.pos, 0xdff4ff, 1.6, 0.35, 0); emit({ pos: p.pos, n: 12, color: 0xdff4ff, spread: 2, vel: [0, -2, 0], size: 0.25, life: 0.35, drag: 3 }); }
      break;
    case 'B_ROLL':
      if (p.flying || p.vine || p.zip) break;
      if (p.grounded && p.rollT <= 0 && p.dashT <= 0) {
        const m = stickDir(move); if (m > 0.2) p.rollDir.copy(move); else facingDir(p.rollDir);
        p.rollT = ROLL_T; p.iframes = Math.max(p.iframes, ROLL_T - 0.05); p.yaw = Math.atan2(p.rollDir.x, p.rollDir.z); sfx('roll');
      }
      break;
    case 'X_BEND_PRIMARY': B.primary(); break;
    case 'Y_BEND_HEAVY': B.heavy(); break;
    case 'R1_FLIGHT': setFlying(!p.flying); break;
    case 'L1_PULSE_INTERACT': G.quest.interact(); break;
    case 'DPAD_WATER': B.setElement('water'); break;
    case 'DPAD_EARTH': B.setElement('earth'); break;
    case 'DPAD_FIRE': B.setElement('fire'); break;
    case 'DPAD_AIR': B.setElement('air'); break;
  }
}

export function attachVine(vine) {
  const p = G.player; if (p.grabCd > 0 || p.flying) return false;
  tmp.copy(p.pos); tmp.y += 1.7; const L = clamp(tmp.distanceTo(vine.pivot), 4, 14.5);
  p.vine = { vine, L, t: 0 }; p.dashT = 0; p.rollT = 0; p.grounded = false; p.airJumps = 0; sfx('creak');
  // push off toward the far side of the pivot
  tmp2.set(vine.pivot.x - p.pos.x, 0, vine.pivot.z - p.pos.z); if (tmp2.lengthSq() > 0.01) { tmp2.normalize(); p.vel.addScaledVector(tmp2, 2.2); }
  return true;
}
function releaseVine(boost) { const p = G.player; if (!p.vine) return; p.vine = null; p.grabCd = 1.2; if (boost) { p.vel.multiplyScalar(1.12); p.vel.y += 2.2; } }
export function attachZip(zip) { const p = G.player; if (p.grabCd > 0) return false; p.flying = false; p.vine = null; p.zip = { zip, s: 0.01, v: 7.5 }; p.dashT = 0; sfx('creak'); return true; }

function collide(p, dt) {
  const vyBefore = p.vel.y;
  seg.start.set(p.pos.x, p.pos.y + RADIUS, p.pos.z); seg.end.set(p.pos.x, p.pos.y + HEIGHT - RADIUS, p.pos.z);
  before.copy(seg.start);
  resolveStatic(seg, RADIUS);
  d1.subVectors(seg.start, before);
  resolveDyn(seg, RADIUS, dynRes);
  // tree trunks
  treesNear(p.pos.x, p.pos.z, near);
  for (const t of near) { if (seg.start.y - RADIUS > t.y + t.h) continue; const dx = seg.start.x - t.x, dz = seg.start.z - t.z, d = Math.hypot(dx, dz), m = t.r * 0.9 + RADIUS; if (d < m && d > 1e-4) { const k = (m - d) / d; seg.start.x += dx * k; seg.start.z += dz * k; seg.end.x += dx * k; seg.end.z += dz * k; } }
  newPos.set(seg.start.x, seg.start.y - RADIUS, seg.start.z); delta.subVectors(newPos, p.pos); p.pos.copy(newPos);
  const sLen = d1.length(); const sGround = sLen > 1e-6 && d1.y / sLen > 0.5;
  let grounded = sGround || !!dynRes.box; p.groundBox = dynRes.box; p.friction = dynRes.box ? dynRes.box.friction : 1;
  const b = dynRes.box;
  if (b && b.bounce && vyBefore < -1.5) { p.vel.y = clamp(-vyBefore * b.bounce, 15, 21); grounded = false; p.airJumps = 0; b.squash = 1; p.groundBox = null; sfx('bounce'); emit({ pos: p.pos, n: 24, color: b.glow || 0x7dffd0, spread: 3, vel: [0, 3, 0], size: 0.3, life: 0.6, drag: 2 }); return false; }
  if (grounded) { if (p.vel.y < 0) p.vel.y = 0; if (b && b.vel.y > 0.5) p.vel.y = Math.max(p.vel.y, b.vel.y); }
  else if (delta.lengthSq() > 1e-10) { n.copy(delta).normalize(); const vn = p.vel.dot(n); if (vn < 0) p.vel.addScaledVector(n, -vn); }
  return grounded;
}

function stepVine(p, dt) {
  const s = p.vine, m = stickDir(move);
  p.vel.y -= GRAV * dt; if (m > 0.1) p.vel.addScaledVector(move, 5 * m * dt);
  p.pos.addScaledVector(p.vel, dt);
  tmp.set(p.pos.x, p.pos.y + 1.7, p.pos.z).sub(s.vine.pivot); const len = tmp.length();
  if (len > s.L) { tmp.multiplyScalar(1 / len); p.pos.set(s.vine.pivot.x + tmp.x * s.L, s.vine.pivot.y + tmp.y * s.L - 1.7, s.vine.pivot.z + tmp.z * s.L); const vn = p.vel.dot(tmp); if (vn > 0) p.vel.addScaledVector(tmp, -vn); }
  const g = collide(p, dt); s.t += dt;
  if (p.speedH > 0.5) p.yaw = Math.atan2(p.vel.x, p.vel.z);
  if ((g && s.t > 0.7 && T.hazardY(p.pos.x, p.pos.z) === -Infinity) || s.t > 9) { releaseVine(false); p.grounded = g; }
}
function stepZip(p, dt) {
  const z = p.zip, zl = z.zip;
  z.v = Math.min(17, z.v + (GRAV * zl.slope * 1.4 + 1.2) * dt); z.s += z.v * dt / zl.len;
  zl.point(z.s, tmp); p.pos.set(tmp.x, tmp.y - 1.95, tmp.z); p.vel.copy(zl.dir).multiplyScalar(z.v); p.yaw = Math.atan2(zl.dir.x, zl.dir.z);
  if (Math.random() < 0.5) emit({ pos: tmp, n: 1, color: 0xffd27a, spread: 1, size: 0.12, life: 0.3, gravity: 6 });
  if (z.s >= 0.975) { p.zip = null; p.grabCd = 1; p.vel.multiplyScalar(0.55); }
}

export function stepPlayer(dt) {
  const p = G.player, inp = G.input;
  p.prevPos.copy(p.pos);
  if (p.frozen) { inp.queue.length = 0; p.vel.set(0, 0, 0); p.speedH = 0; return; }
  for (const b of inp.queue) handleButton(b); inp.queue.length = 0;
  p.iframes -= dt; p.grabCd -= dt; p.hurtT -= dt; p.attackGlow -= dt;
  if (p.action) { p.action.t += dt; if (p.action.t >= p.action.dur) p.action = null; }
  const yaw0 = p.yaw; const wasGrounded = p.grounded;

  if (p.vine) stepVine(p, dt);
  else if (p.zip) stepZip(p, dt);
  else {
    const mag = stickDir(move);
    if (p.flying) {
      const boost = (mag > 0.95 || inp.sprint) && mag > 0.3; const spd = boost ? FLY_BOOST : FLY_CRUISE;
      p.chi -= (boost ? 10 : 6) * dt; p.chiDelay = 0.6;
      let e = inp.pitch - 0.2; e = Math.abs(e) < 0.12 ? 0 : e - Math.sign(e) * 0.12; e = clamp(e, -0.9, 0.9);
      tmp.copy(fwd).multiplyScalar(Math.cos(e) * inp.my * spd); tmp.y = -Math.sin(e) * inp.my * spd; tmp.addScaledVector(right, inp.mx * spd * 0.85);
      tmp.y += (inp.held.A_JUMP ? 9 : 0) - (inp.held.B_ROLL ? 9 : 0);
      // automatic canopy / trunk avoidance
      treesNear(p.pos.x, p.pos.z, near);
      for (const t of near) { if (p.pos.y > t.y + t.h + 2.5) continue; const dx = p.pos.x - t.x, dz = p.pos.z - t.z, d = Math.hypot(dx, dz); if (d < 5 && d > 0.01) { const k = (1 - d / 5) * 9; tmp.x += dx / d * k; tmp.z += dz / d * k; tmp.y += k * 0.5; } }
      p.vel.lerp(tmp, 1 - Math.exp(-3.4 * dt));
      const hs = Math.hypot(p.vel.x, p.vel.z);
      const want = hs > 1.2 ? Math.atan2(p.vel.x, p.vel.z) : (mag > 0.1 ? Math.atan2(move.x, move.z) : p.yaw);
      p.yaw += angDiff(p.yaw, want) * (1 - Math.exp(-7 * dt));
      if (Math.random() < 0.6) emit({ pos: tmp2.set(p.pos.x, p.pos.y + 0.2, p.pos.z), n: 1, color: 0xdff4ff, spread: 1.2, size: 0.22, life: 0.5, drag: 1.5, radius: 0.3, alpha: 0.5 });
      if (p.chi <= 0) { p.chi = 0; setFlying(false); G.hud && G.hud.toast('Chi exhausted — touch ground to recover'); }
    } else if (p.dashT > 0) {
      p.dashT -= dt; p.vel.set(p.dashDir.x * DASH_V, 0, p.dashDir.z * DASH_V); p.yaw = Math.atan2(p.dashDir.x, p.dashDir.z);
      emit({ pos: p.pos, n: 3, color: 0xff7a1a, spread: 1.2, vel: [-p.dashDir.x * 6, -1, -p.dashDir.z * 6], size: 0.45, life: 0.45, drag: 1.5, radius: 0.2 });
      if (p.dashT <= 0) p.vel.multiplyScalar(0.55);
    } else if (p.rollT > 0) {
      p.rollT -= dt; const k = 0.55 + 0.45 * (p.rollT / ROLL_T); p.vel.x = p.rollDir.x * ROLL_V * k; p.vel.z = p.rollDir.z * ROLL_V * k; p.vel.y -= GRAV * dt;
      if (wasGrounded && p.vel.y <= 0) p.vel.y = -6;
    } else {
      p.sneaking = mag > 0.05 && mag < 0.4;
      const speed = mag < 0.05 ? 0 : mag < 0.4 ? SNEAK : (mag < 0.85 && !inp.sprint) ? JOG : SPRINT;
      const rate = (p.grounded ? 13 * p.friction : 2.6) * dt, k = 1 - Math.exp(-rate);
      p.vel.x += (move.x * speed - p.vel.x) * k; p.vel.z += (move.z * speed - p.vel.z) * k;
      p.vel.y -= GRAV * dt; if (p.vel.y < -45) p.vel.y = -45;
      if (wasGrounded && p.vel.y <= 0) p.vel.y = -Math.max(3, Math.hypot(p.vel.x, p.vel.z) * 0.95);
      if (mag > 0.05) p.yaw += angDiff(p.yaw, Math.atan2(move.x, move.z)) * (1 - Math.exp(-12 * dt));
    }
    // integrate with sub-stepping so fast motion never tunnels
    const preVy = p.vel.y;
    const sp = p.vel.length() * dt, steps = Math.min(10, Math.max(1, Math.ceil(sp / 0.22) || 1)); let g = false; const sdt = dt / steps;
    const x0 = p.pos.x, z0 = p.pos.z;
    for (let i = 0; i < steps; i++) { p.pos.addScaledVector(p.vel, sdt); g = collide(p, sdt) || g; }
    // no creeping down walkable slopes while standing still
    if (g && wasGrounded && !p.groundBox && mag < 0.05 && p.rollT <= 0 && p.dashT <= 0 && !p.flying && Math.hypot(p.vel.x, p.vel.z) < 0.6) { p.pos.x = x0; p.pos.z = z0; }
    if (p.flying) g = false;
    if (g && !wasGrounded && !p.flying) {
      const impact = Math.max(0, -preVy); p.landImpact = impact; p.airJumps = 0;
      if (impact > 3) { sfx('land'); emit({ pos: p.pos, n: Math.min(24, 6 + impact), color: 0xc8b890, spread: 2.2, vel: [0, 1, 0], size: 0.3, life: 0.5, drag: 3 }); }
    }
    p.grounded = g;
  }
  p.coyote = p.grounded ? 0.12 : p.coyote - dt; p.groundedAnim = p.coyote > 0;
  p.speedH = Math.hypot(p.vel.x, p.vel.z); p.yawRate = damp(p.yawRate, angDiff(yaw0, p.yaw) / dt, 8, dt);
  p.distance += p.pos.distanceTo(p.prevPos); p.maxAlt = Math.max(p.maxAlt, p.pos.y);
  // footsteps
  if (p.grounded && p.speedH > 1 && p.rollT <= 0) { p.stepT -= dt * p.speedH; if (p.stepT <= 0) { p.stepT = 2.1; sfx('step'); } }
  // chi regeneration: full bar in 3.5 s when grounded or near a shrine
  let nearShrine = false; for (const s of G.shrines) if (s.distanceToSquared(p.pos) < 64) { nearShrine = true; break; }
  p.nearShrine = nearShrine;
  if ((p.grounded || nearShrine || p.zip) && !p.flying) { p.chiDelay -= dt; if (p.chiDelay <= 0) p.chi = Math.min(100, p.chi + (100 / 3.5) * dt); }
  if (p.hurtT <= 0 && p.hp < 100) p.hp = Math.min(100, p.hp + 6 * dt);
  // bounds, hazards, checkpoints
  p.pos.x = clamp(p.pos.x, -156, 156); p.pos.z = clamp(p.pos.z, -156, 156);
  const hz = T.hazardY(p.pos.x, p.pos.z);
  if (p.pos.y < hz || p.pos.y < -40) { const river = T.riverMask(p.pos.x, p.pos.z) > 0.5; sfx(river ? 'splash' : 'hurt'); if (river) emit({ pos: p.pos, n: 40, color: 0x9fe8ff, spread: 4, vel: [0, 5, 0], size: 0.4, life: 0.8, gravity: 9 }); respawn(river ? 'Swept away by the rapids' : 'Cole fell — back to solid ground'); }
  p.cpT -= dt;
  if (p.grounded && !p.groundBox && p.cpT <= 0 && hz === -Infinity && !p.vine) {
    p.cpT = 0.4; const e = 3;
    if (T.hazardY(p.pos.x + e, p.pos.z) === -Infinity && T.hazardY(p.pos.x - e, p.pos.z) === -Infinity && T.hazardY(p.pos.x, p.pos.z + e) === -Infinity && T.hazardY(p.pos.x, p.pos.z - e) === -Infinity) p.checkpoint.copy(p.pos).y += 0.05;
  }
}

// Combined static + dynamic ground height under a point (foot IK, spawning).
export function groundY(x, z, yRef) {
  const o = tmp2.set(x, yRef, z); const h = raycast(o, DOWN, 6); const s = h ? h.point.y : -Infinity;
  return Math.max(s, dynTopY(x, z, yRef));
}
const DOWN = new V(0, -1, 0);
export { staticGroundY };

// ---------- camera ----------
const camTarget = new V(), camOff = new V(), camPos = new V(); let camDist = 5.4, camInit = false;
export function resetCamera() { camInit = false; camDist = 5.4; }
export function updateCamera(dt, renderPos) {
  const p = G.player, inp = G.input, cam = G.camera;
  inp.lookIdle += dt;
  if (!G.cinematic) {
    if (inp.lookIdle > 1.6 && p.speedH > 2 && !G.debugNoFollow) { const want = Math.atan2(-p.vel.x, -p.vel.z); inp.yaw += angDiff(inp.yaw, want) * (1 - Math.exp(-0.9 * dt)); }
    if (p.flying && inp.lookIdle > 1.6) inp.pitch = damp(inp.pitch, 0.2, 1.5, dt);
    inp.pitch = clamp(inp.pitch, -0.95, 1.25);
    tmp.set(renderPos.x, renderPos.y + 1.55, renderPos.z);
    if (!camInit) { camTarget.copy(tmp); camInit = true; } else camTarget.lerp(tmp, 1 - Math.exp(-14 * dt));
    const want = p.flying ? 7.2 : 5.4; const cp = Math.cos(inp.pitch);
    camOff.set(Math.sin(inp.yaw) * cp, Math.sin(inp.pitch), Math.cos(inp.yaw) * cp);
    const hit = raycast(camTarget, camOff, want + 0.4); const allowed = hit ? Math.max(0.9, hit.distance - 0.35) : want;
    camDist = allowed < camDist ? allowed : damp(camDist, allowed, 4, dt);
    camPos.copy(camTarget).addScaledVector(camOff, camDist);
    cam.position.copy(camPos); cam.lookAt(camTarget.x, camTarget.y + 0.25, camTarget.z);
    const fov = 62 + clamp(p.vel.length() - 8, 0, 14) * 0.9; cam.fov = damp(cam.fov, fov, 4, dt); cam.updateProjectionMatrix();
  }
}
