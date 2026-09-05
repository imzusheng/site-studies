# A3.44 authored camera revision

The final color, structure, and core MP4s are rendered from `luma-a344-camera-films.blend`. This is an independent bundle of the existing retained scenes with camera animation updated, not rebuilt geometry. `author-camera-films.py` reads the saved color, internal, and studio scenes; it preserves their materials, geometry, physical normals, optical settings, and existing safe layer expansion.

`camera-films.json` is authoritative for the revised camera paths:

- **Colors:** 12° arc to the right with a continuous 50 mm rise, increasing visible parallax between three complete products.
- **Support:** 10° arc to the left with a 35 mm rise. Opposite arc direction, with the existing 5% additional layer opening retained. Left-side copy space remains. The broad fill is at (0.3, 0.16, 0.20) m, outside the cover plane; no normals workaround is applied.
- **Core:** 30 mm lateral rail with a 9 mm rise, fixed package target. This exposes the package edge and surrounding board parallax without the previous nearly axial push.

All paths are continuously sampled, one-way motions. Playback should hold the final frame and offer replay; do not ping-pong the film.

Re-author via Blender MCP using `runpy.run_path` on `author-camera-films.py`. Then render the GPU-heavy sequences serially from the website root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-camera-films.blend --python blender/render-camera-films.py -- colors
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-camera-films.blend --python blender/render-camera-films.py -- support
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-camera-films.blend --python blender/render-camera-films.py -- core
python3 blender/encode-colors-film.py
python3 blender/encode-internal-films.py support
python3 blender/encode.py core
```

Add `--preview` to render the first and last frame at 960 × 540. Final colors/support: 1280 × 720, 24 fps, 96 frames. Core: 1920 × 1080, 30 fps, 120 frames. The approved hero, switch, and interior films are unchanged.

Validation: all 312 frames rendered and encoded; first/last previews and final middle frames visually inspected. Complete MP4 decoding passed. ffprobe confirms colors/support: 96 frames, 24 fps, 1280 × 720, 4.0 s; core: 120 frames, 30 fps, 1920 × 1080, 4.0 s. Support cover has continuous lighting without the former triangular light boundary.
