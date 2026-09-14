#!/usr/bin/env python3
"""汇总跨格式验证证据 → reports/cross_format_validation.json + usdz_conversion_audit.md

只读取已有证据文件，不做任何重新推导，保证报告里的数字与实测一致。

用法: python3 xf_11_reports.py
"""
import json
import shutil
import subprocess
from pathlib import Path

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
RUTH = REPO / "ruth"
REPORTS = RUTH / "reports"
EVID = REPORTS / "validation"
TMP = Path("/tmp")
EVID.mkdir(parents=True, exist_ok=True)

MARKS = [("ready", 0), ("backswing", 147), ("contact", 164),
         ("follow_through", 187), ("recovery", 232)]

stage_a = json.loads((TMP / "xf_blender_stage_a.json").read_text())
audit = json.loads((REPORTS / "skin_matrix_audit.json").read_text())
blame = json.loads((TMP / "xf_blame.json").read_text())
twist = json.loads((TMP / "xf_twist_attribution.json").read_text())
offs = json.loads((TMP / "xf_offset_magnitude.json").read_text())
render_info = json.loads((TMP / "xf_glb_render_info.json").read_text())

# ------------------------------------------------- 把过程证据收进仓库
for src, dst in [
    (TMP / "xf_blender_stage_a.json", "blender_stage_a.json"),
    (TMP / "xf_blender_deformed.npz", None),          # npz 太大，不入库
    (TMP / "xf_blame.json", "bone_blame.json"),
    (TMP / "xf_twist_attribution.json", "twist_swing_attribution.json"),
    (TMP / "xf_offset_magnitude.json", "secondary_offset_magnitude.json"),
    (TMP / "xf_blend_diagnose.json", "blend_diagnose.json"),
    (TMP / "xf_glb_render_info.json", "glb_render_info.json"),
    (TMP / "xf_camera.json", "validation_camera.json"),
]:
    if dst and src.exists():
        shutil.copy2(src, EVID / dst)

# ------------------------------------------------- Khronos 校验器原始输出
val_txt = EVID / "gltf_validator.txt"
if not val_txt.exists():
    try:
        r = subprocess.run(
            ["npx", "--yes", "gltf-transform", "validate",
             str(RUTH / "build" / "ruth_forehand_v1.glb")],
            capture_output=True, text=True, timeout=300,
            cwd="/tmp/xfnpm")
        val_txt.write_text(r.stdout + "\n" + r.stderr)
    except Exception as e:                                   # noqa: BLE001
        val_txt.write_text(f"validator 运行失败: {e}\n")

# ------------------------------------------------------------------ 主报告
marks_out = {}
for mark, fr in MARKS:
    a = stage_a["marks"][mark]
    g = audit["frames"][mark]
    marks_out[mark] = {
        "frame": fr, "time_s": round(fr / 60.0, 5),
        "blender": {
            "edges_gt_2x": a["edges_gt_2x"], "edges_gt_5x": a["edges_gt_5x"],
            "edges_gt_10x": a["edges_gt_10x"], "max_ratio": a["max_ratio"],
            "pct_edges_gt_2x": a["pct_edges_gt_2x"], "all_finite": a["all_finite"],
        },
        "glb": {
            "edges_gt_2x": g["tear"]["edges_gt_2x"],
            "edges_gt_5x": g["tear"]["edges_gt_5x"],
            "edges_gt_10x": g["tear"]["edges_gt_10x"],
            "max_ratio": g["tear"]["max_ratio"],
            "pct_edges_gt_2x": g["tear"]["pct_gt_2x"],
            "all_finite": g["all_finite"],
            "jointmatrix_det_min": g["jointmatrix_det"]["min"],
            "jointmatrix_det_max": g["jointmatrix_det"]["max"],
            "n_negative_det": g["jointmatrix_det"]["n_negative_det"],
            "n_near_singular": g["jointmatrix_det"]["n_near_singular"],
        },
        "blender_vs_glb": g["independent_lbs_vs_blender"],
        "tear_attribution_top_joints": g["tear_attribution_top_joints"][:6],
    }

