import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ADMIN_ACCESS, RequirePermissions } from '../auth/permissions.decorator.js';
import { UsersClient, type ReviewDocumentInput } from '../users/users.client.js';

// Reviewing professionals' applications. Admins only (and /admin is closed by path as well).
// Every decision is recorded with the admin's Auth0 id, taken from their token.
@Controller('admin/professionals')
@RequirePermissions(ADMIN_ACCESS)
export class AdminProfessionalsController {
  constructor(private readonly usersClient: UsersClient) {}

  @Get()                                      // GET /admin/professionals?status=applied → the review queue, oldest first
  list(@Query('status') status?: string) {
    return this.usersClient.adminListProfessionals(status);
  }

  @Get(':id')                                 // the application, the person, their documents, what is missing
  find(@Param('id') id: string) {
    return this.usersClient.adminFindProfessional(id);
  }

  @Get(':id/photo-url')                       // short-lived link to check the photo customers will see
  photoUrl(@Param('id') id: string) {
    return this.usersClient.adminPhotoUrl(id);
  }

  @Get(':id/documents/:documentId/download-url')   // short-lived link to look at a document
  documentDownloadUrl(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.usersClient.adminDocumentDownloadUrl(id, documentId);
  }

  @Post(':id/documents/:documentId/review')   // { decision: "accepted" | "rejected", reason? }
  @HttpCode(200)
  reviewDocument(
    @CurrentUser() admin: JWTPayload,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body() input: ReviewDocumentInput,
  ) {
    return this.usersClient.adminReviewDocument(admin.sub!, id, documentId, input);
  }

  @Post(':id/approve')                        // needs the required documents accepted; publishes professional.approved
  @HttpCode(200)
  approve(@CurrentUser() admin: JWTPayload, @Param('id') id: string) {
    return this.usersClient.adminApproveProfessional(admin.sub!, id);
  }

  @Post(':id/reject')                         // { reason } is shown to the applicant; publishes professional.rejected
  @HttpCode(200)
  reject(@CurrentUser() admin: JWTPayload, @Param('id') id: string, @Body() input: { reason: string }) {
    return this.usersClient.adminRejectProfessional(admin.sub!, id, input?.reason);
  }
}
