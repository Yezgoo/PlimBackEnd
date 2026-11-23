import { Controller, Get, Query, ParseUUIDPipe } from '@nestjs/common';
import { EarningsService } from './earnings.service.js';

// professionalId always comes from the gateway (resolved from the caller's token or from the customer's booking)
@Controller('earnings')
export class EarningsController {
  constructor(private readonly earnings: EarningsService) {}

  @Get()                                      // GET /earnings?professionalId=<uuid>
  forProfessional(@Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.earnings.forProfessional(professionalId);
  }

  @Get('completed-jobs')                      // GET /earnings/completed-jobs?professionalId=<uuid>
  completedJobs(@Query('professionalId', ParseUUIDPipe) professionalId: string) {
    return this.earnings.completedJobs(professionalId);
  }
}
