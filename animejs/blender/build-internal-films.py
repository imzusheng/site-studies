"""Author independent A3.44 support and interior films through Blender MCP.
Uses only frozen assembled objects. No historical exploratory chassis geometry.
"""
import bpy, json
from pathlib import Path
from mathutils import Vector, Matrix
BASE=Path(__file__).resolve().parent
cfg=json.loads((BASE/'internal-films.json').read_text())
with bpy.data.libraries.load(str(BASE/cfg['source']),link=False) as (a,d):
    d.scenes=[n for n in a.scenes if n.startswith('Luma Color Graphite')]
seed=d.scenes[0];bpy.context.window.scene=seed;seed.frame_set(1);bpy.context.view_layer.update()

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
def area(s,name,p,power,size,color,target):
    light=bpy.data.lights.new(name,'AREA');light.energy=power;light.shape='RECTANGLE';light.size=size[0];light.size_y=size[1];light.color=color
    obj=bpy.data.objects.new(name,light);s.collection.objects.link(obj);obj.location=p;aim(obj,target)
def material(name,color,rough,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value=(*color,1);n.inputs['Roughness'].default_value=rough;n.inputs['Metallic'].default_value=metal
    return m
retainer_mat=material('Frozen retainer matte graphite',(.055,.065,.070),.8)
board_mat=material('Internal deep green solder mask',(.012,.09,.065),.55)
metal_mat=material('Internal satin hardware',(.32,.36,.40),.32,.75)
chip_mat=material('Internal IC packages',(.025,.029,.034),.62)
cad_materials={}
def cad_finish(source):
    if source.name in cad_materials:return cad_materials[source.name]
    m=source.copy();m.name=source.name+' linear studio finish'
    node=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    c=source.diffuse_color[:3]
    linear=lambda v:v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
    node.inputs['Base Color'].default_value=(*(linear(v) for v in c),1)
    node.inputs['Roughness'].default_value=.5 if max(c)<.5 else .32
    node.inputs['Metallic'].default_value=0 if max(c)<.5 else .7
    cad_materials[source.name]=m;return m
def assign(obj,mat):
    obj.data=obj.data.copy();obj.data.materials.clear();obj.data.materials.append(mat)
def group_for(name):
    if name.startswith('cosmetic_upper_shell'):return 'shell'
    if name.startswith('bottom_service_cover'):return 'cover'
    if name.startswith(('esp32_m3_retainer','retainer_m3_')):return 'retainer'
    if name.startswith('waveshare_vendor'):return 'board'
    return None
scenes=[]
for kind in ('support','interior'):
    shot=cfg[kind];s=bpy.data.scenes.new('Luma A3.44 '+kind.title()+' Film')
    s.render.engine='CYCLES';s.cycles.samples=cfg['samples'];s.cycles.use_denoising=True;s.cycles.use_adaptive_sampling=True;s.cycles.adaptive_threshold=.035
    s.cycles.max_bounces=8;s.cycles.sample_clamp_indirect=3
    s.render.resolution_x,s.render.resolution_y=cfg['resolution'];s.render.resolution_percentage=100;s.render.fps=cfg['fps'];s.frame_start=1;s.frame_end=cfg['frames']
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.use_persistent_data=True
    s.world=seed.world.copy();s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=shot['exposure']
    s['source_revision']=cfg['revision'];s['camera_intent']=shot['intent'];s['retainer_semantic_id']='esp32_m3_retainer'
    objects=[];seen=set()
    offsets={'shell':(-.080,.012,.045),'board':(-.005,0,.016),'retainer':(.030,0,-.016),'cover':(.105,-.008,-.055)}
    for src in seed.objects:
        if src.type!='MESH':continue
        group=group_for(src.name)
        if group is None or (kind=='interior' and group not in ('board','retainer')):continue
        # Remove coincident vendor duplicates, retaining distinct positions.
        signature=(src.name.split('.')[0].split('_')[-1],tuple(round(v,7) for c in src.bound_box for v in (src.matrix_world@Vector(c))))
        if signature in seen:continue
        seen.add(signature)
        obj=src.copy();obj.animation_data_clear();obj.parent=None;s.collection.objects.link(obj)
        if src.name.startswith('esp32_m3_retainer'):assign(obj,retainer_mat)
        elif src.name.startswith('retainer_m3_'):assign(obj,metal_mat)
        elif src.name.startswith('waveshare_vendor_solid_001_'):assign(obj,board_mat)
        elif src.name.startswith('waveshare_vendor_solid_320_'):assign(obj,chip_mat)
        elif group=='board' and src.data.materials and src.data.materials[0].name.startswith('A3.43 CAD'):
            assign(obj,cad_finish(src.data.materials[0]))
        matrix=src.matrix_world.copy()
        if kind=='support':
            for frame,factor in ((1,1),(96,1.05)):
                obj.matrix_world=Matrix.Translation(Vector(offsets[group])*factor)@matrix
                obj.keyframe_insert(data_path='location',frame=frame)
        else:obj.matrix_world=matrix
        objects.append(obj)
    if kind=='support':
        area(s,'Structure overhead',(-.05,.08,.19),14,(.32,.22),(1,.9,.8),(0,0,.01))
        area(s,'Structure front fill',(.04,-.22,.12),10,(.3,.25),(.85,.93,1),(0,0,.01))
        area(s,'Structure lower rim',(.3,.16,.20),4,(.18,.16),(.9,.95,1),(0,0,-.015))
    else:
        area(s,'Macro broad key',(-.03,-.025,-.055),1.8,(.11,.08),(1,.90,.79),shot['target'])
        area(s,'Macro soft rim',(.055,.05,-.025),1.2,(.10,.08),(.78,.9,1),shot['target'])
        area(s,'Macro face bounce',(-.055,.01,-.045),.55,(.08,.06),(.9,.94,1),shot['target'])
    camera=bpy.data.cameras.new(kind+' camera');camera.lens=shot['lens_mm'];camera.shift_x=shot.get('shift_x',0);camera.clip_start=.0005;camera.clip_end=10
    camera.dof.use_dof=True;camera.dof.aperture_fstop=shot['fstop']
    focus=bpy.data.objects.new(kind+' focus',None);s.collection.objects.link(focus);focus.location=shot['target'];camera.dof.focus_object=focus
    cam=bpy.data.objects.new(kind+' forward camera',camera);s.collection.objects.link(cam);s.camera=cam
    for frame in range(1,cfg['frames']+1):
        t=(frame-1)/(cfg['frames']-1);cam.location=Vector(shot['camera_start']).lerp(Vector(shot['camera_end']),t);aim(cam,shot['target'])
        cam.keyframe_insert(data_path='location',frame=frame);cam.keyframe_insert(data_path='rotation_euler',frame=frame)
    bpy.context.window.scene=s;s.frame_set(1);bpy.context.view_layer.update();scenes.append(s)
    print(kind,len(objects),'real source meshes')
bpy.data.libraries.write(str(BASE/'luma-a344-internal-films.blend'),set(scenes),path_remap='RELATIVE',fake_user=True,compress=True)
