import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogService', () => {
  let service: CatalogService;

  const prismaMock = {
    serviceCategory: { findMany: vi.fn() },
    serviceType: { findMany: vi.fn(), findFirst: vi.fn() },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [CatalogService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = moduleRef.get(CatalogService);
  });

  it('listCategories() returns only active categories, in display order', async () => {
    prismaMock.serviceCategory.findMany.mockResolvedValue([]);

    await service.listCategories();

    const query = prismaMock.serviceCategory.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ active: true });
    expect(query.orderBy).toEqual([{ sortOrder: 'asc' }, { name: 'asc' }]);
  });

  it('never selects commission rates (internal numbers)', async () => {
    prismaMock.serviceCategory.findMany.mockResolvedValue([]);
    prismaMock.serviceType.findMany.mockResolvedValue([]);
    prismaMock.serviceType.findFirst.mockResolvedValue(null);

    await service.listCategories();
    await service.listServices();
    await service.findService('x');

    const selects = JSON.stringify([
      prismaMock.serviceCategory.findMany.mock.calls[0][0].select,
      prismaMock.serviceType.findMany.mock.calls[0][0].select,
      prismaMock.serviceType.findFirst.mock.calls[0][0].select,
    ]);
    expect(selects).not.toContain('commissionRate');
  });

  it('listServices() filters by category slug when one is given', async () => {
    prismaMock.serviceType.findMany.mockResolvedValue([]);

    await service.listServices('canalizacao');

    expect(prismaMock.serviceType.findMany.mock.calls[0][0].where).toEqual({
      active: true,
      category: { active: true, slug: 'canalizacao' },
    });
  });

  it('listServices() hides services of an inactive category', async () => {
    prismaMock.serviceType.findMany.mockResolvedValue([]);

    await service.listServices();

    expect(prismaMock.serviceType.findMany.mock.calls[0][0].where).toEqual({
      active: true,
      category: { active: true },
    });
  });

  it('findService() turns the VAT rate into a plain number', async () => {
    prismaMock.serviceType.findFirst.mockResolvedValue({
      slug: 'x',
      priceCents: 6500,
      vatRate: new Prisma.Decimal('0.23'),
    });

    await expect(service.findService('x')).resolves.toEqual({ slug: 'x', priceCents: 6500, vatRate: 0.23 });
  });

  it('findService() returns null when the service does not exist or is inactive', async () => {
    prismaMock.serviceType.findFirst.mockResolvedValue(null);

    expect(await service.findService('nope')).toBeNull();
  });

  describe('searchServices()', () => {
    const services = [
      {
        slug: 'desentupimento',
        name: 'Desentupimento de lavatório ou sanita',
        description: 'Com teste de escoamento',
        category: { name: 'Canalização' },
      },
      {
        slug: 'maquina',
        name: 'Reparação de máquina de lavar',
        description: 'Diagnóstico',
        category: { name: 'Eletrodomésticos' },
      },
    ];
    const slugs = async (text?: string) => (await service.searchServices(text)).map((s) => s.slug);

    beforeEach(() => prismaMock.serviceType.findMany.mockResolvedValue(services));

    it('returns everything when nothing is typed', async () => {
      expect(await slugs()).toEqual(['desentupimento', 'maquina']);
      expect(await slugs('   ')).toEqual(['desentupimento', 'maquina']);
    });

    it('ignores accents and case', async () => {
      expect(await slugs('MAQUINA')).toEqual(['maquina']);
      expect(await slugs('lavatorio')).toEqual(['desentupimento']);
    });

    it('matches the category name too', async () => {
      expect(await slugs('canalizacao')).toEqual(['desentupimento']);
    });

    it('needs every word to match', async () => {
      expect(await slugs('maquina lavar')).toEqual(['maquina']);
      expect(await slugs('maquina sanita')).toEqual([]);
    });
  });
});
