import { BadRequestException, Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { UsersClient, type RegisterUserInput, type UpdateUserInput } from './users.client.js';

// Everything here is about the caller, identified by the token's "sub" claim.
@Controller('me')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class MeController {
  constructor(private readonly usersClient: UsersClient) {}

  @Get()                                      // GET /me → my profile, or 404 if I haven't registered
  profile(@CurrentUser() user: JWTPayload) {
    return this.usersClient.findByAuth0Id(user.sub!);
  }

  @Post()                                     // POST /me → register my profile
  register(@CurrentUser() user: JWTPayload, @Body() input: RegisterUserInput) {
    if (input?.privacyVersion !== '2026-11-v1') throw new BadRequestException('Confirma a informação de privacidade para continuar.');
    return this.usersClient.create(user.sub!, input);
  }

  @Patch()                                    // PATCH /me → change my name or phone
  update(@CurrentUser() user: JWTPayload, @Body() input: UpdateUserInput) {
    return this.usersClient.update(user.sub!, input);
  }
}
