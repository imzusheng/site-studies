#!/usr/bin/env python3
"""GLB 独立数值审计 —— 不经过 Blender 的 glTF runtime。

做四件事：
  1. 结构审计：skin.joints / inverseBindMatrices / JOINTS_0 / WEIGHTS_0 /
     JOINTS_1 / 每顶点影响数 / 权重和 / joint index 越界
  2. 逐帧求值动画 → 骨架全局变换 → jointMatrix = globalJoint @ IBM
     检查 NaN / Inf / determinant / 退化 scale / 异常 translation
  3. 用 LBS 独立重建每帧顶点位置，与 Blender depsgraph 的结果逐顶点比对
     （这一条直接说明 GLB 导出是否忠实）
  4. 对每条被撕开的边做贡献分解，回答"这个三角为什么被拉过去"

用法: python3 xf_07_glb_audit.py
"""
import json
import struct
import sys
from collections import Counter
from pathlib import Path

import numpy as np

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
RUTH = REPO / "ruth"
GLB = RUTH / "build" / "ruth_forehand_v1.glb"
OUT = RUTH / "reports" / "skin_matrix_audit.json"
TMP = Path("/tmp")

MARKS = {"ready": 0, "backswing": 147, "contact": 164,
         "follow_through": 187, "recovery": 232}
FPS = 60.0

# ------------------------------------------------------------------ GLB 容器
raw = GLB.read_bytes()
magic, version, length = struct.unpack_from("<III", raw, 0)
assert magic == 0x46546C67, "不是 GLB"
off = 12
chunks = {}
while off < length:
    clen, ctype = struct.unpack_from("<II", raw, off)
    chunks[ctype] = raw[off + 8: off + 8 + clen]
    off += 8 + clen + ((4 - (clen % 4)) % 4 if clen % 4 else 0)

gltf = json.loads(chunks[0x4E4F534A].decode("utf-8"))
BIN = chunks.get(0x004E4942, b"")

CT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
      5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def accessor(i):
    a = gltf["accessors"][i]
    code, size = CT[a["componentType"]]
    n = NC[a["type"]]
    bv = gltf["bufferViews"][a["bufferView"]]
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride") or (size * n)
    count = a["count"]
    fmt = f"<{n}{code}"
    out = np.empty((count, n), dtype=np.float64)
    for k in range(count):
        out[k] = struct.unpack_from(fmt, BIN, base + k * stride)
    if a.get("normalized"):
        mx = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}.get(
            a["componentType"])
        if mx:
            out /= mx
            out = np.clip(out, -1.0, 1.0)
    return out


# ------------------------------------------------------------------ 结构审计
meshes = gltf.get("meshes", [])
prims = [p for m in meshes for p in m["primitives"]]
skins = gltf.get("skins", [])
nodes = gltf.get("nodes", [])
anims = gltf.get("animations", [])

struct_rep = {
    "file": str(GLB.relative_to(REPO)),
    "bytes": len(raw),
    "gltf_generator": gltf.get("asset", {}).get("generator"),
    "gltf_version": gltf.get("asset", {}).get("version"),
    "extensions_used": gltf.get("extensionsUsed", []),
    "extensions_required": gltf.get("extensionsRequired", []),
    "counts": {
        "nodes": len(nodes), "meshes": len(meshes), "primitives": len(prims),
        "skins": len(skins), "animations": len(anims),
        "materials": len(gltf.get("materials", [])),
        "images": len(gltf.get("images", [])),
    },
}

skin = skins[0] if skins else None
if skin is None:
    print("!! GLB 没有 skin")
    sys.exit(1)

joints = skin["joints"]
ibm = accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
struct_rep["skin"] = {
    "joint_count": len(joints),
    "ibm_count": int(ibm.shape[0]),
    "skeleton_root_node": skin.get("skeleton"),
    "joint_names": [nodes[j].get("name", f"node{j}") for j in joints],
    "ibm_matches_joint_count": bool(ibm.shape[0] == len(joints)),
}

