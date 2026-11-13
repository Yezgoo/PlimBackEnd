import { BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { createStripeClient } from './stripe-client.js';

type Booking = { id: string; status: string; totalCents: number; currency: string; serviceName: string; createdAt: string; scheduledStart: string };

@Injectable()
export class PaymentsService {
  private readonly bookingUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';
  private readonly returnUrl = process.env.PAYMENTS_RETURN_URL ?? 'http://localhost:8081/bookings';
  private readonly stripe: Stripe;
  private readonly signingSecret: string;

  constructor() {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret?.startsWith('whsec_')) throw new Error('Configure a Stripe webhook signing secret');
    this.stripe = createStripeClient();
    this.signingSecret = secret;
  }

  async checkout(id: string, customerId: string) {
    const booking = await this.bookingRequest<Booking>(`/bookings/${id}?customerId=${customerId}`);
    if (booking.status !== 'pending_payment' || booking.currency !== 'EUR' ||
        Date.now() >= Date.parse(booking.scheduledStart) ||
        Date.now() - Date.parse(booking.createdAt) >= 23 * 60 * 60_000) {
      throw new ConflictException('This booking is no longer payable');
    }

    // A fixed key makes retries reuse the same Checkout Session. The booking age
    // limit keeps all attempts within Stripe's minimum idempotency retention.
    const destination = new URL(this.returnUrl);
    destination.searchParams.set('id', id);
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_configuration: process.env.STRIPE_PAYMENT_METHOD_CONFIGURATION || undefined,
        line_items: [{ quantity: 1, price_data: {
          currency: 'eur', unit_amount: booking.totalCents, product_data: { name: booking.serviceName },
        } }],
        success_url: destination.href,
        cancel_url: destination.href,
        payment_intent_data: { metadata: { plimBookingId: id } },
      }, { idempotencyKey: `plim-booking-${id}` });
      session = await this.stripe.checkout.sessions.retrieve(session.id);
    } catch {
      throw new ServiceUnavailableException('Stripe Checkout is unavailable');
    }
    if (session.status !== 'open' || !session.url) throw new ConflictException('Checkout is closed or payment is processing');
    return { url: session.url };
  }

  async webhook(rawBody?: Buffer, signature?: string) {
    if (!rawBody || !signature) throw new BadRequestException('Missing Stripe webhook signature');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.signingSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
    if (event.livemode) throw new BadRequestException('Only Stripe test events are accepted');
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const bookingId = intent.metadata.plimBookingId;
      if (bookingId && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(bookingId)) {
        await this.bookingRequest(`/bookings/${bookingId}/payment-succeeded`, {
          intentId: intent.id, eventId: event.id, amountCents: intent.amount_received, currency: intent.currency,
        });
      }
    }
    return { received: true };
  }

  async bookingRequest<T>(path: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.bookingUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN ?? '' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException('Booking service is unavailable');
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new HttpException(result ?? 'Booking request failed', response.status);
    return result as T;
  }
}
