import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from './prisma.service.js';
import type { SettingsOutbox } from './settings.outbox.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  const key = 'commission_default';
  const actor = 'auth0|admin';
  const current = { key, value: 2000, min: 1500, max: 2500, revision: 0 };
  const updated = { ...current, value: 2100, revision: 1, updatedAt: new Date('2026-11-12T21:00:00Z') };
  const tx = {
    $queryRaw: vi.fn(),
    setting: { update: vi.fn(), findUniqueOrThrow: vi.fn() },
    auditLog: { create: vi.fn() },
    outboxEvent: { create: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  const outbox = { flush: vi.fn() };
  const service = new SettingsService(prisma as unknown as PrismaService, outbox as unknown as SettingsOutbox);

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((work) => work(tx));
    tx.$queryRaw.mockResolvedValue([current]);
    tx.setting.update.mockResolvedValue(updated);
    tx.setting.findUniqueOrThrow.mockResolvedValue(current);
  });

  it('writes the change, audit and event in one transaction before notifying the relay', async () => {
    await expect(service.update(key, 2100, actor)).resolves.toEqual(updated);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.setting.update).toHaveBeenCalledWith({
      where: { key },
      data: { value: 2100, updatedBy: actor, revision: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      settingKey: key, previous: 2000, value: 2100, revision: 1, adminSub: actor,
    }) });
    const eventId = tx.auditLog.create.mock.calls[0][0].data.id;
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: {
      id: eventId, key, payload: {
        eventId, type: 'settings.changed', occurredAt: updated.updatedAt.toISOString(),
        data: { key, previous: 2000, value: 2100, revision: 1 },
      },
    } });
    expect(outbox.flush).toHaveBeenCalledAfter(tx.outboxEvent.create);
  });

  it('rejects an unknown key or an out-of-range value before writing', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.update('unknown', 2100, actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(key, 2501, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(key, '2100', actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.setting.update).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('returns the current setting for a retry without another audit entry', async () => {
    await expect(service.update(key, 2000, actor)).resolves.toEqual(current);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(outbox.flush).not.toHaveBeenCalled();
  });

  it('leaves publication to the relay only after the transaction succeeds', async () => {
    tx.outboxEvent.create.mockRejectedValue(new Error('write failed'));
    await expect(service.update(key, 2100, actor)).rejects.toThrow('write failed');
    expect(outbox.flush).not.toHaveBeenCalled();
  });
});
