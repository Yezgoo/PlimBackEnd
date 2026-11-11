import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersServiceController } from './users-service.controller.js';
import { UsersServiceService } from './users-service.service.js';
import { UsersModule } from './users/users.module.js';
import { InternalTokenGuard } from './auth/internal-token.guard.js';

@Module({
  imports: [UsersModule],
  controllers: [UsersServiceController],
  providers: [
    UsersServiceService,
    { provide: APP_GUARD, useClass: InternalTokenGuard }, // every route requires the gateway's secret
  ],
})
export class UsersServiceModule {}
