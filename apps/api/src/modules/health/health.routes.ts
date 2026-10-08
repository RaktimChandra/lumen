import { sql } from 'drizzle-orm';
import { Router } from 'express';
import type { AppContext } from '../../context';

const startedAt = Date.now();

export function healthRoutes(ctx: AppContext): Router {
  const router = Router();

  /** Liveness + database reachability. Used by Render health checks and the clients' wake-up probe. */
  router.get('/', async (_req, res) => {
    let database: 'up' | 'down' = 'up';
    try {
      await ctx.db.execute(sql`SELECT 1`);
    } catch {
      database = 'down';
    }
    res
      .status(database === 'up' ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({
        status: database === 'up' ? 'ok' : 'degraded',
        database,
        uptime: Math.round((Date.now() - startedAt) / 1000),
        version: process.env.npm_package_version ?? '1.0.0',
        commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null,
      });
  });

  return router;
}
