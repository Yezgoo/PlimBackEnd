import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Admin, Producer, stringSerializers } from '@platformatic/kafka';
import { USER_REGISTERED_TOPIC } from './user-events.js';

// Sends events to Kafka. The rest of users-service only calls publish().
@Injectable()
export class EventsPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventsPublisher.name);
  private readonly brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

  private readonly producer = new Producer({
    clientId: 'users-service',
    bootstrapBrokers: this.brokers,
    serializers: stringSerializers,
  });

  // Create the topics this service owns, if they don't exist yet
  async onModuleInit() {
    const admin = new Admin({ clientId: 'users-service-admin', bootstrapBrokers: this.brokers });
    try {
      const existing = await admin.listTopics();
      const missing = [USER_REGISTERED_TOPIC].filter((topic) => !existing.includes(topic));
      if (missing.length) {
        await admin.createTopics({ topics: missing, partitions: 3, replicas: 1 });
        this.logger.log(`Created topics: ${missing.join(', ')}`);
      }
    } finally {
      await admin.close();
    }
  }

  async onModuleDestroy() {
    await this.producer.close();
  }

  // key: messages with the same key go to the same partition, so they stay in order
  async publish(topic: string, key: string, event: object) {
    await this.producer.send({
      messages: [{ topic, key, value: JSON.stringify(event) }],
    });
  }
}
