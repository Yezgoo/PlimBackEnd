import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { CatalogClient } from './catalog.client.js';

// Browsing what YezGoo offers needs no login, so the whole controller is public.
@Public()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogClient) {}

  @Get('categories')                          // GET /catalog/categories
  listCategories() {
    return this.catalog.listCategories();
  }

  @Get('services')                            // GET /catalog/services  or  ?category=canalizacao
  listServices(@Query('category') category?: string) {
    return this.catalog.listServices(category);
  }

  @Get('services/:slug')                      // GET /catalog/services/<slug> → full page: includes, excludes, FAQ
  findService(@Param('slug') slug: string) {
    return this.catalog.findService(slug);
  }
}
