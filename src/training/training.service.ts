import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainingJobEntity } from '../entities/training-job.entity';
import { SamplesService } from '../samples/samples.service';
import { CreateTrainingJobDto } from './dto/create-training-job.dto';
import { UpdateTrainingStatusDto } from './dto/update-training-status.dto';

@Injectable()
export class TrainingService {
  constructor(
    @InjectRepository(TrainingJobEntity)
    private readonly trainingRepo: Repository<TrainingJobEntity>,
    private readonly samplesService: SamplesService,
  ) {}

  async createJob(dto: CreateTrainingJobDto) {
    const datasetSize = await this.samplesService.countAll();
    const job = this.trainingRepo.create({
      status: 'pending',
      datasetSize,
      epochs: dto.epochs,
      batchSize: dto.batchSize,
      validationSplit: dto.validationSplit,
      log: 'Job created by API',
      startedAt: null,
      finishedAt: null,
    });
    return this.trainingRepo.save(job);
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
}
