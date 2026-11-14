import { BadRequestException, Body, ConflictException, Controller, Post } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Controller('booking-push')
export class BookingPushController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  async register(@Body() body: { token: string; userId: string; professionalId?: string }) {
    const { token, userId, professionalId } = body;
    if (!/^(Expo|Exponent)PushToken\[[\w-]{1,128}\]$/.test(token)) throw new BadRequestException('Invalid Expo push token');
    const registered = await this.prisma.$executeRaw`
      INSERT INTO push_devices (token, user_id, professional_id)
      VALUES (${token}, ${userId}::uuid, ${professionalId ?? null}::uuid)
      ON CONFLICT (token) DO UPDATE SET professional_id = EXCLUDED.professional_id
      WHERE push_devices.user_id = EXCLUDED.user_id
    `;
    if (!registered) throw new ConflictException('Device is registered to another account');
    return { received: true };
  }

  @Post('remove')
  async remove(@Body() body: { token: string; userId: string }) {
    await this.prisma.$executeRaw`DELETE FROM push_devices WHERE token = ${body.token} AND user_id = ${body.userId}::uuid`;
    return { received: true };
  }

  @Post('claim')
  claim() {
    return this.prisma.$queryRaw`
      WITH pending AS (
        SELECT e.id FROM processed_push_events e JOIN push_devices d ON e.token = d.token AND e.user_id = d.user_id
        WHERE e.processed_at IS NULL AND e.expires_at > NOW() AND (e.lease_until IS NULL OR e.lease_until < NOW())
          AND (e.kind <> 'offer' OR EXISTS (
            SELECT 1 FROM booking_offers o WHERE 'offer:' || o.id = e.event_key AND o.status = 'pending'
              AND o.professional_id = d.professional_id
          ))
        ORDER BY CASE WHEN e.kind = 'offer' THEN 0 ELSE 1 END, e.id LIMIT 50 FOR UPDATE OF e SKIP LOCKED
      )
      UPDATE processed_push_events e SET lease_until = NOW() + INTERVAL '1 minute'
      FROM pending p WHERE e.id = p.id
      RETURNING e.id::text, e.booking_id AS "bookingId", e.token, e.kind, e.expires_at AS "expiresAt", e.user_id AS "userId"
    `;
  }

  @Post('processed')
  async processed(@Body() body: { ids: string[] }) {
    if (!Array.isArray(body?.ids) || body.ids.length > 50 || body.ids.some(id => !/^\d{1,19}$/.test(id))) {
      throw new BadRequestException('Invalid event IDs');
    }
    await this.prisma.$executeRaw`UPDATE processed_push_events SET processed_at = NOW() WHERE id::text = ANY(${body.ids}::text[])`;
    return { received: true };
  }
}
