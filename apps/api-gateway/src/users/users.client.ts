import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';

export type UserProfile = {
  id: string;
  auth0Id: string;
  email: string;
  name: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RegisterUserInput = { email: string; name?: string; phone?: string };

// Talks to users-service over plain HTTP. The gateway never touches the users database itself.
@Injectable()
export class UsersClient {
  private readonly baseUrl = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';

  findByAuth0Id(auth0Id: string): Promise<UserProfile> {
    // Auth0 ids contain "|" (e.g. "auth0|abc"), so they must be URL-encoded
    return this.request(`/users/by-auth0/${encodeURIComponent(auth0Id)}`);
  }

  create(auth0Id: string, input: RegisterUserInput): Promise<UserProfile> {
    return this.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, auth0Id }), // auth0Id last: the client can't override it
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, init);
    } catch {
      // users-service is down or unreachable
      throw new ServiceUnavailableException('users-service is unavailable');
    }

    const body = await response.json().catch(() => undefined);
    // pass users-service's 400/404/409 straight through to the caller
    if (!response.ok) throw new HttpException(body ?? response.statusText, response.status);
    return body as T;
  }
}
