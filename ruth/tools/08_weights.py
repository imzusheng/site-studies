"""蒙皮权重：语义分区 + 距离权重。

上一版的失败模式（本次从设计上避免）：
  - 用 BaseColor 亮度分类，把烘焙自阴影的暗部误判成头发，前臂被锁到 Head 上；
  - 头部判定只按 z，把肩外侧顶点判进头部，手臂上举时拉成扁带。

本版的分区判据只用几何：
  - 手/手臂用"到手臂轴线的垂距"（不受 A-Pose 展角影响）；
  - 头/颈按 z 且限制 |x|；
  - 裙用半径（裙半径中位 0.137 m，腿半径约 0.077 m，分得开）。
每个分区只允许一组骨骼参与，避免跨肢体污染。

产出：build/step3_weighted.blend、build/ruth_rigged.glb、
      reports/08_weights.json
运行：import runpy; runpy.run_path(".../08_weights.py", run_name="__main__")
"""

import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

ROOT = HERE.parent
REPORTS = ROOT / "reports"
BUILD = ROOT / "build"
H = 1.65
MAX_INFLUENCES = 4
FALLOFF = 4.0            # 距离权重指数 1/(d+eps)^k


def point_segment_distance(p, a, b):
    ab = b - a
    denom = ab.length_squared
    if denom < 1e-12:
        return (p - a).length
    t = (p - a).dot(ab) / denom
    t = max(0.0, min(1.0, t))
    return (p - (a + ab * t)).length


def build_bone_geometry(rig):
    """每根骨的世界坐标 head/tail，用 rest pose 的局部坐标（对象未变换）。"""
    return {b.name: (b.head_local.copy(), b.tail_local.copy())
            for b in rig.data.bones}


def classify(co, H, ax_info):
    """几何分区。返回分区名。

    ax_info: (shoulder, direction, arm_len) 用于手臂轴投影。
    """
    x, y, z = co
    ax = abs(x)
    zf = z / H
    side = "L" if x > 0 else "R"

    # 脚（踝以下，含袜与鞋）：绑到 Foot/ToeBase，跟脚刚性走
    if zf < 0.115:
        return f"FOOT_{side}"

    # 马尾：脑后靠上的一束。测得的马尾主体层 y≈0.13（发髻），
    # 垂下的束 y 只有 0.05–0.07，所以阈值取 0.062 才能把下垂段包进来。
    if zf > 0.80 and y > 0.062:
        return "PONYTAIL"

    # 头部组：颈根以上。|x| 上限放到 0.16——头发与帽子的 |x| 实测到 0.127，
    # 用 0.115 会把它们漏到 TORSO 上去。肩高 1.345 低于 0.845H=1.394，
    # 所以放宽 |x| 不会把肩吞进头部。
    if zf > 0.845 and ax < 0.16:
        return "HEAD"

    # 手与手指：沿手臂轴投影。轴线只测了 +x 一侧，按顶点所在的 x 符号
    # 做镜像，否则左臂整体匹配不上（v1 里根本没有 ARM_R）。
    # 阈值全部用"占臂长的比例"，不用绝对米数：臂长实测 0.61 m，
    # 写成 t>0.80 是把臂长当默认成人值了，HAND 分区永远为空。
    sh, d, arm_len = ax_info[0], ax_info[1], ax_info[2]
    s_sign = 1.0 if x >= 0 else -1.0
    sh_m = Vector((sh.x * s_sign, sh.y, sh.z))
    d_m = Vector((d.x * s_sign, d.y, d.z))
    vec = Vector(co) - sh_m
    t = vec.dot(d_m)
    perp = (vec - d_m * t).length
    if t > 0.08 * arm_len and perp < 0.075:
        return (f"HAND_{side}" if t > 0.78 * arm_len else f"ARM_{side}")

    # 裙：髋区里"离腿轴够远"的点。
    # 用半径阈值分不开——大腿上部的半径本身就有 0.127 m，超过 0.105 的阈值，
    # 于是 7346 个顶点（23%）被判成裙子。改用"到腿轴的距离"。
    # z 上限取 0.63H：再往上就是腰（Polo 下摆），归 TORSO。
    # 距离要对两条腿轴取 min，只用一侧会让中线附近的点 d_leg 恒大于阈值，
    # 腰部整片被吞进 SKIRT（TORSO 只剩 2890 顶点）。
    if 0.44 * H < z < 0.62 * H:
        hip, knee = ax_info[3], ax_info[4]
        u = (z - knee[2]) / max(hip[2] - knee[2], 1e-6)
        u = max(0.0, min(1.0, u))
        leg_y = knee[1] + (hip[1] - knee[1]) * u
        d_leg = min(math.hypot(x - hip[0], y - leg_y),
                    math.hypot(x + hip[0], y - leg_y))
        if d_leg > 0.062:
            return "SKIRT"
        return f"LEG_{side}"

    if zf > 0.62:
        return "TORSO"
    return f"LEG_{side}"


