# V31 Product Film Architecture Plan（Phase 0 交付物）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Luma Remote 展示页从「CAD 爆炸演示」重构为「工业产品电影」——建立产品电影 DSL（Motion Domain Model）+ 层级锚点系统 + 轨道相机 rig，9 幕收敛为 6 幕。

**Architecture:** 保留 v30 引擎底座（渲染/manifest 加载/三态材质/直接映射/投影层），新增 `js/film/` 纯函数模块层承载叙事：`scrollY → Film Timeline → Motion Tracks → SceneState → Three.js`。轨道在球坐标空间 `{target, azimuth, elevation, radius, fov}` 内插值，连续性由构造保证（前幕终值=后幕初值自动继承），仅在声明了 `cut` 的 motivated 转场处允许断裂。

**Tech Stack:** 原生 ES Modules + Three.js（vendored），Node 直跑校验（无 DOM 依赖的纯模块），零构建零依赖。

**Spec:** 本文档 Phase 0 即规格。上游输入：用户冻结的 Stable Goal Prompt（2026-09-04 会话）+ v30 代码现状 + A4 系列硬件 manifest 实测。

---

## Global Constraints（全部为冻结项，逐条来自用户 Goal Prompt）

- C0 连续：**always**。C1 连续：仅限连续运镜段内；**允许有动机的电影剪辑（declared cut）**。
- 锚点层级：`display_center` 为默认 Hero Anchor，**不是绝对相机 target**；特写幕可用 `keyboard_center / knob_axis / mainboard_center`，但必须**从全局锚入场、回全局锚出场**。
- 爆炸预算：爆炸只属于 BLUEPRINT；INPUT = 8mm 键帽抬升；COMPUTE = PCB 提出+翻面；全片不再出现第二场大规模散开。
- Blueprint ≤ 5 callout、标签描述系统、引线不穿主体、槽位冻结。
- 禁止新增：幕数、callout 数、粒子、交互面板、无关 UI。
- 优先级顺序（冲突时以此裁决）：镜头构图 > 运动连续性 > 锚点系统 > timeline 架构 > 视觉打磨 > 性能优化。
- 动画逻辑禁止绑定 mesh 文件名 / STL id / 零件名；只允许绑定语义系统与锚点。
- 校验代码必须直接 import timeline 模块，**禁止字符串解析源码**。

---

## 0. 现状资产裁决表（v30 → v31）

| v30 资产 | 位置 (main.js) | 裁决 | 理由 |
|---|---|---|---|
| 渲染管线/灯光/三态材质库 | L55-115 | **保留** | 冻结项 |
| STL 加载 + 中心枢轴 + 锚点 Object3D | L403-495 | **保留** | 已是 manifest 驱动 |
| 直接映射主循环骨架 | L548-699 | **保留骨架**，内部改为消费 SceneState | 纯函数链路正确 |
| SHOTS 表（9 幕 camFn/rotFn/scrub） | L138-351 | **删除**，由 `film/shots.js` 声明式替代 | 命令式魔数对齐是主要脆弱点 |
| 换镜滞回 / shotProgress / SCRUB_KEYS 机制 | L355-398 | **保留**（span 判定并入 film 模块） | 滚动→进度换算与叙事无关 |
| 焦点交棒 carry | L603-615 | **保留语义**，参数进 focus track | 已修好的资产 |
| 引线两遍路由 + callout 槽位冻结 | L724-777, L897-935 | **保留**，路由改「斜出+竖降」避主体 | Freeze 03 验收项 |
| deck-hud 装饰遥测 | index.html L49-81 | **删除**，改为单一 LCD 舞台框 | Freeze 02 |
| BOM 交互面板 | index.html L300-389 | **保留**，降级为 FINAL 幕叠加层 | 内容资产，非镜头 |
| `shot-chain-check.mjs`（字符串切片） | 根目录 | **重写**为 import film 模块 | 冻结项明确禁止 |
| Dev HUD | L27-33 | Phase 3 发布前移除 | 代码内已标注 |
| `pbrMaterialFor`/`subsystemOf` id 子串判断 | L406-413, L701-709 | **重写**为 manifest group 语义映射 | A4 兼容断裂点 |
| `screenCenterMm`（存在但从未使用） | manifest metrics | 不再依赖（A4 已删除该字段） | 见 §2 差异表 |

