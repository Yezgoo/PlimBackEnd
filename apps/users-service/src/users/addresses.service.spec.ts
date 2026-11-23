import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { AddressesService, MAX_SAVED_ADDRESSES } from './addresses.service.js';

describe('AddressesService', () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    savedAddress: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((work: (tx: unknown) => unknown) => work(prisma)),
  };
  const service = new AddressesService(prisma as unknown as PrismaService);
  const home = { label: 'Casa', street: 'Rua da Sofia 10', details: '2.º Esq.', postalCode: '3000-389', city: 'Coimbra' };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.savedAddress.findMany.mockResolvedValue([]);
    prisma.savedAddress.create.mockImplementation(({ data }) => ({ id: 'a-new', ...data }));
    prisma.savedAddress.update.mockImplementation(({ where, data }) => ({ id: where.id, ...data }));
  });

  it('saves a new address for the caller only', async () => {
    await service.save('auth0|me', home);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { auth0Id: 'auth0|me' }, select: { id: true } });
    expect(prisma.savedAddress.create).toHaveBeenCalledWith(expect.objectContaining({ data: { ...home, userId: 'user-1' } }));
  });

  it('renames the same place instead of saving it twice', async () => {
    prisma.savedAddress.findMany.mockResolvedValue([{ id: 'a-1', ...home, label: 'Casa', street: 'rua da sofia 10 ' }]);

    const saved = await service.save('auth0|me', { ...home, label: 'Casa da mãe' });

    expect(prisma.savedAddress.create).not.toHaveBeenCalled();
    expect(saved).toMatchObject({ id: 'a-1', label: 'Casa da mãe' });
  });

  it('treats another floor of the same building as another address', async () => {
    prisma.savedAddress.findMany.mockResolvedValue([{ id: 'a-1', ...home }]);

    await service.save('auth0|me', { ...home, details: '3.º Dto.' });

    expect(prisma.savedAddress.create).toHaveBeenCalled();
  });

  it(`keeps at most ${MAX_SAVED_ADDRESSES} addresses`, async () => {
    prisma.savedAddress.findMany.mockResolvedValue(
      Array.from({ length: MAX_SAVED_ADDRESSES }, (_, i) => ({ id: `a-${i}`, ...home, street: `Rua ${i}` })),
    );

    await expect(service.save('auth0|me', home)).rejects.toBeInstanceOf(ConflictException);
  });

  it("can't delete someone else's address", async () => {
    prisma.savedAddress.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('auth0|me', 'a-of-someone-else')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.savedAddress.deleteMany).toHaveBeenCalledWith({ where: { id: 'a-of-someone-else', userId: 'user-1' } });
  });

  it('answers 404 for a person without a profile', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.list('auth0|nobody')).rejects.toBeInstanceOf(NotFoundException);
  });
});
