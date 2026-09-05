"""Synchronize source CAD meshes in non-hero studio scenes by semantic ID.

Run after build-production.py/build-expansion.py. Reads the committed A3.44
lossless STL assets, preserves authored object transforms/materials/cameras,
and leaves the approved A3.43 Intro scene and encoded video unchanged.
"""
import bpy, gzip, hashlib, json, struct
from pathlib import Path
BASE = Path(__file__).resolve().parent
FILE = BASE / 'luma-a343-studio.blend'
SOURCE = BASE.parent / 'public/models/a344'
MANIFEST = json.loads((SOURCE / 'ASSEMBLY_MANIFEST.json').read_text())
PARTS = {part['id']: part for part in MANIFEST['parts']}
# Scene membership and semantic IDs preserve authored compositions across revisions.
# Presentation-only objects (lights, labels, floors) are not source CAD meshes.
with bpy.data.libraries.load(str(FILE), link=False) as (library, loaded):
    loaded.scenes = list(library.scenes)
scenes = loaded.scenes
updated = []
removed = []
for scene in scenes:
    if scene.name.startswith(('Luma Intro Film', 'Luma Chassis')):
        continue
    scene.frame_set(1)
    for obj in list(scene.objects):
        part_id = obj.get('id') or obj.name.split('.')[0]
        if part_id.startswith('lcd_fpc_'):
            for collection in list(obj.users_collection):
                if collection in list(scene.collection.children) or collection == scene.collection:
                    collection.objects.unlink(obj)
            removed.append((scene.name, part_id))
            continue
        if obj.type != 'MESH' or part_id not in PARTS:
            continue
        part = PARTS[part_id]
        if obj.get('mesh_sha256') == part['meshSha256']:
            continue
        raw = gzip.decompress((SOURCE / 'stl' / (part['filename'] + '.gz')).read_bytes())
        assert hashlib.sha256(raw).hexdigest() == part['meshSha256']
        vertices, faces = [], []
        for face in range(struct.unpack_from('<I', raw, 80)[0]):
            values = struct.unpack_from('<12fH', raw, 84 + face * 50)
            start = len(vertices)
            vertices.extend([values[3:6], values[6:9], values[9:12]])
            faces.append((start, start + 1, start + 2))
        mesh = bpy.data.meshes.new(part_id + ' A3.44')
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        # Weld STL facet vertices so the original bevel/normal modifiers still work.
        import bmesh
        bm = bmesh.new(); bm.from_mesh(mesh)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
        bm.to_mesh(mesh); bm.free(); mesh.update()
        for mat in obj.data.materials:
            mesh.materials.append(mat)
        obj.data = mesh
        obj['source_revision'] = MANIFEST['profile']['metrics']['revision']
        obj['mesh_sha256'] = part['meshSha256']
        updated.append((scene.name, part_id))
    scene['source_revision'] = MANIFEST['profile']['metrics']['revision']
    scene['source3mfSha256'] = MANIFEST['profile']['metrics']['source3mfSha256']
bpy.data.libraries.write(str(FILE), set(scenes), path_remap='RELATIVE', fake_user=True, compress=True)
print(json.dumps({'updated': updated, 'removed': removed, 'studio': str(FILE)}))
