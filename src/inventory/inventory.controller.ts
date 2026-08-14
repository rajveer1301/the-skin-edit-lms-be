import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('products')
  findProducts(@Query() query: ListQueryDto) {
    return this.inventoryService.findProducts(query);
  }

  @Get('products/:id')
  findProduct(@Param('id') id: string) {
    return this.inventoryService.findProduct(id);
  }

  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(dto);
  }

  @Roles(Role.ADMIN, Role.RECEPTIONIST)
  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.inventoryService.updateProduct(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete('products/:id')
  removeProduct(@Param('id') id: string) {
    return this.inventoryService.removeProduct(id);
  }

  @Get('stock-movements')
  findStockMovements(@Query() query: StockMovementQueryDto) {
    return this.inventoryService.findStockMovements(query);
  }

  @Roles(Role.ADMIN, Role.DOCTOR, Role.RECEPTIONIST)
  @Post('stock-movements')
  createStockMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.inventoryService.createStockMovement(dto, userId);
  }
}
