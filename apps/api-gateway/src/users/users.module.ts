import { Module } from '@nestjs/common';
import { MeController } from './me.controller.js';
import { UsersClient } from './users.client.js';

@Module({
  controllers: [MeController],
  providers: [UsersClient],
})
export class UsersModule {}
