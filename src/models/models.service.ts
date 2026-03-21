import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { CreateModelVersionDto } from './dto/create-model-version.dto';

@Injectable()
export class ModelsService {
  constructor(
    @InjectRepository(ModelVersionEntity)
    private readonly modelRepo: Repository<ModelVersionEntity>,
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
}
