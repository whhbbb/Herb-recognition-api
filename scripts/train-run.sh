#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/Herb-recognition-api"
EPOCHS="${1:-20}"
BATCH_SIZE="${2:-16}"
OUT_DIR="${3:-training/runs}"

cd "$APP_DIR"

if [ ! -d .venv ]; then
  echo ".venv 不存在，请先执行: bash scripts/train-init.sh"
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env 不存在，请先配置数据库连接"
  exit 1
fi

source .venv/bin/activate
set -a
source .env
set +a

python training/train_from_db.py \
  --epochs "$EPOCHS" \
  --batch-size "$BATCH_SIZE" \
  --output-dir "$OUT_DIR"
