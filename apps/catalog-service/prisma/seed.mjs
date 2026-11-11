// Fills catalog_db with the pilot catalog from seed-data.mjs.
// Run with: npm run db:catalog:seed
// Safe to run again: rows are matched by slug and updated, never duplicated.
// Rows that are not in seed-data.mjs are left alone.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { categories, municipalities, services } from './seed-data.mjs';

const client = new pg.Client({ connectionString: process.env.CATALOG_DATABASE_URL });
await client.connect();

try {
  await client.query('BEGIN'); // all or nothing

  for (const municipality of municipalities) {
    await client.query(
      `INSERT INTO municipalities (code, name, district, pilot, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (code) DO UPDATE
         SET name = EXCLUDED.name, district = EXCLUDED.district, pilot = EXCLUDED.pilot, updated_at = now()`,
      [municipality.code, municipality.name, municipality.district, municipality.pilot],
    );
    for (const cp4 of municipality.postalPrefixes) {
      await client.query(
        `INSERT INTO postal_prefixes (cp4, municipality_code) VALUES ($1, $2)
         ON CONFLICT (cp4) DO UPDATE SET municipality_code = EXCLUDED.municipality_code`,
        [cp4, municipality.code],
      );
    }
  }

  const categoryIds = new Map();
  for (const category of categories) {
    const { rows } = await client.query(
      `INSERT INTO service_categories (id, name, slug, icon, sort_order, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, updated_at = now()
       RETURNING id`,
      [randomUUID(), category.name, category.slug, category.icon, category.sortOrder],
    );
    categoryIds.set(category.slug, rows[0].id);
  }

  for (const [index, service] of services.entries()) {
    const categoryId = categoryIds.get(service.category);
    if (!categoryId) throw new Error(`Service ${service.slug} points to unknown category ${service.category}`);

    const { rows } = await client.query(
      `INSERT INTO service_types
         (id, category_id, name, slug, description, price_cents, duration_minutes, includes, excludes, sort_order, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (slug) DO UPDATE
         SET category_id = EXCLUDED.category_id, name = EXCLUDED.name, description = EXCLUDED.description,
             price_cents = EXCLUDED.price_cents, duration_minutes = EXCLUDED.duration_minutes,
             includes = EXCLUDED.includes, excludes = EXCLUDED.excludes, sort_order = EXCLUDED.sort_order,
             updated_at = now()
       RETURNING id`,
      [
        randomUUID(),
        categoryId,
        service.name,
        service.slug,
        service.description,
        service.priceCents,
        service.durationMinutes,
        service.includes,
        service.excludes,
        index + 1,
      ],
    );
    const serviceId = rows[0].id;

    // FAQs have no natural key, so replace this service's list
    await client.query('DELETE FROM service_faqs WHERE service_type_id = $1', [serviceId]);
    for (const [faqIndex, faq] of service.faqs.entries()) {
      await client.query(
        'INSERT INTO service_faqs (id, service_type_id, question, answer, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [randomUUID(), serviceId, faq.question, faq.answer, faqIndex + 1],
      );
    }
  }

  await client.query('COMMIT');
  console.log(
    `Seeded ${categories.length} categories, ${services.length} services and ${municipalities.length} municipalities.`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Seed failed, nothing was changed:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
