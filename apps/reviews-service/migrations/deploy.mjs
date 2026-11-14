import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

const connectionString = process.env.REVIEWS_DATABASE_URL;
if (!connectionString) throw new Error('REVIEWS_DATABASE_URL is required');
const client = new Client({ connectionString });
await client.connect();
try {
  await client.query(await readFile(new URL('./001-reviews.sql', import.meta.url), 'utf8'));
  await client.query(await readFile(new URL('./002-review-author-erasure.sql', import.meta.url), 'utf8'));
} finally {
  await client.end();
}
