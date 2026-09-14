# -*- coding: utf-8 -*-
"""露丝 13 · 自包含重建：源 glb → 分类 → 骨架 → A-Pose

为什么自包含：MCP 里 open_mainfile 之后 bpy.context 会变成受限 Context
（没有 selected_objects），后续 mode_set 全部失败。而掰 A-Pose 会永久改网格，
重跑需要回到干净状态。所以这里从源 glb 重新导入，一条链做完，可反复重跑。

关键修正（对比上一版）：
  上一版的候选判据只有「|x| 大 + 在某个高度带 + 不在裙子组」，
  结果把两样东西误当成手臂带走了：
    a) 裙子上的藏青条纹（属于 grp_NAVY，不在排列表里）
    b) 大腿顶部顶点 —— 自然下垂时手正好在大腿外侧同一高度，距离很近
  改成 **「到手臂骨链的距离必须是三者中最小」**（比到腿骨、到躯干骨都近）
  才算手臂顶点，这两类就都被正确排除了。

在 Blender 里跑：
    exec(open('.../coach/tools/13_rebuild_apose.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import json
import math
import os
from collections import Counter, defaultdict
from mathutils import Vector, Matrix
import numpy as np

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
SRC = os.path.join(PROJ, "reference", "Coach_High_Source.glb")
OUT = os.path.join(PROJ, "reports", "13_rebuild.json")
BLEND = os.path.join(PROJ, "build", "coach_apose.blend")
PREVIEW = os.path.join(PROJ, "build", "preview")
os.makedirs(PREVIEW, exist_ok=True)

TARGET_H = 1.65
WELD = 1e-5
APOSE_DEG = 38.0

# ---------------------------------------------------------------- 1. 清空 + 导入
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
print("场景已清空")

bpy.ops.import_scene.gltf(filepath=SRC)
src_ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
me = src_ob.data
print(f"导入 {src_ob.name}：{len(me.vertices)} 顶点 / {len(me.polygons)} 面")

ob = src_ob
ob.name = "Coach_Welded"
ob.data.name = "Coach_Welded_Mesh"

# ---------------------------------------------------------------- 2. 焊接
bm = bmesh.new()
bm.from_mesh(me)
before = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=WELD)
after = len(bm.verts)
bm.to_mesh(me)
bm.free()
me.update()
print(f"焊接：{before} → {after} 顶点（合并掉 UV/法线拆出来的重复点）")

# ---------------------------------------------------------------- 3. 统一到 Z-up + 归一到 1.65 m
# 坑一：glTF 导入器把 Y-up→Z-up 放在**对象旋转**上，而且 rotation_mode 是 QUATERNION，
#       所以 ob.rotation_euler = (0,0,0) 不会清掉它（要写 matrix_basis）。
#       不清掉就会出现「网格转了 90°，对象还留着 90°」= 180°，模型直接翻倒。
# 坑二：导入器有时又不加那个旋转。所以不要猜，先把对象变换烘进网格，
#       之后网格本地坐标就等于世界坐标，再用「范围最大的轴就是身高轴」判断。
me.transform(ob.matrix_world)
ob.parent = None
ob.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

ext = [
    max(v.co.x for v in me.vertices) - min(v.co.x for v in me.vertices),
    max(v.co.y for v in me.vertices) - min(v.co.y for v in me.vertices),
    max(v.co.z for v in me.vertices) - min(v.co.z for v in me.vertices),
]
up = ext.index(max(ext))
print(f"烘焙对象变换后轴向范围 x={ext[0]:.4f} y={ext[1]:.4f} z={ext[2]:.4f} → 身高轴 {'xyz'[up]}")
if up == 1:                                   # Y-up（glTF 原生）
    me.transform(Matrix.Rotation(math.radians(90), 4, "X"))
    print("  已把 Y-up 转到 Z-up")
elif up == 0:
    me.transform(Matrix.Rotation(math.radians(-90), 4, "Y"))
    print("  已把 X-up 转到 Z-up")

H0 = max(v.co.z for v in me.vertices) - min(v.co.z for v in me.vertices)
s = TARGET_H / H0
me.transform(Matrix.Scale(s, 4))
me.update()
bb = [v.co for v in me.vertices]
print(f"身高 {H0:.4f} → {TARGET_H} m（缩放 {s:.5f}），"
      f"包围盒 x[{min(p.x for p in bb):.3f},{max(p.x for p in bb):.3f}] "
      f"y[{min(p.y for p in bb):.3f},{max(p.y for p in bb):.3f}] "
      f"z[{min(p.z for p in bb):.3f},{max(p.z for p in bb):.3f}]")
print(f"对象变换复核 loc={tuple(round(v,4) for v in ob.location)} "
      f"mode={ob.rotation_mode} quat={tuple(round(v,4) for v in ob.rotation_quaternion)} "
      f"scale={tuple(round(v,4) for v in ob.scale)}")

# ---------------------------------------------------------------- 4. 分类（位置为主）
mat = None
for slot in ob.material_slots:
    if slot.material:
        mat = slot.material
        break
if mat is None:
    raise RuntimeError("网格上没有材质")
if not mat.use_nodes:
    mat.use_nodes = True
base_img = None
for node in mat.node_tree.nodes:
    if node.type == "TEX_IMAGE" and node.image and "normal" not in node.image.name \
            and "metallic" not in node.image.name:
        base_img = node.image
        break
if base_img is None:
    raise RuntimeError("找不到 BaseColor 贴图")
print(f"材质 {mat.name}，BaseColor 贴图 {base_img.name} {base_img.size[:]}")
w, h = base_img.size
buf = np.empty(w * h * 4, dtype=np.float32)
base_img.pixels.foreach_get(buf)
COL = buf.reshape(h, w, 4)


def sample(u, v):
    x = int(min(max(u, 0.0), 0.999999) * w)
    y = int(min(max(v, 0.0), 0.999999) * h)
    return COL[y, x, :3]


def classify(co, rgb):
    x, y, z = float(co.x), float(co.y), float(co.z)
    r, g, b = [float(c) for c in rgb]
    lum = (r + g + b) / 3.0
    sat = max(r, g, b) - min(r, g, b)
    is_dark = lum < 0.42
    is_white = lum > 0.60 and sat < 0.16
    is_navy = (b > r + 0.03) and lum < 0.78
    is_skin = (r >= g >= b) and (r - b) > 0.055

    if z >= 1.19:                      # 头部：只有这里深色才是头发
        if is_dark:
            if y > 0.04 and abs(x) < 0.11 and z < 1.50:
                return "PONYTAIL"
            return "HAIR"
        if is_white and z > 1.40:
            return "VISOR"
        if is_skin:
            return "HEAD"
        return "HEAD_RIGID"

    if z < 0.16:
        return "SHOE"
    if z < 0.30:
        return "SOCK"

    if is_navy:
        # 裙子上的藏青侧条要归裙子：自然下垂时它到前臂只有 2.2cm、到裙骨 3.9cm，
        # 任何纯距离判据都会把它判给手臂，掰姿势时在裙子上撕出一圈锯齿。
        # 护腕也在同一高度，但它在腕外侧（|x|≈0.185），用 |x| 分开。
        if 0.74 <= z <= 1.06 and abs(x) < 0.17:
            return "SKIRT"
        return "NAVY"
    if is_white:
        return "SKIRT" if z <= 1.05 else "POLO"
    if is_dark:                        # 身上暗部 = 自阴影，按几何归位，绝不判成头发
        if abs(x) > 0.135:
            return "BODY"
        if z < 0.74:
            return "BODY"
        return "SKIRT" if z <= 1.05 else "POLO"
    if is_skin:
        return "BODY"
    return "OTHER"


bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active
labels = []
for f in bm.faces:
    u = sum(l[uvl].uv[0] for l in f.loops) / len(f.loops)
    v = sum(l[uvl].uv[1] for l in f.loops) / len(f.loops)
    labels.append(classify(f.calc_center_median(), sample(u, v)))

final = []
for f in bm.faces:
    lab = labels[f.index]
    if lab in ("SHOE", "SOCK"):
        lab = f"{lab}_L" if f.calc_center_median().x < 0 else f"{lab}_R"
    final.append(lab)

GROUPS = ["BODY", "HEAD", "HAIR", "PONYTAIL", "VISOR", "HEAD_RIGID", "POLO",
          "SKIRT", "NAVY", "SOCK_L", "SOCK_R", "SHOE_L", "SHOE_R", "OTHER"]
for g in list(ob.vertex_groups):
    ob.vertex_groups.remove(g)
vg = {n: ob.vertex_groups.new(name="grp_" + n) for n in GROUPS}
votes = defaultdict(Counter)
for f in bm.faces:
    for v in f.verts:
        votes[v.index][final[f.index]] += 1
group_of = {vi: c.most_common(1)[0][0] for vi, c in votes.items()}
for vi, lab in group_of.items():
    vg[lab].add([vi], 1.0, "REPLACE")
bm.free()
print("分类面数:", dict(Counter(labels).most_common()))
print("顶点组:", {n: sum(1 for l in group_of.values() if l == n) for n in GROUPS})

# ---------------------------------------------------------------- 5. 骨架
BONES = [
    ("Root", (0, 0, 0), (0, -0.15, 0), None, False),
    ("Hips", (0, 0, 0.86), (0, 0, 0.95), "Root", False),
    ("Spine", (0, 0, 0.95), (0, 0, 1.04), "Hips", True),
    ("Spine1", (0, 0, 1.04), (0, 0, 1.13), "Spine", True),
    ("Spine2", (0, 0, 1.13), (0, 0, 1.24), "Spine1", True),
    ("Neck", (0, -0.005, 1.24), (0, -0.010, 1.33), "Spine2", True),
    ("Head", (0, -0.010, 1.33), (0, -0.010, 1.60), "Neck", True),
    ("LeftShoulder", (0.035, 0, 1.21), (0.115, 0, 1.205), "Spine2", False),
    ("LeftArm", (0.115, 0, 1.205), (0.158, -0.017, 0.970), "LeftShoulder", True),
    ("LeftForeArm", (0.158, -0.017, 0.970), (0.1947, -0.0318, 0.770), "LeftArm", True),
    ("LeftHand", (0.1947, -0.0318, 0.770), (0.1836, -0.0289, 0.700), "LeftForeArm", True),
    ("RightShoulder", (-0.035, 0, 1.21), (-0.115, 0, 1.205), "Spine2", False),
    ("RightArm", (-0.115, 0, 1.205), (-0.158, -0.017, 0.970), "RightShoulder", True),
    ("RightForeArm", (-0.158, -0.017, 0.970), (-0.1947, -0.0318, 0.770), "RightArm", True),
    ("RightHand", (-0.1947, -0.0318, 0.770), (-0.1836, -0.0289, 0.700), "RightForeArm", True),
    ("LeftUpLeg", (0.068, 0, 0.80), (0.075, 0.004, 0.44), "Hips", False),
    ("LeftLeg", (0.075, 0.004, 0.44), (0.082, 0.0, 0.11), "LeftUpLeg", True),
    ("LeftFoot", (0.082, 0.0, 0.11), (0.078, -0.075, 0.025), "LeftLeg", True),
    ("LeftToeBase", (0.078, -0.075, 0.025), (0.078, -0.135, 0.020), "LeftFoot", True),
    ("RightUpLeg", (-0.068, 0, 0.80), (-0.075, 0.004, 0.44), "Hips", False),
    ("RightLeg", (-0.075, 0.004, 0.44), (-0.082, 0.0, 0.11), "RightUpLeg", True),
    ("RightFoot", (-0.082, 0.0, 0.11), (-0.078, -0.075, 0.025), "RightLeg", True),
    ("RightToeBase", (-0.078, -0.075, 0.025), (-0.078, -0.135, 0.020), "RightFoot", True),
]
PONY = [(0.020, 0.088, 1.455), (0.020, 0.128, 1.330), (0.014, 0.126, 1.252), (0.010, 0.112, 1.195)]
for i in range(3):
    BONES.append((f"Ponytail{i+1}", PONY[i], PONY[i+1],
                  "Head" if i == 0 else f"Ponytail{i}", i > 0))
SKIRT = {
    "F": ((-0.002, -0.110, 1.042), (0.013, -0.130, 0.760)),
    "B": ((0.000, 0.047, 1.042), (-0.007, 0.116, 0.760)),
    "L": ((0.091, -0.045, 1.042), (0.142, -0.041, 0.760)),
    "R": ((-0.093, -0.045, 1.042), (-0.156, -0.019, 0.760)),
}
for k, (top, bot) in SKIRT.items():
    mid = tuple((np.array(top) + np.array(bot)) / 2)
    BONES.append((f"Skirt{k}1", top, mid, "Hips", False))
    BONES.append((f"Skirt{k}2", mid, bot, f"Skirt{k}1", True))

old = bpy.data.objects.get("Ruth_Rig")
if old:
    bpy.data.objects.remove(old, do_unlink=True)
arm_data = bpy.data.armatures.new("Ruth_Rig_Data")
rig = bpy.data.objects.new("Ruth_Rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
rig.show_in_front = True
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
for name, head, tail, parent, conn in BONES:
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = conn
bpy.ops.object.mode_set(mode="OBJECT")
print(f"骨架 {len(arm_data.bones)} 根骨")

# 记录 rest 骨段，供距离判据使用
REST_SEG = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm_data.bones}


def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


# ---------------------------------------------------------------- 6. 掰 A-Pose
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")


def aim(bone, direction):
    pb = rig.pose.bones[bone]
    head = pb.head.copy()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    pb.matrix = (Matrix.Translation(head) @ q.to_matrix().to_4x4()
                 @ Matrix.Translation(-head) @ pb.matrix)
    bpy.context.view_layer.update()


r1 = math.radians(APOSE_DEG)
r2 = math.radians(APOSE_DEG * 0.55)
r3 = math.radians(APOSE_DEG * 0.22)
aim("LeftArm", (math.sin(r1), 0.0, -math.cos(r1)))
aim("RightArm", (-math.sin(r1), 0.0, -math.cos(r1)))
aim("LeftForeArm", (math.sin(r2), -0.10, -math.cos(r2)))
aim("RightForeArm", (-math.sin(r2), -0.10, -math.cos(r2)))
aim("LeftHand", (math.sin(r3), -0.16, -math.cos(r3)))
aim("RightHand", (-math.sin(r3), -0.16, -math.cos(r3)))
bpy.context.view_layer.update()

delta = {}
new_ht = {}
for b in rig.data.bones:
    pb = rig.pose.bones[b.name]
    delta[b.name] = pb.matrix @ b.matrix_local.inverted()
    new_ht[b.name] = (pb.head.copy(), pb.tail.copy())
for n in ("LeftArm", "LeftForeArm", "LeftHand"):
    pb = rig.pose.bones[n]
    print(f"  {n}: head {tuple(round(c,3) for c in pb.head)} tail {tuple(round(c,3) for c in pb.tail)}")

for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")

# --- 候选顶点：语义分组 + 最近骨，两个条件都要满足
# 这一版把两轮失败的教训合起来：
#   1) 纯距离判据会失败 —— 裙子侧面到前臂 2.2cm、到裙骨 3.9cm，距离分不开；
#   2) 纯分组判据也会失败 —— 裙子的藏青侧条原来归在 NAVY 组，不在排除列表里。
# 所以：先用（已修正的）顶点组排除裙/发/鞋袜，再要求「全局最近骨在手臂链上」。
ARM_CHAIN = ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
             "RightShoulder", "RightArm", "RightForeArm", "RightHand"]
ARM_SET = set(ARM_CHAIN)
ALL_BONES = list(REST_SEG.keys())
MAX_ARM_DIST = 0.09
EXCLUDE = {"grp_SKIRT", "grp_HAIR", "grp_PONYTAIL", "grp_VISOR", "grp_HEAD_RIGID",
           "grp_HEAD", "grp_SHOE_L", "grp_SHOE_R", "grp_SOCK_L", "grp_SOCK_R"}
excl = {ob.vertex_groups[n].index for n in EXCLUDE if n in ob.vertex_groups}

cand = []
skipped_by_group = 0
for v in me.vertices:
    if not (0.40 < v.co.z < 1.40):
        continue
    if any(g.group in excl for g in v.groups):
        skipped_by_group += 1
        continue
    co = v.co
    ds = [(n, seg_dist(co, *REST_SEG[n])) for n in ALL_BONES]
    n0, d0 = min(ds, key=lambda kv: kv[1])
    if n0 in ARM_SET and d0 < MAX_ARM_DIST:
        cand.append(v.index)
print(f"手臂候选顶点 {len(cand)}（按分组排除掉 {skipped_by_group} 个裙/发/鞋袜顶点）")

CHAIN = ARM_CHAIN + ["Hips", "Spine", "Spine1", "Spine2", "Neck",
                     "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]
seg = {n: REST_SEG[n] for n in CHAIN}
moved = 0
mx = 0.0
shifts = []
for vi in cand:
    co = me.vertices[vi].co.copy()
    ds = sorted(((n, seg_dist(co, *seg[n])) for n in CHAIN), key=lambda kv: kv[1])[:4]
    ws = [(n, 1.0 / (d + 1e-4) ** 4) for n, d in ds]
    tot = sum(x[1] for x in ws)
    acc = Vector((0, 0, 0))
    for n, ww in ws:
        acc += (delta[n] @ co) * (ww / tot)
    sh = (acc - co).length
    if sh > 1e-4:
        moved += 1
        mx = max(mx, sh)
        shifts.append(sh)
    me.vertices[vi].co = acc
me.update()
print(f"移动 {moved} 顶点，最大位移 {mx:.4f} m，中位 "
      f"{np.median(shifts) if shifts else 0:.4f} m")

# ---------------------------------------------------------------- 7. 骨架 rest 改成 A-Pose
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones
for name, (hh, tt) in new_ht.items():
    if name in eb:
        eb[name].head = hh
        eb[name].tail = tt
bpy.ops.object.mode_set(mode="OBJECT")

bpy.context.view_layer.objects.active = ob
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
if me.has_custom_normals:
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        print("已清除自定义分割法线")
    except Exception as e:
        print("清法线跳过:", e)
for p in me.polygons:
    p.use_smooth = True

bb = [v.co for v in me.vertices]
print(f"\nA-Pose 网格  x[{min(p.x for p in bb):.3f},{max(p.x for p in bb):.3f}] "
      f"z[{min(p.z for p in bb):.3f},{max(p.z for p in bb):.3f}]  臂展 {max(p.x for p in bb) * 2:.3f} m")

# ---------------------------------------------------------------- 8. 渲染
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 620, 900
scene.view_settings.view_transform = "Standard"
for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
    bpy.data.objects.remove(o, do_unlink=True)


def area(n, loc, rot, size, en, col=(1, 1, 1)):
    ld = bpy.data.lights.new(n, type="AREA")
    ld.size, ld.energy, ld.color = size, en, col
    o = bpy.data.objects.new(n, ld)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(o)


area("K", (-1.1, -1.5, 2.0), (48, 0, -35), 2.2, 300)
area("F", (1.6, -1.0, 1.0), (72, 0, 55), 3.0, 110, (0.85, 0.9, 1.0))
area("R", (0.5, 1.8, 1.7), (120, 0, 165), 2.0, 210, (1.0, 0.95, 0.88))
world = bpy.data.worlds.new("W13")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bgn = nt.nodes.new("ShaderNodeBackground")
bgn.inputs[0].default_value = (0.07, 0.075, 0.085, 1)
bgn.inputs[1].default_value = 0.6
nt.links.new(bgn.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])

for name, loc, rot in [("front", (0, -3.2, 0.85), (90, 0, 0)),
                       ("q34", (2.0, -2.4, 1.35), (78, 0, 40)),
                       ("left", (-3.2, 0, 0.85), (90, 0, -90))]:
    cd = bpy.data.cameras.new("Cam13_" + name)
    cd.type = "ORTHO"
    cd.ortho_scale = 2.1
    c = bpy.data.objects.new("Cam13_" + name, cd)
    c.location = loc
    c.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(c)
    scene.camera = c
    scene.render.filepath = os.path.join(PREVIEW, f"13_apose_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  渲染", scene.render.filepath)

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"apose_deg": APOSE_DEG, "label_counts": dict(Counter(labels)),
               "arm_candidates": len(cand), "arm_verts_moved": moved,
               "max_shift_m": round(mx, 4)}, f, ensure_ascii=False, indent=2)
print(f"\n报告 {OUT}\n工作文件 {BLEND}")
