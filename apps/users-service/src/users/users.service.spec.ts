import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { UsersService } from './users.service.js';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { EventsPublisher } from '../events/events.publisher.js';

describe('UsersService', () => {
  let service: UsersService;

  // the fake: same shape as the parts of PrismaService we use
  const prismaMock = {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  // fake Kafka publisher: we only check what users-service asks it to send
  const eventsMock = { publish: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks(); // reset call history between tests

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock }, // "when someone asks for PrismaService, give them the fake"
        { provide: EventsPublisher, useValue: eventsMock },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('create() passes the data to Prisma and returns the new user', async () => {
    const dto = { auth0Id: 'auth0|1', email: 'a@b.com' };
    prismaMock.user.create.mockResolvedValue({ id: 'uuid-1', ...dto });

    const result = await service.create(dto);

    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: dto });
    expect(result.id).toBe('uuid-1');
  });

  it('findAll() asks for newest users first', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });

  it('findOne() returns null when the user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    expect(await service.findOne('some-id')).toBeNull();
  });

  it('create() throws 409 when the email or auth0Id already exists', async () => {
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(service.create({ auth0Id: 'auth0|1', email: 'a@b.com' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('create() publishes user.registered, keyed by the user id', async () => {
    const user = { id: 'uuid-1', auth0Id: 'auth0|1', email: 'a@b.com', name: 'Ana' };
    prismaMock.user.create.mockResolvedValue(user);

    await service.create({ auth0Id: 'auth0|1', email: 'a@b.com', name: 'Ana' });

    expect(eventsMock.publish).toHaveBeenCalledWith(
      'user.registered',
      'uuid-1',
      expect.objectContaining({
        type: 'user.registered',
        data: { userId: 'uuid-1', auth0Id: 'auth0|1', email: 'a@b.com', name: 'Ana' },
      }),
    );
  });

  it('create() still returns the user when Kafka is down', async () => {
    prismaMock.user.create.mockResolvedValue({ id: 'uuid-1', auth0Id: 'auth0|1', email: 'a@b.com', name: null });
    eventsMock.publish.mockRejectedValueOnce(new Error('broker unreachable'));

    const result = await service.create({ auth0Id: 'auth0|1', email: 'a@b.com' });

    expect(result.id).toBe('uuid-1');
  });

  it('create() publishes nothing when the user already exists', async () => {
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );

    await expect(service.create({ auth0Id: 'auth0|1', email: 'a@b.com' })).rejects.toThrow();
    expect(eventsMock.publish).not.toHaveBeenCalled();
  });
});
