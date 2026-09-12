import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Public } from '../common/decorators/public.decorator';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { StorageService } from './storage.service';

const MAX_BYTES = 15 * 1024 * 1024;

@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Roles(Role.ADMIN, Role.DOCTOR, Role.THERAPIST, Role.RECEPTIONIST)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('folder') folder?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A file is required');
    }
    const type = file.mimetype || 'application/octet-stream';
    if (!type.startsWith('image/') && type !== 'application/pdf') {
      throw new BadRequestException('Only images and PDFs can be uploaded');
    }
    const stored = await this.storage.upload({
      buffer: file.buffer,
      contentType: type,
      folder: folder || 'uploads',
      filename: file.originalname || 'file',
    });
    const url = await this.storage.signUrl(stored.key);
    return {
      key: stored.key,
      url,
      name: file.originalname || 'file',
      contentType: stored.contentType,
      size: stored.size,
    };
  }

  @Public()
  @Get()
  async download(@Query('key') key: string): Promise<StreamableFile> {
    if (!key) {
      throw new BadRequestException('key is required');
    }
    try {
      const { stream, contentType } = await this.storage.open(key);
      return new StreamableFile(stream, {
        type: contentType || 'application/octet-stream',
        disposition: 'inline',
      });
    } catch {
      throw new NotFoundException('File not found');
    }
  }
}
