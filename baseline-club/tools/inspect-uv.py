"""Diagnostics only; called by the conversion wrapper in the isolated worker."""
def inspect_uv(bpy):
 out={'meshes':[],'materials':[]}
 for o in bpy.data.objects:
  if o.type=='MESH' and o.name.startswith('GEO-'):
   out['meshes'].append({'name':o.name,'uvs':[{'name':u.name,'active':u==o.data.uv_layers.active,'render':u.active_render,'min':[min(v.uv[i] for v in u.data) for i in [0,1]] if len(u.data) else [],'max':[max(v.uv[i] for v in u.data) for i in [0,1]] if len(u.data) else []} for u in o.data.uv_layers]})
 def node_tree(tree,seen):
  if tree.name in seen:return []
  seen.add(tree.name);ns=[]
  for n in tree.nodes:
   if n.type in ['UVMAP','ATTRIBUTE','TEX_IMAGE','MAPPING']:
    ns.append({'name':n.name,'type':n.type,'uv':getattr(n,'uv_map',''),'attribute':getattr(n,'attribute_name',''),'image':n.image.name if getattr(n,'image',None) else '', 'links':[(l.from_node.name,l.from_socket.name,l.to_socket.name) for i in n.inputs for l in i.links]})
   if n.type=='GROUP' and n.node_tree:ns+=node_tree(n.node_tree,seen)
  return ns
 for m in bpy.data.materials:
  if m.node_tree:out['materials'].append({'name':m.name,'nodes':node_tree(m.node_tree,set())})
 return out
