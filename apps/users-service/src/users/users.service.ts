import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma, type User } from '../generated/prisma/client.js';
import { EventsPublisher } from '../events/events.publisher.js';
import { USER_REGISTERED_TOPIC, type UserRegisteredEvent } from '../events/user-events.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsPublisher,
  ) {}

  async create(data: CreateUserDto) {
    let user: User;
    try {
      user = await this.prisma.user.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email or Auth0 id already exists');
      }
      throw e; // anything else is a real, unexpected error → let it be a 500
    }

    await this.publishUserRegistered(user);
    return user;
  }

  findAll() {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByAuth0Id(auth0Id: string) {
    return this.prisma.user.findUnique({ where: { auth0Id } });
  }

  // The user is already saved, so a Kafka failure must not turn this request into an error.
  // Known gap: if this fails, the event is lost. The outbox pattern fixes that later.
  private async publishUserRegistered(user: User) {
    const event: UserRegisteredEvent = {
      eventId: randomUUID(),
      type: 'user.registered',
      occurredAt: new Date().toISOString(),
      data: { userId: user.id, auth0Id: user.auth0Id, email: user.email, name: user.name },
    };
    try {
      await this.events.publish(USER_REGISTERED_TOPIC, user.id, event);
    } catch (e) {
      this.logger.error(`Failed to publish user.registered for ${user.id}`, e as Error);
    }
  }
}
