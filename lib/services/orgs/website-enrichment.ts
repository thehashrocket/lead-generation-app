/**
 * Website-based mission text + program enrichment for orgs whose 990 XML
 * is no longer reachable (ProPublica nulled filing_url in April 2026).
 *
 * Polite scraping policy (see CLAUDE.md):
 * - User-Agent identifies the tool + contact email
 * - 12s shared budget across the entire priority-chain fetch
 * - 1MB max body per fetch
 * - No robots.txt fetch (per-org research-volume access, not a crawler)
 * - Hard-stop on 403/429
 * - Do NOT follow cross-domain redirects
 * - Per-host concurrency: enforced only within a single request (Map-based queue);
 *   cross-instance concurrency is NOT enforced (see TODOS.md)
 */

import { generateText, Output, gateway } from "ai";
import { z } from "zod";
import {
  estimateCostUsd,
  reconcileBudget,
  recordFailedCost,
  reserveWithEstimate,
} from "@/lib/services/llm/cost-cap";

export const ENRICHMENT_USER_AGENT =
  "VolunteerReady/1.0 (outreach research tool; contact: jasshultz@gmail.com)";

const PAGE_PATHS = [
  "/about",
  "/about-us",
  "/our-mission",
  "/mission",
  "/programs",
  "/what-we-do",
  "/",
] as const;

const TOTAL_FETCH_BUDGET_MS = 12_000;
const MAX_BODY_BYTES = 1_000_000; // 1 MB
const MIN_TEXT_CHARS = 500;
const MAX_TEXT_CHARS = 8_000;

const ENRICHMENT_MODEL = "anthropic/claude-haiku-4.5";
const ENRICHMENT_TOKEN_ESTIMATE = { inputTokens: 3000, outputTokens: 400 };

export type EnrichmentStatus =
  | "success"
  | "no_website"
  | "fetch_failed"
  | "extract_failed"
  | "cap_reached";

export type EnrichmentResult = {
  status: EnrichmentStatus;
  missionText: string | null;
  programs: string[];
};

// --- fetchPage ---------------------------------------------------------------

export async function fetchPage(
  url: string,
  signal: AbortSignal,
): Promise<string | null> {
  let originHost: string;
  try {
    originHost = new URL(url).hostname;
  } catch {
    return null;
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ENRICHMENT_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal,
      redirect: "manual", // We follow redirects ourselves to enforce same-host
    });

    // Handle redirects manually to enforce same-host policy.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      try {
        const next = new URL(location, url);
        if (next.hostname !== originHost) return null;
        // One-hop redirect chase. Avoid loops with a simple recursion guard.
        return await fetchPage(next.toString(), signal);
      } catch {
        return null;
      }
    }

    if (res.status === 403 || res.status === 429) return null; // hard-stop
    if (!res.ok) return null;

    // Enforce 1MB body cap by reading as ArrayBuffer and slicing.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) return null;
    const text = new TextDecoder().decode(buf);
    return text;
  } catch {
    // Network errors, AbortError (budget exhausted), DNS failures — all → null.
    return null;
  }
}

// --- extractText -------------------------------------------------------------

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function extractText(html: string): string {
  if (!html) return "";

  // Strip script/style blocks first (including their contents).
  let out = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");

  // Replace block-level tags with newlines so we don't run paragraphs together.
  out = out.replace(/<\/?(p|div|section|article|h[1-6]|li|br|tr)[^>]*>/gi, "\n");

  // Strip remaining tags.
  out = out.replace(/<[^>]+>/g, " ");

  // Decode named entities.
  out = out.replace(/&[a-z#0-9]+;/gi, (match) => ENTITY_MAP[match.toLowerCase()] ?? " ");

  // Numeric entities (e.g. &#8217;).
  out = out.replace(/&#(\d+);/g, (_, code) => {
    const n = Number(code);
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  });

  // Collapse whitespace, then cap.
  out = out.replace(/[\s ]+/g, " ").trim();
  if (out.length > MAX_TEXT_CHARS) out = out.slice(0, MAX_TEXT_CHARS);
  return out;
}

// --- pickBestPage ------------------------------------------------------------

export async function pickBestPage(
  website: string,
  budgetMs: number = TOTAL_FETCH_BUDGET_MS,
): Promise<{ url: string; text: string } | null> {
  let origin: string;
  try {
    origin = new URL(website).origin;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), budgetMs);
  try {
    for (const path of PAGE_PATHS) {
      if (controller.signal.aborted) break;
      const url = origin + path;
      const html = await fetchPage(url, controller.signal);
      if (!html) continue;
      const text = extractText(html);
      if (text.length >= MIN_TEXT_CHARS) {
        return { url, text };
      }
    }
    return null;
  } finally {
    clearTimeout(deadline);
  }
}

