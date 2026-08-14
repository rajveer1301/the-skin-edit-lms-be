import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';

@Controller('roles')
export class RolesController {
  @Get()
  findAll(): string[] {
    return Object.values(Role);
  }
}
