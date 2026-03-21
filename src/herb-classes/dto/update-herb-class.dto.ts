import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateHerbClassDto {
  @IsOptional()
  @IsString()
  herbNameZh?: string;

  @IsOptional()
  @IsString()
  pinyin?: string;

  @IsOptional()
  @IsString()
  latinName?: string;

  @IsOptional()
  @IsString()
  properties?: string;

  @IsOptional()
  @IsString()
  meridian?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  effects?: string[];

  @IsOptional()
  @IsString()
  usage?: string;

  @IsOptional()
  @IsString()
  cautions?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
