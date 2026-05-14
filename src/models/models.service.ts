import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { Repository } from 'typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { CreateModelVersionDto } from './dto/create-model-version.dto';

@Injectable()
export class ModelsService {
  private readonly runningEvaluations = new Set<string>();

  constructor(
    @InjectRepository(ModelVersionEntity)
    private readonly modelRepo: Repository<ModelVersionEntity>,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateModelVersionDto) {
    if (dto.isActive) {
      await this.modelRepo.update({ isActive: true }, { isActive: false });
    }
    const entity = this.modelRepo.create({
      ...dto,
      metrics: dto.metrics ?? null,
    });
    return this.modelRepo.save(entity);
  }

  async list() {
    const models = await this.modelRepo.find({
      order: { createdAt: 'DESC' },
    });
    return Promise.all(models.map((model) => this.withEvaluationArtifact(model)));
  }

  async activate(id: string) {
    const target = await this.modelRepo.findOne({ where: { id } });
    if (!target) {
      throw new NotFoundException('模型版本不存在');
    }
    await this.modelRepo.update({ isActive: true }, { isActive: false });
    target.isActive = true;
    return this.modelRepo.save(target);
  }

  private resolvePythonBin() {
    const envPython = this.config.get<string>('PYTHON_BIN');
    if (envPython?.trim()) {
      return envPython.trim();
    }
    const venvPython = join(process.cwd(), '.venv', 'bin', 'python');
    return existsSync(venvPython) ? venvPython : 'python3';
  }

  private resolveEvaluationScript() {
    return join(process.cwd(), 'training', 'evaluate_model.py');
  }

  private async findOrFail(id: string) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      throw new NotFoundException('模型版本不存在');
    }
    return model;
  }

  private normalizeMetrics(metrics: unknown) {
    if (!metrics) {
      return {};
    }
    if (typeof metrics === 'string') {
      try {
        const parsed = JSON.parse(metrics) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
    return typeof metrics === 'object' && !Array.isArray(metrics) ? (metrics as Record<string, unknown>) : {};
  }

  private async readEvaluationArtifact(model: ModelVersionEntity) {
    const evaluationPath = join(model.artifactUrl, 'evaluation.json');
    if (!existsSync(evaluationPath)) {
      return null;
    }
    const raw = await fs.readFile(evaluationPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private async withEvaluationArtifact(model: ModelVersionEntity) {
    const metrics = this.normalizeMetrics(model.metrics);
    if (metrics.evaluation) {
      return { ...model, metrics };
    }

    const evaluation = await this.readEvaluationArtifact(model);
    return evaluation ? { ...model, metrics: { ...metrics, evaluation } } : { ...model, metrics };
  }

  private async patchMetrics(id: string, patch: Record<string, unknown>) {
    const model = await this.findOrFail(id);
    const metrics = {
      ...this.normalizeMetrics(model.metrics),
      ...patch,
    };
    model.metrics = metrics;
    await this.modelRepo.save(model);
    return metrics;
  }

  async evaluate(id: string) {
    const model = await this.findOrFail(id);
    const scriptPath = this.resolveEvaluationScript();
    if (!existsSync(scriptPath)) {
      throw new InternalServerErrorException('评估脚本不存在: training/evaluate_model.py');
    }

    const runDir = model.artifactUrl?.trim();
    if (!runDir || !existsSync(join(runDir, 'model.pt')) || !existsSync(join(runDir, 'labels.json'))) {
      throw new InternalServerErrorException('模型产物不完整，缺少 model.pt 或 labels.json');
    }

    if (this.runningEvaluations.has(id)) {
      return { status: 'running', modelId: id, message: '模型评估正在执行中' };
    }

    this.runningEvaluations.add(id);
    await this.patchMetrics(id, {
      evaluationStatus: {
        status: 'running',
        startedAt: new Date().toISOString(),
      },
    });
    this.runEvaluationInBackground(id, runDir, scriptPath);

    return { status: 'running', modelId: id, message: '模型评估已开始，请稍后刷新查看结果' };
  }

  private runEvaluationInBackground(id: string, runDir: string, scriptPath: string) {
    execFile(
      this.resolvePythonBin(),
      [scriptPath, '--run-dir', runDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          EVAL_NUM_THREADS: process.env.EVAL_NUM_THREADS ?? '1',
        },
        maxBuffer: 1024 * 1024 * 16,
      },
      async (error, stdout, stderr) => {
        this.runningEvaluations.delete(id);

        if (stderr?.trim()) {
          console.warn('[model-evaluate] python stderr:', stderr);
        }

        if (error) {
          await this.patchMetrics(id, {
            evaluationStatus: {
              status: 'failed',
              finishedAt: new Date().toISOString(),
              error: error.message,
            },
          });
          return;
        }

        try {
          const evaluation = JSON.parse(stdout) as Record<string, unknown>;
          await this.patchMetrics(id, {
            evaluation,
            evaluationStatus: {
              status: 'completed',
              finishedAt: new Date().toISOString(),
            },
          });
        } catch (parseError) {
          await this.patchMetrics(id, {
            evaluationStatus: {
              status: 'failed',
              finishedAt: new Date().toISOString(),
              error: `评估结果解析失败: ${(parseError as Error).message}`,
            },
          });
        }
      },
    );
  }

  async getEvaluation(id: string) {
    const model = await this.findOrFail(id);
    const evaluationFromMetrics = this.normalizeMetrics(model.metrics).evaluation;
    if (evaluationFromMetrics) {
      return evaluationFromMetrics;
    }

    const evaluation = await this.readEvaluationArtifact(model);
    if (!evaluation) {
      throw new NotFoundException('该模型尚未生成评估结果');
    }
    return evaluation;
  }

  async getConfusionMatrixPath(id: string) {
    const evaluation = (await this.getEvaluation(id)) as Record<string, unknown>;
    const imagePath = String(evaluation.confusionMatrixPath ?? '');
    const resolvedPath = isAbsolute(imagePath) ? imagePath : join(process.cwd(), imagePath);
    if (!imagePath || !existsSync(resolvedPath)) {
      throw new NotFoundException('混淆矩阵图片不存在');
    }
    return resolvedPath;
  }
}
