import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
export class DriveSyncService {
  private readonly logger = new Logger(DriveSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly drive: GoogleDriveService,
  ) {}

  // Runs every night at 2:00 AM server time.
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
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
    this.logger.log('Starting nightly Google Drive sync...');
    const startedAt = Date.now();
    let documentsSynced = 0;
    let documentsFailed = 0;
    let treatmentImagesSynced = 0;
    let treatmentImagesFailed = 0;

    try {
      const rootFolderId = await this.drive.ensureFolder(
        this.drive.rootFolder,
        ROOT_FOLDER_NAME,
      );

      const pendingDocs = await this.prisma.patientDocument.findMany({
        where: { driveFileId: null },
        include: { patient: true },
        take: BATCH_LIMIT,
        orderBy: { uploadedAt: 'asc' },
      });
      for (const doc of pendingDocs) {
        try {
          const patientFolderId = await this.getPatientFolderId(
            doc.patient,
            rootFolderId,
          );
          const docsFolderId = await this.drive.ensureFolder(
            patientFolderId,
            DOCUMENTS_FOLDER_NAME,
          );
          const { stream } = await this.storage.open(doc.storageKey);
          const filename = `${doc.uploadedAt.toISOString().slice(0, 10)}_${doc.name}`;
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
          this.logger.error(
            `Failed to sync document ${doc.id} for patient ${doc.patientId}: ${(err as Error).message}`,
          );
        }
      }

      const pendingTreatments = await this.prisma.treatment.findMany({
        where: {
          OR: [
            { beforeImageKey: { not: null }, beforeImageDriveId: null },
            { afterImageKey: { not: null }, afterImageDriveId: null },
          ],
        },
        include: { patient: true },
        take: BATCH_LIMIT,
        orderBy: { createdAt: 'asc' },
      });
      for (const treatment of pendingTreatments) {
        try {
          const patientFolderId = await this.getPatientFolderId(
            treatment.patient,
            rootFolderId,
          );
          const treatmentsFolderId = await this.drive.ensureFolder(
            patientFolderId,
            TREATMENTS_FOLDER_NAME,
          );
          const treatmentFolderId = await this.drive.ensureFolder(
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
            await this.prisma.treatment.update({
              where: { id: treatment.id },
              data,
            });
          }
          treatmentImagesSynced += 1;
        } catch (err) {
          treatmentImagesFailed += 1;
          this.logger.error(
            `Failed to sync images for treatment ${treatment.id} (patient ${treatment.patientId}): ${(err as Error).message}`,
          );
        }
      }
    } finally {
      this.running = false;
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
    patient: Patient,
    rootFolderId: string,
  ): Promise<string> {
    if (patient.driveFolderId) {
      return patient.driveFolderId;
    }
    const folderName =
      `${patient.lastName}_${patient.firstName}_${patient.id}`.replace(
        /\s+/g,
        '',
      );
    const folderId = await this.drive.ensureFolder(rootFolderId, folderName);
    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { driveFolderId: folderId },
    });
    return folderId;
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
