import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { UsersService } from './users.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { OutboxRelay } from '../events/outbox.relay.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

describe('UsersService', () => {
  let service: UsersService;

  // the fake: same shape as the parts of PrismaService we use
  const prismaMock = {
    user: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    outboxEvent: { create: vi.fn() },
    // run the transaction callback against the same fake, like a real transaction would
    $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prismaMock)),
  };

  // fake relay: we only check that create() asks it to send right away
  const outboxMock = { flush: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks(); // reset call history between tests

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock }, // "when someone asks for PrismaService, give them the fake"
        { provide: OutboxRelay, useValue: outboxMock },
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

  it('create() saves user.registered in the outbox, in the same transaction', async () => {
    const user = { id: 'uuid-1', auth0Id: 'auth0|1', email: 'a@b.com', name: 'Ana' };
    prismaMock.user.create.mockResolvedValue(user);

    await service.create({ auth0Id: 'auth0|1', email: 'a@b.com', name: 'Ana' });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const saved = prismaMock.outboxEvent.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({
      topic: 'user.registered',
      key: 'uuid-1',
      payload: {
        type: 'user.registered',
        data: { userId: 'uuid-1', auth0Id: 'auth0|1', email: 'a@b.com', name: 'Ana' },
      },
    });
    expect(saved.id).toBe(saved.payload.eventId); // outbox row id = event id, so consumers can dedupe
  });

  it('create() asks the relay to send the event right away', async () => {
    prismaMock.user.create.mockResolvedValue({ id: 'uuid-1', auth0Id: 'auth0|1', email: 'a@b.com', name: null });

    await service.create({ auth0Id: 'auth0|1', email: 'a@b.com' });

    expect(outboxMock.flush).toHaveBeenCalled();
  });

  it('create() throws 409 and saves no event when the user already exists', async () => {
    prismaMock.user.create.mockRejectedValue(prismaError('P2002'));

    await expect(service.create({ auth0Id: 'auth0|1', email: 'a@b.com' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.outboxEvent.create).not.toHaveBeenCalled();
    expect(outboxMock.flush).not.toHaveBeenCalled();
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

  it('updateByAuth0Id() changes only the given fields', async () => {
    prismaMock.user.update.mockResolvedValue({ id: 'uuid-1', name: 'Ana Maria' });

    await service.updateByAuth0Id('auth0|1', { name: 'Ana Maria' });

    expect(prismaMock.user.update).toHaveBeenCalledWith({ where: { auth0Id: 'auth0|1' }, data: { name: 'Ana Maria' } });
  });

  it('updateByAuth0Id() throws 404 when nobody has that Auth0 id', async () => {
    prismaMock.user.update.mockRejectedValue(prismaError('P2025'));

    await expect(service.updateByAuth0Id('auth0|nobody', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
