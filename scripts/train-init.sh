#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/Herb-recognition-api"

cd "$APP_DIR"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 未安装，请先安装 Python 3.9+"
  exit 1
fi

python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r training/requirements.txt

echo "训练环境初始化完成"
