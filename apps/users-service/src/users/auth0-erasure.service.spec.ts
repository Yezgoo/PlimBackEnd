import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Auth0ErasureService } from './auth0-erasure.service.js';

beforeEach(() => {
  vi.stubEnv('AUTH0_ISSUER_URL', 'https://tenant.example.test/');
  vi.stubEnv('AUTH0_MANAGEMENT_CLIENT_ID', 'client');
  vi.stubEnv('AUTH0_MANAGEMENT_CLIENT_SECRET', 'fixture');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([204, 404])('accepts Auth0 deletion status %s', async status => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'token' }))
    .mockResolvedValueOnce(new Response(null, { status }));
  vi.stubGlobal('fetch', fetch);
  await expect(new Auth0ErasureService().remove('auth0|user')).resolves.toBeUndefined();
  expect(String(fetch.mock.calls[1][0])).toBe('https://tenant.example.test/api/v2/users/auth0%7Cuser');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer token' } });
});

it('fails finalization when Auth0 denies deletion', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'token' }))
    .mockResolvedValueOnce(new Response(null, { status: 403 })));
  await expect(new Auth0ErasureService().remove('auth0|user')).rejects.toBeInstanceOf(ServiceUnavailableException);
});
