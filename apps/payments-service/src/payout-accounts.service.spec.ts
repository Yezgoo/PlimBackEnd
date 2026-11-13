import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutAccountsService } from './payout-accounts.service.js';

const mocks = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), retrieve: vi.fn(), link: vi.fn() }));
vi.mock('pg', () => ({ Pool: class {
  query = mocks.query;
  on() {}
} }));
vi.mock('./stripe-client.js', () => ({
  createStripeClient: () => ({ accounts: { create: mocks.create, retrieve: mocks.retrieve }, accountLinks: { create: mocks.link } }),
}));

describe('Stripe Connect payout accounts', () => {
  const professional = '11111111-1111-4111-8111-111111111111';
  const account = 'acct_fixture';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('PAYMENTS_DATABASE_URL', 'postgresql://localhost/payments_test');
    vi.stubEnv('CONNECT_RETURN_URL', 'https://app.example/bookings');
  });

  it('persists the connected account and uses it for subsequent links', async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ stripe_account_id: null, created_at: new Date() }] })
      .mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ stripe_account_id: account }] });
    mocks.create.mockResolvedValue({ id: account });
    mocks.link.mockResolvedValue({ url: 'https://connect.stripe.com/setup/fixture' });
    const service = new PayoutAccountsService();
    await service.onboarding(professional);
    await service.onboarding(professional);

    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      country: 'PT', type: 'express', capabilities: { transfers: { requested: true } },
    }), { idempotencyKey: `plim-payout-${professional}` });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE payout_accounts'), [professional, account]);
    expect(mocks.link).toHaveBeenLastCalledWith({
      account, type: 'account_onboarding',
      return_url: 'https://app.example/bookings?view=professional&connect=returned',
      refresh_url: 'https://app.example/bookings?view=professional&connect=refresh',
    });
  });

  it('requires active transfers and enabled payouts before reporting ready', async () => {
    mocks.query.mockResolvedValue({ rows: [{ stripe_account_id: account }] });
    mocks.retrieve.mockResolvedValueOnce({ payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'pending' } })
      .mockResolvedValueOnce({ payouts_enabled: true, capabilities: { transfers: 'active' } });
    const service = new PayoutAccountsService();
    await expect(service.status(professional)).resolves.toEqual({ status: 'restricted' });
    await expect(service.status(professional)).resolves.toEqual({ status: 'ready' });
  });

  it('keeps an old ambiguous attempt for reconciliation', async () => {
    mocks.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rows: [{ stripe_account_id: null, created_at: new Date(0) }] });
    await expect(new PayoutAccountsService().onboarding(professional)).rejects.toThrow('needs reconciliation');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
