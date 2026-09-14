"""把选定正手 BVH retarget 到 Ruth，并 bake 到 60 fps。

为什么不走 Blender 的 BVH 导入器：
  bpy.ops.import_anim.bvh 内部会自己调 bpy.ops.object.mode_set，而
  open_mainfile 之后 bpy.context 连 active_object 这个**属性**都不存在
  （不是 None，是 AttributeError），用 temp_override 固定 active_object
  又会覆盖导入器自己的设置（实测报 KeyError: "Hips" not found，骨骼建到了
  别的对象上）。所以整条链改用自写的 BVH 解析 + FK，完全不碰 ops。

retarget 算法（delta 法）：
  C 是 Y-up→Z-up 的坐标转换（绕 X +90°），源的世界旋转转到 Blender 系后
      delta = Rw_src(f) · Rw_src_rest⁻¹        —— 相对自身 rest 的增量
      Rw_tgt(f) = delta · Rw_tgt_rest          —— 施加到目标 rest 上
  这样自动吸收 T-pose(BVH) 与 A-Pose(Ruth) 的 rest 差异。
  局部矩阵用 Blender 的 pose 公式反解，父级按层级序先算，不做 view_layer 更新。

脊柱分配：BVH 只有一个 Chest 关节，而 Ruth 有 Spine/Spine1/Spine2 三段。
把 Chest 的 delta 四元数按 0.30/0.35/0.35 取幂分摊（q^a·q^b·q^c = q^1）。

60 fps：源 100 fps，把采样时间轴按 100/60 重映射后逐帧写 keyframe。

产出：build/step5_retarget.blend、reports/forehand/retarget.json
运行：RUTH_NO_OPEN=1 runpy.run_path("fh_retarget.py")
"""

import importlib.util
import json
import math
import os
import sys
from pathlib import Path

import numpy as np
import bpy
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
_spec = importlib.util.spec_from_file_location(
    "probe", HERE / "fh_probe_bvh.py")
probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probe)

ROOT = HERE.parent
BUILD = ROOT / "build"
REPORTS = ROOT / "reports" / "forehand"
BVH = (ROOT.parent / "baseline-club" / "assets-source" / "full"
       / "lvargas_Derecha_4seg.bvh")

SRC_FPS = 100.0
TGT_FPS = 60.0
CLIP_END_SRC = 407

# BVH 关节 → (Ruth 骨骼, 四元数取幂权重)。权重和应为 1。
BONE_MAP = {
    "Hips": [("Hips", 1.0)],
    "Chest": [("Spine", 0.30), ("Spine1", 0.35), ("Spine2", 0.35)],
    "Neck": [("Neck", 1.0)],
    "Head": [("Head", 1.0)],
    "LeftCollar": [("LeftShoulder", 1.0)],
    "LeftShoulder": [("LeftArm", 1.0)],
    "LeftElbow": [("LeftForeArm", 1.0)],
    "LeftWrist": [("LeftHand", 1.0)],
    "RightCollar": [("RightShoulder", 1.0)],
    "RightShoulder": [("RightArm", 1.0)],
    "RightElbow": [("RightForeArm", 1.0)],
    "RightWrist": [("RightHand", 1.0)],
    "LeftHip": [("LeftUpLeg", 1.0)],
    "LeftKnee": [("LeftLeg", 1.0)],
    "LeftAnkle": [("LeftFoot", 1.0)],
    "RightHip": [("RightUpLeg", 1.0)],
    "RightKnee": [("RightLeg", 1.0)],
    "RightAnkle": [("RightFoot", 1.0)],
}

C3 = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])
# (x,y,z)_Yup → (x,-z,y)_Zup


