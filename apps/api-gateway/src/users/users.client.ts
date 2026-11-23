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

export type SavedAddress = { id: string; label: string; street: string; details: string | null; postalCode: string; city: string | null };
export type SaveAddressInput = { label: string; street: string; details?: string; postalCode: string; city?: string };

export type RegisterUserInput = { email: string; name?: string; phone?: string; privacyVersion?: string };
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
  hasPhoto: boolean;
};

// What a customer sees about the professional who took their booking
export type PublicProfessional = {
  id: string;
  name: string | null;        // "Ana M."
  bio: string | null;
  photoUrl: string | null;    // short-lived signed link
  verified: boolean;
  ratingAvg: number | null;
  ratingCount: number;
  memberSince: string;        // "2026-11"
};
export type PhotoUploadTicket = { upload: { method: 'PUT'; url: string; headers: Record<string, string>; expiresInSeconds: number } };

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

export type ProDocument = {
  id: string;
  type: 'id_card' | 'activity_proof' | 'liability_insurance' | 'certificate';
  fileName: string | null;
  contentType: string;
  sizeBytes: number;
  status: 'uploading' | 'pending' | 'accepted' | 'rejected';
  rejectionReason: string | null;
  createdAt: string;
};
export type RequestUploadInput = { type: ProDocument['type']; contentType: string; sizeBytes: number; fileName?: string };
export type AvailabilityBlock = { weekday: number; start: string; end: string }; // weekday 1 = Monday ... 7 = Sunday
export type TimeOffInput = { startsAt: string; endsAt: string; reason?: string };
export type WorkSettings = {
  municipalityCodes: string[];
  serviceTypeIds: string[];
  availability: AvailabilityBlock[];
  timeOff: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
};

// what an admin sees: the application, who applied, their documents and what is still missing
export type AdminProfessional = ProfessionalProfile & {
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  user: { id: string; auth0Id: string; email: string; name: string | null; phone: string | null };
  documents: (ProDocument & { reviewedBy: string | null; reviewedAt: string | null })[];
  missingDocuments: ProDocument['type'][];
};
export type ReviewDocumentInput = { decision: 'accepted' | 'rejected'; reason?: string };

