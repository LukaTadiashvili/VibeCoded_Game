// Built-in handheld console overlay: thumbstick + D-pad, A/B/X/Y diamond, L1/R1, status HUD.
import { G, clamp } from './ctx.js';
import { ELEMENTS } from './bending.js';
import { unlockAudio } from './audio.js';

const ICON = {
  water: '<svg viewBox="0 0 24 24"><path fill="#35d0ff" d="M12 2.5c3.6 4.6 6.5 8 6.5 11.6A6.5 6.5 0 0 1 12 20.6a6.5 6.5 0 0 1-6.5-6.5C5.5 10.5 8.4 7.100 12 2.5z"/></svg>',
  earth: '<svg viewBox="0 0 24 24"><path fill="#b9c23e" d="M2 20 9 7l4 6 3-4 6 11z"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><path fill="#ff5a1f" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2.500 1.200-4 2.500-5.500C9 11 10 12 10 13c1.500-2 2-6 2-11z"/></svg>',
  air: '<svg viewBox="0 0 24 24" fill="none" stroke="#e6f6ff" stroke-width="2.2" stroke-linecap="round"><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/><path d="M3 19h7"/></svg>',
};
const ARROW = '<svg id="arrow" viewBox="0 0 24 24"><path fill="#ffd97a" d="M12 2 19 20 12 16 5 20z"/></svg>';
const NAMES = { bA: 'A_JUMP', bB: 'B_ROLL', bX: 'X_BEND_PRIMARY', bY: 'Y_BEND_HEAVY', bR1: 'R1_FLIGHT', bL1: 'L1_PULSE_INTERACT', dU: 'DPAD_FIRE', dD: 'DPAD_WATER', dL: 'DPAD_EARTH', dR: 'DPAD_AIR' };
const EL_OF = { dU: 'fire', dD: 'water', dL: 'earth', dR: 'air' };

