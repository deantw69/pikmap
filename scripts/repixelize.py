#!/usr/bin/env python3
"""
repixelize.py — 把「放大過、帶 JPG 模糊」的像素圖原稿重繪成乾淨像素圖。

做法（即 N=13 那次的繪製方式）：
  1. 偵測（或指定）原圖的像素格邊長 N。
  2. 找最佳對齊偏移（使每格內顏色變異最小）。
  3. 每一格取「前景像素的中位數」當該格的單一純色（避開模糊白邊汙染）。
  4. 背景去除為透明：優先用原圖既有的 alpha；沒有就從邊緣 flood-fill 掉近白／淺灰。
  5. 裁掉透明邊框後輸出小尺寸 PNG（顯示端用 image-rendering: pixelated 放大仍銳利）。

輸入：img/<key>.(png|jpg)，key 為下列八種皮克敏之一。
輸出：src/assets/pikmin/<key>.png

用法：
  python3 scripts/repixelize.py                 # 用預設 N=13 重繪全部存在的檔
  python3 scripts/repixelize.py --n 13          # 指定像素格邊長
  python3 scripts/repixelize.py --auto          # 自動偵測每張的 N
  python3 scripts/repixelize.py --threshold 0.5 # 一格前景佔比達多少才算實心(預設 0.5)
  python3 scripts/repixelize.py blue red        # 只處理指定 key

需要套件：pillow、numpy
  python3 -m venv .venv && .venv/bin/pip install pillow numpy
  .venv/bin/python scripts/repixelize.py
"""
import argparse
import os
from collections import deque

import numpy as np
from PIL import Image

KEYS = ["red", "yellow", "blue", "white", "purple", "rock", "winged", "ice"]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IN_DIR = os.path.join(ROOT, "img")
OUT_DIR = os.path.join(ROOT, "src", "assets", "pikmin")


# ── 背景判定 ──
def fillable(a):
    """近白或低彩度淺灰（含截圖棋盤格）視為可填的背景候選。"""
    r, g, b = a[:, :, 0].astype(int), a[:, :, 1].astype(int), a[:, :, 2].astype(int)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return (mn >= 185) & ((mx - mn) <= 25)


def flood_bg(rgb):
    """從四邊往內 flood-fill 背景候選；回傳 True=背景的遮罩（被包住的白不會被刪）。"""
    H, W = rgb.shape[:2]
    f = fillable(rgb)
    vis = np.zeros((H, W), bool)
    dq = deque()
    for x in range(W):
        for y in (0, H - 1):
            if f[y, x] and not vis[y, x]:
                vis[y, x] = True
                dq.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if f[y, x] and not vis[y, x]:
                vis[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not vis[ny, nx] and f[ny, nx]:
                vis[ny, nx] = True
                dq.append((ny, nx))
    return vis


def foreground_mask(im):
    """前景遮罩：原圖若已有透明就沿用，否則 flood-fill 去背。"""
    if im.mode == "RGBA":
        arr = np.array(im)
        if (arr[:, :, 3] < 255).any():
            return arr[:, :, :3], arr[:, :, 3] > 127
        rgb = arr[:, :, :3]
    else:
        rgb = np.array(im.convert("RGB"))
    return rgb, ~flood_bg(rgb)


# ── 像素格偵測與對齊 ──
def detect_period(rgb):
    """用邊界訊號的自相關估計像素格邊長（4..40），回傳最佳週期。"""
    g = rgb.mean(2)
    sig = np.abs(np.diff(g, axis=1)).sum(0)
    s = sig - sig.mean()
    n = len(s)
    best, blag = -2, 13
    for lag in range(4, 41):
        c = np.corrcoef(s[: n - lag], s[lag:])[0, 1]
        if c > best:
            best, blag = c, lag
    return blag


def best_offset(rgb, n):
    """挑使每格內顏色變異最小的對齊偏移 (oy, ox)。"""
    H, W = rgb.shape[:2]

    def cost(oy, ox):
        tot = 0.0
        cnt = 0
        for y in range(oy, H - n, n):
            for x in range(ox, W - n, n):
                tot += rgb[y:y + n, x:x + n].astype(int).var(axis=(0, 1)).sum()
                cnt += 1
        return tot / max(cnt, 1)

    return min(((oy, ox) for oy in range(0, n) for ox in range(0, n)), key=lambda o: cost(*o))


# ── 重繪 ──
def trim(rgba):
    al = rgba[:, :, 3]
    ys = np.where(al.any(1))[0]
    xs = np.where(al.any(0))[0]
    if not len(ys) or not len(xs):
        return rgba
    return rgba[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1]


def repixelize(im, n, threshold):
    rgb, fg = foreground_mask(im)
    H, W = rgb.shape[:2]
    oy, ox = best_offset(rgb, n)
    Hl, Wl = (H - oy) // n, (W - ox) // n
    out = np.zeros((Hl, Wl, 4), np.uint8)
    need = threshold * n * n
    for i in range(Hl):
        for j in range(Wl):
            sy, sx = oy + i * n, ox + j * n
            cell = rgb[sy:sy + n, sx:sx + n].reshape(-1, 3)
            m = fg[sy:sy + n, sx:sx + n].reshape(-1)
            if m.sum() >= need:
                out[i, j, :3] = np.median(cell[m], axis=0)
                out[i, j, 3] = 255
    return trim(out)


def find_source(key):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = os.path.join(IN_DIR, key + ext)
        if os.path.exists(p):
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description="把模糊像素圖原稿重繪成乾淨像素圖")
    ap.add_argument("keys", nargs="*", help="只處理這些 key（預設全部）")
    ap.add_argument("--n", type=int, default=13, help="像素格邊長（預設 13）")
    ap.add_argument("--auto", action="store_true", help="自動偵測每張的 N（忽略 --n）")
    ap.add_argument("--threshold", type=float, default=0.5, help="一格前景佔比達多少才算實心（預設 0.5）")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    keys = args.keys or KEYS
    done = 0
    for key in keys:
        src = find_source(key)
        if not src:
            print(f"  跳過 {key}：img/ 找不到對應原圖")
            continue
        im = Image.open(src)
        n = detect_period(np.array(im.convert("RGB"))) if args.auto else args.n
        out = repixelize(im, n, args.threshold)
        Image.fromarray(out).save(os.path.join(OUT_DIR, key + ".png"))
        print(f"  {key}: {os.path.basename(src)} → {out.shape[1]}x{out.shape[0]}  (N={n})")
        done += 1
    print(f"完成 {done}/{len(keys)} 張，輸出於 {OUT_DIR}")


if __name__ == "__main__":
    main()
