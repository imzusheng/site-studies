# -*- coding: utf-8 -*-
"""教练角色 01 · 导入 + 现状体检

目标：在动手改之前，把 High Source 的真实结构量清楚，尤其是不容易从
glb 文件头看出来的东西——松散块（loose parts）的数量、位置、面数分布。
拆分对象要靠它。

在 Blender 里跑：
    exec(open('/Users/lizusheng/.zcode/workspace/default/site-studies/coach/tools/01_import_analyze.py', encoding='utf-8').read())
"""

import bpy
import bmesh
import json
import os
import struct
from mathutils import Vector

SRC = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach/reference/Coach_High_Source.glb"
REPORT_DIR = "/Users/lizusheng/.zcode/workspace/default/site-studies/coach/reports"
REPORT = os.path.join(REPORT_DIR, "01_intake.json")

os.makedirs(REPORT_DIR, exist_ok=True)
report = {}


# ---------------------------------------------------------------- 原始 glb 头
def read_glb_json(path):
    """直接读 glb 的 JSON chunk，拿到 Blender 导入后会丢掉/改写的扩展原始值。"""
    with open(path, "rb") as f:
        magic, version, length = struct.unpack("<III", f.read(12))
        assert magic == 0x46546C67, "不是 glb"
        while f.tell() < length:
            clen, ctype = struct.unpack("<II", f.read(8))
            chunk = f.read(clen)
            if ctype == 0x4E4F534A:  # JSON
                return json.loads(chunk.decode("utf-8"))
    return {}


gltf = read_glb_json(SRC)
report["glb_header"] = {
    "version_ok": True,
    "generator": gltf.get("asset", {}).get("generator"),
    "extensions_used": gltf.get("extensionsUsed", []),
    "extensions_required": gltf.get("extensionsRequired", []),
    "node_count": len(gltf.get("nodes", [])),
    "mesh_count": len(gltf.get("meshes", [])),
    "skins": len(gltf.get("skins", [])),
    "animations": len(gltf.get("animations", [])),
    "materials": gltf.get("materials", []),
    "images": [
        {"mimeType": i.get("mimeType"), "name": i.get("name")}
        for i in gltf.get("images", [])
    ],
}


# ---------------------------------------------------------------- 导入
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

bpy.ops.import_scene.gltf(filepath=SRC)

print("=" * 70)
print("导入完成")
print("=" * 70)

report["imported_objects"] = [
    {
        "name": ob.name,
        "type": ob.type,
        "verts": len(ob.data.vertices) if ob.type == "MESH" else None,
        "polys": len(ob.data.polygons) if ob.type == "MESH" else None,
        "transform": {
            "loc": [round(v, 5) for v in ob.location],
            "rot_euler_deg": [round(v * 57.29578, 3) for v in ob.rotation_euler],
            "scale": [round(v, 5) for v in ob.scale],
        },
    }
    for ob in bpy.data.objects
]

mesh_obs = [ob for ob in bpy.data.objects if ob.type == "MESH"]
parts_all = []

