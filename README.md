# Herb Recognition API (NestJS)

为中草药识别项目提供服务端存储与训练任务管理能力。

## 已实现能力
- 训练样本上传与管理（MySQL + 磁盘存储）
- 模型版本登记与激活管理
- 训练任务创建与状态跟踪
- 通过 `/files/*` 提供样本静态访问

## 目录
- `src/samples`：样本上传/列表/删除
- `src/models`：模型版本管理
- `src/training`：训练任务管理
- `src/entities`：TypeORM 数据库实体

## 本地启动
1. 复制环境变量：
```bash
cp .env.example .env
```
2. 配置 `.env` 中的 MySQL 连接。
3. 安装并启动：
```bash
npm install
npm run start:dev
```

默认端口：`4000`  
接口前缀：`/api`

## 关键接口
- `POST /api/samples/upload`：上传训练样本（`multipart/form-data`，字段：`file` + `herbId` + `herbName`）
- `GET /api/samples`：分页查询训练样本
- `DELETE /api/samples/:id`：删除样本
- `POST /api/models`：登记模型版本
- `GET /api/models`：查询模型版本
- `PATCH /api/models/:id/activate`：激活模型
- `POST /api/training/jobs`：创建训练任务
- `GET /api/training/jobs`：查询训练任务
- `PATCH /api/training/jobs/:id/status`：更新任务状态

## 宝塔部署建议
1. Node 版本选择 `20.x`。
2. 在宝塔创建 MySQL 库：`herb_recognition`。
3. 上传项目到服务器，例如 `/www/wwwroot/herb-recognition-api`。
4. 安装依赖并构建：
```bash
cd /www/wwwroot/herb-recognition-api
npm install
npm run build
```
5. 在宝塔 PM2 管理里启动命令：
```bash
npm run start
```
6. 反向代理到 `127.0.0.1:4000`。
7. 生产环境建议：`DB_SYNC=false`，改为迁移方式管理数据库结构。

## 一键脚本（服务器）
- 首次初始化：`bash scripts/server-init.sh`
- 日常发布更新：`bash scripts/server-update.sh`
- 训练环境初始化：`bash scripts/train-init.sh`
- 启动训练：`bash scripts/train-run.sh 20 16 training/runs`

## 下一步建议
- 将当前磁盘存储替换为阿里云 OSS（保留数据库结构不变，仅替换上传实现）。
- 在训练任务模块接入实际训练 worker（Python 或 Node 子进程）。
- 增加鉴权（JWT + 角色）避免样本和模型被匿名修改。
