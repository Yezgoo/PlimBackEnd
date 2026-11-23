import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { UsersClient, type SaveAddressInput } from './users.client.js';

// The caller's saved addresses, offered at the start of every booking.
// users-service validates the fields; whose addresses they are always comes from the token.
@Controller('me/addresses')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class MeAddressesController {
  constructor(private readonly users: UsersClient) {}

  @Get()                                      // GET /me/addresses → oldest first
  list(@CurrentUser() user: JWTPayload) {
    return this.users.listAddresses(user.sub!);
  }

  @Post()                                     // POST /me/addresses → saves it (or renames the same place)
  save(@CurrentUser() user: JWTPayload, @Body() input: SaveAddressInput) {
    return this.users.saveAddress(user.sub!, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: JWTPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deleteAddress(user.sub!, id);
  }
}
