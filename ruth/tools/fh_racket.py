"""建立独立网球拍资产 + RacketSocket + 正手握拍手型。

球拍保持独立 Object，不合并进人物 Mesh。层级按用户要求：
    RightHand（骨） → RacketSocket（骨） → Racket（Object，parent_type=BONE）
这样导出 glTF 后 Racket 作为骨骼子节点，能随蒙皮动画一起走。

尺寸取真实网球拍：全长 686 mm（27 inch），拍面长 330 / 宽 270 mm，
拍柄长 190 mm。原点放在**握柄底端**，长轴沿物体 +Y，方便 RacketSocket
用一次旋转就能摆正。

握拍手型：Ruth 的手指是风格化简化（四指在指根并拢），做不到真正的环绕
抓握，所以用"手指弯成半握 + 柄从掌中穿过"来表达。角度先给初值，
最终以手部特写渲染为准人工验收。

产出：build/step4_racket.blend
运行：RUTH_NO_OPEN=1 runpy.run_path("fh_racket.py")
"""

import json
import math
import os
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
BUILD = ROOT / "build"
REPORTS = ROOT / "reports" / "forehand"

# 球拍尺寸（米）
GRIP_LEN = 0.190          # 拍柄
GRIP_R = 0.0165           # 拍柄半径（含 overgrip）
THROAT_TOP = 0.300        # 拍颈顶端（拍面下沿）
HEAD_CY = 0.470           # 拍面中心（沿 +Y）
HEAD_AY = 0.190           # 拍面半长（Y）
HEAD_AX = 0.135           # 拍面半宽（X）
FRAME_R = 0.0068          # 拍框管半径
GRIP_ORIGIN_BACK = 0.045  # 柄底端相对手心沿 +柄反方向退回的距离
# 拍面绕柄轴的滚转：0° 时拍面水平（法线朝上），正手握拍要竖直，所以 90°。
ROLL_DEG = 90.0


def build_racket_mesh():
    bm = bmesh.new()
    seg_major = 56
    seg_minor = 10

    # ---- 拍面：椭圆路径扫圆环 ----
    centres = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        centres.append(Vector((HEAD_AX * math.cos(a),
                               HEAD_CY + HEAD_AY * math.sin(a), 0.0)))
    rings = []
    for i, c in enumerate(centres):
        nxt = centres[(i + 1) % len(centres)]
        prv = centres[(i - 1) % len(centres)]
        t = (nxt - prv).normalized()
        up = Vector((0.0, 0.0, 1.0))
        u = t.cross(up).normalized()
        v = t.cross(u).normalized()
        ring = [bm.verts.new(c + u * (FRAME_R * math.cos(2 * math.pi * j
                                                          / seg_minor))
                             + v * (FRAME_R * math.sin(2 * math.pi * j
                                                       / seg_minor)))
                for j in range(seg_minor)]
        rings.append(ring)
    for i in range(len(rings)):
        r0, r1 = rings[i], rings[(i + 1) % len(rings)]
        for j in range(seg_minor):
            bm.faces.new([r0[j], r1[j], r1[(j + 1) % seg_minor],
                          r0[(j + 1) % seg_minor]])

    # ---- 拍颈：柄顶到拍面下沿的两根支柱 ----
    def tube(p0, p1, r, seg=8):
        d = (p1 - p0)
        if d.length < 1e-6:
            return
        d = d.normalized()
        up = Vector((0, 0, 1))
        if abs(d.dot(up)) > 0.9:
            up = Vector((1, 0, 0))
        u = d.cross(up).normalized()
        v = d.cross(u).normalized()
        a = [bm.verts.new(p0 + u * (r * math.cos(2 * math.pi * j / seg))
                          + v * (r * math.sin(2 * math.pi * j / seg)))
             for j in range(seg)]
        b = [bm.verts.new(p1 + u * (r * math.cos(2 * math.pi * j / seg))
                          + v * (r * math.sin(2 * math.pi * j / seg)))
             for j in range(seg)]
        for j in range(seg):
            bm.faces.new([a[j], b[j], b[(j + 1) % seg], a[(j + 1) % seg]])
        bm.faces.new(list(reversed(a)))
        bm.faces.new(b)

    grip_top = Vector((0.0, GRIP_LEN, 0.0))
    for sx in (-1.0, 1.0):
        p0 = Vector((sx * 0.007, GRIP_LEN - 0.01, 0.0))
        p1 = Vector((sx * (HEAD_AX - 0.030), THROAT_TOP - 0.012, 0.0))
        tube(p0, p1, FRAME_R * 0.95)

    # ---- 拍柄 ----
    tube(Vector((0.0, 0.0, 0.0)), grip_top, GRIP_R, seg=12)

    # ---- 拍线：一个薄面，靠材质表现，不做逐线建模 ----
    lv = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        lv.append(bm.verts.new(Vector((HEAD_AX * 0.94 * math.cos(a),
                                       HEAD_CY + HEAD_AY * 0.94
                                       * math.sin(a), 0.0))))
    bm.faces.new(lv)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("Racket_Mesh")
    bm.to_mesh(me)
    bm.free()
    return me


