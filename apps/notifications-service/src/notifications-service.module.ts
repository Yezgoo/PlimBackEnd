import { Module } from '@nestjs/common';
import { EventsConsumer } from './events/events.consumer.js';
import { ProfessionalNotifier } from './professionals/professional.notifier.js';
import { WelcomeNotifier } from './welcome/welcome.notifier.js';

@Module({
  providers: [EventsConsumer, WelcomeNotifier, ProfessionalNotifier],
})
export class NotificationsServiceModule {}
