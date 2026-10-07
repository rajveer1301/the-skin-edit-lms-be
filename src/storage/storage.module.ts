import { CleanupService } from './cleanup.service';
import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, CleanupService],
  exports: [StorageService],
})
export class StorageModule {}
