"""blender --background luma-a343-studio.blend --python render.py -- core [--preview]"""
import bpy, sys, json
from pathlib import Path

base=Path(__file__).resolve().parent
args=sys.argv[sys.argv.index('--')+1:]
kind=args[0] if args else 'core'
prefix=('Luma Color '+kind.removeprefix('color-').title()) if kind.startswith('color-') else {'intro':'Luma Intro Film','core':'Luma Core Portrait','switch':'Luma Switch Portrait','craft':'Luma Craft Portrait','chassis':'Luma Chassis Portrait'}[kind]
scene=next(s for s in bpy.data.scenes if s.name.startswith(prefix))
bpy.context.window.scene=scene
prefs=bpy.context.preferences.addons['cycles'].preferences
gpu_type=None
for dev_type in ('OPTIX', 'CUDA', 'HIP', 'METAL'):
    try:
        prefs.compute_device_type=dev_type
        gpu_type=dev_type
        break
    except TypeError:
        pass
prefs.get_devices()
gpu=False
for d in prefs.devices:
    d.use=d.type!='CPU';gpu |= d.use
scene.cycles.device='GPU' if gpu else 'CPU'
print(json.dumps({'device_type':gpu_type,'active_devices':[d.name for d in prefs.devices if d.use]}))
out=base.parent/'renders'/'production'/kind
if '--draft' in args:
    out=base.parent/'renders'/'drafts'/kind
    scene.render.resolution_x=640
    scene.render.resolution_y=360
    scene.cycles.samples=8
    scene.cycles.use_denoising=False
out.mkdir(parents=True,exist_ok=True)
if '--preview' in args:
    frames=[1] if scene.frame_end==1 else [1,scene.frame_end//2,scene.frame_end]
    for frame in frames:
        scene.frame_set(frame);scene.render.filepath=str(out/f'preview_{frame:04d}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
else:
    scene.render.filepath=str(out/'frame_')
    bpy.ops.render.render(animation=True,scene=scene.name)
print(json.dumps({'scene':scene.name,'device':scene.cycles.device,'frames':[scene.frame_start,scene.frame_end],'output':str(out)}))
