"""Source Asset Gate：导入源 GLB，坐标系归一，几何测量。

只产出**证据**；结论在 reports/01_source_audit.json 的 verdict 段。

测量项：
  朝向    up 轴与极性（双判据投票）、角色面向哪个轴
  姿态    上臂外展角 / 前臂角 / 臂-躯干最小间隙沿高度的分布
  腿      腿轴线垂直度、两腿间距、膝与脚的朝向线索
  几何    non-manifold / boundary / 连通分量 / 零面积 / 退化三角 / 细长面
  对称    左右镜像最近点距离分位数
  截面    48 层的真实几何截面：每层分成几段、各段 x 范围、段间空隙

运行：
    import _run; _run.go("01_import_gate.py")
"""

import json
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lib_source as S      # noqa: E402

ROOT = HERE.parent
PREV = ROOT / "preview"
REPORTS = ROOT / "reports"

WELD_DIST = 1e-6
CLUSTER_GAP = 0.0025
N_SLICE = 48


def section_segments(me, z, gap=CLUSTER_GAP):
    """在 z 处做真实几何截面，返回 (段, 空隙)。

    段 = 截面点按 x 排序后相邻间距小于 gap 的连续簇；段之间的 x 空隙就是
    这一高度的空气间隙。用真实截面而不是"z 落在区间内的顶点"，是因为
    后者会被面片尺寸污染：一个跨越高度的三角面只贡献少量顶点，
    在 x 上却是分散的，会凭空造出大量假间隙。
    """
    bm = bmesh.new()
    bm.from_mesh(me)
    try:
        res = bmesh.ops.bisect_plane(
            bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
            plane_co=(0.0, 0.0, z), plane_no=(0.0, 0.0, 1.0),
            clear_inner=False, clear_outer=False)
        xs = sorted({round(v.co.x, 6) for v in res["geom_cut"]
                     if isinstance(v, bmesh.types.BMVert)})
    finally:
        bm.free()
    if not xs:
        return [], []
    segs, gaps = [], []
    start = prev = xs[0]
    cnt = 1
    for x in xs[1:]:
        if x - prev > gap:
            segs.append((start, prev, cnt))
            gaps.append((prev, x, x - prev))
            start = x
            cnt = 0
        prev = x
        cnt += 1
    segs.append((start, prev, cnt))
    return segs, gaps


