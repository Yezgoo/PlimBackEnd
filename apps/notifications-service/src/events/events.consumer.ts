import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Consumer, stringDeserializers, type MessagesStream } from '@platformatic/kafka';
import { ProfessionalNotifier } from '../professionals/professional.notifier.js';
import { WelcomeNotifier } from '../welcome/welcome.notifier.js';
import { SUBSCRIBED_TOPICS, type IncomingEvent } from './incoming-events.js';
import { notificationRecipient } from '../notification-recipient.js';

// Reads the events this service cares about and hands each one to the right notifier.
@Injectable()
export class EventsConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventsConsumer.name);

  private readonly consumer = new Consumer({
    // Kafka remembers how far each group has read. Every copy of notifications-service
    // shares this group, so each event is handled by only one of them.
    groupId: 'notifications-service',
    clientId: 'notifications-service',
    bootstrapBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    deserializers: stringDeserializers,
  });

  private stream?: MessagesStream<string, string, string, string>;

  constructor(
    private readonly welcome: WelcomeNotifier,
    private readonly professionals: ProfessionalNotifier,
  ) {}

  async onApplicationBootstrap() {
    this.stream = await this.consumer.consume({
      topics: SUBSCRIBED_TOPICS,
      autocommit: false,     // we commit ourselves, only after handling a message
      mode: 'committed',     // continue where this group stopped last time...
      fallbackMode: 'earliest', // ...or, the very first time, from the oldest message
    });
    this.logger.log(`Listening to ${SUBSCRIBED_TOPICS.join(', ')}`);

    // don't await: the loop runs for as long as the service is up
    void this.readLoop(this.stream);
  }

  async onModuleDestroy() {
    await this.stream?.close();
    await this.consumer.close();
  }

  private async readLoop(stream: MessagesStream<string, string, string, string>) {
    try {
      for await (const message of stream) {
        await this.handle(message.value);
        await message.commit(); // tell Kafka this group is done with this message
      }
    } catch (e) {
      this.logger.error('Consumer stopped', e as Error);
    }
  }

  async handle(raw: string) {
    let event: IncomingEvent;
    try {
      event = JSON.parse(raw);
    } catch {
      // a broken message would otherwise block us forever: log it and move on
      this.logger.warn('Skipping a message that is not valid JSON');
      return;
    }

    try {
      if (event?.type === 'user.registered' || event?.type === 'professional.approved' || event?.type === 'professional.rejected') {
        if (!event.data?.userId) return;
        const recipient = await notificationRecipient(event.data.userId);
        if (!recipient) return;
      }
      switch (event.type) {
        case 'user.registered':
          return await this.welcome.onUserRegistered(event);
        case 'professional.approved':
          return await this.professionals.onApproved(event);
        case 'professional.rejected':
          return await this.professionals.onRejected(event);
        default:
          this.logger.warn(`No handler for event type ${(event as { type?: string }).type}`);
      }
    } catch (e) {
      // keep going for now; retries and a dead-letter topic come later
      this.logger.error(`Failed to handle event ${event.eventId}`, e as Error);
    }
  }
}
