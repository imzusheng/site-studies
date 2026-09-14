"""Forehand V1 修复：orientation 重建从「world dir + 固定 pole」换成「rest 姿态 + 纯 swing」。

背景（上一轮定位结论）
---------------------
fh_refine.py 的 aim_matrix(world_dir, pole_dir) 只把骨骼 Y 轴对准 world_dir，
绕自身轴的 roll 由固定世界 pole (0,-1,0) 的垂直分量决定，与 rig 自身骨 roll 无关。
当骨方向与 pole 接近平行时该分量退化。实测：SkirtB1/F1 twist 172.5°/170.4°、
RightUpLeg/LeftUpLeg 156.3°/155.6°、Ponytail1 156.3°、SkirtR1/L1 ∓107°/90°，
而 swing 只有 2–31°。滚转把蒙皮网格绞碎。

本轮改法
--------
swing_only_from_rest()：从骨骼 **rest 世界姿态**出发，只施加把 rest Y 轴转到目标
方向的**最小弧**旋转，因此绕骨自身轴的 twist / roll 严格保持 rest 值：

    q_swing = rest_dir.rotation_difference(desired_dir)
    desired_world_rotation = q_swing @ rest_world_rotation

不再从 pole 推导 X/Z basis。

保留不动（brief §11）
--------------------
源选择 / clip 0–407 / 100→60fps bake / 时间标记 / retarget 主体 / racket 层级与
grip pose / foot planting 的**位置**解算（着地段、段中位锚定、余弦定理定膝盖）/
次级骨的驱动信号（父级速度一阶低通）。只写 rotation_quaternion，location 一律不碰。

两处必要的连带修正：
1. pole 只传给 solve_knee 定膝盖位置，绝不再参与 basis 构造。
2. 小腿滚转修正后脚会跟着父链旋转，所以 Foot 的世界姿态要显式还原成 retarget
   原值——这不是新作者内容，而是把被 aim_matrix 连带污染的脚恢复原样。

产出：build/step7_rollfix.blend、reports/forehand/roll_fix.json
运行：blender -b build/step5_retarget.blend -P tools/fx/fx_01_roll_fix.py
"""
import json
import math
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]                     # ruth/
BUILD = ROOT / "build"
REPORTS = ROOT / "reports" / "forehand"

MIN_SEG = 8
GROUND_BAND = 0.02
IK_EPS = 0.999

SKIRT_MAX_SWING_DEG = 22.0
PONYTAIL_MAX_SWING_DEG = 25.0
ANTIPARALLEL_DOT = -0.9999     # 接近反平行时最小弧的轴不确定 → 保持 rest

SKIRT = [f"Skirt{t}{i}" for t in "FBLR" for i in (1, 2, 3)]
PONYTAIL = [f"Ponytail{i}" for i in (1, 2, 3, 4)]
CHAIN_CFG = {
    "skirt": {"bones": SKIRT, "parent": "Hips", "strength": 1.6, "damp": 0.72,
              "max_swing_deg": SKIRT_MAX_SWING_DEG},
    "ponytail": {"bones": PONYTAIL, "parent": "Head", "strength": 2.2,
                 "damp": 0.70, "max_swing_deg": PONYTAIL_MAX_SWING_DEG},
}


# ----------------------------------------------------------------- 核心函数
def rot3(m):
    """取 3x3 的纯旋转部分（正交化）。"""
    return m.to_quaternion().to_matrix()


def swing_only_from_rest(rest_rotation, desired_dir):
    """从 rest 姿态出发、只施加最小弧 swing 的目标世界旋转。

    最小弧旋转的轴垂直于 rest_dir 与 desired_dir，所以绕骨自身轴的 twist
    严格为 0——这是本函数存在的全部理由。

    返回 (rotation3x3, swing_deg, degenerate)
    """
    y_rest = (rest_rotation @ Vector((0.0, 1.0, 0.0)))
    y_rest.normalize()
    d = Vector(desired_dir)
    if d.length < 1e-9:
        return rest_rotation.copy(), 0.0, True
    d.normalize()
    if y_rest.dot(d) < ANTIPARALLEL_DOT:
        return rest_rotation.copy(), 0.0, True
    q = y_rest.rotation_difference(d)
    deg = math.degrees(q.angle if q.w >= 0
                       else Quaternion(-q.w, -q.x, -q.y, -q.z).angle)
    return q.to_matrix() @ rest_rotation, deg, False


def clamp_swing(q, max_deg):
    """把 swing 角度夹到上限，轴保持不变。返回 (q, deg, clamped)。"""
    if q.w < 0:
        q = Quaternion(-q.w, -q.x, -q.y, -q.z)
    deg = math.degrees(q.angle)
    if deg <= max_deg:
        return q, deg, False
    return Quaternion(q.axis, math.radians(max_deg)), max_deg, True


