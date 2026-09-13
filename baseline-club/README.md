# Baseline Club — Web Tennis

Baseline Club is a self-contained browser tennis game rather than a motion demo. It combines game-ready adaptations of Blender Studio characters, six recorded tennis strokes, a deterministic ball simulation, contact-driven shot output, optional player assists and three opponent profiles.

The delivered `index.html` / `dist/baseline-club.html` embeds the runtime engine, both characters and motion data. It does not fetch a CDN, font, model or analytics endpoint at runtime.

## What is implemented

### Match and training

- Three opponents with visibly different profiles: **Rowan** (steady baseline), **Kai** (power attacker) and **Noa** (tactician).
- 7-point club practice match, win by two. This is intentionally not a complete professional tennis scoring/serve system.
- Ball-machine practice, target challenge and endurance training remain available.
- Balls that are missed or finish a point remain physical objects: they continue bouncing/rolling and are retired later instead of disappearing on miss.

### Shot model

The default **Physics-derived** mode does not take a desired landing point. Outgoing velocity and spin are computed from incoming velocity/spin, stroke type, contact timing, lateral contact error, contact height, charge/power, balance, movement and stance. Flight then uses gravity, quadratic-ish drag, a bounded Magnus term, net interaction, court bounce and perimeter collision.

An explicit **Manual target** mode remains available as a separate setting. It chooses initial launch state before the ball flies; the game never steers the ball in mid-flight toward the selected point.

### Independent assists

- assisted positioning / auto movement
- timing assist
- predicted first bounce
- recommended player position
- incoming trajectory preview
- contact-window cue

The recommendation is guidance, not a floor-circle hit requirement.

### Difficulty

`easy`, `club`, and `pro` alter feed/opponent pace, width, depth, spin, AI reaction scaling, player movement allowance, timing window and reach tolerance. Gravity is fixed at 9.81 m/s².

## Character and animation pipeline

The old procedural primitive athlete is no longer the production character. The game uses adapted **Rain v3** and **Snow v4** characters from Blender Studio. Their artist-authored topology, UVs and selected textures are retained while production controls are reduced to a browser-friendly 18-joint deformation rig. Hands are adapted for a racket grip; the original film rigs' full facial/corrective feature set is not claimed to be preserved.

Six recorded Tennis-MoCap sources are cached locally: forehand, backhand, forehand volley, backhand volley, serve and smash. Single-stroke segments are baked at approximately 50 Hz. Reach and slice are derived variants; locomotion is programmatic support rather than a seventh/eighth mocap recording.

## Run and rebuild

Open the delivered HTML directly, or serve the project locally:

```bash
node tools/serve.mjs
# http://127.0.0.1:5173
```

Rebuild from the already cached project:

```bash
node tools/build.mjs
node tools/verify.mjs
```

Potentially long-running tests are explicitly bounded:

```bash
node tools/run-bounded.mjs 180000 xvfb-run -a python tests/acceptance.py
```

Node.js 20+ is expected. The committed source project does not require GitHub Actions to build or test.

## Project policy

`AGENTS.md` records two non-negotiable maintenance constraints: do not add/edit/run GitHub Actions unless the user explicitly requests it, and always put explicit timeouts around potentially long-running commands.

## Validation

Current delivered candidate: **2.0.0-rc2**. Browser acceptance currently passes 41/41 checks. Additional behavior and live-loop smoke checks are summarized in `docs/VALIDATION.md` and `docs/validation-summary.json`. Software-rendered Chromium tests are evidence of browser correctness, not physical-phone FPS or thermal certification.

## Licensing

Player-facing credits are intentionally centralized under **About**. Source-level notices remain in `licenses/` and `THIRD_PARTY_ASSETS.md`.

- Rain Rig / Snow Rig — Blender Foundation / Blender Studio — CC BY 4.0.
- Tennis-MoCap source motion and adaptations — CC BY-SA 3.0.
- Three.js — MIT.
- Original Baseline Club application code — MIT, excluding separately licensed source assets.
