import { IsBoolean, IsObject, IsOptional, IsString, Length } from 'class-validator';

export class CreateModelVersionDto {
  @IsString()
  @Length(1, 128)
  name!: string;

  @IsString()
  @Length(1, 64)
  version!: string;

  @IsString()
  @Length(1, 32)
  framework = 'tensorflowjs';

  @IsString()
  @Length(1, 512)
  artifactUrl!: string;

  @IsOptional()
  @IsObject()
  metrics?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive = false;
}
