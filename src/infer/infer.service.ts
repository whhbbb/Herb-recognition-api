import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Repository } from 'typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { HerbClassesService } from '../herb-classes/herb-classes.service';

const execFileAsync = promisify(execFile);

type PythonPrediction = {
  herbId: string;
  confidence: number;
};

type PythonResult = {
  runDir: string;
  predictions: PythonPrediction[];
};

type RejectionDecision = {
  isRejected: boolean;
  rejectionReason: string | null;
  topConfidence: number;
  topMargin: number | null;
  confidenceThreshold: number;
  marginThreshold: number;
};

@Injectable()
export class InferService {
  constructor(
    private readonly config: ConfigService,
    private readonly herbClassesService: HerbClassesService,
    @InjectRepository(ModelVersionEntity)
    private readonly modelRepo: Repository<ModelVersionEntity>,
  ) {}

  private resolvePythonBin() {
    const envPython = this.config.get<string>('PYTHON_BIN');
    if (envPython) return envPython;
    const venvPython = join(process.cwd(), '.venv', 'bin', 'python');
    return existsSync(venvPython) ? venvPython : 'python3';
  }

  private resolvePredictScriptPath() {
    return join(process.cwd(), 'training', 'predict_from_model.py');
  }

  private getNumberConfig(key: string, defaultValue: number) {
    const raw = this.config.get<string>(key);
    if (!raw?.trim()) {
      return defaultValue;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : defaultValue;
  }

  private decideRejection(predictions: PythonPrediction[]): RejectionDecision {
    const confidenceThreshold = this.getNumberConfig('INFER_CONFIDENCE_THRESHOLD', 0.85);
    const marginThreshold = this.getNumberConfig('INFER_MARGIN_THRESHOLD', 0.15);
    const topConfidence = predictions[0]?.confidence ?? 0;
    const secondConfidence = predictions[1]?.confidence;
    const topMargin = typeof secondConfidence === 'number' ? topConfidence - secondConfidence : null;

    if (!predictions.length) {
      return {
        isRejected: true,
        rejectionReason: '模型未返回候选类别',
        topConfidence,
        topMargin,
        confidenceThreshold,
        marginThreshold,
      };
    }

    if (topConfidence < confidenceThreshold) {
      return {
        isRejected: true,
        rejectionReason: `最高置信度低于阈值 ${confidenceThreshold}`,
        topConfidence,
        topMargin,
        confidenceThreshold,
        marginThreshold,
      };
    }

    if (topMargin !== null && topMargin < marginThreshold) {
      return {
        isRejected: true,
        rejectionReason: `Top-1 与 Top-2 置信度差值低于阈值 ${marginThreshold}`,
        topConfidence,
        topMargin,
        confidenceThreshold,
        marginThreshold,
      };
    }

    return {
      isRejected: false,
      rejectionReason: null,
      topConfidence,
      topMargin,
      confidenceThreshold,
      marginThreshold,
    };
  }

  private async resolveActiveRunDir() {
    const active = await this.modelRepo.findOne({
      where: { isActive: true },
      order: { updatedAt: 'DESC' },
    });
    if (!active?.artifactUrl?.trim()) {
      return null;
    }
    const runDir = active.artifactUrl.trim();
    const modelPath = join(runDir, 'model.pt');
    const labelsPath = join(runDir, 'labels.json');
    if (!existsSync(modelPath) || !existsSync(labelsPath)) {
      return null;
    }
    return runDir;
  }

  async health() {
    const scriptPath = this.resolvePredictScriptPath();
    const activeModel = await this.modelRepo.findOne({
      where: { isActive: true },
      order: { updatedAt: 'DESC' },
    });
    return {
      ok: true,
      pythonBin: this.resolvePythonBin(),
      predictScriptExists: existsSync(scriptPath),
      activeModel: activeModel
        ? {
            id: activeModel.id,
            name: activeModel.name,
            version: activeModel.version,
            artifactUrl: activeModel.artifactUrl,
          }
        : null,
    };
  }

  async predict(imagePath: string, topK = 5) {
    const scriptPath = this.resolvePredictScriptPath();
    if (!existsSync(scriptPath)) {
      throw new InternalServerErrorException('推理脚本不存在: training/predict_from_model.py');
    }

    try {
      const pythonBin = this.resolvePythonBin();
      const activeRunDir = await this.resolveActiveRunDir();
      const scriptArgs = [scriptPath, '--image', imagePath, '--topk', String(topK)];
      if (activeRunDir) {
        scriptArgs.push('--run-dir', activeRunDir);
      }
      const { stdout, stderr } = await execFileAsync(
        pythonBin,
        scriptArgs,
        { maxBuffer: 1024 * 1024 * 4 },
      );
      if (stderr?.trim()) {
        // 保留 stderr 方便排查，不作为失败条件
        console.warn('[infer] python stderr:', stderr);
      }

      const parsed = JSON.parse(stdout) as PythonResult;
      const classes = await this.herbClassesService.list();
      const classMap = new Map(classes.map((item) => [item.herbId, item]));

      const predictions = parsed.predictions.map((item) => {
        const herb = classMap.get(item.herbId) ?? null;
        return {
          herbId: item.herbId,
          confidence: item.confidence,
          herbName: herb?.name || herb?.herbName || item.herbId,
          herb,
        };
      });
      const rejection = this.decideRejection(parsed.predictions);

      return {
        runDir: parsed.runDir,
        predictions,
        topPrediction: rejection.isRejected ? null : predictions[0] ?? null,
        rejectedPrediction: rejection.isRejected ? predictions[0] ?? null : null,
        rejection,
      };
    } catch (error) {
      throw new InternalServerErrorException(`推理失败: ${(error as Error).message}`);
    } finally {
      await fs.unlink(imagePath).catch(() => undefined);
    }
  }
}
