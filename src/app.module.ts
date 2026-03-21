import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { ModelVersionEntity } from './entities/model-version.entity';
import { TrainingJobEntity } from './entities/training-job.entity';
import { TrainingSampleEntity } from './entities/training-sample.entity';
import { HerbClassesModule } from './herb-classes/herb-classes.module';
import { ModelsModule } from './models/models.module';
import { SamplesModule } from './samples/samples.module';
import { TrainingModule } from './training/training.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', '127.0.0.1'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USER', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'herb_recognition'),
        entities: [TrainingSampleEntity, ModelVersionEntity, TrainingJobEntity],
        synchronize: config.get<string>('DB_SYNC', 'false') === 'true',
        charset: 'utf8mb4',
      }),
    }),
    ServeStaticModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const uploadDir = config.get<string>('UPLOAD_DIR', 'uploads');
        return [
          {
            rootPath: join(process.cwd(), uploadDir),
            serveRoot: '/files',
          },
        ];
      },
    }),
    SamplesModule,
    HerbClassesModule,
    ModelsModule,
    TrainingModule,
  ],
})
export class AppModule {}
