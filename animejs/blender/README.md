# A3.43 Blender 制作工程

`luma-a343-studio.blend` 是随仓库提交的独立工程，包含首屏、ESP32-S3 核心、Choc V2 键轴、11 个可打印部件四个场景及所需模型和材质。渲染不依赖原作者 Downloads/Desktop 路径，也不会覆盖原始 CAD 工程。

## 已保存的制作条件

Blender 5.1.2 / Cycles；本机为 Apple M4 Metal。核心与键轴为 1920×1080、30 fps、120 帧，48 samples、降噪、AgX Medium High Contrast。参数与相机位置在 `production.json`；灯光尺寸、功率、材质、零件布局和景深设置由 `build-production.py` 明确定义。首屏沿用此前确定的 150 帧场景：32 samples、100 mm / f22、曝光 -4，其完整动画与灯光参数保存在 `.blend` 中。

- 核心：100 mm / f18，真实主板上封装微距。按 Waveshare 官方板上资源照片与器件位置识别封装；ESP32-S3 字样是展示标识，不虚构芯片内部结构。12 个同形状、同位置的供应商重复实体仅在展示中去重。
- 键轴：85 mm / f24，真实 Choc V2 零件在固定分离姿态下拍摄，镜头单向移动。
- 制作海报：75 mm / f32，11 个真实可打印部件、暖灰背景、固定大面积软光。
- 参考定位：[Waveshare ESP32-S3-LCD-2](https://docs.waveshare.com/ESP32-S3-LCD-2)。

## 直接重渲染

从 `animejs` 目录执行。macOS 的 Blender 命令如下；其他系统替换可执行文件路径即可。无兼容 GPU 时脚本回退 CPU。

```bash
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b blender/luma-a343-studio.blend --python blender/render.py -- core
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b blender/luma-a343-studio.blend --python blender/render.py -- switch
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b blender/luma-a343-studio.blend --python blender/render.py -- craft --preview
```

将 `core` 改为 `intro` 可重渲染现有首屏。动画命令加 `--preview` 只渲染首、中、尾三帧。工作 PNG 写入被 Git 忽略的 `renders/production/`。

安装 Python 3 与 FFmpeg 后编码：

```bash
python3 blender/encode.py core
python3 blender/encode.py switch
python3 blender/encode.py craft
```

编码设置为 H.264、CRF 18、slow、yuv420p、faststart，无音轨；封面为 WebP。脚本检查序列完整后才生成动画。首屏对应 `python3 blender/encode.py intro`。

## 改镜头、灯光与材质

编辑 `production.json` / `build-production.py`，再以 Blender MCP 或 Blender Python 执行 `build-production.py`。脚本从保存的首屏场景复制 A3.43 模型，建立独立场景，并将最终场景导出到本目录 `.blend`。随后重新运行渲染和编码。**只编辑 JSON 不会改变已经保存的场景，需重新建景。**

命令行建景：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python blender/build-production.py
```

建景导出的是场景库，渲染脚本会自动选中对应场景。若要像当前提交工程一样，双击打开即选中首屏，可在导出后执行：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b blender/luma-a343-studio.blend --python-expr "import bpy; bpy.context.window.scene=next(s for s in bpy.data.scenes if s.name.startswith('Luma Intro Film')); bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)"
```

历史首屏建景脚本在 `../scripts/build-intro-video.py`，若需要从原始物理孪生工程重新构建，可通过 `LUMA_A343_SOURCE` 提供原始 `.blend` 路径；日常重渲染无需该文件。

静态构图、视频首中尾与浏览器播放需人工视觉检查；构建通过不等于作品验收。
