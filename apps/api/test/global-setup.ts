import pg from 'pg';
import { runMigrations } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './env';

/** Start every run from an empty schema, then apply the real migrations. */
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
    );
  } finally {
    await client.end();
  }
  process.env.JWT_ACCESS_SECRET ??= 'test-secret-that-is-long-enough-0123456789';
  await runMigrations(TEST_DATABASE_URL);
}
