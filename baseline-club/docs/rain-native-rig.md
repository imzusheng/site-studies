# Rain native deformation adapter

The upgraded `assets/rain-pro.glb` starts from Blender Studio's Rain v3.3 download
(`rain_v3.2.blend`), not from the recovered 18-joint GLB. The source ZIP SHA-256 is
`80217f163f6392dc829233d63c2cfb5e1376775bc34101ad14f39631fea70d24`.

The exported skin retains 96 original deformation joints: segmented limbs, body
correctives, finger phalanges, and six hair joints. Eighteen unweighted compatibility
joints preserve the game's existing stroke, foot alignment and replay interfaces.
The facial expression remains static; face weights are merged into the head joint.
The source's 2,166 editor controls and unused facial controls are not shipped.

Native Blender FK controls drive the original constraint graph offline. Six
recorded Tennis-MoCap strokes are evaluated at their existing 50 Hz sample times.
The wrist and elbow targets receive bounded torso-clearance corrections during
retargeting. Those corrections preserve the recorded front/back side and blend
the elbow pole by penetration depth. The browser samples the baked transforms;
it does not run an unbounded collision solver or stretch an arm toward the ball.

The right fingers are posed around the real racket-handle diameter. The racket
is attached to the original hand deformation joint, with a calibrated local
position and orientation. The ponytail keeps four original bend joints in a
downward arc; the authoring horizontal rest pose is not used as the final hairstyle.
The serve wind-up and ready/locomotion layer also receive a bounded offline wrist
direction correction against three head/neck/torso exclusion cones. This rotates
the hand and fingers together; it does not swivel the racket independently.

The mesh uses the original vertex weights, clothing masks and UVs. Exposed skin,
face, shirt and hair receive one subdivision level with authoring quality drivers
disabled; shoes, jeans and mouth interiors retain their source density. Original
body/hair/eye/jeans texture maps are preserved, with three skin UDIM tiles packed
into an embedded atlas. The indexed GLB is approximately 9.84 MB and has
199,895 triangles. This is a stylized Blender Studio character, not a photorealistic
scanned athlete or an EA Sports FC asset.

## Rebuild

With the source unpacked to `.cache/rain-v3/Rain v3.3`, run:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' `
  -b '.cache/rain-v3/Rain v3.3/rain_v3.2.blend' `
  --python-use-system-env --python tools/export-rain-pro.py
node tools/build.mjs
```

The conversion requires Blender's NumPy and Pillow. Downloaded `.blend` Python
scripts remain disabled. `-- --bake-only` refreshes the motion JSON;
`-- --mesh-only` refreshes the GLB. If `assets/locomotion-source.json` exists, its
18-joint clips are also evaluated through the native rig.

The current package includes four Mesh2Motion locomotion clips in addition to the
six recorded strokes (617 total sampled poses). Runtime movement chooses forward
run, left/right strafe or backward steps from local velocity, changes clips with a
160 ms blend, and overlaps cycle boundaries by at most 100 ms. The Mesh2Motion
lower body is CC0; the combined ready upper-body adaptation retains the Tennis-MoCap
ShareAlike notice.

`tools/preview-rain-pro.py -- --grip` makes isolated front/palm grip views from
the native rig. These are diagnostic Blender previews; browser acceptance uses
the exported GLB in the action room. One static pose does not prove that every
frame has no intersection. Small contact overlaps can remain in two-handed strokes.

Blender Studio character attribution and its CC BY terms remain applicable.
Recorded-stroke derivatives retain the Tennis-MoCap CC BY-SA 3.0 notice in
`licenses/TENNIS-MOCAP-NOTICE.md`; see the in-game About page for the authors.
