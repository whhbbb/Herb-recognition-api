#!/usr/bin/env python3
import argparse
import shutil
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

CLASS_KEYWORDS = {
    "当归": ["当归", "angelica", "angelica sinensis"],
    "人参": ["人参", "ginseng", "panax ginseng"],
    "黄芪": ["黄芪", "astragalus", "astragalus membranaceus"],
    "川芎": ["川芎", "chuanxiong", "ligusticum chuanxiong"],
    "甘草": ["甘草", "licorice", "glycyrrhiza", "glycyrrhiza uralensis"],
    "白芍": ["白芍", "paeonia", "paeonia lactiflora"],
    "茯苓": ["茯苓", "poria", "poria cocos"],
    "枸杞子": ["枸杞", "枸杞子", "goji", "lycium barbarum"],
}


def infer_class(path: Path) -> str | None:
    text = str(path).lower()
    for cls, keywords in CLASS_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                return cls
    return None


def main():
    parser = argparse.ArgumentParser(description="整理原始中药材数据为可上传目录")
    parser.add_argument("--input", required=True, help="原始数据根目录")
    parser.add_argument("--output", required=True, help="输出目录")
    parser.add_argument("--max-per-class", type=int, default=0, help="每类最多保留数量，0表示不限制")
    args = parser.parse_args()

    in_root = Path(args.input).resolve()
    out_root = Path(args.output).resolve()
    out_root.mkdir(parents=True, exist_ok=True)

    for cls in CLASS_KEYWORDS.keys():
        (out_root / cls).mkdir(parents=True, exist_ok=True)

    count = {cls: 0 for cls in CLASS_KEYWORDS.keys()}
    skipped = 0

    for p in in_root.rglob("*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in IMAGE_EXTS:
            continue

        cls = infer_class(p)
        if cls is None:
            skipped += 1
            continue

        if args.max_per_class > 0 and count[cls] >= args.max_per_class:
            continue

        dst = out_root / cls / f"{count[cls]:06d}{p.suffix.lower()}"
        shutil.copy2(p, dst)
        count[cls] += 1

    print("=== 整理完成 ===")
    for cls in CLASS_KEYWORDS.keys():
        print(f"{cls}: {count[cls]}")
    print(f"未匹配图片: {skipped}")
    print(f"输出目录: {out_root}")


if __name__ == "__main__":
    main()
