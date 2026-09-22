import { Controller, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { DriveSyncService, DriveSyncSummary } from './drive-sync.service';

@Controller('drive-sync')
export class DriveSyncController {
  constructor(private readonly driveSync: DriveSyncService) {}

  /**
   * Manually kicks off the same sync the nightly cron runs, useful for
   * testing the Drive setup without waiting until 2 AM.
   */
  @Roles(Role.ADMIN)
  @Post('run')
  run(): Promise<DriveSyncSummary> {
    return this.driveSync.runSync();
  }
}
