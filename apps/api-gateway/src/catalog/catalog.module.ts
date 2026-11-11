import { Module } from '@nestjs/common';
import { CatalogClient } from './catalog.client.js';
import { CatalogController } from './catalog.controller.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogClient],
  exports: [CatalogClient], // /me/professional uses it to check areas and services exist
})
export class CatalogModule {}
