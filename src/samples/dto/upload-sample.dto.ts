import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UploadSampleDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  herbId?: string;

  @IsString()
  @Length(1, 128)
  herbName!: string;

  @IsOptional()
  @IsIn(['manual', 'dataset'])
  source: 'manual' | 'dataset' = 'manual';

  @IsOptional()
  @IsIn(['train', 'val', 'test'])
  split: 'train' | 'val' | 'test' = 'train';
}
