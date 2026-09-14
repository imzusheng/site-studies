#!/usr/bin/env python3
"""把渲染出的多视图拼成 contact sheet。

用系统 python3 + Pillow 运行，不需要 Blender：
    python3 tools/make_contact.py

产出：
  preview/deformation_contact_q34.png    12 个姿势的 3/4 视图
  preview/deformation_contact_front.png  12 个姿势的正面
  preview/turnaround_contact.png         A-Pose 四视图（若已渲染）
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PREV = ROOT / "preview"
DEF = PREV / "deformation"

TILE_W = 300
BG = (24, 26, 30)
FG = (232, 236, 242)
LABEL_H = 26


def font(size=16):
    for p in ("/System/Library/Fonts/Supplemental/Arial.ttf",
              "/System/Library/Fonts/Helvetica.ttc",
              "/Library/Fonts/Arial.ttf"):
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_sheet(files, out_path, cols=4, title=None):
    """files: [(label, path)]，按行优先排列。"""
    if not files:
        print(f"  跳过 {out_path.name}：没有输入图")
        return None
    probe = Image.open(files[0][1])
    scale = TILE_W / probe.width
    tile_h = int(round(probe.height * scale))
    rows = (len(files) + cols - 1) // cols

    pad = 6
    top = 40 if title else 0
    sheet_w = cols * (TILE_W + pad) + pad
    sheet_h = top + rows * (tile_h + LABEL_H + pad) + pad
    sheet = Image.new("RGB", (sheet_w, sheet_h), BG)
    draw = ImageDraw.Draw(sheet)
    f = font(15)
    ftitle = font(20)

    if title:
        draw.text((pad + 4, 10), title, fill=FG, font=ftitle)

    for i, (label, p) in enumerate(files):
        r, c = divmod(i, cols)
        x = pad + c * (TILE_W + pad)
        y = top + pad + r * (tile_h + LABEL_H + pad)
        im = Image.open(p).convert("RGB").resize(
            (TILE_W, tile_h), Image.LANCZOS)
        sheet.paste(im, (x, y))
        draw.text((x + 4, y + tile_h + 4), label, fill=FG, font=f)

    sheet.save(out_path)
    print(f"  [contact] {out_path}  {sheet_w}×{sheet_h}  {len(files)} 格")
    return out_path


def main():
    # ---- 形变测试 ----
    for view, out_name, title in (
            ("q34", "deformation_contact_q34.png", "Ruth 形变测试 · 3/4 视图"),
            ("front", "deformation_contact_front.png", "Ruth 形变测试 · 正面"),
            ("side", "deformation_contact_side.png", "Ruth 形变测试 · 侧面")):
        files = []
        for p in sorted(DEF.glob(f"*_{view}.png")):
            label = p.name[: -len(f"_{view}.png")]
            files.append((label, p))
        make_sheet(files, PREV / out_name, cols=4, title=title)

    # ---- turnaround ----
    turn = []
    for v in ("front", "side", "back", "q34"):
        p = PREV / f"source_{v}.png"
        if p.exists():
            turn.append((v, p))
    if turn:
        make_sheet(turn, PREV / "turnaround_contact.png", cols=4,
                   title="Ruth · turnaround (A-Pose rest)")


if __name__ == "__main__":
    main()
