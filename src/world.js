import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, mulberry, clamp } from './ctx.js';
import * as T from './terrain.js';

const V = THREE.Vector3;
const rnd = mulberry(1337);

// ---------- procedural textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function speckle(g, s, n, colors, minR, maxR, alpha = 0.5) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    g.fillStyle = colors[(rnd() * colors.length) | 0];
    const r = minR + rnd() * (maxR - minR);
    g.beginPath(); g.arc(rnd() * s, rnd() * s, r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
export const tex = {};
function buildTextures() {
  tex.stone = canvasTex(256, (g, s) => {
    g.fillStyle = '#8d8672'; g.fillRect(0, 0, s, s);
    speckle(g, s, 900, ['#7a745f', '#a39b84', '#6d6a5c', '#989078'], 1, 5, 0.5);
    g.strokeStyle = 'rgba(40,36,28,0.55)'; g.lineWidth = 3;
    for (let r = 0; r < 4; r++) {
      g.beginPath(); g.moveTo(0, r * 64); g.lineTo(s, r * 64); g.stroke();
      for (let c = 0; c < 2; c++) { const x = c * 128 + (r % 2) * 64; g.beginPath(); g.moveTo(x, r * 64); g.lineTo(x, r * 64 + 64); g.stroke(); }
    }
    speckle(g, s, 60, ['#4f6b34', '#5d7a3a', '#3f5a2c'], 4, 16, 0.35);
  });
  tex.obsidian = canvasTex(128, (g, s) => {
    g.fillStyle = '#1c1b22'; g.fillRect(0, 0, s, s);
    speckle(g, s, 300, ['#2b2936', '#121117', '#3a3350'], 1, 6, 0.6);
    g.strokeStyle = 'rgba(90,200,120,0.5)'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(rnd() * s, 0); g.bezierCurveTo(rnd() * s, 40, rnd() * s, 90, rnd() * s, s); g.stroke(); }
  });
  tex.wood = canvasTex(128, (g, s) => {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${40 + rnd() * 40},${25 + rnd() * 25},10,0.5)`; g.lineWidth = 1 + rnd() * 2; const y = rnd() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (rnd() - 0.5) * 8); g.stroke(); }
  });
  tex.ground = canvasTex(256, (g, s) => {
    g.fillStyle = '#9a9a8a'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2600, ['#7f8372', '#b4b4a0', '#8b8e7a', '#a8a690', '#6e735f'], 1, 4, 0.55);
  }, 90);
  tex.bark = canvasTex(64, (g, s) => {
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${20 + rnd() * 50},${15 + rnd() * 30},10,0.6)`; g.lineWidth = 1 + rnd() * 2; const x = rnd() * s; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 6, s); g.stroke(); }
    speckle(g, s, 14, ['#4f6b34'], 2, 6, 0.4);
  });
  tex.sun = canvasTex(256, (g, s) => {
    g.fillStyle = '#d9a93a'; g.fillRect(0, 0, s, s);
    g.translate(s / 2, s / 2); g.strokeStyle = '#7a4a10'; g.fillStyle = '#f6d873'; g.lineWidth = 5;
    for (let i = 0; i < 16; i++) { g.rotate(Math.PI / 8); g.beginPath(); g.moveTo(-10, -70); g.lineTo(0, -118); g.lineTo(10, -70); g.closePath(); g.fill(); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 66, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 0, 40, 0, 7); g.stroke();
    g.fillStyle = '#7a4a10'; g.beginPath(); g.arc(-16, -8, 6, 0, 7); g.arc(16, -8, 6, 0, 7); g.fill();
    g.beginPath(); g.arc(0, 8, 18, 0.2, Math.PI - 0.2); g.stroke();
  });
}

export const mats = {};
function buildMaterials() {
  mats.stone = new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.92, metalness: 0.02 });
  mats.stoneDark = new THREE.MeshStandardMaterial({ map: tex.stone, color: 0x8a8f80, roughness: 0.95 });
  mats.obsidian = new THREE.MeshStandardMaterial({ map: tex.obsidian, roughness: 0.28, metalness: 0.35, emissive: 0x0c2a14, emissiveIntensity: 0.6 });
  mats.wood = new THREE.MeshStandardMaterial({ map: tex.wood, roughness: 0.85 });
  mats.gold = new THREE.MeshStandardMaterial({ color: 0xd8a83a, roughness: 0.32, metalness: 0.9 });
  mats.rope = new THREE.MeshStandardMaterial({ color: 0x7a6238, roughness: 1 });
  mats.vine = new THREE.MeshStandardMaterial({ color: 0x3f6b2a, roughness: 0.9 });
  mats.ice = new THREE.MeshStandardMaterial({ color: 0xbfeaff, roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.82, emissive: 0x2a6f9a, emissiveIntensity: 0.35, envMapIntensity: 2.2 });
  mats.moss = new THREE.MeshStandardMaterial({ map: tex.stone, color: 0x7f9a66, roughness: 1 });
}

