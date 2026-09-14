# -*- coding: utf-8 -*-
"""露丝 09 · 修正马尾 + 自动权重绑定 + 权重覆盖 + A-Pose

四件事：

1. 修正 PONYTAIL 顶点组
   实测马尾末端在 z≈1.22（颈部高度），是一条中长马尾，不是垂到背部的长马尾。
   原分类把「头部两侧垂发」(z 1.14~1.22, |x| 到 0.19) 和「裙子上方的深色碎片」
   (z 0.78~0.82) 也算进了马尾。这里按几何重新划分：
   真马尾 = z ∈ [1.18, 1.48] 且 y > 0.04 且 |x| < 0.11；其余还给 HAIR。

2. 自动权重绑定
   网格已焊接成封闭流形，heat map 自动权重能正常工作。

3. 手动覆盖关键部位权重
   自动权重在「手臂贴着裙子」这种近距离下会把手骨权重漏到裙子上，
   所以刚性/半刚性部位直接写死：
     VISOR / HEAD_RIGID / HAIR → Head
     PONYTAIL                  → 马尾骨链（按高度渐变）
     SKIRT                     → 裙骨 + Hips（按高度渐变，按方位分配）
     SHOE_*                    → Foot / Toe
     SOCK_*                    → Shin / Foot

4. A-Pose
   摆好 38° 后把变形烘进网格并把 pose 写成新 rest pose。
   权重表是「顶点↔骨骼」的绑定关系，与 rest pose 无关，所以改 rest pose
   不需要重算权重。

在 Blender 里跑：
    exec(open('.../coach/tools/09_bind_apose.py', encoding='utf-8').read())
"""

import bpy
import json
import math
import os
from mathutils import Vector, Matrix, Quaternion

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "09_bind.json")
BLEND = os.path.join(PROJ, "build", "coach_bound.blend")
BACKUP = os.path.join(PROJ, "build", "coach_pre_apose.blend")

