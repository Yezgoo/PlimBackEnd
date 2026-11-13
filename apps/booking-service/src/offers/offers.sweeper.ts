import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { BookingsService } from '../bookings/bookings.service.js';
import { OffersService } from './offers.service.js';

// The clock behind bookings: every OFFER_SWEEP_MS it closes offers whose deadline passed (which asks
// the next professional), retries bookings that are stuck with nobody being asked, and confirms
// finished jobs the customer did not answer about in time.
@Injectable()
export class OffersSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OffersSweeper.name);
  private readonly everyMs = Number(process.env.OFFER_SWEEP_MS ?? 30_000);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly offers: OffersService,
    private readonly bookings: BookingsService,
  ) {}

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
      await this.bookings.autoConfirmDue();
    } catch (e) {
      this.logger.error('Offer sweep failed', e as Error);
    } finally {
      this.running = false;
    }
  }
}
