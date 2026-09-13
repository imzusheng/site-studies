# Additional community assets

Rain Rig (CC) Blender Foundation | studio.blender.org

Snow Rig (CC) Blender Foundation | studio.blender.org

Official sources: https://studio.blender.org/characters/rain/v3/ and https://studio.blender.org/characters/snow/v4/ . Character license: CC BY 4.0, https://creativecommons.org/licenses/by/4.0/ .

This version exports the original body skin weights and selected native deformation bones, merges static facial weights into the head, selects subdivision levels, packs texture UDIMs, changes materials, poses fingers for a racket, bends Rain's ponytail, and retargets recorded motion through the source FK/constraint graph. These are adaptations, not the original production rigs and not endorsed by Blender Foundation. Refer to the character-specific documents in `docs/`.

## Mesh2Motion

Source: https://github.com/Mesh2Motion/mesh2motion-app

Asset: `static/animations/human-addon-animations.glb`

License: CC0-1.0, https://github.com/Mesh2Motion/mesh2motion-app/blob/main/LICENSE-CC0.MD

Used clips: `Run_Female`, `Strafe_left`, `Strafe_right`, `Walk_Backwards`. Adaptation removes horizontal root travel, retargets lower-body rotations, and combines them with a Tennis-MoCap ready pose in the upper body. The combined motion JSON and native-rig motion bake retain CC BY-SA 3.0 because of that upper-body source. The original Mesh2Motion material remains CC0.

## Poly Haven

CC0-1.0: https://polyhaven.com/license

- Green Point Park HDRI by Greg Zaal and Rico Cilliers: https://polyhaven.com/a/green_point_park . Used for image-based light and background; 2K HDR embedded.
- Sparse Grass by Amal Kumar: https://polyhaven.com/a/sparse_grass . Diffuse and OpenGL normal map; 1K JPEGs tiled on the ground.

No paid assets or accounts are required for these resources. Source URLs and hashes are recorded in `assets-source/community-assets.json`. Three.js and Tennis-MoCap notices remain in the adjacent license files and the in-game About page.
