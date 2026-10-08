# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-08

### Added
- REST API (Express 5, PostgreSQL, Drizzle) with authentication, projects, tasks, dashboard, activity log and health check.
- Rotating refresh tokens with replay detection; server-side sessions with immediate logout and remote sign-out.
- Rate limiting per IP and per account; helmet headers; CORS allow-list; structured, redacted logging.
- Shared package with zod schemas, response types and a typed API client used by every app.
- React web app: dashboard, projects, tasks (list and board), search, filters, sorting, pagination, activity, settings, command palette, light and dark themes.
- Expo Android app: secure token storage, dashboard, projects, tasks CRUD, search and filters, pull-to-refresh, offline viewing, session-expiry handling, local due-tomorrow reminders.
- 169 automated tests, GitHub Actions CI, Android APK workflow, CodeQL, Dependabot, Docker images, docker compose stack and Render blueprint.
- Documentation: README, API reference, OpenAPI, ER and architecture diagrams, security notes, demo script.
