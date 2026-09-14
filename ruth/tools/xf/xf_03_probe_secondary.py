"""定位裙/马尾次级骨的 180° 到底是怎么来的。

对第 0 帧逐骨打印：
  - rotation_mode / 是否有 scale 键
  - 局部 pose 旋转（pb.rotation_quaternion / matrix_basis）的轴与角
  - armature 空间相对 rest 的旋转轴与角
  - Action 里该骨的 fcurve 关键帧值（确认是否已烘进动作）
  - 骨骼自身的 rest 方向与 roll

用法：blender -b ruth_forehand_v1.blend -P xf_03_probe_secondary.py
"""
import json
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

TMP = Path("/tmp")
scene = bpy.context.scene
rig = bpy.data.objects["Ruth_Rig"]
scene.frame_set(0)
bpy.context.view_layer.update()

TARGETS = ["Hips", "RightUpLeg", "Spine", "Chest",
           "SkirtF1", "SkirtF2", "SkirtF3",
           "SkirtB1", "SkirtL1", "SkirtL2", "SkirtL3", "SkirtR1",
           "Ponytail1", "Ponytail2", "Ponytail3", "Ponytail4",
           "Head", "RightHand", "RacketSocket"]


def axis_angle(q):
    if q.w < 0:
        q = -q
    ax = Vector(q.axis) if q.angle > 1e-6 else Vector((0, 0, 0))
    return {
        "angle_deg": round(float(np.rad2deg(q.angle)), 3),
        "axis": [round(float(v), 4) for v in ax],
    }


# --------------------------------------------------- Action fcurve 取值
act = rig.animation_data.action
print(f"Action: {act.name}   slots={[s.name_display for s in act.slots]}")
print(f"  is_action_layered={act.is_action_layered}")

# 取该 action 上某个骨骼某属性的已烘关键帧
fcurve_index = {}
if act.is_action_layered:
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    fcurve_index.setdefault(fc.data_path, {})[fc.array_index] = fc
else:
    for fc in act.fcurves:
        fcurve_index.setdefault(fc.data_path, {})[fc.array_index] = fc

print(f"  data_path 组数 = {len(fcurve_index)}")
bones_with_keys = set()
for dp in fcurve_index:
    if dp.startswith('pose.bones["'):
        bones_with_keys.add(dp.split('"')[1])
print(f"  有 fcurve 的骨骼数 = {len(bones_with_keys)} / {len(rig.pose.bones)}")
missing = [pb.name for pb in rig.pose.bones if pb.name not in bones_with_keys]
print(f"  没有 fcurve 的骨骼 ({len(missing)}): {missing[:30]}")

print("\n" + "=" * 78)
out = {}
for name in TARGETS:
    pb = rig.pose.bones.get(name)
    if pb is None:
        print(f"{name}: 不存在")
        continue
    rest_m = pb.bone.matrix_local
    rel = rest_m.inverted() @ pb.matrix
    local = pb.matrix_basis
    ent = {
        "rotation_mode": pb.rotation_mode,
        "local_basis": axis_angle(local.to_quaternion()),
        "local_translation_mm": [round(v * 1000, 3) for v in local.translation],
        "local_scale": [round(v, 6) for v in local.to_scale()],
        "armature_space_delta": axis_angle(rel.to_quaternion()),
        "armature_space_trans_mm": round(float(rel.translation.length) * 1000, 3),
        "rest_head_mm": [round(v * 1000, 1) for v in rest_m.translation],
        "rest_bone_y_dir": [round(float(v), 4) for v in
                            (rest_m.to_3x3() @ Vector((0, 1, 0))).normalized()],
        "bone_length_mm": round(pb.bone.length * 1000, 2),
    }
    if pb.rotation_mode == "QUATERNION":
        ent["pose_rq"] = [round(v, 5) for v in pb.rotation_quaternion]
    else:
        ent["pose_re"] = [round(float(np.rad2deg(v)), 3) for v in pb.rotation_euler]

    # fcurve 原始关键帧（frame 0 与后半段）
    fcs = fcurve_index.get(f'pose.bones["{name}"].rotation_quaternion', {})
    if fcs:
        ks = []
        for ai in sorted(fcs):
            fc = fcs[ai]
            ks.append([round(float(k.co[1]), 5) for k in fc.keyframe_points[:3]])
        ent["fcurve_rq_first3"] = ks
    out[name] = ent

    print(f"{name:14s} mode={pb.rotation_mode:10s} len={ent['bone_length_mm']:6.1f}mm "
          f"rest_dir={ent['rest_bone_y_dir']}")
    print(f"   局部 basis: 角={ent['local_basis']['angle_deg']:8.3f}° "
          f"轴={ent['local_basis']['axis']}  平移={ent['local_translation_mm']} mm "
          f"scale={ent['local_scale']}")
    print(f"   armature Δ: 角={ent['armature_space_delta']['angle_deg']:8.3f}° "
          f"轴={ent['armature_space_delta']['axis']}  平移={ent['armature_space_trans_mm']} mm")
    if "pose_rq" in ent:
        print(f"   pose_rq={ent['pose_rq']}")

# 次级骨该不该有 fcurve
print("\n" + "=" * 78)
sec = [pb.name for pb in rig.pose.bones
       if pb.name.startswith(("Skirt", "Ponytail"))]
print(f"次级骨共 {len(sec)}: {sec}")
print(f"其中有 fcurve 的: {[b for b in sec if b in bones_with_keys]}")
print(f"其中没有 fcurve 的: {[b for b in sec if b not in bones_with_keys]}")

(TMP / "xf_secondary_probe.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2, default=str))
print(f"\n[写出] {TMP/'xf_secondary_probe.json'}")
