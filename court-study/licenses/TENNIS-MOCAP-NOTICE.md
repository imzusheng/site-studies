# Tennis-MoCap — attribution and modification notice

**Source:** https://github.com/jdpulgarin/Tennis-MoCap  
**Pinned revision:** `9af88bb4df4e78b22127719744fdca993ced2733`  
**Author's license notice:** https://github.com/jdpulgarin/Tennis-MoCap/blob/9af88bb4df4e78b22127719744fdca993ced2733/Copyright.md  
**License:** Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0).  
**License summary:** https://creativecommons.org/licenses/by-sa/3.0/  
**Legal code:** https://creativecommons.org/licenses/by-sa/3.0/legalcode

Upstream requests the following citation when publishing results using the data:

Pulgarin-Giraldo J.D., Alvarez-Meza A.M., Melo-Betancourt L.G.,
Ramos-Bermudez S., Castellanos-Dominguez G. A Similarity Indicator for
Differentiating Kinematic Performance Between Qualified Tennis Players.
Lecture Notes in Computer Science (including subseries Lecture Notes in
Artificial Intelligence and Lecture Notes in Bioinformatics), 10125 LNCS,
pp. 309–317, 2017. https://doi.org/10.1007/978-3-319-52277-7_38

## Files actually included

- `assets-source/forehand-samples.txt`: 11 verbatim numeric channel rows sampled
  from `data/lvargas_Derecha_4seg.bvh`. First column adds the zero-based source
  frame index. Upstream contains 479 frames at 100 Hz.
- `assets-source/backhand-samples.txt`: 7 such rows from
  `data/adorozco_Reves_8seg.bvh`. Upstream contains 795 frames at 100 Hz.
- `assets-source/rig.json`: hierarchy/offsets adapted to the source skeleton,
  with a uniform scale of 0.0115 applied for the training character.
- `assets/motions.json`: derived quaternion tracks. Coordinate heading was
  normalized, source positions scaled, root horizontal origin reset, and
  quaternion signs made continuous. The bundled clips use sparse poses.
- `src/athlete.js`: the mesh generator itself is original MIT-licensed code;
  it binds an original character mesh to the attributed source rig at runtime.
  The adapted rig and motion data remain CC BY-SA 3.0. It is not a model or
  likeness of either captured player.

The adapted motion data, rig data, and derivative animations remain CC BY-SA 3.0. This does not replace the separate MIT
license of the application code. Preserve attribution, a license reference,
modification notices, and the applicable ShareAlike terms when distributing
these adapted assets. Do not impose additional restrictions that prevent
exercise of the granted rights. The license text, not this summary, controls.

## Runtime modifications

Playback interpolates quaternions; animation timing is adapted to the practice
system. The left hand receives a limited two-bone grip correction on the
backhand. Foot grounding and root translation are presentation/gameplay
adjustments, not corrections supplied by the original dataset authors.
The reach and slice animations are programmatic adaptations of the two base clips, not additional independent recordings. The racket is an original unbranded model, not a recorded racket trajectory.
No claim of author endorsement is made.

## Cache limitation

The full upstream BVH files are NOT included in the initial delivery.
`node tools/cache-assets.mjs --apply` is provided to retrieve and verify the two
pinned source files on an Internet-connected machine. This operation is
explicit and never runs automatically in the game.
