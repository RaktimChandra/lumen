import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi';

/** Serves the OpenAPI document and an interactive Swagger UI at /api/docs. */
export function docsRoutes(): Router {
  const router = Router();
  const document = buildOpenApiDocument('/');

  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });

  router.use(
    '/docs',
    // Swagger UI needs inline styles; scope the relaxed policy to the docs page only.
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'Lumen API docs',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );

  return router;
}
