# A3.44 Blender 制作工程（保留已认可首屏）

`luma-a343-studio.blend` 保留历史文件名，是随仓库提交的独立工程。它包含已认可的 A3.43 首屏，以及核心、键轴、可打印部件、三配色和内层支架场景；非首屏产品模型按已批准的 A3.44 同步。渲染不依赖原作者 Downloads/Desktop 路径，也不会覆盖原始 CAD 工程。

## 已保存的制作条件

Blender 5.1.2 / Cycles；本机为 Apple M4 Metal。核心与键轴为 1920×1080、30 fps、120 帧，核心 48 samples、键轴 80 samples，降噪、AgX Medium High Contrast。参数与相机位置在 `production.json`；灯光尺寸、功率、材质、零件布局和景深设置由 `build-production.py` 明确定义。首屏沿用此前确定的 150 帧场景：32 samples、100 mm / f22、曝光 -4，其完整动画与灯光参数保存在 `.blend` 中。

- 核心：100 mm / f18，真实主板上封装微距。按 Waveshare 官方板上资源照片与器件位置识别封装；ESP32-S3 字样是展示标识，不虚构芯片内部结构。12 个同形状、同位置的供应商重复实体仅在展示中去重。
- 键轴：85 mm / f24，真实 Choc V2 零件在固定分离姿态下拍摄，镜头单向移动。上壳为轻雾面透射尼龙（IOR 1.49、透射 0.96、粗糙度 0.14），可见内部棕色轴芯与壳壁折射；80 samples、12 次总反弹、8 次透射反弹。参数在 `switch-material.py`，建景会自动应用。
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

## 已批准模型同步

`apply-a344.py` 从 `public/models/a344/ASSEMBLY_MANIFEST.json` 读取语义 ID 与 STL 哈希，替换非首屏场景中的源 CAD 网格，保留材质、对象变换、镜头与灯光。没有改变的哈希自动跳过；LCD 排线及金手指从展示场景移除。无需每次增加键帽、旋钮等零件的硬编码名单。源资产更新后执行：

```bash
/Applications/Blender.app/Contents/MacOS/Blender --factory-startup -b --python blender/apply-a344.py
```

重新执行 `build-production.py` 或 `build-expansion.py` 后，也必须执行该同步步骤，因为它们仍从冻结的首屏场景取得初始素材。首屏 `Luma Intro Film` 和独立的内层支架 `Luma Chassis` 场景不在替换范围；首屏 MP4 不重渲染、不覆盖。

本次 A3.44 更新重渲染三配色与制作海报。核心视频中的硬件几何未改变，继续使用已有视频；键轴视频因透射材质修复已完整重渲染。后续若修改对应硬件，应同步场景后按上述完整序列命令重渲染，不能只修改海报。

## 键轴透射材质修复

已有工程可单独执行 `blender -b blender/luma-a343-studio.blend --python blender/switch-material.py`，只更新键轴特写场景。随后完整渲染并编码 `switch`；仅更新海报不能修复视频。上壳使用实体透射，不通过降低 Alpha 隐藏几何。CAD、首屏及其他场景不受这个脚本影响。

## 三色与内部影片

三色同框使用独立 `luma-a344-colors.blend`，参数在 `colors-film.json`，重建与渲染见 `COLORS_FILM.md`。

