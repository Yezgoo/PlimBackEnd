import { BadRequestException, Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { EligibilityService } from './eligibility.service.js';

// Service-to-service only (booking-service asks this when it needs someone for a job).
@Controller('internal/professionals')
export class EligibilityController {
  constructor(private readonly eligibility: EligibilityService) {}

  // GET /internal/professionals/eligible?serviceTypeId=…&municipalityCode=0603&start=…&end=…
  @Get('eligible')
  eligible(
    @Query('serviceTypeId', ParseUUIDPipe) serviceTypeId: string,
    @Query('municipalityCode') municipalityCode: string,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const from = new Date(start);
    const to = new Date(end);
    if (!/^\d{4}$/.test(municipalityCode ?? '')) throw new BadRequestException('municipalityCode must be 4 digits');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      throw new BadRequestException('start and end must be dates, with end after start');
    }
    return this.eligibility.eligibleFor({ serviceTypeId, municipalityCode, start: from, end: to });
  }
}
