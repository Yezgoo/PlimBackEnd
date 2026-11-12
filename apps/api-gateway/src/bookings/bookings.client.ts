import { Injectable } from '@nestjs/common';
import { callInternalService } from '../internal/internal-http.js';

export type BookingAddress = { street: string; details?: string; postalCode: string; city: string };
export type ReviewedPrice = { priceCents: number; serviceFeeCents: number };

// What booking-service needs to create a booking. Every value here was looked up by the gateway
// (customer from the token, service and price from the catalog), never taken as-is from the app.
export type BookingRequest = {
  customerId: string;
  service: { id: string; slug: string; name: string; durationMinutes: number; priceCents: number; vatRate: number };
  address: BookingAddress;
  municipalityCode: string;
  scheduledStart: string;
  notes?: string;
  serviceFeeCents: number;
  commissionBps: number;
  reviewedPrice?: ReviewedPrice;
};

export type BookingSummary = {
  service: { id: string; slug: string; name: string; durationMinutes: number };
  address: BookingAddress;
  municipalityCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  priceCents: number;
  serviceFeeCents: number;
  vatRate: number;
  totalCents: number;
  currency: string;
  notes: string | null;
};

export type BookingStatus =
  | 'pending_payment' | 'finding_pro' | 'accepted' | 'en_route' | 'in_progress' | 'done' | 'confirmed' | 'cancelled' | 'disputed';

export type Booking = {
  id: string;
  customerId: string;
  professionalId: string | null;
  serviceTypeId: string;
  serviceSlug: string;
  serviceName: string;
  durationMinutes: number;
  address: BookingAddress;
  municipalityCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  priceCents: number;
  serviceFeeCents: number;
  vatRate: number;
  totalCents: number;
  proPayoutCents?: number | null;
  currency: string;
  notes: string | null;
  status: BookingStatus;
  createdAt: string;
  events?: { fromStatus: BookingStatus | null; toStatus: BookingStatus; at: string }[];
};

// A job offered to a professional. The full address and the notes are only filled in once accepted.
export type JobOffer = {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  offeredAt: string;
  expiresAt: string;
  respondedAt: string | null;
  booking: {
    id: string;
    status: BookingStatus;
    serviceName: string;
    durationMinutes: number;
    scheduledStart: string;
    scheduledEnd: string;
    priceCents: number;
    proPayoutCents: number | null;
    currency: string;
    city: string;
    postalArea: string;
    address: BookingAddress | null;
    notes: string | null;
  };
};

// Talks to booking-service over plain HTTP.
@Injectable()
export class BookingsClient {
  private readonly baseUrl = process.env.BOOKING_SERVICE_URL ?? 'http://localhost:3003';

  preview(request: BookingRequest): Promise<BookingSummary> {
    return this.request('/bookings/preview', { method: 'POST', body: JSON.stringify(request) });
  }

  create(request: BookingRequest): Promise<Booking> {
    return this.request('/bookings', { method: 'POST', body: JSON.stringify(request) });
  }

  listForCustomer(customerId: string): Promise<Booking[]> {
    return this.request(`/bookings?customerId=${encodeURIComponent(customerId)}`);
  }

  findForCustomer(id: string, customerId: string): Promise<Booking> {
    return this.request(`/bookings/${encodeURIComponent(id)}?customerId=${encodeURIComponent(customerId)}`);
  }

  listForProfessional(professionalId: string): Promise<Booking[]> {
    return this.request(`/bookings/professional?professionalId=${encodeURIComponent(professionalId)}`);
  }

  findForProfessional(id: string, professionalId: string): Promise<Booking> {
    return this.request(`/bookings/professional/${encodeURIComponent(id)}?professionalId=${encodeURIComponent(professionalId)}`);
  }

  advanceForProfessional(id: string, professionalId: string, status: unknown): Promise<Booking> {
    return this.request(`/bookings/professional/${encodeURIComponent(id)}/status?professionalId=${encodeURIComponent(professionalId)}`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  // --- job offers, as the professional sees them ---

  listOffers(professionalId: string, status?: string): Promise<JobOffer[]> {
    const filter = status ? `&status=${encodeURIComponent(status)}` : '';
    return this.request(`/offers?professionalId=${encodeURIComponent(professionalId)}${filter}`);
  }

  acceptOffer(offerId: string, professionalId: string): Promise<JobOffer> {
    return this.answerOffer(offerId, professionalId, 'accept');
  }

  declineOffer(offerId: string, professionalId: string): Promise<JobOffer> {
    return this.answerOffer(offerId, professionalId, 'decline');
  }

  private answerOffer(offerId: string, professionalId: string, answer: 'accept' | 'decline'): Promise<JobOffer> {
    const path = `/offers/${encodeURIComponent(offerId)}/${answer}?professionalId=${encodeURIComponent(professionalId)}`;
    return this.request(path, { method: 'POST' });
  }

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return callInternalService<T>('booking-service', this.baseUrl, path, init);
  }
}
