import { Injectable } from '@nestjs/common';
import { callInternalService } from '../internal/internal-http.js';

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
export type UpdateUserInput = { name?: string; phone?: string };

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
      body: JSON.stringify({ ...input, auth0Id }), // auth0Id last: the client can't override it
    });
  }

  update(auth0Id: string, input: UpdateUserInput): Promise<UserProfile> {
    return this.request(`/users/by-auth0/${encodeURIComponent(auth0Id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return callInternalService<T>('users-service', this.baseUrl, path, init);
  }
}
