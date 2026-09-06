"""Give the intro framing static headroom: drop the orphaned shift_y anim, set a static camera shift."""
import bpy

FILE = bpy.data.filepath
SHIFT = 0.20

scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
cam = scene.camera
ad = cam.animation_data
removed = 0
for layer in ad.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for fc in list(bag.fcurves):
                if fc.data_path == 'shift_y':
                    bag.fcurves.remove(fc)
                    removed += 1
cam.data.shift_y = SHIFT
print({'removed_fcurves': removed, 'static_shift_y': cam.data.shift_y})
bpy.ops.wm.save_as_mainfile(filepath=FILE, compress=True)
print({'saved': FILE})