for ob in mesh_obs:
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    tris = sum(len(f.verts) - 2 for f in bm.faces)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    ngons = sum(1 for f in bm.faces if len(f.verts) > 4)
    tri_faces = sum(1 for f in bm.faces if len(f.verts) == 3)

    non_manifold = [e for e in bm.edges if not e.is_manifold]
    boundary = [e for e in bm.edges if e.is_boundary]

    # ---- 松散块：按边做并查集 ----
    parent = list(range(len(bm.verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for e in bm.edges:
        union(e.verts[0].index, e.verts[1].index)

    groups = {}
    for v in bm.verts:
        groups.setdefault(find(v.index), []).append(v.index)

    loose = []
    for root, idxs in groups.items():
        pts = [bm.verts[i].co for i in idxs]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        center = (lo + hi) / 2
        size = hi - lo
        # 该松散块占多少面
        vset = set(idxs)
        face_count = sum(1 for f in bm.faces if f.verts[0].index in vset)
        loose.append(
            {
                "verts": len(idxs),
                "faces": face_count,
                "center": [round(c, 4) for c in center],
                "size": [round(s, 4) for s in size],
                "z_min": round(lo.z, 4),
                "z_max": round(hi.z, 4),
                "x_min": round(lo.x, 4),
                "x_max": round(hi.x, 4),
                "y_min": round(lo.y, 4),
                "y_max": round(hi.y, 4),
            }
        )
    loose.sort(key=lambda p: -p["verts"])

    entry = {
        "object": ob.name,
        "verts": len(bm.verts),
        "edges": len(bm.edges),
        "faces": len(bm.faces),
        "tris": tris,
        "tri_faces": tri_faces,
        "quad_faces": quads,
        "ngon_faces": ngons,
        "non_manifold_edges": len(non_manifold),
        "boundary_edges": len(boundary),
        "has_custom_normals": me.has_custom_normals,
        "uv_layers": [uv.name for uv in me.uv_layers],
        "color_attrs": [c.name for c in me.color_attributes],
        "vertex_groups": [g.name for g in ob.vertex_groups],
        "modifiers": [(m.name, m.type) for m in ob.modifiers],
        "loose_part_count": len(loose),
        "loose_parts": loose,
        "material_slots": [s.material.name if s.material else None for s in ob.material_slots],
    }

    # 世界坐标包围盒（考虑对象变换）
    mw = ob.matrix_world
    world_pts = [mw @ v.co for v in bm.verts]
    entry["world_bbox"] = {
        "min": [round(min(p[i] for p in world_pts), 4) for i in range(3)],
        "max": [round(max(p[i] for p in world_pts), 4) for i in range(3)],
    }
    entry["world_height"] = round(
        max(p.z for p in world_pts) - min(p.z for p in world_pts), 4
    )
    report[f"mesh::{ob.name}"] = entry
    parts_all.append(entry)

    bm.free()

print("\n--- 网格总览 ---")
for e in parts_all:
    print(
        f"{e['object']}: verts={e['verts']} tris={e['tris']} "
        f"(tri面 {e['tri_faces']} / quad面 {e['quad_faces']} / ngon {e['ngon_faces']})"
    )
    print(
        f"  非流形边 {e['non_manifold_edges']} / 边界边 {e['boundary_edges']} / "
        f"松散块 {e['loose_part_count']}"
    )
    print(f"  世界高 {e['world_height']} m  bbox {e['world_bbox']}")
    print(f"  UV {e['uv_layers']}  顶点组 {e['vertex_groups']}  修改器 {e['modifiers']}")

print("\n--- 松散块分布（按顶点数降序，前 40）---")
for e in parts_all:
    print(f"\n[{e['object']}] 共 {e['loose_part_count']} 块")
    for i, p in enumerate(e["loose_parts"][:40]):
        print(
            f"  #{i:>2} v={p['verts']:>6} f={p['faces']:>6} "
            f"center=({p['center'][0]:>7.3f},{p['center'][1]:>7.3f},{p['center'][2]:>7.3f}) "
            f"size=({p['size'][0]:.3f},{p['size'][1]:.3f},{p['size'][2]:.3f}) "
            f"z=[{p['z_min']:.3f},{p['z_max']:.3f}]"
        )

# ---------------------------------------------------------------- 贴图
print("\n--- 贴图 ---")
imgs = []
for im in bpy.data.images:
    if im.name == "Render Result":
        continue
    px = len(im.pixels) if im.has_data else 0
    info = {
        "name": im.name,
        "size": list(im.size),
        "channels": im.channels,
        "colorspace": im.colorspace_settings.name,
        "packed": bool(im.packed_file),
        "file_format": im.file_format,
        "float_buffer": im.is_float,
        "filepath": os.path.basename(im.filepath) if im.filepath else None,
    }
    imgs.append(info)
    print(
        f"  {info['name']}: {info['size'][0]}x{info['size'][1]} "
        f"ch={info['channels']} cs={info['colorspace']} packed={info['packed']}"
    )
report["images"] = imgs

# ---------------------------------------------------------------- 材质
print("\n--- 材质节点 ---")
mats = []
for mat in bpy.data.materials:
    nodes = []
    for n in mat.node_tree.nodes if mat.use_nodes else []:
        entry = {"name": n.name, "type": n.type}
        if n.type == "BSDF_PRINCIPLED":
            for key in (
                "Base Color",
                "Metallic",
                "Roughness",
                "IOR",
                "Alpha",
                "Specular IOR Level",
                "Specular Tint",
                "Normal",
                "Emission Color",
                "Emission Strength",
                "Coat Weight",
            ):
                if key in n.inputs:
                    s = n.inputs[key]
                    if s.is_linked:
                        entry[key] = f"<-{s.links[0].from_node.type}"
                    else:
                        try:
                            v = list(s.default_value)
                            entry[key] = [round(x, 4) for x in v]
                        except TypeError:
                            entry[key] = round(float(s.default_value), 4)
        if n.type == "TEX_IMAGE":
            entry["image"] = n.image.name if n.image else None
        nodes.append(entry)
    mats.append({"material": mat.name, "blend_method": mat.blend_method, "nodes": nodes})
    print(f"\n[{mat.name}] blend={mat.blend_method}")
    for n in nodes:
        print("   ", n)
report["materials"] = mats

# ---------------------------------------------------------------- 场景
report["scene_unit"] = bpy.context.scene.unit_settings.system
report["blender_version"] = bpy.app.version_string

with open(REPORT, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print("\n" + "=" * 70)
print(f"报告写入 {REPORT}")
print("=" * 70)
