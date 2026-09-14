"""动作精修：foot planting + secondary bones（裙 / 马尾）。

foot planting
-------------
源 mocap 本身就有脚滑（4seg 右脚 11.4 cm），retarget 又被骨骼长度差放大到
17.7 cm。做法：找到每只脚的**连续着地段**（长于 8 帧才算，短段是真实的抬脚），
把段内脚踝的水平位置锚定到该段的中位，再用二骨 IK 重解 UpLeg/Leg 的旋转。
只改腿，不动 Hips（因此也不需要重算上肢）。

IK 用余弦定理求膝盖位置，pole 取"身体前方"，保证膝盖朝前不反折。

secondary bones
---------------
裙（12 骨）与马尾（4 骨）没有 mocap 数据，用程序化惯性驱动：
骨骼静止方向 = rest 方向，叠加一个"落后于父级运动"的偏移向量，
用一阶低通累积速度得到。这是标准的 secondary motion 近似。

产出：build/step6_refined.blend、reports/forehand/refine.json
运行：RUTH_NO_OPEN=1 runpy.run_path("fh_refine.py")
"""

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
BUILD = ROOT / "build"
REPORTS = ROOT / "reports" / "forehand"

MIN_SEG = 8              # 短于此的着地段视为真实抬脚，不锚定
GROUND_BAND = 0.02       # 判定着地的高度容差（米）
IK_EPS = 0.999


def contiguous_segments(pts, thr):
    segs, run = [], []
    for k, p in enumerate(pts):
        if p.z <= thr:
            run.append(k)
        elif run:
            segs.append(run)
            run = []
    if run:
        segs.append(run)
    return segs


def solve_knee(hip, target, l1, l2, pole):
    """余弦定理求膝盖位置。pole 是膝盖该朝向的方向（世界）。"""
    d = target - hip
    dist = d.length
    if dist < 1e-6:
        return hip + Vector((0, 0, -l1))
    dist = max(min(dist, (l1 + l2) * IK_EPS), abs(l1 - l2) * 1.001)
    dn = d.normalized()
    cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2.0 * l1 * dist)
    a = math.acos(max(-1.0, min(1.0, cos_a)))
    perp = pole - dn * pole.dot(dn)
    if perp.length < 1e-6:
        alt = Vector((0.0, -1.0, 0.0))
        perp = alt - dn * alt.dot(dn)
    perp.normalize()
    return hip + dn * (l1 * math.cos(a)) + perp * (l1 * math.sin(a))


def aim_matrix(world_dir, pole_dir, translation):
    """构造一个 4x4：Y 轴沿 world_dir，Z 轴尽量朝 pole_dir。"""
    y = Vector(world_dir)
    if y.length < 1e-9:
        return Matrix.Translation(translation)
    y.normalize()
    z = Vector(pole_dir) - y * Vector(pole_dir).dot(y)
    if z.length < 1e-6:
        alt = Vector((1.0, 0.0, 0.0))
        z = alt - y * alt.dot(y)
    z.normalize()
    x = y.cross(z)
    m = Matrix(((x.x, y.x, z.x), (x.y, y.y, z.y), (x.z, y.z, z.z))).to_4x4()
    m.translation = translation
    return m


def rest_dir(rig, name):
    b = rig.data.bones[name]
    return (b.tail_local - b.head_local).normalized()


