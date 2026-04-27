# Changelog

All notable changes to this project will be documented in this file.

## [0.2.3.1] - 2026-04-27

### Fixed
- Searching by state (e.g. `state=CA`) no longer returns a 500 error. Root cause: ProPublica's v2 API returns HTTP 500 for any request that includes a `state[]` parameter, regardless of encoding. The state parameter is now removed from the ProPublica request entirely; state filtering is handled client-side by the existing `applyOrganizationFilters` function, which was already doing this for NTEE codes.

## [0.2.3.0] - 2026-04-27

### Fixed
- Single-letter NTEE category codes (e.g. "E" for Health, "D" for Animal-Related) now return matching organizations instead of zero results. Root cause: the ProPublica v2 search API requires a numeric category ID (`ntee[id]=4`) not a letter code (`ntee[]=E`). All 26 NTEE major-group letters now map to the correct numeric ProPublica category before the request is sent.
- Searching with no keyword no longer returns stale cached results with a misleading `stale: true` flag — the API now returns a clear 400 error so the UI can prompt for a search term.
- Stale DB fallback (shown when ProPublica is unreachable) now correctly matches organizations by NTEE prefix (e.g. "E" matches "E210", "E310") instead of requiring an exact match that always returned zero results.

## [0.2.2.3] - 2026-04-27

### Fixed
- NTEE code filter now returns only matching organizations. Two compounding bugs caused unrelated orgs to appear in filtered searches: (1) a silent retry on ProPublica 500 errors stripped all filters and returned unfiltered results, and (2) ProPublica's `ntee[]` API param is unreliable. Fixed by removing the retry and adding client-side post-filtering in `applyOrganizationFilters()`. Handles both sub-codes ("D20") and major-group letters ("P", "K") via prefix match.
- `total_results` and `num_pages` in search responses now reflect the post-filter count instead of ProPublica's raw count, preventing misleading "showing 8 of 847" UI states.

## [0.2.2.2] - 2026-04-27

### Security
- Three API routes that were missing session authentication can now only be called by a logged-in user: `PATCH /api/drafts/[id]` (draft editing), `POST /api/drafts/generate` (AI draft generation), and `GET /api/orgs/[ein]/enrich` (990 XML fetch). Previously any caller who could guess a draft UUID could overwrite the recipient, subject, and body, trigger AI generation (burning quota), or write enrichment data to the database.

### Changed
- Hunter.io email acquisition spec finalized: free tier confirmed at 50 credits/month (matches the 50 emails/week send cap). API integration spec written in TODOS.md — ready to build.

## [0.2.2.1] - 2026-04-27

### Fixed
- Remove `middleware.ts` re-export shim that caused a hard build error in Next.js 16.2.4. Next.js 16 loads `proxy.ts` directly — having both files at the project root triggers "Both middleware file and proxy file detected." Auth behavior is unchanged.

## [0.2.2.0] - 2026-04-27

### Security
- All web API routes (`/api/search`, `/api/sends`, `/api/export/*`, `/api/settings/token`) now require an authenticated session — previously only the middleware covered page routes.
- API token validation now accepts pre-migration tokens with NULL `expires_at` so the Chrome extension is not locked out after deploying the token expiry migration.

### Added
- Revenue range filter (min/max) wired end-to-end: ProPublica API params, filter store, UI inputs, and CSV export. Stale-cache fallback uses numeric `CAST(total_revenue AS bigint)` comparison instead of lexicographic string comparison.
- API token auto-expiry: tokens now expire after 90 days. Settings page shows an amber warning at ≤80 days and a red alert at ≤10 days or when expired.
- NTEE code list expanded from 6 best-guess codes to 10 IRS-verified codes: adds K (Food Banks), L (Housing/Shelters), N (Recreation/Sports Leagues), C (Environment). Verified against IRS EO Business Master File export.

### Fixed
- `middleware.ts` was missing — Next.js never loaded `proxy.ts`, leaving all web routes completely unprotected.
- `RefreshRepliesButton` on the Sent page replaced a dead `<form action="/api/sent/refresh">` with `router.refresh()`.
- 990 mission text parser (`isPrintableAscii`) was silently discarding valid mission text containing smart quotes, em-dashes, or accented characters from real IRS filings. Now uses `isPrintableText` which accepts Unicode and only rejects binary control characters.
- EIN format validation and hyphen normalization added to `/api/orgs/[ein]/enrich` — invalid formats return 400; hyphenated EINs are normalized to match DB storage format.
- ProPublica org inserts replaced N+1 loop with single batched `onConflictDoUpdate` insert.

### Tests
- Integration test suite for `sendDraft()`: 5 tests covering success path, suppression, domain block, not-found draft, and weekly cap.
- Playwright critical-path E2E tests: 8 tests covering auth redirects, login flow, search filters, and settings page.
- Unit tests added for: `isPrintableText` (Unicode/control-char), `requireWebSession` (auth guard), token expiry logic, EIN format validation regex, `daysUntilExpiry` thresholds.

## [0.2.1.0] - 2026-04-27

### Security
- Login route now uses `crypto.timingSafeEqual` for password comparison, preventing timing-based brute-force attacks.
- Session module validates `APP_SECRET` at request time with a clear error message if missing or too short.
- Session cookie now explicitly sets `secure: true` in production.

### Changed
- Replaced Vercel Authentication (deployment-level protection that blocked all HTTP, including the Chrome extension and Resend webhooks) with Next.js middleware (`proxy.ts`) using iron-session encrypted session cookies. Web routes (`/`, `/sent`, `/settings`) are protected; all `/api/*` routes are excluded and authenticate via their own channels (bearer token, Svix signature).
- Login route (`/api/auth/login`) now works in production via iron-session — previously returned 404 in production.
- `APP_PASSWORD` and `APP_SECRET` added to T3 Env validation and `bun run setup` wizard.

### Added
- Middleware auth test suite covering authenticated pass-through, unauthenticated redirect, API route bypass, webhook bypass, and login page bypass.
- Login route tests covering invalid body, missing password, wrong password, and correct password flows.

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
