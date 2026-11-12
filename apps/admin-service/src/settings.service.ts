import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma.service.js';
import { SETTINGS_CHANGED, SettingsOutbox } from './settings.outbox.js';

type CurrentSetting = { value: number; min: number; max: number };

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: SettingsOutbox,
  ) {}

  list() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async audit(key?: string, cursor?: string) {
    const page = await this.prisma.auditLog.findMany({
      where: { settingKey: key },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      take: 101,
    });
    const entries = page.slice(0, 100);
    return { entries, nextCursor: page.length > 100 ? entries.at(-1)?.id : null };
  }

  async update(key: string, value: unknown, adminSub: unknown) {
    if (typeof adminSub !== 'string' || !adminSub.trim() || adminSub.length > 255) {
      throw new BadRequestException('An admin identity is required');
    }
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException('Setting value must be an integer');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<CurrentSetting[]>`
        SELECT value, min, max FROM settings WHERE key = ${key} FOR UPDATE
      `;
      if (!current) throw new NotFoundException('Unknown setting');
      if (value < current.min || value > current.max) {
        throw new BadRequestException(`Value must be between ${current.min} and ${current.max}`);
      }
      if (current.value === value) {
        const setting = await tx.setting.findUniqueOrThrow({ where: { key } });
        return { setting, changed: false };
      }

      const setting = await tx.setting.update({
        where: { key },
        data: { value, updatedBy: adminSub, revision: { increment: 1 } },
      });
      const id = randomUUID();
      await tx.auditLog.create({
        data: {
          id, settingKey: key, previous: current.value, value,
          revision: setting.revision, adminSub, occurredAt: setting.updatedAt,
        },
      });
      await tx.outboxEvent.create({
        data: {
          id, key,
          payload: {
            eventId: id, type: SETTINGS_CHANGED, occurredAt: setting.updatedAt.toISOString(),
            data: { key, previous: current.value, value, revision: setting.revision },
          },
        },
      });
      return { setting, changed: true };
    });

    if (result.changed) void this.outbox.flush();
    return result.setting;
  }
}