def make_materials(me):
    mats = []
    spec = [
        ("Racket_Frame", (0.05, 0.06, 0.09, 1), 0.35, 0.0),
        ("Racket_Grip", (0.90, 0.90, 0.92, 1), 0.75, 0.0),
        ("Racket_Strings", (0.85, 0.88, 0.92, 0.18), 0.6, 0.0),
    ]
    for name, col, rough, metal in spec:
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes
                    if n.bl_idname == "ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = metal
        mats.append(m)
    for m in mats:
        me.materials.append(m)
    return mats


def add_socket_bone(rig):
    """在 RightHand 下加 RacketSocket 骨骼。

    朝向：握拍时拍柄穿过手掌，轴向 = 手指方向 × 掌心法线。
    实测 Ruth **右手**：手指方向 d≈(-0.47,-0.01,-0.88)（向下向外），
    掌心朝身体内侧 n≈(+0.88,0,-0.47)，两者叉乘 ≈ (0,-1,0)——
    即拍柄从手心指向前方（-Y），拍头朝前。
    注意左右手差了符号：先前对右手套用左手的 +Y，球拍被挂到了后背。
    """
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    # open_mainfile 之后 bpy.context 没有 active_object，必须用 temp_override
    # 才能进 EDIT 模式；而且要先经 view_layer 设好 active（只设 override 不够）。
    with bpy.context.temp_override(active_object=rig, object=rig,
                                   selected_objects=[rig],
                                   selected_editable_objects=[rig]):
        bpy.ops.object.mode_set(mode="EDIT")
        eb = rig.data.edit_bones
        if "RacketSocket" in eb:
            eb.remove(eb["RacketSocket"])
        hand = eb["RightHand"]
        head = hand.head.copy()
        # 手掌中心：从手腕沿手指方向走 35%
        d = (hand.tail - hand.head)
        palm = head + d * 0.35
        socket = eb.new("RacketSocket")
        socket.head = palm
        socket.tail = palm + Vector((0.0, -0.075, 0.0))  # 沿 -Y：拍柄指向角色前方
        socket.parent = hand
        socket.use_connect = False
        socket.use_deform = False
        bpy.ops.object.mode_set(mode="OBJECT")
    return socket.name


