import { BadRequestException, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { CatalogClient } from '../catalog/catalog.client.js';
import { UsersClient } from './users.client.js';

@Controller('me/favorites')
@UseGuards(HumanCallerGuard)
export class MeFavoritesController {
  constructor(private readonly users: UsersClient, private readonly catalog: CatalogClient) {}

  @Get()
  list(@CurrentUser() user: JWTPayload) {
    return this.users.listFavorites(user.sub!);
  }

  @Put(':serviceSlug')
  async add(@CurrentUser() user: JWTPayload, @Param('serviceSlug') serviceSlug: string) {
    if (!serviceSlug || serviceSlug.length > 120) throw new BadRequestException('Invalid service slug');
    await this.catalog.findService(serviceSlug); // only save services that still exist in the catalog
    return this.users.addFavorite(user.sub!, serviceSlug);
  }

  @Delete(':serviceSlug')
  remove(@CurrentUser() user: JWTPayload, @Param('serviceSlug') serviceSlug: string) {
    if (!serviceSlug || serviceSlug.length > 120) throw new BadRequestException('Invalid service slug');
    return this.users.removeFavorite(user.sub!, serviceSlug);
  }
}
