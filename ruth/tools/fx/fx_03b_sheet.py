#!/usr/bin/env python3
"""合成 forehand_contact_sheet_fixed.png：7 个时间标记 × front/side/back/q34。

用系统 python3 跑（Blender 自带 Python 没有 PIL）。
用法: python3 tools/fx/fx_03b_sheet.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PREVIEW = ROOT / "preview" / "forehand"
SRC = PREVIEW / "fixed"

MARKS = [("ready", 0), ("unit_turn", 110), ("backswing", 147),
         ("acceleration", 151), ("contact", 164), ("follow_through", 187),
         ("recovery", 232)]
VIEWS = ["front", "side", "back", "q34"]


def font(sz, bold=False):
    cands = ([("/System/Library/Fonts/Hiragino Sans GB.ttc", 1)] if bold else []) \
        + [("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
           ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 0)]
    for path, idx in cands:
        try:
            return ImageFont.truetype(path, sz, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


TW, TH = 300, 465
LW, HH, PAD = 176, 64, 8
W = LW + len(VIEWS) * (TW + PAD) + PAD
H = HH + len(MARKS) * (TH + PAD) + PAD
sheet = Image.new("RGB", (W, H), (24, 25, 28))
d = ImageDraw.Draw(sheet)
F, S = font(19, True), font(13)
for ci, v in enumerate(VIEWS):
    d.text((LW + ci * (TW + PAD) + 4, 16), v.upper(), font=F,
           fill=(232, 232, 236))
for ri, (mark, fr) in enumerate(MARKS):
    y = HH + ri * (TH + PAD)
    d.text((PAD, y + 8), mark, font=F, fill=(232, 232, 236))
    d.text((PAD, y + 32), f"frame {fr}", font=S, fill=(150, 152, 158))
    d.text((PAD, y + 50), f"t={fr/60:.3f}s", font=S, fill=(150, 152, 158))
    for ci, v in enumerate(VIEWS):
        p = SRC / f"fix_{mark}_{v}.png"
        x = LW + ci * (TW + PAD)
        if p.exists():
            sheet.paste(Image.open(p).convert("RGB").resize(
                (TW, TH), Image.LANCZOS), (x, y))
        else:
            d.rectangle([x, y, x + TW, y + TH], fill=(40, 40, 44))
        d.rectangle([x, y, x + TW - 1, y + TH - 1], outline=(70, 72, 78))
out = PREVIEW / "forehand_contact_sheet_fixed.png"
sheet.save(out)
print(f"[写出] {out.relative_to(ROOT)}  {sheet.size[0]}×{sheet.size[1]}")
print(json.dumps({"marks": [m for m, _ in MARKS], "views": VIEWS},
                 ensure_ascii=False))
