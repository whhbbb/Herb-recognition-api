import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { TrainingSampleEntity } from '../entities/training-sample.entity';
import { QuerySamplesDto } from './dto/query-samples.dto';
import { UploadSampleDto } from './dto/upload-sample.dto';

@Injectable()
export class SamplesService {
  constructor(
    @InjectRepository(TrainingSampleEntity)
    private readonly samplesRepo: Repository<TrainingSampleEntity>,
    private readonly config: ConfigService,
  ) {}

  async createFromUpload(file: Express.Multer.File, dto: UploadSampleDto) {
    const uploadDir = this.config.get<string>('UPLOAD_DIR', 'uploads');
    const baseUrl = this.config.get<string>('UPLOAD_BASE_URL', 'http://127.0.0.1:4000');
    const relativePath = file.path.replace(join(process.cwd(), uploadDir), '').replace(/\\/g, '/');
    const fileUrl = `${baseUrl}/files${relativePath}`;

    const herbId = dto.herbId?.trim() || dto.herbName.trim();
    const entity = this.samplesRepo.create({
      herbId,
      herbName: dto.herbName,
      fileUrl,
      storageKey: file.path,
      source: dto.source,
      split: dto.split,
    });
    return this.samplesRepo.save(entity);
  }

  async list(query: QuerySamplesDto) {
    const qb = this.samplesRepo.createQueryBuilder('sample');
    if (query.herbId) qb.andWhere('sample.herbId = :herbId', { herbId: query.herbId });
    if (query.source) qb.andWhere('sample.source = :source', { source: query.source });
    if (query.split) qb.andWhere('sample.split = :split', { split: query.split });

    qb.orderBy('sample.createdAt', 'DESC');
    qb.skip((query.page - 1) * query.pageSize).take(query.pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async remove(id: string) {
    const sample = await this.samplesRepo.findOne({ where: { id } });
    if (!sample) {
      throw new NotFoundException('样本不存在');
    }
    await this.samplesRepo.delete(id);
    await fs.unlink(sample.storageKey).catch(() => undefined);
    return { id };
  }

  async countAll() {
    return this.samplesRepo.count();
  }

  async listClasses() {
    const rows = await this.samplesRepo
      .createQueryBuilder('sample')
      .select('sample.herbId', 'herbId')
      .addSelect('sample.herbName', 'herbName')
      .addSelect('COUNT(sample.id)', 'count')
      .groupBy('sample.herbId')
      .addGroupBy('sample.herbName')
      .orderBy('COUNT(sample.id)', 'DESC')
      .getRawMany<{ herbId: string; herbName: string; count: string }>();

    return rows.map((row) => ({
      herbId: row.herbId,
      herbName: row.herbName,
      count: Number(row.count),
    }));
  }
}
