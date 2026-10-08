# Lumen API reference

One REST API serves both the web app and the Android app.

| | |
|---|---|
| Base URL (production) | `https://lumen-api-x4be.onrender.com` |
| Interactive docs (Swagger UI) | `https://lumen-api-x4be.onrender.com/api/docs` |
| OpenAPI 3 document | `https://lumen-api-x4be.onrender.com/api/openapi.json` (also committed at [`docs/openapi.json`](openapi.json)) |
| Local | `http://localhost:4000` |

The OpenAPI request schemas are generated from the same zod schemas the API validates with (`packages/shared`), so the documentation cannot drift from the code.

---

## Conventions

**Content type.** Requests and responses are JSON. Bodies are limited to 100 KB.

**Authentication.** Every endpoint except `register`, `login`, `refresh`, `logout` and `health` needs an access token:

```
Authorization: Bearer <accessToken>
```

**Client header.** Clients send `X-Client-Platform: web` or `X-Client-Platform: mobile`. It decides how the refresh token is delivered (cookie vs body) and is recorded in the activity log.

**Ownership.** Every project and task belongs to one user. Requests for another user's resources return **404**, exactly like resources that do not exist, so ids cannot be probed.

**Dates.** Calendar dates are `YYYY-MM-DD` (`2026-10-08`) and are validated as real days (`2026-02-30` is rejected). Timestamps are ISO 8601 UTC. List endpoints accept an optional `today=YYYY-MM-DD` so "overdue" follows the user's own time zone; both clients send it automatically.

**Updates.** `PUT` accepts any subset of fields; omitted fields keep their values. `PATCH` is an alias.

**Pagination.** List endpoints take `page` (default 1) and `limit` (default 20, max 100) and return:

```json
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }
```

**Errors.** Every error has the same shape. `details` lists each invalid field; `requestId` matches the `X-Request-Id` response header and the server log line.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": [
      { "path": "projectId", "message": "Project is required" },
      { "path": "name", "message": "Task name cannot be empty" },
      { "path": "priority", "message": "Priority must be one of: LOW, MEDIUM, HIGH" }
    ],
    "requestId": "dbe3bf48-dcb6-431f-83fd-2effd16a00c7"
  }
}
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | A field is missing, empty, the wrong type, an unknown enum value, an invalid date, or an unknown field was sent |
| 400 | `BAD_REQUEST` | Malformed JSON |
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 401 | `TOKEN_EXPIRED` | Access token expired: call `POST /api/auth/refresh` and retry |
| 401 | `SESSION_EXPIRED` | The session was signed out or the refresh token is no longer valid: sign in again |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same message for both) |
| 404 | `NOT_FOUND` | Not found, or owned by another user |
| 409 | `CONFLICT` | Email already registered |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 KB |
| 429 | `RATE_LIMITED` | Too many requests; see `Retry-After` |
| 500 | `INTERNAL_ERROR` | Unexpected error (details are logged, never returned) |

**Rate limits.** `register` and `login`: 10 requests per IP per 15 minutes. Failed logins: 5 per email per 15 minutes (counted across all IPs). `refresh`: 120 per IP per 15 minutes. Everything else: 300 per IP per minute. Responses include IETF `RateLimit` headers.

---

## Authentication

### `POST /api/auth/register`

Creates an account and signs in.

| Field | Rules |
|---|---|
| `fullName` | required, 2–100 characters, no `<` or `>` |
| `email` | required, valid email, max 254, stored lower-case, must be unique |
| `password` | required, 8+ characters, at most 72 bytes (bcrypt limit), at least one letter and one number, no leading/trailing spaces |

```bash
curl -X POST https://lumen-api-x4be.onrender.com/api/auth/register \
  -H 'Content-Type: application/json' -H 'X-Client-Platform: mobile' \
  -d '{"fullName":"Ada Lovelace","email":"ada@example.com","password":"analytical1"}'
```

`201 Created`

```json
{
  "user": { "id": "2110a54a-…", "fullName": "Ada Lovelace", "email": "ada@example.com", "createdAt": "2026-10-08T06:18:08.178Z" },
  "accessToken": "eyJhbGciOiJIUzI1NiIs…",
  "expiresIn": 900,
  "refreshToken": "r3Xo…  (mobile only)"
}
```

