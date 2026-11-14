import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { EventsModule } from '../events/events.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AdminProfessionalsController } from './admin-professionals.controller.js';
import { AdminProfessionalsService } from './admin-professionals.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { EligibilityController } from './eligibility.controller.js';
import { EligibilityService } from './eligibility.service.js';
import { ProfessionalsController } from './professionals.controller.js';
import { ProfessionalsService } from './professionals.service.js';
import { WorkSettingsController } from './work-settings.controller.js';
import { WorkSettingsService } from './work-settings.service.js';
import { ReviewRatingsController } from './review-ratings.controller.js';

@Module({
  imports: [DatabaseModule, StorageModule, EventsModule],
  controllers: [ProfessionalsController, DocumentsController, WorkSettingsController, AdminProfessionalsController, EligibilityController, ReviewRatingsController],
  providers: [ProfessionalsService, DocumentsService, WorkSettingsService, AdminProfessionalsService, EligibilityService],
})
export class ProfessionalsModule {}
