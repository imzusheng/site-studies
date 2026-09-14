"""Stage A：只读地验证实际保存的 ruth_forehand_v1.blend。

不重跑任何生成脚本，直接打开最终文件，然后：
  1. 从 rest 数据算边长
  2. 在每个关键帧求值 depsgraph，量测形变后边长 → 撕裂指标
  3. 用固定机位渲染 PNG
  4. 导出每帧形变后顶点坐标（供跨格式逐顶点比对）

用法：
  blender -b ruth_forehand_v1.blend -P xf_01_blender_validate.py
环境变量：
  XF_RES=600x1000   渲染分辨率
  XF_SAMPLES=32     Cycles 采样
  XF_ENGINE=CYCLES  CYCLES | BLENDER_EEVEE_NEXT
"""
import json
import os
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
RUTH = REPO / "ruth"
OUTDIR = RUTH / "validation" / "blender"
OUTDIR.mkdir(parents=True, exist_ok=True)
TMP = Path("/tmp")

MARKS = {
    "ready": 0,
    "backswing": 147,
    "contact": 164,
    "follow_through": 187,
    "recovery": 232,
}

RES = os.environ.get("XF_RES", "600x1000")
SAMPLES = int(os.environ.get("XF_SAMPLES", "32"))
ENGINE = os.environ.get("XF_ENGINE", "CYCLES")

scene = bpy.context.scene
scene.frame_set(0)

ob = bpy.data.objects["Ruth"]
rig = bpy.data.objects["Ruth_Rig"]
me = ob.data

# ---------------------------------------------------------------- rest 边长
rest = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
edges = np.array([[e.vertices[0], e.vertices[1]] for e in me.edges], dtype=np.int64)
rest_len = np.linalg.norm(rest[edges[:, 0]] - rest[edges[:, 1]], axis=1)

# 顶点 → 顶点组名（用于解释哪些骨骼在拉）
vg_names = [g.name for g in ob.vertex_groups]
vert_top_bone = []
for v in me.vertices:
    if v.groups:
        g = max(v.groups, key=lambda x: x.weight)
        vert_top_bone.append(vg_names[g.group])
    else:
        vert_top_bone.append(None)

