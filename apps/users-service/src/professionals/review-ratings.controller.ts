import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

@Controller('review-ratings')
export class ReviewRatingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(200)
  async project(@Body() body: { booking_id: string; professional_id: string; rating: number }) {
    if (!body || typeof body.booking_id !== 'string' || !uuid.test(body.booking_id) ||
        typeof body.professional_id !== 'string' || !uuid.test(body.professional_id) ||
        !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      throw new BadRequestException('Invalid review rating');
    }
    const { booking_id: bookingId, professional_id: professionalId, rating } = body;
    await this.prisma.$transaction(async (tx) => {
      const [professional] = await tx.$queryRaw<unknown[]>`SELECT id FROM professionals WHERE id = ${professionalId}::uuid FOR UPDATE`;
      if (!professional) throw new NotFoundException('Professional not found');
      const inserted = await tx.$executeRaw`
        INSERT INTO review_ratings (booking_id, professional_id, rating)
        VALUES (${bookingId}::uuid, ${professionalId}::uuid, ${rating}) ON CONFLICT (booking_id) DO NOTHING
      `;
      if (!inserted) return;
      await tx.$executeRaw`
        UPDATE professionals SET rating_avg = totals.average, rating_count = totals.count
        FROM (SELECT ROUND(AVG(rating), 2) AS average, COUNT(*)::integer AS count
              FROM review_ratings WHERE professional_id = ${professionalId}::uuid) totals
        WHERE id = ${professionalId}::uuid
      `;
    });
    return { received: true };
  }
}
