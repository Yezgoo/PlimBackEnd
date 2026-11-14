import { BadRequestException, ConflictException, HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

type Review = { rating: number; comment: string | null; createdAt: Date };
type Projection = { booking_id: string; professional_id: string; rating: number };
const reviewFields = 'rating, comment, created_at AS "createdAt"';

@Injectable()
export class ReviewsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewsService.name);
  private readonly db: Pool;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor() {
    const connectionString = process.env.REVIEWS_DATABASE_URL;
    if (!connectionString) throw new Error('REVIEWS_DATABASE_URL is required');
    this.db = new Pool({ connectionString, connectionTimeoutMillis: 5_000 });
    this.db.on('error', () => this.logger.warn('An idle reviews database connection failed'));
  }

  onModuleInit() {
    this.timer = setInterval(() => this.flush(), 10_000);
    this.flush();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
    await this.db.end();
  }

  async find(bookingId: string, customerId: string) {
    const { rows: [review] } = await this.db.query<Review>(
      `SELECT ${reviewFields} FROM reviews WHERE booking_id = $1 AND customer_id = $2`, [bookingId, customerId]);
    return { review: review ?? null };
  }

  async exportByCustomer(customerId: string) {
    const { rows } = await this.db.query(
      `SELECT booking_id AS "bookingId", ${reviewFields} FROM reviews WHERE customer_id = $1 ORDER BY created_at DESC`, [customerId]);
    return rows;
  }

  async scrubByCustomer(customerId: string) {
    const result = await this.db.query(
      'UPDATE reviews SET customer_id = NULL, comment = NULL WHERE customer_id = $1', [customerId]);
    return { reviewsScrubbed: result.rowCount ?? 0 };
  }

  async create(bookingId: string, customerId: string, input: unknown) {
    const { rating, comment } = (input ?? {}) as { rating?: unknown; comment?: unknown };
    if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5 ||
      (comment !== undefined && (typeof comment !== 'string' || comment.length > 1000))) {
      throw new BadRequestException('Provide a rating from 1 to 5 and an optional comment of up to 1000 characters');
    }
    const base = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';
    const booking = await this.internal<{ status: string; professionalId: string | null }>(
      `${base}/bookings/${bookingId}?customerId=${customerId}`);
    if (booking.status !== 'confirmed' || !booking.professionalId) {
      throw new ConflictException('Only confirmed bookings with an assigned professional can be reviewed');
    }
    const normalizedComment = typeof comment === 'string' ? comment.trim() || null : null;
    const { rows: [created] } = await this.db.query<Review>(
      `INSERT INTO reviews (booking_id, customer_id, professional_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (booking_id) DO NOTHING RETURNING ${reviewFields}`,
      [bookingId, customerId, booking.professionalId, rating, normalizedComment]);
    const review = created ?? (await this.find(bookingId, customerId)).review;
    if (!review || review.rating !== rating || review.comment !== normalizedComment) {
      throw new ConflictException('This booking already has a review');
    }
    this.flush();
    return { review };
  }

  private flush() {
    this.running ??= this.project().catch(() => this.logger.warn('Review rating sync will retry'))
      .finally(() => { this.running = undefined; });
  }

  private async project() {
    const { rows } = await this.db.query<Projection>(
      `SELECT booking_id, professional_id, rating FROM reviews WHERE projected_at IS NULL
       ORDER BY projection_attempted_at NULLS FIRST, created_at, booking_id LIMIT 50`);
    const base = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';
    for (const row of rows) {
      try {
        await this.db.query('UPDATE reviews SET projection_attempted_at = NOW() WHERE booking_id = $1', [row.booking_id]);
        await this.internal(`${base}/review-ratings`, row);
        await this.db.query('UPDATE reviews SET projected_at = NOW() WHERE booking_id = $1', [row.booking_id]);
      } catch {
        this.logger.warn(`Rating sync pending for booking ${row.booking_id}`);
      }
    }
  }

  private async internal<T>(url: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException('Review dependency is unavailable');
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new HttpException(result ?? 'Review request failed', response.status);
    return result as T;
  }
}
