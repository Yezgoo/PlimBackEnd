import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AreasService } from '../areas/areas.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

describe('CatalogController', () => {
  let controller: CatalogController;
  const catalogMock = {
    listCategories: vi.fn(),
    listServices: vi.fn(),
    findService: vi.fn(),
    searchServices: vi.fn(),
  };
  const areasMock = { findByPostalCode: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CatalogService, useValue: catalogMock },
        { provide: AreasService, useValue: areasMock },
      ],
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

  it('findArea() rejects something that is not a postal code', () => {
    expect(() => controller.findArea('coimbra')).toThrow(BadRequestException);
    expect(areasMock.findByPostalCode).not.toHaveBeenCalled();
  });

  it('search() returns matching services and the area for the postal code', async () => {
    const area = {
      postalCode: '3000-123',
      municipality: { code: '0603', name: 'Coimbra', district: 'Coimbra' },
      available: true,
    };
    catalogMock.searchServices.mockResolvedValue([{ slug: 'x' }]);
    areasMock.findByPostalCode.mockResolvedValue(area);

    await expect(controller.search('limpeza', '3000123')).resolves.toEqual({ area, services: [{ slug: 'x' }] });
    expect(catalogMock.searchServices).toHaveBeenCalledWith('limpeza');
    expect(areasMock.findByPostalCode).toHaveBeenCalledWith({ cp4: '3000', formatted: '3000-123' });
  });

  it('search() without a postal code returns area: null', async () => {
    catalogMock.searchServices.mockResolvedValue([]);

    await expect(controller.search()).resolves.toEqual({ area: null, services: [] });
    expect(areasMock.findByPostalCode).not.toHaveBeenCalled();
  });

  it('search() rejects an invalid postal code', async () => {
    catalogMock.searchServices.mockResolvedValue([]);

    await expect(controller.search('limpeza', '30')).rejects.toBeInstanceOf(BadRequestException);
  });
});
