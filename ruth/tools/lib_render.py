"""渲染与场景搭建共享模块。

被 tools/ 下各脚本 import。不依赖该模块被 MCP 直接执行。

设计要点：
- 灯光是"产品级"三点光 + 纯色世界，保证不同脚本渲出来的图可以直接对比。
- 相机用固定 50mm 透视，按被摄体 bbox 自动取景，避免每次都手调。
- 提供正交相机选项，用于需要"无透视畸变"的测量型预览。
"""

import math
from pathlib import Path

import bpy
from mathutils import Vector


def ensure_scene(res_x=900, res_y=1500, samples=48, engine="CYCLES"):
    """清掉默认物体并配置渲染参数。返回 scene。"""
    for ob in list(bpy.data.objects):
        if ob.name in {"Cube", "Camera", "Light"}:
            bpy.data.objects.remove(ob, do_unlink=True)

    scene = bpy.context.scene
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False

    if engine == "CYCLES":
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 6
    else:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    return scene


def ensure_world(strength=0.35, color=(0.16, 0.17, 0.19)):
    """纯色世界背景。角色检查用中灰，避免纯黑导致边缘看不清。

    按节点 bl_idname 查找而不是按名字（"Background" 这个名字在不同 Blender
    版本/不同创建路径下不保证存在，用 get("Background") 会拿到 None）。
    """
    world = bpy.data.worlds.get("RuthWorld")
    if world is None:
        world = bpy.data.worlds.new("RuthWorld")
    world.use_nodes = True
    nt = world.node_tree
    if nt is None:
        raise RuntimeError("world 没有节点树")
    bg = next((n for n in nt.nodes
               if n.bl_idname == "ShaderNodeBackground"), None)
    if bg is None:
        bg = nt.nodes.new("ShaderNodeBackground")
        out = next((n for n in nt.nodes
                    if n.bl_idname == "ShaderNodeOutputWorld"), None)
        if out is None:
            out = nt.nodes.new("ShaderNodeOutputWorld")
        nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    bg.inputs["Color"].default_value = (*color, 1.0)
    bg.inputs["Strength"].default_value = strength
    bpy.context.scene.world = world
    return world


def ensure_lights(target=(0.0, 0.0, 0.9), scale=1.0):
    """三点光。scale 用于超出被摄体尺寸后同步放大灯光距离与功率。"""
    t = Vector(target)
    specs = [
        ("Key", (2.6, -3.0, 2.9), 420.0, 2.2),
        ("Fill", (-3.2, -1.6, 1.4), 130.0, 2.6),
        ("Rim", (0.4, 3.4, 2.6), 260.0, 2.0),
    ]
    made = []
    for name, pos, power, size in specs:
        lamp = bpy.data.lights.get(f"Ruth_{name}") or bpy.data.lights.new(
            f"Ruth_{name}", type="AREA")
        lamp.shape = "DISK"
        lamp.size = size * scale
        lamp.energy = power * scale * scale
        ob = bpy.data.objects.get(f"Ruth_{name}")
        if ob is None:
            ob = bpy.data.objects.new(f"Ruth_{name}", lamp)
            bpy.context.collection.objects.link(ob)
        ob.data = lamp
        ob.location = t + Vector(pos) * scale
        # 灯朝向目标
        d = t - ob.location
        ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        made.append(ob)
    return made


def get_camera():
    cam = bpy.data.cameras.get("RuthCam") or bpy.data.cameras.new("RuthCam")
    cam.lens = 50.0
    ob = bpy.data.objects.get("RuthCam")
    if ob is None:
        ob = bpy.data.objects.new("RuthCam", cam)
        bpy.context.collection.objects.link(ob)
    ob.data = cam
    bpy.context.scene.camera = ob
    return ob


def frame_object(cam_ob, center, size, direction, margin=1.18, ortho=False):
    """把相机放到 direction 方向、看向 center，取景包围 size。

    direction 是从被摄体中心指向相机的单位向量。
    size 是需要在画面里容纳的最大尺寸（米）。
    """
    d = Vector(direction).normalized()
    cam = cam_ob.data
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = size * margin
        dist = max(size * 3.0, 3.0)
    else:
        cam.type = "PERSP"
        # 竖构图时纵向 FOV 由 sensor 与 aspect 决定
        aspect = (bpy.context.scene.render.resolution_y
                  / bpy.context.scene.render.resolution_x)
        sensor = cam.sensor_width
        half_v = math.atan(sensor * 0.5 * aspect / cam.lens)
        dist = (size * margin * 0.5) / math.tan(half_v)
    cam_ob.location = Vector(center) + d * dist
    cam_ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return cam_ob


def render_to(path, tag=""):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(p)
    bpy.ops.render.render(write_still=True)
    print(f"[渲染] {p}" + (f"  ({tag})" if tag else ""))
    return p


# 4 个标准机位的方向向量（单位：从被摄体指向相机）
VIEW_DIRS = {
    "front": (0.0, -1.0, 0.0),
    "back": (0.0, 1.0, 0.0),
    "side": (1.0, 0.0, 0.0),
    "side_l": (-1.0, 0.0, 0.0),
    "q34": (0.72, -0.70, 0.10),
    "q34_back": (-0.72, 0.70, 0.10),
}
