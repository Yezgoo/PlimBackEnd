import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AddressesService } from './addresses.service.js';
import { SaveAddressDto } from './dto/save-address.dto.js';

// A person's saved addresses. The Auth0 id in the path always comes from the gateway (the token's sub).
@Controller('users/by-auth0/:auth0Id/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@Param('auth0Id') auth0Id: string) {
    return this.addresses.list(auth0Id);
  }

  @Post()                                     // new address, or the same place renamed
  save(@Param('auth0Id') auth0Id: string, @Body() dto: SaveAddressDto) {
    return this.addresses.save(auth0Id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('auth0Id') auth0Id: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.addresses.remove(auth0Id, id);
  }
}
