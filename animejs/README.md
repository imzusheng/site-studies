# animejs.com 风格复刻：Luma Remote A4.14 机械硬件展台

一个基于 [animejs.com](https://animejs.com)（Anime.js v4 官网）视觉叙事与机械解构美学的前端复刻练习，以真实的 **Luma Remote A4.14 智能桌面遥控器**（142×82mm 矮轴微控台）为三维载体，实现赛博微光控制台与 ISO 128 CAD 工业线稿的无缝变形展示。

> 针对 Luma Remote 的矩形硬件特征量身重构了视觉容器：以 **Cyber Command Deck HUD（赛博指挥台）** 与 **ISO CAD 工程图纸** 替代原站的圆环引擎，并将 2.0" 动态 IPS 示波器屏幕贴合在硬件核心。25 个零部件 STL、装配关系与爆炸向量全部源自硬件工程真值；原生 HTML/CSS/JS + Three.js 零依赖离线可用。

## 本地运行

```bash
cd site-studies/animejs
python -m http.server 8416
# 打开 http://localhost:8416/
```

## 已还原与创新的动效清单

| 动效 / 功能 | 实现技术与设计亮点 |
|---|---|
| **Cyber Command Deck HUD** | 专属 16:9 机甲切角外框、四角发光角标 `[ ]`、双轴毫米刻度尺、实时遥测数据条（尺寸、重量、公差、状态） |
| **ESP32-S3-LCD-2 动态微光屏** | 2.0" IPS 屏幕表面叠加动态 `CanvasTexture`（示波器波形、旋钮刻度环、按键状态指示灯实时渲染），与 3D 硬件无缝嵌合 |
| **Toolbox 轴向机械爆炸** | 滚动驱动 25 个独立零部件沿 `explodeVectorMm` 物理爆炸展开（0% → 100% 平滑插值与进度条联动） |
| **CAD 机械线稿着色器** | 进入 Toolbox 章节时背景平滑退为米色工程图纸（`#dfd9cd`），3D 模型实时切换为高精 CAD 墨线线稿（EdgesGeometry 提取轮廓） |
| **3D 到 2D 正交工程引线** | 实时将三维零件的世界坐标投影至视口空间，动态绘制 SVG 阶梯引线连接到两侧技术参数标签 |
| **Features 交互展厅** | 展示人体工学倾角（8.3°）、3.2mm 薄键帽、EC11 旋钮及 LVGL 驱动，两侧双栏留白保证中心 3D 遥控器清晰可见 |
| **Modular BOM 交互选配台** | 动态勾选/取消 6 大子系统（外壳、键帽、键轴、ESP32 核心、EC11 旋钮、排线避位），3D 实时装配/拆卸并动态刷新重量与零件清单 |
| **双向平滑阻尼插值** | 鼠标悬停视差微动 + 高帧率 rAF 滚动阻尼，丝滑镜头推进 |

## 目录结构

```
site-studies/animejs/
├── index.html            # 页面结构（Hero/Toolbox线稿/特性展厅/模块BOM/规格下载）
├── css/style.css         # 赛博深色微光 + CAD 图纸浅色样式
├── js/main.js            # Three.js 3D 场景、动态屏幕纹理、滚动爆炸与引线投影引擎
├── stl/                  # A4.14 全部 25 个独立零部件 STL 模型与 3MF 打印包
├── vendor/               # 离线 Three.js 与 STLLoader
├── fonts/                # 开源 Inter 与 IBM Plex Mono 等宽字体
└── ASSEMBLY_MANIFEST.json # 25 个部件的世界坐标包围盒与 explodeVectorMm
```
