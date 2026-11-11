import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InternalTokenGuard } from './auth/internal-token.guard.js';
import { CatalogModule } from './catalog/catalog.module.js';

@Module({
  imports: [CatalogModule],
  providers: [
    { provide: APP_GUARD, useClass: InternalTokenGuard }, // every route requires the gateway's secret
  ],
})
export class CatalogServiceModule {}
