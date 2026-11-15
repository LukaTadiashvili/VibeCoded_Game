// Autonomous end-to-end playtest: iPhone 15/16 Pro viewport, touch, all 6 checkpoints.
// Usage: npm run dev (port 5173) then: node playtest/playtest.cjs [url]
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const URL = process.argv[2] || 'http://localhost:5173/';
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

const PT_LIB = () => {
  const d = window.__GAME_DEBUG__; const S = () => d.getState();
  const PT = window.PT = {
    S, D: () => d.getDetail(),
    press(n, settle = 2) { d.pressConsoleButton(n); d.advance(settle / 60); },
    wait(t, until) { return d.advance(t, until); },
    idle(t) { d.stopSteer(); d.advance(t); },
    waitChi(min = 96) { d.stopSteer(); d.advance(10, () => S().chiEnergy >= min && S().grounded); },
    goTo(x, z, o = {}) {
      const mag = o.mag ?? 1, stop = o.stop ?? 0.7, timeout = o.timeout ?? 45; d.steerTo(x, z, mag, stop);
      let t = 0, last = S().playerPos, stuck = 0, jumps = 0;
      while (t < timeout && !d.arrived()) {
        d.advance(0.25, () => d.arrived()); t += 0.25; const p = S().playerPos;
        if (Math.hypot(p.x - last.x, p.z - last.z) < 0.12) { stuck++; if (stuck >= 2 && o.jump !== false) { d.pressConsoleButton('A_JUMP'); jumps++; } } else stuck = 0;
        last = p; if (o.abort && o.abort(S())) break;
      }
      d.stopSteer(); const p = S().playerPos; return { ok: Math.hypot(p.x - x, p.z - z) < stop + 0.8, t, jumps, pos: p };
    },
    route(pts, o) { let r; for (const [x, z] of pts) { r = PT.goTo(x, z, o); if (!r.ok) return { ...r, failedAt: [x, z] }; } return r; },
    flyTo(x, y, z, o = {}) {
      const timeout = o.timeout ?? 20, tol = o.tol ?? 1.4; let t = 0; d.steerTo(x, z, o.mag ?? 0.9, 1.0);
      while (t < timeout) {
        const p = S().playerPos, dy = y - p.y, dh = Math.hypot(p.x - x, p.z - z);
        d.holdConsoleButton('A_JUMP', false); d.holdConsoleButton('B_ROLL', false);
        if (dy > 0.5) G_hold('A_JUMP'); else if (dy < -0.5) G_hold('B_ROLL');
        if (dh < tol && Math.abs(dy) < tol) break; if (o.until && o.until(S())) break; if (!S().isFlying) break;
        if (d.arrived() && dh > 1.0) d.steerTo(x, z, o.mag ?? 0.9, 1.0);
        d.advance(0.1); t += 0.1;
      }
      d.G.input.held.A_JUMP = false; d.G.input.held.B_ROLL = false; d.stopSteer(); const p = S().playerPos;
      return { ok: Math.hypot(p.x - x, p.z - z) < tol + 1.5 && Math.abs(p.y - y) < tol + 1.5, t, pos: p, flying: S().isFlying };
    },
    look(x, z, pitch = 0.28) { d.lookAt(x, z, pitch); },
    el(name) { PT.press('DPAD_' + name.toUpperCase()); return S().activeElement; },
  };
  // hold without queuing a new press edge (flight ascend/descend is a held state)
  function G_hold(n) { d.G.input.held[n] = true; }
  return true;
};

