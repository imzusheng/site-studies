"""Export Snow v4 original weights and evaluated body corrective rig for the club.
Run with Blender 5.2 --python-use-system-env -b <snow.blend> --python this.py.
No downloaded Blender scripts are enabled. The rig uses native constraints/drivers.
"""
import bpy,json,struct,math,sys,time,re,io
import numpy as np
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
TEX=ROOT/'.cache/snow-v4/Snow/textures'
S=1.00641195193535
C=Matrix(((S,0,0,0),(0,0,S,0),(0,-S,0,0),(0,0,0,1)))
CR=C.to_3x3().normalized()
old=ROOT/'.cache/snow-original-18.glb'
if not old.exists():old.write_bytes((ROOT/'assets/snow.glb').read_bytes())
b=old.read_bytes();n=struct.unpack_from('<I',b,12)[0];oldj=json.loads(b[20:20+n]);rig=oldj['nodes'][0]['extras']['rig']
motion=json.loads((ROOT/'assets/motions.json').read_text(encoding='utf8'))
locomotion=ROOT/'assets/locomotion-source.json'
if locomotion.exists():motion['clips'].update(json.loads(locomotion.read_text(encoding='utf8'))['clips'])
arm=bpy.data.objects['RIG-Snow']
# Turn off the IK switches; preserve all native body corrective constraints.
props=arm.pose.bones['Properties']
for k in list(props.keys()):
 if k.startswith('ik_') and isinstance(props[k],(int,float)):props[k]=type(props[k])(0)
for pb in arm.pose.bones:pb.matrix_basis=Matrix.Identity(4)
arm.update_tag();bpy.context.view_layer.update()
mapping={0:['TORSO-Spine'],1:['FK-Spine','FK-RibCage','FK-Chest'],2:['FK-Neck'],3:['FK-Head'],4:['FK-Shoulder.L'],5:['FK-UpperArm.L'],6:['FK-Forearm.L'],7:['FK-Wrist.L'],8:['FK-Shoulder.R'],9:['FK-UpperArm.R'],10:['FK-Forearm.R'],11:['FK-Wrist.R'],12:['FK-Thigh.L'],13:['FK-Knee.L'],14:['FK-Foot.L'],15:['FK-Thigh.R'],16:['FK-Knee.R'],17:['FK-Foot.R']}
targets={}
for i,names in mapping.items():
 for name in names:
  pb=arm.pose.bones[name]
  # Remove IK copy constraints on driven controls only. Body correctives remain.
  for c in list(pb.constraints):pb.constraints.remove(c)
  e=bpy.data.objects.new('MOCAP-'+name,None);bpy.context.collection.objects.link(e)
  e.rotation_mode='QUATERNION';e.matrix_world=pb.bone.matrix_local
  c=pb.constraints.new('COPY_ROTATION');c.target=e;c.target_space=c.owner_space='WORLD'
  targets[name]=(i,e,pb.bone.matrix_local.to_3x3().to_quaternion())
pelvis=arm.pose.bones['TORSO-Spine'];loc=bpy.data.objects.new('MOCAP-pelvis-position',None);bpy.context.collection.objects.link(loc);loc.location=pelvis.bone.head_local
c=pelvis.constraints.new('COPY_LOCATION');c.target=loc;c.target_space=c.owner_space='WORLD'
def grip():
 # Curl around the handle with the original three phalanges, never rigid hand welds.
 for side,amount in [('R',1.0),('L',.28)]:
  for finger in ['Index','Middle','Ring','Pinky']:
   for j,ang in enumerate([.72,1.05,.70],1):
    pb=arm.pose.bones[f'FK-Finger_{finger}{j}.{side}'];pb.rotation_mode='XYZ';pb.rotation_euler.x=ang*amount
  for j,ang in enumerate([.28,.45,.5],1):
   pb=arm.pose.bones[f'FK-Finger_Thumb{j}.{side}'];pb.rotation_mode='XYZ';pb.rotation_euler.x=ang*amount
