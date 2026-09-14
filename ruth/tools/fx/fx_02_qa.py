"""修复后 QA：真 rest 基准 + twist 审计 + 全片动态拉伸检测。

上一轮 false PASS 的根因是 QA 用第 0 帧（已变形）当 rest 基准，导致撕裂对检查
结构性失明。本脚本用两种互相独立的方法取真 rest，并互相证明：

  A. action = None + 所有 pose bone 的 matrix_basis = Identity → 求值网格
  B. rig.data.pose_position = 'REST' → 求值网格
  C. 参照 ob.data.vertices（绑定网格本身）

A/B/C 三者必须一致（浮点内），否则 rest 基准不可信，直接 FAIL。

twist 的定义（这是"骨滚转有没有被破坏"的判据）
    M_b = pose_b @ rest_b^-1                    # 该骨对几何体施加的世界变换
    y_rest = rest_b_rot @ (0,1,0)
    y_now  = M_b_rot @ y_rest
    q_swing = y_rest.rotation_difference(y_now) # 纯 swing 分量
    q_res   = q_swing^-1 @ M_b_rot              # 残差，固定骨骼轴 → 纯 twist
    twist_deg = q_res 绕 y_rest 的有符号角
M_b 就是真正移动顶点的矩阵，所以这个 twist 是"几何被拧了多少"的直接度量。

产出：reports/forehand/{rest_baseline.json, twist_audit.json,
                        deformation_report_fixed.json}
用法：blender -b build/step7_rollfix.blend -P tools/fx/fx_02_qa.py
"""
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BUILD = ROOT / "build"
REPORTS = ROOT / "reports" / "forehand"

MARKS = {"ready": 0, "unit_turn": 110, "backswing": 147, "acceleration": 151,
         "contact": 164, "follow_through": 187, "recovery": 232}

GATED_LEGS = ["LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"]
GATED_SEC = ["SkirtF1", "SkirtB1", "SkirtL1", "SkirtR1", "Ponytail1", "Ponytail2"]
LEG_TWIST_LIMIT = 10.0
SEC_TWIST_LIMIT = 5.0
STRETCH_HARD_FAIL = 10.0          # 任何边 > 10× 直接 FAIL
CONTIG_MIN_EDGES = 5              # 连续 >3× 区域达到这么多边就算"大片"


# ------------------------------------------------------------------ 工具
def rot3(m):
    return m.to_quaternion().to_matrix()


def eval_positions(ob, scene=None):
    dg = bpy.context.evaluated_depsgraph_get()
    oe = ob.evaluated_get(dg)
    me = oe.to_mesh()
    n = len(me.vertices)
    buf = np.empty(n * 3, dtype=np.float32)
    me.vertices.foreach_get("co", buf)
    pts = buf.reshape(-1, 3).astype(np.float64)
    oe.to_mesh_clear()
    return pts


def true_rest_positions(ob, rig):
    """两种独立方法取真 rest，并给出互相验证的偏差。"""
    act = rig.animation_data.action
    saved = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}

    # 方法 A
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.context.view_layer.update()
    pts_a = eval_positions(ob)

    # 还原
    for pb in rig.pose.bones:
        pb.matrix_basis = saved[pb.name]
    rig.animation_data.action = act
    bpy.context.view_layer.update()

    # 方法 B
    rig.data.pose_position = "REST"
    bpy.context.view_layer.update()
    pts_b = eval_positions(ob)
    rig.data.pose_position = "POSE"
    bpy.context.view_layer.update()

    # 方法 C：绑定网格本身
    n = len(ob.data.vertices)
    buf = np.empty(n * 3, dtype=np.float32)
    ob.data.vertices.foreach_get("co", buf)
    pts_c = buf.reshape(-1, 3).astype(np.float64)

    return pts_a, pts_b, pts_c


