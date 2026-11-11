import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AddTimeOffDto, SlotDto } from './dto/work-settings.dto.js';

export const MAX_TIME_OFF_ENTRIES = 50;

// "09:30" ⇄ 570 (minutes after midnight). Minutes are easy to compare and sort.
const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Where, what and when a professional works: municipalities, catalog services,
// the weekly timetable and time off.
@Injectable()
export class WorkSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(auth0Id: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { user: { auth0Id } },
      select: {
        areas: { select: { municipalityCode: true }, orderBy: { municipalityCode: 'asc' } },
        services: { select: { serviceTypeId: true } },
        slots: { orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }] },
        // time off that already ended is history, not a setting
        timeOff: { where: { endsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } },
      },
    });
    if (!professional) throw new NotFoundException(`${auth0Id} has not applied as a professional`);

    return {
      municipalityCodes: professional.areas.map((area) => area.municipalityCode),
      serviceTypeIds: professional.services.map((service) => service.serviceTypeId),
      availability: professional.slots.map((slot) => ({
        weekday: slot.weekday,
        start: toTime(slot.startMinute),
        end: toTime(slot.endMinute),
      })),
      timeOff: professional.timeOff.map(({ id, startsAt, endsAt, reason }) => ({ id, startsAt, endsAt, reason })),
    };
  }

  // The list sent replaces the previous one: the app always shows and saves the full selection
  async setAreas(auth0Id: string, municipalityCodes: string[]) {
    const professionalId = await this.professionalId(auth0Id);
    await this.prisma.$transaction([
      this.prisma.proArea.deleteMany({ where: { professionalId } }),
      this.prisma.proArea.createMany({
        data: municipalityCodes.map((municipalityCode) => ({ professionalId, municipalityCode })),
      }),
    ]);
    return this.get(auth0Id);
  }

  async setServices(auth0Id: string, serviceTypeIds: string[]) {
    const professionalId = await this.professionalId(auth0Id);
    await this.prisma.$transaction([
      this.prisma.proService.deleteMany({ where: { professionalId } }),
      this.prisma.proService.createMany({
        data: serviceTypeIds.map((serviceTypeId) => ({ professionalId, serviceTypeId })),
      }),
    ]);
    return this.get(auth0Id);
  }

  async setAvailability(auth0Id: string, slots: SlotDto[]) {
    const blocks = slots.map((slot) => ({
      weekday: slot.weekday,
      startMinute: toMinutes(slot.start),
      endMinute: toMinutes(slot.end),
    }));

    for (const block of blocks) {
      if (block.endMinute <= block.startMinute) {
        throw new BadRequestException(`A block must end after it starts (weekday ${block.weekday})`);
      }
    }
    // two blocks on the same day may touch (13:00 / 13:00) but not overlap
    const sorted = [...blocks].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (current.weekday === previous.weekday && current.startMinute < previous.endMinute) {
        throw new BadRequestException(`Two blocks overlap on weekday ${current.weekday}`);
      }
    }

    const professionalId = await this.professionalId(auth0Id);
    await this.prisma.$transaction([
      this.prisma.availabilitySlot.deleteMany({ where: { professionalId } }),
      this.prisma.availabilitySlot.createMany({ data: sorted.map((block) => ({ ...block, professionalId })) }),
    ]);
    return this.get(auth0Id);
  }

  async addTimeOff(auth0Id: string, dto: AddTimeOffDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('Time off must end after it starts');
    if (endsAt <= new Date()) throw new BadRequestException('Time off must end in the future');

    const professionalId = await this.professionalId(auth0Id);
    const upcoming = await this.prisma.timeOff.count({ where: { professionalId, endsAt: { gt: new Date() } } });
    if (upcoming >= MAX_TIME_OFF_ENTRIES) throw new ConflictException('Too many time-off periods');

    await this.prisma.timeOff.create({ data: { professionalId, startsAt, endsAt, reason: dto.reason } });
    return this.get(auth0Id);
  }

  async removeTimeOff(auth0Id: string, timeOffId: string) {
    // deleted through its owner, so nobody can remove someone else's entry by guessing an id
    const { count } = await this.prisma.timeOff.deleteMany({
      where: { id: timeOffId, professional: { user: { auth0Id } } },
    });
    if (!count) throw new NotFoundException(`Time off ${timeOffId} not found`);
  }

  private async professionalId(auth0Id: string) {
    const professional = await this.prisma.professional.findFirst({ where: { user: { auth0Id } }, select: { id: true } });
    if (!professional) throw new NotFoundException(`${auth0Id} has not applied as a professional`);
    return professional.id;
  }
}
