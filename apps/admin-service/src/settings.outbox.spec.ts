import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from './prisma.service.js';
import { SETTINGS_CHANGED, SettingsOutbox } from './settings.outbox.js';

const kafka = vi.hoisted(() => ({ send: vi.fn(), close: vi.fn(), listTopics: vi.fn() }));
vi.mock('@platformatic/kafka', () => ({
  Producer: class {
    send = kafka.send;
    close = kafka.close;
  },
  Admin: class {
    listTopics = kafka.listTopics;
    close = kafka.close;
  },
  stringSerializers: {},
}));

describe('SettingsOutbox', () => {
  const event = { id: 'event-1', key: 'max_offers', payload: { value: 6, revision: 1 } };
  const tx = {
    $queryRaw: vi.fn(),
    outboxEvent: { findMany: vi.fn(), update: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  let relay: SettingsOutbox;

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.$transaction.mockImplementation((work) => work(tx));
    tx.$queryRaw.mockResolvedValue([{ acquired: true }]);
    tx.outboxEvent.findMany.mockResolvedValue([event]);
    kafka.listTopics.mockResolvedValue([SETTINGS_CHANGED]);
    relay = new SettingsOutbox(prisma as unknown as PrismaService);
  });

  it('keeps a failed event pending and marks it published after a successful retry', async () => {
    kafka.send.mockRejectedValueOnce(new Error('broker unavailable'));
    await relay.flush();
    expect(tx.outboxEvent.update).not.toHaveBeenCalled();

    await relay.flush();
    expect(kafka.send).toHaveBeenCalledTimes(2);
    expect(kafka.send).toHaveBeenLastCalledWith({
      messages: [{ topic: SETTINGS_CHANGED, key: event.key, value: JSON.stringify(event.payload) }],
    });
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: event.id }, data: { publishedAt: expect.any(Date) },
    });
  });

  it('does not take work when another replica holds the relay lock', async () => {
    tx.$queryRaw.mockResolvedValue([{ acquired: false }]);
    await relay.flush();
    expect(tx.outboxEvent.findMany).not.toHaveBeenCalled();
    expect(kafka.send).not.toHaveBeenCalled();
  });
});
