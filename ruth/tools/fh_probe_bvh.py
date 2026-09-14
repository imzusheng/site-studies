#!/usr/bin/env python3
"""解析 Tennis-MoCap BVH，提取运动特征用于源选择。

为什么自己解析而不用 Blender 导入：源选择要在"进 Blender"之前完成，
而且我需要逐帧的世界坐标轨迹（脚、手、髋）来做客观比较，不是看一眼渲染图。
BVH 只有 ROOT 带位置通道，其余关节靠 OFFSET + 旋转累积，所以必须自己算正解。

BVH 约定：CHANNELS 给出的旋转按顺序左乘累积（ZXY → M = Rz·Rx·Ry），
ROOT 的位置通道是父坐标系下的平移。
这份数据的单位是厘米（Chest 在 Hips 上方 28.5，即 28.5 cm）。

用法：
    python3 tools/fh_probe_bvh.py <file.bvh> [--json out.json]
"""

import json
import math
import sys
from pathlib import Path

import numpy as np


def parse_bvh(path):
    txt = Path(path).read_text(encoding="utf-8", errors="replace")
    lines = txt.splitlines()
    mi = next(i for i, l in enumerate(lines) if l.strip() == "MOTION")
    frames = int(lines[mi + 1].split(":")[1])
    frame_time = float(lines[mi + 2].split(":")[1])

    # ---- HIERARCHY ----
    joints = {}
    order = []
    stack = []
    i = 0
    while i < mi:
        s = lines[i].strip()
        if s.startswith(("ROOT", "JOINT")):
            name = s.split()[1]
            joints[name] = {"name": name, "offset": None, "channels": None,
                            "parent": stack[-1] if stack else None,
                            "depth": len(stack)}
            order.append(name)
            stack.append(name)
        elif s.startswith("End Site"):
            # 必须整块跳过。End Site 也是 { OFFSET } 的形式，不跳过的话
            # 它的 "}" 会把关节栈多弹一层，导致 RightCollar / LeftHip /
            # RightHip 的 parent 变成 None，层级错乱、世界坐标全错。
            j = i + 1
            depth = 0
            while j < mi:
                t = lines[j].strip()
                if t == "{":
                    depth += 1
                elif t == "}":
                    depth -= 1
                    if depth == 0:
                        break
                j += 1
            i = j
        elif s.startswith("OFFSET"):
            joints[stack[-1]]["offset"] = [float(x) for x in s.split()[1:4]]
        elif s.startswith("CHANNELS"):
            toks = s.split()
            joints[stack[-1]]["channels"] = toks[2:2 + int(toks[1])]
        elif s == "}":
            if stack:
                stack.pop()
        i += 1

    # ---- MOTION ----
    data = np.empty((frames, 0))
    rows = []
    for k in range(frames):
        rows.append([float(x) for x in lines[mi + 3 + k].split()])
    data = np.array(rows, dtype=np.float64)

    return joints, order, frame_time, data


