import { Module } from '@nestjs/common';
import { DriveSyncController } from './drive-sync.controller';
import { DriveSyncService } from './drive-sync.service';

@Module({
  controllers: [DriveSyncController],
  providers: [DriveSyncService],
  exports: [DriveSyncService],
})
export class DriveSyncModule {}
