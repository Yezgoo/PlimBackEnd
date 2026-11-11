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

export type ProfessionalProfile = {
  id: string;
  userId: string;
  businessName: string | null;
  nif: string;
  activityRegistered: boolean;
  insurancePolicy: string | null;
  insuranceValidUntil: string | null; // "2027-12-31"
  bio: string | null;
  status: 'applied' | 'approved' | 'rejected' | 'suspended';
  verifiedAt: string | null;
  ratingAvg: number | null;
  ratingCount: number;
};

// users-service validates these and rejects any field that isn't listed (e.g. status)
export type ApplyProfessionalInput = {
  nif: string;
  activityRegistered: boolean;
  businessName?: string;
  bio?: string;
  insurancePolicy?: string;
  insuranceValidUntil?: string;
};
export type UpdateProfessionalInput = Partial<Omit<ApplyProfessionalInput, 'activityRegistered'>>;

// Talks to users-service over plain HTTP. The gateway never touches the users database itself.
@Injectable()
export class UsersClient {
  private readonly baseUrl = process.env.USERS_SERVICE_URL ?? 'http://localhost:3001';

  findByAuth0Id(auth0Id: string): Promise<UserProfile> {
    return this.request(this.userPath(auth0Id));
  }

  create(auth0Id: string, input: RegisterUserInput): Promise<UserProfile> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify({ ...input, auth0Id }), // auth0Id last: the client can't override it
    });
  }

  update(auth0Id: string, input: UpdateUserInput): Promise<UserProfile> {
    return this.request(this.userPath(auth0Id), { method: 'PATCH', body: JSON.stringify(input) });
  }

  findProfessional(auth0Id: string): Promise<ProfessionalProfile> {
    return this.request(`${this.userPath(auth0Id)}/professional`);
  }

  applyAsProfessional(auth0Id: string, input: ApplyProfessionalInput): Promise<ProfessionalProfile> {
    return this.request(`${this.userPath(auth0Id)}/professional`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateProfessional(auth0Id: string, input: UpdateProfessionalInput): Promise<ProfessionalProfile> {
    return this.request(`${this.userPath(auth0Id)}/professional`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  // Auth0 ids contain "|" (e.g. "auth0|abc"), so they must be URL-encoded
  private userPath(auth0Id: string) {
    return `/users/by-auth0/${encodeURIComponent(auth0Id)}`;
  }

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return callInternalService<T>('users-service', this.baseUrl, path, init);
  }
}