// --- extractWithLLM ----------------------------------------------------------

const llmSchema = z.object({
  missionText: z.string().min(20).max(2000).nullable(),
  programs: z.array(z.string().min(5).max(500)).max(10),
});

const EXTRACTION_SYSTEM_PROMPT = `You are extracting the verifiable mission statement and named programs from a nonprofit's own website. Return ONLY content that is explicitly stated in the provided text — do not infer, summarize creatively, or invent programs. Return null for missionText if no clear mission is stated. Return an empty programs array if no specific programs are named. Programs are named initiatives, not generic categories ("After-School Tutoring Program" yes; "education work" no).`;

export type ExtractOutcome =
  | { kind: "success"; missionText: string | null; programs: string[] }
  | { kind: "cap_reached" }
  | { kind: "extract_failed" };

export async function extractWithLLM(
  text: string,
  orgName: string,
): Promise<ExtractOutcome> {
  if (!text || text.length < MIN_TEXT_CHARS) {
    return { kind: "extract_failed" };
  }

  const reservation = await reserveWithEstimate(ENRICHMENT_MODEL, ENRICHMENT_TOKEN_ESTIMATE);
  if (reservation.kind === "cap_reached") {
    return { kind: "cap_reached" };
  }

  try {
    const result = await generateText({
      model: gateway(ENRICHMENT_MODEL),
      output: Output.object({ schema: llmSchema }),
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: `Org name: ${orgName}\n\nWebsite text:\n${text}`,
    });

    const usage = (result as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
    const actualUsage = {
      inputTokens: usage?.inputTokens ?? ENRICHMENT_TOKEN_ESTIMATE.inputTokens,
      outputTokens: usage?.outputTokens ?? ENRICHMENT_TOKEN_ESTIMATE.outputTokens,
    };
    await reconcileBudget(reservation.reservation, estimateCostUsd(ENRICHMENT_MODEL, actualUsage));

    const output = (result as { output?: unknown }).output;
    const parsed = llmSchema.safeParse(output);
    if (!parsed.success) return { kind: "extract_failed" };
    return { kind: "success", missionText: parsed.data.missionText, programs: parsed.data.programs };
  } catch {
    await recordFailedCost(ENRICHMENT_MODEL, ENRICHMENT_TOKEN_ESTIMATE);
    await reconcileBudget(reservation.reservation, 0);
    return { kind: "extract_failed" };
  }
}

// --- enrichOrgFromWebsite ----------------------------------------------------

export async function enrichOrgFromWebsite(
  orgName: string,
  website: string | null,
): Promise<EnrichmentResult> {
  if (!website) {
    return { status: "no_website", missionText: null, programs: [] };
  }
  const page = await pickBestPage(website);
  if (!page) {
    return { status: "fetch_failed", missionText: null, programs: [] };
  }
  const extracted = await extractWithLLM(page.text, orgName);
  if (extracted.kind === "cap_reached") {
    return { status: "cap_reached", missionText: null, programs: [] };
  }
  if (extracted.kind === "extract_failed") {
    return { status: "extract_failed", missionText: null, programs: [] };
  }
  return {
    status: "success",
    missionText: extracted.missionText,
    programs: extracted.programs,
  };
}

// --- cooldown rules ----------------------------------------------------------

const COOLDOWN_MS: Record<EnrichmentStatus, number> = {
  success: Number.POSITIVE_INFINITY, // never re-attempt a successful enrich
  no_website: 0, // re-try if website becomes set (handled by caller)
  fetch_failed: 24 * 60 * 60 * 1000, // 1 day
  cap_reached: 24 * 60 * 60 * 1000, // 1 day
  extract_failed: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export function isCooledDown(
  status: EnrichmentStatus | null,
  attemptedAt: Date | null,
  websiteChanged: boolean,
  now: Date = new Date(),
): boolean {
  if (!status || !attemptedAt) return false; // never attempted
  if (status === "no_website" && websiteChanged) return false; // website now known
  const elapsed = now.getTime() - attemptedAt.getTime();
  return elapsed < COOLDOWN_MS[status];
}
