"""Apply the approved A3.44 printed material to the intro-film printable parts.

Mirrors review_a3_44.py's "A3.44 Review printed ember": matte, low
reflectivity, subtle noise-bump print texture; color picks one of the
approved palette in expansion.json (graphite/chalk/ember). Geometry,
animation, cameras and lights are untouched.

Usage: blender -b luma-a343-studio.blend --python apply-print-material.py -- [color]
"""
import bpy
import sys

from pathlib import Path

BASE = Path(__file__).resolve().parent
FILE = BASE / "luma-a343-studio.blend"

PALETTE = {
    "graphite": (0.028, 0.032, 0.036),
    "chalk": (0.55, 0.52, 0.45),
    "ember": (0.35, 0.07, 0.024),
}

PRINTABLE = {
    "cosmetic_upper_shell",
    "bottom_service_cover_battery_cradle",
    "screen_bezel",
    "esp32_m3_retainer",
    "ec11_knob_22p5",
    *[f"keycap_{i}" for i in range(1, 7)],
}


def printed_material(color_name="ember"):
    color = PALETTE[color_name]
    label = f"A3.44 Review printed {color_name}"
    material = bpy.data.materials.get(label) or bpy.data.materials.new(label)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bs = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Roughness"].default_value = 0.82
    bs.inputs["Specular IOR Level"].default_value = 0.22
    bs.inputs["Metallic"].default_value = 0
    for node in list(nodes):
        if node.type in ("TEX_COORD", "TEX_NOISE", "BUMP") and node.name.startswith("A3.44"):
            nodes.remove(node)
    tex = nodes.new("ShaderNodeTexCoord")
    tex.name = "A3.44 Object"
    noise = nodes.new("ShaderNodeTexNoise")
    noise.name = "A3.44 Noise"
    noise.inputs["Scale"].default_value = 4.5
    bump = nodes.new("ShaderNodeBump")
    bump.name = "A3.44 Bump"
    bump.inputs["Strength"].default_value = 0.22
    bump.inputs["Distance"].default_value = 0.12
    links.new(tex.outputs["Object"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bs.inputs["Normal"])
    return material


def apply(scene, color_name="ember"):
    material = printed_material(color_name)
    changed = []
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        if (obj.get("id") or obj.name.split(".")[0]) not in PRINTABLE:
            continue
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(material)
        changed.append(obj.name)
    print({"applied": len(changed), "objects": changed, "material": material.name})


if __name__ == "__main__":
    argv = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "ember"
    apply(next(s for s in bpy.data.scenes if s.name.startswith("Luma Intro Film")), argv)
    bpy.ops.wm.save_as_mainfile(filepath=str(FILE), compress=True)
    print({"saved": str(FILE)})
