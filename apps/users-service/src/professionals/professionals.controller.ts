import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApplyProfessionalDto } from './dto/apply-professional.dto.js';
import { UpdateProfessionalDto } from './dto/update-professional.dto.js';
import { ProfessionalsService } from './professionals.service.js';

// A user's professional profile. The Auth0 id in the path always comes from the gateway (the token's sub).
@Controller('users/by-auth0/:auth0Id/professional')
export class ProfessionalsController {
  constructor(private readonly professionals: ProfessionalsService) {}

  @Post()                                     // apply as a professional
  apply(@Param('auth0Id') auth0Id: string, @Body() dto: ApplyProfessionalDto) {
    return this.professionals.apply(auth0Id, dto);
  }

  @Get()                                      // 404 = this user has not applied
  find(@Param('auth0Id') auth0Id: string) {
    return this.professionals.findByAuth0Id(auth0Id);
  }

  @Patch()
  update(@Param('auth0Id') auth0Id: string, @Body() dto: UpdateProfessionalDto) {
    return this.professionals.update(auth0Id, dto);
  }
}
