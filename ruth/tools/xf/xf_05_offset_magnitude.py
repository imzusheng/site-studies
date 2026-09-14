"""ROOT CAUSE 量化：重现 fh_refine.secondary_motion 的 offsets，看它到底有多大。

fh_refine.py 里：
    offs[i] = offs[i-1]*damp - dp*strength      # dp = 父骨每帧位移（米）
    d = base + tip + o                          # base 是单位方向向量，o 是位移量
    wd = d.normalized()                         # 用来瞄准骨骼

base 是单位向量、o 是米——量纲不一致。本脚本用实际保存的 blend 里的 Hips/Head
轨迹重现 offs，并算出 |o| 的量级与由此造成的骨骼偏转角。

用法：blender -b ruth_forehand_v1.blend -P xf_05_offset_magnitude.py
"""
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
TMP = Path("/tmp")

scene = bpy.context.scene
rig = bpy.data.objects["Ruth_Rig"]
me = bpy.data.objects["Ruth"].data

CFG = {
    "skirt": {"bones": [f"Skirt{t}{i}" for t in "FBLR" for i in (1, 2, 3)],
              "parent": "Hips", "strength": 1.6, "damp": 0.72},
    "ponytail": {"bones": [f"Ponytail{i}" for i in (1, 2, 3, 4)],
                 "parent": "Head", "strength": 2.2, "damp": 0.70},
}

frames = list(range(int(scene.frame_start), int(scene.frame_end) + 1))
out = {"clip_frames": [frames[0], frames[-1]], "chains": {}}

for key, cfg in CFG.items():
    # 父骨轨迹（世界空间），与原实现一致
    pts = []
    for i in frames:
        scene.frame_set(i)
        pts.append((rig.matrix_world
                    @ rig.pose.bones[cfg["parent"]].matrix.translation).copy())

    offs = [Vector((0.0, 0.0, 0.0))]
    dp_hist = [0.0]
    for i in range(1, len(frames)):
        dp = pts[i] - pts[i - 1]
        dp_hist.append(dp.length)
        offs.append(offs[-1] * cfg["damp"] - dp * cfg["strength"])

    omag = np.array([o.length for o in offs])
    dpmag = np.array(dp_hist)

    # 由 o 造成的骨骼方向偏差角：base≈单位向量, |tip|≈0.35
    def dir_err(base, o):
        tip = Vector((0.0, 0.0, -1.0)) * 0.35 + o
        d = base + tip + o
        if d.length < 1e-6:
            return 0.0
        return float(np.degrees(base.angle(d.normalized())))

    per_bone = {}
    for name in cfg["bones"]:
        pb = rig.pose.bones.get(name)
        if pb is None:
            continue
        base = (rig.matrix_world.to_3x3() @ pb.bone.matrix_local.to_3x3()
                @ Vector((0.0, 1.0, 0.0))).normalized()
        errs = [dir_err(base, offs[i]) for i in range(len(frames))]
        # 实际 pose 与 rest 的夹角（来自保存文件，做交叉验证）
        scene.frame_set(0)
        rest_m = pb.bone.matrix_local
        rel = rest_m.inverted() @ pb.matrix
        per_bone[name] = {
            "rest_dir": [round(float(v), 4) for v in base],
            "aim_err_max_deg": round(float(np.max(errs)), 2),
            "aim_err_median_deg": round(float(np.median(errs)), 2),
            "aim_err_frame0_deg": round(float(errs[0]), 2),
            "saved_pose_angle_frame0_deg": round(
                float(np.degrees(rel.to_quaternion().angle)), 3),
        }

    out["chains"][key] = {
        "parent": cfg["parent"],
        "strength": cfg["strength"], "damp": cfg["damp"],
        "parent_step_mm": {
            "max": round(float(dpmag.max()) * 1000, 3),
            "median": round(float(np.median(dpmag)) * 1000, 3),
        },
        "offset_o_mm": {
            "max": round(float(omag.max()) * 1000, 3),
            "median": round(float(np.median(omag)) * 1000, 3),
            "p95": round(float(np.percentile(omag, 95)) * 1000, 3),
            "max_at_frame": int(frames[int(omag.argmax())]),
        },
        "ratio_o_to_unit_base": {
            "max": round(float(omag.max()), 3),
            "p95": round(float(np.percentile(omag, 95)), 3),
        },
        "steady_state_gain": round(float(cfg["strength"] / (1 - cfg["damp"])), 3),
        "per_bone": per_bone,
    }
    print(f"\n=== {key} (父={cfg['parent']} strength={cfg['strength']} "
          f"damp={cfg['damp']}) ===")
    print(f"  父骨每帧位移: max={dpmag.max()*1000:.2f} mm  "
          f"中位={np.median(dpmag)*1000:.2f} mm")
    print(f"  累积偏移 |o|: max={omag.max()*1000:.1f} mm "
          f"(第 {frames[int(omag.argmax())]} 帧)  "
          f"p95={np.percentile(omag,95)*1000:.1f} mm  "
          f"中位={np.median(omag)*1000:.1f} mm")
    print(f"  |o| 相对单位向量 base 的倍数: max={omag.max():.3f}  "
          f"（1.0 = 偏移与方向向量等长，方向完全由偏移决定）")
    print(f"  理论稳态增益 strength/(1-damp) = {cfg['strength']/(1-cfg['damp']):.2f}")
    print("  骨骼方向被瞄准偏差（0 帧 / 中位 / 全片最大）：")
    for n, d in list(per_bone.items())[:6]:
        print(f"    {n:12s} {d['aim_err_frame0_deg']:7.2f}° / "
              f"{d['aim_err_median_deg']:7.2f}° / {d['aim_err_max_deg']:7.2f}°   "
              f"(保存文件里第0帧实测 {d['saved_pose_angle_frame0_deg']:.2f}°)")

(TMP / "xf_offset_magnitude.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2))
print(f"\n[写出] {TMP/'xf_offset_magnitude.json'}")