grip();bpy.context.view_layer.update()
def parent_index(name):
 side=1 if name.endswith('.R') else 0
 if any(k in name for k in ['Index','Middle','Ring','Pinky','Thumb','Wrist']):return 11 if side else 7
 if 'Forearm' in name:return 10 if side else 6
 if 'UpperArm' in name:return 9 if side else 5
 if 'Shoulder' in name:return 8 if side else 4
 if 'Knee' in name:return 16 if side else 13
 if any(k in name for k in ['Foot','Toe']):return 17 if side else 14
 if 'Thigh' in name:return 15 if side else 12
 if 'Neck' in name:return 2
 if name=='DEF-Spine' or 'Hip' in name:return 0
 if 'Spine' in name or 'RibCage' in name or 'Chest' in name:return 1
 return 3
body_terms=['Spine','Hip','RibCage','Chest','Neck','Shoulder','UpperArm','Forearm','Wrist','Thumb','Index','Middle','Ring','Pinky','Thigh','Knee','Foot','Toe']
def mapped(name):
 if name.startswith('DEF-') and any(k in name for k in body_terms) and not any(k in name for k in ['Eye','Face','Nose','Cheek','Lip','Tongue','Brow']):return name
 return 'DEF-Head'
# Build a compact deform-only runtime skin; the facial expression is static.
mesh_names=['body','head','shirt','pants','shoes_base','shoes_bottom','shoes_parts','eyes','eyebrows','hair_base','gums_upper','gums_lower','teeth_upper','teeth_lower','tongue']
objects=[bpy.data.objects['GEO-snow-'+s] for s in mesh_names]
used=set(['DEF-Head'])
for ob in objects:
 for g in ob.vertex_groups:
  if g.name in arm.data.bones and arm.data.bones[g.name].use_deform:used.add(mapped(g.name))
names=sorted(used);indices={n:i for i,n in enumerate(names)}
parents=[parent_index(n) for n in names]
rest={n:arm.data.bones[n].matrix_local.copy() for n in names}
def helpers(qs=None,p=None):
 mats=[]
 for i,off in enumerate(rig['offsets']):
  m=Matrix.Translation(Vector(off))
  if i==0 and p is not None:m.translation=Vector((0,p[1]*(rig['offsets'][0][1]/.912),off[2]))
  if qs is not None:m=m@qs[i].to_matrix().to_4x4()
  if rig['parents'][i]>=0:m=mats[rig['parents'][i]]@m
  mats.append(m)
 return mats
bind_helpers=helpers()
def local_parts(mat):
 p,q,s=mat.decompose();q.normalize();return [round(x,7) for x in p],[round(q.x,7),round(q.y,7),round(q.z,7),round(q.w,7)],[round(x,7) for x in s]
def source_pose(c,f):
 qs=[Quaternion((q[3],q[0],q[1],q[2])) for q in c['q'][f]]
 return qs,c['p'][f]
