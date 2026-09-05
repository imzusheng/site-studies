"""Add authored color/inner-frame scenes and differentiated camera moves.
Execute through Blender MCP or Blender --background --python this_file.
Only writes the website's studio; never saves the user's open CAD project.
"""
import bpy, json, os
from pathlib import Path
from mathutils import Vector, Matrix
BASE=Path(__file__).resolve().parent
CFG=json.loads((BASE/'expansion.json').read_text())
FILE=BASE/'luma-a343-studio.blend'
with bpy.data.libraries.load(str(FILE),link=False) as(a,d):d.scenes=list(a.scenes)
loaded=d.scenes
intro=next(s for s in loaded if s.name.startswith('Luma Intro Film'))
core=next(s for s in loaded if s.name.startswith('Luma Core Portrait'))
switch=next(s for s in loaded if s.name.startswith('Luma Switch Portrait'))
craft=next(s for s in loaded if s.name.startswith('Luma Craft Portrait'))
source=next((s for s in loaded if s.name.startswith('Luma Chassis Source')),None)
if source is None:
    inner=next((o for o in bpy.data.objects if o.get('luma_promo_inner_source')),None)
    if inner is None:
        source_path=os.environ.get('LUMA_CHASSIS_SOURCE')
        if not source_path:raise RuntimeError('First build requires LUMA_CHASSIS_SOURCE; subsequent builds use the packed source scene.')
        with bpy.data.libraries.load(source_path,link=False) as(a,d):d.objects=[n for n in a.objects if n.startswith('load_bearing_chassis')]
        inner=d.objects[0]
    source=bpy.data.scenes.new('Luma Chassis Source');source.collection.objects.link(inner)

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def animate(scene, cfg):
    cam=scene.camera;cam.animation_data_clear()
    for frame in range(1,scene.frame_end+1):
        t=(frame-1)/(scene.frame_end-1);u=t*t*(3-2*t)
        cam.location=Vector(cfg['camera_start']).lerp(Vector(cfg['camera_end']),u);aim(cam,cfg['target'])
        cam.keyframe_insert(data_path='location',frame=frame);cam.keyframe_insert(data_path='rotation_euler',frame=frame)
    scene.frame_set(1);scene['camera_intent']=cfg['motion']
def copy_scene(seed,name):
    s=seed.copy();s.name=name
    # Scene.copy retains linked objects, so clone them before changing materials/camera.
    for col in list(s.collection.children):s.collection.children.unlink(col)
    for obj in list(s.collection.objects):s.collection.objects.unlink(obj)
    for obj in seed.objects:
        o=obj.copy();o.animation_data_clear()
        if obj.type in ('CAMERA','LIGHT'):o.data=obj.data.copy()
        s.collection.objects.link(o)
        if obj==seed.camera:s.camera=o
    return s

def matte(name,color,rough=.82):
    m=bpy.data.materials.new(name);m.use_nodes=True
    n=m.node_tree.nodes;bs=next(n for n in n if n.type=='BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=0;bs.inputs['Specular IOR Level'].default_value=.22
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=155
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.08;bump.inputs['Distance'].default_value=.0035
    m.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);m.node_tree.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
    return m

def assign(o,m):o.data=o.data.copy();o.data.materials.clear();o.data.materials.append(m)

animate(core,CFG['core']);animate(switch,CFG['switch'])
intro.frame_set(1)
colors=[]
for color in ('graphite','chalk','ember'):
    s=copy_scene(intro,'Luma Color '+color.title());s.frame_start=s.frame_end=1
    c=CFG['colors'];s.camera.location=c['camera'];aim(s.camera,c['target']);s.camera.data.lens=c['lens_mm'];s.camera.data.dof.aperture_fstop=c['fstop'];s.view_settings.exposure=c['exposure']
    surface=matte('Printed '+color,c[color],c['roughness'])
    for o in s.objects:
        if o.type=='MESH' and (any(k in o.name for k in ('cosmetic_upper_shell','bottom_service_cover','screen_bezel','ec11_knob','keycap_'))):assign(o,surface)
        if o.type=='LIGHT' and 'front' in o.name.lower():o.data.energy=1.8
    s.cycles.samples=48;s.frame_set(1);colors.append(s)

# An independent inner-frame portrait, kept distinct from the frozen full product.
chassis=copy_scene(intro,'Luma Chassis Portrait')
for o in list(chassis.objects):
    if o.type=='MESH':chassis.collection.objects.unlink(o)
inner=next(o for o in source.objects if o.type=='MESH')
o=inner.copy();o.animation_data_clear();chassis.collection.objects.link(o)
o.matrix_world=Matrix.Scale(.001,4)@inner.matrix_world
assign(o,matte('Inner frame graphite',(.055,.065,.069),.78))
chassis.frame_start=1;chassis.frame_end=CFG['chassis']['frames'];chassis.cycles.samples=48
chassis.camera.data.lens=CFG['chassis']['lens_mm'];chassis.camera.data.dof.aperture_fstop=CFG['chassis']['fstop']
focus=bpy.data.objects.new('Chassis focus',None);chassis.collection.objects.link(focus);focus.location=CFG['chassis']['target'];chassis.camera.data.dof.focus_object=focus
chassis.view_settings.exposure=-3.1
for lamp in chassis.objects:
    if lamp.type=='LIGHT':
        if 'front' in lamp.name.lower():lamp.data.energy=2.2
        if 'ceiling' in lamp.name.lower():lamp.data.energy=11
animate(chassis,CFG['chassis']);chassis['source_revision']=CFG['chassis']['source_revision']
bpy.data.libraries.write(str(FILE),set([intro,core,switch,craft,source,chassis]+colors),path_remap='RELATIVE',fake_user=True,compress=True)
print(json.dumps({'studio':str(FILE),'scenes':[(s.name,len(s.objects))for s in [intro,core,switch,craft,source,chassis]+colors]}))
