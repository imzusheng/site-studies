# -*- coding: utf-8 -*-
"""露丝 14 · 下垂姿势绑定（语义权重）+ 形变测试

为什么不再掰 A-Pose：
  试了 6 轮，判据从「|x|+分组」逐步收紧到「语义分组 + 全局最近骨」，每一轮都能
  修掉上一轮的破面，但总是冒出新的。根因不在判据：
    自然下垂时手/前臂到裙侧只有 2.2 cm，手还贴在大腿上。
    这三个部件的表面在原始几何里就是相互贴合甚至穿插的 —— 掰开必然撕裂，
    判据只能决定「撕哪一边」。这个模型的几何本来就是按下垂姿势生成的。

  所以换成不破坏几何的路线：**保留下垂的完好网格**，rest pose 就是下垂，
  权重用语义分组手工写（绕开自动权重被裙子污染的问题）。
  对游戏运行来说 rest pose 是下垂还是 A-Pose 并不关键，MoCap retarget 会处理差异。

权重策略：
  SKIRT     → Hips + 4 向裙骨（按高度渐变、按方位分配）
  HAIR/VISOR/HEAD_RIGID → Head 100%（帽子眼镜刚性跟头）
  PONYTAIL  → 马尾骨链（按高度）
  SHOE/SOCK → Foot/Toe/Leg
  其余（皮肤、Polo、护腕）→ 距离权重，**并把裙骨和马尾骨排除在外**
              —— 这是关键：免得手被裙骨拉走

在 Blender 里跑：
    exec(open('.../coach/tools/14_bind_natural.py', encoding='utf-8').read())
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
OUT = os.path.join(PROJ, "reports", "14_bind.json")
BLEND = os.path.join(PROJ, "build", "coach_bound.blend")
PREVIEW = os.path.join(PROJ, "build", "deform")
os.makedirs(PREVIEW, exist_ok=True)

TARGET_H = 1.65
WELD = 1e-5

# ---------------------------------------------------------------- 导入 + 预处理
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = [o for o in bpy.data.objects if o.type == "MESH"][0]
me = ob.data
ob.name = "Ruth"
me.name = "Ruth_Mesh"
print(f"导入 {len(me.vertices)} 顶点 / {len(me.polygons)} 面")

bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=WELD)
bm.to_mesh(me)
bm.free()
me.update()
print(f"焊接后 {len(me.vertices)} 顶点")

# 对象变换烘进网格（rotation_mode 是 QUATERNION，写 rotation_euler 无效）
me.transform(ob.matrix_world)
ob.parent = None
ob.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()

ext = [max(v.co[i] for v in me.vertices) - min(v.co[i] for v in me.vertices) for i in range(3)]
up = ext.index(max(ext))
if up == 1:
    me.transform(Matrix.Rotation(math.radians(90), 4, "X"))
elif up == 0:
    me.transform(Matrix.Rotation(math.radians(-90), 4, "Y"))
H0 = max(v.co.z for v in me.vertices) - min(v.co.z for v in me.vertices)
me.transform(Matrix.Scale(TARGET_H / H0, 4))
me.update()
bb = [v.co for v in me.vertices]
print(f"归一化到 {TARGET_H} m：x[{min(p.x for p in bb):.3f},{max(p.x for p in bb):.3f}] "
      f"z[{min(p.z for p in bb):.3f},{max(p.z for p in bb):.3f}]")

# ---------------------------------------------------------------- 分类
mat = None
for slot in ob.material_slots:
    if slot.material:
        mat = slot.material
        break
base_img = None
for node in mat.node_tree.nodes:
    if node.type == "TEX_IMAGE" and node.image and "normal" not in node.image.name \
            and "metallic" not in node.image.name:
        base_img = node.image
        break
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

    # 头部判定必须同时限制 |x|：肩高就是 1.205，只按 z>=1.19 会把肩外侧顶点
    # 判进头部（实测 v(0.178,0.01,1.234) 被给了 Head 1.0），手臂上举时它们不动，
    # 中间被拉成"比手臂长一倍的扁带"。
    if z >= 1.19 and abs(x) < 0.105:
        if is_dark:
            return "PONYTAIL" if (y > 0.04 and abs(x) < 0.11 and z < 1.50) else "HAIR"
        if is_white and z > 1.40:
            return "VISOR"
        return "HEAD" if is_skin else "HEAD_RIGID"
    if z < 0.16:
        return "SHOE"
    if z < 0.30:
        return "SOCK"
    if is_navy:
        if 0.74 <= z <= 1.06 and abs(x) < 0.17:
            return "SKIRT"
        return "NAVY"
    if is_white:
        return "SKIRT" if z <= 1.05 else "POLO"
    if is_dark:
        if abs(x) > 0.135:
            return "BODY"
        if z < 0.74:
            return "BODY"
        return "SKIRT" if z <= 1.05 else "POLO"
    return "BODY" if is_skin else "OTHER"


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
votes = defaultdict(Counter)
for f in bm.faces:
    for v in f.verts:
        votes[v.index][final[f.index]] += 1
vert_label = {vi: c.most_common(1)[0][0] for vi, c in votes.items()}
bm.free()
print("面分类:", dict(Counter(labels).most_common()))

# ---------------------------------------------------------------- 骨架
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
print(f"骨架 {len(arm_data.bones)} 根骨（rest = 自然下垂）")

SEG = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm_data.bones}
SKIRT_BONES = [n for n in SEG if n.startswith("Skirt")]
PONY_BONES = [n for n in SEG if n.startswith("Ponytail")]
BODY_BONES = [n for n in SEG if n not in SKIRT_BONES + PONY_BONES + ["Root"]]
ARM_BONES = ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
             "RightShoulder", "RightArm", "RightForeArm", "RightHand"]


def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


def dist_weights(co, bones, k=4):
    ds = sorted(((seg_dist(co, *SEG[b]), b) for b in bones))[:k]
    ws = [(b, 1.0 / (d + 1e-4) ** 4) for d, b in ds]
    tot = sum(x[1] for x in ws)
    return {b: w / tot for b, w in ws}


# ---------------------------------------------------------------- 写权重
for g in list(ob.vertex_groups):
    ob.vertex_groups.remove(g)
allbones = [b.name for b in arm_data.bones if b.name != "Root"]
vg = {n: ob.vertex_groups.new(name=n) for n in allbones}

SKIRT_TOP, SKIRT_BOT = 1.042, 0.760
SKIRT_CENTER = Vector((0.0, -0.042))
DIRS = {"F": Vector((0.0, -1.0)), "B": Vector((0.0, 1.0)),
        "L": Vector((1.0, 0.0)), "R": Vector((-1.0, 0.0))}
stats = Counter()

for v in me.vertices:
    vi = v.index
    co = v.co
    lab = vert_label.get(vi, "OTHER")
    W = {}

    if lab == "SKIRT":
        t = min(1.0, max(0.0, (SKIRT_TOP - co.z) / (SKIRT_TOP - SKIRT_BOT)))
        swing = t ** 2 * 0.85
        W["Hips"] = 1.0 - swing
        if swing > 1e-4:
            d = Vector((co.x, co.y)) - SKIRT_CENTER
            if d.length > 1e-6:
                d.normalize()
                ws = {k: max(0.0, d.dot(dd)) ** 2 for k, dd in DIRS.items()}
                tot = sum(ws.values()) or 1.0
                for k, ww in ws.items():
                    if ww > 1e-6:
                        W[f"Skirt{k}1"] = swing * ww / tot * 0.55
                        W[f"Skirt{k}2"] = swing * ww / tot * 0.45
        stats["SKIRT"] += 1

    elif lab in ("HAIR", "VISOR", "HEAD_RIGID"):
        W["Head"] = 1.0                     # 帽子/眼镜刚性跟头
        stats[lab] += 1

    elif lab == "HEAD":
        # 脸和脖子：Head 为主，靠近颈根处混 Neck
        t = min(1.0, max(0.0, (co.z - 1.24) / 0.10))
        W["Head"] = 0.35 + 0.65 * t
        W["Neck"] = 1.0 - W["Head"]
        stats["HEAD"] += 1

    elif lab == "PONYTAIL":
        if co.z >= 1.330:
            t = min(1.0, (1.455 - co.z) / 0.125)
            W = {"Ponytail1": 1.0 - t * 0.5, "Ponytail2": t * 0.5}
        elif co.z >= 1.252:
            t = (1.330 - co.z) / 0.078
            W = {"Ponytail1": (1 - t) * 0.5, "Ponytail2": 0.5, "Ponytail3": t * 0.5}
        else:
            t = min(1.0, max(0.0, (1.252 - co.z) / 0.072))
            W = {"Ponytail2": (1 - t) * 0.5, "Ponytail3": 0.5 + t * 0.5}
        stats["PONYTAIL"] += 1

    elif lab in ("SHOE_L", "SHOE_R"):
        s = "L" if lab.endswith("_L") else "R"
        t = min(1.0, max(0.0, (-co.y - 0.02) / 0.10))
        W = {f"LeftFoot" if s == "L" else "RightFoot": 1.0 - t * 0.85,
             f"LeftToeBase" if s == "L" else "RightToeBase": t * 0.85}
        stats[lab] += 1

    elif lab in ("SOCK_L", "SOCK_R"):
        s = "L" if lab.endswith("_L") else "R"
        t = min(1.0, max(0.0, (co.z - 0.10) / 0.17))
        W = {f"LeftFoot" if s == "L" else "RightFoot": 1.0 - t * 0.8,
             f"LeftLeg" if s == "L" else "RightLeg": t * 0.8}
        stats[lab] += 1

    else:
        # 皮肤 / Polo / 护腕 等主体：距离权重，裙骨与马尾骨排除在外
        W = dist_weights(co, BODY_BONES)
        stats["dist:" + lab] += 1

    tot = sum(W.values()) or 1.0
    for bn, ww in W.items():
        if ww > 1e-5 and bn in vg:
            vg[bn].add([vi], ww / tot, "REPLACE")

print("\n权重分配：")
for k, c in stats.most_common():
    print(f"  {k:<16} {c:>6}")

# 检查：还有多少顶点把权重的 >20% 给了裙骨，但它们不是裙子
leak = 0
skirt_idx = {vg[n].index for n in SKIRT_BONES if n in vg}
for v in me.vertices:
    if vert_label.get(v.index) == "SKIRT":
        continue
    for g in v.groups:
        if g.group in skirt_idx and g.weight > 0.2:
            leak += 1
            break
print(f"非裙子顶点被分到裙骨 >20% 的数量：{leak}")

# ---------------------------------------------------------------- 挂 Armature
for m in list(ob.modifiers):
    ob.modifiers.remove(m)
mod = ob.modifiers.new("Armature", "ARMATURE")
mod.object = rig
ob.parent = rig
ob.matrix_parent_inverse = rig.matrix_world.inverted()

cs = ob.modifiers.new("CorrectiveSmooth", "CORRECTIVE_SMOOTH")
cs.smooth_type = "LENGTH_WEIGHTED"
cs.factor = 0.35
cs.iterations = 3
cs.use_only_smooth = False
# 关键：rest_source 不能用 ORCO。ORCO 是导入时的原始坐标，而这张网格已经被
# 焊接 / 归一化缩放 / 轴变换改过，两者不对应，平滑修正会把网格拉成片状。
# BIND 才是「以当前绑定姿势为基准」，需要显式 bind 一次。
cs.rest_source = "BIND"
bpy.context.view_layer.objects.active = ob
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
try:
    bpy.ops.object.correctivesmooth_bind(modifier="CorrectiveSmooth")
    print("CorrectiveSmooth 已绑定（rest_source=BIND）")
except Exception as e:
    print("correctivesmooth_bind 失败，直接去掉该修改器:", e)
    ob.modifiers.remove(cs)

bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"

# 灯光 + 世界（上一版忘了建，渲染一片黑）
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
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


area("K", (-1.1, -1.5, 2.0), (48, 0, -35), 2.2, 320)
area("F", (1.6, -1.0, 1.0), (72, 0, 55), 3.0, 120, (0.85, 0.9, 1.0))
area("R", (0.5, 1.8, 1.7), (120, 0, 165), 2.0, 220, (1.0, 0.95, 0.88))
world = bpy.data.worlds.new("W14")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bgn = nt.nodes.new("ShaderNodeBackground")
bgn.inputs[0].default_value = (0.06, 0.065, 0.075, 1)
bgn.inputs[1].default_value = 0.7
nt.links.new(bgn.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])


def clear_pose():
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def aim(bone, direction):
    pb = rig.pose.bones[bone]
    head = pb.head.copy()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    pb.matrix = (Matrix.Translation(head) @ q.to_matrix().to_4x4()
                 @ Matrix.Translation(-head) @ pb.matrix)
    bpy.context.view_layer.update()


POSES = {
    "01_rest": [],
    "02_arms_up": [("LeftArm", (0.30, 0, 0.95)), ("LeftForeArm", (0.22, 0, 0.98)),
                   ("RightArm", (-0.30, 0, 0.95)), ("RightForeArm", (-0.22, 0, 0.98))],
    "03_serve": [("LeftArm", (0.34, -0.18, 0.92)), ("LeftForeArm", (0.20, -0.12, 0.97)),
                 ("RightArm", (-0.42, 0.28, 0.86)), ("RightForeArm", (-0.30, -0.52, 0.80))],
    "04_fh_windup": [("RightArm", (-0.62, 0.62, 0.48)), ("RightForeArm", (-0.30, 0.80, 0.52)),
                     ("LeftArm", (0.30, -0.80, -0.52))],
    "05_fh_follow": [("RightArm", (-0.18, -0.86, 0.48)), ("RightForeArm", (0.55, -0.70, 0.45)),
                     ("LeftArm", (0.55, 0.62, -0.55))],
    "06_lunge": [("LeftUpLeg", (0.10, -0.78, -0.62)), ("LeftLeg", (0.05, 0.24, -0.97)),
                 ("RightUpLeg", (-0.10, 0.62, -0.78)), ("RightLeg", (-0.05, 0.34, -0.94))],
    "07_squat": [("LeftUpLeg", (0.16, -0.62, -0.77)), ("LeftLeg", (0.02, 0.74, -0.67)),
                 ("RightUpLeg", (-0.16, -0.62, -0.77)), ("RightLeg", (-0.02, 0.74, -0.67)),
                 ("Spine", (0, -0.22, 0.98))],
    "08_knee_up": [("LeftUpLeg", (0.12, -0.98, 0.15)), ("LeftLeg", (0.05, -0.35, -0.94))],
    "09_side_step": [("LeftUpLeg", (0.72, -0.10, -0.68)), ("LeftLeg", (0.30, 0.10, -0.95)),
                     ("RightUpLeg", (-0.28, 0.05, -0.96))],
}
for pname, ops in POSES.items():
    clear_pose()
    for bone, d in ops:
        try:
            aim(bone, d)
        except Exception as e:
            print(f"  !! {pname}/{bone}: {e}")
    bpy.context.view_layer.update()
    for v in ("front", "q34") if pname in ("01_rest", "03_serve", "06_lunge") else ("q34",):
        scene_cam = f"Cam14_{v}"
        c = bpy.data.objects.get(scene_cam)
        if c is None:
            cd = bpy.data.cameras.new(scene_cam)
            cd.type = "ORTHO"
            cd.ortho_scale = 2.1
            c = bpy.data.objects.new(scene_cam, cd)
            c.location = (0, -3.2, 0.85) if v == "front" else (2.0, -2.4, 1.35)
            c.rotation_euler = [math.radians(a) for a in ((90, 0, 0) if v == "front" else (78, 0, 40))]
            bpy.context.scene.collection.objects.link(c)
        bpy.context.scene.camera = c
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
        bpy.context.scene.render.resolution_x = 520
        bpy.context.scene.render.resolution_y = 720
        bpy.context.scene.view_settings.view_transform = "Standard"
        bpy.context.scene.render.filepath = os.path.join(PREVIEW, f"14_{pname}_{v}.png")
        bpy.ops.render.render(write_still=True)
    print("  渲染", pname)

clear_pose()
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"label_counts": dict(Counter(labels)), "weights": dict(stats),
               "skirt_leak": leak}, f, ensure_ascii=False, indent=2)
print(f"\n报告 {OUT}\n工作文件 {BLEND}")
