import { dashboardQuerySchema } from '@lumen/shared';
import { Router } from 'express';
import type { AppContext } from '../../context';
import { parse } from '../../lib/request';
import { createDashboardService } from './dashboard.service';

export function dashboardRoutes(ctx: AppContext): Router {
  const router = Router();
  const dashboard = createDashboardService(ctx.db);

  /** GET /api/dashboard — counters for the signed-in user only. */
  router.get('/', async (req, res) => {
    const { today } = parse(dashboardQuerySchema, req.query);
    res.json({ data: await dashboard.get(req.auth!.userId, today) });
  });

  return router;
}