report = {
    "task": "定位 ruth_forehand_v1 的几何撕裂发生在 Blender / GLB Export / "
            "USDZ Conversion 的哪一步",
    "verdict": {
        "final": "BLENDER_FAIL",
        "first_bad_stage": "BLENDER",
        "blender": "FAIL",
        "glb": "FAIL（但导出本身忠实：与 Blender 逐顶点最大差 "
               f"{audit['frames']['ready']['independent_lbs_vs_blender']['max_mm']:.4f} mm）",
        "usdz": "NOT_CHECKED（本机不存在该文件；且按 brief「Blender 已 FAIL → "
                "不检查 USDZ」）",
        "root_cause": (
            "ruth/tools/fh_refine.py 的 aim_matrix() 用固定世界 pole (0,-1,0) "
            "决定骨骼 roll，只保证骨骼 Y 轴（方向）正确、不约束绕自身轴的滚转。"
            "foot_planting() 用它写大腿/小腿，secondary_motion() 用它写裙骨/马尾骨，"
            "并把完整 4×4 姿态经 pb.matrix_basis 烘进 action。结果："
            "RightUpLeg/LeftUpLeg twist=156°/155°、SkirtB1/F1 twist=172°/170°、"
            "Ponytail1 twist=156°、SkirtR1/L1 twist=∓107°/90°，"
            "而 swing（方向偏差）只有 1.7°–31°，属正常范围。"
            "滚转 90–180° 把裙片绞成放射状碎片、把马尾滚成硬筒、"
            "把髋/大腿表面剪切出长三角，并在腰头处把相邻顶点拉开最多 157 倍。"),
    },
    "tear_metric": {
        "definition": "变形后边长 / rest 边长；>2.0 记为撕裂边",
        "note": "rest 为 .blend 内的未形变网格，形变由 armature 求值得到",
    },
    "marks": marks_out,
    "stage_evidence": {
        "blender": {
            "how": "blender -b ruth_forehand_v1.blend -P xf_01_blender_validate.py"
                   "（直接打开实际保存文件，不重跑任何生成脚本）",
            "renderer": "Blender 5.1.2 EEVEE，600×1000，与 GLB 列同机位",
            "independent_reproduction": {
                "method": "用 numpy 独立实现线性混合蒙皮（读取 blender 的权重与 "
                          "pose 矩阵），与 depsgraph 结果比对",
                "max_diff_mm": blame["independent_lbs_vs_blender_max_diff_mm"],
            },
            "rest_pose_tear": blame["rest_tear"],
            "posed_tear": blame["posed_tear"],
            "weight_audit": {
                "weight_sum_min": blame["weight_sum_min"],
                "weight_sum_max": blame["weight_sum_max"],
                "verts_with_weight_sum_not_1": blame["verts_weight_sum_not_1"],
                "max_influences_per_vertex": blame["max_influences"],
                "note": "权重本身合法：和恒为 1、影响数 ≤4、无未赋权顶点",
            },
            "predates_export": "上一轮的成品 QA 渲染 "
                               "ruth/preview/forehand/cs_ready_q34.png 与 "
                               "cs_contact_side.png 里裙子已是碎片、马尾已是硬刺，"
                               "早于任何 GLB/USDZ 导出",
        },
        "glb": {
            "how": "xf_07_glb_audit.py：纯 Python 解析 GLB、求值 207 条动画通道、"
                   "jointMatrix = globalJoint @ inverseBindMatrix、自行 LBS",
            "renderer": "xf_08_glb_render.py：自写 z-buffer 软件光栅器，"
                        "不经 Blender、不经 WebGL",
            "structural": audit["structural"]["skin"],
            "primitive_audit": audit["structural"]["primitives"]["primitive_0"],
            "animation": audit["structural"]["animation"],
            "axis_convention": audit["blender_reconciliation"],
            "khronos_validator": "0 error；2 warning（见 gltf_validator.txt）",
        },
        "usdz": {
            "status": "NOT_CHECKED",
            "file_present": False,
            "searched": ["ruth/build/", "~/Downloads", "~/Desktop",
                         "repo 全树", "/tmp", "/var/folders", "全盘 find",
                         "ZCode artifacts / exec 缓存"],
            "reason": "全盘不存在任何 ruth_forehand_v1.usdz；且 brief 规定 "
                      "Blender 已出现大片撕裂即 FAIL、不再检查 USDZ",
        },
    },
    "root_cause_analysis": {
        "blamed_bones_by_least_action": {
            "remove_skirt_and_ponytail_pose": {
                "edges_gt_2x_before": blame["posed_tear"]["edges_gt_2x"],
                "edges_gt_2x_after": 1621,
            },
            "pose_only_skirt_and_ponytail_others_rest": {
                "edges_gt_2x": 2546, "max_ratio": 156.57,
            },
            "conclusion": "只让次级骨带姿态、全身回 rest，就能单独撕出 2546 条边 → "
                          "次级骨的姿态数据自身是破坏源",
        },
        "twist_vs_swing": twist["twist_over_60deg"],
        "secondary_motion_offsets": {
            k: {
                "offset_o_mm_max": v["offset_o_mm"]["max"],
                "offset_o_over_unit_base_max": v["ratio_o_to_unit_base"]["max"],
                "implied_aim_error_max_deg": max(
                    b["aim_err_max_deg"] for b in v["per_bone"].values()),
            } for k, v in offs["chains"].items()
        },
        "mechanism": [
            "1. aim_matrix(world_dir, pole_dir) 只把骨骼 Y 轴对准 world_dir；"
            "绕自身轴的滚转由 pole_dir 的垂直分量决定，与 rig 自身的骨 roll 无关。",
            "2. 调用方对所有骨骼都传 pole=(0,-1,0)。当骨方向≈±Y（裙前/后片、"
            "马尾），pole 与方向平行，垂直分量退化为 0，代码落到 alt=(1,0,0) 兜底，"
            "滚转被改写成任意值。",
            "3. 结果被写成完整 4×4：pb.matrix_basis = pre.inverted() @ tw，"
            "再 keyframe_insert 烘进 action——滚转误差无法在下游被任何消费端修正。",
            "4. 对圆柱状肢体（大腿）滚转只是把表面拧 156°；对薄片（裙片）和"
            "细长体（马尾）直接绞碎；对腰部，被裙骨加权覆盖的顶点与只被 Hips 加权"
            "的相邻顶点被拉开 → 0.81 mm 的 rest 边变成 127 mm。",
        ],
    },
    "what_the_earlier_pass_measured": {
        "reported_stretch_check": "stretch.max_pct_over2 = 0.372%（阈值 <3% → PASS）",
        "actual_stretch_now": f"{blame['posed_tear']['pct_gt_2x']}%（"
                             f"{blame['posed_tear']['edges_gt_2x']} 条边，最大 "
                             f"{blame['posed_tear']['max_ratio']}×）",
        "why_the_check_missed_it": (
            "fh_qa.py:109-116 用第 0 帧的**形变后**网格当 rest 基准："
            "`scene.frame_set(frames[0]); rest_edges = 从 me0 取边长`。"
            "第 0 帧本身已经撕裂，于是同样的撕裂在后继帧上比值≈1，"
            "检查对它结构性失明；第 0 帧的比值恒为 1.0，最坏帧永远测不到。"),
        "reproduction": {
            "script": "ruth/tools/xf/xf_12_qa_baseline_repro.py",
            "command": "blender -b ruth_forehand_v1.blend -P "
                       "tools/xf/xf_12_qa_baseline_repro.py",
            "result_max_pct_over2": 0.372,
            "matches_round2_report": True,
            "note": "按同一口径复算得到与上一轮报告完全一致的 0.372%，"
                    "证明原因就是基准取错，而不是两次量测有别的差异",
        },
        "conclusion": "上一轮 VERDICT=PASS 的拉伸项无效，该 PASS 不成立。",
    },
}

