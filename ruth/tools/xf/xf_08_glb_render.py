#!/usr/bin/env python3
"""GLB 成像 —— 独立于 Blender 的路径。

  几何：本脚本自己解析 GLB、自己求值骨骼动画、自己做线性混合蒙皮
  成像：本脚本自己的 z-buffer 软件光栅器（无 Blender、无 WebGL）
  机位：读 /tmp/xf_camera.json，与 Blender 侧完全一致

用法: XF_MARKS=all python3 xf_08_glb_render.py
"""
import json
import os
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
RUTH = REPO / "ruth"
GLB = RUTH / "build" / "ruth_forehand_v1.glb"
OUTDIR = RUTH / "validation" / "glb"
OUTDIR.mkdir(parents=True, exist_ok=True)
TMP = Path("/tmp")

MARKS = {"ready": 0, "backswing": 147, "contact": 164,
         "follow_through": 187, "recovery": 232}
FPS = 60.0

CAM = json.loads((TMP / "xf_camera.json").read_text())

# ------------------------------------------------------------------ GLB 读取
raw = GLB.read_bytes()
_, _, length = struct.unpack_from("<III", raw, 0)
off, chunks = 12, {}
while off < length:
    clen, ctype = struct.unpack_from("<II", raw, off)
    chunks[ctype] = raw[off + 8: off + 8 + clen]
    off += 8 + clen + ((4 - (clen % 4)) % 4 if clen % 4 else 0)
gltf = json.loads(chunks[0x4E4F534A].decode("utf-8"))
BIN = chunks[0x004E4942]

CT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
      5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def acc(i):
    a = gltf["accessors"][i]
    code, size = CT[a["componentType"]]
    n = NC[a["type"]]
    bv = gltf["bufferViews"][a["bufferView"]]
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride") or size * n
    fmt = f"<{n}{code}"
    out = np.empty((a["count"], n), dtype=np.float64)
    for k in range(a["count"]):
        out[k] = struct.unpack_from(fmt, BIN, base + k * stride)
    return out


nodes = gltf["nodes"]
mesh_nodes = [(i, n) for i, n in enumerate(nodes) if "mesh" in n]
body_node = next(i for i, n in mesh_nodes if n.get("mesh") == 0)
skin = gltf["skins"][nodes[body_node]["skin"]]
joints = skin["joints"]
ibm = acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)

prims = []
for mn, n in mesh_nodes:
    for p in gltf["meshes"][n["mesh"]]["primitives"]:
        prims.append((mn, p))

parent = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []):
        parent[c] = i
roots = [i for i in range(len(nodes)) if i not in parent]

anim = gltf["animations"][0]


def slerp(q0, q1, t):
    d = float(np.dot(q0, q1))
    if d < 0.0:
        q1, d = -q1, -d
    if d > 0.9995:
        r = q0 + t * (q1 - q0)
        return r / np.linalg.norm(r)
    th = np.arccos(np.clip(d, -1, 1))
    st = np.sin(th)
    return (np.sin((1 - t) * th) / st) * q0 + (np.sin(t * th) / st) * q1


class Track:
    def __init__(self, s):
        self.t = acc(s["input"]).ravel()
        self.o = acc(s["output"])
        self.interp = s.get("interpolation", "LINEAR")

    def at(self, time):
        t = self.t
        if time <= t[0]:
            return self.o[0]
        if time >= t[-1]:
            return self.o[-1]
        i = int(np.searchsorted(t, time, side="right") - 1)
        a = (time - t[i]) / (t[i + 1] - t[i])
        if self.interp == "STEP":
            return self.o[i]
        return self.o[i] + (self.o[i + 1] - self.o[i]) * a


tracks = {}
for c in anim["channels"]:
    tracks.setdefault(c["target"]["node"], {})[c["target"]["path"]] = \
        Track(anim["samplers"][c["sampler"]])


def local_matrix(i, time):
    n = nodes[i]
    tr = tracks.get(i, {})
    T = tr["translation"].at(time) if "translation" in tr else np.array(
        n.get("translation", [0.0, 0.0, 0.0]))
    q = tr["rotation"].at(time) if "rotation" in tr else np.array(
        n.get("rotation", [0.0, 0.0, 0.0, 1.0]))
    S = tr["scale"].at(time) if "scale" in tr else np.array(
        n.get("scale", [1.0, 1.0, 1.0]))
    x, y, z, w = q
    R = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4)
    M[:3, :3] = R * S[None, :]
    M[:3, 3] = T
    return M


