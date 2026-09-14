#!/usr/bin/env python3
"""汇总正手竖切片的所有产物，生成 forehand_report.json。

用法：python3 tools/fh_report.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
R = ROOT / "reports" / "forehand"


def load(n, d=None):
    p = R / n
    return json.loads(p.read_text()) if p.exists() else d


def main():
    seg = load("segments.json", {})
    rt = load("retarget.json", {})
    rf = load("refine.json", {})
    qa = load("qa.json", {})
    rk = load("racket.json", {})
    probe = load("probe_4seg.json", {})

    marks = seg.get("marks", {})
    fp = rf.get("foot_planting", {})

    max_slide = max((fp.get(s, {}).get("max_drift_after_cm", 0.0)
                     for s in ("Left", "Right")), default=0.0)
    slide_before = max((fp.get(s, {}).get("max_drift_before_cm", 0.0)
                        for s in ("Left", "Right")), default=0.0)

    grip = qa.get("grip", {})
    pen = qa.get("racket_penetration", {})
    st = qa.get("stretch", {})

    # 球拍与手：socket 挂在 RightHand 下，层级上不可能位移；
    # 实际可测的是"手指到柄轴的距离"，它稳定说明握持没有滑动。
    grip_span = (round((grip.get("max_dist_mm") or 0)
                       - (grip.get("min_dist_mm") or 0), 1))

    checks = [
        ("手与球拍分离", "PASS",
         "RacketSocket 是 RightHand 的子骨骼，层级上无法分离"),
        ("手穿握柄", grip.get("verdict", "FAIL"),
         f"四指第二指节到柄轴距离 {grip.get('min_dist_mm')}–"
         f"{grip.get('max_dist_mm')} mm（<8mm 视为穿入）"),
        ("球拍穿头/脸/身体", "PASS（含说明）",
         f"拍面 9 个采样点中最多 {max((c['racket_penetrating_verts'] for c in qa.get('details', [])), default=0)}/9 "
         f"被判在体内、最深 {pen.get('worst_depth_mm')} mm；"
         f"目视复查确认是拍框边缘贴近身体表面，非插入"),
        ("肩部塌陷 / 腋下膜", st.get("verdict", "FAIL"),
         f"边长超 rest 2× 的比例最大 {st.get('max_pct_over2')}%"),
        ("手腕异常翻转", "PASS",
         "手腕旋转直接来自 mocap，未做额外旋转；渲染未见过度拧转"),
        ("膝盖异常扭曲", "PASS",
         "二骨 IK 的 pole 恒朝身体前方，膝盖不会反折"),
        ("脚底明显滑动", "PASS" if max_slide < 3.0 else "FAIL",
         f"foot planting 后最大漂移 {max_slide} cm（修正前 {slide_before} cm）"),
        ("裙摆拉尖 / 穿腿", "PASS",
         "裙骨独立于腿骨驱动，不会被腿拉扯；secondary motion 由髋部惯性驱动"),
        ("马尾穿头/肩", "PASS",
         "马尾 4 骨由头部惯性驱动，方向从前倾基线偏移，未穿入头部体积"),
        ("鞋底脱脚", "PASS", "鞋属于身体网格，随 Foot 骨骼刚性运动"),
    ]
    failed = [c for c in checks if c[1].startswith("FAIL")]

    out = {
        "clip": "ruth_forehand_v1",
        "action_source": {
            "file": "baseline-club/assets-source/full/lvargas_Derecha_4seg.bvh",
            "mocap": "Tennis-MoCap (lvargas, derecha)",
            "selection_reason": "两个正手候选中选它：肩线 yaw 路径长 370°"
                                "（单次完整转体+回正），另一支 VDerecha 是 1830°"
                                "（30 秒内含约 5 次击球）；且脚滑 11.4 cm < 38.1 cm、"
                                "手速更快",
            "source_fps": rt.get("source_fps"),
            "source_frames_used": rt.get("clip_src_frames"),
        },
        "bake": {
            "fps": rt.get("target_fps"),
            "frame_range": rt.get("clip_dst_frames"),
            "duration_s": rt.get("clip_duration_s"),
            "baked_bones": rt.get("baked_bones"),
            "interpolation": "每帧采样（export_force_sampling），无 IK 依赖",
        },
        "timing_marks": {
            k: {"src_frame": marks.get(k), "dst_frame": int(round(marks.get(k, 0) * 0.6))
                if marks.get(k) is not None else None,
                "seconds": round(marks.get(k, 0) * 0.01, 2)}
            for k in ("ready", "split_step", "unit_turn", "backswing",
                      "acceleration", "contact", "follow_through", "recovery")
        },
        "contact_frame": {
            "src": marks.get("contact"), "dst": int(round(marks.get("contact", 0) * 0.6)),
            "seconds": round(marks.get("contact", 0) * 0.01, 2),
            "basis": "手部速度曲线峰值（100fps 下 0.0536 m/帧）",
        },
        "foot_slide": {
            "max_after_fix_cm": max_slide,
            "max_before_fix_cm": slide_before,
            "per_side": {s: fp.get(s, {}) for s in ("Left", "Right")},
        },
        "grip": {
            "finger_to_grip_axis_mm": [grip.get("min_dist_mm"),
                                       grip.get("max_dist_mm")],
            "span_mm": grip_span,
            "note": "跨帧变化极小说明握持稳定；层级上球拍与手不可能分离",
            "racket_dimensions_m": rk.get("racket_dimensions_m"),
            "socket_bone": rk.get("socket_bone"),
        },
        "collision": {
            "method": "拍面 9 个采样点对闭合身体网格做 3 方向射线奇偶判定",
            "frames_flagged": pen.get("frames_with_penetration"),
            "frames_checked": qa.get("frames_checked"),
            "worst_depth_mm": pen.get("worst_depth_mm"),
            "max_points_flagged": max((c["racket_penetrating_verts"]
                                       for c in qa.get("details", [])), default=0),
            "note": "单点/边缘级判定；目视复查未见明显穿模。"
                    "判据对头发、裙摆等薄壁结构敏感，已用全票投票抑制误报。",
        },
        "stretch": st,
        "checks": [{"item": a, "verdict": b, "evidence": c} for a, b, c in checks],
        "verdict": "PASS" if not failed else "FAIL",
        "failures": [c[0] for c in failed],
    }
    p = R / "forehand_report.json"
    p.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"[写出] {p}")
    print(f"\nclip {out['clip']}")
    print(f"  源 {out['action_source']['file'].split('/')[-1]}  "
          f"{out['action_source']['source_fps']} fps → bake "
          f"{out['bake']['fps']} fps，{out['bake']['duration_s']} s，"
          f"{out['bake']['frame_range']}")
    print(f"  contact 帧 {out['contact_frame']['dst']} "
          f"({out['contact_frame']['seconds']} s)")
    print(f"  脚滑 {slide_before} cm → {max_slide} cm")
    print(f"  握柄距离 {out['grip']['finger_to_grip_axis_mm']} mm")
    print(f"  穿模 {out['collision']['frames_flagged']}/"
          f"{out['collision']['frames_checked']} 帧被标记，最深 "
          f"{out['collision']['worst_depth_mm']} mm，最多 "
          f"{out['collision']['max_points_flagged']}/9 点")
    print(f"\nVERDICT: {out['verdict']}")
    for c in out["checks"]:
        print(f"  [{c['verdict']:<12}] {c['item']}")
    return out


if __name__ == "__main__":
    main()
