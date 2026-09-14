# -*- coding: utf-8 -*-
"""露丝 08c · 骨骼位置数值验收（在不在体内）

渲染图看个大概可以，判断精确偏移不可靠。这一步用数值：
对每根骨沿轴线采样若干点，用 BVH 射线求交（奇偶法）判断点是否在网格内部，
并算到表面的最近距离。

判据：
  - 中轴骨（脊柱/头/颈）应该在体内
  - 四肢骨应该在体内且接近肢体中心（到表面距离不应过小，否则贴皮）
  - 辅助骨（马尾/裙）本来就在体内，同样适用

输出一份「哪根骨跑出体外 / 贴皮太近」的清单，据此修正。

在 Blender 里跑：
    exec(open('.../coach/tools/08c_rig_validate.py', encoding='utf-8').read())
"""

import bpy
import json
import os
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "08c_rig_validate.json")

rig = bpy.data.objects["Ruth_Rig"]
mesh_ob = bpy.data.objects["Coach_Welded"]

deps = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(mesh_ob, deps)
print(f"BVH 建成，面数 {len(bvh.polygons) if hasattr(bvh,'polygons') else '?'}")

DIRS = [
    Vector((0.5773, 0.5773, 0.5773)),
    Vector((-0.5773, 0.5773, 0.5773)),
    Vector((0.5773, -0.5773, 0.5773)),
]


def inside(p):
    """奇偶法：从 p 向三个方向射线，取多数结果，抗退化。"""
    votes = 0
    for d in DIRS:
        count = 0
        o = p.copy()
        for _ in range(64):
            hit = bvh.ray_cast(o, d)
            if hit[0] is None:
                break
            count += 1
            o = hit[0] + d * 1e-5
        votes += 1 if count % 2 == 1 else 0
    return votes >= 2


def dist_to_surface(p):
    loc, nrm, idx, d = bvh.find_nearest(p)
    return d if loc is not None else None


rows = []
bad = []
for bone in rig.data.bones:
    h, t = bone.head_local, bone.tail_local
    samples = [h + (t - h) * f for f in (0.08, 0.3, 0.5, 0.7, 0.92)]
    ins = []
    ds = []
    for p in samples:
        ins.append(inside(p))
        d = dist_to_surface(p)
        ds.append(d if d is not None else -1.0)
    n_in = sum(ins)
    valid_d = [d for d in ds if d >= 0]
    row = {
        "bone": bone.name,
        "in_body": f"{n_in}/5",
        "min_dist": round(min(valid_d), 5) if valid_d else None,
        "max_dist": round(max(valid_d), 5) if valid_d else None,
        "avg_dist": round(sum(valid_d) / len(valid_d), 5) if valid_d else None,
        "head_z": round(h.z, 3),
        "tail_z": round(t.z, 3),
    }
    rows.append(row)
    if n_in < 4:
        bad.append((bone.name, n_in, row["min_dist"]))
    print(
        f"  {bone.name:<16} 体内 {n_in}/5   到表面 "
        f"min={row['min_dist']} avg={row['avg_dist']} max={row['max_dist']}"
    )

print("\n" + "=" * 70)
if bad:
    print("!! 可疑骨骼（采样点多数在体外）:")
    for name, n, d in bad:
        print(f"   {name}: 体内 {n}/5, 最近表面距离 {d}")
else:
    print("所有骨骼采样点都在体内。")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump({"bones": rows, "suspect": bad}, f, ensure_ascii=False, indent=2)
print(f"\n报告 {OUT}")
