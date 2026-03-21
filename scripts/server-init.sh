#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/www/wwwroot/Herb-recognition-api"
APP_NAME="herb-api"

cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 .env，请先编辑数据库配置后再重新执行本脚本。"
  exit 1
fi

npm install
npm run build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME"
else
  pm2 start ecosystem.config.cjs --only "$APP_NAME"
fi

pm2 save
pm2 startup

echo "初始化完成"
