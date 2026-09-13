# 本地环境与启动

## 推荐单机路线

先用现有 Windows 11 + RTX 4060 + 32GB 的桌面环境完成开发、浏览器验证与 Blender 资产加工。Mac mini 作为之后的 Safari / Apple 平台验证机器，不先搭建两机分布式流水线。不需要 Unity、Docker、云构建、MCP 服务、LLM API 或付费素材账号才能运行本包。

先在新目录恢复，避免 Git Bash、WSL 与 Windows 之间反复复制二进制或混用绝对路径。Web 性能主验收放原生 Edge/Chrome，并确认图形加速实际启用。软件渲染可用于功能检查，不能当 RTX 4060/手机性能成绩。

## 必需与可选

| 层级 | 环境 | 说明 |
|---|---|---|
| 直接试玩 | 支持 WebGL2 的桌面 Edge/Chrome | 本包 index.html 完整，无需 npm/Blender |
| 改代码与构建 | Node.js 22 LTS 或 24 LTS、Git、编辑器 | 本轮恢复构建在 Node 22.16.0 执行；新装优先 Node 24 LTS，已有 22 无需阻塞升级 |
| 自动浏览器测试 | Python 3.11+、虚拟环境、Playwright | 本轮容器实测 Python 3.13 / Playwright 1.57.0 / Chromium 144.0.7559.96；Windows路径/原生GPU需本地再测 |
| 人物再加工 | Blender 单独安装，numpy/Pillow 在 Blender 自己的 Python 可导入 | 不属于游戏启动前置条件。官方 Rain v3 / Snow v4 页面以 Blender 4.1 为基线并标注支持后续版本；先审查当前脚本、选一套版本验证，再冻结 |
| 跨平台验收 | 实体 Android/iPhone、Safari/Firefox | 后阶段；视口模拟不能代替真机 |

截至查阅，Node 官网将 22/24 列为 LTS，20 已 EOL。不要把旧文档“Node 20+”当作新环境的首选。
来源：https://nodejs.org/en/about/previous-releases

## Windows PowerShell

```powershell
# 从下载位置执行，解压到新的目录。这里不会覆盖已有项目。
Expand-Archive -LiteralPath .\Baseline-Club-Local-Handoff.zip -DestinationPath C:\Dev\Baseline-Handoff
Set-Location C:\Dev\Baseline-Handoff\baseline-club

node --version
git --version
node tools/run-bounded.mjs 30000 node tools/check-package.mjs
node tools/run-bounded.mjs 30000 node tools/build.mjs
node tools/run-bounded.mjs 30000 node tools/verify.mjs --baseline
node tools/run-bounded.mjs 15000 node tests/physics.mjs
node tools/run-bounded.mjs 1800000 node tools/serve.mjs
```

浏览器打开 http://127.0.0.1:5173/ 。`PORT` 环境变量可改端口；不要因端口占用而反复起多个服务。直接开 `index.html` 也可用于试玩，本轮容器是注入同一 HTML 做 smoke，未直接导航 file URL 验收。

### 可选：自动浏览器测试

机器已装 Edge 时，测试脚本默认用 Edge channel，不需要先下载另一个 Chromium。已安装其他兼容 Playwright 版本可先尝试，复现此包测试环境可使用以下固定版本：

```powershell
py -3.11 -m venv .venv
node tools/run-bounded.mjs 120000 .\.venv\Scripts\python.exe -m pip install --timeout 20 --retries 1 playwright==1.57.0
node tools/run-bounded.mjs 60000 .\.venv\Scripts\python.exe tests/recovery-smoke.py
```

`py -3.11` 仅适用于已安装 3.11；有 3.12/3.13 可换对应解释器，不需要为了同一小测试再装一套。无需激活脚本，直接调用 `.venv\Scripts\python.exe`，避免 ExecutionPolicy 问题。

找不到 Edge/Chrome 时，先设置 `CHROMIUM_PATH` 指向已有浏览器可执行文件；安装 Playwright 浏览器是可选下载步骤，不是运行游戏前置条件。官方支持 channel=msedge/chrome，以及自带浏览器安装方式：https://playwright.dev/python/docs/browsers

Windows 不用 `xvfb-run`，不强制 SwiftShader 参数。`BASELINE_SOFTWARE=1` 专供本容器的Linux软件渲染验证；不要用它测原生硬件帧率。

## macOS

相同 Node 命令可直接执行。虚拟环境解释器是 `.venv/bin/python`；默认浏览器 smoke 使用已安装 Chrome。Python 依赖安装、可选浏览器下载也应加超时。不要把 Linux `/usr/bin/chromium`、Windows `.exe` 或 Git Bash `/c/Users` 路径复制到 macOS。

## Blender 资产环境独立管理

先运行现存 GLB。只有重做人物、服装、骨架或贴图时才需要源 `.blend`。

现有 `tools/convert-rain.py`、`convert-snow.py` 是从先前完整素材 ZIP 恢复的转换脚本。它们使用 Blender 的 `bpy`、`mathutils`、`numpy` 与 `PIL.Image`，**并非系统 Python 的独立脚本**。`pip install bpy` 不是这里的首选替代；在实际 Blender 解释器中检查依赖。

这些脚本假定工作目录下有 `asset-audit/rain/`、`asset-audit/snow/`，并在其中寻找 `.blend`。本轮没有重新运行它们，也没有重新下载约 68MB/112MB 的源包。重跑前先把输入/输出路径做成显式参数，确认 Blender 版本与插件/驱动器处理策略，测试一个角色。

第三方 .blend 中的自动脚本执行默认关闭。当前转换脚本显式使用 `use_scripts=False`；需要 production rig UI 或驱动器时，先审查来源和脚本再批准，不全局允许未知脚本。

官方来源：
- https://studio.blender.org/characters/rain/v3/
- https://studio.blender.org/characters/snow/v4/

## Git 与文件完整性

项目内 `.gitattributes` 已明确文本 LF 和 GLB/ZIP/GZ/图片等 binary。Git 官方说明：text/eol 影响行尾，`binary` 包含 `-text`；它只能防止后续文本转换，不能修复已坏 Git blob。
https://git-scm.com/docs/gitattributes

不要全局修改 `core.autocrlf`；不要仓库范围 `git add --renormalize .`。若合回现有仓库，先确认工作区修改，使用目录内属性和逐文件 diff。源码脚本的正常 CRLF/LF 差异与压缩包无法解压是不同问题。

不要对整个仓库 chmod/chown 或要求 Windows 管理员权限修复普通写文件错误。新目录应由当前用户拥有；被占用文件和不同工具用户身份问题应单独排查。
