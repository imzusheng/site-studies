# dottxt.ai 复刻（学习用途）

一个对 [dottxt.ai](https://dottxt.ai) 首页的前端复刻练习，重点是还原它的「复古终端 / 像素 brutalist」视觉语言与全部标志性动效。

> 所有代码从零手写（原生 HTML/CSS/JS，零依赖）；正文文案为概括性改写；图形素材（像素 logo、图标）全部用 SVG/Canvas 自绘；字体使用开源替代：
> - Silkscreen（替代 NeueBit 像素标题字，配合 `scaleX(.68)` 模拟窄字形）
> - IBM Plex Mono（替代 PP Neue Montreal Mono）
> - Instrument Sans（替代 PP Neue Montreal）
>
> 仅供学习交流，原站设计版权归 dottxt, Inc. 所有。

## 运行

```bash
cd dottxt
python -m http.server 8410
# 打开 http://localhost:8410/
```

调试参数：`http://localhost:8410/?still` 静态模式（暂停持续动画循环，便于截图/低性能设备）；`?still=cube|dog|cat|woman` 可额外定格 03 区块点云的指定形态。

## 已还原的动效清单

| 动效 | 实现 |
|---|---|
| Hero 大标题逐字入场 | 字符先闪 3 帧随机字形再定格（马赛克感） |
| 终端打字机 | 逐字符随机延时 + 方块光标 `steps()` 闪烁 |
| 自定义光标 | 黑色方块 `mix-blend-mode: difference` 反色跟随，悬停目标不同尺寸分级（标题 46px / 按钮 28px / 链接 16px） |
| 导航字母波浪 | hover 时字母逐个上弹（stagger 28ms） |
| Company 按钮 | hover 文字乱码扰动渐定（scramble） |
| 侧栏棋盘格动画 | Canvas 多模式循环：竖条纹/棋盘 ↔ 宽斜带对角线（4.5–9s 随机切换，斜线带渐变密度与噪声点），平时随机翻转格子 |
| Logo 跑马灯 | CSS 无缝双份滚动，hover 暂停 |
| 03 区块点云 | 3D 粒子群多形态重组：立方体 ⇄ 狗 ⇄ 猫 ⇄ 女性人像（像素画定义目标点），错峰飞散 + 漩涡脉冲过渡，待机呼吸漂浮 + 轻微视角摇摆，~20fps 步进 |
| 04 产品轮播 | scroll-pin（sticky + 高度 3×100vh）驱动横向切换；像素页码乱码定格；切换瞬间故障闪烁（invert/steps）；24 格刻度进度条 |
| 区块标题入场 | IntersectionObserver 触发「乱码字符逐帧锁定」（保留 `<br>` 结构） |
| 侧栏卡片堆叠 | 按滚动深度逐个淡入上浮 |
| Footer reveal | sticky bottom + z-index 分层：内容层滚动后黑色页脚露出 |
| 页脚雪花噪点 | Canvas 彩色像素噪声（橙/白/灰/黑），110ms 步进刷新 |
| 滚动进度条 | 右侧细黑条随内部滚动容器高度填充 |
| 锚点平滑滚动 | 拦截 `#` 链接，在滚动容器内 smooth 定位 |
| Company 下拉菜单 | 硬边框 + 硬阴影弹层，反色悬停 |

## 结构

```
dottxt-clone/
├── index.html      # 单页结构（导航 / 6 区块 / 页脚 / 侧栏 / 光标层）
├── css/style.css   # 设计令牌 + 全部样式（含响应式）
├── js/main.js      # 动效引擎（拆字、打字机、乱码、噪声、pin 轮播…）
└── fonts/          # 开源字体 woff2（离线可用）
```
