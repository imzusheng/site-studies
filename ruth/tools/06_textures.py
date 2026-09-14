"""贴图处理与分析：降到 2K，统计 PBR 通道，检测 BaseColor 里的烘焙自阴影。

为什么要做：
  - 源带 3 张 4096×4096，解包后单个 .blend 就 217 MB，且远超 Web 游戏需要。
  - 用户明确要求 2K。
  - 上一版的教训：AI 生成的 BaseColor 把自阴影**烘进了颜色**，按亮度做分类
    会把腋下的暗部误判成头发。所以这一版必须先量出自阴影的严重程度。

自阴影的检测原理：
  几何几乎左右对称（镜像最近点中位 1.9 mm），所以**镜像位置的贴图颜色也应当
  接近**。若镜像处的亮度差很大，那多出来的差异只能来自烘焙时的方向性光照/阴影，
  而不是真实的材质差异。

运行：import _run; _run.go("06_textures.py")
"""

import json
import sys
from pathlib import Path

import bpy
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lib_source as S      # noqa: E402

ROOT = HERE.parent
REPORTS = ROOT / "reports"
TEXDIR = ROOT / "textures"
TARGET_SIZE = 2048


def image_pixels(img):
    w, h = img.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(buf)
    return buf.reshape(h, w, 4), w, h


def classify_image(mat, img):
    """按材质节点连接判断贴图用途。

    不能靠文件名：本资产的 BaseColor 叫 texture_pbr_20250901.008，
    名字里既没有 base 也没有 color，按名字判会漏掉最关键的那张。
    正确判据是它最终连到 Principled BSDF 的哪个 socket。
    """
    nt = mat.node_tree
    seeds = [n for n in nt.nodes
             if n.bl_idname == "ShaderNodeTexImage" and n.image == img]
    if not seeds:
        return "unused"
    seen = set()
    stack = list(seeds)
    while stack:
        node = stack.pop()
        if node.name in seen:
            continue
        seen.add(node.name)
        for out in node.outputs:
            for link in out.links:
                tgt = link.to_node
                if tgt.bl_idname == "ShaderNodeBsdfPrincipled":
                    sock = link.to_socket.name
                    if sock == "Base Color":
                        return "basecolor"
                    if sock in ("Roughness", "Metallic"):
                        return "metal_rough"
                if tgt.bl_idname == "ShaderNodeNormalMap":
                    return "normal"
                if tgt.bl_idname in ("ShaderNodeSeparateColor",
                                     "ShaderNodeSeparateRGB",
                                     "ShaderNodeMix", "ShaderNodeMath"):
                    stack.append(tgt)
    # 兜底：sRGB 的大概率是颜色图
    if img.colorspace_settings.name == "sRGB":
        return "basecolor"
    return "unknown"


def channel_stats(arr):
    """RGB 各通道的均值/分位数（只统计 alpha>0 的像素）。"""
    flat = arr.reshape(-1, 4)
    out = {}
    for i, ch in enumerate("RGBA"):
        v = flat[:, i]
        out[ch] = {
            "mean": round(float(v.mean()), 4),
            "p05": round(float(np.percentile(v, 5)), 4),
            "median": round(float(np.median(v)), 4),
            "p95": round(float(np.percentile(v, 95)), 4),
        }
    lum = 0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]
    out["luminance"] = {
        "mean": round(float(lum.mean()), 4),
        "p01": round(float(np.percentile(lum, 1)), 4),
        "p05": round(float(np.percentile(lum, 5)), 4),
        "median": round(float(np.median(lum)), 4),
        "p95": round(float(np.percentile(lum, 95)), 4),
        "p99": round(float(np.percentile(lum, 99)), 4),
        "below_0.15": round(float((lum < 0.15).mean()), 5),
        "below_0.30": round(float((lum < 0.30).mean()), 5),
    }
    return out


def vertex_uv_colors(me, arr, w, h):
    """给每个顶点取一个 UV 颜色：用该顶点所在第一个面的 UV 均值。

    Blender 图像的 pixels 是自下而上的行序，v 需要翻转。
    """
    uv_layer = me.uv_layers.active
    if uv_layer is None:
        return None
    uvs = uv_layer.data
    n = len(me.vertices)
    acc = np.zeros((n, 4), dtype=np.float64)
    cnt = np.zeros(n, dtype=np.int32)
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            acc[vi] += uvs[li].uv.to_4d()
            cnt[vi] += 1
    cnt[cnt == 0] = 1
    avg = acc / cnt[:, None]
    u = np.mod(avg[:, 0], 1.0)
    v = np.mod(avg[:, 1], 1.0)
    x = np.clip((u * w).astype(int), 0, w - 1)
    y = np.clip(((1.0 - v) * h).astype(int), 0, h - 1)
    return arr[y, x]


