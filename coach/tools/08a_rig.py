# -*- coding: utf-8 -*-
"""露丝 08a · 应用旋转 + 建 Humanoid 骨架

先把网格的 90° X 旋转应用掉，让网格数据和骨架都在同一个世界坐标系里
（x=左右, y=前后, -y=面朝方向, z=高度），后面所有关节坐标都好写。

骨架用 **Mixamo 命名**（Hips / Spine / LeftArm / LeftUpLeg …），
这样以后 Tennis-MoCap 的 BVH 能直接 retarget，不用再改名。

关节位置全部来自 07 的实测（不是套写实人体比例——这个模型约 5.5 头身，
套标准比例会错位）：
  裆 0.77 / 膝 0.44 / 踝 0.11 / 肩 1.20 / 肘 0.98 / 腕 0.83
  颈根 1.28 / 头顶 1.62 / 马尾 y 0.78~1.43

外加辅助骨：马尾 4 节、裙摆 4 向各 2 节。

在 Blender 里跑：
    exec(open('.../coach/tools/08a_rig.py', encoding='utf-8').read())
"""

import bpy
import json
import os
import mathutils
from mathutils import Vector

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "08a_rig.json")
BLEND = os.path.join(PROJ, "build", "coach_rig.blend")

# ---------------------------------------------------------------- 清理临时对象
for name in ("SEG_PREVIEW", "SEG_PREVIEW2", "WIREFRAME_PREVIEW"):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
        print("清掉临时对象", name)

ob = bpy.data.objects["Coach_Welded"]

# ---------------------------------------------------------------- 应用旋转
# 网格局部坐标 x=左右 y=高度 z=前后；rot.x=90° 把它转成世界 z=高度。
# 应用掉之后网格数据即世界坐标，骨架可以直接用同一套数字。
if abs(ob.rotation_euler.x) > 1e-6:
    ob.data.transform(
        mathutils.Matrix.Rotation(ob.rotation_euler.x, 4, "X")
        if abs(ob.rotation_euler.y) < 1e-6 and abs(ob.rotation_euler.z) < 1e-6
        else ob.matrix_world
    )
    ob.rotation_euler = (0.0, 0.0, 0.0)
    ob.location = (0.0, 0.0, 0.0)
    ob.scale = (1.0, 1.0, 1.0)
    print("已应用旋转")

bb = [v.co for v in ob.data.vertices]
print(
    f"网格世界包围盒  x[{min(p.x for p in bb):.3f},{max(p.x for p in bb):.3f}] "
    f"y[{min(p.y for p in bb):.3f},{max(p.y for p in bb):.3f}] "
    f"z[{min(p.z for p in bb):.3f},{max(p.z for p in bb):.3f}]"
)

# ---------------------------------------------------------------- 骨架定义
# (名字, head, tail, parent, connected)
BONES = [
    ("Root", (0, 0, 0), (0, -0.15, 0), None, False),
    # 中轴
    ("Hips", (0, 0, 0.86), (0, 0, 0.95), "Root", False),
    ("Spine", (0, 0, 0.95), (0, 0, 1.04), "Hips", True),
    ("Spine1", (0, 0, 1.04), (0, 0, 1.13), "Spine", True),
    ("Spine2", (0, 0, 1.13), (0, 0, 1.24), "Spine1", True),
    ("Neck", (0, -0.005, 1.24), (0, -0.010, 1.33), "Spine2", True),
    ("Head", (0, -0.010, 1.33), (0, -0.010, 1.60), "Neck", True),
    # 左臂（角色自身左侧 = +x）
    ("LeftShoulder", (0.035, 0, 1.21), (0.115, 0, 1.205), "Spine2", False),
    ("LeftArm", (0.115, 0, 1.205), (0.140, 0, 1.00), "LeftShoulder", True),
    ("LeftForeArm", (0.140, 0, 1.00), (0.158, 0, 0.845), "LeftArm", True),
    ("LeftHand", (0.158, 0, 0.845), (0.168, 0, 0.745), "LeftForeArm", True),
    # 右臂
    ("RightShoulder", (-0.035, 0, 1.21), (-0.115, 0, 1.205), "Spine2", False),
    ("RightArm", (-0.115, 0, 1.205), (-0.140, 0, 1.00), "RightShoulder", True),
    ("RightForeArm", (-0.140, 0, 1.00), (-0.158, 0, 0.845), "RightArm", True),
    ("RightHand", (-0.158, 0, 0.845), (-0.168, 0, 0.745), "RightForeArm", True),
    # 左腿
    ("LeftUpLeg", (0.068, 0, 0.80), (0.075, 0.004, 0.44), "Hips", False),
    ("LeftLeg", (0.075, 0.004, 0.44), (0.082, 0.0, 0.11), "LeftUpLeg", True),
    ("LeftFoot", (0.082, 0.0, 0.11), (0.078, -0.075, 0.025), "LeftLeg", True),
    ("LeftToeBase", (0.078, -0.075, 0.025), (0.078, -0.135, 0.020), "LeftFoot", True),
    # 右腿
    ("RightUpLeg", (-0.068, 0, 0.80), (-0.075, 0.004, 0.44), "Hips", False),
    ("RightLeg", (-0.075, 0.004, 0.44), (-0.082, 0.0, 0.11), "RightUpLeg", True),
    ("RightFoot", (-0.082, 0.0, 0.11), (-0.078, -0.075, 0.025), "RightLeg", True),
    ("RightToeBase", (-0.078, -0.075, 0.025), (-0.078, -0.135, 0.020), "RightFoot", True),
]

