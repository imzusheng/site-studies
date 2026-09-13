# Court Study — Cypress Court

A self-contained Web tennis game with an original stylized athlete, a cypress-lined court, a motion studio, and last-shot replay. This study is independent of `../baseline-motion/`; it does not remove or rewrite the older game.

## Run

**Delivered offline HTML:** open `index.html` or `dist/court-study.html` in a WebGL2-capable desktop browser. No CDN, login, model download, or build step is involved. Settings are stored locally; gameplay data is not uploaded.

**Offline source ZIP:** `node tools/build.mjs`, then open the generated HTML. The cached engine is included.

**Fresh Git checkout:** the generated HTML and engine bundle are not committed. Install the pinned build dependencies once, cache the engine, then build:

```sh
cd court-study
npm ci
npm run vendor
npm run build
npm run verify
npm start
# http://127.0.0.1:5173
```

The dependency-install step needs network access; the delivered game and all subsequent builds from the cached ZIP do not. Node.js 20+ is required. A source-only checkout builds the same scene and gameplay from the reviewed source; byte-identical regeneration of the supplied engine bundle is not claimed.

## Controls

WASD / arrow keys move. Hold Space to charge and release to swing; a full charge stays full. Click the far court to aim, including beyond the lines. P pauses, R restarts, J replays the last completed shot, and Escape exits replay. Touch devices have a joystick and HIT button. Assisted movement is optional and does not automatically swing the racket in manual play.

The camera button toggles follow / wide framing. Settings contain three quality levels, two lighting environments, two outfits, and a reduced-motion option. Attribution and source information appear only in **About**.

## Included modes

- Free practice (Rally), target scoring, and three-life endurance.
- Four inspectable swings, slow playback, orbit controls, timeline scrubbing, and optional rig diagnostics.
- Previous-shot replay at half speed. The live ball, player pose, score and clock are restored when replay ends.

## What changed visually

The previous SDF/ellipsoid athlete is replaced by a lower-cost, custom skinned surface model with shaped shoulders, tapered limbs, fitted clothing, compact facial features, hair, fingers and tennis shoes. The recorded 18-joint rig is preserved. The venue adds cypress silhouettes, olive foliage, distant ridges, net and windscreen detailing, a clubhouse terrace, court textures, and layered lighting. A single presentation pass adds highlight compression, edge smoothing, restrained glow, and grain, with a non-HDR fallback.

The game is deliberately stylized, not photorealistic. This is a **1.0.0-rc1 candidate for public browser play**, not a claim of a completed AAA game or universal device certification. The browser evidence and remaining release gates are in `docs/VALIDATION.md`.

## Source layout

`src/athlete.js` generates the original skinned character once. `src/venue.js` generates and batches the environment. `src/presentation.js` owns the render target and final pass. `src/app.js` owns motion sampling, fixed-step simulation, interaction, replay and settings. `assets/motions.json.gz` is the committed source-derived motion pack; the build decodes it to `assets/motions.json` locally. `tools/build.mjs` assembles a single offline HTML.

No character/texture/font binary is needed by the source project. The offline ZIP also includes the prebuilt engine and screenshots. Generated artifacts are ignored in Git so the PR remains reviewable.

## Tests

```sh
npm run build
npm run verify
# A local Chromium, Python playwright and Xvfb must already be installed:
xvfb-run -a python tests/acceptance.py
xvfb-run -a python tests/live_smoke.py
```

The container tests use actual WebGL with SwiftShader, and inject the built HTML into a blank page because file-URL navigation is restricted by the managed test environment. The main tests advance a deterministic 120 Hz clock; live-smoke tests use the real animation loop. Neither method proves physical-phone FPS, battery/thermal behavior, or Safari compatibility.

## Motion provenance

The two base swings are sparse excerpts from Tennis-MoCap, not a newly acquired full motion pack. Reach and slice are programmatic derivatives. Original code is MIT; source-derived motion and rig data retain CC BY-SA 3.0. The complete attribution, modifications and source revision are in `licenses/TENNIS-MOCAP-NOTICE.md`, included in the game's About page.

The optional `node tools/cache-assets.mjs --dry-run` describes two pinned upstream BVH files. Running `--apply` needs an Internet-connected machine and changes the animation inputs, so contact/foot timing must be revalidated afterward. It is not executed by the game and is not part of this release's offline boot path.
