# Design System — 990-Powered Personal Pipeline

Created by /plan-design-review on 2026-04-26.
Single-user personal tool. Desktop-optimized. shadcn/ui + TailwindCSS 4.

## Typeface

**Geist** (Vercel). Use the Next.js built-in import:

```tsx
// app/layout.tsx
import { GeistSans } from 'geist/font/sans'
```

Apply via `<html className={GeistSans.variable}>` and `font-family: var(--font-geist-sans)` in globals.css.

Do NOT use system-ui, Inter, or Tailwind's default `font-sans` stack.

### Type Scale

| Use | Size | Weight | Line height |
|-----|------|--------|-------------|
| Org name (detail) | 18px | 600 | 1.3 |
| Section headings | 15px | 600 | 1.3 |
| Body / email draft | 15px | 400 | 1.6 |
| Table rows | 14px | 400 | 1.4 |
| Labels, badges | 12px | 500 | 1.3 |
| Sidebar nav | 14px | 500 | 1.4 |
| Metadata (EIN, dates) | 12px | 400 | 1.3 |

## Color Tokens

Use shadcn/ui default CSS variables. Do not override with custom values except where noted.

```css
/* Custom additions only */
--color-replied: oklch(0.527 0.154 150.069);   /* green-600 — Replied badge */
--color-cap-warning: oklch(0.769 0.188 70.08); /* amber-500 — cap 45-49/50 */
--color-cap-danger: oklch(0.577 0.245 27.325); /* red-600 — cap 50/50 */
```

Primary action (Send, Search): shadcn `default` button variant (dark fill).
Secondary action (Regenerate, View Thread): shadcn `outline` variant.
Destructive: shadcn `destructive` variant.

## Spacing Scale

Use Tailwind 4 spacing. Prefer 4-based increments.

- Panel padding: `p-6` (24px)
- Card/section padding: `p-4` (16px)
- Sidebar width: `w-52` (208px)
- Sheet (slide-over) width: `w-[60vw]` on 1280px+
- Table row height: implicit from `py-3 px-4` on cells

## Layout

### App Shell

```
┌─────────────────────────────────────────────────────────┐
│ [Logo]  [Search] [Sent]                    [Settings ⚙] │  ← sidebar (left, w-52)
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    <main content>                       │
│                                                         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Sidebar is persistent. Active nav item: `bg-accent text-accent-foreground rounded-md`.

### Search View

```
┌── sidebar ──┬────────── filter panel (w-64) ──┬──── results table ────────────┐
│  Search     │  Filters                         │  [Search by name...]  247 res │
│  Sent       │  NTEE Code: [multi-select ▼]     │  ─────────────────────────── │
│             │  State: [dropdown ▼]             │  Org Name │NTEE│State│Rev│Act│
│  ──────     │  Revenue: [$___] – [$___]        │  Row 1                        │
│  Settings   │  [Search Nonprofits]             │  Row 2                        │
└─────────────┴──────────────────────────────────┴───────────────────────────────┘
```

### Draft Sheet (slide-over, opens from Search row click)

```
┌── results (visible behind sheet) ──┬──────── Sheet (60vw) ──────────────────┐
│  [dimmed search results]           │  Org Name                    [X close] │
│                                    │  D20 · California · $2.3M              │
│                                    │  ─────────────────────────────────────  │
│                                    │  Mission: [text...]                     │
│                                    │  990 Contact: Jane Smith, Exec Director │
│                                    │  To: [input field]                      │
│                                    │  ─────────────────────────────────────  │
│                                    │  Subject: [editable input]              │
│                                    │  [editable email body textarea]         │
│                                    │  ─────────────────────────────────────  │
│                                    │  Saved ✓  claude-sonnet-4-6 v1          │
│                                    │  [Regenerate ⟳]  [Send via Gmail →]    │
└────────────────────────────────────┴────────────────────────────────────────┘
```

### Sent View

```
┌── sidebar ──┬───────────────────────────────────────────────────────────────┐
│  Search     │  Sent (12)   12/50 this week          [Refresh Replies ↻]    │
│  Sent ●     │  ─────────────────────────────────────────────────────────── │
│             │  [amber: Gmail reconnects in 2 days. Reconnect now →]        │
│  Settings   │  ─────────────────────────────────────────────────────────── │
│             │  Org Name    │ Contact │ Subject │ Sent   │ Status  │ Action  │
│             │  ─────────────────────────────────────────────────────────── │
│             │  [Replied rows first, green badge]                            │
│             │    ↳ Reply: "Thanks for reaching out..." [Open in Gmail ↗]   │
│             │  [No Reply rows, gray badge, chronological]                   │
└─────────────┴───────────────────────────────────────────────────────────────┘
```

## Status Badges

```tsx
// Replied
<Badge className="bg-green-100 text-green-700 border-green-200">Replied</Badge>

