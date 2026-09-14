# -*- coding: utf-8 -*-
"""露丝 10 · 形变测试（P5 验收）

绑定完不能只看站着好不好看，必须把关节推到极限看形变。
这一步按用户给的 P5 清单摆姿势，重点看：
    肩 / 腋下 / 肘 / 手腕 / 胯 / 裆 / 裙子 / 膝 / 脚踝

先把 A-Pose 本身渲染出来（A-Pose 是把手臂从自然下垂掰到外张 38°，
腋下几何必然被拉伸，必须先确认没掰坏），再逐个测试姿势。

姿势用「指定骨骼世界方向」的方式摆（aim），比直接写欧拉角直观且不易出错。

在 Blender 里跑：
    exec(open('.../coach/tools/10_deform_test.py', encoding='utf-8').read())
"""

import bpy
import json
import math
import os
from mathutils import Vector, Matrix

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
PREVIEW = os.path.join(PROJ, "build", "deform")
os.makedirs(PREVIEW, exist_ok=True)

rig = bpy.data.objects["Ruth_Rig"]
ob = bpy.data.objects["Coach_Welded"]

# 原始未处理网格（node_0）要藏起来，否则会叠在渲染里
for name in ("node_0", "CHECK_PONY", "CHECK_HEAD", "BONE_VIS", "BONE_VIS2", "MESH_WIRE"):
    o = bpy.data.objects.get(name)
    if o:
        o.hide_render = True
        o.hide_viewport = True

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 520, 720
scene.view_settings.view_transform = "Standard"
scene.render.image_settings.file_format = "PNG"

# ---------------------------------------------------------------- 灯光/世界
for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
    bpy.data.objects.remove(o, do_unlink=True)

world = bpy.data.worlds.get("DefWorld") or bpy.data.worlds.new("DefWorld")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.07, 0.075, 0.085, 1)
bg.inputs[1].default_value = 0.6
nt.links.new(bg.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])


def area(name, loc, rot_deg, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, type="AREA")
    ld.size = size
    ld.energy = energy
    ld.color = color
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot_deg]
    scene.collection.objects.link(o)


area("K", (-1.1, -1.5, 2.0), (48, 0, -35), 2.2, 300)
area("F", (1.6, -1.0, 1.0), (72, 0, 55), 3.0, 110, (0.85, 0.9, 1.0))
area("R", (0.5, 1.8, 1.7), (120, 0, 165), 2.0, 210, (1.0, 0.95, 0.88))

# ---------------------------------------------------------------- 相机
CAMS = {
    "front": ((0.0, -3.2, 0.85), (90, 0, 0)),
    "q34": ((2.0, -2.4, 1.35), (78, 0, 40)),
    "left": ((-3.2, 0.0, 0.85), (90, 0, -90)),
}
for name, (loc, rot) in CAMS.items():
    c = bpy.data.objects.get("DefCam_" + name)
    if c is None:
        cd = bpy.data.cameras.new("DefCam_" + name)
        cd.type = "ORTHO"
        cd.ortho_scale = 2.05
        c = bpy.data.objects.new("DefCam_" + name, cd)
        scene.collection.objects.link(c)
    c.location = loc
    c.rotation_euler = [math.radians(a) for a in rot]


# ---------------------------------------------------------------- 摆姿势
def clear_pose():
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()


def aim(bone, direction):
    """把骨骼指向给定的世界方向（绕骨头的 head 旋转）。"""
    pb = rig.pose.bones[bone]
    head = pb.head.copy()
    cur = (pb.tail - pb.head).normalized()
    tgt = Vector(direction).normalized()
    q = cur.rotation_difference(tgt)
    pb.matrix = (
        Matrix.Translation(head)
        @ q.to_matrix().to_4x4()
        @ Matrix.Translation(-head)
        @ pb.matrix
    )
    bpy.context.view_layer.update()


POSES = {
    "01_Apose": [],
    "02_arms_up": [
        ("LeftArm", (0.30, 0.0, 0.95)),
        ("LeftForeArm", (0.22, 0.0, 0.98)),
        ("RightArm", (-0.30, 0.0, 0.95)),
        ("RightForeArm", (-0.22, 0.0, 0.98)),
    ],
    "03_serve_trophy": [
        ("LeftArm", (0.34, -0.18, 0.92)),
        ("LeftForeArm", (0.20, -0.12, 0.97)),
        ("RightArm", (-0.42, 0.28, 0.86)),
        ("RightForeArm", (-0.30, -0.52, 0.80)),
    ],
    "04_fh_windup": [
        ("RightArm", (-0.62, 0.62, 0.48)),
        ("RightForeArm", (-0.30, 0.80, 0.52)),
        ("LeftArm", (0.30, -0.80, -0.52)),
    ],
    "05_fh_follow": [
        ("RightArm", (-0.18, -0.86, 0.48)),
        ("RightForeArm", (0.55, -0.70, 0.45)),
        ("LeftArm", (0.55, 0.62, -0.55)),
    ],
    "06_lunge": [
        ("LeftUpLeg", (0.10, -0.78, -0.62)),
        ("LeftLeg", (0.05, 0.24, -0.97)),
        ("RightUpLeg", (-0.10, 0.62, -0.78)),
        ("RightLeg", (-0.05, 0.34, -0.94)),
    ],
    "07_squat": [
        ("LeftUpLeg", (0.16, -0.62, -0.77)),
        ("LeftLeg", (0.02, 0.74, -0.67)),
        ("RightUpLeg", (-0.16, -0.62, -0.77)),
        ("RightLeg", (-0.02, 0.74, -0.67)),
        ("Spine", (0, -0.22, 0.98)),
    ],
    "08_leg_raise": [
        ("LeftUpLeg", (0.12, -0.98, 0.15)),
        ("LeftLeg", (0.05, -0.35, -0.94)),
    ],
    "09_side_step": [
        ("LeftUpLeg", (0.72, -0.10, -0.68)),
        ("LeftLeg", (0.30, 0.10, -0.95)),
        ("RightUpLeg", (-0.28, 0.05, -0.96)),
    ],
}

results = {}
for pname, ops in POSES.items():
    clear_pose()
    for bone, d in ops:
        try:
            aim(bone, d)
        except Exception as e:
            print(f"  !! {pname} / {bone}: {e}")
    bpy.context.view_layer.update()

    # 记录几个关键点的位置，用于数值验收
    info = {}
    for b in ("LeftArm", "LeftForeArm", "LeftHand", "RightHand", "LeftUpLeg", "LeftLeg", "Head"):
        pb = rig.pose.bones.get(b)
        if pb:
            info[b] = [round(c, 3) for c in pb.tail]
    results[pname] = info

    views = ["front", "q34"] if pname in ("01_Apose", "03_serve_trophy", "06_lunge") else ["q34"]
    for v in views:
        scene.camera = bpy.data.objects["DefCam_" + v]
        scene.render.filepath = os.path.join(PREVIEW, f"{pname}_{v}.png")
        bpy.ops.render.render(write_still=True)
    print(f"  渲染 {pname}  ({len(ops)} 处骨骼操作, views={views})")

clear_pose()

with open(os.path.join(PROJ, "reports", "10_deform.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print(f"\n完成，输出目录 {PREVIEW}")
