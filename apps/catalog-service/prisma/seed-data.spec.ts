import { describe, expect, it } from 'vitest';
import { categories, municipalities, services } from './seed-data.mjs';

// Catches typos in the pilot catalog before they reach the database.
describe('pilot catalog seed data', () => {
  const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

  it('gives each postal prefix to exactly one municipality', () => {
    const prefixes = municipalities.flatMap((municipality) => municipality.postalPrefixes);

    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) expect(prefix).toMatch(/^\d{4}$/);
    for (const municipality of municipalities) expect(municipality.code).toMatch(/^\d{4}$/);
  });

  it('opens the pilot in Coimbra', () => {
    expect(municipalities.filter((municipality) => municipality.pilot).map((m) => m.name)).toEqual(['Coimbra']);
  });

  it('has unique, URL-safe slugs', () => {
    const slugs = [...categories, ...services].map((item) => item.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(slugPattern);
  });

  it('puts every service in a category that exists', () => {
    const categorySlugs = new Set(categories.map((category) => category.slug));

    for (const service of services) expect(categorySlugs).toContain(service.category);
  });

  it('gives every service a price in whole cents, a duration and a clear scope', () => {
    for (const service of services) {
      expect(Number.isInteger(service.priceCents)).toBe(true);
      expect(service.priceCents).toBeGreaterThan(0);
      expect(service.durationMinutes).toBeGreaterThan(0);
      expect(service.includes.length).toBeGreaterThan(0);
      expect(service.excludes.length).toBeGreaterThan(0);
      expect(service.faqs.length).toBeGreaterThan(0);
    }
  });

  it('matches the pilot price list', () => {
    const prices = Object.fromEntries(services.map((service) => [service.slug, service.priceCents]));

    expect(prices).toEqual({
      'limpeza-domestica-3h': 4500,
      'desentupimento-lavatorio-sanita': 6500,
      'substituicao-tomada-interruptor': 3500,
      'montagem-movel-2h': 4000,
      'reparacao-maquina-lavar': 5500,
    });
  });
});
