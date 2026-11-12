import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { lisbonClock } from './lisbon-time.js';

export const MAX_CANDIDATES = 50;

// "Who can take this job?" An approved professional who does that service, works in that
// municipality, has that time inside one block of their timetable and no time off then.
// Whether they are already busy with another job is checked by booking-service, which owns bookings.
@Injectable()
export class EligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async eligibleFor(job: { serviceTypeId: string; municipalityCode: string; start: Date; end: Date }) {
    const from = lisbonClock(job.start);
    const to = lisbonClock(job.end);
    // a job that runs past midnight fits no daily timetable
    if (from.day !== to.day) return [];

    const professionals = await this.prisma.professional.findMany({
      where: {
        status: 'approved',
        services: { some: { serviceTypeId: job.serviceTypeId } },
        areas: { some: { municipalityCode: job.municipalityCode } },
        // one block of the timetable must cover the whole job
        slots: { some: { weekday: from.weekday, startMinute: { lte: from.minutes }, endMinute: { gte: to.minutes } } },
        timeOff: { none: { startsAt: { lt: job.end }, endsAt: { gt: job.start } } },
      },
      // best-rated first; among the unrated, whoever was verified longest ago
      orderBy: [{ ratingAvg: { sort: 'desc', nulls: 'last' } }, { verifiedAt: 'asc' }],
      take: MAX_CANDIDATES,
      select: { id: true, userId: true, businessName: true, ratingAvg: true, ratingCount: true, user: { select: { name: true } } },
    });

    return professionals.map(({ user, ratingAvg, ...professional }) => ({
      ...professional,
      name: professional.businessName ?? user.name,
      ratingAvg: ratingAvg === null ? null : Number(ratingAvg),
    }));
  }
}
