import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateHerbClassDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  scientificName?: string;

  @IsOptional()
  @IsString()
  properties?: string;

  @IsOptional()
  @IsString()
  meridian?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  functions?: string[];

  @IsOptional()
  @IsString()
  usage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cautions?: string[];

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
