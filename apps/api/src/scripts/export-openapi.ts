/** Writes docs/openapi.json from the live spec builder so the docs never drift from the code. */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '../docs/openapi';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const out = path.join(root, 'docs', 'openapi.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(buildOpenApiDocument(process.env.API_URL ?? 'http://localhost:4000'), null, 2)}\n`,
);
console.log(`Wrote ${path.relative(root, out)}`);
