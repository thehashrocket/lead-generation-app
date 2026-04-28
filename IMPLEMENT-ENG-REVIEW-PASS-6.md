# Eng Review Pass 6 — Implementation Plan

Branch: `thehashrocket/sun-valley-v2` (or new branch off main)

D1 and D3 can be done sequentially on one branch. D2 is blocked on Candid signup.

---

## D1 — Switch to neon-serverless WebSocket adapter (~45 min)

**Problem:** `lib/db/index.ts` uses `drizzle-orm/neon-http`. That adapter silently no-ops
`db.transaction({ isolationLevel: "serializable" })`. The weekly send cap check + insert in
`sendDraft()` is NOT atomic — two concurrent sends can both pass the cap check.

**Files to change:**

### `lib/db/index.ts`

Replace:
```ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
export type DB = typeof db;
```

With:
```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
```

### `package.json`

Add `ws` if not already present:
```
bun add ws
bun add -d @types/ws
```

(`@neondatabase/serverless` is already a dep — no change needed there.)

### Verify

```bash
bun run typecheck
bun test lib/__tests__/sends.integration.test.ts  # needs Neon dev branch DATABASE_URL
```

No changes to `lib/services/sends/resend.ts` — the transaction call is already correct.

---

## D3 — Add 'failed' status + fix cap count (~60 min)

**Problem:** On Resend API error, `sendDraft()` calls `db.delete(sends)` to clean up the
queued row. If the delete fails (network hiccup), the row stays as `status: "queued"` forever,
polluting the weekly cap count. `getWeeklySendCount()` has the same gap.

**Files to change:**

### `lib/db/schema/sends.ts`

Add `"failed"` to the enum:
```ts
export const sendStatusEnum = pgEnum("send_status", [
  "queued",
  "delivered",
  "bounced",
  "complained",
  "failed",   // ← add this
]);
```

### Generate migration

```bash
bun drizzle-kit generate
# Review the generated SQL — should be a single ALTER TYPE ... ADD VALUE 'failed'
bun drizzle-kit migrate   # or push to dev branch
```

### `lib/services/sends/resend.ts`

**1. Replace both `db.delete` calls with `db.update(status: "failed")`:**

First catch block (after `result.error` check, around line 67):
```ts
// Before:
await db.delete(sends).where(eq(sends.id, send.id));

// After:
await db.update(sends).set({ status: "failed" }).where(eq(sends.id, send.id));
```

Second catch block (around line 73):
```ts
// Before:
await db.delete(sends).where(eq(sends.id, send.id));

// After:
await db.update(sends).set({ status: "failed" }).where(eq(sends.id, send.id));
```

**2. Fix the cap count query in `sendDraft()` (the transaction, around line 47):**
```ts
// Before:
const [capRow] = await tx.select({ count: count() }).from(sends).where(gt(sends.sentAt, monday));

// After:
const [capRow] = await tx
  .select({ count: count() })
  .from(sends)
  .where(and(gt(sends.sentAt, monday), ne(sends.status, "failed")));
```

Add `ne` to the drizzle-orm import at the top of the file.

**3. Fix `getWeeklySendCount()`:**
```ts
// Before:
.where(gt(sends.sentAt, monday))

// After:
.where(and(gt(sends.sentAt, monday), ne(sends.status, "failed")))
```

### `lib/__tests__/sends.integration.test.ts`

Add a new test after the existing cap-at-50 test:
```ts
it("does not count failed sends toward the weekly cap", async () => {
  const { sendDraft } = await import("@/lib/services/sends/resend");
  const { db: testDb } = await import("@/lib/db");
  const { sends } = await import("@/lib/db/schema");

  // Seed 50 failed rows — should NOT block a new send
  await testDb.insert(sends).values(
    Array.from({ length: 50 }, () => ({
      draftId,
      verpToken: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      status: "failed" as const,
      sentAt: new Date(),
    })),
  );

  const result = await sendDraft(draftId, "test@example.com");
  expect(result.ok).toBe(true);
});
```

---

## D2 — Candid/GuideStar API for 990 mission text (~2 hrs, BLOCKED)

**Blocked until:** Candid developer account at https://data.candid.org

**Once unblocked:**

1. Add `CANDID_API_KEY` to `lib/env.ts` (optional, degrade gracefully when absent).
2. `lib/services/orgs/irs-990.ts`: replace the dead `IRS_S3_BASE` fetch with the Candid 990 endpoint.
   Keep `fetchIrsXml(ein): Promise<string | null>` signature — nothing else changes.
3. Add rate-limit guard per Candid free tier (check docs on signup).
4. `lib/__tests__/enrich-route.test.ts`: add mock case — Candid returns XML → `missionText` populated.

---

## Order of operations

```
1. bun add ws && bun add -d @types/ws
2. Edit lib/db/index.ts          (D1)
3. Edit lib/db/schema/sends.ts   (D3 — add "failed")
4. bun drizzle-kit generate      (D3 — migration)
5. Edit lib/services/sends/resend.ts  (D3 — both catch blocks + 2 cap queries)
6. Edit lib/__tests__/sends.integration.test.ts  (D3 — new test)
7. bun run typecheck
8. bun test
9. Commit: "fix: switch to neon-serverless + add failed send status"
```
