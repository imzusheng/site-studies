# -*- coding: utf-8 -*-
"""露丝 08d · 实测修正骨架（马尾 / 手臂 / 裙骨）

08c 的数值验收找出 4 处偏移：
  - Ponytail3/4 完全在马尾外（偏离 3.3 cm）：马尾路径是弯的，我按直线估错了
  - 左右前臂、手骨贴皮（离表面 0.2~2.7 mm）：自然下垂的手臂比估的更靠外
  - 前后裙骨出界，左右裙骨却很好：说明裙腰中心不在 (0,0)

这一步不靠猜，直接用顶点组实测各部位中心线，再回写骨骼位置。

在 Blender 里跑：
    exec(open('.../coach/tools/08d_fix_bones.py', encoding='utf-8').read())
"""

import bpy
import json
import os
import numpy as np
from mathutils import Vector

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "08d_fix.json")
BLEND = os.path.join(PROJ, "build", "coach_rig.blend")

rig = bpy.data.objects["Ruth_Rig"]
ob = bpy.data.objects["Coach_Welded"]
me = ob.data

gi = {g.name: g.index for g in ob.vertex_groups}


def verts_of(names):
    idxs = {gi[n] for n in names if n in gi}
    return [
        v
        for v in me.vertices
        if any(g.group in idxs for g in v.groups)
    ]


def centerline(vs, zmin, zmax, n, axis_filter=None):
    """按高度切片求中心，返回 n+1 个点（含首尾）。"""
    out = []
    for i in range(n + 1):
        z = zmin + (zmax - zmin) * i / n
        half = (zmax - zmin) / n / 2 + 0.004
        sl = [v for v in vs if abs(v.co.z - z) < half]
        if axis_filter:
            sl = [v for v in sl if axis_filter(v)]
        if len(sl) < 3:
            out.append(None)
            continue
        out.append(
            Vector(
                (
                    float(np.mean([v.co.x for v in sl])),
                    float(np.mean([v.co.y for v in sl])),
                    z,
                )
            )
        )
    return out


report = {}

# ---------------------------------------------------------------- 马尾中心线
pony = verts_of(["grp_PONYTAIL"])
zs = [v.co.z for v in pony]
pz_min, pz_max = min(zs), max(zs)
print(f"马尾顶点 {len(pony)}  z {pz_min:.3f}~{pz_max:.3f}")
pl = centerline(pony, pz_min, pz_max, 4)
print("马尾中心线（从下到上）:")
for p in pl:
    print(f"   {tuple(round(c, 4) for c in p) if p else None}")
# 骨链方向：从头顶往下，所以反转
pony_pts = [p for p in pl if p]
pony_pts.reverse()  # 上 → 下
report["ponytail_centerline"] = [[round(c, 4) for c in p] for p in pony_pts]

# ---------------------------------------------------------------- 手臂中心线
body = verts_of(["grp_BODY"])
armL = centerline(
    body, 0.70, 1.26, 8, axis_filter=lambda v: v.co.x > 0.135
)
armR = centerline(
    body, 0.70, 1.26, 8, axis_filter=lambda v: v.co.x < -0.135
)
print("\n左臂中心线（x>0.135）:")
for p in armL:
    print(f"   {tuple(round(c, 4) for c in p) if p else None}")
print("右臂中心线（x<-0.135）:")
for p in armR:
    print(f"   {tuple(round(c, 4) for c in p) if p else None}")
report["arm_L"] = [[round(c, 4) for c in p] if p else None for p in armL]
report["arm_R"] = [[round(c, 4) for c in p] if p else None for p in armR]

# ---------------------------------------------------------------- 裙腰中心
skirt = verts_of(["grp_SKIRT"])
sz = [v.co.z for v in skirt]
# 裙腰 = 最高 15% 的 SKIRT 顶点
hi_cut = max(sz) - (max(sz) - min(sz)) * 0.18
waist = [v for v in skirt if v.co.z >= hi_cut]
wx = float(np.mean([v.co.x for v in waist]))
wy = float(np.mean([v.co.y for v in waist]))
print(f"\n裙腰中心 (x={wx:.4f}, y={wy:.4f})   裙 z {min(sz):.3f}~{max(sz):.3f}")
report["skirt_waist_center"] = [round(wx, 4), round(wy, 4)]
report["skirt_z_range"] = [round(min(sz), 4), round(max(sz), 4)]

