# -*- coding: utf-8 -*-
"""露丝 08b · 骨骼位置验收图

视口截图的视角不可靠，所以我改成确定性做法：
把骨架生成真实几何（每根骨一个圆柱 + 两端小球），渲染在模型线稿之上。
正视 + 侧视各一张，关节位置对不对一眼可见。

模型用 Wireframe 修改器变成细线稿，骨骼用发光橙，背景白。

在 Blender 里跑：
    exec(open('.../coach/tools/08b_rig_check.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import math
import os
from mathutils import Vector, Matrix

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
PREVIEW = os.path.join(PROJ, "build", "preview")
os.makedirs(PREVIEW, exist_ok=True)

rig = bpy.data.objects["Ruth_Rig"]
mesh_ob = bpy.data.objects["Coach_Welded"]

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 640, 940
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"

# ---------------------------------------------------------------- 骨骼几何
old = bpy.data.objects.get("BONE_VIS")
if old:
    bpy.data.objects.remove(old, do_unlink=True)

bm = bmesh.new()
Z = Vector((0, 0, 1))

for bone in rig.data.bones:
    h, t = bone.head_local, bone.tail_local
    d = t - h
    L = d.length
    if L < 1e-5:
        continue
    q = Z.rotation_difference(d.normalized())
    M = Matrix.Translation(h + d / 2) @ q.to_matrix().to_4x4()

    r = 0.0075
    ret = bmesh.ops.create_cone(
        bm, cap_ends=True, segments=8, radius1=r, radius2=r, depth=L
    )
    bmesh.ops.transform(bm, matrix=M, verts=ret["verts"])

    for p in (h, t):
        s = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.011)
        bmesh.ops.transform(
            bm, matrix=Matrix.Translation(p), verts=s["verts"]
        )

bme = bpy.data.meshes.new("BONE_VIS_Mesh")
bm.to_mesh(bme)
bm.free()
vis = bpy.data.objects.new("BONE_VIS", bme)
scene.collection.objects.link(vis)

bmat = bpy.data.materials.new("BoneOrange")
bmat.use_nodes = True
nt = bmat.node_tree
nt.nodes.clear()
em = nt.nodes.new("ShaderNodeEmission")
em.inputs[0].default_value = (1.0, 0.35, 0.02, 1)
em.inputs[1].default_value = 1.4
nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
bme.materials.append(bmat)

print(f"骨骼可视几何：{len(bme.vertices)} 顶点")

# ---------------------------------------------------------------- 模型线稿
old = bpy.data.objects.get("MESH_WIRE")
if old:
    bpy.data.objects.remove(old, do_unlink=True)

wme = mesh_ob.data.copy()
wire = bpy.data.objects.new("MESH_WIRE", wme)
scene.collection.objects.link(wire)

wmat = bpy.data.materials.new("MeshWire")
wmat.use_nodes = True
wnt = wmat.node_tree
wnt.nodes.clear()
wem = wnt.nodes.new("ShaderNodeEmission")
wem.inputs[0].default_value = (0.55, 0.58, 0.65, 1)
wnt.links.new(wem.outputs[0], wnt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
wme.materials.clear()
wme.materials.append(wmat)
for p in wme.polygons:
    p.material_index = 0

wf = wire.modifiers.new("Wireframe", "WIREFRAME")
wf.thickness = 0.0011
wf.use_replace = True

mesh_ob.hide_render = True

# ---------------------------------------------------------------- 世界/相机
world = bpy.data.worlds.get("RigWorld") or bpy.data.worlds.new("RigWorld")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (1.0, 1.0, 1.0, 1)
bg.inputs[1].default_value = 1.0
nt.links.new(bg.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])

# 隐藏之前留下的多余相机/灯，避免干扰
for o in bpy.data.objects:
    if o.type in ("LIGHT", "CAMERA") and o.name not in ("RigCam_front", "RigCam_left"):
        o.hide_render = True


def cam(name, loc, rot):
    c = bpy.data.objects.get(name)
    if c is None:
        cd = bpy.data.cameras.new(name)
        cd.type = "ORTHO"
        cd.ortho_scale = 1.80
        c = bpy.data.objects.new(name, cd)
        scene.collection.objects.link(c)
    c.location = loc
    c.rotation_euler = [math.radians(a) for a in rot]
    return c


views = [
    ("front", (0.0, -3.0, 0.85), (90, 0, 0)),
    ("left", (-3.0, 0.0, 0.85), (90, 0, -90)),
    ("right", (3.0, 0.0, 0.85), (90, 0, 90)),
]
for name, loc, rot in views:
    c = cam("RigCam_" + name, loc, rot)
    scene.camera = c
    scene.render.filepath = os.path.join(PREVIEW, f"08_rigcheck_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  渲染", scene.render.filepath)

# ---------------------------------------------------------------- 还原
mesh_ob.hide_render = False
EOF = None
