import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PayoutAccountsService } from './payout-accounts.service.js';
import { SettlementService } from './settlement.service.js';

@Module({ controllers: [PaymentsController], providers: [PaymentsService, PayoutAccountsService, SettlementService] })
export class PaymentsModule {}
