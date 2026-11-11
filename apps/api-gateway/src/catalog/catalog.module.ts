import { Module } from '@nestjs/common';
import { CatalogClient } from './catalog.client.js';
import { CatalogController } from './catalog.controller.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogClient],
})
export class CatalogModule {}
