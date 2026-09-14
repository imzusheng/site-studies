# -*- coding: utf-8 -*-
"""教练角色 05 · 按贴图颜色做逐面语义分割（可行性验证）

背景：焊接后整模型是 1 个连通块，衣服和皮肤缝在同一张表面上，UV 岛又有 1168 个
且跨部件（一条腿就是一个岛），所以「按拓扑拆」和「按 UV 岛拆」都不成立。

剩下的路是**按颜色拆**：贴图里皮肤是暖色、Polo/裙是白、领口袖口是藏青、
头发是深棕灰。逐面采样 BaseColor，分类，再对同类面做连通分量，
就能得到真正贴着部件边界的选区。

这一步先验证可行性：分类 + 连通分量 + 上色渲染，用眼睛看分割是否贴着部件走。

在 Blender 里跑：
    exec(open('.../coach/tools/05_segment.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import json
import math
import os
import numpy as np
from mathutils import Vector

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "05_segment.json")
PREVIEW = os.path.join(PROJ, "build", "preview")
os.makedirs(PREVIEW, exist_ok=True)

H = 1.1846
ob = bpy.data.objects["Coach_Welded"]
me = ob.data

# ---------------------------------------------------------------- 贴图数组
base_img = None
for node in bpy.data.materials["Material.001"].node_tree.nodes:
    if node.type == "TEX_IMAGE" and node.image:
        if "normal" in node.image.name or "metallic" in node.image.name:
            continue
        base_img = node.image
        break
w, h = base_img.size
buf = np.empty(w * h * 4, dtype=np.float32)
base_img.pixels.foreach_get(buf)
colors = buf.reshape(h, w, 4)


def sample(u, v):
    x = int(min(max(u, 0.0), 0.999999) * w)
    y = int(min(max(v, 0.0), 0.999999) * h)
    return colors[y, x, :3]


# ---------------------------------------------------------------- 逐面采样
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
uvl = bm.loops.layers.uv.active

face_rgb = np.zeros((len(bm.faces), 3), dtype=np.float32)
for f in bm.faces:
    u = sum(l[uvl].uv[0] for l in f.loops) / len(f.loops)
    v = sum(l[uvl].uv[1] for l in f.loops) / len(f.loops)
    face_rgb[f.index] = sample(u, v)

print("逐面采样完成")
print(
    "  R 分布 p5/p50/p95:",
    [round(float(np.percentile(face_rgb[:, 0], p)), 3) for p in (5, 50, 95)],
)


# ---------------------------------------------------------------- 分类
def classify(rgb, f):
    """返回语义标签。颜色为主，位置用于消歧（白衣服分上身/下身）。"""
    r, g, b = [float(c) for c in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    sat = mx - mn
    lum = (r + g + b) / 3
    c = f.calc_center_median()
    ypct = c.y / H * 100

    # 头发：暗、低饱和、偏棕灰
    if lum < 0.45 and sat < 0.12:
        return "HAIR"
    # 眼镜/鞋底等近黑
    if lum < 0.18:
        return "DARK"
    # 藏青（领口、袖口、裙侧条、护腕、袜口）：蓝分量明显
    if b > r + 0.03 and lum < 0.75:
        return "NAVY"
    # 白/浅灰：高亮低饱和 → 再按高度分 Polo / 裙 / 鞋袜
    if lum > 0.62 and sat < 0.14:
        if ypct < 8.0:
            return "SHOE"
        if ypct < 16.0:
            return "SOCK"
        if ypct < 45.0:
            return "LEG_WHITE"  # 袜/鞋以外的白（理论上少）
        if ypct < 63.0:
            return "SKIRT"
        return "POLO"
    # 暖色 → 皮肤
    if r >= g >= b and (r - b) > 0.06:
        return "SKIN"
    return "OTHER"


labels = [classify(face_rgb[f.index], f) for f in bm.faces]
from collections import Counter

cnt = Counter(labels)
print("\n分类面数：")
for k, v in cnt.most_common():
    print(f"  {k:<10} {v:>6} 面  ({v / len(labels) * 100:.1f}%)")

# ---------------------------------------------------------------- 同类连通分量
# 只允许通过共享边传播（保证选区连成片，不产生飞点）
lab_of = {f.index: labels[f.index] for f in bm.faces}
parent = list(range(len(bm.faces)))


def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x


for e in bm.edges:
    lf = e.link_faces
    if len(lf) != 2:
        continue
    a, b = lf
    if lab_of[a.index] == lab_of[b.index]:
        ra, rb = find(a.index), find(b.index)
        if ra != rb:
            parent[rb] = ra

regions = {}
for f in bm.faces:
    regions.setdefault((lab_of[f.index], find(f.index)), []).append(f.index)

# 统计每个标签下的区域
print("\n各标签的连通片数 / 最大片占比：")
per_label = {}
for (lab, root), fidx in regions.items():
    d = per_label.setdefault(lab, {"n": 0, "max": 0, "tot": 0})
    d["n"] += 1
    d["max"] = max(d["max"], len(fidx))
    d["tot"] += len(fidx)
for lab, d in sorted(per_label.items(), key=lambda kv: -kv[1]["tot"]):
    print(
        f"  {lab:<10} 片数 {d['n']:>4}  最大片 {d['max']:>5} 面  "
        f"合计 {d['tot']:>6} 面"
    )

# ---------------------------------------------------------------- 可视化
SEG_COLOR = {
    "SKIN": (1.00, 0.72, 0.55),
    "POLO": (0.15, 0.35, 1.00),
    "SKIRT": (0.10, 0.90, 0.45),
    "SOCK": (1.00, 0.85, 0.10),
    "SHOE": (1.00, 0.25, 0.10),
    "HAIR": (0.55, 0.15, 0.80),
    "NAVY": (0.00, 0.85, 0.95),
    "DARK": (0.05, 0.05, 0.05),
    "LEG_WHITE": (1.00, 0.30, 0.80),
    "OTHER": (0.45, 0.45, 0.45),
}


def solid_mat(name, rgb):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = (*rgb, 1.0)
    em.inputs[1].default_value = 1.0
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs[0], out.inputs[0])
    return m


# 可视化对象（不影响 Coach_Welded 本体）
vis = bpy.data.objects.get("SEG_PREVIEW")
if vis:
    bpy.data.objects.remove(vis, do_unlink=True)
vme = me.copy()
vis = bpy.data.objects.new("SEG_PREVIEW", vme)
bpy.context.scene.collection.objects.link(vis)
vis.matrix_world = ob.matrix_world.copy()

vme.materials.clear()
idx_of = {}
for lab in SEG_COLOR:
    idx_of[lab] = len(vme.materials)
    vme.materials.append(solid_mat("SEG_" + lab, SEG_COLOR[lab]))

for p in vme.polygons:
    p.material_index = idx_of[lab_of[p.index]]

# 渲染三视图
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [
    e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
] else scene.render.engine
scene.render.resolution_x, scene.render.resolution_y = 620, 900
scene.view_settings.view_transform = "Standard"

ob.hide_render = True
world = bpy.data.worlds.get("SegWorld") or bpy.data.worlds.new("SegWorld")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bg = nt.nodes.new("ShaderNodeBackground")
bg.inputs[0].default_value = (0.12, 0.12, 0.14, 1)
bg.inputs[1].default_value = 1.0
nt.links.new(bg.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])

bb = [vis.matrix_world @ Vector(c) for c in vis.bound_box]
ctr = sum(bb, Vector()) / 8
for name, loc, rot in [
    ("front", (ctr.x, ctr.y - 3, ctr.z), (90, 0, 0)),
    ("back", (ctr.x, ctr.y + 3, ctr.z), (90, 0, 180)),
    ("left", (ctr.x - 3, ctr.y, ctr.z), (90, 0, -90)),
]:
    cam = bpy.data.objects.get("SegCam_" + name)
    if cam is None:
        cd = bpy.data.cameras.new("SegCam_" + name)
        cd.type = "ORTHO"
        cd.ortho_scale = 1.3
        cam = bpy.data.objects.new("SegCam_" + name, cd)
        scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = [math.radians(a) for a in rot]
    scene.camera = cam
    scene.render.filepath = os.path.join(PREVIEW, f"05_seg_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  渲染", scene.render.filepath)

ob.hide_render = False

# ---------------------------------------------------------------- 落盘
seg_data = []
for (lab, root), fidx in sorted(regions.items(), key=lambda kv: -len(kv[1])):
    if len(fidx) < 40:
        continue
    pts = []
    for i in fidx:
        pts.append(bm.faces[i].calc_center_median())
    lo = [min(p[k] for p in pts) for k in range(3)]
    hi = [max(p[k] for p in pts) for k in range(3)]
    seg_data.append(
        {
            "label": lab,
            "faces": len(fidx),
            "y_pct": [round(lo[1] / H * 100, 1), round(hi[1] / H * 100, 1)],
            "x": [round(lo[0], 4), round(hi[0], 4)],
            "z": [round(lo[2], 4), round(hi[2], 4)],
        }
    )

bm.free()
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "label_face_counts": dict(cnt),
            "per_label_region_stats": per_label,
            "regions_ge_40_faces": seg_data,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print("\n报告", OUT)

print("\n最大的 30 个同标签连通片：")
for s in seg_data[:30]:
    print(
        f"  {s['label']:<10} {s['faces']:>5} 面  y {s['y_pct'][0]:>5.1f}~{s['y_pct'][1]:<5.1f}%  "
        f"x[{s['x'][0]:>7.3f},{s['x'][1]:>7.3f}] z[{s['z'][0]:>7.3f},{s['z'][1]:>7.3f}]"
    )
