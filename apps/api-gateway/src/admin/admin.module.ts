import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { AdminProfessionalsController } from './admin-professionals.controller.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [UsersModule],
  controllers: [AdminController, AdminProfessionalsController],
})
export class AdminModule {}
