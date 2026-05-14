import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { CreateModelVersionDto } from './dto/create-model-version.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class ModelsService {
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
    return this.modelRepo.find({
      order: { createdAt: 'DESC' },
    });
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

    try {
      const { stdout, stderr } = await execFileAsync(
        this.resolvePythonBin(),
        [scriptPath, '--run-dir', runDir],
        {
          cwd: process.cwd(),
          env: process.env,
          maxBuffer: 1024 * 1024 * 16,
        },
      );
      if (stderr?.trim()) {
        // 保留 stderr 作为排查信息，评估脚本以退出码判断成败
        console.warn('[model-evaluate] python stderr:', stderr);
      }

      const evaluation = JSON.parse(stdout) as Record<string, unknown>;
      model.metrics = {
        ...(model.metrics ?? {}),
        evaluation,
      };
      await this.modelRepo.save(model);
      return evaluation;
    } catch (error) {
      throw new InternalServerErrorException(`模型评估失败: ${(error as Error).message}`);
    }
  }

  async getEvaluation(id: string) {
    const model = await this.findOrFail(id);
    const evaluationFromMetrics = model.metrics?.evaluation;
    if (evaluationFromMetrics) {
      return evaluationFromMetrics;
    }

    const evaluationPath = join(model.artifactUrl, 'evaluation.json');
    if (!existsSync(evaluationPath)) {
      throw new NotFoundException('该模型尚未生成评估结果');
    }

    const raw = await fs.readFile(evaluationPath, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
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
