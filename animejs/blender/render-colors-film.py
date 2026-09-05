"""blender -b blender/luma-a344-colors.blend --python blender/render-colors-film.py -- [--preview]"""
import bpy, sys
from pathlib import Path
BASE=Path(__file__).resolve().parent
scene=next(s for s in bpy.data.scenes if s.name.startswith('Luma A3.44 Three Colors Film'))
bpy.context.window.scene=scene
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for device in prefs.devices:device.use=device.type!='CPU'
scene.cycles.device='GPU'
out=BASE.parent/'renders/production/colors';out.mkdir(parents=True,exist_ok=True)
if '--preview' in sys.argv:
    scene.render.resolution_x=960;scene.render.resolution_y=540;scene.cycles.samples=24
    scene.frame_set(1);scene.render.filepath=str(out/'preview_0001.png');bpy.ops.render.render(write_still=True,scene=scene.name)
else:
    scene.render.filepath=str(out/'frame_');bpy.ops.render.render(animation=True,scene=scene.name)