---

## 1. A3.32 ↔ A4.15 兼容性实测（v31 语义层的设计依据）

实测 `~/Desktop/luma-remote/hardware/mechanical/exports/assembly/profiles/`（A3.40 = a4 系列，最新 `industrial_a4_15_audit_hardening`）：

| 维度 | A3.32（现用） | A4.15（目标） | v31 对策 |
|---|---|---|---|
| 零件 schema 字段 | id/group/selectionGroupId/bboxMm/explodeVectorMm… | **完全相同** | loader 零改动 |
| 旋钮 id | `ec11_knob_26x8p5` | `ec11_knob_34x8p5`（Ø26→34） | 动画只允许引用 `knob_axis` 锚点，禁止引用 knob id |
| ESP32 组 id | `esp32-retention` | `esp32-stack`（6 成员） | 引用走语义系统名 `compute`，组映射查表化 |
| 新增零件 | — | 4× dupont keepout（不可打印） | 语义系统 `compute` 成员；特写幕自动随组显隐，BLUEPRINT 默认不单独标注 |
| 整机尺寸 | 120×81 | 142×82 | 相机 radius 全部由锚点+包围盒**派生**，不写绝对值常量 |
| `profile.metrics.screenCenterMm` | **有** [0,14] | **无** | `display_center` 一律从 `screen_bezel`/`waveshare` bbox 推导，不读 metrics |

结论：manifest part schema 双版本同构，**语义锚点从 selectionGroups+bboxMm 在运行时推导**即可双版本通吃，硬件仓库无需为 web 改导出格式。

---

## 2. Motion Domain Model（产品电影 DSL）

### 2.1 数据结构

```js
// js/film/types.js —— 全部纯数据 + 构造函数，Node 可 import

// 轨道：shot 内局部进度 p ∈ [0,1] 上的分段关键帧
// key(p) 线性或缓动插值；单属性单轨道，禁止一轨控多物
track([[p0, v0], [p1, v1, ease?], ...])

// 锚点引用：语义锚 + 局部偏移（mm，随模型姿态变换）
anchorRef('display_center', [0, 0, 6])

// 相机轨道：球坐标空间声明，插值只发生在这里
{
  target:  trackOfAnchor([[0, anchorRef('display_center')], [1, anchorRef('display_center')]]),
  azimuth:   track([[0, DEG(-25)], [1, DEG(35)]]),
  elevation: track([[0, 12], [1, 22]]),
  radius:    track([[0, 'fit:2.2'], [1, 150]]),   // 'fit:k' = k×包围盒半径派生，禁止裸常量跨机型
  fov:       track([[0, 34], [1, 34]]),
  cut: false,   // true = 声明的 motivated 剪辑（允许 C0 断裂，film-check 放行并要求标注理由）
}

// 幕：
{
  id: 'input',
  el: '[data-shot="input"]',
  anchor: { use: 'keyboard_center', enter: 0.15, exit: 0.85 },
  //   ^ target 轨道 [0,enter] 从 display_center 混入局部锚，[exit,1] 混回；film-check 强制校验
  camera: { ...上方球坐标轨道 },
  product: { yaw: track(...), pitch: track(...) },          // 整机姿态
  parts: [ { system: 'input', prop: 'liftZ', track: [[0,0],[0.45,8],[1,8]] } ],  // 系统级零件轨道
  material: { mode: 'ink', focus: { system: 'input', blend: track([[0,0],[0.15,1],[0.85,1],[1,0]]) } },
}
```

