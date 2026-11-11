import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { WorkSettingsService } from './work-settings.service.js';

describe('WorkSettingsService', () => {
  const op = (name: string) => vi.fn((args) => ({ op: name, args }));
  const prismaMock = {
    professional: { findFirst: vi.fn() },
    proArea: { deleteMany: op('area.deleteMany'), createMany: op('area.createMany') },
    proService: { deleteMany: op('service.deleteMany'), createMany: op('service.createMany') },
    availabilitySlot: { deleteMany: op('slot.deleteMany'), createMany: op('slot.createMany') },
    timeOff: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  };
  let service: WorkSettingsService;

  // what findFirst answers for the "who is this?" lookup and for get()
  const settings = (overrides = {}) => ({ id: 'pro-1', areas: [], services: [], slots: [], timeOff: [], ...overrides });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.professional.findFirst.mockResolvedValue(settings());
    service = new WorkSettingsService(prismaMock as unknown as PrismaService);
  });

  it('get() returns times as HH:MM and only time off that has not ended', async () => {
    prismaMock.professional.findFirst.mockResolvedValue(
      settings({
        areas: [{ municipalityCode: '0603' }],
        services: [{ serviceTypeId: 'svc-1' }],
        slots: [{ weekday: 1, startMinute: 540, endMinute: 780 }],
      }),
    );

    const result = await service.get('auth0|1');

    expect(result).toMatchObject({
      municipalityCodes: ['0603'],
      serviceTypeIds: ['svc-1'],
      availability: [{ weekday: 1, start: '09:00', end: '13:00' }],
    });
    const timeOffFilter = prismaMock.professional.findFirst.mock.calls[0][0].select.timeOff.where;
    expect(timeOffFilter.endsAt.gt).toBeInstanceOf(Date);
  });

  it('throws 404 for someone who has not applied as a professional', async () => {
    prismaMock.professional.findFirst.mockResolvedValue(null);

    await expect(service.get('auth0|1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setAreas('auth0|1', ['0603'])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setAreas() replaces the whole list in one transaction', async () => {
    await service.setAreas('auth0|1', ['0603', '0605']);

    const [remove, create] = prismaMock.$transaction.mock.calls[0][0] as { op: string; args: { data?: unknown; where?: unknown } }[];
    expect(remove).toMatchObject({ op: 'area.deleteMany', args: { where: { professionalId: 'pro-1' } } });
    expect(create.args.data).toEqual([
      { professionalId: 'pro-1', municipalityCode: '0603' },
      { professionalId: 'pro-1', municipalityCode: '0605' },
    ]);
  });

  it('setServices() replaces the whole list', async () => {
    await service.setServices('auth0|1', ['svc-1']);

    const [, create] = prismaMock.$transaction.mock.calls[0][0] as { args: { data: unknown } }[];
    expect(create.args.data).toEqual([{ professionalId: 'pro-1', serviceTypeId: 'svc-1' }]);
  });

  describe('setAvailability()', () => {
    it('stores blocks as minutes, sorted by day and time', async () => {
      await service.setAvailability('auth0|1', [
        { weekday: 2, start: '14:00', end: '18:30' },
        { weekday: 1, start: '09:00', end: '13:00' },
      ]);

      const [, create] = prismaMock.$transaction.mock.calls[0][0] as { args: { data: unknown } }[];
      expect(create.args.data).toEqual([
        { professionalId: 'pro-1', weekday: 1, startMinute: 540, endMinute: 780 },
        { professionalId: 'pro-1', weekday: 2, startMinute: 840, endMinute: 1110 },
      ]);
    });

    it('allows two blocks that touch (morning and afternoon)', async () => {
      await expect(
        service.setAvailability('auth0|1', [
          { weekday: 1, start: '09:00', end: '13:00' },
          { weekday: 1, start: '13:00', end: '18:00' },
        ]),
      ).resolves.toBeDefined();
    });

    it('refuses blocks that overlap on the same day', async () => {
      await expect(
        service.setAvailability('auth0|1', [
          { weekday: 1, start: '09:00', end: '13:00' },
          { weekday: 1, start: '12:00', end: '18:00' },
        ]),
      ).rejects.toThrow('overlap');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a block that ends before it starts', async () => {
      await expect(service.setAvailability('auth0|1', [{ weekday: 3, start: '18:00', end: '09:00' }])).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('an empty list clears the timetable', async () => {
      await service.setAvailability('auth0|1', []);

      const [, create] = prismaMock.$transaction.mock.calls[0][0] as { args: { data: unknown } }[];
      expect(create.args.data).toEqual([]);
    });
  });

  describe('time off', () => {
    const nextYear = new Date().getFullYear() + 1;

    it('adds a future period', async () => {
      prismaMock.timeOff.count.mockResolvedValue(0);

      await service.addTimeOff('auth0|1', { startsAt: `${nextYear}-08-01T00:00:00Z`, endsAt: `${nextYear}-08-15T00:00:00Z`, reason: 'Férias' });

      expect(prismaMock.timeOff.create.mock.calls[0][0].data).toMatchObject({ professionalId: 'pro-1', reason: 'Férias' });
    });

    it('refuses a period that ends before it starts, or is already over', async () => {
      await expect(
        service.addTimeOff('auth0|1', { startsAt: `${nextYear}-08-15T00:00:00Z`, endsAt: `${nextYear}-08-01T00:00:00Z` }),
      ).rejects.toThrow('end after it starts');
      await expect(
        service.addTimeOff('auth0|1', { startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-02T00:00:00Z' }),
      ).rejects.toThrow('in the future');
    });

    it('removeTimeOff() only deletes through the owner', async () => {
      prismaMock.timeOff.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.removeTimeOff('auth0|someone-else', 'off-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.timeOff.deleteMany.mock.calls[0][0].where).toEqual({
        id: 'off-1',
        professional: { user: { auth0Id: 'auth0|someone-else' } },
      });
    });
  });
});
