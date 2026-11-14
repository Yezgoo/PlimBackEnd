import { ConflictException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import type { OutboxRelay } from '../events/outbox.relay.js';
import type { StorageService } from '../storage/storage.service.js';
import type { Auth0ErasureService } from './auth0-erasure.service.js';
import { PrivacyController } from './privacy.controller.js';

function setup(frozenAt: Date) {
  const request = { frozenAt, bookingsCleanedAt: frozenAt, reviewsCleanedAt: frozenAt,
    user: { auth0Id: 'auth0|account', professional: { id: 'pro' } } };
  const tx = {
    $queryRaw: vi.fn(), accountDeletionReceipt: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({ completedAt: frozenAt }) },
    accountDeletionRequest: { findUnique: vi.fn().mockResolvedValue(request) },
    outboxEvent: { deleteMany: vi.fn(), create: vi.fn() }, user: { delete: vi.fn() },
  };
  const db = { ...tx, $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
  const storage = { eraseProfessionalDocuments: vi.fn() };
  const auth0 = { remove: vi.fn() };
  const outbox = { flush: vi.fn() };
  const controller = new PrivacyController(db as unknown as PrismaService, outbox as unknown as OutboxRelay,
    storage as unknown as StorageService, auth0 as unknown as Auth0ErasureService);
  return { controller, db, tx, storage, auth0 };
}

it('waits for previously issued document upload links', async () => {
  const { controller, storage, auth0 } = setup(new Date());
  await expect(controller.finalize('account', 'admin')).rejects.toBeInstanceOf(ConflictException);
  expect(storage.eraseProfessionalDocuments).not.toHaveBeenCalled();
  expect(auth0.remove).not.toHaveBeenCalled();
});

it('keeps the local profile and request when Auth0 deletion fails', async () => {
  const { controller, db, storage, auth0 } = setup(new Date(0));
  auth0.remove.mockRejectedValue(new Error('provider unavailable'));
  await expect(controller.finalize('account', 'admin')).rejects.toThrow('provider unavailable');
  expect(storage.eraseProfessionalDocuments).toHaveBeenCalledWith('pro');
  expect(db.$transaction).not.toHaveBeenCalled();
});

it('records an erasure receipt and queues the event after provider cleanup', async () => {
  const { controller, tx, auth0 } = setup(new Date(0));
  await expect(controller.finalize('account', 'admin')).resolves.toEqual({ completedAt: new Date(0) });
  expect(auth0.remove).toHaveBeenCalledWith('auth0|account');
  expect(tx.accountDeletionReceipt.create).toHaveBeenCalledWith({
    data: { userId: 'account', completedBy: 'admin', subjectHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
    select: { completedAt: true },
  });
  expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'account' } });
  expect(tx.outboxEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ topic: 'user.deleted', key: 'account' }) });
});