def foot_planting(rig, scene, frames):
    """对齐着地段内的脚踝水平位置。返回统计。"""
    report = {}
    for side in ("Left", "Right"):
        up_n, leg_n, ft_n = (f"{side}UpLeg", f"{side}Leg", f"{side}Foot")
        b_up, b_leg = rig.data.bones[up_n], rig.data.bones[leg_n]
        l1 = (b_up.tail_local - b_up.head_local).length
        l2 = (b_leg.tail_local - b_leg.head_local).length

        # 读轨迹（必须 frame_set 触发求值）
        hips_w, ankle_w, knee_w = [], [], []
        for i in frames:
            scene.frame_set(i)
            hips_w.append((rig.matrix_world
                           @ rig.pose.bones["Hips"].matrix).copy())
            ankle_w.append((rig.matrix_world
                            @ rig.pose.bones[ft_n].head).copy())
            knee_w.append((rig.matrix_world
                           @ rig.pose.bones[leg_n].head).copy())

        zs = sorted(p.z for p in ankle_w)
        thr = zs[len(zs) // 4] + GROUND_BAND
        segs = [s for s in contiguous_segments(ankle_w, thr)
                if len(s) >= MIN_SEG]

        target = list(ankle_w)
        for s in segs:
            mx = sum(ankle_w[k].x for k in s) / len(s)
            my = sum(ankle_w[k].y for k in s) / len(s)
            for k in s:
                target[k] = Vector((mx, my, ankle_w[k].z))

        before = max((max((Vector((q.x - ankle_w[s[0]].x,
                                   q.y - ankle_w[s[0]].y, 0)).length
                           for q in [ankle_w[k] for k in s]))
                      for s in segs), default=0.0)

        # 逐帧重解
        for i in frames:
            tgt = target[i]
            hip = Vector((hips_w[i].translation.x, hips_w[i].translation.y,
                          hips_w[i].translation.z))
            # 髋关节位置用 UpLeg 的 head（不是 Hips 骨骼原点）
            scene.frame_set(i)
            hip = (rig.matrix_world @ rig.pose.bones[up_n].head).copy()
            pole = Vector((0.0, -1.0, 0.0))          # 膝盖朝身体前方
            k = solve_knee(hip, tgt, l1, l2, pole)
            tw_up = aim_matrix(k - hip, pole, hip)
            pre_up = (hips_w[i] @ rig.data.bones["Hips"].matrix_local.inverted()
                      @ b_up.matrix_local)
            rig.pose.bones[up_n].matrix_basis = pre_up.inverted() @ tw_up
            # 子级接着算
            tw_leg = aim_matrix(tgt - k, pole, k)
            pre_leg = tw_up @ (rig.data.bones[up_n].matrix_local.inverted()
                               @ b_leg.matrix_local)
            # aim_matrix 的 translation 就是 k，但 pre_leg 的平移需要自洽：
            # 用 tw_up 推出 Leg 的 rest 绝对矩阵，再取平移
            pre_leg.translation = (tw_up @ (b_up.matrix_local.inverted()
                                            @ b_leg.matrix_local)).translation
            rig.pose.bones[leg_n].matrix_basis = pre_leg.inverted() @ tw_leg
            for nm in (up_n, leg_n):
                pb = rig.pose.bones[nm]
                pb.keyframe_insert("rotation_quaternion", frame=i)
                pb.keyframe_insert("location", frame=i)

        # 复测
        after_pts = []
        for i in frames:
            scene.frame_set(i)
            after_pts.append((rig.matrix_world
                              @ rig.pose.bones[ft_n].head).copy())
        zs2 = sorted(p.z for p in after_pts)
        thr2 = zs2[len(zs2) // 4] + GROUND_BAND
        segs2 = [s for s in contiguous_segments(after_pts, thr2)
                 if len(s) >= MIN_SEG]
        after = max((max((Vector((q.x - after_pts[s[0]].x,
                                  q.y - after_pts[s[0]].y, 0)).length
                          for q in [after_pts[k] for k in s]))
                     for s in segs2), default=0.0)
        report[side] = {
            "n_segments": len(segs2),
            "max_drift_before_cm": round(before * 100, 2),
            "max_drift_after_cm": round(after * 100, 2),
            "segments": [{"start_frame": frames[s[0]],
                          "end_frame": frames[s[-1]], "len": len(s)}
                         for s in segs2],
        }
        print(f"  {side}: 漂移 {report[side]['max_drift_before_cm']} cm → "
              f"{report[side]['max_drift_after_cm']} cm "
              f"({len(segs2)} 段)")
    return report


def secondary_motion(rig, scene, frames, cfg):
    """程序化 secondary motion：父级速度的滞后累积作为偏移。

    cfg: 每条骨链 (骨骼列表, 父骨骼, 强度, 阻尼, 静止方向)
    """
    out = {}
    for key, (bones, parent, strength, damp) in cfg.items():
        # 记录父级轨迹
        pts = []
        for i in frames:
            scene.frame_set(i)
            pts.append((rig.matrix_world
                        @ rig.pose.bones[parent].matrix.translation).copy())
        # 一阶低通累积"落后量"
        offs = [Vector((0.0, 0.0, 0.0))]
        for i in range(1, len(frames)):
            dp = pts[i] - pts[i - 1]
            offs.append(offs[-1] * damp - dp * strength)
        scale = 1.0
        for k, name in enumerate(bones):
            pb = rig.pose.bones.get(name)
            if pb is None:
                continue
            base = rest_dir(rig, name)
            parent_bone = rig.data.bones[name].parent
            for i in frames:
                scene.frame_set(i)
                o = offs[i] * (scale ** k)
                tip = (Vector((0.0, 0.0, -1.0)) * 0.35 + o)
                d = base + tip + o
                if d.length < 1e-6:
                    continue
                wd = d.normalized()
                # 换算到世界方向：rest 方向在 armature 空间已近似世界
                pw = (rig.matrix_world @ pb.matrix).translation
                tw = aim_matrix(wd, Vector((0.0, -1.0, 0.0)), pw)
                par = pb.parent
                if par is not None:
                    pre = (rig.matrix_world @ par.matrix
                           @ par.bone.matrix_local.inverted()
                           @ pb.bone.matrix_local)
                else:
                    pre = rig.matrix_world @ pb.bone.matrix_local
                pb.matrix_basis = pre.inverted() @ tw
                pb.keyframe_insert("rotation_quaternion", frame=i)
        out[key] = {"bones": bones, "strength": strength, "damping": damp}
        print(f"  {key}: {len(bones)} 骨已驱动")
    return out


def main():
    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(BUILD / "step5_retarget.blend"))
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"
                and o.name.startswith("Ruth")), None)
    scene = bpy.context.scene
    frames = list(range(int(scene.frame_start), int(scene.frame_end) + 1))
    print(f"帧范围 {frames[0]}–{frames[-1]}（{len(frames)} 帧）")

    print("=== foot planting ===")
    fp = foot_planting(rig, scene, frames)

    print("=== secondary motion ===")
    skirt = [f"Skirt{t}{i}" for t in "FBLR" for i in (1, 2, 3)]
    pony = [f"Ponytail{i}" for i in (1, 2, 3, 4)]
    cfg = {
        "skirt": (skirt, "Hips", 1.6, 0.72),
        "ponytail": (pony, "Head", 2.2, 0.70),
    }
    sec = secondary_motion(rig, scene, frames, cfg)

    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "step6_refined.blend"))
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = {"foot_planting": fp, "secondary": sec,
           "min_seg_frames": MIN_SEG}
    (REPORTS / "refine.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n[写出] {BUILD / 'step6_refined.blend'}")
    print(f"[写出] {REPORTS / 'refine.json'}")
    return out


if __name__ == "__main__":
    main()
