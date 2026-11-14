import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Controller('booking-emails')
export class BookingEmailsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  pending() {
    return this.prisma.$queryRaw`
      SELECT e.booking_id AS "bookingId", e.kind, b.customer_id AS "customerId",
        b.service_name AS "serviceName", b.scheduled_start AS "scheduledStart", b.total_cents AS "totalCents", e.envelope
      FROM booking_emails e JOIN bookings b ON b.id = e.booking_id
      WHERE e.sent_at IS NULL AND (e.attempted_at IS NULL OR e.attempted_at > NOW() - INTERVAL '23 hours')
      ORDER BY e.attempted_at NULLS FIRST, e.created_at, e.booking_id, e.kind LIMIT 25
    `;
  }

  @Post(':id/:kind/attempt')
  async attempt(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string, @Body() envelope: object) {
    this.validateKind(kind);
    const [updated] = await this.prisma.$queryRaw<{ envelope: object }[]>`
      UPDATE booking_emails SET attempted_at = COALESCE(attempted_at, NOW()), envelope = COALESCE(booking_emails.envelope, ${JSON.stringify(envelope)}::jsonb)
      WHERE booking_id = ${id}::uuid AND kind = ${kind} AND sent_at IS NULL
        AND (attempted_at IS NULL OR attempted_at > NOW() - INTERVAL '23 hours')
      RETURNING booking_emails.envelope
    `;
    return { envelope: updated?.envelope ?? null };
  }

  @Post(':id/:kind/sent')
  async sent(@Param('id', ParseUUIDPipe) id: string, @Param('kind') kind: string) {
    this.validateKind(kind);
    await this.prisma.$executeRaw`
      UPDATE booking_emails SET sent_at = COALESCE(sent_at, NOW()), envelope = NULL
      WHERE booking_id = ${id}::uuid AND kind = ${kind} AND attempted_at IS NOT NULL
    `;
    return { received: true };
  }

  private validateKind(kind: string) {
    if (!['receipt', 'assigned', 'completed'].includes(kind)) throw new BadRequestException('Unknown email kind');
  }
}
