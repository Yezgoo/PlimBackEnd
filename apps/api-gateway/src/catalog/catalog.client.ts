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

// Talks to catalog-service over plain HTTP.
@Injectable()
export class CatalogClient {
  private readonly baseUrl = process.env.CATALOG_SERVICE_URL ?? 'http://localhost:3002';

  listCategories(): Promise<Category[]> {
    return this.request('/categories');
  }

  listServices(categorySlug?: string): Promise<ServiceSummary[]> {
    const query = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : '';
    return this.request(`/services${query}`);
  }

  findService(slug: string): Promise<ServiceDetail> {
    return this.request(`/services/${encodeURIComponent(slug)}`);
  }

  private request<T>(path: string): Promise<T> {
    return callInternalService<T>('catalog-service', this.baseUrl, path);
  }
}
