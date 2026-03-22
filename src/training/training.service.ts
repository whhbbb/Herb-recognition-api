import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { TrainingJobEntity } from '../entities/training-job.entity';
import { SamplesService } from '../samples/samples.service';
import { CreateTrainingJobDto } from './dto/create-training-job.dto';
import { UpdateTrainingStatusDto } from './dto/update-training-status.dto';

@Injectable()
export class TrainingService implements OnModuleInit {
  private readonly logger = new Logger(TrainingService.name);
  private workerRunning = false;

  constructor(
    @InjectRepository(TrainingJobEntity)
    private readonly trainingRepo: Repository<TrainingJobEntity>,
    @InjectRepository(ModelVersionEntity)
    private readonly modelRepo: Repository<ModelVersionEntity>,
    private readonly samplesService: SamplesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    // 服务启动后先清理遗留 running（上次进程中断导致），再继续处理 pending 任务
    void this.bootstrapWorker();
  }

  private async bootstrapWorker() {
    await this.recoverInterruptedRunningJobs();
    await this.kickWorker();
  }

  async createJob(dto: CreateTrainingJobDto) {
    const datasetSize = await this.samplesService.countAll();
    const job = this.trainingRepo.create({
      status: 'pending',
      datasetSize,
      epochs: dto.epochs,
      batchSize: dto.batchSize,
      validationSplit: dto.validationSplit,
      log: `Job created by API [auto_activate=${dto.autoActivate ? 'true' : 'false'}]`,
      startedAt: null,
      finishedAt: null,
    });
    const saved = await this.trainingRepo.save(job);
    void this.kickWorker();
    return saved;
  }

  async listJobs() {
    return this.trainingRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async updateStatus(id: string, dto: UpdateTrainingStatusDto) {
    const job = await this.trainingRepo.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('训练任务不存在');
    }

    job.status = dto.status;
    if (dto.log !== undefined) {
      job.log = dto.log;
    }
    if (dto.status === 'running' && !job.startedAt) {
      job.startedAt = new Date();
    }
    if (dto.status === 'succeeded' || dto.status === 'failed') {
      job.finishedAt = new Date();
    }
    return this.trainingRepo.save(job);
  }

  private resolvePythonBin() {
    const envPython = this.config.get<string>('PYTHON_BIN');
    if (envPython?.trim()) {
      return envPython.trim();
    }
    const venvPython = join(process.cwd(), '.venv', 'bin', 'python');
    return existsSync(venvPython) ? venvPython : 'python3';
  }

  private resolveTrainerScript() {
    return join(process.cwd(), 'training', 'train_from_db.py');
  }

  private async kickWorker() {
    if (this.workerRunning) {
      return;
    }

    this.workerRunning = true;
    try {
      while (true) {
        const nextJob = await this.trainingRepo.findOne({
          where: { status: 'pending' },
          order: { createdAt: 'ASC' },
        });
        if (!nextJob) {
          break;
        }
        await this.runOneJob(nextJob);
      }
    } finally {
      this.workerRunning = false;
    }
  }

  private async recoverInterruptedRunningJobs() {
    const runningJobs = await this.trainingRepo.find({
      where: { status: 'running' },
      order: { createdAt: 'ASC' },
    });

    if (!runningJobs.length) {
      return;
    }

    const now = new Date();
    for (const job of runningJobs) {
      const prevLog = job.log?.trim();
      job.status = 'failed';
      job.finishedAt = now;
      job.log = prevLog
        ? `${prevLog}\n\n[recovered_on_startup] 检测到服务重启，running 任务已判定中断并标记为 failed`
        : '[recovered_on_startup] 检测到服务重启，running 任务已判定中断并标记为 failed';
      await this.trainingRepo.save(job);
    }

    this.logger.warn(`Recovered ${runningJobs.length} interrupted running training job(s) on startup`);
  }

