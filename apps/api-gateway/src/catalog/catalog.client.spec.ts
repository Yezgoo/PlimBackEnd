import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogClient } from './catalog.client.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('CatalogClient', () => {
  let client: CatalogClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.CATALOG_SERVICE_URL = 'http://catalog.test';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
    vi.stubGlobal('fetch', fetchMock); // no real network calls in unit tests
    fetchMock.mockReset();
    client = new CatalogClient();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('listCategories() calls catalog-service with the internal token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await client.listCategories();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://catalog.test/categories');
    expect(init.headers).toMatchObject({ 'X-Internal-Token': 'internal-secret' });
  });

  it('listServices() adds the category filter only when given', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, []));

    await client.listServices();
    await client.listServices('pequenas reparações');

    expect(fetchMock.mock.calls[0][0]).toBe('http://catalog.test/services');
    expect(fetchMock.mock.calls[1][0]).toBe('http://catalog.test/services?category=pequenas+repara%C3%A7%C3%B5es');
  });

  it('search() sends only the filters that were given', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { area: null, services: [] }));

    await client.search();
    await client.search('máquina lavar');
    await client.search(undefined, '3000-123');
    await client.search('limpeza', '3000-123');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://catalog.test/search',
      'http://catalog.test/search?q=m%C3%A1quina+lavar',
      'http://catalog.test/search?postalCode=3000-123',
      'http://catalog.test/search?q=limpeza&postalCode=3000-123',
    ]);
  });

  it('findArea() asks catalog-service about a postal code', async () => {
    const area = { postalCode: '3000-123', municipality: { code: '0603', name: 'Coimbra', district: 'Coimbra' }, available: true };
    fetchMock.mockResolvedValue(jsonResponse(200, area));

    await expect(client.findArea('3000-123')).resolves.toEqual(area);
    expect(fetchMock.mock.calls[0][0]).toBe('http://catalog.test/areas/3000-123');
  });

  it('findService() passes a 404 from catalog-service through', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { statusCode: 404, message: 'Service nope not found' }));

    const error = await client.findService('nope').catch((e) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(404);
  });

  it('returns 503 when catalog-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.listCategories()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
