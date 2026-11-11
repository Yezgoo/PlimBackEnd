import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service.js';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')                          // GET /categories
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('services')                            // GET /services  or  /services?category=canalizacao
  listServices(@Query('category') category?: string) {
    return this.catalog.listServices(category);
  }

  @Get('services/:slug')                      // GET /services/desentupimento-lavatorio-sanita
  async findService(@Param('slug') slug: string) {
    const service = await this.catalog.findService(slug);
    if (!service) throw new NotFoundException(`Service ${slug} not found`);
    return service;
  }
}
