// Dynamic oriented-box colliders (planks, stones, pillars, ice, see-saw, mushrooms, golem).
import * as THREE from 'three';
const V = THREE.Vector3;
export const boxes = [];

export function addBox(o) {
  o.pos = o.pos || new V(); o.quat = o.quat || new THREE.Quaternion(); o.vel = o.vel || new V();
  o.friction = o.friction ?? 1; o.br = o.half.length(); o.enabled = o.enabled ?? true;
  boxes.push(o); return o;
}
export function removeBox(o) { const i = boxes.indexOf(o); if (i >= 0) boxes.splice(i, 1); }

const a = new V(), b = new V(), ab = new V(), s = new V(), c = new V(), n = new V(), q = new THREE.Quaternion(), mid = new V();
// Pushes the capsule segment out of all boxes. Returns the best "ground" contact.
export function resolveDyn(seg, r, res) {
  res.box = null; res.ny = 0; res.any = false;
  for (let i = 0; i < boxes.length; i++) {
    const o = boxes[i]; if (!o.enabled) continue;
    mid.addVectors(seg.start, seg.end).multiplyScalar(0.5);
    if (mid.distanceToSquared(o.pos) > (o.br + r + 1.2) ** 2) continue;
    q.copy(o.quat).invert();
    a.copy(seg.start).sub(o.pos).applyQuaternion(q); b.copy(seg.end).sub(o.pos).applyQuaternion(q); ab.subVectors(b, a);
    const h = o.half, len2 = ab.lengthSq() || 1e-9;
    let best = Infinity, bt = 0;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4; s.copy(a).addScaledVector(ab, t); c.set(Math.max(-h.x, Math.min(h.x, s.x)), Math.max(-h.y, Math.min(h.y, s.y)), Math.max(-h.z, Math.min(h.z, s.z)));
      const d = s.distanceToSquared(c); if (d < best) { best = d; bt = t; }
    }
    for (let k = 0; k < 2; k++) {
      s.copy(a).addScaledVector(ab, bt); c.set(Math.max(-h.x, Math.min(h.x, s.x)), Math.max(-h.y, Math.min(h.y, s.y)), Math.max(-h.z, Math.min(h.z, s.z)));
      bt = Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / len2));
    }
    s.copy(a).addScaledVector(ab, bt); c.set(Math.max(-h.x, Math.min(h.x, s.x)), Math.max(-h.y, Math.min(h.y, s.y)), Math.max(-h.z, Math.min(h.z, s.z)));
    const d2 = s.distanceToSquared(c); if (d2 >= r * r) continue;
    let depth;
    if (d2 > 1e-10) { const d = Math.sqrt(d2); n.subVectors(s, c).multiplyScalar(1 / d); depth = r - d; }
    else {
      const px = h.x - Math.abs(s.x), py = h.y - s.y, pz = h.z - Math.abs(s.z);
      if (py < 0.9 || (py <= px && py <= pz)) { n.set(0, 1, 0); depth = py + r; }
      else if (px < pz) { n.set(Math.sign(s.x) || 1, 0, 0); depth = px + r; }
      else { n.set(0, 0, Math.sign(s.z) || 1); depth = pz + r; }
    }
    n.applyQuaternion(o.quat);
    seg.start.addScaledVector(n, depth); seg.end.addScaledVector(n, depth);
    res.any = true;
    if (n.y > 0.55 && n.y > res.ny) { res.ny = n.y; res.box = o; }
  }
  return res;
}

const lp = new V();
// Highest dynamic surface under (x,z) not far above yRef. Used for foot IK / spawning.
export function dynTopY(x, z, yRef) {
  let best = -Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const o = boxes[i]; if (!o.enabled) continue;
    if (Math.abs(x - o.pos.x) > o.br || Math.abs(z - o.pos.z) > o.br) continue;
    q.copy(o.quat).invert(); lp.set(x - o.pos.x, 0, z - o.pos.z).applyQuaternion(q);
    if (Math.abs(lp.x) > o.half.x || Math.abs(lp.z) > o.half.z) continue;
    // approximate top (exact for near-level boxes)
    n.set(lp.x, o.half.y, lp.z).applyQuaternion(o.quat);
    const top = o.pos.y + n.y;
    if (top <= yRef + 0.7 && top > best) best = top;
  }
  return best;
}
