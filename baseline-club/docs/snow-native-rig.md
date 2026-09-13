# Snow native deformation adapter

`assets/snow-pro.glb` is derived from Blender Studio's original Snow v4 archive,
using `Snow/snow_v4.2.blend`. The verified source archive is 111,580,346 bytes;
its SHA-256 is
`98d58ef3a07083ede14140bc462cccb55d317062846aa0eb652d2e4a7ac422a6`.
The official download recorded in the recovered artist receipt is
<https://studio.blender.org/download-source/files/ba/0f/ba0fe6d810333b1d73c1c359e4dc03cb-6.zip>.

The runtime skin retains 69 original deformation bones, including the original
segmented upper arms, forearms, wrists, finger phalanges, pelvis and hip center.
Eighteen unweighted compatibility bones preserve the existing game interfaces.
The source has 1,494 authoring bones; unused controls and the facial rig are not
included. The face remains static, with its skin weights consolidated to the
head. Each vertex retains its strongest four source influences, normalized.

The adapter evaluates Snow's native FK controls and deformation constraints
offline. Snow's correct body master is `TORSO-Spine`; driving the lower `Spine`
control as a master stretches its torso and is deliberately avoided. The baked
transforms retain Snow's original anatomical proportions. Continuous, bounded
offline wrist/elbow clearance corrections use the same method as the Rain
adapter. The browser reads the baked transforms without running this solver.

The serve, backhand contact region and four locomotion clips receive a bounded offline
wrist-direction correction when the racket points through the head, neck or
torso reference cones. The actual wrist and its finger bones rotate together;
the racket socket position and orientation remain fixed. The opening forehand
ready pose receives the same correction, fading out between 0.08 and 0.22 seconds.
The backhand adjustment fades in and out around its contact marker; the recorded
two-handed wind-up retains its wrist direction to avoid an abrupt direction flip.
This addresses the reviewed face/neck overlap without claiming collision-free
motion in every frame. At the reviewed Snow backhand sample (0.92 seconds),
the nearest racket-rim distance to the head reference point increased from
0.160 to 0.204 m. The four movement clips' opening ready poses increased from
0.055 to 0.301 m; the already-clear serve sample stayed unchanged. These are
repeatable rig probes, not measured skin clearance or browser screenshot proof.

The original clothing masks and render UV maps are retained. Body, head, shirt,
pants and hair receive one subdivision level; shoes and static mouth details
retain their source topology. Snow's source simplify setting is disabled during
mesh extraction so it cannot silently override this subdivision. The three skin
UDIM tiles form one embedded atlas. Original skin, hair, eyes, shirt, pants and
shoe diffuse textures are included. Lip material variants use the same authored
skin atlas instead of a fallback gray material.

Current export: 7,862,820 bytes, 141,160 triangles, 95,777 indexed vertices,
15 meshes and 12 materials. `assets/snow-motions.json` contains ten clips and
617 sampled frames: six tennis strokes and four locomotion clips. Numeric
validation is recorded in `.cache/snow-validation.json`; maximum skin-weight
sum error is below `5.1e-8`. This validates the asset data and does not replace
the running game's full-motion and grip visual review.

## Rebuild

With the verified archive extracted to `.cache/snow-v4/Snow`, run from the
project directory:

```powershell
node tools/run-bounded.mjs 240000 `
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' `
  --python-use-system-env --disable-autoexec `
  -b '.cache/snow-v4/Snow/snow_v4.2.blend' `
  --python-exit-code 1 --python tools/export-snow-pro.py
```

The script requires NumPy and Pillow in Blender's Python environment. Downloaded
Blender scripts remain disabled. Add `-- --bake-only` to refresh motion data or
`-- --mesh-only` to refresh the GLB. When `assets/locomotion-source.json` is present,
its four 18-bone source clips are also baked through Snow's original rig.
The runtime right-hand socket attaches to `DEF-Wrist.R`; the common professional
socket defaults can be overridden per character through `professionalRig`.

## Attribution and licenses

**Snow Rig (CC) Blender Foundation | studio.blender.org**

Snow character geometry, textures and rig adaptations retain Blender Studio's
CC BY 4.0 terms. The authoring source is available from
<https://studio.blender.org/characters/snow/v4/>. The adapted asset preserves
the source author credit; this export is not the full Blender production rig.

The six recorded tennis strokes and their adaptations retain Tennis-MoCap's
CC BY-SA 3.0 terms and attribution in `licenses/TENNIS-MOCAP-NOTICE.md`.
The movement source is Mesh2Motion's CC0-1.0 animation library
(<https://github.com/Mesh2Motion/mesh2motion-app>), source GLB SHA-256
`a0d64d555e0d492026b72d58bf8e16c5e86779295f9093e376dcc001915c2c95`.
The combined locomotion clips use a Tennis-MoCap ready upper-body layer, so their
adaptation remains CC BY-SA 3.0 as recorded in `assets/locomotion-source.json`.
The character and motion licenses remain distinct.
