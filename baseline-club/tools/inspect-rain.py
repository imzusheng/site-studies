import bpy,json
from pathlib import Path
out={"objects":[],"armatures":[],"images":[]}
for o in bpy.data.objects:
 if o.type=='MESH':
  out['objects'].append({'name':o.name,'verts':len(o.data.vertices),'hide':o.hide_render,'modifiers':[(m.name,m.type,getattr(m,'object',None).name if getattr(m,'object',None) else None) for m in o.modifiers], 'materials':[m.name if m else None for m in o.data.materials],'groups':[g.name for g in o.vertex_groups]})
 if o.type=='ARMATURE':
  out['armatures'].append({'name':o.name,'matrix':[list(r) for r in o.matrix_world], 'props':list(o.keys()),'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'head':list(b.head_local),'tail':list(b.tail_local),'deform':b.use_deform,'constraints':[(c.type,getattr(c,'subtarget',None)) for c in o.pose.bones[b.name].constraints]} for b in o.data.bones]})
for im in bpy.data.images:out['images'].append({'name':im.name,'path':im.filepath,'packed':bool(im.packed_file),'size':list(im.size)})
Path(__file__).resolve().parents[1].joinpath('.cache/rain-inspect.json').write_text(json.dumps(out,indent=2),encoding='utf8')
print('INSPECT_COMPLETE',len(out['objects']),[(a['name'],len(a['bones'])) for a in out['armatures']])
