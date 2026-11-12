import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { HumanCallerGuard } from '../auth/human-caller.guard.js';
import { ADMIN_ACCESS, RequirePermissions } from '../auth/permissions.decorator.js';
import { callInternalService } from '../internal/internal-http.js';

@Controller('admin/settings')
@RequirePermissions(ADMIN_ACCESS)
@UseGuards(HumanCallerGuard)
export class AdminSettingsController {
  private readonly baseUrl = process.env.ADMIN_SERVICE_URL ?? 'http://localhost:3004';

  @Get()
  list() {
    return callInternalService('admin-service', this.baseUrl, '/settings');
  }

  @Get('audit')
  audit(@Query('key') key?: string, @Query('cursor') cursor?: string) {
    const query = new URLSearchParams();
    if (typeof key === 'string') query.set('key', key);
    if (typeof cursor === 'string') query.set('cursor', cursor);
    return callInternalService('admin-service', this.baseUrl, `/settings/audit?${query}`);
  }

  @Patch(':key')
  update(@CurrentUser() admin: JWTPayload, @Param('key') key: string, @Body('value') value: unknown) {
    return callInternalService('admin-service', this.baseUrl, `/settings/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, adminSub: admin.sub }),
    });
  }
}
