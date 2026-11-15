// "Cole Vance" — procedural 22-joint cowboy rig with 2-bone analytic leg IK,
// martial-arts bending poses, spring-hinged hat and a Verlet bandana.
import * as THREE from 'three';
import { G, clamp, lerp, damp, mulberry } from './ctx.js';
import { ss } from './terrain.js';

const V = THREE.Vector3, Q = THREE.Quaternion;
const A = 0.45, B = 0.43, HIP_H = 0.96, ANKLE = 0.08;
const DOWN = new V(0, -1, 0), XA = new V(1, 0, 0);
const rnd = mulberry(77);

function tex(size, base, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function joint(parent, x = 0, y = 0, z = 0, name = '') { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); return g; }

export function createRig() {
  const denim = tex(64, '#3d5578', (g, s) => { for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${150 + rnd() * 80},${170 + rnd() * 60},230,${0.08 + rnd() * 0.1})`; g.fillRect(rnd() * s, rnd() * s, 1, 3); } g.fillStyle = 'rgba(20,25,40,0.25)'; for (let i = 0; i < 12; i++) g.fillRect(rnd() * s, rnd() * s, 6, 5); });
  const suede = tex(64, '#7a5230', (g, s) => { for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? 40 : 190},${rnd() > 0.5 ? 25 : 140},60,0.12)`; g.fillRect(rnd() * s, rnd() * s, 2, 2); } });
  const leather = tex(64, '#6b4424', (g, s) => { for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${30 + rnd() * 30},18,8,0.18)`; g.fillRect(rnd() * s, rnd() * s, 3, 1); } });
  const M = {
    skin: new THREE.MeshStandardMaterial({ color: 0xc98f6a, roughness: 0.65 }),
    stubble: new THREE.MeshStandardMaterial({ color: 0x9a6f52, roughness: 0.8 }),
    shirt: new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.9 }),
    vest: new THREE.MeshStandardMaterial({ map: suede, roughness: 0.95, side: THREE.DoubleSide }),
    denim: new THREE.MeshStandardMaterial({ map: denim, roughness: 0.85 }),
    boot: new THREE.MeshStandardMaterial({ map: leather, color: 0xb08a6a, roughness: 0.6 }),
    hat: new THREE.MeshStandardMaterial({ map: leather, roughness: 0.75, side: THREE.DoubleSide }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.3, metalness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.25, metalness: 0.9 }),
    bandana: new THREE.MeshStandardMaterial({ color: 0xb5482a, roughness: 0.9, side: THREE.DoubleSide }),
  };
  const gauntletMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x35d0ff) }, uTime: { value: 0 }, uPower: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform vec3 uColor; uniform float uTime; uniform float uPower;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float runes = step(0.5, sin(vUv.x * 37.7) * sin(vUv.y * 16.0 + uTime * 2.5));
        float band = smoothstep(0.34, 0.42, abs(vUv.y - 0.5));
        vec3 base = mix(vec3(0.10,0.34,0.25), vec3(0.62,0.46,0.18), band);
        float lit = 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(0.4,0.8,0.4))), 0.0);
        vec3 col = base * lit + uColor * (runes * (1.0 - band) * (0.7 + uPower * 1.6) + fres * (0.7 + uPower * 2.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const root = new THREE.Group(); const body = joint(root, 0, HIP_H, 0, 'body'); body.rotation.order = 'YXZ';
  const J = {};
  // ---- spine chain
  J.hips = joint(body, 0, 0, 0, 'hips');
  mesh(new THREE.CapsuleGeometry(0.105, 0.12, 4, 10), M.denim, J.hips, 0, -0.03, 0).rotation.z = Math.PI / 2;
  const belt = mesh(new THREE.TorusGeometry(0.165, 0.022, 6, 20), M.boot, J.hips, 0, 0.06, 0); belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.78, 1);
  mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), M.brass, J.hips, 0, 0.06, 0.135);
  const whip = mesh(new THREE.TorusGeometry(0.075, 0.016, 6, 16), M.dark, J.hips, -0.185, -0.03, 0.01); whip.rotation.y = Math.PI / 2;
  const whip2 = mesh(new THREE.TorusGeometry(0.055, 0.014, 6, 14), M.dark, J.hips, -0.195, -0.03, 0.01); whip2.rotation.y = Math.PI / 2;
  const machete = mesh(new THREE.BoxGeometry(0.012, 0.42, 0.05), M.steel, J.hips, 0.185, -0.2, -0.03); machete.rotation.x = 0.18;
  mesh(new THREE.BoxGeometry(0.03, 0.11, 0.035), M.wood || M.dark, J.hips, 0.185, 0.045, 0.012);
  const compass = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 14), M.brass, J.hips, 0.09, 0.0, 0.14); compass.rotation.x = Math.PI / 2;
  const compassGlow = mesh(new THREE.CircleGeometry(0.026, 12), new THREE.MeshBasicMaterial({ color: 0xffe58a }), J.hips, 0.09, 0.0, 0.1495);
  J.spine = joint(J.hips, 0, 0.12, 0, 'spine');
  J.chest = joint(J.spine, 0, 0.2, 0, 'chest');
  const torso = mesh(new THREE.CylinderGeometry(0.2, 0.148, 0.5, 14), M.shirt, J.spine, 0, 0.2, 0); torso.scale.set(1.24, 1, 0.74); // 0.50m shoulders -> 0.33m waist
  const vest = mesh(new THREE.CylinderGeometry(0.212, 0.162, 0.44, 14, 1, true, 0.42, Math.PI * 2 - 0.84), M.vest, J.spine, 0, 0.21, 0); vest.scale.set(1.24, 1, 0.76);
  mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.shirt, J.chest, 0, 0.245, 0).scale.set(1.24, 0.35, 0.74);
  J.neck = joint(J.chest, 0, 0.3, 0, 'neck');
  mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.1, 10), M.skin, J.neck, 0, 0.02, 0);
  const knot = mesh(new THREE.TorusGeometry(0.066, 0.02, 6, 14), M.bandana, J.neck, 0, -0.01, 0.005); knot.rotation.x = Math.PI / 2;
  J.head = joint(J.neck, 0, 0.07, 0, 'head');
  mesh(new THREE.SphereGeometry(0.102, 16, 12), M.skin, J.head, 0, 0.075, 0).scale.set(0.9, 1.08, 1);
  const jaw = mesh(new THREE.CylinderGeometry(0.082, 0.052, 0.085, 6), M.stubble, J.head, 0, 0.012, 0.022); jaw.scale.set(1, 1, 0.95); // sculpted jawline
  mesh(new THREE.ConeGeometry(0.016, 0.045, 5), M.skin, J.head, 0, 0.07, 0.105).rotation.x = Math.PI / 2 + 0.5;
  for (const sx of [-1, 1]) { mesh(new THREE.SphereGeometry(0.011, 6, 6), M.dark, J.head, sx * 0.036, 0.095, 0.094); mesh(new THREE.BoxGeometry(0.036, 0.008, 0.01), M.dark, J.head, sx * 0.036, 0.116, 0.096); }
  // ---- hat (spring hinge)
  J.hat = joint(J.head, 0, 0.165, -0.005, 'hat');
  const brimG = new THREE.CylinderGeometry(0.22, 0.22, 0.012, 24, 1); const bp = brimG.attributes.position;
  for (let i = 0; i < bp.count; i++) { const x = bp.getX(i); bp.setY(i, bp.getY(i) + 0.9 * x * x); } brimG.computeVertexNormals();
  mesh(brimG, M.hat, J.hat).scale.set(1, 1, 1.12);                                   // 0.44 m brim
  const crown = mesh(new THREE.CylinderGeometry(0.088, 0.104, 0.14, 16), M.hat, J.hat, 0, 0.07, 0); crown.scale.set(1, 1, 1.15); // 0.14 m crown
  mesh(new THREE.BoxGeometry(0.05, 0.03, 0.2), M.hat, J.hat, 0, 0.128, 0);
  mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.022, 16), M.dark, J.hat, 0, 0.018, 0).scale.set(1, 1, 1.15);
  // ---- arms
  const arms = {};
  for (const [k, sx] of [['L', 1], ['R', -1]]) {
    const cl = J['clav' + k] = joint(J.chest, sx * 0.1, 0.22, 0, 'clav' + k);
    const ua = J['uArm' + k] = joint(cl, sx * 0.135, 0, 0, 'uArm' + k);
    mesh(new THREE.SphereGeometry(0.066, 10, 8), M.shirt, ua);
    mesh(new THREE.CapsuleGeometry(0.052, 0.1, 4, 8), M.shirt, ua, 0, -0.085, 0);   // rolled sleeve
    mesh(new THREE.CapsuleGeometry(0.046, 0.14, 4, 8), M.skin, ua, 0, -0.2, 0);
    const fa = J['fArm' + k] = joint(ua, 0, -0.29, 0, 'fArm' + k);
    mesh(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8), M.skin, fa, 0, -0.12, 0);
    mesh(new THREE.CylinderGeometry(0.05, 0.044, 0.17, 12, 1), gauntletMat, fa, 0, -0.15, 0); // jade & brass gauntlet
    const ha = J['hand' + k] = joint(fa, 0, -0.27, 0, 'hand' + k);
    mesh(new THREE.BoxGeometry(0.07, 0.09, 0.04), M.skin, ha, 0, -0.04, 0);
    arms[k] = { ua, fa, ha, sx };
  }
  // ---- legs
  const legs = {};
  for (const [k, sx] of [['L', 1], ['R', -1]]) {
    const th = J['thigh' + k] = joint(J.hips, sx * 0.095, -0.02, 0, 'thigh' + k);
    mesh(new THREE.CapsuleGeometry(0.078, A - 0.14, 4, 8), M.denim, th, 0, -A / 2, 0);
    const sh = J['shin' + k] = joint(th, 0, -A, 0, 'shin' + k);
    mesh(new THREE.CapsuleGeometry(0.06, B - 0.12, 4, 8), M.denim, sh, 0, -B / 2 + 0.02, 0);
    mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.24, 10), M.boot, sh, 0, -B + 0.13, 0); // boot shaft
    const ft = J['foot' + k] = joint(sh, 0, -B, 0, 'foot' + k);
    mesh(new THREE.BoxGeometry(0.095, 0.085, 0.17), M.boot, ft, 0, -0.04, 0.02);
    mesh(new THREE.BoxGeometry(0.08, 0.04, 0.06), M.dark, ft, 0, -0.065, -0.06);       // stacked heel
    const spur = mesh(new THREE.TorusGeometry(0.022, 0.006, 5, 10), M.brass, ft, 0, -0.03, -0.1); spur.rotation.y = Math.PI / 2; // brass spur
    const toe = J['toe' + k] = joint(ft, 0, -0.045, 0.1, 'toe' + k);
    mesh(new THREE.ConeGeometry(0.048, 0.11, 6), M.boot, toe, 0, 0, 0.045).rotation.x = Math.PI / 2;
    legs[k] = { thigh: th, shin: sh, foot: ft, sx, target: new V(sx * 0.1, -HIP_H + ANKLE, 0), off: 0, pitch: 0 };
  }
  // ---- flight vortex rings + element light
  const vortexMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const vortices = [];
  for (const j of [J.footL, J.footR, J.handL, J.handR]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 20), vortexMat); t.rotation.x = Math.PI / 2; t.visible = false; j.add(t); vortices.push(t); }
  const aura = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.03, 6, 32), vortexMat); aura.rotation.x = Math.PI / 2; aura.visible = false; body.add(aura); vortices.push(aura);
  const glow = new THREE.PointLight(0x35d0ff, 0, 7, 2); glow.position.set(0, 0.3, 0.3); J.chest.add(glow);

  // ---- Verlet bandana (world space cloth, pinned to the neck)
  const CW = 5, CH = 4, SP = 0.042;
  const clothGeo = new THREE.PlaneGeometry(1, 1, CW - 1, CH - 1);
  const cloth = new THREE.Mesh(clothGeo, M.bandana); cloth.frustumCulled = false; cloth.castShadow = true;
  const cp = [], cpp = []; for (let i = 0; i < CW * CH; i++) { cp.push(new V()); cpp.push(new V()); }
  let clothInit = false; const pin = new V(), chestC = new V(), tmp = new V();
  function pinPos(i, out) { const o = i - (CW - 1) / 2; return out.set(o * SP, -0.03, 0.078 - Math.abs(o) * 0.012).applyMatrix4(J.neck.matrixWorld); }
  function updateCloth(dt) {
    J.chest.getWorldPosition(chestC); chestC.y += 0.1;
    if (!clothInit || cp[0].distanceToSquared(pinPos(0, pin)) > 1) { for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) { pinPos(c, pin); cp[r * CW + c].set(pin.x, pin.y - r * SP, pin.z); cpp[r * CW + c].copy(cp[r * CW + c]); } clothInit = true; }
    const wind = Math.sin(G.simTime * 2.3) * 0.6 + 0.4;
    for (let i = CW; i < CW * CH; i++) { const p = cp[i], pp = cpp[i]; tmp.subVectors(p, pp).multiplyScalar(0.94); pp.copy(p); p.add(tmp); p.y -= 9.8 * dt * dt; p.x += wind * 0.6 * dt * dt; }
    for (let it = 0; it < 4; it++) {
      for (let c = 0; c < CW; c++) pinPos(c, cp[c]);
      for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) {
        const i = r * CW + c;
        if (c < CW - 1) link(cp[i], cp[i + 1], r === 0); if (r < CH - 1) link(cp[i], cp[i + CW], r === 0);
      }
      for (let i = CW; i < CW * CH; i++) { tmp.subVectors(cp[i], chestC); const d = tmp.length(); if (d < 0.2) cp[i].addScaledVector(tmp, (0.2 - d) / (d || 1)); }
    }
    const a = clothGeo.attributes.position; for (let i = 0; i < CW * CH; i++) a.setXYZ(i, cp[i].x, cp[i].y, cp[i].z); a.needsUpdate = true; clothGeo.computeVertexNormals();
  }
  function link(a, b, aPinned) { tmp.subVectors(b, a); const d = tmp.length() || 1e-6, e = (d - SP) / d; if (aPinned) b.addScaledVector(tmp, -e); else { a.addScaledVector(tmp, e * 0.5); b.addScaledVector(tmp, -e * 0.5); } }

  // ---- pose state
  const base = () => ({ lSx: 0, lSz: 0.13, lE: 0.25, rSx: 0, rSz: -0.13, rE: 0.25, spX: 0, spY: 0, hdX: 0, bPitch: 0, bRoll: 0, hipY: 0 });
  const cur = base(); let phase = 0, hatA = 0, hatV = 0, bYaw = 0, rollSpin = 0, power = 0;
  const hip = new V(), v = new V(), qAim = new Q(), qx = new Q(), qt = new Q(), qf = new Q(), ft = new V();
  function solveLeg(L) {
    hip.set(L.sx * 0.095, cur.hipY - 0.02, 0); v.subVectors(L.cur, hip);
    const d = clamp(v.length(), 0.3, A + B - 0.004); v.normalize();
    const alpha = Math.acos(clamp((A * A + d * d - B * B) / (2 * A * d), -1, 1));
    const K = Math.acos(clamp((A * A + B * B - d * d) / (2 * A * B), -1, 1));
    qAim.setFromUnitVectors(DOWN, v); qx.setFromAxisAngle(XA, -alpha);
    L.thigh.quaternion.copy(qAim).multiply(qx); L.shin.rotation.x = Math.PI - K;
    qx.setFromAxisAngle(XA, Math.PI - K); qt.copy(L.thigh.quaternion).multiply(qx).invert();
    qf.setFromAxisAngle(XA, L.pitch); L.foot.quaternion.copy(qt).multiply(qf);
  }
  for (const k in legs) legs[k].cur = legs[k].target.clone();

  function update(dt, p, renderPos) {
    root.position.copy(renderPos); root.rotation.y = p.yaw;
    const T = base(); const speed = p.speedH, sf = clamp(speed / 7.6, 0, 1);
    const grounded = p.groundedAnim && !p.flying && !p.vine && !p.zip;
    const restY = -HIP_H + ANKLE; let lift = { L: 0, R: 0 }, kick = 0; rollSpin = 0;
    const fl = legs.L.target, fr = legs.R.target;
    if (p.rollT > 0) {
      rollSpin = (1 - p.rollT / p.rollDur) * Math.PI * 2; T.hipY = -0.3; T.spX = 0.9; T.lSx = T.rSx = -1.0; T.lE = T.rE = 1.8;
      fl.set(0.1, -0.45, 0.2); fr.set(-0.1, -0.45, 0.2);
    } else if (p.vine || p.zip) {
      T.lSx = T.rSx = -2.95; T.lSz = 0.12; T.rSz = -0.12; T.lE = T.rE = 0.15; const sw = clamp(p.vel.length() * 0.03, 0, 0.5);
      fl.set(0.1, restY + 0.06, -0.1 - sw * 0.5); fr.set(-0.1, restY + 0.12, 0.12 - sw * 0.5);
    } else if (p.flying) {
      const f = clamp(p.vel.length() / 22, 0, 1), fwd = clamp(speed / 14, 0, 1);
      T.bPitch = clamp(0.12 + fwd * 0.55 - p.vel.y * 0.02, -0.3, 0.663);       // up to 38 deg
      T.bRoll = clamp(-p.yawRate * 0.42, -0.663, 0.663);
      T.lSx = lerp(-0.25, 0.75, fwd); T.rSx = T.lSx; T.lSz = lerp(0.75, 1.05, fwd); T.rSz = -T.lSz; T.lE = T.rE = 0.18; T.hdX = -T.bPitch * 0.7;
      const fltr = Math.sin(G.simTime * 5) * 0.03;
      fl.set(0.09, restY + 0.03 + fltr, -0.12 - f * 0.12); fr.set(-0.09, restY + 0.08 - fltr, 0.06 - f * 0.2);
    } else if (p.dashT > 0) {
      T.bPitch = 0.55; T.lSx = T.rSx = 0.95; T.lSz = 0.35; T.rSz = -0.35; T.lE = T.rE = 0.1; T.hdX = -0.4;
      fl.set(0.1, restY + 0.04, -0.28); fr.set(-0.1, restY + 0.1, -0.12);
    } else if (!grounded) {
      const up = clamp(p.vel.y * 0.08, -0.6, 0.6);
      T.lSx = T.rSx = -0.5 - up; T.lSz = 0.5; T.rSz = -0.5; T.lE = T.rE = 0.5; T.spX = 0.08;
      fl.set(0.1, restY + 0.16 + up * 0.1, 0.16); fr.set(-0.1, restY + 0.07, -0.14);
    } else {
      const S = Math.min(0.72, 0.13 + 0.082 * speed), H = Math.min(0.3, 0.05 + 0.032 * speed);
      if (speed > 0.25) phase += (Math.PI * 2 * speed / (4 * S)) * dt;
      const w = clamp(speed / 0.6, 0, 1);
      const zL = Math.cos(phase) * S * w, zR = Math.cos(phase + Math.PI) * S * w;
      lift.L = Math.max(0, -Math.sin(phase)) * H * w; lift.R = Math.max(0, Math.sin(phase)) * H * w;
      fl.set(0.1, restY + lift.L, zL + 0.02); fr.set(-0.1, restY + lift.R, zR + 0.02);
      T.lSx = Math.cos(phase + Math.PI) * 0.75 * sf * w - 0.05; T.rSx = Math.cos(phase) * 0.75 * sf * w - 0.05;
      T.lE = T.rE = 0.25 + sf * 1.0; T.spX = sf * 0.2; T.spY = Math.sin(phase) * 0.14 * sf * w;
      T.hipY = -0.025 * w - sf * 0.035 + Math.cos(phase * 2) * 0.022 * w;
      if (p.sneaking) { T.hipY -= 0.16; T.spX = 0.35; T.lE = T.rE = 1.1; }
      if (speed < 0.25) { T.spX = Math.sin(G.simTime * 1.4) * 0.015; T.lSx = T.rSx = Math.sin(G.simTime * 1.4) * 0.03; }
    }
    // ---- bending / martial-arts overlays
    let spin = 0; const ac = p.action;
    if (ac) {
      const u = clamp(ac.t / ac.dur, 0, 1), bell = Math.sin(Math.PI * u), punch = ss(0, 0.32, u) * (1 - ss(0.62, 1, u)), tw = u * Math.PI * 2;
      switch (ac.name) {
        case 'water_x': T.lSx = -1.3 - 0.55 * Math.sin(tw); T.lSz = 0.55 + 0.5 * Math.cos(tw); T.rSx = -1.3 + 0.55 * Math.sin(tw); T.rSz = -0.55 - 0.5 * Math.cos(tw + 1); T.lE = T.rE = 0.35; T.spY = 0.55 * Math.sin(tw); T.hipY -= 0.09 * bell; break;
        case 'water_y': T.lSx = T.rSx = -0.5 - 1.2 * punch; T.lSz = 0.3; T.rSz = -0.3; T.lE = T.rE = 1.0 * (1 - punch) + 0.1; T.hipY -= 0.12 * bell; T.spX = 0.15 * punch; break;
        case 'earth_x': T.rSx = lerp(0.7, -2.75, ss(0.12, 0.5, u)); T.rE = lerp(1.5, 0.3, ss(0.2, 0.55, u)); T.lSx = 0.35; T.lE = 1.3; T.spY = -0.55 * punch; T.hipY -= 0.15 * bell; break;
        case 'earth_y': { const s = ss(0.36, 0.5, u); T.lSx = T.rSx = lerp(-2.5, -0.25, s); T.lE = T.rE = 1.1; T.hipY -= 0.2 * s * (1 - ss(0.8, 1, u)); if (grounded) fr.y = restY + 0.42 * Math.sin(Math.PI * clamp(u / 0.45, 0, 1)); T.spX = 0.3 * s; break; }
        case 'fire_x': {
          const right = ac.alt % 2 === 0; const a = right ? 'r' : 'l', o = right ? 'l' : 'r';
          T[a + 'Sx'] = -1.55 * punch; T[a + 'E'] = 1.7 * (1 - punch) + 0.05; T[o + 'Sx'] = 0.3; T[o + 'E'] = 1.7; T.spY = (right ? -0.55 : 0.55) * punch; T.hipY -= 0.06;
          if (ac.alt % 3 === 2 && grounded) kick = punch; break;
        }
        case 'fire_y': T.lSx = T.rSx = 0.95; T.lSz = 0.35; T.rSz = -0.35; T.lE = T.rE = 0.1; break;
        case 'air_x': spin = tw; T.lSz = 1.45; T.rSz = -1.45; T.lSx = T.rSx = -0.2; T.lE = T.rE = 0.12; T.hipY -= 0.08 * bell; break;
        case 'air_y': spin = tw * 2; T.lSx = T.rSx = -2.85; T.lSz = 0.35; T.rSz = -0.35; T.lE = T.rE = 0.2; break;
        case 'pulse': T.rSx = -1.5 * punch; T.rE = 0.3; T.hdX = -0.15 * punch; break;
      }
    }
    if (kick > 0) fr.set(-0.08, restY + 0.75 * kick, 0.55 * kick);
    // ---- ground-adaptive foot IK
    let drop = 0;
    for (const k in legs) {
      const L = legs[k]; let off = 0, pitch = 0;
      if (grounded && p.rollT <= 0 && G.groundY) {
        const s = Math.sin(p.yaw), c = Math.cos(p.yaw), tx = L.target.x, tz = L.target.z;
        const wx = renderPos.x + c * tx + s * tz, wz = renderPos.z - s * tx + c * tz;
        const g0 = G.groundY(wx, wz, renderPos.y + 0.55), g1 = G.groundY(wx + s * 0.2, wz + c * 0.2, renderPos.y + 0.55);
        off = clamp(g0 - renderPos.y, -0.45, 0.45); pitch = -clamp(Math.atan2(g1 - g0, 0.2), -0.7, 0.7);
        drop = Math.min(drop, off);
      }
      L.off = damp(L.off, off, 20, dt); L.pitch = damp(L.pitch, pitch + (lift[k] > 0.02 ? 0.25 : 0), 16, dt);
    }
    T.hipY += drop * 0.85;
    // ---- smoothing + apply
    for (const k in cur) cur[k] = damp(cur[k], T[k], 15, dt);
    J.hips.position.y = cur.hipY;
    body.rotation.set(cur.bPitch + rollSpin, spin, cur.bRoll);
    J.spine.rotation.set(cur.spX * 0.5, cur.spY * 0.5, 0); J.chest.rotation.set(cur.spX * 0.5, cur.spY * 0.5, 0); J.head.rotation.set(cur.hdX - cur.spX * 0.6, -cur.spY * 0.6, 0);
    arms.L.ua.rotation.set(cur.lSx, 0, cur.lSz); arms.L.fa.rotation.x = -cur.lE;
    arms.R.ua.rotation.set(cur.rSx, 0, cur.rSz); arms.R.fa.rotation.x = -cur.rE;
    for (const k in legs) { const L = legs[k]; ft.copy(L.target); ft.y += L.off; L.cur.lerp(ft, 1 - Math.exp(-22 * dt)); solveLeg(L); }
    // ---- hat spring hinge (k = 120, c = 14)
    if (p.landImpact > 0) { hatV += p.landImpact * 0.5; p.landImpact = 0; }
    const hatTarget = p.flying ? -clamp(p.vel.length() * 0.012, 0, 0.3) : 0;
    hatV += (-120 * (hatA - hatTarget) - 14 * hatV) * dt; hatA = clamp(hatA + hatV * dt, -0.6, 0.6); J.hat.rotation.x = hatA;
    // ---- element glow + flight vortex
    power = damp(power, p.attackGlow > 0 ? 1 : 0, 10, dt);
    gauntletMat.uniforms.uTime.value = G.simTime; gauntletMat.uniforms.uPower.value = power;
    glow.intensity = 1.2 + power * 9;
    for (let i = 0; i < vortices.length; i++) { const t = vortices[i]; t.visible = p.flying; if (p.flying) { t.rotation.z = G.simTime * (6 + i); const s = 1 + Math.sin(G.simTime * 8 + i) * 0.15; t.scale.setScalar(s); } }
    root.updateMatrixWorld(true);
    updateCloth(Math.min(dt, 1 / 30));
  }
  function setElementColor(hex) { gauntletMat.uniforms.uColor.value.set(hex); glow.color.set(hex); compassGlow.material.color.set(0xffe58a); }
  const _h = new V();
  function handPos(side, out) { return (side === 'L' ? J.handL : J.handR).getWorldPosition(out || _h); }
  return { root, cloth, update, setElementColor, handPos, jointCount: Object.keys(J).length, J, cur: () => ({ hatA, hipY: cur.hipY }) };
}
