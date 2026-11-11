import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { EventsPublisher } from './events.publisher.js';
import { OutboxRelay } from './outbox.relay.js';

@Module({
  imports: [DatabaseModule],
  providers: [EventsPublisher, OutboxRelay],
  exports: [OutboxRelay],
})
export class EventsModule {}
