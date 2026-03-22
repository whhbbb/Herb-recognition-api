import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CreateTrainingJobDto {
  @IsNumber()
  @Min(1)
  @Max(200)
  epochs = 10;

  @IsNumber()
  @Min(1)
  @Max(256)
  batchSize = 16;

  @IsNumber()
  @Min(0.05)
  @Max(0.5)
  validationSplit = 0.2;

  @IsOptional()
  @IsBoolean()
  autoActivate = false;
}
