import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InternalTokenGuard } from './internal-token.guard.js';
import { PrismaService } from './prisma.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsOutbox } from './settings.outbox.js';
import { SettingsService } from './settings.service.js';

@Module({
  controllers: [SettingsController],
  providers: [
    PrismaService,
    SettingsService,
    SettingsOutbox,
    { provide: APP_GUARD, useClass: InternalTokenGuard },
  ],
})
export class AdminServiceModule {}