def arm_pose(sections, height):
    """从截面数据里提取手臂姿态与臂-身空隙。

    手臂的识别用**截面空隙**而不是段序：截面在手臂处会断开，断开位置就是
    空气间隙。手部散开成多段（每根手指一段）时，"最外侧段"只是某根手指，
    按段序取"第二段当躯干"会把手指间隙误判成臂-身间隙（实测把 100mm 的
    真实间隙算成 2.5mm）。所以这里取该层最大的、完全落在右半侧的间隙，
    间隙左侧是躯干，右侧全部属于手臂。

    外展角：对手臂中心 x 与 z 做两段直线拟合，断点即肘部，斜率给出上臂
    与手臂相对竖直方向的夹角。
    """
    rows = []
    for r in sections:
        zf = r["z_frac"]
        if not (0.44 <= zf <= 0.86):
            continue
        cand = [g for g in r["gaps"] if g[0] > 0.02 and g[1] > 0.02]
        if not cand:
            continue
        g = max(cand, key=lambda t: t[2])
        if g[2] < 0.030:
            continue
        arm = [s for s in r["right_x_ranges"] if s[0] >= g[1] - 0.002]
        if not arm:
            continue
        arm_lo = min(s[0] for s in arm)
        arm_hi = max(s[1] for s in arm)
        rows.append({
            "z": r["z"], "z_frac": zf,
            "arm_span": [round(arm_lo, 4), round(arm_hi, 4)],
            "arm_center_x": round((arm_lo + arm_hi) / 2, 4),
            "arm_min_x": round(arm_lo, 4),
            "torso_outer_x": round(g[0], 4),
            "clearance_m": round(g[2] / 1000.0, 4),
            "arm_segments": len(arm),
        })

    out = {"per_layer": rows}
    if not rows:
        return out
    out["armpit_z"] = max(r["z"] for r in rows)
    out["armpit_z_frac"] = max(r["z_frac"] for r in rows)
    out["hand_lowest_z_frac"] = min(r["z_frac"] for r in rows)

    # 拟合区域排除最下面的手部（手指散开会让中心跳变）
    fit_rows = [r for r in rows if r["z_frac"] >= 0.50]
    if len(fit_rows) >= 6:
        pts = sorted([(r["z"], r["arm_center_x"]) for r in fit_rows])

        def seg_fit(sub):
            n = len(sub)
            sz = sum(p[0] for p in sub) / n
            sx = sum(p[1] for p in sub) / n
            num = sum((p[0] - sz) * (p[1] - sx) for p in sub)
            den = sum((p[0] - sz) ** 2 for p in sub)
            if den <= 0:
                return None
            slope = num / den
            res = sum((p[1] - (sx + slope * (p[0] - sz))) ** 2 for p in sub)
            return slope, res

        best = None
        for k in range(2, len(pts) - 2):
            upper, lower = pts[k:], pts[:k]
            fu, fl = seg_fit(upper), seg_fit(lower)
            if not fu or not fl:
                continue
            if best is None or fu[1] + fl[1] < best[0]:
                best = (fu[1] + fl[1], k, fu[0], fl[0])
        if best:
            import math
            _, k, su, sl = best
            out["elbow_z"] = round(pts[k][0], 4)
            out["elbow_z_frac"] = round(pts[k][0] / height, 3)
            out["upper_arm_angle_from_vertical_deg"] = round(
                math.degrees(math.atan(abs(su))), 1)
            out["forearm_angle_from_vertical_deg"] = round(
                math.degrees(math.atan(abs(sl))), 1)
            out["fit_residual"] = round(best[0], 6)

        # 整体一条直线的等效外展角，作为分段结果的对账
        s_all = seg_fit(pts)
        if s_all:
            out["whole_arm_angle_from_vertical_deg"] = round(
                math.degrees(math.atan(abs(s_all[0]))), 1)

    cl = [r["clearance_m"] for r in rows if 0.50 <= r["z_frac"] <= 0.78]
    if cl:
        out["clearance_below_armpit_m"] = {
            "min": round(min(cl), 4), "min_mm": round(min(cl) * 1000, 1),
            "max_mm": round(max(cl) * 1000, 1), "n_layers": len(cl)}
    cl2 = [r["clearance_m"] for r in rows if 0.50 <= r["z_frac"] <= 0.60]
    if cl2:
        out["clearance_at_skirt_m"] = {
            "min_mm": round(min(cl2) * 1000, 1),
            "max_mm": round(max(cl2) * 1000, 1), "n_layers": len(cl2)}
    return out


