# Security

This page maps each security requirement in the brief to the code that implements it and the test that proves it, then lists the extra controls and the known trade-offs.

All tests named here run in CI against a real PostgreSQL database (`apps/api/test`).

## Requirements from the brief

| Requirement | Implementation | Proven by |
|---|---|---|
| Passwords hashed with bcrypt, never stored in plain text | `apps/api/src/lib/password.ts`: bcrypt, cost 12 (configurable). Only `password_hash` is stored. | `auth.test.ts` › "creates an account, hashes the password and never returns the hash" (reads the row and checks for a `$2b$` hash) |
| Protected APIs require authentication | `middleware/authenticate.ts` on every project, task, dashboard and activity route | `security.test.ts` › "requires authentication on every data endpoint" (14 endpoints → 401) |
| JWT authentication and middleware | HS256 only, issuer and audience checked, 15-minute expiry (`lib/tokens.ts`). The `none` algorithm and foreign signatures are rejected. | `auth.test.ts` › "rejects a token signed with another secret", "rejects the "none" algorithm", "reports an expired token as TOKEN_EXPIRED" |
| Users only see and change their own projects and tasks, on web and mobile | Every query is scoped by owner. Tasks are scoped through their project (`tasks.project_id → projects.owner_id`). Creating or moving a task checks the target project's owner. Other users' rows return 404, never 403. | `security.test.ts` › "cross-user isolation" (read, update, patch, delete, create-in, move-into, filter-by-id, dashboard, activity) |
| Validate every request on the backend | One set of zod schemas in `packages/shared`, used by the API, web and mobile. Strict objects reject unknown fields (no mass assignment of `ownerId`, `completedAt`, etc.). Dates are checked as real calendar days, ranges are checked against stored values on partial updates, enums are closed, strings are trimmed and must not be blank. | `projects.test.ts` › "project validation", `tasks.test.ts` › "task validation", `packages/shared/src/schemas.test.ts` (36 cases) |
| No sensitive data in responses | Responses are built by explicit mapper functions (`toUser`, `toProject`, `toTask`), never by spreading database rows. | `security.test.ts` › "never exposes password hashes or refresh token hashes" (deep-scans six responses for `passwordHash`, `ownerId`, `ipAddress`, …) |
| SQL injection protection | Drizzle ORM with bound parameters everywhere; the only raw SQL (dashboard) uses tagged-template parameters. Search terms have `%`, `_` and `\` escaped so they match literally. | `security.test.ts` › "treats SQL in search as plain text"; `projects.test.ts` › "treats % and _ in search literally" |
| Rate limiting on auth endpoints | `middleware/rate-limit.ts`: 10 sign-in/sign-up attempts per IP per 15 min, plus 5 **failed** logins per email per 15 min regardless of IP. | `auth.test.ts` › "limits sign-in attempts per IP", "limits failed attempts per account even across IPs" |
| Token in secure device storage on mobile | `apps/mobile/src/auth/session.ts` uses `expo-secure-store` (Android Keystore). AsyncStorage holds only cached task data, never credentials. | `apps/mobile/__tests__/session.test.ts` |
| Expired login sends the user back to sign-in with a clear message | Shared API client (`packages/shared/src/client.ts`) refreshes once on `TOKEN_EXPIRED`; if that fails it ends the session. Mobile and web both show "Your session expired. Please sign in again." | `client.test.ts` › "ends the session when refresh fails"; `bootstrap.test.ts` › "sends the user to sign in with "expired""; web `auth-pages.test.tsx` › "explains that the session expired" |
| CORS for the web app's domain | `app.ts`: explicit allow-list from `CORS_ORIGINS`, credentials allowed only for those origins. Native apps send no `Origin` and are unaffected. | `security.test.ts` › "CORS" |

## Session design

```
login ─► access JWT (15 min, memory only)  +  refresh token (30 days)
                                               web: httpOnly Secure SameSite=Strict cookie, path /api/auth
                                               mobile: Android Keystore via expo-secure-store
```

- **Server-side sessions.** Each sign-in creates a `sessions` row. The access token carries the session id, and the auth middleware checks that the session is still active. Logout and "sign out this device" therefore take effect immediately instead of waiting up to 15 minutes.
- **Refresh token rotation with replay detection.** Only the SHA-256 of the refresh token is stored. Each refresh atomically swaps the hash (compare-and-swap `UPDATE … WHERE refresh_token_hash = $old`), so two concurrent refreshes cannot both win. Presenting an already-rotated token after a 30-second grace window revokes the session and records `auth.refresh_reuse_detected`.
- **No token in browser storage.** The web app keeps the access token in a module variable. An XSS payload cannot read the refresh cookie, and there is no long-lived credential in `localStorage`.
- **First-party cookie.** In production the API serves the web app, so the page calls `/api/*` on its own origin, so the refresh cookie is first-party and `SameSite=Strict` works. That also removes most CSRF exposure; the only cookie-authenticated endpoints are `refresh` (returns a token readable only by same-origin script) and `logout`.
- **Constant-work login.** Unknown emails still run a bcrypt comparison against a dummy hash, and both failures return the same message, so neither the response nor its timing reveals which emails are registered. (Registration necessarily reports a taken email; that is a product trade-off.)

## Other controls

- `helmet` security headers (HSTS, `nosniff`, frame denial, CSP on the docs page); `X-Powered-By` removed.
- The web app is served with a strict Content-Security-Policy: `script-src 'self'` plus SHA-256 hashes of the inline scripts, computed from the built `index.html` at startup (`apps/api/src/web.ts`); `frame-ancestors 'none'`, `connect-src 'self'`.
- JSON body limit of 100 KB; malformed JSON → 400; `__proto__` keys rejected by strict schemas.
- Query strings use Express's simple parser, so `?status[]=x` cannot smuggle arrays or objects into filters.
- `trust proxy` is set to an explicit hop count instead of `true`, so `X-Forwarded-For` cannot be freely spoofed to dodge per-IP limits.
- Database constraints back up the application rules: foreign keys with `ON DELETE CASCADE`, `CHECK (end_date >= start_date)`, `CHECK` non-blank names, `CHECK` that `completed_at` is set exactly when a task is completed, unique email.
- Structured logs (pino) with a request id on every line. `Authorization`, cookies, passwords and tokens are redacted.
- Errors never include stack traces or SQL; unexpected errors return a generic message plus the request id.
- The API container runs as the non-root `node` user.
- CodeQL (security-extended queries) and Dependabot run on the repository.
- Android release requests only `INTERNET` and `POST_NOTIFICATIONS`; cleartext HTTP is enabled only when the app is built against an `http://` development API.

## Known trade-offs and limitations

- **Per-IP limits depend on the proxy.** The API trusts exactly one proxy hop (Render's). If the web app is moved behind another proxy (e.g. the optional Vercel config), `TRUST_PROXY` must be raised, and a client calling the API directly could then forge the left-most `X-Forwarded-For` entry. The per-email limit on failed logins does not depend on IP and still caps password guessing per account.
- **No email verification or password reset.** Out of scope for the brief; the session model supports adding them.
- **Free hosting.** Render's free PostgreSQL expires after 30 days and the free API sleeps after 15 idle minutes (a scheduled GitHub Action pings it every 10 minutes during review).
- **Offline cache on the phone.** Viewed projects and tasks are cached in AsyncStorage for offline viewing. They are cleared on sign-out and on session expiry. Tokens are never cached there.
