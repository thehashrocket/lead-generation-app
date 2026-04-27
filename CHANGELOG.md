# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0.1] - 2026-04-27

### Added
- `conductor.json` startup script for Conductor workspaces: `setup` copies `.env.local` from the shared project root (`$CONDUCTOR_ROOT_PATH`), installs dependencies, and runs database migrations; `run` starts the dev server.

### Changed
- Drizzle config now prefers `DATABASE_URL_UNPOOLED` over `DATABASE_URL` for migrations, ensuring a direct (non-pooled) Postgres connection as required by drizzle-kit.

## [0.2.0.0] - 2026-04-26

### Added
- Full 990-powered nonprofit outreach pipeline: search nonprofits via ProPublica (NTEE code, state, revenue filters with keyword-only fallback on API errors), enrich org profiles from IRS 990 XML via SAX streaming parser, generate personalized cold email drafts via Vercel AI Gateway (Claude Sonnet with Haiku fallback), send via Resend with VERP reply tracking.
- Inbound reply webhook: classifies replies as human/OOO/DSN/autoresponder, stores thread state, auto-forwards human replies to personal Gmail with circuit breaker and per-send forwarding cap.
- Delivery event webhook: tracks delivered/bounced/complained status, auto-adds bounced/complained emails to suppression list.
- Chrome MV3 extension: one-click LinkedIn contact capture via popup + content script, authenticated with Bearer token to `/api/contacts`.
- CSV export for search results, captured contacts, and sent-email history.
- Settings page: API token management (generate/revoke), health dashboard (DB + ProPublica + Resend), prompt performance view, weekly send cap with dev-only reset.
- Sent view with replied-first sort, inline reply thread expansion showing OOO/human classification.
- Draft slide-over Sheet with 990 mission context panel and auto-save on subject/body edit.
- `bun run setup` wizard for environment validation, DB migration, ProPublica/Resend/AI Gateway health checks.
- Vitest unit test suite (26 tests: reply classifier, 990 parser, CSV utilities, webhook signature verification).
- Playwright E2E config scaffolded.

### Fixed
- Webhook idempotency: replaced read-then-insert race with atomic `onConflictDoNothing` to prevent unhandled unique constraint errors on concurrent Resend retry deliveries.
- Loop-bypass header check moved after signature verification so it cannot be triggered by unauthenticated callers.
- Orphaned send rows on Resend error/exception now deleted to prevent cap inflation.
- LLM prompt input capped at 500 chars for missionText and 5 programs to prevent oversized prompts and injection via 990 XML content.
- ProPublica filter endpoints that return 500 fall back to keyword-only search.
- EIN normalized to string for consistent `inArray` lookups.
- React list key warning in SentTable.
- Setup wizard ProPublica and draft generation steps made non-fatal.
- drizzle-kit 0.31+ removed `--accept-data-loss` flag.

## [0.1.0.0] - 2026-04-26

### Added
- Initial design system (DESIGN.md): typography, color, layout, motion conventions for the personal pipeline tool.
- Skill routing rules in CLAUDE.md so Claude invokes specialized workflows (/ship, /investigate, /qa) for matching requests.
- Full implementation plan (PLAN.md): 990-Powered Personal Pipeline for Non-Profit Outreach. Three-week build with Resend.com sending from `volunteerready.org`, Resend Inbound webhooks for reply tracking with auto-forward to personal Gmail, ProPublica + IRS 990 XML enrichment, LLM-personalized drafts via Vercel AI Gateway, Chrome MV3 extension for one-click LinkedIn contact capture, and CSV exports for search/contacts/sent views.
- Eng review pass 2 hardening locked into the plan: Resend webhook signature verification, send idempotency keys, suppression list (bounce/complaint/unsubscribe), reply classifier (OOO / DSN / autoresponder detection), four-layer forwarder loop prevention, conversation thread state, PII redaction in logs, send-to-self loopback CI test.
- TODOS.md to track deferred work: 990 fallback path telemetry quarterly review, full ingestion/search corpus if volume scales, extension token 90-day auto-expiry.
