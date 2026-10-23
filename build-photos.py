#!/usr/bin/env python3
"""从 photos/ 生成网页用的压缩图到 photos-web/，并按 EXIF 方向转正。

用法: python build-photos.py
新增照片流程: 图片丢进 photos/ -> 跑本脚本 -> git add + commit + push
"""

import json
import sys
from pathlib import Path
from typing import List, Tuple

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / 'photos'
OUT_DIR = ROOT / 'photos-web'
MANIFEST = ROOT / 'photos.json'

MAX_EDGE = 1600
QUALITY = 82
EXTS = {'.jpg', '.jpeg', '.png', '.webp'}


def build_one(src: Path) -> Tuple[Tuple[int, int], int]:
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)  # 按 EXIF 转正，否则手机竖拍会横过来
    if im.mode != 'RGB':
        im = im.convert('RGB')
    im.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    out = OUT_DIR / (src.stem + '.jpg')
    # 不写 EXIF：旋转已经烘焙进像素，避免浏览器重复转
    im.save(out, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    return im.size, out.stat().st_size


def sync_manifest(names: List[str]) -> None:
    """只把缺失的文件名追加进去，不改动已有条目的格式和手工添加的字段。"""
    text = MANIFEST.read_text(encoding='utf-8') if MANIFEST.exists() else '[]'
    try:
        existing = json.loads(text)
    except json.JSONDecodeError:
        print('photos.json 格式有误，跳过同步', file=sys.stderr)
        return
    known = {p['name'] for p in existing if isinstance(p, dict) and p.get('name')}
    added = [n for n in names if n not in known]
    if not added:
        return

    new_lines = [',\n  { "name": %s }' % json.dumps(n, ensure_ascii=False) for n in added]
    tail = text.rstrip()
    if not tail.endswith(']'):
        print('photos.json 结构异常，跳过同步', file=sys.stderr)
        return
    body = tail[:-1].rstrip()
    body += ''.join(new_lines) + '\n]'
    MANIFEST.write_text(body, encoding='utf-8')
    print(f'photos.json 新增 {len(added)} 条')


def main() -> int:
    if not SRC_DIR.is_dir():
        print(f'找不到目录: {SRC_DIR}', file=sys.stderr)
        return 1
    OUT_DIR.mkdir(exist_ok=True)

    sources = sorted(
        p for p in SRC_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in EXTS
    )
    if not sources:
        print('photos/ 里没有图片')
        return 1

    total = 0
    for src in sources:
        size, nbytes = build_one(src)
        total += nbytes
        print(f'{src.name}  {size[0]}x{size[1]}  {nbytes // 1024} KB')

    sync_manifest([p.stem + '.jpg' for p in sources])
    print(f'共 {len(sources)} 张，合计 {total / 1024 / 1024:.1f} MB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
