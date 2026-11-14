import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { DailyMetricsService } from './daily-metrics.service.js';

const codePattern = /^[A-Z0-9_-]{1,32}$/;
const bookingSummary = {
  id: true, serviceName: true, status: true, scheduledStart: true,
  totalCents: true, currency: true, customerId: true, professionalId: true,
} as const;

@Controller('backoffice')
export class AdminBookingsController {
  constructor(private readonly prisma: PrismaService, private readonly metrics: DailyMetricsService) {}

  @Get('metrics')
  dailyMetrics(@Query('days') days?: string) {
    return this.metrics.list(days);
  }

  @Get('bookings')
  async listBookings(@Query('before') before?: string) {
    if (before && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(before)) {
      throw new BadRequestException('Invalid booking cursor');
    }
    const rows = await this.prisma.booking.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(before ? { cursor: { id: before }, skip: 1 } : {}),
      take: 51, select: bookingSummary,
    });
    const items = rows.slice(0, 50);
    return { items, nextCursor: rows.length > 50 ? items[49].id : null };
  }

  @Get('bookings/:id')
  async booking(@Param('id', ParseUUIDPipe) id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      select: {
        ...bookingSummary, cancelReason: true, refundCents: true, proPayoutCents: true,
        events: { orderBy: { at: 'asc' }, select: { toStatus: true, at: true } },
        payment: { select: { receivedAt: true, settledAt: true } },
        invoice: { select: { billingName: true, nif: true, issuedAt: true, reference: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  @Get('coupons')
  listCoupons() {
    return this.prisma.coupon.findMany({ orderBy: { code: 'asc' } });
  }

  @Post('coupons')
  async createCoupon(@Body() input: { code?: unknown; fixedCents?: unknown; percent?: unknown }) {
    const code = typeof input?.code === 'string' ? input.code.trim().toUpperCase() : '';
    const { fixedCents, percent } = input ?? {};
    if (!codePattern.test(code) || (fixedCents === undefined) === (percent === undefined)) {
      throw new BadRequestException('Indica um código válido e um único tipo de desconto.');
    }
    const amount = fixedCents ?? percent;
    const maximum = fixedCents === undefined ? 100 : 2_147_483_647;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > maximum) {
      throw new BadRequestException('O valor do desconto é inválido.');
    }
    try {
      return await this.prisma.coupon.create({ data: { code, ...(fixedCents === undefined ? { percent: amount } : { fixedCents: amount }) } });
    } catch (cause) {
      if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === 'P2002') {
        throw new ConflictException('Já existe um cupão com este código.');
      }
      throw cause;
    }
  }

  @Patch('coupons/:code')
  async updateCoupon(@Param('code') code: string, @Body('active') active: unknown) {
    if (!codePattern.test(code) || typeof active !== 'boolean') throw new BadRequestException('Invalid coupon update');
    const result = await this.prisma.coupon.updateMany({ where: { code }, data: { active } });
    if (!result.count) throw new NotFoundException('Coupon not found');
    return { code, active };
  }
}
