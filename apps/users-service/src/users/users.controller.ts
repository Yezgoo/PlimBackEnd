import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()                                     // POST /users
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()                                      // GET /users
  findAll() {
    return this.usersService.findAll();
  }

  @Get('by-auth0/:auth0Id')                   // GET /users/by-auth0/<auth0 id, URL-encoded>
  async findByAuth0Id(@Param('auth0Id') auth0Id: string) {
    const user = await this.usersService.findByAuth0Id(auth0Id);
    if (!user) throw new NotFoundException(`No user linked to ${auth0Id}`);
    return user;
  }

  @Patch('by-auth0/:auth0Id')                 // PATCH /users/by-auth0/<auth0 id> → change name or phone
  update(@Param('auth0Id') auth0Id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateByAuth0Id(auth0Id, dto);
  }

  @Get(':id')                                 // GET /users/<uuid>
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.usersService.findOne(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }
}