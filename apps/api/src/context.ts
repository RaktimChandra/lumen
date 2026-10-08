import type { Logger } from 'pino';
import type { AppConfig } from './config/env';
import type { Database } from './db/client';
import type { PasswordHasher } from './lib/password';

/** Dependencies shared by every module. Built once in createApp and passed down explicitly. */
export interface AppContext {
  config: AppConfig;
  db: Database;
  logger: Logger;
  passwords: PasswordHasher;
}
