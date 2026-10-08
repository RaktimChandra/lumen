import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { createLogger } from '../src/lib/logger';
import { testConfig, testDb } from './helpers';

function fakeWebBuild() {
  const dir = mkdtempSync(path.join(tmpdir(), 'lumen-web-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(
    path.join(dir, 'index.html'),
    '<!doctype html><html><head><script>window.t=1</script></head><body>Lumen web</body></html>',
  );
  writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  return dir;
}

describe('serving the web app from the API origin', () => {
  const config = testConfig();
  const app = createApp({
    config,
    db: testDb().db,
    logger: createLogger(config),
    webDistDir: fakeWebBuild(),
  });

  it('serves index.html for client-side routes with a strict CSP', async () => {
    const res = await request(app).get('/projects/123').expect(200);
    expect(res.text).toContain('Lumen web');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self' 'sha256-");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('serves fingerprinted assets with long caching', async () => {
    const res = await request(app).get('/assets/app-abc123.js').expect(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps unknown API paths as JSON 404s', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('still answers the API', async () => {
    await request(app).get('/api/health').expect(200);
  });
});
