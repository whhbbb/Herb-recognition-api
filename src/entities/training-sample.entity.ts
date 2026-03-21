import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('training_samples')
export class TrainingSampleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  herbId!: string;

  @Column({ type: 'varchar', length: 128 })
  herbName!: string;

  @Column({ type: 'varchar', length: 512 })
  fileUrl!: string;

  @Column({ type: 'varchar', length: 512 })
  storageKey!: string;

  @Column({ type: 'varchar', length: 32, default: 'manual' })
  source!: 'manual' | 'dataset';

  @Column({ type: 'varchar', length: 16, default: 'train' })
  split!: 'train' | 'val' | 'test';

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}
