import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModelVersionEntity } from '../entities/model-version.entity';
import { HerbClassesModule } from '../herb-classes/herb-classes.module';
import { InferController } from './infer.controller';
import { InferService } from './infer.service';

@Module({
  imports: [HerbClassesModule, TypeOrmModule.forFeature([ModelVersionEntity])],
  controllers: [InferController],
  providers: [InferService],
})
export class InferModule {}
