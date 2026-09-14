"""结构分析：判断语义部件在几何上能否被可靠切分。

背景：源模型焊接后是**单一封闭流形**（0 非流形边 / 0 边界边 / 1 连通分量），
所有衣服与皮肤在拓扑上是一张连续曲面。要拆成 Body/Polo/Skirt/... 必须先
弄清两件事：

  1. 衣服下面有没有**独立的内层皮肤**？
     用"沿法线向内找最近下层曲面"的距离判定：若下层就在 1–4 mm 处，
     说明衣服是独立于皮肤的一层壳；若最近命中很远或是穿到对侧，
     说明衣服就是皮肤本身鼓起来的一块，切开会让 Body 破洞。

  2. 曲面上的**折痕**能切出哪些区域？
     按二面角阈值做面级连通分量：阈值内的相邻面视为同一片。扫描多个阈值，
     看分量数量与面积如何在某个角度上"塌缩"，那个角度就是真实的硬边位置。

两项都只用几何，不使用 BaseColor 颜色。

运行：import _run; _run.go("04_structure.py")
"""

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lib_source as S      # noqa: E402

ROOT = HERE.parent
REPORTS = ROOT / "reports"

WELD_DIST = 1e-6
MAX_INNER_DEPTH = 0.06      # 找内层时最多往下探 6 cm
MIN_GAP = 0.0004

# 采样区域：按位置取，不涉及颜色
REGIONS = [
    ("polo_chest", 0.68, 0.80, 0.10, "躯干正面 Polo"),
    ("polo_back", 0.68, 0.80, 0.10, "躯干背面 Polo"),
    ("skirt", 0.50, 0.58, 0.30, "百褶裙"),
    ("thigh_skin", 0.40, 0.46, 0.20, "大腿裸露皮肤"),
    ("calf_skin", 0.16, 0.24, 0.20, "小腿裸露皮肤"),
    ("upper_arm_skin", 0.62, 0.68, 0.30, "前臂皮肤"),
    ("head_hair", 0.90, 0.98, 0.20, "头发"),
]


def build_bvh(me):
    verts = [v.co.copy() for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons]
    return BVHTree.FromPolygons(verts, polys, all_triangles=False)


def inner_gap(bvh, origin, normal):
    """从 origin 沿 -normal 探测最近的下层曲面距离。

    返回 (距离, 命中点)。None 表示 6 cm 内没有命中（说明下面是空的，
    或者直接穿到了身体另一侧）。
    """
    start = origin - normal * MIN_GAP
    loc, nrm, idx, dist = bvh.ray_cast(start, -normal, MAX_INNER_DEPTH)
    if loc is None:
        return None, None
    return dist + MIN_GAP, loc