attr_rep = {}
for pi, p in enumerate(prims):
    a = p["attributes"]
    ent = {"attributes": sorted(a.keys()),
           "has_joints_0": "JOINTS_0" in a, "has_weights_0": "WEIGHTS_0" in a,
           "has_joints_1": "JOINTS_1" in a, "has_weights_1": "WEIGHTS_1" in a,
           "modes": p.get("mode", 4)}
    if "JOINTS_0" in a:
        J = accessor(a["JOINTS_0"]).astype(np.int64)
        Wt = accessor(a["WEIGHTS_0"])
        ent["vertex_count"] = int(J.shape[0])
        ent["joint_index_max"] = int(J.max())
        ent["joint_index_out_of_range"] = int((J > len(joints) - 1).sum())
        ent["joint_index_negative"] = int((J < 0).sum())
        ent["weight_sum"] = {
            "min": round(float(Wt.sum(1).min()), 6),
            "max": round(float(Wt.sum(1).max()), 6),
            "n_not_one": int((np.abs(Wt.sum(1) - 1.0) > 1e-4).sum()),
        }
        ent["influences_per_vertex"] = {
            "max": int((Wt > 1e-7).sum(1).max()),
            "hist": {str(k): int((((Wt > 1e-7).sum(1)) == k).sum())
                     for k in range(1, 5)},
        }
        ent["joints_used_count"] = int(len(np.unique(J[Wt > 1e-7])))
        ent["joints_never_weighted"] = sorted(
            [nodes[joints[j]].get("name", str(j)) for j in range(len(joints))
             if j not in set(np.unique(J[Wt > 1e-7]).tolist())])
        attr_rep[f"primitive_{pi}"] = ent
struct_rep["primitives"] = attr_rep

# ------------------------------------------------------------------ 动画求值
anim = anims[0]
samplers = anim["samplers"]
channels = anim["channels"]
interps = Counter(s.get("interpolation", "LINEAR") for s in samplers)
struct_rep["animation"] = {
    "name": anim.get("name"),
    "channels": len(channels),
    "samplers": len(samplers),
    "interpolations": dict(interps),
    "targets": dict(Counter(c["target"]["path"] for c in channels)),
    "animated_nodes": len({c["target"]["node"] for c in channels}),
}


def slerp(q0, q1, t):
    d = float(np.dot(q0, q1))
    if d < 0.0:
        q1 = -q1
        d = -d
    if d > 0.9995:
        r = q0 + t * (q1 - q0)
        return r / np.linalg.norm(r)
    th = np.arccos(np.clip(d, -1.0, 1.0))
    st = np.sin(th)
    return (np.sin((1 - t) * th) / st) * q0 + (np.sin(t * th) / st) * q1


class Track:
    def __init__(self, sampler):
        self.t = accessor(sampler["input"]).ravel()
        out = accessor(sampler["output"])
        self.out = out
        self.interp = sampler.get("interpolation", "LINEAR")

    def at(self, time):
        t = self.t
        if time <= t[0]:
            i, a = 0, 0.0
        elif time >= t[-1]:
            i, a = len(t) - 2, 1.0
        else:
            i = int(np.searchsorted(t, time, side="right") - 1)
            a = (time - t[i]) / (t[i + 1] - t[i])
        v0, v1 = self.out[i], self.out[i + 1]
        if self.interp == "STEP":
            return v0
        if self.interp == "CUBICSPLINE":
            # layout: [in-tangent, value, out-tangent] per key
            v0 = self.out[i * 3 + 1]
            v1 = self.out[(i + 1) * 3 + 1]
            m0 = self.out[i * 3 + 2] * (t[i + 1] - t[i])
            m1 = self.out[(i + 1) * 3] * (t[i + 1] - t[i])
            h = t[i + 1] - t[i]
            a2, a3 = a * a, a * a * a
            return ((2 * a3 - 3 * a2 + 1) * v0 + (a3 - 2 * a2 + a) * m0
                    + (-2 * a3 + 3 * a2) * v1 + (a3 - a2) * m1)
        return v0 + (v1 - v0) * a


tracks = {}
for c in channels:
    n, path = c["target"]["node"], c["target"]["path"]
    tracks.setdefault(n, {})[path] = Track(samplers[c["sampler"]])

parent = {}
for i, n in enumerate(nodes):
    for ch in n.get("children", []):
        parent[ch] = i
roots = [i for i in range(len(nodes)) if i not in parent]


