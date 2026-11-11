import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { UsersClient, type ApplyProfessionalInput, type UpdateProfessionalInput } from './users.client.js';

// The caller's own professional profile. As with /me, who you are comes from the token, never from the body.
@Controller('me/professional')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class MeProfessionalController {
  constructor(private readonly usersClient: UsersClient) {}

  @Get()                                      // GET /me/professional → my application / pro profile, 404 if I never applied
  find(@CurrentUser() user: JWTPayload) {
    return this.usersClient.findProfessional(user.sub!);
  }

  @Post()                                     // POST /me/professional → apply to work on YezGoo (status starts as "applied")
  apply(@CurrentUser() user: JWTPayload, @Body() input: ApplyProfessionalInput) {
    return this.usersClient.applyAsProfessional(user.sub!, input);
  }

  @Patch()                                    // PATCH /me/professional → edit my pro profile
  update(@CurrentUser() user: JWTPayload, @Body() input: UpdateProfessionalInput) {
    return this.usersClient.updateProfessional(user.sub!, input);
  }
}
