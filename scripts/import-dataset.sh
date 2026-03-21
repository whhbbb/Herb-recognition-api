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

# 你当前系统内置的8类草药映射（目录名 -> herbId）
declare -A ID_MAP=(
  ["当归"]=1
  ["人参"]=2
  ["黄芪"]=3
  ["川芎"]=4
  ["甘草"]=5
  ["白芍"]=6
  ["茯苓"]=7
  ["枸杞子"]=8
)

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
  herb_id="${ID_MAP[$herb_name]:-}"

  if [ -z "$herb_id" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

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
