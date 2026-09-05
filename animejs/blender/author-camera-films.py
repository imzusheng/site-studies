"""Modify retained film scene cameras only, preserving authored mesh/material state.
Run with Blender MCP. The independent camera bundle leaves the hero studio intact.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector
BASE=Path(__file__).resolve().parent
cfg=json.loads((BASE/'camera-films.json').read_text())
selected=[]
for kind in ('colors','support','core'):
    shot=cfg[kind]
    with bpy.data.libraries.load(str(BASE/shot['source']),link=False) as(a,d):
        d.scenes=[n for n in a.scenes if n.startswith(shot['scene_prefix'])]
    s=d.scenes[0];s.name='Luma A3.44 Camera '+kind.title();bpy.context.window.scene=s;s.frame_set(1);bpy.context.view_layer.update()
    cam=s.camera;cam.animation_data_clear()
    for frame in range(1,shot['frames']+1):
        t=(frame-1)/(shot['frames']-1)
        if shot['mode']=='arc':
            angle=math.radians(shot['azimuth_degrees'][0]+t*(shot['azimuth_degrees'][1]-shot['azimuth_degrees'][0]))
            cam.location=(shot['target'][0]+shot['radius']*math.cos(angle),shot['target'][1]+shot['radius']*math.sin(angle),shot['height'][0]+t*(shot['height'][1]-shot['height'][0]))
        else:cam.location=Vector(shot['camera_start']).lerp(Vector(shot['camera_end']),t)
        cam.rotation_euler=(Vector(shot['target'])-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.keyframe_insert(data_path='location',frame=frame);cam.keyframe_insert(data_path='rotation_euler',frame=frame)
    # Retain source normals/materials; the structure fill sits clear of cover planes.
    if kind=='support':
        for obj in s.objects:
            if obj.type=='LIGHT' and obj.name.startswith('Structure lower rim'):
                obj.location=(.3,.16,.20);obj.rotation_euler=(Vector((0,0,-.015))-obj.location).to_track_quat('-Z','Y').to_euler()
    s.render.resolution_x,s.render.resolution_y=shot['resolution'];s.render.resolution_percentage=100;s.render.fps=shot['fps'];s.frame_start=1;s.frame_end=shot['frames']
    s['camera_intent']=shot['intent'];s['camera_parameters']='camera-films.json';s.frame_set(1);bpy.context.view_layer.update();selected.append(s)
bpy.data.libraries.write(str(BASE/'luma-a344-camera-films.blend'),set(selected),path_remap='RELATIVE',fake_user=True,compress=True)
print('Camera bundle saved:',[(s.name,s.frame_end) for s in selected])
