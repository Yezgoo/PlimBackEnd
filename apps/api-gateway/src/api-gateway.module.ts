import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiGatewayController } from './api-gateway.controller.js';
import { ApiGatewayService } from './api-gateway.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { HealthModule } from './health/health.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [HealthModule, UsersModule, CatalogModule],
  controllers: [ApiGatewayController],
  providers: [
    ApiGatewayService,
    { provide: APP_GUARD, useClass: AuthGuard }, // runs on every route of the gateway
  ],
})
export class ApiGatewayModule {}
