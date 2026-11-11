import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Admin, Producer, stringSerializers } from '@platformatic/kafka';
import { PROFESSIONAL_APPROVED_TOPIC, PROFESSIONAL_REJECTED_TOPIC } from './professional-events.js';
import { USER_REGISTERED_TOPIC } from './user-events.js';

// Every topic users-service publishes to. Add new ones here so they get created.
const OWNED_TOPICS = [USER_REGISTERED_TOPIC, PROFESSIONAL_APPROVED_TOPIC, PROFESSIONAL_REJECTED_TOPIC];

// Sends events to Kafka. Only OutboxRelay calls publish(); the rest of users-service writes to the outbox.
@Injectable()
export class EventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsPublisher.name);
  private readonly brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
  private topicsReady = false;

  private readonly producer = new Producer({
    clientId: 'users-service',
    bootstrapBrokers: this.brokers,
    serializers: stringSerializers,
  });

  // Kafka being down must not stop users-service from starting: events wait in the outbox
  async onModuleInit() {
    try {
      await this.ensureTopics();
    } catch (e) {
      this.logger.warn(`Kafka not reachable yet, will retry when publishing: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.producer.close();
  }

  // key: messages with the same key go to the same partition, so they stay in order
  async publish(topic: string, key: string, event: unknown) {
    await this.ensureTopics();
    await this.producer.send({
      messages: [{ topic, key, value: JSON.stringify(event) }],
    });
  }

  // Create the topics this service owns, if they don't exist yet
  private async ensureTopics() {
    if (this.topicsReady) return;
    const admin = new Admin({ clientId: 'users-service-admin', bootstrapBrokers: this.brokers });
    try {
      const existing = await admin.listTopics();
      const missing = OWNED_TOPICS.filter((topic) => !existing.includes(topic));
      if (missing.length) {
        await admin.createTopics({ topics: missing, partitions: 3, replicas: 1 });
        this.logger.log(`Created topics: ${missing.join(', ')}`);
      }
      this.topicsReady = true;
    } finally {
      await admin.close();
    }
  }
}
