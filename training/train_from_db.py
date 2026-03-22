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
import pymysql
import torch
import torch.nn as nn
from PIL import Image
from sklearn.model_selection import train_test_split
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms


@dataclass
class Sample:
    herb_id: str
    herb_name: str
    image_path: str
    split: str


class HerbDataset(Dataset):
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


def fetch_samples(args) -> List[Sample]:
    conn = pymysql.connect(
        host=args.db_host,
        port=args.db_port,
        user=args.db_user,
        password=args.db_password,
        database=args.db_name,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT herbId AS herb_id, herbName AS herb_name, storageKey AS storage_key, split
                FROM training_samples
                ORDER BY createdAt DESC
                """
            )
            rows = cursor.fetchall()
    finally:
        conn.close()

    samples: List[Sample] = []
    for row in rows:
        p = Path(row['storage_key'])
        if not p.exists():
            continue
        samples.append(
            Sample(
                herb_id=row['herb_id'],
                herb_name=row['herb_name'],
                image_path=str(p),
                split=row['split'] or 'train',
            )
        )
    return samples


def build_splits(samples: List[Sample], val_ratio: float, seed: int) -> Tuple[List[Sample], List[Sample]]:
    train_samples = [s for s in samples if s.split == 'train']
    val_samples = [s for s in samples if s.split == 'val']

    if val_samples:
        return train_samples, val_samples

    if len(train_samples) < 8:
        raise RuntimeError('样本太少，至少需要 8 张 train 样本')

    labels = [s.herb_id for s in train_samples]
    tr, va = train_test_split(
        train_samples,
        test_size=val_ratio,
        random_state=seed,
        stratify=labels if len(set(labels)) > 1 else None,
    )
    return tr, va


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


def main():
    parser = argparse.ArgumentParser(description='Train herb classifier from MySQL samples')
    parser.add_argument('--db-host', default=os.getenv('DB_HOST', '127.0.0.1'))
    parser.add_argument('--db-port', type=int, default=int(os.getenv('DB_PORT', '3306')))
    parser.add_argument('--db-user', default=os.getenv('DB_USER', 'root'))
    parser.add_argument('--db-password', default=os.getenv('DB_PASSWORD', ''))
    parser.add_argument('--db-name', default=os.getenv('DB_NAME', 'herb_recognition'))
    parser.add_argument('--epochs', type=int, default=15)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--val-ratio', type=float, default=0.2)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--output-dir', default='training/runs')
    low_memory_default = os.getenv('TRAIN_LOW_MEMORY', 'false').lower() in {'1', 'true', 'yes'}
    parser.add_argument(
        '--num-workers',
        type=int,
        default=int(os.getenv('TRAIN_NUM_WORKERS', '0' if low_memory_default else '2')),
    )
    args = parser.parse_args()

    set_seed(args.seed)

    samples = fetch_samples(args)
    if len(samples) < 8:
        raise RuntimeError(f'可用样本仅 {len(samples)}，不足以训练')

    label_ids = sorted(list({s.herb_id for s in samples}))
    label_to_idx = {hid: i for i, hid in enumerate(label_ids)}

    train_samples, val_samples = build_splits(samples, args.val_ratio, args.seed)

    if len({s.herb_id for s in train_samples}) < 2:
        raise RuntimeError('训练类别不足 2 类，无法有效训练分类模型')

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

    train_ds = HerbDataset(train_samples, label_to_idx, train_tf)
    val_ds = HerbDataset(val_samples, label_to_idx, eval_tf)

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=max(0, int(args.num_workers)),
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=max(0, int(args.num_workers)),
    )

    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    use_pretrained = os.getenv('TRAIN_USE_PRETRAINED', 'false').lower() in {'1', 'true', 'yes'}
    if use_pretrained:
        try:
            model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
        except Exception as exc:
            print(f'[warn] 预训练权重加载失败，回退随机初始化: {exc}')
            model = models.resnet18(weights=None)
    else:
        model = models.resnet18(weights=None)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, len(label_to_idx))
    model = model.to(device)

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
            best_state = model.state_dict()

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
