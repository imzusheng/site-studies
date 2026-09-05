# A3.44 three-color film

This is a single Blender scene containing three complete 450-mesh A3.44 assemblies. Chalk, Ember, and Graphite share three broad studio area lights and one 70 mm perspective camera. It is not a composite of individually rendered images. Printable surfaces retain the approved matte color materials. Switch upper housings use the translucent nylon material.

`colors-film.json` records the layout, camera endpoints, exposure, output size, frame count, and sampling. Each assembly remains rigid. The camera drifts right and approaches gently throughout the 96-frame shot; there is no reverse or ping-pong section. Playback should finish on the last frame with a replay button.

The source studio is read-only during this build. The separate `luma-a344-colors.blend` retains the complete scene, materials, and keyed camera. The hero film and CAD remain unchanged.

Rebuild via Blender MCP by running `build-colors-film.py`, or in Blender Python with `runpy.run_path`. Then render and encode from the website root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-colors.blend --python blender/render-colors-film.py -- --preview
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-colors.blend --python blender/render-colors-film.py
python3 blender/encode-colors-film.py
```

Final deliverables: `public/videos/luma-a344-colors.mp4` and `public/images/luma-a344-colors.webp`. Full frames remain in the ignored `renders/production/colors` folder. Render GPU-heavy sequences serially.
