import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { OutboxRelay } from '../events/outbox.relay.js';
import { StorageService } from '../storage/storage.service.js';
import { AdminProfessionalsService } from './admin-professionals.service.js';

const document = (type: string, status: string, overrides = {}) => ({
  id: `doc-${type}`,
  professionalId: 'pro-1',
  type,
  status,
  fileKey: `pro-documents/pro-1/doc-${type}.pdf`,
  fileName: `${type}.pdf`,
  ...overrides,
});

const professional = (overrides = {}) => ({
  id: 'pro-1',
  userId: 'user-1',
  nif: '123456789',
  status: 'applied',
  verifiedAt: null,
  insuranceValidUntil: null,
  ratingAvg: null,
  user: { id: 'user-1', auth0Id: 'auth0|pro', email: 'ana@example.com', name: 'Ana', phone: null },
  documents: [document('id_card', 'accepted'), document('activity_proof', 'accepted')],
  ...overrides,
});

describe('AdminProfessionalsService', () => {
  const prismaMock = {
    professional: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn((args) => ({ op: 'professional.update', args })) },
    proDocument: { findFirst: vi.fn(), update: vi.fn() },
    outboxEvent: { create: vi.fn((args) => ({ op: 'outbox.create', args })) },
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  };
  const storageMock = { downloadUrl: vi.fn() };
  const outboxMock = { flush: vi.fn() };
  let service: AdminProfessionalsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.professional.findUnique.mockResolvedValue(professional());
    service = new AdminProfessionalsService(
      prismaMock as unknown as PrismaService,
      storageMock as unknown as StorageService,
      outboxMock as unknown as OutboxRelay,
    );
  });

  it('list() filters by status and puts the longest-waiting application first', async () => {
    prismaMock.professional.findMany.mockResolvedValue([professional()]);

    const [first] = await service.list('applied');

    const query = prismaMock.professional.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ status: 'applied' });
    expect(query.orderBy).toEqual({ createdAt: 'asc' });
    expect(first.user.email).toBe('ana@example.com');
    expect(first.documents[0]).not.toHaveProperty('fileKey'); // storage paths never leave the backend
  });

  it('find() says which required documents are still missing', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(
      professional({ documents: [document('id_card', 'accepted'), document('activity_proof', 'pending')] }),
    );

    expect((await service.find('pro-1')).missingDocuments).toEqual(['activity_proof']);
  });

  it('find() throws 404 for an unknown professional', async () => {
    prismaMock.professional.findUnique.mockResolvedValue(null);

    await expect(service.find('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('approve()', () => {
    it('marks the professional approved and verified, and saves professional.approved with it', async () => {
      await service.approve('pro-1', 'auth0|admin');

      const [update, outbox] = prismaMock.$transaction.mock.calls[0][0] as { args: { data: Record<string, unknown> } }[];
      expect(update.args.data).toMatchObject({ status: 'approved', reviewedBy: 'auth0|admin', rejectionReason: null });
      expect(update.args.data.verifiedAt).toBeInstanceOf(Date);
      expect(outbox.args.data).toMatchObject({
        topic: 'professional.approved',
        key: 'pro-1',
        payload: {
          type: 'professional.approved',
          data: { professionalId: 'pro-1', userId: 'user-1' },
        },
      });
      expect(outboxMock.flush).toHaveBeenCalled();
    });

    it('refuses while a required document has no accepted file', async () => {
      prismaMock.professional.findUnique.mockResolvedValue(
        professional({ documents: [document('id_card', 'accepted'), document('activity_proof', 'rejected')] }),
      );

      await expect(service.approve('pro-1', 'auth0|admin')).rejects.toThrow('activity_proof');
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(outboxMock.flush).not.toHaveBeenCalled();
    });

    it('refuses to approve twice (no second event)', async () => {
      prismaMock.professional.findUnique.mockResolvedValue(professional({ status: 'approved' }));

      await expect(service.approve('pro-1', 'auth0|admin')).rejects.toBeInstanceOf(ConflictException);
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it('can approve an application that was rejected before', async () => {
      prismaMock.professional.findUnique.mockResolvedValue(professional({ status: 'rejected' }));

      await expect(service.approve('pro-1', 'auth0|admin')).resolves.toBeDefined();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('reject()', () => {
    it('saves the reason, removes the verified mark and publishes professional.rejected', async () => {
      prismaMock.professional.findUnique.mockResolvedValue(professional({ status: 'approved', verifiedAt: new Date() }));

      await service.reject('pro-1', 'auth0|admin', 'Seguro caducado');

      const [update, outbox] = prismaMock.$transaction.mock.calls[0][0] as { args: { data: Record<string, unknown> } }[];
      expect(update.args.data).toMatchObject({ status: 'rejected', verifiedAt: null, rejectionReason: 'Seguro caducado' });
      expect(outbox.args.data).toMatchObject({
        topic: 'professional.rejected',
        payload: { type: 'professional.rejected', data: { professionalId: 'pro-1', userId: 'user-1' } },
      });
    });

    it('refuses to reject twice', async () => {
      prismaMock.professional.findUnique.mockResolvedValue(professional({ status: 'rejected' }));

      await expect(service.reject('pro-1', 'auth0|admin', 'x')).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('documents', () => {
    it('reviewDocument() records the decision, the reason and who decided', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(document('id_card', 'pending'));

      await service.reviewDocument('pro-1', 'doc-id_card', { decision: 'rejected', reason: 'Ilegível', reviewedBy: 'auth0|admin' });

      expect(prismaMock.proDocument.findFirst.mock.calls[0][0].where).toEqual({ id: 'doc-id_card', professionalId: 'pro-1' });
      expect(prismaMock.proDocument.update.mock.calls[0][0].data).toMatchObject({
        status: 'rejected',
        rejectionReason: 'Ilegível',
        reviewedBy: 'auth0|admin',
      });
    });

    it('accepting clears an earlier rejection reason', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(document('id_card', 'rejected', { rejectionReason: 'Ilegível' }));

      await service.reviewDocument('pro-1', 'doc-id_card', { decision: 'accepted', reviewedBy: 'auth0|admin' });

      expect(prismaMock.proDocument.update.mock.calls[0][0].data).toMatchObject({ status: 'accepted', rejectionReason: null });
    });

    it('cannot review or view a file that was never uploaded', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(document('id_card', 'uploading'));

      await expect(
        service.reviewDocument('pro-1', 'doc-id_card', { decision: 'accepted', reviewedBy: 'auth0|admin' }),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(service.documentDownloadUrl('pro-1', 'doc-id_card')).rejects.toBeInstanceOf(ConflictException);
    });

    it('documentDownloadUrl() returns a signed link', async () => {
      prismaMock.proDocument.findFirst.mockResolvedValue(document('id_card', 'pending'));
      storageMock.downloadUrl.mockResolvedValue('https://bucket.example/signed-get');

      await expect(service.documentDownloadUrl('pro-1', 'doc-id_card')).resolves.toMatchObject({
        url: 'https://bucket.example/signed-get',
      });
    });
  });
});
