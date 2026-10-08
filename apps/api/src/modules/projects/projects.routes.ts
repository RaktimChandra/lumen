import {
  createProjectSchema,
  idParamSchema,
  projectListQuerySchema,
  todayQuerySchema,
  updateProjectSchema,
} from '@lumen/shared';
import { Router, type Request, type Response } from 'express';
import type { AppContext } from '../../context';
import { parse, requestContext } from '../../lib/request';
import { createProjectsService } from './projects.service';

export function projectRoutes(ctx: AppContext): Router {
  const router = Router();
  const projects = createProjectsService(ctx.db);

  router.get('/', async (req, res) => {
    const query = parse(projectListQuerySchema, req.query);
    res.json(await projects.list(req.auth!.userId, query));
  });

  router.get('/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    const { today } = parse(todayQuerySchema, req.query);
    res.json({ data: await projects.get(req.auth!.userId, id, today) });
  });

  router.post('/', async (req, res) => {
    const data = parse(createProjectSchema, req.body);
    const project = await projects.create(requestContext(req), data);
    res.status(201).location(`/api/projects/${project.id}`).json({ data: project });
  });

  /** PUT accepts any subset of fields; omitted fields keep their current values. */
  const update = async (req: Request, res: Response) => {
    const { id } = parse(idParamSchema, req.params);
    const data = parse(updateProjectSchema, req.body);
    res.json({ data: await projects.update(requestContext(req), id, data) });
  };
  router.put('/:id', update);
  router.patch('/:id', update);

  router.delete('/:id', async (req, res) => {
    const { id } = parse(idParamSchema, req.params);
    await projects.remove(requestContext(req), id);
    res.status(204).end();
  });

  return router;
}