内部两片使用 `luma-a344-internal-films.blend`，参数在 `internal-films.json`，建景脚本为 `build-internal-films.py`。support 展示冻结 A3.44 上壳、板卡、ESP32 M3 固定架与底盖的分层关系，替代网页旧探索支架；interior 从元件面微距展示板卡和固定架。两片均为 1280×720、24 fps、96 帧、48 samples，真实景深，单向镜头，无往返循环。补光面位于组件外侧，避免穿入底盖产生硬边亮斑。

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-internal-films.blend --python blender/render-internal-films.py -- support
python3 blender/encode-internal-films.py support
/Applications/Blender.app/Contents/MacOS/Blender -b blender/luma-a344-internal-films.blend --python blender/render-internal-films.py -- interior
python3 blender/encode-internal-films.py interior
```

独立工程包含模型与材质，直接重渲染不依赖 CAD 原仓库。重新建景时脚本从同目录 studio 读取冻结配色场景。编码成品和海报位于 `public/videos` 与 `public/images`；中间 PNG 帧不入库，可从工程再生成。

## 当前三支短片的镜头版本

三色、内外分工与核心的最终镜头由 [CAMERA_FILMS.md](CAMERA_FILMS.md) 说明，参数在 `camera-films.json`，可直接从 `luma-a344-camera-films.blend` 重渲染。原工程保留作为材质和几何来源；重建原场景后应再次运行 `author-camera-films.py`，避免回退到旧镜头。

## 首屏运镜与草稿审核工作流（2026-09-06 起标准流程）

首屏（`Luma Intro Film` 场景）的模型、材质、运镜改动一律走"改 → 草稿 → 人工审核 → 全量"循环，不做未审核的全量渲染。本机（Windows + RTX 4060）命令如下，macOS 把可执行文件换成 `/Applications/Blender.app/Contents/MacOS/Blender` 即可。

### 流程链

1. **几何同步**：`blender --factory-startup -b blender/luma-a343-studio.blend --python blender/apply-a344.py` —— 首屏已纳入同步范围（按 MANIFEST 语义 ID + mesh SHA-256 换网格，自动移除 LCD 排线/金手指）。
2. **打印材质**：`--python blender/apply-print-material.py -- graphite|chalk|ember` —— 给 11 个打印件上 A3.44 审核材质（哑光 + Noise Bump 颗粒，参数与 `review_a3_44.py` 一致）；颜色权威值在 `expansion.json` 的 `colors`。
3. **运镜**：`--python blender/recamera-intro.py` —— 重写首屏相机 150 帧关键帧：位置 y -0.22→-0.30、z 0.075→0.197（后退+抬升），x 恒 0（严禁横向位移，ease 曲线下会放大成侧摆），二次 ease-out（速度线性递减缓停，无过冲），逐帧 aim target，镜头 100mm/f22 不变。改前备份 `.pre-recamera.bak`。
4. **灯光渐亮**：`--python blender/relight-intro.py` —— 四盏灯错峰接力（全部二次 ease-out）：`Intro front boost`（正面补光，0→1.2W，帧 1-30 亮起照亮竖立阶段、帧 30-105 随躺下淡出）、`Cool side bounce`（rim 勾边，帧 1-40，起始 0.15）、`Broad front fill`（帧 1-60，起始 0.2）、`Wide warm ceiling`（主顶光，帧 10-80 最后打亮 + 位置从低后角扫入）。幂等可重跑。
5. **产品躺倒**：`--python blender/recline-intro.py` —— 450 个网格逐帧写世界矩阵关键帧，绕前缘底部 hinge (0,-0.0405,0)m 从 +90°（屏幕面对镜头）→0°（平放），二次 ease-out。**必须从干净基线运行**（脚本内置断言：对象 scale 须为 0.001，即网格毫米数据×0.001 缩放=世界米；破坏即中止）。
6. **曝光**：`--python blender/reexposure-intro.py` —— 当前 -3.2；改机位/灯光后必须复核。
7. **构图留白**：`--python blender/reshift-intro.py` —— 静态 `camera.data.shift_y`（当前 0.20：旋钮半露 + 上方留白），不改透视。
8. **草稿**：`--python blender/render.py -- intro --draft`（640×360、8 samples、无降噪，GPU 约 1s/帧）→ ffmpeg 编 MP4 / PIL 拼 sheet → 交人工审核。快速构图检查可用 `-- preview`（首/中/尾三帧 1080p）。
9. **全量**：审核通过后 `--python blender/render.py -- intro`（1080p、32 samples、150 帧，GPU 约 6s/帧 ≈ 16 分钟）。
10. **编码接入**：`python blender/encode.py intro` → `public/videos/luma-a344-intro.mp4` + WebP 海报；更新 `index.html` 首屏 `<video>` 引用与本文档口径；ffprobe 验证（1920×1080 / 30fps / 150 帧 / 5s）。

### 已定稿的构图语言（用户 2026-09-06 审定，改动前先对照）

- **躺倒开场**：产品竖立、屏幕面对镜头（全黑中仅 LCD 轮廓微光），随后绕前缘向后躺平（+90°→0°，二次 ease-out 缓停）；相机同步后退+抬升（y -0.22→-0.30、z 0.075→0.197），x 恒 0 无侧摆。
- **灯光接力**：正面 boost 照亮竖立阶段（前 1 秒主体必须可见，打亮窗口不得后置）→ 随躺下淡出；rim 勾边先现、fill 跟进、主顶光最后打亮+扫入；屏幕是画面里的背光亮点。
- **收尾定妆**（frame 150）：产品平放居中、旋钮至少露一半（shift_y 0.20）、上方留白给标题、顶面轮廓完整入画、结尾不出现完整全身。配套 CSS `.intro-heading` padding-top 19vh（移动端 17vh）。
- 材质必须与 luma-remote 仓库 A3.44 审核图一致（哑光打印颗粒），不是光滑软触感。
- 动画曲线一律二次 ease-out（速度线性递减缓停）；线性、cubic、任何过冲回弹都被否。

### 本机已知的坑

- **GPU 静默回退 CPU**：`--factory-startup -b` 下 `compute_device_type` 的 `enum_items` 为空，"先判断后赋值"永不匹配 → 25s/帧。`render.py` 已改为 try 直赋 OPTIX→CUDA→HIP→METAL；生效标志是日志打印 `{"device_type":"OPTIX",...}` 且帧速约 6s。任务管理器看不到 Blender 的 GPU 占用不能说明没用 GPU。
- **Blender 5.2 slotted Action**：`action.fcurves` 不存在；fcurves 在 `layers[].strips[].channelbags[]`。同一 action 常被多场景共享，遍历修改会污染别的场景；必须只改 `bag.slot_handle == obj.animation_data.action_slot.handle` 的 bag。孤立 slot 上的 fcurve（如原 shift_y 动画）从未生效，诊断后改静态值。
- 任何脚本写回 `luma-a343-studio.blend` 前先做 `.bak` 备份；材质/相机脚本只动自己的范围，不动几何/动画/灯光。

### Blender GUI 实时预览（不渲染看运镜）

切场景到 `Luma Intro Film.005`（注意别停在 `Luma Chassis Portrait` 灰骨架场景）→ 鼠标悬停视口按 Numpad 0 进相机视角 → 视口着色切 Material Preview → 拖时间轴/空格播放。CLI 改过 blend 后需 File → Revert 重新载入。