# 每个分区允许参与的骨骼。跨肢体的骨头一律不给，从根上杜绝污染。
#
# 但边界处必须让两侧的骨骼集合**重叠**：硬分区会让相邻顶点拿到完全不同的
# 骨骼集，抬手时被撕开成膜。实测 03_ArmsUp 在腋窝 (0.07,0.058,1.214) 出现
# 40 倍拉伸——该点 perp=0.0779 刚好越过 0.075 被判给躯干，紧邻点判给手臂。
# 所以躯干区额外放行两侧 Arm，手臂区额外放行 Spine2，由距离权重决定过渡。
def allowed_bones(region, bone_names):
    def has(n):
        return n in bone_names

    if region == "HEAD":
        return ["Head", "Neck"]
    if region == "PONYTAIL":
        return [n for n in ("Head", "Ponytail1", "Ponytail2", "Ponytail3",
                            "Ponytail4") if has(n)]
    if region == "SKIRT":
        return [n for n in (["Hips"] + [f"Skirt{t}{i}"
                                        for t in "FBLR" for i in (1, 2, 3)])
                if has(n)]
    if region == "TORSO":
        return [n for n in ("Hips", "Spine", "Spine1", "Spine2", "Neck",
                            "LeftShoulder", "RightShoulder",
                            "LeftArm", "RightArm") if has(n)]
    if region.startswith("ARM_") or region.startswith("HAND_"):
        s = "Left" if region.endswith("L") else "Right"
        base = [f"{s}Shoulder", f"{s}Arm", f"{s}ForeArm", f"{s}Hand"]
        fingers = [n for n in bone_names
                   if n.startswith(f"{s}Hand") and n != f"{s}Hand"]
        # Spine2 放行给上臂，让肩胛区平滑过渡到躯干
        if region.startswith("HAND_"):
            return base + fingers + ["Spine2"]
        return base + ["Spine2"]
    if region.startswith("FOOT_"):
        s = "Left" if region.endswith("L") else "Right"
        return [n for n in (f"{s}Leg", f"{s}Foot", f"{s}ToeBase",
                            f"{s}UpLeg") if has(n)]
    if region.startswith("LEG_"):
        s = "Left" if region.endswith("L") else "Right"
        return [n for n in ("Hips", f"{s}UpLeg", f"{s}Leg",
                            f"{s}Foot") if has(n)]
    return [n for n in ("Hips", "Spine") if has(n)]


