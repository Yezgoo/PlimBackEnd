import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { SavedAddress } from '../generated/prisma/client.js';
import { SaveAddressDto } from './dto/save-address.dto.js';

export const MAX_SAVED_ADDRESSES = 10;

const select = { id: true, label: true, street: true, details: true, postalCode: true, city: true } as const;
const sameText = (a?: string | null, b?: string | null) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

// Addresses a person keeps for their next bookings. Always looked up through the owner's Auth0 id,
// so nobody can read or delete someone else's address by guessing an id.
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth0Id: string) {
    const userId = await this.ownerId(auth0Id);
    return this.prisma.savedAddress.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, select });
  }

  // Saving the same place twice renames the existing entry instead of making a duplicate
  async save(auth0Id: string, dto: SaveAddressDto) {
    const userId = await this.ownerId(auth0Id);
    const data = { label: dto.label, street: dto.street, details: dto.details || null, postalCode: dto.postalCode, city: dto.city || null };
    return this.prisma.$transaction(async (tx) => {
      // one save at a time per person, so two quick taps can't pass the limit or create twins
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const existing: SavedAddress[] = await tx.savedAddress.findMany({ where: { userId } });
      const twin = existing.find((a) => a.postalCode === data.postalCode && sameText(a.street, data.street) && sameText(a.details, data.details));
      if (twin) return tx.savedAddress.update({ where: { id: twin.id }, data, select });
      if (existing.length >= MAX_SAVED_ADDRESSES) {
        throw new ConflictException(`You can keep up to ${MAX_SAVED_ADDRESSES} addresses. Delete one first.`);
      }
      return tx.savedAddress.create({ data: { ...data, userId }, select });
    });
  }

  async remove(auth0Id: string, id: string) {
    const userId = await this.ownerId(auth0Id);
    const { count } = await this.prisma.savedAddress.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException(`Address ${id} not found`);
  }

  private async ownerId(auth0Id: string) {
    const user = await this.prisma.user.findUnique({ where: { auth0Id }, select: { id: true } });
    if (!user) throw new NotFoundException(`No user linked to ${auth0Id}`);
    return user.id;
  }
}
