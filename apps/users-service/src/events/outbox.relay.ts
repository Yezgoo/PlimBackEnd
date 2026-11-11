import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { EventsPublisher } from './events.publisher.js';

type PendingEvent = { id: string; topic: string; key: string; payload: unknown };

// Sends saved outbox events to Kafka, oldest first, and marks them as published.
// Runs right after each change (flush) and every OUTBOX_POLL_MS as a safety net,
// which is what picks up events saved while Kafka was down.
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly pollMs = Number(process.env.OUTBOX_POLL_MS ?? 30_000);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: EventsPublisher,
  ) {}

  onModuleInit() {
    void this.flush(); // send anything left from the last run
    this.timer = setInterval(() => void this.flush(), this.pollMs);
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  // Safe to call any time: if a flush is already running, it just waits for that one
  flush(): Promise<void> {
    this.running ??= this.sendPending().finally(() => (this.running = undefined));
    return this.running;
  }

  private async sendPending() {
    try {
      await this.prisma.$transaction(async (tx) => {
        // SKIP LOCKED: if two copies of users-service run, each takes different rows
        const pending = await tx.$queryRaw<PendingEvent[]>`
          SELECT id, topic, key, payload FROM outbox_events
          WHERE published_at IS NULL
          ORDER BY created_at
          LIMIT 100
          FOR UPDATE SKIP LOCKED`;

        for (const event of pending) {
          try {
            await this.publisher.publish(event.topic, event.key, event.payload);
          } catch (e) {
            await tx.outboxEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
            this.logger.warn(`Kafka unavailable, ${event.topic} ${event.id} stays in the outbox: ${(e as Error).message}`);
            return; // keep the order: stop here and retry from this event next time
          }
          await tx.outboxEvent.update({ where: { id: event.id }, data: { publishedAt: new Date() } });
        }
      });
    } catch (e) {
      this.logger.error('Outbox relay failed', e as Error);
    }
  }
}
