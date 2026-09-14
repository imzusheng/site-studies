"""归一到 Production 尺度，评估拓扑质量，修复材质，保存可编辑工程。

产出：
  build/step1_normalized.blend
  reports/05_normalize_topology.json

三个关键判断都基于数值，不靠感觉：
  1. 关节区（肩/腋/肘/腕/髋/裆/膝/踝/颈）的面密度与三角形质量是否够形变用。
     源本身已经是 50k tris，落在 40–60k 预算内，所以问题不是"面数够不够"，
     而是"这些面有没有落在该落的地方、形状好不好"。
  2. tris → quads 能转换多少。四边面在 LBS 下的形变表现明显好于三角面。
  3. 材质参数合法性。源带 KHR_materials_specular 的 specularColorFactor=[2,2,2]，
     超出合法的 [0,1] 范围，是"油腻/塑料感"的直接来源。

运行：import _run; _run.go("05_normalize_topology.py")
"""

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lib_source as S      # noqa: E402

ROOT = HERE.parent
REPORTS = ROOT / "reports"
BUILD = ROOT / "build"
TARGET_HEIGHT = 1.65

# 关节区：名字 → (中心点比例(x,y,z 相对身高), 判定半径比例)
JOINTS = {
    "neck":        ((0.000, 0.000, 0.865), 0.055),
    "shoulder_R":  ((-0.085, 0.000, 0.800), 0.070),
    "armpit_R":    ((-0.070, 0.000, 0.735), 0.055),
    "elbow_R":     ((-0.150, 0.010, 0.630), 0.055),
    "wrist_R":     ((-0.208, -0.005, 0.520), 0.045),
    "shoulder_L":  ((0.085, 0.000, 0.800), 0.070),
    "armpit_L":    ((0.070, 0.000, 0.735), 0.055),
    "elbow_L":     ((0.150, 0.010, 0.630), 0.055),
    "wrist_L":     ((0.208, -0.005, 0.520), 0.045),
    "hip_R":       ((-0.045, 0.000, 0.520), 0.070),
    "hip_L":       ((0.045, 0.000, 0.520), 0.070),
    "crotch":      ((0.000, 0.000, 0.470), 0.060),
    "knee_R":      ((-0.048, 0.010, 0.330), 0.060),
    "knee_L":      ((0.048, 0.010, 0.330), 0.060),
    "ankle_R":     ((-0.050, 0.020, 0.100), 0.050),
    "ankle_L":     ((0.050, 0.020, 0.100), 0.050),
    "waist":       ((0.000, 0.000, 0.630), 0.080),
}