# ------------------------------------------------------- 朝向：从脚骨取前方
def bone_world_y(name):
    b = rig.data.bones.get(name)
    if b is None:
        return None
    m = rig.matrix_world @ b.matrix_local
    return (m.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()

fwd = None
for cand in ("Foot.L", "Foot.R", "Toe.L"):
    d = bone_world_y(cand)
    if d is not None:
        fwd = d
        break
if fwd is None:
    fwd = Vector((0.0, -1.0, 0.0))
fwd = Vector((fwd.x, fwd.y, 0.0))
if fwd.length < 1e-6:
    fwd = Vector((0.0, -1.0, 0.0))
fwd.normalize()

# 相机放在角色前方的左上方 35°，full body 构图
az = np.deg2rad(35.0)
right = Vector((fwd.y, -fwd.x, 0.0))       # 角色右手侧
cam_dir = (fwd * np.cos(az) + right * np.sin(az)).normalized()
target = Vector((0.0, 0.0, 0.92))
dist = 3.6
cam_pos = target + cam_dir * dist + Vector((0.0, 0.0, 0.25))

# ------------------------------------------------------------------- 相机
cam_data = bpy.data.cameras.new("XF_ValCam")
cam_data.lens = 50.0
cam_data.sensor_width = 36.0
cam_data.sensor_fit = "VERTICAL"
cam = bpy.data.objects.new("XF_ValCam", cam_data)
scene.collection.objects.link(cam)
look = (target - cam_pos)
rot = look.to_track_quat("-Z", "Y").to_euler()
cam.location = cam_pos
cam.rotation_euler = rot
scene.camera = cam

# ------------------------------------------------------------------- 灯光
def add_area(name, loc, energy, size, target_pt):
    ld = bpy.data.lights.new(name, type="AREA")
    ld.energy = energy
    ld.size = size
    o = bpy.data.objects.new(name, ld)
    scene.collection.objects.link(o)
    o.location = loc
    d = (Vector(target_pt) - Vector(loc))
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o

key = target + cam_dir * 2.0 + Vector((-1.6, 0.0, 1.8))
fill = target + cam_dir * 1.5 + Vector((2.2, 0.0, 0.6))
rim = target - fwd * 2.2 + Vector((0.0, 0.0, 1.6))
add_area("XF_Key", key, 220.0, 2.5, target)
add_area("XF_Fill", fill, 90.0, 3.0, target)
add_area("XF_Rim", rim, 130.0, 2.0, target + Vector((0, 0, 0.6)))

world = scene.world or bpy.data.worlds.new("XF_World")
scene.world = world
world.use_nodes = True
bg = next((n for n in world.node_tree.nodes
           if n.bl_idname == "ShaderNodeBackground"), None)
if bg:
    bg.inputs[0].default_value = (0.18, 0.19, 0.21, 1.0)
    bg.inputs[1].default_value = 0.4

# --------------------------------------------------------------- 渲染设置
w, h = (int(x) for x in RES.split("x"))
scene.render.resolution_x = w
scene.render.resolution_y = h
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.render.engine = ENGINE
if ENGINE == "CYCLES":
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.cycles.device = "CPU"
elif ENGINE.startswith("BLENDER_EEVEE"):
    try:
        scene.eevee.taa_render_samples = max(16, SAMPLES)
    except Exception as e:
        print(f"[warn] eevee samples: {e}")

# 隐藏除 Ruth/Racket 之外新加的东西不必要；相机灯不渲染为几何
report = {
    "source_file": bpy.data.filepath,
    "engine": ENGINE,
    "resolution": [w, h],
    "fps": scene.render.fps / scene.render.fps_base,
    "frame_range": [scene.frame_start, scene.frame_end],
    "camera": {
        "position": [round(v, 6) for v in cam_pos],
        "target": [round(v, 6) for v in target],
        "lens_mm": cam_data.lens,
        "sensor_width_mm": cam_data.sensor_width,
        "sensor_fit": cam_data.sensor_fit,
        "fov_vertical_deg": round(
            np.rad2deg(2 * np.arctan(cam_data.sensor_width / 2 / cam_data.lens)),
            4),
        "facing_axis_used": [round(v, 4) for v in fwd],
    },
    "marks": {},
}
(TMP / "xf_camera.json").write_text(json.dumps({
    "position": list(report["camera"]["position"]),
    "target": report["camera"]["target"],
    "lens_mm": cam_data.lens,
    "sensor_width_mm": cam_data.sensor_width,
    "resolution": [w, h],
}, indent=2))

print("=" * 72)
print(f"文件 {bpy.data.filepath}")
print(f"朝向参考向量 {tuple(round(v,3) for v in fwd)}  "
      f"相机位 {tuple(round(v,3) for v in cam_pos)}")
print("=" * 72)

npz = {}
for mark, fr in MARKS.items():
    scene.frame_set(fr)
    dg = bpy.context.evaluated_depsgraph_get()
    ob_eval = ob.evaluated_get(dg)
    me_eval = ob_eval.to_mesh()
    pts = np.array([v.co[:] for v in me_eval.vertices], dtype=np.float64)
    ob_eval.to_mesh_clear()

    dl = np.linalg.norm(pts[edges[:, 0]] - pts[edges[:, 1]], axis=1)
    ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)

    n2 = int((ratio > 2.0).sum())
    n5 = int((ratio > 5.0).sum())
    n10 = int((ratio > 10.0).sum())
    worst = np.argsort(-ratio)[:20]
    worst_list = []
    for ei in worst:
        a, b = edges[ei]
        worst_list.append({
            "edge": int(ei),
            "ratio": round(float(ratio[ei]), 3),
            "rest_mm": round(float(rest_len[ei]) * 1000, 3),
            "deformed_mm": round(float(dl[ei]) * 1000, 3),
            "vert_a": int(a), "vert_b": int(b),
            "bone_a": vert_top_bone[a], "bone_b": vert_top_bone[b],
        })
    bbox = [float(pts[:, i].min()) for i in range(3)] + \
           [float(pts[:, i].max()) for i in range(3)]
    finite = bool(np.isfinite(pts).all())

    report["marks"][mark] = {
        "frame": fr,
        "verts": int(len(pts)),
        "all_finite": finite,
        "edges_gt_2x": n2,
        "edges_gt_5x": n5,
        "edges_gt_10x": n10,
        "pct_edges_gt_2x": round(100.0 * n2 / len(edges), 4),
        "max_ratio": round(float(ratio.max()), 3),
        "p99_ratio": round(float(np.percentile(ratio, 99)), 4),
        "bbox_min": [round(v, 4) for v in bbox[:3]],
        "bbox_max": [round(v, 4) for v in bbox[3:]],
        "worst_edges": worst_list,
    }
    npz[mark] = pts

    out = OUTDIR / f"{mark}.png"
    scene.render.filepath = str(out)
    bpy.ops.render.render(write_still=True)
    print(f"[{mark}] frame={fr}  >2x={n2}  >5x={n5}  >10x={n10}  "
          f"max={ratio.max():.2f}  → {out.name}")

np.savez_compressed(TMP / "xf_blender_deformed.npz", __rest__=rest, **npz)
(TMP / "xf_blender_stage_a.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2))
print(f"[写出] {TMP/'xf_blender_stage_a.json'}   {TMP/'xf_blender_deformed.npz'}"
      f"（含 rest {rest.shape}）")
