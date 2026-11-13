import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { PaymentsService } from './payments.service.js';
import { createStripeClient } from './stripe-client.js';

type Settlement = {
  bookingId: string; intentId: string; kind: 'refund' | 'transfer';
  amount: number | null; professionalId?: string | null;
};
type Attempt = {
  intent_id: string; kind: Settlement['kind']; amount_cents: number; destination: string | null;
  source_charge: string | null; started_at: Date; provider_id: string | null; completed: boolean;
};

@Injectable()
export class SettlementService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementService.name);
  private readonly stripe = createStripeClient();
  private readonly db = process.env.PAYMENTS_DATABASE_URL
    ? new Pool({ connectionString: process.env.PAYMENTS_DATABASE_URL, connectionTimeoutMillis: 5_000 })
    : undefined;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(private readonly payments: PaymentsService) {
    this.db?.on('error', () => this.logger.error('An idle settlement database connection failed'));
  }

  onModuleInit() {
    if (!this.db || process.env.PAYMENTS_REQUIRED !== 'true') return;
    this.timer = setInterval(() => this.tick(), 30_000);
    this.tick();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
    await this.db?.end();
  }

  private tick() {
    this.running ??= this.sweep().catch(() => this.logger.error('Could not load pending settlements'))
      .finally(() => { this.running = undefined; });
  }

  async sweep() {
    if (!this.db) return;
    const work = await this.payments.bookingRequest<Settlement[]>('/bookings/payment-settlements');
    for (const item of work) {
      try {
        await this.settle(item, this.db);
      } catch (error) {
        const reason = error instanceof Error ? error.name : 'UnknownError';
        this.logger.warn(`Settlement pending for booking ${item.bookingId}: ${reason}`);
      }
    }
  }

  private async settle(item: Settlement, db: Pool) {
    const { bookingId, intentId, amount, kind } = item;
    if (amount == null || !Number.isSafeInteger(amount) || amount < 0) throw new Error('Invalid amount');
    const { rows: [saved] } = await db.query<Attempt>('SELECT * FROM payment_settlements WHERE booking_id = $1', [bookingId]);
    const attempt = saved ?? await this.reserve(item, amount, db);
    if (!attempt) return; // The professional can complete onboarding and retry on a later sweep.
    if (attempt.intent_id !== intentId || attempt.kind !== kind || attempt.amount_cents !== amount) {
      throw new Error('Settlement no longer matches booking');
    }
    if (!attempt.completed) {
      if (amount === 0) {
        await this.saveResult(db, bookingId, null, true);
      } else {
        if (!attempt.provider_id && Date.now() - attempt.started_at.getTime() >= 23 * 60 * 60_000) {
          this.logger.error(`Reconcile the Stripe settlement for booking ${bookingId} before retrying`);
          return;
        }
        const key = { idempotencyKey: `plim-${kind}-${bookingId}` };
        const metadata = { plimBookingId: bookingId };
        if (kind === 'refund') {
          const refund = attempt.provider_id ? await this.stripe.refunds.retrieve(attempt.provider_id)
            : await this.stripe.refunds.create({ payment_intent: intentId, amount, metadata }, key);
          const succeeded = refund.status === 'succeeded';
          await this.saveResult(db, bookingId, refund.id, succeeded);
          if (refund.status === 'failed' || refund.status === 'canceled') {
            this.logger.error(`Refund ${refund.id} for booking ${bookingId} needs reconciliation`);
          }
          if (!succeeded) return;
        } else {
          if (!attempt.destination || !attempt.source_charge) throw new Error('Missing transfer details');
          const transfer = await this.stripe.transfers.create({
            amount, currency: 'eur', destination: attempt.destination, source_transaction: attempt.source_charge, metadata,
          }, key);
          await this.saveResult(db, bookingId, transfer.id, true);
        }
      }
    }
    await this.payments.bookingRequest(`/bookings/${bookingId}/payment-settled`, {});
  }

  private async reserve(item: Settlement, amount: number, db: Pool) {
    let destination: string | null = null;
    let charge: string | null = null;
    if (item.kind === 'transfer' && amount > 0) {
      if (!item.professionalId) throw new Error('Missing assigned professional');
      const { rows: [account] } = await db.query<{ stripe_account_id: string | null }>(
        'SELECT stripe_account_id FROM payout_accounts WHERE professional_id = $1', [item.professionalId],
      );
      if (!account?.stripe_account_id) return;
      const profile = await this.stripe.accounts.retrieve(account.stripe_account_id);
      if (!profile.payouts_enabled || profile.capabilities?.transfers !== 'active') return;
      const intent = await this.stripe.paymentIntents.retrieve(item.intentId);
      if (intent.status !== 'succeeded' || typeof intent.latest_charge !== 'string') throw new Error('Missing source charge');
      destination = account.stripe_account_id;
      charge = intent.latest_charge;
    }
    await db.query(
      `INSERT INTO payment_settlements (booking_id, kind, amount_cents, intent_id, destination, source_charge)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [item.bookingId, item.kind, amount, item.intentId, destination, charge],
    );
    const { rows: [attempt] } = await db.query<Attempt>('SELECT * FROM payment_settlements WHERE booking_id = $1', [item.bookingId]);
    return attempt;
  }

  private async saveResult(db: Pool, bookingId: string, providerId: string | null, completed: boolean) {
    await db.query(
      'UPDATE payment_settlements SET provider_id = $2, completed = completed OR $3 WHERE booking_id = $1',
      [bookingId, providerId, completed],
    );
  }
}
