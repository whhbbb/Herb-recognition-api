import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('model_versions')
export class ModelVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 64 })
  version!: string;

  @Column({ type: 'varchar', length: 32, default: 'tensorflowjs' })
  framework!: string;

  @Column({ type: 'varchar', length: 512 })
  artifactUrl!: string;

  @Column({ type: 'json', nullable: true })
  metrics!: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
