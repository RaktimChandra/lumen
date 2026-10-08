import { createApp } from './app';
import { loadConfig } from './config/env';
import { createDatabase } from './db/client';
import { createLogger } from './lib/logger';

const config = loadConfig();
const logger = createLogger(config);
const database = createDatabase(config.database);
const app = createApp({ config, db: database.db, logger });

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'Lumen API listening');
});
// Render's proxy keeps connections alive for up to 75s; outlive it to avoid 502s.
server.keepAliveTimeout = 76_000;
server.headersTimeout = 77_000;

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  server.close(async () => {
    await database.close().catch(() => undefined);
    logger.info('closed cleanly');
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});
