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

// "Canalização" and "canalizacao" should match: lower case, accents removed
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

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

  // Every word typed must appear in the service's name, description or category.
  // The catalog is small (tens of services), so filtering in memory is simpler than
  // a database text search and handles accents without extensions.
  async searchServices(text?: string) {
    const services = await this.listServices();
    const words = normalize(text ?? '').split(/\s+/).filter(Boolean);
    if (!words.length) return services;

    return services.filter((service) => {
      const haystack = normalize(`${service.name} ${service.description} ${service.category.name}`);
      return words.every((word) => haystack.includes(word));
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

  async findBookingTerms(slug: string) {
    const service = await this.prisma.serviceType.findFirst({
      where: { slug, active: true, category: { active: true } },
      select: {
        id: true, slug: true, name: true, pricingModel: true, durationMinutes: true,
        priceCents: true, vatRate: true, commissionRate: true,
        category: { select: { commissionRate: true } },
      },
    });
    if (!service) return null;
    const { commissionRate, category, vatRate, ...terms } = service;
    const override = commissionRate ?? category.commissionRate;
    return { ...terms, vatRate: Number(vatRate), commissionBps: override?.mul(10_000).toNumber() ?? null };
  }
}