def apply_source(qs,p,kind=None,sample_time=None):
 mats=helpers(qs,p);world=[m.to_quaternion() for m in mats]
 for name,(i,e,r) in targets.items():
  w=world[i]
  if name=='FK-Spine':w=world[0].slerp(world[1],.35)
  elif name=='FK-RibCage':w=world[0].slerp(world[1],.78)
  e.rotation_quaternion=CR.inverted().to_quaternion()@w@CR.to_quaternion()@r
 loc.location=pelvis.bone.head_local+Vector((0,0,(p[1]*(rig['offsets'][0][1]/.912)-rig['offsets'][0][1])/S))
 bpy.context.view_layer.update()
 # A bounded, offline two-bone correction keeps wrists/forearms outside the
 # torso while adapting recorded mocap to Snow. No runtime chasing.
 torso=C@arm.pose.bones['DEF-RibCage'].matrix
 inv=torso.inverted();orientation=torso.to_quaternion()
 for side in ['R','L']:
  sn,en,hn=[f'FK-{x}.{side}' for x in ['UpperArm','Forearm','Wrist']]
  s,e,h=[C@arm.pose.bones[n].matrix.translation for n in [sn,en,hn]]
  hand_center=C@(arm.pose.bones[f'DEF-Wrist.{side}'].matrix@Vector((0,.075,-.016)))
  local=inv@hand_center;wanted=h.copy();elocal=inv@e
  # In the original spine basis, Y is up and Z is the front of the torso.
  if -.19<local.y<.37:
   radial=(local.x/.32)**2+(local.z/.25)**2
   if radial<1:
    factor=1/math.sqrt(max(.025,radial));local.x*=factor;local.z*=factor
    wanted=h+(torso@local-hand_center)
  elbow_radial=(elocal.x/.27)**2+(elocal.z/.235)**2
  elbow_inside=-.19<elocal.y<.36 and elbow_radial<1
  if (wanted-h).length>.001 or elbow_inside:
   direction=wanted-s;l1=(e-s).length;l2=(h-e).length;d=min(direction.length,l1+l2-.001);direction.normalize()
   outward=orientation@Vector((-1 if side=='R' else 1,0,.15))
   old_pole=e-s-direction*(e-s).dot(direction);new_pole=outward-direction*outward.dot(direction)
   weight=min(1,max(0,1-elbow_radial)*2) if elbow_inside else 0
   pole=old_pole.normalized().lerp(new_pole.normalized(),weight)
   if pole.length<.001:pole=Vector((-1 if side=='R' else 1,0,.1))
   pole.normalize();x=(l1*l1-l2*l2+d*d)/(2*d);y=math.sqrt(max(0,l1*l1-x*x));elbow=s+direction*x+pole*y;wanted=s+direction*d
   for name,old_dir,new_dir in [(sn,e-s,elbow-s),(en,h-e,wanted-elbow)]:
    dq=old_dir.normalized().rotation_difference(new_dir.normalized());target=targets[name][1]
    dq_bl=CR.inverted().to_quaternion()@dq@CR.to_quaternion();target.rotation_quaternion=dq_bl@target.rotation_quaternion
 bpy.context.view_layer.update()
 clearance_weight=1.0 if kind in ['serve','run','strafeLeft','strafeRight','backward'] else 0.0
 if kind=='backhand' and sample_time is not None:
  # The reviewed overlap is near contact. Fade this local adjustment around
  # that moment; the two-handed wind-up retains its recorded wrist direction.
  moment=motion['clips']['backhand']['contact'];u=min(1,max(0,(sample_time-moment+.14)/.10));v=min(1,max(0,(sample_time-moment-.09)/.14));clearance_weight=u*u*(3-2*u)*(1-v*v*(3-2*v))
 if kind=='forehand' and sample_time is not None and sample_time<.22:
  u=max(0,min(1,(sample_time-.08)/.14));clearance_weight=1-u*u*(3-2*u)
 if clearance_weight>0:
  # A local wrist-direction correction for the observed face/neck overlap.
  # Move the real wrist and its fingers together; the racket socket stays fixed.
  for bone,offset,radius in [('DEF-Head',.09,.235),('DEF-Neck',.035,.19),('DEF-RibCage',.08,.34)]:
   hand=C@arm.pose.bones['DEF-Wrist.R'].matrix;grip=hand@Vector((-.028,.079,0));axis=(hand.to_3x3()@Vector((0,0,1))).normalized()
   center=C@(arm.pose.bones[bone].matrix@Vector((0,offset,0)));toward=center-grip;distance=toward.length
   if distance<.025:continue
   along=axis.dot(toward)
   if along<0 or along>.75:continue
   normal=toward.normalized();angle=axis.angle(normal);limit=math.asin(min(.985,radius/distance))+.08
   if angle<limit:
    away=-normal;full_angle=axis.angle(away);dq=Quaternion().slerp(axis.rotation_difference(away),min(1,(limit-angle)/max(.01,full_angle))*clearance_weight)
    target=targets['FK-Wrist.R'][1];target.rotation_quaternion=(CR.inverted().to_quaternion()@dq@CR.to_quaternion())@target.rotation_quaternion
    bpy.context.view_layer.update()
 return mats
