# Playtest Telemetry Report

Automated run of `playtest/playtest.cjs` against the Vite dev server in headless Chromium
(viewport 393×852, `deviceScaleFactor: 3`, `hasTouch: true`, `isMobile: true`).
The script taps the title button and every console button with real touch events, then plays the
quest from Base Camp to the Summit Altar through `window.__GAME_DEBUG__` (`pressConsoleButton`, `setStick`,
`steerTo`, `advance`). No teleporting is used. Raw data: `playtest/last-report.json`.

**Result: 6 / 6 checkpoints passed, 0 console errors, 0 page errors, 0 shader/WebGL errors.**
Simulated play time 4 min 28 s, 1,446 m travelled, peak altitude 35.5 m, 1 respawn (the deliberate rotted-plank fall).

| # | Checkpoint | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Console UI & rig | PASS | 11 controls inside the viewport with no overlaps; all 10 buttons respond to real touch taps; touch-drag on the stick gives `my = 0.95`; audio unlocked; rig has 22 joints; 24 shader programs compiled cleanly; 183 draw calls, 451k triangles |
| 2 | Four elements + flight | PASS | Earth pillar lifted Cole 7.1 m (4.5 m pillar plus launch); boulder hurled; fire arc; jet dash at 16.0 m/s for 21.6 m; gale fired; tornado lift 5.4 m; flight climbed 20.6 m monotonically, cruised at 12.5 m/s on 0.9 stick, dived at −8.4 m/s; water whip; Cryo-Freeze froze the stepping stones |
| 3 | Sanctum 1, Core 1 | PASS | Stone sank 0.50 m under Cole; hop to the next stone landed; frozen stones crossed with no respawn; flame trap burned and pushed Cole back, then was doused by the whip; mirror A turned with `L1`, mirror B with three Air gales; core collected |
| 4 | Sanctum 2, Core 2 | PASS | Bridge crossed on planks with both missing-plank gaps jumped (max sag 1.5 m); rotted plank snapped under Cole and he respawned on the island; vine grabbed with `L1`, swing peaked at 12.8 m/s and landed on the shrine side; thorn cage burned (3 fire ticks); both braziers lit; core collected; zip-line ride reached 17.0 m/s and landed on the far rim |
| 5 | Sanctum 3, Core 3 | PASS | Earth pillar onto terrace 1 (4.5 m); mushroom bounce peaked at 12.5 m and landed on terrace 2 (9 m); Goliath stunned by Boulder Hurl twice (HP 3 → 1) and landed one slam (Cole at 75 HP); cracked vault smashed; core collected |
| 6 | Ascent & victory | PASS | See-saw tipped from +0.12 to −0.07 rad as Cole crossed; one rolling boulder dodged with roll i-frames; one jammed by an Earth pillar; turbine spun with Air and no boulders spawned during the climb; storm barrier blocked the summit until all 3 sky-rings were flown through; landed at the summit, `L1` at the altar set `questCompleted === true`; victory screen shown |

## Bugs found and fixed during the playtest

- The bridge anchors sat on the sloping lip of the gorge, so Cole could not step onto the first plank. Anchors moved onto flat ground.
- The see-saw's low end was 0.2 m proud of the bank and its balance spring levelled it at rest; walking on was blocked. Beam thinned and the rest pose now stays tipped.
- The river bank next to the thorn moat was only about 4 m wide. River moved 6 m east.
- Cole slid slowly downhill while standing still on slopes. Fixed.
- The flame trap hit every physics step. It now hits at most every 0.8 s.
- The mirror and altar interaction ranges were too tight to reach from a natural standing spot. Widened.
- A camp mushroom sat on the direct path east. Moved.
- The camera did not snap after a respawn. Fixed.

## Known gaps

- **Frame rate is not validated on a real device.** The headless browser has no GPU and renders in software at 10–16 fps (after the resolution scaler dropped to 1x). This shows the render path is error-free, not that it holds 60 fps on an iPhone.
- **The elemental-combo stun did not trigger in this run.** Water and fire hits registered, the Air gale missed the moving Goliath; both stuns came from boulders.
- The ice-bridge fallback over the waterfall chasm and the Air deflection of the Goliath's thrown rocks were not exercised.
- Audio was verified as unlocked and triggered, not listened to.
