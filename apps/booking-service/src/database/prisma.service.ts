import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.BOOKINGS_DATABASE_URL });
    super({ adapter });
  }

  // close the DB connections cleanly when the service shuts down
  async onModuleDestroy() {
    await this.$disconnect();
  }
}