#!/usr/bin/env bun
/**
 * bun run setup
 * Validates all services and generates a sample draft to confirm the stack works.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { generateText, Output, gateway } from "ai";
import { z } from "zod";

// AI Gateway auth: run `vercel env pull .env.local` — OIDC token is injected automatically
const REQUIRED_VARS = [
  "APP_SECRET",
  "APP_PASSWORD",
  "DATABASE_URL",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
];

function ok(msg: string) { console.log(`  ✓ ${msg}`); }
function fail(step: string, problem: string, cause: string, fix: string) {
  console.error(`\n  ✗ ${step} failed`);
  console.error(`    Problem:  ${problem}`);
  console.error(`    Cause:    ${cause}`);
  console.error(`    Fix:      ${fix}`);
  process.exit(1);
}

console.log("\n🔧 LeadGen Setup Wizard\n");

// Step 1: Env vars
console.log("Step 1: Checking environment variables…");
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  fail(
    "Env check",
    `Missing vars: ${missing.join(", ")}`,
    "Not set in .env.local",
    "Copy .env.example → .env.local and fill in each value",
  );
}
ok("All required env vars present");

// Step 2: DB connection
console.log("Step 2: Testing database connection…");
const sql = neon(process.env.DATABASE_URL!);
try {
  await sql`SELECT 1`;
  ok("Neon database connected");
} catch (e) {
  fail(
    "DB connection",
    "Can't connect to Neon",
    String(e),
    "Verify DATABASE_URL format is postgres://user:pass@host/db?sslmode=require and Neon dev branch exists",
  );
}

// Step 3: Drizzle migration
console.log("Step 3: Running Drizzle migration…");
try {
  const { execSync } = await import("child_process");
  execSync("bun db:push", { stdio: "pipe" });
  ok("Schema migrated");
} catch (e) {
  fail(
    "Migration",
    "Schema migration error",
    String(e),
    "Check DATABASE_URL is correct, run `bun db:push` manually and inspect the error",
  );
}

// Step 4: AI Gateway — accepts VERCEL_OIDC_TOKEN (auto on Vercel) or AI_GATEWAY_API_KEY (local)
console.log("Step 4: Testing Vercel AI Gateway…");
if (!process.env.VERCEL_OIDC_TOKEN && !process.env["AI_GATEWAY_API_KEY"]) {
  fail(
    "AI Gateway",
    "No AI Gateway credentials found",
    "Neither VERCEL_OIDC_TOKEN nor AI_GATEWAY_API_KEY is set",
    "Set AI_GATEWAY_API_KEY in .env.local (Vercel Dashboard → AI → Gateways → API Keys)",
  );
}
try {
  const result = await generateText({
    model: gateway("anthropic/claude-haiku-4.5"),
    prompt: "Reply with exactly: ok",
    maxOutputTokens: 5,
  });
  if (!result.text) throw new Error("Empty response");
  ok("Vercel AI Gateway reachable");
} catch (e) {
  fail(
    "AI Gateway",
    "Gateway unreachable or token rejected",
    String(e),
    "Run `vercel env pull .env.local --yes` to refresh your OIDC token, then retry",
  );
}

// Step 5: ProPublica
console.log("Step 5: Testing ProPublica API…");
let sampleOrg: { name: string; ein: string; state: string | null; ntee_code: string | null; income_amount: number | null } | null = null;
try {
  const res = await fetch("https://projects.propublica.org/nonprofits/api/v2/search.json?ntee[]=D20&per_page=1");
  if (!res.ok) throw new Error(`Status ${res.status}`);
  const data = await res.json();
  sampleOrg = data.organizations?.[0] ?? null;
  if (!sampleOrg) throw new Error("Empty results");
  ok(`ProPublica reachable — found: ${sampleOrg.name}`);
} catch (e) {
  console.warn(`  ⚠ ProPublica unavailable (${e}) — skipping sample draft`);
}

// Step 6: Generate sample draft (skipped if ProPublica was unavailable)
console.log("Step 6: Generating sample LLM email draft…");
if (!sampleOrg) {
  console.warn("  ⚠ Skipped — no sample org from ProPublica");
} else {
  const draftSchema = z.object({ subject: z.string(), body: z.string() });
  try {
    const orgCtx = {
      orgName: sampleOrg.name,
      nteeCode: sampleOrg.ntee_code,
      state: sampleOrg.state,
      totalRevenue: sampleOrg.income_amount != null ? String(sampleOrg.income_amount) : null,
    };

    const result = await generateText({
      model: gateway("anthropic/claude-haiku-4.5"),
      output: Output.object({ schema: draftSchema }),
      system: `You are helping Jason draft a personalized cold email to a non-profit about his volunteer match app, VolunteerReady. Tone: warm, specific, low-pressure. Length: 3 short paragraphs. Output JSON: { "subject": "...", "body": "..." }`,
      prompt: JSON.stringify(orgCtx),
    });

    const draft = (result as any).output as { subject: string; body: string };

    console.log(`\n✓ Sample draft generated for ${sampleOrg.name}:\n`);
    console.log(`  Subject: ${draft.subject}`);
    console.log(`\n  ${draft.body.split("\n").join("\n  ")}`);
  } catch (e) {
    console.warn(`  ⚠ Draft generation failed: ${e}`);
  }
}

console.log("\n✓ Run `bun dev` to start the app.\n");
