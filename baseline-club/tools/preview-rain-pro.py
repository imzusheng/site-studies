import bpy,runpy,math,sys
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
api=runpy.run_path(str(root/'tools/export-rain-pro.py'),run_name='adapter')
kind='serve' if '--serve-neck' in sys.argv else 'run' if '--run-ready' in sys.argv else 'forehand';c=api['motion']['clips'][kind];tm=c['duration']*(.56 if kind=='serve' else .38) if kind!='forehand' else .88;f=min(range(len(c['times'])),key=lambda i:abs(c['times'][i]-tm))
if '--grip' not in sys.argv:api['apply_source'](*api['source_pose'](c,f),kind,c['times'][f])
torso=api['C']@api['arm'].pose.bones['DEF-Spine2'].matrix
print('TORSO',torso)
for name in ['FK-Upperarm.R','FK-Forearm.R','FK-Hand.R','DEF-Hand.R']:
 pos=api['C']@api['arm'].pose.bones[name].matrix.translation;print(name,list(pos),list(torso.inverted()@pos))
handmat=api['arm'].pose.bones['DEF-Hand.R'].matrix.copy()
socket=bpy.data.objects.new('Grip proof socket',None);bpy.context.collection.objects.link(socket);socket.matrix_world=handmat
griproot=bpy.data.objects.new('Racket grip proof',None);bpy.context.collection.objects.link(griproot);griproot.parent=socket;griproot.location=(-.028,.079,0);griproot.rotation_euler.x=-math.pi/2;griproot.scale=(1/api['S'],)*3
bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.016,depth=.176);handle=bpy.context.object;handle.name='GEO-rain-grip-proof';handle.parent=griproot;handle.location=(0,-.024,0);handle.rotation_euler.x=math.pi/2
mat=bpy.data.materials.new('GripProof');mat.diffuse_color=(.08,.11,.095,1);handle.data.materials.append(mat)
cu=bpy.data.curves.new('Racket frame proof','CURVE');cu.dimensions='3D';cu.bevel_depth=.0095;cu.bevel_resolution=2;sp=cu.splines.new('POLY');sp.points.add(64)
for i,pt in enumerate(sp.points):a=i/64*math.pi*2;pt.co=(math.sin(a)*.135,-.45+math.cos(a)*.177,0,1)
hoop=bpy.data.objects.new('GEO-rain-racket-frame-proof',cu);bpy.context.collection.objects.link(hoop);hoop.parent=griproot;hoop.data.materials.append(mat)
for sign in [-1,1]:
 cu=bpy.data.curves.new('Throat proof','CURVE');cu.dimensions='3D';cu.bevel_depth=.008;sp=cu.splines.new('POLY');sp.points.add(2)
 for pt,co in zip(sp.points,[(0,-.11,0,1),(sign*.03,-.2,0,1),(sign*.066,-.29,0,1)]):pt.co=co
 throat=bpy.data.objects.new('GEO-rain-racket-throat-proof',cu);bpy.context.collection.objects.link(throat);throat.parent=griproot;cu.materials.append(mat)
# Simplified preview materials show evaluated silhouettes and hands without relying
# on Blender Studio's custom shader scripts. The browser uses the PBR atlas export.
for ob in bpy.data.objects:
 if ob.type=='MESH' and (not ob.name.startswith('GEO-rain-') or ob.name.endswith(('nomask','viewport')) or ob.name=='GEO-rain-scarf'):ob.hide_render=True
for mat in bpy.data.materials:
 key=mat.name.split('.')[-1];col={'body':(.54,.32,.20,1),'top':(.74,.8,.64,1),'jeans':(.13,.22,.18,1),'hair':(.1,.052,.02,1),'shoes':(.62,.62,.54,1),'eyes':(.9,.9,.8,1),'eyebrows':(.04,.02,.01,1),'eyelashes':(.03,.02,.01,1)}.get(key,(.6,.6,.52,1));mat.diffuse_color=col
camdata=bpy.data.cameras.new('Proof');cam=bpy.data.objects.new('Proof',camdata);bpy.context.collection.objects.link(cam);cam.location=(2.9,-4,2.1);target=Vector((0,0,.9));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=2.25;bpy.context.scene.camera=cam
sc=bpy.context.scene;sc.render.engine='BLENDER_WORKBENCH';sc.display.shading.light='STUDIO';sc.display.shading.studiolight_rotate_z=.4;sc.display.shading.color_type='MATERIAL';sc.display.shading.show_shadows=True;sc.display.shading.show_cavity=True;sc.display.shading.cavity_type='BOTH';sc.display.shading.background_type='WORLD';sc.world.color=(.075,.09,.085);sc.render.resolution_x=900;sc.render.resolution_y=900;sc.render.resolution_percentage=100;sc.render.filepath=str(root/'.cache/rain-pro-original-pose.png');bpy.ops.render.render(write_still=True)
# Hand camera provides a clear phalange/grip audit.
hand=api['arm'].pose.bones['DEF-Hand.R'].matrix.translation;cam.location=hand+Vector((-.1,-.37,.27));cam.rotation_euler=(hand-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=.39;sc.render.filepath=str(root/'.cache/rain-pro-grip-proof.png');bpy.ops.render.render(write_still=True)
cam.location=hand+Vector((-.1,-.37,-.24));cam.rotation_euler=(hand-cam.location).to_track_quat('-Z','Y').to_euler();sc.render.filepath=str(root/'.cache/rain-pro-grip-underside.png');bpy.ops.render.render(write_still=True)
if '--contacts' in sys.argv:
 camdata.ortho_scale=2.25;cam.location=(2.9,-4,2.1);cam.rotation_euler=(Vector((0,0,.9))-cam.location).to_track_quat('-Z','Y').to_euler()
 for kind,clip in api['motion']['clips'].items():
  if 'contact' not in clip:continue
  f=min(range(len(clip['times'])),key=lambda i:abs(clip['times'][i]-clip['contact']));api['apply_source'](*api['source_pose'](clip,f),kind,clip['times'][f]);socket.matrix_world=api['arm'].pose.bones['DEF-Hand.R'].matrix.copy();sc.render.filepath=str(root/f'.cache/rain-contact-{kind}.png');bpy.ops.render.render(write_still=True)