# 马尾 4 节：从头顶后方沿实测路径下垂
PONY = [
    (0.0, 0.030, 1.46),
    (0.0, 0.062, 1.32),
    (0.0, 0.100, 1.16),
    (0.0, 0.140, 0.99),
    (0.0, 0.162, 0.80),
]
for i in range(4):
    BONES.append(
        (
            f"Ponytail{i + 1}",
            PONY[i],
            PONY[i + 1],
            "Head" if i == 0 else f"Ponytail{i}",
            i > 0,
        )
    )

# 裙摆：4 个方向，各 2 节。裙实测 z 0.76~1.04，骨盆在 0.86。
SKIRT_DIRS = {
    "SkirtF": (0.0, -1.0),
    "SkirtB": (0.0, 1.0),
    "SkirtL": (1.0, 0.0),
    "SkirtR": (-1.0, 0.0),
}
for name, (dx, dy) in SKIRT_DIRS.items():
    hip = (dx * 0.055, dy * 0.055, 0.875)
    mid = (dx * 0.105, dy * 0.105, 0.820)
    tip = (dx * 0.140, dy * 0.140, 0.762)
    BONES.append((name + "1", hip, mid, "Hips", False))
    BONES.append((name + "2", mid, tip, name + "1", True))

# ---------------------------------------------------------------- 建 armature
old = bpy.data.objects.get("Ruth_Rig")
if old:
    bpy.data.objects.remove(old, do_unlink=True)

arm_data = bpy.data.armatures.new("Ruth_Rig_Data")
rig = bpy.data.objects.new("Ruth_Rig", arm_data)
bpy.context.scene.collection.objects.link(rig)
rig.show_in_front = True
arm_data.display_type = "OCTAHEDRAL"

bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")

eb = arm_data.edit_bones
for name, head, tail, parent, connected in BONES:
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
        b.use_connect = connected
    # 让手臂/腿的 roll 有个合理默认
    if name.startswith(("LeftArm", "RightArm", "LeftForeArm", "RightForeArm")):
        b.roll = 0.0

bpy.ops.object.mode_set(mode="OBJECT")
print(f"\n骨架建成：{len(arm_data.bones)} 根骨")
for b in arm_data.bones:
    print(f"  {b.name:<16} head=({b.head_local.x:>7.3f},{b.head_local.y:>7.3f},{b.head_local.z:>6.3f})")

# ---------------------------------------------------------------- 保存
bpy.ops.wm.save_as_mainfile(filepath=BLEND)

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "bone_count": len(arm_data.bones),
            "bones": [
                {
                    "name": b.name,
                    "head": [round(v, 4) for v in b.head_local],
                    "tail": [round(v, 4) for v in b.tail_local],
                    "parent": b.parent.name if b.parent else None,
                }
                for b in arm_data.bones
            ],
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"\n报告 {OUT}\n工作文件 {BLEND}")