def solve_knee(hip, target, l1, l2, pole):
    """余弦定理求膝盖位置。pole 只用于决定膝盖位置，不参与任何 basis 构造。"""
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


def chain_length(rig, name):
    """该次级骨所在整条链的 rest 总长（米）。

    偏移 o 是"末端相对父级的落后位移"，因此正确的归一化除数是整条链的长度：
    末端的位移 ≈ chain_len * sin(swing)。
    """
    pref = "Skirt" if name.startswith("Skirt") else "Ponytail"
    pb = rig.pose.bones[name]
    while pb.parent is not None and pb.parent.name.startswith(pref):
        pb = pb.parent                      # 上溯到该链的根（裙片分 F/B/L/R 四条）
    total, stack = 0.0, [pb]
    while stack:
        cur = stack.pop()
        if not cur.name.startswith(pref):
            continue
        total += cur.bone.length
        stack.extend(cur.children)
    return total


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


def local_rot(rig, child, parent):
    if parent is None:
        return rot3(rig.data.bones[child].matrix_local)
    return rot3(rig.data.bones[parent].matrix_local.inverted()
                @ rig.data.bones[child].matrix_local)


def basis_for_world_rot(rig, name, desired_world_rot, parent_world_rot):
    """给定父骨的新世界旋转，求使本骨达到 desired_world_rot 的 basis 旋转。"""
    pb = rig.pose.bones[name]
    par = pb.parent
    L = local_rot(rig, name, par.name if par else None)
    base = (parent_world_rot @ L) if par is not None else L
    return base.inverted() @ desired_world_rot