def globals_at(time):
    G = {}

    def walk(i):
        L = local_matrix(i, time)
        G[i] = (G[parent[i]] @ L) if i in parent else L
        for c in nodes[i].get("children", []):
            walk(c)

    for r in roots:
        walk(r)
    return G


# ------------------------------------------------------------------ 相机
RES_W, RES_H = CAM["resolution"]
# GLB 顶点是 Y-up（导出器已把 Blender 的 Z-up 转成 (x, z, -y)，实测 rest 完全吻合），
# 所以相机规格也要做同样的转换，否则会出现 90° 翻转。
def zup_to_yup(v):
    return np.array([v[0], v[2], -v[1]], dtype=np.float64)


pos = zup_to_yup(CAM["position"])
tgt = zup_to_yup(CAM["target"])
lens, sensor = CAM["lens_mm"], CAM["sensor_width_mm"]
fov_y = 2.0 * np.arctan(sensor / (2.0 * lens))
tan_half = np.tan(fov_y / 2.0)
aspect = RES_W / RES_H

fwd = tgt - pos
fwd /= np.linalg.norm(fwd)
up_w = np.array([0.0, 1.0, 0.0])
right = np.cross(fwd, up_w)
right /= np.linalg.norm(right)
up = np.cross(right, fwd)

LIGHT1 = (fwd * 0.55 + right * -0.75 + up * 0.35)
LIGHT1 /= np.linalg.norm(LIGHT1)
LIGHT2 = (fwd * 0.35 + right * 0.85 + up * -0.15)
LIGHT2 /= np.linalg.norm(LIGHT2)
AMBIENT = 0.34
BG = np.array([0.18, 0.19, 0.21])


def view_pts(P):
    d = P - pos
    return np.stack([d @ right, d @ up, d @ fwd], axis=1)


def raster(P, N, tri, out_png, base_rgb=(0.82, 0.81, 0.80)):
    V = view_pts(P)
    z = V[:, 2]
    inv = 1.0 / np.maximum(z, 1e-6)
    px = (V[:, 0] * inv) / (tan_half * aspect)
    py = (V[:, 1] * inv) / tan_half
    sx = (px * 0.5 + 0.5) * RES_W
    sy = (1.0 - (py * 0.5 + 0.5)) * RES_H

    zbuf = np.full((RES_H, RES_W), np.inf, dtype=np.float64)
    img = np.tile(BG, (RES_H, RES_W, 1))

    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    zf = z[a] > 1e-4
    keep = zf & (z[b] > 1e-4) & (z[c] > 1e-4)
    a, b, c = a[keep], b[keep], c[keep]
    # 背面剔除（视图空间）
    s = ((sx[b] - sx[a]) * (sy[c] - sy[a]) - (sy[b] - sy[a]) * (sx[c] - sx[a]))
    front = s > 0
    a, b, c = a[front], b[front], c[front]
    s = s[front]
    x0, x1 = np.minimum.reduce([sx[a], sx[b], sx[c]]), np.maximum.reduce([sx[a], sx[b], sx[c]])
    y0, y1 = np.minimum.reduce([sy[a], sy[b], sy[c]]), np.maximum.reduce([sy[a], sy[b], sy[c]])
    ok = (x1 >= 0) & (x0 <= RES_W - 1) & (y1 >= 0) & (y0 <= RES_H - 1)
    a, b, c, s = a[ok], b[ok], c[ok], s[ok]
    x0, x1, y0, y1 = x0[ok], x1[ok], y0[ok], y1[ok]

    n_kept = 0
    for k in range(len(a)):
        ia, ib, ic = a[k], b[k], c[k]
        ix0 = max(int(np.floor(x0[k])), 0)
        ix1 = min(int(np.ceil(x1[k])), RES_W - 1)
        iy0 = max(int(np.floor(y0[k])), 0)
        iy1 = min(int(np.ceil(y1[k])), RES_H - 1)
        if ix1 < ix0 or iy1 < iy0:
            continue
        xs = np.arange(ix0, ix1 + 1) + 0.5
        ys = np.arange(iy0, iy1 + 1) + 0.5
        gx, gy = np.meshgrid(xs, ys)
        ax, ay = sx[ia], sy[ia]
        bx, by = sx[ib], sy[ib]
        cx, cy = sx[ic], sy[ic]
        d = s[k]
        w0 = ((bx - ax) * (gy - ay) - (by - ay) * (gx - ax)) / d
        w1 = ((cx - bx) * (gy - by) - (cy - by) * (gx - bx)) / d
        w2 = 1.0 - w0 - w1
        # 与 B 的版本方向一致即可，这里以重心坐标 w0+w1+w2 判内
        inside = (w0 >= -1e-9) & (w1 >= -1e-9) & (w2 >= -1e-9)
        if not inside.any():
            continue
        zi = w0 * z[ib] + w1 * z[ic] + w2 * z[ia]
        # 重心坐标对应 (B, C, A)
        nlist = (w0[..., None] * N[ib] + w1[..., None] * N[ic]
                 + w2[..., None] * N[ia])
        nlist /= np.maximum(np.linalg.norm(nlist, axis=-1, keepdims=True), 1e-9)
        lam = np.clip(nlist @ LIGHT1, 0, 1) * 0.85 \
            + np.clip(nlist @ LIGHT2, 0, 1) * 0.30 + AMBIENT
        col = np.clip(np.array(base_rgb)[None, None, :] * lam[..., None], 0, 1)
        sub_z = zbuf[iy0:iy1 + 1, ix0:ix1 + 1]
        sub_img = img[iy0:iy1 + 1, ix0:ix1 + 1]
        mask = inside & (zi < sub_z)
        if not mask.any():
            continue
        sub_z[mask] = zi[mask]
        sub_img[mask] = col[mask]
        n_kept += 1

    Image.fromarray((img * 255).astype(np.uint8)).save(out_png)
    return n_kept, len(a)


