"""预览渲染：从源导入并归一后渲染一批视图。

与测量脚本分离的原因：
  1. 一次 MCP 调用里跑十几张 Cycles 图会超过通道超时，渲染一崩前面测量全白做。
  2. Workbench 秒出图，几何检查（融合/间隙/朝向）用它足够；
     材质质量才需要 Cycles。

环境变量：
  RUTH_SET     turnaround | closeup | diag   视图集合（默认 turnaround）
  RUTH_ENGINE  workbench | cycles            默认 workbench
  RUTH_HEIGHT  目标身高（米），不给则保持源尺度
  RUTH_ONLY    逗号分隔的视图名，只渲这几个
  RUTH_TAG     输出文件名前缀（默认 source）
  RUTH_SAMPLES cycles 采样数
"""

import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lib_render as R      # noqa: E402
import lib_source as S      # noqa: E402

ROOT = HERE.parent
PREV = ROOT / "preview"

# 视图定义：(名称, 相对身高的中心点, 取景尺寸, 相机方向, margin)
# 方向是"从被摄体指向相机"的单位向量。角色面向 -Y。
FULL = 1.0
SETS = {
    "turnaround": [
        ("front", (0, 0, 0.5), FULL, (0, -1, 0), 1.10),
        ("side", (0, 0, 0.5), FULL, (1, 0, 0), 1.10),
        ("back", (0, 0, 0.5), FULL, (0, 1, 0), 1.10),
        ("q34", (0, 0, 0.5), FULL, (0.70, -0.72, 0.08), 1.10),
    ],
    # 特写：尺寸是相对身高的比例，中心点也是相对身高的比例
    "closeup": [
        ("cu_head", (0, 0, 0.905), 0.26, (0.20, -1, 0.10), 1.05),
        ("cu_head_side", (0, 0, 0.905), 0.26, (1, 0, 0.05), 1.05),
        ("cu_hand_R", (-0.225, -0.01, 0.505), 0.20, (-0.45, -1, 0.10), 1.05),
        ("cu_hand_L", (0.225, -0.01, 0.505), 0.20, (0.45, -1, 0.10), 1.05),
        ("cu_armpit_R", (-0.135, 0, 0.72), 0.28, (-0.60, -1, 0.08), 1.05),
        ("cu_armpit_L", (0.135, 0, 0.72), 0.28, (0.60, -1, 0.08), 1.05),
        ("cu_skirt", (0, 0, 0.53), 0.40, (0.10, -1, 0.04), 1.05),
        ("cu_feet", (0, -0.02, 0.055), 0.30, (0.28, -1, 0.22), 1.05),
        ("cu_hip_back", (0, 0, 0.55), 0.40, (-0.3, 1, 0.06), 1.05),
    ],
    "diag": [
        ("d_negY", (0, 0, 0.5), FULL, (0, -1, 0), 1.06),
        ("d_posY", (0, 0, 0.5), FULL, (0, 1, 0), 1.06),
        ("d_negX", (0, 0, 0.5), FULL, (-1, 0, 0), 1.06),
        ("d_posX", (0, 0, 0.5), FULL, (1, 0, 0), 1.06),
    ],
}


def setup_engine(engine, samples):
    scene = bpy.context.scene
    if engine == "cycles":
        R.ensure_scene(res_x=900, res_y=1500, samples=samples, engine="CYCLES")
        R.ensure_world()
    else:
        scene.render.engine = "BLENDER_WORKBENCH"
        sh = scene.display.shading
        sh.light = "STUDIO"
        sh.color_type = "TEXTURE"
        sh.show_cavity = True
        sh.cavity_type = "BOTH"
        sh.curvature_ridge_factor = 1.0
        sh.curvature_valley_factor = 1.0
        sh.background_type = "VIEWPORT"
        sh.background_color = (0.20, 0.21, 0.23)
        scene.render.resolution_x = 820
        scene.render.resolution_y = 1360
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"


def main():
    set_name = os.environ.get("RUTH_SET", "turnaround")
    engine = os.environ.get("RUTH_ENGINE", "workbench")
    height = os.environ.get("RUTH_HEIGHT")
    tag = os.environ.get("RUTH_TAG", "source")
    samples = int(os.environ.get("RUTH_SAMPLES", "40"))
    only = [s for s in os.environ.get("RUTH_ONLY", "").split(",") if s]

    views = SETS[set_name]
    if only:
        views = [v for v in views if v[0] in only]
    if not views:
        print(f"没有匹配的视图：set={set_name} only={only}")
        return

    info = S.load_normalized(target_height=float(height) if height else None)
    H = info["height"]
    print(f"归一后身高 {H:.4f} m  缩放系数 {info['scale_applied']:.6f}  "
          f"翻转 {info['flipped_180']}")
    setup_engine(engine, samples)

    if engine == "cycles":
        center_all = (0.0, 0.0, H / 2)
        R.ensure_lights(target=center_all, scale=H)
    cam = R.get_camera()

    for name, c, size, d, margin in views:
        center = (c[0] * H, c[1] * H, c[2] * H)
        extent = size * H
        R.frame_object(cam, center, extent, d, margin=margin, ortho=True)
        R.render_to(PREV / f"{tag}_{name}.png", tag=f"{set_name}/{engine}")


if __name__ == "__main__":
    main()