def set_grip_pose(rig, blend=1.0):
    """把右手手指设成正手握拍形状。

    四指在指根是并拢的，所以靠三段手指骨依次弯曲来表达"半握"，
    拇指内收压住柄的另一侧。角度按解剖常识给初值，靠渲染验收微调。
    """
    fingers = {
        # (指根, 中段, 末段) 每段绕自身横轴弯曲的角度（度）
        "Index":  (58.0, 62.0, 40.0),
        "Middle": (62.0, 68.0, 44.0),
        "Ring":   (60.0, 66.0, 42.0),
        "Pinky":  (56.0, 62.0, 40.0),
        "Thumb":  (-22.0, -26.0, -16.0),   # 拇指反向内收
    }
    applied = {}
    for fname, angs in fingers.items():
        for k, ang in enumerate(angs, start=1):
            name = f"RightHand{fname}{k}"
            pb = rig.pose.bones.get(name)
            if pb is None:
                continue
            pb.rotation_mode = "XYZ"
            # 绕骨骼的**局部 Z 轴**弯曲：Z 轴在该 rig 里指向手的横向
            # （手指骨由 align 方向生成，roll 使 Z 大致垂直于手指平面）
            pb.rotation_euler = (0.0, 0.0, math.radians(ang * blend))
            applied[name] = math.radians(ang * blend)
    return applied


def main():
    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(BUILD / "ruth_production.blend"))
    ob = next((o for o in bpy.data.objects if o.type == "MESH"
               and o.name.startswith("Ruth")), None)
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if ob is None or rig is None:
        raise RuntimeError(f"找不到 Ruth / Ruth_Rig："
                           f"{[(o.name, o.type) for o in bpy.data.objects]}")

    # 清掉旧的球拍
    for o in list(bpy.data.objects):
        if o.name.startswith("Racket"):
            bpy.data.objects.remove(o, do_unlink=True)

    me = build_racket_mesh()
    make_materials(me)
    racket = bpy.data.objects.new("Racket", me)
    bpy.context.collection.objects.link(racket)

    socket_name = add_socket_bone(rig)

    # 球拍挂到 socket 骨骼上。
    # 不手推 matrix_parent_inverse：bone parenting 的父矩阵是
    #   rig.matrix_world @ bone.matrix_local @ Translation(0, bone_length, 0)
    # （原点在骨骼 tail 而非 head），手推极易错——实测球拍被扔到了视野外。
    # 直接设 matrix_world 让 Blender 反解 matrix_basis 最可靠。
    racket.parent = rig
    racket.parent_type = "BONE"
    racket.parent_bone = socket_name
    bpy.context.view_layer.update()

    bone = rig.data.bones[socket_name]
    socket_world = rig.matrix_world @ bone.matrix_local
    palm = socket_world.translation.copy()
    grip_dir = (socket_world.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
    # 球拍原点是握柄底端，让它落在手心沿柄向下的位置
    desired = (Matrix.Translation(palm - grip_dir * GRIP_ORIGIN_BACK)
               @ socket_world.to_3x3().to_4x4()
               @ Matrix.Rotation(math.radians(ROLL_DEG), 4, "Y"))
    racket.matrix_world = desired
    bpy.context.view_layer.update()

    applied = set_grip_pose(rig, 1.0)

    print(f"球拍：{len(me.vertices)} 顶点 / {len(me.polygons)} 面  "
          f"尺寸 {[round(v, 4) for v in racket.dimensions]}")
    print(f"RacketSocket 骨骼已加，parent = {bone.parent.name}")
    print(f"握拍手型：{len(applied)} 根手指骨已设角度")

    BUILD.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "step4_racket.blend"))

    REPORTS.mkdir(parents=True, exist_ok=True)
    out = {"racket_verts": len(me.vertices), "racket_faces": len(me.polygons),
           "racket_dimensions_m": [round(v, 4) for v in racket.dimensions],
           "socket_bone": socket_name,
           "socket_parent": bone.parent.name,
           "socket_head": [round(v, 4) for v in bone.head_local],
           "socket_tail": [round(v, 4) for v in bone.tail_local],
           "grip_angles_rad": {k: round(v, 4) for k, v in applied.items()}}
    (REPORTS / "racket.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"[写出] {BUILD / 'step4_racket.blend'}")
    print(f"[写出] {REPORTS / 'racket.json'}")
    return out


if __name__ == "__main__":
    main()
