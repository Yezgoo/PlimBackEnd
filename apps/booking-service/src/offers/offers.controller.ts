import { Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { OfferStatus } from '../generated/prisma/client.js';
import { OffersService } from './offers.service.js';

// Job offers as a professional sees them. professionalId always comes from the gateway
// (it looks up the caller's professional profile from their token).
@Controller('offers')
export class OffersController {
  constructor(private readonly offers: OffersService) {}

  @Get()                                      // GET /offers?professionalId=<uuid>&status=pending
  list(
    @Query('professionalId', ParseUUIDPipe) professionalId: string,
    @Query('status', new ParseEnumPipe(OfferStatus, { optional: true })) status?: OfferStatus,
  ) {
    return this.offers.listForProfessional(professionalId, status);
  }

  @Post(':id/accept')                         // the professional takes the job
  @HttpCode(200)
  accept(@Param('id', ParseUUIDPipe) id: string, @Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.offers.accept(id, professionalId);
  }

  @Post(':id/decline')                        // "not this one": the next professional is asked
  @HttpCode(200)
  decline(@Param('id', ParseUUIDPipe) id: string, @Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.offers.decline(id, professionalId);
  }
}
