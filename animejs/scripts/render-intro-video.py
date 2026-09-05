"""Render the Blender MCP-authored scene, using Metal where available."""
import bpy, sys, os, time
scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
bpy.context.window.scene = scene
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'
prefs.get_devices()
gpu = False
for device in prefs.devices:
    device.use = device.type == 'METAL'
    gpu |= device.use
    print('DEVICE', device.name, device.type, device.use, flush=True)
scene.cycles.device = 'GPU' if gpu else 'CPU'
scene.cycles.samples = int(os.environ.get('RENDER_SAMPLES', '32'))
scene.render.resolution_x = int(os.environ.get('RENDER_WIDTH', '1920'))
scene.render.resolution_y = scene.render.resolution_x * 9 // 16
frames = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'all'
base = '/Users/lizusheng/.zcode/workspace/default/site-studies/animejs/renders/intro'
if frames == 'all':
    os.makedirs(base+'/frames', exist_ok=True)
    scene.render.filepath = base+'/frames/frame_'
    bpy.ops.render.render(animation=True, scene=scene.name)
else:
    os.makedirs(base+'/preview', exist_ok=True)
    for frame in map(int, frames.split(',')):
        scene.frame_set(frame)
        scene.render.filepath = f'{base}/preview/frame_{frame:04d}.png'
        started = time.monotonic()
        bpy.ops.render.render(write_still=True, scene=scene.name)
        print('FRAME_COMPLETE', frame, round(time.monotonic()-started,2), flush=True)
