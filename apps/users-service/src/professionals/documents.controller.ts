import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
import { RequestUploadDto } from './dto/request-upload.dto.js';

// A professional's verification documents. The Auth0 id in the path always comes from the gateway.
@Controller('users/by-auth0/:auth0Id/professional/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()                                     // step 1: ask for an upload link
  requestUpload(@Param('auth0Id') auth0Id: string, @Body() dto: RequestUploadDto) {
    return this.documents.requestUpload(auth0Id, dto);
  }

  @Post(':id/confirm')                        // step 3: "I uploaded it" → we check and mark it pending
  @HttpCode(200)
  confirmUpload(@Param('auth0Id') auth0Id: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.confirmUpload(auth0Id, id);
  }

  @Get()
  list(@Param('auth0Id') auth0Id: string) {
    return this.documents.list(auth0Id);
  }

  @Get(':id/download-url')                    // a short-lived link to view the file
  downloadUrl(@Param('auth0Id') auth0Id: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.downloadUrl(auth0Id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('auth0Id') auth0Id: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.remove(auth0Id, id);
  }
}
