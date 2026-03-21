import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QuerySamplesDto {
  @IsOptional()
  @IsString()
  herbId?: string;

  @IsOptional()
  @IsIn(['manual', 'dataset'])
  source?: 'manual' | 'dataset';

  @IsOptional()
  @IsIn(['train', 'val', 'test'])
  split?: 'train' | 'val' | 'test';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
