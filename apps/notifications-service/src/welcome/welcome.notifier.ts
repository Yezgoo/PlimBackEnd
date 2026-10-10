import { Injectable, Logger } from '@nestjs/common';
import type { UserRegisteredEvent } from '../events/user-events.js';

// What notifications-service does when someone registers. For now it only logs;
// a real email/push provider plugs in here later.
@Injectable()
export class WelcomeNotifier {
  private readonly logger = new Logger(WelcomeNotifier.name);

  async onUserRegistered(event: UserRegisteredEvent) {
    const { email, name } = event.data;
    this.logger.log(`Would send a welcome email to ${email} (${name ?? 'no name'})`);
  }
}
