import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ProfessionalStatus } from '../generated/prisma/client.js';
import { AdminProfessionalsService } from './admin-professionals.service.js';
import { PhotoService } from './photo.service.js';
import { ApproveProfessionalDto, RejectProfessionalDto, ReviewDocumentDto } from './dto/review.dto.js';

// Back-office view of professionals. Only the gateway can call users-service, and the gateway
// only forwards these for callers with the admin permission.
@Controller('admin/professionals')
export class AdminProfessionalsController {
  constructor(private readonly admin: AdminProfessionalsService, private readonly photos: PhotoService) {}

  @Get()                                      // GET /admin/professionals?status=applied → the review queue
  list(@Query('status', new ParseEnumPipe(ProfessionalStatus, { optional: true })) status?: ProfessionalStatus) {
    return this.admin.list(status);
  }

  @Get(':id')
  find(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.find(id);
  }

  @Get(':id/photo-url')                       // short-lived link to check the profile photo customers will see
  photoUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.photos.photoUrlById(id);
  }

  @Get(':id/documents/:documentId/download-url')   // short-lived link to look at a document
  documentDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.admin.documentDownloadUrl(id, documentId);
  }

  @Post(':id/documents/:documentId/review')   // accept or reject one document
  @HttpCode(200)
  reviewDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.admin.reviewDocument(id, documentId, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveProfessionalDto) {
    return this.admin.approve(id, dto.reviewedBy);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectProfessionalDto) {
    return this.admin.reject(id, dto.reviewedBy, dto.reason);
  }
}
