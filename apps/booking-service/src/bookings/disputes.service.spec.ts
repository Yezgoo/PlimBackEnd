import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { DisputesService } from './disputes.service.js';

function setup() {
  const tx = {
    booking: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findFirst: vi.fn() },
    bookingDispute: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    bookingEvent: { create: vi.fn() },
  };
  const prisma = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
  return { tx, service: new DisputesService(prisma as unknown as PrismaService) };
}

describe('booking disputes', () => {
  it('opens only for the owner before release and records the evidence and transition', async () => {
    const { tx, service } = setup();
    await service.open('booking', 'customer', ' Work incomplete. ');

    expect(tx.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'booking', customerId: 'customer', status: 'done', releaseAt: { gt: expect.any(Date) }, payment: { is: { settledAt: null } } },
      data: { status: 'disputed' },
    });
    expect(tx.bookingDispute.create).toHaveBeenCalledWith({ data: { bookingId: 'booking', evidence: 'Work incomplete.' } });
    expect(tx.bookingEvent.create).toHaveBeenCalledWith({
      data: { bookingId: 'booking', fromStatus: 'done', toStatus: 'disputed', changedBy: 'customer' },
    });
  });

  it('rejects a missing or already confirmed booking without creating a dispute', async () => {
    const { tx, service } = setup();
    tx.booking.updateMany.mockResolvedValue({ count: 0 });
    tx.booking.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'confirmed' });
    await expect(service.open('booking', 'customer', 'Evidence')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.open('booking', 'customer', 'Evidence')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.bookingDispute.create).not.toHaveBeenCalled();
  });

  it.each([['refund', 'cancelled'], ['pay_professional', 'confirmed']] as const)(
    'queues the existing settlement for %s and audits the administrator',
    async (decision, status) => {
      const { tx, service } = setup();
      tx.bookingDispute.findUnique.mockResolvedValue({
        resolution: null, booking: { professionalId: 'professional', proPayoutCents: 3600, payment: { amountCents: 4700, settledAt: null } },
      });
      await expect(service.resolve('booking', decision, 'admin')).resolves.toEqual({ resolution: decision });
      expect(tx.booking.updateMany).toHaveBeenCalledWith({
        where: { id: 'booking', status: 'disputed', payment: { is: { settledAt: null } } },
        data: expect.objectContaining(decision === 'refund' ? { status, refundCents: 4700, cancellationFeeCents: 0 } : { status }),
      });
      expect(tx.bookingDispute.update).toHaveBeenCalledWith({
        where: { bookingId: 'booking' }, data: { resolution: decision, resolvedBy: 'admin', resolvedAt: expect.any(Date) },
      });
    },
  );

  it('accepts a retried decision and rejects a contradictory decision', async () => {
    const { tx, service } = setup();
    tx.bookingDispute.findUnique.mockResolvedValue({ resolution: 'refund' });
    await expect(service.resolve('booking', 'refund', 'admin')).resolves.toEqual({ resolution: 'refund' });
    await expect(service.resolve('booking', 'pay_professional', 'admin')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
  });
});
