"""Rewrite the intro-film camera to a low, iPhone-style grazing angle.

Keeps the shot rhythm (close-up -> pull back) and the 100 mm / f22 lens;
only the camera path elevation and pitch change. Aim target is the product
centre slightly above the base plane so the top surface reads.
"""
import bpy
import sys
from mathutils import Vector

FILE = bpy.data.filepath

# y: -0.25 -> -0.40 m (pull back), z: 0.050 -> 0.070 m (low, just above the 0.030 m top)
Y0, Y1 = -0.22, -0.30
Z0, Z1 = 0.075, 0.197
TARGET = Vector((0.0, -0.005, 0.020))

scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
cam = scene.camera
ad = cam.animation_data
action = ad.action
handle = ad.action_slot.handle
paths = {}
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            if bag.slot_handle != handle:
                continue
            for fc in bag.fcurves:
                if fc.data_path in ('location', 'rotation_euler'):
                    paths.setdefault(fc.data_path, {})[fc.array_index] = fc

loc = paths['location']
rot = paths['rotation_euler']
frames = [int(kp.co[0]) for kp in loc[1].keyframe_points]
n = len(frames)
print({'keyframes': n, 'frames': [frames[0], frames[-1]]})

x1 = 0.0  # stay on the centre plane: no lateral drift, subject stays centred
for kp_x, kp_y, kp_z, kp_rx, kp_ry, kp_rz, f in zip(
        loc[0].keyframe_points, loc[1].keyframe_points, loc[2].keyframe_points,
        rot[0].keyframe_points, rot[1].keyframe_points, rot[2].keyframe_points, frames):
    t = (f - frames[0]) / (frames[-1] - frames[0])
    u = 1 - (1 - t) ** 2  # quadratic ease-out: velocity decays linearly to zero, no overshoot
    x = x1
    y = Y0 + (Y1 - Y0) * u
    z = Z0 + (Z1 - Z0) * u
    kp_x.co[1] = x
    kp_y.co[1] = y
    kp_z.co[1] = z
    e = (TARGET - Vector((x, y, z))).to_track_quat('-Z', 'Y').to_euler()
    kp_rx.co[1] = e.x
    kp_ry.co[1] = e.y
    kp_rz.co[1] = e.z

dof = cam.data.dof
print({'dof_object': dof.focus_object.name if dof.focus_object else None,
       'focus_distance': round(dof.focus_distance, 4), 'use_dof': dof.use_dof})
bpy.ops.wm.save_as_mainfile(filepath=FILE, compress=True)
print({'saved': FILE})
