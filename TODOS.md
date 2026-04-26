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

## NTEE code verification (Before Day 1 of build)
Spend 30 minutes on the IRS EO Business Master File to verify exact NTEE codes for target orgs.
Design doc best guesses: D20 (animal welfare), T-series (voluntarism), P-series (human services), O (youth).
NTEE is the core search primitive — wrong codes = useless results from day 1.
**Reference:** https://www.irs.gov/charities-non-profits/exempt-organizations-business-master-file-extract-eo-bmf
**Start:** Before writing any ProPublica client code. Hardcode the verified code list in the search filter UI.

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

## Extension token 90-day auto-expiry (When extension is shared with anyone)
Add `expires_at` column to `api_tokens`, default 90 days from generation. UI banner at 80
days: "Token expires in N days, regenerate." Hard upper bound on stolen-token lifetime.
**Context:** D7 chose manual revoke for solo use. Codex flagged bearer token as the easiest
secret to leak. Auto-expiry adds defense in depth — important if you ever share the extension
or run it on multiple machines.
**Start:** First time you share the extension OR install it on a second machine.
**Depends on:** none (additive to existing `api_tokens` schema).

## Weekly send cap race condition (Known edge case, post-launch fix)
`sendDraft()` reads the weekly count then inserts — two concurrent sends could both see count < 50 and both go through, overshooting the cap by N concurrent callers. For a solo personal tool the race window is ~1ms with near-zero practical risk.
**Fix:** Wrap count check + insert in a serializable transaction, or use a DB-level counter.
**Start:** If cap ever fires unexpectedly during normal solo use (would indicate a retry burst).

## EIN format validation before 990 fetch (Defense in depth)
`/api/orgs/[ein]/enrich` takes EIN directly from the URL segment with no format check before passing to ProPublica and constructing the XML fetch URL. Add `if (!/^\d{2}-?\d{7}$/.test(ein))` guard at the route handler entry point.
**Start:** Before the extension is shared or the app gets any public-facing traffic.

## Integration test suite (Post-launch, after Neon dev branch is configured)
API routes and service functions (webhook handlers, send cap logic, draft generation cap) are currently untested at the integration level. Unit tests cover pure logic (classifier, CSV, 990 parser, webhook verify). Full coverage requires a Neon dev branch for a test DB.
**Start:** After Neon dev branch is set up per the plan's dev environment guidance.
