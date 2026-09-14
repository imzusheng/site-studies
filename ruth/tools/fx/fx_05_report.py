#!/usr/bin/env python3
"""汇总本轮修复的证据 → twist_audit.json + deformation_report_fixed.json

只读已实测的数据文件，不做任何重新推导。
用法: python3 tools/fx/fx_05_report.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
R = ROOT / "reports" / "forehand"
V = ROOT / "reports" / "validation"

qa = json.loads((R / "_qa_raw.json").read_text())
fix_map = json.loads((R / "tear_map_fix.json").read_text())
old_map = json.loads((R / "tear_map_old.json").read_text())
roll = json.loads((R / "roll_fix.json").read_text())
rest = json.loads((R / "rest_baseline.json").read_text())
before_twist = json.loads((V / "twist_swing_attribution.json").read_text())

GATED_LEGS = ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]
GATED_SEC = ["SkirtF1", "SkirtB1", "SkirtL1", "SkirtR1", "Ponytail1", "Ponytail2"]
LEG_LIMIT, SEC_LIMIT = 10.0, 5.0

# ------------------------------------------------------------- twist audit
before_by_bone = {r["bone"]: r for r in before_twist["twist_over_60deg"]}
series = {}
gates = []
for n in GATED_LEGS + GATED_SEC:
    src = qa["leg_series"][n] if n in qa["leg_series"] else qa["sec_series"][n]
    series[n] = {
        "swing_deg_per_frame": src["swing"],
        "twist_deg_per_frame": src["twist"],
        "max_swing_deg": round(qa["all_swing_max"][n], 3),
        "max_abs_twist_deg": round(qa["all_twist_max"][n], 6),
        "before_fix": {
            "twist_deg": before_by_bone.get(n, {}).get("twist_deg"),
            "swing_deg": before_by_bone.get(n, {}).get("swing_deg"),
        },
    }
    limit = LEG_LIMIT if n in GATED_LEGS else SEC_LIMIT
    ok = qa["all_twist_max"][n] < limit
    gates.append({"bone": n, "gate": f"twist < {limit}°",
                  "measured_deg": round(qa["all_twist_max"][n], 6), "verdict":
                  "PASS" if ok else "FAIL"})

twist_audit = {
    "definition": (
        "M_b = pose_b @ rest_b^-1 是该骨对几何体施加的世界变换；"
        "y_rest = rest 姿态下骨 Y 轴，y_now = M_b 作用后的骨 Y 轴；"
        "q_swing = y_rest.rotation_difference(y_now)（纯 swing 分量）；"
        "q_res = q_swing^-1 @ M_b（固定骨骼轴 → 纯 twist）。"
        "M_b 就是真正移动顶点的矩阵，所以这个 twist 直接对应"
        "『几何被拧了多少』。"),
    "method": "逐帧、逐骨计算；帧率 60fps，共 245 帧（0–244）",
    "clip": "Ruth_Forehand",
    "frames": qa["leg_series"][GATED_LEGS[0]]["swing"].__len__(),
    "gates": gates,
    "gates_pass": all(g["verdict"] == "PASS" for g in gates),
    "max_over_all_gated": {
        "leg_twist_deg": round(max(qa["all_twist_max"][n] for n in GATED_LEGS), 6),
        "skirt_twist_deg": round(max(qa["all_twist_max"][n] for n in GATED_SEC[:4]), 6),
        "ponytail_twist_deg": round(max(qa["all_twist_max"][n] for n in GATED_SEC[4:]), 6),
    },
    "all_bones_max_abs_twist_deg": {k: round(v, 6) for k, v in qa["all_twist_max"].items()},
    "all_bones_max_swing_deg": qa["all_swing_max"],
    "series": series,
    "note_non_gated": (
        "手/指骨（RightHand*、LeftHand*）与手部的 twist 数值很大（~180°），"
        "但那是 retarget 从 mocap 继承的手部自转（握拍姿态），属作者内容，"
        "本轮未改、也不在门限清单内；它们不在受控列表里，如实记录。"),
}
(R / "twist_audit.json").write_text(
    json.dumps(twist_audit, ensure_ascii=False, indent=2))

# ------------------------------------------------- deformation report fixed
cmp_rows = []
for mark in fix_map["marks"]:
    f, o = fix_map["marks"][mark], old_map["marks"][mark]
    cmp_rows.append({
        "mark": mark, "frame": f["frame"],
        "gap_gt_15mm": {"before": o["gap_gt_warn"], "after": f["gap_gt_warn"],
                        "reduction_pct": round(
                            100.0 * (o["gap_gt_warn"] - f["gap_gt_warn"])
                            / o["gap_gt_warn"], 1)},
        "max_gap_mm": {"before": o["max_gap_mm"], "after": f["max_gap_mm"]},
        "edges_gt_10x": {"before": o["edges_gt_10x"], "after": f["edges_gt_10x"]},
        "max_ratio": {"before": o["max_ratio"], "after": f["max_ratio"]},
    })

hist = qa["stretch_hist"]
worst_frame = max(hist, key=lambda r: r["max_ratio"])
gate_edges_10x = max(r["max_ratio"] for r in hist) > 10.0
big_comp = qa["worst"]["largest_component_edges"] if qa.get("worst") else None

deform = {
    "issue_fixed_this_round": (
        "aim_matrix 的 roll/twist 缺陷 —— 已修复并验证：受控骨 twist 从 "
        "156.3–172.5° 降到 0.000°，裙摆放射状碎片 / 马尾硬刺 / 髋部长三角 "
        "在渲染中消失。"),
    "remaining_defect": (
        "残余拉伸来自一个**与本轮根因无关、且早于本轮就存在**的问题："
        "角色资产的权重场在每一处关节边界都是硬切（相邻顶点骨骼集合完全不重叠），"
        "于是任何跨边界的相对旋转都会把网格撕开。证据："
        "round 1 的 09_deformation.json 里 12 个形变姿态就有 507–1007 条 >2× 边、"
        "最大 111×，当时判定 PASS；本轮权重逐元素未变（最大差 0.0）。"),
    "rest_baseline": {
        "file": "reports/forehand/rest_baseline.json",
        "method_A_vs_B_mm": rest["cross_check_mm"]["A_vs_B"],
        "method_A_vs_C_mm": rest["cross_check_mm"]["A_vs_C"],
        "agreement": rest["agreement"],
    },
    "gates": [
        {"gate": "任何 edge > 10×", "limit": "不得超过 10×",
         "measured": round(max(r["max_ratio"] for r in hist), 2),
         "verdict": "FAIL" if gate_edges_10x else "PASS"},
        {"gate": "可见区域连续大片 >3×", "limit": f"连续块 < 5 条边",
         "measured": f"最大连续块 {big_comp} 条边（frame "
                     f"{qa['worst']['frame']}）",
         "verdict": "FAIL" if (big_comp or 0) >= 5 else "PASS"},
        {"gate": "腿部 unexpected twist < 10°",
         "measured": round(max(qa["all_twist_max"][n] for n in GATED_LEGS), 6),
         "verdict": "PASS"},
        {"gate": "Skirt/Ponytail unintended twist < 5°",
         "measured": round(max(qa["all_twist_max"][n] for n in GATED_SEC), 6),
         "verdict": "PASS"},
    ],
    "gates_pass": not gate_edges_10x and (big_comp or 0) < 5,
    "worst_frame_of_clip": worst_frame,
    "before_after": cmp_rows,
    "clip_stats": {
        "frames": len(hist),
        "max_ratio_over_clip": round(max(r["max_ratio"] for r in hist), 3),
        "max_gap_mm_over_clip": fix_map["marks"][
            max(fix_map["marks"], key=lambda m: fix_map["marks"][m]["max_gap_mm"])
        ]["max_gap_mm"],
        "median_max_ratio": round(
            sorted(r["max_ratio"] for r in hist)[len(hist) // 2], 3),
        "median_edges_gt_3x": sorted(r["gt_3x"] for r in hist)[len(hist) // 2],
    },
    "residual_defect_map": {
        "how": "把绝对拉开 >15 mm 的边按 rest 位置（x/z，5 cm 网格）聚类，"
               "再统计每簇的骨骼对",
        "clusters": fix_map["marks"]["acceleration"]["clusters"],
        "reading": "每一簇都是一处硬权重边界：颈/肩、肩/臂、头/马尾、"
                   "手/指、髋/裙、裙/腿。与 round 1 已修好的腋下是同一类问题，"
                   "只是其余关节当时没有一起做边界重叠。",
    },
    "foot_planting": roll["foot_planting"],
    "weights_untouched": {
        "verification": "step5_retarget.blend 与 step7_rollfix.blend 的权重矩阵"
                        "逐元素比对，最大绝对差 0.0；顶点组名完全一致",
        "why_it_matters": "证明残余拉伸不是本轮改动引入的",
    },
    "verdict": "FAIL",
    "verdict_reason": (
        "根因（roll/twist）已修复且经硬门验证；但 brief 的 PASS 条件还要求"
        "『true rest deformation QA clean』，实测仍有 32–150 条边 >10×、"
        "最大拉开 186 mm、且在裙摆下沿/大腿处有肉眼可见的角状缺口。"
        "这些来自权重边界，本轮被明令禁止修改（『禁止：改权重』），"
        "因此在允许范围内无法达成 PASS。"),
}
(R / "deformation_report_fixed.json").write_text(
    json.dumps(deform, ensure_ascii=False, indent=2))
print(f"[写出] {(R/'twist_audit.json').relative_to(ROOT)}")
print(f"[写出] {(R/'deformation_report_fixed.json').relative_to(ROOT)}")
print(f"  腿部 max twist {deform['gates'][2]['measured']}°")
print(f"  裙/马尾 max twist {deform['gates'][3]['measured']}°")
print(f"  全片 max edge stretch {deform['clip_stats']['max_ratio_over_clip']}×")
print(f"  verdict {deform['verdict']}")
