import { Module } from '@nestjs/common';
import { SamplesModule } from '../samples/samples.module';
import { HerbClassesController } from './herb-classes.controller';
import { HerbClassesService } from './herb-classes.service';

@Module({
  imports: [SamplesModule],
  controllers: [HerbClassesController],
  providers: [HerbClassesService],
})
export class HerbClassesModule {}
