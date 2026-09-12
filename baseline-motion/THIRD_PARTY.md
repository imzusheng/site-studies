# Third-party resources

## Default build

Three.js 0.180.0 is pinned in package-lock.json and bundled at build time. Includes MarchingCubes, BufferGeometryUtils, GLTFLoader/DRACOLoader and SkeletonUtils from the same package. MIT notice is retained in `LICENSE-THREE.txt`.

The default athlete, rig curves, court geometry and material setup are original procedural content in `src/athlete.ts`, `src/avatar.ts`, `src/human.ts` and `src/club.ts`. No GTA assets, professional motion-capture pack, copyrighted player likeness, external font or downloaded character textures are used by the default runtime. Neither a scan nor measured biomechanical reproduction is claimed.

## Preserved legacy assets

The user's existing cached Michelle.glb and Draco files have not been modified or removed from the repository. The default build no longer requests them. Their presence in the original repository is not a representation that the Three.js library MIT license automatically clears every example model for commercial distribution. Check asset-specific provenance before any commercial use.

The optional legacy loader and local GLB import require a compatible Mixamo-style rig and asset permission. They have not been calibrated or visually validated by this change.

## Motion / scale references

Public educational and original research links are documented in `MOTION_FIX.md`. These sources inform direction and proportions only; no source animations or branded racquet models are copied into the game.
