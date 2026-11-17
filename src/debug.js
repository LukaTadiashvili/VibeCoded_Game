// window.__GAME_DEBUG__ — automation surface used by the Playwright playtest.
import { G } from './ctx.js';
import { auditLayout } from './hud.js';
import { audio } from './audio.js';
import { boxes } from './dyn.js';
import { resetCamera } from './player.js';

export function installDebug() {
  const push = (m) => { if (G.errors.length < 200) G.errors.push(String(m)); };
  addEventListener('error', (e) => push('error: ' + (e.message || e.type) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  addEventListener('unhandledrejection', (e) => push('unhandledrejection: ' + (e.reason && e.reason.message || e.reason)));
  const ce = console.error.bind(console); console.error = (...a) => { push('console.error: ' + a.map(String).join(' ')); ce(...a); };
  const cw = console.warn.bind(console); G.warnings = []; console.warn = (...a) => { G.warnings.push(a.map(String).join(' ')); cw(...a); };

  const r2 = (n) => Math.round(n * 100) / 100;
  let nav = null, pending = [];
  G.preStep = () => {
    for (const n of pending) G.hud.release(n); pending.length = 0;
    if (nav) {   // steer the virtual stick toward a world point through the normal camera-relative input path
      const p = G.player, dx = nav.x - p.pos.x, dz = nav.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < nav.stop) { G.input.mx = G.input.my = 0; nav = null; }
      else { const y = G.input.yaw, fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y); const m = nav.mag / d; G.input.my = (dx * fx + dz * fz) * m; G.input.mx = (dx * rx + dz * rz) * m; }
    }
  };
  const api = window.__GAME_DEBUG__ = {
    getState() {
      const p = G.player, q = G.quest;
      return {
        playerPos: { x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z) }, velocity: { x: r2(p.vel.x), y: r2(p.vel.y), z: r2(p.vel.z) },
        grounded: p.grounded, isFlying: p.flying, activeElement: G.bending.element, chiEnergy: r2(p.chi), health: r2(p.hp),
        coresCollected: q.coresCollected, currentZone: q.zone, fps: r2(G.fps), consoleErrors: G.errors.slice(), questCompleted: q.completed,
        simTime: r2(G.simTime), onVine: !!p.vine, onZip: !!p.zip, dashing: p.dashT > 0, rolling: p.rollT > 0, started: G.started, respawns: p.respawns,
        groundTag: p.groundBox ? p.groundBox.tag : null, audioUnlocked: audio.unlocked, objective: q.objective().text, pixelRatio: G.pixelRatio,
      };
    },
    getDetail() {
      const q = G.quest, b = G.bending, go = G.goliath;
      return {
        s1: { ...q.s1 }, s2: { ...q.s2 }, s3: { ...q.s3 }, rings: q.rings.slice(), barrier: q.barrier, pulses: q.pulses, interactions: q.interactions,
        bending: { ...b.stats, pillarsActive: b.pillars.length, iceGroups: b.ice.length, bouldersActive: b.boulders.length, galesActive: b.gales.length },
        stonesFrozen: G.stones.frozen > 0, stoneMinY: Math.min(...G.stones.list.map((s) => s.minY)), stoneRest: G.stones.list[0].rest0,
        bridge: { frozen: G.bridge.frozen > 0, broken: G.bridge.broken, maxSag: r2(G.bridge.maxSag) }, seesaw: { theta: r2(G.seesaw.theta), min: r2(G.seesaw.minTheta), max: r2(G.seesaw.maxTheta) },
        zipRides: G.zip.rides, mushroomBounces: G.mushrooms.map((m) => m.bounces), trap: { spawned: G.trap.spawned, jammed: G.trap.jammed, hits: G.trap.hits, dodged: G.trap.dodged }, turbineSpins: G.turbine.spins,
        goliath: { hp: go.hp, stunned: go.stunT > 0, dead: go.dead, hitsTaken: go.hitsTaken, stuns: go.stuns, slams: go.slams, pos: { x: r2(go.pos.x), y: r2(go.pos.y), z: r2(go.pos.z) } },
        rig: { joints: G.rig.jointCount, ...G.rig.cur() }, dynBoxes: boxes.length, tris: G.world.triCount, render: { calls: G.renderer.info.render.calls, triangles: G.renderer.info.render.triangles, programs: G.renderer.info.programs ? G.renderer.info.programs.length : 0 },
        presses: { ...G.hud.presses }, sfx: { ...(G.sfxLog || {}) }, toasts: (G.toastLog || []).slice(-12), warnings: (G.warnings || []).slice(0, 10), distance: r2(G.player.distance), maxAlt: r2(G.player.maxAlt), frames: G.frames, steps: G.steps,
      };
    },
    // Press-and-release an on-screen console button (same code path as a touch).
    pressConsoleButton(name) { G.hud.press(name); pending.push(name); return true; },
    holdConsoleButton(name, down) { if (down) G.hud.press(name); else G.hud.release(name); return true; },
    setStick(x, y) { nav = null; G.input.mx = x; G.input.my = y; G.hud.showStick(x, y); return true; },
    setLook(yaw, pitch) { G.input.yaw = yaw; if (pitch !== undefined) G.input.pitch = pitch; G.input.lookIdle = 0; return true; },
    lookAt(x, z, pitch) { const p = G.player; G.input.yaw = Math.atan2(-(x - p.pos.x), -(z - p.pos.z)); if (pitch !== undefined) G.input.pitch = pitch; G.input.lookIdle = 0; return true; },
    steerTo(x, z, mag = 1, stop = 0.6) { nav = { x, z, mag, stop }; return true; },
    stopSteer() { nav = null; G.input.mx = G.input.my = 0; },
    // Fast-forward the deterministic 60 Hz simulation (no wall-clock wait), then draw one frame.
    advance(seconds, until) {
      const n = Math.round(seconds * 60); G.debugNoFollow = true; let i = 0;
      for (; i < n; i++) { G.simStep(); if (until && until()) break; }
      return i / 60;
    },
    arrived() { return nav === null; },
    setPaused(v) { G.paused = !!v; return true; },
    // Snap camera + rig to the current simulation state (headless browsers render very few frames).
    snap() { resetCamera(); for (let i = 0; i < 4; i++) G.renderFrame(0.1, 1); return true; },
    layout: auditLayout,
    teleport(x, y, z) { const p = G.player; p.pos.set(x, y, z); p.prevPos.copy(p.pos); p.vel.set(0, 0, 0); return true; },
    G,
  };
  return api;
}
