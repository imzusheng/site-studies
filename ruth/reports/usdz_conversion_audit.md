# USDZ 转换审计（usdz_conversion_audit.md）

## 结论先行

**本机不存在 `ruth_forehand_v1.usdz`，本轮没有执行任何 GLB → USDZ 转换。**
并且按 brief 的规定（Blender 侧已出现大片三角撕裂即 FAIL、不再检查 USDZ），
USDZ 环节被判定为**与本次故障无关**，不需要检查。

## 1. 文件存在性核查

对以下位置做了递归查找，`*.usdz` 无任何用户产物的命中：

| 位置 | 结果 |
|---|---|
| `ruth/build/` | 只有 `ruth_forehand_v1.blend`(32.8 MB) 与 `ruth_forehand_v1.glb`(29.7 MB) |
| `~/Downloads`、`~/Desktop` | 无 |
| 仓库全树 | 无 |
| `/tmp`、`/var/folders` | 无 |
| ZCode `artifacts/`、`exec/` 缓存 | 无 |
| 全盘 `find / -iname "*.usdz"` | 仅命中 Xcode / Reality Composer Pro 自带资源 |

`~/.Trash` 为空，所以也不是被删除后留存。

因此：用户观察到的 Quick Look 撕裂，其对象文件无法在本机定位；本轮无法、也没有
对那份具体文件做逐格式比对。这一点如实记录，不用推测替代。

## 2. 本机可用的转换链（版本与可用性，实测）

| 工具 | 路径 | 版本 | 能否 GLB→USDZ |
|---|---|---|---|
| Apple USD Tools `usdcat` / `usdrecord` / `usdchecker` / `usdzip` | `/usr/bin` | Apple USD Tools 0.25.2 | 不能（只处理 USD，不读 glTF） |
| `usdzconvert` / `usdconvert`（apple/usd_from_gltf） | — | 未安装 | — |
| Blender | `/Applications/Blender.app` | 5.1.2 | 可以（`bpy.ops.wm.usd_export`，但属于 Blender USD 导出，不是独立转换器） |
| Reality Converter 图形版 | — | 未安装（Xcode 仅在 `/Volumes/PSSD` 上） | — |

**没有执行转换的原因**：一是 brief 明确要求 Blender 失败时跳过 USDZ；二是无论用
哪条链，输入都是同一个已经损坏的 GLB，转换器不可能把它修好。

## 3. 为什么"USDZ 转换"不可能是第一现场（逻辑 + 实测）

实测两条硬证据：

1. **Blender 里就已经是碎片。** 直接打开实际保存的 `ruth_forehand_v1.blend`，
   depsgraph 求值后逐边量测：第 0 帧就有 3242 条边
   超过 rest 长度的 2 倍，最大 156.78×。
   上一轮的成品 QA 渲染 `ruth/preview/forehand/cs_ready_q34.png` 里裙子已是放射状
   碎片、马尾已是硬筒——**早于任何导出**。

2. **GLB 与 Blender 逐顶点一致到 0.0843 mm。**
   用本仓库自己写的 glTF 实现（解析 207 条动画通道、jointMatrix = globalJoint @
   inverseBindMatrix、自行 LBS）复算，与 Blender depsgraph 结果的最大偏差是
   0.0843 mm，
   撕裂边计数逐帧完全相同（3242/3331/3367/3348/3158）。
   → GLB 只是把 Blender 的既有状态忠实搬运，导出环节无罪。

所以：**即使 USDZ 转换 100% 正确，Quick Look 里看到的也必然是同一片碎片。**

## 4. GLB 侧与转换相关、值得记录的两个 hazard（Khronos 官方校验器）

`npx gltf-transform validate` → **0 error，2 warning**（原始输出见
`reports/validation/gltf_validator.txt`）：

| code | 含义 | 本文件是否真的有害 |
|---|---|---|
| `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` | 材质需要切线空间，但 primitive 未提供 TANGENT，运行时需自行生成，跨实现不保证一致 | 不影响几何/蒙皮，仅影响法线贴图观感 |
| `NODE_SKINNED_MESH_NON_ROOT` | 带 skin 的 mesh 节点不是根节点，父级变换对蒙皮无效 | 实测无害：唯一根节点 `Ruth_Rig` 与 skinned mesh 节点 `Ruth` 的变换均为单位矩阵，不存在二次变换 |

第二条是 glTF→USD 转换里最常见的翻车点（UsdSkel 会保留 mesh 自身 xform，而 glTF
规定忽略它），但在本文件里父链是单位矩阵，所以这条 warning 在本资产上不构成风险。

## 5. 若之后要补做 USDZ，建议的最小复现步骤

（本轮未执行，仅作为后续清单）

1. 固定链：`Blender 5.1.2 → bpy.ops.wm.usd_export(format='usdz')`，
   或安装 apple/usd_from_gltf 的 `usdzconvert` 并记录版本；
2. 先修 `aim_matrix` 的 roll 缺陷并重烘 action，再导出——否则任何链都必然撕裂；
3. `mini_test.usdz`：只保留 Body + Armature + 10 帧动画，去掉球拍/次级骨/材质，
   用于区分是 skeleton 转换问题还是节点转换问题；
4. 用 `usdcat` 核对 joints 数量/顺序、`skel:joints` 与 `JOINTS_0` 的索引是否同步
   remap，用 `usdrecord -f <frame> --cam` 在 5 个时间码上出图。
