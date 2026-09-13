# Baseline Club · local.1

本地网球原型：对战、训练、动作室、上一拍回放。单文件 `index.html` 内置全部运行资源，可直接用 Edge / Chrome 打开。

## 本次改动

- 默认击球宽容：可及范围 1.50 m，早 120 ms / 晚 200 ms 的击球窗口；推荐站位仅作提示。关闭辅助后仍按身边来球判定。玩家跑速不再随对手难度降低。
- Rain / Snow 从 Blender Studio 原始工程重新导出。保留原身体权重、手指、分段身体变形骨骼、UV 和纹理，球拍固定在原手骨。离线修正部分躯干穿插，运行时不将手臂拉长去追球。
- 六段 Tennis-MoCap 挥拍与四段 Mesh2Motion 跑步 / 侧移 / 后退动作，烘焙到两套人物。回放保存并插值完整骨骼。
- Poly Haven HDR 环境光、真实草地纹理、更细的植被和克制的球场配色。

这是风格化 WebGL 原型，尚未达到 FIFA / EA Sports FC 的写实人物、表情、服装和动作融合品质。有限的躯干避让不等于全帧无穿插；双手配合和极端姿态仍有提升空间。

## 开发与启动

Node.js 22+，无 npm 运行依赖；不需要 `npm install`。当前 Windows 已验证 Node 24.21.0。

```powershell
node tools/run-bounded.mjs 30000 node tools/build.mjs
node tools/run-bounded.mjs 15000 node tests/physics.mjs
node tools/run-bounded.mjs 15000 node tests/contact.mjs
node tools/run-bounded.mjs 1800000 node tools/serve.mjs
```

打开 <http://127.0.0.1:5183/>。端口占用时用 `$env:PORT=5184` 指定其他端口。也可直接打开 `index.html`，不依赖服务。

WASD / 方向键移动，空格按住蓄力、松开挥拍，P 暂停，R 重开，J 回放，Escape 退出回放。设置中可独立关闭击球宽容、自动跑位、节奏与视觉提示。

## 文件入口

- `src/app.js`：人物、球物理、球场、玩法与回放；`src/template.html` / `src/style.css`：界面。
- `assets/manifest.json`：运行资产清单；`vendor/`：离线 Three.js 及 HDR 解析器。
- `tools/build.mjs`：确定性打包 HTML；`tools/package.py`：ZIP 打包、CRC 检查和全新目录重建校验。
- `tools/export-rain-pro.py` / `export-snow-pro.py`：原生 Blender 骨骼离线适配；详见 `docs/rain-native-rig.md` 与 `docs/snow-native-rig.md`。
- `tools/import-locomotion.mjs`：将 CC0 下肢动作与网球准备姿态组合。原始资源 URL 和摘要在 `assets-source/community-assets.json`。
- `docs/LOCAL_VERIFICATION.md`：本次实际验证与限制；`artifacts/`：浏览器实拍。
- `docs/handoff-rc2/`：旧交接材料，仅为历史记录，其路径、版本、测试结论不代表当前构建。

`assets/rain.glb` 和 `assets/snow.glb` 是旧版 18 骨参考，仅供导出脚本读取兼容坐标；当前运行使用 `*-pro.glb`。

## 人物资产环境

当前验证环境为 Blender 5.2.1 LTS、其自带 NumPy 2.3.4 与 Pillow 12.3.0。Pillow 已补齐；脚本用 `--python-use-system-env`。日常修改玩法或构建 HTML 不需要启动 Blender。

人物原始 `.blend` 在 `.cache/`，体积较大，不进入交付包；可从 `assets-source/community-assets.json` 的官方地址重取，校验摘要后按人物文档解压。改动作需要原 `.blend`，但离线构建和运行仅使用包内 GLB / JSON。

恢复工程来源已验证：用户提供的 `Baseline-Club-Local-Handoff.zip` 60 个文件摘要全部匹配，原工程离线重建 HTML 与用户提供的恢复版完全一致。此目录是在恢复源码上继续开发的独立目录；未覆盖旁边 `baseline-motion/` 的本地修改。

原角色、动作与环境素材各自许可见 `licenses/` 和游戏内「关于」。本包不包含 EA / FIFA 的人物、动作或商标资产。
