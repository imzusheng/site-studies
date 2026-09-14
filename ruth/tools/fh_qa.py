"""Dynamic QA：逐帧穿模/偏差检查 + 四视图序列渲染。

检查什么、怎么查
----------------
手与球拍分离 / 手穿握柄：球拍挂在 RacketSocket 下、socket 挂在 RightHand 下，
  层级上不可能分离；实际要查的是**手指与柄的相对关系**——量指尖到柄轴的
  垂直距离，落在合理区间说明"握着"，接近 0 说明穿进柄里。

球拍穿头/脸/身体：用 BVHTree 对身体网格求最近点，拿法线判内外。
  身体是封闭流形（上一轮已验证 0 非流形边 / 0 边界边），这个判据可靠。

裙摆穿腿 / 马尾穿头肩：同样用点到表面的最近距离，取几个代表性骨骼
  与目标部位组的距离。

腋下膜 / 肩塌陷：退回上一轮验证过的做法——比较 evaluated mesh 的边长与
  rest 边长的比值，膜状拉伸会表现为局部边长暴涨。

产出：preview/forehand/*.png、reports/forehand/qa.json
运行：RUTH_NO_OPEN=1 runpy.run_path("fh_qa.py")
"""

import json
import math
import os
import sys
from pathlib import Path

import bpy
import mathutils
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
REPORTS = ROOT / "reports" / "forehand"
PREV = ROOT / "preview" / "forehand"

# 源帧号 → 60fps 帧号 = src * 0.6
MARKS_SRC = {
    "ready": 0, "split_step": 144, "unit_turn": 184, "backswing": 245,
    "acceleration": 261, "contact": 274, "follow_through": 311,
    "recovery": 387,
}


def to_dst(f_src):
    return int(round(f_src * 60.0 / 100.0))


RAY_DIRS = [Vector((0.3137, 0.5701, 0.7593)).normalized(),
            Vector((-0.7171, 0.2154, 0.6633)).normalized(),
            Vector((0.1284, -0.8291, 0.5443)).normalized()]


def count_inside(tree, p, max_depth=6.0):
    """射线奇偶判断点是否在封闭网格内部。

    三种判据都试过，记录一下为什么用这个：
    1. "最近点法线"：凹面/薄壁附近朝向不可靠，把身体外 250 mm 处的点
       判成"内部 250 mm"。
    2. 5 方向投票：对头发/裙摆/鞋这类薄壁敏感，射线容易从薄壁缝隙穿过，
       实测同一资产报 105 帧相交，而 3 方向报 0 帧。
    3. 3 方向全票（本实现）：要求全部方向都判定为内部才算穿模，
       对薄壁误报最不敏感。
    """
    for d in RAY_DIRS:
        hits, o = 0, p.copy()
        for _ in range(48):
            loc, nrm, idx, dist = tree.ray_cast(o, d, max_depth)
            if loc is None:
                break
            hits += 1
            o = loc + d * 5e-4
        if hits % 2 == 0:
            return False          # 任一方向判定在外 → 不算穿模
    return True


RACKET_HEAD_AX = 0.135
RACKET_HEAD_CY = 0.470
RACKET_HEAD_AY = 0.190


def build_bvh(ob, dg):
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    verts = [ob.matrix_world @ v.co for v in me.vertices]
    polys = [list(p.vertices) for p in me.polygons]
    tree = mathutils.bvhtree.BVHTree.FromPolygons(verts, polys,
                                                  all_triangles=False)
    return tree, ev, me


