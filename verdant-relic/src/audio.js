// Fully procedural Web Audio: jungle ambience + elemental SFX. No asset files.
import { G } from './ctx.js';
let ctx = null, master = null, noiseBuf = null, birdT = 2;
export const audio = { unlocked: false, muted: false };

export function unlockAudio() {
  if (audio.unlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambience bed: river/wind wash
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.11; src.connect(lp).connect(g).connect(master); src.start();
    audio.unlocked = true;
  } catch (e) { G.errors.push('audio: ' + e.message); }
}
function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0, delay = 0) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, f0, f1, vol = 0.3, type = 'bandpass', q = 1) {
  const t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.05);
}
const bank = {
  ui: () => tone(660, 0.07, 'triangle', 0.12),
  jump: () => noise(0.14, 500, 1400, 0.12),
  land: () => { noise(0.16, 260, 80, 0.3, 'lowpass'); },
  step: () => noise(0.05, 900, 300, 0.05),
  roll: () => noise(0.3, 700, 200, 0.15),
  water: () => { noise(0.5, 1800, 500, 0.3); tone(520, 0.3, 'sine', 0.08, -260); },
  ice: () => { tone(1900, 0.5, 'triangle', 0.12, 900); tone(2600, 0.4, 'sine', 0.08, 700, 0.06); noise(0.3, 5000, 2500, 0.1, 'highpass'); },
  earth: () => { noise(0.6, 180, 50, 0.6, 'lowpass'); tone(70, 0.5, 'sine', 0.4, -30); },
  smash: () => { noise(0.4, 900, 90, 0.5, 'lowpass'); tone(110, 0.3, 'square', 0.12, -60); },
  fire: () => noise(0.7, 400, 1500, 0.32, 'bandpass', 0.6),
  air: () => noise(0.6, 600, 2600, 0.28, 'bandpass', 2.5),
  flight: () => { noise(0.9, 300, 2200, 0.25, 'bandpass', 3); tone(330, 0.5, 'sine', 0.06, 330); },
  pulse: () => { tone(880, 0.6, 'sine', 0.14, 440); tone(1320, 0.5, 'sine', 0.07, 300, 0.08); },
  hurt: () => { tone(180, 0.25, 'sawtooth', 0.2, -90); },
  fizzle: () => tone(200, 0.12, 'square', 0.06, -80),
  bounce: () => tone(220, 0.35, 'sine', 0.25, 500),
  mirror: () => { noise(0.35, 300, 200, 0.2, 'lowpass'); tone(990, 0.2, 'triangle', 0.06); },
  core: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.6, 'triangle', 0.16, 0, i * 0.11)); },
  golem: () => { tone(55, 0.7, 'sawtooth', 0.3, -20); noise(0.5, 200, 60, 0.3, 'lowpass'); },
  creak: () => tone(140, 0.2, 'sawtooth', 0.05, 60),
  splash: () => noise(0.6, 1200, 300, 0.4),
  victory: () => { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, 1.6, 'triangle', 0.16, 0, i * 0.16); tone(f / 2, 1.6, 'sine', 0.1, 0, i * 0.16); }); },
};
export function sfx(name) {
  G.sfxLog = G.sfxLog || {}; G.sfxLog[name] = (G.sfxLog[name] || 0) + 1;
  if (!audio.unlocked || audio.muted || !bank[name]) return;
  try { bank[name](); } catch (e) { /* audio must never break the game */ }
}
export function updateAudio(dt) {
  if (!audio.unlocked || audio.muted) return;
  birdT -= dt;
  if (birdT <= 0) { birdT = 1.5 + Math.random() * 5; const f = 1600 + Math.random() * 1800; const n = 2 + (Math.random() * 3 | 0); for (let i = 0; i < n; i++) tone(f + i * 120, 0.09, 'sine', 0.035, 500, i * 0.13); }
}