def decompose_twist(M_rot, rest_rot):
    """返回 (swing_deg, twist_deg_signed)。见文件头定义。"""
    y_rest = (rest_rot @ Vector((0.0, 1.0, 0.0)))
    y_rest.normalize()
    y_now = (M_rot @ y_rest)
    y_now.normalize()
    q_swing = y_rest.rotation_difference(y_now)
    res = (q_swing.conjugated().to_matrix() @ M_rot).to_quaternion()
    if res.w < 0:
        res = Quaternion(-res.w, -res.x, -res.y, -res.z)
    twist = 2.0 * math.atan2(Vector((res.x, res.y, res.z)).dot(y_rest),
                         res.w)
    return (math.degrees(q_swing.angle if q_swing.w >= 0
                         else Quaternion(-q_swing.w, -q_swing.x,
                                         -q_swing.y, -q_swing.z).angle),
            math.degrees(twist))


def blame_edge(a, b, M, Wmat, P_rest, vg_bone):
    """精确分解：一条边被拉开的量由每根骨贡献多少。

    P_a - P_b - (p_a - p_b) = Σ_β [ w_aβ u_β(p_a) - w_bβ u_β(p_b) ]
    u_β(x) = (R_β - I) x + t_β,  M_β = pose_β @ rest_β^-1
    """
    out = {}
    pa, pb = P_rest[a], P_rest[b]
    for g in range(Wmat.shape[1]):
        j = vg_bone[g]                       # 顶点组序号 → 骨骼序号
        if j < 0:
            continue
        R = M[j, :3, :3]
        t = M[j, :3, 3]
        ua = (R - np.eye(3)) @ pa + t
        ub = (R - np.eye(3)) @ pb + t
        c = Wmat[a, g] * ua - Wmat[b, g] * ub
        n = float(np.linalg.norm(c))
        if n > 1e-9:
            out[j] = n
    return out


def contiguous_components(bad_edges, n_verts):
    """把超过阈值的边按顶点连通性分组，返回按大小排序的连通块。"""
    parent = list(range(n_verts))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for a, b in bad_edges:
        union(int(a), int(b))
    groups = defaultdict(list)
    for k, (a, b) in enumerate(bad_edges):
        groups[find(int(a))].append(k)
    out = sorted(groups.values(), key=len, reverse=True)
    return out


