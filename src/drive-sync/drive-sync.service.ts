import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { Patient, Treatment } from '@prisma/client';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

const ROOT_FOLDER_NAME = 'Patients';
const DOCUMENTS_FOLDER_NAME = 'Documents';
const TREATMENTS_FOLDER_NAME = 'Treatments';
// Cap how many items we push per run so a huge backlog (e.g. first ever
// run) doesn't monopolise the event loop or hit Drive rate limits.
const BATCH_LIMIT = 200;

export interface DriveSyncSummary {
  enabled: boolean;
  documentsSynced: number;
  documentsFailed: number;
  treatmentImagesSynced: number;
  treatmentImagesFailed: number;
}

@Injectable()
export class DriveSyncService implements OnModuleInit {
  private readonly logger = new Logger(DriveSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly drive: GoogleDriveService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    // Read the zone after ConfigModule has loaded .env, not at import time.
    const job = CronJob.from({
      cronTime: '0 0 2 * * *',
      timeZone: process.env.CLINIC_TIMEZONE || 'Asia/Kolkata',
      onTick: () => this.handleNightlySync(),
      errorHandler: () => this.logger.error('Nightly Google Drive sync failed'),
    });
    this.scheduler.addCronJob('drive-sync', job);
    job.start();
  }

  async handleNightlySync(): Promise<void> {
    await this.runSync();
  }