def load_bvh_full(path):
    joints, order, ft, data = probe.parse_bvh(path)
    n = data.shape[0]
    slices, col = {}, 0
    for name in order:
        ch = joints[name]["channels"]
        slices[name] = (col, col + len(ch))
        col += len(ch)

    rest_data = data.copy()
    for name in order:
        a, b = slices[name]
        for i, cn in enumerate(joints[name]["channels"]):
            if not cn.endswith("position"):
                rest_data[:, a + i] = 0.0

    def fk(src):
        wR, wP = {}, {}
        lR, lP = {}, {}
        for name in order:
            a, b = slices[name]
            seg = src[:, a:b]
            ch = joints[name]["channels"]
            R = np.tile(np.eye(3), (n, 1, 1))
            T = np.tile(np.array(joints[name]["offset"], dtype=float), (n, 1))
            for i, cn in enumerate(ch):
                if cn.endswith("position"):
                    T[:, "XYZ".index(cn[0])] += seg[:, i]
                else:
                    ax = cn[0]
                    for f in range(n):
                        R[f] = R[f] @ probe.rot_matrix(ax, seg[f, i])
            lR[name], lP[name] = R, T
            pr = joints[name]["parent"]
            if pr is None:
                wR[name], wP[name] = R.copy(), T.copy()
            else:
                wR[name] = np.einsum("fij,fjk->fik", wR[pr], R)
                wP[name] = wP[pr] + np.einsum("fij,fj->fi", wR[pr], T)
        return wR, wP

    anim_R, anim_P = fk(data)
    rest_R, rest_P = fk(rest_data)
    return {"joints": joints, "order": order, "ft": ft, "n": n,
            "anim_R": anim_R, "anim_P": anim_P,
            "rest_R": rest_R, "rest_P": rest_P}


def q_pow(q, w):
    """四元数的分数次幂 = 绕同一轴、角度乘 w。

    mathutils 的 Quaternion 没有 ** 运算符（实测 TypeError），
    所以从 w 分量反解轴角再缩放。取 q.w<0 的等价表示以保证走最短弧。
    """
    if abs(w - 1.0) < 1e-9:
        return q
    q = q.normalized()
    if q.w < 0.0:
        q.negate()
    c = max(-1.0, min(1.0, q.w))
    ang = 2.0 * math.acos(c)
    s = math.sqrt(max(0.0, 1.0 - c * c))
    if s < 1e-9:
        return Quaternion((1.0, 0.0, 0.0, 0.0))
    ax = Vector((q.x / s, q.y / s, q.z / s))
    return Quaternion(ax, ang * w)


def bone_dir_bvh(joints, order, name):
    """BVH 关节的"骨方向"：优先用子关节的 offset，末端关节用自己的 offset。

    注意 BVH 的关节坐标系在 rest 时是**单位矩阵**（轴对齐世界），
    所以"骨头指向哪"完全由 OFFSET 决定，而不是坐标系的 Y 轴。
    这一点是 retarget 出错的关键：Ruth 的骨骼 Y 轴就是骨方向，
    两者语义不同，必须显式对齐。
    """
    kids = [n for n in order if joints[n]["parent"] == name]
    src = kids[0] if kids else name
    return Vector([float(v) for v in joints[src]["offset"]])


def np_to_mat(R, t=None):
    m = Matrix([[float(R[i][j]) for j in range(3)] for i in range(3)]).to_4x4()
    if t is not None:
        m.translation = Vector((float(t[0]), float(t[1]), float(t[2])))
    return m


def ruth_rest(rig):
    """Ruth 各骨的 rest 世界矩阵与层级序。"""
    out = {}
    for b in rig.data.bones:
        out[b.name] = b.matrix_local.copy()
    order = [b.name for b in rig.data.bones]
    order.sort(key=lambda n: len(rig.data.bones[n].parent_recursive))
    return out, order


