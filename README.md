# site-studies

逐站临摹有个性网站的「站点研究」合集：挑一个设计语言鲜明的站点，从零手写还原它的视觉语言与标志性动效——不看原站代码、不引用原站素材，全部原生 HTML/CSS/JS 自绘实现，把每一期当作一次前端动效练习。

> 仅供学习交流。各原站的名称与设计版权归原站所有；复刻中的文案为概括性改写，图形素材全部自绘，字体使用开源替代。

## Studies

| 站点 | 目录 | 风格与看点 |
|---|---|---|
| [dottxt.ai](https://dottxt.ai) | [dottxt/](dottxt/) | 复古终端 / 像素 brutalist：点云多形态重组（立方体⇄狗⇄猫⇄人像）、打字机终端、乱码定格、棋盘格噪声等 16 项动效，零依赖 → [详细说明](dottxt/README.md) |
| [subscrr.app](https://subscrr.app) | [subscrr/](subscrr/) | 暖纸底 + 品牌橘玻璃拟态：AI 粒子标题（点云⇄文字点击重组）、自写平滑滚动、磁性按钮、滚动缩放影片位、通知堆叠、Widgets 暖色 tint 等 20+ 项动效，零依赖 → [详细说明](subscrr/README.md) |

## 本地运行

每个 study 是独立静态目录，任选其一进入后起个静态服务即可：

```bash
cd dottxt
python -m http.server 8410
# 打开 http://localhost:8410/
```
