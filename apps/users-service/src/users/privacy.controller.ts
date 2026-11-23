import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { OutboxRelay } from '../events/outbox.relay.js';
import { USER_DELETED_TOPIC } from '../events/user-events.js';
import { createHash, randomUUID } from 'node:crypto';
import { StorageService, UPLOAD_LINK_SECONDS } from '../storage/storage.service.js';
import { Auth0ErasureService } from './auth0-erasure.service.js';

@Controller('users')
export class PrivacyController {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxRelay,
    private readonly storage: StorageService, private readonly auth0: Auth0ErasureService) {}

  @Get(':id/privacy/notification-recipient')
  async notificationRecipient(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id }, select: { email: true, name: true, deletionRequest: { select: { frozenAt: true } } },
    });
    return { recipient: user && !user.deletionRequest?.frozenAt ? { email: user.email, name: user.name } : null };
  }

  @Get('privacy/deletions/:id/receipt')
  receipt(@Param('id', ParseUUIDPipe) userId: string) {
    return this.prisma.accountDeletionReceipt.findUnique({ where: { userId }, select: { completedAt: true } })
      .then(receipt => ({ completedAt: receipt?.completedAt ?? null }));
  }

  @Post('privacy/deletions/:id/finalize')
  @HttpCode(200)
  async finalize(@Param('id', ParseUUIDPipe) userId: string, @Body('admin') admin: unknown) {
    if (typeof admin !== 'string' || !admin.trim()) throw new BadRequestException('Administrator identity is required');
    const existing = await this.prisma.accountDeletionReceipt.findUnique({ where: { userId }, select: { completedAt: true } });
    if (existing) return existing;
    const scope = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId },
      include: { user: { select: { auth0Id: true, professional: { select: { id: true } } } } },
    });
    if (!scope?.frozenAt || !scope.bookingsCleanedAt || !scope.reviewsCleanedAt) {
      const completed = await this.prisma.accountDeletionReceipt.findUnique({ where: { userId }, select: { completedAt: true } });
      if (completed) return completed;
      throw new ConflictException('Booking and review cleanup must finish first');
    }
    const professional = scope.user.professional;
    if (professional && Date.now() - scope.frozenAt.getTime() < UPLOAD_LINK_SECONDS * 1000) {
      throw new ConflictException('Aguarda que as ligações de envio de documentos expirem.');
    }
    if (professional) await this.storage.eraseProfessionalDocuments(professional.id);
    await this.auth0.remove(scope.user.auth0Id);

    const receipt = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const existing = await tx.accountDeletionReceipt.findUnique({ where: { userId }, select: { completedAt: true } });
      if (existing) return existing;
      const request = await tx.accountDeletionRequest.findUnique({
        where: { userId }, include: { user: { select: { professional: { select: { id: true } } } } },
      });
      if (!request?.frozenAt || !request.bookingsCleanedAt || !request.reviewsCleanedAt) {
        throw new ConflictException('Booking and review cleanup must finish first');
      }
      const completed = await tx.accountDeletionReceipt.create({
        data: { userId, completedBy: admin, subjectHash: createHash('sha256').update(scope.user.auth0Id).digest('hex') },
        select: { completedAt: true },
      });
      const professionalId = request.user.professional?.id;
      await tx.outboxEvent.deleteMany({ where: { key: { in: professionalId ? [userId, professionalId] : [userId] } } });
      await tx.user.delete({ where: { id: userId } });
      const eventId = randomUUID();
      await tx.outboxEvent.create({ data: { id: eventId, key: userId, topic: USER_DELETED_TOPIC,
        payload: { eventId, type: USER_DELETED_TOPIC, occurredAt: completed.completedAt.toISOString(), data: { userId } } } });
      return completed;
    });
    void this.outbox.flush();
    return receipt;
  }

  @Get('by-auth0/:subject/privacy/export')
  async export(@Param('subject') auth0Id: string) {
    const data = await this.prisma.user.findUnique({
      where: { auth0Id },
      include: {
        consents: { orderBy: { acceptedAt: 'asc' } },
        deletionRequest: { select: { requestedAt: true, processingAt: true } },
        favorites: { select: { serviceSlug: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        addresses: { omit: { userId: true }, orderBy: { createdAt: 'asc' } },
        professional: {
          include: {
            areas: true, services: true, slots: true, timeOff: true,
            documents: { omit: { fileKey: true, reviewedBy: true } },
          },
          omit: { reviewedBy: true, photoKey: true, photoUploadKey: true },
        },
      },
    });
    if (!data) throw new NotFoundException('Profile not found');
    return data;
  }

  @Get('by-auth0/:subject/privacy/deletion')
  async deletionStatus(@Param('subject') auth0Id: string) {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id }, select: { deletionRequest: { select: {
        requestedAt: true, processingAt: true, frozenAt: true, bookingsCleanedAt: true, reviewsCleanedAt: true,
      } } },
    });
    if (!user) throw new NotFoundException('Profile not found');
    return user.deletionRequest ?? { requestedAt: null, processingAt: null };
  }

  @Post('by-auth0/:subject/privacy/deletion')
  async requestDeletion(@Param('subject') auth0Id: string) {
    const user = await this.prisma.user.findUnique({ where: { auth0Id }, select: { id: true } });
    if (!user) throw new NotFoundException('Profile not found');
    const request = await this.prisma.accountDeletionRequest.upsert({
      where: { userId: user.id }, create: { userId: user.id }, update: {},
      select: { requestedAt: true, processingAt: true },
    });
    return request;
  }

  @Get('privacy/deletions')
  listDeletionRequests() {
    return this.prisma.accountDeletionRequest.findMany({
      orderBy: [{ requestedAt: 'asc' }, { userId: 'asc' }],
      select: { requestedAt: true, processingAt: true, frozenAt: true, bookingsCleanedAt: true, reviewsCleanedAt: true,
        user: { select: { id: true, email: true } } },
    });
  }

  @Post('privacy/deletions/:id/start')
  @HttpCode(200)
  async startProcessing(@Param('id', ParseUUIDPipe) userId: string, @Body('admin') admin: unknown) {
    if (typeof admin !== 'string' || !admin.trim()) throw new BadRequestException('Administrator identity is required');
    return this.prisma.$transaction(async tx => {
      await tx.accountDeletionRequest.updateMany({
        where: { userId, processingAt: null },
        data: { processingAt: new Date(), processingBy: admin },
      });
      const request = await tx.accountDeletionRequest.findUnique({
        where: { userId }, select: { requestedAt: true, processingAt: true },
      });
      if (!request) throw new NotFoundException('Deletion request not found');
      return request;
    });
  }

  @Get('privacy/deletions/:id/scope')
  async deletionScope(@Param('id', ParseUUIDPipe) userId: string) {
    const request = await this.prisma.accountDeletionRequest.findUnique({
      where: { userId },
      select: { frozenAt: true, bookingsCleanedAt: true, reviewsCleanedAt: true,
        user: { select: { professional: { select: { id: true } } } } },
    });
    if (!request) throw new NotFoundException('Deletion request not found');
    return { professionalId: request.user.professional?.id ?? null, frozenAt: request.frozenAt,
      bookingsCleanedAt: request.bookingsCleanedAt, reviewsCleanedAt: request.reviewsCleanedAt };
  }

  @Post('privacy/deletions/:id/checkpoint')
  @HttpCode(200)
  async checkpoint(@Param('id', ParseUUIDPipe) userId: string, @Body('step') step: unknown) {
    if (step !== 'bookings' && step !== 'reviews') throw new BadRequestException('Unknown cleanup step');
    const field = step === 'bookings' ? 'bookingsCleanedAt' : 'reviewsCleanedAt';
    await this.prisma.accountDeletionRequest.updateMany({
      where: { userId, frozenAt: { not: null }, [field]: null,
        ...(step === 'reviews' ? { bookingsCleanedAt: { not: null } } : {}) },
      data: { [field]: new Date() },
    });
    const request = await this.prisma.accountDeletionRequest.findUnique({ where: { userId }, select: { [field]: true } });
    if (!request?.[field]) throw new ConflictException('Cleanup checkpoint is out of order');
    return { recorded: true };
  }

  @Get('by-auth0/:subject/privacy/freeze')
  async freezeStatus(@Param('subject') auth0Id: string) {
    const account = await this.prisma.user.findUnique({
      where: { auth0Id }, select: { deletionRequest: { select: { frozenAt: true } } },
    });
    if (account) return { frozen: Boolean(account.deletionRequest?.frozenAt) };
    const receipt = await this.prisma.accountDeletionReceipt.findUnique({
      where: { subjectHash: createHash('sha256').update(auth0Id).digest('hex') }, select: { userId: true },
    });
    return { frozen: Boolean(receipt) };
  }

  @Post('privacy/deletions/:id/freeze')
  @HttpCode(200)
  freeze(@Param('id', ParseUUIDPipe) userId: string) {
    return this.prisma.$transaction(async tx => {
      await tx.accountDeletionRequest.updateMany({
        where: { userId, processingAt: { not: null }, frozenAt: null },
        data: { frozenAt: new Date() },
      });
      const request = await tx.accountDeletionRequest.findUnique({ where: { userId }, select: { frozenAt: true } });
      if (!request) throw new NotFoundException('Deletion request not found');
      if (!request.frozenAt) throw new ConflictException('Start reviewing this deletion request first');
      return request;
    });
  }
}
