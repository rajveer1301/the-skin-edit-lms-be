import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, normalize, resolve } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

export interface StoredFile {
  key: string;
  contentType: string;
  size: number;
}

export interface FileUploadInput {
  buffer: Buffer;
  contentType: string;
  folder: string;
  filename: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: 'r2' | 'local';
  private readonly bucket?: string;
  private readonly localRoot: string;
  private readonly publicApiBase: string;
  private readonly s3?: S3Client;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID')?.trim();
    const accessKey = this.config.get<string>('R2_ACCESS_KEY_ID')?.trim();
    const secret = this.config.get<string>('R2_SECRET_ACCESS_KEY')?.trim();
    this.bucket = this.config.get<string>('R2_BUCKET')?.trim();
    this.localRoot = resolve(this.config.get<string>('LOCAL_STORAGE_DIR') || 'storage');
    this.publicApiBase = (
      this.config.get<string>('PUBLIC_API_URL') || 'http://localhost:3000/api'
    ).replace(/\/$/, '');

    if (accountId && accessKey && secret && this.bucket) {
      this.driver = 'r2';
      this.s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKey, secretAccessKey: secret },
      });
      this.logger.log(`File storage: Cloudflare R2 bucket ${this.bucket}`);
    } else {
      this.driver = 'local';
      mkdirSync(this.localRoot, { recursive: true });
      this.logger.warn(
        'File storage: local ./storage (set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET for Cloudflare R2)',
      );
    }
  }

  get driverName(): 'r2' | 'local' {
    return this.driver;
  }

  async upload(input: FileUploadInput): Promise<StoredFile> {
    const key = this.buildKey(input.folder, input.filename);
    if (this.driver === 'r2' && this.s3 && this.bucket) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: input.buffer,
          ContentType: input.contentType,
        }),
      );
    } else {
      const path = this.localPath(key);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, input.buffer);
    }
    return { key, contentType: input.contentType, size: input.buffer.length };
  }

  async signUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!key) return '';
    if (this.driver === 'r2' && this.s3 && this.bucket) {
      return getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn },
      );
    }
    return `${this.publicApiBase}/files?key=${encodeURIComponent(key)}`;
  }

  async open(key: string): Promise<{ stream: Readable; contentType?: string }> {
    if (this.driver === 'r2' && this.s3 && this.bucket) {
      const result = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        stream: result.Body as Readable,
        contentType: result.ContentType,
      };
    }
    const path = this.localPath(key);
    if (!existsSync(path)) {
      throw new Error('File not found');
    }
    return { stream: createReadStream(path), contentType: mimeFromKey(key) };
  }

  async remove(key?: string | null): Promise<void> {
    if (!key) return;
    if (this.driver === 'r2' && this.s3 && this.bucket) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return;
    }
    const path = this.localPath(key);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }

  private buildKey(folder: string, filename: string): string {
    const safeFolder = folder.replace(/^\/+|\/+$/g, '').replace(/\.\./g, '');
    const id = randomUUID();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file';
    return `${safeFolder}/${id}-${safeName}`;
  }

  private localPath(key: string): string {
    const resolved = resolve(this.localRoot, normalize(key));
    if (!resolved.startsWith(this.localRoot)) {
      throw new Error('Invalid storage key');
    }
    return join(resolved);
  }
}

function mimeFromKey(key: string): string | undefined {
  const ext = key.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}
