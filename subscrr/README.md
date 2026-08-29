# subscrr.app 复刻（学习用途）

一个对 [subscrr.app](https://subscrr.app)（Subscrr：iPhone / Apple Watch 订阅管理 App 的落地页）的前端复刻练习，重点是还原它的「暖纸底 + 品牌橘 + 玻璃拟态」视觉语言、滚动叙事节奏与全部标志性动效。

> 所有代码从零手写（原生 HTML/CSS/JS，零依赖——原站的 GSAP/Lenis 以约 200 行自写 rAF 引擎替代）；正文文案为概括性改写；图形素材（App 图标、QR、手机 mockup、各区块插画/影像）全部用 SVG/CSS 自绘重制，原站的摄影与视频素材未引用；字体使用开源替代并本地打包：
> - Inter（替代原站同名 Google Fonts 引用，SIL OFL）
> - Inter Tight（同上）
>
> 仅供学习交流，原站设计版权归 Subscrr 所有。

## 运行

```bash
cd subscrr
python -m http.server 8411
# 打开 http://localhost:8411/
```

交互提示：AI Spend 区块的橙色大标题可以**点击打散/汇聚**（粒子 ⇄ 文字）；Pricing 区块可切换 Monthly / Yearly；Promo 影片位右下角的声音按钮会播放一段 WebAudio 合成的轻环境音。

## 已还原的动效清单

| 动效 | 实现 |
|---|---|
| 预加载字标 | 图标 + 字母自底部弹簧式逐字弹出（stagger 50ms，对应原站 App 启动画），随后整层淡出 |
| 平滑滚动 | 自写 lerp 滚轮引擎（rAF，触屏 / 减少动态偏好自动降级为原生滚动） |
| 自定义光标 | 圆环 lerp 跟随 + 中心点，悬停目标放大为橘色圆盘 |
| 磁性按钮 | 所有 `.magnetic` 按钮/QR 卡向光标位移 32%，离开回弹 |
| 导航胶囊 | 液态玻璃（backdrop 折射层 + 边缘光学高光 + 斜向高光），下滚隐藏 / 上滚浮现，滚动后 tint 加深 |
| Hero 入场 | 标题行遮罩上升，lead/CTA/手机错峰淡入上浮 |
| Hero 手机屏 | 自绘订阅列表界面，列表无缝循环漂移模拟录屏 |
| 悬浮玻璃数据片 | 三块 glass 卡片浮动 + 铃铛摇摆动画 |
| Promo 影片位 | 滚动驱动 scale 1→1.2（自写 rAF 进度引擎）；自绘动画场景（旋转锥形渐变 + 漂浮订阅卡 + 大数字）；声音开关（WebAudio 双振荡器环境音） |
| 滚动 reveal | IntersectionObserver 统一驱动：上浮淡入 / 词组遮罩逐词上升 / 步骤胶囊错峰 blur-in |
| 视差 | `data-parallax` 媒体随视口位置反向位移（配 scale 1.14 防 穿帮） |
| 通知堆叠 | 三条 iOS 风推送按 0.15s 间隔依次 blur + 下落归位成阶梯堆叠 |
| AI 粒子标题 | 标题离屏栅格化取样为点云：散开漂浮 ⇄ 点击汇聚成字形（橙色粒子，rAF 弹性趋近），首入视口自动汇聚 |
| AI 手机屏 | 金额 0→340.00 $ 缓动计数 + 类别条依次展开，6s 循环 |
| Widgets 暖色 tint | 全屏 `#FFC7A0` 覆层透明度随区块进出视口的钟形曲线呼吸 |
| 月/年切换 | 滑块弹簧位移（实时测量按钮 offset），价格 swap 动画 + 周期/备注文案联动 |
| FAQ 手风琴 | `<details>` + JS 高度过渡，加号减号形变 |
| Threads 卡 | 悬停图片 scale 1.03；标题逐字自 blur 中浮起（入场播放、悬停重播，char stagger 30ms） |
| 徽章/页脚 CTA | 徽章悬停上浮旋转；页脚大字标内图标旋转 + 单词上浮 |
| 回到顶部 | 滚过 600px 浮现，点击平滑回顶 |
| 噪点颗粒 | 全屏 SVG feTurbulence 噪声层（multiply 0.35） |

## 结构

```
subscrr/
├── index.html      # 单页结构（预加载 / 导航 / 14 区块 / 页脚 / 光标层）
├── css/style.css   # 设计令牌 + 全部样式（含响应式）
├── js/main.js      # 动效引擎（平滑滚动 / 粒子标题 / 滚动叙事 / 手风琴…）
├── assets/         # 自绘 SVG（App 图标、装饰 QR）
└── fonts/          # Inter / Inter Tight 可变字体 woff2（离线可用）
```