def bake():
 clips={};audit={}
 t0=time.time()
 for kind,c in motion['clips'].items():
  out={'times':c['times'],'p':[],'q':[],'s':[]};points=[]
  for f in range(len(c['times'])):
   qs,p=source_pose(c,f);hs=apply_source(qs,p,kind,c['times'][f]);pp=[];qq=[];ss=[]
   for name,pi in zip(names,parents):
    mat=hs[pi].inverted()@C@arm.pose.bones[name].matrix
    lp,lq,ls=local_parts(mat);pp.append(lp);qq.append(lq);ss.append(ls)
   out['p'].append(pp);out['q'].append(qq);out['s'].append(ss)
  clips[kind]=out
  print('BAKED',kind,len(out['p']),round(time.time()-t0,2),flush=True)
 (ROOT/'assets/snow-motions.json').write_text(json.dumps({'version':1,'names':names,'parents':parents,'source':'Blender Studio Snow v4 native deformation rig, FK retarget of six recorded tennis clips, with phalange grip','clips':clips},separators=(',',':')),encoding='utf8')
 return clips

def export_glb():
 bpy.context.scene.render.use_simplify=False
 # Restore bind controls and open fingers before extracting undeformed mesh.
 for _,e,r in targets.values():e.rotation_quaternion=r
 loc.location=pelvis.bone.head_local
 for pb in arm.pose.bones:
  if pb.name.startswith('FK-') and any(x in pb.name for x in ['Index','Middle','Ring','Pinky','Thumb']):pb.matrix_basis=Matrix.Identity(4)
 arm.data.pose_position='REST';bpy.context.view_layer.update()
 gl={'asset':{'version':'2.0','generator':'Baseline Club Snow native-deform adapter'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':'Snow','children':[],'extras':{'rig':rig,'professionalRig':{'names':names,'parents':parents,'rightHand':'DEF-Wrist.R','source':'Blender Studio Snow v4','fingerGrip':True},'artist':'Blender Studio'}}],'meshes':[],'skins':[],'accessors':[],'bufferViews':[],'buffers':[],'materials':[],'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]}
 blob=bytearray()
 def add(data,component=5126,typ='VEC3',target=None,bounds=False):
  ar=np.asarray(data,dtype={5126:'<f4',5123:'<u2',5125:'<u4'}[component]);ar=ar.reshape((-1,{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[typ]));raw=ar.tobytes();vi=rawview(raw,target);a={'bufferView':vi,'componentType':component,'count':len(ar),'type':typ}
  if bounds:a.update(min=ar.min(axis=0).tolist(),max=ar.max(axis=0).tolist())
  gl['accessors'].append(a);return len(gl['accessors'])-1
 def rawview(raw,target=None):
  while len(blob)%4:blob.append(0)
  vi=len(gl['bufferViews']);v={'buffer':0,'byteOffset':len(blob),'byteLength':len(raw)}
  if target:v['target']=target
  gl['bufferViews'].append(v);blob.extend(raw);return vi
 for i,name in enumerate(rig['names']):
  nd={'name':name,'translation':rig['offsets'][i],'children':[]};gl['nodes'].append(nd)
  gl['nodes'][rig['parents'][i]+1 if rig['parents'][i]>=0 else 0]['children'].append(i+1)
 for i,(name,pi) in enumerate(zip(names,parents)):
  p,q,s=local_parts(bind_helpers[pi].inverted()@C@rest[name]);gl['nodes'].append({'name':name,'translation':p,'rotation':q,'scale':s});gl['nodes'][pi+1]['children'].append(19+i)
 ib=[np.asarray((C@rest[n]).inverted()).T.flatten().tolist() for n in names]
 gl['skins'].append({'inverseBindMatrices':add(ib,typ='MAT4'),'joints':[19+i for i in range(len(names))]})
 texcache={}
 def texture(name,atlas=False):
  key=(name,atlas)
  if key in texcache:return texcache[key]
  if atlas:
   im=Image.new('RGB',(3072,1024))
   for i in range(3):im.paste(Image.open(TEX/f'skin_diffuse.{1001+i}.png').convert('RGB').resize((1024,1024)),(i*1024,0))
  else:
   im=Image.open(TEX/name).convert('RGB');im.thumbnail((1024,1024))
  buf=io.BytesIO();im.save(buf,format='JPEG',quality=88);vi=rawview(buf.getvalue());gl['images'].append({'bufferView':vi,'mimeType':'image/jpeg'});gl['textures'].append({'source':len(gl['images'])-1,'sampler':0});idx=len(gl['textures'])-1;texcache[key]=idx;return idx
 materials={}
 def material(m):
  name=m.name if m else 'fallback'
  if name in materials:return materials[name]
  key=name.split('.')[-1];key={'skin':'body','skin_darker':'body','skin_upper_lip':'body','skin_lower_lip':'body','pants':'jeans','shirt':'top','shoe':'shoes','shoes_base':'shoes','shoes_bottom':'shoes','shoes_parts':'shoes'}.get(key,key);colors={'body':[1,1,1,1],'top':[.79,.83,.71,1],'jeans':[.22,.34,.27,1],'shoes':[.72,.74,.64,1],'hair':[.32,.2,.10,1],'eyebrows':[.065,.035,.018,1],'eyelashes':[.025,.017,.01,1],'gums':[.6,.25,.22,1],'teeth':[.9,.86,.74,1],'tongue':[.64,.23,.19,1],'hairband':[.42,.14,.09,1],'metal':[.5,.5,.45,1],'socks':[.8,.82,.72,1],'laces':[.76,.77,.69,1],'eyes':[1,1,1,1]}
  pbr={'baseColorFactor':colors.get(key,[.5,.5,.5,1]),'metallicFactor':.35 if key=='metal' else 0,'roughnessFactor':.72 if key not in ['body','eyes','hair'] else {'body':.48,'eyes':.2,'hair':.42}[key]}
  if key=='body':pbr['baseColorTexture']={'index':texture('body',True)}
  if key=='eyes':pbr['baseColorTexture']={'index':texture('eyes_diffuse.png')}
  if key=='hair':pbr['baseColorTexture']={'index':texture('hair_diffuse.png')};pbr['baseColorFactor']=[1,1,1,1]
  if key=='jeans':pbr['baseColorTexture']={'index':texture('pants_diffuse.png')};pbr['baseColorFactor']=[.7,.82,.72,1]
  if key in ['top','shoes']:pbr['baseColorTexture']={'index':texture('shirt_diffuse.png' if key=='top' else 'shoes_diffuse.png')};pbr['baseColorFactor']=[1,1,1,1]
  gl['materials'].append({'name':name,'pbrMetallicRoughness':pbr,'doubleSided':key in ['top','eyelashes','hair']});idx=len(gl['materials'])-1;materials[name]=idx;return idx
 for ob in objects:
  # Native mirror, clothing masks and one smooth subdivision are evaluated with
  # the original vertex groups. Armature and animation-time modifiers are skipped.
  ob.hide_set(False)
  for mod in ob.modifiers:
   if mod.type in ['ARMATURE','LATTICE','CORRECTIVE_SMOOTH','SURFACE_DEFORM']:mod.show_viewport=False
   elif mod.type=='SUBSURF':
    mod.driver_remove('levels');mod.driver_remove('show_viewport')
    # Smooth the visible silhouette and joint surfaces; mouth and shoe hardware
    # retain artist topology because their tiny details do not benefit in play.
    mod.levels=1 if ob.name in ['GEO-snow-body','GEO-snow-head','GEO-snow-shirt','GEO-snow-pants','GEO-snow-hair_base'] else 0;mod.show_viewport=True
  bpy.context.view_layer.update();ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh(preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get());me.calc_loop_triangles()
  lookup={g.index:mapped(g.name) for g in ob.vertex_groups if g.name in arm.data.bones and arm.data.bones[g.name].use_deform}
  uv_layer=next((layer for layer in me.uv_layers if layer.active_render),me.uv_layers.active)
  weights=[]
  for v in me.vertices:
   ws={}
   for g in v.groups:
    if g.group in lookup:ni=indices[lookup[g.group]];ws[ni]=ws.get(ni,0)+g.weight
   top=sorted(ws.items(),key=lambda x:-x[1])[:4]
   if not top:top=[(indices['DEF-Head'],1)]
   total=sum(w for _,w in top);weights.append(([i for i,_ in top]+[0]*4)[:4]+([w/total for _,w in top]+[0]*4)[:4])
  prim=[]
  for mi in sorted(set(t.material_index for t in me.loop_triangles)):
   pos=[];normal=[];uv=[];js=[];ws=[]
   mat=ob.material_slots[mi].material if mi<len(ob.material_slots) else None
   for tri in me.loop_triangles:
    if tri.material_index!=mi:continue
    for li in tri.loops:
     vi=me.loops[li].vertex_index;v=me.vertices[vi];pos.append(list(C@(ob.matrix_world@v.co)));normal.append(list(CR@(ob.matrix_world.to_3x3()@me.corner_normals[li].vector)));u=list(uv_layer.data[li].uv) if uv_layer else [0,0]
     if mat and any(k in mat.name.lower() for k in ['body','skin']):u[0]/=3
     u[1]=1-u[1];uv.append(u);js.append(weights[vi][:4]);ws.append(weights[vi][4:])
   if pos:
    rows=np.concatenate([pos,normal,uv,js,ws],axis=1).astype('<f4');unique,inverse=np.unique(rows,axis=0,return_inverse=True)
    prim.append({'attributes':{'POSITION':add(unique[:,:3],target=34962,bounds=True),'NORMAL':add(unique[:,3:6],target=34962),'TEXCOORD_0':add(unique[:,6:8],typ='VEC2',target=34962),'JOINTS_0':add(unique[:,8:12],component=5123,typ='VEC4',target=34962),'WEIGHTS_0':add(unique[:,12:16],typ='VEC4',target=34962)},'indices':add(inverse,component=5125,typ='SCALAR',target=34963),'material':material(mat)})
  gl['meshes'].append({'name':ob.name,'primitives':prim});gl['nodes'].append({'name':ob.name,'mesh':len(gl['meshes'])-1,'skin':0});gl['nodes'][0]['children'].append(len(gl['nodes'])-1);ev.to_mesh_clear()
  print('MESH',ob.name,sum(gl['accessors'][p['attributes']['POSITION']]['count'] for p in prim),flush=True)
 while len(blob)%4:blob.append(0)
 gl['buffers']=[{'byteLength':len(blob)}];raw=json.dumps(gl,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);out=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(blob))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(blob),0x004e4942)+blob
 (ROOT/'assets/snow-pro.glb').write_bytes(out)
 (ROOT/'.cache/snow-pro-audit.json').write_text(json.dumps({'bones':len(names),'triangles':sum(gl['accessors'][p['indices']]['count']//3 for m in gl['meshes'] for p in m['primitives']),'bytes':len(out),'sourceRigBones':len(arm.data.bones),'meshes':len(objects),'materials':len(materials),'textures':len(texcache)},indent=2))
 print('EXPORT_COMPLETE',len(out),len(names),flush=True)

if __name__=='__main__':
 if '--mesh-only' in sys.argv:export_glb()
 elif '--bake-only' in sys.argv:bake()
 else:bake();export_glb()