  private async runOneJob(job: TrainingJobEntity) {
    const autoActivate = this.extractAutoActivate(job.log);
    job.status = 'running';
    job.startedAt = new Date();
    job.finishedAt = null;
    job.log = 'Training started';
    await this.trainingRepo.save(job);

    const pythonBin = this.resolvePythonBin();
    const scriptPath = this.resolveTrainerScript();
    const outputDir = this.config.get<string>('TRAINING_OUTPUT_DIR') || 'training/runs';
    const args = [
      scriptPath,
      '--epochs',
      String(job.epochs),
      '--batch-size',
      String(job.batchSize),
      '--val-ratio',
      String(job.validationSplit),
      '--output-dir',
      outputDir,
    ];

    this.logger.log(`Start training job ${job.id}: ${pythonBin} ${args.join(' ')}`);

    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; log: string }>(
      (resolve) => {
        const child = spawn(pythonBin, args, {
          cwd: process.cwd(),
          env: process.env,
        });

        let logBuffer = '';
        const appendLog = (chunk: string) => {
          logBuffer += chunk;
          // 只保留最后 12000 字符，防止数据库日志字段过大
          if (logBuffer.length > 12000) {
            logBuffer = logBuffer.slice(-12000);
          }
        };

        child.stdout.on('data', (chunk: Buffer) => appendLog(chunk.toString('utf-8')));
        child.stderr.on('data', (chunk: Buffer) => appendLog(chunk.toString('utf-8')));
        child.on('error', (error) => {
          appendLog(`\n[spawn_error] ${error.message}\n`);
        });
        child.on('close', (code, signal) => {
          resolve({ code, signal, log: logBuffer.trim() });
        });
      },
    );

    const finalLog = result.log || 'No training logs';
    if (result.code === 0) {
      const model = await this.createModelVersionFromRun(job, finalLog, autoActivate);
      job.status = 'succeeded';
      job.finishedAt = new Date();
      job.log = model
        ? `${finalLog}\n\n[model_registered] id=${model.id} name=${model.name} version=${model.version} active=${String(model.isActive)} auto_activate=${String(autoActivate)}`
        : `${finalLog}\n\n[model_register_skipped] 未识别训练产物目录`;
    } else {
      job.status = 'failed';
      job.finishedAt = new Date();
      job.log = `[exit:${String(result.code)} signal:${String(result.signal)}]\n${finalLog}`;
    }
    await this.trainingRepo.save(job);
  }

  private extractRunDirFromLog(logText: string) {
    // train_from_db.py 输出格式：model:   <runDir>/model.pt
    const match = logText.match(/model:\s+([^\n\r]+model\.pt)/i);
    if (!match?.[1]) {
      return null;
    }
    const modelPath = match[1].trim();
    return modelPath.endsWith('/model.pt') ? modelPath.slice(0, -'/model.pt'.length) : null;
  }

  private extractAutoActivate(logText: string | null) {
    if (!logText) {
      return false;
    }
    return /\[auto_activate=true\]/i.test(logText);
  }

  private async createModelVersionFromRun(job: TrainingJobEntity, logText: string, autoActivate: boolean) {
    try {
      const runDir = this.extractRunDirFromLog(logText);
      if (!runDir) {
        return null;
      }

      const metricsPath = join(runDir, 'metrics.json');
      let metrics: Record<string, unknown> | null = null;
      if (existsSync(metricsPath)) {
        const raw = await fs.readFile(metricsPath, 'utf-8');
        metrics = JSON.parse(raw) as Record<string, unknown>;
      }

      const hasActive = await this.modelRepo.exist({ where: { isActive: true } });
      if (autoActivate) {
        await this.modelRepo.update({ isActive: true }, { isActive: false });
      }
      const runTag = runDir.split('/').pop() || `${Date.now()}`;
      const version = `run-${runTag}`;

      const model = this.modelRepo.create({
        name: `AutoModel-${runTag}`,
        version,
        framework: 'pytorch',
        artifactUrl: runDir,
        metrics,
        isActive: autoActivate || !hasActive,
      });

      return await this.modelRepo.save(model);
    } catch (error) {
      this.logger.error(`Failed to register model for job ${job.id}: ${(error as Error).message}`);
      return null;
    }
  }
}
