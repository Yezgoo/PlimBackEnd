import { Body, Controller, Get, Post } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UsersClient, type RegisterUserInput } from './users.client.js';

// Everything here is about the caller, identified by the token's "sub" claim.
@Controller('me')
export class MeController {
  constructor(private readonly usersClient: UsersClient) {}

  @Get()                                      // GET /me → my profile, or 404 if I haven't registered
  profile(@CurrentUser() user: JWTPayload) {
    return this.usersClient.findByAuth0Id(user.sub!);
  }

  @Post()                                     // POST /me → register my profile
  register(@CurrentUser() user: JWTPayload, @Body() input: RegisterUserInput) {
    return this.usersClient.create(user.sub!, input);
  }
}
