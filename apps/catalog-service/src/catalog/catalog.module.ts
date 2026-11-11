import { Module } from '@nestjs/common';
import { AreasService } from '../areas/areas.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [CatalogService, AreasService],
})
export class CatalogModule {}
