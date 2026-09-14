#!/usr/bin/env python3
"""对选定的正手源做动作分段分析，确定 7 个时间标记的位置。

分段不靠肉眼看渲染图，而是综合四路信号：
  手速曲线      acceleration / contact / follow-through 的骨架
  肩线 yaw      unit turn 的起始与幅度
  右手相对胸腔   backswing 末端（手最靠后最远）
  脚踝高度       split step 与落地（ready 与 load 的界）

输出每个标记的帧号 + 判定依据，供后续 author 阶段使用。

用法：python3 tools/fh_segment.py <bvh> [--json out.json]
"""

import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "probe", Path(__file__).resolve().parent / "fh_probe_bvh.py")
probe = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(probe)


def moving_average(x, w):
    if w < 3:
        return x
    k = np.ones(w) / w
    return np.convolve(x, k, mode="same")


def analyse(path):
    joints, order, ft, data = probe.parse_bvh(path)
    world = probe.forward_kinematics(joints, order, data)
    n = data.shape[0]

    hips = world["Hips"] / 100.0
    rw = world["RightWrist"] / 100.0
    lw = world["LeftWrist"] / 100.0
    ra = world["RightAnkle"] / 100.0
    la = world["LeftAnkle"] / 100.0
    chest = world["Chest"] / 100.0
    ls, rs = world["LeftShoulder"] / 100.0, world["RightShoulder"] / 100.0

    # 地平线：双脚中心
    fc = np.vstack([ra, la]).mean(axis=0)
    for a in (hips, rw, lw, ra, la, chest, ls, rs):
        a -= fc
    floor = float(np.percentile(np.minimum(ra[:, 1], la[:, 1]), 5))
    for a in (hips, rw, lw, ra, la, chest, ls, rs):
        a[:, 1] -= floor

    # ---- 信号 ----
    speed = np.zeros(n)
    speed[1:] = np.linalg.norm(np.diff(rw, axis=0), axis=1)
    speed_s = moving_average(speed, 9)

    yaw = np.degrees(np.unwrap(np.arctan2((rs - ls)[:, 2], (rs - ls)[:, 0])))

    rel = rw - chest
    reach = np.linalg.norm(rel, axis=1)
    # 手在身体后方的程度（+Z 是身后，取决于朝向，这里用与肩线的点积更稳）
    shoulder_dir = (rs - ls)
    shoulder_dir[:, 1] = 0
    sd = shoulder_dir / (np.linalg.norm(shoulder_dir, axis=1, keepdims=True)
                         + 1e-9)
    # 右腕相对胸腔在"右肩方向"上的投影：正=伸向右侧，负=收向左侧
    lateral = np.einsum("fi,fi->f", rel, sd)

    foot_y = np.minimum(ra[:, 1], la[:, 1])

    # ---- 标记 ----
    marks = {}

    contact = int(np.argmax(speed_s))
    marks["contact"] = contact

    # acceleration 起点：contact 之前速度曲线上"最后一次掉到 15% 峰值以下"
    peak = speed_s[contact]
    thr = peak * 0.15
    k = contact
    while k > 0 and speed_s[k] > thr:
        k -= 1
    marks["acceleration"] = int(k)

    # backswing 末端：acceleration 之前的局部极大 reach + 手在右侧最远
    lo = max(0, marks["acceleration"] - int(0.9 / ft))
    seg = lateral[lo:marks["acceleration"] + 1]
    marks["backswing"] = int(lo + np.argmax(seg)) if len(seg) else lo

    # unit turn 起点：肩线 yaw 开始持续偏转的位置（在 backswing 之前）
    yaw_v = np.abs(np.diff(moving_average(yaw, 15)))
    lim = marks["backswing"] - int(0.6 / ft)
    lim = max(lim, 1)
    cand = yaw_v[:lim]
    if len(cand):
        # 从后往前找第一个"明显低于峰值"的位置
        ythr = cand.max() * 0.25
        kk = lim - 1
        while kk > 1 and cand[kk] > ythr:
            kk -= 1
        marks["unit_turn"] = int(kk)
    else:
        marks["unit_turn"] = 0

    # split step：双脚离地（最低脚踝抬高）的窗口
    standing = np.percentile(foot_y, 20)
    airborne = foot_y > standing + 0.04
    k = None
    for i in range(min(marks["unit_turn"], n - 1)):
        if airborne[i]:
            k = i
            break
    marks["ready"] = 0
    marks["split_step"] = int(k) if k is not None else int(
        max(0, marks["unit_turn"] - int(0.4 / ft)))

    # follow_through：contact 之后速度掉到 20% 峰值以下
    thr2 = peak * 0.20
    k = contact
    while k < n - 1 and speed_s[k] > thr2:
        k += 1
    marks["follow_through"] = int(k)

    # recovery：之后动作回到低位（髋高度稳定 + 速度很低）
    k2 = marks["follow_through"]
    lowthr = speed_s[contact] * 0.06
    while k2 < n - 1 and speed_s[k2] > lowthr:
        k2 += 1
    marks["recovery"] = int(k2)

    # clip_end：第一次击球的结束。这段 4.79 s 里其实有**两次**挥拍——
    # 帧 443 处 lateral 再次冲到 0.35（第二次引拍），帧 460 起手速再起一波。
    # 只保留第一次击球的完整循环（含 recovery），末尾第二次引拍要裁掉。
    tail = lateral[contact + 40:]
    hit = np.where(tail > 0.30)[0]
    marks["clip_end"] = int(contact + 40 + hit[0] - 25) if len(hit) else n - 1
    marks["second_swing_detected"] = bool(len(hit))

    out = {
        "file": Path(path).name, "frames": int(n), "fps": round(1 / ft, 2),
        "marks": marks,
        "mark_seconds": {k: round(v * ft, 3) for k, v in marks.items()},
        "signals": {
            "speed_smoothed": np.round(speed_s, 4).tolist(),
            "yaw_deg": np.round(yaw, 2).tolist(),
            "reach_m": np.round(reach, 4).tolist(),
            "lateral_m": np.round(lateral, 4).tolist(),
            "foot_min_y": np.round(foot_y, 4).tolist(),
        },
    }
    return out