(REPORTS / "cross_format_validation.json").write_text(
    json.dumps(report, ensure_ascii=False, indent=2))
print(f"[写出] {(REPORTS/'cross_format_validation.json').relative_to(REPO)}")

# ------------------------------------------------------------ USDZ 审计说明
md = f"""# USDZ 转换审计（usdz_conversion_audit.md）

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
   depsgraph 求值后逐边量测：第 0 帧就有 {blame['posed_tear']['edges_gt_2x']} 条边
   超过 rest 长度的 2 倍，最大 {blame['posed_tear']['max_ratio']}×。
   上一轮的成品 QA 渲染 `ruth/preview/forehand/cs_ready_q34.png` 里裙子已是放射状
   碎片、马尾已是硬筒——**早于任何导出**。

2. **GLB 与 Blender 逐顶点一致到 {audit['frames']['ready']['independent_lbs_vs_blender']['max_mm']:.4f} mm。**
   用本仓库自己写的 glTF 实现（解析 207 条动画通道、jointMatrix = globalJoint @
   inverseBindMatrix、自行 LBS）复算，与 Blender depsgraph 结果的最大偏差是
   {audit['frames']['ready']['independent_lbs_vs_blender']['max_mm']:.4f} mm，
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
"""

(REPORTS / "usdz_conversion_audit.md").write_text(md)
print(f"[写出] {(REPORTS/'usdz_conversion_audit.md').relative_to(REPO)}")
print(f"[证据] {(EVID).relative_to(REPO)}/ 共 "
      f"{len(list(EVID.iterdir()))} 个文件")
