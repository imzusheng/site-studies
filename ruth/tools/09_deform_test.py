"""形变测试门：12 个网球相关姿势，数值检查 + 多视图渲染。

姿势怎么定义：给每根骨一个"应该指向的世界方向"，用 pose_bone.matrix 直接
写世界矩阵，再由 Blender 反解局部旋转。比盲调欧拉角可控——欧拉角取决于
每根骨的 roll，而 roll 是导入时自动算的。

破坏性形变怎么量：对每个姿势取 evaluated mesh，与 rest 比每条边的长度变化。
LBS 的典型失效（膜状拉伸、肩塌陷、裙被腿拉成尖刺）都会表现为局部边长暴涨。
这比"肉眼看渲染图"客观，且能定位到具体区域。

产出：preview/deformation/*.png、reports/09_deformation.json
运行：RUTH_POSES=1-4 只跑前 4 个；RUTH_NORENDER=1 跳过渲染
"""

import json
import os
import sys
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
REPORTS = ROOT / "reports"
BUILD = ROOT / "build"
PREV = ROOT / "preview" / "deformation"

# 方向是"骨骼 head→tail 在世界空间的指向"。角色面向 -Y，+X 是角色左侧。
POSES = {
    "01_APose": {},

    "02_ArmsForward": {
        "LeftArm":     (0.28, -0.93, -0.23),
        "LeftForeArm": (0.16, -0.98, -0.10),
        "LeftHand":    (0.10, -0.99, -0.05),
        "RightArm":     (-0.28, -0.93, -0.23),
        "RightForeArm": (-0.16, -0.98, -0.10),
        "RightHand":    (-0.10, -0.99, -0.05),
    },

    "03_ArmsUp": {
        "LeftArm":     (0.42, -0.10, 0.90),
        "LeftForeArm": (0.28, -0.06, 0.96),
        "LeftHand":    (0.20, -0.04, 0.98),
        "RightArm":     (-0.42, -0.10, 0.90),
        "RightForeArm": (-0.28, -0.06, 0.96),
        "RightHand":    (-0.20, -0.04, 0.98),
    },

    "04_ServeTrophy": {
        "RightArm":     (-0.34, 0.22, 0.91),
        "RightForeArm": (-0.22, 0.42, 0.88),
        "RightHand":    (-0.16, 0.34, 0.93),
        "LeftArm":      (0.58, -0.70, 0.42),
        "LeftForeArm":  (0.42, -0.84, 0.34),
        "LeftHand":     (0.36, -0.90, 0.25),
        "Spine1":       (0.0, 0.16, 0.99),
        "Spine2":       (0.0, 0.10, 0.99),
    },

    "05_ForehandBackswing": {
        "RightArm":     (-0.62, 0.58, 0.53),
        "RightForeArm": (-0.40, 0.72, 0.57),
        "RightHand":    (-0.32, 0.78, 0.54),
        "LeftArm":      (0.72, -0.52, 0.46),
        "LeftForeArm":  (0.60, -0.70, 0.39),
        "LeftHand":     (0.55, -0.78, 0.30),
        "Spine1":       (0.0, -0.05, 1.0),
        "Spine2":       (-0.14, -0.10, 0.98),
    },

    "06_ForehandContact": {
        "RightArm":     (-0.42, -0.84, 0.34),
        "RightForeArm": (-0.30, -0.93, 0.20),
        "RightHand":    (-0.24, -0.96, 0.12),
        "LeftArm":      (0.66, -0.30, 0.69),
        "LeftForeArm":  (0.55, -0.55, 0.62),
        "LeftHand":     (0.50, -0.70, 0.51),
        "Spine2":       (-0.10, -0.14, 0.98),
    },

    "07_ForehandFollowThrough": {
        "RightArm":     (-0.30, -0.36, 0.88),
        "RightForeArm": (-0.22, -0.55, 0.80),
        "RightHand":    (-0.18, -0.62, 0.76),
        "LeftArm":      (0.70, 0.18, 0.69),
        "LeftForeArm":  (0.62, 0.30, 0.72),
        "LeftHand":     (0.58, 0.36, 0.73),
        "Spine2":       (-0.20, -0.20, 0.96),
    },

    "08_TwoHandBackhand": {
        "RightArm":     (-0.52, -0.68, 0.51),
        "RightForeArm": (-0.36, -0.86, 0.36),
        "RightHand":    (-0.30, -0.92, 0.25),
        "LeftArm":      (-0.10, -0.86, 0.50),
        "LeftForeArm":  (-0.26, -0.92, 0.29),
        "LeftHand":     (-0.30, -0.93, 0.20),
        "Spine2":       (0.24, -0.08, 0.97),
    },

    # 正手弓步：前腿大腿接近水平、小腿竖直，后腿向后伸展。
    # 不给 Hips 手动位移——FK 下弯腿不会把脚留在地上，手动给的量与腿的
    # 实际抬升量对不上（实测净降只有 26 mm，看起来像抬腿）；交给
    # ground_pose 自动把髋沉到脚落地。
    "09_DeepLunge": {
        "LeftUpLeg":  (0.10, -0.85, -0.52),
        "LeftLeg":    (0.05, 0.15, -0.99),
        "LeftFoot":   (0.06, -0.90, -0.43),
        "RightUpLeg": (-0.10, 0.55, -0.83),
        "RightLeg":   (-0.05, 0.05, -0.99),
        "RightFoot":  (-0.05, -0.76, -0.65),
        "LeftToeBase": (0.06, -0.96, -0.27),
        "RightToeBase": (-0.05, -0.96, -0.27),
        "Spine1": (0.0, -0.12, 0.99),
    },

    "10_LateralReach": {
        "LeftArm":      (0.90, -0.20, 0.39),
        "LeftForeArm":  (0.96, -0.12, 0.25),
        "LeftHand":     (0.98, -0.08, 0.18),
        "RightArm":     (-0.62, -0.72, -0.32),
        "RightForeArm": (-0.50, -0.84, -0.20),
        "RightHand":    (-0.44, -0.89, -0.12),
        "Spine1":       (0.10, 0.0, 0.99),
        "LeftUpLeg":    (0.34, -0.10, -0.93),
    },

    "11_DeepSquat": {
        "LeftUpLeg":  (0.15, -0.77, -0.62),
        "LeftLeg":    (0.05, 0.35, -0.94),
        "LeftFoot":   (0.06, -0.92, -0.39),
        "RightUpLeg": (-0.15, -0.77, -0.62),
        "RightLeg":   (-0.05, 0.35, -0.94),
        "RightFoot":  (-0.06, -0.92, -0.39),
        "LeftToeBase": (0.06, -0.97, -0.23),
        "RightToeBase": (-0.06, -0.97, -0.23),
        "Spine1": (0.0, -0.18, 0.98),
        "Spine2": (0.0, -0.14, 0.99),
    },

    "12_SplitStep": {
        "LeftUpLeg":  (0.42, -0.62, -0.66),
        "LeftLeg":    (0.16, 0.30, -0.94),
        "LeftFoot":   (0.20, -0.82, -0.53),
        "RightUpLeg": (-0.40, 0.34, -0.85),
        "RightLeg":   (-0.14, 0.04, -0.99),
        "RightFoot":  (-0.14, -0.78, -0.61),
        "LeftToeBase": (0.20, -0.93, -0.30),
        "RightToeBase": (-0.14, -0.93, -0.33),
    },
}

