import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { Repository } from 'typeorm';
import { TrainingSampleEntity } from '../entities/training-sample.entity';
import { SamplesService } from '../samples/samples.service';
import { UpdateHerbClassDto } from './dto/update-herb-class.dto';

type HerbMetaStore = Record<
  string,
  {
    name?: string;
    scientificName?: string;
    properties?: string;
    meridian?: string;
    functions?: string[];
    usage?: string;
    cautions?: string[];
    image?: string;
    description?: string;
    category?: string;
    updatedAt?: string;
  }
>;

@Injectable()
export class HerbClassesService {
  constructor(
    private readonly config: ConfigService,
    private readonly samplesService: SamplesService,
    @InjectRepository(TrainingSampleEntity)
    private readonly sampleRepo: Repository<TrainingSampleEntity>,
  ) {}

  private getMetaFilePath() {
    return this.config.get<string>('HERB_META_FILE', join(process.cwd(), 'data', 'herb-class-meta.json'));
  }

  private async readMetaStore(): Promise<HerbMetaStore> {
    const filePath = this.getMetaFilePath();
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as HerbMetaStore;
    } catch {
      return {};
    }
  }

  private async writeMetaStore(store: HerbMetaStore) {
    const filePath = this.getMetaFilePath();
    await fs.mkdir(dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  async list() {
    const [classes, metaStore, reps] = await Promise.all([
      this.samplesService.listClasses(),
      this.readMetaStore(),
      this.sampleRepo
        .createQueryBuilder('sample')
        .select('sample.herbId', 'herbId')
        .addSelect('sample.fileUrl', 'fileUrl')
        .addSelect('sample.createdAt', 'createdAt')
        .orderBy('sample.createdAt', 'DESC')
        .getRawMany<{ herbId: string; fileUrl: string; createdAt: string }>(),
    ]);

    const repImageMap = new Map<string, string>();
    for (const row of reps) {
      if (!repImageMap.has(row.herbId) && row.fileUrl) {
        repImageMap.set(row.herbId, row.fileUrl);
      }
    }

    return classes.map((item) => {
      const meta = metaStore[item.herbId] ?? {};
      return {
        id: item.herbId,
        herbName: item.herbName,
        herbId: item.herbId,
        count: item.count,
        name: meta.name ?? item.herbName,
        scientificName: meta.scientificName ?? item.herbName,
        properties: meta.properties ?? '',
        meridian: meta.meridian ?? '',
        functions: meta.functions ?? [],
        usage: meta.usage ?? '',
        cautions: meta.cautions ?? [],
        image: repImageMap.get(item.herbId) || meta.image?.trim() || '',
        description: meta.description ?? '',
        category: meta.category ?? '未分类',
        updatedAt: meta.updatedAt ?? null,
      };
    });
  }

  async getOne(herbId: string) {
    const list = await this.list();
    return list.find((item) => item.herbId === herbId) ?? null;
  }

  async upsert(herbId: string, dto: UpdateHerbClassDto) {
    const store = await this.readMetaStore();
    store[herbId] = {
      ...(store[herbId] ?? {}),
      ...dto,
      updatedAt: new Date().toISOString(),
    };
    await this.writeMetaStore(store);
    return {
      herbId,
      ...store[herbId],
    };
  }

  async bulkUpsert(items: Array<{ herbId: string; data: UpdateHerbClassDto }>) {
    const store = await this.readMetaStore();
    for (const item of items) {
      const herbId = item.herbId.trim();
      if (!herbId) continue;
      store[herbId] = {
        ...(store[herbId] ?? {}),
        ...item.data,
        updatedAt: new Date().toISOString(),
      };
    }
    await this.writeMetaStore(store);
    return { updated: items.length };
  }
}
