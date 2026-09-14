# -*- coding: utf-8 -*-
"""教练角色 03 · 多视角渲染（材质版 + 线稿版）

用途：
  1. 让我自己和用户都能"看到"模型，而不是只看数字；
  2. 作为后续改动的 before / after 基准。

产出 coach/build/preview/ 下的正交四视图 + 一张 3/4 透视。
线稿版用 Wireframe 修改器直接生成真实线框几何（视口叠加层是渲染不出来的）。

在 Blender 里跑：
    exec(open('.../coach/tools/03_render_views.py', encoding='utf-8').read())
"""

import bpy
import math
import os
from mathutils import Vector

OUTDIR = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach/build/preview"
os.makedirs(OUTDIR, exist_ok=True)

TAG = os.environ.get("COACH_TAG", "00_original")
RES = (700, 1000)
SAMPLES = 24

scene = bpy.context.scene
ob = bpy.data.objects["node_0"]

# ------------------------------------------------------------ 可用引擎
engines = [
    e.identifier
    for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items
]
print("可用渲染引擎:", engines)


def pick_engine():
    for want in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        if want in engines:
            return want
    return "BLENDER_WORKBENCH"


scene.render.engine = pick_engine()
print("使用引擎:", scene.render.engine)
if hasattr(scene, "eevee"):
    scene.eevee.taa_render_samples = SAMPLES
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "Standard"  # 先关掉 Filmic/AgX，避免好看掩盖问题


# ------------------------------------------------------------ 世界
def set_world(color, strength=1.0):
    world = bpy.data.worlds.get("CoachWorld") or bpy.data.worlds.new("CoachWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs[0].default_value = (*color, 1.0)
    bg.inputs[1].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs[0])


# ------------------------------------------------------------ 灯光
def clear_lights():
    for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
        bpy.data.objects.remove(o, do_unlink=True)


def add_area(name, loc, rot_deg, size, energy, color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, type="AREA")
    ld.size = size
    ld.energy = energy
    ld.color = color
    o = bpy.data.objects.new(name, ld)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot_deg]
    scene.collection.objects.link(o)
    return o


# ------------------------------------------------------------ 相机
def make_cam(name, loc, rot_deg, ortho=True, ortho_scale=1.35, lens=60):
    cd = bpy.data.cameras.new(name)
    cd.type = "ORTHO" if ortho else "PERSP"
    cd.ortho_scale = ortho_scale
    cd.lens = lens
    o = bpy.data.objects.new(name, cd)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot_deg]
    scene.collection.objects.link(o)
    return o


# 模型世界包围盒 → 取中心
bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
lo = Vector((min(p.x for p in bb), min(p.y for p in bb), min(p.z for p in bb)))
hi = Vector((max(p.x for p in bb), max(p.y for p in bb), max(p.z for p in bb)))
center = (lo + hi) / 2
print(f"世界包围盒 lo={tuple(round(v,3) for v in lo)} hi={tuple(round(v,3) for v in hi)}")
print(f"尺寸 = {tuple(round(v,3) for v in (hi-lo))}")

R = 3.0
views = [
    ("front", (center.x, center.y - R, center.z), (90, 0, 0), True),
    ("back", (center.x, center.y + R, center.z), (90, 0, 180), True),
    ("right", (center.x + R, center.y, center.z), (90, 0, 90), True),
    ("left", (center.x - R, center.y, center.z), (90, 0, -90), True),
    (
        "hero34",
        (center.x + R * 0.62, center.y - R * 0.72, center.z + 0.30),
        (80, 0, 41),
        False,
    ),
]

# ------------------------------------------------------------ 材质版
clear_lights()
set_world((0.05, 0.055, 0.065), 0.55)
add_area("Key", (-1.1, -1.5, 2.0), (48, 0, -35), 2.2, 320)
add_area("Fill", (1.6, -1.0, 1.0), (72, 0, 55), 3.0, 110, (0.85, 0.9, 1.0))
add_area("Rim", (0.5, 1.8, 1.7), (120, 0, 165), 2.0, 220, (1.0, 0.95, 0.88))

cam_mat = {}
for name, loc, rot, ortho in views:
    cam_mat[name] = make_cam("CamMat_" + name, loc, rot, ortho, 1.32)

print("\n--- 材质版渲染 ---")
for name, *_ in views:
    scene.camera = cam_mat[name]
    scene.render.filepath = os.path.join(OUTDIR, f"{TAG}_mat_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  ", scene.render.filepath)

# ------------------------------------------------------------ 线稿版
# 用 Wireframe 修改器生成真实线框几何：视口的 wireframe 叠加层不会出现在渲染里
wire_src = ob.copy()
wire_src.data = ob.data.copy()
scene.collection.objects.link(wire_src)
wire_src.name = "WIREFRAME_PREVIEW"

wire_mat = bpy.data.materials.new("WireMat")
wire_mat.use_nodes = True
wnt = wire_mat.node_tree
wnt.nodes.clear()
fem = wnt.nodes.new("ShaderNodeEmission")
fem.inputs[0].default_value = (0.05, 0.05, 0.06, 1)
fem.inputs[1].default_value = 1.0
wout = wnt.nodes.new("ShaderNodeOutputMaterial")
wnt.links.new(fem.outputs[0], wout.inputs[0])

wire_src.data.materials.clear()
wire_src.data.materials.append(wire_mat)
for p in wire_src.data.polygons:
    p.material_index = 0

wf = wire_src.modifiers.new("Wireframe", "WIREFRAME")
wf.thickness = 0.0016
wf.use_replace = True
wf.use_even_offset = True

ob.hide_render = True
clear_lights()
set_world((1.0, 1.0, 1.0), 1.0)

print("\n--- 线稿版渲染 ---")
for name in ("front", "back", "right", "left"):
    scene.camera = cam_mat[name]
    scene.render.filepath = os.path.join(OUTDIR, f"{TAG}_wire_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  ", scene.render.filepath)

# ------------------------------------------------------------ 还原
ob.hide_render = False
bpy.data.objects.remove(wire_src, do_unlink=True)

print("\n完成。输出目录:", OUTDIR)
