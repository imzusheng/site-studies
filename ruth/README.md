# 露丝 Ruth · Production Character V1

网球游戏用女性角色，从 AI 生成的 GLB 加工到可直接进引擎的绑定资产。
**本轮不接入 Three.js，不制作比赛动画**——只把"人物资产本身"做对。

结论：**PASS**（Source Gate 全部硬条件通过；两项固有属性记录在
[`reports/01_source_audit.json`](reports/01_source_audit.json) 的
`known_limitations`）

## 交付物

| 文件 | 说明 |
|---|---|
| `reference/Ruth_High_Source.glb` | 冻结的源资产（只读，SHA256 `7dcee8bae871de2a…`） |
| `build/ruth_production.blend` | 可编辑 Blender 工程（含骨骼、权重、2K 打包贴图） |
| `build/ruth_production.glb` | 最终 GLB，29.5 MB，含 skin |
| `textures/` | BaseColor / Normal / Roughness / MetalRough / AO，均 2K |
| `preview/` | turnaround、形变测试 48 张、contact sheet、关键部位特写 |
| `reports/` | 体检、加工、验证共 9 份 JSON + 2 份 Markdown |
| `tools/` | 全部可复跑的 Blender Python 脚本 |

## 资产摘要

| 指标 | 源 | 成品 |
|---|---|---|
| 三角形 | 50000 | 50000 |
| 顶点 | 31959 | 31959 |
| 网格数 | 1 | 1 |
| 材质 | 1 | 1 |
| 贴图 | 3 × 4096 | 3 × 2048 + Roughness 抽离 + AO 烘焙 |
| 骨骼 | 无 | 68 |
| 身高 | 1.1850 m | 1.65 m |

- **骨架**：68 骨，Mixamo 命名（Hips/Spine/Spine1/Spine2/Neck/Head、
  四肢、每手 15 段手指、马尾 4 段、裙 12 段），关节位置全部由实测几何反推
- **权重**：0 未加权顶点，权重和误差 0，单顶点最多 4 影响
- **形变**：12 个网球姿势，rest 0 条拉伸边，最差 1.24% 的边拉伸超 2×
- **材质修正**：`specularColorFactor` [2,2,2] → (1,1,1)（超出 glTF 合法范围 [0,1]，
  是"油腻/塑料感"的直接来源）；`blend_method` HASHED → OPAQUE；
  金属度贴图 B 通道均值 0.107 → 0（非金属件不该带金属度）

## 与 `coach/` 的关系

`coach/` 是上一版（自然下垂 rest pose 的源）的加工产物，结论是
**"绑定正确但 A-Pose 重建在几何上不可行"**，建议重新生成模型。
`ruth/` 是本轮基于重新生成的 A-Pose 源重新走的完整流程，两套互不覆盖。

上一版失败的直接原因（手到裙侧仅 22 mm，手臂贴在大腿上）在本版已消除：
同样位置的实测间隙是 **97 mm**。

## 复跑整条流水线

在 Blender MCP 会话里依次执行（**必须连跑，中途不能 `open_mainfile`**——
那会让 `bpy.context` 失去 `active_object`，glTF 导出器会直接崩）：

```python
import os, runpy
os.environ["RUTH_NO_OPEN"] = "1"
T = "ruth/tools/"
for f in ("07_rig.py", "08_weights.py", "10_export.py"):
    runpy.run_path(T + f, run_name="__main__")
```

体检阶段（各自独立，可单跑）：

```python
runpy.run_path("ruth/tools/00_glb_probe.py")          # 纯 python，不进 Blender
runpy.run_path("ruth/tools/01_import_gate.py")        # Source Gate 测量
runpy.run_path("ruth/tools/04_structure.py")          # 内层探测 + 折痕分割
runpy.run_path("ruth/tools/05_normalize_topology.py") # 归一 + 拓扑质量
runpy.run_path("ruth/tools/06_textures.py")           # 贴图 2K 化 + 导出
runpy.run_path("ruth/tools/09_deform_test.py")        # 12 姿势形变测试
```

## 这个资产的技术事实

**整个角色是一张连续的封闭曲面。** 焊接 1e-6 后是 0 非流形边 / 0 边界边 /
1 连通分量——衣服与皮肤在拓扑上没有分界。折痕扫描 10°–80° 七档都无法切出
语义部件；Polo 区域 80% 的采样点下方没有内层曲面。所以**没有做几何切割**
（切开会在躯干上留破洞），改用几何分区 + 顶点组 + 面级材质表达语义结构。
详见 `reports/04_structure.json`。

**BaseColor 含方向性烘焙光照。** 几何镜像中位差 1.9 mm，
但贴图左右平均亮度差 11.4%。本轮记录不重建（去光照需要可靠反照率先验，
强行对称平均会抹掉真实的不对称细节）。重新生成时不要让生成器把光照烘进
BaseColor。

**上臂外展实测 29.01°**，低于建议的 35–50°，
但臂-身最小空隙 25.9 mm、裙摆处 97 mm（上一版此处仅 22 mm，是绑不上的
直接原因）。采用源姿态作为 rest pose，不做算法掰姿势——上一版的失败正是
栽在这里。

## 已知限制

- 手指为风格化简化（四指在指根并拢），手指骨可驱动手部末端但不能做逐指
  精细动作
- 裙子由独立裙骨驱动，大抬腿时大腿可能从裙摆下缘露出（不穿模、无尖刺）
- AO 由几何烘焙（射线距离 0.25 m，2K/64 采样），UV 岛外为空白，
  在引擎里接 occlusion 通道使用
