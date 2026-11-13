import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const connectionString = process.env.PAYMENTS_DATABASE_URL;
if (!connectionString) throw new Error('PAYMENTS_DATABASE_URL is required');
const client = new Client({ connectionString });
await client.connect();
try {
  for (const file of ['001-payout-accounts.sql', '002-settlements.sql']) {
    await client.query(await readFile(new URL(file, import.meta.url), 'utf8'));
  }
  console.log('Payments schema is ready.');
} finally {
  await client.end();
}