### 2.2 语义锚点（`js/film/anchors.js`）

从 manifest 运行时推导，输出世界坐标（含 root 居中偏移）：

```js
computeAnchors(manifest, partsMap) => {
  display_center:  screen_bezel bbox 中心 + LCD 面法向前移 3mm,   // 双版本通用，不读 metrics
  keyboard_center: keycaps 组成员 bbox 中心质心,
  knob_axis:       ec11-stack 组质心 + { axis: [0,0,1] },
  mainboard_center: waveshare* bbox 中心,   // 按组的 label/sourceKind 识别 vendor 板，不匹配 id 字面量
}
```

推导规则绑定 **selectionGroupId 的稳定语义**（keycaps / ec11-stack / enclosure 三组双版本同名），vendor 板用 `printable:false + label 含 LCD` 判定。A4 若再改组名，只需改 anchors.js 内一张 5 行映射表。

### 2.3 求值管线（`js/film/evaluate.js`，纯函数）

```js
evaluateFilm(film, scrollY, layout, partsTable) => SceneState
// SceneState = {
//   shot, shotProgress,
//   camera: { target:Vector3, azimuth, elevation, radius, fov },
//   product: { yaw, pitch, roll },
//   parts: Map<partId, { posOffset, rotZ, visible }>,   // 由 system 轨道展开到成员
//   material: { mode, focusMix: Map<partId, number> },
// }
```

main.js 变成纯消费者：SceneState → three transform → render；投影层读 SceneState。**THREE 数学允许，DOM/render 禁止入 film/ 模块**（这是 Node 直跑校验的前提）。

---

## 3. 文件结构

```
animejs/
├── js/
│   ├── main.js              # 收缩为：环境初始化 + 加载 + SceneState 消费 + 投影层（~500 行）
│   └── film/
│       ├── types.js         # track/anchorRef 构造与插值原语
│       ├── anchors.js       # 语义锚点推导
│       ├── shots.js         # 6 幕声明（纯数据，无逻辑）
│       ├── evaluate.js      # scrollY → SceneState
│       └── index.js         # 组装 ProductFilm（meta + anchors + shots）
├── film-check.mjs           # 校验：直接 import js/film/*，替代 shot-chain-check.mjs
├── ASSEMBLY_MANIFEST.json   # A3.32（现用）；A4.15 验证时整文件替换即可
└── index.html               # Phase 2 重组分区 + Phase 3 舞台框
```

---

## 4. 6 幕结构（9→6 映射）

| # | Shot | 锚点 | 来源（v30 幕） | 核心动作 | 材质 |
|---|---|---|---|---|---|
| 01 | HERO | display_center | hero | 45° 环绕缓推，LCD 亮（emissive 屏面），零爆炸 | PBR |
| 02 | BLUEPRINT | display_center | toolbox | pull back → PBR→CAD → 受控分离（仅 enclosure/display/knob/keycap 系统），≤5 callout | light |
| 03 | INPUT | keyboard_center（enter/return） | ergonomics+keycaps **合并** | 镜头推入键盘区 → 键帽抬 8mm → 轴体揭示（像开背板，不飞散） | ink |
| 04 | CONTROL+DISPLAY | knob_axis→display_center | knob+display **合并** | 旋钮转动 → LCD 响应，一次连续环绕经过两者 | ink |
| 05 | COMPUTE | mainboard_center | firmware | PCB 提出 → X 翻面 → 微距（v30 已实现的动作语义平移进 track） | ink |
| 06 | FINAL | display_center | modules+specs **合并** | 归位 → CAD→PBR → 拉远终镜；BOM 面板作为叠加层淡入 | light→PBR |

DOM 分区：`#features` 内 5 个 feature-item 重组为 3 个 data-shot 区块（input / control / compute），幕长度≈原两幕之和，滚动节奏不缩水。

---

## 5. 校验体系（`film-check.mjs`）

直接 `import js/film/*`，从 manifest 构造 partsTable，密集采样全片（每幕 ≥400 点），断言：

