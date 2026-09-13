"""Convert licensed Blender Studio artist meshes to a compact Web tennis rig.
No embedded .blend Python executes. Artist topology/UVs retained; material nodes
adapted, facial deformation frozen, hands curled, and bone weights consolidated.
"""
import bpy, json, pathlib, struct, math, re, io, traceback
import numpy as np
from mathutils import Vector, Matrix
from PIL import Image
BASE=pathlib.Path('asset-audit').resolve();BASE.mkdir(exist_ok=True)
NAMES=['Hips','Chest','Neck','Head','LeftCollar','LeftShoulder','LeftElbow','LeftWrist','RightCollar','RightShoulder','RightElbow','RightWrist','LeftHip','LeftKnee','LeftAnkle','RightHip','RightKnee','RightAnkle']
PARENTS=[-1,0,1,2,1,4,5,6,1,8,9,10,0,12,13,0,15,16]
for who in ['rain']:
 files=list((BASE/who).rglob('*.blend'));f=max(files,key=lambda p:p.stat().st_size)
 bpy.ops.wm.open_mainfile(filepath=str(f),use_scripts=False)
 arm=next(o for o in bpy.data.objects if o.type=='ARMATURE' and o.name.lower().startswith('rig'))
 bpy.context.view_layer.objects.active=arm
 try:
  if bpy.context.object.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
 except Exception:pass
 def unhide(l):
  l.exclude=False;l.hide_viewport=False
  for c in l.children:unhide(c)
 unhide(bpy.context.view_layer.layer_collection)
 for c in bpy.data.collections:c.hide_viewport=False
 for o in bpy.data.objects:
  if o.type=='ARMATURE':o.data.pose_position='REST'
  o.hide_viewport=False
 report={'who':who,'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'head':list(b.head_local),'tail':list(b.tail_local),'deform':b.use_deform} for b in arm.data.bones],'objects':[]}
 for o in bpy.data.objects:
  if o.type=='MESH':report['objects'].append({'name':o.name,'verts':len(o.data.vertices),'hideRender':o.hide_render,'mods':[(m.name,m.type) for m in o.modifiers],'materials':[m.name if m else '' for m in o.data.materials]})
 (BASE/(who+'-inspection.json')).write_text(json.dumps(report,indent=2))
 def canonical(name):
  if who!='snow':return name
  exact={'DEF-Spine':'DEF-Spine1','DEF-RibCage':'DEF-Spine2','DEF-Chest':'DEF-Spine3'}
  if name in exact:return exact[name]
  for a,b in [('DEF-Shoulder.','DEF-Clavicle.'),('DEF-UpperArm_','DEF-Upperarm'),('DEF-Forearm_','DEF-Forearm'),('DEF-Wrist.','DEF-Hand.'),('DEF-Thigh_','DEF-Thigh'),('DEF-Knee_','DEF-Shin')]:name=name.replace(a,b)
  for finger in ['Index','Middle','Ring','Pinky']:
   for seg in ['Carpal','1','2','3']:
    n='DEF-Finger_'+finger+('_Carpal' if seg=='Carpal' else seg)
    if name.startswith(n+'.'):return name.replace(n,'DEF-'+finger+({'Carpal':'1','1':'2','2':'3','3':'4'}[seg]))
  return name.replace('DEF-Finger_Thumb','DEF-Thumb')
 bn={canonical(b.name):b for b in arm.data.bones}
 def bone(*candidates):
  for n in candidates:
   if n in bn:return bn[n]
  raise KeyError(candidates)
 # CloudRig game-independent anatomical anchors, artist units in Blender Z-up.
 keys=[('DEF-Spine1',),('DEF-Spine2',),('DEF-Neck',),('DEF-Head',),('DEF-Clavicle.L',),('DEF-Upperarm1.L',),('DEF-Forearm1.L',),('DEF-Hand.L',),('DEF-Clavicle.R',),('DEF-Upperarm1.R',),('DEF-Forearm1.R',),('DEF-Hand.R',),('DEF-Thigh1.L',),('DEF-Shin1.L',),('DEF-Foot.L',),('DEF-Thigh1.R',),('DEF-Shin1.R',),('DEF-Foot.R',)]
 try: anchors=[bone(*k).head_local.copy() for k in keys]
 except Exception as e:print('BONE MAPPING FAILED',who,e,flush=True);continue
 height=max(v.co.z for o in bpy.data.objects if o.type=='MESH' and 'head' in o.name.lower() for v in o.data.vertices);scale=1.80/max(1.4,height)
 conv=lambda v:np.array([v[0],v[2],-v[1]],dtype=float)*scale
 joints=np.array([conv(p) for p in anchors]); offsets=np.array([joints[i]-(joints[p] if p>=0 else np.zeros(3)) for i,p in enumerate(PARENTS)])
 def classify(name,position=None):
  s=name.lower();side=1 if '.l' in s else -1
  if any(x in s for x in ['thumb','index','middle','pinky','hand']) or s.startswith('def-ring'):return 7 if side>0 else 11
  if 'forearm' in s or 'elbow' in s:return 6 if side>0 else 10
  if 'upperarm' in s:return 5 if side>0 else 9
  if 'clavicle' in s:return 4 if side>0 else 8
  if 'shin' in s or 'knee' in s or 'ankle' in s:return 13 if side>0 else 16
  if 'thigh' in s:return 12 if side>0 else 15
  if 'foot' in s or 'toe' in s:return 14 if side>0 else 17
  if 'pelvis' in s or 'spine1' in s or 'hip' in s:return 0
  if 'spine' in s:return 1
  if 'neck' in s or 'scarf' in s:return 2
  return 3
 # Finger deformation matrices in artist rest space before consolidation to wrist.
 fingerD={}
 for side in ['L','R']:
  sign=1 if side=='L' else -1
  for finger in ['Index','Middle','Ring','Pinky','Thumb']:
   D=Matrix.Identity(4)
   for seg in range(1,5):
    name=f'DEF-{finger}{seg}.{side}'
    if name not in bn:continue
    angle=([0,.45,.65,.50][seg-1] if finger=='Thumb' else [0,.70,.85,.62][seg-1])
    pivot=D@bn[name].head_local;axis=D.to_3x3()@Vector((0,sign,0));R=Matrix.Rotation(angle,4,axis)
    D=Matrix.Translation(pivot)@R@Matrix.Translation(-pivot)@D;fingerD[name]=D.copy()
 doc={'asset':{'version':'2.0','generator':'Baseline Club / Blender Studio adaptation','copyright':'Rain/Snow Rig (CC BY 4.0) Blender Foundation | studio.blender.org'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'name':who.title(),'children':[1],'extras':{'rig':{'names':NAMES,'parents':PARENTS,'offsets':offsets.tolist(),'joints':joints.tolist(),'scale':scale},'artist':'Blender Studio','sourceCharacter':who}}],'meshes':[],'skins':[],'materials':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'accessors':[],'bufferViews':[],'buffers':[]}
 blob=bytearray()
 def raw(data,target=None):
  blob.extend(bytes((-len(blob))%4));v={'buffer':0,'byteOffset':len(blob),'byteLength':len(data)}
  if target:v['target']=target
  blob.extend(data);doc['bufferViews'].append(v);return len(doc['bufferViews'])-1
 def acc(a,typ,component=5126,bounds=False,target=None):
  a=np.ascontiguousarray(a);v={'bufferView':raw(a.tobytes(),target),'componentType':component,'count':len(a),'type':typ}
  if bounds:v.update(min=a.min(axis=0).tolist(),max=a.max(axis=0).tolist())
  doc['accessors'].append(v);return len(doc['accessors'])-1
 for i,n in enumerate(NAMES):
  node={'name':n,'translation':offsets[i].tolist()};kids=[j+1 for j,p in enumerate(PARENTS) if p==i]
  if kids:node['children']=kids
  doc['nodes'].append(node)
 ib=np.tile(np.eye(4,dtype=np.float32),(18,1,1));ib[:,:3,3]=-joints
 doc['skins'].append({'inverseBindMatrices':acc(ib.transpose(0,2,1).reshape(-1,16),'MAT4'),'joints':list(range(1,19)),'skeleton':1})
 mats={};textures={};images={p.name:p for p in f.parent.rglob('*.png')}
 def texture(paths,atlas=False):
  key=tuple(str(p) for p in paths)
  if key in textures:return textures[key]
  ims=[]
  for p in paths:
   im=Image.open(p).convert('RGB');im.thumbnail((1024,1024));ims.append(im)
  if atlas:
   image=Image.new('RGB',(1024*len(ims),1024),(145,100,80))
   for i,im in enumerate(ims):image.paste(im.resize((1024,1024)),(1024*i,0))
  else:image=ims[0]
  data=io.BytesIO();image.save(data,format='JPEG',quality=89,optimize=True)
  idx=len(doc['images']);doc['images'].append({'bufferView':raw(data.getvalue()),'mimeType':'image/jpeg'});ti=len(doc['textures']);doc['textures'].append({'sampler':0,'source':idx});textures[key]=ti;return ti
 def material(m):
  if m.name in mats:return mats[m.name]
  name=m.name.lower();col=list(m.diffuse_color);rough=.8;tex=None;atlas=False
  if 'body' in name or 'skin' in name:
   ps=[images.get((f'TEX-rain_body_diffuse.{1001+i}.png' if who=='rain' else f'skin_diffuse.{1001+i}.png')) for i in range(3)]
   if all(ps):tex=texture(ps,True);atlas=True;col=[1,1,1,1]
   else:
    ps=[p for n,p in images.items() if ('skin' in n.lower() or 'body' in n.lower()) and 'diffuse' in n.lower()]
    if ps:tex=texture([ps[0]]);col=[1,1,1,1]
  if 'eye' in name and not any(w in name for w in ['brow','lash','dot','cornea']):
   ps=[p for n,p in images.items() if 'eye' in n.lower() and ('diffuse' in n.lower() or n=='TEX-rain_eyes.png')]
   if ps:tex=texture([ps[0]]);col=[1,1,1,1]
   rough=.35
  if 'hair' in name and 'band' not in name:
   ps=[p for n,p in images.items() if 'hair' in n.lower() and 'diffuse' in n.lower()]
   if ps:tex=texture([ps[0]]);col=[1,1,1,1]
   rough=.7
  if 'jean' in name or 'pants' in name:col=[.027,.07,.064,1];tex=None;rough=.92
  if 'top' in name or 'shirt' in name or 'jacket' in name:col=[.83,.86,.76,1];tex=None;rough=.92
  if 'shoe' in name:col=[.52,.56,.49,1];rough=.85
  if 'lace' in name or 'sock' in name:col=[.84,.85,.76,1]
  if 'band' in name:col=[.30,.09,.035,1]
  if 'brow' in name or 'lash' in name:col=[.023,.012,.006,1]
  pbr={'baseColorFactor':[max(0,min(1,v)) for v in col],'metallicFactor':0,'roughnessFactor':rough}
  if tex is not None:pbr['baseColorTexture']={'index':tex}
  idx=len(doc['materials']);doc['materials'].append({'name':m.name,'pbrMetallicRoughness':pbr,'doubleSided':True});mats[m.name]=(idx,atlas);return mats[m.name]
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and o.name.startswith('GEO-') and not any(w in o.name.lower() for w in ['scarf','cornea','eye_dots','helper','deformer']) and any(m.type=='ARMATURE' for m in o.modifiers)]
 outstats=[]
 for o in meshes:
  o.hide_set(False)
  if o.data.shape_keys:
   if o.data.shape_keys.animation_data:o.data.shape_keys.animation_data_clear()
   for k in o.data.shape_keys.key_blocks:k.value=0
  for mod in o.modifiers:
   if mod.type in ['ARMATURE','LATTICE','CORRECTIVE_SMOOTH']:mod.show_viewport=False;mod.show_render=False
   if mod.type=='SUBSURF':mod.levels=1 if any(w in o.name.lower() for w in ['head','hair','eye','brow','lash']) else 0
  bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();evalo=o.evaluated_get(deps);me=evalo.to_mesh(preserve_all_data_layers=True,depsgraph=deps);me.calc_loop_triangles()
  groups={g.index:canonical(g.name) for g in o.vertex_groups};ws=[];coords=[]
  for vert in me.vertices:
   original=o.matrix_world@vert.co;mixp=Vector((0,0,0));total=0;combined={}
   for vg in vert.groups:
    name=groups.get(vg.group,'')
    if not name.startswith('DEF-'):continue
    idx=classify(name);p=original.copy()
    if name in fingerD:p=fingerD[name]@p
    # Source BVH palms extend down; adapt artist T-pose hand basis once offline.
    if idx in [7,11]:
     side=1 if idx==7 else -1;anchor=anchors[idx];rot=Matrix.Rotation(side*math.pi/2,4,'Y');p=anchor+rot.to_3x3()@(p-anchor)
    mixp+=p*vg.weight;total+=vg.weight;combined[idx]=combined.get(idx,0)+vg.weight
   if total<1e-7:mixp=original;total=1;combined={3 if any(w in o.name.lower() for w in ['head','hair','eye','brow','lash','gum','tongue']) else 0:1}
   coords.append(conv(mixp/total));top=sorted(combined.items(),key=lambda x:-x[1])[:4];den=sum(v for _,v in top);ws.append(([i for i,v in top]+[0]*(4-len(top)),[v/den for i,v in top]+[0]*(4-len(top))))
  coords=np.asarray(coords)
  if who=='rain' and 'hair_ponytail' in o.name:
   d=np.clip((-coords[:,2]-.12)/.45,0,1);angle=-1.10*d;yy=coords[:,1]-1.753;zz=coords[:,2]+.12;coords[:,1]=1.753+yy*np.cos(angle)-zz*np.sin(angle);coords[:,2]=-.12+yy*np.sin(angle)+zz*np.cos(angle)
  faces=np.array([list(t.vertices) for t in me.loop_triangles]);norm=np.zeros_like(coords);fn=np.cross(coords[faces[:,1]]-coords[faces[:,0]],coords[faces[:,2]]-coords[faces[:,0]])
  for j in range(3):np.add.at(norm,faces[:,j],fn)
  norm/=np.maximum(np.linalg.norm(norm,axis=1,keepdims=True),1e-10)
  primitives=[]
  for mi in sorted(set(t.material_index for t in me.loop_triangles)):
   m=o.material_slots[mi].material if mi<len(o.material_slots) else (me.materials[mi] if mi<len(me.materials) else None)
   if not m:continue
   mid,atlas=material(m);vs=[];ns=[];uvs=[];ids=[];weights=[];inds=[];dedup={}
   for t in me.loop_triangles:
    if t.material_index!=mi:continue
    for vi,li in zip(t.vertices,t.loops):
     uv_layer=next((layer for layer in me.uv_layers if layer.active_render),me.uv_layers.active);uv=list(uv_layer.data[li].uv) if uv_layer else [0,0]
     if atlas:uv[0]/=3
     uv[1]=1-uv[1];key=(vi,round(uv[0],6),round(uv[1],6))
     if key not in dedup:
      dedup[key]=len(vs);vs.append(coords[vi]);ns.append(norm[vi]);uvs.append(uv);ids.append(ws[vi][0]);weights.append(ws[vi][1])
     inds.append(dedup[key])
   attr={'POSITION':acc(np.array(vs,np.float32),'VEC3',bounds=True,target=34962),'NORMAL':acc(np.array(ns,np.float32),'VEC3',target=34962),'TEXCOORD_0':acc(np.array(uvs,np.float32),'VEC2',target=34962),'JOINTS_0':acc(np.array(ids,np.uint16),'VEC4',5123,target=34962),'WEIGHTS_0':acc(np.array(weights,np.float32),'VEC4',target=34962)}
   primitives.append({'attributes':attr,'indices':acc(np.array(inds,np.uint32).reshape(-1,1),'SCALAR',5125,target=34963),'material':mid})
  meshid=len(doc['meshes']);doc['meshes'].append({'name':o.name,'primitives':primitives});ni=len(doc['nodes']);doc['nodes'].append({'name':o.name,'mesh':meshid,'skin':0});doc['nodes'][0]['children'].append(ni);outstats.append({'mesh':o.name,'triangles':len(me.loop_triangles),'vertices':len(me.vertices)});evalo.to_mesh_clear()
 blob.extend(bytes((-len(blob))%4));doc['buffers']=[{'byteLength':len(blob)}];js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 out=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
 (BASE/(who+'-tennis.glb')).write_bytes(out);(BASE/(who+'-export.json')).write_text(json.dumps({'character':who,'bytes':len(out),'meshes':outstats,'triangles':sum(m['triangles'] for m in outstats),'rig':doc['nodes'][0]['extras']['rig']},indent=2));print('EXPORTED',who,len(out),'triangles',sum(m['triangles'] for m in outstats),flush=True)
