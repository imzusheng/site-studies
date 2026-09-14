# validation/usdz/ —— 空目录说明

本目录**故意为空**。

`ruth_forehand_v1.usdz` 在本机不存在（全盘 find 除 Xcode 自带资源外无任何 .usdz），
且本轮 brief 规定：Blender 侧一旦出现大片三角撕裂即 FAIL，**不再检查 USDZ**。

实测结论：撕裂发生在 Blender 内的姿态数据（`fh_refine.py` 的 `aim_matrix()`
roll 缺陷），GLB 与 Blender 逐顶点一致到 0.084 mm——所以任何 USDZ 转换链都只会
原样搬运这份损坏，不存在"USDZ 转换引入破坏"的可能。

完整说明见 `ruth/reports/usdz_conversion_audit.md`。
