import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { DOWNLOAD_LINK_SECONDS, StorageService, UPLOAD_LINK_SECONDS } from '../storage/storage.service.js';
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES, RequestPhotoUploadDto } from './dto/request-photo-upload.dto.js';

// "Ana Sofia Martins" → "Ana M.": enough for a customer to greet the person at the door,
// without handing out a full name before the job.
export function displayName(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

// The professional's profile photo, and the card a customer sees once a professional takes their booking.
// Uploading works like documents: ask for a signed link, PUT the file there, then confirm.
// Photos live under the same pro-documents/<id>/ prefix, so account erasure removes them with the documents.
@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async requestUpload(auth0Id: string, dto: RequestPhotoUploadDto) {
    const professional = await this.professionalOf(auth0Id);
    const key = `pro-documents/${professional.id}/photo-${randomUUID()}.${PHOTO_CONTENT_TYPES[dto.contentType]}`;
    const url = await this.storage.uploadUrl(key, dto.contentType, dto.sizeBytes);
    await this.prisma.professional.update({ where: { id: professional.id }, data: { photoUploadKey: key } });
    // an earlier link that was never confirmed is replaced: drop whatever it may have uploaded
    if (professional.photoUploadKey) await this.discard(professional.photoUploadKey);
    return {
      upload: { method: 'PUT', url, headers: { 'Content-Type': dto.contentType }, expiresInSeconds: UPLOAD_LINK_SECONDS },
    };
  }

  async confirmUpload(auth0Id: string) {
    const professional = await this.professionalOf(auth0Id);
    const key = professional.photoUploadKey;
    if (!key) {
      if (professional.photoKey) return { hasPhoto: true }; // already confirmed
      throw new BadRequestException('Ask for an upload link first');
    }
    const stored = await this.storage.stat(key);
    if (!stored) throw new BadRequestException('The photo has not been uploaded yet');
    if (stored.sizeBytes > MAX_PHOTO_BYTES || !stored.contentType || !(stored.contentType in PHOTO_CONTENT_TYPES)) {
      await this.discard(key);
      await this.prisma.professional.updateMany({ where: { id: professional.id, photoUploadKey: key }, data: { photoUploadKey: null } });
      throw new BadRequestException('The photo must be a JPEG or PNG of 5 MB or less');
    }
    // only if nobody asked for a newer link in the meantime
    const { count } = await this.prisma.professional.updateMany({
      where: { id: professional.id, photoUploadKey: key },
      data: { photoKey: key, photoUploadKey: null },
    });
    if (!count) throw new BadRequestException('A newer photo upload was started. Please try again.');
    if (professional.photoKey && professional.photoKey !== key) await this.discard(professional.photoKey);
    return { hasPhoto: true };
  }

  async remove(auth0Id: string) {
    const professional = await this.professionalOf(auth0Id);
    await this.prisma.professional.update({ where: { id: professional.id }, data: { photoKey: null, photoUploadKey: null } });
    for (const key of [professional.photoKey, professional.photoUploadKey]) if (key) await this.discard(key);
  }

  async ownPhotoUrl(auth0Id: string) {
    const professional = await this.professionalOf(auth0Id);
    if (!professional.photoKey) throw new NotFoundException('No profile photo');
    return { url: await this.storage.downloadUrl(professional.photoKey), expiresInSeconds: DOWNLOAD_LINK_SECONDS };
  }

  async photoUrlById(professionalId: string) {
    const professional = await this.prisma.professional.findUnique({ where: { id: professionalId }, select: { photoKey: true } });
    if (!professional) throw new NotFoundException(`Professional ${professionalId} not found`);
    if (!professional.photoKey) throw new NotFoundException('No profile photo');
    return { url: await this.storage.downloadUrl(professional.photoKey), expiresInSeconds: DOWNLOAD_LINK_SECONDS };
  }

  // What a customer sees about the professional assigned to their booking. The gateway only asks
  // for this after checking the booking belongs to the caller and has this professional.
  async publicProfile(professionalId: string) {
    const professional = await this.prisma.professional.findUnique({
      where: { id: professionalId },
      select: {
        id: true, bio: true, status: true, verifiedAt: true, ratingAvg: true, ratingCount: true, photoKey: true, createdAt: true,
        user: { select: { name: true } },
      },
    });
    if (!professional) throw new NotFoundException(`Professional ${professionalId} not found`);
    let photoUrl: string | null = null;
    if (professional.photoKey) {
      // a storage hiccup should cost the photo, not the whole card
      photoUrl = await this.storage.downloadUrl(professional.photoKey).catch(() => null);
    }
    return {
      id: professional.id,
      name: displayName(professional.user.name),
      bio: professional.bio,
      photoUrl,
      verified: professional.status === 'approved' && !!professional.verifiedAt,
      ratingAvg: professional.ratingAvg === null ? null : Number(professional.ratingAvg),
      ratingCount: professional.ratingCount,
      memberSince: professional.createdAt.toISOString().slice(0, 7), // "2026-11"
    };
  }

  private async professionalOf(auth0Id: string) {
    const professional = await this.prisma.professional.findFirst({
      where: { user: { auth0Id } }, select: { id: true, photoKey: true, photoUploadKey: true },
    });
    if (!professional) throw new NotFoundException(`${auth0Id} has not applied as a professional`);
    return professional;
  }

  private async discard(key: string) {
    await this.storage.remove(key).catch(() => this.logger.warn(`Could not remove replaced photo ${key}`));
  }
}
