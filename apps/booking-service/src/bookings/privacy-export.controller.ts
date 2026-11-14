import { ConflictException, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

const summary = {
  id: true, serviceName: true, scheduledStart: true, scheduledEnd: true, status: true,
  events: { orderBy: { at: 'asc' }, select: { at: true, toStatus: true } },
} as const;

@Controller('privacy')
export class PrivacyExportController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':id/scrub')
  @HttpCode(200)
  scrub(@Param('id', ParseUUIDPipe) customerId: string,
    @Query('professionalId', new ParseUUIDPipe({ optional: true })) professionalId?: string) {
    const scope = professionalId ? { OR: [{ customerId }, { professionalId }] } : { customerId };
    return this.prisma.$transaction(async tx => {
      const open = await tx.booking.count({ where: { ...scope, status: { notIn: ['cancelled', 'confirmed'] } } });
      const unsettled = await tx.bookingReceipt.count({ where: { settledAt: null, booking: scope } });
      if (open || unsettled) throw new ConflictException('Open bookings or unsettled payments prevent booking cleanup');

      const customerBookings = await tx.booking.updateMany({
        where: { customerId },
        data: { address: { street: '', postalCode: '', city: '' }, notes: null },
      });
      await tx.bookingDispute.updateMany({ where: { booking: { customerId } }, data: { evidence: '[removed]' } });
      await tx.bookingEvent.updateMany({
        where: { changedBy: { in: professionalId ? [customerId, professionalId] : [customerId] } },
        data: { changedBy: null },
      });
      await tx.bookingEmail.deleteMany({ where: { booking: { customerId } } });
      await tx.bookingInvoice.deleteMany({ where: { booking: { customerId }, issuedAt: null } });
      await tx.pushDevice.deleteMany({ where: { userId: customerId } });
      return { customerBookings: customerBookings.count };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  @Get(':id/deletion-check')
  async deletionCheck(@Param('id', ParseUUIDPipe) customerId: string,
    @Query('professionalId', new ParseUUIDPipe({ optional: true })) professionalId?: string) {
    const scope = professionalId ? { OR: [{ customerId }, { professionalId }] } : { customerId };
    const [openBookings, unsettledPayments] = await this.prisma.$transaction([
      this.prisma.booking.count({ where: { ...scope, status: { notIn: ['cancelled', 'confirmed'] } } }),
      this.prisma.bookingReceipt.count({ where: { settledAt: null, booking: scope } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { openBookings, unsettledPayments };
  }

  @Get(':id/export')
  async export(@Param('id', ParseUUIDPipe) customerId: string,
    @Query('professionalId', new ParseUUIDPipe({ optional: true })) professionalId?: string) {
    const [asCustomer, asProfessional, offers] = await Promise.all([
      this.prisma.booking.findMany({
        where: { customerId }, orderBy: { createdAt: 'desc' },
        select: {
          ...summary, address: true, notes: true, totalCents: true, refundCents: true, currency: true,
          dispute: { select: { evidence: true, openedAt: true, resolution: true, resolvedAt: true } },
          payment: { select: { amountCents: true, receivedAt: true, settledAt: true } },
          invoice: { select: { billingName: true, nif: true, issuedAt: true, reference: true } },
        },
      }),
      professionalId ? this.prisma.booking.findMany({
        where: { professionalId }, orderBy: { createdAt: 'desc' },
        select: { ...summary, proPayoutCents: true, currency: true },
      }) : [],
      professionalId ? this.prisma.bookingOffer.findMany({
        where: { professionalId }, orderBy: { offeredAt: 'desc' },
        select: { bookingId: true, status: true, offeredAt: true, expiresAt: true, respondedAt: true },
      }) : [],
    ]);
    return { asCustomer, asProfessional, offers };
  }
}