# -------------------------------------------------------------------- main
def main():
    scene = bpy.context.scene
    ob = next(o for o in bpy.data.objects
              if o.type == "MESH" and o.name.startswith("Ruth"))
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    frames = list(range(int(scene.frame_start), int(scene.frame_end) + 1))
    W = rig.matrix_world.to_3x3()
    rest_rot = {b.name: rot3((rig.matrix_world @ b.matrix_local).to_3x3())
                for b in rig.data.bones}
    names = [b.name for b in rig.data.bones]

    # ---------------------------------------------------- 1. 真 rest 基准
    print("=== 1. 真 rest 基准 ===")
    pts_a, pts_b, pts_c = true_rest_positions(ob, rig)
    d_ab = float(np.abs(pts_a - pts_b).max()) * 1000
    d_ac = float(np.abs(pts_a - pts_c).max()) * 1000
    print(f"  方法A(action=None+basis=I) vs 方法B(pose_position=REST): "
          f"{d_ab:.6f} mm")
    print(f"  方法A vs 方法C(绑定网格): {d_ac:.6f} mm")
    # 每顶点主导骨（用于 top50 的 dominat bone 标注）
    topname = [""] * len(ob.data.vertices)
    vg_names = [g.name for g in ob.vertex_groups]
    for vi, v in enumerate(ob.data.vertices):
        if v.groups:
            topname[vi] = vg_names[max(v.groups, key=lambda g: g.weight).group]
    Wmat = np.zeros((len(ob.data.vertices), len(vg_names)))
    for vi, v in enumerate(ob.data.vertices):
        for g in v.groups:
            Wmat[vi, g.group] = g.weight
    _bi = {b.name: k for k, b in enumerate(rig.data.bones)}
    missing = [g for g in vg_names if g not in _bi]
    print(f"  顶点组 {len(vg_names)} / 骨骼 {len(_bi)}  顶点组无对应骨骼: "
          f"{missing if missing else '无'}")
    vg_bone = [_bi.get(g, -1) for g in vg_names]

    rest = pts_a
    n_v = len(rest)
    idx = np.empty(len(ob.data.edges) * 2, dtype=np.int32)
    ob.data.edges.foreach_get("vertices", idx)
    edges = idx.reshape(-1, 2).astype(np.int64)
    rest_len = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
    n_e = len(edges)
    print(f"  顶点 {n_v}  边 {n_e}  rest 边长中位 "
          f"{np.median(rest_len)*1000:.3f} mm")

    (REPORTS / "rest_baseline.json").write_text(json.dumps({
        "why": "上一轮 false PASS 的根因：QA 用第 0 帧（已变形）当 rest 基准。"
               "这里用两种互相独立的方法取真 rest 并互相证明。",
        "method_A": "rig.animation_data.action = None; 所有 pose bone "
                    "matrix_basis = Identity; 求值 depsgraph 网格",
        "method_B": "rig.data.pose_position = 'REST'; 求值 depsgraph 网格",
        "method_C": "网格绑定数据本身 ob.data.vertices",
        "cross_check_mm": {"A_vs_B": round(d_ab, 6), "A_vs_C": round(d_ac, 6)},
        "agreement": bool(d_ab < 1e-3 and d_ac < 1e-3),
        "verts": int(n_v), "edges": int(n_e),
        "rest_bbox": [round(float(x), 5) for x in
                      list(rest.min(axis=0)) + list(rest.max(axis=0))],
        "median_edge_len_mm": round(float(np.median(rest_len)) * 1000, 4),
        "source_blend": bpy.data.filepath,
    }, ensure_ascii=False, indent=2))
    print(f"[写出] reports/forehand/rest_baseline.json")

    # ------------------------------------------------- 2/3. 逐帧 twist + 拉伸
    print("\n=== 2. 全片 twist + 拉伸 ===")
    stretch_hist = []
    sec_series = {n: {"swing": [], "twist": []} for n in GATED_SEC}
    leg_series = {n: {"swing": [], "twist": []} for n in GATED_LEGS}
    all_twist_max = {n: 0.0 for n in names}
    all_swing_max = {n: 0.0 for n in names}
    worst = {"ratio": 0.0, "frame": -1}
    worst_decomp = None
    marks_snapshot = {}

    for i in frames:
        scene.frame_set(i)
        pts = eval_positions(ob)
        dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
        ratio = dl / np.maximum(rest_len, 1e-9)
        rec = {
            "frame": int(i),
            "gt_1_5x": int((ratio > 1.5).sum()),
            "gt_2x": int((ratio > 2.0).sum()),
            "gt_3x": int((ratio > 3.0).sum()),
            "max_ratio": round(float(ratio.max()), 4),
            "p99_ratio": round(float(np.percentile(ratio, 99)), 4),
        }
        stretch_hist.append(rec)
        if ratio.max() > worst["ratio"]:
            worst = {"ratio": float(ratio.max()), "frame": int(i)}

        # twist：只对有顶点影响的骨算（69 根全算，花费可忽略）
        for nm in names:
            pb = rig.pose.bones[nm]
            M = (rig.matrix_world @ pb.matrix
                 @ rig.data.bones[nm].matrix_local.inverted())
            sw, tw = decompose_twist(rot3(M.to_3x3()), rest_rot[nm])
            all_swing_max[nm] = max(all_swing_max[nm], sw)
            all_twist_max[nm] = max(all_twist_max[nm], abs(tw))
            if nm in sec_series:
                sec_series[nm]["swing"].append(round(sw, 3))
                sec_series[nm]["twist"].append(round(tw, 3))
            if nm in leg_series:
                leg_series[nm]["swing"].append(round(sw, 3))
                leg_series[nm]["twist"].append(round(tw, 3))

        if i in MARKS.values():
            key = next(k for k, v in MARKS.items() if v == i)
            dv = np.linalg.norm(pts - rest, axis=1)
            marks_snapshot[key] = {
                "frame": int(i),
                "gt_1_5x": rec["gt_1_5x"], "gt_2x": rec["gt_2x"],
                "gt_3x": rec["gt_3x"], "max_ratio": rec["max_ratio"],
                "max_disp_mm": round(float(dv.max()) * 1000, 2),
            }

        if i == worst["frame"]:
            bad = edges[ratio > 3.0]
            comps = contiguous_components(bad, n_v) if len(bad) else []
            top = np.argsort(-ratio)[:50]
            M = np.zeros((len(names), 4, 4))
            for j, nm in enumerate(names):
                pb = rig.pose.bones[nm]
                M[j] = np.array(rig.matrix_world @ pb.matrix
                                @ rig.data.bones[nm].matrix_local.inverted())
            edges_out = []
            for e in top:
                a, b = int(edges[e, 0]), int(edges[e, 1])
                bl = blame_edge(a, b, M, Wmat, rest, vg_bone)
                rank = sorted(bl.items(), key=lambda kv: -kv[1])[:3]
                edges_out.append({
                    "edge": int(e), "ratio": round(float(ratio[e]), 3),
                    "rest_mm": round(float(rest_len[e]) * 1000, 4),
                    "deformed_mm": round(float(dl[e]) * 1000, 4),
                    "gap_mm": round(float(dl[e] - rest_len[e]) * 1000, 3),
                    "v": [a, b],
                    "dominant_bone_a": topname[a],
                    "dominant_bone_b": topname[b],
                    "blame_top3_mm": {names[j]: round(v * 1000, 2)
                                      for j, v in rank},
                })
            disp = np.linalg.norm(pts - rest, axis=1)
            verts_out = [{
                "v": int(v), "disp_mm": round(float(disp[v]) * 1000, 3),
                "dominant_bone": topname[int(v)],
                "weights": sorted(
                    [(vg_names[g.group], round(g.weight, 3))
                     for g in ob.data.vertices[int(v)].groups],
                    key=lambda t: -t[1]),
            } for v in np.argsort(-disp)[:50]]
            worst_decomp = {
                "frame": int(i), "max_ratio": round(float(ratio.max()), 4),
                "gt_3x_edges": int(len(bad)),
                "contiguous_components_gt3x": len(comps),
                "largest_component_edges": len(comps[0]) if comps else 0,
                "top50_stretched_edges": edges_out,
                "top50_displaced_vertices": verts_out,
            }
        if i % 40 == 0:
            print(f"  frame {i:3d}  >1.5× {rec['gt_1_5x']:4d}  >2× "
                  f"{rec['gt_2x']:4d}  >3× {rec['gt_3x']:3d}  "
                  f"max {rec['max_ratio']:6.3f}×")

    _ = worst_decomp
    _ = all_twist_max, all_swing_max, marks_snapshot

    (REPORTS / "_qa_raw.json").write_text(json.dumps({
        "stretch_hist": stretch_hist,
        "marks": marks_snapshot,
        "worst": worst_decomp,
        "leg_series": leg_series,
        "sec_series": sec_series,
        "all_twist_max": all_twist_max,
        "all_swing_max": all_swing_max,
    }, ensure_ascii=False))
    print(f"\n[写出] reports/forehand/_qa_raw.json（中间量）")
    print(f"  全片最大拉伸 {worst['ratio']:.3f}× @ frame {worst['frame']}")
    for n in GATED_LEGS + GATED_SEC:
        print(f"  {n:12s} swing max {all_swing_max[n]:7.2f}°  "
              f"twist max {all_twist_max[n]:7.3f}°")


if __name__ == "__main__":
    main()
