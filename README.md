# Lead Generation Tool

Personal outreach pipeline for non-profit org discovery and outreach.

## Setup

```bash
vercel link                   # Link to your Vercel project
vercel env pull .env.local    # Pull OIDC token + secrets (~12h validity)
bun install
bun run setup                 # Validates services, runs migrations, generates a sample draft
bun dev                       # Start the app at http://localhost:3000
```

Re-run `vercel env pull .env.local --yes` at the start of each dev session to refresh the OIDC token.

## Stack

- Next.js 16 App Router + React Server Components
- Drizzle ORM + Neon (Postgres)
- Resend (email send + inbound webhooks)
- Vercel AI Gateway → Claude Sonnet 4.6
- shadcn/ui + Tailwind 4
- Biome (lint + format), Vitest, Playwright

## Chrome Extension (Week 3)

1. Open `chrome://extensions` → enable Developer mode
2. Click "Load unpacked" → select the `extension/` directory
3. Open app → Settings → generate API token → paste into extension popup

## Deployment

Deploy to Vercel. Enable **Vercel Authentication** in the dashboard for password protection.
Update Resend webhook URLs to point to your production domain.
