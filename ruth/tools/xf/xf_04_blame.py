"""Rig / Skin / Weight 归因：到底是哪几根骨骼把网格撕开的。

方法（全部基于实际保存的 blend，不重跑生成脚本）：
  1. 从 blend 取 rest 顶点、权重、每根骨在 armature 空间的 M_b = pb.matrix @ bone.matrix_local^-1
  2. 用 numpy 自己写一遍线性混合蒙皮，与 Blender depsgraph 的结果逐顶点对齐（验证前向管线可信）
  3. 逐骨 blame：
       - 该骨对几何体的位移场 max_i w_ib * ||(M_b - I) p_i||
       - leave-one-out：把 M_b 置为单位阵后，重新量测边长撕裂指标
     两个排名分别说明"谁在动"和"去掉谁能修好"
  4. 对 top 骨骼打印 M_b 的旋转角/轴/平移 + 该骨 rest 朝向，
     判断这次旋转是绕自身轴的 twist 还是垂直轴的 swing

用法：blender -b ruth_forehand_v1.blend -P xf_04_blame.py
"""
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TMP = Path("/tmp")
FRAME = 0

scene = bpy.context.scene
ob = bpy.data.objects["Ruth"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data
scene.frame_set(FRAME)
bpy.context.view_layer.update()

bones = [pb.name for pb in rig.pose.bones]
bidx = {n: i for i, n in enumerate(bones)}
NB = len(bones)

# ------------------------------------------------------------------ 权重矩阵
W = np.zeros((len(me.vertices), NB), dtype=np.float64)
for vi, v in enumerate(me.vertices):
    for g in v.groups:
        W[vi, bidx[ob.vertex_groups[g.group].name]] = g.weight

# ----------------------------------------------------------------- 蒙皮矩阵
M = np.zeros((NB, 4, 4), dtype=np.float64)
rest_orientation = {}
for pb in rig.pose.bones:
    b = pb.bone
    Mb = rig.matrix_world @ pb.matrix @ b.matrix_local.inverted()
    M[bidx[pb.name]] = np.array(Mb)
    m3 = np.array(b.matrix_local.to_3x3())
    rest_orientation[pb.name] = {
        "rest_dir": [round(float(x), 4) for x in m3 @ np.array([0.0, 1.0, 0.0])],
        "length_mm": round(b.length * 1000, 2),
    }

P_rest = np.array([v.co[:] for v in me.vertices], dtype=np.float64)


def skin(mm):
    """线性混合蒙皮：P = Σ_b w_b (R_b p + t_b)。mm: (NB,4,4)"""
    out = np.zeros_like(P_rest)
    for b in range(NB):
        w = W[:, b]
        nz = w > 1e-7
        if not nz.any():
            continue
        R = mm[b, :3, :3]
        t = mm[b, :3, 3]
        out[nz] += w[nz, None] * (P_rest[nz] @ R.T + t)
    return out


def mesh_report(pts, edges, rest_len, vert_bone):
    dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
    ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
    n2 = int((ratio > 2.0).sum())
    order = np.argsort(-ratio)[:10]
    worst = []
    for ei in order:
        a, b = edges[ei]
        worst.append({
            "ratio": round(float(ratio[ei]), 2),
            "rest_mm": round(float(rest_len[ei]) * 1000, 3),
            "def_mm": round(float(dl[ei]) * 1000, 3),
            "a_bones": vert_bone[a], "b_bones": vert_bone[b],
        })
    return {"edges_gt_2x": n2, "pct_gt_2x": round(100.0 * n2 / len(edges), 4),
            "max_ratio": round(float(ratio.max()), 2), "worst": worst}


# ------------------------------------------------------------------ 参考量测
edges = np.array([[e.vertices[0], e.vertices[1]] for e in me.edges], dtype=np.int64)
rest_len = np.linalg.norm(P_rest[edges[:, 0]] - P_rest[edges[:, 1]], axis=1)

vg_names = [g.name for g in ob.vertex_groups]
vert_bone = []
for vi in range(len(me.vertices)):
    gg = me.vertices[vi].groups
    if gg:
        vert_bone.append(vg_names[max(gg, key=lambda x: x.weight).group])
    else:
        vert_bone.append(None)

# Blender 自己的结果
dg = bpy.context.evaluated_depsgraph_get()
ob_eval = ob.evaluated_get(dg)
me_eval = ob_eval.to_mesh()
P_bl = np.array([v.co[:] for v in me_eval.vertices], dtype=np.float64)
ob_eval.to_mesh_clear()

# 我的独立蒙皮
P_mine = skin(M)

print("=" * 76)
print(f"第 {FRAME} 帧")
print(f"网格 {len(P_rest)} 顶点 / {len(edges)} 边   骨骼 {NB}")
print(f"权重和: min={W.sum(1).min():.6f} max={W.sum(1).max():.6f} "
      f"非1的顶点数={int((np.abs(W.sum(1)-1.0) > 1e-4).sum())}")
print(f"每顶点影响数: max={int((W > 1e-7).sum(1).max())}")
print(f"独立 LBS vs Blender depsgraph 最大差 "
      f"{np.abs(P_mine - P_bl).max()*1000:.6f} mm")

rep_bl = mesh_report(P_bl, edges, rest_len, vert_bone)
rep_rest = mesh_report(P_rest, edges, rest_len, vert_bone)
print(f"\nREST 姿态撕裂: >2x={rep_rest['edges_gt_2x']} max={rep_rest['max_ratio']}")
print(f"POSED 撕裂:    >2x={rep_bl['edges_gt_2x']} "
      f"({rep_bl['pct_gt_2x']}%)  max={rep_bl['max_ratio']}")

# ------------------------------------------------------------- 骨骼位移场
disp = np.zeros(NB)
for b in range(NB):
    R = M[b, :3, :3]
    t = M[b, :3, 3]
    moved = np.linalg.norm(P_rest @ R.T + t - P_rest, axis=1)
    disp[b] = (W[:, b] * moved).max()

order_disp = np.argsort(-disp)[:14]
print("\n=== 骨骼位移场排名（该骨把多少毫米的位移施加到它影响最大的顶点上）===")
for b in order_disp:
    n = bones[b]
    R = M[b, :3, :3]
    q = np.array(_q_from_R(R)) if False else None
    print(f"  {n:16s} max_w*disp={disp[b]*1000:9.2f} mm  "
          f"weighted_verts={int((W[:,b]>1e-7).sum()):6d}  "
          f"tot_w={W[:,b].sum():8.3f}")

# ------------------------------------------------------- leave-one-out blame
print("\n=== leave-one-out：把该骨的 M 置为单位阵后，撕裂指标还剩多少 ===")
base_n2 = rep_bl["edges_gt_2x"]
loo = []
for b in order_disp[:14]:
    mm = M.copy()
    mm[b] = np.eye(4)
    pts = skin(mm)
    dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
    ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
    n2 = int((ratio > 2.0).sum())
    loo.append({"bone": bones[b], "edges_gt_2x": n2,
                "removed_pct": round(100.0 * (base_n2 - n2) / base_n2, 2),
                "max_ratio": round(float(ratio.max()), 2)})
    print(f"  remove {bones[b]:16s} → >2x {n2:5d} "
          f"(减少 {100.0*(base_n2-n2)/base_n2:5.1f}%)  max={ratio.max():8.2f}")

# 同时置零所有次级骨（Skirt*/Ponytail*）
mm = M.copy()
for b, n in enumerate(bones):
    if n.startswith(("Skirt", "Ponytail")):
        mm[b] = np.eye(4)
pts = skin(mm)
dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
print(f"\n  同时去掉全部 Skirt*/Ponytail* → >2x {int((ratio>2.0).sum())}  "
      f"max={ratio.max():.2f}")

# 只保留次级骨（其余置零）
mm2 = np.eye(4)[None].repeat(NB, 0)
for b, n in enumerate(bones):
    if n.startswith(("Skirt", "Ponytail")):
        mm2[b] = M[b]
pts = skin(mm2)
dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
print(f"  只有 Skirt*/Ponytail* 有姿态（其余回 rest） → >2x {int((ratio>2.0).sum())}  "
      f"max={ratio.max():.2f}")

# 只扣腿骨
mm3 = M.copy()
for b, n in enumerate(bones):
    if n.startswith(("RightUpLeg", "RightLeg", "LeftUpLeg", "LeftLeg")):
        mm3[b] = np.eye(4)
pts = skin(mm3)
dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
print(f"  同时去掉 4 根腿骨 → >2x {int((ratio>2.0).sum())}  max={ratio.max():.2f}")

# ---------------------------------------------------- top 骨的旋转性质判定
print("\n=== top 骨：这次旋转是 twist（绕自身轴）还是 swing（垂直）===")
detail = {}
for b in order_disp[:10]:
    n = bones[b]
    R = M[b, :3, :3]
    t = M[b, :3, 3]
    # 旋转轴（armature 空间）
    w, v = np.linalg.eig(R)
    ang = float(np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))))
    axis = None
    if 1e-4 < ang < 179.99:
        ax = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]])
        nl = np.linalg.norm(ax)
        axis = (ax / nl) if nl > 1e-9 else None
    rest_dir = np.array(rest_orientation[n]["rest_dir"])
    twist_deg = None
    if axis is not None:
        twist_deg = float(np.degrees(np.arccos(
            np.clip(abs(np.dot(axis, rest_dir)), -1, 1))))
    detail[n] = {
        "rot_angle_deg": round(ang, 3),
        "rot_axis": [round(float(x), 4) for x in axis] if axis is not None else None,
        "translation_mm": round(float(np.linalg.norm(t)) * 1000, 3),
        "rest_dir": [round(float(x), 4) for x in rest_dir],
        "angle_between_axis_and_bone_dir_deg": round(twist_deg, 2)
        if twist_deg is not None else None,
        "max_w_disp_mm": round(float(disp[b]) * 1000, 2),
        "bone_length_mm": rest_orientation[n]["length_mm"],
    }
    print(f"  {n:16s} rot={ang:7.2f}°  axis={detail[n]['rot_axis']}  "
          f"|t|={detail[n]['translation_mm']:7.2f}mm  "
          f"rest_dir={detail[n]['rest_dir']}  "
          f"轴与骨向夹角={detail[n]['angle_between_axis_and_bone_dir_deg']}°")
    print(f"       → 该骨造成的最大位移 {detail[n]['max_w_disp_mm']} mm，"
          f"骨长 {detail[n]['bone_length_mm']} mm")

out = {
    "frame": FRAME,
    "mesh": {"verts": int(len(P_rest)), "edges": int(len(edges)), "bones": NB},
    "weight_sum_min": float(W.sum(1).min()),
    "weight_sum_max": float(W.sum(1).max()),
    "verts_weight_sum_not_1": int((np.abs(W.sum(1) - 1.0) > 1e-4).sum()),
    "max_influences": int((W > 1e-7).sum(1).max()),
    "independent_lbs_vs_blender_max_diff_mm": float(
        np.abs(P_mine - P_bl).max() * 1000),
    "rest_tear": {k: rep_rest[k] for k in ("edges_gt_2x", "max_ratio")},
    "posed_tear": {"edges_gt_2x": rep_bl["edges_gt_2x"],
                   "pct_gt_2x": rep_bl["pct_gt_2x"],
                   "max_ratio": rep_bl["max_ratio"]},
    "bone_displacement_field_mm": {
        bones[b]: round(float(disp[b]) * 1000, 3) for b in np.argsort(-disp)[:25]},
    "leave_one_out": loo,
    "top_bone_rotations": detail,
    "worst_edges_posed": rep_bl["worst"],
}
(TMP / "xf_blame.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(f"\n[写出] {TMP/'xf_blame.json'}")