ob = bpy.data.objects["Coach_Welded"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data

# ---------------------------------------------------------------- 1. 修正马尾
gi = {g.name: g.index for g in ob.vertex_groups}
pony_gi = gi["grp_PONYTAIL"]
hair_gi = gi["grp_HAIR"]

true_pony, moved_back = [], 0
for v in me.vertices:
    in_pony = any(g.group == pony_gi for g in v.groups)
    if not in_pony:
        continue
    if 1.18 <= v.co.z <= 1.48 and v.co.y > 0.04 and abs(v.co.x) < 0.11:
        true_pony.append(v.index)
    else:
        moved_back += 1

ob.vertex_groups["grp_PONYTAIL"].remove(
    [v.index for v in me.vertices if any(g.group == pony_gi for g in v.groups)]
)
ob.vertex_groups["grp_PONYTAIL"].add(true_pony, 1.0, "REPLACE")
ob.vertex_groups["grp_HAIR"].add(
    [
        v.index
        for v in me.vertices
        if any(g.group == pony_gi for g in v.groups)
    ],
    1.0,
    "REPLACE",
)
print(f"马尾顶点组修正：真马尾 {len(true_pony)}，还给 HAIR {moved_back}")
if true_pony:
    zs = [me.vertices[i].co.z for i in true_pony]
    ys = [me.vertices[i].co.y for i in true_pony]
    print(f"  真马尾 z {min(zs):.3f}~{max(zs):.3f}  y {min(ys):.3f}~{max(ys):.3f}")

# 马尾骨压成 3 节（马尾只有 ~0.28 m，4 节过密）
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones
for n in ("Ponytail4",):
    if n in eb:
        eb.remove(eb[n])
PONY_PATH = [
    (0.020, 0.088, 1.455),
    (0.020, 0.128, 1.330),
    (0.014, 0.126, 1.252),
    (0.010, 0.112, 1.195),
]
for i in range(3):
    b = eb[f"Ponytail{i + 1}"]
    b.head = Vector(PONY_PATH[i])
    b.tail = Vector(PONY_PATH[i + 1])
    if i > 0:
        b.parent = eb[f"Ponytail{i}"]
        b.use_connect = True
bpy.ops.object.mode_set(mode="OBJECT")
print("马尾骨改为 3 节")

# ---------------------------------------------------------------- 2. 自动权重
for m in list(ob.modifiers):
    ob.modifiers.remove(m)
ob.parent = None
ob.matrix_world = Matrix.Identity(4)

bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
print(f"自动权重完成，顶点组 {len(ob.vertex_groups)} 个")

bpy.ops.wm.save_as_mainfile(filepath=BACKUP)
print(f"备份（A-Pose 之前）{BACKUP}")

# ---------------------------------------------------------------- 3. 权重覆盖
vg = ob.vertex_groups
deform_bones = [b.name for b in rig.data.bones if b.use_deform]
idx_of = {}
for name in deform_bones:
    idx_of[name] = vg[name].index if name in vg else vg.new(name=name).index


def clear_all(vi):
    for g in vg:
        g.remove([vi])


def verts_in(group_name):
    if group_name not in vg:
        return []
    g = vg[group_name]
    return [v.index for v in me.vertices if any(gg.group == g.index for gg in v.groups)]


def assign(vi, bone, w):
    g = vg[bone] if bone in vg else vg.new(name=bone)
    g.add([vi], w, "REPLACE")


overrides = {}

# --- 刚性部位：帽子 / 眼镜 / 头部头发 → Head
for gname in ("grp_VISOR", "grp_HEAD_RIGID", "grp_HAIR"):
    vs = verts_in(gname)
    head_vg = vg["Head"]
    for g in vg:
        if g.name not in (gname,):
            g.remove(vs)
    head_vg.add(vs, 1.0, "REPLACE")
    overrides[gname] = f"{len(vs)} → Head 100%"

# --- 马尾 → 马尾骨链（按高度渐变）
vs = verts_in("grp_PONYTAIL")
if vs:
    for g in vg:
        g.remove(vs)
    segs = [(1.455, 1.330, "Ponytail1"), (1.330, 1.252, "Ponytail2"), (1.252, 1.180, "Ponytail3")]
    for vi in vs:
        z = me.vertices[vi].co.z
        # 找到相邻两节做线性混合
        w = {}
        if z >= 1.330:
            t = min(1.0, (1.455 - z) / (1.455 - 1.330))
            w = {"Ponytail1": 1.0 - t * 0.5, "Ponytail2": t * 0.5}
        elif z >= 1.252:
            t = (1.330 - z) / (1.330 - 1.252)
            w = {"Ponytail1": (1 - t) * 0.5, "Ponytail2": 0.5, "Ponytail3": t * 0.5}
        else:
            t = max(0.0, (1.252 - z) / 0.072)
            w = {"Ponytail2": (1 - t) * 0.5, "Ponytail3": 0.5 + t * 0.5}
        tot = sum(w.values())
        for bname, ww in w.items():
            vg[bname].add([vi], ww / tot, "REPLACE")
    overrides["grp_PONYTAIL"] = f"{len(vs)} → 马尾骨链渐变"

# --- 裙子 → 裙骨 + Hips（按高度，按方位分配）
vs = verts_in("grp_SKIRT")
if vs:
    for g in vg:
        g.remove(vs)
    zmin, zmax = 0.760, 1.042
    DIRS = {
        "F": Vector((0.0, -1.0)),
        "B": Vector((0.0, 1.0)),
        "L": Vector((1.0, 0.0)),
        "R": Vector((-1.0, 0.0)),
    }
    for vi in vs:
        co = me.vertices[vi].co
        t = min(1.0, max(0.0, (zmax - co.z) / (zmax - zmin)))  # 0=腰 1=摆
        swing = t ** 2 * 0.9                                    # 越靠下摆越跟裙骨
        w = {"Hips": 1.0 - swing}
        if swing > 1e-4:
            d = Vector((co.x, co.y - (-0.042)))
            if d.length > 1e-6:
                d.normalize()
                ws = {k: max(0.0, d.dot(v)) ** 2 for k, v in DIRS.items()}
                tot = sum(ws.values()) or 1.0
                for k, ww in ws.items():
                    if ww > 1e-6:
                        w[f"Skirt{k}1"] = swing * ww / tot * 0.55
                        w[f"Skirt{k}2"] = swing * ww / tot * 0.45
        tot = sum(w.values())
        for bname, ww in w.items():
            vg[bname].add([vi], ww / tot, "REPLACE")
    overrides["grp_SKIRT"] = f"{len(vs)} → Hips + 4 向裙骨渐变"

# --- 鞋 / 袜
SHOE_MAP = {
    "grp_SHOE_L": ("LeftFoot", "LeftToeBase"),
    "grp_SHOE_DARK_L": ("LeftFoot", "LeftToeBase"),
    "grp_SHOE_R": ("RightFoot", "RightToeBase"),
    "grp_SHOE_DARK_R": ("RightFoot", "RightToeBase"),
}
for gname, (foot, toe) in SHOE_MAP.items():
    vs = verts_in(gname)
    if not vs:
        continue
    for g in vg:
        g.remove(vs)
    for vi in vs:
        co = me.vertices[vi].co
        # 脚尖前方 40% 分给 toe
        t = min(1.0, max(0.0, (-co.y - 0.02) / 0.10))
        vg[foot].add([vi], 1.0 - t * 0.85, "REPLACE")
        vg[toe].add([vi], t * 0.85, "REPLACE")
    overrides[gname] = f"{len(vs)} → {foot}/{toe}"

SOCK_MAP = {"grp_SOCK_L": ("LeftFoot", "LeftLeg"), "grp_SOCK_R": ("RightFoot", "RightLeg")}
for gname, (foot, shin) in SOCK_MAP.items():
    vs = verts_in(gname)
    if not vs:
        continue
    for g in vg:
        g.remove(vs)
    zmin, zmax = 0.10, 0.27
    for vi in vs:
        z = me.vertices[vi].co.z
        t = min(1.0, max(0.0, (z - zmin) / (zmax - zmin)))
        vg[foot].add([vi], 1.0 - t * 0.8, "REPLACE")
        vg[shin].add([vi], t * 0.8, "REPLACE")
    overrides[gname] = f"{len(vs)} → {foot}/{shin}"

print("\n权重覆盖：")
for k, v in overrides.items():
    print(f"  {k:<18} {v}")

# ---------------------------------------------------------------- 4. A-Pose
APOSE_DEG = 38.0
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")


def aim(bone_name, target_dir, deg=None):
    pb = rig.pose.bones[bone_name]
    head = pb.head.copy()
    cur = (pb.tail - pb.head).normalized()
    tgt = Vector(target_dir).normalized()
    q = cur.rotation_difference(tgt)
    M = (
        Matrix.Translation(head)
        @ q.to_matrix().to_4x4()
        @ Matrix.Translation(-head)
        @ pb.matrix
    )
    pb.matrix = M


rad = math.radians(APOSE_DEG)
# 上臂：向外张开 38°
aim("LeftArm", (math.sin(rad), 0.0, -math.cos(rad)))
aim("RightArm", (-math.sin(rad), 0.0, -math.cos(rad)))
bpy.context.view_layer.update()
# 前臂：略向内收，模仿自然 A-Pose
rad2 = math.radians(APOSE_DEG * 0.55)
aim("LeftForeArm", (math.sin(rad2), 0.0, -math.cos(rad2)))
aim("RightForeArm", (-math.sin(rad2), 0.0, -math.cos(rad2)))
bpy.context.view_layer.update()

print(f"\nA-Pose 完成（上臂外张 {APOSE_DEG}°）")
for n in ("LeftArm", "LeftForeArm"):
    pb = rig.pose.bones[n]
    print(f"  {n} head={tuple(round(c,3) for c in pb.head)} tail={tuple(round(c,3) for c in pb.tail)}")

# 把 Pose 烘进网格
bpy.ops.object.mode_set(mode="OBJECT")
bpy.context.view_layer.objects.active = ob
for m in list(ob.modifiers):
    if m.type == "ARMATURE":
        bpy.ops.object.modifier_apply(modifier=m.name)
        print("已把 A-Pose 变形烘进网格")

# Pose 写成新 rest pose
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode="OBJECT")
print("A-Pose 已写成 rest pose")

# 重新挂 Armature 修改器（权重表还在，不需要重算）
mod = ob.modifiers.new("Armature", "ARMATURE")
mod.object = rig
ob.parent = rig
ob.matrix_parent_inverse = rig.matrix_world.inverted()

# 校正平滑：改善肩、胯这些三角面密集区的形变
cs = ob.modifiers.new("CorrectiveSmooth", "CORRECTIVE_SMOOTH")
cs.smooth_type = "LENGTH_WEIGHTED"
cs.factor = 0.5
cs.iterations = 5
cs.use_only_smooth = False
cs.rest_source = "ORCO"

bb = [v.co for v in me.vertices]
print(
    f"\nA-Pose 后网格包围盒  x[{min(p.x for p in bb):.3f},{max(p.x for p in bb):.3f}] "
    f"z[{min(p.z for p in bb):.3f},{max(p.z for p in bb):.3f}]"
)

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "apose_deg": APOSE_DEG,
            "overrides": overrides,
            "true_ponytail_verts": len(true_pony),
            "modifiers": [(m.name, m.type) for m in ob.modifiers],
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"报告 {OUT}\n工作文件 {BLEND}")
