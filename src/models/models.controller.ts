import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { CreateModelVersionDto } from './dto/create-model-version.dto';
import { ModelsService } from './models.service';

@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Post()
  async create(@Body() body: CreateModelVersionDto) {
    return this.modelsService.create(body);
  }

  @Get()
  async list() {
    return this.modelsService.list();
  }

  @Patch(':id/activate')
  async activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.modelsService.activate(id);
  }

  @Post(':id/evaluate')
  async evaluate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.modelsService.evaluate(id);
  }

  @Get(':id/evaluation')
  async evaluation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.modelsService.getEvaluation(id);
  }

  @Get(':id/evaluation/confusion-matrix')
  async confusionMatrix(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() response: Response,
  ) {
    const imagePath = await this.modelsService.getConfusionMatrixPath(id);
    return response.sendFile(imagePath);
  }
}
