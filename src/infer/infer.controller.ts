import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { InferService } from './infer.service';

@Controller('infer')
export class InferController {
  constructor(private readonly inferService: InferService) {}

  @Get('health')
  async health() {
    return this.inferService.health();
  }

  @Post('predict')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = join(process.cwd(), 'uploads', 'infer-temp');
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const suffix = extname(file.originalname).toLowerCase() || '.jpg';
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
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async predict(
    @UploadedFile() file: Express.Multer.File,
    @Query('topK', new DefaultValuePipe(5), ParseIntPipe) topK: number,
  ) {
    return this.inferService.predict(file.path, topK);
  }
}

