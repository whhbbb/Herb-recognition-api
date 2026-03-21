import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { SamplesService } from '../samples/samples.service';
import { UpdateHerbClassDto } from './dto/update-herb-class.dto';

type HerbMetaStore = Record<
  string,
  {
    herbNameZh?: string;
    pinyin?: string;
    latinName?: string;
    properties?: string;
    meridian?: string;
    effects?: string[];
    usage?: string;
    cautions?: string;
    description?: string;
    updatedAt?: string;
  }
>;

@Injectable()
export class HerbClassesService {
  constructor(
    private readonly config: ConfigService,
    private readonly samplesService: SamplesService,
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
    const [classes, metaStore] = await Promise.all([
      this.samplesService.listClasses(),
      this.readMetaStore(),
    ]);

    return classes.map((item) => {
      const meta = metaStore[item.herbId] ?? {};
      return {
        herbId: item.herbId,
        herbName: item.herbName,
        count: item.count,
        ...meta,
      };
    });
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
