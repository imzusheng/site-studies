# animejs.com 分镜叙事复刻：Luma Remote A3.32 机械展台

一个基于 [animejs.com](https://animejs.com)（Anime.js v4 官网）**完整分镜叙事**的前端复刻练习。原站以一个圆形引擎贯穿全片六幕；本期以真实硬件 **Luma Remote A3.32**（120×81 mm Y-COMPACT 微控台、19.5 mm 键距、Ø26 EC11 旋钮、21 个独立零件）为载体，把圆形引擎重构为专属的「Cyber Command Deck HUD + ISO 128 工程图纸」双形态容器，逐幕还原其滚动叙事。

> 21 个零部件 STL、装配坐标与爆炸向量全部来自 luma-remote 项目的 A3.32 R2 冻结基线；文案概括性改写；字体使用开源 Inter / IBM Plex Mono 本地打包；Three.js 离线自包含，零外部依赖。

## 完整分镜脚本（原站六幕 → 本复刻落点）

| 幕 | 原站镜头 | 本复刻实现 |
|---|---|---|
| **① Hero** | 引擎合拢态示波器：外环彩色弧光 + 刻度盘 + 中心红色波形，标题逐词拆字入场 | Cyber Command Deck HUD：机甲四角角标、双轴毫米刻度、实时遥测栏（120×81 mm / 19.5 mm 键距 / 103.2 g / 0.00 mm³ 碰撞）；A3.32 合拢态悬浮，2.0" LCD 播放 CanvasTexture 动态界面（示波器 + 旋钮音量环 + 按键矩阵） |
| **② Toolbox 爆炸** | 相机拉远，引擎沿轴炸开为 CAD 线稿；每个零件发射引线连到两侧模块标签 | 背景退为米色图纸（`#dfd9cd`）、HUD 变 ISO 图框；21 件沿冻结 `explodeVectorMm` 爆炸并切换 EdgesGeometry 墨线线稿；8 个 3D→2D 正交引线实时投影到两侧零件标签；底部 EXPLODE PROGRESS 进度条 |
| **③ Features 系列** | 每个特性一幕：中央镜头实时演示 + 左文案（带 → 条目）+ 右代码卡 + 底部刻度擦洗条 | 5 幕特性，中央 3D 每幕独立编排：**Ergonomics** 侧低角看 8.3° 坡 + 姿态仪 LCD；**Keycaps** 三拍运镜（整机下沉移出 → 键帽扇形升起 → 推近单键慢自转，纸面主角 + 三条参数标注引线）；**Knob** EC11 四件绕轴旋转着旋出；**Display** 保持 45° 斜角、面罩掀开；**Compute Core** 旋转入场 → 正对 PCB 缓推，板上锚点标注 ANTENNA / ESP32-S3 / PSRAM |
| **④ Modular 拆装** | 线稿全爆炸 + 每个零件旁漂浮「体积标签」（彩点 + KB）+ 右下 Bundle size 面板：堆叠条 + 可点图例，点击实时拆装并重算总量 | 线稿 100% 全爆炸（1.9× 扩散放大）+ 相机后撤；五大子系统旁漂浮质量标签（彩点 + 克数，逐帧 3D→2D 投影 + 视口钳制）；右下 Mass budget 面板：总量 g、彩色堆叠条、可点图例（点击拆装 + 重算 + 划线态），与左侧子系统开关双向同步 |
| **⑤ Sponsors** | 资助进度环 + 赞助者头像流 | 简化为 Specs 资源区（3MF / 整装 STL / 固件仓库入口） |
| **⑥ Get Started / Footer** | 彩色圆点文档导航 + 订阅栏 | 彩点规格卡三联 + 页脚导航 |

## 动效引擎要点

| 系统 | 实现 |
|---|---|
| 平滑滚动 | rAF lerp 滚轮插值（`updateScrollAnimation` 每帧阻尼） |
| 双主题变形 | Toolbox / Modules 区触发 `body.theme-light`，材质整体切换（赛博微光 ⇄ CAD 墨线），CSS 背景同步过渡 |
| 爆炸驱动 | Toolbox 按滚动进度 0→100%；Modules 固定 100% 并叠加 1.9× `spread` 扩散系数 |
| 3D→2D 投影 | `vector.project(camera)` 逐帧投影，SVG 阶梯引线（Toolbox）与漂浮标签（Modules）共用管线 |
| 动态屏幕 | 480×640 `CanvasTexture` 每帧重绘：波形 / 音量弧 / 按键矩阵，`toneMapped:false` 保持发光感 |
| 模块拆装 | 图例与开关共用 `setGroupActive()`：部件显隐 + 质量重算 + 堆叠条联动 |

## 运行

```bash
cd site-studies/animejs
python -m http.server 8416
# 打开 http://localhost:8416/
```

## 结构

```
animejs/
├── index.html            # 六幕结构（HUD / Toolbox 线稿 / Features / Modular BOM / Specs / Footer）
├── css/style.css         # 赛博微光暗色 + ISO 图纸浅色双主题
├── js/main.js            # Three.js 场景 / LCD 纹理 / 滚动爆炸 / 投影标签引擎
├── stl/                  # A3.32 全部 21 个零件 STL + 打印就绪 3MF + 整装预览 STL
├── vendor/               # 离线 three.module.js / three.core.js / STLLoader.js
├── fonts/                # Inter、Inter Tight、IBM Plex Mono（woff2 本地打包）
└── ASSEMBLY_MANIFEST.json # A3.32 冻结基线：21 零件坐标、分组与 explodeVectorMm
```

数据来源：`luma-remote/hardware/mechanical/exports/assembly/profiles/industrial_a3_32_compact/`（commit `08795db`）。仅供学习交流，animejs.com 设计语言版权归 Julian Garnier 所有。

## 已知问题（v4 遗留，待下期打磨）

- Keycaps 特写的纸面主角材质与构图仍需调整（对焦件归属与扇形展开幅度）
- Compute Core 正视幕的 PCB 锚点标注为估算偏移，未逐一对准丝印
- 动态 LCD 屏幕纹理在斜角特写中对比度偏低，需提高 UI 元素亮度
- 特写分镜暗面零件细节密度仍不及纸面模式，可考虑双层描线
