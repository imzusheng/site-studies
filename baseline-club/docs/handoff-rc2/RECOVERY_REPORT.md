# 本轮恢复报告 / 2026-09-13

## 成功恢复，不是新游戏版本

从会话中仍可读取的 `baseline-club/index.html` 恢复源码、CSS、模板、Three.js 引擎、Rain/Snow GLB 和六个烘焙片段。没有使用远端损坏的 `source/baseline-club-src.tar.gz`；没有修改运行游戏的代码、画面或玩法。

HTML 字节数：**9,146,390**。

原始与重建 SHA-256 均为：

```text
1a9e26ef77a0da7cef9927681d0f163dc32dd4110bdce15349c530c6af8cfa2f
```

六份原始 BVH、Rain/Snow 转换脚本和先前转换报告来自本地 `baseline-character-candidates.zip`。该素材 ZIP 通过 CRC 及读取检查。作为基础工具/许可证来源的旧 `court-study-cypress-source.zip` 也通过 CRC；仅复用工具与真实声明，未借用其旧游戏测试结果。

恢复后 rain.glb / snow.glb 的 Git blob SHA 分别为 `b9c0f47c4ea191b5aad061f93ea998f9178029c6`、`f8014b7d7497286fdfd8f2877e4072e7c4612163`，与此前 PR 素材树中的对应对象一致。

## 本轮实际执行

- `node tools/build.mjs`：成功；输出与幸存 HTML 逐字节相同。
- `node tools/verify.mjs --baseline`：成功；包含脚本语法、GLB 头部/长度/缓冲区范围、片段数据和源码 BVH 读取检查。保留一项源数据警告，见下。
- `node tests/physics.mjs`：**12/12** 基本回归通过。包含固定重力、预测不改原球、同积分器预测一致、自动模式不使用任意 target、力度/时机/偏心影响发射、死球继续弹跳并睡眠、边界反弹。
- `tests/recovery-smoke.py`：**8/8** 通过。浏览器能加载恢复 HTML，8 秒确定性模拟能推进，双方人物存在，关于打开/关闭正常；0 HTTP/HTTPS 外部请求、0 未捕获异常、0 控制台 shader 错误。
- `run-bounded` 500ms 人工超时测试：按预期结束测试进程并返回 124。Windows 的 taskkill 分支未在本 Linux 容器执行，需本地复核。
- 最终 ZIP 的 CRC、全新目录解压后的清单、包内重建与原始 HTML 哈希由交付打包步骤复核。

运行环境：Node 22.16.0、Python 3.13、Playwright 1.57.0、Chromium 144.0.7559.96；Linux/Xvfb/SwiftShader。

浏览器测试总进程约 6.5 秒。这里的 8 秒是测试 API 推进的模拟时间，不是 8 秒真实时间、更不是 GPU 帧率成绩。由于测试环境文件 URL 限制，使用相同 HTML 注入空白页并关闭 requestAnimationFrame，由测试驱动时钟；用户本机直接文件打开与 localhost 服务仍需再验收。

## 一项保留警告

`assets-source/full/lvargas_Derecha_4seg.bvh`：声明 `Frames: 479`，实际 480 行运动数据，其余五份声明/行数一致。原始文件不改动。该警告影响未来源数据重新烘焙策略，不阻止已有烘焙片段的 HTML 构建与启动。

## 明确未验证

人物艺术质量、原始 Blender 角色转换、完整游戏行为回归、真实时间长跑、原生 Windows/macOS GPU 性能、Safari/Firefox、实体手机、内存/发热/续航均未由本轮基本检查证明。没有沿用旧 PR 的 19/19、41/41、48/48、8/8 等通过数字。

没有恢复出旧压缩包的全部原始构建脚本/测试/日志；本包包含的是**新编写的恢复构建、静态检查、基本回归与接手文档**。它们不冒充旧文件。原始 `.blend` 源包未内置，提供现存来源链接和下载方法。

本轮没有对 GitHub 进行写操作、没有创建/触发/修改 Actions。把本包作为本地可复现起点，不把旧 PR 文案作为当前完成证明。
