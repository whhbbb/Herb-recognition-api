import { Module } from '@nestjs/common';
import { HerbClassesModule } from '../herb-classes/herb-classes.module';
import { InferController } from './infer.controller';
import { InferService } from './infer.service';

@Module({
  imports: [HerbClassesModule],
  controllers: [InferController],
  providers: [InferService],
})
export class InferModule {}

