#!/usr/bin/env python3
"""纯 Python 解析 GLB 的 JSON chunk，不经过 Blender。

用途：在任何导入/加工之前拿到源资产的客观事实（哈希、网格、材质、纹理、
扩展、skin/animation 有无、bbox）。这些数据会写进 reports/01_source_audit.json
的 source 段，并且是后续所有验证的比对基线。

只读：本脚本不修改任何文件。
"""

import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "reference" / "Ruth_High_Source.glb"


def read_glb(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", raw, 0)
    if magic != 0x46546C67:
        raise ValueError(f"不是 GLB（magic={magic:#x}）")
    chunks = []
    off = 12
    while off < length:
        clen, ctype = struct.unpack_from("<II", raw, off)
        chunks.append((ctype, raw[off + 8: off + 8 + clen]))
        off += 8 + clen
    js = next(c for ctype, c in chunks if ctype == 0x4E4F534A)
    bin_chunk = next((c for ctype, c in chunks if ctype == 0x004E4942), None)
    return version, length, json.loads(js.decode("utf-8")), bin_chunk, raw


def image_dims(data):
    """从 PNG / JPEG 字节流里读出宽高，不需要 PIL。"""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", data[16:24])
        return w, h, "PNG"
    if data[:2] == b"\xff\xd8":
        i = 2
        while i < len(data) - 9:
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                          0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", data[i + 5: i + 9])
                return w, h, "JPEG"
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            seg = struct.unpack(">H", data[i + 2: i + 4])[0]
            i += 2 + seg
    return None, None, "unknown"


def main():
    version, length, g, bin_chunk, raw = read_glb(SRC)

    out = {"file": SRC.name, "size_bytes": len(raw),
           "sha256": hashlib.sha256(raw).hexdigest(),
           "glb_version": version, "declared_length": length}

    a = g.get("asset", {})
    out["generator"] = a.get("generator")
    out["gltf_version"] = a.get("version")
    out["extensions_used"] = g.get("extensionsUsed", [])
    out["extensions_required"] = g.get("extensionsRequired", [])
    out["extensions"] = g.get("extensions", {})

    # ---- 网格 ----
    meshes = []
    total_tris = 0
    total_verts = 0
    for m in g.get("meshes", []):
        prims = []
        for p in m.get("primitives", []):
            pos = p["attributes"].get("POSITION")
            n_vert = g["accessors"][pos]["count"] if pos is not None else 0
            if p.get("indices") is not None:
                n_idx = g["accessors"][p["indices"]]["count"]
                tris = n_idx // 3
            else:
                tris = n_vert // 3
            total_tris += tris
            total_verts += n_vert
            prims.append({
                "mode": p.get("mode", 4),
                "attrs": sorted(p["attributes"].keys()),
                "verts": n_vert, "tris": tris,
                "material": g["materials"][p["material"]].get("name")
                if p.get("material") is not None else None,
            })
        meshes.append({"name": m.get("name"), "primitives": prims,
                       "n_primitives": len(prims)})
    out["meshes"] = meshes
    out["mesh_count"] = len(meshes)
    out["total_tris"] = total_tris
    out["total_verts"] = total_verts

    # ---- 节点 / 场景 ----
    out["node_count"] = len(g.get("nodes", []))
    out["nodes"] = [{"name": n.get("name"), "mesh": n.get("mesh"),
                     "skin": n.get("skin"),
                     "children": n.get("children"),
                     "has_matrix": "matrix" in n,
                     "rotation": n.get("rotation"),
                     "scale": n.get("scale"),
                     "translation": n.get("translation")}
                    for n in g.get("nodes", [])]
    out["scenes"] = g.get("scenes", [])

    # ---- 世界 bbox：对每个 mesh 节点的 POSITION accessor min/max 做变换 ----
    # 这里只做平移/旋转/缩放的简单串联，源文件只有单一 Y-up 节点，够用。
    def node_matrix(n):
        if "matrix" in n:
            m = n["matrix"]  # column-major
            return [m[0:4], m[4:8], m[8:12], m[12:16]]
        return None

    bbox = None
    for n in g.get("nodes", []):
        if n.get("mesh") is None:
            continue
        mat = node_matrix(n)
        for p in g["meshes"][n["mesh"]].get("primitives", []):
            acc = g["accessors"][p["attributes"]["POSITION"]]
            lo, hi = acc.get("min"), acc.get("max")
            if not lo:
                continue
            # 8 个角点做变换
            corners = []
            for xi in (lo[0], hi[0]):
                for yi in (lo[1], hi[1]):
                    for zi in (lo[2], hi[2]):
                        v = [xi, yi, zi]
                        if mat:
                            v = [sum(mat[r][c] * v[c] for c in range(3)) + mat[r][3]
                                 for r in range(3)]
                        corners.append(v)
            for c in corners:
                if bbox is None:
                    bbox = [list(c), list(c)]
                else:
                    for i in range(3):
                        bbox[0][i] = min(bbox[0][i], c[i])
                        bbox[1][i] = max(bbox[1][i], c[i])
    out["accessor_bbox"] = bbox
    if bbox:
        ext = [bbox[1][i] - bbox[0][i] for i in range(3)]
        out["accessor_bbox_extent"] = ext
        # 轴长判断：最长的轴是身高轴
        out["up_axis_index"] = ext.index(max(ext))
        out["source_height_m_raw"] = max(ext)

    # ---- 材质 ----
    mats = []
    for m in g.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        entry = {
            "name": m.get("name"),
            "baseColorFactor": pbr.get("baseColorFactor"),
            "metallicFactor": pbr.get("metallicFactor"),
            "roughnessFactor": pbr.get("roughnessFactor"),
            "baseColorTexture": pbr.get("baseColorTexture", {}).get("index")
            if pbr.get("baseColorTexture") else None,
            "metallicRoughnessTexture":
                pbr.get("metallicRoughnessTexture", {}).get("index")
                if pbr.get("metallicRoughnessTexture") else None,
            "normalTexture": m.get("normalTexture", {}).get("index")
            if m.get("normalTexture") else None,
            "occlusionTexture": m.get("occlusionTexture", {}).get("index")
            if m.get("occlusionTexture") else None,
            "emissiveTexture": m.get("emissiveTexture", {}).get("index")
            if m.get("emissiveTexture") else None,
            "emissiveFactor": m.get("emissiveFactor"),
            "alphaMode": m.get("alphaMode", "OPAQUE"),
            "alphaCutoff": m.get("alphaCutoff"),
            "doubleSided": m.get("doubleSided"),
            "extensions": m.get("extensions", {}),
        }
        mats.append(entry)
    out["materials"] = mats
    out["material_count"] = len(mats)

    # ---- 纹理 / 贴图 ----
    images = g.get("images", [])
    views = g.get("bufferViews", [])
    texs = []
    for i, img in enumerate(images):
        entry = {"index": i, "name": img.get("name"),
                 "mimeType": img.get("mimeType"),
                 "source": "bufferView" if "bufferView" in img else img.get("uri")}
        if "bufferView" in img and bin_chunk is not None and i < len(views):
            bv = views[img["bufferView"]]
            off = bv.get("byteOffset", 0)
            blob = bin_chunk[off: off + bv["byteLength"]]
            w, h, fmt = image_dims(blob)
            entry.update({"width": w, "height": h, "format": fmt,
                          "bytes": len(blob)})
        texs.append(entry)
    out["images"] = texs
    out["texture_count"] = len(g.get("textures", []))
    out["textures"] = g.get("textures", [])

    # ---- 采样器 ----
    out["samplers"] = g.get("samplers", [])

    # ---- 骨骼 / 动画 ----
    out["skins"] = [{"name": s.get("name"),
                     "joints": len(s.get("joints", [])),
                     "skeleton": s.get("skeleton")}
                    for s in g.get("skins", [])]
    out["skin_count"] = len(g.get("skins", []))
    out["animations"] = [{"name": an.get("name"),
                          "channels": len(an.get("channels", [])),
                          "samplers": len(an.get("samplers", []))}
                         for an in g.get("animations", [])]
    out["animation_count"] = len(g.get("animations", []))

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return out


if __name__ == "__main__":
    o = main()
    dest = ROOT / "reports" / "00_glb_probe.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(o, ensure_ascii=False, indent=2))
    print(f"\n[写出] {dest}", file=sys.stderr)
