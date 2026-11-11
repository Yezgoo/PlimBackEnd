import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type User } from '../generated/prisma/client.js';
import { OutboxRelay } from '../events/outbox.relay.js';
import { USER_REGISTERED_TOPIC, type UserRegisteredEvent } from '../events/user-events.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxRelay,
  ) {}

  async create(data: CreateUserDto) {
    let user: User;
    try {
      // the user and its user.registered event are saved together: both or neither
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data });
        const event = this.userRegistered(created);
        await tx.outboxEvent.create({
          data: { id: event.eventId, topic: USER_REGISTERED_TOPIC, key: created.id, payload: event },
        });
        return created;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email or Auth0 id already exists');
      }
      throw e; // anything else is a real, unexpected error → let it be a 500
    }

    void this.outbox.flush(); // send the event now instead of waiting for the next poll
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

  async updateByAuth0Id(auth0Id: string, data: UpdateUserDto) {
    try {
      return await this.prisma.user.update({ where: { auth0Id }, data });
    } catch (e) {
      // P2025 = no row matched the where
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
        throw new NotFoundException(`No user linked to ${auth0Id}`);
      }
      throw e;
    }
  }

  private userRegistered(user: User): UserRegisteredEvent {
    return {
      eventId: randomUUID(),
      type: 'user.registered',
      occurredAt: new Date().toISOString(),
      data: { userId: user.id, auth0Id: user.auth0Id, email: user.email, name: user.name },
    };
  }
}
