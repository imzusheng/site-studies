"""Raise the intro-film exposure for the low grazing-angle camera."""
import bpy

FILE = bpy.data.filepath
scene = next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film'))
print({'old_exposure': scene.view_settings.exposure})
scene.view_settings.exposure = -3.2
bpy.ops.wm.save_as_mainfile(filepath=FILE, compress=True)
print({'new_exposure': scene.view_settings.exposure, 'saved': FILE})
