"""快速诊断渲染：只用 Workbench 正交出 6 视图，不做分析。

目的：在写任何判据之前先看清源模型到底是什么。

输出：preview/diag/{negY,posY,negX,posX,posZ,negZ}.png
"""

import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path("/Users/lizusheng/.zcode/workspace/default/site-studies/ruth")
SRC = ROOT / "reference" / "Ruth_High_Source.glb"
OUT = ROOT / "preview" / "diag"


def main():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)

    bpy.ops.import_scene.gltf(filepath=str(SRC))
    mesh_obs = [o for o in bpy.data.objects if o.type == "MESH"]
    print("导入对象：", [(o.name, o.type, tuple(round(v, 4) for v in o.scale))
                     for o in bpy.data.objects])
    ob = mesh_obs[0]
    me = ob.data
    print("matrix_world:\n", ob.matrix_world)
    me.transform(ob.matrix_world)
    ob.parent = None
    ob.matrix_basis = Matrix.Identity(4)

    vs = me.vertices
    lo = Vector([min(v.co[i] for v in vs) for i in range(3)])
    hi = Vector([max(v.co[i] for v in vs) for i in range(3)])
    ext = hi - lo
    print(f"顶点 {len(vs)}  面 {len(me.polygons)}")
    print(f"bbox lo {tuple(round(v,4) for v in lo)}")
    print(f"bbox hi {tuple(round(v,4) for v in hi)}")
    print(f"extent  {tuple(round(v,4) for v in ext)}")

    # 三轴各自的顶点分布直方，看哪根轴是身高轴、有没有断层
    for axis, nm in enumerate("XYZ"):
        vals = sorted(v.co[axis] for v in vs)
        n = len(vals)
        print(f"  {nm}: min {vals[0]:.4f}  p25 {vals[n//4]:.4f}  "
              f"med {vals[n//2]:.4f}  p75 {vals[3*n//4]:.4f}  max {vals[-1]:.4f}")

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"

    cam_data = bpy.data.cameras.new("DiagCam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("DiagCam", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    size = max(ext)
    center = (lo + hi) / 2
    views = [("negY", Vector((0, -1, 0))), ("posY", Vector((0, 1, 0))),
             ("negX", Vector((-1, 0, 0))), ("posX", Vector((1, 0, 0))),
             ("posZ", Vector((0, 0, 1))), ("negZ", Vector((0, 0, -1)))]
    OUT.mkdir(parents=True, exist_ok=True)
    for key, d in views:
        cam_data.ortho_scale = size * 1.06
        cam.location = center + d * size * 3.0
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(OUT / f"{key}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[渲染] {key}.png  相机 {tuple(round(v,3) for v in cam.location)}")


if __name__ == "__main__":
    main()
