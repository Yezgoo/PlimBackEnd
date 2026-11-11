import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { ProfessionalsController } from './professionals.controller.js';
import { ProfessionalsService } from './professionals.service.js';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [ProfessionalsController, DocumentsController],
  providers: [ProfessionalsService, DocumentsService],
})
export class ProfessionalsModule {}
