import {
  createTaskSchema,
  idParamSchema,
  taskListQuerySchema,
  todayQuerySchema,
  updateTaskSchema,
} from '@lumen/shared';
import { Router, type Request, type Response } from 'express';
import type { AppContext } from '../../context';
import { parse, requestContext } from '../../lib/request';
import { createTasksService } from './tasks.service';

export function taskRoutes(ctx: AppContext): Router {
  const router = Router();
  const tasks = createTasksService(ctx.db);

  /** GET /api/tasks?projectId=&search=&status=&priority=&overdue=&page=&limit=&sort=&order= */
  router.get('/', async (req, res) => {
    const query = parse(taskListQuerySchema, req.query);
    res.json(await tasks.list(req.auth!.userId, query));
  });

  router.get('/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { today } = parse(todayQuerySchema, req.query);
    res.json({ data: await tasks.get(req.auth!.userId, id, today) });
  });

  router.post('/', async (req, res) => {
    const data = parse(createTaskSchema, req.body);
    const task = await tasks.create(requestContext(req), data);
    res.status(201).location(`/api/tasks/${task.id}`).json({ data: task });
  });

  /** PUT accepts any subset of fields; omitted fields keep their current values. */
  const update = async (req: Request, res: Response) => {
    const { id } = parse(idParamSchema, req.params);
    const data = parse(updateTaskSchema, req.body);
    res.json({ data: await tasks.update(requestContext(req), id, data) });
  };
  router.put('/:id', update);
  router.patch('/:id', update);

  router.delete('/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    await tasks.remove(requestContext(req), id);
    res.status(204).end();
  });

  return router;
}
