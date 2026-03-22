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

      return {
        runDir: parsed.runDir,
        predictions,
        topPrediction: predictions[0] ?? null,
      };
    } catch (error) {
      throw new InternalServerErrorException(`推理失败: ${(error as Error).message}`);
    } finally {
      await fs.unlink(imagePath).catch(() => undefined);
    }
  }
}
