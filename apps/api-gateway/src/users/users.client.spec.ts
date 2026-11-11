import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersClient } from './users.client.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('UsersClient', () => {
  let client: UsersClient;
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.USERS_SERVICE_URL = 'http://users.test';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal-secret';
    vi.stubGlobal('fetch', fetchMock); // no real network calls in unit tests
    fetchMock.mockReset();
    client = new UsersClient();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('findByAuth0Id() URL-encodes the Auth0 id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'uuid-1' }));

    await expect(client.findByAuth0Id('auth0|abc')).resolves.toEqual({ id: 'uuid-1' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://users.test/users/by-auth0/auth0%7Cabc');
  });

  it('sends the internal token so users-service accepts the call', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'uuid-1' }));

    await client.findByAuth0Id('auth0|abc');

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'X-Internal-Token': 'internal-secret' });
  });

  it('update() sends a PATCH for the caller only', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'uuid-1', name: 'Ana' }));

    await client.update('auth0|me', { name: 'Ana' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://users.test/users/by-auth0/auth0%7Cme');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Ana' });
  });

  it('applyAsProfessional() posts the application under the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'pro-1', status: 'applied' }));

    await client.applyAsProfessional('auth0|me', { nif: '123456789', activityRegistered: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://users.test/users/by-auth0/auth0%7Cme/professional');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ nif: '123456789', activityRegistered: true });
  });

  it('findProfessional() and updateProfessional() use the same path', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { id: 'pro-1' }));

    await client.findProfessional('auth0|me');
    await client.updateProfessional('auth0|me', { bio: 'Canalizador' });

    expect(fetchMock.mock.calls[0][0]).toBe('http://users.test/users/by-auth0/auth0%7Cme/professional');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined(); // GET
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
  });

  it('create() takes the Auth0 id from the token, not from the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'uuid-1' }));
    const sneaky = { email: 'a@b.com', auth0Id: 'auth0|someone-else' };

    await client.create('auth0|me', sneaky);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual({ email: 'a@b.com', auth0Id: 'auth0|me' });
  });

  it('document calls stay under the caller, whatever id is asked for', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    const base = 'http://users.test/users/by-auth0/auth0%7Cme/professional/documents';

    await client.requestDocumentUpload('auth0|me', { type: 'id_card', contentType: 'application/pdf', sizeBytes: 100 });
    await client.confirmDocumentUpload('auth0|me', 'doc-1');
    await client.documentDownloadUrl('auth0|me', 'doc-1');
    await client.deleteDocument('auth0|me', '../../other-user'); // a hostile id can't escape the caller's path

    expect(fetchMock.mock.calls.map(([url, init]) => `${init.method ?? 'GET'} ${url}`)).toEqual([
      `POST ${base}`,
      `POST ${base}/doc-1/confirm`,
      `GET ${base}/doc-1/download-url`,
      `DELETE ${base}/..%2F..%2Fother-user`,
    ]);
  });

  it('deleteDocument() copes with an empty 204 answer', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(client.deleteDocument('auth0|me', 'doc-1')).resolves.toBeUndefined();
  });

  it('admin decisions carry the admin id from the token, not one sent by the browser', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, {}));
    const sneaky = { decision: 'accepted' as const, reviewedBy: 'auth0|someone-else' };

    await client.adminReviewDocument('auth0|admin', 'pro-1', 'doc-1', sneaky);
    await client.adminApproveProfessional('auth0|admin', 'pro-1');
    await client.adminRejectProfessional('auth0|admin', 'pro-1', 'Seguro caducado');

    const calls = fetchMock.mock.calls.map(([url, init]) => [url.replace('http://users.test', ''), JSON.parse(init.body)]);
    expect(calls).toEqual([
      ['/admin/professionals/pro-1/documents/doc-1/review', { decision: 'accepted', reviewedBy: 'auth0|admin' }],
      ['/admin/professionals/pro-1/approve', { reviewedBy: 'auth0|admin' }],
      ['/admin/professionals/pro-1/reject', { reason: 'Seguro caducado', reviewedBy: 'auth0|admin' }],
    ]);
  });

  it('adminListProfessionals() filters by status when asked', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, []));

    await client.adminListProfessionals();
    await client.adminListProfessionals('applied');

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'http://users.test/admin/professionals',
      'http://users.test/admin/professionals?status=applied',
    ]);
  });

  it('passes error statuses from users-service through', async () => {
    fetchMock.mockResolvedValue(jsonResponse(409, { statusCode: 409, message: 'duplicate' }));

    const error = await client.create('auth0|me', { email: 'a@b.com' }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({ statusCode: 409, message: 'duplicate' });
  });

  it('returns 503 when users-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.findByAuth0Id('auth0|me')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