# 四个方位的裙片中心线
DIRS = {"F": (0.0, -1.0), "B": (0.0, 1.0), "L": (1.0, 0.0), "R": (-1.0, 0.0)}
skirt_lines = {}
for name, (dx, dy) in DIRS.items():
    # 取该方位 ±40° 扇区内的顶点
    sel = []
    for v in skirt:
        vx, vy = v.co.x - wx, v.co.y - wy
        if abs(vx) < 1e-6 and abs(vy) < 1e-6:
            continue
        # 与目标方向的夹角
        d1 = np.array([dx, dy])
        d2 = np.array([vx, vy])
        n1, n2 = np.linalg.norm(d1), np.linalg.norm(d2)
        if n1 < 1e-9 or n2 < 1e-9:
            continue
        cos = float(np.dot(d1, d2) / (n1 * n2))
        if cos > 0.77:  # ±40°
            sel.append(v)
    line = centerline(sel, min(sz), max(sz), 2)
    line = [p for p in line if p]
    skirt_lines[name] = line
    print(f"\n裙骨方向 {name}（{len(sel)} 顶点）:")
    for p in line:
        print(f"   {tuple(round(c, 4) for c in p)}")
report["skirt_lines"] = {
    k: [[round(c, 4) for c in p] for p in v] for k, v in skirt_lines.items()
}

# ---------------------------------------------------------------- 回写骨骼
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones
changed = []


def set_chain(names, pts):
    """把一串相连的骨按给定点重建，最后一根骨保留原 tail 方向长度或沿用最后一点。"""
    for i, name in enumerate(names):
        b = eb[name]
        b.head = Vector(pts[i])
        b.tail = Vector(pts[i + 1])
        changed.append(name)


# 马尾：4 节，需要 5 个点。实测只有 5 个点时直接用；否则重采样。
if len(pony_pts) >= 5:
    pp = pony_pts[:5]
else:
    pp = pony_pts
# 补足到 5 个点
while len(pp) < 5:
    pp.append(pp[-1] + (pp[-1] - pp[-2]) if len(pp) > 1 else pp[-1])
set_chain(["Ponytail1", "Ponytail2", "Ponytail3", "Ponytail4"], pp)
print("\n马尾骨已按实测路径重建")
for n in ["Ponytail1", "Ponytail2", "Ponytail3", "Ponytail4"]:
    b = eb[n]
    print(f"   {n} head=({b.head.x:.4f},{b.head.y:.4f},{b.head.z:.4f})")

# 手臂：找出实测中心线上对应「肘 / 腕 / 手尖」高度的点
# 肘用解剖比例：肩到腕的 54%
shoulder = Vector((0.115, 0.0, 1.205))
for side, line, sgn in (("Left", armL, 1), ("Right", armR, -1)):
    pts = [p for p in line if p is not None]
    if len(pts) < 3:
        continue
    # 腕 = 实测中心线里最低的 2 个点的平均附近；手尖 = 最低点
    pts_sorted = sorted(pts, key=lambda p: p.z)
    hand_tip = pts_sorted[0]
    wrist = pts_sorted[1]
    sh = Vector((sgn * 0.115, 0.0, 1.205))
    elbow = sh + (wrist - sh) * 0.54

    eb[side + "ForeArm"].head = elbow
    eb[side + "Arm"].tail = elbow
    eb[side + "ForeArm"].tail = wrist
    eb[side + "Hand"].head = wrist
    eb[side + "Hand"].tail = hand_tip
    changed += [side + "ForeArm", side + "Hand", side + "Arm"]
    print(
        f"\n{side} 肘=({elbow.x:.4f},{elbow.y:.4f},{elbow.z:.4f}) "
        f"腕=({wrist.x:.4f},{wrist.y:.4f},{wrist.z:.4f}) "
        f"手尖=({hand_tip.x:.4f},{hand_tip.y:.4f},{hand_tip.z:.4f})"
    )

# 裙骨：按实测各方位中心线重建
for name, line in skirt_lines.items():
    if len(line) < 2:
        continue
    b1 = eb["Skirt" + name + "1"]
    b2 = eb["Skirt" + name + "2"]
    # 实测线是从下到上（centerline 按 z 递增），骨架是从上到下
    top, bot = line[-1], line[0]
    mid = (top + bot) / 2
    b1.head = top
    b1.tail = mid
    b2.head = mid
    b2.tail = bot
    changed += ["Skirt" + name + "1", "Skirt" + name + "2"]
    print(
        f"裙骨 {name}: top=({top.x:.3f},{top.y:.3f},{top.z:.3f}) "
        f"bot=({bot.x:.3f},{bot.y:.3f},{bot.z:.3f})"
    )

bpy.ops.object.mode_set(mode="OBJECT")
print(f"\n改动骨骼 {len(set(changed))} 根")

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(f"报告 {OUT}\n工作文件 {BLEND}")
