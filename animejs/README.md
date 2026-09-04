# Luma Remote A3.40 — Anime.js Product Film

A scroll-directed industrial product film built with **Anime.js v4 + Three.js**.

This branch is not a CAD-viewer clone of animejs.com. The film keeps Luma Remote spatially legible while moving between product form, engineering structure, interaction, display feedback and compute-core inspection.

## Runtime

```text
DOM scroll
→ Anime.js onScroll({ sync: true })
→ one createTimeline() master film
→ numeric motion state + staggered keycap proxy tracks
→ Three.js scene / orbit camera / material blend
→ LCD-plane projection + SVG callouts
→ render
```

There is no second scroll-to-camera state machine and no frame-to-frame damping.

## Nine cinematic beats

1. **Hero** — establish the complete product.
2. **Stage** — the physical LCD projection grows into the presentation frame.
3. **Blueprint** — restrained system-level separation, five fixed labels.
4. **Form** — A3.40 exterior / EC11 clearance decision.
5. **Input** — camera enters the key region, then caps reveal Choc V2.
6. **Control** — Ø24 knob motion drives LCD feedback.
7. **Display** — screen plane becomes the visual datum.
8. **Compute** — service cover, board lift, local board flip, macro inspection.
9. **Final** — mechanisms close and the film returns to the finished product.

Each beat is long-form (`~165vh`) and the motion tracks begin/end across broad scroll spans rather than switching pose at section boundaries.

## A3.40 model truth

Source of truth: `luma-remote` PR #31 / merge `48bd3ea`.

A3.40 is intentionally a small exact mechanical delta on top of the frozen A3.32 R2 envelope + PR #30 keycaps:

- envelope remains `120 × 81 mm`;
- screen / bezel position remains frozen;
- EC11 center remains `(0, -19.5)`;
- cosmetic knob well changes `Ø30 → Ø26 mm`;
- knob OD changes `Ø26 → Ø24 mm`;
- PR #30 PETG icon keycap proportions are inherited.

PR #31 intentionally **does not commit 231 generated loose STL files**. This site therefore keeps the already-vendored frozen assembly meshes and applies the visible A3.40 exterior delta in the Web scene:

- the rotary knob mesh is scaled to Ø24;
- the Ø30→Ø26 recovered cosmetic-well annulus is materialized as an A3.40 shell patch in the sloped deck plane;
- keycaps are adapted to the PR #30 `17 × 15 × 5 mm` presentation proportions and receive the six product glyphs;
- unchanged screen, enclosure datums, Choc hardware and ESP32 reference geometry remain the frozen source assets.

The 231-object electronics model in PR #31 is presentation/reference truth rather than manufacturing truth; this film keeps the existing high-detail ESP32 reference mesh for the Compute shot instead of copying 220 generated reference STL files into `site-studies`.

Concrete source IDs are isolated to `js/model-profile.js`; choreography only works with semantic product roles.

## Development

```bash
cd animejs
npm install
npm run dev
```

Validation:

```bash
npm run build
npm run validate
```

`npm run validate` checks the A3.40 contract, nine-beat film structure, deterministic timeline evaluation, camera motion spikes/direction changes, semantic role resolution, callout limits and the absence of the old shot-state driver.

## Stack

- Vanilla HTML / CSS / ESM
- Anime.js `4.5.0`
- Three.js (vendored existing runtime)
- STLLoader
- SVG 3D→2D overlays
- CanvasTexture LCD UI
- Vite