// where and how the app must upload the file
export type UploadTicket = {
  document: ProDocument;
  upload: { method: 'PUT'; url: string; headers: Record<string, string>; expiresInSeconds: number };
};

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

  listFavorites(auth0Id: string): Promise<{ favorites: string[] }> {
    return this.request(`${this.userPath(auth0Id)}/favorites`);
  }

  addFavorite(auth0Id: string, serviceSlug: string): Promise<{ favorites: string[] }> {
    return this.request(`${this.userPath(auth0Id)}/favorites/${encodeURIComponent(serviceSlug)}`, { method: 'PUT' });
  }

  removeFavorite(auth0Id: string, serviceSlug: string): Promise<{ favorites: string[] }> {
    return this.request(`${this.userPath(auth0Id)}/favorites/${encodeURIComponent(serviceSlug)}`, { method: 'DELETE' });
  }

  listAddresses(auth0Id: string): Promise<SavedAddress[]> {
    return this.request(`${this.userPath(auth0Id)}/addresses`);
  }

  saveAddress(auth0Id: string, input: SaveAddressInput): Promise<SavedAddress> {
    return this.request(`${this.userPath(auth0Id)}/addresses`, { method: 'POST', body: JSON.stringify(input) });
  }

  async deleteAddress(auth0Id: string, id: string): Promise<void> {
    await this.request(`${this.userPath(auth0Id)}/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' });
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

  // --- profile photo: the app uploads to storage itself, with the signed link from requestPhotoUpload ---

  requestPhotoUpload(auth0Id: string, input: { contentType: string; sizeBytes: number }): Promise<PhotoUploadTicket> {
    return this.request(`${this.userPath(auth0Id)}/professional/photo`, { method: 'POST', body: JSON.stringify(input) });
  }

  confirmPhotoUpload(auth0Id: string): Promise<{ hasPhoto: boolean }> {
    return this.request(`${this.userPath(auth0Id)}/professional/photo/confirm`, { method: 'POST' });
  }

  photoUrl(auth0Id: string): Promise<{ url: string; expiresInSeconds: number }> {
    return this.request(`${this.userPath(auth0Id)}/professional/photo/url`);
  }

  async deletePhoto(auth0Id: string): Promise<void> {
    await this.request(`${this.userPath(auth0Id)}/professional/photo`, { method: 'DELETE' });
  }

  publicProfessional(professionalId: string): Promise<PublicProfessional> {
    return this.request(`/professionals/${encodeURIComponent(professionalId)}/public`);
  }

  // --- verification documents: the app uploads to storage itself, with the signed link from requestUpload ---

  listDocuments(auth0Id: string): Promise<ProDocument[]> {
    return this.request(this.documentsPath(auth0Id));
  }

  requestDocumentUpload(auth0Id: string, input: RequestUploadInput): Promise<UploadTicket> {
    return this.request(this.documentsPath(auth0Id), { method: 'POST', body: JSON.stringify(input) });
  }

  confirmDocumentUpload(auth0Id: string, documentId: string): Promise<ProDocument> {
    return this.request(`${this.documentsPath(auth0Id)}/${encodeURIComponent(documentId)}/confirm`, { method: 'POST' });
  }

  documentDownloadUrl(auth0Id: string, documentId: string): Promise<{ url: string; expiresInSeconds: number }> {
    return this.request(`${this.documentsPath(auth0Id)}/${encodeURIComponent(documentId)}/download-url`);
  }

  async deleteDocument(auth0Id: string, documentId: string): Promise<void> {
    await this.request(`${this.documentsPath(auth0Id)}/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  }

  // --- where, what and when the professional works ---

  workSettings(auth0Id: string): Promise<WorkSettings> {
    return this.request(`${this.userPath(auth0Id)}/professional/work-settings`);
  }

  setAreas(auth0Id: string, municipalityCodes: string[]): Promise<WorkSettings> {
    return this.put(auth0Id, 'areas', { municipalityCodes });
  }

  setServices(auth0Id: string, serviceTypeIds: string[]): Promise<WorkSettings> {
    return this.put(auth0Id, 'services', { serviceTypeIds });
  }

  setAvailability(auth0Id: string, slots: AvailabilityBlock[]): Promise<WorkSettings> {
    return this.put(auth0Id, 'availability', { slots });
  }

  addTimeOff(auth0Id: string, input: TimeOffInput): Promise<WorkSettings> {
    return this.request(`${this.userPath(auth0Id)}/professional/time-off`, { method: 'POST', body: JSON.stringify(input) });
  }

  async removeTimeOff(auth0Id: string, timeOffId: string): Promise<void> {
    await this.request(`${this.userPath(auth0Id)}/professional/time-off/${encodeURIComponent(timeOffId)}`, { method: 'DELETE' });
  }

  private put(auth0Id: string, what: string, body: object): Promise<WorkSettings> {
    return this.request(`${this.userPath(auth0Id)}/professional/${what}`, { method: 'PUT', body: JSON.stringify(body) });
  }

  // --- admin: reviewing applications. `adminId` is the admin's Auth0 id, taken from their token. ---

  adminListProfessionals(status?: string): Promise<AdminProfessional[]> {
    return this.request(`/admin/professionals${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  }

  adminFindProfessional(id: string): Promise<AdminProfessional> {
    return this.request(this.adminPath(id));
  }

  adminDocumentDownloadUrl(id: string, documentId: string): Promise<{ url: string; expiresInSeconds: number }> {
    return this.request(`${this.adminPath(id)}/documents/${encodeURIComponent(documentId)}/download-url`);
  }

  adminPhotoUrl(id: string): Promise<{ url: string; expiresInSeconds: number }> {
    return this.request(`${this.adminPath(id)}/photo-url`);
  }

  adminReviewDocument(adminId: string, id: string, documentId: string, input: ReviewDocumentInput): Promise<AdminProfessional> {
    return this.request(`${this.adminPath(id)}/documents/${encodeURIComponent(documentId)}/review`, {
      method: 'POST',
      body: JSON.stringify({ ...input, reviewedBy: adminId }), // reviewedBy last: the browser can't choose it
    });
  }

  adminApproveProfessional(adminId: string, id: string): Promise<AdminProfessional> {
    return this.request(`${this.adminPath(id)}/approve`, { method: 'POST', body: JSON.stringify({ reviewedBy: adminId }) });
  }

  adminRejectProfessional(adminId: string, id: string, reason: string): Promise<AdminProfessional> {
    return this.request(`${this.adminPath(id)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason, reviewedBy: adminId }),
    });
  }

  private adminPath(professionalId: string) {
    return `/admin/professionals/${encodeURIComponent(professionalId)}`;
  }

  private documentsPath(auth0Id: string) {
    return `${this.userPath(auth0Id)}/professional/documents`;
  }

  // Auth0 ids contain "|" (e.g. "auth0|abc"), so they must be URL-encoded
  private userPath(auth0Id: string) {
    return `/users/by-auth0/${encodeURIComponent(auth0Id)}`;
  }

  private request<T>(path: string, init?: RequestInit): Promise<T> {
    return callInternalService<T>('users-service', this.baseUrl, path, init);
  }
}
