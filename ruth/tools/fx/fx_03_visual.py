"""修复后的视觉 QA：7 个时间标记 × front/side/back/q34 四视图。

用法：
  blender -b build/step7_rollfix.blend -P tools/fx/fx_03_visual.py
环境变量：
  FX_MARKS=ready,contact   只渲这些标记
  FX_VIEWS=q34             只渲这些机位
  FX_RES=400x620           单格分辨率
"""
import json
import math
import os
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BUILD = ROOT / "build"
PREVIEW = ROOT / "preview" / "forehand"
TMP = Path("/tmp")

MARKS = [("ready", 0), ("unit_turn", 110), ("backswing", 147),
         ("acceleration", 151), ("contact", 164), ("follow_through", 187),
         ("recovery", 232)]
# 诊断用：FX_EXTRA_FRAMES=155,60 会把任意帧号加进渲染列表
for _fr in (os.environ.get("FX_EXTRA_FRAMES") or "").split(","):
    if _fr.strip().isdigit():
        MARKS.append((f"f{_fr.strip()}", int(_fr.strip())))
VIEWS = ["front", "side", "back", "q34"]
RES = os.environ.get("FX_RES", "400x620")
TARGET_Z = float(os.environ.get("FX_TARGET_Z", "0.92"))
DIST_M = float(os.environ.get("FX_DIST", "3.6"))
SUBDIR = os.environ.get("FX_SUBDIR", "fixed")
SAMPLES = int(os.environ.get("FX_SAMPLES", "32"))

scene = bpy.context.scene
ob = next(o for o in bpy.data.objects
          if o.type == "MESH" and o.name.startswith("Ruth"))
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")

# ---- 朝向：脚骨 Y 轴的水平分量
fwd = None
for cand in ("Foot.L", "Foot.R", "Toe.L"):
    b = rig.data.bones.get(cand)
    if b is not None:
        d = (rig.matrix_world @ b.matrix_local).to_3x3() @ Vector((0, 1, 0))
        fwd = Vector((d.x, d.y, 0.0))
        break
if fwd is None or fwd.length < 1e-6:
    fwd = Vector((0.0, -1.0, 0.0))
fwd.normalize()
right = Vector((fwd.y, -fwd.x, 0.0))

TARGET = Vector((0.0, 0.0, TARGET_Z))
DIST = DIST_M
TILT = Vector((0.0, 0.0, 0.25))
AZ = {"front": 0.0, "q34": 35.0, "side": 90.0, "back": 180.0}

cam_data = bpy.data.cameras.new("FX_ValCam")
cam_data.lens = 50.0
cam_data.sensor_width = 36.0
cam_data.sensor_fit = "VERTICAL"
cam = bpy.data.objects.new("FX_ValCam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def place_camera(view):
    az = math.radians(AZ[view])
    cdir = (fwd * math.cos(az) + right * math.sin(az)).normalized()
    cam.location = TARGET + cdir * DIST + TILT
    cam.rotation_euler = (TARGET - cam.location).to_track_quat(
        "-Z", "Y").to_euler()
    return cdir


def add_area(name, loc, energy, size):
    ld = bpy.data.lights.new(name, type="AREA")
    ld.energy = energy
    ld.size = size
    o = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (TARGET - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return o


cdir = place_camera("q34")
add_area("FX_K", TARGET + cdir * 2.0 + Vector((-1.6, 0.0, 1.8)), 220.0, 2.5)
add_area("FX_F", TARGET + cdir * 1.5 + Vector((2.2, 0.0, 0.6)), 90.0, 3.0)
add_area("FX_R", TARGET - fwd * 2.2 + Vector((0.0, 0.0, 1.6)), 130.0, 2.0)
world = scene.world or bpy.data.worlds.new("FXW")
scene.world = world
world.use_nodes = True
bg = next((n for n in world.node_tree.nodes
           if n.bl_idname == "ShaderNodeBackground"), None)
if bg:
    bg.inputs[0].default_value = (0.18, 0.19, 0.21, 1.0)
    bg.inputs[1].default_value = 0.4

w, h = (int(x) for x in RES.split("x"))
scene.render.resolution_x, scene.render.resolution_y = w, h
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.engine = "BLENDER_EEVEE"
try:
    scene.eevee.taa_render_samples = SAMPLES
except Exception:
    pass

marks = os.environ.get("FX_MARKS")
todo = [(m, f) for m, f in MARKS
        if (not marks or m in marks.split(","))]
views = [v for v in VIEWS if v in (os.environ.get("FX_VIEWS") or ",".join(VIEWS)).split(",")]

OUT = PREVIEW / SUBDIR
OUT.mkdir(parents=True, exist_ok=True)
print(f"机位朝向 fwd={tuple(round(v,3) for v in fwd)}  渲染 "
      f"{len(todo)} 标记 × {len(views)} 视图 @ {RES}")
for mark, fr in todo:
    scene.frame_set(fr)
    for view in views:
        place_camera(view)
        scene.render.filepath = str(OUT / f"fix_{mark}_{view}.png")
        bpy.ops.render.render(write_still=True)
    print(f"  [{mark}] frame {fr} 完成 {len(views)} 视图")


(TMP / "fx_visual.json").write_text(json.dumps(
    {"marks": [m for m, _ in todo], "views": views, "res": [w, h],
     "out_dir": str(OUT.relative_to(ROOT)),
     "facing": [round(v, 4) for v in fwd]}, ensure_ascii=False, indent=2))
