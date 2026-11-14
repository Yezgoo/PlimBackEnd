import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ReviewsService } from './reviews.service.js';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('privacy/:id')
  export(@Headers('x-internal-token') token: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    this.authorize(token);
    return this.reviews.exportByCustomer(id);
  }

  @Get(':id')
  find(@Headers('x-internal-token') token: string | undefined, @Param('id', ParseUUIDPipe) id: string,
    @Query('customerId', ParseUUIDPipe) customerId: string) {
    this.authorize(token);
    return this.reviews.find(id, customerId);
  }

  @Post('privacy/:id/scrub')
  @HttpCode(200)
  scrub(@Headers('x-internal-token') token: string | undefined, @Param('id', ParseUUIDPipe) id: string) {
    this.authorize(token);
    return this.reviews.scrubByCustomer(id);
  }

  @Post(':id')
  create(@Headers('x-internal-token') token: string | undefined, @Param('id', ParseUUIDPipe) id: string,
    @Query('customerId', ParseUUIDPipe) customerId: string, @Body() body: unknown) {
    this.authorize(token);
    return this.reviews.create(id, customerId, body);
  }

  private authorize(token?: string) {
    const expected = Buffer.from(process.env.INTERNAL_SERVICE_TOKEN ?? '');
    const given = Buffer.from(token ?? '');
    if (!expected.length || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new UnauthorizedException('Missing or invalid internal token');
    }
  }
}
