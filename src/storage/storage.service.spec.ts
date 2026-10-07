import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { StorageService } from './storage.service';
import { FilesController } from './files.controller';

describe('Private file storage', () => {
  let dir: string, storage: StorageService;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'skinedit-storage-test-'));
    storage = new StorageService(
      new ConfigService({
        NODE_ENV: 'test',
        LOCAL_STORAGE_DIR: join(dir, 'storage'),
        JWT_ACCESS_SECRET: 'synthetic-file-secret',
        R2_ACCOUNT_ID: '',
        R2_ACCESS_KEY_ID: '',
        R2_SECRET_ACCESS_KEY: '',
        R2_BUCKET: '',
      }),
    );
  });
  afterEach(async () => {
    jest.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });
  it('signs local URLs and rejects tampering and expiry', async () => {
    const url = new URL(await storage.signUrl('uploads/example.png', 60));
    const expires = url.searchParams.get('expires')!,
      signature = url.searchParams.get('signature')!;
    expect(
      storage.verifyDownload('uploads/example.png', expires, signature),
    ).toBe(true);
    expect(
      storage.verifyDownload('uploads/other.png', expires, signature),
    ).toBe(false);
    expect(
      storage.verifyDownload('uploads/example.png', expires, 'é'.repeat(64)),
    ).toBe(false);
    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + 61_000);
    expect(
      storage.verifyDownload('uploads/example.png', expires, signature),
    ).toBe(false);
  });
  it('rejects unsigned download requests before accessing storage', async () => {
    const open = jest.spyOn(storage, 'open');
    await expect(
      new FilesController(storage).download('uploads/file', '', ''),
    ).rejects.toThrow('invalid or expired');
    expect(open).not.toHaveBeenCalled();
  });
  it('blocks sibling-prefix traversal and symlinks outside storage', async () => {
    const outside = join(dir, 'storage-other');
    await mkdir(outside);
    await writeFile(join(outside, 'file'), 'synthetic');
    await expect(storage.open('../storage-other/file')).rejects.toThrow(
      'Invalid storage key',
    );
    await symlink(outside, join(dir, 'storage', 'link'));
    await expect(storage.open('link/file')).rejects.toThrow(
      'Invalid storage key',
    );
  });
  it('validates upload content instead of trusting the declared MIME type', async () => {
    const input = {
      buffer: Buffer.from('<svg onload="alert(1)"></svg>'),
      contentType: 'image/png',
      folder: 'uploads',
      filename: 'file.png',
    };
    await expect(storage.upload(input)).rejects.toThrow('Upload a valid');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB3sAAAAASUVORK5CYII=',
      'base64',
    );
    await expect(
      storage.upload({ ...input, buffer: png, contentType: 'application/pdf' }),
    ).rejects.toThrow('Upload a valid');
    const saved = await storage.upload({ ...input, buffer: png });
    const file = await storage.open(saved.key);
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(png);
    await storage.remove(saved.key);
    await expect(storage.open(saved.key)).rejects.toThrow();
  });
});
