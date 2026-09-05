"""Execute through Blender MCP or CLI to create the independent three-color film.
Never modifies the source studio or CAD file. Parameters: colors-film.json.
"""
import bpy, json, math, runpy
from pathlib import Path
from mathutils import Vector, Matrix
BASE=Path(__file__).resolve().parent
cfg=json.loads((BASE/'colors-film.json').read_text())
with bpy.data.libraries.load(str(BASE/cfg['source']),link=False) as (src,dst):
    dst.scenes=[n for n in src.scenes if n.startswith('Luma Color ')]
seeds=dst.scenes
scene=bpy.data.scenes.new('Luma A3.44 Three Colors Film')
scene.render.engine='CYCLES';scene.cycles.samples=cfg['samples']
scene.cycles.use_denoising=True;scene.cycles.use_adaptive_sampling=True
scene.cycles.adaptive_threshold=.04;scene.cycles.max_bounces=8;scene.cycles.transmission_bounces=6
scene.render.resolution_x,scene.render.resolution_y=cfg['resolution'];scene.render.resolution_percentage=100
scene.render.fps=cfg['fps'];scene.frame_start=1;scene.frame_end=cfg['frames']
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
scene.render.use_persistent_data=True
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=cfg['exposure']
scene.world=seeds[0].world.copy()
scene['source_revision']=cfg['revision'];scene['composition_intent']=cfg['intent']
nylon=runpy.run_path(str(BASE/'switch-material.py'))['upper_housing_material']()
for placement in cfg['products']:
    seed=next(s for s in seeds if s.name.startswith('Luma Color '+placement['color']))
    bpy.context.window.scene=seed;seed.frame_set(1);bpy.context.view_layer.update()
    group=bpy.data.collections.new('Assembly '+placement['color']);scene.collection.children.link(group)
    transform=Matrix.Translation(Vector(placement['position']))@Matrix.Rotation(math.radians(placement['yaw_degrees']),4,'Z')
    count=0
    for src in seed.objects:
        if src.type!='MESH':continue
        obj=src.copy();obj.animation_data_clear();obj.parent=None
        obj.matrix_world=transform@src.matrix_world;group.objects.link(obj)
        if 'top_housing' in src.name:
            obj.data=src.data.copy();obj.data.materials.clear();obj.data.materials.append(nylon)
        count+=1
    assert count==450,(placement['color'],count)

def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
def area(name,position,power,size,color):
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='RECTANGLE';light.size=size[0];light.size_y=size[1];light.color=color
    obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=position;aim(obj,(0,0,.02))
area('Three-color broad ceiling',(0,.12,.20),30,(.62,.25),(1,.88,.77))
area('Three-color front bounce',(-.12,-.22,.25),12,(.62,.28),(.88,.94,1))
area('Three-color edge softbox',(.30,.06,.14),6,(.18,.22),(.8,.88,1))
camdata=bpy.data.cameras.new('Three-color 70mm');camdata.lens=cfg['lens_mm'];camdata.clip_start=.001;camdata.clip_end=20
cam=bpy.data.objects.new('Three-color forward traverse',camdata);scene.collection.objects.link(cam);scene.camera=cam
for frame in range(1,cfg['frames']+1):
    t=(frame-1)/(cfg['frames']-1)
    cam.location=Vector(cfg['camera_start']).lerp(Vector(cfg['camera_end']),t)
    aim(cam,Vector(cfg['target_start']).lerp(Vector(cfg['target_end']),t))
    cam.keyframe_insert(data_path='location',frame=frame);cam.keyframe_insert(data_path='rotation_euler',frame=frame)
bpy.context.window.scene=scene;scene.frame_set(1);bpy.context.view_layer.update()
# Independent library, including all mesh/material dependencies and the camera.
bpy.data.libraries.write(str(BASE/'luma-a344-colors.blend'),{scene},path_remap='RELATIVE',fake_user=True,compress=True)
print('Three-color film built',len(scene.objects),'objects')
