import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { AreasService } from '../areas/areas.service.js';
import { parsePostalCode } from '../areas/postal-code.js';
import { CatalogService } from './catalog.service.js';

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly areas: AreasService,
  ) {}

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

  @Get('areas/:postalCode')                   // GET /areas/3000-123 → which municipality, and are bookings open there?
  findArea(@Param('postalCode') postalCode: string) {
    return this.areas.findByPostalCode(this.parsePostalCode(postalCode));
  }

  @Get('search')                              // GET /search?q=desentupir&postalCode=3000-123 (both optional)
  async search(@Query('q') q?: string, @Query('postalCode') postalCode?: string) {
    const parsed = postalCode ? this.parsePostalCode(postalCode) : null;
    const [services, area] = await Promise.all([
      this.catalog.searchServices(q),
      parsed ? this.areas.findByPostalCode(parsed) : null,
    ]);
    // area is null when no postal code was given; the app then asks for one before booking
    return { area, services };
  }

  private parsePostalCode(input: string) {
    const parsed = parsePostalCode(input);
    if (!parsed) throw new BadRequestException('Postal code must look like 3000-123');
    return parsed;
  }
}
