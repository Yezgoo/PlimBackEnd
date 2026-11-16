import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MeDocumentsController } from './me-documents.controller.js';
import { MeProfessionalController } from './me-professional.controller.js';
import { MeWorkController } from './me-work.controller.js';
import { MeController } from './me.controller.js';
import { UsersClient } from './users.client.js';
import { MePushController } from './me-push.controller.js';
import { MePrivacyController } from './me-privacy.controller.js';
import { MeFavoritesController } from './me-favorites.controller.js';

@Module({
  imports: [CatalogModule],
  controllers: [MeController, MeProfessionalController, MeDocumentsController, MeWorkController, MePushController, MePrivacyController, MeFavoritesController],
  providers: [UsersClient],
  exports: [UsersClient], // the admin module uses it too
})
export class UsersModule {}
