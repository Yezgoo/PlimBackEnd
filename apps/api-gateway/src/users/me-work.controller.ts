import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { CatalogClient } from '../catalog/catalog.client.js';
import { UsersClient, type AvailabilityBlock, type TimeOffInput } from './users.client.js';

// Where, what and when the caller works as a professional.
// Areas and services live in users-service but must exist in the catalog, and only the gateway
// can see both, so the check happens here.
@Controller('me/professional')
@UseGuards(HumanCallerGuard)                  // people only: machine tokens get 403
export class MeWorkController {
  constructor(
    private readonly usersClient: UsersClient,
    private readonly catalog: CatalogClient,
  ) {}

  @Get('work-settings')                       // areas, services, timetable and upcoming time off
  workSettings(@CurrentUser() user: JWTPayload) {
    return this.usersClient.workSettings(user.sub!);
  }

  @Put('areas')                               // { municipalityCodes: ["0603"] } replaces the list
  async setAreas(@CurrentUser() user: JWTPayload, @Body() input: { municipalityCodes?: unknown }) {
    const codes = stringList(input?.municipalityCodes, 'municipalityCodes');
    const known = new Set((await this.catalog.listMunicipalities()).map((municipality) => municipality.code));
    rejectUnknown(codes, known, 'municipality');
    return this.usersClient.setAreas(user.sub!, codes);
  }

  @Put('services')                            // { serviceTypeIds: ["<id>"] } replaces the list
  async setServices(@CurrentUser() user: JWTPayload, @Body() input: { serviceTypeIds?: unknown }) {
    const ids = stringList(input?.serviceTypeIds, 'serviceTypeIds');
    const known = new Set((await this.catalog.listServices()).map((service) => service.id));
    rejectUnknown(ids, known, 'service');
    return this.usersClient.setServices(user.sub!, ids);
  }

  @Put('availability')                        // { slots: [{ weekday: 1, start: "09:00", end: "13:00" }] } replaces the week
  setAvailability(@CurrentUser() user: JWTPayload, @Body() input: { slots: AvailabilityBlock[] }) {
    return this.usersClient.setAvailability(user.sub!, input?.slots);
  }

  @Post('time-off')                           // { startsAt, endsAt, reason? }
  addTimeOff(@CurrentUser() user: JWTPayload, @Body() input: TimeOffInput) {
    return this.usersClient.addTimeOff(user.sub!, input);
  }

  @Delete('time-off/:id')
  @HttpCode(204)
  removeTimeOff(@CurrentUser() user: JWTPayload, @Param('id') id: string) {
    return this.usersClient.removeTimeOff(user.sub!, id);
  }
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new BadRequestException(`${name} must be a list of text values`);
  }
  return [...new Set(value as string[])]; // the same choice twice counts once
}

function rejectUnknown(chosen: string[], known: Set<string>, what: string) {
  const unknown = chosen.filter((item) => !known.has(item));
  if (unknown.length) throw new BadRequestException(`Unknown ${what}: ${unknown.join(', ')}`);
}