def main():
    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(BUILD / "step4_racket.blend"))
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"
                and o.name.startswith("Ruth")), None)
    if rig is None:
        raise RuntimeError("找不到 Ruth_Rig")

    scene = bpy.context.scene
    scene.render.fps = int(TGT_FPS)
    scene.render.fps_base = 1.0

    print("=== 解析 BVH ===")
    D = load_bvh_full(BVH)
    print(f"  {D['n']} 帧 @ {1/D['ft']:.0f} fps  {len(D['order'])} 关节")

    # ---- 尺度与对齐 ----
    def leg_len(P, hip, knee, ankle):
        """返回**米**。P 里的位置单位是厘米，必须换算——
        不换算会让 scale 变成 0.0106（缩小 100 倍），角色原地不动、
        脚滑也测成 0。"""
        cm = (np.linalg.norm(P[knee][0] - P[hip][0])
              + np.linalg.norm(P[ankle][0] - P[knee][0]))
        return float(cm / 100.0)
    print("  rest 位置抽查 (cm)：")
    for nm in ("Hips", "RightHip", "RightKnee", "RightAnkle"):
        print(f"    {nm:<12} {np.round(D['rest_P'][nm][0], 2)}")
    print(f"    |Knee-Hip| = "
          f"{np.linalg.norm(D['rest_P']['RightKnee'][0] - D['rest_P']['RightHip'][0]):.2f}")
    bvh_leg = leg_len(D["rest_P"], "RightHip", "RightKnee", "RightAnkle")
    ra = rig.data.bones
    ruth_leg = ((ra["RightUpLeg"].head_local - ra["RightUpLeg"].tail_local).length
                + (ra["RightLeg"].head_local - ra["RightLeg"].tail_local).length)
    scale = ruth_leg / bvh_leg
    print(f"  腿长 BVH {bvh_leg:.4f} m → Ruth {ruth_leg:.4f} m  "
          f"位置缩放 ×{scale:.4f}")

    # 首帧肩线朝向对齐
    def shoulder_yaw_from(P, R, ls, rs):
        # 用 rest_P 的偏移 + 首帧旋转算肩线方向
        p_ls = P[ls][0] / 100.0
        p_rs = P[rs][0] / 100.0
        v = C3 @ (p_rs - p_ls)
        return math.atan2(v[1], v[0])

    y_src = shoulder_yaw_from(D["anim_P"], D["anim_R"],
                              "LeftShoulder", "RightShoulder")
    y_tgt = math.atan2(0.0, -1.0)     # Ruth 的肩线沿 X，右手在 -X
    # Ruth: LeftShoulder 在 +X，RightShoulder 在 -X → 方向 (-1,0,0) → yaw = π
    y_tgt = math.pi
    dphi = y_tgt - y_src
    Rz = np.array([[math.cos(dphi), -math.sin(dphi), 0.0],
                   [math.sin(dphi), math.cos(dphi), 0.0], [0.0, 0.0, 1.0]])
    print(f"  肩线 yaw 源 {math.degrees(y_src):.1f}° → 目标 "
          f"{math.degrees(y_tgt):.1f}°，修正 {math.degrees(dphi):.1f}°")

    hips_rest_b = (C3 @ D["rest_P"]["Hips"][0]) / 100.0
    hips_tgt0 = rig.data.bones["Hips"].head_local.copy()
    print(f"  Hips: 源 rest (BVH 系) {np.round(D['rest_P']['Hips'][0],1)} → "
          f"Ruth {[round(v,4) for v in hips_tgt0]}")

    # ---- 逐帧 retarget ----
    # 帧数换算必须先除回秒：CLIP_END_SRC 是**帧**不是秒。
    # 写成 CLIP_END_SRC * SRC_FPS / TGT_FPS 会得到 679 帧（把帧数当秒数）。
    dur_s = CLIP_END_SRC / SRC_FPS
    n_frames = int(round(dur_s * TGT_FPS)) + 1
    frames = list(range(n_frames))
    src_idx = [min(int(round(i * SRC_FPS / TGT_FPS)), D["n"] - 1) for i in frames]
    print(f"=== 采样 {n_frames} 帧 @{TGT_FPS:.0f}fps "
          f"（源 {CLIP_END_SRC} 帧 @{SRC_FPS:.0f}fps = {dur_s:.2f} s）===")

    rrest, rorder = ruth_rest(rig)
    bone_parent = {n: (rig.data.bones[n].parent.name
                       if rig.data.bones[n].parent else None) for n in rorder}

    # 预计算每个源关节的 rest 世界旋转（转到 Blender 系）
    src_rest_b = {s: C3 @ D["rest_R"][s][0] @ C3.T for s in D["order"]}

    targets = {t: s for s, lst in BONE_MAP.items() for t, w in lst}
    weights = {t: w for s, lst in BONE_MAP.items() for t, w in lst}

    # 方向对齐矩阵：把"目标骨骼 rest 骨方向"转到"源关节 rest 骨方向"。
    # 少了它，delta 直接乘 rr 会把手臂甩到身体另一侧（实测左右手互换）。
    align = {}
    for s, lst in BONE_MAP.items():
        d_src = bone_dir_bvh(D["joints"], D["order"], s)
        if d_src.length < 1e-9:
            d_src = Vector((0.0, 1.0, 0.0))
        d_src = Vector((C3 @ np.array(d_src, dtype=float))).normalized()
        for tgt, _w in lst:
            b = rig.data.bones[tgt]
            d_tgt = (b.tail_local - b.head_local).normalized()
            align[tgt] = d_tgt.rotation_difference(d_src).to_matrix()
    print("  方向对齐矩阵示例（目标 rest 方向 → 源 rest 方向，夹角）：")
    for tgt in ("RightArm", "LeftArm", "RightUpLeg", "Spine2"):
        b = rig.data.bones[tgt]
        d_tgt = (b.tail_local - b.head_local).normalized()
        d_src = Vector((C3 @ np.array(
            bone_dir_bvh(D["joints"], D["order"], targets[tgt]),
            dtype=float))).normalized()
        print(f"    {tgt:<12} {math.degrees(d_tgt.angle(d_src)):6.1f}°")

    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    rig.animation_data_create()
    act = bpy.data.actions.new("Ruth_Forehand")
    rig.animation_data.action = act

    # ---- 先算并缓存每帧的目标世界矩阵 ----
    print("  计算目标世界矩阵…")
    world_cache = {}
    loc_cache = {}
    src_hips_rest = (C3 @ D["rest_P"]["Hips"][0]) / 100.0
    for fi, i in enumerate(frames):
        si = src_idx[i]
        bw = {}
        for s in D["order"]:
            Rw = C3 @ D["anim_R"][s][si] @ C3.T
            delta = Rw @ src_rest_b[s].T
            bw[s] = delta
        # Hips 位置：BVH 系 → Blender 系，缩放，再对齐到 Ruth
        p = (C3 @ D["anim_P"]["Hips"][si]) / 100.0
        p_rel = (p - src_hips_rest) * scale
        loc_cache[i] = Vector((float(p_rel[0] * Rz[0, 0] + p_rel[1] * Rz[0, 1]),
                               float(p_rel[0] * Rz[1, 0] + p_rel[1] * Rz[1, 1]),
                               float(p_rel[2])))
        world_cache[i] = bw

    # ---- 按层级序写 keyframe ----
    print("  写 keyframe…")
    for fi, i in enumerate(frames):
        bw = world_cache[i]
        tw = {}
        for name in rorder:
            s = targets.get(name)
            rr = rrest[name]
            if s is None:
                # 没有对应源：保持 rest（手指、马尾、裙、ToeBase）
                parent = bone_parent[name]
                pw = tw.get(parent, rrest[parent] if parent else Matrix.Identity(4))
                tw[name] = pw @ (rrest[parent].inverted() if parent
                                 else Matrix.Identity(4)) @ rr
                continue
            delta = bw[s]
            w = weights[name]
            # 把 delta 转成四元数，按权重取幂（脊柱分摊用）
            q = np_to_mat(delta).to_quaternion()
            if abs(w - 1.0) > 1e-6:
                q = q_pow(q, w)
            # 顺序：delta(源的世界旋转变化) · M(骨方向对齐) · 目标 rest
            target_world = (q.to_matrix() @ align[name]
                            @ rr.to_3x3()).to_4x4()
            if name == "Hips":
                target_world.translation = (rr.translation + loc_cache[i])
            else:
                parent = bone_parent[name]
                pw = tw.get(parent, rrest[parent])
                target_world.translation = (
                    pw @ rrest[parent].inverted() @ rr).translation
            tw[name] = target_world

        for name in rorder:
            if name not in targets:
                continue
            pb = rig.pose.bones[name]
            parent = bone_parent[name]
            if parent:
                pre = (tw[parent] @ rrest[parent].inverted() @ rrest[name])
            else:
                pre = rrest[name]
            pb.matrix_basis = pre.inverted() @ tw[name]
            pb.keyframe_insert("rotation_quaternion", frame=i)
            pb.keyframe_insert("location", frame=i)

    scene.frame_start = frames[0]
    scene.frame_end = frames[-1]
    print(f"  完成：{len(targets)} 骨 × {len(frames)} 帧")

    # ---- 脚滑测量 ----
    print("=== 脚滑测量 ===")
    slide = {}
    for side in ("Left", "Right"):
        pts = []
        for i in frames:
            # 必须先 frame_set 触发 depsgraph 求值：刚写完 keyframe 时
            # pose_bone.head 还是旧值，直接读会得到"脚完全不滑"的假结论。
            scene.frame_set(i)
            p = (rig.matrix_world @ rig.pose.bones[f"{side}Foot"].head).copy()
            pts.append(p)
        zs = sorted(p.z for p in pts)
        thr = zs[len(zs) // 4] + 0.02
        segs, run = [], []
        for k, p in enumerate(pts):
            if p.z <= thr:
                run.append(k)
            elif run:
                segs.append(run)
                run = []
        if run:
            segs.append(run)
        segs = [s for s in segs if len(s) >= 6]
        info = []
        for s in segs:
            sub = [pts[k] for k in s]
            drift = max((Vector((q.x - sub[0].x, q.y - sub[0].y, 0)).length
                         for q in sub))
            info.append({"start_frame": frames[s[0]],
                         "end_frame": frames[s[-1]],
                         "len": len(s), "drift_cm": round(drift * 100, 2)})
        slide[side] = {"n_segments": len(segs),
                       "max_drift_cm": round(max((v["drift_cm"] for v in info),
                                                 default=0.0), 2),
                       "segments": info}
        print(f"  {side}: {slide[side]['n_segments']} 段着地，最大漂移 "
              f"{slide[side]['max_drift_cm']} cm")

    BUILD.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "step5_retarget.blend"))
    REPORTS.mkdir(parents=True, exist_ok=True)
    out = {"source_bvh": BVH.name, "source_fps": SRC_FPS,
           "target_fps": TGT_FPS,
           "clip_src_frames": [0, CLIP_END_SRC],
           "clip_dst_frames": [frames[0], frames[-1]],
           "clip_duration_s": round((n_frames - 1) / TGT_FPS, 3),
           "leg_len_bvh_m": round(bvh_leg, 5),
           "leg_len_ruth_m": round(ruth_leg, 5),
           "position_scale": round(scale, 5),
           "shoulder_yaw_fix_deg": round(math.degrees(dphi), 2),
           "bone_map": {k: [list(x) for x in v] for k, v in BONE_MAP.items()},
           "animated_bones": sorted(targets.keys()),
           "foot_slide": slide}
    (REPORTS / "retarget.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n[写出] {BUILD / 'step5_retarget.blend'}")
    print(f"[写出] {REPORTS / 'retarget.json'}")
    return out


if __name__ == "__main__":
    main()
