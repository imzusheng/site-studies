# -*- coding: utf-8 -*-
"""露丝 15 · 手臂权重诊断：谁没跟上手臂

现象：手臂上举 90° 后，手臂几何被拉成比自身长一倍的扁带。
推断：手臂范围内有一部分顶点的权重没落在手臂骨上，它们留在原地，
      中间的三角形被拉长。这里把范围量化出来。

在 Blender 里跑：
    exec(open('.../coach/tools/15_arm_weight_diag.py', encoding='utf-8').read())
"""

import bpy
import os
import json
from collections import Counter
from mathutils import Vector

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "15_arm_diag.json")

ob = bpy.data.objects["Ruth"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data

gi = {g.index: g.name for g in ob.vertex_groups}
ARM = {"LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
       "RightShoulder", "RightArm", "RightForeArm", "RightHand"}
SEG = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}


def seg_dist(p, a, b):
    ab = b - a
    L2 = ab.length_squared
    if L2 < 1e-12:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / L2))
    return (p - (a + ab * t)).length


# 手臂的几何范围：自然下垂时离左/右臂骨链 < 0.07 的顶点
armset = {"L": [], "R": []}
for v in me.vertices:
    for side, chain in (
        ("L", ["LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand"]),
        ("R", ["RightShoulder", "RightArm", "RightForeArm", "RightHand"]),
    ):
        d = min(seg_dist(v.co, *SEG[b]) for b in chain)
        if d < 0.07:
            armset[side].append(v.index)
            break

print(f"手臂几何范围内顶点：左 {len(armset['L'])}  右 {len(armset['R'])}")

report = {}
for side in ("L", "R"):
    rows = []
    for vi in armset[side]:
        v = me.vertices[vi]
        tot = 0.0
        others = {}
        for g in v.groups:
            n = gi.get(g.group)
            if g.weight <= 1e-4:
                continue
            if n in ARM:
                tot += g.weight
            else:
                others[n] = round(g.weight, 3)
        if tot < 0.80:
            rows.append((vi, tuple(round(c, 3) for c in v.co), round(tot, 3), others))
    print(f"\n=== 侧 {side}：手臂骨权重合计 < 0.80 的顶点 {len(rows)} / {len(armset[side])} ===")
    cnt = Counter()
    for r in rows:
        for k in r[3]:
            cnt[k] += 1
    print("  这些顶点把权重给了：", dict(cnt.most_common(10)))
    for r in rows[:20]:
        print(f"   v{r[0]} {r[1]} 手臂权重={r[2]}  其他={r[3]}")
    report[side] = {"total": len(armset[side]), "low_arm_weight": len(rows),
                    "other_bones": dict(cnt)}

# 顺带看袖子（POLO 且靠近肩）的情况
print("\n=== Polo 靠近肩部的顶点权重抽样 ===")
n = 0
for v in me.vertices:
    if abs(v.co.x) < 0.09 or not (1.10 < v.co.z < 1.24):
        continue
    labs = {gi.get(g.group) for g in v.groups if g.weight > 0.2}
    if not labs:
        continue
    head = sorted(
        [(gi.get(g.group), round(g.weight, 3)) for g in v.groups if g.weight > 1e-3],
        key=lambda kv: -kv[1])[:4]
    print(f"   v{v.index} {tuple(round(c,3) for c in v.co)} → {head}")
    n += 1
    if n >= 15:
        break

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(f"\n报告 {OUT}")
