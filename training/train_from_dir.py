#!/usr/bin/env python3
import argparse
import json
import os
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Tuple

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}


@dataclass
class Sample:
    herb_id: str
    image_path: str


class HerbDirDataset(Dataset):
    def __init__(self, samples: List[Sample], label_to_idx: dict, transform):
        self.samples = samples
        self.label_to_idx = label_to_idx
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        sample = self.samples[idx]
        image = Image.open(sample.image_path).convert('RGB')
        if self.transform:
            image = self.transform(image)
        target = self.label_to_idx[sample.herb_id]
        return image, target


def set_seed(seed: int):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def fetch_samples(dataset_dir: Path) -> List[Sample]:
    if not dataset_dir.exists():
        raise RuntimeError(f'数据集目录不存在: {dataset_dir}')

    samples: List[Sample] = []
    for class_dir in sorted(dataset_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        herb_id = class_dir.name
        for image_path in sorted(class_dir.rglob('*')):
            if image_path.is_file() and image_path.suffix.lower() in IMAGE_EXTENSIONS:
                samples.append(Sample(herb_id=herb_id, image_path=str(image_path)))
    return samples


def build_splits(samples: List[Sample], val_ratio: float, seed: int) -> Tuple[List[Sample], List[Sample]]:
    if len(samples) < 8:
        raise RuntimeError('样本太少，至少需要 8 张图片')

    labels = [s.herb_id for s in samples]
    class_counts = {label: labels.count(label) for label in set(labels)}
    stratify = labels if len(class_counts) > 1 and min(class_counts.values()) >= 2 else None

    train_samples, val_samples = train_test_split(
        samples,
        test_size=val_ratio,
        random_state=seed,
        stratify=stratify,
    )
    return train_samples, val_samples


def train_epoch(model, loader, criterion, optimizer, device):
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0

    for images, targets in loader:
        images = images.to(device)
        targets = targets.to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss = criterion(logits, targets)
        loss.backward()
        optimizer.step()

        total_loss += loss.item() * images.size(0)
        preds = logits.argmax(dim=1)
        correct += (preds == targets).sum().item()
        total += images.size(0)

    return total_loss / max(total, 1), correct / max(total, 1)


def eval_epoch(model, loader, criterion, device):
    model.eval()
    total_loss = 0.0
    correct = 0
    total = 0

    with torch.no_grad():
        for images, targets in loader:
            images = images.to(device)
            targets = targets.to(device)
            logits = model(images)
            loss = criterion(logits, targets)

            total_loss += loss.item() * images.size(0)
            preds = logits.argmax(dim=1)
            correct += (preds == targets).sum().item()
            total += images.size(0)

    return total_loss / max(total, 1), correct / max(total, 1)


def build_model(num_classes: int, use_pretrained: bool):
    if use_pretrained:
        try:
            model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        except Exception as exc:
            print(f'[warn] 预训练权重加载失败，回退随机初始化: {exc}')
            model = models.resnet18(weights=None)
    else:
        model = models.resnet18(weights=None)

    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def main():
    parser = argparse.ArgumentParser(description='Train herb classifier from class folders')
    parser.add_argument('--dataset-dir', required=True)
    parser.add_argument('--epochs', type=int, default=40)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--val-ratio', type=float, default=0.2)
    parser.add_argument('--lr', type=float, default=3e-4)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--output-dir', default='training/runs')
    parser.add_argument('--num-workers', type=int, default=int(os.getenv('TRAIN_NUM_WORKERS', '0')))
    parser.add_argument(
        '--pretrained',
        action='store_true',
        default=os.getenv('TRAIN_USE_PRETRAINED', 'true').lower() in {'1', 'true', 'yes'},
    )
    args = parser.parse_args()

    set_seed(args.seed)

    samples = fetch_samples(Path(args.dataset_dir))
    if len(samples) < 8:
        raise RuntimeError(f'可用样本仅 {len(samples)}，不足以训练')

    label_ids = sorted({s.herb_id for s in samples})
    if len(label_ids) < 2:
        raise RuntimeError('训练类别不足 2 类，无法有效训练分类模型')
    label_to_idx = {hid: i for i, hid in enumerate(label_ids)}

    train_samples, val_samples = build_splits(samples, args.val_ratio, args.seed)

    train_tf = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(10),
        transforms.ColorJitter(brightness=0.2, contrast=0.2),
        transforms.CenterCrop((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    eval_tf = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    train_loader = DataLoader(
        HerbDirDataset(train_samples, label_to_idx, train_tf),
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=max(0, int(args.num_workers)),
    )
    val_loader = DataLoader(
        HerbDirDataset(val_samples, label_to_idx, eval_tf),
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=max(0, int(args.num_workers)),
    )

    device = 'cuda' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
    model = build_model(len(label_to_idx), args.pretrained).to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)

    best_val_acc = 0.0
    best_state = None
    history = []

    for epoch in range(1, args.epochs + 1):
        train_loss, train_acc = train_epoch(model, train_loader, criterion, optimizer, device)
        val_loss, val_acc = eval_epoch(model, val_loader, criterion, device)
        history.append(
            {
                'epoch': epoch,
                'train_loss': train_loss,
                'train_acc': train_acc,
                'val_loss': val_loss,
                'val_acc': val_acc,
            }
        )
        print(
            f"epoch {epoch:02d} | train_loss={train_loss:.4f} train_acc={train_acc:.4f} "
            f"val_loss={val_loss:.4f} val_acc={val_acc:.4f}"
        )

        if val_acc >= best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    if best_state is None:
        raise RuntimeError('训练失败，未得到有效模型')

    run_id = datetime.now().strftime('%Y%m%d-%H%M%S')
    out_dir = Path(args.output_dir) / run_id
    out_dir.mkdir(parents=True, exist_ok=True)

    model_path = out_dir / 'model.pt'
    labels_path = out_dir / 'labels.json'
    metrics_path = out_dir / 'metrics.json'

    torch.save(best_state, model_path)

    idx_to_label = {idx: hid for hid, idx in label_to_idx.items()}
    with open(labels_path, 'w', encoding='utf-8') as f:
        json.dump({'label_to_idx': label_to_idx, 'idx_to_label': idx_to_label}, f, ensure_ascii=False, indent=2)

    with open(metrics_path, 'w', encoding='utf-8') as f:
        json.dump(
            {
                'best_val_acc': best_val_acc,
                'history': history,
                'train_size': len(train_samples),
                'val_size': len(val_samples),
                'num_classes': len(label_to_idx),
                'device': device,
                'dataset_dir': str(Path(args.dataset_dir).resolve()),
                'pretrained': bool(args.pretrained),
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    print('=== 训练完成 ===')
    print(f'model:   {model_path}')
    print(f'labels:  {labels_path}')
    print(f'metrics: {metrics_path}')


if __name__ == '__main__':
    main()
