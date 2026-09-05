# A3.44 internal product films

These scenes use the frozen A3.44 product meshes from `Luma Color Graphite` in the retained website studio. They do not use the historical exploratory `Luma Chassis` scene. The actual internal support part is `esp32_m3_retainer`, with its three `retainer_m3_*` fixings.

- **Support:** 316 source meshes, four separately composed layers: upper shell, populated PCB, M3 retaining frame, and service cover. The layers have disjoint vertical bounds and modest lateral offsets. Over four seconds, their safe initial separation increases by 5%; the camera travels gently right and up. The composition sits on the right, leaving the left third for webpage text.
- **Interior:** 314 source meshes, the real PCB and retaining frame viewed from the populated underside. The assembled parts stay still. A short diagonal camera move and optical depth of field reveal the package, contact array, and retainer relationship. No reverse orbit or animated loose parts.

CAD-derived black/silver material classifications are preserved. Source CAD sRGB colors are converted to shader-linear values for these isolated film scenes. The PCB solder mask, matte retaining frame, and fixing hardware have explicit local studio finishes. No CAD geometry or approved hero assets are modified.

`internal-films.json` stores the cameras, frame counts, exposure, sampling, and output size. `build-internal-films.py` stores semantic grouping, safe per-layer offsets, and light positions. Both scenes and dependencies are retained in `luma-a344-internal-films.blend`.

Build through Blender MCP with `runpy.run_path` on `build-internal-films.py`. From the website root, render serially:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-internal-films.blend --python blender/render-internal-films.py -- support
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-internal-films.blend --python blender/render-internal-films.py -- interior
python3 blender/encode-internal-films.py support
python3 blender/encode-internal-films.py interior
```

Add `--preview` to either rendering invocation for a 960 × 540 / 24 sample still. Finals are 1280 × 720, 24 fps, 96 frames, Cycles 48 samples with denoising. Encoders require every frame before writing H.264 MP4 and WebP posters into `public/videos` and `public/images`.
