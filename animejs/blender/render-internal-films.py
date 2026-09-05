"""blender -b blender/luma-a344-internal-films.blend --python blender/render-internal-films.py -- support|interior [--preview]"""
import bpy,sys
from pathlib import Path
BASE=Path(__file__).resolve().parent
args=sys.argv[sys.argv.index('--')+1:];kind=args[0]
s=next(s for s in bpy.data.scenes if s.name.startswith('Luma A3.44 '+kind.title()+' Film'));bpy.context.window.scene=s
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type!='CPU'
s.cycles.device='GPU';out=BASE.parent/'renders/production'/kind;out.mkdir(parents=True,exist_ok=True)
if '--preview' in args:
    s.render.resolution_x=960;s.render.resolution_y=540;s.cycles.samples=24;s.frame_set(1);s.render.filepath=str(out/'preview_0001.png');bpy.ops.render.render(write_still=True,scene=s.name)
else:s.render.filepath=str(out/'frame_');bpy.ops.render.render(animation=True,scene=s.name)
