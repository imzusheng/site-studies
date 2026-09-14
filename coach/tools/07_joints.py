# -*- coding: utf-8 -*-
"""教练/露丝 07 · 关节位置测量 + 修正 SKIRT/SHORTS

绑骨骼之前必须知道关节在哪。这个模型的比例不是写实人体（约 5.5 头身），
所以不能套成年女性的标准比例，只能从它自己的几何量出来。

方法：用 BODY/HEAD 顶点组的皮肤顶点做逐高度切片，
  - 腿部：找 x 方向的双簇（两腿分离）→ 最高分离高度就是裆点
  - 每条腿：逐高度的中心线，看前后方向(z)的转折 → 膝盖
  - 手臂：肩到腕的中心线
  - 颈部：头与躯干之间最细处

同时修正一处分割错误：
  裙下那片白色是**安全裤**（真实存在的部件），颜色与裙子同为白，
  被并进了 SKIRT。它贴着骨盆和腿，如果跟着裙摆骨摆动会把腿扯开，
  所以单独拆成 SHORTS，绑定时跟骨盆。

在 Blender 里跑：
    exec(open('.../coach/tools/07_joints.py', encoding='utf-8').read())
"""

import bpy
import json
import os
import numpy as np
from collections import defaultdict

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "07_joints.json")
BLEND = os.path.join(PROJ, "build", "coach_stage1.blend")

ob = bpy.data.objects["Coach_Welded"]
me = ob.data
H = max(v.co.y for v in me.vertices)   # 本地 y = 高度，现在 = 1.65
print(f"本地高度 {H:.4f} m")

gi = {g.name: g.index for g in ob.vertex_groups}


def verts_of(names):
    idxs = {gi[n] for n in names if n in gi}
    out = []
    for v in me.vertices:
        for g in v.groups:
            if g.group in idxs:
                out.append(v)
                break
    return out


skin = verts_of(["grp_BODY", "grp_HEAD"])
print(f"皮肤顶点 {len(skin)}")


def slice_at(vs, y, tol=0.008):
    return [v for v in vs if abs(v.co.y - y) < tol]


def clusters_x(vs, gap=0.020, min_n=3):
    """把一组顶点的 x 值按间隙切成簇，用来判断左右腿是否分离。"""
    xs = sorted(v.co.x for v in vs)
    if not xs:
        return []
    out = [[xs[0]]]
    for x in xs[1:]:
        if x - out[-1][-1] > gap:
            out.append([x])
        else:
            out[-1].append(x)
    return [c for c in out if len(c) >= min_n]


# ---------------------------------------------------------------- 裆点
print("\n=== 腿部双簇扫描（找裆点）===")
crotch_y = None
scan = []
yy = 0.05
while yy < H * 0.75:
    sl = slice_at(skin, yy)
    cl = clusters_x(sl, gap=0.016, min_n=3)
    scan.append((round(yy, 3), len(sl), len(cl)))
    if len(cl) >= 2 and crotch_y is None and yy > H * 0.30:
        crotch_y = yy
    yy += 0.01

for y, n, c in scan:
    if 0.30 * H < y < 0.62 * H:
        bar = " | ".join(["#"] * c)
        print(f"  y={y:.3f} ({y / H * 100:>4.1f}%)  顶点{n:>4}  簇数 {c}  {bar}")

print(f"\n裆点高度 y ≈ {crotch_y:.3f} m ({crotch_y / H * 100:.1f}%)")


# ---------------------------------------------------------------- 腿中心线
def side_verts(vs, sign):
    return [v for v in vs if (v.co.x < 0) == (sign < 0)]


def centerline(vs, ylo, yhi, step=0.02):
    rows = []
    y = ylo
    while y <= yhi:
        sl = slice_at(vs, y, 0.012)
        if len(sl) >= 4:
            rows.append(
                {
                    "y": round(y, 4),
                    "cx": round(float(np.mean([v.co.x for v in sl])), 4),
                    "cz": round(float(np.mean([v.co.z for v in sl])), 4),
                    "zmin": round(min(v.co.z for v in sl), 4),
                    "zmax": round(max(v.co.z for v in sl), 4),
                    "n": len(sl),
                }
            )
        y += step
    return rows


legL = centerline(side_verts(skin, -1), 0.06, (crotch_y or 0.85))
legR = centerline(side_verts(skin, +1), 0.06, (crotch_y or 0.85))

