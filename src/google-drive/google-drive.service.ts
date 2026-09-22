import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export interface DriveUploadInput {
  parentFolderId: string;
  filename: string;
  mimeType: string;
  body: Readable | Buffer;
}

/**
 * Thin wrapper around the Google Drive API v3, authenticated as a
 * Service Account. The service account must have been granted "Editor"
 * access (or be added as a member) on the root Drive folder configured
 * via GOOGLE_DRIVE_ROOT_FOLDER_ID. Service accounts have no Drive
 * storage quota, so that folder must live in a Shared drive where the
 * service account is a Content manager. All Drive calls set
 * supportsAllDrives so those shared-drive files are visible.
 */
@Injectable()
export class GoogleDriveService implements OnModuleInit {
  private readonly logger = new Logger(GoogleDriveService.name);
  private drive?: drive_v3.Drive;
  private rootFolderId?: string;
  private enabled = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const rootFolderId = this.config
      .get<string>('GOOGLE_DRIVE_ROOT_FOLDER_ID')
      ?.trim();
    const inlineKey = this.config
      .get<string>('GOOGLE_SERVICE_ACCOUNT_KEY')
      ?.trim();
    const keyFile = this.config
      .get<string>('GOOGLE_SERVICE_ACCOUNT_KEY_FILE')
      ?.trim();

    if (!rootFolderId || (!inlineKey && !keyFile)) {
      this.logger.warn(
        'Google Drive sync disabled: set GOOGLE_SERVICE_ACCOUNT_KEY (or GOOGLE_SERVICE_ACCOUNT_KEY_FILE) and GOOGLE_DRIVE_ROOT_FOLDER_ID to enable nightly Drive sync.',
      );
      return;
    }

    try {
      const credentials = inlineKey ? JSON.parse(inlineKey) : undefined;
      const auth = new google.auth.GoogleAuth({
        credentials,
        keyFile: !credentials ? keyFile : undefined,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      this.drive = google.drive({ version: 'v3', auth });
      this.rootFolderId = rootFolderId;
      this.enabled = true;
      this.logger.log('Google Drive sync enabled.');
    } catch (err) {
      this.logger.error(
        `Failed to initialise Google Drive client: ${(err as Error).message}`,
      );
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  get rootFolder(): string {
    if (!this.rootFolderId) {
      throw new Error('Google Drive is not configured');
    }
    return this.rootFolderId;
  }

  /**
   * Returns the folder id for `name` under `parentId`, creating it if it
   * doesn't already exist. Folder lookups are scoped to non-trashed items.
   */
  async ensureFolder(parentId: string, name: string): Promise<string> {
    const drive = this.requireDrive();
    const safeName = name.replace(/'/g, "\\'");
    const existing = await drive.files.list({
      q: `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const found = existing.data.files?.[0];
    if (found?.id) {
      return found.id;
    }
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });
    if (!created.data.id) {
      throw new Error(`Failed to create Drive folder "${name}"`);
    }
    return created.data.id;
  }

  /**
   * Uploads a file into `parentFolderId`. If a file with the same name
   * already exists in that folder, its content is updated in place
   * instead of creating a duplicate.
   */
  async uploadFile(input: DriveUploadInput): Promise<string> {
    const drive = this.requireDrive();
    const safeName = input.filename.replace(/'/g, "\\'");
    const existing = await drive.files.list({
      q: `'${input.parentFolderId}' in parents and name = '${safeName}' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const existingId = existing.data.files?.[0]?.id;

    if (existingId) {
      await drive.files.update({
        fileId: existingId,
        media: { mimeType: input.mimeType, body: input.body },
        supportsAllDrives: true,
      });
      return existingId;
    }

    const created = await drive.files.create({
      requestBody: { name: input.filename, parents: [input.parentFolderId] },
      media: { mimeType: input.mimeType, body: input.body },
      fields: 'id',
      supportsAllDrives: true,
    });
    if (!created.data.id) {
      throw new Error(`Failed to upload "${input.filename}" to Drive`);
    }
    return created.data.id;
  }

  private requireDrive(): drive_v3.Drive {
    if (!this.drive) {
      throw new Error('Google Drive is not configured');
    }
    return this.drive;
  }
}
