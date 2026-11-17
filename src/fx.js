// GPU point-sprite particles + expanding shock rings.
import * as THREE from 'three';
import { G } from './ctx.js';

const N = 3500;
const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), size = new Float32Array(N);
const vel = new Float32Array(N * 3), life = new Float32Array(N), maxLife = new Float32Array(N), grav = new Float32Array(N), drag = new Float32Array(N), size0 = new Float32Array(N), alpha0 = new Float32Array(N);
let cursor = 0, points;
const rings = [];

export function buildFx() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 600 } },
    vertexShader: `attribute vec4 aColor; attribute float aSize; varying vec4 vC; uniform float uScale;
      void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.1, -mv.z); }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC.rgb * a * vC.a, a * vC.a); }`,
  });
  points = new THREE.Points(g, m); points.frustumCulled = false; points.renderOrder = 5; G.scene.add(points);
  const rg = new THREE.RingGeometry(0.86, 1, 48); rg.rotateX(-Math.PI / 2);
  for (let i = 0; i < 10; i++) {
    const r = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    r.visible = false; G.scene.add(r); rings.push({ mesh: r, t: 0, dur: 0, maxR: 1 });
  }
  G.frameUpdaters.push(() => { points.material.uniforms.uScale.value = G.renderer.domElement.height * 0.9; });
}

const _c = new THREE.Color();
// o: {pos, n, color, vel:[x,y,z], spread, speed, size, life, gravity, drag, radius, alpha}
export function emit(o) {
  const n = o.n || 1; _c.set(o.color ?? 0xffffff);
  const v = o.vel || [0, 0, 0], sp = o.spread ?? 1, rad = o.radius || 0;
  for (let k = 0; k < n; k++) {
    const i = cursor; cursor = (cursor + 1) % N;
    const rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
    pos[i * 3] = o.pos.x + rx * rad; pos[i * 3 + 1] = o.pos.y + ry * rad; pos[i * 3 + 2] = o.pos.z + rz * rad;
    vel[i * 3] = v[0] + (Math.random() * 2 - 1) * sp; vel[i * 3 + 1] = v[1] + (Math.random() * 2 - 1) * sp; vel[i * 3 + 2] = v[2] + (Math.random() * 2 - 1) * sp;
    const j = 0.75 + Math.random() * 0.5;
    col[i * 4] = _c.r * j; col[i * 4 + 1] = _c.g * j; col[i * 4 + 2] = _c.b * j; alpha0[i] = o.alpha ?? 0.8;
    maxLife[i] = life[i] = (o.life ?? 0.8) * (0.7 + Math.random() * 0.6);
    size0[i] = (o.size ?? 0.3) * (0.7 + Math.random() * 0.6); grav[i] = o.gravity ?? 0; drag[i] = o.drag ?? 0.5;
  }
}
export function ring(p, color, maxR, dur = 0.8, y = 0.15) {
  const r = rings.find((q) => !q.mesh.visible) || rings[0];
  r.mesh.visible = true; r.mesh.position.set(p.x, p.y + y, p.z); r.mesh.material.color.set(color); r.t = 0; r.dur = dur; r.maxR = maxR;
}
export function updateFx(dt) {
  for (let i = 0; i < N; i++) {
    if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
    life[i] -= dt; const f = Math.max(0, life[i] / maxLife[i]), d = Math.exp(-drag[i] * dt);
    vel[i * 3] *= d; vel[i * 3 + 1] = vel[i * 3 + 1] * d - grav[i] * dt; vel[i * 3 + 2] *= d;
    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    size[i] = size0[i] * (0.4 + 0.6 * f); col[i * 4 + 3] = alpha0[i] * f;
  }
  const g = points.geometry; g.attributes.position.needsUpdate = g.attributes.aColor.needsUpdate = g.attributes.aSize.needsUpdate = true;
  for (const r of rings) {
    if (!r.mesh.visible) continue; r.t += dt; const u = r.t / r.dur;
    if (u >= 1) { r.mesh.visible = false; continue; }
    const s = 0.3 + r.maxR * (1 - (1 - u) * (1 - u)); r.mesh.scale.set(s, 1, s); r.mesh.material.opacity = (1 - u) * 0.85;
  }
}
