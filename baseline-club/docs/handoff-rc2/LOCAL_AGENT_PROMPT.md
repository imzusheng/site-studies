# 给本地 Agent 的完整接手指令

你接手的是 `site-studies` 中的 **Baseline Club Web 网球游戏**。先读取本包 `AGENTS.md`、`LOCAL_HANDOFF.md`、`docs/CURRENT_STATE.md`、`docs/RECOVERY_REPORT.md` 和 `docs/recovery-provenance.json`，不要基于旧 PR 的功能文案直接认定已完成。

本轮只完成 **工程恢复与差异审计**，然后给出人物质量专项的可执行任务清单；不要一次实现全部路线图，不替我扩大需求。

1. 找到本恢复包路径与原本地仓库路径。先记录 Git head、工作区修改和目录结构；不可覆盖未提交工作。不要下载/解压损坏的 `source/baseline-club-src.tar.gz`。
2. 在恢复包目录执行包校验、构建、`verify --baseline` 和物理回归。每条命令单独设置超时。恢复 HTML 必须与 `docs/recovery-provenance.json` 中的 SHA 一致；不匹配应停下来定位，不能改期望值绕过。
3. 在本机 Edge/Chrome 中打开。复用已有浏览器，不为了运行游戏重新下载模型/引擎。安装依赖只针对缺少的测试或资产处理工具；Blender 不是运行前置条件。
4. 记录主页、Rain/Snow 人物、三种对手、四种游戏模式、辅助设置、自动/手动瞄准、动作室和回放的实际状态。构建成功与主观人物质量通过不是同一件事。
5. 对比恢复目录和原仓库，只规划/执行 `baseline-club/` 范围的安全合入，源码平铺为 `src/`、`tools/`、`tests/`、`assets/`。保留旧项目和本地改动。不要以压缩包作为唯一源码。
6. 将发现的 `lvargas_Derecha_4seg.bvh` 479 声明帧/480 数据行加入素材审计。保留原文件；当前烘焙片段可运行，不能因此重做全库。
7. 人物下一阶段优先审查：原始 Rain/Snow 与导出 GLB 的形状/UV/材质对照；18 关节动作来源与更完整 deform rig 解耦；肩颈、腕、足底和衣物变形。不要再用椭球、低模占位或堆面数替代专业角色质量。
8. 所有有限任务都用显式超时；外层超时长于内层。下载至多重试一次，失败写明 URL/hash/路径/错误并继续无关工作。不陷入大型下载、浏览器整套长测反复重跑。
9. **禁止修改、创建、删除、触发、重跑或依赖任何 GitHub Actions / `.github/**`，也不擅自清理早期 workflow 变更。禁止 force push、reset --hard、clean -fd、全仓库 renormalize 和全局 Git 配置更改。此恢复阶段不自动 push。**
10. 结果要交付：本机验证日志、当前 HTML/hash、恢复合入差异列表、按人物优先的后续任务，以及未完成项。GitHub 上传失败时直接产出可解压源 ZIP；不要让 GitHub 阻塞本地可用结果。UI 的版权说明集中在 About，底层许可文件保持完整。

按阶段结束：工程恢复成功后先交付证据，再开始 `LOCAL_HANDOFF.md` 的人物 P0。不要把一次请求无限延长到完成所有后续版本。
