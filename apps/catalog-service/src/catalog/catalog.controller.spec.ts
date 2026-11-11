import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogController', () => {
  let controller: CatalogController;
  const catalogMock = { listCategories: vi.fn(), listServices: vi.fn(), findService: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: CatalogService, useValue: catalogMock }],
    }).compile();
    controller = moduleRef.get(CatalogController);
  });

  it('listServices() passes the category filter on', async () => {
    catalogMock.listServices.mockResolvedValue([]);

    await controller.listServices('limpezas');

    expect(catalogMock.listServices).toHaveBeenCalledWith('limpezas');
  });

  it('findService() returns the service when it exists', async () => {
    const service = { slug: 'limpeza-domestica-3h' };
    catalogMock.findService.mockResolvedValue(service);

    expect(await controller.findService('limpeza-domestica-3h')).toEqual(service);
  });

  it('findService() throws 404 when it does not', async () => {
    catalogMock.findService.mockResolvedValue(null);

    await expect(controller.findService('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
