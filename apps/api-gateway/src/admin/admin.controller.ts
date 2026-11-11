import { Controller, Get } from '@nestjs/common';
import type { JWTPayload } from 'jose';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ADMIN_ACCESS, RequirePermissions } from '../auth/permissions.decorator.js';

// Back-office routes. Everything under /admin needs the admin permission (PermissionsGuard enforces
// that by path as well, so a route added here can't be left open by mistake).
@Controller('admin')
@RequirePermissions(ADMIN_ACCESS)
export class AdminController {
  @Get('me')                                  // GET /admin/me → "am I an admin?" for the admin panel
  me(@CurrentUser() user: JWTPayload) {
    return { sub: user.sub, permissions: user.permissions ?? [] };
  }
}