(async () => {
  const report = { url: URL, viewport: '393x852 @3x, hasTouch, isMobile', startedAt: new Date().toISOString(), checks: [], fpsSamples: [] };
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage(); const browserLogs = [];
  page.on('console', (m) => { if (m.type() === 'error') browserLogs.push('console.error: ' + m.text()); });
  page.on('pageerror', (e) => browserLogs.push('pageerror: ' + e.message));
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const FAST = !!process.env.FAST;
  const shot = async (name) => { if (FAST) return; await page.evaluate(() => { if (!__GAME_DEBUG__.G.cinematic) __GAME_DEBUG__.snap(); }); return page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 }).catch((e) => { console.log('screenshot failed: ' + name); report.screenshotFailures = (report.screenshotFailures || 0) + 1; }); };
  const fps = async (label) => { await ev(() => __GAME_DEBUG__.setPaused(true)); await page.waitForTimeout(FAST ? 600 : 2500); const f = await ev(() => ({ fps: __GAME_DEBUG__.getState().fps, pr: __GAME_DEBUG__.getState().pixelRatio })); report.fpsSamples.push({ label, ...f }); return f; };
  const check = (id, name, pass, details) => { report.checks.push({ id, name, pass: !!pass, details }); console.log(`${pass ? 'PASS' : 'FAIL'}  Check ${id} — ${name}`); if (!pass) console.log(JSON.stringify(details, null, 1)); };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__GAME_DEBUG__ && window.__GAME_DEBUG__.G.rig, null, { timeout: 60000 });
  await page.waitForTimeout(1500); await shot('00-title');

  // ---------------- CHECK 1: console UI, audio unlock, rig ----------------
  {
    const bb = await page.locator('#start').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(1200);
    const layout = await ev(() => __GAME_DEBUG__.layout());
    // real touch taps on every console button
    const before = await ev(() => ({ ...__GAME_DEBUG__.getDetail().presses }));
    for (const id of Object.keys(layout.names)) { const r = layout.rects[id]; await page.touchscreen.tap(r.x + r.w / 2, r.y + r.h / 2); await page.waitForTimeout(140); }
    await page.waitForTimeout(400);
    const after = await ev(() => ({ ...__GAME_DEBUG__.getDetail().presses }));
    const touched = Object.values(layout.names).filter((n) => (after[n] || 0) > (before[n] || 0));
    // real touch drag on the thumbstick via CDP
    const cdp = await ctx.newCDPSession(page); const sr = layout.rects.stick, cx = sr.x + sr.w / 2, cy = sr.y + sr.h / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 5, y: cy - 38 }] });
    await page.waitForTimeout(700);
    const stick = await ev(() => ({ mx: __GAME_DEBUG__.G.input.mx, my: __GAME_DEBUG__.G.input.my, v: __GAME_DEBUG__.getState().velocity }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    await ev(() => { const d = __GAME_DEBUG__; d.setPaused(true); if (d.getState().isFlying) d.pressConsoleButton('R1_FLIGHT'); d.pressConsoleButton('DPAD_WATER'); d.setLook(0, 0.28); d.advance(3); });
    const f = await fps('title → base camp');
    const st = await ev(() => __GAME_DEBUG__.getState()), det = await ev(() => __GAME_DEBUG__.getDetail());
    await shot('01-console-ui');
    check(1, 'Console UI & Rig', layout.issues.length === 0 && touched.length === 10 && stick.my > 0.8 && st.audioUnlocked && det.rig.joints === 22 && st.consoleErrors.length === 0 && f.fps > 5,
      { layoutIssues: layout.issues, buttonsRespondingToRealTouch: touched, stickTouch: stick, audioUnlocked: st.audioUnlocked, rigJoints: det.rig.joints, fps: f, drawCalls: det.render.calls, triangles: det.render.triangles, shaderPrograms: det.render.programs, colliderTris: det.tris, errors: st.consoleErrors });
  }
  await ev(PT_LIB);

  // ---------------- CHECK 2: all 4 elements + flight (at the river bank) ----------------
  {
    const r = await ev(() => {
      const o = {}; const S = PT.S, D = PT.D;
      o.walk = PT.route([[60, 60], [72, 30], [70, 3]], { mag: 1 }); o.sneak = (() => { PT.goTo(69, 2, { mag: 0.3, timeout: 6 }); return PT.S().playerPos; })();
      PT.waitChi();
      // EARTH
      o.elEarth = PT.el('earth'); PT.look(100, 0); const y0 = S().playerPos.y;
      PT.press('Y_BEND_HEAVY'); let peak = y0; for (let i = 0; i < 40; i++) { PT.wait(0.05); peak = Math.max(peak, S().playerPos.y); }
      o.pillar = { y0, peak, lift: peak - y0, pillars: D().bending.pillars, standingOn: S().groundTag };
      PT.press('X_BEND_PRIMARY'); PT.wait(0.2); o.boulderInFlight = D().bending.bouldersActive; PT.wait(1.5);
      PT.goTo(70, 2, { timeout: 6 }); PT.waitChi();
      // FIRE
      o.elFire = PT.el('fire'); PT.look(100, 0); PT.press('X_BEND_PRIMARY'); PT.wait(0.6); o.fireArcs = D().bending.fireArcs;
      const p1 = S().playerPos; PT.look(70, -60); __GAME_DEBUG__.setStick(0, 1); PT.press('Y_BEND_HEAVY'); __GAME_DEBUG__.setStick(0, 0);
      PT.wait(0.5); const vmid = S().velocity; o.dashSpeed = Math.hypot(vmid.x, vmid.z); o.dashing = S().dashing; PT.wait(1.2); const p2 = S().playerPos; o.dashDistance = Math.hypot(p2.x - p1.x, p2.z - p1.z);
      PT.waitChi();
      // AIR
      o.elAir = PT.el('air'); PT.press('X_BEND_PRIMARY'); PT.wait(0.25); o.galeAlive = D().bending.galesActive; PT.wait(1);
      const ya = S().playerPos.y; PT.press('Y_BEND_HEAVY'); let pk = ya; for (let i = 0; i < 40; i++) { PT.wait(0.05); pk = Math.max(pk, S().playerPos.y); } o.tornadoLift = pk - ya; PT.wait(2); PT.waitChi();
      // FLIGHT
      const yf = S().playerPos.y; PT.press('R1_FLIGHT'); o.isFlying = S().isFlying; const ys = [];
      __GAME_DEBUG__.G.input.held.A_JUMP = true; for (let i = 0; i < 12; i++) { PT.wait(0.2); ys.push(S().playerPos.y); } __GAME_DEBUG__.G.input.held.A_JUMP = false;
      o.flightYs = ys; o.smoothAscent = ys.every((y, i) => i === 0 || y > ys[i - 1] - 0.01) && ys[ys.length - 1] - yf > 8; o.climb = ys[ys.length - 1] - yf;
      __GAME_DEBUG__.setStick(0, 0.9); PT.look(60, 80); PT.wait(1.5); o.cruiseSpeed = Math.hypot(S().velocity.x, S().velocity.z); o.chiWhileFlying = S().chiEnergy;
      __GAME_DEBUG__.G.input.held.B_ROLL = true; PT.wait(0.8); __GAME_DEBUG__.G.input.held.B_ROLL = false; o.diveVy = S().velocity.y; __GAME_DEBUG__.setStick(0, 0);
      PT.press('R1_FLIGHT'); o.flightOff = !S().isFlying; PT.wait(4, () => S().grounded); o.landed = S().grounded;
      PT.route([[70, 2]], {}); PT.waitChi();
      // WATER
      o.elWater = PT.el('water'); PT.look(100, 0); PT.press('X_BEND_PRIMARY'); PT.wait(0.6); o.waterWhips = D().bending.waterWhips;
      PT.press('Y_BEND_HEAVY'); PT.wait(0.3); o.stonesFrozen = D().stonesFrozen; o.iceCreated = D().bending.iceCreated; o.stats = D().bending; o.state = S();
      return o;
    });
    await shot('02-elements-frozen-stones');
    const pass = r.walk.ok && r.elEarth === 'earth' && r.pillar.lift > 4 && r.stats.boulders >= 1 && r.elFire === 'fire' && r.fireArcs >= 1 && r.dashSpeed > 15 && r.dashDistance > 14 && r.elAir === 'air' && r.stats.gales >= 1 && r.tornadoLift > 3
      && r.isFlying && r.smoothAscent && r.flightOff && r.landed && r.elWater === 'water' && r.waterWhips >= 1 && r.stonesFrozen && r.iceCreated >= 1 && r.state.consoleErrors.length === 0;
    check(2, 'All 4 Elements & Flight', pass, r);
  }

  // ---------------- CHECK 3: Sanctum 1 — stones, flame trap, mirrors, Core 1 ----------------
  {
    const r = await ev(() => {
      const o = {}; const S = PT.S, D = PT.D;
      PT.idle(10.5); o.thawed = !D().stonesFrozen; PT.waitChi();
      // unfrozen: stand on stone 0 (sinks under 82 kg), hop to stone 1
      o.toStone0 = PT.goTo(76.5, -0.45, { mag: 0.6, stop: 0.35, timeout: 8, jump: false }); PT.idle(1.5);
      o.onStone = S().groundTag; o.sink = D().stoneRest - D().stoneMinY;
      __GAME_DEBUG__.steerTo(79.3, 0.45, 0.8, 0.3); PT.press('A_JUMP'); PT.wait(1.2, () => S().grounded && S().playerPos.x > 78.4); PT.idle(0.3);
      o.hop = { tag: S().groundTag, pos: S().playerPos, respawns: S().respawns };
      // freeze the rest and run across
      PT.look(100, 0); PT.press('Y_BEND_HEAVY'); PT.wait(0.3); o.frozen = D().stonesFrozen;
      o.cross = PT.route([[102, 0], [104, 0]], { timeout: 12 }); o.crossRespawns = S().respawns;
      PT.waitChi();
      // flame trap: walk into it once (should burn + knock back), then douse with the water whip
      const hp0 = S().health; PT.goTo(108, 0, { timeout: 4, jump: false }); o.flameBurn = { hpLost: hp0 - S().health, x: S().playerPos.x };
      PT.goTo(103, 0, { timeout: 6 }); PT.look(108, 0); PT.press('X_BEND_PRIMARY'); PT.wait(0.8); o.flameOut = D().s1.flameOut;
      // mirrors: A by L1 interaction, B by Air gale
      o.toA = PT.route([[112, 0], [116, -6.5], [128.9, -7.2]], { timeout: 15, stop: 0.4 });
      for (let i = 0; i < 2; i++) { PT.press('L1_PULSE_INTERACT'); PT.wait(0.4); } o.mirrorA = D().s1.mirrorA;
      PT.goTo(127.5, -3.5, { timeout: 5 }); PT.el('air'); for (let i = 0; i < 3; i++) { PT.look(131, 0); PT.press('X_BEND_PRIMARY'); PT.wait(1.0); }
      o.mirrorB = D().s1.mirrorB; o.mirrorAafter = D().s1.mirrorA; o.solved = D().s1.solved;
      o.toCore = PT.goTo(123.6, 0.2, { timeout: 8, stop: 0.5 }); PT.idle(0.5);
      o.state = S(); o.s1 = D().s1; return o;
    });
    await shot('03-sanctum1-core1');
    check(3, 'Sanctum 1 — Flooded Mirror Ruins, Core 1', r.state.coresCollected === 1 && r.flameOut && r.solved && r.sink > 0.3 && r.cross.ok && r.state.consoleErrors.length === 0, r);
  }
  await fps('sanctum 1');

  // ---------------- CHECK 4: Sanctum 2 — bridge, vine, fire, Core 2, zip-line ----------------
  {
    const r = await ev(() => {
      const o = {}; const S = PT.S, D = PT.D, d = __GAME_DEBUG__; const W = (dd, l) => [-92 + 0.70711 * (dd + l), -92 + 0.70711 * (dd - l)];
      const loc = () => { const p = S().playerPos, dx = p.x + 92, dz = p.z + 92; return { d: (dx + dz) * 0.70711, l: (dx - dz) * 0.70711, y: p.y }; };
      // leave the ruins through the door, then fly back over the river
      o.exit = PT.route([[116, -6.5], [112, 0], [104, 0]], { timeout: 15 }); PT.waitChi();
      PT.press('R1_FLIGHT'); o.riverFlight = PT.flyTo(68, 5, -6, { timeout: 12 }); PT.press('R1_FLIGHT'); PT.wait(4, () => S().grounded); o.riverRespawns = S().respawns;
      o.trek = PT.route([[66, -48], [40, -72], [0, -78], [-44, -62], W(54.5, 0)], { timeout: 60 }); PT.waitChi();
      // --- 18-plank Verlet bridge: jog, jump the two missing-plank gaps
      d.steerTo(...W(26.5, 0), 0.7, 0.6); let t = 0, j1 = false, j2 = false; const tags = new Set();
      while (t < 25 && !d.arrived()) { d.advance(0.03); t += 0.03; const L = loc(); const s = S(); if (s.groundTag) tags.add(s.groundTag); if (!j1 && L.d < 46.6 && s.grounded) { d.pressConsoleButton('A_JUMP'); j1 = true; } if (!j2 && L.d < 39.75 && s.grounded && j1) { d.pressConsoleButton('A_JUMP'); j2 = true; } if (S().respawns > o.riverRespawns) break; }
      d.stopSteer(); o.bridge = { loc: loc(), tags: [...tags], jumps: [j1, j2], respawns: S().respawns - o.riverRespawns, ...D().bridge };
      // --- rotted plank: walk back onto plank 15 and stand until it snaps (expect fall + respawn on the island)
      const rs = S().respawns; PT.idle(1); PT.goTo(...W(34.3, 0), { mag: 0.6, stop: 0.2, timeout: 6, jump: false }); PT.idle(1.2); PT.wait(6, () => S().respawns > rs);
      o.rotted = { broken: D().bridge.broken, respawned: S().respawns > rs, loc: loc() };
      PT.idle(0.5); PT.waitChi();
      // --- liana vine swing over the waterfall chasm
      o.toVine = PT.goTo(...W(17.7, 3), { stop: 0.3, timeout: 15, mag: 0.6 }); const rv = S().respawns;
      PT.look(...W(0, 3)); PT.press('L1_PULSE_INTERACT'); o.grabbed = S().onVine; d.setStick(0, 1); let maxSp = 0;
      PT.wait(9, () => { const v = S().velocity; maxSp = Math.max(maxSp, Math.hypot(v.x, v.y, v.z)); return !S().onVine; }); d.setStick(0, 0); PT.wait(2, () => S().grounded);
      o.vine = { loc: loc(), grounded: S().grounded, maxSwingSpeed: maxSp, respawned: S().respawns > rv };
      if (o.vine.loc.d > 6) {   // self-heal fallback: freeze the waterfall spray into an ice bridge
        PT.waitChi(); PT.goTo(...W(18, 3), { stop: 0.4, timeout: 10 }); PT.el('water'); PT.look(...W(0, 3)); PT.press('Y_BEND_HEAVY'); PT.wait(0.4); o.iceFallback = PT.goTo(...W(2, 3), { timeout: 8 });
      }
      PT.waitChi();
      // --- fire: thorn cage + twin braziers
      o.toShrine = PT.goTo(...W(-2.5, 0), { timeout: 10 }); o.elFire = PT.el('fire');
      PT.look(...W(-10, 0)); PT.press('X_BEND_PRIMARY'); PT.wait(1.0); if (!D().s2.burned) { PT.look(...W(-10, 0)); PT.press('X_BEND_PRIMARY'); PT.wait(1.0); } o.burned = D().s2.burned;
      for (const l of [-6, 6]) { PT.look(...W(-5, l)); PT.press('X_BEND_PRIMARY'); PT.wait(1.0); } o.s2 = D().s2;
      o.toCore = PT.goTo(...W(-8.2, 0.2), { timeout: 8, stop: 0.5 }); PT.idle(0.4); o.cores = S().coresCollected;
      // --- zip-line back
      o.toZip = PT.route([W(-2, 4), W(3, 11.2)], { timeout: 12 }); PT.press('L1_PULSE_INTERACT'); o.onZip = S().onZip; let zmax = 0;
      PT.wait(10, () => { const v = S().velocity; zmax = Math.max(zmax, Math.hypot(v.x, v.y, v.z)); return !S().onZip; }); PT.wait(3, () => S().grounded);
      o.zip = { loc: loc(), maxSpeed: zmax, rides: D().zipRides, grounded: S().grounded }; o.state = S(); return o;
    });
    await shot('04-sanctum2-core2');
    check(4, 'Sanctum 2 — Bridge, Vine, Fire Shrine, Core 2, Zip-line', r.state.coresCollected === 2 && r.bridge.loc.d < 29 && r.bridge.tags.includes('plank') && r.burned && r.s2.brazierL && r.s2.brazierR && r.zip.rides === 1 && r.zip.loc.d > 51 && r.state.consoleErrors.length === 0, r);
  }
  await fps('razorback gorge');

  // ---------------- CHECK 5: Sanctum 3 — pillar, mushroom, Goliath, Core 3 ----------------
  {
    const r = await ev(() => {
      const o = {}; const S = PT.S, D = PT.D, d = __GAME_DEBUG__;
      o.trek = PT.route([[-75, 0], [-64, 92], [-71.5, 93]], { timeout: 60 }); PT.goTo(-71.5, 93, { stop: 0.25, mag: 0.5, timeout: 4 }); PT.waitChi();
      // Earth pillar launches Cole onto terrace 1 (4.5 m)
      PT.el('earth'); PT.look(-95, 93); const y0 = S().playerPos.y; PT.press('Y_BEND_HEAVY'); PT.wait(0.5); d.steerTo(-76.5, 91, 1, 0.5); PT.wait(3, () => S().grounded && S().playerPos.y > 4.3 && S().playerPos.x < -73.6); d.stopSteer();
      o.terrace1 = { y: S().playerPos.y, x: S().playerPos.x, from: y0 }; PT.waitChi();
      // Bounce mushroom up to terrace 2 (9 m)
      PT.goTo(-74.6, 95, { stop: 0.3, timeout: 6, mag: 0.6 }); d.steerTo(-77, 95, 0.55, 0.25); PT.press('A_JUMP'); PT.wait(0.3); PT.press('A_JUMP'); let peak = 0, bounced = false;
      PT.wait(2.5, () => { const s = S(); peak = Math.max(peak, s.playerPos.y); if (s.velocity.y > 12) bounced = true; return bounced; });
      d.steerTo(-84.5, 95, 1, 0.6); PT.wait(4, () => { const s = S(); peak = Math.max(peak, s.playerPos.y); return s.grounded && s.playerPos.y > 8.8; }); d.stopSteer();
      o.terrace2 = { y: S().playerPos.y, x: S().playerPos.x, peak, bounced, bounces: D().mushroomBounces };
      // Goliath: boulder stun, elemental combo, smash the vault, claim the core
      const g = () => D().goliath; o.goliath0 = g();
      const hurl = (tx, tz) => { PT.el('earth'); PT.look(tx, tz, 0.2); PT.press('X_BEND_PRIMARY'); PT.wait(1.3); };
      let tries = 0; while (!g().stunned && !g().dead && tries++ < 5) { const gp = g().pos; hurl(gp.x, gp.z); }
      o.afterBoulder = g(); o.hpAfterFight = S().health;
      // move south of the vault and smash the cracked wall
      o.toWall = PT.route([[-88, 104], [-95, 103.5]], { timeout: 12 }); tries = 0;
      while (!D().s3.wallSmashed && tries++ < 4) { PT.look(-95, 97.4, 0.15); PT.el('earth'); PT.press('X_BEND_PRIMARY'); PT.wait(1.3); }
      o.wallSmashed = D().s3.wallSmashed;
      // elemental combo test once it wakes: water + air + fire
      PT.wait(8, () => !g().stunned); const stunsBefore = g().stuns; PT.waitChi(60);
      for (const e of ['water', 'air', 'fire']) { const gp = g().pos; PT.el(e); PT.look(gp.x, gp.z, 0.2); PT.press('X_BEND_PRIMARY'); PT.wait(0.75); }
      o.combo = { stunned: g().stunned, stuns: g().stuns - stunsBefore, hitsTaken: g().hitsTaken };
      tries = 0; while (!g().stunned && !g().dead && tries++ < 5) { const gp = g().pos; hurl(gp.x, gp.z); }
      o.toCore = PT.goTo(-95, 97.0, { timeout: 8, stop: 0.4 }); if (S().coresCollected < 3) { PT.goTo(-95, 96.2, { timeout: 3, stop: 0.3 }); }
      tries = 0; while (S().coresCollected < 3 && tries++ < 4) { const gp = g().pos; hurl(gp.x, gp.z); PT.goTo(-95, 96.4, { timeout: 4, stop: 0.4 }); }
      o.goliath = g(); o.state = S(); o.stats = D().bending; return o;
    });
    await shot('05-sanctum3-core3');
    check(5, 'Sanctum 3 — Earth Hollow, Goliath, Core 3', r.state.coresCollected === 3 && r.terrace1.y > 4.3 && r.terrace2.y > 8.8 && r.wallSmashed && r.goliath.stuns >= 1 && r.state.consoleErrors.length === 0, r);
  }
  await fps('earth hollow');

  // ---------------- CHECK 6: see-saw, boulder ramp, flight through sky-rings, Summit Altar ----------------
  {
    const r = await ev(() => {
      const o = {}; const S = PT.S, D = PT.D, d = __GAME_DEBUG__;
      // glide off the terraces and trek to the see-saw
      PT.goTo(-84, 106, { timeout: 8 }); PT.press('R1_FLIGHT'); o.glide = PT.flyTo(-60, 4, 100, { timeout: 10 }); PT.press('R1_FLIGHT'); PT.wait(4, () => S().grounded);
      o.trek = PT.route([[-30, 84], [0, 70], [0, 66.6]], { timeout: 40 }); PT.waitChi();
      const rs = S().respawns; const th0 = D().seesaw.theta; const tags = new Set();
      d.steerTo(0, 50.5, 0.6, 0.5); PT.wait(14, () => { const s = S(); if (s.groundTag) tags.add(s.groundTag); return d.arrived(); }); d.stopSteer();
      o.seesaw = { pos: S().playerPos, tags: [...tags], thetaStart: th0, ...D().seesaw, respawned: S().respawns > rs };
      // ramp: dodge-roll one boulder, jam one with an Earth pillar, then shut the gate with the wind turbine
      PT.goTo(5.5, 46, { timeout: 8 }); PT.waitChi();
      const T = d.G.trap; let rolled = 0; PT.look(0, 16); d.steerTo(0, 38.5, 0.8, 0.5);
      PT.wait(20, () => { const s = S(), p = s.playerPos; if (d.arrived()) d.setStick(0, 0); for (const b of T.list) if (!b.hit && b.z < p.z && p.z - b.z < 5.5 && Math.abs(b.x - p.x) < 2.8 && s.grounded && !s.rolling) { d.setStick(0, 1); d.pressConsoleButton('B_ROLL'); rolled++; } return D().trap.dodged > 0 || D().trap.hits > 0; }); d.setStick(0, 0);
      o.dodge = { rolled, ...D().trap, hp: S().health };
      PT.goTo(0, 43.2, { timeout: 6, stop: 0.4 }); PT.el('earth'); PT.look(0, 16); d.setStick(0, 1); PT.press('Y_BEND_HEAVY'); d.setStick(0, 0);
      PT.wait(12, () => D().trap.jammed > 0); o.jam = D().trap;
      PT.goTo(4.5, 43.5, { timeout: 6 }); PT.el('air'); PT.look(7.5, 45.7, 0.0); PT.press('X_BEND_PRIMARY'); PT.wait(1); o.turbineSpins = D().turbineSpins; PT.wait(5, () => T.list.length === 0);
      const sp0 = D().trap.spawned; o.climb = PT.route([[1.8, 40.5], [1.8, 30], [0, 14]], { timeout: 30 }); o.rampTop = S().playerPos; o.spawnedDuringClimb = D().trap.spawned - sp0; PT.waitChi();
      // flight through the 3 sky-ring monoliths
      PT.look(0, 0); PT.press('R1_FLIGHT'); o.flying = S().isFlying;
      // touch the barrier first to prove it blocks the summit
      const f0 = PT.flyTo(0, 29.5, 3, { timeout: 6 }); o.barrierBlocks = { reached: f0.ok, barrier: D().barrier, pos: f0.pos };
      o.ringA = PT.flyTo(23, 22.2, 15, { timeout: 10, until: () => D().rings[0] }); o.ringB1 = PT.flyTo(-6, 26, 13, { timeout: 8 }); o.ringB = PT.flyTo(-21, 26.2, -3, { timeout: 10, until: () => D().rings[1] });
      o.chiMid = S().chiEnergy;
      if (S().chiEnergy < 45) { PT.flyTo(-7.5, 21, 14.5, { timeout: 8 }); PT.press('R1_FLIGHT'); PT.wait(3, () => S().grounded); PT.waitChi(); PT.press('R1_FLIGHT'); o.rechargedAtShrine = true; }
      o.ringC1 = PT.flyTo(-12, 34, -12, { timeout: 8 }); o.ringC = PT.flyTo(5, 33.2, -13, { timeout: 10, until: () => D().rings[2] }); o.rings = D().rings; o.barrier = D().barrier;
      o.toSummit = PT.flyTo(0, 29.2, 3.2, { timeout: 10 }); if (S().isFlying) PT.press('R1_FLIGHT'); PT.wait(4, () => S().grounded); PT.goTo(0, 3.0, { timeout: 5, stop: 0.4, mag: 0.6 }); o.summitPos = S().playerPos; o.zone = S().currentZone;
      PT.press('L1_PULSE_INTERACT'); PT.wait(0.5); o.state = S(); PT.wait(2.5); o.detail = D(); return o;
    });
    await ev(() => __GAME_DEBUG__.setPaused(false)); await page.waitForTimeout(1500); await shot('06-summit-victory');
    await ev(() => { __GAME_DEBUG__.setPaused(true); __GAME_DEBUG__.advance(5); }); await page.waitForTimeout(800); await shot('07-quest-complete');
    const final = await ev(() => ({ s: __GAME_DEBUG__.getState(), d: __GAME_DEBUG__.getDetail(), victoryShown: !document.getElementById('victory').classList.contains('hide') }));
    r.final = { questCompleted: final.s.questCompleted, victoryShown: final.victoryShown, errors: final.s.consoleErrors, fps: final.s.fps };
    report.final = final;
    check(6, 'Flight Ascent & Summit Victory', r.state.questCompleted === true && r.rings.every(Boolean) && !r.barrier && r.summitPos.y > 27.5 && r.dodge.dodged >= 1 && r.jam.jammed >= 1 && r.seesaw.tags.includes('seesaw') && r.seesaw.pos.z < 52.5 && final.s.consoleErrors.length === 0 && browserLogs.length === 0 && final.victoryShown, r);
  }
  report.browserLogs = browserLogs; report.finishedAt = new Date().toISOString(); report.allPassed = report.checks.every((c) => c.pass);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('\nFPS samples:', JSON.stringify(report.fpsSamples)); console.log('browser errors:', browserLogs.length, browserLogs.slice(0, 5));
  console.log(report.allPassed ? '\nALL 6 CHECKPOINTS PASSED' : '\nSOME CHECKPOINTS FAILED');
  await browser.close(); process.exit(report.allPassed ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
