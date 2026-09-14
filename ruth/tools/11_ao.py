"""烘焙 AO 贴图。

源资产没有 AO（glTF 里没有 occlusionTexture）。AO 对卡通风格角色在引擎里的
立体感影响明显，所以这里从几何补烘一张。

用 Cycles 的 bake type='AO'。分辨率默认 1024、采样 16——先保证能在一次
MCP 调用里跑完；2K 与更高采样可以由环境变量放开。

运行：RUTH_NO_OPEN=1 runpy.run_path("11_ao.py")   # 在已绑定场景里直接烘
"""

import json
import os
import sys
import time
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
BUILD = ROOT / "build"
TEXDIR = ROOT / "textures"
REPORTS = ROOT / "reports"


def main():
    size = int(os.environ.get("RUTH_AO_SIZE", "1024"))
    samples = int(os.environ.get("RUTH_AO_SAMPLES", "16"))

    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(BUILD / "step3_weighted.blend"))
    ob = next((o for o in bpy.data.objects if o.type == "MESH"), None)
    if ob is None:
        raise RuntimeError("找不到网格对象")
    me = ob.data
    if not me.uv_layers:
        raise RuntimeError("网格没有 UV，无法烘焙")

    mesh_obs = [o for o in bpy.data.objects if o.type == "MESH"]
    print(f"网格 {ob.name}  {len(me.vertices)} 顶点  "
          f"UV 层 {[l.name for l in me.uv_layers]}")

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = True

    # AO 射线距离。Cycles 的 AO bake 用 world.light_settings.distance，
    # 默认 10 m——对 1.65 m 的角色太远，会把远处几何也算进遮蔽，整体压暗
    # （实测均值仅 0.495、36% 像素接近全黑）。0.25 m 接近真实环境光遮蔽的
    # 尺度，只反映腋下、裙褶这类局部凹陷。
    ao_dist = float(os.environ.get("RUTH_AO_DIST", "0.25"))
    world = bpy.data.worlds.get("RuthAO") or bpy.data.worlds.new("RuthAO")
    world.use_nodes = True
    scene.world = world
    world.light_settings.distance = ao_dist
    print(f"AO 射线距离 {ao_dist} m")

    mat = None
    for slot in ob.material_slots:
        if slot.material:
            mat = slot.material
            break
    if mat is None or not mat.use_nodes:
        raise RuntimeError("材质不可用")

    img = bpy.data.images.new("Ruth_AO", size, size, alpha=False,
                              float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    node.name = "AO_Bake_Target"
    node.location = (-900, -500)
    mat.node_tree.nodes.active = node
    for n in mat.node_tree.nodes:
        n.select = (n == node)
    print(f"烘焙目标 {size}×{size}，采样 {samples}")

    # 只选网格本身：导出器/烘焙对选中集敏感
    for o in bpy.data.objects:
        o.select_set(o is ob)
    bpy.context.view_layer.objects.active = ob

    t0 = time.time()
    bpy.ops.object.bake(type="AO")
    dt = time.time() - t0
    print(f"烘焙完成，用时 {dt:.1f}s")

    TEXDIR.mkdir(parents=True, exist_ok=True)
    out = TEXDIR / "AO.png"
    img.filepath_raw = str(out)
    img.file_format = "PNG"
    img.save()
    img.pack()
    print(f"[写出] {out}  {out.stat().st_size/1e3:.0f} KB")

    REPORTS.mkdir(parents=True, exist_ok=True)
    rep = {"size": [img.size[0], img.size[1]], "samples": samples,
           "seconds": round(dt, 1), "file": out.name,
           "bytes": out.stat().st_size,
           "note": "从几何烘焙（源无 occlusionTexture）"}
    (REPORTS / "11_ao.json").write_text(
        json.dumps(rep, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / '11_ao.json'}")
    return rep


if __name__ == "__main__":
    main()