def local_matrix(i, time):
    n = nodes[i]
    if "matrix" in n:
        return np.array(n["matrix"]).reshape(4, 4).T
    tr = tracks.get(i, {})
    if "translation" in tr:
        T = tr["translation"].at(time)
    else:
        T = np.array(n.get("translation", [0.0, 0.0, 0.0]))
    if "rotation" in tr:
        q = tr["rotation"].at(time)
    else:
        q = np.array(n.get("rotation", [0.0, 0.0, 0.0, 1.0]))
    if "scale" in tr:
        S = tr["scale"].at(time)
    else:
        S = np.array(n.get("scale", [1.0, 1.0, 1.0]))
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
        for ch in nodes[i].get("children", []):
            walk(ch)

    for r in roots:
        walk(r)
    return G


# ------------------------------------------------------------------ 蒙皮
P_rest = accessor(prims[0]["attributes"]["POSITION"]).astype(np.float64)
J = accessor(prims[0]["attributes"]["JOINTS_0"]).astype(np.int64)
Wt = accessor(prims[0]["attributes"]["WEIGHTS_0"]).astype(np.float64)
tri = accessor(prims[0]["indices"]).astype(np.int64).ravel().reshape(-1, 3)

joint_names = [nodes[j].get("name", f"node{j}") for j in joints]
name2local = {joint_names[k]: k for k in range(len(joints))}


def skin_at(time, return_jm=False):
    G = globals_at(time)
    JM = np.zeros((len(joints), 4, 4))
    for k, jn in enumerate(joints):
        gj = G.get(jn, np.eye(4))
        JM[k] = gj @ ibm[k]
    P = np.zeros_like(P_rest)
    for k in range(4):
        j = J[:, k]
        w = Wt[:, k]
        R = JM[j, :3, :3]
        T = JM[j, :3, 3]
        P += w[:, None] * (np.einsum("nij,nj->ni", R, P_rest) + T)
    return (P, JM) if return_jm else P


# ---------------------------------------------------- Blender 侧对账数据（Z-up）
bl = np.load(TMP / "xf_blender_deformed.npz")
rest_bl = bl["__rest__"]                      # (31959, 3) Blender 空间 rest


def zup_to_yup(p):
    return np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)


def match_to(ref, source):
    """把 source 的每个顶点按 rest 位置映射到 ref 的索引；返回 (idx, 未匹配数)。"""
    key = {}
    for i in range(len(ref)):
        key.setdefault(tuple(np.round(ref[i] / 1e-5).astype(np.int64)), i)
    idx = np.full(len(source), -1, dtype=np.int64)
    for i in range(len(source)):
        idx[i] = key.get(tuple(np.round(source[i] / 1e-5).astype(np.int64)), -1)
    return idx, int((idx < 0).sum())


# 实测判定导出器的轴约定：GLB rest 直接对 Blender rest，还是对转成 Y-up 的
map_id, un_id = match_to(rest_bl, P_rest)
map_yu, un_yu = match_to(zup_to_yup(rest_bl), P_rest)
axis_mode = "zup_to_yup" if un_yu < un_id else "as_is"
glb2bl, n_unmatched = (map_yu, un_yu) if axis_mode == "zup_to_yup" else (map_id, un_id)
to_gltf = zup_to_yup if axis_mode == "zup_to_yup" else (lambda p: p)
recon = {
    "axis_mode": axis_mode,
    "unmatched_as_is": un_id,
    "unmatched_zup_to_yup": un_yu,
    "glb_vertices": int(len(P_rest)),
    "blender_vertices": int(len(rest_bl)),
    "glb_vertices_unmatched": n_unmatched,
    "note": "glTF 会沿 UV/normal 缝拆点，所以 GLB 顶点数略多于 Blender；"
            "比对时按 rest 位置回映射",
}
print(f"\n轴约定实测: as_is 未匹配 {un_id} / zup_to_yup 未匹配 {un_yu} "
      f"→ {axis_mode}")



edges = np.array(sorted({tuple(sorted((int(t[0]), int(t[1]))))
                         for t in tri} | {tuple(sorted((int(t[1]), int(t[2]))))
                                          for t in tri}
                         | {tuple(sorted((int(t[0]), int(t[2]))))
                            for t in tri}), dtype=np.int64)
rest_len = np.linalg.norm(P_rest[edges[:, 0]] - P_rest[edges[:, 1]], axis=1)

# 每个顶点的 top-4 joint（供归因输出）
def weights_of(vi):
    return sorted([(joint_names[J[vi, k]], round(float(Wt[vi, k]), 4))
                   for k in range(4) if Wt[vi, k] > 1e-7],
                  key=lambda t: -t[1])


