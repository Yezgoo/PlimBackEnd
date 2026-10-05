import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { UsersService } from './users.service.js';

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

  beforeEach(async () => {
    vi.clearAllMocks(); // reset call history between tests

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock }, // "when someone asks for PrismaService, give them the fake"
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
});