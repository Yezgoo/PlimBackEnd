import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaymentsService } from './payments.service.js';
import { SettlementService } from './settlement.service.js';

const mocks = vi.hoisted(() => ({ query: vi.fn(), refund: vi.fn(), retrieveRefund: vi.fn(), transfer: vi.fn() }));
vi.mock('pg', () => ({ Pool: class {
  query = mocks.query;
  on() {}
} }));
vi.mock('./stripe-client.js', () => ({
  createStripeClient: () => ({
    refunds: { create: mocks.refund, retrieve: mocks.retrieveRefund },
    transfers: { create: mocks.transfer },
  }),
}));

describe('settlement worker', () => {
  const bookingRequest = vi.fn();
  const bookingId = '11111111-1111-4111-8111-111111111111';
  const refund = { bookingId, intentId: 'pi_fixture', kind: 'refund', amount: 4700 };
  const attempt = () => ({
    kind: 'refund', amount_cents: 4700, intent_id: 'pi_fixture',
    provider_id: null, completed: false, started_at: new Date(),
  });
  const service = () => new SettlementService({ bookingRequest } as unknown as PaymentsService);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PAYMENTS_DATABASE_URL', 'postgresql://localhost/payments_test');
    bookingRequest.mockResolvedValueOnce([refund]);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('keeps a pending refund open and checks its provider status on the next run', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [attempt()] }).mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ ...attempt(), provider_id: 're_fixture' }] }).mockResolvedValueOnce({});
    mocks.refund.mockResolvedValue({ id: 're_fixture', status: 'pending' });
    mocks.retrieveRefund.mockResolvedValue({ id: 're_fixture', status: 'succeeded' });
    const worker = service();
    await worker.sweep();
    expect(bookingRequest).toHaveBeenCalledTimes(1);
    bookingRequest.mockResolvedValueOnce([refund]);
    await worker.sweep();
    expect(mocks.refund).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ amount: 4700, payment_intent: 'pi_fixture' }),
      { idempotencyKey: `plim-refund-${bookingId}` });
    expect(mocks.retrieveRefund).toHaveBeenCalledWith('re_fixture');
    expect(bookingRequest).toHaveBeenLastCalledWith(`/bookings/${bookingId}/payment-settled`, {});
  });

  it('acknowledges an already completed settlement without moving money twice', async () => {
    mocks.query.mockResolvedValue({ rows: [{ ...attempt(), completed: true, provider_id: 're_fixture' }] });
    await service().sweep();
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(bookingRequest).toHaveBeenLastCalledWith(`/bookings/${bookingId}/payment-settled`, {});
  });

  it('does not resubmit an ambiguous operation after the retry window', async () => {
    mocks.query.mockResolvedValue({ rows: [{ ...attempt(), started_at: new Date(0) }] });
    await service().sweep();
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(bookingRequest).toHaveBeenCalledTimes(1);
  });

  it('transfers the stored professional share against the source charge', async () => {
    bookingRequest.mockReset().mockResolvedValueOnce([{ ...refund, kind: 'transfer', amount: 3600 }]);
    mocks.query.mockResolvedValueOnce({ rows: [{
      ...attempt(), kind: 'transfer', amount_cents: 3600, destination: 'acct_fixture', source_charge: 'ch_fixture',
    }] }).mockResolvedValueOnce({});
    mocks.transfer.mockResolvedValue({ id: 'tr_fixture' });
    await service().sweep();
    expect(mocks.transfer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      amount: 3600, currency: 'eur', destination: 'acct_fixture', source_transaction: 'ch_fixture',
    }), { idempotencyKey: `plim-transfer-${bookingId}` });
  });
});
