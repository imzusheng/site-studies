"""blender --background luma-a343-studio.blend --python render.py -- core [--preview]"""
import bpy, sys, json
from pathlib import Path

base=Path(__file__).resolve().parent
args=sys.argv[sys.argv.index('--')+1:]
kind=args[0] if args else 'core'
prefix={'intro':'Luma Intro Film','core':'Luma Core Portrait','switch':'Luma Switch Portrait','craft':'Luma Craft Portrait'}[kind]
scene=next(s for s in bpy.data.scenes if s.name.startswith(prefix))
bpy.context.window.scene=scene
prefs=bpy.context.preferences.addons['cycles'].preferences
if 'METAL' in {x.identifier for x in prefs.bl_rna.properties['compute_device_type'].enum_items}:
    prefs.compute_device_type='METAL'
prefs.get_devices()
gpu=False
for d in prefs.devices:
    d.use=d.type!='CPU';gpu |= d.use
scene.cycles.device='GPU' if gpu else 'CPU'
out=base.parent/'renders'/'production'/kind
out.mkdir(parents=True,exist_ok=True)
if '--preview' in args:
    frames=[1] if kind=='craft' else [1,scene.frame_end//2,scene.frame_end]
    for frame in frames:
        scene.frame_set(frame);scene.render.filepath=str(out/f'preview_{frame:04d}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
else:
    scene.render.filepath=str(out/'frame_')
    bpy.ops.render.render(animation=True,scene=scene.name)
print(json.dumps({'scene':scene.name,'device':scene.cycles.device,'frames':[scene.frame_start,scene.frame_end],'output':str(out)}))
