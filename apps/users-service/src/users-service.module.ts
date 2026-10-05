import { Module } from '@nestjs/common';
import { UsersServiceController } from './users-service.controller.js';
import { UsersServiceService } from './users-service.service.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [UsersModule],
  controllers: [UsersServiceController],
  providers: [UsersServiceService],
})
export class UsersServiceModule {}
