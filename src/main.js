import * as THREE from 'three';
import { G, runTimers } from './ctx.js';
import { buildWorld, finalizeWorld } from './world.js';
import { buildFx, updateFx } from './fx.js';
import { createRig } from './rig.js';
import { createPlayer, stepPlayer, updateCamera, groundY } from './player.js';
import { createBending } from './bending.js';
import { buildObjects } from './objects.js';
import { createQuest } from './quest.js';
import { createHud } from './hud.js';
import { unlockAudio, updateAudio } from './audio.js';
import { installDebug } from './debug.js';

const STEP = 1 / 60;
installDebug();   // error capture first, so nothing is missed

const canvas = document.getElementById('game');
const renderer = G.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const MAX_PR = Math.min(window.devicePixelRatio || 1, 3);
G.pixelRatio = Math.min(MAX_PR, 2);
renderer.setPixelRatio(G.pixelRatio); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.debug.onShaderError = (gl, program, vs, fs) => { G.errors.push('SHADER: ' + (gl.getProgramInfoLog(program) || '') + ' | ' + (gl.getShaderInfoLog(vs) || '') + ' | ' + (gl.getShaderInfoLog(fs) || '')); };
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.errors.push('WebGL context lost'); });

G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 900);
G.camera.position.set(0, 6, 104);

buildWorld(); buildFx();
createPlayer(); createBending(); buildObjects(); createQuest(); finalizeWorld();
G.groundY = groundY;
G.rig = createRig(); G.scene.add(G.rig.root, G.rig.cloth);
createHud(); G.bending.setElement('water');

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix(); });

// ---- deterministic 60 Hz simulation step
G.simStep = function simStep() {
  if (G.preStep) G.preStep();
  G.simTime += STEP; runTimers();
  for (const u of G.updaters) u(STEP);     // world objects first (platforms move), then the player
  stepPlayer(STEP);
  G.steps = (G.steps || 0) + 1;
};
const renderPos = new THREE.Vector3();
G.renderFrame = function renderFrame(dt, alpha = 1) {
  const p = G.player; renderPos.lerpVectors(p.prevPos, p.pos, alpha);
  G.rig.update(dt, p, renderPos);
  updateCamera(dt, renderPos);
  for (const u of G.frameUpdaters) u(dt);
  updateFx(dt); G.hud.update(dt); updateAudio(dt);
  renderer.render(G.scene, G.camera);
};

let last = performance.now(), acc = 0, fpsAcc = 0, fpsN = 0, prT = 0; G.fps = 60; G.frames = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (G.started && !G.paused) { acc += dt; let n = 0; while (acc >= STEP && n < 6) { G.simStep(); acc -= STEP; n++; } if (n === 6) acc = 0; }
  G.renderFrame(dt, G.started ? acc / STEP : 1); G.frames++;
  fpsAcc += dt; fpsN++; if (fpsAcc >= 0.5) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  // dynamic resolution: hold 60 fps on phones, climb to full 3x when there is headroom
  prT += dt; if (prT > 1.5 && G.frames > 60) { prT = 0; let pr = G.pixelRatio; if (G.fps < 45 && pr > 1) pr = Math.max(1, pr - 0.25); else if (G.fps > 58 && pr < MAX_PR) pr = Math.min(MAX_PR, pr + 0.25); if (pr !== G.pixelRatio) { G.pixelRatio = pr; renderer.setPixelRatio(pr); } }
}
requestAnimationFrame(loop);

G.start = function start() {
  if (G.started) return; G.started = true; unlockAudio();
  document.getElementById('title').classList.add('hide');
  G.hud.zone('Frontier Base Camp'); G.hud.toast('Recover the 3 Solar Cores before the Eclipse Storm');
};
document.getElementById('start').addEventListener('click', G.start);
document.getElementById('again').addEventListener('click', () => location.reload());
document.addEventListener('visibilitychange', () => { last = performance.now(); });

if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
