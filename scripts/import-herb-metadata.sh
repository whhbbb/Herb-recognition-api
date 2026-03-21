#!/usr/bin/env bash
set -euo pipefail

# 用法:
#   bash scripts/import-herb-metadata.sh data/herb-metadata.seed.json http://127.0.0.1:4000/api

JSON_FILE="${1:-}"
API_BASE="${2:-http://127.0.0.1:4000/api}"

if [ -z "$JSON_FILE" ] || [ ! -f "$JSON_FILE" ]; then
  echo "用法: bash scripts/import-herb-metadata.sh /path/to/metadata.json [api_base]"
  exit 1
fi

curl -fsS -X POST "${API_BASE}/herb-classes/bulk" \
  -H "Content-Type: application/json" \
  --data-binary "@${JSON_FILE}"

echo
echo "导入完成: ${JSON_FILE}"