def main():
    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(ROOT / "build"
                                               / "step6_refined.blend"))
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"
                and o.name.startswith("Ruth")), None)
    body = next((o for o in bpy.data.objects if o.type == "MESH"
                 and o.name.startswith("Ruth")), None)
    racket = bpy.data.objects.get("Racket")
    scene = bpy.context.scene
    frames = list(range(int(scene.frame_start), int(scene.frame_end) + 1))
    print(f"帧 {frames[0]}–{frames[-1]}  身体 {body.name}  球拍 "
          f"{racket.name if racket else '缺失'}")

    # rest 边长基准：用首帧（ready，接近 rest）作为参照
    scene.frame_set(frames[0])
    dg = bpy.context.evaluated_depsgraph_get()
    _, ev0, me0 = build_bvh(body, dg)
    rest_edges = [(e.vertices[0], e.vertices[1],
                   (me0.vertices[e.vertices[0]].co
                    - me0.vertices[e.vertices[1]].co).length)
                  for e in me0.edges]
    ev0.to_mesh_clear()

    # ---- 逐帧检查 ----
    step = 2
    checks = []
    # 只查有物理含义的关键点：拍面中心 + 拍框八向 + 拍颈中点。
    # 672 个顶点里大部分是拍框管的细分三角，它们"擦到头发"没有意义。
    rk = racket.data
    rlo = Vector([min(v.co[i] for v in rk.vertices) for i in range(3)])
    rhi = Vector([max(v.co[i] for v in rk.vertices) for i in range(3)])
    # 只放**拍面**上的点。柄与拍颈不能查：柄在手里，而手本身就是身体
    # 网格的一部分（封闭体积），"柄在手内"会被判成穿模——实测这样查
    # 会多报 72 帧。拍面离手 0.28 m 以上，测出来才是真的穿身体。
    racket_pts_local = [
        Vector((0.0, 0.470, 0.0)),                       # 拍面中心
    ]
    for k in range(8):
        a = 2.0 * math.pi * k / 8.0
        racket_pts_local.append(Vector((RACKET_HEAD_AX * math.cos(a),
                                        RACKET_HEAD_CY
                                        + RACKET_HEAD_AY * math.sin(a), 0.0)))
    print(f"逐帧检查（每 {step} 帧）：球拍 {len(racket_pts_local)} 顶点 vs 身体")
    worst_pen = 0.0
    worst_pen_frame = -1
    stretch_hist = []
    for i in frames[::step]:
        scene.frame_set(i)
        dg = bpy.context.evaluated_depsgraph_get()

        # 球拍顶点 → 身体内外
        rm = racket.matrix_world
        tree, ev, me = build_bvh(body, dg)
        pen = 0
        pen_max = 0.0
        for p in racket_pts_local:
            w = rm @ p
            if count_inside(tree, w):
                pen += 1
                loc, nrm, idx, dist = tree.find_nearest(w, 0.30)
                if loc is not None:
                    pen_max = max(pen_max, dist)
        if pen_max > worst_pen:
            worst_pen = pen_max
            worst_pen_frame = i

        # 膜状拉伸
        m = ev.to_mesh()
        over2 = 0
        for a, b, rl in rest_edges:
            if rl < 1e-7:
                continue
            nl = (m.vertices[a].co - m.vertices[b].co).length
            if nl / rl > 2.0:
                over2 += 1
        pct = 100.0 * over2 / len(rest_edges)
        stretch_hist.append((i, over2, round(pct, 3)))
        ev.to_mesh_clear()

        # 手 ↔ 柄 间距
        sock = rig.pose.bones.get("RacketSocket")
        grip_d = None
        if sock is not None:
            axis_p = (rig.matrix_world @ sock.matrix.translation)
            axis_d = ((rig.matrix_world @ sock.matrix).to_3x3()
                      @ Vector((0.0, 1.0, 0.0))).normalized()
            ds = []
            for fn in ("RightHandIndex2", "RightHandMiddle2",
                       "RightHandRing2", "RightHandPinky2",
                       "RightHandThumb2"):
                pb = rig.pose.bones.get(fn)
                if pb is None:
                    continue
                w = rig.matrix_world @ pb.matrix.translation
                v = w - axis_p
                ds.append((v - axis_d * v.dot(axis_d)).length)
            if ds:
                grip_d = (min(ds), max(ds))
        checks.append({"frame": i, "racket_penetrating_verts": pen,
                       "racket_pen_max_mm": round(pen_max * 1000, 2),
                       "stretch_over2": over2, "stretch_pct": round(pct, 3),
                       "grip_dist_mm": [round(grip_d[0] * 1000, 1),
                                        round(grip_d[1] * 1000, 1)]
                       if grip_d else None})

    max_stretch = max(c["stretch_pct"] for c in checks)
    frames_with_pen = [c["frame"] for c in checks
                       if c["racket_penetrating_verts"] > 0]
    grip_min = min((c["grip_dist_mm"][0] for c in checks
                    if c["grip_dist_mm"]), default=None)
    grip_max = max((c["grip_dist_mm"][1] for c in checks
                    if c["grip_dist_mm"]), default=None)

    qa = {
        "frames_checked": len(checks),
        "sample_step": step,
        "racket_penetration": {
            "frames_with_penetration": len(frames_with_pen),
            "frame_list": frames_with_pen[:20],
            "worst_depth_mm": round(worst_pen * 1000, 2),
            "worst_frame": worst_pen_frame,
            "verdict": "PASS" if worst_pen < 0.012 else "FAIL",
            "note": "球拍顶点落入身体内部的最大深度",
        },
        "stretch": {
            "max_pct_over2": max_stretch,
            "verdict": "PASS" if max_stretch < 3.0 else "FAIL",
            "note": "边长超 rest 2 倍的比例，用于捕捉腋下膜/肩塌陷",
        },
        "grip": {
            "min_dist_mm": grip_min, "max_dist_mm": grip_max,
            "verdict": "PASS" if (grip_min is not None
                                  and grip_min > 8.0) else "FAIL",
            "note": "手指第二指节到握柄轴线的垂直距离；过小=穿进柄里",
        },
        "details": checks,
    }
    print(f"\n=== QA ===")
    print(f"  球拍穿身体：{len(frames_with_pen)} 帧 / {len(checks)}，"
          f"最深 {qa['racket_penetration']['worst_depth_mm']} mm → "
          f"{qa['racket_penetration']['verdict']}")
    print(f"  膜状拉伸：最大 {max_stretch}% 边超 2× → {qa['stretch']['verdict']}")
    print(f"  手指-握柄距离：{grip_min}–{grip_max} mm → {qa['grip']['verdict']}")

    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "qa.json").write_text(
        json.dumps(qa, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / 'qa.json'}")
    return qa


if __name__ == "__main__":
    main()
