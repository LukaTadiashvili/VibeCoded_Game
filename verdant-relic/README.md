# Verdant Relic: Elemental Frontier

A 3D third-person, single-quest jungle adventure for iPhone Safari (installable PWA) and desktop.
Vite + Three.js (WebGL2) + `three-mesh-bvh` capsule physics + procedural Web Audio. No binary assets:
every mesh, texture, shader and sound is generated at runtime.

## Run

```bash
npm install
npm run dev        # http://localhost:5173  (use the Network URL on an iPhone on the same Wi-Fi)
npm run build      # static bundle in dist/ (host anywhere over HTTPS, then "Add to Home Screen")
npm run playtest   # headless end-to-end playtest (needs the dev server running and Playwright available)
```

## Controls

| Console button | Action | Keyboard / mouse |
| --- | --- | --- |
| Thumbstick | Sneak / jog / sprint, steer flight (full tilt = boost) | `WASD`, `Shift` sprint, `Ctrl` sneak |
| D-pad | `UP` Fire · `DOWN` Water · `LEFT` Earth · `RIGHT` Air | `3` · `1` · `2` · `4` |
| `A` | Jump, air-hop, release vine / zip-line, ascend in flight | `Space` |
| `B` | Dodge roll (i-frames), dive in flight | `C` |
| `X` | Primary bending: Water Whip, Boulder Hurl, Blazing Arc, Gale Vortex | Left-click / `J` |
| `Y` | Heavy talent: Cryo-Freeze, Tectonic Pillar, Jet Dash, Tornado Lift | Right-click / `K` |
| `R1` | Toggle 3D flight | `F` |
| `L1` | Wayfinder pulse + interact (mirrors, vines, zip-line, altar) | `E` |
| Drag on the scene | Camera look / aim reticle | Mouse (click to lock pointer) |

## The quest

Recover the three Solar Cores and awaken the Summit Altar on the Sun-Spire.

1. **East, Flooded Mirror Ruins.** Cross the nine buoyant stepping stones (or freeze them), douse the flame trap with Water, turn the two sun-mirrors until the beam reaches the seal.
2. **North-west, Razorback Gorge.** Cross the 18-plank rope bridge (two planks missing, two rotted), swing a liana over the waterfall chasm, burn the thorn cage and light both braziers with Fire, ride the zip-line back.
3. **South-west, Earth Hollow.** Use an Earth pillar and bounce-mushrooms to climb the terraces, smash the cracked vault with a Boulder Hurl, stun the Obsidian-Vine Goliath.
4. **Centre, Sun-Spire.** Cross the see-saw over the thorn moat, climb the ramp past the rolling boulders, fly through the three sky-rings to drop the storm barrier, and use `L1` at the altar.

## Code map

| File | Purpose |
| --- | --- |
| `src/terrain.js` | Height field, river / gorge / moat masks, hazard and zone lookup |
| `src/world.js` | Sky, lights, terrain, water, ziggurat, jungle, merged BVH collider |
| `src/dyn.js` | Oriented-box colliders for moving objects |
| `src/player.js` | 60 Hz capsule controller, flight, vine, zip-line, camera |
| `src/rig.js` | Cole Vance: 22-joint rig, leg IK, bending poses, hat spring, bandana cloth |
| `src/bending.js` | The four elements and their projectiles, pillars and ice |
| `src/objects.js` | Bridge, stepping stones, vines, zip-line, mushrooms, see-saw, boulder trap, turbine |
| `src/quest.js` | Sanctum puzzles, Goliath, sky-rings, altar, objectives |
| `src/hud.js` | On-screen console, status HUD, touch / keyboard input |
| `src/debug.js` | `window.__GAME_DEBUG__` automation API |
| `playtest/playtest.cjs` | Automated six-checkpoint playtest (writes `playtest/out/report.json`) |

## Tuning notes

- Gravity is 18 m/s² (not 9.81) so jumps feel responsive; jump height is about 1.6 m.
- The stepping-stone spring uses the specified `k = 180`, `c = 18` in unit-mass form, giving roughly 0.45 m of sink under Cole.
- Rendering starts at 2x pixel ratio and scales between 1x and the device's 3x to hold frame rate.
