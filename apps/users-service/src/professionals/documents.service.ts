import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ProDocument } from '../generated/prisma/client.js';
import { StorageService, UPLOAD_LINK_SECONDS, DOWNLOAD_LINK_SECONDS } from '../storage/storage.service.js';
import { ALLOWED_CONTENT_TYPES, RequestUploadDto } from './dto/request-upload.dto.js';

export const MAX_DOCUMENTS_PER_PROFESSIONAL = 20;

// Verification documents of a professional. Uploading takes three steps:
//   1. requestUpload()  → we save a row ("uploading") and return a signed link
//   2. the app PUTs the file straight to storage with that link
//   3. confirmUpload()  → we check the file really arrived, then mark it "pending" for an admin
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async requestUpload(auth0Id: string, dto: RequestUploadDto) {
    const professional = await this.professionalOf(auth0Id);

    const count = await this.prisma.proDocument.count({ where: { professionalId: professional.id } });
    if (count >= MAX_DOCUMENTS_PER_PROFESSIONAL) {
      throw new ConflictException('Too many documents. Delete one before uploading another.');
    }

    const id = randomUUID();
    // The path is built from ids only, so nothing a person typed ends up in it
    const fileKey = `pro-documents/${professional.id}/${id}.${ALLOWED_CONTENT_TYPES[dto.contentType]}`;
    const url = await this.storage.uploadUrl(fileKey, dto.contentType, dto.sizeBytes); // fails here if storage is down: no row is left behind

    const document = await this.prisma.proDocument.create({
      data: { id, professionalId: professional.id, fileKey, ...dto },
    });

    return {
      document: this.present(document),
      upload: {
        method: 'PUT',
        url,
        headers: { 'Content-Type': dto.contentType }, // must be sent exactly like this, it is part of the signature
        expiresInSeconds: UPLOAD_LINK_SECONDS,
      },
    };
  }

  async confirmUpload(auth0Id: string, documentId: string) {
    const document = await this.documentOf(auth0Id, documentId);
    if (document.status !== 'uploading') return this.present(document); // already confirmed: nothing to do

    const stored = await this.storage.stat(document.fileKey);
    if (!stored) throw new BadRequestException('The file has not been uploaded yet');
    if (stored.sizeBytes !== document.sizeBytes) {
      await this.storage.remove(document.fileKey);
      await this.prisma.proDocument.delete({ where: { id: document.id } });
      throw new BadRequestException('The uploaded file does not match what was announced. Please upload it again.');
    }

    const confirmed = await this.prisma.proDocument.update({ where: { id: document.id }, data: { status: 'pending' } });
    // a new document from a rejected applicant sends the application back to the admins' queue
    await this.prisma.professional.updateMany({
      where: { id: document.professionalId, status: 'rejected' },
      data: { status: 'applied', rejectionReason: null },
    });
    return this.present(confirmed);
  }

  async list(auth0Id: string) {
    const professional = await this.professionalOf(auth0Id);
    const documents = await this.prisma.proDocument.findMany({
      where: { professionalId: professional.id },
      orderBy: { createdAt: 'desc' },
    });
    return documents.map((document) => this.present(document));
  }

  async downloadUrl(auth0Id: string, documentId: string) {
    const document = await this.documentOf(auth0Id, documentId);
    if (document.status === 'uploading') throw new BadRequestException('The file has not been uploaded yet');
    return { url: await this.storage.downloadUrl(document.fileKey), expiresInSeconds: DOWNLOAD_LINK_SECONDS };
  }

  async remove(auth0Id: string, documentId: string) {
    const document = await this.documentOf(auth0Id, documentId);
    // an accepted document is what the approval was based on, so it stays on record
    if (document.status === 'accepted') throw new ConflictException('An accepted document cannot be deleted');

    await this.storage.remove(document.fileKey);
    await this.prisma.proDocument.delete({ where: { id: document.id } });
  }

  private async professionalOf(auth0Id: string) {
    const professional = await this.prisma.professional.findFirst({ where: { user: { auth0Id } }, select: { id: true } });
    if (!professional) throw new NotFoundException(`${auth0Id} has not applied as a professional`);
    return professional;
  }

  // Looks the document up through its owner, so nobody can reach someone else's file by guessing an id
  private async documentOf(auth0Id: string, documentId: string) {
    const document = await this.prisma.proDocument.findFirst({
      where: { id: documentId, professional: { user: { auth0Id } } },
    });
    if (!document) throw new NotFoundException(`Document ${documentId} not found`);
    return document;
  }

  // The storage path stays inside the backend (the app only ever gets signed links),
  // and so does which admin reviewed the document
  private present({ fileKey: _fileKey, reviewedBy: _reviewedBy, ...document }: ProDocument) {
    return document;
  }
}
