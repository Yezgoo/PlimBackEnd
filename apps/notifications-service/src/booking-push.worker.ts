import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

type Job = { id: string; bookingId: string; token: string; userId: string; kind: string; expiresAt: string };
type Ticket = { status: 'ok' | 'error'; details?: { error?: string } };
const titles = new Map([
  ['offer', 'Tens um novo pedido'], ['accepted', 'Profissional atribuído'], ['en_route', 'Profissional a caminho'],
  ['in_progress', 'Serviço iniciado'], ['done', 'Serviço concluído'], ['confirmed', 'Conclusão confirmada'],
  ['cancelled', 'Marcação cancelada'],
]);

@Injectable()
export class BookingPushWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingPushWorker.name);
  private readonly url = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  onModuleInit() {
    if (process.env.EXPO_PUSH_ENABLED !== 'true') return;
    this.timer = setInterval(() => this.tick(), 5_000);
    this.tick();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  private tick() {
    this.running ??= this.sweep().catch(() => this.logger.warn('Booking push delivery will retry'))
      .finally(() => { this.running = undefined; });
  }

  async sweep() {
    const jobs = await this.internal<Job[]>('claim', {});
    if (!jobs.length) return;
    const accessToken = process.env.EXPO_PUSH_ACCESS_TOKEN;
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify(jobs.map(job => ({
        to: job.token, title: 'YezGoo', body: titles.get(job.kind) ?? 'Tens uma atualização',
        sound: 'default', priority: job.kind === 'offer' ? 'high' : 'default', channelId: 'bookings',
        expiration: Math.floor(Date.parse(job.expiresAt) / 1_000),
        data: job.kind === 'offer' ? { view: 'professional' } : { id: job.bookingId },
      }))),
    });
    if (!response.ok) throw new Error('Expo push request failed');
    const { data } = await response.json() as { data?: Ticket[] };
    if (!Array.isArray(data) || data.length !== jobs.length) throw new Error('Unexpected Expo push response');
    const processed: string[] = [];
    for (const [index, ticket] of data.entries()) {
      const job = jobs[index];
      if (ticket.details?.error === 'DeviceNotRegistered') {
        await this.internal('remove', { token: job.token, userId: job.userId });
      } else if (ticket.status === 'ok' || ticket.details?.error === 'MessageTooBig') {
        processed.push(job.id);
      }
    }
    if (processed.length) await this.internal('processed', { ids: processed });
  }

  private async internal<T>(action: string, body: object) {
    const response = await fetch(`${this.url}/booking-push/${action}`, {
      method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
    });
    if (!response.ok) throw new Error('Booking push request failed');
    return await response.json() as T;
  }
}
