import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

type DailyMetric = {
  day: string;
  bookings: number;
  gmvCents: number;
  revenueCents: number;
  cancellations: number;
  averageAcceptanceSeconds: number | null;
  repeatCustomers: number;
};

@Injectable()
export class DailyMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  list(input: unknown = '30') {
    if (typeof input !== 'string' || !/^\d{1,2}$/.test(input) || Number(input) < 1 || Number(input) > 90) {
      throw new BadRequestException('days must be an integer between 1 and 90');
    }
    const days = Number(input);
    return this.prisma.$queryRaw<DailyMetric[]>`
      WITH local_days AS (
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Lisbon')::date - offset_days AS day
        FROM generate_series(0, ${days}::integer - 1) AS offsets(offset_days)
      ), day_bounds AS (
        SELECT day,
          (day::timestamp AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'UTC' AS starts_at,
          ((day + 1)::timestamp AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'UTC' AS ends_at
        FROM local_days
      ), bounds AS (
        SELECT MIN(starts_at) AS starts_at, MAX(ends_at) AS ends_at FROM day_bounds
      ), events AS (
        SELECT e.at, e.from_status, e.to_status, b.created_at, b.id, e.id AS event_id
        FROM booking_events e JOIN bookings b ON b.id = e.booking_id CROSS JOIN bounds
        WHERE e.at >= bounds.starts_at AND e.at < bounds.ends_at
          AND (e.from_status IS NULL OR e.to_status IN ('accepted', 'cancelled'))
      ), activity AS (
        SELECT d.day,
          COUNT(DISTINCT e.id) FILTER (WHERE e.from_status IS NULL)::integer AS bookings,
          COUNT(DISTINCT e.id) FILTER (WHERE e.to_status = 'cancelled')::integer AS cancellations,
          ROUND(AVG(EXTRACT(EPOCH FROM e.at - e.created_at)) FILTER (
            WHERE e.to_status = 'accepted' AND NOT EXISTS (
              SELECT 1 FROM booking_events earlier
              WHERE earlier.booking_id = e.id AND earlier.to_status = 'accepted'
                AND (earlier.at, earlier.id) < (e.at, e.event_id)
            )
          ))::integer AS "averageAcceptanceSeconds"
        FROM day_bounds d LEFT JOIN events e ON e.at >= d.starts_at AND e.at < d.ends_at
        GROUP BY d.day
      ), payments AS (
        SELECT d.day, SUM(r.amount_cents)::double precision AS "gmvCents",
          COUNT(DISTINCT b.customer_id) FILTER (WHERE EXISTS (
            SELECT 1 FROM bookings prior
            JOIN booking_receipts previous ON previous.booking_id = prior.id
            WHERE prior.customer_id = b.customer_id
              AND (previous.received_at, previous.booking_id) < (r.received_at, r.booking_id)
          ))::integer AS "repeatCustomers"
        FROM day_bounds d
        JOIN booking_receipts r ON r.received_at >= d.starts_at AND r.received_at < d.ends_at
        JOIN bookings b ON b.id = r.booking_id
        GROUP BY d.day
      ), settlements AS (
        SELECT d.day, SUM(CASE b.status
          WHEN 'confirmed' THEN r.amount_cents - b.pro_payout_cents
          WHEN 'cancelled' THEN r.amount_cents - COALESCE(b.refund_cents, r.amount_cents)
        END)::double precision AS "revenueCents"
        FROM day_bounds d
        JOIN booking_receipts r ON r.settled_at >= d.starts_at AND r.settled_at < d.ends_at
        JOIN bookings b ON b.id = r.booking_id
        GROUP BY d.day
      )
      SELECT TO_CHAR(a.day, 'YYYY-MM-DD') AS day, a.bookings, a.cancellations, a."averageAcceptanceSeconds",
        COALESCE(p."gmvCents", 0) AS "gmvCents", COALESCE(s."revenueCents", 0) AS "revenueCents",
        COALESCE(p."repeatCustomers", 0) AS "repeatCustomers"
      FROM activity a LEFT JOIN payments p USING (day) LEFT JOIN settlements s USING (day)
      ORDER BY a.day DESC
    `;
  }
}
