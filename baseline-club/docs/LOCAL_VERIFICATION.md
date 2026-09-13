# Local verification · 2026-09-13

本轮在 Windows、Node 24.21.0、原生 Edge 上验证。人物转换实际使用 Blender 5.2.1 LTS、NumPy 2.3.4、Pillow 12.3.0。浏览器截图来自游戏真实 WebGL 渲染；`*-native-wrist-clearance.png` 单独标为 Blender 诊断渲染。

## 来源与构建

用户提供的恢复 ZIP：14,478,382 bytes，SHA-256 `0558f02cde9d2d648446b7f92cbfb4f8b860f047c3f3f2cc9322d3be61a9297a`。

ZIP CRC、60 个文件摘要、原工程的离线重建全部通过。原 HTML 摘要 `1a9e26ef77a0da7cef9927681d0f163dc32dd4110bdce15349c530c6af8cfa2f` 与用户提供文件一致。这是恢复起点的验证，不是新版本的摘要。

新版本由 `tools/build.mjs` 从源码和本地 GLB / JSON / HDR / JPEG 构建，无网络依赖。最终 ZIP 的完整摘要清单位于包内 `PACKAGE-SHA256.json`；旁边 `.verification.json` 记录压缩包 CRC、全文件摘要和全新目录离线重建结果。直接运行 `tools/package.py` 会重新执行这些检查。

## 与本次目标对应的检查

- `tests/physics.mjs`：12/12。重力、同一积分器预测、出球状态、旋转、落地与死球处理。
- `tests/contact.mjs`：11/11。实际生产 contact / swing 函数；距离推荐站位 1.3 m 仍能回球，有限击球范围和早晚窗口，首次未接触后继续等待，辅助关闭、难度、视觉提示与输入缓冲。
- `node --check src/app.js`：通过。
- 浏览器普通玩家输入验证：默认辅助、发球机模式、种子 437731，模拟提前蓄力 0.4 s 后松拍，共 20 s。`demo=false`，物理出球路径命中 6 次，记有 2 次训练失误。记录见 `artifacts/player-input-20s.json`。这验证输入到击球的连通性，不是实际玩家难度调查。
- 浏览器默认 Rain 对 Rowan：20 s，玩家击球 5 次、对手 2 次，回放显示完整身体和手指姿态；截图 `artifacts/rain-replay-final.png`。示范走 AI 出球选择，所以不替代上面的普通输入验证。
- 最终 Snow 对 Rowan：20 s，双方各击球 4 次，最长 4 拍；进入回放、回放时比赛时钟暂停、退出后角色位置恢复均通过。记录 `artifacts/snow-replay-final.json`。
- 原生权重和完整骨骼在浏览器中正常读取；Rain 96 变形骨 + 18 兼容骨，Snow 69 + 18；拍柄附着原手骨。

## 视觉证据

动作室使用确定性时间点、同一视角复核，不以单张图片证明全动画无穿插。

| 浏览器截图 | 内容 |
| --- | --- |
| `artifacts/rain-serve-before-wrist.png` / `rain-serve-final.png` | 发球 56%，yaw 0.5，distance 5.4；拍头从颈前移到身体后方，手指与手腕共同转向 |
| `artifacts/rain-run-before-wrist.png` / `rain-run-final.png` | 跑步 38%，yaw 0.35，distance 4.9；准备握拍拍头离开眼鼻 |
| `artifacts/snow-forehand-native.png` | Snow 原蒙皮正手，肩肘和握拍近景 |
| `artifacts/snow-backhand-final.png` | Snow 反手 55%，yaw 0.8；最终腕方向及身体姿态 |
| `artifacts/rain-replay-final.png` | 游戏回放中的原生人物、球拍、球场、HDR 环境与植被 |

`node tools/build.mjs --qa` 生成被 Git 和交付 ZIP 忽略的 `qa.html`；参数与上表相同。QA fixture 驱动项目已有测试 API，并把报告显示在页面，正式 `index.html` 不含自动测试脚本。

## 真实限制

角色仍是 Blender Studio 的风格化 Rain / Snow，表情固定，尚非 FIFA / EA Sports FC 的扫描运动员、皮肤、布料、面部动画和动作融合质量。双手握拍配合、极端过渡和部分身体接触仍可改善；有限离线避让不能保证全帧零穿插。

宽容击球使用身体周边的可及范围，允许球拍与球存在视觉误差，以减少必须踩准站位的挫败感。未因此移动球或拉长手臂。

HTML 约 48 MB，优先离线可携带；首次加载比恢复版更大。此次没有进行手机、Safari、长时间热稳定性或硬件帧率基准验收，不能据此宣称移动端或固定 FPS 达标。

浏览器工具的 URL 安全策略禁止直接导航 `file://`。没有绕过该限制，因此“双击离线 HTML 打开”未做自动浏览器验收；实际浏览器测试使用 `http://127.0.0.1:5183/`，构建与全新目录重建不需要网络。

原始 BVH 的声明帧数差异仍完整保留在历史来源记录中；本次没有改写源记录，也未触碰 `baseline-motion/` 的已有工作。
