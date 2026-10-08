import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';

/**
 * Serves the built web app (apps/web/dist) from the API's own origin.
 *
 * One origin for the page and the API means the refresh cookie is first-party,
 * SameSite=Strict works, and the browser never needs CORS. Unknown non-API paths
 * return index.html so client-side routes survive a reload.
 *
 * Returns false (and serves nothing) when no build is present, e.g. in tests or
 * when the web app is hosted elsewhere.
 */
export function serveWebApp(app: Express, distDir: string | undefined): boolean {
  if (!distDir) return false;
  const indexPath = path.join(distDir, 'index.html');
  if (!existsSync(indexPath)) return false;

  const html = readFileSync(indexPath, 'utf8');
  // Allow exactly the inline scripts shipped in index.html (the theme bootstrap), nothing else.
  const scriptHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) =>
      `'sha256-${createHash('sha256')
        .update(match[1] ?? '')
        .digest('base64')}'`,
  );

  const csp = helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...scriptHashes],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  });

  // Fingerprinted bundles never change, so they can be cached for a year.
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  app.use(csp, express.static(distDir, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api(?:\/|$)).*/, csp, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(html);
  });
  return true;
}