  /** Can be called manually (e.g. from an admin endpoint) to sync on demand. */
  async runSync(): Promise<DriveSyncSummary> {
    if (!this.drive.isEnabled) {
      this.logger.warn('Skipping Drive sync: Google Drive is not configured.');
      return {
        enabled: false,
        documentsSynced: 0,
        documentsFailed: 0,
        treatmentImagesSynced: 0,
        treatmentImagesFailed: 0,
      };
    }
    if (this.running) {
      this.logger.warn('Drive sync already in progress, skipping this run.');
      return {
        enabled: true,
        documentsSynced: 0,
        documentsFailed: 0,
        treatmentImagesSynced: 0,
        treatmentImagesFailed: 0,
      };
    }

    this.running = true;
    const owner = randomUUID();
    const folders = new Map<string, Promise<string>>();
    const ensureFolder = (parent: string, name: string) => {
      const key = JSON.stringify([parent, name]);
      if (!folders.has(key))
        folders.set(
          key,
          this.drive.ensureFolder(parent, name).catch((error) => {
            folders.delete(key);
            throw error;
          }),
        );
      return folders.get(key)!;
    };
    this.logger.log('Starting nightly Google Drive sync...');
    const startedAt = Date.now();
    let documentsSynced = 0;
    let documentsFailed = 0;
    let treatmentImagesSynced = 0;
    let treatmentImagesFailed = 0;

    try {
      await this.prisma.jobLease.createMany({
        data: [{ name: 'drive-sync', owner: '', expiresAt: new Date(0) }],
        skipDuplicates: true,
      });
      const claimed = await this.prisma.jobLease.updateMany({
        where: { name: 'drive-sync', expiresAt: { lt: new Date() } },
        data: { owner, expiresAt: new Date(Date.now() + 15 * 60_000) },
      });
      if (!claimed.count)
        return {
          enabled: true,
          documentsSynced: 0,
          documentsFailed: 0,
          treatmentImagesSynced: 0,
          treatmentImagesFailed: 0,
        };
      const heartbeat = async () => {
        const held = await this.prisma.jobLease.updateMany({
          where: { name: 'drive-sync', owner },
          data: { expiresAt: new Date(Date.now() + 15 * 60_000) },
        });
        if (!held.count) throw new Error('Drive sync lease was lost');
      };
      const rootFolderId = await ensureFolder(
        this.drive.rootFolder,
        ROOT_FOLDER_NAME,
      );

      const pendingDocs = await this.prisma.patientDocument.findMany({
        where: { driveFileId: null, syncAfter: { lte: new Date() } },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              driveFolderId: true,
            },
          },
        },
        take: BATCH_LIMIT,
        orderBy: [{ syncAfter: 'asc' }, { id: 'asc' }],
      });
      for (const doc of pendingDocs) {
        await heartbeat();
        try {
          const patientFolderId = await this.getPatientFolderId(
            doc.patient,
            rootFolderId,
            ensureFolder,
          );
          const docsFolderId = await ensureFolder(
            patientFolderId,
            DOCUMENTS_FOLDER_NAME,
          );
          const { stream } = await this.storage.open(doc.storageKey);
          const filename = `${doc.id}_${doc.name}`;
          const fileId = await this.drive.uploadFile({
            parentFolderId: docsFolderId,
            filename,
            mimeType: doc.contentType,
            body: stream,
          });
          await this.prisma.patientDocument.update({
            where: { id: doc.id },
            data: { driveFileId: fileId, driveSyncedAt: new Date() },
          });
          documentsSynced += 1;
        } catch (err) {
          documentsFailed += 1;
          await this.prisma.patientDocument.updateMany({
            where: { id: doc.id },
            data: {
              syncAttempts: { increment: 1 },
              syncAfter: this.retryAt(doc.syncAttempts),
            },
          });
          this.logger.error(
            `Failed to sync document ${doc.id} for patient ${doc.patientId}: ${(err as Error).message}`,
          );
        }
      }

      const pendingTreatments = await this.prisma.treatment.findMany({
        where: {
          syncAfter: { lte: new Date() },
          OR: [
            { beforeImageKey: { not: null }, beforeImageDriveId: null },
            { afterImageKey: { not: null }, afterImageDriveId: null },
          ],
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              driveFolderId: true,
            },
          },
        },
        take: BATCH_LIMIT,
        orderBy: [{ syncAfter: 'asc' }, { id: 'asc' }],
      });
      for (const treatment of pendingTreatments) {
        await heartbeat();
        try {
          const patientFolderId = await this.getPatientFolderId(
            treatment.patient,
            rootFolderId,
            ensureFolder,
          );
          const treatmentsFolderId = await ensureFolder(
            patientFolderId,
            TREATMENTS_FOLDER_NAME,
          );
          const treatmentFolderId = await ensureFolder(
            treatmentsFolderId,
            `${treatment.date}_${treatment.id}`,
          );

          const data: Partial<Treatment> = {};
          if (treatment.beforeImageKey && !treatment.beforeImageDriveId) {
            const fileId = await this.uploadImage(
              treatmentFolderId,
              'before',
              treatment.beforeImageKey,
              treatment.beforeImageType,
            );
            data.beforeImageDriveId = fileId;
          }
          if (treatment.afterImageKey && !treatment.afterImageDriveId) {
            const fileId = await this.uploadImage(
              treatmentFolderId,
              'after',
              treatment.afterImageKey,
              treatment.afterImageType,
            );
            data.afterImageDriveId = fileId;
          }
          if (Object.keys(data).length > 0) {
            data.imagesDriveSyncedAt = new Date();
            const saved = await this.prisma.treatment.updateMany({
              where: {
                id: treatment.id,
                beforeImageKey: treatment.beforeImageKey,
                afterImageKey: treatment.afterImageKey,
              },
              data: {
                beforeImageDriveId: data.beforeImageDriveId,
                afterImageDriveId: data.afterImageDriveId,
                imagesDriveSyncedAt: data.imagesDriveSyncedAt,
              },
            });
            treatmentImagesSynced += saved.count;
          }
        } catch (err) {
          treatmentImagesFailed += 1;
          await this.prisma.treatment.updateMany({
            where: {
              id: treatment.id,
              beforeImageKey: treatment.beforeImageKey,
              afterImageKey: treatment.afterImageKey,
            },
            data: {
              syncAttempts: { increment: 1 },
              syncAfter: this.retryAt(treatment.syncAttempts),
            },
          });
          this.logger.error(
            `Failed to sync images for treatment ${treatment.id} (patient ${treatment.patientId}): ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
      await this.prisma.jobLease.deleteMany({
        where: { name: 'drive-sync', owner },
      });
    }

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
    this.logger.log(
      `Drive sync finished in ${elapsedSec}s. Documents: ${documentsSynced} synced / ${documentsFailed} failed. ` +
        `Treatment images: ${treatmentImagesSynced} treatments synced / ${treatmentImagesFailed} failed.`,
    );

    return {
      enabled: true,
      documentsSynced,
      documentsFailed,
      treatmentImagesSynced,
      treatmentImagesFailed,
    };
  }

  /** Returns the cached Drive folder id for a patient, creating + caching it if needed. */
  private async getPatientFolderId(
    patient: Pick<Patient, 'id' | 'firstName' | 'lastName' | 'driveFolderId'>,
    rootFolderId: string,
    ensureFolder: (parent: string, name: string) => Promise<string>,
  ): Promise<string> {
    if (patient.driveFolderId) {
      return patient.driveFolderId;
    }
    const folderName =
      `${patient.lastName}_${patient.firstName}_${patient.id}`.replace(
        /\s+/g,
        '',
      );
    const folderId = await ensureFolder(rootFolderId, folderName);
    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { driveFolderId: folderId },
    });
    return folderId;
  }

  private retryAt(attempts: number): Date {
    return new Date(
      Date.now() +
        Math.min(7 * 86400_000, 15 * 60_000 * 2 ** Math.min(attempts, 10)),
    );
  }

  private async uploadImage(
    parentFolderId: string,
    label: 'before' | 'after',
    storageKey: string,
    contentType: string | null,
  ): Promise<string> {
    const { stream, contentType: detectedType } =
      await this.storage.open(storageKey);
    const mimeType = contentType || detectedType || 'application/octet-stream';
    const ext = extensionForMime(mimeType);
    return this.drive.uploadFile({
      parentFolderId,
      filename: `${label}${ext}`,
      mimeType,
      body: stream,
    });
  }
}

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/gif':
      return '.gif';
    case 'application/pdf':
      return '.pdf';
    case 'image/jpeg':
    default:
      return '.jpg';
  }
}
