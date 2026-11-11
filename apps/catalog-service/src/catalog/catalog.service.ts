import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

// What the app may see. Commission rates are internal, so they are never selected here.
const categoryFields = { id: true, name: true, slug: true, icon: true } satisfies Prisma.ServiceCategorySelect;

const serviceSummaryFields = {
  id: true,
  name: true,
  slug: true,
  description: true,
  pricingModel: true,
  priceCents: true,
  durationMinutes: true,
  category: { select: categoryFields },
} satisfies Prisma.ServiceTypeSelect;

const serviceDetailFields = {
  ...serviceSummaryFields,
  vatRate: true,
  includes: true,
  excludes: true,
  cancellationPolicy: true,
  faqs: { select: { question: true, answer: true }, orderBy: { sortOrder: 'asc' } },
} satisfies Prisma.ServiceTypeSelect;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.serviceCategory.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: categoryFields,
    });
  }

  // categorySlug is optional: without it, every active service is returned
  listServices(categorySlug?: string) {
    return this.prisma.serviceType.findMany({
      where: {
        active: true,
        category: { active: true, ...(categorySlug ? { slug: categorySlug } : {}) },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: serviceSummaryFields,
    });
  }

  async findService(slug: string) {
    const service = await this.prisma.serviceType.findFirst({
      where: { slug, active: true, category: { active: true } },
      select: serviceDetailFields,
    });
    // Prisma returns Decimal objects; the app wants a plain number (0.23)
    return service && { ...service, vatRate: Number(service.vatRate) };
  }
}