export function createHud() {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="hurt"></div>
    <div id="status" class="glass"><div id="emblem"></div><div class="bars"><span class="lbl">Chi</span><div id="chi" class="bar"><i></i></div><span class="lbl">Vitality</span><div id="hp" class="bar"><i></i></div></div></div>
    <div id="right" class="glass"><div id="cores"><b></b><b></b><b></b></div><div id="compass">${ARROW}<span id="dist">0 m</span></div><div id="eclipse">ECLIPSE 0%</div></div>
    <div id="objective"></div><div id="zone"></div><div id="toast"></div><div id="prompt"></div><div id="reticle"></div>
    <div id="bL1" class="btn glass shoulder"><span>L1<small>PULSE · USE</small></span></div>
    <div id="bR1" class="btn glass shoulder"><span>R1<small>FLIGHT</small></span></div>
    <div id="left" class="cluster">
      <div id="dU" class="btn glass dpad">${ICON.fire}</div><div id="dD" class="btn glass dpad">${ICON.water}</div>
      <div id="dL" class="btn glass dpad">${ICON.earth}</div><div id="dR" class="btn glass dpad">${ICON.air}</div>
      <div id="stick" class="glass"><div id="knob"></div></div>
    </div>
    <div id="rightc" class="cluster">
      <div id="bY" class="btn glass face">Y<small id="yl">HEAVY</small></div><div id="bX" class="btn glass face">X<small id="xl">BEND</small></div>
      <div id="bB" class="btn glass face">B<small>ROLL</small></div><div id="bA" class="btn glass face">A<small>JUMP</small></div>
    </div>`;
  const $ = (id) => document.getElementById(id);
  const els = {}; ['emblem', 'chi', 'hp', 'cores', 'compass', 'arrow', 'dist', 'eclipse', 'objective', 'zone', 'toast', 'prompt', 'hurt', 'stick', 'knob', 'bX', 'bY', 'bR1', 'xl', 'yl', 'bA', 'bB'].forEach((k) => els[k] = $(k));
  const chiFill = els.chi.firstElementChild, hpFill = els.hp.firstElementChild;
  const inp = G.input; let toastT = 0, zoneT = 0, pulseT = 0, hurtT = 0;

  const hud = G.hud = {
    presses: {},
    press(name) { inp.held[name] = true; inp.queue.push(name); hud.presses[name] = (hud.presses[name] || 0) + 1; const id = Object.keys(NAMES).find((k) => NAMES[k] === name); if (id) { const e = $(id); e.classList.add('pressed'); e._t = performance.now(); } },
    release(name) { inp.held[name] = false; const id = Object.keys(NAMES).find((k) => NAMES[k] === name); if (id) { const e = $(id); setTimeout(() => e.classList.remove('pressed'), Math.max(0, 110 - (performance.now() - (e._t || 0)))); } },
    setElement(e) { document.documentElement.style.setProperty('--el', '#' + ELEMENTS[e].color.toString(16).padStart(6, '0')); els.emblem.innerHTML = ICON[e]; for (const id in EL_OF) $(id).classList.toggle('sel', EL_OF[id] === e); els.xl.textContent = ELEMENTS[e].x.split(/[ -]/).pop().toUpperCase(); els.yl.textContent = ELEMENTS[e].y.split(/[ -]/).pop().toUpperCase(); },
    flashChi() { els.chi.classList.remove('flash'); void els.chi.offsetWidth; els.chi.classList.add('flash'); },
    flashHurt() { els.hurt.classList.add('on'); hurtT = 0.15; },
    toast(msg) { els.toast.textContent = msg; els.toast.style.opacity = 1; toastT = 3.2; (G.toastLog = G.toastLog || []).push(msg); },
    zone(name) { els.zone.textContent = name; els.zone.style.opacity = 1; zoneT = 2.6; },
    pulse() { pulseT = 1.2; els.compass.classList.add('pulse'); },
    showVictory() {
      const p = G.player, q = G.quest, s = G.bending.stats, t = q.completeTime || G.simTime;
      $('stats').innerHTML = `Time <b>${Math.floor(t / 60)}m ${Math.floor(t % 60)}s</b> · Distance <b>${Math.round(p.distance)} m</b><br/>Peak altitude <b>${p.maxAlt.toFixed(0)} m</b> · Respawns <b>${p.respawns}</b><br/>Bending hits <b>${s.hits}</b> · Pillars <b>${s.pillars}</b> · Ice <b>${s.iceCreated}</b>`;
      $('victory').classList.remove('hide');
    },
    update(dt) {
      const p = G.player, q = G.quest, b = G.bending;
      chiFill.style.width = clamp(p.chi, 0, 100) + '%'; hpFill.style.width = clamp(p.hp, 0, 100) + '%';
      const cs = els.cores.children; for (let i = 0; i < 3; i++) cs[i].classList.toggle('on', q.cores[i].collected);
      const o = q.objective(); els.objective.textContent = o.text;
      const dx = o.pos.x - p.pos.x, dz = o.pos.z - p.pos.z; const ang = Math.atan2(dx, -dz) + inp.yaw;   // relative to camera heading
      els.arrow.style.transform = `rotate(${ang}rad)`; els.dist.textContent = Math.round(Math.hypot(dx, dz)) + ' m';
      els.eclipse.textContent = 'ECLIPSE ' + Math.round(q.eclipse / 0.85 * 100) + '%';
      els.bX.style.setProperty('--cd', clamp(b.cdX / 0.5, 0, 1)); els.bY.style.setProperty('--cd', clamp(b.cdY / b.cdYMax, 0, 1));
      els.bR1.classList.toggle('active', p.flying);
      els.bA.lastElementChild.textContent = p.flying ? 'ASCEND' : 'JUMP'; els.bB.lastElementChild.textContent = p.flying ? 'DIVE' : 'ROLL';
      const pr = q.prompt(); els.prompt.textContent = pr ? 'L1 · ' + pr : ''; els.prompt.style.opacity = pr ? 1 : 0;
      if (toastT > 0 && (toastT -= dt) <= 0) els.toast.style.opacity = 0;
      if (zoneT > 0 && (zoneT -= dt) <= 0) els.zone.style.opacity = 0;
      if (pulseT > 0 && (pulseT -= dt) <= 0) els.compass.classList.remove('pulse');
      if (hurtT > 0 && (hurtT -= dt) <= 0) els.hurt.classList.remove('on');
    },
  };

  // ---- touch / pointer wiring
  for (const id in NAMES) {
    const e = $(id), name = NAMES[id];
    e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); unlockAudio(); try { e.setPointerCapture(ev.pointerId); } catch (_) {} hud.press(name); });
    const up = (ev) => { ev.preventDefault(); hud.release(name); }; e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
  }
  let stickId = null;
  const setStick = (ev) => { const r = els.stick.getBoundingClientRect(); let x = (ev.clientX - (r.left + r.width / 2)) / 40, y = (ev.clientY - (r.top + r.height / 2)) / 40; const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } inp.mx = x; inp.my = -y; els.knob.style.transform = `translate(${x * 30}px, ${y * 30}px)`; };
  els.stick.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); unlockAudio(); stickId = ev.pointerId; try { els.stick.setPointerCapture(ev.pointerId); } catch (_) {} setStick(ev); });
  els.stick.addEventListener('pointermove', (ev) => { if (ev.pointerId === stickId) setStick(ev); });
  const stickUp = (ev) => { if (ev.pointerId !== stickId) return; stickId = null; inp.mx = inp.my = 0; els.knob.style.transform = ''; };
  els.stick.addEventListener('pointerup', stickUp); els.stick.addEventListener('pointercancel', stickUp);
  hud.showStick = (x, y) => { els.knob.style.transform = `translate(${x * 30}px, ${-y * 30}px)`; };
  // camera look: drag anywhere on the canvas
  const cv = G.renderer.domElement; let lookId = null, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', (ev) => { unlockAudio(); if (ev.pointerType === 'mouse' && document.pointerLockElement !== cv && G.started) { cv.requestPointerLock && cv.requestPointerLock(); return; } lookId = ev.pointerId; lx = ev.clientX; ly = ev.clientY; });
  cv.addEventListener('pointermove', (ev) => {
    if (document.pointerLockElement === cv) { inp.yaw -= ev.movementX * 0.0032; inp.pitch += ev.movementY * 0.0028; inp.lookIdle = 0; return; }
    if (ev.pointerId !== lookId) return; inp.yaw -= (ev.clientX - lx) * 0.0075; inp.pitch += (ev.clientY - ly) * 0.006; lx = ev.clientX; ly = ev.clientY; inp.lookIdle = 0;
  });
  const lookUp = (ev) => { if (ev.pointerId === lookId) lookId = null; }; cv.addEventListener('pointerup', lookUp); cv.addEventListener('pointercancel', lookUp);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // ---- desktop keyboard + mouse
  const KEYMAP = { Space: 'A_JUMP', KeyC: 'B_ROLL', KeyJ: 'X_BEND_PRIMARY', KeyK: 'Y_BEND_HEAVY', KeyF: 'R1_FLIGHT', KeyE: 'L1_PULSE_INTERACT', Digit1: 'DPAD_WATER', Digit2: 'DPAD_EARTH', Digit3: 'DPAD_FIRE', Digit4: 'DPAD_AIR' };
  const keys = {};
  const refreshKeys = () => { const x = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), y = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0); const m = Math.hypot(x, y) || 1; const walk = keys.ControlLeft ? 0.3 : 0.8; inp.mx = x / m * walk; inp.my = y / m * walk; inp.sprint = !!(keys.ShiftLeft || keys.ShiftRight); };
  addEventListener('keydown', (e) => { if (e.repeat) return; unlockAudio(); keys[e.code] = true; if (KEYMAP[e.code]) { e.preventDefault(); hud.press(KEYMAP[e.code]); } if (/Key[WASD]|Shift|Control/.test(e.code)) refreshKeys(); });
  addEventListener('keyup', (e) => { keys[e.code] = false; if (KEYMAP[e.code]) hud.release(KEYMAP[e.code]); if (/Key[WASD]|Shift|Control/.test(e.code)) refreshKeys(); });
  cv.addEventListener('mousedown', (e) => { if (document.pointerLockElement !== cv) return; const n = e.button === 0 ? 'X_BEND_PRIMARY' : e.button === 2 ? 'Y_BEND_HEAVY' : null; if (n) { hud.press(n); hud.release(n); } });
  hud.setElement('water');
  return hud;
}

// Layout audit used by the automated playtest: every control visible, inside the viewport, no overlaps.
export function auditLayout() {
  const ids = Object.keys(NAMES).concat(['stick']); const rects = {}; const issues = [];
  const W = innerWidth, H = innerHeight;
  for (const id of ids) { const r = document.getElementById(id).getBoundingClientRect(); rects[id] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; if (r.width < 30 || r.height < 30) issues.push(id + ' too small'); if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) issues.push(id + ' outside viewport'); }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = rects[ids[i]], b = rects[ids[j]]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) issues.push(ids[i] + ' overlaps ' + ids[j]); }
  return { viewport: [W, H], rects, issues, names: NAMES };
}
