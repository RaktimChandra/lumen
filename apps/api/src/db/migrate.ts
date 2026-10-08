import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadConfig } from '../config/env';
import { createDatabase } from './client';

/**
 * Applies pending SQL migrations from ./drizzle. Runs on every deploy before the
 * server starts; already-applied migrations are skipped, so it is safe to repeat.
 */
export async function runMigrations(databaseUrl?: string): Promise<void> {
  const config = loadConfig(
    databaseUrl ? { ...process.env, DATABASE_URL: databaseUrl } : process.env,
  );
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Works from src/db (tsx) and from dist (bundled build).
  const candidates = [path.resolve(here, '../../drizzle'), path.resolve(here, '../drizzle')];
  const { existsSync } = await import('node:fs');
  const migrationsFolder = candidates.find((dir) => existsSync(path.join(dir, 'meta')));
  if (!migrationsFolder) throw new Error('Could not locate the drizzle migrations folder');

  const handle = createDatabase(config.database);
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }
}

const isEntryPoint =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntryPoint) {
  runMigrations()
    .then(() => {
      console.warn('[migrate] database is up to date');
    })
    .catch((error: unknown) => {
      console.error('[migrate] failed:', error);
      process.exit(1);
    });
}
