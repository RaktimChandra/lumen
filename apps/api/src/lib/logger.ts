import pino, { type Logger } from 'pino';
import type { AppConfig } from '../config/env';

/** Fields that must never reach logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.refreshToken',
  '*.accessToken',
];

export function createLogger(config: Pick<AppConfig, 'logLevel' | 'isProduction' | 'env'>): Logger {
  const pretty = !config.isProduction && config.env !== 'test';
  return pino({
    level: config.logLevel,
    base: { service: 'lumen-api' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}
