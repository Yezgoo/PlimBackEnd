import { Module } from '@nestjs/common';
import { MeDocumentsController } from './me-documents.controller.js';
import { MeProfessionalController } from './me-professional.controller.js';
import { MeController } from './me.controller.js';
import { UsersClient } from './users.client.js';

@Module({
  controllers: [MeController, MeProfessionalController, MeDocumentsController],
  providers: [UsersClient],
  exports: [UsersClient], // the admin module uses it too
})
export class UsersModule {}
