"""Run through Blender MCP to author isolated marketing scenes.

Uses the retained intro scene as the A3.43 mesh/material library. Never saves the
user's open project. All final scenes and packed data are exported independently.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Matrix

BASE = Path(__file__).resolve().parent
CFG = json.loads((BASE / 'production.json').read_text())
seed = next((s for s in bpy.data.scenes if s.name == 'Luma Intro Film.001'), None)
if seed is None:
    with bpy.data.libraries.load(str(BASE / 'luma-a343-studio.blend'), link=False) as (a, d):
        d.scenes = [n for n in a.scenes if n.startswith('Luma Intro Film')]
    seed = d.scenes[0]

def material(name, color, rough=.5, metal=0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bs = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Specular IOR Level'].default_value = .28
    return m

def use_material(o, m):
    o.data = o.data.copy()
    o.data.materials.clear()
    o.data.materials.append(m)

def aim(o, p):
    o.rotation_euler = (Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()

def area(s, name, p, watts, size, color, target=(0,0,0)):
    d = bpy.data.lights.new(name,'AREA'); d.energy=watts; d.shape='RECTANGLE'
    d.size=size[0]; d.size_y=size[1]; d.color=color
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=p;aim(o,target)

def studio(kind):
    s=bpy.data.scenes.new('Luma '+kind.title()+' Portrait')
    s.world=bpy.data.worlds.new(kind+' quiet world');s.world.use_nodes=True
    bg=next(n for n in s.world.node_tree.nodes if n.type=='BACKGROUND')
    bg.inputs['Color'].default_value=(*CFG['world_color'],1)
    bg.inputs['Strength'].default_value=CFG['world_strength']
    s.render.engine='CYCLES';s.cycles.samples=CFG['samples']
    s.cycles.use_adaptive_sampling=True;s.cycles.adaptive_threshold=CFG['adaptive_threshold']
    s.cycles.use_denoising=True;s.cycles.max_bounces=6;s.cycles.sample_clamp_indirect=3
    s.render.resolution_x,s.render.resolution_y=CFG['resolution'];s.render.resolution_percentage=100
    s.render.fps=CFG['fps'];s.frame_start=1;s.frame_end=CFG[kind].get('frames',1)
    s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
    s.render.use_persistent_data=True
    s.view_settings.view_transform=CFG['view_transform'];s.view_settings.look=CFG['look']
    s.view_settings.exposure=CFG[kind].get('exposure',CFG['exposure'])
    d=bpy.data.cameras.new(kind+' camera');d.lens=CFG[kind]['lens_mm'];d.clip_start=.0005;d.clip_end=10
    d.dof.use_dof=True;d.dof.aperture_fstop=CFG[kind]['fstop']
    cam=bpy.data.objects.new(kind+' camera',d);s.collection.objects.link(cam);s.camera=cam
    f=bpy.data.objects.new(kind+' focus',None);s.collection.objects.link(f);f.location=CFG[kind].get('focus',CFG[kind]['target']);d.dof.focus_object=f
    if kind!='craft':
        area(s,kind+' broad warm',(-.035,.022,.06),.9,(.075,.045),(1,.83,.68))
        area(s,kind+' cool bounce',(.04,-.01,.025),.22,(.055,.07),(.7,.83,1))
        area(s,kind+' soft front',(-.015,-.06,.025),.4 if kind=='switch' else .18,(.08,.04),(.9,.93,1))
        for frame in range(1,s.frame_end+1):
            t=(frame-1)/(s.frame_end-1);u=t*t*(3-2*t)
            cam.location=Vector(CFG[kind]['camera_start']).lerp(Vector(CFG[kind]['camera_end']),u)
            aim(cam,CFG[kind]['target']);cam.keyframe_insert(data_path='location',frame=frame);cam.keyframe_insert(data_path='rotation_euler',frame=frame)
    else:
        area(s,'craft ceiling',(-.08,.10,.24),12,(.30,.20),(1,.85,.7))
        area(s,'craft fill',(.2,-.1,.12),4,(.25,.2),(.8,.88,1))
        cam.location=CFG[kind]['camera'];aim(cam,CFG[kind]['target'])
    s.frame_set(1)
    return s

def clone(s, source, transform):
    o=source.copy();o.animation_data_clear();s.collection.objects.link(o)
    o.matrix_world=transform@source.matrix_world
    return o

core=studio('core')
chip=next(o for o in seed.objects if CFG['core']['subject_object'] in o.name)
surface_faces=[p for p in chip.data.polygons if p.normal.z < -.8]
surface=sum(((chip.matrix_world@p.center)*p.area for p in surface_faces),Vector())/sum(p.area for p in surface_faces)
normal=(chip.matrix_world.to_3x3()@surface_faces[0].normal).normalized()
rotation=normal.rotation_difference(Vector((0,0,1))).to_matrix().to_4x4()
transform=rotation@Matrix.Translation(-surface)
chipmat=material('Fine-grained chip package',(.018,.021,.025),.68)
pcbmat=material('Deep blue solder mask',(.009,.025,.047),.6)
seen_vendor=set()
for src in seed.objects:
    if src.type!='MESH' or 'waveshare_vendor' not in src.name:continue
    # The vendor STEP repeats one connector assembly at identical coordinates.
    # Match both its source shape hash and world bounds; repeated parts at other
    # positions remain intact. Coincident copies create ray-traced checkerboards.
    signature=(src.name.split('.')[0].split('_')[-1],tuple(round(v,8) for c in src.bound_box for v in (src.matrix_world@Vector(c))))
    if signature in seen_vendor:continue
    seen_vendor.add(signature)
    o=clone(core,src,transform)
    if 'solid_320_' in src.name:
        use_material(o,chipmat)
        bevel=o.modifiers.new('Subtle package edge','BEVEL');bevel.width=.06;bevel.segments=3
    elif 'solid_001_' in src.name:use_material(o,pcbmat)

# Restrained identification, not an invented silicon die or fictional circuitry.
font=bpy.data.curves.new('Package identification','FONT');font.body='ESP32-S3';font.align_x='CENTER';font.size=.00105;font.extrude=0
label=bpy.data.objects.new('Package identification',font);core.collection.objects.link(label);label.location=(0,-.0005,.000025)
font.materials.append(material('Laser marking',(.27,.29,.31),.9))

switch=studio('switch')
bottom=next(o for o in seed.objects if 'choc_v2_1_bottom_housing' in o.name)
center=sum((bottom.matrix_world@Vector(c) for c in bottom.bound_box),Vector())/8
face_normal=Vector((0,-.157277,.987554)).normalized()
rot=face_normal.rotation_difference(Vector((0,0,1))).to_matrix().to_4x4()
transform=rot@Matrix.Translation(-center)
black=material('Switch graphite housing',(.035,.039,.043),.62)
ivory=material('Switch ivory housing',(.38,.40,.39),.47)
brown=material('Tactile brown stem',(.21,.10,.045),.58)
metal=material('Contact alloy',(.34,.22,.10),.32,.65)
for src in seed.objects:
    if src.type!='MESH' or 'choc_v2_1_' not in src.name:continue
    o=clone(switch,src,transform)
    if 'top_housing' in src.name:
        o.location.z+=.009;use_material(o,ivory)
    elif 'stem' in src.name or 'active_button' in src.name:
        o.location.z+=.0035;use_material(o,brown)
    elif 'spring' in src.name and 'seat' not in src.name:
        use_material(o,metal)
        for poly in o.data.polygons:poly.use_smooth=True
        o.data.set_sharp_from_angle(angle=math.radians(38))
    elif 'contact' in src.name or 'pins' in src.name:use_material(o,metal)
    else:use_material(o,black)

craft=studio('craft')
names=['cosmetic_upper_shell','bottom_service_cover_battery_cradle','esp32_m3_retainer','screen_bezel','ec11_knob_22p5']+[f'keycap_{i}' for i in range(1,7)]
places=[(-.071,.032,0),(.071,.032,-.006),(.058,-.067,.006),(-.067,-.067,.012),(.002,-.071,.017)]+[(-.09+i*.031,-.117,.012) for i in range(6)]
for name,p in zip(names,places):
    src=next(o for o in seed.objects if o.type=='MESH' and o.name.split('.')[0]==name)
    center=sum((src.matrix_world@Vector(c) for c in src.bound_box),Vector())/8
    # Separate physical objects; fixed print collection rather than moving CAD rows.
    o=clone(craft,src,Matrix.Translation(Vector(p))@Matrix.Rotation(-.18,4,'Z')@Matrix.Translation(-center))
    if not any(m and m.name.startswith('Soft-touch') for m in o.data.materials):use_material(o,black)
    if name=='keycap_2':use_material(o,material('Warm printed option',(.23,.11,.05),.72))
floor_mesh=bpy.data.meshes.new('Craft studio floor')
floor_mesh.from_pydata([(-1,-1,-.025),(1,-1,-.025),(1,1,-.025),(-1,1,-.025)],[],[(0,1,2,3)])
floor=bpy.data.objects.new('Craft studio floor',floor_mesh);craft.collection.objects.link(floor)
floor_mesh.materials.append(material('Warm studio paper',(.45,.42,.37),.9))

target=BASE/'luma-a343-studio.blend'
bpy.data.libraries.write(str(target),{seed,core,switch,craft},path_remap='RELATIVE',fake_user=True,compress=True)
print(json.dumps({'file':str(target),'scenes':[(s.name,len(s.objects))for s in [seed,core,switch,craft]]}))
