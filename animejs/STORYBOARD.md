# Luma Remote A3.43 分镜工作稿

本轮采用 **渲染短片 → 阅读留白 → 局部实时演示** 的产品页结构，先打磨前三章。24 章继续保留，后续逐章评审；不能称为全片视觉验收通过。

## 首段策略

| 章节 | 页面与内容 | 交接方式 |
|---|---|---|
| 01 `teaser` / 110vh | 真实 A3.43 Blender 渲染短片，1920×1080、30 fps、5 秒。100mm 镜头从偏轴的屏幕特写缓慢后退并回到正面；固定大面积柔光，哑光打印表面。左上标题、右上简述。 | 默认静音播放一次并保留末帧；离开视区暂停，可手动暂停或重播。整个章节随正常滚动离开，不将离线渲染溶接到实时模型。 |
| 02 `surface` / 145vh | 暖白阅读段：“少一点寻找。多一点直觉。”解释按键、旋钮和屏幕的分工；三个平行特征无卡片边框。底部引出“从一整块控制面，走进每一个细节。” | 阅读段完全不透明，并处于固定 3D 和固定文案之上，给底层准备新机位的空间。该段不展示模型。 |
| 03 `unfold` | 暖白纸面与黑色线稿，从完整控制面进入内部层次，开始局部实时结构演示。 | 阅读段滚出后再揭示实时舞台。无需让模型延续首屏摄影构图；重点是演示自身的主体尺度、可读性和展开动作。 |

前两章保留 `data-beat`，不使用固定 `.beat-panel`。高度由章节 duration 按每 1000 单位对应 100vh 设置；1100/1450 合计 2550 单位之后进入局部演示。它们是滚动距离单位，不是视频秒数。

## 实施规则

- 视频位于 `#teaser` 内，使用普通章节自身的坐标和层级。海报取实际第一帧，减少动态效果偏好时停在海报并允许手动播放。前两章 `z-index:8`、独立 stacking context、背景完全不透明；固定导航保持其上。
- 这轮不再以整站不间断飞行为目标。完整阅读段可以遮住不同演示之间的机位切换；后续哪些章节需要阅读段，逐章决定。
- 实时局部镜头保留固定世界坐标的柔和环境光，不让灯光随焦点移动，关闭 shadow map。白底线稿用于结构说明；正文主题与局部演示保持一致。
- 现有 `camera-route.js` 绕场路线属于后续实时实现，可继续调整；参数、构建通过和单张截图不代表局部演示或章节交接已视觉通过。
- 引导线从实际投影点向右水平延伸，最长80px；重叠时隐藏次要标注。二维信号图是功能关系示意，不冒充实体飞线。

## 保留的 24 章

以下为当前 `film.js` 索引。前三章是本轮验收对象；04–24 继续保留，待逐章看图、看滚动过渡后调整。

| # / ID | 主题 | 视觉状态 | 焦点角色 | 时长单位 |
|---|---|---|---|---:|
| 01 `teaser` | 把控制留在手边 | 渲染短片 | 普通文档流 | 1100 |
| 02 `surface` | 少一点寻找，多一点直觉 | 暖白阅读 | 普通文档流 | 1450 |
| 03 `unfold` | 进入内部 | paper | `mainboard` | 2800 |
| 04 `constellation` | 悬浮结构 | dark | `mainboard` | 2200 |
| 05 `core` | 计算核心 | dark | `mainboard` | 3000 |
| 06 `signal` | 本地联动 | dark | `mainboard` | 2400 |
| 07 `recovery` | 更新与恢复 | dark | `mainboard` | 2400 |
| 08 `display` | 屏幕反馈 | dark | `activeGlass` | 2600 |
| 09 `optics` | 显示层次 | paper | `optical` | 2300 |
| 10 `controls` | 六枚快捷按键 | dark | `keycapFocus` | 2600 |
| 11 `mechanism` | 键轴结构 | paper | `switchStems` | 2400 |
| 12 `fit` | 键帽配合 | paper | `keycapFocus` | 2300 |
| 13 `dial` | 旋钮操作 | dark | `knob` | 2700 |
| 14 `encoder` | 编码器安装 | paper | `encoder` | 2300 |
| 15 `structure` | 内部结构设计 | paper | `upperShell` | 2800 |
| 16 `shoulder` | 键轴承托 | paper | `upperShell` | 2400 |
| 17 `material` | 克制用料 | paper | `upperShell` | 2400 |
| 18 `stability` | 稳定的安装 | dark | `retainer` | 2700 |
| 19 `closure` | 三点闭合 | paper | `serviceCover` | 2500 |
| 20 `service` | 可拆解维护 | dark | `serviceCover` | 2400 |
| 21 `craft` | 可打印设计 | paper | `upperShell` | 2700 |
| 22 `customize` | 自由制作 | paper | `keycapFocus` | 2300 |
| 23 `reassemble` | 回到整体 | dark | `upperShell` | 3400 |
| 24 `final` | 由你定义 | product | `upperShell` | 2700 |

## 验收与事实边界

2026-09-05 片头交付记录：Cycles 已完成 150 张连续源帧；H.264 成片为 1920×1080、30 fps、5 秒、1,052,274 bytes。全片解码与黑帧检测未报告异常。在本机内置浏览器实播取得 150 个视频帧、0 个丢帧，验证了自动播放至末帧、重播、手动暂停，以及滚入阅读段后暂停。浏览器未报告错误或警告。`npm run validate` 与 `npm run build` 通过；构建仍有主 JS 包大于 500 kB 的体积提示。以上不代表所有设备或后续 21 章已完成视觉验收。

本轮必须在真实浏览器中看：摄影首屏正常离场、暖白阅读段完整遮挡底层场景、阅读之后的局部实时演示入场，以及前三章向前/反向滚动和快速停留。确认没有摄影与模型重影、阅读段底层透出、文字叠层或入场穿插。参数检查、构建通过和静态截图均不等于这段动态体验已通过；04–24 不在本轮完成声明中。

A3.43 为正式模型基线，471 个展示对象与 11 个打印部件是不同口径。厂商 STEP 可作为板卡整体展示，未建立语义映射的 solid 不指认为某颗 CPU/Flash/IMU。Choc、EC11 和电池内部重建的精细度不等于首件装配、力学寿命或电气安全验收；打印配合、OTA 与本地连接文案保持机械/固件文档已有证据边界，不添加实物通过或稳定性百分比。

实现入口：`js/hero-video.js`（片头播放）、`js/film.js`（章节与展开/纸面进度）、`js/film-engine.js`（局部实时镜头与材质）、`js/camera-route.js`（后续绕场）、`js/model-scene.js`（固定布光）、`js/film-ui.js`（章节进度与文案）。

片头工程由 `scripts/build-intro-video.py` 经 Blender MCP 建立并独立导出至 `renders/intro/luma-intro.blend`，不覆盖源工程。`scripts/render-intro-video.py` 使用 Metal / Cycles 渲染 150 张 PNG，随后编码为 `public/videos/luma-a343-intro.mp4`（H.264 / yuv420p / faststart）。海报为 `public/images/luma-a343-video-poster.webp`。中间帧与工作工程位于 git 忽略目录 `renders/`，脚本和网页播放资源保留在项目内。

硬件与产品事实来源：`/Users/lizusheng/Desktop/luma-remote/docs/hardware-baseline.md`、`docs/interaction-model.md`、`docs/architecture.md`、`hardware/mechanical/README.md`。本文是导演与实现工作稿，不代替源仓库的机械、实物或发布验收记录。
