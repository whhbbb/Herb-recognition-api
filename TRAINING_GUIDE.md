# 数据集检索与训练执行指南

## 推荐可用数据集（优先级）

1. TCMP-300（Scientific Data 2025）
- 论文：https://www.nature.com/articles/s41597-025-05522-7
- DOI：https://doi.org/10.6084/m9.figshare.29432726
- 规模：52,089 图像，300 类

2. NB-TCM-CHM（Data in Brief 2024）
- DOI：https://doi.org/10.1016/j.dib.2024.110405
- 数据：https://data.mendeley.com/datasets/2kjmzjyrmd/2
- 规模：20 类（网络+实拍）

3. Chinese medicinal blossom（Data in Brief 2021）
- DOI：https://doi.org/10.1016/j.dib.2021.107655
- 数据：https://data.mendeley.com/datasets/r3z6vp396m/2

## 训练方式（当前可直接执行）

本项目提供 `training/train_from_db.py`：
- 从 MySQL 的 `training_samples` 读取样本
- 读取对应图片路径并训练 `ResNet18`
- 导出 `model.pt / labels.json / metrics.json`

### 1) 安装训练依赖

```bash
cd /www/wwwroot/Herb-recognition-api
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r training/requirements.txt
```

### 2) 开始训练（读取 .env 中数据库）

```bash
cd /www/wwwroot/Herb-recognition-api
source .venv/bin/activate
set -a; source .env; set +a
python training/train_from_db.py --epochs 20 --batch-size 16 --output-dir training/runs
```

### 3) 训练结果位置

输出目录例如：
- `training/runs/20260321-xxxxxx/model.pt`
- `training/runs/20260321-xxxxxx/labels.json`
- `training/runs/20260321-xxxxxx/metrics.json`

### 4) 将训练结果登记到 API（可选）

```bash
curl -X POST http://127.0.0.1:4000/api/models \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"resnet18-herb",
    "version":"v1",
    "framework":"pytorch",
    "artifactUrl":"/www/wwwroot/Herb-recognition-api/training/runs/<run_id>/model.pt",
    "isActive":true
  }'
```

## 外部数据集接入建议

- 下载后按 `类别文件夹/图片` 组织
- 在前端训练页使用“目录导入”，样本会写入 `training_samples`
- 再运行本训练脚本进行集中训练
