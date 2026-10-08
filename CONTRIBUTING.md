# Contributing

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
2. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat(tasks): …`, `fix(api): …`).
3. Before opening a pull request:
   ```bash
   npm run build:shared
   npm run lint && npm run typecheck && npm run format:check
   npm test        # API tests need PostgreSQL (TEST_DATABASE_URL)
   ```
4. Changing a validation rule? Change it once in `packages/shared/src/schemas.ts`; the API, web and mobile apps all pick it up.
5. Changing the database? Edit `apps/api/src/db/schema.ts`, run `npm run db:generate -w @lumen/api`, and commit the generated SQL.
