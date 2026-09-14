"""复现上一轮 fh_qa.py 的 stretch 口径，证明那次 PASS 是无效的。

fh_qa.py:109-116 把第 0 帧的**形变后**网格当作 rest 基准：
    scene.frame_set(frames[0])
    _, ev0, me0 = build_bvh(body, dg)
    rest_edges = [... 从 me0 取边长 ...]
第 0 帧本身已经撕裂，于是"拿撕裂后的长度当基准"，同样的撕裂在后继帧上比值≈1，
检查对它结构性失明。本脚本按同一口径复算，应当得到与上一轮报告一致的 0.372%。

用法：blender -b ruth_forehand_v1.blend -P xf_12_qa_baseline_repro.py
"""
import bpy
from mathutils import Vector
scene = bpy.context.scene
ob = next(o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("Ruth"))
frames = list(range(int(scene.frame_start), int(scene.frame_end) + 1))

def eval_pts(f):
    scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    oe = ob.evaluated_get(dg); m = oe.to_mesh()
    pts = [v.co.copy() for v in m.vertices]
    edges = [(e.vertices[0], e.vertices[1]) for e in m.edges]
    oe.to_mesh_clear()
    return pts, edges

pts0, edges = eval_pts(frames[0])
base = [(pts0[a] - pts0[b]).length for a, b in edges]      # ← 与 fh_qa 相同的基准
print("基准 = 第 0 帧形变后网格（fh_qa 的口径）")
mx = 0.0
for i in frames[::2]:
    pts, _ = eval_pts(i)
    over2 = sum(1 for k, (a, b) in enumerate(edges)
                if base[k] > 1e-7 and (pts[a]-pts[b]).length/base[k] > 2.0)
    pct = 100.0*over2/len(edges)
    mx = max(mx, pct)
    if i in (0, 60, 120, 164, 187, 232):
        print(f"  frame {i:3d}  >2× 边 {over2:5d}   {pct:.3f}%")
print(f"  全片最大 {mx:.3f}%")
