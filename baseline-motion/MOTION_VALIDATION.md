# Contact & Motion 验证报告

## 环境与方法

- 基线：用户 main `66139aa4be7b39cafdbe303875beeeb888d8ceb0`。
- TypeScript 5.8.3 strict，Three.js 0.180.0，默认完整离线 HTML。
- Chromium + ANGLE/SwiftShader + Xvfb，真实 WebGL、真实 SkinnedMesh 和生产 HumanRig。
- 环境禁止 file/HTTP 导航，使用 Playwright `page.set_content` 载入最终内嵌 HTML。没有替换渲染器或物理系统。
- 浏览器回归关闭 rAF 自动调度，按固定 1/120 秒推进生产代码；不是硬件性能测试或真人试玩。

## 已通过

| 检查 | 结果 |
|---|---|
| 严格编译和离线打包 | 通过，约 964 KiB |
| 核心数值检查 | 49 项通过 |
| 游戏逻辑检查 | 20 项通过，含全部训练目标与完整计分对局；此套不加载人物渲染 |
| 真实骨骼检查 | 正反手 8 个阶段定格 + 190 个连续动作采样 |
| 骨骼权重 | 208,638 个顶点权重和检查，0 个非法值 |
| 骨长 | 上臂 0.295m、前臂 0.265m，采样不发生缩放 |
| 握柄贴合 | 所选定格/连续动作的最大误差 2.10e-15m（浮点数精度）；真实球接触插值中双反可有约 1mm 误差，未声称所有时刻严格为零 |
| 固定握把朝向 | 手掌相对拍框坐标变化约 4.21e-08 rad（浮点数精度） |
| 玩家及 AI 实际发球 | 20/20 成功接触，双方各 10；未替换成假发球 |
| 真实人物陪练回合 | 最长 18 拍，玩家 9 次有效回球，使用自动跑位/蓄力输入 |
| 实际键盘事件 | WASD、Space 准备/松开、随挥中排队、Shift、Esc、V 及定格按钮通过 |
| 七种真实训练场景 | 每种均验证实际触球；没有声称在真人操作或真实渲染测试中完成所有挑战目标 |
| 浏览器异常/网络请求/context lost | 保存的回归用例中均为 0 |

原始数据：`tests/core-results.json`、`tests/game-results.json`、`tests/browser-evidence/*.json`。实际渲染图：`tests/browser-evidence/motion-contact-sheet.jpg`，两行分别是正手/双反，四列是准备/引拍/触球时刻姿态/随挥。它不是 AI 概念图，也不包含真实球击中的画面。

## 未验证或不能据此推断

- 未在用户 RTX 4060、Mac mini M4 或其他硬件上量帧率。
- 未完成长时间连续 rAF 渲染压力测试；主要证据为真实渲染的可复现固定步长测试。录制连续 GIF 在当前软件渲染环境触发工具超时，未把该录制算作通过。
- 任意姿态的全身/衣物自碰撞不具备形式化保证。修复共享表面与蒙皮后检查了上述运动范围，不等于彻底解决所有极端姿态。
- 没有专业动作捕捉、服装模拟或 AAA 人物资产；模型仍为程序化原创运动员。
- 自动 18 拍回合只证明系统能持续对打，不能证明操作已经符合每位玩家的习惯。
- 只校准默认人物；可选外部 GLB 不在本次验证范围。
- 未将此构建认定为完整商业 Release，也未覆盖所有浏览器、移动输入和完整正式网球规则。

## 复跑

```bash
npm ci
npm run build
npm test
xvfb-run -a python tests/browser-motion.py --case rig
xvfb-run -a python tests/browser-motion.py --case serves
xvfb-run -a python tests/browser-motion.py --case input
xvfb-run -a python tests/browser-motion.py --case drill1
```
