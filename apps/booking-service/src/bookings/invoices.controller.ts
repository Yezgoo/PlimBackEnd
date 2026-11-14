import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

const fields = { billingName: true, nif: true, issuedAt: true, reference: true } as const;

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async find(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id, customerId }, select: { invoice: { select: fields }, payment: { select: { bookingId: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return { invoice: booking.invoice, paid: Boolean(booking.payment) };
  }

  @Patch(':id')
  save(@Param('id', ParseUUIDPipe) id: string, @Query('customerId', ParseUUIDPipe) customerId: string,
    @Body() body: { billingName?: unknown; nif?: unknown }) {
    const billingName = typeof body?.billingName === 'string' ? body.billingName.trim() : '';
    const nif = body?.nif == null ? '' : typeof body.nif === 'string' ? body.nif.trim() : '-';
    if (!billingName || billingName.length > 150 || (nif && !this.validNif(nif))) {
      throw new BadRequestException('Indica um nome de faturação e, se aplicável, um NIF português válido.');
    }
    const data = { billingName, nif: nif || null };
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, id);
      const booking = await tx.booking.findFirst({
        where: { id, customerId }, select: { invoice: true, payment: true },
      });
      if (!booking) throw new NotFoundException('Booking not found');
      if (!booking.payment) throw new ConflictException('A marcação ainda não tem um pagamento registado.');
      if (booking.invoice?.issuedAt) throw new ConflictException('A fatura já foi emitida.');
      return tx.bookingInvoice.upsert({ where: { bookingId: id }, create: { bookingId: id, ...data }, update: data, select: fields });
    });
  }

  @Patch(':id/issue')
  issue(@Param('id', ParseUUIDPipe) id: string, @Body() body: {
    reference?: unknown; admin?: unknown; billingName?: unknown; nif?: unknown;
  }) {
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';
    const admin = body?.admin;
    if (!reference || reference.length > 100 || typeof admin !== 'string' || !admin.trim()) {
      throw new BadRequestException('Indica a referência da fatura já emitida.');
    }
    return this.prisma.$transaction(async tx => {
      await this.lock(tx, id);
      const invoice = await tx.bookingInvoice.findUnique({ where: { bookingId: id }, select: fields });
      if (!invoice) throw new NotFoundException('Dados de faturação em falta');
      if (invoice.issuedAt && invoice.reference === reference) return invoice;
      if (invoice.issuedAt) throw new ConflictException('A fatura já foi emitida.');
      if (invoice.billingName !== body.billingName || invoice.nif !== body.nif) {
        throw new ConflictException('Os dados de faturação mudaram. Atualiza a marcação e verifica a fatura externa.');
      }
      return tx.bookingInvoice.update({ where: { bookingId: id }, data: { reference, issuedAt: new Date(), issuedBy: admin }, select: fields });
    });
  }

  private lock(tx: Prisma.TransactionClient, id: string) {
    return tx.$queryRaw`SELECT id FROM bookings WHERE id = ${id}::uuid FOR UPDATE`;
  }

  private validNif(nif: string) {
    if (!/^\d{9}$/.test(nif)) return false;
    const digits = [...nif].map(Number);
    const sum = digits.slice(0, 8).reduce((total, digit, index) => total + digit * (9 - index), 0);
    const remainder = sum % 11;
    return digits[8] === (remainder < 2 ? 0 : 11 - remainder);
  }
}