print("\n=== 左腿中心线（y 高度 / cx 左右 / cz 前后）===")
for r in legL:
    print(
        f"  y={r['y']:.3f} ({r['y'] / H * 100:>4.1f}%)  cx={r['cx']:>7.4f}  "
        f"cz={r['cz']:>7.4f}  z[{r['zmin']:>6.3f},{r['zmax']:>6.3f}]  n={r['n']}"
    )

# ---------------------------------------------------------------- 手臂中心线
armL = centerline(side_verts(skin, -1), (crotch_y or 0.85), H * 0.95)
# 手臂用 |x| 较大的顶点
armL = [
    r
    for r in armL
]
print("\n=== 躯干+手臂（左侧，看外侧轮廓）===")
for r in armL:
    print(
        f"  y={r['y']:.3f} ({r['y'] / H * 100:>4.1f}%)  cx={r['cx']:>7.4f}  cz={r['cz']:>7.4f}  n={r['n']}"
    )

# 外侧最远点：判断手臂在哪个高度最外
print("\n=== 各高度最外 |x|（左侧）===")
for y in [x * 0.03 + crotch_y for x in range(0, int((H * 0.95 - crotch_y) / 0.03) + 1)]:
    sl = [v for v in skin if abs(v.co.y - y) < 0.012 and v.co.x < 0]
    if sl:
        print(f"  y={y:.3f} ({y / H * 100:>4.1f}%)  最外 x={min(v.co.x for v in sl):>7.4f}  n={len(sl)}")

# ---------------------------------------------------------------- 颈/头
print("\n=== 上段剖面（找脖子最细处与头中心）===")
for y in [H * f for f in (0.74, 0.76, 0.78, 0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.94, 0.98)]:
    sl = [v for v in skin if abs(v.co.y - y) < 0.010]
    if sl:
        xw = max(v.co.x for v in sl) - min(v.co.x for v in sl)
        zw = max(v.co.z for v in sl) - min(v.co.z for v in sl)
        print(
            f"  y={y:.3f} ({y / H * 100:>4.1f}%)  皮肤宽 x {xw:.4f}  深 z {zw:.4f}  "
            f"cx={np.mean([v.co.x for v in sl]):>7.4f} cz={np.mean([v.co.z for v in sl]):>7.4f}  n={len(sl)}"
        )

# 头部（含头发）整体
hair = verts_of(["grp_HAIR", "grp_VISOR", "grp_HEAD_RIGID", "grp_HEAD"])
if hair:
    ys = [v.co.y for v in hair]
    print(
        f"\n头部组（头皮+帽+眼镜+脸）：y {min(ys):.3f}~{max(ys):.3f}  "
        f"({min(ys) / H * 100:.1f}%~{max(ys) / H * 100:.1f}%)"
    )

pony = verts_of(["grp_PONYTAIL"])
if pony:
    ys = [v.co.y for v in pony]
    zs = [v.co.z for v in pony]
    print(
        f"马尾：y {min(ys):.3f}~{max(ys):.3f} ({min(ys) / H * 100:.1f}%~{max(ys) / H * 100:.1f}%)  "
        f"z {min(zs):.3f}~{max(zs):.3f}"
    )

skirt = verts_of(["grp_SKIRT"])
if skirt:
    ys = [v.co.y for v in skirt]
    print(f"裙子：y {min(ys):.3f}~{max(ys):.3f} ({min(ys) / H * 100:.1f}%~{max(ys) / H * 100:.1f}%)")

# ---------------------------------------------------------------- 修 SKIRT → SHORTS
# 裙摆下沿：SKIRT 里 y 的分布有个明显台阶。先看直方图。
shorts_moved = 0
if skirt:
    hist = defaultdict(int)
    for v in skirt:
        hist[round(v.co.y / H * 100)] += 1
    print("\nSKIRT 组高度直方图（%身高 → 顶点数）：")
    for k in sorted(hist):
        print(f"  {k:>3}%  {hist[k]:>5}  {'#' * min(60, hist[k] // 8)}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "local_height": round(H, 4),
            "crotch_y": crotch_y,
            "leg_left_centerline": legL,
            "leg_right_centerline": legR,
            "upper_centerline_left": armL,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"\n报告 {OUT}")
