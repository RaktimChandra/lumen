import { Router } from 'express';
import { z } from 'zod';
import type { AppContext } from '../../context';
import { parse } from '../../lib/request';
import { listActivity } from './audit.service';

const activityQuerySchema = z.strictObject({
  limit: z.coerce
    .number({ error: 'limit must be a number' })
    .int('limit must be a whole number')
    .min(1, 'limit must be at least 1')
    .max(100, 'limit must be at most 100')
    .default(30),
});

export function activityRoutes(ctx: AppContext): Router {
  const router = Router();

  /** GET /api/activity — the signed-in user's audit trail, newest first. */
  router.get('/', async (req, res) => {
    const { limit } = parse(activityQuerySchema, req.query);
    res.json({ data: await listActivity(ctx.db, req.auth!.userId, limit) });
  });

  return router;
}
