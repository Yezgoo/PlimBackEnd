import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;

  const usersServiceMock = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersServiceMock }],
    }).compile();

    controller = moduleRef.get(UsersController);
  });

  it('findOne() returns the user when it exists', async () => {
    const user = { id: 'uuid-1', email: 'a@b.com' };
    usersServiceMock.findOne.mockResolvedValue(user);

    expect(await controller.findOne('uuid-1')).toEqual(user);
  });

  it('findOne() throws 404 when the user does not exist', async () => {
    usersServiceMock.findOne.mockResolvedValue(null);

    await expect(controller.findOne('uuid-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});