# ---------------------------------------------------------------------- main
def main():
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    scene = bpy.context.scene
    frames = list(range(int(scene.frame_start), int(scene.frame_end) + 1))
    n = len(frames)
    action = rig.animation_data.action
    W = rig.matrix_world.to_3x3()
    rest_rot = {b.name: rot3((rig.matrix_world @ b.matrix_local).to_3x3())
                for b in rig.data.bones}
    chain_len = {nm: chain_length(rig, nm) for nm in SKIRT + PONYTAIL}
    bone_len = {b.name: b.length for b in rig.data.bones}
    print(f"骨架 {rig.name} 骨 {len(rig.data.bones)}  action {action.name}")
    print(f"帧范围 {frames[0]}–{frames[-1]}（{n} 帧）")

    # ============================ pass 1：写入之前把 retarget 读全
    print("\n=== pass 1：读取 retarget（只读） ===")
    hips_rot, hips_pos = [], []
    ankle = {"Left": [], "Right": []}
    upleg_head = {"Left": [], "Right": []}
    foot_rot = {"Left": [], "Right": []}
    driver = {"Hips": [], "Head": []}
    sec_loc_max = 0.0
    for i in frames:
        scene.frame_set(i)
        hips_rot.append(rot3(W @ rig.pose.bones["Hips"].matrix.to_3x3()))
        hips_pos.append((rig.matrix_world
                         @ rig.pose.bones["Hips"].matrix).translation.copy())
        for side in ("Left", "Right"):
            ankle[side].append(
                (rig.matrix_world @ rig.pose.bones[f"{side}Foot"].head).copy())
            upleg_head[side].append(
                (rig.matrix_world @ rig.pose.bones[f"{side}UpLeg"].head).copy())
            foot_rot[side].append(
                rot3((rig.matrix_world
                      @ rig.pose.bones[f"{side}Foot"].matrix).to_3x3()))
        for nm in ("Hips", "Head"):
            driver[nm].append(
                (rig.matrix_world @ rig.pose.bones[nm].matrix).translation.copy())
        for nm in SKIRT + PONYTAIL:
            sec_loc_max = max(sec_loc_max, rig.pose.bones[nm].location.length)
    print(f"  次级骨 |location| 最大 {sec_loc_max*1000:.4f} mm"
          f"{'（可忽略）' if sec_loc_max < 1e-5 else '（保留原值不处理）'}")

    # ---- foot planting 的位置目标：与原实现逐行一致
    plan = {}
    for side in ("Left", "Right"):
        up_n, leg_n = f"{side}UpLeg", f"{side}Leg"
        b_up, b_leg = rig.data.bones[up_n], rig.data.bones[leg_n]
        l1 = (b_up.tail_local - b_up.head_local).length
        l2 = (b_leg.tail_local - b_leg.head_local).length
        zs = sorted(p.z for p in ankle[side])
        thr = zs[len(zs) // 4] + GROUND_BAND
        segs = [s for s in contiguous_segments(ankle[side], thr)
                if len(s) >= MIN_SEG]
        target = list(ankle[side])
        for s in segs:
            mx = sum(ankle[side][k].x for k in s) / len(s)
            my = sum(ankle[side][k].y for k in s) / len(s)
            for k in s:
                target[k] = Vector((mx, my, ankle[side][k].z))
        before = max((max(Vector((q.x - ankle[side][s[0]].x,
                                  q.y - ankle[side][s[0]].y, 0)).length
                           for q in [ankle[side][k] for k in s])
                      for s in segs), default=0.0)
        plan[side] = {"up": up_n, "leg": leg_n, "foot": f"{side}Foot",
                      "l1": l1, "l2": l2, "target": target, "segs": segs,
                      "drift_before_cm": round(before * 100, 2)}
        print(f"  {side}: 着地段 {len(segs)} 段，锚定前漂移 {before*100:.2f} cm")

    # ---- 次级骨驱动信号（同一公式）
    sec_plan = {}
    for key, cfg in CHAIN_CFG.items():
        pts = driver[cfg["parent"]]
        offs = [Vector((0.0, 0.0, 0.0))]
        for k in range(1, n):
            offs.append(offs[k - 1] * cfg["damp"]
                        - (pts[k] - pts[k - 1]) * cfg["strength"])
        sec_plan[key] = offs
        cl = chain_len[cfg["bones"][0]]
        names = [b.name for b in rig.pose.bones[cfg["bones"][0]].parent.children
                 if b.name.startswith("Skirt")] if key == "skirt" else None
        omax = max(o.length for o in offs)
        print(f"  {key}: 驱动偏移 |o| 最大 {omax*1000:.1f} mm，"
              f"链长 {cl*1000:.1f} mm → 未 clamp 前最大 swing "
              f"{math.degrees(math.atan(omax/cl)):.1f}°")

    # ============================ pass 2：写入
    print("\n=== pass 2：rest + swing 重建 orientation ===")
    stat = {
        "leg": {"max_swing_deg": 0.0, "degenerate": 0, "foot_inherit_err_deg_max": 0.0},
        "secondary": {k: {"max_swing_deg": 0.0, "n_clamped": 0} for k in CHAIN_CFG},
        "per_bone_max_swing_deg": {},
    }

    def note_swing(name, deg):
        if deg > stat["per_bone_max_swing_deg"].get(name, -1.0):
            stat["per_bone_max_swing_deg"][name] = round(deg, 3)

    for fi, i in enumerate(frames):
        scene.frame_set(i)
        world = {"Hips": hips_rot[fi]}

        # ---------- 腿
        for side in ("Left", "Right"):
            pl = plan[side]
            up_n, leg_n, ft_n = pl["up"], pl["leg"], pl["foot"]
            hip = upleg_head[side][fi]
            tgt = pl["target"][fi]
            knee = solve_knee(hip, tgt, pl["l1"], pl["l2"],
                              Vector((0.0, -1.0, 0.0)))

            up_rot, up_deg, up_degen = swing_only_from_rest(
                rest_rot[up_n], knee - hip)
            stat["leg"]["max_swing_deg"] = max(stat["leg"]["max_swing_deg"], up_deg)
            stat["leg"]["degenerate"] += int(up_degen)
            note_swing(up_n, up_deg)
            pb = rig.pose.bones[up_n]
            pb.rotation_quaternion = basis_for_world_rot(
                rig, up_n, up_rot, world["Hips"]).to_quaternion()
            pb.keyframe_insert("rotation_quaternion", frame=i)
            world[up_n] = up_rot

            leg_rot, leg_deg, leg_degen = swing_only_from_rest(
                rest_rot[leg_n], tgt - knee)
            stat["leg"]["max_swing_deg"] = max(stat["leg"]["max_swing_deg"], leg_deg)
            stat["leg"]["degenerate"] += int(leg_degen)
            note_swing(leg_n, leg_deg)
            pb = rig.pose.bones[leg_n]
            pb.rotation_quaternion = basis_for_world_rot(
                rig, leg_n, leg_rot, up_rot).to_quaternion()
            pb.keyframe_insert("rotation_quaternion", frame=i)
            world[leg_n] = leg_rot

            # 脚：还原 retarget 的世界姿态（否则会继承小腿的滚转修正而拧歪球鞋）
            want = foot_rot[side][fi]
            pb = rig.pose.bones[ft_n]
            basis_old = (rig.pose.bones[ft_n].rotation_quaternion.to_matrix())
            L_ft = local_rot(rig, ft_n, leg_n)
            would_be = leg_rot @ L_ft @ basis_old
            inherit_err = math.degrees(
                (want.inverted() @ would_be).to_quaternion().angle)
            stat["leg"]["foot_inherit_err_deg_max"] = max(
                stat["leg"]["foot_inherit_err_deg_max"], inherit_err)
            pb.rotation_quaternion = basis_for_world_rot(
                rig, ft_n, want, leg_rot).to_quaternion()
            pb.keyframe_insert("rotation_quaternion", frame=i)
            world[ft_n] = want
            # ToeBase 不写：脚的世界姿态已与 retarget 相同，趾骨随之相同

        # ---------- 次级骨
        for key, cfg in CHAIN_CFG.items():
            o = sec_plan[key][fi]
            for name in cfg["bones"]:
                pb = rig.pose.bones[name]
                par = pb.parent
                base = rest_rot[name] @ Vector((0.0, 1.0, 0.0))
                base.normalize()
                d = base + o / chain_len[name]    # 量纲修正：米 → 方向扰动
                # 除数用整条链的总长：偏移是末端落后量，
                # 末端位移 ≈ chain_len*sin(swing)
                q = base.rotation_difference(d.normalized())
                q, deg, clamped = clamp_swing(q, cfg["max_swing_deg"])
                stat["secondary"][key]["max_swing_deg"] = max(
                    stat["secondary"][key]["max_swing_deg"], deg)
                stat["secondary"][key]["n_clamped"] += int(clamped)
                note_swing(name, deg)
                desired = q.to_matrix() @ rest_rot[name]
                praw = world.get(par.name)
                if praw is None:
                    praw = rot3(W @ rig.pose.bones[par.name].matrix.to_3x3())
                    world[par.name] = praw
                pb.rotation_quaternion = basis_for_world_rot(
                    rig, name, desired, praw).to_quaternion()
                pb.keyframe_insert("rotation_quaternion", frame=i)
                world[name] = desired

    # ---- 复测脚滑
    print("\n=== 复测 ===")
    after = {}
    for side in ("Left", "Right"):
        pts = []
        for i in frames:
            scene.frame_set(i)
            pts.append((rig.matrix_world
                        @ rig.pose.bones[plan[side]["foot"]].head).copy())
        zs = sorted(p.z for p in pts)
        thr = zs[len(zs) // 4] + GROUND_BAND
        segs = [s for s in contiguous_segments(pts, thr) if len(s) >= MIN_SEG]
        drift = max((max(Vector((q.x - pts[s[0]].x, q.y - pts[s[0]].y, 0)).length
                         for q in [pts[k] for k in s])
                     for s in segs), default=0.0)
        after[side] = {"n_segments": len(segs),
                       "max_drift_after_cm": round(drift * 100, 2)}
        print(f"  {side}: {plan[side]['drift_before_cm']} cm → "
              f"{after[side]['max_drift_after_cm']} cm")

    OUT = BUILD / "step7_rollfix.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT))
    rep = {
        "goal": "修复 aim_matrix 的 roll/twist 缺陷，重建 orientation",
        "what_changed": [
            "swing_only_from_rest()：从 rest 世界姿态出发，只施加把 rest Y 轴转"
            "到目标方向的最小弧旋转 → 绕骨自身轴的 twist 严格为 0",
            "foot_planting：pole 只传给 solve_knee 决定膝盖位置，不再参与 basis",
            "secondary_motion：rest 方向 + 偏移/骨长 → 纯 swing + 角度 clamp",
            "Foot：世界姿态显式还原为 retarget 原值",
        ],
        "what_preserved": [
            "retarget 主体（step5_retarget.blend 原样读入，未重算）",
            "位置解算：着地段划分 / 锚定到段中位 / 余弦定理定膝盖",
            "次级骨驱动信号：父级速度一阶低通，strength/damp 与上一轮相同",
            "只写 rotation_quaternion，location 不碰（保住 retarget 关节偏移）",
            "club / 时间标记 / bake 帧率 / racket 层级 / grip 均未触碰",
        ],
        "clamps_deg": {"skirt_max_swing": SKIRT_MAX_SWING_DEG,
                       "ponytail_max_swing": PONYTAIL_MAX_SWING_DEG},
        "unit_fix": "旧实现把米量级的偏移直接加到单位方向向量上；新实现除以骨长",
        "stats": stat,
        "foot_planting": {s: {"drift_before_cm": plan[s]["drift_before_cm"],
                              **after[s]} for s in ("Left", "Right")},
        "secondary_location_max_mm": round(sec_loc_max * 1000, 5),
        "frames": n, "action": action.name,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "roll_fix.json").write_text(
        json.dumps(rep, ensure_ascii=False, indent=2))
    print(f"\n[写出] {OUT}\n[写出] {REPORTS/'roll_fix.json'}")
    print(f"  腿部 swing 最大 {stat['leg']['max_swing_deg']:.2f}°  "
          f"退化 {stat['leg']['degenerate']}")
    print(f"  不复原 foot 的话，脚会继承的偏差最大 "
          f"{stat['leg']['foot_inherit_err_deg_max']:.2f}°")
    for k, v in stat["secondary"].items():
        print(f"  {k} swing 最大 {v['max_swing_deg']:.2f}°"
              f"（clamp 命中 {v['n_clamped']} 次）")


if __name__ == "__main__":
    main()
