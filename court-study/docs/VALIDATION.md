# Validation — Cypress Court 1.0.0-rc1

## Executed on the delivered build

HTML SHA-256: `8cf434f613aa1d9ba689bb478ab8895a5df5e8b98f9f934e4bcbe294a95e1244`. Size: 916,258 bytes. The output has six embedded runtime-resource entries and no external script or font dependency. A clean decode from `assets/motions.json.gz`, followed by an offline rebuild with the cached engine, reproduced the exact same HTML hash.

The main browser acceptance suite passed **48 / 48 checks**. The live animation-loop smoke test passed **8 / 8 checks**. Both tested the built HTML, not a substitute scene. Chromium version: `144.0.7559.96`. Both runs recorded zero outgoing resource requests, zero uncaught JavaScript errors and zero shader/WebGL console errors.

## Coverage

The main suite uses a deterministic 120 Hz simulation clock in headed Chromium with SwiftShader. The managed test environment blocks direct file-URL navigation, so the exact built HTML is injected into a blank browser page. The live-smoke suite does not replace requestAnimationFrame: it observed a successful live return, pause and resume, without forcing simulation steps. It reached 3.2 simulated seconds in 11.094 wall seconds on the software renderer; this is **not a hardware or mobile FPS benchmark**.

| Scenario | Executed result |
| --- | --- |
| Rally, 120 simulated seconds | 32 feeds, 32 returns, 0 misses, 32 valid landings |
| Target, 45 simulated seconds | 12 feeds, 11 returns, 11 targets, 1,240 points |
| Endurance demo, 100 simulated seconds | 30 feeds, 30 returns; slice and base motions exercised |
| Manual control | Held full charge, release-to-hit, movement, no hidden auto-swing |
| Endurance failure | Three misses end the session; pause cannot revive it; restart restores lives |
| Motion studio | Four motions, multiple sampled poses, timeline, speed, orbit and rig controls |
| Replay | Live time/score do not advance; charging blocked; live ball and actor restored |
| About / settings | Pause state preserved across close/Escape, settings and audio toggle exercised |
| Responsive layout | 390×844, 844×390, 768×1024; real pointer events on HIT; no horizontal overflow |
| Character | 18 bones, 47,605 triangles; normalized skin weights, finite transforms, attached racket socket |

Visual inspection covered the hero, both base swing contacts, both derivatives, practice court, target mode, replay and evening lighting. The arm/shoulder weighting was corrected after inspecting extreme backhand poses. Shorts trim is part of the shorts surface, rather than a z-fighting overlay. The portrait power meter was moved between the thumb controls, away from the athlete.

Raw reports and actual screenshots are included in the offline source ZIP under `artifacts/`. The compact, reproducible record is `docs/validation-summary.json`. Test scripts are committed. This is local evidence, not a claim that GitHub CI has run.

## Remaining release gates

This is a public-play **release candidate**, not a universal release certification. Physical Android/iOS performance, Safari/Firefox, thermals, long-session memory behavior and exhaustive garment/body penetration checks have not been measured here. In particular, sparse source poses and two derivative motions remain the animation source; this pass does not claim a new complete mocap library or professional offline character asset.

The fresh-checkout `npm ci` / vendor compilation path is pinned and supplied but could not be executed with network access in this container. The provided cached-engine ZIP rebuild and final HTML were executed successfully. Full upstream BVH downloads are optional, are not bundled, and require retesting the contact timing after conversion.

## Repeat

```sh
node tools/build.mjs
node tools/verify.mjs
xvfb-run -a python tests/acceptance.py
xvfb-run -a python tests/live_smoke.py
```

A local Chromium executable, Python Playwright and Xvfb must be installed already. Set `CHROMIUM_PATH` to choose another Chromium installation. Reports include the exact HTML hash to prevent treating old test evidence as current.
