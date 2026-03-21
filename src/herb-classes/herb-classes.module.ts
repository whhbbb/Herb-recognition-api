import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrainingSampleEntity } from '../entities/training-sample.entity';
import { SamplesModule } from '../samples/samples.module';
import { HerbClassesController } from './herb-classes.controller';
import { HerbClassesService } from './herb-classes.service';

@Module({
  imports: [SamplesModule, TypeOrmModule.forFeature([TrainingSampleEntity])],
  controllers: [HerbClassesController],
  providers: [HerbClassesService],
  exports: [HerbClassesService],
})
export class HerbClassesModule {}
