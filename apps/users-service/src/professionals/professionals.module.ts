import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { EventsModule } from '../events/events.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AdminProfessionalsController } from './admin-professionals.controller.js';
import { AdminProfessionalsService } from './admin-professionals.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { ProfessionalsController } from './professionals.controller.js';
import { ProfessionalsService } from './professionals.service.js';

@Module({
  imports: [DatabaseModule, StorageModule, EventsModule],
  controllers: [ProfessionalsController, DocumentsController, AdminProfessionalsController],
  providers: [ProfessionalsService, DocumentsService, AdminProfessionalsService],
})
export class ProfessionalsModule {}