// No Reply
<Badge variant="secondary">No Reply</Badge>

// Sent (in flight)
<Badge variant="outline" className="text-blue-600 border-blue-300">Sent</Badge>

// Limited 990 data
<Badge variant="outline" className="text-gray-400 border-gray-200 text-xs">
  Limited 990 data
</Badge>
```

## Week Cap Indicator

In Sent view header and sidebar footer:

```tsx
// 0-44: normal
<span className="text-sm text-muted-foreground">12/50 this week</span>

// 45-49: warning
<span className="text-sm text-amber-600 font-medium">47/50 this week</span>

// 50/50: danger (Send button disabled)
<span className="text-sm text-red-600 font-semibold">50/50 — resets Monday</span>
```

Send button when cap reached:
```tsx
<Button disabled>Weekly cap reached — resets Monday</Button>
```

## Alert / Banner Patterns

```tsx
// Gmail expiring soon (token age 6-7 days)
<Alert variant="warning">
  <AlertTitle>Gmail reconnects in {daysLeft} days</AlertTitle>
  <AlertAction>Reconnect now</AlertAction>
</Alert>

// Gmail expired
<Alert variant="destructive">
  <AlertTitle>Gmail disconnected — reconnect to send emails</AlertTitle>
  <AlertAction>Reconnect</AlertAction>
</Alert>

// Reply sync gap
<Alert variant="warning">
  <AlertTitle>Sync gap detected — running full re-sync</AlertTitle>
</Alert>
```

## Chrome Extension Popup

The popup is a separate HTML context (180×280px, popup.html). Use inline styles or a minimal CSS file — Tailwind does not apply inside the extension popup without explicit build config.

```
┌─────────────────────────┐
│  🔗 Pipeline            │  (header, 14px bold)
│  ─────────────────────  │
│  [org name auto-read]   │  (12px, from DOM)
│  [title auto-read]      │  (12px gray)
│  [linkedin URL]         │  (12px gray, truncated)
│  ─────────────────────  │
│  [ Capture Contact ]    │  (full-width button, blue)
│  ─────────────────────  │
│  ✓ Contact saved        │  (success state, green)
│  ✗ Not on a profile     │  (error state, when not linkedin.com/in/*)
└─────────────────────────┘
```

States:
- **Default (on linkedin.com/in/\*):** Shows auto-read data + Capture button
- **Not on profile:** Shows "Open a LinkedIn profile to capture a contact" in gray
- **Capturing:** Button shows spinner "Saving..."
- **Success:** Green checkmark "Contact saved"
- **Error:** Red "Failed to save — is the app running?" with Retry

Token UI: A small gear icon (⚙) in the popup header opens a settings view within the popup (same 180×280 area) with a text input to paste the bearer token. One-time setup.

## Mobile

Not supported in v1. For screens < 768px:

```tsx
// In layout.tsx
<div className="hidden md:block">{children}</div>
<div className="md:hidden flex items-center justify-center h-screen text-center p-8">
  <p className="text-muted-foreground text-sm">
    This tool is designed for desktop. Please open on a laptop or desktop browser.
  </p>
</div>
```
