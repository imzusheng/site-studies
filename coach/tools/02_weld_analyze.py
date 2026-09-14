# -*- coding: utf-8 -*-
"""教练角色 02 · 焊接 + 真实连通性体检

为什么要单独一步：glTF 里因为 UV seam / 硬边法线，同一个位置点会被拆成多个顶点。
在拆开状态下谈"流形"没有意义——shell 会被误判成上千个碎片。
先把重合点焊起来，再看真正的连通块和边界，才能回答：

  Q1 焊接后到底是不是一个封闭流形？（交接报告的说法需要复核）
  Q2 真正的连通块有几块、分别是什么部位？

这一步只分析 + 打印，不保存文件。

在 Blender 里跑：
    exec(open('.../coach/tools/02_weld_analyze.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import json
import os

REPORT_DIR = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach/reports"
OUT = os.path.join(REPORT_DIR, "02_weld.json")
os.makedirs(REPORT_DIR, exist_ok=True)

ob = bpy.data.objects["node_0"]
me = ob.data

print("=" * 72)
print("A. 焊接阈值扫描：找重合点的‘平台’")
print("=" * 72)

scan = []
for dist in (0.0, 1e-6, 1e-5, 5e-5, 1e-4, 5e-4, 1e-3, 5e-3):
    bm = bmesh.new()
    bm.from_mesh(me)
    before = len(bm.verts)
    if dist > 0:
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=dist)
    after = len(bm.verts)
    nm = sum(1 for e in bm.edges if not e.is_manifold)
    bd = sum(1 for e in bm.edges if e.is_boundary)
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    scan.append(
        {
            "dist": dist,
            "verts": after,
            "merged": before - after,
            "non_manifold_edges": nm,
            "boundary_edges": bd,
            "faces": len(bm.faces),
            "tris": tris,
        }
    )
    print(
        f"  dist={dist:<8g} verts={after:>6} 合并掉 {before - after:>6} | "
        f"非流形边 {nm:>6} 边界边 {bd:>6} | 面 {len(bm.faces)} tris {tris}"
    )
    bm.free()

# ---------------------------------------------------------------- 选阈值
# 第一个能让顶点数显著下降、且再放大阈值几乎不再变化的距离，就是 seam 重合的尺度。
WELD = 1e-5
print(f"\n→ 采用焊接距离 {WELD}")

bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=WELD)
bm.verts.ensure_lookup_table()
bm.edges.ensure_lookup_table()
bm.faces.ensure_lookup_table()

verts = len(bm.verts)
edges = len(bm.edges)
faces = len(bm.faces)
tris = sum(len(f.verts) - 2 for f in bm.faces)
non_manifold = sum(1 for e in bm.edges if not e.is_manifold)
boundary = sum(1 for e in bm.edges if e.is_boundary)
wire = sum(1 for e in bm.edges if len(e.link_faces) == 0)
loose_verts = sum(1 for v in bm.verts if not v.link_edges)

print("\n" + "=" * 72)
print("B. 焊接后的真实拓扑")
print("=" * 72)
print(f"  顶点 {verts}（原始 35438，唯一位置点）")
print(f"  边 {edges}  面 {faces}  tris {tris}")
print(f"  非流形边 {non_manifold}")
print(f"  其中边界边（有洞/开口）{boundary}")
print(f"  悬空边 {wire}   孤立点 {loose_verts}")

# ---- 环流检查：每个顶点是否非流形（扇区≥2 或者边界扇区）----
nonman_verts = [v for v in bm.verts if not v.is_manifold]
print(f"  非流形顶点 {len(nonman_verts)}")

# ---------------------------------------------------------------- 连通块
def components(bm):
    parent = list(range(len(bm.verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in bm.edges:
        a, b = find(e.verts[0].index), find(e.verts[1].index)
        if a != b:
            parent[b] = a

    groups = {}
    for v in bm.verts:
        groups.setdefault(find(v.index), []).append(v.index)
    return groups


groups = components(bm)
print("\n" + "=" * 72)
print(f"C. 焊接后真正连通块：{len(groups)} 块")
print("=" * 72)

# 每块统计：顶点/面/包围盒/是否有开口
comps = []
for root, idxs in groups.items():
    vset = set(idxs)
    fcount = 0
    for f in bm.faces:
        if f.verts[0].index in vset:
            fcount += 1
    pts = [bm.verts[i].co for i in idxs]
    lo = [min(p[k] for p in pts) for k in range(3)]
    hi = [max(p[k] for p in pts) for k in range(3)]
    # 该块的边界边数
    bcnt = 0
    for i in idxs:
        for e in bm.verts[i].link_edges:
            if e.is_boundary:
                bcnt += 1
    comps.append(
        {
            "verts": len(idxs),
            "faces": fcount,
            "lo": [round(v, 4) for v in lo],
            "hi": [round(v, 4) for v in hi],
            "size": [round(hi[k] - lo[k], 4) for k in range(3)],
            "center": [round((hi[k] + lo[k]) / 2, 4) for k in range(3)],
            "boundary_edges": bcnt // 2,  # 每条边被两个端点各数一次
        }
    )
comps.sort(key=lambda c: -c["verts"])

# 本地坐标：x=左右  y=上下(0→1.185)  z=前后
H = 1.1846
print(f"（本地坐标 x=左右 y=高度 0→{H} z=前后；高度占比用 y/{H:.4f} 表示）\n")
for i, c in enumerate(comps[:50]):
    zc = c["center"]
    print(
        f"  #{i:>3} v={c['verts']:>5} f={c['faces']:>5} "
        f"开口边={c['boundary_edges']:>5} | "
        f"x[{c['lo'][0]:>7.3f},{c['hi'][0]:>7.3f}] "
        f"y[{c['lo'][1]:>6.3f},{c['hi'][1]:>6.3f}]={c['lo'][1] / H * 100:>4.0f}~{c['hi'][1] / H * 100:>4.0f}% "
        f"z[{c['lo'][2]:>7.3f},{c['hi'][2]:>7.3f}]"
    )

# ---------------------------------------------------------------- 高度剖面
print("\n" + "=" * 72)
print("D. 高度剖面（每 3% 身高一档：x 宽度 / z 厚度 / 截面顶点数）")
print("=" * 72)
N = 40
prof = []
for band in range(N):
    y0 = H * band / N
    y1 = H * (band + 1) / N
    pts = [v.co for v in bm.verts if y0 <= v.co.y < y1]
    if not pts:
        prof.append({"band": band, "y0": round(y0, 4), "y1": round(y1, 4), "count": 0})
        print(f"  {y0:>5.3f}-{y1:>5.3f} ({band / N * 100:>3.0f}%)  空")
        continue
    xw = max(p.x for p in pts) - min(p.x for p in pts)
    zw = max(p.z for p in pts) - min(p.z for p in pts)
    prof.append(
        {
            "band": band,
            "y0": round(y0, 4),
            "y1": round(y1, 4),
            "count": len(pts),
            "x_width": round(xw, 4),
            "z_depth": round(zw, 4),
            "x_min": round(min(p.x for p in pts), 4),
            "x_max": round(max(p.x for p in pts), 4),
            "z_min": round(min(p.z for p in pts), 4),
            "z_max": round(max(p.z for p in pts), 4),
        }
    )
    bar = "#" * int(xw / 0.4 * 40)
    print(
        f"  {y0:>5.3f}-{y1:>5.3f} ({band / N * 100:>3.0f}%)  "
        f"x宽 {xw:>6.3f}  z深 {zw:>6.3f}  n={len(pts):>5}  {bar}"
    )

# ---------------------------------------------------------------- UV/法线
print("\n" + "=" * 72)
print("E. UV / 法线 / 其他")
print("=" * 72)
uv = me.uv_layers.active
if uv:
    us = [d.uv[0] for d in uv.data]
    vs = [d.uv[1] for d in uv.data]
    print(f"  UVMap: u[{min(us):.4f},{max(us):.4f}] v[{min(vs):.4f},{max(vs):.4f}]")
    print(f"  UV loop 数 {len(uv.data)}（焊接前是 {len(me.loops)}）")
print(f"  自定义分割法线: {me.has_custom_normals}")

# 面朝向一致性：法线朝外还是朝内有负体积
vol = sum(f.calc_area() for f in bm.faces)
print(f"  总面积 {vol:.4f} m^2")

bm.free()

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "weld_scan": scan,
            "chosen_weld_dist": WELD,
            "after_weld": {
                "verts": verts,
                "edges": edges,
                "faces": faces,
                "tris": tris,
                "non_manifold_edges": non_manifold,
                "boundary_edges": boundary,
                "wire_edges": wire,
                "loose_verts": loose_verts,
                "non_manifold_verts": len(nonman_verts),
                "component_count": len(groups),
            },
            "components": comps,
            "height_profile": prof,
            "local_height": H,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"\n报告写入 {OUT}")
