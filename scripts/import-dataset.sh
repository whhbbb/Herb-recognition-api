#!/usr/bin/env bash
set -euo pipefail

# 批量导入脚本
# 用法:
#   bash scripts/import-dataset.sh /path/to/dataset_root [api_base]
# 示例:
#   bash scripts/import-dataset.sh /data/tcmp_subset http://127.0.0.1:4000/api

ROOT_DIR="${1:-}"
API_BASE="${2:-http://127.0.0.1:4000/api}"

if [ -z "$ROOT_DIR" ]; then
  echo "用法: bash scripts/import-dataset.sh /path/to/dataset_root [api_base]"
  exit 1
fi

if [ ! -d "$ROOT_DIR" ]; then
  echo "目录不存在: $ROOT_DIR"
  exit 1
fi

is_image_file() {
  local f="${1,,}"
  [[ "$f" == *.jpg || "$f" == *.jpeg || "$f" == *.png || "$f" == *.webp || "$f" == *.bmp ]]
}

IMPORTED=0
SKIPPED=0
FAILED=0

while IFS= read -r -d '' file; do
  if ! is_image_file "$file"; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  herb_name="$(basename "$(dirname "$file")")"
  herb_id="$herb_name"

  if curl -fsS -X POST "$API_BASE/samples/upload" \
    -F "file=@$file" \
    -F "herbId=$herb_id" \
    -F "herbName=$herb_name" \
    -F "source=dataset" \
    -F "split=train" >/dev/null; then
    IMPORTED=$((IMPORTED + 1))
    if [ $((IMPORTED % 20)) -eq 0 ]; then
      echo "已导入 $IMPORTED 张..."
    fi
  else
    FAILED=$((FAILED + 1))
    echo "导入失败: $file"
  fi
done < <(find "$ROOT_DIR" -type f -print0)

echo "导入完成: imported=$IMPORTED skipped=$SKIPPED failed=$FAILED"
