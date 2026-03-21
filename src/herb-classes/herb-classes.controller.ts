import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { UpdateHerbClassDto } from './dto/update-herb-class.dto';
import { HerbClassesService } from './herb-classes.service';

@Controller('herb-classes')
export class HerbClassesController {
  constructor(private readonly herbClassesService: HerbClassesService) {}

  @Get()
  async list() {
    return this.herbClassesService.list();
  }

  @Put(':herbId')
  async upsert(@Param('herbId') herbId: string, @Body() body: UpdateHerbClassDto) {
    return this.herbClassesService.upsert(herbId, body);
  }

  @Post('bulk')
  async bulk(
    @Body()
    body: Array<{
      herbId: string;
      data: UpdateHerbClassDto;
    }>,
  ) {
    return this.herbClassesService.bulkUpsert(body);
  }
}
