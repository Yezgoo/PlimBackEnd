import Stripe from 'stripe';

export function createStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new Error('Configure a Stripe test secret key');
  return new Stripe(key, { timeout: 10_000, maxNetworkRetries: 2 });
}
