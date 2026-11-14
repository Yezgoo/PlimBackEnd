import { ConflictException, NotFoundException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { InvoicesController } from './invoices.controller.js';

function setup() {
  const tx = {
    $queryRaw: vi.fn(),
    booking: { findFirst: vi.fn() },
    bookingInvoice: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  };
  const prisma = { $transaction: (run: (client: typeof tx) => unknown) => run(tx) };
  return { controller: new InvoicesController(prisma as unknown as PrismaService), tx };
}

it('requires ownership and payment before saving invoice details', async () => {
  const { controller, tx } = setup();
  tx.booking.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ payment: null });
  await expect(controller.save('job', 'customer', { billingName: 'Ana' })).rejects.toBeInstanceOf(NotFoundException);
  await expect(controller.save('job', 'customer', { billingName: 'Ana' })).rejects.toBeInstanceOf(ConflictException);
  expect(tx.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job', customerId: 'customer' } }));
  expect(tx.bookingInvoice.upsert).not.toHaveBeenCalled();
});

it('rejects stale billing details and records an issued reference only after a matching request', async () => {
  const { controller, tx } = setup();
  tx.bookingInvoice.findUnique.mockResolvedValue({ billingName: 'Ana', nif: null, issuedAt: null });
  await expect(controller.issue('job', { reference: 'FT 1', admin: 'admin', billingName: 'Old name', nif: null }))
    .rejects.toBeInstanceOf(ConflictException);
  expect(tx.bookingInvoice.update).not.toHaveBeenCalled();
  await controller.issue('job', { reference: 'FT 1', admin: 'admin', billingName: 'Ana', nif: null });
  expect(tx.bookingInvoice.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { bookingId: 'job' }, data: { reference: 'FT 1', issuedBy: 'admin', issuedAt: expect.any(Date) },
  }));
});

it('locks billing details once an invoice is issued', async () => {
  const { controller, tx } = setup();
  tx.booking.findFirst.mockResolvedValue({ payment: {}, invoice: { issuedAt: new Date() } });
  await expect(controller.save('job', 'customer', { billingName: 'Ana' })).rejects.toBeInstanceOf(ConflictException);
  expect(tx.bookingInvoice.upsert).not.toHaveBeenCalled();
});
