import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { DocumentsService, MAX_DOCUMENTS_PER_PROFESSIONAL } from './documents.service.js';

const stored = (overrides = {}) => ({
  id: 'doc-1',
  professionalId: 'pro-1',
  type: 'id_card',
  fileKey: 'pro-documents/pro-1/doc-1.pdf',
  fileName: 'cc.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1234,
  status: 'uploading',
  rejectionReason: null,
  reviewedBy: null,
  reviewedAt: null,
  ...overrides,
});

describe('DocumentsService', () => {
  const prismaMock = {
    professional: { findFirst: vi.fn() },
    proDocument: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  };
  const storageMock = { uploadUrl: vi.fn(), downloadUrl: vi.fn(), stat: vi.fn(), remove: vi.fn() };
  let service: DocumentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.professional.findFirst.mockResolvedValue({ id: 'pro-1' });
    prismaMock.proDocument.count.mockResolvedValue(0);
    service = new DocumentsService(prismaMock as unknown as PrismaService, storageMock as unknown as StorageService);
  });

  describe('requestUpload()', () => {
    const dto = { type: 'id_card' as const, contentType: 'image/jpeg', sizeBytes: 5000, fileName: '../../etc/passwd.jpg' };

    it('saves an "uploading" row and returns a signed link, without exposing the storage path', async () => {
      storageMock.uploadUrl.mockResolvedValue('https://bucket.example/signed-put');
      prismaMock.proDocument.create.mockImplementation(async ({ data }) => ({ ...stored(), ...data }));

      const result = await service.requestUpload('auth0|1', dto);

      const [key, contentType, size] = storageMock.uploadUrl.mock.calls[0];
      expect(key).toMatch(/^pro-documents\/pro-1\/[0-9a-f-]{36}\.jpg$/); // built from ids, not from the file name
      expect(contentType).toBe('image/jpeg');
      expect(size).toBe(5000);
      expect(result.upload).toMatchObject({ method: 'PUT', url: 'https://bucket.example/signed-put', headers: { 'Content-Type': 'image/jpeg' } });
      expect(result.document).not.toHaveProperty('fileKey');
      expect(result.document.status).toBe('uploading');
    });

    it('throws 404 when the person has not applied as a professional', async () => {
      prismaMock.professional.findFirst.mockResolvedValue(null);

      await expect(service.requestUpload('auth0|1', dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses once the professional has too many documents', async () => {
      prismaMock.proDocument.count.mockResolvedValue(MAX_DOCUMENTS_PER_PROFESSIONAL);

      await expect(service.requestUpload('auth0|1', dto)).rejects.toBeInstanceOf(ConflictException);
      expect(storageMock.uploadUrl).not.toHaveBeenCalled();
    });

    it('leaves no row behind when storage is unavailable', async () => {
      storageMock.uploadUrl.mockRejectedValue(new Error('storage down'));

      await expect(service.requestUpload('auth0|1', dto)).rejects.toThrow('storage down');
      expect(prismaMock.proDocument.create).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload()', () => {
    it('marks the document pending when the file is in storage with the announced size', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(stored());
      storageMock.stat.mockResolvedValue({ sizeBytes: 1234 });
      prismaMock.proDocument.update.mockResolvedValue(stored({ status: 'pending' }));

      const result = await service.confirmUpload('auth0|1', 'doc-1');

      expect(prismaMock.proDocument.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { status: 'pending' } });
      expect(result.status).toBe('pending');
    });

    it('refuses when nothing was uploaded', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(stored());
      storageMock.stat.mockResolvedValue(null);

      await expect(service.confirmUpload('auth0|1', 'doc-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.proDocument.update).not.toHaveBeenCalled();
    });

    it('throws the file away when its size is not what was announced', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(stored());
      storageMock.stat.mockResolvedValue({ sizeBytes: 999_999 });

      await expect(service.confirmUpload('auth0|1', 'doc-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(storageMock.remove).toHaveBeenCalledWith('pro-documents/pro-1/doc-1.pdf');
      expect(prismaMock.proDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('does nothing when the document was already confirmed', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(stored({ status: 'accepted' }));

      await expect(service.confirmUpload('auth0|1', 'doc-1')).resolves.toMatchObject({ status: 'accepted' });
      expect(storageMock.stat).not.toHaveBeenCalled();
    });
  });

  it('only finds a document through its owner', async () => {
    prismaMock.proDocument.findFirst.mockResolvedValue(null);

    await expect(service.downloadUrl('auth0|someone-else', 'doc-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prismaMock.proDocument.findFirst.mock.calls[0][0].where).toEqual({
      id: 'doc-1',
      professional: { user: { auth0Id: 'auth0|someone-else' } },
    });
    expect(storageMock.downloadUrl).not.toHaveBeenCalled();
  });

  it('downloadUrl() returns a signed link for an uploaded document', async () => {
    prismaMock.proDocument.findFirst.mockResolvedValue(stored({ status: 'pending' }));
    storageMock.downloadUrl.mockResolvedValue('https://bucket.example/signed-get');

    await expect(service.downloadUrl('auth0|1', 'doc-1')).resolves.toMatchObject({ url: 'https://bucket.example/signed-get' });
  });

  it('list() never includes the storage path', async () => {
    prismaMock.proDocument.findMany.mockResolvedValue([stored({ status: 'pending' })]);

    const [document] = await service.list('auth0|1');

    expect(document).not.toHaveProperty('fileKey');
    expect(document.fileName).toBe('cc.pdf');
  });

  describe('remove()', () => {
    it('deletes the file and the row', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(stored({ status: 'rejected' }));

      await service.remove('auth0|1', 'doc-1');

      expect(storageMock.remove).toHaveBeenCalledWith('pro-documents/pro-1/doc-1.pdf');
      expect(prismaMock.proDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    });

    it('keeps an accepted document', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(stored({ status: 'accepted' }));

      await expect(service.remove('auth0|1', 'doc-1')).rejects.toBeInstanceOf(ConflictException);
      expect(storageMock.remove).not.toHaveBeenCalled();
    });
  });
});