1. **C0**：相邻幕边界 camera/look 差 < 0.5mm，声明 cut 除外（要求 `cutReason` 字段）。
2. **速度方向**：连续段内边界两侧速度夹角 < 10°。
3. **速率比**：跨界 0.8–1.25（沿用 v30 检查器思路）。
4. **锚点纪律**：local-anchor 幕 p=0 与 p=1 的 target 必须等于 display_center。
5. **主角在画**：display_center 投影始终在视口内，投影尺寸波动有界（hero 段 ±15%）。
6. **方位角扫描**：越轴检查（沿用 v30）。
7. 回归门：Phase 1 以**等价 9 幕声明**跑本检查器，须复现 v30 全部连续性结论（见 Task 1.4）。

---

## 6. 分阶段执行

### Phase 1 — v31 branch + timeline/anchors 迁移（不改观感）

**Files:** Create `js/film/{types,anchors,shots,evaluate,index}.js`、`film-check.mjs`；Modify `js/main.js`（消费 SceneState）；Delete `shot-chain-check.mjs`。

- [ ] **Task 1.1 types.js + 单测**：`track()`/`anchorRef()`/`key(p)` 纯函数；Node 断言线性/缓动/越界钳制。Commit: `feat(film): track primitives`
- [ ] **Task 1.2 anchors.js + 单测**：用 A3.32 manifest 断言 4 锚点坐标（display_center ≈ [0,14±2,z]）；再跑 A4.15 manifest 断言不引用 knob id 也能得出 knob_axis。Commit: `feat(film): semantic anchors`
- [ ] **Task 1.3 evaluate.js**：SceneState 求值器 + 单轨道独立性断言（改 keycapLift 不影响 camera 输出）。Commit: `feat(film): evaluator`
- [ ] **Task 1.4 shots.js 等价 9 幕 + film-check.mjs**：把 v30 SHOTS 翻译成 track 声明（逐幕数值从现 camFn 提取），film-check 全绿 = 与 v30 行为等价。main.js 切换到 evaluateFilm，**浏览器观感与 v30 逐帧一致**。Commit: `refactor(film): v30 shots expressed as tracks`
- [ ] **Phase 1 验收**：film-check PASS；浏览器滚动全片无新跳变；`grep -n "ec11_knob_26x8p5\|waveshare_esp32_s3_lcd_2\|keycap_2" js/film/` 零命中。

### Phase 2 — 6 幕重排（本计划 §4 表）

按幕逐个迁移：HTML 分区重组 → shots.js 声明 → film-check 逐幕绿 → 浏览器验收。每幕一个 commit；HERO 幕含 emissive 屏幕平面（canvas texture，新资产）。exit：6 幕全绿 + 锚点纪律断言通过。

### Phase 3 — 视觉打磨

LCD 舞台框合并（删 deck-hud 遥测）、引线「斜出+竖降」避主体路由、callout 文案系统化、Dev HUD 移除、FOV/构图微调。禁改运动参数（那是 Phase 2 的领土）。

### Phase 4 — 性能

先测后优：Performance 面板录滚动全程，找 >16.7ms 帧的真实来源再动手（候选：EdgesGeometry 密度、每帧 applyMode 幂等循环、microLine 绘制调用）。目标 60fps 稳定、无长帧尖峰。

---

## 7. 验收标准映射（→ 检查器/流程）

| 验收项 | 由谁保证 |
|---|---|
| 3 秒读懂产品 | HERO 幕构图 + emissive LCD（Phase 2，人工验收） |
| 无瞬移/方向突变/速度尖峰 | film-check §5.1-5.3 |
| 锚点入场回场 | film-check §5.4 |
| 主角永不失联 | film-check §5.5 |
| A3.40 可替换 | Task 1.2 双 manifest 断言 + film/ 零 id 引用 grep 门 |
| 60fps | Phase 4 实测 |
