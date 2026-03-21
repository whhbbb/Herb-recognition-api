#!/usr/bin/env bash
set -euo pipefail

API_BASE="${1:-http://127.0.0.1:4000/api}"
MAP_FILE="${2:-data/etcm-herb-map.tsv}"
OUT_JSON="${3:-/tmp/etcm_bulk.json}"
REPORT="${4:-/tmp/etcm_verify.txt}"

if [ ! -f "$MAP_FILE" ]; then
  echo "映射文件不存在: $MAP_FILE"
  exit 1
fi

jq -n '[]' > "$OUT_JSON"
: > "$REPORT"

while IFS=$'\t' read -r herb_id query zh_name; do
  [ -z "$herb_id" ] && continue
  resp=$(curl -s 'http://www.tcmip.cn:18124/home/browse/' \
    -H 'Content-Type: application/json' \
    --data '{"type":"herb","pageNo":1,"pageSize":1,"search_key":"'"$query"'"}')

  count=$(echo "$resp" | jq -r '.data[0].count // 0')
  if [ "$count" = "0" ]; then
    status="NO_HIT"
    pinyin=""
    latin=""
    entry=$(jq -n --arg herbId "$herb_id" --arg name "$zh_name" '{herbId:$herbId,data:{name:$name,category:"待补充",functions:[],cautions:[]}}')
  else
    pinyin=$(echo "$resp" | jq -r '.data[0].data[0]["Herb Name in Pinyin"][0] // ""')
    latin=$(echo "$resp" | jq -r '.data[0].data[0]["Herb Name in Latin"] // ""' | sed 's/<[^>]*>//g')
    prop=$(echo "$resp" | jq -r '.data[0].data[0]["Property"] // ""')
    flav=$(echo "$resp" | jq -r '.data[0].data[0]["Flavor"] // ""')
    meri=$(echo "$resp" | jq -r '.data[0].data[0]["Meridian Tropism"] // ""')

    q_norm=$(echo "$query" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z]//g')
    p_norm=$(echo "$pinyin" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z]//g')
    if [ "$p_norm" = "$q_norm" ]; then
      status="EXACT"
    elif [[ "$p_norm" == *"$q_norm"* ]]; then
      status="PARTIAL"
    else
      status="MISMATCH"
    fi

    if [ "$status" = "EXACT" ]; then
      properties="$prop"
      if [ -n "$flav" ]; then
        if [ -n "$properties" ]; then properties="$properties; $flav"; else properties="$flav"; fi
      fi
      desc="来源: ETCM2; 拼音: $pinyin; 归经: $meri"
      entry=$(jq -n --arg herbId "$herb_id" --arg name "$zh_name" --arg sci "$latin" --arg properties "$properties" --arg meridian "$meri" --arg desc "$desc" '{herbId:$herbId,data:{name:$name,scientificName:$sci,properties:$properties,meridian:$meridian,description:$desc,category:"中药材",functions:[],cautions:[]}}')
    else
      entry=$(jq -n --arg herbId "$herb_id" --arg name "$zh_name" '{herbId:$herbId,data:{name:$name,scientificName:"",properties:"",meridian:"",description:"来源: ETCM2 检索结果存在近似匹配，待人工核验",category:"待核验",functions:[],cautions:[]}}')
    fi
  fi

  echo "$herb_id|$query|$zh_name|$status|$pinyin|$latin|$count" >> "$REPORT"
  jq --argjson item "$entry" '. += [$item]' "$OUT_JSON" > "${OUT_JSON}.tmp" && mv "${OUT_JSON}.tmp" "$OUT_JSON"
done < "$MAP_FILE"

curl -s "$API_BASE/herb-classes/bulk" \
  -H 'Content-Type: application/json' \
  --data-binary "@$OUT_JSON" | jq '.'

echo "报告: $REPORT"
echo "数据: $OUT_JSON"
awk -F'|' '{cnt[$4]++} END {for (k in cnt) print k, cnt[k]}' "$REPORT"
