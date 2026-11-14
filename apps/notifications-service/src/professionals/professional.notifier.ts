import { Injectable, Logger } from '@nestjs/common';
import type { ProfessionalApprovedEvent, ProfessionalRejectedEvent } from '../events/incoming-events.js';

// Tells an applicant what happened to their application. For now it only logs;
// the real email / push goes here later (roadmap step 13).
@Injectable()
export class ProfessionalNotifier {
  private readonly logger = new Logger(ProfessionalNotifier.name);

  async onApproved(event: ProfessionalApprovedEvent) {
    this.logger.log(`Approval notification eligible for event ${event.eventId}`);
  }

  async onRejected(event: ProfessionalRejectedEvent) {
    this.logger.log(`Rejection notification eligible for event ${event.eventId}`);
  }
}
