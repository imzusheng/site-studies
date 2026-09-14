"""Stage A-0：盘点实际保存的 ruth_forehand_v1.blend，不做任何修改。

用法（headless）：
  blender -b ruth_forehand_v1.blend -P 00_inspect_blend.py

输出：/tmp/xf_blend_inventory.json + 屏幕摘要
"""
import json
import sys
from pathlib import Path

import bpy

OUT = Path("/tmp/xf_blend_inventory.json")

scene = bpy.context.scene
info = {
    "file": bpy.data.filepath,
    "file_size": Path(bpy.data.filepath).stat().st_size,
    "fps": scene.render.fps / scene.render.fps_base,
    "frame_start": scene.frame_start,
    "frame_end": scene.frame_end,
    "frame_current": scene.frame_current,
    "engine": scene.render.engine,
    "resolution": [scene.render.resolution_x, scene.render.resolution_y,
                   scene.render.resolution_percentage],
    "units": {
        "scale_length": scene.unit_settings.scale_length,
        "system": scene.unit_settings.system,
    },
    "objects": [],
    "armatures": [],
    "actions": [],
    "materials": [],
    "images": [],
}

for o in bpy.data.objects:
    d = {
        "name": o.name,
        "type": o.type,
        "parent": o.parent.name if o.parent else None,
        "parent_type": o.parent_type,
        "parent_bone": o.parent_bone,
        "matrix_world_translation": [round(v, 6) for v in o.matrix_world.translation],
        "scale": [round(v, 6) for v in o.matrix_world.to_scale()],
        "rotation_quat": [round(v, 6) for v in o.matrix_world.to_quaternion()],
        "is_identity": all(
            abs(o.matrix_world[i][j] - (1.0 if i == j else 0.0)) < 1e-6
            for i in range(4) for j in range(4)),
        "hide_render": o.hide_render,
        "modifiers": [{"type": m.type, "name": m.name,
                       "object": getattr(m, "object", None).name
                       if getattr(m, "object", None) else None}
                      for m in o.modifiers],
        "vertex_groups": len(o.vertex_groups) if o.type == "MESH" else None,
        "materials": [m.name for m in o.data.materials if m] if o.type == "MESH" else None,
        "verts": len(o.data.vertices) if o.type == "MESH" else None,
        "polys": len(o.data.polygons) if o.type == "MESH" else None,
        "shape_keys": bool(o.data.shape_keys) if o.type == "MESH" else None,
    }
    if o.type == "ARMATURE":
        d["bones"] = len(o.data.bones)
        d["bone_names"] = [b.name for b in o.data.bones]
        d["has_pose_position"] = o.data.pose_position
        d["display_type"] = o.data.display_type
        anim = o.animation_data
        d["animation_data"] = {
            "has_action": bool(anim and anim.action),
            "action": anim.action.name if anim and anim.action else None,
            "nla_tracks": len(anim.nla_tracks) if anim else 0,
            "nla_track_names": [t.name for t in anim.nla_tracks] if anim else [],
        }
    if o.type == "CAMERA":
        d["lens"] = o.data.lens
        d["sensor_width"] = o.data.sensor_width
        d["sensor_fit"] = o.data.sensor_fit
        d["type_cam"] = o.data.type
        d["ortho_scale"] = o.data.ortho_scale if o.data.type == "ORTHO" else None
    info["objects"].append(d)

for a in bpy.data.armatures:
    info["armatures"].append({"name": a.name, "bones": len(a.bones)})

for act in bpy.data.actions:
    fr = act.frame_range
    users = [o.name for o in bpy.data.objects
             if o.animation_data and o.animation_data.action == act]
    info["actions"].append({
        "name": act.name,
        "frame_range": [round(fr[0], 3), round(fr[1], 3)],
        "n_fcurves": len(act.fcurves) if hasattr(act, "fcurves") else None,
        "users": users,
        "slots": [s.name_display for s in act.slots] if hasattr(act, "slots") else None,
    })

for m in bpy.data.materials:
    entry = {"name": m.name, "use_nodes": m.use_nodes,
             "blend_method": getattr(m, "blend_method", None),
             "images": []}
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.bl_idname == "ShaderNodeTexImage" and n.image:
                entry["images"].append({
                    "node": n.name,
                    "image": n.image.name,
                    "size": list(n.image.size),
                    "colorspace": n.image.colorspace_settings.name,
                })
    info["materials"].append(entry)

for im in bpy.data.images:
    info["images"].append({"name": im.name, "size": list(im.size),
                           "packed": bool(im.packed_file),
                           "filepath": im.filepath})

OUT.write_text(json.dumps(info, ensure_ascii=False, indent=2))
print("=" * 70)
print(f"文件 {info['file']}  {info['file_size']/1e6:.1f} MB")
print(f"FPS {info['fps']}  帧范围 {info['frame_start']}–{info['frame_end']}  "
      f"引擎 {info['engine']}  分辨率 {info['resolution']}")
for o in info["objects"]:
    line = f"  {o['type']:9s} {o['name']:28s} parent={o['parent']}"
    if o["type"] == "MESH":
        line += f"  v={o['verts']} p={o['polys']} vg={o['vertex_groups']} mods={[m['type'] for m in o['modifiers']]}"
    if o["type"] == "ARMATURE":
        line += f"  bones={o['bones']} action={o['animation_data']['action']}"
    print(line)
print("=" * 70)
print(f"[写出] {OUT}")
