# BASELINE / Contact & Motion

以用户修复发球的 `66139aa` 为基础，修正人物蒙皮、握拍坐标、球拍尺度、正反手动作与输入衔接。此分支是可运行的动作修复版，不是 AAA 美术或完整商业 Release。

## 运行

```bash
npm ci
npm run build
npm start
```

也可以直接打开 `dist/index.html`。默认构建内嵌 Three.js、原创蒙皮运动员、场景与程序音效，无 CDN、GLB 或贴图网络请求。首次构建需要安装依赖；运行生成的 HTML 不需要网络。`build:local` 与默认构建一致。原缓存资源保留，但默认人物不再读取 Michelle。

WASD 移动，Space 提前准备/蓄力、松开挥拍或发球，Shift 短冲刺，Esc 暂停，V 动作检视。正反手自动选择。按住 Space 穿过上一拍随挥阶段会排队准备下一拍，不再吞掉输入。

动作检视提供准备、引拍、触球、随挥四个定格，以及慢放和观察角度。它不修改比赛判定；定格不代表实际击球事件。

## 本次重点

- 27 英寸球拍、独立手掌/握把坐标，双反第二握点，前臂分担旋转。
- 连续的身体/衣物外表面和渐变骨骼权重，取消互相穿插的身体与裙摆层。
- 髋部先转、转肩、肘部展开、身前侧触球、跨身体随挥；双反不再共用正手的触球深度。
- 手臂长度不缩放，不用手腕脱离握柄来伪造触球；真实球拍与碰撞体共用位置。
- 计划触球点固定在球场空间，跑动不会把本来可打的来球目标拖走。
- 保留用户修好的抛球高度、位置和补时逻辑，玩家/AI 发球回归。

## 验证

```bash
npm test
# 可选：真实浏览器，Python Playwright + Chromium + Xvfb
xvfb-run -a python tests/browser-motion.py --case rig
xvfb-run -a python tests/browser-motion.py --case serves
xvfb-run -a python tests/browser-motion.py --case input
# --case drill0 到 drill6
```

详见 [动作设计与根因](MOTION_FIX.md) 与 [验证报告](MOTION_VALIDATION.md)。本轮真实浏览器使用 Three.js 和真实 HumanRig，不使用渲染替身；为了重复输入，浏览器测试关闭自动帧调度并逐步推进生产固定步长。

## 仍然存在的边界

人物是原创程序化蒙皮角色，不是专业运动员扫描、动作捕捉或参考图同等级成品。衣服采用贴合外表面，不做布料模拟。只校准默认骨架；外部 GLB 不能假定兼容。没有证明任意极端动作都不会自相交，也未验收实机帧率、长期真人手感和商业发布质量。自动回合证明能够打起来，不等于已经好玩。

历史记录保留在 `docs/MOTION_BUILD_HISTORY.md`，其中“未取得外部依赖”的旧说明不适用于当前默认离线构建。
