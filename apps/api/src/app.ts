import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env';
import type { AppContext } from './context';
import type { Database } from './db/client';
import { docsRoutes } from './docs/docs.routes';
import { createPasswordHasher } from './lib/password';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRateLimiters } from './middleware/rate-limit';
import { activityRoutes } from './modules/activity/activity.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { healthRoutes } from './modules/health/health.routes';
import { projectRoutes } from './modules/projects/projects.routes';
import { taskRoutes } from './modules/tasks/tasks.routes';
import { serveWebApp } from './web';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export interface CreateAppOptions {
  config: AppConfig;
  db: Database;
  logger: Logger;
  /** Directory of the built web app to serve from this origin (optional). */
  webDistDir?: string;
}

export function createApp({ config, db, logger, webDistDir }: CreateAppOptions): Express {
  const ctx: AppContext = {
    config,
    db,
    logger,
    passwords: createPasswordHasher(config.auth.bcryptRounds),
  };
  const limiters = createRateLimiters(config.rateLimit);
  const requireAuth = authenticate(ctx);

  const app = express();
  app.disable('x-powered-by');
  // Only trust the configured number of proxy hops, so X-Forwarded-For cannot be spoofed
  // to dodge rate limits.
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin(origin, callback) {
        // Native apps and server-to-server calls send no Origin header.
        if (!origin) return callback(null, true);
        callback(null, config.cors.origins.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After', 'Location'],
      maxAge: 600,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use(cookieParser());

  app.get('/api', (_req, res) => {
    res.json({
      name: 'Lumen API',
      docs: '/api/docs',
      openapi: '/api/openapi.json',
      health: '/api/health',
    });
  });

  app.use('/api/health', healthRoutes(ctx));
  app.use('/api', docsRoutes());
  app.use('/api', limiters.api);
  app.use('/api/auth', authRoutes(ctx, limiters));
  app.use('/api/projects', requireAuth, projectRoutes(ctx));
  app.use('/api/tasks', requireAuth, taskRoutes(ctx));
  app.use('/api/dashboard', requireAuth, dashboardRoutes(ctx));
  app.use('/api/activity', requireAuth, activityRoutes(ctx));

  if (!serveWebApp(app, webDistDir)) {
    app.get('/', (_req, res) => res.redirect('/api'));
  }

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