Browsers (`X-Client-Platform: web`) get no `refreshToken` in the body. They receive it as a cookie: `lumen_rt`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`, 30 days.

Errors: `400`, `409` (email taken, reported on the `email` field), `429`.

### `POST /api/auth/login`

Body: `{ "email": "...", "password": "..." }`. Response and cookie behaviour as for register (`200 OK`). An unknown email and a wrong password return the same `401 INVALID_CREDENTIALS` and take the same time (a dummy bcrypt comparison runs for unknown emails).

### `POST /api/auth/refresh`

Exchanges a refresh token for a new access token. The refresh token is **rotated** on every call.

- Web: send `{}`; the cookie is used.
- Mobile: send `{ "refreshToken": "..." }`.

`200 OK` with the same shape as login. `401 SESSION_EXPIRED` if the token is unknown, expired or revoked.

Replay protection: if a refresh token that was already rotated is presented again more than 30 seconds later, the whole session is revoked (the token was probably copied) and an `auth.refresh_reuse_detected` entry is written to the activity log. Within 30 seconds it is treated as a harmless race between two tabs.

### `POST /api/auth/logout`

Revokes the current session on the server, so its access token stops working immediately rather than at expiry. Identifies the session from the bearer token (an expired one is accepted) or from the refresh token (cookie or body). Clears the cookie. Always `204 No Content`, and safe to call twice.

### `GET /api/auth/me`

`200 OK` → `{ "user": { "id", "fullName", "email", "createdAt" } }`. The password hash is never returned by any endpoint.

### `GET /api/auth/sessions` and `DELETE /api/auth/sessions/{id}` (bonus)

Lists the user's signed-in devices (`platform`, `userAgent`, `createdAt`, `lastUsedAt`, `current`) and signs one out. Used by the web Settings page.

---

## Projects

A project object:

```json
{
  "id": "6c83a77d-29b4-456c-ac87-dc24685744d3",
  "name": "Raman spectroscopy rig",
  "description": "Bench prototype",
  "status": "IN_PROGRESS",
  "startDate": "2026-10-01",
  "endDate": "2026-12-15",
  "createdAt": "2026-10-08T07:07:49.243Z",
  "updatedAt": "2026-10-08T07:07:49.243Z",
  "taskStats": { "total": 6, "completed": 2, "inProgress": 1, "pending": 3, "overdue": 1, "progress": 33 }
}
```

`status`: `NOT_STARTED` | `IN_PROGRESS` | `COMPLETED` (displayed as Not Started, In Progress, Completed).

### `GET /api/projects`

| Query | Description |
|---|---|
| `search` | Case-insensitive match on name. `%` and `_` are matched literally. |
| `status` | `NOT_STARTED`, `IN_PROGRESS` or `COMPLETED` |
| `sort` | `createdAt` (default), `updatedAt`, `name`, `status`, `startDate`, `endDate` |
| `order` | `desc` (default) or `asc` |
| `page`, `limit` | Pagination |

```bash
curl 'https://lumen-api-x4be.onrender.com/api/projects?search=raman&status=IN_PROGRESS&sort=name&order=asc' \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /api/projects/{id}`

`200` → `{ "data": Project }`, `404` if missing or not yours, `400` if the id is not a UUID.

### `POST /api/projects`

| Field | Rules |
|---|---|
| `name` | required, 1–120 characters after trimming |
| `description` | optional, max 2000, default `""` |
| `status` | optional, default `NOT_STARTED` |
| `startDate`, `endDate` | optional `YYYY-MM-DD` or `null`; `endDate` must not be before `startDate` |

`201 Created` with a `Location` header and `{ "data": Project }`.

### `PUT /api/projects/{id}`

Any subset of the fields above (at least one). The date range is checked against the stored value of whichever date is not being changed. `200` → `{ "data": Project }`.

### `DELETE /api/projects/{id}`

Deletes the project and all its tasks. `204`.

---

## Tasks

A task object (includes its project's name so lists do not need a second request):

```json
{
  "id": "2f1a03f2-e047-4cc4-a625-f15a1bf5667a",
  "projectId": "6c83a77d-29b4-456c-ac87-dc24685744d3",
  "projectName": "Raman spectroscopy rig",
  "name": "Align 785 nm laser",
  "description": "",
  "priority": "HIGH",
  "status": "PENDING",
  "dueDate": "2026-10-10",
  "completedAt": null,
  "createdAt": "2026-10-08T07:07:49.327Z",
  "updatedAt": "2026-10-08T07:07:49.327Z",
  "isOverdue": false
}
```

`priority`: `LOW` | `MEDIUM` | `HIGH`. `status`: `PENDING` | `IN_PROGRESS` | `COMPLETED`.

### `GET /api/tasks`

| Query | Description |
|---|---|
| `projectId` | Only tasks in this project (must be yours, otherwise the list is empty) |
| `search` | Case-insensitive match on name |
| `status`, `priority` | Exact filters; combine freely |
| `overdue` | `true` = open tasks whose due date has passed; `false` = everything else |
| `sort` | `createdAt` (default), `updatedAt`, `name`, `status`, `priority`, `dueDate` (undated tasks last) |
| `order`, `page`, `limit`, `today` | See conventions |

```bash
curl 'https://lumen-api-x4be.onrender.com/api/tasks?projectId=6c83a77d-…&status=PENDING&priority=HIGH&sort=dueDate&order=asc' \
  -H "Authorization: Bearer $TOKEN"
