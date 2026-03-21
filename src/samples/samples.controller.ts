import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { QuerySamplesDto } from './dto/query-samples.dto';
import { UploadSampleDto } from './dto/upload-sample.dto';
import { SamplesService } from './samples.service';

@Controller('samples')
export class SamplesController {
  constructor(
    private readonly samplesService: SamplesService,
    private readonly config: ConfigService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
          const dir = join(process.cwd(), uploadDir, 'samples');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const suffix = extname(file.originalname).toLowerCase();
          cb(null, `${Date.now()}-${randomUUID()}${suffix}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
          cb(new Error('仅支持图片文件'), false);
          return;
        }
        cb(null, true);
      },
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File, @Body() body: UploadSampleDto) {
    return this.samplesService.createFromUpload(file, body);
  }

  @Get()
  async list(@Query() query: QuerySamplesDto) {
    return this.samplesService.list(query);
  }

  @Delete(':id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.samplesService.remove(id);
  }

  @Get('meta/count')
  async count() {
    const total = await this.samplesService.countAll();
    const uploadDir = this.config.get<string>('UPLOAD_DIR', 'uploads');
    return { total, uploadDir };
  }

  @Get('classes')
  async classes() {
    return this.samplesService.listClasses();
  }
}
