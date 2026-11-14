import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { OutboxRelay } from '../events/outbox.relay.js';
import {
  PROFESSIONAL_APPROVED_TOPIC,
  PROFESSIONAL_REJECTED_TOPIC,
  type ProfessionalApprovedEvent,
  type ProfessionalRejectedEvent,
} from '../events/professional-events.js';
import type { Prisma, ProDocument, ProDocumentType, ProfessionalStatus } from '../generated/prisma/client.js';
import { DOWNLOAD_LINK_SECONDS, StorageService } from '../storage/storage.service.js';
import type { ReviewDocumentDto } from './dto/review.dto.js';

// A professional can only be approved once an admin has accepted one document of each of these types.
// Insurance is not here yet: whether each pro needs their own policy is still an open decision.
export const REQUIRED_DOCUMENT_TYPES: ProDocumentType[] = ['id_card', 'activity_proof'];

const withUserAndDocuments = {
  user: { select: { id: true, auth0Id: true, email: true, name: true, phone: true } },
  documents: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ProfessionalInclude;

type ProfessionalWithRelations = Prisma.ProfessionalGetPayload<{ include: typeof withUserAndDocuments }>;

// What admins do with applications: look, review documents, approve or reject.
// The gateway only lets people with the admin permission reach these.
@Injectable()
export class AdminProfessionalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxRelay,
  ) {}

  // Oldest first: the person who has waited longest is at the top of the queue
  async list(status?: ProfessionalStatus) {
    const professionals = await this.prisma.professional.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      include: withUserAndDocuments,
    });
    return professionals.map((professional) => this.present(professional));
  }

  async find(id: string) {
    return this.present(await this.get(id));
  }

  async documentDownloadUrl(id: string, documentId: string) {
    const document = await this.getDocument(id, documentId);
    if (document.status === 'uploading') throw new ConflictException('The file has not been uploaded yet');
    return { url: await this.storage.downloadUrl(document.fileKey), expiresInSeconds: DOWNLOAD_LINK_SECONDS };
  }

  async reviewDocument(id: string, documentId: string, dto: ReviewDocumentDto) {
    const document = await this.getDocument(id, documentId);
    if (document.status === 'uploading') throw new ConflictException('The file has not been uploaded yet');

    await this.prisma.proDocument.update({
      where: { id: document.id },
      data: {
        status: dto.decision,
        rejectionReason: dto.decision === 'rejected' ? dto.reason : null,
        reviewedBy: dto.reviewedBy,
        reviewedAt: new Date(),
      },
    });
    return this.find(id);
  }

  async approve(id: string, reviewedBy: string) {
    const professional = await this.get(id);
    if (professional.status === 'approved') throw new ConflictException('This professional is already approved');

    const accepted = new Set(professional.documents.filter((d) => d.status === 'accepted').map((d) => d.type));
    const missing = REQUIRED_DOCUMENT_TYPES.filter((type) => !accepted.has(type));
    if (missing.length) {
      throw new ConflictException(`Cannot approve yet: no accepted document of type ${missing.join(', ')}`);
    }

    const event: ProfessionalApprovedEvent = {
      eventId: randomUUID(),
      type: 'professional.approved',
      occurredAt: new Date().toISOString(),
      data: this.eventData(professional),
    };
    // the status change and its event are saved together: both or neither
    await this.prisma.$transaction([
      this.prisma.professional.update({
        where: { id },
        data: { status: 'approved', verifiedAt: new Date(), rejectionReason: null, reviewedBy, reviewedAt: new Date() },
      }),
      this.prisma.outboxEvent.create({
        data: { id: event.eventId, topic: PROFESSIONAL_APPROVED_TOPIC, key: professional.id, payload: event },
      }),
    ]);
    void this.outbox.flush();

    return this.find(id);
  }

  async reject(id: string, reviewedBy: string, reason: string) {
    const professional = await this.get(id);
    if (professional.status === 'rejected') throw new ConflictException('This application is already rejected');

    const event: ProfessionalRejectedEvent = {
      eventId: randomUUID(),
      type: 'professional.rejected',
      occurredAt: new Date().toISOString(),
      data: this.eventData(professional),
    };
    await this.prisma.$transaction([
      this.prisma.professional.update({
        where: { id },
        // verifiedAt is cleared: a rejected professional loses the "Verificado" badge
        data: { status: 'rejected', verifiedAt: null, rejectionReason: reason, reviewedBy, reviewedAt: new Date() },
      }),
      this.prisma.outboxEvent.create({
        data: { id: event.eventId, topic: PROFESSIONAL_REJECTED_TOPIC, key: professional.id, payload: event },
      }),
    ]);
    void this.outbox.flush();

    return this.find(id);
  }

  private async get(id: string) {
    const professional = await this.prisma.professional.findUnique({ where: { id }, include: withUserAndDocuments });
    if (!professional) throw new NotFoundException(`Professional ${id} not found`);
    return professional;
  }

  private async getDocument(professionalId: string, documentId: string): Promise<ProDocument> {
    const document = await this.prisma.proDocument.findFirst({ where: { id: documentId, professionalId } });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    return document;
  }

  private eventData(professional: ProfessionalWithRelations) {
    return { professionalId: professional.id, userId: professional.userId };
  }

  // Plain values for JSON, and never the storage path of a document
  private present(professional: ProfessionalWithRelations) {
    return {
      ...professional,
      insuranceValidUntil: professional.insuranceValidUntil?.toISOString().slice(0, 10) ?? null,
      ratingAvg: professional.ratingAvg === null ? null : Number(professional.ratingAvg),
      documents: professional.documents.map(({ fileKey: _fileKey, ...document }) => document),
      // which required documents still have no accepted file: tells the admin why "Approve" would fail
      missingDocuments: REQUIRED_DOCUMENT_TYPES.filter(
        (type) => !professional.documents.some((d) => d.type === type && d.status === 'accepted'),
      ),
    };
  }
}
