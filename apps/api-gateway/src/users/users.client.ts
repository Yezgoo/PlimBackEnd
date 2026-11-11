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

  findProfessional(auth0Id: string): Promise<ProfessionalProfile> {
    return this.request(`${this.userPath(auth0Id)}/professional`);
  }

  applyAsProfessional(auth0Id: string, input: ApplyProfessionalInput): Promise<ProfessionalProfile> {
    return this.request(`${this.userPath(auth0Id)}/professional`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateProfessional(auth0Id: string, input: UpdateProfessionalInput): Promise<ProfessionalProfile> {
    return this.request(`${this.userPath(auth0Id)}/professional`, { method: 'PATCH', body: JSON.stringify(input) });
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