def main():
    p = sys.argv[1]
    res = analyse(p)
    n = res["frames"]
    print(f"{res['file']}  {n} 帧  {res['fps']} fps")
    print(f"{'标记':<16}{'帧':>6}{'秒':>8}{'占全长':>8}")
    for k in ("ready", "split_step", "unit_turn", "backswing",
              "acceleration", "contact", "follow_through", "recovery"):
        f = res["marks"][k]
        print(f"  {k:<14}{f:>6}{f*0.01:>8.2f}{f/n:>7.0%}")

    s = res["signals"]["speed_smoothed"]
    print(f"\n  手速峰值 {max(s):.3f} m/帧 @ {s.index(max(s))}")
    print("\n  时间线抽样（每 20 帧）")
    print(f"  {'帧':>5}{'手速':>8}{'肩yaw':>8}{'reach':>8}{'lateral':>9}{'最低脚y':>9}")
    for i in range(0, n, 20):
        print(f"  {i:>5}{s[i]:>8.3f}{res['signals']['yaw_deg'][i]:>8.1f}"
              f"{res['signals']['reach_m'][i]:>8.3f}"
              f"{res['signals']['lateral_m'][i]:>9.3f}"
              f"{res['signals']['foot_min_y'][i]:>9.3f}")

    if "--json" in sys.argv:
        o = Path(sys.argv[sys.argv.index("--json") + 1])
        o.write_text(json.dumps(res, ensure_ascii=False))
        print(f"\n[写出] {o}", file=sys.stderr)


if __name__ == "__main__":
    main()
