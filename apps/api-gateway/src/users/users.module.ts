import { Module } from '@nestjs/common';
import { MeProfessionalController } from './me-professional.controller.js';
import { MeController } from './me.controller.js';
import { UsersClient } from './users.client.js';

@Module({
  controllers: [MeController, MeProfessionalController],
  providers: [UsersClient],
})
export class UsersModule {}
