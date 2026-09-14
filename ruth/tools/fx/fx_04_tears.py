"""撕裂地图：对指定 blend 的 7 个时间标记，把绝对拉开过大的边按位置聚类。

绝对拉开量（deformed − rest，单位米）比"比值"更能反映可见程度：一条 0.8 mm 的
退化边拉到 60 mm 比值是 75×，但真正决定"看不看得见"的是那 59 mm。

用法（对同一个 blend 跑两次即可做前后对比）：
  FX_TAG=fix  blender -b build/step7_rollfix.blend    -P tools/fx/fx_04_tears.py
  FX_TAG=old  blender -b build/ruth_forehand_v1.blend -P tools/fx/fx_04_tears.py
"""
import json
import os
from collections import Counter
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
REPORTS = ROOT / "reports" / "forehand"

TAG = os.environ.get("FX_TAG", "fix")
MARKS = [("ready", 0), ("unit_turn", 110), ("backswing", 147),
         ("acceleration", 151), ("contact", 164), ("follow_through", 187),
         ("recovery", 232)]
GAP_WARN = 0.015      # 15 mm 起算"可见"
GAP_BAD = 0.030       # 30 mm
CLUSTER_XY = 0.05

scene = bpy.context.scene
ob = next(o for o in bpy.data.objects
          if o.type == "MESH" and o.name.startswith("Ruth"))
me = ob.data
vg = [g.name for g in ob.vertex_groups]
rest = np.array([v.co[:] for v in me.vertices])
idx = np.empty(len(me.edges) * 2, dtype=np.int32)
me.edges.foreach_get("vertices", idx)
edges = idx.reshape(-1, 2).astype(np.int64)
rl = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
topname = np.array([
    vg[max(me.vertices[v].groups, key=lambda g: g.weight).group]
    if me.vertices[v].groups else "?" for v in range(len(me.vertices))],
    dtype=object)

out = {"tag": TAG, "blend": bpy.data.filepath, "gap_warn_mm": GAP_WARN * 1000,
       "gap_bad_mm": GAP_BAD * 1000, "marks": {}}
for mark, fr in MARKS:
    scene.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get()
    oe = ob.evaluated_get(dg)
    mev = oe.to_mesh()
    b = np.empty(len(mev.vertices) * 3, dtype=np.float32)
    mev.vertices.foreach_get("co", b)
    pts = b.reshape(-1, 3).astype(np.float64)
    oe.to_mesh_clear()
    dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
    gap = dl - rl
    ratio = dl / np.maximum(rl, 1e-9)
    warn = np.nonzero(gap > GAP_WARN)[0]
    bad = np.nonzero(gap > GAP_BAD)[0]

    clusters = Counter()
    bones_by_cluster = {}
    for ei in warn:
        a, b_ = int(edges[ei, 0]), int(edges[ei, 1])
        key = (round(float((rest[a, 0] + rest[b_, 0]) / 2) / CLUSTER_XY) * CLUSTER_XY,
               round(float((rest[a, 2] + rest[b_, 2]) / 2) / CLUSTER_XY) * CLUSTER_XY)
        clusters[key] += 1
        bones_by_cluster.setdefault(key, Counter())[
            f"{topname[a]} | {topname[b_]}"] += 1
    cl = []
    for key, cnt in clusters.most_common(14):
        sub = [ei for ei in warn
               if (round(float((rest[int(edges[ei, 0]), 0]
                                + rest[int(edges[ei, 1]), 0]) / 2) / CLUSTER_XY)
                   * CLUSTER_XY,
                   round(float((rest[int(edges[ei, 0]), 2]
                                + rest[int(edges[ei, 1]), 2]) / 2) / CLUSTER_XY)
                   * CLUSTER_XY) == key]
        gmax = max(float(gap[ei]) for ei in sub)
        cl.append({
            "x_m": key[0], "z_m": key[1], "edges": cnt,
            "max_gap_mm": round(gmax * 1000, 1),
            "bone_pairs": [{"pair": p, "edges": c}
                           for p, c in bones_by_cluster[key].most_common(4)],
        })
    out["marks"][mark] = {
        "frame": fr,
        "gap_gt_warn": int(len(warn)),
        "gap_gt_bad": int(len(bad)),
        "max_gap_mm": round(float(gap.max()) * 1000, 2),
        "max_ratio": round(float(ratio.max()), 2),
        "edges_gt_2x": int((ratio > 2).sum()),
        "edges_gt_3x": int((ratio > 3).sum()),
        "edges_gt_10x": int((ratio > 10).sum()),
        "clusters": cl,
    }
    print(f"[{mark}] gap>15mm {len(warn):5d}  gap>30mm {len(bad):4d}  "
          f"max_gap {gap.max()*1000:7.1f} mm  max {ratio.max():6.1f}x  "
          f">10x {out['marks'][mark]['edges_gt_10x']}")

REPORTS.mkdir(parents=True, exist_ok=True)
p = REPORTS / f"tear_map_{TAG}.json"
p.write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(f"[写出] {p.relative_to(ROOT)}")
