import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { createStripeClient } from './stripe-client.js';

@Injectable()
export class PayoutAccountsService implements OnModuleDestroy {
  private readonly logger = new Logger(PayoutAccountsService.name);
  private readonly stripe = createStripeClient();
  private readonly database = process.env.PAYMENTS_DATABASE_URL
    ? new Pool({ connectionString: process.env.PAYMENTS_DATABASE_URL, connectionTimeoutMillis: 5_000 })
    : undefined;

  constructor() {
    this.database?.on('error', () => this.logger.error('An idle payments database connection failed'));
  }

  async onModuleDestroy() {
    await this.database?.end();
  }

  async status(professionalId: string) {
    const { rows: [record] } = await this.db().query<{ stripe_account_id: string | null }>(
      'SELECT stripe_account_id FROM payout_accounts WHERE professional_id = $1', [professionalId],
    );
    if (!record?.stripe_account_id) return { status: 'not_started' };
    const account = await this.provider(() => this.stripe.accounts.retrieve(record.stripe_account_id!));
    return {
      status: account.payouts_enabled && account.capabilities?.transfers === 'active'
        ? 'ready'
        : account.requirements?.disabled_reason === 'requirements.pending_verification' ||
            (account.requirements?.pending_verification?.length && !account.requirements.currently_due?.length)
          ? 'in_review' : account.details_submitted ? 'restricted' : 'incomplete',
    };
  }

  async eraseLocalLink(professionalId: string) {
    const result = await this.db().query('DELETE FROM payout_accounts WHERE professional_id = $1', [professionalId]);
    return { removed: Boolean(result.rowCount) };
  }

  async onboarding(professionalId: string) {
    const returnUrl = this.destination('returned');
    const refreshUrl = this.destination('refresh');
    const db = this.db();
    await db.query('INSERT INTO payout_accounts (professional_id) VALUES ($1) ON CONFLICT DO NOTHING', [professionalId]);
    const { rows: [record] } = await db.query<{ stripe_account_id: string | null; created_at: Date }>(
      'SELECT stripe_account_id, created_at FROM payout_accounts WHERE professional_id = $1', [professionalId],
    );
    let accountId = record.stripe_account_id;
    if (!accountId) {
      // Preserve the attempt before contacting Stripe. Stop blind retries before its
      // idempotency key can expire, so an ambiguous failure cannot create another account.
      if (Date.now() - record.created_at.getTime() >= 23 * 60 * 60_000) {
        throw new ConflictException('The pending Stripe account needs reconciliation');
      }
      const account = await this.provider(() => this.stripe.accounts.create({
        type: 'express',
        country: 'PT',
        capabilities: { transfers: { requested: true } },
        metadata: { plimProfessionalId: professionalId },
      }, { idempotencyKey: `plim-payout-${professionalId}` }));
      await db.query('UPDATE payout_accounts SET stripe_account_id = $2 WHERE professional_id = $1', [professionalId, account.id]);
      accountId = account.id;
    }
    const link = await this.provider(() => this.stripe.accountLinks.create({
      account: accountId, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl,
    }));
    return { url: link.url };
  }

  private destination(result: string) {
    const url = new URL(process.env.CONNECT_RETURN_URL ?? 'http://localhost:8081/bookings');
    url.searchParams.set('view', 'professional');
    url.searchParams.set('connect', result);
    return url.href;
  }

  private db() {
    if (!this.database) throw new ServiceUnavailableException('Payout accounts are not configured');
    return this.database;
  }

  private async provider<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.name : 'Stripe request failed');
      throw new ServiceUnavailableException('Stripe Connect is unavailable');
    }
  }
}
