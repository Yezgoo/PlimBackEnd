import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { EventsModule } from '../events/events.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { PrivacyController } from './privacy.controller.js';
import { StorageModule } from '../storage/storage.module.js';
import { Auth0ErasureService } from './auth0-erasure.service.js';

@Module({
  imports: [DatabaseModule, EventsModule, StorageModule],
  controllers: [UsersController, PrivacyController],
  providers: [UsersService, Auth0ErasureService],
})
export class UsersModule {}
