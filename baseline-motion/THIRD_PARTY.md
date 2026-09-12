# Third-party references / 第三方资源

## Three.js

- Library: Three.js `0.180.0` (pinned).
- Repository: https://github.com/mrdoob/three.js
- Runtime CDN candidates: https://cdn.jsdelivr.net/npm/three@0.180.0/ and https://unpkg.com/three@0.180.0/
- Loader utilities: GLTFLoader, DRACOLoader, SkeletonUtils.clone.
- Upstream library license: MIT; retain the bundled license notices in local builds.
- Draco decoder files are copied from the installed Three.js package with their included notices.

## Reference human

Runtime candidates, also listed in `src/human.ts` and `tools/download-assets.mjs`:

1. https://threejs.org/examples/models/gltf/Michelle.glb
2. https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/models/gltf/Michelle.glb
3. https://raw.githubusercontent.com/mrdoob/three.js/r180/examples/models/gltf/Michelle.glb

This is a reference skinned character used by Three.js examples. It is not a tennis motion-capture pack, custom commissioned athlete, or GTA V asset. The model binary was not successfully retrieved in this execution environment and is not included in this ZIP. Availability and final rendering were not verified.

Do not assume the repository's library license automatically clears every example model for every commercial use. Confirm the specific asset provenance and intended distribution terms before shipping a commercial product. No proprietary game assets have been extracted or distributed.

## Locally selected models

Use a GLB you have permission to use, with a compatible Mixamo skeleton, rest/bind pose, and textures embedded in the file. Required bone names after removing the Mixamo prefix include hips, spine, arms, forearms, hands, upper legs, legs, feet and toe bases. Detailed finger bones improve grip pose but do not automatically calibrate every hand mesh. Custom models still require visual adjustment and verification.
