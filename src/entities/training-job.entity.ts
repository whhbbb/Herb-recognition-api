import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('training_jobs')
export class TrainingJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 24, default: 'pending' })
  status!: 'pending' | 'running' | 'succeeded' | 'failed';

  @Column({ type: 'int' })
  datasetSize!: number;

  @Column({ type: 'int' })
  epochs!: number;

  @Column({ type: 'int' })
  batchSize!: number;

  @Column({ type: 'float', default: 0.2 })
  validationSplit!: number;

  @Column({ type: 'text', nullable: true })
  log!: string | null;

  @Column({ type: 'datetime', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
