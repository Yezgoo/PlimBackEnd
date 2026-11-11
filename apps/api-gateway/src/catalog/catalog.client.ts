import { Injectable } from '@nestjs/common';
import { callInternalService } from '../internal/internal-http.js';

export type Category = { id: string; name: string; slug: string; icon: string | null };

export type ServiceSummary = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricingModel: 'fixed' | 'quote';
  priceCents: number; // VAT included
  durationMinutes: number;
  category: Category;
};

export type ServiceDetail = ServiceSummary & {
  vatRate: number;
  includes: string[];
  excludes: string[];
  cancellationPolicy: string | null;
  faqs: { question: string; answer: string }[];
};

export type Area = {
  postalCode: string;
  municipality: { code: string; name: string; district: string } | null; // null = postal code we don't know
  available: boolean; // bookings are open there
};

export type SearchResult = { area: Area | null; services: ServiceSummary[] };

// Talks to catalog-service over plain HTTP.
@Injectable()
export class CatalogClient {
  private readonly baseUrl = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:3002';

  listCategories(): Promise<Category[]> {
    return this.request('/categories');
  }

  listServices(categorySlug?: string): Promise<ServiceSummary[]> {
    return this.request(`/services${this.query({ category: categorySlug })}`);
  }

  findService(slug: string): Promise<ServiceDetail> {
    return this.request(`/services/${encodeURIComponent(slug)}`);
  }

  findArea(postalCode: string): Promise<Area> {
    return this.request(`/areas/${encodeURIComponent(postalCode)}`);
  }

  search(text?: string, postalCode?: string): Promise<SearchResult> {
    return this.request(`/search${this.query({ q: text, postalCode })}`);
  }

  // builds "?a=1&b=2" from the values that were actually given
  private query(params: Record<string, string | undefined>) {
    const given = Object.entries(params).filter((entry): entry is [string, string] => !!entry[1]);
    return given.length ? `?${new URLSearchParams(given)}` : '';
  }

  private request<T>(path: string): Promise<T> {
    return callInternalService<T>('catalog-service', this.baseUrl, path);
  }
}
