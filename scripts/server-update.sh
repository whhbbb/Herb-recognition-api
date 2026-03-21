#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/Herb-recognition-api"
APP_NAME="herb-api"

cd "$APP_DIR"

echo "[1/4] 拉取代码"
git pull --ff-only

echo "[2/4] 安装依赖"
npm install

echo "[3/4] 构建"
npm run build

echo "[4/4] 重启服务"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME"
else
  pm2 start ecosystem.config.cjs --only "$APP_NAME"
fi

pm2 save

echo "发布完成"
