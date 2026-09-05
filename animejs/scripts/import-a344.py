"""Copy the formal A3.44 runtime without mesh simplification.

Usage: python3 scripts/import-a344.py /path/to/luma-remote
The gzip payload preserves every original STL byte and canonical motion keyframe.
"""
import gzip
import hashlib
import json
import pathlib
import sys

source = pathlib.Path(sys.argv[1]).resolve()
runtime = source / 'hardware/mechanical/exports/assembly/profiles/industrial_a3_44/web_runtime'
destination = pathlib.Path(__file__).resolve().parents[1] / 'public/models/a344'
manifest = json.loads((runtime / 'ASSEMBLY_MANIFEST.json').read_text())
assert manifest['profile']['id'] == 'industrial_a3_44'
assert manifest['sceneKind'] == 'physical-assembly-validation'
parts = manifest['parts']
assert parts and manifest['partCount'] == len(parts)
assert len({part['id'] for part in parts}) == len(parts)
assert not any(part['id'].startswith('lcd_fpc_') for part in parts)
lcd = [part for part in parts if part['group'] == 'lcd']
assert lcd and all(part['explodeKeyframesMm'] == lcd[0]['explodeKeyframesMm'] for part in lcd)
assert sum(bool(part['printable']) for part in manifest['parts']) == 11
(destination / 'stl').mkdir(parents=True, exist_ok=True)
raw_bytes = compressed_bytes = 0
for part in manifest['parts']:
    assert part['explodeKeyframesMm'], part['id']
    data = (runtime / 'stl' / part['filename']).read_bytes()
    compressed = gzip.compress(data, compresslevel=9, mtime=0)
    assert gzip.decompress(compressed) == data
    (destination / 'stl' / (part['filename'] + '.gz')).write_bytes(compressed)
    part['meshSha256'] = hashlib.sha256(data).hexdigest()
    raw_bytes += len(data)
    compressed_bytes += len(compressed)
manifest['assetBase'] = '/models/a344/'
manifest['meshCompression'] = 'gzip'
manifest['presentationSource'] = {
    'kind': 'formal-physical-twin',
    'sourceManifestSha256': hashlib.sha256((runtime / 'ASSEMBLY_MANIFEST.json').read_bytes()).hexdigest(),
    'meshEncoding': 'binary STL, gzip (lossless)',
    'rawMeshBytes': raw_bytes,
    'compressedMeshBytes': compressed_bytes,
}
# Retire assets removed from the source instead of keeping obsolete display parts.
expected_files = {part['filename'] + '.gz' for part in parts}
for old_mesh in (destination / 'stl').glob('*.gz'):
    if old_mesh.name not in expected_files:
        old_mesh.unlink()
(destination / 'ASSEMBLY_MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n')
print(f"A3.44: {len(manifest['parts'])} objects, {raw_bytes:,} → {compressed_bytes:,} bytes (lossless gzip)")
