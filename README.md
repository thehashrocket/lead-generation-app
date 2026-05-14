# Lead Generation Tool — 990-Powered Nonprofit Outreach Pipeline

Personal outreach pipeline for nonprofit org discovery, mission text enrichment, LLM-personalized email drafts, and reply tracking. v0.4.0.0.

## What It Does

- **Search nonprofits** via ProPublica (filter by NTEE code, state, revenue; falls back to keyword-only if filter endpoints return 500)
- **Enrich org profiles** with mission text and programs. For orgs cached before April 2026, parses IRS 990 XML directly via SAX. For new orgs (where ProPublica nulled `filing_url`), scrapes the org's own website (`/about`, `/mission`, etc.) and extracts mission + programs via Claude Haiku 4.5 (~$0.005/org) with `mission_source` provenance so the 990 cache is never overwritten
- **Generate personalized cold email drafts** via Vercel AI Gateway (Claude Sonnet 4.6 with Haiku fallback)
- **Send emails** via Resend with VERP reply tracking addresses
- **Track replies** with inbound webhook: classifies human / OOO / DSN / autoresponder, stores thread state, auto-forwards human replies to personal Gmail
- **Track delivery events**: delivered / bounced / complained; auto-suppresses bounced and complained addresses
- **CSV export** for search results, captured contacts, and sent-email history
- **Settings page**: API token management, health dashboard, prompt performance, weekly send cap
- **Chrome MV3 extension**: one-click LinkedIn contact capture via popup + content script

## Setup

```bash
cp .env.example .env.local        # Copy env template; fill in each value
vercel link                        # Link to your Vercel project
vercel env pull .env.local --yes   # Pull OIDC token + secrets (~12h validity)
bun install
bun run setup                      # Validates services, runs DB migration, generates a sample draft
bun dev                            # Start the app at http://localhost:3000
```

Re-run `vercel env pull .env.local --yes` at the start of each dev session to refresh the OIDC token.

### Required Environment Variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `APP_SECRET` | Random 32-char hex: `openssl rand -hex 16` |
| `APP_PASSWORD` | Any string; used by the local `/login` page |
| `DATABASE_URL` | Neon dev branch: `postgres://user:pass@host/db?sslmode=require` |
| `AI_GATEWAY_API_KEY` | Vercel Dashboard → AI → Gateways → API Keys (only if not using OIDC) |
| `RESEND_API_KEY` | resend.com → API Keys → Create |
| `RESEND_WEBHOOK_SECRET` | resend.com → Webhooks → Signing Secret |
| `RESEND_FROM_EMAIL` | Sending address (e.g. `you@yourdomain.org`) |
| `RESEND_REPLY_TO_DOMAIN` | Inbound reply domain (e.g. `replies.yourdomain.org`) |

The `bun run setup` wizard validates all required vars, tests DB connectivity, runs the Drizzle migration, checks ProPublica and Vercel AI Gateway reachability, and generates a sample email draft end-to-end.

## Chrome Extension

1. Open `chrome://extensions` → enable **Developer mode**
2. Click **Load unpacked** → select the `extension/` directory
3. Open the app → **Settings** → generate an API token → paste it into the extension popup
4. On any LinkedIn profile page, click the extension icon to capture the contact with one click

## Stack

- Next.js 16 App Router + React Server Components
- Drizzle ORM + Neon (Postgres)
- Resend (email send + inbound webhooks)
- Vercel AI Gateway → Claude Sonnet 4.6
- shadcn/ui + Tailwind 4
- Biome (lint + format), Vitest (26 unit tests), Playwright (E2E scaffolded)

## Deployment

Deploy to Vercel. Enable **Vercel Authentication** in the dashboard for password protection.

Post-deploy checklist:
- Set `DATABASE_URL` to the Neon **main** branch in the Vercel dashboard (not in `.env.local`)
- Add MX record `inbound.resend.com` (priority 10) for your replies subdomain (e.g. `replies.yourdomain.org`), then set the Resend inbound endpoint to `https://<your-domain>/api/webhooks/resend/inbound`
- Create a Resend webhook subscribed to `email.delivered`, `email.bounced`, and `email.complained` pointed at `https://<your-domain>/api/webhooks/resend/events`
- Copy the webhook signing secret from Resend and set it as `RESEND_WEBHOOK_SECRET`
- Verify weekly send cap in Settings before first production run
