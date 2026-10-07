import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Cron('*/1 * * * *')
  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.fileCleanup.findMany({
        where: { nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: 100,
      });
      for (const job of jobs) {
        try {
          const [docs, images] = await Promise.all([
            this.prisma.patientDocument.count({
              where: { storageKey: job.key },
            }),
            this.prisma.treatment.count({
              where: {
                OR: [{ beforeImageKey: job.key }, { afterImageKey: job.key }],
              },
            }),
          ]);
          if (!docs && !images) await this.storage.remove(job.key);
          await this.prisma.fileCleanup.deleteMany({ where: { key: job.key } });
        } catch {
          await this.prisma.fileCleanup.updateMany({
            where: { key: job.key },
            data: {
              attempts: { increment: 1 },
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6)),
              ),
            },
          });
          this.logger.warn('File cleanup failed; retry scheduled');
        }
      }
    } catch {
      this.logger.error('Unable to process file cleanup queue');
    } finally {
      this.running = false;
    }
  }
}