// Box geometry whose UVs tile in world metres so big ruins stay crisp.
export function boxGeo(w, h, d, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv; const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return g;
}

const staticGeos = [];
export function registerStatic(mesh) {
  mesh.updateMatrixWorld(true);
  let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
  if (g.index) g = g.toNonIndexed();
  const out = new THREE.BufferGeometry(); out.setAttribute('position', g.attributes.position);
  staticGeos.push(out);
}
// Adds a visible, collidable stone block. (x,y,z) is the block centre.
export function addBlock(w, h, d, x, y, z, mat = mats.stone, opts = {}) {
  const m = new THREE.Mesh(boxGeo(w, h, d, opts.tile || 4), mat);
  m.position.set(x, y, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotX) m.rotation.x = opts.rotX;
  m.castShadow = m.receiveShadow = true;
  if (opts.visible === false) m.visible = false;
  G.scene.add(m);
  if (opts.collide !== false) registerStatic(m);
  return m;
}

// ---------- sky, lights, water ----------
function buildSky() {
  const sunDir = new V(0.45, 0.72, 0.35).normalize();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir }, uEclipse: { value: 0 }, uVictory: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun; uniform float uEclipse; uniform float uVictory; uniform float uTime;
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        float e = uEclipse * (1.0 - uVictory);
        vec3 top = mix(vec3(0.09,0.30,0.62), vec3(0.03,0.03,0.10), e);
        vec3 hor = mix(vec3(0.72,0.86,0.80), vec3(0.42,0.24,0.30), e);
        vec3 col = mix(hor, top, pow(h, 0.55));
        float s = max(dot(d, uSun), 0.0);
        float disc = smoothstep(0.9985, 0.9992, s);
        float moon = smoothstep(0.9982 + (1.0 - e) * 0.0016, 0.9990 + (1.0 - e) * 0.0016, max(dot(d, normalize(uSun + vec3(0.03 * (1.0 - e), 0.0, 0.0))), 0.0));
        col += vec3(1.0,0.85,0.55) * (disc * 3.0 * (1.0 - moon * e) + pow(s, 12.0) * 0.35 + pow(s, 90.0) * 0.6);
        float band = sin(d.x * 9.0 + uTime * 0.05) * sin(d.z * 7.0 - uTime * 0.04);
        col = mix(col, vec3(0.16,0.14,0.2), e * smoothstep(0.1, 0.9, band * 0.5 + 0.5) * 0.45 * smoothstep(0.0, 0.35, h));
        col += uVictory * vec3(0.25, 0.2, 0.08);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 16), skyMat);
  sky.frustumCulled = false; G.scene.add(sky);
  G.sky = sky; G.sunDir = sunDir;

  G.scene.fog = new THREE.FogExp2(0x9fc4b4, 0.0052);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4a2a, 1.15); G.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  G.scene.add(sun); G.scene.add(sun.target);
  G.sun = sun; G.hemi = hemi;

  // Small procedural environment so PBR/ice gets reflections.
  try {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), skyMat));
    const pm = new THREE.PMREMGenerator(G.renderer);
    G.scene.environment = pm.fromScene(envScene, 0.04).texture; G.scene.environmentIntensity = 0.55;
    pm.dispose();
  } catch (e) { G.errors.push('PMREM: ' + e.message); }
}

