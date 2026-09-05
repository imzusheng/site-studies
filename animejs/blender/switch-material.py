"""Apply the reproducible translucent nylon upper housing to the saved studio.

blender -b blender/luma-a343-studio.blend --python blender/switch-material.py
Only the switch portrait material and its light transport settings are changed.
"""
import bpy
from pathlib import Path


def upper_housing_material():
    material = bpy.data.materials.new('Switch translucent nylon upper housing')
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.92, .96, .95, 1)
    shader.inputs['Roughness'].default_value = .14
    shader.inputs['IOR'].default_value = 1.49
    shader.inputs['Transmission Weight'].default_value = .96
    shader.inputs['Specular IOR Level'].default_value = .5
    return material


def apply(scene):
    material = upper_housing_material()
    targets = [o for o in scene.objects if o.type == 'MESH' and 'top_housing' in o.name]
    assert len(targets) == 1, [o.name for o in targets]
    for obj in targets:
        obj.data = obj.data.copy()
        obj.data.materials.clear()
        obj.data.materials.append(material)
    scene.cycles.max_bounces = 12
    scene.cycles.transmission_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.samples = 80
    print('Applied translucent nylon:', [o.name for o in targets])


if __name__ == '__main__':
    apply(next(s for s in bpy.data.scenes if s.name.startswith('Luma Switch Portrait')))
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, compress=True)
