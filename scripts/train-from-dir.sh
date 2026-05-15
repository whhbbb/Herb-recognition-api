#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DATASET_DIR="${1:-}"
EPOCHS="${2:-40}"
BATCH_SIZE="${3:-16}"
OUT_DIR="${4:-training/runs}"

if [ -z "$DATASET_DIR" ]; then
  echo "用法: bash scripts/train-from-dir.sh /path/to/dataset_root [epochs] [batch_size] [output_dir]"
  exit 1
fi

cd "$APP_DIR"

if [ ! -d .venv ]; then
  echo ".venv 不存在，请先执行: bash scripts/train-init.sh"
  exit 1
fi

source .venv/bin/activate

python training/train_from_dir.py \
  --dataset-dir "$DATASET_DIR" \
  --epochs "$EPOCHS" \
  --batch-size "$BATCH_SIZE" \
  --output-dir "$OUT_DIR"
