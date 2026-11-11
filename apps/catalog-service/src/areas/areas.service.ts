import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { ParsedPostalCode } from './postal-code.js';

export type Area = {
  postalCode: string;
  // null = a postal code we have no municipality for (not seeded yet)
  municipality: { code: string; name: string; district: string } | null;
  available: boolean; // true only where bookings are open (pilot municipalities)
};

@Injectable()
export class AreasService {
  constructor(private readonly prisma: PrismaService) {}

  // Every municipality we know, for the "where do you work?" picker. `pilot` = bookings are open there.
  listMunicipalities() {
    return this.prisma.municipality.findMany({
      orderBy: [{ district: 'asc' }, { name: 'asc' }],
      select: { code: true, name: true, district: true, pilot: true },
    });
  }

  async findByPostalCode(postalCode: ParsedPostalCode): Promise<Area> {
    const prefix = await this.prisma.postalPrefix.findUnique({
      where: { cp4: postalCode.cp4 },
      select: { municipality: { select: { code: true, name: true, district: true, pilot: true } } },
    });
    if (!prefix) return { postalCode: postalCode.formatted, municipality: null, available: false };

    const { pilot, ...municipality } = prefix.municipality;
    return { postalCode: postalCode.formatted, municipality, available: pilot };
  }
}
