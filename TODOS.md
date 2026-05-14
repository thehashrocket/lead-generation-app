# TODOS

## ~~Email acquisition via Hunter.io~~ (RESOLVED 2026-04-27)
Wire up Hunter.io Email Finder API to auto-populate the To: field when contact email is null.
**Resolved:** Full implementation shipped in v0.3.0.0. Route, service, schema, UI, and tests all complete.
**Spike findings:** Free tier is 50 credits/month (matches the 50 emails/week cap). API: `GET https://api.hunter.io/v2/email-finder?domain=X&first_name=Y&last_name=Z&api_key=KEY` → returns email + confidence (0-100).

**Domain derivation:** Add `website` (nullable text) to `orgs` table. Populate via a new ProPublica per-org API call (`GET https://projects.propublica.org/nonprofits/api/v2/organizations/[ein].json`) added to the existing 990 enrich route (`/api/orgs/[ein]/enrich`), before the IRS 990 XML fetch. Cache result in `orgs.website`. If `website` is null after enrichment: return `{ email: null, reason: 'no_domain' }`. NOTE: `propublica_url` stores ProPublica's own page URL — useless for Hunter.io domain lookup.

**Pre-population fix (independent of Hunter.io):** `/api/drafts/generate` must look up contacts by `orgId` and return `toEmail` if `contacts.email` is set. `DraftSheet` seeds `toEmail` from the generate response. Prevents empty To: fields for orgs with already-known contact emails.

**What to build:**
- `HUNTER_API_KEY` env var (optional — feature degrades gracefully when absent: button hidden)
- `lib/services/contacts/email-lookup.ts` — fetch wrapper, returns `{ email, confidence } | null`
- `GET /api/contacts/email-lookup?orgId=...` — requires `requireWebSession()`, then:
  1. Look up org by `orgId` (404 if not found)
  2. Find contact by `orgId` OR create stub via `INSERT ... ON CONFLICT DO NOTHING` (requires partial unique index: `contacts(org_id) WHERE linkedin_url IS NULL`)
  3. Credit guard: if `contacts.email` is set AND `contacts.linkedin_url IS NOT NULL` → return early (never overwrite extension-captured emails). If `contacts.email` is set AND `linkedin_url IS NULL` → return early (already have a Hunter result).
  4. Quota check: `SELECT SUM(hunter_calls) FROM usage_log WHERE day >= DATE_TRUNC('month', CURRENT_DATE)`. If >= 50 → return `{ email: null, reason: 'quota_reached' }`.
  5. Call Hunter.io Email Finder: split `contact.name` on first space for `first_name`/`last_name`; use `orgs.website` for `domain`.
  6. On success: write `contacts.email`, `contacts.email_confidence` (nullable smallint); increment `usage_log.hunter_calls` for today (upsert by day).
  7. Return `{ email, confidence }`.
- UI in `DraftSheet`:
  - "Find email" button below To: field when `toEmail` is empty AND `HUNTER_API_KEY` present
  - Spinner while fetching; fills `toEmail` on success
  - Badge: green if confidence >= 50, yellow if confidence < 50 (reconstructed from `contacts.email_confidence` on draft reopen)
  - At quota: button shows "Monthly limit reached (50/50)" disabled — same pattern as send cap
  - `no_domain`: inline "No domain found for this org"
  - null result: inline "Email not found by Hunter.io"
- Settings view: add Hunter.io usage row: `SUM(hunter_calls) WHERE day >= DATE_TRUNC('month', CURRENT_DATE)` / 50 — same section as Prompt Performance

**Schema changes (all in one migration):**
- `orgs.website` — nullable text
- `contacts.email_confidence` — nullable smallint
- `contacts`: partial unique index on `(org_id) WHERE linkedin_url IS NULL`
- `usage_log.hunter_calls` — nullable int (existing rows default null = 0)

**Tests (`lib/__tests__/email-lookup.test.ts` + route tests):**
- `email-lookup.ts`: credit guard exits when email set, domain null → null, Hunter 4xx/5xx → null, confidence < 50 flagged, happy path
- Route: 401 (no session), 400 (missing orgId), 404 (org not found), early return for extension email (linkedinUrl not null), early return for existing stub email, no website → `no_domain`, monthly quota >= 50 → `quota_reached`, single-name contact split, Hunter null result, happy path
- `/api/drafts/generate`: regression test — contact by orgId found → toEmail in response
- `DraftSheet`: seeded toEmail from generate response (unit); Find Email button flow (E2E)

**Start:** New branch. ~4-5 hours to implement + test.

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

## ~~990 mission text enrichment~~ (RESOLVED 2026-05-14, v0.4.0)

ProPublica removed XML URLs (`filing_url: null` on all filings as of 2026-04) and the IRS S3 bucket (`irs-form-990`) is no longer publicly accessible. Mission text only populated for orgs cached before this change.

**Resolved (v0.4.0):** Implemented website-scrape + Claude Haiku 4.5 LLM extraction as a pre-step of `POST /api/drafts/generate`. Uses the `orgs.website` field populated by Brave Search (v0.3.3.0). Persists to `mission_text`/`programs_json` with `mission_source='website_scrape'` provenance — never overwrites the `'990_xml'` gold cache. Per-status cooldown (`mission_enrichment_status` enum) handles transient failures cleanly. Cost: ~$1.80/month at 200 orgs/month — well under the $50/mo budget. See `lib/services/orgs/website-enrichment.ts`.

