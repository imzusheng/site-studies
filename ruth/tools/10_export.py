"""导出最终 GLB，并汇总 production_asset.json。

导出注意：
  export_apply 必须是 False。开了之后 Blender 会把修改器烘进网格，
  Armature 绑定会被一并烘掉，导出的 GLB 就没有 skin 了。
  （这一点和"要不要应用修改器"的直觉相反，所以专门记在这里。）

导出后立刻重新导入一次做校验：顶点数、骨骼数、材质、是否有 skin。
"能导出"不等于"能重新载入"，这一步不能省。

产出：build/ruth_production.blend、build/ruth_production.glb、
      reports/production_asset.json
"""

import hashlib
import json
import os
import sys
from pathlib import Path

import bmesh
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
REPORTS = ROOT / "reports"
BUILD = ROOT / "build"
TEXDIR = ROOT / "textures"
GLB = BUILD / "ruth_production.glb"


def sha256(path, limit=None):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def mesh_stats(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    st = {
        "verts": len(bm.verts),
        "faces": len(bm.faces),
        "tris": sum(len(f.verts) - 2 for f in bm.faces),
        "quads": sum(1 for f in bm.faces if len(f.verts) == 4),
        "ngons": sum(1 for f in bm.faces if len(f.verts) > 4),
        "non_manifold_edges": sum(1 for e in bm.edges if not e.is_manifold),
        "boundary_edges": sum(1 for e in bm.edges if e.is_boundary),
        "components": 0,
    }
    parent = list(range(len(bm.verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for e in bm.edges:
        a, b = find(e.verts[0].index), find(e.verts[1].index)
        if a != b:
            parent[a] = b
    st["components"] = len({find(i) for i in range(len(bm.verts))})
    bm.free()
    return st


def main():
    src_probe = json.loads((REPORTS / "00_glb_probe.json").read_text())
    audit = json.loads((REPORTS / "01_source_audit.json").read_text())
    rig_rep = json.loads((REPORTS / "07_rig.json").read_text())
    w_rep = json.loads((REPORTS / "08_weights.json").read_text())
    tex_rep = json.loads((REPORTS / "06_textures.json").read_text())
    norm_rep = json.loads((REPORTS / "05_normalize_topology.json").read_text())

    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(BUILD / "step3_weighted.blend"))
    ob = next((o for o in bpy.data.objects if o.type == "MESH"), None)
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if ob is None or rig is None:
        raise RuntimeError("找不到网格或骨架")
    ob.name = "Ruth"
    rig.name = "Ruth_Rig"
    me = ob.data
    me.name = "Ruth_Mesh"

    # 确认绑定在位
    mods = [(m.name, m.type,
             getattr(m.object, "name", None) if m.type == "ARMATURE" else None)
            for m in ob.modifiers]
    print(f"网格 {len(me.vertices)} 顶点  {len(me.polygons)} 面")
    print(f"骨架 {len(rig.data.bones)} 骨   修改器 {mods}")
    print(f"顶点组 {len(ob.vertex_groups)}")

    # 保存可编辑工程
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "ruth_production.blend"))
    print(f"[写出] {BUILD / 'ruth_production.blend'}")

    # 导出 GLB。export_apply 必须 False。
    for o in bpy.data.objects:
        o.select_set(o in (ob, rig))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(GLB),
        export_format="GLB",
        use_selection=True,
        export_skins=True,
        export_yup=True,
        export_apply=False,
        export_animations=False,
        export_morph=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_all_influences=False,
        export_def_bones=False,
    )
    print(f"[写出] {GLB}  {GLB.stat().st_size/1e6:.1f} MB")

    # ---- 回读校验 ----
    # 先把要对比的数值全部取出来：回读要删掉当前所有对象，之后 me / rig
    # 这些 StructRNA 就失效了（会抛 ReferenceError: StructRNA ... removed）。
    st = mesh_stats(me)
    height = max(v.co.z for v in me.vertices) - min(
        v.co.z for v in me.vertices)
    max_inf = 0
    for v in me.vertices:
        cnt = sum(1 for g in v.groups if g.weight > 1e-6)
        if cnt > max_inf:
            max_inf = cnt
    src_bones = len(rig.data.bones)
    src_verts = len(me.vertices)

    print("\n=== GLB 回读校验 ===")
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    ob2 = next((o for o in bpy.data.objects if o.type == "MESH"), None)
    rig2 = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    reload_info = {
        "mesh_found": ob2 is not None,
        "armature_found": rig2 is not None,
        "verts": len(ob2.data.vertices) if ob2 else 0,
        "polys": len(ob2.data.polygons) if ob2 else 0,
        "bones": len(rig2.data.bones) if rig2 else 0,
        "materials": [m.name for m in ob2.data.materials if m] if ob2 else [],
        "has_armature_modifier": any(m.type == "ARMATURE"
                                     for m in ob2.modifiers) if ob2 else False,
        "vertex_groups": len(ob2.vertex_groups) if ob2 else 0,
        "source_bones": src_bones, "source_verts": src_verts,
    }
    print(json.dumps(reload_info, ensure_ascii=False))
    # glTF 按 UV/法线接缝拆分顶点，所以顶点数允许小幅上浮
    reload_info["bones_match"] = reload_info["bones"] == src_bones
    reload_info["verts_within_split_tolerance"] = (
        src_verts <= reload_info["verts"] <= src_verts * 1.02)
    print(f"  骨骼数一致 {reload_info['bones_match']}   "
          f"顶点数（含接缝拆分上浮）"
          f"{reload_info['verts_within_split_tolerance']}")

    textures = []
    for name, t in tex_rep.get("textures", {}).items():
        textures.append({"name": name, "kind": t.get("kind"),
                         "size": t.get("size_after"),
                         "downsampled": t.get("downsampled")})
    for f in sorted(TEXDIR.glob("*.png")):
        textures.append({"file": f.name, "bytes": f.stat().st_size})

    out = {
        "source": {
            "file": src_probe["file"],
            "sha256": src_probe["sha256"],
            "size_bytes": src_probe["size_bytes"],
            "tris": src_probe["total_tris"],
            "verts": src_probe["total_verts"],
            "meshes": src_probe["mesh_count"],
            "materials": src_probe["material_count"],
            "textures": src_probe["texture_count"],
            "image_sizes": [[i["width"], i["height"]]
                            for i in src_probe["images"]],
            "skins": src_probe["skin_count"],
            "animations": src_probe["animation_count"],
            "extensions": src_probe["extensions_used"],
            "height_m_raw": audit["orientation"]["height_m_raw"],
        },
        "production": {
            "tris": st["tris"], "verts": st["verts"],
            "faces": st["faces"], "quads": st["quads"], "ngons": st["ngons"],
            "materials": len([m for m in me.materials if m]),
            "textures": textures,
            "bone_count": src_bones,
            "vertex_groups": reload_info["vertex_groups"],
            "max_influences_per_vertex": max_inf,
            "unweighted_vertices": w_rep["unweighted_vertices"],
            "weight_sum_errors": w_rep["weight_sum_errors"],
            "non_manifold_edges": st["non_manifold_edges"],
            "boundary_edges": st["boundary_edges"],
            "components": st["components"],
            "scale": "1.0（网格已按 1.65 m 归一，对象变换为单位矩阵）",
            "height_m": round(height, 5),
            "rest_pose": "A-Pose（源姿态，上臂外展实测 "
                         f"{rig_rep['arm_axis']['angle_from_vertical_deg']}°）",
            "animation": "无（本轮不做动画；骨架就绪供 Tennis-MoCap retarget）",
            "regions": w_rep["regions"],
            "joint_region_density": norm_rep.get("joint_region_density"),
            "tri_quality_before": norm_rep.get("tri_quality_before"),
            "arm_axis_deg": rig_rep["arm_axis"]["angle_from_vertical_deg"],
            "readable_after_reload": reload_info["mesh_found"]
            and reload_info["armature_found"],
            "glb_bytes": GLB.stat().st_size,
            "glb_sha256": sha256(GLB),
        },
        "reload_check": reload_info,
        "material_fix": norm_rep.get("material_fix"),
        "metallic_fix": tex_rep.get("metallic_fix"),
        "basecolor_self_shadow": tex_rep.get("basecolor_self_shadow"),
    }

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "production_asset.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"\n[写出] {REPORTS / 'production_asset.json'}")
    print(f"\n源 {out['source']['tris']} tris / {out['source']['verts']} verts"
          f"  →  成品 {st['tris']} tris / {st['verts']} verts")
    print(f"身高 {height:.4f} m   骨骼 {src_bones}   "
          f"顶点组 {reload_info['vertex_groups']}")
    return out


if __name__ == "__main__":
    main()