report = {
    "tool": "xf_07_glb_audit.py（纯 Python，不经过 Blender 导入器）",
    "structural": struct_rep,
    "blender_reconciliation": recon,
    "frames": {},
}
print("=" * 78)
print(f"GLB {GLB.name}  {len(raw)/1e6:.1f} MB   generator={struct_rep['gltf_generator']}")
print(f"skin.joints={len(joints)}  IBM={ibm.shape[0]}  "
      f"prims={len(prims)}  anim_channels={len(channels)}")
print(f"顶点 {P_rest.shape[0]}  三角 {tri.shape[0]}  "
      f"影响数上限 {int((Wt>1e-7).sum(1).max())}  "
      f"weight_sum∈[{Wt.sum(1).min():.6f},{Wt.sum(1).max():.6f}]")
print(f"joint index max={int(J.max())} (joints={len(joints)}) 越界="
      f"{int((J>len(joints)-1).sum())}")
print(f"未被任何顶点使用的 joint: "
      f"{attr_rep['primitive_0']['joints_never_weighted']}")

all_finite = True
for mark, fr in MARKS.items():
    time = fr / FPS
    P_glb, JM = skin_at(time, return_jm=True)
    ok = glb2bl >= 0
    P_bl = to_gltf(bl[mark][glb2bl[ok]])
    diff = np.linalg.norm(P_glb[ok] - P_bl, axis=1)

    det = np.linalg.det(JM[:, :3, :3])
    scales = np.linalg.norm(JM[:, :3, :3], axis=1)
    finite = bool(np.isfinite(P_glb).all() and np.isfinite(JM).all())
    all_finite &= finite
    sing = np.nonzero(np.abs(det) < 1e-8)[0]
    neg = np.nonzero(det < 0)[0]

    dl = np.linalg.norm(P_glb[edges[:, 0]] - P_glb[edges[:, 1]], axis=1)
    ratio = np.where(rest_len > 1e-9, dl / np.maximum(rest_len, 1e-9), 1.0)
    bad = ratio > 2.0

    # ---- 逐边归因：位移场分解 ----
    # 顶点位移 d_v = P_v - p_v = Σ_β w_vβ u_β(p_v)，u_β(x)=(R_β-I)x+t_β
    # 一条边被拉开的量 (P_a-P_b)-(p_a-p_b) = Σ_β [w_aβ u_β(p_a) - w_bβ u_β(p_b)]
    # 所以每根骨对"这条边为什么被撕开"的贡献可以精确算出来，无线性化。
    U = np.zeros((len(joints), 2, 3))       # 只对涉及撕裂边的顶点算
    attrib = Counter()
    worst_breakdown = []
    bad_idx = np.nonzero(bad)[0]
    a_all = edges[bad_idx, 0]
    b_all = edges[bad_idx, 1]
    # 预先算好每根骨对这批顶点两端的 u 值
    u_a = np.zeros((len(joints), len(a_all), 3))
    u_b = np.zeros((len(joints), len(b_all), 3))
    for k in range(len(joints)):
        R = JM[k, :3, :3]
        T = JM[k, :3, 3]
        u_a[k] = P_rest[a_all] @ (R - np.eye(3)).T + T
        u_b[k] = P_rest[b_all] @ (R - np.eye(3)).T + T
    # c[k, e] = w_a u_a - w_b u_b，用 scatter 把每根骨（4 个 j 槽）累加
    contrib_edges = np.zeros((len(joints), len(a_all), 3))
    for k in range(4):
        np.add.at(contrib_edges, J[a_all, k], Wt[a_all, k, None] * u_a[J[a_all, k]])
        np.add.at(contrib_edges, J[b_all, k], -Wt[b_all, k, None] * u_b[J[b_all, k]])

    checksum = np.linalg.norm(contrib_edges.sum(0), axis=1)
    residual = np.linalg.norm((P_glb[a_all] - P_glb[b_all])
                              - (P_rest[a_all] - P_rest[b_all]), axis=1)
    for ei_local, ei in enumerate(bad_idx):
        mags = np.linalg.norm(contrib_edges[:, ei_local, :], axis=1)
        order_local = np.argsort(-mags)[:3]
        contrib = {joint_names[k]: round(float(mags[k]) * 1000, 3)
                   for k in order_local if mags[k] > 1e-9}
        if contrib:
            attrib[max(contrib, key=contrib.get)] += 1
        if len(worst_breakdown) < 12:
            worst_breakdown.append({
                "edge": int(ei), "ratio": round(float(ratio[ei]), 2),
                "rest_mm": round(float(rest_len[ei]) * 1000, 3),
                "deformed_mm": round(float(dl[ei]) * 1000, 3),
                "a": {"v": int(edges[ei, 0]),
                      "weights": weights_of(int(edges[ei, 0]))},
                "b": {"v": int(edges[ei, 1]),
                      "weights": weights_of(int(edges[ei, 1]))},
                "blame_mm": contrib,
            })

    # ---- 位移最大的顶点（字面要求）+ 被撕得最狠的顶点 ----
    disp = np.linalg.norm(P_glb - P_rest, axis=1)
    top_v = np.argsort(-disp)[:50]
    top_verts = [{
        "v": int(v), "disp_mm": round(float(disp[v]) * 1000, 2),
        "weights": weights_of(int(v)),
    } for v in top_v]

    vmax = np.zeros(len(P_rest))
    np.maximum.at(vmax, edges[:, 0], ratio)
    np.maximum.at(vmax, edges[:, 1], ratio)
    top_t = np.argsort(-vmax)[:50]
    top_tear = [{
        "v": int(v), "max_incident_edge_ratio": round(float(vmax[v]), 2),
        "disp_mm": round(float(disp[v]) * 1000, 2),
        "weights": weights_of(int(v)),
    } for v in top_t]

    report["frames"][mark] = {
        "frame": fr, "time_s": round(time, 5),
        "all_finite": finite,
        "jointmatrix_det": {"min": round(float(det.min()), 6),
                            "max": round(float(det.max()), 6),
                            "n_near_singular": int(len(sing)),
                            "n_negative_det": int(len(neg))},
        "jointmatrix_scale_norm": {"min": round(float(scales.min()), 6),
                                   "max": round(float(scales.max()), 6)},
        "independent_lbs_vs_blender": {
            "vertices_compared": int(ok.sum()),
            "max_mm": round(float(diff.max()) * 1000, 6),
            "mean_mm": round(float(diff.mean()) * 1000, 6),
            "p99_mm": round(float(np.percentile(diff, 99)) * 1000, 6),
        },
        "tear": {"edges_gt_2x": int(bad.sum()),
                 "pct_gt_2x": round(100.0 * bad.sum() / len(edges), 4),
                 "max_ratio": round(float(ratio.max()), 2),
                 "edges_gt_5x": int((ratio > 5).sum()),
                 "edges_gt_10x": int((ratio > 10).sum())},
        "attribution_check": {
            "sum_of_bone_contributions_vs_actual_mm": {
                "max_diff_mm": round(float(np.abs(checksum - residual).max())
                                     * 1000, 6),
                "note": "Σ每骨贡献 应等于 (P_a-P_b)-(p_a-p_b)，用于证明归因是精确的",
            },
        },
        "tear_attribution_top_joints": [
            {"joint": k, "edges": v} for k, v in attrib.most_common(12)],
        "worst_edge_breakdown": worst_breakdown,
        "top50_displaced_vertices": top_verts,
        "top50_tearing_vertices": top_tear,
    }
    print(f"\n[{mark}] t={time:.4f}s  det∈[{det.min():.4f},{det.max():.4f}]  "
          f"finite={finite}")
    print(f"   独立 LBS vs Blender: max={diff.max()*1000:.4f} mm  "
          f"mean={diff.mean()*1000:.4f} mm")
    print(f"   撕裂: >2x={bad.sum()} ({100.0*bad.sum()/len(edges):.2f}%)  "
          f">5x={int((ratio>5).sum())}  >10x={int((ratio>10).sum())}  "
          f"max={ratio.max():.1f}×")
    print(f"   归因 top6: " + ", ".join(
        f"{k}×{v}" for k, v in attrib.most_common(6)))

report["summary"] = {
    "all_frames_finite": bool(all_finite),
    "usdz_present": False,
    "note": "本文件只审计 GLB；USDZ 未参与（该文件在本机不存在）",
}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(f"\n[写出] {OUT.relative_to(REPO)}")
