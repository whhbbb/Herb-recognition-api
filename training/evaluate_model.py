#!/usr/bin/env python3
import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import List

import numpy as np
import pymysql
import torch
import torch.nn as nn
from PIL import Image, ImageDraw, ImageFont
from sklearn.metrics import confusion_matrix, precision_recall_fscore_support
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


class EvalDataset(Dataset):
    def __init__(self, samples, label_to_idx, transform):
        self.samples = samples
        self.label_to_idx = label_to_idx
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        image = Image.open(sample["image_path"]).convert("RGB")
        return self.transform(image), self.label_to_idx[sample["herb_id"]], sample["herb_id"]


def fetch_samples(args, split: str):
    conn = pymysql.connect(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        database=args.db_name,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT herbId AS herb_id, herbName AS herb_name, storageKey AS storage_key, split
                FROM training_samples
                WHERE split = %s
                ORDER BY createdAt DESC
                """,
                (split,),
            )
            rows = cursor.fetchall()
    finally:
        conn.close()

    samples = []
    for row in rows:
        image_path = Path(row["storage_key"])
        if not image_path.exists():
            continue
        samples.append(
            {
                "herb_id": row["herb_id"],
                "herb_name": row["herb_name"],
                "image_path": str(image_path),
                "split": row["split"],
            }
        )
    return samples


def load_labels(run_dir: Path):
    labels_path = run_dir / "labels.json"
    if not labels_path.exists():
        raise RuntimeError(f"labels.json 不存在: {labels_path}")
    with open(labels_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    label_to_idx = {str(k): int(v) for k, v in data["label_to_idx"].items()}
    idx_to_label = {int(k): str(v) for k, v in data["idx_to_label"].items()}
    return label_to_idx, idx_to_label


def build_model(num_classes: int):
    model = models.resnet18(weights=None)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def topk_accuracy(probs: torch.Tensor, targets: torch.Tensor, k: int):
    k = max(1, min(k, probs.size(1)))
    _, indices = torch.topk(probs, k=k, dim=1)
    return indices.eq(targets.view(-1, 1)).any(dim=1).sum().item()


def safe_float(value):
    return float(value) if np.isfinite(value) else 0.0


def build_split_candidates(primary: str, fallback_splits: str):
    candidates = [primary]
    for split in fallback_splits.split(","):
        split = split.strip()
        if split and split not in candidates:
            candidates.append(split)
    invalid = [split for split in candidates if split not in {"test", "val", "train"}]
    if invalid:
        raise RuntimeError(f"评估数据划分不合法: {', '.join(invalid)}")
    return candidates


def draw_confusion_matrix(matrix, labels: List[str], output_path: Path):
    cell = 44
    left = 260
    top = 210
    right_pad = 90
    bottom_pad = 190
    width = left + cell * len(labels) + right_pad
    height = top + cell * len(labels) + bottom_pad
    image = Image.new("RGB", (max(width, 1100), max(height, 900)), "white")
    draw = ImageDraw.Draw(image)

    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 34)
        font = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 18)
        small_font = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 14)
    except OSError:
        title_font = ImageFont.load_default()
        font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    draw.text((60, 45), "模型评估混淆矩阵", font=title_font, fill=(25, 25, 25))
    draw.line((60, 100, image.width - 60, 100), fill=(155, 155, 155), width=2)
    draw.text((left, 140), "预测类别", font=font, fill=(45, 45, 45))
    draw.text((60, top + cell * len(labels) // 2), "真实类别", font=font, fill=(45, 45, 45))

    max_value = int(matrix.max()) if matrix.size else 1
    max_value = max(max_value, 1)
    for row_idx, label in enumerate(labels):
        short = label[:22]
        y = top + row_idx * cell
        draw.text((60, y + 12), short, font=small_font, fill=(40, 40, 40))
        draw.text((left + row_idx * cell + 4, top - 34), str(row_idx + 1), font=small_font, fill=(60, 60, 60))
        draw.text((left - 32, y + 12), str(row_idx + 1), font=small_font, fill=(60, 60, 60))
        for col_idx in range(len(labels)):
            value = int(matrix[row_idx, col_idx])
            intensity = int(245 - 150 * (value / max_value))
            fill = (intensity, max(intensity + 8, 0), intensity)
            x = left + col_idx * cell
            draw.rectangle((x, y, x + cell, y + cell), fill=fill, outline=(220, 220, 220))
            if value:
                text = str(value)
                bbox = draw.textbbox((0, 0), text, font=small_font)
                draw.text(
                    (x + (cell - (bbox[2] - bbox[0])) / 2, y + (cell - (bbox[3] - bbox[1])) / 2),
                    text,
                    font=small_font,
                    fill=(20, 20, 20),
                )

    draw.text(
        (60, image.height - 95),
        "注：颜色越深表示该真实类别被预测为对应列类别的样本数越多；编号顺序与纵轴类别顺序一致。",
        font=small_font,
        fill=(80, 80, 80),
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path)


def main():
    parser = argparse.ArgumentParser(description="Evaluate trained herb classifier")
    parser.add_argument("--run-dir", required=True)
    parser.add_argument("--split", choices=["test", "val", "train"], default="test")
    parser.add_argument(
        "--fallback-splits",
        default="val,train",
        help="Comma-separated fallback splits when the primary split has no samples.",
    )
    parser.add_argument("--db-host", default=os.getenv("DB_HOST", "127.0.0.1"))
    parser.add_argument("--db-port", type=int, default=int(os.getenv("DB_PORT", "3306")))
    parser.add_argument("--db-user", default=os.getenv("DB_USER", "root"))
    parser.add_argument("--db-password", default=os.getenv("DB_PASSWORD", ""))
    parser.add_argument("--db-name", default=os.getenv("DB_NAME", "herb_recognition"))
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()

    run_dir = Path(args.run_dir)
    model_path = run_dir / "model.pt"
    if not model_path.exists():
        raise RuntimeError(f"model.pt 不存在: {model_path}")

    label_to_idx, idx_to_label = load_labels(run_dir)
    split_candidates = build_split_candidates(args.split, args.fallback_splits)
    samples = []
    used_split = args.split
    for split in split_candidates:
        samples = fetch_samples(args, split)
        if samples:
            used_split = split
            break

    samples = [sample for sample in samples if sample["herb_id"] in label_to_idx]
    if not samples:
        raise RuntimeError(f"没有可用于评估的 {'/'.join(split_candidates)} 样本")

    transform = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )
    dataset = EvalDataset(samples, label_to_idx, transform)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=False, num_workers=0)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = build_model(len(label_to_idx))
    state = torch.load(model_path, map_location=device)
    model.load_state_dict(state)
    model.to(device)
    model.eval()

    total = 0
    top1_hits = 0
    top3_hits = 0
    top5_hits = 0
    y_true = []
    y_pred = []
    infer_seconds = []

    with torch.no_grad():
        for images, targets, _ in loader:
            images = images.to(device)
            targets = targets.to(device)
            start = time.perf_counter()
            logits = model(images)
            elapsed = time.perf_counter() - start
            probs = torch.softmax(logits, dim=1)
            preds = probs.argmax(dim=1)
            batch_size = images.size(0)

            total += batch_size
            infer_seconds.append(elapsed / max(batch_size, 1))
            top1_hits += (preds == targets).sum().item()
            top3_hits += topk_accuracy(probs, targets, 3)
            top5_hits += topk_accuracy(probs, targets, 5)
            y_true.extend(targets.cpu().tolist())
            y_pred.extend(preds.cpu().tolist())

    labels = list(range(len(label_to_idx)))
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        y_pred,
        labels=labels,
        zero_division=0,
    )
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        y_true,
        y_pred,
        average="macro",
        zero_division=0,
    )
    matrix = confusion_matrix(y_true, y_pred, labels=labels)

    class_names = [idx_to_label[idx] for idx in labels]
    confusion_path = run_dir / "confusion_matrix.png"
    draw_confusion_matrix(matrix, class_names, confusion_path)

    per_class = []
    herb_name_by_id = {sample["herb_id"]: sample["herb_name"] for sample in samples}
    for idx in labels:
        herb_id = idx_to_label[idx]
        per_class.append(
            {
                "herbId": herb_id,
                "herbName": herb_name_by_id.get(herb_id, herb_id),
                "support": int(support[idx]),
                "precision": safe_float(precision[idx]),
                "recall": safe_float(recall[idx]),
                "f1": safe_float(f1[idx]),
            }
        )

    evaluation = {
        "runDir": str(run_dir),
        "split": used_split,
        "sampleSize": int(total),
        "numClasses": len(label_to_idx),
        "top1Acc": top1_hits / max(total, 1),
        "top3Acc": top3_hits / max(total, 1),
        "top5Acc": top5_hits / max(total, 1),
        "macroPrecision": safe_float(macro_precision),
        "macroRecall": safe_float(macro_recall),
        "macroF1": safe_float(macro_f1),
        "avgInferMs": safe_float(np.mean(infer_seconds) * 1000 if infer_seconds else 0),
        "evaluatedAt": datetime.now().isoformat(timespec="seconds"),
        "confusionMatrixPath": str(confusion_path),
        "confusionMatrix": matrix.tolist(),
        "labels": class_names,
        "perClass": per_class,
    }

    evaluation_path = run_dir / "evaluation.json"
    with open(evaluation_path, "w", encoding="utf-8") as f:
        json.dump(evaluation, f, ensure_ascii=False, indent=2)

    print(json.dumps(evaluation, ensure_ascii=False))


if __name__ == "__main__":
    main()
