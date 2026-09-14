# -*- coding: utf-8 -*-
"""露丝 08e · 马尾/头部形状单独渲染

马尾用「高度切片取平均」求中心线失败了：中途出现空切片，低处 x 中心跳到 -0.0885，
说明它是一条扁带而且分股，平均值会把几股混在一起。

先只把头发和马尾单独渲染出来看清楚走向，再定骨。同时把修正后的手臂/裙骨一起验收。

在 Blender 里跑：
    exec(open('.../coach/tools/08e_mesh_check.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import math
import os
import numpy as np
from mathutils import Vector, Matrix

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
PREVIEW = os.path.join(PROJ, "build", "preview")
os.makedirs(PREVIEW, exist_ok=True)

ob = bpy.data.objects["Coach_Welded"]
me = ob.data
gi = {g.name: g.index for g in ob.vertex_groups}

GROUP_SETS = {
    "ponytail": ["grp_PONYTAIL"],
    "head": ["grp_HAIR", "grp_PONYTAIL", "grp_VISOR", "grp_HEAD", "grp_HEAD_RIGID"],
    "arm": ["grp_BODY"],
}

# ---------------------------------------------------------------- 先给马尾做细切片分析
want = {gi[n] for n in GROUP_SETS["ponytail"] if n in gi}
pony = [v for v in me.vertices if any(g.group in want for g in v.groups)]
zs = [v.co.z for v in pony]
zmin, zmax = min(zs), max(zs)
print(f"马尾顶点 {len(pony)}  z {zmin:.3f}~{zmax:.3f}\n")
print("细切片（每 4cm，给出 x/y 的 min ~ max ~ 中点）：")
STEP = 0.04
z = zmin
while z < zmax:
    sl = [v for v in pony if z <= v.co.z < z + STEP]
    if sl:
        xs = [v.co.x for v in sl]
        ys = [v.co.y for v in sl]
        print(
            f"  z={z:.3f}~{z + STEP:.3f}  n={len(sl):>4}  "
            f"x[{min(xs):>7.3f},{max(xs):>7.3f}] 中={(min(xs) + max(xs)) / 2:>7.3f}  "
            f"y[{min(ys):>7.3f},{max(ys):>7.3f}] 中={(min(ys) + max(ys)) / 2:>7.3f}"
        )
    else:
        print(f"  z={z:.3f}~{z + STEP:.3f}  n=0   ← 空")
    z += STEP


# ---------------------------------------------------------------- 单独提取渲染
def subset_object(name, groups, color):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    idxs = {gi[n] for n in groups if n in gi}
    keep_v = set()
    for v in me.vertices:
        if any(g.group in idxs for g in v.groups):
            keep_v.add(v.index)

    nm = me.copy()
    o = bpy.data.objects.new(name, nm)
    bpy.context.scene.collection.objects.link(o)

    bm = bmesh.new()
    bm.from_mesh(nm)
    bm.faces.ensure_lookup_table()
    dead = [f for f in bm.faces if not all(v.index in keep_v for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(nm)
    bm.free()

    m = bpy.data.materials.new(name + "_mat")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*color, 1)
    nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
    nm.materials.clear()
    nm.materials.append(m)
    for p in nm.polygons:
        p.material_index = 0
    return o


pony_ob = subset_object("CHECK_PONY", GROUP_SETS["ponytail"], (0.85, 0.25, 0.85))
head_ob = subset_object(
    "CHECK_HEAD", GROUP_SETS["head"], (0.35, 0.45, 0.95)
)
print(f"\n马尾单独网格：{len(pony_ob.data.polygons)} 面")
print(f"头部组网格：{len(head_ob.data.polygons)} 面")

# ---------------------------------------------------------------- 渲染
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 560, 700
scene.view_settings.view_transform = "Standard"

ob.hide_render = True
world = bpy.data.worlds.get("ChkWorld") or bpy.data.worlds.new("ChkWorld")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.10, 0.10, 0.12, 1)
nt.links.new(bg.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])

# 顺便把修正后的骨架也渲染出来对照
rig = bpy.data.objects["Ruth_Rig"]
bpy.data.objects.remove(bpy.data.objects["BONE_VIS"], do_unlink=True) if bpy.data.objects.get("BONE_VIS") else None
bmv = bmesh.new()
Z = Vector((0, 0, 1))
for bone in rig.data.bones:
    h, t = bone.head_local, bone.tail_local
    d = t - h
    L = d.length
    if L < 1e-5:
        continue
    q = Z.rotation_difference(d.normalized())
    r = 0.006
    ret = bmesh.ops.create_cone(
        bmv, cap_ends=True, segments=6, radius1=r, radius2=r, depth=L
    )
    bmesh.ops.transform(
        bmv, matrix=Matrix.Translation(h + d / 2) @ q.to_matrix().to_4x4(), verts=ret["verts"]
    )
bme = bpy.data.meshes.new("BONE_VIS2_Mesh")
bmv.to_mesh(bme)
bmv.free()
vis = bpy.data.objects.new("BONE_VIS2", bme)
scene.collection.objects.link(vis)
bm2 = bpy.data.materials.new("BoneOrange2")
bm2.use_nodes = True
nt2 = bm2.node_tree
nt2.nodes.clear()
em2 = nt2.nodes.new("ShaderNodeEmission")
em2.inputs[0].default_value = (1.0, 0.42, 0.02, 1)
nt2.links.new(em2.outputs[0], nt2.nodes.new("ShaderNodeOutputMaterial").inputs[0])
bme.materials.append(bm2)

# 隐藏模型本体，只留头发 + 骨骼
body_hidden = ob.hide_render
for o in bpy.data.objects:
    if o.type == "MESH" and o.name not in ("CHECK_PONY", "CHECK_HEAD", "BONE_VIS2"):
        o.hide_render = True


def cam_and_render(tag, loc, rot, scale=0.9, center=(0.0, 0.0, 1.25)):
    name = "ChkCam_" + tag
    c = bpy.data.objects.get(name)
    if c is None:
        cd = bpy.data.cameras.new(name)
        cd.type = "ORTHO"
        c = bpy.data.objects.new(name, cd)
        scene.collection.objects.link(c)
    c.data.ortho_scale = scale
    c.location = loc
    c.rotation_euler = [math.radians(a) for a in rot]
    scene.camera = c
    scene.render.filepath = os.path.join(PREVIEW, f"08e_{tag}.png")
    bpy.ops.render.render(write_still=True)
    print("  渲染", scene.render.filepath)


cam_and_render("pony_front", (0.0, -2.0, 1.25), (90, 0, 0))
cam_and_render("pony_right", (2.0, 0.0, 1.25), (90, 0, 90))
cam_and_render("pony_back", (0.0, 2.0, 1.25), (90, 0, 180))

# 头部 + 骨骼全貌
head_ob.hide_render = True
pony_ob.hide_render = False
cam_and_render("head_wire", (0.0, -2.0, 1.25), (90, 0, 0), scale=0.75)

# 还原
for o in bpy.data.objects:
    if o.type == "MESH":
        o.hide_render = False
ob.hide_render = False
print("\n完成")