export function makeWaterMaterial(fall = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uFall: { value: fall ? 1 : 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vW; uniform float uTime; uniform float uFall;
      void main(){
        float flow = mix(vW.z * 0.9 - uTime * 2.4, vW.y * 1.6 + uTime * 7.0, uFall);
        float lat = mix(vW.x, vW.x + vW.z, uFall);
        float n = sin(lat * 1.3 + uTime * 1.1) * sin(flow);
        float foam = smoothstep(0.72, 1.0, sin(flow * 2.3 + sin(lat * 1.7) * 2.0) * 0.5 + 0.5);
        vec3 col = mix(vec3(0.04,0.30,0.36), vec3(0.20,0.62,0.66), n * 0.5 + 0.5) + foam * mix(0.3, 0.75, uFall);
        gl_FragColor = vec4(col, mix(0.8, 0.9, uFall));
      }`,
  });
}
const waterMats = [];
function buildWater() {
  // river ribbon
  const N = 96, pos = [], idx = [];
  for (let i = 0; i <= N; i++) { const z = -T.HALF + (i / N) * T.SIZE, cx = T.riverCx(z); pos.push(cx - 13.5, T.WATER_Y, z, cx + 13.5, T.WATER_Y, z); if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const wm = makeWaterMaterial(); waterMats.push(wm);
  G.scene.add(new THREE.Mesh(g, wm));
  // gorge floor river
  const gm = makeWaterMaterial(); waterMats.push(gm);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(53, 40), gm); disc.rotation.x = -Math.PI / 2; disc.position.set(T.C2.x, -21.6, T.C2.z); G.scene.add(disc);
  // waterfall pouring off the shrine cliff into the cut
  const fm = makeWaterMaterial(true); waterMats.push(fm);
  const p = T.s2world(6.6, 0);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(13, 22), fm);
  fall.position.set(p.x, -10.6, p.z); fall.rotation.y = Math.atan2(T.D2.x, T.D2.z); G.scene.add(fall);
  G.waterfallPos = new V(p.x, -1, p.z);
}

// ---------- terrain ----------
function buildTerrain() {
  const seg = 256;
  const g = new THREE.PlaneGeometry(T.SIZE, T.SIZE, seg, seg); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position; const col = new Float32Array(p.count * 3); const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = T.heightAt(x, z); p.setY(i, h);
    const e = 1.2, sl = Math.hypot(T.heightAt(x + e, z) - T.heightAt(x - e, z), T.heightAt(x, z + e) - T.heightAt(x, z - e)) / (2 * e);
    const n = T.fbm(x * 0.15, z * 0.15);
    c.setRGB(0.26 + n * 0.14, 0.50 + n * 0.16, 0.20 + n * 0.06);                    // jungle grass
    if (T.flatMask(x, z) > 0.6) c.lerp(new THREE.Color(0.52, 0.50, 0.36), 0.45);     // trodden clearings
    if (h < T.WATER_Y + 1.3 && T.riverMask(x, z) > 0.02) c.lerp(new THREE.Color(0.66, 0.60, 0.42), 0.8); // sand
    c.lerp(new THREE.Color(0.42, 0.40, 0.36), clamp((sl - 0.55) * 1.6, 0, 1));       // rock faces
    if (h < -5.5) c.multiplyScalar(0.55);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex.ground, roughness: 0.96 }));
  m.receiveShadow = true; G.scene.add(m); registerStatic(m);
  // thorn bed in the moat
  const tg = new THREE.ConeGeometry(0.28, 1.5, 5); const tm = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.8 });
  const thorns = new THREE.InstancedMesh(tg, tm, 420); const d = new THREE.Object3D();
  for (let i = 0; i < 420; i++) { const a = rnd() * 6.283, r = 56.5 + rnd() * 5; d.position.set(Math.cos(a) * r, -5.4, Math.sin(a) * r); d.rotation.set((rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6); d.scale.setScalar(0.7 + rnd() * 1.2); d.updateMatrix(); thorns.setMatrixAt(i, d.matrix); }
  G.scene.add(thorns);
}

// ---------- Sun-Spire Ziggurat ----------
function buildZiggurat() {
  for (let i = 0; i < 7; i++) { const half = 36 - 5 * i; addBlock(half * 2, 4, half * 2, 0, 4 * i + 2, 0, i % 2 ? mats.stoneDark : mats.stone, { tile: 4 }); }
  // processional ramp (collider) from z=41,y=0 to z=16,y=20 on the south face
  const run = 25, rise = 20, len = Math.hypot(run, rise), ang = Math.atan2(rise, run);
  const ramp = addBlock(6, 0.6, len, 0, 0, 0, mats.stone, { visible: false });
  ramp.position.set(0, 10 - Math.cos(ang) * 0.3, 28.5 - Math.sin(ang) * 0.3); ramp.rotation.x = ang; staticGeos.pop(); registerStatic(ramp);
  // visual stair treads
  const steps = new THREE.InstancedMesh(boxGeo(6, 0.4, 0.5, 2), mats.stoneDark, 50); const d = new THREE.Object3D();
  for (let i = 0; i < 50; i++) { d.position.set(0, (i + 0.5) * 0.4 - 0.2, 41 - (i + 0.5) * 0.5); d.updateMatrix(); steps.setMatrixAt(i, d.matrix); }
  steps.receiveShadow = true; G.scene.add(steps);
  for (const sx of [-3.3, 3.3]) { const b = addBlock(0.6, 0.9, len, sx, 0, 0, mats.stone, { collide: false }); b.position.set(sx, 10 + 0.3, 28.5); b.rotation.x = ang; }
  // summit altar + obelisks
  addBlock(2.4, 1.1, 2.4, 0, T.SUMMIT_Y + 0.55, 0, mats.stoneDark, { tile: 2 });
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { addBlock(0.9, 4.5, 0.9, x, T.SUMMIT_Y + 2.25, z, mats.obsidian, { tile: 2 }); }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.2, 24), mats.gold); top.position.set(0, T.SUMMIT_Y + 1.2, 0); G.scene.add(top);
}

// ---------- jungle ----------
const treeHash = new Map(); const CELL = 8;
function hashKey(x, z) { return Math.floor(x / CELL) + ',' + Math.floor(z / CELL); }
function treeOk(x, z) {
  if (Math.abs(x) > 152 || Math.abs(z) > 152) return false;
  if (Math.abs(x - T.riverCx(z)) < 17) return false;
  if (Math.hypot(x, z) < 72) return false;
  if (Math.hypot(x - T.C2.x, z - T.C2.z) < 57) return false;
  if (Math.hypot(x - T.C3.x, z - T.C3.z) < 38) return false;
  if (Math.hypot(x - T.C1.x, z - T.C1.z) < 27) return false;
  if (Math.hypot(x - T.CAMP.x, z - T.CAMP.z) < 15) return false;
  if (Math.abs(x) < 6 && z > 60 && z < 95) return false;
  return true;
}
function buildJungle() {
  const trees = []; let guard = 0;
  while (trees.length < 520 && guard++ < 20000) {
    const x = (rnd() - 0.5) * 304, z = (rnd() - 0.5) * 304; if (!treeOk(x, z)) continue;
    let ok = true; for (const t of trees) if (Math.abs(t.x - x) < 3.2 && Math.abs(t.z - z) < 3.2) { ok = false; break; }
    if (!ok) continue;
    trees.push({ x, z, y: T.heightAt(x, z), r: 0.35 + rnd() * 0.4, h: 9 + rnd() * 9 });
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.72, 1, 1, 7), new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1 }), trees.length);
  const canopy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees.length * 3);
  const d = new THREE.Object3D(), c = new THREE.Color(); let ci = 0;
  trees.forEach((t, i) => {
    d.position.set(t.x, t.y + t.h / 2 - 0.3, t.z); d.scale.set(t.r, t.h, t.r); d.rotation.set(0, rnd() * 6, 0); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
    for (let k = 0; k < 3; k++) {
      const s = 3 + rnd() * 2.6; d.position.set(t.x + (rnd() - 0.5) * 3.4, t.y + t.h - 1.5 + k * 1.4 + rnd(), t.z + (rnd() - 0.5) * 3.4);
      d.scale.set(s, s * 0.62, s); d.rotation.set(rnd(), rnd() * 6, rnd()); d.updateMatrix(); canopy.setMatrixAt(ci, d.matrix);
      c.setHSL(0.26 + rnd() * 0.1, 0.5 + rnd() * 0.2, 0.2 + rnd() * 0.14); canopy.setColorAt(ci++, c);
    }
    const k = hashKey(t.x, t.z); if (!treeHash.has(k)) treeHash.set(k, []); treeHash.get(k).push(t);
  });
  trunk.castShadow = canopy.castShadow = true; trunk.receiveShadow = true;
  G.scene.add(trunk, canopy);
  // undergrowth + boulders
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 700);
  const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.moss, 220);
  for (let i = 0, n = 0, m = 0; i < 6000 && (n < 700 || m < 220); i++) {
    const x = (rnd() - 0.5) * 300, z = (rnd() - 0.5) * 300;
    if (T.flatMask(x, z) > 0.3 || T.riverMask(x, z) > 0 || T.chasmMask(x, z) > 0 || T.moatMask(x, z) > 0) continue;
    const y = T.heightAt(x, z);
    if (n < 700) { const s = 0.5 + rnd() * 0.9; d.position.set(x, y + s * 0.3, z); d.scale.set(s, s * 0.7, s); d.rotation.set(rnd(), rnd() * 6, rnd()); d.updateMatrix(); bush.setMatrixAt(n, d.matrix); c.setHSL(0.24 + rnd() * 0.14, 0.55, 0.22 + rnd() * 0.16); bush.setColorAt(n++, c); }
    else { const s = 0.3 + rnd() * 0.7; d.position.set(x, y + s * 0.2, z); d.scale.set(s, s * 0.7, s); d.rotation.set(rnd(), rnd() * 6, rnd()); d.updateMatrix(); rock.setMatrixAt(m++, d.matrix); }
  }
  bush.receiveShadow = rock.receiveShadow = true; G.scene.add(bush, rock);
  // base camp props
  addBlock(1.2, 0.5, 1.2, 3.5, 0.25, 95, mats.wood, { tile: 1 });
  const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.6, 4), new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 1 })); tent.position.set(-5, 1.3, 96); tent.rotation.y = 0.6; tent.castShadow = true; G.scene.add(tent);
}

// ---------- collision queries ----------
const tBox = new THREE.Box3(), tTri = new V(), tCap = new V(), ray = new THREE.Ray();
export function resolveStatic(seg, r) {
  tBox.makeEmpty(); tBox.expandByPoint(seg.start); tBox.expandByPoint(seg.end); tBox.min.addScalar(-r); tBox.max.addScalar(r);
  G.world.bvh.shapecast({
    intersectsBounds: (b) => b.intersectsBox(tBox),
    intersectsTriangle: (tri) => {
      const dist = tri.closestPointToSegment(seg, tTri, tCap);
      if (dist < r) { const depth = r - dist; const dir = tCap.sub(tTri); if (dir.lengthSq() < 1e-12) dir.set(0, 1, 0); else dir.normalize(); seg.start.addScaledVector(dir, depth); seg.end.addScaledVector(dir, depth); }
    },
  });
}
export function raycast(origin, dir, maxDist = 200) {
  ray.origin.copy(origin); ray.direction.copy(dir);
  const h = G.world.bvh.raycastFirst(ray, THREE.DoubleSide);
  return h && h.distance <= maxDist ? h : null;
}
const _o = new V(), _down = new V(0, -1, 0);
export function staticGroundY(x, z, yFrom = 80) {
  const h = raycast(_o.set(x, yFrom, z), _down, 300);
  return h ? h.point.y : T.heightAt(x, z);
}
export function treesNear(x, z, out) {
  out.length = 0; const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = treeHash.get((cx + i) + ',' + (cz + j)); if (a) for (const t of a) out.push(t); }
  return out;
}

export function buildWorld() {
  buildTextures(); buildMaterials(); buildSky(); buildTerrain(); buildWater(); buildZiggurat(); buildJungle();
  G.world = { bvh: null };
  G.frameUpdaters.push((dt) => {
    for (const m of waterMats) m.uniforms.uTime.value = G.simTime;
    const u = G.sky.material.uniforms; u.uTime.value = G.simTime;
    const e = G.quest ? G.quest.eclipse : 0, v = G.quest ? G.quest.victoryGlow : 0;
    u.uEclipse.value = e; u.uVictory.value = v;
    G.sun.intensity = 2.6 * (1 - e * 0.55 * (1 - v)) + v * 0.8; G.hemi.intensity = 1.15 * (1 - e * 0.4 * (1 - v));
    if (G.player) { const p = G.player.pos; G.sun.target.position.set(Math.round(p.x), p.y, Math.round(p.z)); G.sun.position.copy(G.sun.target.position).addScaledVector(G.sunDir, 80); G.sky.position.copy(G.camera.position); }
  });
}
export function finalizeWorld() {
  const merged = mergeGeometries(staticGeos, false);
  G.world.bvh = new MeshBVH(merged, { targetLeafSize: 12 });
  G.world.triCount = merged.attributes.position.count / 3;
}