```

### `GET /api/tasks/{id}`

`200` → `{ "data": Task }`.

### `POST /api/tasks`

| Field | Rules |
|---|---|
| `projectId` | required UUID of one of **your** projects (otherwise `404 Project not found.`) |
| `name` | required, 1–160 characters after trimming |
| `description` | optional, max 2000 |
| `priority` | optional, default `MEDIUM` |
| `status` | optional, default `PENDING` |
| `dueDate` | optional `YYYY-MM-DD` or `null` |

`201 Created` → `{ "data": Task }`.

### `PUT /api/tasks/{id}`

Any subset of the fields above. Common calls:

```bash
# Mark completed (sets completedAt)
curl -X PUT https://lumen-api-x4be.onrender.com/api/tasks/$ID -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"COMPLETED"}'

# Change priority
curl -X PUT https://lumen-api-x4be.onrender.com/api/tasks/$ID -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"priority":"HIGH"}'
```

Moving a task (`projectId`) is allowed only into another project you own. Moving a task out of `COMPLETED` clears `completedAt`.

### `DELETE /api/tasks/{id}`

`204`.

---

## Dashboard

### `GET /api/dashboard`

All counters are computed in one SQL query over the signed-in user's rows.

```json
{
  "data": {
    "totalProjects": 4,
    "totalTasks": 16,
    "completedTasks": 6,
    "pendingTasks": 7,
    "projectsInProgress": 2,

    "openTasks": 10,
    "inProgressTasks": 3,
    "overdueTasks": 1,
    "dueThisWeek": 4,
    "completionRate": 38,
    "projectsByStatus": { "NOT_STARTED": 1, "IN_PROGRESS": 2, "COMPLETED": 1 },
    "tasksByStatus": { "PENDING": 7, "IN_PROGRESS": 3, "COMPLETED": 6 },
    "tasksByPriority": { "LOW": 4, "MEDIUM": 6, "HIGH": 6 },
    "upcomingTasks": [ "…up to 6 open tasks with due dates, soonest (and overdue) first…" ],
    "recentActivity": [ "…last 8 activity entries…" ]
  }
}
```

The first five fields are the ones the brief asks for. **Pending Tasks** means tasks whose status is `PENDING`; tasks that are not completed (Pending + In Progress) are reported separately as `openTasks`.

---

## Activity (bonus: audit log)

### `GET /api/activity?limit=30`

The signed-in user's audit trail, newest first. Every create, update, completion, delete, sign-in and sign-out is recorded in the same database transaction as the change itself, with the platform it came from.

```json
{
  "data": [
    {
      "id": "…",
      "action": "task.complete",
      "entityType": "task",
      "entityId": "…",
      "summary": "Completed “Polish lens”",
      "platform": "mobile",
      "createdAt": "2026-10-08T06:30:12.000Z"
    }
  ]
}
```

---

## System

### `GET /api/health`

No authentication. `200` `{ "status": "ok", "database": "up", "uptime": 123, "version": "1.0.0", "commit": "a1b2c3d" }`, or `503` if PostgreSQL is unreachable. Used by Render health checks and by the web app's "server is waking up" screen.
