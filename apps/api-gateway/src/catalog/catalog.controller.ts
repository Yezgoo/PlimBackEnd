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

  @Get('areas/:postalCode')                   // GET /catalog/areas/3000-123 → municipality, and whether bookings are open
  findArea(@Param('postalCode') postalCode: string) {
    return this.catalog.findArea(postalCode);
  }

  @Get('search')                              // GET /catalog/search?q=desentupir&postalCode=3000-123 (the home screen's search)
  search(@Query('q') q?: string, @Query('postalCode') postalCode?: string) {
    return this.catalog.search(q, postalCode);
  }
}
