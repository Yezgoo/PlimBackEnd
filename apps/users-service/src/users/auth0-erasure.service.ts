import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class Auth0ErasureService {
  async remove(subject: string) {
    const { AUTH0_ISSUER_URL, AUTH0_MANAGEMENT_CLIENT_ID, AUTH0_MANAGEMENT_CLIENT_SECRET } = process.env;
    if (!AUTH0_ISSUER_URL || !AUTH0_MANAGEMENT_CLIENT_ID || !AUTH0_MANAGEMENT_CLIENT_SECRET) {
      throw new ServiceUnavailableException('Auth0 erasure is not configured');
    }
    const api = new URL('/api/v2/', AUTH0_ISSUER_URL);
    try {
      const token = await fetch(new URL('/oauth/token', api), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          grant_type: 'client_credentials', audience: api.href,
          client_id: AUTH0_MANAGEMENT_CLIENT_ID, client_secret: AUTH0_MANAGEMENT_CLIENT_SECRET,
        }),
      });
      if (!token.ok) throw new Error();
      const { access_token: accessToken } = await token.json() as { access_token?: string };
      if (!accessToken) throw new Error();
      const deleted = await fetch(new URL(`users/${encodeURIComponent(subject)}`, api), {
        method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000),
      });
      if (deleted.status !== 204 && deleted.status !== 404) throw new Error();
    } catch {
      throw new ServiceUnavailableException('Auth0 account erasure could not be confirmed');
    }
  }
}
