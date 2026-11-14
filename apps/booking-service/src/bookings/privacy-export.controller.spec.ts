import { ConflictException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { PrivacyExportController } from './privacy-export.controller.js';

function setup(open: number, unsettled: number) {
  const tx = {
    booking: { count: vi.fn().mockResolvedValue(open), updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    bookingReceipt: { count: vi.fn().mockResolvedValue(unsettled) },
    bookingDispute: { updateMany: vi.fn() },
    bookingEvent: { updateMany: vi.fn() },
    bookingEmail: { deleteMany: vi.fn() },
    bookingInvoice: { deleteMany: vi.fn() },
    pushDevice: { deleteMany: vi.fn() },
  };
  const db = { $transaction: vi.fn(run => run(tx)) };
  return { controller: new PrivacyExportController(db as unknown as PrismaService), tx, db };
}

it.each([[1, 0], [0, 1]])('blocks cleanup with %i open bookings and %i unsettled payments', async (open, unsettled) => {
  const { controller, tx } = setup(open, unsettled);
  await expect(controller.scrub('customer', 'professional')).rejects.toBeInstanceOf(ConflictException);
  expect(tx.bookingReceipt.count).toHaveBeenCalledWith({
    where: { settledAt: null, booking: { OR: [{ customerId: 'customer' }, { professionalId: 'professional' }] } },
  });
  expect(tx.booking.updateMany).not.toHaveBeenCalled();
  expect(tx.pushDevice.deleteMany).not.toHaveBeenCalled();
});

it('scrubs customer details and only removes the account holder’s push devices', async () => {
  const { controller, tx, db } = setup(0, 0);
  await expect(controller.scrub('customer', 'professional')).resolves.toEqual({ customerBookings: 2 });
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  expect(tx.booking.updateMany).toHaveBeenCalledWith({
    where: { customerId: 'customer' },
    data: { address: { street: '', postalCode: '', city: '' }, notes: null },
  });
  expect(tx.bookingEmail.deleteMany).toHaveBeenCalledWith({ where: { booking: { customerId: 'customer' } } });
  expect(tx.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 'customer' } });
});
