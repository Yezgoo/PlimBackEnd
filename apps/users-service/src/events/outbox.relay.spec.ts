import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { EventsPublisher } from './events.publisher.js';
import { OutboxRelay } from './outbox.relay.js';

describe('OutboxRelay', () => {
  const pending = [
    { id: 'e1', topic: 'user.registered', key: 'u1', payload: { eventId: 'e1' } },
    { id: 'e2', topic: 'user.registered', key: 'u2', payload: { eventId: 'e2' } },
  ];
  const tx = { $queryRaw: vi.fn(), outboxEvent: { update: vi.fn() } };
  const prismaMock = { $transaction: vi.fn((work: (t: typeof tx) => unknown) => work(tx)) };
  const publisherMock = { publish: vi.fn() };
  let relay: OutboxRelay;

  beforeEach(() => {
    vi.clearAllMocks();
    tx.$queryRaw.mockResolvedValue(pending);
    relay = new OutboxRelay(prismaMock as unknown as PrismaService, publisherMock as unknown as EventsPublisher);
  });

  it('publishes pending events in order and marks them as published', async () => {
    await relay.flush();

    expect(publisherMock.publish.mock.calls.map((c) => c[1])).toEqual(['u1', 'u2']);
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('stops at the first failure and keeps that event (and later ones) for the next run', async () => {
    publisherMock.publish.mockRejectedValueOnce(new Error('broker down'));

    await relay.flush();

    expect(publisherMock.publish).toHaveBeenCalledTimes(1); // e2 not sent ahead of e1
    expect(tx.outboxEvent.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { attempts: { increment: 1 } } });
    expect(tx.outboxEvent.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { publishedAt: expect.any(Date) } }));
  });

  it('runs one flush at a time', async () => {
    await Promise.all([relay.flush(), relay.flush()]);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
