"""源资产加载与坐标归一，被各脚本共用。

统一约定（本目录所有脚本都遵守）：
  - 身高轴 = Z，脚底在 z = 0，水平居中于 x = 0
  - 角色面向 -Y（Blender 坐标，即导出 glTF 后面向 +Z）

坑记录：
  glTF 导入器的 rotation_mode 是 QUATERNION，写 rotation_euler=(0,0,0)
  清不掉导入旋转，必须直接写 matrix_basis。本模型导入后叠加结果是绕 X 180°
  （节点自带 +90° 绕 X 与导入器 Y-up→Z-up 的 +90° 相叠加），
  所以世界 y、z 相对 GLB 内局部坐标都取了反。
"""

import math
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path("/Users/lizusheng/.zcode/workspace/default/site-studies/ruth")
SRC = ROOT / "reference" / "Ruth_High_Source.glb"


def clear_scene(keep=()):
    for ob in list(bpy.data.objects):
        if ob.name not in keep:
            bpy.data.objects.remove(ob, do_unlink=True)


def import_source(path=None):
    p = Path(path) if path else SRC
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(p))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("导入后没有 mesh 对象")
    return meshes


def bake_transform(ob):
    me = ob.data
    me.transform(ob.matrix_world)
    ob.parent = None
    ob.matrix_basis = Matrix.Identity(4)
    ob.rotation_mode = "XYZ"
    return me


def bbox_of(me):
    vs = me.vertices
    lo = Vector([min(v.co[i] for v in vs) for i in range(3)])
    hi = Vector([max(v.co[i] for v in vs) for i in range(3)])
    return lo, hi


def footprint_area(me, z_lo, z_hi):
    """z 区间内法线朝下的近水平面总面积。脚底贡献大，头顶几乎为零。"""
    total = 0.0
    vs = me.vertices
    for p in me.polygons:
        if p.normal.z > -0.85:
            continue
        cz = sum(vs[i].co.z for i in p.vertices) / len(p.vertices)
        if z_lo <= cz <= z_hi:
            total += p.area
    return total


def x_span_in(me, z_lo, z_hi):
    sel = [v.co.x for v in me.vertices if z_lo <= v.co.z <= z_hi]
    return (max(sel) - min(sel)) if sel else 0.0


def up_axis_and_flip(me):
    """把身高轴转到 Z，并保证脚在 z 小的一侧。

    极性用两个独立判据投票，A 更直接，冲突时以 A 为准：
      A 脚底朝下水平面面积（低端 vs 高端）。上一版用两端截面的长宽比，
        但本模型头（帽子+马尾）与脚的扁平度太接近，被误判成倒置。
      B 两端截面的 x 跨度（两只鞋外缘 > 发髻）。
    """
    lo, hi = bbox_of(me)
    ext = hi - lo
    up = max(range(3), key=lambda i: ext[i])
    if up != 2:
        axis = {0: ("Y", 90), 1: ("X", -90)}[up]
        me.transform(Matrix.Rotation(math.radians(axis[1]), 4, axis[0]))

    lo, hi = bbox_of(me)
    span = hi.z - lo.z
    area_low = footprint_area(me, lo.z, lo.z + span * 0.08)
    area_high = footprint_area(me, hi.z - span * 0.08, hi.z)
    span_low = x_span_in(me, lo.z, lo.z + span * 0.08)
    span_high = x_span_in(me, hi.z - span * 0.08, hi.z)
    vote_a = area_high > area_low * 1.5
    vote_b = span_high > span_low * 1.2

    evidence = {
        "up_axis_index_in_local": up,
        "down_area_low_end_m2": round(area_low, 6),
        "down_area_high_end_m2": round(area_high, 6),
        "vote_A_flip": vote_a,
        "x_span_low_end_m": round(span_low, 4),
        "x_span_high_end_m": round(span_high, 4),
        "vote_B_flip": vote_b,
        "votes_agree": vote_a == vote_b,
    }
    if vote_a:
        me.transform(Matrix.Rotation(math.radians(180), 4, "X"))
    return vote_a, evidence


def load_normalized(path=None, target_height=None, center=True, ground=True):
    """导入源并归一。返回 dict。

    target_height 给定时等比缩放到该身高（米）。缩放作用在 mesh 数据上，
    对象变换保持单位矩阵，后续脚本不必再关心尺度。
    """
    clear_scene()
    obs = import_source(path)
    ob = obs[0]
    me = bake_transform(ob)

    flipped, evid = up_axis_and_flip(me)
    lo, hi = bbox_of(me)
    raw_height = hi.z - lo.z

    scale = 1.0
    if target_height:
        scale = target_height / raw_height
        me.transform(Matrix.Scale(scale, 4))
        lo, hi = bbox_of(me)

    if ground:
        me.transform(Matrix.Translation(Vector((0, 0, -lo.z))))
        lo, hi = bbox_of(me)
    if center:
        me.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, 0, 0))))
        lo, hi = bbox_of(me)

    return {
        "object": ob, "mesh": me, "bbox_min": lo, "bbox_max": hi,
        "height": hi.z - lo.z, "raw_height": raw_height,
        "scale_applied": scale, "flipped_180": flipped,
        "flip_evidence": evid, "extra_objects": obs[1:],
    }


def mirror_distance_stats(me, x_skip=0.02):
    """左右对称性：每个顶点镜像到 -x 后找最近点，返回距离分位数。"""
    from mathutils.kdtree import KDTree
    pts = [v.co.copy() for v in me.vertices]
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    ds = []
    for p in pts:
        if p.x < x_skip:
            continue
        _, _, d = kd.find(Vector((-p.x, p.y, p.z)))
        if d is not None:
            ds.append(d)
    ds.sort()
    if not ds:
        return {}
    n = len(ds)
    return {"sampled": n, "mean_mm": round(1000 * sum(ds) / n, 2),
            "median_mm": round(1000 * ds[n // 2], 2),
            "p90_mm": round(1000 * ds[int(n * 0.90)], 2),
            "max_mm": round(1000 * ds[-1], 2)}


def topology_stats(me, weld=None):
    """拓扑统计。weld 给定时先焊接再统计。"""
    bm = bmesh.new()
    bm.from_mesh(me)
    if weld is not None:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    parent = list(range(len(bm.verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in bm.edges:
        a, c = find(e.verts[0].index), find(e.verts[1].index)
        if a != c:
            parent[a] = c

    st = {
        "verts": len(bm.verts), "faces": len(bm.faces),
        "tris": sum(len(f.verts) - 2 for f in bm.faces),
        "non_manifold_edges": sum(1 for e in bm.edges if not e.is_manifold),
        "boundary_edges": sum(1 for e in bm.edges if e.is_boundary),
        "wire_edges": sum(1 for e in bm.edges if e.is_wire),
        "components": len({find(i) for i in range(len(bm.verts))}),
        "zero_area_faces": sum(1 for f in bm.faces if f.calc_area() < 1e-12),
    }
    degen = sliver = 0
    for f in bm.faces:
        ls = [e.calc_length() for e in f.edges]
        if min(ls) < 1e-9:
            degen += 1
        elif max(ls) / min(ls) > 20.0:
            sliver += 1
    st["degenerate_faces"] = degen
    st["sliver_faces_aspect_gt20"] = sliver
    bm.free()
    return st
