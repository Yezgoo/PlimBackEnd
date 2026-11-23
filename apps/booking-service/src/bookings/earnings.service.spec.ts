import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { EarningsService } from './earnings.service.js';

const job = (over: Record<string, unknown>) => ({
  id: 'b', serviceName: 'Limpeza 3 h', scheduledStart: new Date('2026-11-10T10:00:00Z'), status: 'confirmed',
  proPayoutCents: 4000, currency: 'EUR', confirmedAt: new Date('2026-11-10T14:00:00Z'), payment: { settledAt: null }, ...over,
});

describe('EarningsService', () => {
  const prisma = { booking: { findMany: vi.fn(), count: vi.fn() } };
  const service = new EarningsService(prisma as unknown as PrismaService);
  const now = new Date('2026-11-23T18:00:00Z');

  beforeEach(() => vi.clearAllMocks());

  it('splits the professional\'s share by where the money stands', async () => {
    prisma.booking.findMany.mockResolvedValue([
      job({ id: 'paid', payment: { settledAt: new Date('2026-11-11T09:00:00Z') } }),
      job({ id: 'releasing', proPayoutCents: 2500 }),
      job({ id: 'done', status: 'done', confirmedAt: null, proPayoutCents: 3000 }),
      job({ id: 'disputed', status: 'disputed', confirmedAt: null, proPayoutCents: 1000 }),
      job({ id: 'next', status: 'accepted', confirmedAt: null, proPayoutCents: 5000 }),
    ]);

    const result = await service.forProfessional('pro-1', now);

    expect(result.totals).toEqual({ paid: 4000, releasing: 2500, awaiting_confirmation: 3000, disputed: 1000, upcoming: 5000, earnedCents: 6500 });
    expect(result.thisMonth).toEqual({ earnedCents: 6500, jobs: 2 });
    expect(result.completedJobs).toBe(2);
    expect(result.recent.map((r) => r.state)).toEqual(['paid', 'releasing', 'awaiting_confirmation', 'disputed', 'upcoming']);
    expect(result.recent[0].paidAt).toEqual(new Date('2026-11-11T09:00:00Z'));
    expect(prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ professionalId: 'pro-1' }) }));
  });

  it('counts a job in the Lisbon month it was confirmed', async () => {
    // Lisbon is UTC+0 in winter and UTC+1 in summer, so late-evening UTC times can fall in the next Lisbon month
    prisma.booking.findMany.mockResolvedValue([
      job({ id: 'oct', confirmedAt: new Date('2026-10-31T23:30:00Z') }),  // Lisbon (UTC+0): 31 Oct → October
      job({ id: 'sep', confirmedAt: new Date('2026-09-30T23:30:00Z') }),  // Lisbon (UTC+1): 1 Oct 00:30 → October
    ]);

    const { months } = await service.forProfessional('pro-1', now);

    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06']);
    expect(months[1]).toEqual({ month: '2026-10', earnedCents: 8000, jobs: 2 });
    expect(months[0]).toEqual({ month: '2026-11', earnedCents: 0, jobs: 0 });
  });

  it('starts at zero for a new professional', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    const result = await service.forProfessional('pro-1', now);

    expect(result).toMatchObject({ currency: 'EUR', thisMonth: { earnedCents: 0, jobs: 0 }, completedJobs: 0, recent: [] });
    expect(result.months).toHaveLength(6);
  });

  it('crosses the year boundary when listing months', async () => {
    prisma.booking.findMany.mockResolvedValue([]);

    const { months } = await service.forProfessional('pro-1', new Date('2027-02-15T12:00:00Z'));

    expect(months.map((m) => m.month)).toEqual(['2027-02', '2027-01', '2026-12', '2026-11', '2026-10', '2026-09']);
  });
});
