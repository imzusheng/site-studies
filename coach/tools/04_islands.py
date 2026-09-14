# -*- coding: utf-8 -*-
"""教练角色 04 · 焊接落盘 + UV 岛结构分析

两个目的：
  1. 生成焊接后的工作网格（后续所有步骤都基于它），存成 coach/build/coach_welded.blend；
  2. 回答一个关键的可否问题：**语义拆分到底可不可行？**

    焊接后整个模型是「1 个连通块」，说明衣服不是独立外壳，而是和身体缝在同一张
    连续表面上（交接报告的判断正确）。所以「按松散块拆对象」这条路是死的。
    唯一可能的路是 **UV 岛**：AI 生成器通常会把每个部件摊到独立 UV 岛里。
    这一步就是量 UV 岛有多少个、每个岛长什么样、贴图颜色是什么，
    看能不能按「岛 + 位置 + 颜色」聚成 BODY / POLO / SKIRT / HAIR …

在 Blender 里跑：
    exec(open('.../coach/tools/04_islands.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import json
import os
import numpy as np

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "04_islands.json")
BLEND = os.path.join(PROJ, "build", "coach_welded.blend")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
os.makedirs(os.path.dirname(BLEND), exist_ok=True)

WELD = 1e-5
src = bpy.data.objects["node_0"]

# ---------------------------------------------------------------- 焊接 → 新对象
old = bpy.data.objects.get("Coach_Welded")
if old:
    bpy.data.objects.remove(old, do_unlink=True)

me = src.data.copy()
me.name = "Coach_Welded_Mesh"
ob = bpy.data.objects.new("Coach_Welded", me)
bpy.context.scene.collection.objects.link(ob)
ob.matrix_world = src.matrix_world.copy()

bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=WELD)
bm.to_mesh(me)
bm.free()
me.update()

print(f"焊接后：顶点 {len(me.vertices)}  面 {len(me.polygons)}")

# ---------------------------------------------------------------- 面→材质槽/UV
uv_layer = me.uv_layers.active
print("UV 层:", uv_layer.name)

# ---------------------------------------------------------------- UV 岛
# 判据：两个面共享一条网格边，且在这条边的两个端点上 UV 一致 → 同一个岛。
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active

parent = list(range(len(bm.faces)))


def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


EPS = 1e-6

for e in bm.edges:
    lf = e.link_faces
    if len(lf) != 2:
        continue
    f1, f2 = lf
    # 找 f1 / f2 中对应 e 两个端点的 loop
    def uv_of(f, v):
        for l in f.loops:
            if l.vert == v:
                return l[uvl].uv
        return None

    ok = True
    for v in e.verts:
        a, b = uv_of(f1, v), uv_of(f2, v)
        if a is None or b is None or (a - b).length > EPS:
            ok = False
            break
    if ok:
        r1, r2 = find(f1.index), find(f2.index)
        if r1 != r2:
            parent[r2] = r1

islands = {}
for f in bm.faces:
    islands.setdefault(find(f.index), []).append(f.index)

print(f"\nUV 岛数量：{len(islands)}")

# ---------------------------------------------------------------- 贴图采样
base_img = None
for node in bpy.data.materials["Material.001"].node_tree.nodes:
    if node.type == "TEX_IMAGE" and node.image and "normal" not in node.image.name:
        if "metallic" in node.image.name:
            continue
        base_img = node.image
        break

print("BaseColor 贴图:", base_img.name, base_img.size[:] if base_img else None)

color_arr = None
if base_img and base_img.size[0] > 0:
    w, h = base_img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    base_img.pixels.foreach_get(buf)
    color_arr = buf.reshape(h, w, 4)  # 行 0 = 图像底部（v=0）
    print(f"  采样数组 {color_arr.shape}")


def sample(u, v):
    if color_arr is None:
        return None
    w, h = base_img.size
    x = int(min(max(u, 0.0), 0.999999) * w)
    y = int(min(max(v, 0.0), 0.999999) * h)
    px = color_arr[y, x]
    return [round(float(c), 4) for c in px[:3]]


# ---------------------------------------------------------------- 岛统计
H = 1.1846
rows = []
for root, fidx in islands.items():
    pts = []
    cols = []
    for fi in fidx:
        f = bm.faces[fi]
        c = f.calc_center_median()
        pts.append(c)
        # 用面中心处的 UV 采样（loop UV 平均）
        u = sum(l[uvl].uv[0] for l in f.loops) / len(f.loops)
        v = sum(l[uvl].uv[1] for l in f.loops) / len(f.loops)
        s = sample(u, v)
        if s:
            cols.append(s)
    lo = [min(p[k] for p in pts) for k in range(3)]
    hi = [max(p[k] for p in pts) for k in range(3)]
    avg = (
        [round(sum(c[k] for c in cols) / len(cols), 4) for k in range(3)]
        if cols
        else None
    )
    rows.append(
        {
            "faces": len(fidx),
            "tris": sum(len(bm.faces[i].verts) - 2 for i in fidx),
            "lo": [round(v, 4) for v in lo],
            "hi": [round(v, 4) for v in hi],
            "size": [round(hi[k] - lo[k], 4) for k in range(3)],
            "center": [round((hi[k] + lo[k]) / 2, 4) for k in range(3)],
            "y_pct": [round(lo[1] / H * 100, 1), round(hi[1] / H * 100, 1)],
            "avg_color": avg,
        }
    )

rows.sort(key=lambda r: -r["faces"])
bm.free()

print("\n" + "=" * 100)
print("UV 岛列表（按面数降序，前 60）")
print("本地坐标 x=左右 y=高度(0→1.185) z=前后；颜色是 BaseColor 采样")
print("=" * 100)
print(f"{'#':>3} {'面':>6} {'tris':>6}  {'y高度%':>12}  {'x范围':>16} {'z范围':>16}  平均色")
for i, r in enumerate(rows[:60]):
    c = r["avg_color"]
    cs = f"({c[0]:.2f},{c[1]:.2f},{c[2]:.2f})" if c else "—"
    print(
        f"{i:>3} {r['faces']:>6} {r['tris']:>6}  "
        f"{r['y_pct'][0]:>5.1f}~{r['y_pct'][1]:<5.1f}  "
        f"[{r['lo'][0]:>6.3f},{r['hi'][0]:>6.3f}] "
        f"[{r['lo'][2]:>6.3f},{r['hi'][2]:>6.3f}]  {cs}"
    )

# ---------------------------------------------------------------- 颜色聚类粗看
print("\n" + "=" * 100)
print("按平均色大致分桶（用于判断能不能靠颜色分部件）")
print("=" * 100)
buckets = {}
for r in rows:
    c = r["avg_color"]
    if not c:
        k = "无采样"
    else:
        mx, mn = max(c[:3]), min(c[:3])
        if mx < 0.12:
            k = "近黑"
        elif mn > 0.55 and mx - mn < 0.10:
            k = "白/浅灰"
        elif c[2] > c[0] + 0.05:
            k = "偏蓝(藏青)"
        elif c[0] > c[2] + 0.05:
            k = "偏暖(皮肤/木色)"
        else:
            k = "中间调"
    b = buckets.setdefault(k, {"islands": 0, "faces": 0})
    b["islands"] += 1
    b["faces"] += r["faces"]
for k, v in sorted(buckets.items(), key=lambda kv: -kv[1]["faces"]):
    print(f"  {k:<14} 岛 {v['islands']:>5} 个   面 {v['faces']:>6}")

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "weld_dist": WELD,
            "verts_after_weld": len(me.vertices),
            "faces": len(me.polygons),
            "uv_island_count": len(islands),
            "islands": rows,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )

bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print(f"\n报告 {OUT}")
print(f"工作文件 {BLEND}")
