#!/usr/bin/env python3
"""合成 validation/contact_sheet_compare.png：5 行关键帧 × 3 列格式。

列：A BLENDER（实际保存的 .blend, depsgraph 求值）
    B GLB（本仓库自己的 glTF 实现求值 + 自己的软光栅器，全程不经 Blender）
    C USDZ（本机不存在该文件；且按 brief「Blender 已 FAIL 则不再检查 USDZ」跳过）

用法: python3 xf_10_contact_sheet.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path("/Users/lizusheng/.zcode/workspace/default/site-studies")
RUTH = REPO / "ruth"
VAL = RUTH / "validation"
TMP = Path("/tmp")

MARKS = [("ready", 0), ("backswing", 147), ("contact", 164),
         ("follow_through", 187), ("recovery", 232)]

stage_a = json.loads((TMP / "xf_blender_stage_a.json").read_text())
glb_info = json.loads((TMP / "xf_glb_render_info.json").read_text())
audit = json.loads((RUTH / "reports" / "skin_matrix_audit.json").read_text())

TW, TH = 380, 633          # 每个 tile 的尺寸
LABEL_W = 232
HEAD_H = 92
PAD = 12
BG = (24, 25, 28)
FG = (232, 232, 236)
DIM = (150, 152, 158)
RED = (214, 78, 78)
GREEN = (86, 190, 120)
AMBER = (222, 168, 74)


def font(sz, bold=False):
    cands = []
    if bold:
        cands += [("/System/Library/Fonts/Hiragino Sans GB.ttc", 1),
                  ("/System/Library/Fonts/STHeiti Light.ttc", 0)]
    cands += [("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
              ("/System/Library/Fonts/STHeiti Light.ttc", 0),
              ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0)]
    for path, idx in cands:
        try:
            return ImageFont.truetype(path, sz, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


F_H = font(26, True)
F_L = font(21, True)
F_S = font(16)
F_T = font(19, True)

W = LABEL_W + 3 * (TW + PAD) + PAD
H = HEAD_H + len(MARKS) * (TH + PAD) + PAD + 96
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)

heads = [
    ("A. BLENDER", "ruth_forehand_v1.blend\n直接打开实际保存文件 · depsgraph 求值",
     RED, "FAIL"),
    ("B. GLB", "ruth_forehand_v1.glb\n本仓库独立 glTF 实现 + 独立软光栅",
     RED, "FAIL"),
    ("C. USDZ", "文件在本机不存在\n按 brief：Blender 已 FAIL，跳过 USDZ",
     AMBER, "N/A"),
]
for ci, (t, sub, col, badge) in enumerate(heads):
    x = LABEL_W + ci * (TW + PAD)
    d.text((x + 4, 12), t, font=F_H, fill=col)
    d.text((x + 4, 46), sub, font=F_S, fill=DIM)
    bw = d.textlength(badge, font=F_T)
    d.text((x + TW - bw - 6, 14), badge, font=F_T, fill=col)

for ri, (mark, fr) in enumerate(MARKS):
    y = HEAD_H + ri * (TH + PAD)
    a = stage_a["marks"][mark]
    g = audit["frames"][mark]
    # 行标签
    d.text((PAD, y + 6), f"{mark}", font=F_L, fill=FG)
    d.text((PAD, y + 34), f"frame {fr} @60fps", font=F_S, fill=DIM)
    d.text((PAD, y + 60), f"t = {fr/60:.3f} s", font=F_S, fill=DIM)
    d.text((PAD, y + 96), "撕裂边 >2×rest", font=F_S, fill=DIM)
    d.text((PAD, y + 116), f"BLENDER {a['edges_gt_2x']}", font=F_S, fill=RED)
    d.text((PAD, y + 136), f"GLB     {g['tear']['edges_gt_2x']}", font=F_S, fill=RED)
    d.text((PAD, y + 162), f"最大 {a['max_ratio']:.1f}×", font=F_S, fill=RED)
    d.text((PAD, y + 182), f">10× {a['edges_gt_10x']} 条边", font=F_S, fill=RED)
    d.text((PAD, y + 214), "两者逐顶点差", font=F_S, fill=DIM)
    d.text((PAD, y + 234),
           f"{g['independent_lbs_vs_blender']['max_mm']:.4f} mm",
           font=F_S, fill=GREEN)

    for ci, (col_dir, col) in enumerate([("blender", None), ("glb", None),
                                         ("usdz", None)]):
        x = LABEL_W + ci * (TW + PAD)
        p = VAL / col_dir / f"{mark}.png"
        if p.exists():
            im = Image.open(p).convert("RGB").resize((TW, TH), Image.LANCZOS)
            sheet.paste(im, (x, y))
            d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(70, 72, 78))
        else:
            d.rectangle([x, y, x + TW - 1, y + TH - 1], fill=(34, 34, 38),
                        outline=(70, 72, 78))
            lines = ["USDZ 未检查", "", "文件不在本机",
                     "ruth_forehand_v1.usdz", "全盘搜索无结果", "",
                     "brief: Blender 已出现", "大片撕裂 → 立即 FAIL，",
                     "不检查 USDZ", "", "破坏的第一现场是",
                     "Blender 内的姿态数据，", "与任何格式转换无关"]
            for li, t in enumerate(lines):
                c = AMBER if li == 0 else DIM
                if li in (10, 11, 12):
                    c = FG
                d.text((x + 22, y + 40 + li * 26), t, font=F_S, fill=c)

yb = HEAD_H + len(MARKS) * (TH + PAD) + PAD
d.rectangle([PAD, yb, W - PAD - 1, yb + 74], fill=(38, 26, 26),
            outline=RED)
d.text((PAD + 14, yb + 8), "VERDICT: BLENDER_FAIL   FIRST_BAD_STAGE = BLENDER",
       font=F_T, fill=RED)
d.text((PAD + 14, yb + 34),
       "两列数值逐帧一致（独立 LBS 与 Blender 最大差 0.084 mm）→ GLB 导出忠实，"
       "破坏发生在导出之前。", font=F_S, fill=FG)
d.text((PAD + 14, yb + 54),
       "根因：fh_refine.py 的 aim_matrix() 只约束骨骼 Y 轴方向，roll 由固定世界 "
       "pole 决定 → 裙/马尾/大腿被滚转 90–180°。", font=F_S, fill=FG)

out = VAL / "contact_sheet_compare.png"
sheet.save(out)
print(f"[写出] {out.relative_to(REPO)}  {sheet.size[0]}×{sheet.size[1]}")
