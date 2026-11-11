import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AddTimeOffDto, SetAreasDto, SetAvailabilityDto, SetServicesDto } from './dto/work-settings.dto.js';
import { WorkSettingsService } from './work-settings.service.js';

// Where, what and when a professional works. The Auth0 id in the path always comes from the gateway.
@Controller('users/by-auth0/:auth0Id/professional')
export class WorkSettingsController {
  constructor(private readonly work: WorkSettingsService) {}

  @Get('work-settings')                       // areas, services, timetable and upcoming time off in one answer
  get(@Param('auth0Id') auth0Id: string) {
    return this.work.get(auth0Id);
  }

  @Put('areas')                               // replaces the list of municipalities
  setAreas(@Param('auth0Id') auth0Id: string, @Body() dto: SetAreasDto) {
    return this.work.setAreas(auth0Id, dto.municipalityCodes);
  }

  @Put('services')                            // replaces the list of services
  setServices(@Param('auth0Id') auth0Id: string, @Body() dto: SetServicesDto) {
    return this.work.setServices(auth0Id, dto.serviceTypeIds);
  }

  @Put('availability')                        // replaces the weekly timetable
  setAvailability(@Param('auth0Id') auth0Id: string, @Body() dto: SetAvailabilityDto) {
    return this.work.setAvailability(auth0Id, dto.slots);
  }

  @Post('time-off')
  addTimeOff(@Param('auth0Id') auth0Id: string, @Body() dto: AddTimeOffDto) {
    return this.work.addTimeOff(auth0Id, dto);
  }

  @Delete('time-off/:id')
  @HttpCode(204)
  removeTimeOff(@Param('auth0Id') auth0Id: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.work.removeTimeOff(auth0Id, id);
  }
}
