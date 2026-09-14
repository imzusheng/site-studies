"""Stage A-诊断：blend 内部到底哪一层把网格撕开了。

  1. REST 姿态渲染 vs 第 0 帧渲染（同一机位）
  2. 逐骨 pose 相对 rest 的旋转角 / 平移量（找出乱飞的骨骼）
  3. 最差拉伸边两端顶点的完整权重 + 骨骼矩阵，说明"这个三角为什么被拉过去"

用法：blender -b ruth_forehand_v1.blend -P xf_02_diagnose_blend.py
"""
import json
import os
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
RUTH = REPO / "ruth"
OUT = RUTH / "validation" / "blender"
TMP = Path("/tmp")
RES = os.environ.get("XF_RES", "600x1000")

scene = bpy.context.scene
ob = bpy.data.objects["Ruth"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data

# ------------------------------------------------------------------ 相机/灯
fwd = Vector((0.0, -1.0, 0.0))
az = np.deg2rad(35.0)
right = Vector((fwd.y, -fwd.x, 0.0))
cam_dir = (fwd * np.cos(az) + right * np.sin(az)).normalized()
target = Vector((0.0, 0.0, 0.92))
cam_data = bpy.data.cameras.new("XF_ValCam")
cam_data.lens = 50.0
cam_data.sensor_width = 36.0
cam_data.sensor_fit = "VERTICAL"
cam = bpy.data.objects.new("XF_ValCam", cam_data)
scene.collection.objects.link(cam)
cam.location = target + cam_dir * 3.6 + Vector((0.0, 0.0, 0.25))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam


def add_area(name, loc, energy, size):
    ld = bpy.data.lights.new(name, type="AREA")
    ld.energy = energy
    ld.size = size
    o = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (target - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


add_area("K", target + cam_dir * 2.0 + Vector((-1.6, 0.0, 1.8)), 220.0, 2.5)
add_area("F", target + cam_dir * 1.5 + Vector((2.2, 0.0, 0.6)), 90.0, 3.0)
add_area("R", target - fwd * 2.2 + Vector((0.0, 0.0, 1.6)), 130.0, 2.0)
world = scene.world or bpy.data.worlds.new("W")
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
    scene.eevee.taa_render_samples = 32
except Exception:
    pass


def render(name):
    scene.render.filepath = str(OUT / name)
    bpy.ops.render.render(write_still=True)
    print(f"  → {name}")


# ------------------------------------------------------- 1. REST vs frame 0
print("\n=== 1. REST 姿态渲染 ===")
rig.data.pose_position = "REST"
scene.frame_set(0)
bpy.context.view_layer.update()
render("diag_rest.png")

print("=== 2. 第 0 帧渲染（POSED）===")
rig.data.pose_position = "POSE"
scene.frame_set(0)
bpy.context.view_layer.update()
render("ready.png")

# ------------------------------------------------- 3. 逐骨 pose 相对 rest
print("\n=== 3. 逐骨 pose 相对 rest 的偏差（第 0 帧）===")
rows = []
for pb in rig.pose.bones:
    rest_m = pb.bone.matrix_local
    rel = rest_m.inverted() @ pb.matrix
    rot = rel.to_quaternion().angle
    trans = rel.translation.length
    rows.append({
        "bone": pb.name,
        "rot_deg": round(float(np.rad2deg(rot)), 3),
        "trans_mm": round(float(trans) * 1000, 3),
        "pose_head_mm": [round(v * 1000, 2) for v in pb.matrix.translation],
        "rest_head_mm": [round(v * 1000, 2) for v in rest_m.translation],
    })
rows.sort(key=lambda r: -r["trans_mm"])
print("  平移最大的 15 根骨骼：")
for r in rows[:15]:
    print(f"    {r['bone']:16s} trans={r['trans_mm']:9.2f} mm  "
          f"rot={r['rot_deg']:8.2f}°  rest={r['rest_head_mm']}  pose={r['pose_head_mm']}")
print("  裙/马尾/球拍骨：")
for r in rows:
    if r["bone"].startswith(("Skirt", "Ponytail", "Racket")):
        print(f"    {r['bone']:16s} trans={r['trans_mm']:9.2f} mm  "
              f"rot={r['rot_deg']:8.2f}°  rest={r['rest_head_mm']}  pose={r['pose_head_mm']}")

# ------------------------------------------------- 4. 最差边两端顶点细节
print("\n=== 4. 最差拉伸边（第 0 帧）两端顶点 ===")
rest = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
edges = np.array([[e.vertices[0], e.vertices[1]] for e in me.edges], dtype=np.int64)
rest_len = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)
dg = bpy.context.evaluated_depsgraph_get()
ob_eval = ob.evaluated_get(dg)
me_eval = ob_eval.to_mesh()
pts = np.array([v.co[:] for v in me_eval.vertices], dtype=np.float64)
ob_eval.to_mesh_clear()
dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
order = np.argsort(-ratio)[:6]
vg_names = [g.name for g in ob.vertex_groups]
detail = []
for ei in order:
    a, b = int(edges[ei, 0]), int(edges[ei, 1])
    ent = {
        "ratio": round(float(ratio[ei]), 2),
        "rest_mm": round(float(rest_len[ei]) * 1000, 4),
        "deformed_mm": round(float(dl[ei]) * 1000, 3),
        "a": {"i": a, "rest": [round(v, 4) for v in rest[a]],
              "posed": [round(v, 4) for v in pts[a]],
              "w": sorted([(vg_names[g.group], round(g.weight, 4))
                           for g in me.vertices[a].groups],
                          key=lambda t: -t[1])},
        "b": {"i": b, "rest": [round(v, 4) for v in rest[b]],
              "posed": [round(v, 4) for v in pts[b]],
              "w": sorted([(vg_names[g.group], round(g.weight, 4))
                           for g in me.vertices[b].groups],
                          key=lambda t: -t[1])},
    }
    detail.append(ent)
    print(f"\n  ratio {ent['ratio']}×  rest {ent['rest_mm']} mm → {ent['deformed_mm']} mm")
    for side in ("a", "b"):
        s = ent[side]
        print(f"    {side}: v{s['i']} rest={s['rest']} posed={s['posed']}")
        print(f"       weights: {s['w']}")

(TMP / "xf_blend_diagnose.json").write_text(json.dumps(
    {"bone_pose_delta": rows, "worst_edges": detail}, ensure_ascii=False, indent=2))
print(f"\n[写出] {TMP/'xf_blend_diagnose.json'}")