marks = os.environ.get("XF_MARKS", "all")
todo = MARKS if marks == "all" else {k: MARKS[k] for k in marks.split(",")}
info = {}
for mark, fr in todo.items():
    time = fr / FPS
    G = globals_at(time)
    JM = np.zeros((len(joints), 4, 4))
    for k, jn in enumerate(joints):
        JM[k] = G.get(jn, np.eye(4)) @ ibm[k]

    P_all, N_all, T_all = [], [], []
    vbase = 0
    for mn, p in prims:
        at = p["attributes"]
        P = acc(at["POSITION"])
        N = acc(at["NORMAL"])
        T = acc(p["indices"]).astype(np.int64).ravel().reshape(-1, 3)
        if "JOINTS_0" in at:
            J = acc(at["JOINTS_0"]).astype(np.int64)
            W = acc(at["WEIGHTS_0"])
            P2 = np.zeros_like(P)
            N2 = np.zeros_like(N)
            for k in range(4):
                j = J[:, k]
                w = W[:, k]
                R = JM[j, :3, :3]
                P2 += w[:, None] * (np.einsum("nij,nj->ni", R, P)
                                    + JM[j, :3, 3])
                N2 += w[:, None] * np.einsum("nij,nj->ni", R, N)
            P, N = P2, N2
        else:
            # 非蒙皮（球拍）：应用从 mesh 节点到根的变换
            chain = []
            i = mn
            while i is not None:
                chain.append(i)
                i = parent.get(i)
            M = np.eye(4)
            for i in reversed(chain):
                M = M @ local_matrix(i, time)
            P = P @ M[:3, :3].T + M[:3, 3]
            N = N @ M[:3, :3].T
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        P_all.append(P)
        N_all.append(N)
        T_all.append(T + vbase)
        vbase += len(P)

    P = np.concatenate(P_all)
    N = np.concatenate(N_all)
    T = np.concatenate(T_all)
    kept, total = raster(P, N, T, OUTDIR / f"{mark}.png")
    info[mark] = {"frame": fr, "tris_drawn": kept, "tris_in_view": total}
    print(f"[{mark}] frame={fr} t={time:.3f}s 三角 {total} 中绘制 {kept} → "
          f"{(OUTDIR/f'{mark}.png').name}")

(TMP / "xf_glb_render_info.json").write_text(
    json.dumps({"camera": CAM, "marks": info}, ensure_ascii=False, indent=2))
print(f"[写出] {TMP/'xf_glb_render_info.json'}")
