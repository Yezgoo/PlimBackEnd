import { Injectable } from '@nestjs/common';
import { callInternalService } from '../internal/internal-http.js';

export type BookingAddress = { street: string; details?: string; postalCode: string; city: string };

// What booking-service needs to create a booking. Every value here was looked up by the gateway
// (customer from the token, service and price from the catalog), never taken as-is from the app.
export type BookingRequest = {
  customerId: string;
  service: { id: string; slug: string; name: string; durationMinutes: number; priceCents: number; vatRate: number };
  address: BookingAddress;
  municipalityCode: string;
  scheduledStart: string;
  notes?: string;
};

export type BookingSummary = {
  service: { id: string; slug: string; name: string; durationMinutes: number };
  address: BookingAddress;
  municipalityCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  priceCents: number;
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
  vatRate: number;
  totalCents: number;
  currency: string;
  notes: string | null;
  status: BookingStatus;
  createdAt: string;
  events?: { fromStatus: BookingStatus | null; toStatus: BookingStatus; at: string }[];
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

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return callInternalService<T>('booking-service', this.baseUrl, path, init);
  }
}
