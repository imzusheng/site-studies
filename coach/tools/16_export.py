# -*- coding: utf-8 -*-
"""露丝 16 · 修材质 + 导出 GLB + 最终验收渲染

交付版：自然下垂 rest pose 的绑定角色（几何完好、权重干净、骨架可 retarget）。
A-Pose 版本不交付，原因见 coach/README.md（腋下无余量几何，掰开会拉出膜）。

在 Blender 里跑：
    exec(open('.../coach/tools/16_export.py', encoding='utf-8').read())
"""

import bpy
import math
import os

PROJ = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach"
OUTDIR = os.path.join(PROJ, "build")
PREVIEW = os.path.join(PROJ, "build", "preview")
GLB = os.path.join(OUTDIR, "ruth_bound.glb")
os.makedirs(PREVIEW, exist_ok=True)

ob = bpy.data.objects["Ruth"]
rig = bpy.data.objects["Ruth_Rig"]

# ---------------------------------------------------------------- 修材质
print("=== 材质 ===")
for slot in ob.material_slots:
    mat = slot.material
    if not mat or not mat.use_nodes:
        continue
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            before = [round(float(v), 3) for v in n.inputs["Specular Tint"].default_value]
            n.inputs["Specular Tint"].default_value = (1.0, 1.0, 1.0, 1.0)
            print(f"  [{mat.name}] Specular Tint {before} → [1,1,1]"
                  f"  （glTF 规范上限 1.0，原值 2.0 越界 → 高光过曝/发油）")
            for key in ("Metallic", "Roughness", "Normal"):
                s = n.inputs[key]
                if s.is_linked:
                    src = s.links[0].from_node
                    det = src.type
                    if src.type == "SEPARATE_COLOR":
                        for out in src.outputs:
                            for lk in out.links:
                                if lk.to_socket == s:
                                    up = src.inputs[0].links[0].from_node if src.inputs[0].is_linked else None
                                    img = getattr(up, "image", None)
                                    det = f"SeparateColor.{out.name} ← {img.name if img else '?'}"
                    print(f"    {key}: ← {det}")
                else:
                    print(f"    {key}: {float(s.default_value)}")
    print(f"  [{mat.name}] blend_method {mat.blend_method} → OPAQUE")
    mat.blend_method = "OPAQUE"

# ---------------------------------------------------------------- 导出 GLB
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig

bpy.ops.export_scene.gltf(
    filepath=GLB,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_yup=True,
    export_apply=False,          # 不能应用修改器，否则骨架绑定会被烘掉
    export_animations=False,
    export_morph=False,
    export_texcoords=True,
    export_normals=True,
    export_materials="EXPORT",
)
size = os.path.getsize(GLB)
print(f"\n导出 {GLB}  {size / 1048576:.1f} MB")

# ---------------------------------------------------------------- 验收渲染
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 700, 1000
scene.view_settings.view_transform = "Standard"

for o in [o for o in bpy.data.objects if o.type == "LIGHT"]:
    bpy.data.objects.remove(o, do_unlink=True)


def area(n, loc, rot, size_, en, col=(1, 1, 1)):
    ld = bpy.data.lights.new(n, type="AREA")
    ld.size, ld.energy, ld.color = size_, en, col
    o = bpy.data.objects.new(n, ld)
    o.location = loc
    o.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(o)


area("K", (-1.1, -1.5, 2.0), (48, 0, -35), 2.2, 320)
area("F", (1.6, -1.0, 1.0), (72, 0, 55), 3.0, 120, (0.85, 0.9, 1.0))
area("R", (0.5, 1.8, 1.7), (120, 0, 165), 2.0, 220, (1.0, 0.95, 0.88))
world = bpy.data.worlds.new("W16")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
bgn = nt.nodes.new("ShaderNodeBackground")
bgn.inputs[0].default_value = (0.05, 0.055, 0.065, 1)
bgn.inputs[1].default_value = 0.8
nt.links.new(bgn.outputs[0], nt.nodes.new("ShaderNodeOutputWorld").inputs[0])

for name, loc, rot, sc_ in [
    ("front", (0, -3.0, 0.85), (90, 0, 0), 1.85),
    ("q34", (1.8, -2.2, 1.35), (79, 0, 39), 1.85),
    ("back", (0, 3.0, 0.85), (90, 0, 180), 1.85),
]:
    cd = bpy.data.cameras.new("FinCam_" + name)
    cd.type = "ORTHO"
    cd.ortho_scale = sc_
    c = bpy.data.objects.new("FinCam_" + name, cd)
    c.location = loc
    c.rotation_euler = [math.radians(a) for a in rot]
    scene.collection.objects.link(c)
    scene.camera = c
    scene.render.filepath = os.path.join(PREVIEW, f"16_final_{name}.png")
    bpy.ops.render.render(write_still=True)
    print("  渲染", scene.render.filepath)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTDIR, "coach_bound.blend"))
print("\n完成")
