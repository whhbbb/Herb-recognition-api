import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CreateTrainingJobDto } from './dto/create-training-job.dto';
import { UpdateTrainingStatusDto } from './dto/update-training-status.dto';
import { TrainingService } from './training.service';

@Controller('training/jobs')
export class TrainingController {
  constructor(private readonly trainingService: TrainingService) {}

  @Post()
  async create(@Body() body: CreateTrainingJobDto) {
    return this.trainingService.createJob(body);
  }

  @Get()
  async list() {
    return this.trainingService.listJobs();
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTrainingStatusDto,
  ) {
    return this.trainingService.updateStatus(id, body);
  }
}
