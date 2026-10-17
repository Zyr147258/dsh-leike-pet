#!/usr/bin/env python3
"""从桌面上的原始四帧立绘重建像素精灵，输出插件使用的透明底 PNG。

源图 C:\\Users\\23705\\Desktop\\file.png（1040x320）是同一张像素画按 ~7.25 倍
放大后的四格横向 sheet：
    frame0 = 正面    frame1 = 侧身朝左    frame2 = frame1 的镜像    frame3 = 背面

还原步骤：
  1. 抠掉纯色背景 #18141e；
  2. 按 7.25px 的放大格反采样回 25~27 x 32 的原始像素网格；
  3. 以「内容包围盒中心」对齐到共同画布，保证换姿势时头部不抖；

输出保持**原始像素尺寸（27x32）**：前端按整数倍用 CSS 放大，这样大小可调
（2x~7x）且任何倍率下都是像素锐利的正方形色块。

另外生成眨眼 / 睡觉帧：把眼睛那几格换成闭眼横线，供前端随机眨眼和休息使用。
"""

from __future__ import annotations

import os
from collections import deque
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent
ASSETS = PACKAGE / "assets"

SOURCE = Path(os.environ.get("PET_SHEET", r"C:\Users\23705\Desktop\file.png"))
BG = (24, 20, 30)          # 源图背景色
CELL = 260                 # 源图每格的宽度
SPRITE_SCALE = 7.25        # 源图相对原始像素的放大倍率
CANVAS_W = 27              # 最宽的一帧 = 27 原始像素
CANVAS_H = 32

BLUE = {(40, 68, 108), (80, 107, 165)}
SKIN = (235, 179, 133)     # 脸部基色
LID = (56, 32, 16)         # 闭眼线（深棕，比纯黑柔和）

FRAMES = {
    "front": 0,
    "left": 1,
    "right": 2,   # 直接取镜像帧，比 CSS 翻转更省事
    "back": 3,
}


def load_native(index: int) -> Image.Image:
    """把第 index 格反采样成原始像素尺寸的 RGBA 图。"""
    sheet = Image.open(SOURCE).convert("RGB")
    cell = sheet.crop((index * CELL, 0, (index + 1) * CELL, sheet.height))
    px = cell.load()

    xs, ys = [], []
    for y in range(cell.height):
        for x in range(cell.width):
            if px[x, y] != BG:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise RuntimeError(f"frame {index} is empty")

    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = x1 - x0 + 1, y1 - y0 + 1
    nx = int(round(w / SPRITE_SCALE))
    ny = int(round(h / SPRITE_SCALE))

    out = Image.new("RGBA", (nx, ny), (0, 0, 0, 0))
    opx = out.load()
    for j in range(ny):
        sy = int(y0 + (j + 0.5) * h / ny)
        for i in range(nx):
            sx = int(x0 + (i + 0.5) * w / nx)
            color = px[sx, sy]
            if color == BG:
                continue
            opx[i, j] = (*color, 255)
    return out


def compose(native: Image.Image) -> Image.Image:
    """按包围盒中心 + 底边对齐放进共同画布（保持原始像素尺寸）。"""
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    x = (CANVAS_W - native.width) // 2
    y = CANVAS_H - native.height
    canvas.paste(native, (x, y), native)
    return canvas


def blue_boxes(art: Image.Image) -> list[tuple[int, int, int, int]]:
    """只取虹膜蓝色像素的包围盒（不外扩）。"""
    w, h = art.size
    px = art.load()
    seen: set[tuple[int, int]] = set()
    boxes: list[tuple[int, int, int, int]] = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen:
                continue
            if px[x, y][:3] not in BLUE:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            pts = []
            while queue:
                cx, cy = queue.popleft()
                pts.append((cx, cy))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][:3] in BLUE:
                            seen.add((nx, ny))
                            queue.append((nx, ny))
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return boxes


def closed_eyes(art: Image.Image) -> Image.Image:
    """把眼睛画成闭眼：按列清掉眼眶里的黑/蓝，再在中间补一条细细的闭眼线。"""
    out = art.copy()
    px = out.load()
    w, h = out.size

    def dark(c) -> bool:
        return c[:3] == (0, 0, 0) or c[:3] in BLUE

    for (bx0, by0, bx1, by1) in blue_boxes(art):
        lo_y = max(0, by0 - 2)
        hi_y = min(h - 1, by1 + 2)
        for x in range(max(0, bx0 - 2), min(w, bx1 + 3)):
            blues = [y for y in range(lo_y, hi_y + 1) if px[x, y][3] > 0 and px[x, y][:3] in BLUE]
            if not blues:
                continue
            top = blues[0]
            while top - 1 >= lo_y and dark(px[x, top - 1]):
                top -= 1
            bottom = blues[-1]
            while bottom + 1 <= hi_y and dark(px[x, bottom + 1]):
                bottom += 1
            for y in range(top, bottom + 1):
                if dark(px[x, y]):
                    px[x, y] = (*SKIN, 255)
            mid = min(bottom - 1, max(top, (blues[0] + blues[-1]) // 2))
            for y in (mid, mid + 1):
                if top <= y <= bottom:
                    px[x, y] = (*LID, 255)
    return out


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    built: dict[str, Image.Image] = {}
    for name, index in FRAMES.items():
        native = load_native(index)
        sprite = compose(native)
        sprite.save(ASSETS / f"frame-{name}.png")
        built[name] = sprite
        print(f"frame-{name}.png  native={native.width}x{native.height}")

    # 眨眼帧：正/左两向（右向 = 左向镜像）；正面闭眼同时也是「睡觉」姿势
    for name in ("front", "left"):
        blink = closed_eyes(built[name])
        blink.save(ASSETS / f"frame-{name}-blink.png")
        built[name + "-blink"] = blink
        print(f"frame-{name}-blink.png")
    built["left-blink"].transpose(Image.FLIP_LEFT_RIGHT).save(ASSETS / "frame-right-blink.png")
    print("frame-right-blink.png")
    built["front-blink"].save(ASSETS / "frame-front-sleep.png")
    print("frame-front-sleep.png")

    # 插件列表图标：正面帧放大 4 倍居中，四周留白，正方形 256
    front = built["front"].resize((CANVAS_W * 4, CANVAS_H * 4), Image.NEAREST)
    base = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    plate = Image.new("RGBA", (256, 256), (26, 22, 32, 255))
    mask = Image.new("L", (256, 256), 0)
    mask.paste(255, (28, 28, 228, 228))
    base.paste(plate, (0, 0), mask)
    base.paste(front, ((256 - front.width) // 2, (256 - front.height) // 2), front)
    base.save(PACKAGE / "icon.png")
    print("icon.png 256x256")

    # 放大 10 倍的对照图，方便目检闭眼效果
    sheet = Image.new("RGB", (CANVAS_W * 10 * 4 + 30, CANVAS_H * 10), (30, 26, 34))
    for i, name in enumerate(("front", "front-blink", "left", "left-blink")):
        art = built[name].resize((CANVAS_W * 10, CANVAS_H * 10), Image.NEAREST)
        sheet.paste(art, (i * (CANVAS_W * 10 + 10) + 5, 0), art)
    sheet.save(PACKAGE / "preview" / "blink-check.png")

    Image.open(SOURCE).save(ASSETS / "source-sheet.png")


if __name__ == "__main__":
    main()
