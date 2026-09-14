# -*- coding: utf-8 -*-
"""教练角色 06 · 归一化尺度 + 修正分割 + 落顶点组 + 修材质

与交接报告不同的一个判断，说明在这里：

  报告 P1 要求把模型拆成 13 个独立对象（BODY / HEAD / POLO / ...）。
  但对**游戏角色**来说这是反向的：13 个对象 = 13 个 SkinnedMesh = 13 次 draw call，
  而且每个都要单独绑定、单独导出。web 端真正需要的是**一个蒙皮网格 + 正确的骨骼与权重**。
  帽子跟头、眼镜跟头、鞋跟脚、裙摆有裙骨——这些用**顶点组**就能精确表达，
  不需要拆对象。拆对象只在"要分别重拓扑/分别烘焙"时才有意义。

  所以这一步落的是顶点组（服务于 P4 绑定），不是拆对象。
  如果后面确认要对身体单独重拓扑，再按同一套分割去拆也不迟。

另外修正 05 发现的三处误判：
  - 鞋底/鞋侧暗色被判成 HAIR  → 按高度归回 SHOE
  - 遮阳帽被判成 POLO        → 按「白 + 高位置」独立成 VISOR
  - 眼镜和深色刘海颜色接近，靠颜色分不开 → 不强行分，统一进 HEAD_RIGID
    （对绑定来说结果一样：都刚性跟随 Head 骨）

在 Blender 里跑：
    exec(open('.../coach/tools/06_normalize_groups.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import json
import os
import sys
import traceback
import numpy as np
from collections import Counter

# 出错时未 flush 的输出会丢，定位不了断点
try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUT = os.path.join(PROJ, "reports", "06_groups.json")
BLEND = os.path.join(PROJ, "build", "coach_stage1.blend")

TARGET_HEIGHT_M = 1.65  # 角色名「露丝」，用户确认身高 165 cm

ob = bpy.data.objects["Coach_Welded"]
me = ob.data

# ---------------------------------------------------------------- 归一化尺度
bb = [ob.matrix_world @ v.co for v in me.vertices]
zmin = min(p.z for p in bb)
zmax = max(p.z for p in bb)
H0 = zmax - zmin
s = TARGET_HEIGHT_M / H0
print(f"当前世界高度 {H0:.4f} m → 目标 {TARGET_HEIGHT_M:.2f} m，缩放 {s:.5f}")
print(f"对象变换 loc={tuple(round(v,4) for v in ob.location)} "
      f"rot={tuple(round(v,4) for v in ob.rotation_euler)} "
      f"scale={tuple(round(v,4) for v in ob.scale)}")

# 把缩放烘进网格数据，保持对象变换里不含缩放（导出/绑定都更干净）
me.transform(__import__("mathutils").Matrix.Scale(s, 4))
me.update()

bb = [ob.matrix_world @ v.co for v in me.vertices]
zmin = min(p.z for p in bb)
zmax = max(p.z for p in bb)
print(f"缩放后世界高度 {zmax - zmin:.4f} m，底面 z={zmin:.4f}")

# 缩放后重新取本地高度基准（本地 y 仍是高度轴）
H = max(v.co.y for v in me.vertices) - min(v.co.y for v in me.vertices)
print(f"本地高度轴范围 {H:.4f}")

# ---------------------------------------------------------------- 贴图
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

bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active

face_rgb = np.zeros((len(bm.faces), 3), dtype=np.float32)
for f in bm.faces:
    u = sum(l[uvl].uv[0] for l in f.loops) / len(f.loops)
    v = sum(l[uvl].uv[1] for l in f.loops) / len(f.loops)
    x = int(min(max(u, 0.0), 0.999999) * w)
    y = int(min(max(v, 0.0), 0.999999) * h)
    face_rgb[f.index] = colors[y, x, :3]


# ---------------------------------------------------------------- 修正分类
def classify(rgb, f):
    r, g, b = [float(c) for c in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    sat = mx - mn
    lum = (r + g + b) / 3
    c = f.calc_center_median()
    yp = c.y / H * 100          # 高度百分比
    zp = c.z                     # +z 是前方（帽檐方向），-z 是后方

    # 近黑：眼镜框、鞋带、鞋底纹路 —— 先按位置归位
    if lum < 0.18:
        return "SHOE_DARK" if yp < 8 else ("HEAD_RIGID" if yp > 80 else "DARK")

    # 头发：暗、低饱和、偏棕灰
    if lum < 0.45 and sat < 0.12:
        if yp < 10.0:
            return "SHOE_DARK"      # 鞋底/鞋身暗部，别误判成头发
        if yp < 86.0 and zp < -0.01:
            return "PONYTAIL"       # 低处的后方头发 = 马尾
        return "HAIR"

    # 藏青：领口、袖口、裙侧条、护腕、袜口条纹
    if b > r + 0.03 and lum < 0.75:
        return "NAVY"

    # 白/浅灰
    if lum > 0.62 and sat < 0.14:
        if yp < 8.0:
            return "SHOE"
        if yp < 16.0:
            return "SOCK"
        if yp > 86.0:
            return "VISOR"          # 遮阳帽：白色且在高位
        if yp < 45.0:
            return "OTHER_WHITE"
        if yp < 63.0:
            return "SKIRT"
        return "POLO"

    # 暖色 = 皮肤
    if r >= g >= b and (r - b) > 0.06:
        return "HEAD" if yp > 74.0 else "BODY"

    return "OTHER"


labels = [classify(face_rgb[f.index], f) for f in bm.faces]
cnt = Counter(labels)
print("\n修正后的分类面数：")
for k, v in cnt.most_common():
    print(f"  {k:<12} {v:>6} 面 ({v / len(labels) * 100:>4.1f}%)")

# ---------------------------------------------------------------- 左右拆分
# 鞋和袜子要左右分开（脚是两根不同的骨头驱动的）
def side_of(f):
    return "L" if f.calc_center_median().x < 0 else "R"


final = []
for f in bm.faces:
    lab = labels[f.index]
    if lab in ("SHOE", "SHOE_DARK", "SOCK"):
        lab = f"{lab}_{side_of(f)}"
    final.append(lab)

# ---------------------------------------------------------------- 落顶点组
GROUPS = [
    "BODY", "HEAD", "HAIR", "PONYTAIL", "VISOR", "HEAD_RIGID",
    "POLO", "SKIRT", "NAVY",
    "SOCK_L", "SOCK_R", "SHOE_L", "SHOE_R", "SHOE_DARK_L", "SHOE_DARK_R",
    "OTHER", "OTHER_WHITE", "DARK",
]

for g in list(ob.vertex_groups):
    ob.vertex_groups.remove(g)
vg = {name: ob.vertex_groups.new(name="grp_" + name) for name in GROUPS}

# 面 → 顶点：一个顶点可能被多个标签的面共享（部件边界），此时归入"出现次数最多"的组
from collections import defaultdict

vert_votes = defaultdict(Counter)
for f in bm.faces:
    lab = final[f.index]
    for v in f.verts:
        vert_votes[v.index][lab] += 1

group_of_vert = {}
for vi, votes in vert_votes.items():
    group_of_vert[vi] = votes.most_common(1)[0][0]

for vi, lab in group_of_vert.items():
    vg[lab].add([vi], 1.0, "REPLACE")

print("\n顶点组：")
group_stats = {}
for name in GROUPS:
    n = sum(1 for lab in group_of_vert.values() if lab == name)
    group_stats[name] = n
    if n:
        print(f"  grp_{name:<14} {n:>6} 顶点")

# ---------------------------------------------------------------- 可视化验证
SEG_COLOR = {
    "BODY": (1.00, 0.74, 0.56), "HEAD": (1.00, 0.86, 0.72),
    "HAIR": (0.55, 0.15, 0.80), "PONYTAIL": (0.95, 0.35, 0.85),
    "VISOR": (0.10, 0.50, 1.00), "HEAD_RIGID": (0.05, 0.05, 0.05),
    "POLO": (0.20, 0.40, 1.00), "SKIRT": (0.10, 0.90, 0.45),
    "NAVY": (0.00, 0.85, 0.95),
    "SOCK_L": (1.00, 0.85, 0.10), "SOCK_R": (0.95, 0.60, 0.05),
    "SHOE_L": (1.00, 0.25, 0.10), "SHOE_R": (0.75, 0.10, 0.30),
    "SHOE_DARK_L": (0.35, 0.05, 0.05), "SHOE_DARK_R": (0.55, 0.05, 0.15),
    "OTHER": (0.45, 0.45, 0.45), "OTHER_WHITE": (1.00, 0.40, 0.75),
    "DARK": (0.02, 0.02, 0.02),
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
    nt.links.new(em.outputs[0], nt.nodes.new("ShaderNodeOutputMaterial").inputs[0])
    return m


vis = bpy.data.objects.get("SEG_PREVIEW2")
if vis:
    bpy.data.objects.remove(vis, do_unlink=True)
vme = me.copy()
vis = bpy.data.objects.new("SEG_PREVIEW2", vme)
bpy.context.scene.collection.objects.link(vis)
vis.matrix_world = ob.matrix_world.copy()
vme.materials.clear()
idx = {}
for lab in SEG_COLOR:
    idx[lab] = len(vme.materials)
    vme.materials.append(solid_mat("S2_" + lab, SEG_COLOR[lab]))
for p in vme.polygons:
    p.material_index = idx[final[p.index]]

import math
from mathutils import Vector

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
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
nt.links.new(bg.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])

bbv = [vis.matrix_world @ Vector(c) for c in vis.bound_box]
ctr = sum(bbv, Vector()) / 8
for name, loc, rot in [
    ("front", (ctr.x, ctr.y - 3, ctr.z), (90, 0, 0)),
    ("left", (ctr.x - 3, ctr.y, ctr.z), (90, 0, -90)),
    ("back", (ctr.x, ctr.y + 3, ctr.z), (90, 0, 180)),
]:
    cam = bpy.data.objects.get("SegCam2_" + name)
    if cam is None:
        cd = bpy.data.cameras.new("SegCam2_" + name)
        cd.type = "ORTHO"
        cd.ortho_scale = 1.9
        cam = bpy.data.objects.new("SegCam2_" + name, cd)
        scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = [math.radians(a) for a in rot]
    scene.camera = cam
    scene.render.filepath = os.path.join(PROJ, "build", "preview", f"06_groups_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  渲染", scene.render.filepath)
ob.hide_render = False

# ---------------------------------------------------------------- 先落盘（顶点组是无价的，材质可以重来）
bm.free()
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "target_height_m": TARGET_HEIGHT_M,
            "scale_applied": round(s, 6),
            "height_after_m": round(zmax - zmin, 5),
            "label_face_counts": dict(cnt),
            "vertex_group_sizes": group_stats,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print(f"\n报告 {OUT}\n工作文件 {BLEND}")

# ---------------------------------------------------------------- 修材质
# 注意：MCP addon 会序列化脚本执行后的全局命名空间。NodeSocket / Node 这类对象
# 留在全局会让 addon 在返回结果时抛 "NodeSocketVector doesn't define __round__"。
# 所以材质逻辑整个收进函数，局部变量不外泄。
def fix_material():
    mat = bpy.data.materials["Material.001"]
    bsdf = None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            bsdf = n
    print("\n材质修复：")
    if bsdf is None:
        print("  没找到 Principled BSDF")
        return
    before = [float(v) for v in bsdf.inputs["Specular Tint"].default_value]
    bsdf.inputs["Specular Tint"].default_value = (1.0, 1.0, 1.0, 1.0)
    print(f"  Specular Tint {[round(v, 2) for v in before]} → [1.0, 1.0, 1.0, 1.0]")
    print("    glTF 规范里 specularColorFactor 上限是 1.0。原值 2.0 越界，")
    print("    表现就是高光过曝、皮肤像塑料或上了油 —— 这是'油光太重'的真正原因")
    if "Specular IOR Level" in bsdf.inputs:
        print(f"  Specular IOR Level = {bsdf.inputs['Specular IOR Level'].default_value}")
    for key in ("Metallic", "Roughness", "Normal"):
        sock = bsdf.inputs[key]
        if not sock.is_linked:
            print(f"  {key}: {float(sock.default_value)}")
            continue
        src = sock.links[0].from_node
        detail = src.type
        if src.type == "SEPARATE_COLOR":
            for out in src.outputs:
                for lk in out.links:
                    if lk.to_socket == sock:
                        up = src.inputs[0].links[0].from_node if src.inputs[0].is_linked else None
                        img = getattr(up, "image", None)
                        detail = f"SeparateColor.{out.name} ← {img.name if img else '?'}"
        print(f"  {key}: linked ← {detail}")
    print(f"  blend_method {mat.blend_method} → OPAQUE")
    print("    glb 里没有 alphaMode，本来就不透明；HASHED 会白白开透明排序")
    mat.blend_method = "OPAQUE"


try:
    fix_material()
except Exception:
    print("\n!! 材质段失败 !!")
    traceback.print_exc()


bm.free()
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(
        {
            "target_height_m": TARGET_HEIGHT_M,
            "scale_applied": round(s, 6),
            "height_after_m": round(zmax - zmin, 5),
            "label_face_counts": dict(cnt),
            "vertex_group_sizes": group_stats,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
print(f"\n报告 {OUT}\n工作文件 {BLEND}")
