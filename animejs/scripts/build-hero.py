"""Render the genuine A3.43 CAD mesh library as a separate photographic hero.
Run with Blender --factory-startup -b <Luma_A3_43_Physical_Twin.blend>
--python animejs/scripts/build-hero.py. WIDTH/SAMPLES/DEVICE are optional.
The source library is never saved or modified on disk. CPU is the tested default.
"""
import bpy, math, os
from mathutils import Vector, Matrix
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
objects=[o for o in bpy.data.objects if o.type=='MESH']
scene=bpy.data.scenes.new('Luma A3.43 photographic hero')
bpy.context.window.scene=scene
for o in objects:
 scene.collection.objects.link(o)
 o.animation_data_clear();o.matrix_world=Matrix.Scale(.001,4) @ o.matrix_world
 o.hide_render=False;o.hide_viewport=False
for o in objects:
 if any(k in o.name for k in ['cosmetic_upper','keycap_','ec11_knob','screen_bezel']):
  m=bpy.data.materials.new('Fine bead satin '+o.name);m.use_nodes=True
  n=m.node_tree.nodes;l=m.node_tree.links;bs=next(x for x in n if x.type=='BSDF_PRINCIPLED')
  bs.inputs['Base Color'].default_value=(.045,.047,.051,1)
  bs.inputs['Roughness'].default_value=.43
  bs.inputs['Metallic'].default_value=.08
  noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=1150;noise.inputs['Detail'].default_value=2
  tex=n.new('ShaderNodeTexCoord');l.new(tex.outputs['Generated'],noise.inputs['Vector'])
  bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.19;bump.inputs['Distance'].default_value=.000035
  l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
  bevel=n.new('ShaderNodeBevel');bevel.inputs['Radius'].default_value=.00014;bevel.samples=4
  l.new(bump.outputs['Normal'],bevel.inputs['Normal']);l.new(bevel.outputs['Normal'],bs.inputs['Normal'])
  o.data.materials.clear();o.data.materials.append(m)
  for poly in o.data.polygons:poly.use_smooth=True
  o.data.set_sharp_from_angle(angle=math.radians(38))
 if 'lcd_' in o.name.lower():
  m=bpy.data.materials.new('Smoked display');m.use_nodes=True;bs=next(x for x in m.node_tree.nodes if x.type=='BSDF_PRINCIPLED');bs.inputs['Base Color'].default_value=(.005,.008,.009,1);bs.inputs['Roughness'].default_value=.55;bs.inputs['Specular IOR Level'].default_value=.12;o.data.materials.clear();o.data.materials.append(m)
# Small original screen graphic, a restrained status interface on the true cover glass.
img=bpy.data.images.new('Luma status interface',width=512,height=512)
pixels=[]
for y in range(512):
 for x in range(512):
  c=(.001,.002,.002,1)
  for row,length in [(105,300),(180,220),(255,330),(330,155),(405,260)]:
   if row<y<row+2 and 42<x<470:c=(.022,.029,.035,1)
   if row<y<row+5 and 42<x<42+length:c=(.14,.065,.018,1)
  if 440<y<456 and x%18<2 and 42<x<470:c=(.05,.06,.07,1)
  pixels.extend(c)
img.pixels=pixels;img.pack()
for o in objects:
 if 'lcd_front_cover_glass' in o.name:
  m=o.data.materials[0];n=m.node_tree.nodes;l=m.node_tree.links;bs=next(x for x in n if x.type=='BSDF_PRINCIPLED')
  tex=n.new('ShaderNodeTexImage');tex.image=img;coord=n.new('ShaderNodeTexCoord');l.new(coord.outputs['Generated'],tex.inputs['Vector']);l.new(tex.outputs['Color'],bs.inputs['Emission Color']);bs.inputs['Emission Strength'].default_value=18
world=bpy.data.worlds.new('Black studio');world.use_nodes=True;next(x for x in world.node_tree.nodes if x.type=='BACKGROUND').inputs[0].default_value=(.012,.015,.021,1);next(x for x in world.node_tree.nodes if x.type=='BACKGROUND').inputs[1].default_value=.09;scene.world=world

def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,color,target=(0,0,.025),size_y=None):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='RECTANGLE';d.size=size;d.size_y=size_y or size
 o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,target)
area('Warm overhead strip',(-.02,.085,.06),6,.16,(1,.84,.67),size_y=.027)
area('Cool far rim',(.1,.02,.065),.6,.11,(.65,.78,1),size_y=.016)
area('Camera fill',(-.07,-.10,.12),.06,.12,(.86,.9,1),size_y=.10)
d=bpy.data.cameras.new('110mm product portrait');d.lens=100;d.sensor_width=36;d.clip_start=.001;d.clip_end=10
cam=bpy.data.objects.new('Hero camera',d);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(0,-.21,.26);aim(cam,(0,.019,.027))
scene.render.engine='CYCLES';scene.cycles.samples=int(os.getenv('SAMPLES','64'));scene.cycles.use_denoising=True
try:
 prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='METAL'
 scene.cycles.device=os.getenv('DEVICE','CPU')
except Exception as e:print(e)
scene.render.resolution_x=int(os.getenv('WIDTH','1920'));scene.render.resolution_y=int(scene.render.resolution_x*9/16);scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(BASE,'public/images/luma-a343-hero.png')
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-4.3
scene.render.film_transparent=False
print('START RENDER',flush=True)
bpy.ops.render.render(write_still=True,scene=scene.name)
