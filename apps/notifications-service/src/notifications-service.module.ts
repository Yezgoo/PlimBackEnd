import { Module } from '@nestjs/common';
import { UserRegisteredConsumer } from './events/user-registered.consumer.js';
import { WelcomeNotifier } from './welcome/welcome.notifier.js';

@Module({
  providers: [UserRegisteredConsumer, WelcomeNotifier],
})
export class NotificationsServiceModule {}
