import { BadRequestException } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogClient } from '../catalog/catalog.client.js';
import { MeWorkController } from './me-work.controller.js';
import { UsersClient } from './users.client.js';

describe('MeWorkController', () => {
  const usersMock = { setAreas: vi.fn(), setServices: vi.fn() };
  const catalogMock = { listMunicipalities: vi.fn(), listServices: vi.fn() };
  const me = { sub: 'auth0|me' } as JWTPayload;
  let controller: MeWorkController;

  beforeEach(() => {
    vi.clearAllMocks();
    catalogMock.listMunicipalities.mockResolvedValue([{ code: '0603', name: 'Coimbra', district: 'Coimbra', pilot: true }]);
    catalogMock.listServices.mockResolvedValue([{ id: 'svc-1' }, { id: 'svc-2' }]);
    controller = new MeWorkController(usersMock as unknown as UsersClient, catalogMock as unknown as CatalogClient);
  });

  it('saves areas that exist in the catalog, once each', async () => {
    await controller.setAreas(me, { municipalityCodes: ['0603', '0603'] });

    expect(usersMock.setAreas).toHaveBeenCalledWith('auth0|me', ['0603']);
  });

  it('refuses a municipality the catalog does not know', async () => {
    await expect(controller.setAreas(me, { municipalityCodes: ['0603', '9999'] })).rejects.toThrow('Unknown municipality: 9999');
    expect(usersMock.setAreas).not.toHaveBeenCalled();
  });

  it('saves services that exist in the catalog', async () => {
    await controller.setServices(me, { serviceTypeIds: ['svc-2'] });

    expect(usersMock.setServices).toHaveBeenCalledWith('auth0|me', ['svc-2']);
  });

  it('refuses a service that is not (or no longer) in the catalog', async () => {
    await expect(controller.setServices(me, { serviceTypeIds: ['svc-9'] })).rejects.toThrow('Unknown service: svc-9');
    expect(usersMock.setServices).not.toHaveBeenCalled();
  });

  it('refuses a body that is not a list of text values', async () => {
    await expect(controller.setAreas(me, { municipalityCodes: '0603' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.setServices(me, { serviceTypeIds: [1, 2] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.setAreas(me, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('an empty list is allowed: it clears the selection', async () => {
    await controller.setAreas(me, { municipalityCodes: [] });

    expect(usersMock.setAreas).toHaveBeenCalledWith('auth0|me', []);
  });
});
