import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',          // paths are relative to THIS file
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('BOOKINGS_DATABASE_URL') },
});