def main():
    out = {"source": json.loads((REPORTS / "00_glb_probe.json").read_text())}

    info = S.load_normalized()
    ob, me = info["object"], info["mesh"]
    lo, hi = info["bbox_min"], info["bbox_max"]
    height = info["height"]

    out["imported_object"] = {
        "name": ob.name, "verts": len(me.vertices), "polys": len(me.polygons),
        "tris": sum(len(p.vertices) - 2 for p in me.polygons),
        "materials": [m.name for m in me.materials if m is not None],
    }
    out["orientation"] = {
        "flipped_180": info["flipped_180"],
        "flip_evidence": info["flip_evidence"],
        "bbox_min": [round(v, 5) for v in lo],
        "bbox_max": [round(v, 5) for v in hi],
        "height_m_raw": round(info["raw_height"], 5),
    }

    span = height
    foot = [v.co for v in me.vertices if v.co.z <= lo.z + span * 0.03]
    ankle = [v.co for v in me.vertices
             if lo.z + span * 0.07 <= v.co.z <= lo.z + span * 0.11]
    fy = sum(p.y for p in foot) / max(len(foot), 1)
    ay = sum(p.y for p in ankle) / max(len(ankle), 1)
    out["facing"] = {
        "foot_mean_y": round(fy, 4), "ankle_mean_y": round(ay, 4),
        "toe_forward_axis": "-Y" if fy < ay else "+Y",
        "note": "脚趾方向即角色正面（Blender 坐标）",
    }

    out["topology_raw"] = S.topology_stats(me)
    out["topology_welded"] = S.topology_stats(me, weld=WELD_DIST)
    out["topology_welded"]["weld_dist"] = WELD_DIST
    out["symmetry"] = S.mirror_distance_stats(me)

    # ---- 截面扫描 ----
    sections = []
    for k in range(N_SLICE):
        z = lo.z + span * (k + 0.5) / N_SLICE
        segs, gaps = section_segments(me, z)
        right = [s for s in segs if s[1] > 0.001]
        sections.append({
            "z": round(z, 4), "z_frac": round((k + 0.5) / N_SLICE, 3),
            "right_segments": len(right),
            "right_x_ranges": [[round(s[0], 4), round(s[1], 4)] for s in right],
            "gaps": [[round(g[0], 4), round(g[1], 4), round(g[2] * 1000, 1)]
                     for g in gaps],
        })
    out["sections"] = sections

    print("\n=== 截面扫描（右半侧 x>0）===")
    print(f"{'z_frac':>7} {'z_m':>7} {'段数':>4}  段 x 区间 | 该层截面空隙(mm)")
    for r in sections:
        rr = "  ".join(f"[{a:.3f},{b:.3f}]" for a, b in r["right_x_ranges"]) or "—"
        gg = "  ".join(f"{a:.3f}~{b:.3f}({w:.0f})" for a, b, w in r["gaps"])
        print(f"{r['z_frac']:>7.3f} {r['z']:>7.4f} {r['right_segments']:>4}  "
              f"{rr}   {gg}")

    # ---- 手臂姿态 ----
    ap = arm_pose(sections, span)
    out["arm_pose"] = ap
    print("\n=== 手臂轴（按截面空隙识别）===")
    print(f"{'z_frac':>7} {'手臂中心x':>9} {'手臂内缘':>8} {'躯干外缘':>8} "
          f"{'空隙mm':>7} {'臂段数':>5}")
    for r in ap["per_layer"]:
        print(f"{r['z_frac']:>7.3f} {r['arm_center_x']:>9.4f} "
              f"{r['arm_min_x']:>8.3f} {r['torso_outer_x']:>8.3f} "
              f"{r['clearance_m']*1000:>7.0f} {r['arm_segments']:>5}")
    for k in ("armpit_z_frac", "elbow_z_frac", "hand_lowest_z_frac",
              "upper_arm_angle_from_vertical_deg",
              "forearm_angle_from_vertical_deg",
              "whole_arm_angle_from_vertical_deg"):
        if k in ap:
            print(f"  {k}: {ap[k]}")
    for k in ("clearance_below_armpit_m", "clearance_at_skirt_m"):
        if k in ap:
            print(f"  {k}: min {ap[k]['min_mm']} mm / max {ap[k]['max_mm']} mm "
                  f"({ap[k]['n_layers']} 层)")

    # ---- 腿 ----
    # 上限必须落在裙摆以下：裙摆下沿约在 0.50H，越过它"腿宽"会突然从 0.09
    # 跳到 0.27（那是裙子），腿轴线会被裙子带偏。
    hip_z = lo.z + span * 0.47
    ankle_z = lo.z + span * 0.10
    leg_rows = []
    for k in range(16):
        z = ankle_z + (hip_z - ankle_z) * k / 15
        band = span * 0.012
        sl = [v.co for v in me.vertices if abs(v.co.z - z) < band]
        left = [p for p in sl if p.x > 0.005]
        right = [p for p in sl if p.x < -0.005]
        if len(left) < 5 or len(right) < 5:
            continue
        leg_rows.append({
            "z_m": round(z, 4),
            "right_cx": round(sum(p.x for p in left) / len(left), 4),
            "left_cx": round(sum(p.x for p in right) / len(right), 4),
            "width": round(max(p.x for p in left) - min(p.x for p in left), 4),
            "right_cy": round(sum(p.y for p in left) / len(left), 4),
        })
    if leg_rows:
        cxs = [r["right_cx"] for r in leg_rows]
        drift = max(cxs) - min(cxs)
        out["legs"] = {
            "rows": leg_rows, "center_x_drift_m": round(drift, 4),
            "verdict": "基本垂直（漂移 < 2% 身高）" if drift < span * 0.02
            else "有明显内外调整",
        }
        print("\n=== 腿轴线（右腿中心 x 随高度）===")
        for r in leg_rows:
            print(f"  z={r['z_m']:.4f}  右腿中心x={r['right_cx']:.4f}  "
                  f"左腿中心x={r['left_cx']:.4f}  宽={r['width']:.4f}  "
                  f"中心y={r['right_cy']:.4f}")
        print(f"  腿中心 x 漂移 {drift*1000:.1f} mm → {out['legs']['verdict']}")

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "01_source_audit.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n[写出] {REPORTS / '01_source_audit.json'}")
    print(f"身高 {span:.4f} m  bbox {[round(v,4) for v in (hi-lo)]}")
    return out


if __name__ == "__main__":
    main()
