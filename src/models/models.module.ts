import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModelVersionEntity])],
  controllers: [ModelsController],
  providers: [ModelsService],
})
export class ModelsModule {}
