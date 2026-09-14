# AGENTS.md

## 语言

**优先用中文思考和回答。** 代码注释、提交信息、文档、报告都写中文；标识符和 API 名保持英文。给用户看的结论先给答案再给依据，不要用英文长段或中英夹杂的缩写堆砌。

## 项目是什么

`site-studies` 是「逐站临摹」合集：挑设计语言鲜明的网站，从零手写还原它的视觉语言与标志性动效。不看原站代码、不引用原站素材，全部原生 HTML/CSS/JS 自绘。

三期站点研究，都是零依赖静态站点：

| 目录 | 内容 |
|---|---|
| `dottxt/` | 复古终端 / 像素 brutalist，点云多形态重组等 16 项动效 |
| `subscrr/` | 暖纸底 + 品牌橘玻璃拟态，20+ 项动效 |
| `animejs/` | 赛博微光 + CAD 线稿，六幕分镜，用 Luma Remote A3.32 真实硬件（21 个 STL）；**需要 Vite**，见下 |

另有两个网球游戏原型（不是站点临摹，是产品实验）：

| 目录 | 内容 |
|---|---|
| `baseline-club/` | 本地网球原型：对战、训练、动作室、回放。单文件 `index.html` 内置全部资源，无 npm 运行依赖 |
| `baseline-motion/` | 动作系统重构版：Three.js 真实 `SkinnedMesh` + 蒙皮变形 + IK 命中 |

`docs/superpowers/plans/` 存放产品影片等专项计划。

## 常用命令

```bash
# 静态站点：起个静态服务即可
cd dottxt && python -m http.server 8410

# animejs 例外：v31 用了裸 animejs 导入，必须走 Vite，Python 静态服务会失败
cd animejs && npm run dev      # http://localhost:5173
cd animejs && npm run validate # 跑 ../film-check.mjs

# baseline-club
cd baseline-club && node tools/build.mjs      # 确定性打包单文件 HTML
cd baseline-club && node tools/serve.mjs      # http://127.0.0.1:5183
cd baseline-club && npm test                  # physics + contact 测试

# baseline-motion
cd baseline-motion && node build.cjs
cd baseline-motion && npm test
```

长任务建议包一层 `node tools/run-bounded.mjs <毫秒> <命令>`，避免挂死。

## 约定

- 各 study 目录自包含，互不引用；不要跨目录共享 CSS/JS。
- 站点的名称与设计版权归原站，复刻文案为概括性改写，图形素材自绘，字体用开源替代。
- `baseline-club/assets-source/` 记录原始素材来源与校验摘要；`.cache/` 里的原始 `.blend` 体积大，不入库。
- 不要提交 `node_modules/`、`dist/`、原站分析产物（见 `.gitignore`）。

## 三维资产

Blender 侧资产（角色、道具）的工作目录是 `coach/`：脚本在 `coach/tools/`，产物在 `coach/build/`，流水线说明见 `coach/README.md`。渲染任务优先丢到 win-pc 上跑，Mac 只做编排。
