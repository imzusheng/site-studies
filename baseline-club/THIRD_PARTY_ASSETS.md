# Third-party content

The sole player-facing attribution surface is **About** inside the game. This file is the source-project ledger.

| Content | Source | License | Included |
| --- | --- | --- | --- |
| Rain v3 game adaptation | Blender Studio / Blender Foundation | CC BY 4.0 | `assets/characters/rain.glb` |
| Snow v4 game adaptation | Blender Studio / Blender Foundation | CC BY 4.0 | `assets/characters/snow.glb` |
| Forehand, backhand, forehand volley, backhand volley, serve, smash motion | `jdpulgarin/Tennis-MoCap` | CC BY-SA 3.0 | six cached BVH sources + `assets/motions.json` |
| Three.js 0.180.0 | three.js authors | MIT | `vendor/three.bundle.js` |

The Rain/Snow adaptations retain artist geometry/UVs and selected texture content while simplifying the production rigs into the game deformation rig. See `licenses/BLENDER-STUDIO.md` and `assets-source/*-export.json`.

Tennis-MoCap full BVH inputs are cached under `assets-source/full/`; `assets-source/motion-receipts.json` records source hashes and selected segments. Reach and slice are runtime/programmatic derivatives, not additional recordings. See `licenses/TENNIS-MOCAP-NOTICE.md`.

No proprietary tennis-brand models, copyrighted broadcast clips, commercial mocap packs, remote fonts or CDN assets are required by the delivered game.
