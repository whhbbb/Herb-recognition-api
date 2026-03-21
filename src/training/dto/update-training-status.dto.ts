import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTrainingStatusDto {
  @IsIn(['pending', 'running', 'succeeded', 'failed'])
  status!: 'pending' | 'running' | 'succeeded' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  log?: string;
}
