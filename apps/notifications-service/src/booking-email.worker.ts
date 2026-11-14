import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { notificationRecipient } from './notification-recipient.js';

type Envelope = { from: string; to: string[]; subject: string; text: string };
type Job = {
  bookingId: string; customerId: string; serviceName: string; scheduledStart: string; totalCents: number;
  kind: 'receipt' | 'assigned' | 'completed'; envelope: Envelope | null;
};

const subject = {
  receipt: 'Pagamento recebido',
  assigned: 'Profissional atribuído à tua marcação',
  completed: 'Conclusão do serviço confirmada',
};
const date = new Intl.DateTimeFormat('pt-PT', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Lisbon' });
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

@Injectable()
export class BookingEmailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingEmailWorker.name);
  private readonly apiKey = process.env.RESEND_API_KEY;
  private readonly from = process.env.TRANSACTIONAL_EMAIL_FROM;
  private readonly bookingUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  onModuleInit() {
    if (!this.apiKey || !this.from) return;
    this.timer = setInterval(() => this.tick(), 30_000);
    this.tick();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  private tick() {
    this.running ??= this.sweep().catch(() => this.logger.warn('Could not load booking emails'))
      .finally(() => { this.running = undefined; });
  }

  async sweep() {
    if (!this.apiKey || !this.from) return;
    const jobs = await this.internal<Job[]>(this.bookingUrl, '/booking-emails');
    for (const job of jobs) {
      try {
        await this.deliver(job, this.from);
      } catch {
        this.logger.warn(`Email pending for booking ${job.bookingId} (${job.kind})`);
      }
    }
  }

  private async deliver(job: Job, from: string) {
    const path = `/booking-emails/${job.bookingId}/${job.kind}`;
    const recipient = await notificationRecipient(job.customerId);
    if (!recipient) return;
    const envelope = job.envelope ?? this.compose(job, from, recipient.email);
    const attempt = await this.internal<{ envelope: Envelope | null }>(this.bookingUrl, `${path}/attempt`, envelope);
    if (!attempt.envelope) return;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `booking/${job.bookingId}/${job.kind}`,
      },
      body: JSON.stringify(attempt.envelope),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Email provider rejected the request');
    await this.internal(this.bookingUrl, `${path}/sent`, {});
  }

  private compose(job: Job, from: string, email: string): Envelope {
    const message = job.kind === 'receipt' ? `Montante recebido: ${money.format(job.totalCents / 100)}.` : '';
    const link = new URL(process.env.TRANSACTIONAL_BOOKINGS_URL ?? 'http://localhost:8081/bookings');
    link.searchParams.set('id', job.bookingId);
    return {
      from, to: [email], subject: `YezGoo · ${subject[job.kind]}`,
      text: [
        subject[job.kind], job.serviceName, date.format(new Date(job.scheduledStart)), message,
        `Referência: ${job.bookingId}`, `Ver marcação: ${link.href}`,
      ].filter(Boolean).join('\n\n'),
    };
  }

  private async internal<T>(base: string, path: string, body?: object): Promise<T> {
    const response = await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Internal email request failed');
    return await response.json() as T;
  }
}