**Candid ($4,800/mo) remains rejected.** IRS bulk CSV as a future v0.6+ option once outreach volume justifies a real corpus.

## Per-host scrape concurrency limit (Deferred from /plan-eng-review, Codex #5)

`lib/services/orgs/website-enrichment.ts` enforces per-host concurrency ONLY within a single request handler. Two concurrent `/api/drafts/generate` calls hitting the same org's website would fire two parallel fetches at the same host. In a stateless Vercel Function deployment, true cross-instance throttling needs Vercel Queues or a Redis-backed lock.

**Risk:** at 50 sends/week solo, probability of hitting the same host concurrently is near zero. The polite-UA + 12s budget + hard-stop-on-429 already mitigate the practical case.

**When to revisit:** if outreach scales beyond 100 sends/week OR if a host's operator complains.

## v0.4.0 follow-up: E2E + LLM hallucination eval (Deferred)

The v0.4.0 PR shipped with full unit coverage (44 tests) + the critical null-mission regression test. The 4 Playwright E2E flows and the LLM hallucination eval that were called for in `/plan-eng-review` were deferred to keep the PR shipping.

**What to build:**
- `e2e/v0.4.0-mission-enrichment.spec.ts` with 4 flows: cached mission (fast path), fresh enrich (~10s), null website (skips enrich), daily cap reached (UI message). Will need a mock for Anthropic gateway + Brave Search.
- `lib/__tests__/website-enrichment.eval.ts` with ~5 fixture pairs that test hallucination guard — feeds generic nonprofit-style text without specific programs and asserts that `programs[]` is empty.

**When:** before v0.5 ships, or sooner if the scrape extraction produces a quality regression we can't catch in unit tests.

## ~~Ghost sends — add 'failed' status to sends table~~ (RESOLVED 2026-04-28)
When Resend returns an error, `sendDraft()` calls `db.delete(sends)` to remove the queued row. If that delete fails (network hiccup), the row stays in `status: "queued"` permanently, pollutes the weekly cap count, and is invisible in the Sent view. Same bug applies to `getWeeklySendCount()`.

**Decision (Eng Review Pass 6, D3):** Add `"failed"` to `sendStatusEnum`, set `status: "failed"` on error instead of deleting, exclude failed rows from cap count.

**What to do:**
- `lib/db/schema/sends.ts`: add `"failed"` to `sendStatusEnum` array.
- Run `bun drizzle-kit generate` to create migration. Existing rows are unaffected (additive enum).
- `lib/services/sends/resend.ts`: both catch blocks — replace `db.delete(sends).where(eq(sends.id, send.id))` with `db.update(sends).set({ status: "failed" }).where(eq(sends.id, send.id))`.
- `lib/services/sends/resend.ts` cap count query in `sendDraft()` + `getWeeklySendCount()`: add `ne(sends.status, "failed")` to the `where` clause.
- `lib/__tests__/sends.integration.test.ts`: add case — seed 50 `failed` rows → cap NOT reached.

**Caveats (Codex):** Verify migration handles existing rows; ensure cap query correctly excludes failures.

**Start:** Ready now. ~60 min. Can parallelize with D1.

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
**Known limitation:** Client-side post-filtering (fix-ntee-code-filter) means filtered
searches only see ProPublica page 1 (≤25 orgs). Sparse sub-codes like D20 may have more
matches on later pages that are invisible until the corpus is built.
**Start:** When sustained outreach exceeds 100 sends/week OR you find yourself wanting
"search by keyword in mission" and ProPublica's UI doesn't cut it.

## ~~Extension token 90-day auto-expiry~~ (RESOLVED 2026-04-27)
~~Add `expires_at` column to `api_tokens`...~~
**Resolved:** `expires_at` migration generated (`0001_add_token_expires_at.sql`). `validateApiToken` rejects expired tokens. Settings page shows amber banner ≤80 days, red banner ≤10 days.

## ~~Weekly send cap race condition~~ (RESOLVED 2026-04-28)
~~`sendDraft()` wraps the count check + insert in `db.transaction({ isolationLevel: "serializable" })`, but the project uses `drizzle-orm/neon-http` which silently no-ops transactions over HTTP...~~
**Resolved (Eng Review Pass 6):** Switch `lib/db/index.ts` to `drizzle-orm/neon-serverless` WebSocket adapter. Real serializable transactions now enforced. See D1 in review log.

## ~~EIN format validation before 990 fetch~~ (RESOLVED 2026-04-27)
~~`/api/orgs/[ein]/enrich` takes EIN directly from the URL segment...~~
**Resolved:** Guard added at route entry in `app/api/orgs/[ein]/enrich/route.ts`.

## ~~Unprotected API routes~~ (RESOLVED 2026-04-27)
~~`/api/drafts/[id]` (PATCH), `/api/drafts/generate` (POST), and `/api/orgs/[ein]/enrich` (GET) have no auth~~
**Resolved:** `requireWebSession()` guard added to all three handlers (same pattern as `/api/sends`). See eng review pass 4.

## Integration test suite (Post-launch, after Neon dev branch is configured)
API routes and service functions (webhook handlers, send cap logic, draft generation cap) are currently untested at the integration level. Unit tests cover pure logic (classifier, CSV, 990 parser, webhook verify). Full coverage requires a Neon dev branch for a test DB.
**Start:** After Neon dev branch is set up per the plan's dev environment guidance.