def sample_region(me, bvh, z_lo_frac, z_hi_frac, x_abs_max, height):
    """在指定区域取若干顶点做内层探测，返回距离统计。"""
    lo_z, hi_z = z_lo_frac * height, z_hi_frac * height
    picked = []
    for v in me.vertices:
        if not (lo_z <= v.co.z <= hi_z):
            continue
        if abs(v.co.x) > x_abs_max * height:
            continue
        picked.append(v)
    if not picked:
        return None
    # 均匀抽样，避免顶点密度影响
    step = max(len(picked) // 120, 1)
    picked = picked[::step]
    dists, misses = [], 0
    for v in picked:
        d, _ = inner_gap(bvh, v.co, v.normal)
        if d is None:
            misses += 1
        else:
            dists.append(d)
    dists.sort()
    n = len(dists)
    return {
        "sampled": len(picked), "no_hit": misses,
        "hit": n,
        "min_mm": round(1000 * dists[0], 2) if n else None,
        "p25_mm": round(1000 * dists[n // 4], 2) if n else None,
        "median_mm": round(1000 * dists[n // 2], 2) if n else None,
        "p75_mm": round(1000 * dists[3 * n // 4], 2) if n else None,
    }


def segment_by_dihedral(me, angle_deg):
    """按二面角阈值把面切成连通片。返回分量列表（面积、bbox、质心）。"""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    n = len(bm.faces)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    th = math.radians(angle_deg)
    for e in bm.edges:
        if len(e.link_faces) != 2:
            continue
        if e.calc_face_angle(math.pi) < th:
            union(e.link_faces[0].index, e.link_faces[1].index)

    groups = {}
    for f in bm.faces:
        groups.setdefault(find(f.index), []).append(f)

    out = []
    for faces in groups.values():
        area = sum(f.calc_area() for f in faces)
        cos = [f.calc_center_median() for f in faces]
        lo = Vector([min(c[i] for c in cos) for i in range(3)])
        hi = Vector([max(c[i] for c in cos) for i in range(3)])
        cen = sum(cos, Vector()) / len(cos)
        out.append({
            "faces": len(faces), "area_m2": round(area, 6),
            "bbox_min": [round(v, 3) for v in lo],
            "bbox_max": [round(v, 3) for v in hi],
            "centroid": [round(v, 3) for v in cen],
        })
    bm.free()
    out.sort(key=lambda d: -d["area_m2"])
    return out


def main():
    out = {}
    info = S.load_normalized()
    me, height = info["mesh"], info["height"]
    print(f"身高 {height:.4f} m  顶点 {len(me.vertices)}  面 {len(me.polygons)}")

    # 用焊接后的网格做结构分析：未焊接的 574 个碎块是 UV 接缝造成的假分量
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=WELD_DIST)
    me_w = bpy.data.meshes.new("ruth_welded")
    bm.to_mesh(me_w)
    bm.free()
    print(f"焊接后 顶点 {len(me_w.vertices)}  面 {len(me_w.polygons)}")

    bvh = build_bvh(me_w)

    print("\n=== 内层探测：从表面沿法线向内，最近的下一层曲面有多远？===")
    print("（1–4 mm 说明衣服是独立的一层壳；>15 mm 或 no_hit 说明下面是空的）")
    inner = {}
    for name, z0, z1, xm, label in REGIONS:
        st = sample_region(me_w, bvh, z0, z1, xm, height)
        inner[name] = {"label": label, "z_range_frac": [z0, z1], **(st or {})}
        if st:
            print(f"  {name:<16} {label:<14} 采样{st['sampled']:>4}  "
                  f"min {st['min_mm']}  p25 {st['p25_mm']}  "
                  f"中位 {st['median_mm']}  no_hit {st['no_hit']}")
    out["inner_layer_probe"] = inner

    print("\n=== 折痕分割：按二面角阈值切面级连通片 ===")
    print(f"{'阈值':>6} {'分量数':>7} {'最大片面积m²':>12} {'前5片面积占比':>12}")
    seg = {}
    for ang in (10, 15, 20, 30, 45, 60, 80):
        parts = segment_by_angle_cached(me_w, ang)
        total = sum(p["area_m2"] for p in parts)
        top5 = sum(p["area_m2"] for p in parts[:5])
        seg[str(ang)] = {"n_components": len(parts),
                         "top5_area_share": round(top5 / total, 4) if total else 0,
                         "components": parts[:24]}
        print(f"{ang:>6} {len(parts):>7} {parts[0]['area_m2']:>12.5f} "
              f"{top5/total:>11.1%}")
    out["dihedral_segmentation"] = seg

    # 取一个中间阈值，打印它的主要片段，看能不能对上语义部件
    parts = segment_by_angle_cached(me_w, 30)
    print("\n=== 阈值 30° 下的主要片段（面积降序）===")
    print(f"{'#':>3} {'面数':>6} {'面积m²':>9} {'质心 (x,y,z)':>24}  z 区间")
    for i, p in enumerate(parts[:20]):
        c = p["centroid"]
        z0, z1 = p["bbox_min"][2], p["bbox_max"][2]
        print(f"{i:>3} {p['faces']:>6} {p['area_m2']:>9.5f} "
              f"({c[0]:>6.3f},{c[1]:>6.3f},{c[2]:>6.3f})  "
              f"{z0:.3f}–{z1:.3f}  (z/H {z0/height:.2f}–{z1/height:.2f})")
    out["segmentation_30deg"] = parts[:30]

    bpy.data.meshes.remove(me_w)
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "04_structure.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n[写出] {REPORTS / '04_structure.json'}")


_CACHE = {}


def segment_by_angle_cached(me, ang):
    key = (me.name, ang)
    if key not in _CACHE:
        _CACHE[key] = segment_by_dihedral(me, ang)
    return _CACHE[key]


if __name__ == "__main__":
    main()
