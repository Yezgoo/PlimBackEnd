import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { ProfessionalsService } from './professionals.service.js';

const uniqueError = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test', meta: { target } });

const stored = (overrides = {}) => ({
  id: 'pro-1',
  userId: 'user-1',
  businessName: null,
  nif: '123456789',
  activityRegistered: true,
  insurancePolicy: null,
  insuranceValidUntil: null,
  bio: null,
  status: 'applied',
  verifiedAt: null,
  ratingAvg: null,
  ratingCount: 0,
  ...overrides,
});

describe('ProfessionalsService', () => {
  const prismaMock = {
    user: { findUnique: vi.fn() },
    professional: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  let service: ProfessionalsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProfessionalsService(prismaMock as unknown as PrismaService);
  });

  describe('apply()', () => {
    const dto = { nif: '123456789', activityRegistered: true, insuranceValidUntil: '2027-12-31' };

    it('creates the profile for that user, with the insurance date as a Date', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prismaMock.professional.create.mockResolvedValue(stored({ insuranceValidUntil: new Date('2027-12-31') }));

      const result = await service.apply('auth0|1', dto);

      const data = prismaMock.professional.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ userId: 'user-1', nif: '123456789', activityRegistered: true });
      expect(data.insuranceValidUntil).toEqual(new Date('2027-12-31'));
      expect(data.status).toBeUndefined(); // the database default ("applied") decides, never the caller
      expect(result.insuranceValidUntil).toBe('2027-12-31');
      expect(result.status).toBe('applied');
    });

    it('throws 404 when the person has no user profile yet', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.apply('auth0|nobody', dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.professional.create).not.toHaveBeenCalled();
    });

    it('throws 409 when the user already applied', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prismaMock.professional.create.mockRejectedValue(uniqueError(['user_id']));

      await expect(service.apply('auth0|1', dto)).rejects.toThrow('already applied');
    });

    it('throws 409 when the NIF belongs to another professional', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1' });
      prismaMock.professional.create.mockRejectedValue(uniqueError(['nif']));

      const error = await service.apply('auth0|1', dto).catch((e) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toContain('NIF is already registered');
    });
  });

  describe('findByAuth0Id()', () => {
    it('returns the rating as a plain number', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(stored({ ratingAvg: new Prisma.Decimal('4.75'), ratingCount: 8 }));

      const result = await service.findByAuth0Id('auth0|1');

      expect(prismaMock.professional.findFirst.mock.calls[0][0].where).toEqual({ user: { auth0Id: 'auth0|1' } });
      expect(result.ratingAvg).toBe(4.75);
    });

    it('throws 404 when the user has not applied', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(null);

      await expect(service.findByAuth0Id('auth0|1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update()', () => {
    it('changes the given fields', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(stored());
      prismaMock.professional.update.mockResolvedValue(stored({ bio: 'Canalizador há 10 anos' }));

      const result = await service.update('auth0|1', { bio: 'Canalizador há 10 anos' });

      expect(prismaMock.professional.update.mock.calls[0][0]).toMatchObject({
        where: { id: 'pro-1' },
        data: { bio: 'Canalizador há 10 anos' },
      });
      expect(result.bio).toBe('Canalizador há 10 anos');
    });

    it('lets the NIF be corrected while the application is waiting', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(stored({ status: 'applied' }));
      prismaMock.professional.update.mockResolvedValue(stored({ nif: '999999990' }));

      await expect(service.update('auth0|1', { nif: '999999990' })).resolves.toMatchObject({ nif: '999999990' });
    });

    it('refuses a NIF change after approval', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(stored({ status: 'approved' }));

      await expect(service.update('auth0|1', { nif: '999999990' })).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.professional.update).not.toHaveBeenCalled();
    });

    it('throws 404 when the user has not applied', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(null);

      await expect(service.update('auth0|1', { bio: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
