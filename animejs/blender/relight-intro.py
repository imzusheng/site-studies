"""Ramp the intro lights with the recline: rim first, fill next, key rises last.

The ceiling key also sweeps in from a low rear angle, so the light appears to
rise over the product as it lies down. All curves are quadratic ease-out.
Final energies are hard-coded so the script stays idempotent.
"""
import bpy

from pathlib import Path

FILE = bpy.data.filepath

FINAL_ENERGY = {
    'Wide warm ceiling': 7.5,
    'Cool side bounce': 1.1,
    'Broad front fill': 0.45,
}


def ease_out(t):
    return 1 - (1 - t) ** 2


def ramp(obj, start, end, initial, final, data_path='energy'):
    data = obj.data if data_path == 'energy' else obj
    attr = data_path
    if data.animation_data:
        data.animation_data_clear()
    if start > 1:
        setattr(data, attr, initial)
        data.keyframe_insert(data_path=attr, frame=1)
    for f in range(start, end + 1):
        t = (f - start) / (end - start)
        setattr(data, attr, initial + (final - initial) * ease_out(t))
        data.keyframe_insert(data_path=attr, frame=f)
    print({'obj': obj.name, 'path': attr, 'final': final, 'window': [start, end]})


scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
lamps = {o.name.split('.')[0]: o for o in scene.objects if o.type == 'LIGHT'}

# camera-side boost light: lights the upright display early, fades as it lies down
import mathutils
boost = next((o for o in scene.objects if o.name.startswith('Intro front boost')), None)
if boost is None:
    light = bpy.data.lights.new('Intro front boost', 'AREA')
    light.size = 0.18
    boost = bpy.data.objects.new('Intro front boost', light)
    boost.location = (0.0, -0.18, 0.10)
    direction = mathutils.Vector((0.0, 0.0, 0.02)) - mathutils.Vector(boost.location)
    boost.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(boost)


def ramp_fade(obj, peak, rise_end, fade_end, initial=0.0):
    data = obj.data
    if data.animation_data:
        data.animation_data_clear()
    for f in range(1, 151):
        if f <= rise_end:
            t = (f - 1) / max(rise_end - 1, 1)
            data.energy = initial + (peak - initial) * ease_out(min(t, 1.0))
        elif f <= fade_end:
            t = (f - rise_end) / (fade_end - rise_end)
            data.energy = peak * (1.0 - t)
        else:
            data.energy = 0.0
        data.keyframe_insert('energy', frame=f)
    print({'boost': obj.name, 'peak': peak, 'rise': rise_end, 'fade': fade_end})


ramp_fade(boost, 1.2, 30, 105)

# silhouette rim first
ramp(lamps['Cool side bounce'], 1, 40, 0.15, FINAL_ENERGY['Cool side bounce'])
# frontal fill follows the recline
ramp(lamps['Broad front fill'], 1, 60, 0.2, FINAL_ENERGY['Broad front fill'])
# key light blooms last
ramp(lamps['Wide warm ceiling'], 10, 80, 0.0, FINAL_ENERGY['Wide warm ceiling'])

# ceiling sweeps in from a low rear angle while brightening
ceiling = lamps['Wide warm ceiling']
home = (-0.03, 0.095, 0.075)
far = (-0.06, 0.32, 0.045)
if ceiling.animation_data is None:
    pass  # energy fcurve lives on light data; location lives on object
loc_anim = ceiling
if loc_anim.animation_data and loc_anim.animation_data.action and any(
        fc.data_path == 'location' for layer in loc_anim.animation_data.action.layers
        for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves):
    print({'sweep': 'already animated'})
else:
    for f in range(40, 141):
        t = (f - 40) / 100
        u = ease_out(t)
        ceiling.location = [far[i] + (home[i] - far[i]) * u for i in range(3)]
        ceiling.keyframe_insert('location', frame=f)
    print({'sweep': [far, home]})
bpy.ops.wm.save_as_mainfile(filepath=FILE, compress=True)
print({'saved': FILE})
