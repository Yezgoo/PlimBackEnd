import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { BookingStatus } from '../generated/prisma/client.js';

// Where a professional's money for one job stands:
//   upcoming              accepted, not done yet
//   awaiting_confirmation done; the customer confirms (or it confirms itself at releaseAt)
//   disputed              the customer reported a problem; the team decides
//   releasing             confirmed; the transfer to the professional's payout account is on its way
//   paid                  transferred to the professional's payout account
export type EarningState = 'upcoming' | 'awaiting_confirmation' | 'disputed' | 'releasing' | 'paid';

const STATE_OF: Partial<Record<BookingStatus, EarningState>> = {
  accepted: 'upcoming',
  en_route: 'upcoming',
  in_progress: 'upcoming',
  done: 'awaiting_confirmation',
  disputed: 'disputed',
};

const MONTHS_SHOWN = 6;
const RECENT_SHOWN = 20;

// "2026-11" in Lisbon time, so a job confirmed at 00:30 on 1 December counts for December
const lisbonMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit' });
const monthOf = (at: Date) => lisbonMonth.format(at).slice(0, 7);

function lastMonths(now: Date, count: number) {
  const [year, month] = monthOf(now).split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// What a professional has earned, read from their own bookings. Only the professional's share
// (proPayoutCents) is shown: the customer's total and our commission stay out of it.
@Injectable()
export class EarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async forProfessional(professionalId: string, now = new Date()) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        professionalId,
        status: { in: ['accepted', 'en_route', 'in_progress', 'done', 'disputed', 'confirmed'] },
        proPayoutCents: { not: null },
      },
      select: {
        id: true, serviceName: true, scheduledStart: true, status: true, proPayoutCents: true, currency: true,
        confirmedAt: true, payment: { select: { settledAt: true } },
      },
      orderBy: { scheduledStart: 'desc' },
    });

    const totals: Record<EarningState, number> = { upcoming: 0, awaiting_confirmation: 0, disputed: 0, releasing: 0, paid: 0 };
    const months = new Map(lastMonths(now, MONTHS_SHOWN).map((month) => [month, { month, earnedCents: 0, jobs: 0 }]));
    let completedJobs = 0;

    const items = bookings.map((booking) => {
      const amount = booking.proPayoutCents ?? 0;
      const state: EarningState = booking.status === 'confirmed'
        ? (booking.payment?.settledAt ? 'paid' : 'releasing')
        : STATE_OF[booking.status]!;
      totals[state] += amount;
      if (booking.status === 'confirmed') {
        completedJobs += 1;
        // a job counts as earned in the month it was confirmed
        const bucket = months.get(monthOf(booking.confirmedAt ?? booking.scheduledStart));
        if (bucket) { bucket.earnedCents += amount; bucket.jobs += 1; }
      }
      return {
        bookingId: booking.id,
        serviceName: booking.serviceName,
        scheduledStart: booking.scheduledStart,
        amountCents: amount,
        state,
        paidAt: state === 'paid' ? booking.payment!.settledAt : null,
      };
    });

    const thisMonth = months.get(monthOf(now))!;
    return {
      currency: bookings[0]?.currency ?? 'EUR',
      thisMonth: { earnedCents: thisMonth.earnedCents, jobs: thisMonth.jobs },
      totals: { ...totals, earnedCents: totals.paid + totals.releasing },
      completedJobs,
      months: [...months.values()],         // newest first
      recent: items.slice(0, RECENT_SHOWN), // by date of the job, newest first
    };
  }

  // How many jobs a professional has finished on the platform, for the card customers see
  async completedJobs(professionalId: string) {
    return { completedJobs: await this.prisma.booking.count({ where: { professionalId, status: 'confirmed' } }) };
  }
}
