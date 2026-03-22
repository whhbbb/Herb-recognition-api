import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { TrainingJobEntity } from '../entities/training-job.entity';
import { SamplesModule } from '../samples/samples.module';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrainingJobEntity, ModelVersionEntity]), SamplesModule],
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