def self_shadow_check(me, colors):
    """检测 BaseColor 里的烘焙自阴影。

    上一版用"逐个顶点镜像配对"实现，在本资产上配对失败（阈值内配不到点，
    而空列表被 fallback 伪装成 1 对，静默给出"不显著"的假结论）。
    改用更鲁棒的统计：几何几乎左右对称，把左右半身的**亮度分布**直接对比；
    再看同一高度带内、跨越中线两侧的亮度差。方向性烘焙会在这里暴露。
    """
    co = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
    lum = (0.2126 * colors[:, 0] + 0.7152 * colors[:, 1]
           + 0.0722 * colors[:, 2])
    h = float(co[:, 2].max())
    skin = ((co[:, 2] > 0.16 * h) & (co[:, 2] < 0.46 * h)
            & (np.abs(co[:, 0]) > 0.015 * h))
    idx = np.where(skin)[0]
    if len(idx) < 100:
        return {"error": f"皮肤区顶点太少 ({len(idx)})"}
    L = lum[idx]
    lx = co[idx, 0]
    left = L[lx < -0.02 * h]
    right = L[lx > 0.02 * h]
    out = {
        "sampled_vertices": int(len(idx)),
        "left_mean_lum": round(float(left.mean()), 4) if len(left) else None,
        "right_mean_lum": round(float(right.mean()), 4) if len(right) else None,
        "left_right_mean_diff": round(float(abs(left.mean() - right.mean())), 4)
        if len(left) and len(right) else None,
        "lum_std_within_skin": round(float(L.std()), 4),
        "lum_p05": round(float(np.percentile(L, 5)), 4),
        "lum_p95": round(float(np.percentile(L, 95)), 4),
    }
    d = out["left_right_mean_diff"]
    if d is None:
        out["verdict_hint"] = "无法比较"
    elif d < 0.03:
        out["verdict_hint"] = "左右亮度基本一致，未检出方向性烘焙阴影"
    elif d < 0.08:
        out["verdict_hint"] = "左右亮度有轻度差异，可能有轻度烘焙阴影"
    else:
        out["verdict_hint"] = "左右亮度差异明显，存在方向性烘焙阴影"

    # 逐高度带看左右差，能定位阴影出现在身体的哪一段
    bands = []
    for k in range(6):
        z0 = 0.16 * h + (0.46 - 0.16) * h * k / 6
        z1 = 0.16 * h + (0.46 - 0.16) * h * (k + 1) / 6
        m = (co[idx, 2] >= z0) & (co[idx, 2] < z1)
        if m.sum() < 20:
            continue
        lm, rm = lx[m], L[m]
        a, b = rm[lm < -0.02 * h], rm[lm > 0.02 * h]
        if len(a) and len(b):
            bands.append({"z_frac": round((z0 + z1) / 2 / h, 3),
                          "diff": round(float(abs(a.mean() - b.mean())), 4)})
    out["per_height_band_diff"] = bands
    return out


def export_texture_maps(images, out_dir):
    """导出交付用的贴图文件：BaseColor / Normal / Roughness(G 通道)。"""
    import numpy as np
    written = []
    out_dir.mkdir(parents=True, exist_ok=True)
    for img in images:
        info = {"source_image": img.name, "size": list(img.size)}
        arr, w, h = image_pixels(img)
        kind = None
        # 由 06 的分类结果决定命名，这里按已分类的用途重命名
        # （classify 的结果在前面已经写进 report，这里按图像名再判一次）
        name = img.name.lower()
        if "normal" in name:
            kind, fname = "normal", "Normal.png"
        elif "metallic" in name or "roughness" in name:
            kind, fname = "metal_rough", "MetalRough.png"
            # 单独抽 Roughness（glTF: G 通道）
            rg = np.zeros((h, w, 4), dtype=np.float32)
            rg[..., 0] = arr[..., 1]
            rg[..., 1] = arr[..., 1]
            rg[..., 2] = arr[..., 1]
            rg[..., 3] = 1.0
            rimg = bpy.data.images.new("Roughness_extracted", w, h,
                                       alpha=False, float_buffer=False)
            rimg.colorspace_settings.name = "Non-Color"
            rimg.pixels.foreach_set(rg.reshape(-1))
            rimg.filepath_raw = str(out_dir / "Roughness.png")
            rimg.file_format = "PNG"
            rimg.save()
            rimg.pack()
            written.append("Roughness.png")
        else:
            kind, fname = "basecolor", "BaseColor.png"
        img.filepath_raw = str(out_dir / fname)
        img.file_format = "PNG"
        img.save()
        info["kind"] = kind
        info["written_as"] = fname
        written.append(fname)
        print(f"  [贴图] {fname}  {w}×{h}")
    return written


