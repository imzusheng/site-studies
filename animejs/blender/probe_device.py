"""Probe: render one small frame, print device enumeration and chosen device."""
import bpy, os, json
from pathlib import Path

print('PROBE_PID:', os.getpid())

base = Path(__file__).resolve().parent
scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
bpy.context.window.scene = scene

prefs = bpy.context.preferences.addons['cycles'].preferences
avail = {x.identifier for x in prefs.bl_rna.properties['compute_device_type'].enum_items}
print('PROBE_AVAILABLE_DEV_TYPES:', sorted(avail))
for dev_type in ('OPTIX', 'CUDA', 'METAL'):
    if dev_type in avail:
        prefs.compute_device_type = dev_type
        print('PROBE_SET_DEV_TYPE:', dev_type)
        break
prefs.get_devices()
for d in prefs.devices:
    print('PROBE_DEVICE:', d.type, '|', d.name)
gpu = False
for d in prefs.devices:
    d.use = d.type != 'CPU'
    gpu |= d.use
scene.cycles.device = 'GPU' if gpu else 'CPU'
print('PROBE_CHOSEN:', scene.cycles.device)

scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.cycles.samples = 32
scene.frame_set(1)
out = base.parent / 'renders' / 'probe.png'
scene.render.filepath = str(out)
bpy.ops.render.render(write_still=True)
print('PROBE_DONE:', out)
