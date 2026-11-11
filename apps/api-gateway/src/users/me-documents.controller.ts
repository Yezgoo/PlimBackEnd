import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { UsersClient, type RequestUploadInput } from './users.client.js';

// The caller's verification documents as a professional.
// Uploading: POST here for a signed link → PUT the file to that link → POST :id/confirm.
@Controller('me/professional/documents')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class MeDocumentsController {
  constructor(private readonly usersClient: UsersClient) {}

  @Get()                                      // GET /me/professional/documents
  list(@CurrentUser() user: JWTPayload) {
    return this.usersClient.listDocuments(user.sub!);
  }

  @Post()                                     // POST → { document, upload: { method, url, headers } }
  requestUpload(@CurrentUser() user: JWTPayload, @Body() input: RequestUploadInput) {
    return this.usersClient.requestDocumentUpload(user.sub!, input);
  }

  @Post(':id/confirm')                        // after the PUT: the document becomes "pending" for review
  @HttpCode(200)
  confirm(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.usersClient.confirmDocumentUpload(user.sub!, id);
  }

  @Get(':id/download-url')                    // short-lived link to view my own document
  downloadUrl(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.usersClient.documentDownloadUrl(user.sub!, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.usersClient.deleteDocument(user.sub!, id);
  }
}