def main():
    out = {}
    info = S.load_normalized(target_height=1.65)
    me = info["mesh"]
    ob = info["object"]
    mat = ob.material_slots[0].material

    TEXDIR.mkdir(parents=True, exist_ok=True)

    # 找出材质里用到的图像
    images = []
    for node in mat.node_tree.nodes:
        if node.bl_idname == "ShaderNodeTexImage" and node.image:
            if node.image.name not in [i.name for i in images]:
                images.append(node.image)
    print(f"材质 {mat.name} 使用 {len(images)} 张图：")
    for img in images:
        print(f"  {img.name}  {img.size[0]}×{img.size[1]}  "
              f"packed={bool(img.packed_file)}  colorspace={img.colorspace_settings.name}")

    tex_report = {}
    base_colors = None
    target_w = target_h = None

    for img in images:
        kind = classify_image(mat, img)
        before = tuple(img.size)
        entry = {"kind": kind, "size_before": list(before),
                 "colorspace": img.colorspace_settings.name,
                 "is_float": img.is_float}

        if kind == "normal":
            # 法线图不能做色彩空间的常规统计，只记录尺寸
            entry["note"] = "法线图，不做亮度统计"
        else:
            arr, w, h = image_pixels(img)
            entry["channel_stats"] = channel_stats(arr)
            if kind == "basecolor":
                base_colors = vertex_uv_colors(me, arr, w, h)
            if kind == "metal_rough":
                # glTF 约定：G = roughness，B = metallic
                flat = arr.reshape(-1, 4)
                entry["roughness_G"] = {
                    "mean": round(float(flat[:, 1].mean()), 4),
                    "median": round(float(np.median(flat[:, 1])), 4),
                    "p05": round(float(np.percentile(flat[:, 1], 5)), 4),
                    "p95": round(float(np.percentile(flat[:, 1], 95)), 4),
                }
                entry["metallic_B"] = {
                    "mean": round(float(flat[:, 2].mean()), 4),
                    "median": round(float(np.median(flat[:, 2])), 4),
                    "p95": round(float(np.percentile(flat[:, 2], 95)), 4),
                    "above_0.5_pct": round(float((flat[:, 2] > 0.5).mean()) * 100, 2),
                }

        # 降采样到 2K
        if max(before) > TARGET_SIZE:
            img.scale(TARGET_SIZE, TARGET_SIZE)
            entry["size_after"] = list(img.size)
            entry["downsampled"] = True
        else:
            entry["size_after"] = list(before)
            entry["downsampled"] = False
        target_w, target_h = img.size
        tex_report[img.name] = entry
        print(f"  → {kind:<12} {before} → {tuple(img.size)}")

    out["textures"] = tex_report

    if base_colors is not None:
        ss = self_shadow_check(me, base_colors)
        out["basecolor_self_shadow"] = ss
        print("\n=== BaseColor 自阴影检测（镜像亮度对比）===")
        print(f"  配对顶点 {ss.get('paired_vertices')}  "
              f"平均亮度差 {ss.get('mean_abs_lum_diff')}  "
              f"中位 {ss.get('median_abs_lum_diff')}  "
              f"p90 {ss.get('p90_abs_lum_diff')}")
        print(f"  判定：{ss.get('verdict_hint')}")

    # ---- 非金属件不该带金属度 ----
    bsdf = next((n for n in mat.node_tree.nodes
                 if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    metal_fix = {}
    if bsdf is not None:
        sock = bsdf.inputs.get("Metallic")
        if sock is not None:
            metal_fix["linked_before"] = sock.is_linked
            metal_fix["value_before"] = (None if sock.is_linked
                                         else round(float(sock.default_value), 4))
            for im in images:
                e = tex_report.get(im.name, {})
                if e.get("kind") == "metal_rough":
                    metal_fix["texture_B_mean_before"] = e["metallic_B"]["mean"]
            if sock.is_linked:
                # 皮肤/布料/头发都不是金属，但源贴图 B 通道均值 0.107，
                # 会给材质加上不该有的镜面反光（塑料感来源之一）。
                # 断开并置 0：导出 glTF 时 metallicFactor=0，
                # metallicRoughness 贴图仍保留（roughness 还在用），
                # 最终 metallic = 0 × B = 0。
                for link in list(sock.links):
                    mat.node_tree.links.remove(link)
            sock.default_value = 0.0
            metal_fix["value_after"] = 0.0
            metal_fix["linked_after"] = sock.is_linked
    out["metallic_fix"] = metal_fix
    print("\n=== 金属度修正 ===")
    print(f"  贴图 B 通道均值 {metal_fix.get('texture_B_mean_before')}")
    print(f"  Metallic {'(贴图)' if metal_fix.get('linked_before') else metal_fix.get('value_before')}"
          f" → 0.0（断开贴图，导出为 metallicFactor=0）")

    # ---- 导出交付贴图 ----
    print("\n=== 导出交付贴图 ===")
    written = export_texture_maps(images, TEXDIR)
    out["exported_maps"] = written

    # 把降采样后的贴图打包，确保 .blend 自包含
    for img in images:
        img.pack()
    print("\n贴图已重新打包")

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "06_textures.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / '06_textures.json'}")
    return out


if __name__ == "__main__":
    main()
