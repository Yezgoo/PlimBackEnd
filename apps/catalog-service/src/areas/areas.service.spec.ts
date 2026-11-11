import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { AreasService } from './areas.service.js';

describe('AreasService', () => {
  const prismaMock = { postalPrefix: { findUnique: vi.fn() }, municipality: { findMany: vi.fn() } };
  let service: AreasService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AreasService(prismaMock as unknown as PrismaService);
  });

  it('finds the municipality by the first 4 digits', async () => {
    prismaMock.postalPrefix.findUnique.mockResolvedValue({
      municipality: { code: '0603', name: 'Coimbra', district: 'Coimbra', pilot: true },
    });

    const area = await service.findByPostalCode({ cp4: '3000', formatted: '3000-123' });

    expect(prismaMock.postalPrefix.findUnique.mock.calls[0][0].where).toEqual({ cp4: '3000' });
    expect(area).toEqual({
      postalCode: '3000-123',
      municipality: { code: '0603', name: 'Coimbra', district: 'Coimbra' },
      available: true,
    });
  });

  it('is not available in a municipality that is not in the pilot', async () => {
    prismaMock.postalPrefix.findUnique.mockResolvedValue({
      municipality: { code: '0105', name: 'Aveiro', district: 'Aveiro', pilot: false },
    });

    const area = await service.findByPostalCode({ cp4: '3800', formatted: '3800' });

    expect(area.available).toBe(false);
    expect(area.municipality?.name).toBe('Aveiro');
  });

  it('is not available for a postal code we do not know', async () => {
    prismaMock.postalPrefix.findUnique.mockResolvedValue(null);

    await expect(service.findByPostalCode({ cp4: '1000', formatted: '1000-001' })).resolves.toEqual({
      postalCode: '1000-001',
      municipality: null,
      available: false,
    });
  });

  it('lists municipalities by district and name, with the pilot flag', async () => {
    prismaMock.municipality.findMany.mockResolvedValue([{ code: '0603', name: 'Coimbra', district: 'Coimbra', pilot: true }]);

    await expect(service.listMunicipalities()).resolves.toEqual([
      { code: '0603', name: 'Coimbra', district: 'Coimbra', pilot: true },
    ]);
    expect(prismaMock.municipality.findMany.mock.calls[0][0].orderBy).toEqual([{ district: 'asc' }, { name: 'asc' }]);
  });
});
