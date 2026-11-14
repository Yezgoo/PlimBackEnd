import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class DisputesService {
  constructor(private readonly prisma: PrismaService) {}

  async open(id: string, customerId: string, input: unknown) {
    const evidence = typeof input === 'string' ? input.trim() : '';
    if (!evidence || evidence.length > 2000) {
      throw new BadRequestException('Descreve o problema em até 2000 caracteres.');
    }

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.booking.updateMany({
        where: { id, customerId, status: 'done', releaseAt: { gt: new Date() }, payment: { is: { settledAt: null } } },
        data: { status: 'disputed' },
      });
      if (!moved.count) {
        const current = await tx.booking.findFirst({ where: { id, customerId }, include: { dispute: true } });
        if (!current) throw new NotFoundException('Booking not found');
        if (current.dispute?.evidence === evidence) return;
        throw new ConflictException('Esta marcação já não pode ser contestada. Atualiza a marcação para veres o estado atual.');
      }
      await tx.bookingDispute.create({ data: { bookingId: id, evidence } });
      await tx.bookingEvent.create({ data: { bookingId: id, fromStatus: 'done', toStatus: 'disputed', changedBy: customerId } });
    });
  }

  listOpen() {
    return this.prisma.bookingDispute.findMany({
      where: { resolution: null },
      orderBy: [{ openedAt: 'asc' }, { bookingId: 'asc' }],
      take: 50,
      include: { booking: { select: { serviceName: true, customerId: true, professionalId: true, totalCents: true, proPayoutCents: true } } },
    });
  }

  async resolve(id: string, decision: unknown, admin: unknown) {
    if ((decision !== 'refund' && decision !== 'pay_professional') || typeof admin !== 'string' || !admin) {
      throw new BadRequestException('A valid resolution and administrator are required');
    }
    return this.prisma.$transaction(async (tx) => {
      const dispute = await tx.bookingDispute.findUnique({ where: { bookingId: id }, include: { booking: { include: { payment: true } } } });
      if (!dispute) throw new NotFoundException('Dispute not found');
      if (dispute.resolution === decision) return { resolution: decision };
      if (dispute.resolution) throw new ConflictException('Dispute already resolved');

      const { payment, professionalId, proPayoutCents } = dispute.booking;
      if (!payment || payment.settledAt || (decision === 'pay_professional' && (!professionalId || proPayoutCents === null))) {
        throw new ConflictException('Booking has no eligible payment to settle');
      }
      const now = new Date();
      const status = decision === 'refund' ? 'cancelled' : 'confirmed';
      const moved = await tx.booking.updateMany({
        where: { id, status: 'disputed', payment: { is: { settledAt: null } } },
        data: decision === 'refund'
          ? { status, cancelledAt: now, cancelReason: 'dispute_refunded', cancellationFeeCents: 0, refundCents: payment.amountCents }
          : { status, confirmedAt: now },
      });
      if (!moved.count) {
        const current = await tx.bookingDispute.findUnique({ where: { bookingId: id } });
        if (current?.resolution === decision) return { resolution: decision };
        throw new ConflictException('Dispute already resolved or booking cannot be settled');
      }
      await tx.bookingDispute.update({ where: { bookingId: id }, data: { resolution: decision, resolvedBy: admin, resolvedAt: now } });
      await tx.bookingEvent.create({ data: { bookingId: id, fromStatus: 'disputed', toStatus: status, changedBy: admin } });
      return { resolution: decision };
    });
  }
}
