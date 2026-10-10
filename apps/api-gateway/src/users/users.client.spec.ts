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
    vi.stubGlobal('fetch', fetchMock); // no real network calls in unit tests
    fetchMock.mockReset();
    client = new UsersClient();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('findByAuth0Id() URL-encodes the Auth0 id', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'uuid-1' }));

    await expect(client.findByAuth0Id('auth0|abc')).resolves.toEqual({ id: 'uuid-1' });
    expect(fetchMock).toHaveBeenCalledWith('http://users.test/users/by-auth0/auth0%7Cabc', undefined);
  });

  it('create() takes the Auth0 id from the token, not from the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'uuid-1' }));
    const sneaky = { email: 'a@b.com', auth0Id: 'auth0|someone-else' };

    await client.create('auth0|me', sneaky);

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual({ email: 'a@b.com', auth0Id: 'auth0|me' });
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
