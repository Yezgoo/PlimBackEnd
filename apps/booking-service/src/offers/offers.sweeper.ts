import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OffersService } from './offers.service.js';

// The clock behind the offers: every OFFER_SWEEP_MS it closes offers whose deadline passed
// (which asks the next professional) and retries bookings that are stuck with nobody being asked.
@Injectable()
export class OffersSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OffersSweeper.name);
  private readonly everyMs = Number(process.env.OFFER_SWEEP_MS ?? 30_000);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly offers: OffersService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), this.everyMs);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async sweep() {
    if (this.running) return; // the previous round is still going
    this.running = true;
    try {
      await this.offers.expireDue();
      await this.offers.retryStalled();
    } catch (e) {
      this.logger.error('Offer sweep failed', e as Error);
    } finally {
      this.running = false;
    }
  }
}
