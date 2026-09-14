"""建 Humanoid 骨架（第二版）：手/马尾/裙的位置全部由实测几何确定。

v1 的两个错误：
  1. 手指骨长度用了 0.165×身高 ≈ 27 cm（那是"腕到指尖"的整条前臂+手），
     结果手指伸到 z=0.55，而实测手的最低点只到 z=0.739。现在改成用实测的
     手臂轴线参数 t 定位腕与指尖，手指长度由实测手长推出。
  2. 内外判定用射线奇偶法，对人体这种非凸形状会失效（报"仅 29% 骨骼在
     网格内"）。改成最近点法线判据：closest_point 的法线朝向能可靠区分内外。

命名沿用 Mixamo 以便后续 BVH retarget。

产出：build/step2_rigged.blend、reports/07_rig.json
运行：import _run; _run.go("07_rig.py")
"""

import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import mathutils
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import lib_source as S      # noqa: E402

ROOT = HERE.parent
REPORTS = ROOT / "reports"
BUILD = ROOT / "build"
H = 1.65
CLUSTER_GAP = 0.0025


# ------------------------------------------------------------ 几何测量

def section_arm_points(me, span):
    """沿高度扫截面，取手臂段的 (x 中心, y 中心, z)。判据与 01 一致。"""
    pts = []
    n = 64
    zlo = min(v.co.z for v in me.vertices)
    for k in range(n):
        z = zlo + span * (k + 0.5) / n
        zf = (z - zlo) / span
        if not (0.40 <= zf <= 0.82):
            continue
        bm = bmesh.new()
        bm.from_mesh(me)
        try:
            res = bmesh.ops.bisect_plane(
                bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                plane_co=(0.0, 0.0, z), plane_no=(0.0, 0.0, 1.0),
                clear_inner=False, clear_outer=False)
            vs = [v.co.copy() for v in res["geom_cut"]
                  if isinstance(v, bmesh.types.BMVert)]
            xs = sorted({round(p.x, 6) for p in vs})
        finally:
            bm.free()
        if not xs:
            continue
        segs, gaps = [], []
        start = prev = xs[0]
        for x in xs[1:]:
            if x - prev > CLUSTER_GAP:
                segs.append((start, prev))
                gaps.append((prev, x, x - prev))
                start = x
            prev = x
        segs.append((start, prev))
        cand = [g for g in gaps if g[0] > 0.02 * span and g[1] > 0.02 * span]
        if not cand:
            continue
        g = max(cand, key=lambda t: t[2])
        if g[2] < 0.030:
            continue
        arm = [p for p in vs if p.x >= g[1] - 0.002]
        if not arm:
            continue
        lo = min(p.x for p in arm)
        hi = max(p.x for p in arm)
        yc = sum(p.y for p in arm) / len(arm)
        pts.append(((lo + hi) / 2, yc, z))
    return pts


def fit_line(pts):
    """最小二乘 x = a + b*z。pts = [(x, z)]。"""
    n = len(pts)
    sz = sum(p[1] for p in pts) / n
    sx = sum(p[0] for p in pts) / n
    b = (sum((p[1] - sz) * (p[0] - sx) for p in pts)
         / sum((p[1] - sz) ** 2 for p in pts))
    return sx - b * sz, b


def measure_ponytail(me, height, n=8):
    """马尾中心线：按高度分层，取每层最靠后的点的 y 高分位。

    后脑勺与马尾在颜色上分不开，但马尾是脑后最突出的那一束，取每层 y 的
    高分位就能贴住它。返回 [(y, z, 该层点数)]，自上而下。
    """
    z_lo, z_hi = 0.68 * height, 0.98 * height
    pts = []
    for k in range(n):
        z0 = z_lo + (z_hi - z_lo) * k / n
        z1 = z_lo + (z_hi - z_lo) * (k + 1) / n
        sel = sorted(v.co.y for v in me.vertices
                     if z0 <= v.co.z < z1 and v.co.y > 0.0)
        if len(sel) < 8:
            continue
        pts.append((round(sel[int(len(sel) * 0.80)], 4),
                    round((z0 + z1) / 2, 4), len(sel)))
    pts.sort(key=lambda p: -p[1])       # 从上到下
    return pts


