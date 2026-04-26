# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0.0] - 2026-04-26

### Added
- Initial design system (DESIGN.md): typography, color, layout, motion conventions for the personal pipeline tool.
- Skill routing rules in CLAUDE.md so Claude invokes specialized workflows (/ship, /investigate, /qa) for matching requests.
- Full implementation plan (PLAN.md): 990-Powered Personal Pipeline for Non-Profit Outreach. Three-week build with Resend.com sending from `volunteerready.org`, Resend Inbound webhooks for reply tracking with auto-forward to personal Gmail, ProPublica + IRS 990 XML enrichment, LLM-personalized drafts via Vercel AI Gateway, Chrome MV3 extension for one-click LinkedIn contact capture, and CSV exports for search/contacts/sent views.
- Eng review pass 2 hardening locked into the plan: Resend webhook signature verification, send idempotency keys, suppression list (bounce/complaint/unsubscribe), reply classifier (OOO / DSN / autoresponder detection), four-layer forwarder loop prevention, conversation thread state, PII redaction in logs, send-to-self loopback CI test.
- TODOS.md to track deferred work: 990 fallback path telemetry quarterly review, full ingestion/search corpus if volume scales, extension token 90-day auto-expiry.
