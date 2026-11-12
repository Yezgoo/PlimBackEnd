import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { EligibilityService } from './eligibility.service.js';

describe('EligibilityService', () => {
  const prismaMock = { professional: { findMany: vi.fn() } };
  let service: EligibilityService;

  // Wednesday 18 November 2026, 15:00 to 16:00 (Lisbon = UTC in winter)
  const job = {
    serviceTypeId: 'svc-1',
    municipalityCode: '0603',
    start: new Date('2026-11-18T15:00:00Z'),
    end: new Date('2026-11-18T16:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.professional.findMany.mockResolvedValue([]);
    service = new EligibilityService(prismaMock as unknown as PrismaService);
  });

  it('asks for approved professionals with that service, area, a covering timetable block and no time off', async () => {
    await service.eligibleFor(job);

    expect(prismaMock.professional.findMany.mock.calls[0][0].where).toEqual({
      status: 'approved',
      services: { some: { serviceTypeId: 'svc-1' } },
      areas: { some: { municipalityCode: '0603' } },
      slots: { some: { weekday: 3, startMinute: { lte: 900 }, endMinute: { gte: 960 } } },
      timeOff: { none: { startsAt: { lt: job.end }, endsAt: { gt: job.start } } },
    });
  });

  it('uses the Lisbon clock: 15:00 UTC in July is 16:00 on the timetable', async () => {
    await service.eligibleFor({ ...job, start: new Date('2026-07-15T15:00:00Z'), end: new Date('2026-07-15T16:00:00Z') });

    expect(prismaMock.professional.findMany.mock.calls[0][0].where.slots).toEqual({
      some: { weekday: 3, startMinute: { lte: 960 }, endMinute: { gte: 1020 } },
    });
  });

  it('puts the best-rated first, and unrated professionals after them', async () => {
    await service.eligibleFor(job);

    expect(prismaMock.professional.findMany.mock.calls[0][0].orderBy).toEqual([
      { ratingAvg: { sort: 'desc', nulls: 'last' } },
      { verifiedAt: 'asc' },
    ]);
  });

  it('finds nobody for a job that runs past midnight', async () => {
    const result = await service.eligibleFor({ ...job, start: new Date('2026-11-18T23:00:00Z'), end: new Date('2026-11-19T01:00:00Z') });

    expect(result).toEqual([]);
    expect(prismaMock.professional.findMany).not.toHaveBeenCalled();
  });

  it('returns a display name and a plain-number rating', async () => {
    prismaMock.professional.findMany.mockResolvedValue([
      { id: 'pro-1', userId: 'user-1', businessName: null, ratingAvg: new Prisma.Decimal('4.80'), ratingCount: 12, user: { name: 'Rui' } },
      { id: 'pro-2', userId: 'user-2', businessName: 'Canalizações Silva', ratingAvg: null, ratingCount: 0, user: { name: 'Ana' } },
    ]);

    await expect(service.eligibleFor(job)).resolves.toEqual([
      { id: 'pro-1', userId: 'user-1', businessName: null, name: 'Rui', ratingAvg: 4.8, ratingCount: 12 },
      { id: 'pro-2', userId: 'user-2', businessName: 'Canalizações Silva', name: 'Canalizações Silva', ratingAvg: null, ratingCount: 0 },
    ]);
  });
});
