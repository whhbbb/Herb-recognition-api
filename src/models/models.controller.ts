import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
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
}
