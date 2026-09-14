# -*- coding: utf-8 -*-
"""露丝 12 · 重做分类（位置为主）+ A-Pose 网格变形 + 骨架改写

修 11 诊断出的两个 bug：

BUG1（严重，我引入的）grp_HAIR 里混进了腋下/前臂/手。
  原因：AI 贴图把「手臂贴着身体」的自阴影烘焙进了 BaseColor，那些暗部
  lum<0.45 被颜色规则判成了头发；接着权重覆盖又把这些顶点锁成 Head 100%，
  摆 A-Pose 时它们不动 → 手臂撕成扁片。
  修法：分类改成 **位置/几何为主、颜色为辅**。深色只在头部高度才算头发，
  身体上的深色按几何归位。

BUG2 「先绑定再掰 A-Pose」的顺序本身有问题：
  自然下垂时手肘贴着裙子（手到 SkirtL2 骨只有 5.2cm），heat map 必然互相污染。
  改成：**先在网格上把手臂掰到 A-Pose，再在 A-Pose 上算权重**。
  掰的时候用「距离权重 LBS + 顶点组排除裙子」，保证腋下平滑、裙子不动。

在 Blender 里跑：
    exec(open('.../coach/tools/12_reclass_apose.py', encoding='utf-8').read())
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
OUT = os.path.join(PROJ, "reports", "12_reclass.json")
BLEND = os.path.join(PROJ, "build", "coach_apose.blend")

APOSE_DEG = 38.0

ob = bpy.data.objects["Coach_Welded"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data
H = max(v.co.z for v in me.vertices)
print(f"网格高度 {H:.4f} m，顶点 {len(me.vertices)}")

# ---------------------------------------------------------------- 贴图
base_img = None
for node in bpy.data.materials["Material.001"].node_tree.nodes:
    if node.type == "TEX_IMAGE" and node.image:
        if "normal" in node.image.name or "metallic" in node.image.name:
            continue
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


# ---------------------------------------------------------------- 重新分类
def classify(co, rgb):
    """位置为主、颜色为辅。世界坐标：x 左右，-y 前，z 高度。"""
    x, y, z = float(co.x), float(co.y), float(co.z)
    r, g, b = [float(c) for c in rgb]
    lum = (r + g + b) / 3.0
    sat = max(r, g, b) - min(r, g, b)
    is_dark = lum < 0.42
    is_white = lum > 0.60 and sat < 0.16
    is_navy = (b > r + 0.03) and lum < 0.78
    is_skin = (r >= g >= b) and (r - b) > 0.055

    # --- 头部（z >= 1.19）：只有这一区间的深色才算头发 ---
    if z >= 1.19:
        if is_dark:
            if y > 0.04 and abs(x) < 0.11 and z < 1.50:
                return "PONYTAIL"
            return "HAIR"
        if is_white and z > 1.40:
            return "VISOR"
        if is_skin:
            return "HEAD"
        return "HEAD_RIGID"

    # --- 脚 ---
    if z < 0.16:
        return "SHOE"
    if z < 0.30:
        return "SOCK"

    # --- 躯干与四肢：颜色只用来分「衣服 vs 皮肤」，深色一律按几何归位 ---
    if is_navy:
        return "NAVY"
    if is_white:
        return "SKIRT" if z <= 1.05 else "POLO"
    if is_dark:
        # 身体上的暗部 = 自阴影，不是头发。|x| 大说明是手臂贴身体投的影
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

cnt = Counter(labels)
print("\n重新分类后：")
for k, v in cnt.most_common():
    print(f"  {k:<12} {v:>6} 面 ({v / len(labels) * 100:>4.1f}%)")

# 左右拆分
final = []
for f in bm.faces:
    lab = labels[f.index]
    if lab in ("SHOE", "SOCK"):
        lab = f"{lab}_L" if f.calc_center_median().x < 0 else f"{lab}_R"
    final.append(lab)

# ---------------------------------------------------------------- 重建顶点组
GROUPS = [
    "BODY", "HEAD", "HAIR", "PONYTAIL", "VISOR", "HEAD_RIGID",
    "POLO", "SKIRT", "NAVY",
    "SOCK_L", "SOCK_R", "SHOE_L", "SHOE_R", "OTHER",
]
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

print("\n顶点组：")
for n in GROUPS:
    k = sum(1 for lab in group_of.values() if lab == n)
    if k:
        print(f"  grp_{n:<12} {k:>6}")

# 复查：手臂几何范围内还有没有被锁到头/裙的顶点
bad = 0
for vi, lab in group_of.items():
    co = me.vertices[vi].co
    if co.x > 0.135 and 0.68 < co.z < 1.22 and lab not in ("BODY", "NAVY", "POLO", "OTHER"):
        bad += 1
print(f"\n手臂范围内仍被分到非身体组的顶点：{bad}  （修之前是 571）")

bm.free()

# ---------------------------------------------------------------- A-Pose 变换
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="POSE")


def aim(bone, direction):
    pb = rig.pose.bones[bone]
    head = pb.head.copy()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(Vector(direction).normalized())
    pb.matrix = (
        Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ pb.matrix
    )
    bpy.context.view_layer.update()


rad = math.radians(APOSE_DEG)
rad2 = math.radians(APOSE_DEG * 0.55)
aim("LeftArm", (math.sin(rad), 0.0, -math.cos(rad)))
aim("RightArm", (-math.sin(rad), 0.0, -math.cos(rad)))
aim("LeftForeArm", (math.sin(rad2), 0.0, -math.cos(rad2)))
aim("RightForeArm", (-math.sin(rad2), 0.0, -math.cos(rad2)))
bpy.context.view_layer.update()

# 读 ΔM = pose · rest⁻¹，以及 pose 下的 head/tail（稍后写回 rest）
delta = {}
new_headtail = {}
for b in rig.data.bones:
    pb = rig.pose.bones[b.name]
    delta[b.name] = pb.matrix @ b.matrix_local.inverted()
    new_headtail[b.name] = (pb.head.copy(), pb.tail.copy())

for n in ("LeftArm", "LeftForeArm", "LeftHand"):
    pb = rig.pose.bones[n]
    print(f"  {n}: head {tuple(round(c,3) for c in pb.head)} tail {tuple(round(c,3) for c in pb.tail)}")

# 清空 pose（骨架回 rest），网格稍后手工 LBS
for pb in rig.pose.bones:
    pb.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")

# ---------------------------------------------------------------- 手工 LBS 掰手臂
# 只处理「可能是手臂」的候选顶点；裙子/头发/鞋袜一律排除，避免被手臂带走
EXCLUDE = {"grp_SKIRT", "grp_HAIR", "grp_PONYTAIL", "grp_VISOR", "grp_HEAD_RIGID",
           "grp_HEAD", "grp_SHOE_L", "grp_SHOE_R", "grp_SOCK_L", "grp_SOCK_R"}
excl_idx = {ob.vertex_groups[n].index for n in EXCLUDE if n in ob.vertex_groups}
cand = []
for v in me.vertices:
    if any(g.group in excl_idx for g in v.groups):
        continue
    if abs(v.co.x) < 0.085 or not (0.58 < v.co.z < 1.32):
        continue
    cand.append(v.index)
print(f"\n手臂候选顶点 {len(cand)}")

# 参与插值的骨骼（排除裙骨/马尾骨，它们在自然下垂时离手太近会互相污染）
CHAIN = [
    "Spine2", "Neck",
    "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
    "RightShoulder", "RightArm", "RightForeArm", "RightHand",
    "Hips", "LeftUpLeg", "RightUpLeg",
]
seg = {n: (rig.data.bones[n].head_local.copy(), rig.data.bones[n].tail_local.copy()) for n in CHAIN}


def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


moved = 0
max_shift = 0.0
for vi in cand:
    co = me.vertices[vi].co.copy()
    ds = [(n, seg_dist(co, *seg[n])) for n in CHAIN]
    ds.sort(key=lambda kv: kv[1])
    near = ds[:4]
    ws = [(n, 1.0 / (d + 1e-4) ** 4) for n, d in near]
    tot = sum(x[1] for x in ws)
    acc = Vector((0, 0, 0))
    for n, ww in ws:
        acc += (delta[n] @ co) * (ww / tot)
    shift = (acc - co).length
    me.vertices[vi].co = acc
    if shift > 1e-4:
        moved += 1
        max_shift = max(max_shift, shift)

print(f"实际移动 {moved} 个顶点，最大位移 {max_shift:.4f} m")
me.update()

# ---------------------------------------------------------------- 骨架 rest 改写
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones
for name, (hh, tt) in new_headtail.items():
    if name in eb:
        eb[name].head = hh
        eb[name].tail = tt
bpy.ops.object.mode_set(mode="OBJECT")

# 重新算几何法线（变形后原来的自定义分割法线不再正确）
mesh_ob = ob
if me.has_custom_normals:
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
        print("已清除自定义分割法线")
    except Exception as e:
        print("清法线跳过:", e)
for p in me.polygons:
    p.use_smooth = True

bb = [v.co for v in me.vertices]
print(
    f"\nA-Pose 网格包围盒  x[{min(p.x for p in bb):.3f},{max(p.x for p in bb):.3f}] "
    f"z[{min(p.z for p in bb):.3f},{max(p.z for p in bb):.3f}]"
)

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "apose_deg": APOSE_DEG,
            "label_counts": dict(cnt),
            "arm_candidates": len(cand),
            "arm_verts_moved": moved,
            "max_shift_m": round(max_shift, 4),
            "group_sizes": {
                n: sum(1 for lab in group_of.values() if lab == n) for n in GROUPS
            },
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"报告 {OUT}\n工作文件 {BLEND}")
