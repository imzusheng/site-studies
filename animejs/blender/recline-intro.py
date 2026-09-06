"""Recline the product: upright facing the camera at frame 1, flat by frame 150.

Each intro-scene mesh gets its world matrix keyed per frame: rotation about
the front-bottom-edge hinge (0, -0.0405, 0) m from +90 deg (display facing the
lens) down to 0 deg (flat on the desk), quadratic ease-out. Runs only on a
clean baseline (pre-recline backup) and self-checks the recovered scale at
frame 150 before saving.
"""
import bpy
import math

from mathutils import Matrix, Vector

FILE = bpy.data.filepath
HINGE = Vector((0.0, -0.0405, 0.0))  # front bottom edge, metres

scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
bpy.context.window.scene = scene
scene.frame_set(1)

meshes = [o for o in scene.objects if o.type == 'MESH']

orig = {}
for o in meshes:
    if o.animation_data:
        o.animation_data_clear()
    orig[o.name] = o.matrix_world.copy()

probe = meshes[0]
probe_scale = tuple(round(v, 5) for v in probe.matrix_world.to_scale())
assert all(abs(v - 0.001) < 1e-6 for v in probe.matrix_world.to_scale()), \
    f'unexpected scale on {probe.name}: {probe_scale}'


def rot_about(pt, deg):
    return (Matrix.Translation(pt)
            @ Matrix.Rotation(math.radians(deg), 4, 'X')
            @ Matrix.Translation(-pt))


for f in range(1, 151):
    t = (f - 1) / 149
    u = 1 - (1 - t) ** 2
    theta = 90.0 * (1.0 - u)  # +90 = display facing the lens, 0 = flat
    M = rot_about(HINGE, theta)
    for o in meshes:
        o.matrix_world = M @ orig[o.name]
        o.keyframe_insert('location', frame=f)
        o.keyframe_insert('rotation_euler', frame=f)

scene.frame_set(150)
final_scale = tuple(round(v, 5) for v in probe.scale)
assert all(abs(v - 0.001) < 1e-6 for v in probe.scale), \
    f'scale corrupted after keying: {final_scale}'
scene.frame_set(1)
upright_z = max((probe.matrix_world @ Vector(c)).z for c in probe.bound_box)
print({'keyed': len(meshes), 'probe_scale': final_scale,
       'frame1_upright_max_z': round(upright_z, 4)})
bpy.ops.wm.save_as_mainfile(filepath=FILE, compress=True)
print({'saved': FILE})
