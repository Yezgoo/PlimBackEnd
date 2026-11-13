import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

const bookingId = '11111111-1111-4111-8111-111111111111';
const secret = 'whsec_fixture';

describe('Stripe payment webhook', () => {
  const fetchMock = vi.fn();
  const stripe = new Stripe('sk_test_fixture');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    vi.stubEnv('BOOKING_SERVICE_URL', 'http://booking.test');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function signedEvent(type: string, livemode = false) {
    const payload = JSON.stringify({
      id: 'evt_fixture', type, livemode,
      data: { object: { id: 'pi_fixture', currency: 'eur', amount_received: 6700, metadata: { plimBookingId: bookingId } } },
    });
    return { body: Buffer.from(payload), signature: stripe.webhooks.generateTestHeaderString({ payload, secret }) };
  }

  it('forwards a signed success with the provider payment ID and received amount', async () => {
    fetchMock.mockResolvedValue(Response.json({ received: true }));
    const { body, signature } = signedEvent('payment_intent.succeeded');
    await expect(new PaymentsService().webhook(body, signature)).resolves.toEqual({ received: true });
    expect(fetchMock).toHaveBeenCalledWith(`http://booking.test/bookings/${bookingId}/payment-succeeded`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ intentId: 'pi_fixture', eventId: 'evt_fixture', amountCents: 6700, currency: 'eur' }),
    }));
  });

  it('ignores a processing payment and rejects an invalid signature or live event', async () => {
    const service = new PaymentsService();
    const pending = signedEvent('payment_intent.processing');
    await service.webhook(pending.body, pending.signature);
    await expect(service.webhook(pending.body, 'invalid')).rejects.toThrow('Invalid Stripe webhook signature');
    const live = signedEvent('payment_intent.succeeded', true);
    await expect(service.webhook(live.body, live.signature)).rejects.toThrow('Only Stripe test events');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