def main():
    # RUTH_NO_OPEN=1 时直接操作当前场景。open_mainfile 会让 bpy.context
    # 变成受限状态（没有 active_object），后续 glTF 导出器会直接崩，
    # 所以整条链（建骨→权重→导出）在一次调用里连跑，中途不重开文件。
    if os.environ.get("RUTH_NO_OPEN") != "1":
        bpy.ops.wm.open_mainfile(filepath=str(BUILD / "step2_rigged.blend"))
    # 07 是重新导入源 GLB 再建骨的，网格对象名还是 glTF 的 node_0；
    # 按类型找比按名字稳。
    ob = next((o for o in bpy.data.objects if o.type == "MESH"), None)
    rig = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
    if ob is None or rig is None:
        raise RuntimeError(f"场景里找不到网格/骨架："
                           f"{[(o.name, o.type) for o in bpy.data.objects]}")
    ob.name = "Ruth"
    ob.data.name = "Ruth_Mesh"
    rig.name = "Ruth_Rig"
    rig.data.name = "Ruth_Armature"
    me = ob.data
    print(f"网格 {len(me.vertices)} 顶点  骨架 {len(rig.data.bones)} 骨")

    bones = build_bone_geometry(rig)
    names = list(bones.keys())

    # 手臂轴线（与 07 一致）
    lm = json.loads((REPORTS / "07_rig.json").read_text())["landmarks"]
    sh = Vector(lm["shoulder"])
    tip = Vector(lm["finger_tip"])
    d = (tip - sh).normalized()
    arm_len = (tip - sh).length
    ax_info = (sh, d, arm_len, lm["hip"], lm["knee"])

    # 顶点组
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    groups = {n: ob.vertex_groups.new(name=n) for n in names}

    region_count = {}
    influences_hist = {}
    unweighted = []
    sums = []

    for v in me.vertices:
        co = v.co
        region = classify(co, H, ax_info)
        region_count[region] = region_count.get(region, 0) + 1
        allowed = allowed_bones(region, names)
        if not allowed:
            unweighted.append(v.index)
            continue
        dists = []
        for bn in allowed:
            a, b = bones[bn]
            dists.append((bn, point_segment_distance(co, a, b)))
        dists.sort(key=lambda t: t[1])
        keep = dists[:MAX_INFLUENCES]
        ws = [(bn, 1.0 / ((dd + 1e-5) ** FALLOFF)) for bn, dd in keep]
        total = sum(w for _, w in ws)
        if total <= 0:
            unweighted.append(v.index)
            continue
        n_used = 0
        for bn, w in ws:
            nw = w / total
            if nw > 1e-5:
                groups[bn].add([v.index], nw, "REPLACE")
                n_used += 1
        influences_hist[n_used] = influences_hist.get(n_used, 0) + 1
        sums.append(total)

    print("\n=== 分区顶点数 ===")
    for k in sorted(region_count, key=lambda t: -region_count[t]):
        print(f"  {k:<12} {region_count[k]:>6}")

    # 校验
    bad_sum = []
    zero_w = []
    max_inf = 0
    for v in me.vertices:
        s = 0.0
        cnt = 0
        for g in v.groups:
            s += g.weight
            if g.weight > 1e-6:
                cnt += 1
        max_inf = max(max_inf, cnt)
        if cnt == 0:
            zero_w.append(v.index)
        elif abs(s - 1.0) > 1e-3:
            bad_sum.append((v.index, round(s, 5)))

    report = {
        "mesh_verts": len(me.vertices), "bone_count": len(names),
        "regions": region_count,
        "influences_histogram": influences_hist,
        "max_influences_per_vertex": max_inf,
        "max_influences_limit": MAX_INFLUENCES,
        "unweighted_vertices": len(zero_w),
        "unweighted_sample": zero_w[:10],
        "weight_sum_errors": len(bad_sum),
        "weight_sum_error_sample": bad_sum[:10],
        "vertex_groups_created": len(groups),
    }
    print("\n=== 权重校验 ===")
    print(f"  未加权顶点 {len(zero_w)}")
    print(f"  权重和偏离 1 的顶点 {len(bad_sum)}")
    print(f"  单顶点最大影响数 {max_inf}（上限 {MAX_INFLUENCES}）")
    print(f"  影响数分布 {influences_hist}")

    # 清掉没用到任何顶点的组，避免 glTF 里出现空组
    used = set()
    for v in me.vertices:
        for g in v.groups:
            if g.weight > 1e-6:
                used.add(ob.vertex_groups[g.group].name)
    empty = [n for n in names if n not in used]
    report["unused_vertex_groups"] = empty
    if empty:
        print(f"  没有任何顶点使用的骨骼组 {len(empty)} 个：{empty[:12]}"
              f"{' …' if len(empty) > 12 else ''}")

    # 绑定
    ob.parent = rig
    ob.parent_type = "OBJECT"
    mod = ob.modifiers.get("Armature") or ob.modifiers.new("Armature",
                                                           "ARMATURE")
    mod.object = rig
    mod.use_vertex_groups = True

    BUILD.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BUILD / "step3_weighted.blend"))
    print(f"\n[写出] {BUILD / 'step3_weighted.blend'}")
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "08_weights.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2))
    print(f"[写出] {REPORTS / '08_weights.json'}")
    return report


if __name__ == "__main__":
    main()
