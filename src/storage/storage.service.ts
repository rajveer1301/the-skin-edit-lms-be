import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, mkdirSync } from 'fs';
import { mkdir, writeFile, unlink, access, realpath } from 'fs/promises';
import { dirname, normalize, resolve, relative, isAbsolute } from 'path';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
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
    this.localRoot = resolve(
      this.config.get<string>('LOCAL_STORAGE_DIR') || 'storage',
    );
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
      if (
        this.config.get<string>('NODE_ENV') === 'production' &&
        this.config.get<string>('ALLOW_LOCAL_STORAGE') !== 'true'
      )
        throw new Error(
          'Configure R2 or explicitly enable persistent local storage with ALLOW_LOCAL_STORAGE=true',
        );
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
    const b = input.buffer;
    const detected = b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'image/png'
      : b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255
        ? 'image/jpeg'
        : ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString())
          ? 'image/gif'
          : b.subarray(0, 4).toString() === 'RIFF' &&
              b.subarray(8, 12).toString() === 'WEBP'
            ? 'image/webp'
            : b.subarray(0, 5).toString() === '%PDF-'
              ? 'application/pdf'
              : null;
    if (
      !detected ||
      detected !== input.contentType ||
      b.length > 15 * 1024 * 1024
    )
      throw new BadRequestException(
        'Upload a valid JPEG, PNG, WebP, GIF or PDF up to 15 MB',
      );
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
      await mkdir(dirname(path), { recursive: true });
      await this.assertRealPath(dirname(path));
      await writeFile(path, input.buffer, { flag: 'wx' });
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
    const expires = Math.floor(Date.now() / 1000) + Math.min(expiresIn, 3600);
    const signature = this.signature(key, expires);
    return `${this.publicApiBase}/files?key=${encodeURIComponent(key)}&expires=${expires}&signature=${signature}`;
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
    await access(path);
    await this.assertRealPath(path);
    return { stream: createReadStream(path), contentType: mimeFromKey(key) };
  }

  async remove(key?: string | null): Promise<void> {
    if (!key) return;
    if (this.driver === 'r2' && this.s3 && this.bucket) {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return;
    }
    const path = this.localPath(key);
    try {
      await this.assertRealPath(path);
      await unlink(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  verifyDownload(key: string, expires: string, signature: string): boolean {
    const seconds = Number(expires);
    if (
      !Number.isSafeInteger(seconds) ||
      seconds <= Date.now() / 1000 ||
      seconds > Date.now() / 1000 + 3600
    )
      return false;
    const expected = this.signature(key, seconds);
    return (
      typeof signature === 'string' &&
      /^[a-f0-9]{64}$/.test(signature) &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  }

  private signature(key: string, expires: number): string {
    const secret =
      this.config.get<string>('FILE_SIGNING_SECRET') ||
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    return createHmac('sha256', secret)
      .update(JSON.stringify([key, expires]))
      .digest('hex');
  }

  private async assertRealPath(path: string): Promise<void> {
    const [root, target] = await Promise.all([
      realpath(this.localRoot),
      realpath(path),
    ]);
    const child = relative(root, target);
    if (child === '..' || child.startsWith('../') || isAbsolute(child))
      throw new Error('Invalid storage key');
  }

  private buildKey(folder: string, filename: string): string {
    const safeFolder = folder.replace(/^\/+|\/+$/g, '').replace(/\.\./g, '');
    const id = randomUUID();
    const safeName =
      filename.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'file';
    return `${safeFolder}/${id}-${safeName}`;
  }

  private localPath(key: string): string {
    const resolved = resolve(this.localRoot, normalize(key));
    const child = relative(this.localRoot, resolved);
    if (
      !child ||
      child === '..' ||
      child.startsWith('../') ||
      isAbsolute(child)
    ) {
      throw new Error('Invalid storage key');
    }
    return resolved;
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
