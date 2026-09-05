"""Build the intro film through Blender MCP, then render the exported scene.
Loads the formal A3.43 library into an independent scene. Does not save or alter
an existing user project. Output: renders/intro/luma-intro.blend and PNG frames.
"""
import bpy, math, os, json
from mathutils import Vector, Matrix

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.environ.get('LUMA_A343_SOURCE')
if not SOURCE:
    raise RuntimeError('Set LUMA_A343_SOURCE to the original A3.43 physical-twin .blend, or render the self-contained blender/luma-a343-studio.blend.')
OUT = os.path.join(BASE, 'renders/intro')
os.makedirs(OUT, exist_ok=True)
with bpy.data.libraries.load(SOURCE, link=False) as (available, imported):
    imported.objects = available.objects
objects = [o for o in imported.objects if o and o.type == 'MESH']
assert len(objects) == 471, f'Expected A3.43 471 meshes, got {len(objects)}'
scene = bpy.data.scenes.new('Luma Intro Film')
scene.world = bpy.data.worlds.new('Luma quiet studio')
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs['Color'].default_value = (.018, .023, .031, 1)
background.inputs['Strength'].default_value = .12
for o in objects:
    scene.collection.objects.link(o)
    o.animation_data_clear()
    o.matrix_world = Matrix.Scale(.001, 4) @ o.matrix_world
    o.hide_render = False
    o.hide_viewport = False
    if any(k in o.name for k in ['cosmetic_upper', 'keycap_', 'ec11_knob', 'screen_bezel']):
        m = bpy.data.materials.new('Soft-touch charcoal ' + o.name)
        m.use_nodes = True
        n, l = m.node_tree.nodes, m.node_tree.links
        bs = next(x for x in n if x.type == 'BSDF_PRINCIPLED')
        bs.inputs['Base Color'].default_value = (.040, .043, .047, 1)
        bs.inputs['Roughness'].default_value = .57
        bs.inputs['Metallic'].default_value = 0
        bs.inputs['Specular IOR Level'].default_value = .28
        noise = n.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 720
        noise.inputs['Detail'].default_value = 2
        coord = n.new('ShaderNodeTexCoord')
        l.new(coord.outputs['Generated'], noise.inputs['Vector'])
        bump = n.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .21
        bump.inputs['Distance'].default_value = .000035
        l.new(noise.outputs['Fac'], bump.inputs['Height'])
        bevel = n.new('ShaderNodeBevel')
        bevel.inputs['Radius'].default_value = .00014
        bevel.samples = 3
        l.new(bump.outputs['Normal'], bevel.inputs['Normal'])
        l.new(bevel.outputs['Normal'], bs.inputs['Normal'])
        o.data.materials.clear()
        o.data.materials.append(m)
        for poly in o.data.polygons:
            poly.use_smooth = True
        o.data.set_sharp_from_angle(angle=math.radians(38))
    if 'lcd_' in o.name.lower():
        m = bpy.data.materials.new('Optical smoked glass')
        m.use_nodes = True
        bs = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        bs.inputs['Base Color'].default_value = (.005, .007, .009, 1)
        bs.inputs['Roughness'].default_value = .48
        bs.inputs['Specular IOR Level'].default_value = .1
        o.data.materials.clear()
        o.data.materials.append(m)

# Fine graphic inside the real cover glass, understated in a product photograph.
img = bpy.data.images.new('Intro status display', width=512, height=512)
pixels = []
for y in range(512):
    for x in range(512):
        color = (.001, .002, .002, 1)
        for row, length in [(100, 290), (175, 210), (250, 335), (325, 150), (400, 255)]:
            if row < y < row + 2 and 42 < x < 470: color = (.026, .032, .038, 1)
            if row < y < row + 5 and 42 < x < 42 + length: color = (.13, .062, .018, 1)
        if 440 < y < 456 and x % 18 < 2 and 42 < x < 470: color = (.05, .06, .07, 1)
        pixels.extend(color)
img.pixels = pixels
img.pack()
for o in objects:
    if 'lcd_front_cover_glass' in o.name:
        m = o.data.materials[0]
        bs = next(x for x in m.node_tree.nodes if x.type == 'BSDF_PRINCIPLED')
        tex = m.node_tree.nodes.new('ShaderNodeTexImage')
        tex.image = img
        coord = m.node_tree.nodes.new('ShaderNodeTexCoord')
        m.node_tree.links.new(coord.outputs['Generated'], tex.inputs['Vector'])
        m.node_tree.links.new(tex.outputs['Color'], bs.inputs['Emission Color'])
        bs.inputs['Emission Strength'].default_value = 18


def aim(o, target):
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()

def area(name, location, power, width, height, color):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = power
    data.color = color
    data.shape = 'RECTANGLE'
    data.size = width
    data.size_y = height
    o = bpy.data.objects.new(name, data)
    scene.collection.objects.link(o)
    o.location = location
    aim(o, (0, .012, .023))
    return o

area('Wide warm ceiling', (-.03, .095, .075), 7.5, .18, .06, (1, .85, .7))
area('Cool side bounce', (.11, .01, .075), 1.1, .14, .07, (.67, .8, 1))
area('Broad front fill', (-.09, -.13, .16), .45, .20, .16, (.84, .9, 1))

camera_data = bpy.data.cameras.new('100mm restrained macro')
camera_data.lens = 100
camera_data.sensor_width = 36
camera_data.clip_start = .001
camera_data.clip_end = 10
camera = bpy.data.objects.new('Intro camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
focus = bpy.data.objects.new('Display focus plane', None)
scene.collection.objects.link(focus)
focus.location = (0, .014, .0246)
camera_data.dof.use_dof = True
camera_data.dof.focus_object = focus
camera_data.dof.aperture_fstop = 22
scene.frame_start = 1
scene.frame_end = 150
scene.render.fps = 30
# One arc, one direction. Small ease at the ends; most of the move is steady.
for frame in range(1, 151):
    t = (frame - 1) / 149
    u = t * t * (3 - 2 * t)
    start = Vector((-.022, -.155, .185))
    control = Vector((-.014, -.19, .22))
    finish = Vector((0, -.21, .26))
    camera.location = start * (1-u)**2 + control * 2 * (1-u) * u + finish * u*u
    target = Vector((-.003, .018, .027)).lerp(Vector((0, .019, .027)), u)
    aim(camera, target)
    camera.keyframe_insert(data_path='location', frame=frame)
    camera.keyframe_insert(data_path='rotation_euler', frame=frame)
    camera_data.shift_y = .028 * (1-u)
    camera_data.keyframe_insert(data_path='shift_y', frame=frame)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = .035
scene.cycles.use_denoising = True
scene.cycles.device = 'GPU'
scene.cycles.max_bounces = 6
scene.cycles.diffuse_bounces = 3
scene.cycles.glossy_bounces = 3
scene.cycles.transmission_bounces = 4
scene.cycles.sample_clamp_indirect = 3
scene.render.use_persistent_data = True
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.color_depth = '8'
scene.render.filepath = os.path.join(OUT, 'frames/frame_')
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -4.0
scene.render.film_transparent = False
scene.frame_set(1)
bpy.context.window.scene = scene
# Export just this scene and its dependencies; the user's open project is untouched.
bpy.data.libraries.write(os.path.join(OUT, 'luma-intro.blend'), {scene}, path_remap='ABSOLUTE', fake_user=True, compress=True)
print(json.dumps({'scene': scene.name, 'meshes': len(objects), 'frames': [1,150], 'fps':30, 'resolution':[1920,1080], 'file':os.path.join(OUT,'luma-intro.blend')}, ensure_ascii=False))
