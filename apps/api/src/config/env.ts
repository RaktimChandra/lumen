import { z } from 'zod';

const booleanish = z.enum(['true', 'false', 'auto']);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(1),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanish.default('auto'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(10).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),

  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).default(15),
  LOGIN_FAILURES_PER_EMAIL: z.coerce.number().int().min(1).default(5),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  logLevel: Env['LOG_LEVEL'];
  trustProxy: number;
  database: { url: string; ssl: boolean; poolMax: number };
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    bcryptRounds: number;
  };
  cors: { origins: string[] };
  cookies: { secure: boolean; sameSite: 'strict' | 'lax' | 'none' };
  rateLimit: {
    authMax: number;
    authWindowMs: number;
    loginFailuresPerEmail: number;
    apiPerMinute: number;
  };
}

function resolveSsl(mode: 'true' | 'false' | 'auto', url: string): boolean {
  if (mode !== 'auto') return mode === 'true';
  try {
    const host = new URL(url).hostname;
    return !['localhost', '127.0.0.1', '::1'].includes(host) && host.includes('.');
  } catch {
    return false;
  }
}

/** Parse and validate environment variables. Fails fast with a readable message. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  return {
    env: env.NODE_ENV,
    isProduction,
    port: env.PORT,
    logLevel: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    trustProxy: env.TRUST_PROXY,
    database: {
      url: env.DATABASE_URL,
      ssl: resolveSsl(env.DATABASE_SSL, env.DATABASE_URL),
      poolMax: env.DATABASE_POOL_MAX,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      bcryptRounds: env.BCRYPT_ROUNDS,
    },
    cors: { origins: env.CORS_ORIGINS },
    cookies: {
      secure: isProduction || env.COOKIE_SAMESITE === 'none',
      sameSite: env.COOKIE_SAMESITE,
    },
    rateLimit: {
      authMax: env.AUTH_RATE_LIMIT_MAX,
      authWindowMs: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      loginFailuresPerEmail: env.LOGIN_FAILURES_PER_EMAIL,
      apiPerMinute: env.API_RATE_LIMIT_PER_MINUTE,
    },
  };
}