def tri_quality(me):
    """整体三角形质量：最小角分布 + 长宽比。"""
    angles = []
    aspects = []
    for p in me.polygons:
        vs = [me.vertices[i].co for i in p.vertices]
        if len(vs) < 3:
            continue
        ls = []
        for i in range(3):
            ls.append((vs[(i + 1) % 3] - vs[i]).length)
        if min(ls) < 1e-9:
            continue
        aspects.append(max(ls) / min(ls))
        # 最小角
        best = 180.0
        for i in range(3):
            a = vs[(i + 1) % 3] - vs[i]
            b = vs[(i + 2) % 3] - vs[i]
            if a.length < 1e-9 or b.length < 1e-9:
                continue
            ang = math.degrees(a.angle(b))
            best = min(best, ang)
        angles.append(best)
    angles.sort()
    aspects.sort()
    n = len(angles)
    m = len(aspects)
    return {
        "n_tris": n,
        "min_angle_p1": round(angles[n // 100], 2),
        "min_angle_p5": round(angles[n // 20], 2),
        "min_angle_median": round(angles[n // 2], 2),
        "below_15deg": sum(1 for a in angles if a < 15),
        "below_15deg_pct": round(100 * sum(1 for a in angles if a < 15) / n, 2),
        "below_5deg": sum(1 for a in angles if a < 5),
        "aspect_median": round(aspects[m // 2], 3),
        "aspect_p99": round(aspects[int(m * 0.99)], 3),
        "aspect_gt5": sum(1 for a in aspects if a > 5),
    }


def region_density(me, height):
    """每个关节区内的面数、平均边长、最小角，用于判断形变是否够用。"""
    out = {}
    centers = [(p, sum((me.vertices[i].co for i in p.vertices), Vector())
                / len(p.vertices)) for p in me.polygons]
    for name, (c, r) in JOINTS.items():
        ctr = Vector((c[0] * height, c[1] * height, c[2] * height))
        rad = r * height
        inside = [p for p, cc in centers if (cc - ctr).length <= rad]
        if not inside:
            out[name] = {"faces": 0}
            continue
        edge_len, angs = [], []
        for p in inside:
            vs = [me.vertices[i].co for i in p.vertices]
            for i in range(len(vs)):
                edge_len.append((vs[(i + 1) % len(vs)] - vs[i]).length)
            for i in range(len(vs)):
                a = vs[(i + 1) % len(vs)] - vs[i]
                b = vs[(i + 2) % len(vs)] - vs[i]
                if a.length > 1e-9 and b.length > 1e-9:
                    angs.append(math.degrees(a.angle(b)))
        edge_len.sort()
        angs.sort()
        # 面密度：面数 / 球截面积（球心在表面内，取半球）
        out[name] = {
            "radius_m": round(rad, 4), "faces": len(inside),
            "median_edge_mm": round(1000 * edge_len[len(edge_len) // 2], 2),
            "min_angle_p5_deg": round(angs[len(angs) // 20], 1),
            "faces_per_cm2": round(len(inside) / (math.pi * (rad * 100) ** 2), 1),
        }
    return out


def tris_to_quads(me, face_deg=40.0, shape_deg=40.0):
    """用 bmesh.join_triangles 做 tris→quads。

    不用 bpy.ops.mesh.tris_convert_to_quads：那需要正确的 mode/context，
    在 MCP 通道里容易踩到"上下文缺失活动物体"。bmesh 版本不依赖 context。
    cmp_uvs=True 保证只有 UV 相符的相邻三角面才合并，UV 布局不变。
    """
    bm = bmesh.new()
    bm.from_mesh(me)
    before = {"tris": len(bm.faces),
              "verts": len(bm.verts),
              "edges": len(bm.edges)}
    bmesh.ops.join_triangles(
        bm, faces=bm.faces[:],
        angle_face_threshold=math.radians(face_deg),
        angle_shape_threshold=math.radians(shape_deg),
        cmp_seam=False, cmp_sharp=False, cmp_uvs=True, cmp_materials=True)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    tris = sum(1 for f in bm.faces if len(f.verts) == 3)
    ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
    after = {"faces": len(bm.faces), "quads": quads, "tris": tris,
             "ngons": ngons, "verts": len(bm.verts), "edges": len(bm.edges),
             "equiv_tris": quads * 2 + tris + ngons * 3,
             "quad_ratio": round(quads / len(bm.faces), 3)}
    bm.to_mesh(me)
    bm.free()
    me.update()
    return before, after


def fix_material(ob, report):
    """修正 glTF 导入的材质参数，全部在函数内完成。

    坑：MCP addon 会序列化脚本执行后的全局命名空间，NodeSocket / Node 这类
    对象留在全局会让 addon 抛 "NodeSocketVector doesn't define __round__"。
    所以材质相关的临时变量一律不放到模块作用域。
    """
    if not ob.material_slots:
        raise RuntimeError("对象没有材质槽")
    mat = ob.material_slots[0].material
    if mat is None:
        raise RuntimeError("材质槽为空")
    report["material_name"] = mat.name
    report["use_nodes"] = mat.use_nodes
    if not mat.use_nodes:
        return report

    nodes = mat.node_tree.nodes
    bsdf = next((n for n in nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"),
                None)
    if bsdf is None:
        raise RuntimeError("找不到 Principled BSDF")

    inputs = {}
    for key in ("Base Color", "Metallic", "Roughness", "IOR", "Alpha",
                "Specular IOR Level", "Specular Tint"):
        sock = bsdf.inputs.get(key)
        if sock is None:
            continue
        linked = sock.is_linked
        val = None
        if not linked:
            try:
                v = sock.default_value
                val = [round(x, 4) for x in v] if hasattr(v, "__len__") \
                    else round(float(v), 4)
            except Exception:
                val = "?"
        inputs[key] = {"linked": linked, "value": val}
    report["bsdf_inputs_before"] = inputs

    changes = []
    sp = bsdf.inputs.get("Specular IOR Level")
    if sp is not None and not sp.is_linked:
        if abs(sp.default_value - 0.5) > 1e-6:
            changes.append(f"Specular IOR Level {sp.default_value:.4f} → 0.5")
            sp.default_value = 0.5
    st = bsdf.inputs.get("Specular Tint")
    if st is not None and not st.is_linked:
        before = tuple(st.default_value)
        if any(abs(v - 1.0) > 1e-6 for v in before):
            changes.append(
                f"Specular Tint {tuple(round(v,3) for v in before)} → (1,1,1)"
                "  ← glTF 的 specularColorFactor=[2,2,2] 超出 [0,1] 合法范围")
            st.default_value = (1.0, 1.0, 1.0, 1.0)
    # 上一版还有 alphaMode 被导入成非 OPAQUE 的情况
    if getattr(mat, "blend_method", "OPAQUE") != "OPAQUE":
        changes.append(f"blend_method {mat.blend_method} → OPAQUE")
        mat.blend_method = "OPAQUE"
    report["changes"] = changes

    inputs_after = {}
    for key in ("Specular IOR Level", "Specular Tint", "Roughness", "Metallic"):
        sock = bsdf.inputs.get(key)
        if sock is None:
            continue
        try:
            v = sock.default_value
            inputs_after[key] = ([round(x, 4) for x in v]
                                 if hasattr(v, "__len__") else round(float(v), 4))
        except Exception:
            inputs_after[key] = "?"
    report["bsdf_inputs_after"] = inputs_after
    return report


def main():
    out = {}
    info = S.load_normalized(target_height=TARGET_HEIGHT)
    ob, me = info["object"], info["mesh"]
    height = info["height"]

    out["normalize"] = {
        "target_height_m": TARGET_HEIGHT,
        "raw_height_m": round(info["raw_height"], 5),
        "scale_applied": round(info["scale_applied"], 6),
        "height_after_m": round(height, 5),
        "bbox_min": [round(v, 5) for v in info["bbox_min"]],
        "bbox_max": [round(v, 5) for v in info["bbox_max"]],
        "feet_on_ground": abs(info["bbox_min"].z) < 1e-6,
        "origin_x_centered": abs((info["bbox_min"].x + info["bbox_max"].x) / 2)
        < 1e-6,
        "facing": "-Y (Blender 约定；导出 glTF 后为 +Z)",
    }
    print(f"=== Normalize ===\n  源高 {info['raw_height']:.5f} m → "
          f"{height:.5f} m  缩放 ×{info['scale_applied']:.6f}")
    print(f"  bbox {[round(v,4) for v in info['bbox_min']]} → "
          f"{[round(v,4) for v in info['bbox_max']]}")
    print(f"  脚踩地 {out['normalize']['feet_on_ground']}  "
          f"x 居中 {out['normalize']['origin_x_centered']}")

    # ---- 拓扑质量 ----
    q = tri_quality(me)
    out["tri_quality_before"] = q
    print("\n=== 三角形质量（源）===")
    print(f"  面数 {q['n_tris']}  最小角 中位 {q['min_angle_median']}°  "
          f"p5 {q['min_angle_p5']}°  p1 {q['min_angle_p1']}°")
    print(f"  <15° 的细钝角面 {q['below_15deg']} ({q['below_15deg_pct']}%)  "
          f"<5° 的 {q['below_5deg']}")
    print(f"  长宽比 中位 {q['aspect_median']}  p99 {q['aspect_p99']}  "
          f">5 的 {q['aspect_gt5']}")

    dens = region_density(me, height)
    out["joint_region_density"] = dens
    print("\n=== 关节区面密度（形变能力的关键指标）===")
    print(f"{'区域':<12} {'半径mm':>7} {'面数':>6} {'中位边长mm':>10} "
          f"{'最小角p5':>9} {'面/cm²':>8}")
    for name in JOINTS:
        d = dens[name]
        if d.get("faces", 0) == 0:
            print(f"{name:<12} {'—':>7} {'0':>6}")
            continue
        print(f"{name:<12} {d['radius_m']*1000:>7.0f} {d['faces']:>6} "
              f"{d['median_edge_mm']:>10.2f} {d['min_angle_p5_deg']:>9.1f} "
              f"{d['faces_per_cm2']:>8.1f}")

    # ---- tris → quads ----
    tris_before = sum(len(p.vertices) - 2 for p in me.polygons)
    before, after = tris_to_quads(me)
    after["equiv_tris_before"] = tris_before
    out["tris_to_quads"] = {"before": before, "after": after}
    print("\n=== tris → quads ===")
    print(f"  前：{before['tris']} tris / {before['verts']} verts")
    print(f"  后：{after['quads']} quads + {after['tris']} tris "
          f"(等价 {after['equiv_tris']} tris)  四边面占比 "
          f"{after['quad_ratio']*100:.1f}%")
    out["tri_quality_after"] = tri_quality(me)

    # ---- 材质 ----
    rep = {}
    rep = fix_material(ob, rep)
    out["material_fix"] = rep
    print("\n=== 材质 ===")
    print(f"  材质 {rep['material_name']}  nodes={rep['use_nodes']}")
    print(f"  修复前 BSDF: {json.dumps(rep['bsdf_inputs_before'], ensure_ascii=False)}")
    for c in rep.get("changes", []):
        print(f"  ✓ {c}")
    if not rep.get("changes"):
        print("  （无需改动）")
    print(f"  修复后: {json.dumps(rep['bsdf_inputs_after'], ensure_ascii=False)}")

    # ---- 保存 ----
    BUILD.mkdir(parents=True, exist_ok=True)
    ob.name = "Ruth"
    me.name = "Ruth_Mesh"
    blend = BUILD / "step1_normalized.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    print(f"\n[写出] {blend}")

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "05_normalize_topology.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / '05_normalize_topology.json'}")
    return out


if __name__ == "__main__":
    main()
