import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequestPhotoUploadDto } from './dto/request-photo-upload.dto.js';
import { PhotoService } from './photo.service.js';

// The caller's own profile photo. The Auth0 id in the path always comes from the gateway.
@Controller('users/by-auth0/:auth0Id/professional/photo')
export class PhotoController {
  constructor(private readonly photos: PhotoService) {}

  @Post()                                     // step 1: ask for an upload link
  requestUpload(@Param('auth0Id') auth0Id: string, @Body() dto: RequestPhotoUploadDto) {
    return this.photos.requestUpload(auth0Id, dto);
  }

  @Post('confirm')                            // step 3: "I uploaded it" → becomes the profile photo
  @HttpCode(200)
  confirm(@Param('auth0Id') auth0Id: string) {
    return this.photos.confirmUpload(auth0Id);
  }

  @Get('url')                                 // short-lived link to show my own photo
  url(@Param('auth0Id') auth0Id: string) {
    return this.photos.ownPhotoUrl(auth0Id);
  }

  @Delete()
  @HttpCode(204)
  remove(@Param('auth0Id') auth0Id: string) {
    return this.photos.remove(auth0Id);
  }
}

// The card a customer sees about the professional on their booking (the gateway checks the booking first)
@Controller('professionals')
export class PublicProfessionalsController {
  constructor(private readonly photos: PhotoService) {}

  @Get(':id/public')
  publicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.photos.publicProfile(id);
  }
}
