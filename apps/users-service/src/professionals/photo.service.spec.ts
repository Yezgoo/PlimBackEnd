import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import type { StorageService } from '../storage/storage.service.js';
import { displayName, PhotoService } from './photo.service.js';

describe('displayName', () => {
  it.each([
    ['Ana Sofia Martins', 'Ana M.'],
    ['  joão  silva ', 'joão S.'],
    ['Rui', 'Rui'],
    ['', null],
    [null, null],
  ])('%s → %s', (name, expected) => expect(displayName(name)).toBe(expected));
});

describe('PhotoService', () => {
  const prisma = {
    professional: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  };
  const storage = { uploadUrl: vi.fn(), downloadUrl: vi.fn(), stat: vi.fn(), remove: vi.fn() };
  const service = new PhotoService(prisma as unknown as PrismaService, storage as unknown as StorageService);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.professional.findFirst.mockResolvedValue({ id: 'pro-1', photoKey: null, photoUploadKey: null });
    prisma.professional.updateMany.mockResolvedValue({ count: 1 });
    storage.uploadUrl.mockResolvedValue('https://bucket/signed-put');
    storage.downloadUrl.mockResolvedValue('https://bucket/signed-get');
    storage.remove.mockResolvedValue(undefined);
  });

  it('keeps photos under the professional\'s document prefix, so erasure removes them too', async () => {
    const ticket = await service.requestUpload('auth0|me', { contentType: 'image/jpeg', sizeBytes: 1000 });

    const [key] = storage.uploadUrl.mock.calls[0];
    expect(key).toMatch(/^pro-documents\/pro-1\/photo-[0-9a-f-]+\.jpg$/);
    expect(prisma.professional.update).toHaveBeenCalledWith({ where: { id: 'pro-1' }, data: { photoUploadKey: key } });
    expect(ticket.upload).toMatchObject({ method: 'PUT', url: 'https://bucket/signed-put', headers: { 'Content-Type': 'image/jpeg' } });
  });

  it('confirms an uploaded photo and removes the one it replaces', async () => {
    prisma.professional.findFirst.mockResolvedValue({ id: 'pro-1', photoKey: 'pro-documents/pro-1/photo-old.jpg', photoUploadKey: 'pro-documents/pro-1/photo-new.png' });
    storage.stat.mockResolvedValue({ sizeBytes: 2000, contentType: 'image/png' });

    await expect(service.confirmUpload('auth0|me')).resolves.toEqual({ hasPhoto: true });
    expect(prisma.professional.updateMany).toHaveBeenCalledWith({
      where: { id: 'pro-1', photoUploadKey: 'pro-documents/pro-1/photo-new.png' },
      data: { photoKey: 'pro-documents/pro-1/photo-new.png', photoUploadKey: null },
    });
    expect(storage.remove).toHaveBeenCalledWith('pro-documents/pro-1/photo-old.jpg');
  });

  it('refuses to confirm before the file arrived', async () => {
    prisma.professional.findFirst.mockResolvedValue({ id: 'pro-1', photoKey: null, photoUploadKey: 'pro-documents/pro-1/photo-new.jpg' });
    storage.stat.mockResolvedValue(null);

    await expect(service.confirmUpload('auth0|me')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.professional.updateMany).not.toHaveBeenCalled();
  });

  it('throws away something that is not a photo', async () => {
    prisma.professional.findFirst.mockResolvedValue({ id: 'pro-1', photoKey: null, photoUploadKey: 'pro-documents/pro-1/photo-new.jpg' });
    storage.stat.mockResolvedValue({ sizeBytes: 2000, contentType: 'application/pdf' });

    await expect(service.confirmUpload('auth0|me')).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.remove).toHaveBeenCalledWith('pro-documents/pro-1/photo-new.jpg');
  });

  it('shows customers a short name, the photo and whether the professional is verified', async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'pro-1', bio: 'Canalizador há 12 anos', status: 'approved', verifiedAt: new Date('2026-11-01'), ratingAvg: '4.75', ratingCount: 8,
      photoKey: 'pro-documents/pro-1/photo-a.jpg', createdAt: new Date('2026-10-05T10:00:00Z'), user: { name: 'Ana Sofia Martins' },
    });

    await expect(service.publicProfile('pro-1')).resolves.toEqual({
      id: 'pro-1', name: 'Ana M.', bio: 'Canalizador há 12 anos', photoUrl: 'https://bucket/signed-get',
      verified: true, ratingAvg: 4.75, ratingCount: 8, memberSince: '2026-10',
    });
  });

  it('still shows the card when storage is down, just without the photo', async () => {
    prisma.professional.findUnique.mockResolvedValue({
      id: 'pro-1', bio: null, status: 'suspended', verifiedAt: new Date(), ratingAvg: null, ratingCount: 0,
      photoKey: 'pro-documents/pro-1/photo-a.jpg', createdAt: new Date(), user: { name: null },
    });
    storage.downloadUrl.mockRejectedValue(new Error('storage down'));

    await expect(service.publicProfile('pro-1')).resolves.toMatchObject({ photoUrl: null, verified: false, name: null });
  });

  it('answers 404 to someone who never applied', async () => {
    prisma.professional.findFirst.mockResolvedValue(null);

    await expect(service.requestUpload('auth0|me', { contentType: 'image/jpeg', sizeBytes: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
