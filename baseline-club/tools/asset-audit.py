"""Inspect authorized Blender Studio files without running embedded Python.
Executed by the isolated asset workflow; not part of browser runtime.
"""
import bpy, json, pathlib, sys, traceback
base=pathlib.Path('asset-audit').resolve(); base.mkdir(exist_ok=True)
def scalar(v):
 if isinstance(v,(str,int,float,bool)):return v
 try:return list(v)
 except:return str(v)
for who in ['rain','snow']:
 files=list((base/who).rglob('*.blend'))
 if not files: continue
 f=max(files,key=lambda p:p.stat().st_size)
 print('OPEN',who,str(f),flush=True)
 bpy.ops.wm.open_mainfile(filepath=str(f),use_scripts=False)
 bpy.context.scene.frame_set(1)
 report={'who':who,'source':str(f),'objects':[],'armatures':[],'materials':[]}
 for o in bpy.data.objects:
  if o.type=='MESH':report['objects'].append({'name':o.name,'verts':len(o.data.vertices),'faces':len(o.data.polygons),'hide':o.hide_get(),'hideRender':o.hide_render,'collections':[c.name for c in o.users_collection],'groups':[g.name for g in o.vertex_groups],'modifiers':[(m.name,m.type) for m in o.modifiers],'materials':[m.name if m else None for m in o.data.materials]})
  if o.type=='ARMATURE':report['armatures'].append({'name':o.name,'bones':[{'name':b.name,'parent':b.parent.name if b.parent else None,'deform':b.use_deform,'head':list(b.head_local),'tail':list(b.tail_local)} for b in o.data.bones]})
 for m in bpy.data.materials:
  nodes=[]
  if m.node_tree:
   for n in m.node_tree.nodes:
    nodes.append({'name':n.name,'type':n.type,'image':n.image.name if hasattr(n,'image') and n.image else None,'group':n.node_tree.name if n.type=='GROUP' and n.node_tree else None,'inputs':{i.name:scalar(i.default_value) for i in n.inputs if hasattr(i,'default_value') and not i.is_linked}})
  report['materials'].append({'name':m.name,'diffuse':list(m.diffuse_color),'nodes':nodes})
 (base/(who+'-inspection.json')).write_text(json.dumps(report,indent=2,default=str))
 def unhide(layer):
  layer.exclude=False;layer.hide_viewport=False
  for c in layer.children:unhide(c)
 unhide(bpy.context.view_layer.layer_collection)
 for c in bpy.data.collections:c.hide_viewport=False
 for o in bpy.data.objects:
  if o.type=='ARMATURE':o.data.pose_position='REST';o.hide_set(False);o.hide_viewport=False
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render and not o.name.lower().startswith(('wgt','cs_')) and len(o.data.vertices)>10 and any(m.type=='ARMATURE' for m in o.modifiers)]
 print('EXPORT MESHES',[(o.name,len(o.data.vertices)) for o in meshes],flush=True)
 bpy.ops.object.select_all(action='DESELECT');arms=set()
 for o in meshes:
  o.hide_set(False);o.hide_viewport=False;o.select_set(True)
  for mod in o.modifiers:
   if mod.type=='ARMATURE' and mod.object:arms.add(mod.object)
   if mod.type=='SUBSURF':mod.levels=1;mod.render_levels=1
 for o in arms:o.select_set(True)
 args=dict(filepath=str(base/(who+'-native.glb')),export_format='GLB',use_selection=True,export_animations=False,export_apply=True,export_morph=False,export_skins=True,export_def_bones=True,export_image_format='JPEG',export_jpeg_quality=88)
 allowed=bpy.ops.export_scene.gltf.get_rna_type().properties.keys();args={k:v for k,v in args.items() if k in allowed}
 try:bpy.ops.export_scene.gltf(**args)
 except Exception:traceback.print_exc()
 print('FINISH',who,flush=True)
