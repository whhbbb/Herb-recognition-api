#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms


def find_latest_run(base_dir: Path) -> Path:
    if not base_dir.exists():
        raise RuntimeError(f'训练目录不存在: {base_dir}')
    candidates = []
    for child in base_dir.iterdir():
        if not child.is_dir():
            continue
        if (child / 'model.pt').exists() and (child / 'labels.json').exists():
            candidates.append(child)
    if not candidates:
        raise RuntimeError('未找到可用模型，请先训练')
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def build_model(num_classes: int):
    model = models.resnet18(weights=None)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def main():
    parser = argparse.ArgumentParser(description='Predict herb class by trained model')
    parser.add_argument('--image', required=True)
    parser.add_argument('--run-dir', default='')
    parser.add_argument('--runs-base', default='training/runs')
    parser.add_argument('--topk', type=int, default=5)
    args = parser.parse_args()

    image_path = Path(args.image)
    if not image_path.exists():
        raise RuntimeError(f'图片不存在: {image_path}')

    if args.run_dir:
        run_dir = Path(args.run_dir)
    else:
        run_dir = find_latest_run(Path(args.runs_base))

    labels_path = run_dir / 'labels.json'
    model_path = run_dir / 'model.pt'
    if not labels_path.exists() or not model_path.exists():
        raise RuntimeError(f'模型文件缺失: {run_dir}')

    with open(labels_path, 'r', encoding='utf-8') as f:
        label_data = json.load(f)
    idx_to_label = {int(k): v for k, v in label_data['idx_to_label'].items()}
    num_classes = len(idx_to_label)

    model = build_model(num_classes)
    state = torch.load(model_path, map_location='cpu')
    model.load_state_dict(state)
    model.eval()

    tfm = transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )

    image = Image.open(image_path).convert('RGB')
    x = tfm(image).unsqueeze(0)
    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1).squeeze(0)

    topk = max(1, min(args.topk, num_classes))
    values, indices = torch.topk(probs, k=topk)
    predictions = []
    for i in range(topk):
        idx = int(indices[i].item())
        predictions.append(
            {
                'herbId': idx_to_label[idx],
                'confidence': float(values[i].item()),
            }
        )

    print(
        json.dumps(
            {
                'runDir': str(run_dir),
                'predictions': predictions,
            },
            ensure_ascii=False,
        )
    )


if __name__ == '__main__':
    main()