SKIRT_BONES = [f"Skirt{t}{i}" for t in "FBLR" for i in (1, 2, 3)]
PONYTAIL_BONES = [f"Ponytail{i}" for i in (1, 2, 3, 4)]


def point_bone(pb, world_dir, loc_offset=None):
    """把骨骼指向世界方向，head 位置保持不变。

    loc_offset 按**世界空间**施加：pb.location 是骨骼局部空间的位移，
    其方向取决于骨骼 roll。直接写 pb.location=(0,0,-0.34) 会把角色
    推到完全不同的方向（实测 11_DeepSquat 整个人浮起 28 cm）。
    """
    y = Vector(world_dir)
    if y.length < 1e-9:
        return
    y.normalize()
    ref = Vector((0.0, 0.0, 1.0))
    if abs(y.dot(ref)) > 0.98:
        ref = Vector((0.0, -1.0, 0.0))
    z = (ref - y * ref.dot(y)).normalized()
    x = y.cross(z)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = pb.matrix.translation
    if loc_offset:
        m.translation = m.translation + Vector(loc_offset)
    pb.matrix = m


def ground_pose(rig, ob):
    """把形变后的最低点移回地面，消除纯 FK 造成的整体浮空/入地。

    FK 下弯腿不会自动把脚留在地上，实测深蹲浮空 28 cm、弓步入地 3 cm。
    这里量出形变后的 z_min，整体平移 Hips 补偿。
    """
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    m = ev.to_mesh()
    zmin = min(v.co.z for v in m.vertices)
    ev.to_mesh_clear()
    if abs(zmin) < 1e-4:
        return 0.0
    hips = rig.pose.bones["Hips"]
    mat = hips.matrix.copy()
    mat.translation = mat.translation + Vector((0.0, 0.0, -zmin))
    hips.matrix = mat
    bpy.context.view_layer.update()
    return -zmin


