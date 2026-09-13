"""Isolated artist conversion with explicit rig-version adaptations."""
import pathlib, subprocess, sys, textwrap, json, struct
source=pathlib.Path('baseline-club/tools/asset-audit.py').read_text()
canonical='''def canonical(name):
 if who!='snow':return name
 exact={'DEF-Spine':'DEF-Spine1','DEF-RibCage':'DEF-Spine2','DEF-Chest':'DEF-Spine3'}
 if name in exact:return exact[name]
 for a,b in [('DEF-Shoulder.','DEF-Clavicle.'),('DEF-UpperArm_','DEF-Upperarm'),('DEF-Forearm_','DEF-Forearm'),('DEF-Wrist.','DEF-Hand.'),('DEF-Thigh_','DEF-Thigh'),('DEF-Knee_','DEF-Shin')]:name=name.replace(a,b)
 for finger in ['Index','Middle','Ring','Pinky']:
  for seg in ['Carpal','1','2','3']:
   n='DEF-Finger_'+finger+('_Carpal' if seg=='Carpal' else seg)
   if name.startswith(n+'.'):return name.replace(n,'DEF-'+finger+({'Carpal':'1','1':'2','2':'3','3':'4'}[seg]))
 return name.replace('DEF-Finger_Thumb','DEF-Thumb')
'''
source=source.replace(" bn={b.name:b for b in arm.data.bones}",textwrap.indent(canonical,' ')+" bn={canonical(b.name):b for b in arm.data.bones}")
source=source.replace("groups={g.index:g.name for g in o.vertex_groups}","groups={g.index:canonical(g.name) for g in o.vertex_groups}")
source=source.replace("if any(x in s for x in ['thumb','index','middle','ring','pinky','hand']):", "if any(x in s for x in ['thumb','index','middle','pinky','hand']) or s.startswith('def-ring'):")
source=source.replace("if 'shin' in s or 'knee' in s:", "if 'shin' in s or 'knee' in s or 'ankle' in s:")
source=source.replace("if 'pelvis' in s or 'spine1' in s:", "if 'pelvis' in s or 'spine1' in s or 'hip' in s:")
source=source.replace("['scarf','cornea','eye_dots']", "['scarf','cornea','eye_dots','helper','deformer']")
source=source.replace("if 'body' in name:", "if 'body' in name or 'skin' in name:")
source=source.replace("ps=[images.get(f'TEX-rain_body_diffuse.{1001+i}.png') for i in range(3)]", "ps=[images.get((f'TEX-rain_body_diffuse.{1001+i}.png' if who=='rain' else f'skin_diffuse.{1001+i}.png')) for i in range(3)]")
source=source.replace("if who=='rain' and all(ps):", "if all(ps):")
source=source.replace("m=me.materials[mi] if me.materials else None", "m=o.material_slots[mi].material if mi<len(o.material_slots) else (me.materials[mi] if mi<len(me.materials) else None)")
source=source.replace("uv=list(me.uv_layers.active.data[li].uv) if me.uv_layers.active else [0,0]", "uv_layer=next((layer for layer in me.uv_layers if layer.active_render),me.uv_layers.active);uv=list(uv_layer.data[li].uv) if uv_layer else [0,0]")
# Keep the artist's hair surface, bending the straight rig rest shape into a relaxed arc.
source=source.replace("coords=np.asarray(coords);faces=", "coords=np.asarray(coords)\n  if who=='rain' and 'hair_ponytail' in o.name:\n   d=np.clip((-coords[:,2]-.12)/.45,0,1);angle=-1.10*d;yy=coords[:,1]-1.753;zz=coords[:,2]+.12;coords[:,1]=1.753+yy*np.cos(angle)-zz*np.sin(angle);coords[:,2]=-.12+yy*np.sin(angle)+zz*np.cos(angle)\n  faces=")
compile(source,'generated-asset-converter','exec')
for who in ['rain','snow']:
    script=source.replace("for who in ['rain','snow']:","for who in ['"+who+"']:")
    p=pathlib.Path('asset-audit')/('convert-'+who+'.py');p.write_text(script)
    result=subprocess.run([sys.executable,'-u',str(p)],timeout=300)
    output=pathlib.Path('asset-audit')/(who+'-tennis.glb')
    if result.returncode or not output.exists():raise RuntimeError(who+' conversion failed: '+str(result.returncode))
    raw=output.read_bytes();size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);assert all(m['primitives'] for m in doc['meshes']), 'Missing artist mesh primitives'
