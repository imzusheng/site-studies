"""把姿态误差分解成 twist（绕骨自身轴）与 swing（垂直分量），并对撕裂边做归因。

结论要回答两件事：
  A. 误差是"方向错"还是"滚转错"——aim_matrix 只保证 Y 轴方向，roll 由 pole 决定
  B. 被撕开的边到底桥接了哪些骨骼——即"这些三角为什么被拉到那里"

用法：blender -b ruth_forehand_v1.blend -P xf_06_twist_attribution.py
"""
import json
from collections import Counter
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

TMP = Path("/tmp")
REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")

scene = bpy.context.scene
ob = bpy.data.objects["Ruth"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data

MARKS = {"ready": 0, "backswing": 147, "contact": 164,
         "follow_through": 187, "recovery": 232}

REGION = [
    ("skirt", ("Skirt",)),
    ("ponytail", ("Ponytail",)),
    ("head", ("Head", "Neck", "Visor")),
    ("torso", ("Spine", "Chest", "Hips", "Shoulder")),
    ("arm", ("Arm", "ForeArm", "Hand", "Thumb", "Index", "Middle", "Ring", "Pinky")),
    ("leg", ("UpLeg", "Leg", "Foot", "Toe")),
]


def region_of(name):
    if name is None:
        return "none"
    for r, pres in REGION:
        if any(p in name for p in pres):
            return r
    return "other"


# ------------------------------------------------------- A. twist / swing 分解
print("=" * 78)
print("A. 姿态误差分解：twist(绕骨自身轴) vs swing(垂直分量)")
print("   aim_matrix 只约束 Y 轴方向；roll 由 pole 决定。")
print("=" * 78)
scene.frame_set(0)
bpy.context.view_layer.update()

twist_rows = []
for pb in rig.pose.bones:
    q = pb.matrix_basis.to_quaternion()
    if q.w < 0:
        q = -q
    # 四元数 (w, x, y, z)，local Y = 骨自身轴 → twist = 2*atan2(qy, qw)
    twist = 2.0 * np.arctan2(q.y, q.w) if abs(q.w) + abs(q.y) > 1e-9 else 0.0
    swing = 2.0 * np.arctan2(np.hypot(q.x, q.z), np.hypot(q.w, q.y))
    twist_rows.append({
        "bone": pb.name,
        "twist_deg": round(float(np.degrees(twist)), 2),
        "swing_deg": round(float(np.degrees(swing)), 2),
        "total_deg": round(float(np.degrees(q.angle)), 2),
        "region": region_of(pb.name),
    })
twist_rows.sort(key=lambda r: -abs(r["twist_deg"]))
print(f"{'bone':16s} {'twist°':>9s} {'swing°':>9s} {'total°':>9s}  region")
for r in twist_rows[:20]:
    flag = "  <== 滚转异常" if abs(r["twist_deg"]) > 60 else ""
    print(f"{r['bone']:16s} {r['twist_deg']:9.2f} {r['swing_deg']:9.2f} "
          f"{r['total_deg']:9.2f}  {r['region']}{flag}")

n_twist_bad = [r for r in twist_rows if abs(r["twist_deg"]) > 60]
print(f"\n  twist 绝对值 > 60° 的骨骼共 {len(n_twist_bad)} 根:")
for r in n_twist_bad:
    print(f"    {r['bone']:16s} twist={r['twist_deg']:8.2f}°  "
          f"swing={r['swing_deg']:6.2f}°  区域={r['region']}")

# ----------------------------------------------- B. 撕裂边归因（逐帧）
edges = np.array([[e.vertices[0], e.vertices[1]] for e in me.edges], dtype=np.int64)
P_rest = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
rest_len = np.linalg.norm(P_rest[edges[:, 0]] - P_rest[edges[:, 1]], axis=1)
vg_names = [g.name for g in ob.vertex_groups]
top_bone = []
for v in me.vertices:
    top_bone.append(vg_names[max(v.groups, key=lambda x: x.weight).group]
                    if v.groups else None)
top_bone = np.array(top_bone, dtype=object)

print("\n" + "=" * 78)
print("B. 撕裂边归因：被撕开的边桥接了哪两种骨骼（阈值 边长 > 2×rest）")
print("=" * 78)
frames_report = {}
for mark, fr in MARKS.items():
    scene.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get()
    oe = ob.evaluated_get(dg)
    mev = oe.to_mesh()
    pts = np.array([v.co[:] for v in mev.vertices], dtype=np.float64)
    oe.to_mesh_clear()
    dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
    ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
    bad = ratio > 2.0

    pairs = Counter()
    regions = Counter()
    for ei in np.nonzero(bad)[0]:
        a, b = int(edges[ei, 0]), int(edges[ei, 1])
        ba, bb = top_bone[a], top_bone[b]
        key = tuple(sorted([ba, bb], key=lambda s: (s is None, s)))
        pairs[key] += 1
        ra, rb = region_of(ba), region_of(bb)
        regions[tuple(sorted([ra, rb]))] += 1

    frames_report[mark] = {
        "frame": fr, "edges_gt_2x": int(bad.sum()),
        "pct_gt_2x": round(100.0 * bad.sum() / len(edges), 4),
        "max_ratio": round(float(ratio.max()), 2),
        "top_bone_pairs": [
            {"pair": f"{p[0]} | {p[1]}", "count": c}
            for p, c in pairs.most_common(12)],
        "top_region_pairs": [
            {"pair": f"{p[0]} | {p[1]}", "count": c}
            for p, c in regions.most_common(12)],
    }
    print(f"\n[{mark}] frame={fr}  >2x={bad.sum()} ({100.0*bad.sum()/len(edges):.2f}%)  "
          f"max={ratio.max():.1f}×")
    print("   骨骼对 top8:")
    for p, c in pairs.most_common(8):
        print(f"     {c:5d}  {p[0]} | {p[1]}")
    print("   区域对 top6:")
    for p, c in regions.most_common(6):
        print(f"     {c:5d}  {p[0]} | {p[1]}")

out = {"twist_swing_frame0": twist_rows,
       "twist_over_60deg": n_twist_bad,
       "frames": frames_report}
(TMP / "xf_twist_attribution.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2))
print(f"\n[写出] {TMP/'xf_twist_attribution.json'}")
