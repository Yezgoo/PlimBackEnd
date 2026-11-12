import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Get('audit')
  audit(@Query('key') key?: string, @Query('cursor', new ParseUUIDPipe({ optional: true })) cursor?: string) {
    return this.settings.audit(key, cursor);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body('value') value: unknown, @Body('adminSub') adminSub: unknown) {
    return this.settings.update(key, value, adminSub);
  }
}
