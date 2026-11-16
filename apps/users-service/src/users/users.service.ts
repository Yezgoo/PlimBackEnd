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
    const { privacyVersion, ...profile } = data;
    let user: User;
    try {
      // the user and its user.registered event are saved together: both or neither
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: privacyVersion ? { ...profile, consents: { create: { version: privacyVersion } } } : profile,
        });
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

  async listFavorites(auth0Id: string) {
    const userId = await this.favoriteOwnerId(auth0Id);
    const rows = await this.prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { serviceSlug: true },
    });
    return { favorites: rows.map(({ serviceSlug }) => serviceSlug) };
  }

  async addFavorite(auth0Id: string, serviceSlug: string) {
    const userId = await this.favoriteOwnerId(auth0Id);
    await this.prisma.userFavorite.upsert({
      where: { userId_serviceSlug: { userId, serviceSlug } },
      create: { userId, serviceSlug },
      update: {},
    });
    return this.listFavorites(auth0Id);
  }

  async removeFavorite(auth0Id: string, serviceSlug: string) {
    const userId = await this.favoriteOwnerId(auth0Id);
    await this.prisma.userFavorite.deleteMany({ where: { userId, serviceSlug } });
    return this.listFavorites(auth0Id);
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
      data: { userId: user.id },
    };
  }

  private async favoriteOwnerId(auth0Id: string) {
    const user = await this.prisma.user.findUnique({ where: { auth0Id }, select: { id: true } });
    if (!user) throw new NotFoundException(`No user linked to ${auth0Id}`);
    return user.id;
  }
}
