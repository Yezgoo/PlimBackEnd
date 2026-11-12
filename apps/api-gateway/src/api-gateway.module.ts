import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module.js';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { PermissionsGuard } from './auth/permissions.guard.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [HealthModule, UsersModule, CatalogModule, BookingsModule, AdminModule],
  controllers: [ApiGatewayController],
  providers: [
    ApiGatewayService,
    // Global guards run in this order on every route of the gateway:
    { provide: APP_GUARD, useClass: AuthGuard },        // 1. who is calling? (verifies the Auth0 token)
    { provide: APP_GUARD, useClass: PermissionsGuard }, // 2. may they do this? (permissions, /admin)
  ],
})
export class ApiGatewayModule {}
