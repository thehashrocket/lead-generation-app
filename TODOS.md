# TODOS

## Email acquisition for contacts (Week 4+)
Evaluate Hunter.io API or Clearbit email lookup to find email addresses from contact name + org domain.
The Chrome extension captures name, title, and LinkedIn URL but email is usually null on LinkedIn.
Without email, the contact record is incomplete and outreach requires a manual lookup step.
**Context:** Codex outside voice flagged this as a pipeline gap. Hunter.io has a free tier (25 searches/month).
**Start:** After Chrome extension ships (week 3). Check Hunter.io API docs and pricing.

## ~~Email deliverability DNS check~~ (RESOLVED 2026-04-26)
~~Verify which Gmail address Jason will use for sending...~~
**Resolved:** Pivoted to Resend.com with `volunteerready.org` already warmed and live.
SPF/DKIM/DMARC handled by Resend. See plan amendment "Eng Review Pass 2" (D1-D5).

## ~~NTEE code verification~~ (RESOLVED 2026-04-27)
~~Spend 30 minutes on the IRS EO Business Master File...~~
**Resolved:** Verified against IRS BMF export. Final list: D20 (Animal Rescues), P (Human Services), K (Food Banks), L (Housing/Shelters), O (Youth Dev), N (Recreation/Sports), B (Education), E (Health), C (Environment), T (Philanthropy/Voluntarism). Updated in `search-filters.tsx`.

## ~~Reply digest notification~~ (OBSOLETE 2026-04-26)
~~Slack push removed; daily digest deferred...~~
**Obsolete:** Resend Inbound webhooks now push replies in real time. Auto-forward to
`jasshultz@gmail.com` means Jason gets the actual reply in his inbox, not a digest.
See plan amendment "Eng Review Pass 2" (D2).

## 990 fallback path telemetry review (Quarterly, post-launch)
Quarterly Axiom query: `count by 990.path_matched for last 90 days`.
If a previously-rare path becomes dominant, IRS schema drifted — update lenient parser
to make the new path the primary lookup before old path stops working entirely.
**Context:** D8 chose lenient parser with field-path fallback chain. D10 added Axiom for
structured logging. Path-match telemetry is auto-emitted; review is the action.
**Start:** 90 days after first send. Set calendar reminder.

## Real ingestion/search corpus (If volume scales beyond 50/week)
Build nightly ingestion job → Postgres FTS or Meilisearch index across all ProPublica orgs
+ parsed 990 mission/programs text. Enables full-text search by keyword in mission text and
removes ProPublica live-API dependency from the search hot path.
**Context:** Codex outside voice flagged ProPublica live + 24h cache as fragile at scale.
At 50 emails/week with manual selection, the current approach is fine. Re-evaluate if outreach
volume grows or you want keyword search across mission text.
**Start:** When sustained outreach exceeds 100 sends/week OR you find yourself wanting
"search by keyword in mission" and ProPublica's UI doesn't cut it.

## ~~Extension token 90-day auto-expiry~~ (RESOLVED 2026-04-27)
~~Add `expires_at` column to `api_tokens`...~~
**Resolved:** `expires_at` migration generated (`0001_add_token_expires_at.sql`). `validateApiToken` rejects expired tokens. Settings page shows amber banner ≤80 days, red banner ≤10 days.

## Weekly send cap race condition (Known edge case, post-launch fix)
`sendDraft()` wraps the count check + insert in `db.transaction({ isolationLevel: "serializable" })`, but the project uses `drizzle-orm/neon-http` which silently no-ops transactions over HTTP — each statement is a separate round-trip with no isolation guarantee. The race is still open in practice.
**Fix:** Switch to `drizzle-orm/neon-serverless` (WebSocket adapter) which supports real transactions, OR use an optimistic DB-level `UPDATE sends SET ... WHERE weekly_count < 50 RETURNING id` pattern.
**Start:** If cap ever misfires during solo use (would indicate a retry burst). Near-zero risk for solo tool.

## ~~EIN format validation before 990 fetch~~ (RESOLVED 2026-04-27)
~~`/api/orgs/[ein]/enrich` takes EIN directly from the URL segment...~~
**Resolved:** Guard added at route entry in `app/api/orgs/[ein]/enrich/route.ts`.

## Unprotected API routes (P1 — fix before public exposure)
`/api/drafts/[id]` (PATCH), `/api/drafts/generate` (POST), and `/api/orgs/[ein]/enrich` (GET) have no auth — not bearer token, not session. They pass through the proxy's `/api/*` bypass and rely on "their own mechanisms" per the proxy comment, but have none.
- Any caller who can guess a draft UUID can overwrite `subject`, `body`, and `toEmail`.
- Any caller can trigger AI draft generation (burning API quota).
- Any caller can trigger 990 XML fetches and write enrichment data to the DB.
**Fix:** Add `requireWebSession()` guard to these three route handlers (same pattern as `/api/sends`, `/api/export/*`).
**Context:** Flagged by adversarial review during v0.2.2.1 ship. Low immediate risk (solo tool, no public URL), but must fix before sharing the URL or adding more users.
**Start:** Next engineering pass.

## Integration test suite (Post-launch, after Neon dev branch is configured)
API routes and service functions (webhook handlers, send cap logic, draft generation cap) are currently untested at the integration level. Unit tests cover pure logic (classifier, CSV, 990 parser, webhook verify). Full coverage requires a Neon dev branch for a test DB.
**Start:** After Neon dev branch is set up per the plan's dev environment guidance.
