import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Admin, Producer, stringSerializers } from '@platformatic/kafka';
import { PrismaService } from './prisma.service.js';

export const SETTINGS_CHANGED = 'settings.changed';

@Injectable()
export class SettingsOutbox implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettingsOutbox.name);
  private readonly brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
  private readonly producer = new Producer({
    clientId: 'admin-service',
    bootstrapBrokers: this.brokers,
    serializers: stringSerializers,
  });
  private topicsReady = false;
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.flush();
    this.timer = setInterval(() => void this.flush(), Number(process.env.OUTBOX_POLL_MS ?? 30_000));
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
    await this.producer.close();
  }

  flush(): Promise<void> {
    this.running ??= this.publishPending().finally(() => { this.running = undefined; });
    return this.running;
  }

  private async publishPending() {
    try {
      await this.prisma.$transaction(async (tx) => {
        // One relay per admin database keeps changes in revision order across replicas.
        const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(12001) AS acquired
        `;
        if (!lock.acquired) return;

        const pending = await tx.outboxEvent.findMany({
          where: { publishedAt: null },
          orderBy: { sequence: 'asc' },
          take: 25,
        });
        for (const event of pending) {
          try {
            await this.ensureTopic();
            await this.producer.send({
              messages: [{ topic: SETTINGS_CHANGED, key: event.key, value: JSON.stringify(event.payload) }],
            });
          } catch (error) {
            this.topicsReady = false;
            this.logger.warn(`Settings event ${event.id} queued for retry: ${(error as Error).message}`);
            return;
          }
          await tx.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
        }
      }, { timeout: 30_000 });
    } catch (error) {
      this.logger.error('Settings outbox relay failed', error as Error);
    }
  }

  private async ensureTopic() {
    if (this.topicsReady) return;
    const admin = new Admin({ clientId: 'admin-service-topic', bootstrapBrokers: this.brokers });
    try {
      const existing = await admin.listTopics();
      if (!existing.includes(SETTINGS_CHANGED)) {
        await admin.createTopics({ topics: [SETTINGS_CHANGED], partitions: 3, replicas: 1 });
      }
      this.topicsReady = true;
    } finally {
      await admin.close();
    }
  }
}