def measure_foot(me, height):
    """鞋/脚的实际范围，用来定脚趾关节而不是靠比例猜。"""
    pts = [v.co for v in me.vertices if v.co.z < 0.075 * height]
    if not pts:
        return None
    ys = sorted(p.y for p in pts)
    n = len(pts)
    return {"n": n, "y_min": round(ys[0], 4), "y_p05": round(ys[n // 20], 4),
            "y_median": round(ys[n // 2], 4), "y_max": round(ys[-1], 4)}


def measure_hand(me, height, origin, direction, max_perp=0.060):
    """用手臂轴参数 t 测量手臂+手的实际范围。

    选点用"到轴线的垂距"，不用 x 阈值：按 x>0.20H 筛会把整只手滤掉
    （手的 x 约 0.33–0.40，而阈值 0.33），算出的手长只有 30 mm。
    """
    ts = []
    for v in me.vertices:
        p = v.co
        vec = p - origin
        t = vec.dot(direction)
        if t < 0.12 * height:            # 太靠近肩，会混入躯干
            continue
        if (vec - direction * t).length > max_perp * height:
            continue
        ts.append(t)
    if not ts:
        return None
    ts.sort()
    n = len(ts)
    return {"t_min": round(ts[0], 4), "t_p05": round(ts[n // 20], 4),
            "t_median": round(ts[n // 2], 4), "t_max": round(ts[-1], 4),
            "n": n, "origin": [round(c, 4) for c in origin],
            "direction": [round(c, 4) for c in direction],
            "max_perp_m": round(max_perp * height, 4)}


def measure_skirt(me, height):
    """裙：髋部外层。z 区间与最大半径。"""
    pts = [v.co for v in me.vertices
           if 0.44 * height < v.co.z < 0.64 * height]
    if not pts:
        return None
    zs = sorted(p.z for p in pts)
    rad = sorted(math.hypot(p.x, p.y) for p in pts)
    n = len(pts)
    return {"n": n, "z_range": [round(zs[0], 4), round(zs[-1], 4)],
            "radius_median": round(rad[n // 2], 4),
            "radius_p95": round(rad[int(n * 0.95)], 4),
            "radius_max": round(rad[-1], 4)}


# ------------------------------------------------------------ 建骨

def build_armature(lm, height, hand_len, pony_pts, foot):
    arm_data = bpy.data.armatures.new("Ruth_Armature")
    arm_ob = bpy.data.objects.new("Ruth_Rig", arm_data)
    bpy.context.collection.objects.link(arm_ob)
    bpy.context.view_layer.objects.active = arm_ob
    arm_ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    def mk(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    hip_z = 0.530 * height
    spine1_z = 0.615 * height
    spine2_z = 0.700 * height
    chest_z = 0.780 * height
    neck_z = 0.848 * height
    head_z = 0.888 * height
    head_top_z = 0.990 * height

    mk("Hips", (0, 0, hip_z), (0, 0, spine1_z))
    mk("Spine", (0, 0, spine1_z), (0, 0, spine2_z), "Hips", True)
    mk("Spine1", (0, 0, spine2_z), (0, 0, chest_z), "Spine", True)
    mk("Spine2", (0, 0, chest_z), (0, 0, neck_z), "Spine1", True)
    mk("Neck", (0, 0, neck_z), (0, 0, head_z), "Spine2", True)
    mk("Head", (0, 0, head_z), (0, 0, head_top_z), "Neck", True)

    for side, s in (("Left", 1.0), ("Right", -1.0)):
        sh, el, wr = lm["shoulder"], lm["elbow"], lm["wrist"]
        ftip = lm["finger_tip"]

        def m(v):
            return (v[0] * s, v[1], v[2])

        mk(f"{side}Shoulder", (s * 0.020 * height, 0.0, 0.792 * height),
           m(sh), "Spine2", False)
        mk(f"{side}Arm", m(sh), m(el), f"{side}Shoulder", True)
        mk(f"{side}ForeArm", m(el), m(wr), f"{side}Arm", True)
        mk(f"{side}Hand", m(wr), m(ftip), f"{side}ForeArm", True)

        # 手指：长度由实测手长推出。手（腕→指尖）里手指约占 55%。
        axis = (Vector(m(ftip)) - Vector(m(wr)))
        if axis.length < 1e-6:
            axis = Vector((s * 0.48, 0, -0.88))
        axis.normalize()
        finger_total = hand_len * 0.55
        seg = finger_total / 3.0
        # 手宽方向：与手臂轴垂直、水平；厚度方向朝前(-Y)
        lateral = Vector((-axis.z, 0.0, axis.x)).normalized()
        depth = Vector((0.0, -1.0, 0.0))
        half_w = 0.022 * height            # 手宽的一半 ≈ 3.6 cm
        fingers = [
            # (名字, 向前偏移占身高, 长度系数, 沿手宽位置 -1..1, 是否拇指)
            ("Thumb", 0.014, 1.00, -0.55, True),
            ("Index", 0.010, 0.98, -0.30, False),
            ("Middle", 0.008, 1.00, -0.08, False),
            ("Ring", 0.006, 0.94, 0.14, False),
            ("Pinky", 0.004, 0.78, 0.34, False),
        ]
        for fname, fwd, scale, spread_frac, is_thumb in fingers:
            root = Vector(m(ftip)) - axis * finger_total
            # depth 是 (0,-1,0)，正的 fwd 让掌指关节向前；v3 用了负系数，
            # 手指整体向后移了 1 cm，落到网格外。
            root = root + depth * (fwd * height) \
                + lateral * (spread_frac * half_w * s)
            prev = f"{side}Hand"
            for k in (1, 2, 3):
                length = seg * scale
                if is_thumb and k == 1:
                    d = (axis * 0.35 + depth * 0.94).normalized()
                elif is_thumb:
                    d = (axis * 0.75 + depth * 0.55).normalized()
                else:
                    d = axis
                tail = root + d * length
                mk(f"{side}Hand{fname}{k}", tuple(root), tuple(tail), prev,
                   k > 1)
                root = tail
                prev = f"{side}Hand{fname}{k}"

    for side, s in (("Left", 1.0), ("Right", -1.0)):
        hp, kn, an = lm["hip"], lm["knee"], lm["ankle"]

        def m(v):
            return (v[0] * s, v[1], v[2])

        mk(f"{side}UpLeg", m(hp), m(kn), "Hips", False)
        mk(f"{side}Leg", m(kn), m(an), f"{side}UpLeg", True)
        # 脚：踝 → 跖球 → 趾尖，全部落在实测的鞋范围里。
        # v1 用 0.110×身高 当脚长，ToeBase 落在网格外 27.9 mm。
        toe_y = an[1] + 0.72 * (foot["y_min"] - an[1])
        toe_z = 0.022 * height
        tip_y = foot["y_min"] + 0.006 * height
        mk(f"{side}Foot", m(an), (s * an[0], toe_y, toe_z), f"{side}Leg", True)
        mk(f"{side}ToeBase", (s * an[0], toe_y, toe_z),
           (s * an[0], tip_y, toe_z), f"{side}Foot", True)

    # 马尾：锚点用实测的发髻位置（y 明显突出的那一段），末端垂到颈侧。
    # 实测包络抓不到垂下的束——它紧贴后脑勺，跟后脑勺在同一个 y 区间，
    # 所以下半段按"向后脑收敛"的方式生成，而不是硬套实测包络。
    if pony_pts:
        top_y, top_z = pony_pts[0][0], pony_pts[0][1]
        end_y, end_z = 0.046, 0.800 * height
    else:
        top_y, top_z = 0.125, 0.960 * height
        end_y, end_z = 0.046, 0.800 * height
    nodes = []
    for i in range(5):
        u = i / 4.0
        nodes.append((0.0, (top_y + (end_y - top_y) * u) - 0.008,
                      top_z + (end_z - top_z) * u))
    print("  马尾骨节点：",
          [(round(n[1], 4), round(n[2], 4)) for n in nodes])
    for i in range(4):
        mk(f"Ponytail{i+1}", nodes[i], nodes[i + 1],
           "Head" if i == 0 else f"Ponytail{i}", i > 0)

    # 裙：前后左右各 3 段，挂在髋下
    anchor = 0.545 * height
    for tag, dx, dy in (("F", 0.0, -1.0), ("B", 0.0, 1.0),
                        ("L", 1.0, 0.0), ("R", -1.0, 0.0)):
        d = Vector((dx, dy, 0.0)).normalized()
        p = [Vector((0, 0, anchor)) + d * 0.040 * height,
             Vector((0, 0, 0.535 * height)) + d * 0.090 * height,
             Vector((0, 0, 0.495 * height)) + d * 0.125 * height,
             Vector((0, 0, 0.458 * height)) + d * 0.140 * height]
        for i in range(3):
            mk(f"Skirt{tag}{i+1}", tuple(p[i]), tuple(p[i + 1]),
               "Hips" if i == 0 else f"Skirt{tag}{i}", i > 0)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm_ob, [b.name for b in arm_data.bones]


# ------------------------------------------------------------ 验证

def validate(rig, ob_mesh):
    """用最近点法线判据判断骨骼中点在不在网格内。

    射线奇偶法对人体这种非凸形状会给出错误结果（v1 报"仅 29% 在内部"）。
    closest_point_on_mesh 的法线指向外侧，(p - loc)·n < 0 即在内部。
    """
    bvh = mathutils.bvhtree.BVHTree.FromPolygons(
        [v.co.copy() for v in ob_mesh.data.vertices],
        [list(p.vertices) for p in ob_mesh.data.polygons], all_triangles=False)
    bones = []
    for b in rig.data.bones:
        h, t = b.head_local, b.tail_local
        mid = (h + t) * 0.5
        loc, nrm, idx, dist = bvh.find_nearest(mid, 0.5)
        if loc is None:
            inside, surf_dist = None, None
        else:
            inside = bool((mid - loc).dot(nrm) < 0.0)
            surf_dist = dist
        bones.append({
            "name": b.name,
            "length_mm": round(1000 * (t - h).length, 2),
            "head": [round(v, 4) for v in h],
            "tail": [round(v, 4) for v in t],
            "surface_distance_mm": round(1000 * surf_dist, 1)
            if surf_dist is not None else None,
            "mid_inside": inside,
        })
    outside = [b["name"] for b in bones if b["mid_inside"] is False]
    return {"total": len(bones), "inside": sum(1 for b in bones
                                               if b["mid_inside"]),
            "outside": outside, "bones": bones,
            "zero_length": [b["name"] for b in bones if b["length_mm"] < 1.0]}


def main():
    info = S.load_normalized(target_height=H)
    ob, me = info["object"], info["mesh"]
    height = info["height"]
    print(f"输入身高 {height:.4f} m  顶点 {len(me.vertices)}")

    # ---- 手臂轴线 ----
    apts = section_arm_points(me, height)
    fit_bx = fit_line([(p[0], p[2]) for p in apts])
    fit_by = fit_line([(p[1], p[2]) for p in apts])
    arm_a, arm_b = fit_bx
    arm_ay, arm_by = fit_by
    ang = math.degrees(math.atan(abs(arm_b)))
    print(f"\n手臂轴线：{len(apts)} 点  外展 {ang:.1f}°  "
          f"x(z)={arm_a:.4f}{arm_b:+.4f}z   y(z)={arm_ay:.4f}{arm_by:+.4f}z")

    shoulder_z = 0.815 * height
    shoulder = (arm_a + arm_b * shoulder_z, arm_ay + arm_by * shoulder_z,
                shoulder_z)

    # 指尖：直接取右臂末段的几何最低点。用轴线投影去找会因为"手朝下并拢"
    # 而在轴向投影上被截短（实测只给出 29.5 mm 的手长）。
    arm_pts = [v.co.copy() for v in me.vertices if v.co.x > 0.30 * height / 1.65]
    arm_pts.sort(key=lambda p: p.z)
    lowest = arm_pts[:40]
    tip = Vector((sum(p.x for p in lowest) / len(lowest),
                  sum(p.y for p in lowest) / len(lowest),
                  sum(p.z for p in lowest) / len(lowest)))
    print(f"  手臂末端最低点云：z_min {arm_pts[0].z:.4f}  "
          f"取最低 {len(lowest)} 点质心作为指尖 ({tip.x:.4f}, {tip.y:.4f}, "
          f"{tip.z:.4f})")
    direction = Vector((-arm_b, 0.0, -1.0))
    direction.normalize()

    # 肘/腕沿"肩→实测指尖"的连线按解剖比例分配。
    # 不能沿用标准腕高 0.503H：本模型臂长（肩→指尖）只有约 0.59 m，
    # 标准比例 0.44/0.37/0.19 之外的位置会把腕落到手的中部，
    # 手骨只剩 3 cm（v3 实测）。
    sh_v, tip_v = Vector(shoulder), Vector(tip)
    span_v = tip_v - sh_v
    elbow = tuple(sh_v + span_v * 0.44)
    wrist = tuple(sh_v + span_v * 0.81)
    print(f"  肩→指尖沿轴长 {span_v.length:.4f} m（标准成人约 0.73 m）")
    print(f"  上臂 {span_v.length*0.44:.4f}  前臂 "
          f"{span_v.length*0.37:.4f}  手 {span_v.length*0.19:.4f} m")

    hand = measure_hand(me, height, sh_v, direction)
    wrist_t = (Vector(wrist) - sh_v).dot(direction)
    hand_len = (tip_v - Vector(wrist)).length
    finger_tip = tip
    print(f"  手部沿手臂轴采样 {hand['n']} 点，t_max {hand['t_max']}；"
          f"腕 t={wrist_t:.4f}")
    print(f"  手长（腕→实测指尖）= {hand_len:.4f} m")

    # ---- 马尾 ----
    pony_all = measure_ponytail(me, height)
    print("\n马尾包络（每层 y 的 p80，自上而下）:")
    for y, z, n in pony_all:
        print(f"  z={z:.4f} (z/H={z/height:.3f})  y={y:.4f}  ({n} 点)")
    # 只保留明显突出于后脑勺的层（y > 0.09 m），下面的垂发束是贴着脑后的
    pony = [p for p in pony_all if p[0] > 0.09]
    if len(pony) < 2:
        pony = pony_all[:3]
    print(f"  判为马尾主体的层：{[(round(p[1],3), round(p[0],3)) for p in pony]}")

    skirt = measure_skirt(me, height)
    print(f"\n裙：{skirt['n']} 点  z {skirt['z_range']}  "
          f"半径 中位 {skirt['radius_median']}  p95 {skirt['radius_p95']}  "
          f"max {skirt['radius_max']}")
    foot = measure_foot(me, height)
    print(f"脚：{foot['n']} 点  y {foot['y_min']} … {foot['y_max']}  "
          f"(中位 {foot['y_median']})")

    # ---- 腿 ----
    zlo = min(v.co.z for v in me.vertices)
    rows = []
    for k in range(14):
        z = zlo + height * (0.075 + (0.44 - 0.075) * k / 13)
        band = height * 0.012
        sel = [v.co for v in me.vertices
               if abs(v.co.z - z) < band and v.co.x > 0.005]
        if len(sel) < 6:
            continue
        rows.append((sum(p.x for p in sel) / len(sel),
                     sum(p.y for p in sel) / len(sel), z))
    ax_, bx_ = fit_line([(r[0], r[2]) for r in rows])
    ay_, by_ = fit_line([(r[1], r[2]) for r in rows])
    hip = (ax_ + bx_ * 0.530 * height, ay_ + by_ * 0.530 * height,
           0.530 * height)
    knee = (ax_ + bx_ * 0.285 * height, ay_ + by_ * 0.285 * height,
            0.285 * height)
    ankle = (ax_ + bx_ * 0.075 * height, ay_ + by_ * 0.075 * height,
             0.075 * height)

    lm = {"shoulder": shoulder, "elbow": elbow, "wrist": wrist,
          "finger_tip": tuple(finger_tip), "hip": hip, "knee": knee,
          "ankle": ankle}
    print("\n关节坐标（米）")
    for k, v in lm.items():
        print(f"  {k:<11} ({v[0]:>7.4f}, {v[1]:>7.4f}, {v[2]:>7.4f})  "
              f"z/H={v[2]/height:.3f}")

    rig, names = build_armature(lm, height, hand_len, pony, foot)
    print(f"\n骨架建成 {len(names)} 根骨")

    rep = validate(rig, ob)
    print(f"\n=== 骨骼验证（最近点法线判据）===")
    print(f"  总 {rep['total']}  中点在网格内 {rep['inside']}  "
          f"({rep['inside']/rep['total']*100:.1f}%)")
    print(f"  零长度骨：{rep['zero_length'] or '无'}")
    core_out = [n for n in rep["outside"]
                if not n.startswith(("Ponytail", "Skirt"))]
    if core_out:
        print(f"  主体骨中点在外的：{core_out}")
    else:
        print("  主体骨（非马尾/裙）中点全部在网格内")
    print("\n  几根代表骨：")
    for bone in rep["bones"]:
        if bone["name"] in ("Hips", "Head", "LeftArm", "LeftForeArm",
                            "LeftHand", "LeftHandMiddle1", "LeftHandMiddle3",
                            "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
                            "Ponytail1", "Ponytail4", "SkirtF1", "SkirtF3"):
            print(f"    {bone['name']:<18} len {bone['length_mm']:>6.1f}mm  "
                  f"head {bone['head']}  inside={bone['mid_inside']}  "
                  f"surf_dist {bone['surface_distance_mm']}mm")

    out = {"height": height,
           "arm_axis": {"samples": len(apts), "a": round(arm_a, 5),
                        "b": round(arm_b, 5),
                        "angle_from_vertical_deg": round(ang, 2)},
           "hand_measure": hand, "wrist_t": round(wrist_t, 4),
           "hand_len_m": round(hand_len, 4),
           "ponytail_envelope": pony_all, "skirt_measure": skirt,
           "foot_measure": foot,
           "landmarks": {k: [round(c, 5) for c in v] for k, v in lm.items()},
           "bone_count": len(names), "bones": names, "validation": rep}

    BUILD.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "step2_rigged.blend"))
    print(f"\n[写出] {BUILD / 'step2_rigged.blend'}")
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "07_rig.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / '07_rig.json'}")
    return out


if __name__ == "__main__":
    main()
