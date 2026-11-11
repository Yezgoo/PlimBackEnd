import { Injectable, Logger } from '@nestjs/common';
import type { ProfessionalApprovedEvent, ProfessionalRejectedEvent } from '../events/incoming-events.js';

// Tells an applicant what happened to their application. For now it only logs;
// the real email / push goes here later (roadmap step 13).
@Injectable()
export class ProfessionalNotifier {
  private readonly logger = new Logger(ProfessionalNotifier.name);

  async onApproved(event: ProfessionalApprovedEvent) {
    const { email, name } = event.data;
    this.logger.log(`Would tell ${email} (${name ?? 'no name'}) they are approved and can start receiving jobs`);
  }

  async onRejected(event: ProfessionalRejectedEvent) {
    const { email, reason } = event.data;
    this.logger.log(`Would tell ${email} their application needs changes: ${reason}`);
  }
}
