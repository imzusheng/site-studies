# -*- coding: utf-8 -*-
"""露丝 11 · 权重诊断

形变测试里手臂被撕成扁片、手消失。猜测是自动权重（heat map）在
「自然下垂时手肘贴着裙子」的情况下把手臂顶点分给了裙骨/躯干骨，
于是旋转手臂时一部分顶点跟着走、一部分留下 → 撕裂。

这一步直接把权重表读出来验证，别再靠猜。

在 Blender 里跑：
    exec(open('.../coach/tools/11_weight_diag.py', encoding='utf-8').read())
"""

import bpy
import os
import json
from mathutils import Vector

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "11_weights.json")

ob = bpy.data.objects["Coach_Welded"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data

gname = {g.index: g.name for g in ob.vertex_groups}
deform = {b.name for b in rig.data.bones if b.use_deform}

# ---------------------------------------------------------------- 权重概况
count_per_bone = {n: 0 for n in deform}
unweighted = 0
not_normalized = 0
for v in me.vertices:
    tot = 0.0
    for g in v.groups:
        n = gname.get(g.group)
        if n in deform and g.weight > 1e-5:
            count_per_bone[n] += 1
            tot += g.weight
    if tot < 1e-5:
        unweighted += 1
    elif abs(tot - 1.0) > 0.05:
        not_normalized += 1

print(f"顶点总数 {len(me.vertices)}")
print(f"没有任何权重的顶点 {unweighted}")
print(f"权重和偏离 1 超过 5% 的顶点 {not_normalized}")
print("\n每根骨影响的顶点数：")
for n, c in sorted(count_per_bone.items(), key=lambda kv: -kv[1]):
    if c:
        print(f"  {n:<16} {c:>6}")


# ---------------------------------------------------------------- 定点检查
def probe(label, target):
    """找离 target 最近的顶点，打印它的权重分布。"""
    best, bd = None, 1e9
    for v in me.vertices:
        d = (v.co - Vector(target)).length
        if d < bd:
            bd, best = d, v
    ws = sorted(
        [(gname.get(g.group), round(g.weight, 3)) for g in best.groups if g.weight > 1e-4],
        key=lambda kv: -kv[1],
    )
    print(f"\n[{label}] 目标 {tuple(target)}  最近顶点 {tuple(round(c,3) for c in best.co)} (距离 {bd:.4f})")
    print(f"   权重: {ws}")
    return {"label": label, "coord": [round(c, 4) for c in best.co], "weights": ws}


probes = [
    ("左手（原下垂位置）", (0.175, -0.03, 0.76)),
    ("左手 稍高", (0.19, -0.03, 0.80)),
    ("左前臂", (0.195, -0.03, 0.84)),
    ("左上臂中段", (0.16, 0.0, 1.10)),
    ("左肩外侧", (0.13, 0.0, 1.18)),
    ("左腋下", (0.11, 0.0, 1.14)),
    ("裙子左侧", (0.14, -0.04, 0.80)),
    ("裙子前中", (0.0, -0.13, 0.78)),
    ("左膝", (0.075, 0.0, 0.44)),
    ("头顶", (0.0, 0.0, 1.62)),
    ("马尾", (0.014, 0.13, 1.28)),
    ("帽檐", (0.0, -0.16, 1.42)),
]
res = [probe(a, b) for a, b in probes]

# ---------------------------------------------------------------- 手臂区域污染统计
# 手臂的几何范围（A-Pose 之前，自然下垂）：x>0.13 且 z 在 0.70~1.20
bad_left = []
for v in me.vertices:
    if v.co.x > 0.135 and 0.68 < v.co.z < 1.22:
        for g in v.groups:
            n = gname.get(g.group)
            if n and g.weight > 0.15 and (
                n.startswith("Skirt") or n in ("Hips", "Spine", "Spine1", "Spine2")
            ):
                bad_left.append((v.index, tuple(round(c, 3) for c in v.co), n, round(g.weight, 2)))
                break

print(f"\n\n左侧手臂几何范围内、却被分到裙骨/躯干骨（>15%）的顶点：{len(bad_left)}")
for row in bad_left[:25]:
    print(f"   v{row[0]} {row[1]} → {row[2]} {row[3]}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "unweighted": unweighted,
            "not_normalized": not_normalized,
            "count_per_bone": count_per_bone,
            "probes": res,
            "arm_polluted_count": len(bad_left),
            "arm_polluted_sample": [
                {"v": r[0], "co": r[1], "bone": r[2], "w": r[3]} for r in bad_left[:200]
            ],
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"\n报告 {OUT}")