def rest_edge_lengths(me):
    return [(e.vertices[0], e.vertices[1],
             (me.vertices[e.vertices[0]].co - me.vertices[e.vertices[1]].co)
             .length)
            for e in me.edges]


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BUILD / "step3_weighted.blend"))
    ob = next((o for o in bpy.data.objects if o.type == "MESH"), None)
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if ob is None or rig is None:
        raise RuntimeError("找不到网格或骨架")

    only = os.environ.get("RUTH_POSES", "")
    do_render = os.environ.get("RUTH_NORENDER", "") != "1"
    if only:
        keep = set()
        for part in only.split(","):
            if "-" in part:
                a, b = part.split("-")
                keep.update(range(int(a), int(b) + 1))
            else:
                keep.add(int(part))
        names = [n for i, n in enumerate(POSES) if (i + 1) in keep]
    else:
        names = list(POSES)

    # rest 边长（A-Pose）
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    rest = ob.evaluated_get(dg).to_mesh()
    rest_edges = rest_edge_lengths(rest)
    ob.evaluated_get(dg).to_mesh_clear()
    print(f"rest 边数 {len(rest_edges)}")

    if do_render:
        import lib_render as R
        scene = bpy.context.scene
        scene.render.engine = "BLENDER_WORKBENCH"
        sh = scene.display.shading
        sh.light = "STUDIO"
        sh.color_type = "TEXTURE"
        sh.show_cavity = True
        sh.cavity_type = "BOTH"
        sh.background_type = "VIEWPORT"
        sh.background_color = (0.20, 0.21, 0.23)
        scene.render.resolution_x = 560
        scene.render.resolution_y = 900
        scene.render.image_settings.file_format = "PNG"
        cam = R.get_camera()
        cam.data.type = "ORTHO"
        center = (0.0, 0.0, 0.85)
        VIEWS = [("front", (0, -1, 0)), ("side", (1, 0, 0)),
                 ("back", (0, 1, 0)), ("q34", (0.70, -0.72, 0.08))]
        PREV.mkdir(parents=True, exist_ok=True)

    results = {}
    t_start = time.time()
    for name in names:
        spec = POSES[name]
        # 清空姿势
        for pb in rig.pose.bones:
            pb.matrix_basis = Matrix.Identity(4)
        bpy.context.view_layer.update()

        # 先摆躯干/髋（父），再摆四肢（子），避免父级覆盖子级
        order = [n for n in spec if n in ("Hips", "Spine", "Spine1", "Spine2",
                                          "Neck")]
        order += [n for n in spec if n not in order]
        for bn in order:
            if bn not in rig.pose.bones:
                print(f"  ⚠ 骨骼不存在：{bn}")
                continue
            val = spec[bn]
            pb = rig.pose.bones[bn]
            if isinstance(val, dict):
                point_bone(pb, val.get("dir", (0, 0, 1)),
                           val.get("loc"))
            else:
                point_bone(pb, val)
            bpy.context.view_layer.update()

        lifted = ground_pose(rig, ob)
        if abs(lifted) > 1e-4:
            print(f"    {name} 落地补偿 {lifted*1000:+.0f} mm")

        dg = bpy.context.evaluated_depsgraph_get()
        ev = ob.evaluated_get(dg)
        m = ev.to_mesh()
        # 拉伸度量
        worst = []
        over2 = over3 = 0
        for i, j, rl in rest_edges:
            if rl < 1e-7:
                continue
            nl = (m.vertices[i].co - m.vertices[j].co).length
            ratio = nl / rl
            if ratio > 2.0:
                over2 += 1
            if ratio > 3.0:
                over3 += 1
            if ratio > 1.8:
                worst.append((round(ratio, 2),
                              [round(c, 3) for c in m.vertices[i].co]))
        bb_lo = Vector([min(v.co[k] for v in m.vertices) for k in range(3)])
        bb_hi = Vector([max(v.co[k] for v in m.vertices) for k in range(3)])
        results[name] = {
            "edges_over_2x": over2, "edges_over_3x": over3,
            "edges_total": len(rest_edges),
            "pct_over_2x": round(100 * over2 / len(rest_edges), 3),
            "worst_sample": sorted(worst, key=lambda t: -t[0])[:6],
            "bbox_min": [round(v, 3) for v in bb_lo],
            "bbox_max": [round(v, 3) for v in bb_hi],
        }
        ev.to_mesh_clear()
        print(f"  {name:<26} 拉伸>2x {over2:>5} ({100*over2/len(rest_edges):.2f}%)"
              f"  >3x {over3:>4}  z 范围 {bb_lo.z:.2f}–{bb_hi.z:.2f}")

        if do_render:
            import lib_render as R
            for vname, d in VIEWS:
                R.frame_object(cam, center, 1.90, d, margin=1.05, ortho=True)
                bpy.context.scene.render.filepath = str(PREV / f"{name}_{vname}.png")
                bpy.ops.render.render(write_still=True)

    print(f"\n总耗时 {time.time()-t_start:.1f}s")

    REPORTS.mkdir(parents=True, exist_ok=True)
    out = {"poses_tested": names, "results": results,
           "render_done": do_render}
    (REPORTS / "09_deformation.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / '09_deformation.json'}")
    return out


if __name__ == "__main__":
    main()