def rot_matrix(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == "X":
        return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    if axis == "Y":
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def forward_kinematics(joints, order, data):
    """返回 {joint: (frames, 3) 世界坐标}。"""
    n = data.shape[0]
    world = {name: np.zeros((n, 3)) for name in order}
    # 每个关节的局部变换只依赖它自己那一行通道
    col = 0
    chan_slice = {}
    for name in order:
        ch = joints[name]["channels"]
        chan_slice[name] = (col, col + len(ch))
        col += len(ch)

    # 逐帧、逐关节（按层级顺序，父先于子）
    local_R = {}
    local_T = {}
    for name in order:
        a, b = chan_slice[name]
        seg = data[:, a:b]
        ch = joints[name]["channels"]
        R = np.tile(np.eye(3), (n, 1, 1))
        off = np.array(joints[name]["offset"], dtype=np.float64)
        T = np.tile(off, (n, 1))
        for c, cn in enumerate(ch):
            if cn.endswith("position"):
                T[:, "XYZ".index(cn[0])] += seg[:, c]
            else:
                ax = cn[0]
                for f in range(n):
                    R[f] = R[f] @ rot_matrix(ax, seg[f, c])
        local_R[name] = R
        local_T[name] = T

    # 世界变换 = 父的世界变换 ∘ 自己的局部变换：
    #   Rw = Rw_parent · R_local
    #   Pw = Pw_parent + Rw_parent · T_local
    # 用的是父的**世界**旋转，不是局部旋转——用局部旋转会把子节点折叠到父的
    # 自身坐标系里（实测 Head 落到 88 cm 而 Hips 在 135 cm）。
    # `order` 是深度优先先序，父一定排在子之前。
    world_R = {}
    world_P = {}
    for name in order:
        pr = joints[name]["parent"]
        if pr is None:
            world_R[name] = local_R[name]
            world_P[name] = local_T[name]
        else:
            Rp, Pp = world_R[pr], world_P[pr]
            world_R[name] = np.einsum("fij,fjk->fik", Rp, local_R[name])
            world_P[name] = Pp + np.einsum("fij,fj->fi", Rp, local_T[name])
    return world_P


def analyse(path):
    joints, order, ft, data = parse_bvh(path)
    n = data.shape[0]
    world = forward_kinematics(joints, order, data)

    out = {"file": Path(path).name, "frames": int(n),
           "frame_time": ft, "fps": round(1.0 / ft, 2),
           "duration_s": round(n * ft, 3),
           "unit_note": "源单位为厘米",
           "joints": order}

    def series(name, axis=None):
        w = world[name]
        return w if axis is None else w[:, axis]

    # 关键轨迹（厘米 → 米）
    hips = world["Hips"] / 100.0
    rw = world["RightWrist"] / 100.0
    lw = world["LeftWrist"] / 100.0
    ra = world["RightAnkle"] / 100.0
    la = world["LeftAnkle"] / 100.0
    head = world["Head"] / 100.0
    chest = world["Chest"] / 100.0

    # 平移到"双脚中心 + 最低脚踩地"，去掉演员在场地中的绝对位置，
    # 让不同片段之间可比
    foot_c = np.vstack([ra, la]).mean(axis=0)
    for arr in (hips, rw, lw, ra, la, head, chest):
        arr -= foot_c
    foot_min = np.minimum(ra[:, 1], la[:, 1])
    base = float(np.percentile(foot_min, 5))
    for arr in (hips, rw, lw, ra, la, head, chest):
        arr[:, 1] -= base

    out["height_cm"] = round(float(np.percentile(head[:, 1], 95) * 100), 1)
    out["hips_y_range_cm"] = [round(float(hips[:, 1].min() * 100), 1),
                              round(float(hips[:, 1].max() * 100), 1)]
    out["hips_x_range_cm"] = [round(float(hips[:, 0].min() * 100), 1),
                              round(float(hips[:, 0].max() * 100), 1)]
    out["hips_z_range_cm"] = [round(float(hips[:, 2].min() * 100), 1),
                              round(float(hips[:, 2].max() * 100), 1)]

    # 手相对胸腔的距离（挥拍半径），用它的变化找动作分段
    rel_rw = rw - chest
    dist_rw = np.linalg.norm(rel_rw, axis=1)
    out["righthand_from_chest_cm"] = {
        "min": round(float(dist_rw.min() * 100), 1),
        "max": round(float(dist_rw.max() * 100), 1),
    }

    # 脚滑：脚在地面上的水平漂移。
    # 必须按**连续着地段**分别统计——对着地段直接 diff 会把跨段的大跳跃
    # 也算成滑动（实测虚报到 29–88 cm）。
    def foot_slide(ankle):
        thr = np.percentile(ankle[:, 1], 25) + 0.02
        grounded = ankle[:, 1] <= thr
        segs = []
        run = []
        for k, g in enumerate(grounded):
            if g:
                run.append(k)
            elif run:
                segs.append(run)
                run = []
        if run:
            segs.append(run)
        segs = [s for s in segs if len(s) >= 8]
        if not segs:
            return {"max_drift_cm": 0.0, "n_segments": 0,
                    "grounded_frames": int(grounded.sum()),
                    "segments": []}
        info = []
        for s in segs:
            pts = ankle[s][:, [0, 2]]
            drift = float(np.linalg.norm(pts - pts[0], axis=1).max() * 100)
            info.append({"start": s[0], "end": s[-1], "len": len(s),
                         "drift_cm": round(drift, 2)})
        return {"max_drift_cm": round(max(i["drift_cm"] for i in info), 2),
                "n_segments": len(segs),
                "grounded_frames": int(grounded.sum()),
                "segments": info}

    out["foot_slide"] = {"right": foot_slide(ra), "left": foot_slide(la)}

    # 帧间抖动（高频能量）：手部加速度的中位数
    acc = np.linalg.norm(np.diff(rel_rw, n=2, axis=0), axis=1)
    out["hand_jitter_cm_per_frame2"] = {
        "median": round(float(np.median(acc) * 100), 3),
        "p95": round(float(np.percentile(acc, 95) * 100), 3),
        "max": round(float(acc.max() * 100), 2),
    }

    # 手部速度曲线（用于找 contact：右手最快的那一帧附近）
    vel = np.linalg.norm(np.diff(rw, axis=0), axis=1)
    out["hand_speed_cm_per_frame"] = {
        "median": round(float(np.median(vel) * 100), 3),
        "p95": round(float(np.percentile(vel, 95) * 100), 2),
        "max": round(float(vel.max() * 100), 2),
        "argmax_frame": int(np.argmax(vel)),
    }

    # 肩线朝向：atan2 会环绕，先 unwrap 再取范围
    ls, rs = world["LeftShoulder"], world["RightShoulder"]
    shoulder_axis = rs - ls
    yaw = np.unwrap(np.arctan2(shoulder_axis[:, 2], shoulder_axis[:, 0]))
    yaw_deg = np.degrees(yaw)
    out["shoulder_yaw_deg_unwrapped"] = {
        "start": round(float(yaw_deg[0]), 1),
        "end": round(float(yaw_deg[-1]), 1),
        "range": round(float(yaw_deg.max() - yaw_deg.min()), 1),
        "path_len": round(float(np.abs(np.diff(yaw_deg)).sum()), 1)}

    # 躯干前倾/侧倾
    spine = chest - hips
    lean_fb = np.degrees(np.arctan2(spine[:, 2], spine[:, 1]))
    out["torso_lean_fb_deg"] = {"min": round(float(lean_fb.min()), 1),
                                "max": round(float(lean_fb.max()), 1),
                                "range": round(float(lean_fb.max()
                                                     - lean_fb.min()), 1)}

    out["_series"] = {
        "hips": np.round(hips, 4).tolist(),
        "right_wrist": np.round(rw, 4).tolist(),
        "left_wrist": np.round(lw, 4).tolist(),
        "right_ankle": np.round(ra, 4).tolist(),
        "left_ankle": np.round(la, 4).tolist(),
        "hand_speed": np.round(vel, 5).tolist(),
    }
    return out


def main():
    p = Path(sys.argv[1])
    res = analyse(p)
    print(json.dumps({k: v for k, v in res.items() if k != "_series"},
                     ensure_ascii=False, indent=2))
    if "--json" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--json") + 1])
        out.write_text(json.dumps(res, ensure_ascii=False))
        print(f"\n[写出] {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
