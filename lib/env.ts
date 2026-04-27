import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    APP_SECRET: z.string().min(16),
    APP_PASSWORD: z.string().min(1),
    DATABASE_URL: z.string().url(),
    // Optional: OIDC auto-auth is used on Vercel deployments.
    // Locally: run `vercel env pull .env.local` (provides VERCEL_OIDC_TOKEN for ~12h)
    // OR set AI_GATEWAY_API_KEY manually as a fallback.
    AI_GATEWAY_API_KEY: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1),
    RESEND_WEBHOOK_SECRET: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().email().default("jason@volunteerready.org"),
    RESEND_REPLY_TO_DOMAIN: z.string().default("replies.volunteerready.org"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  runtimeEnv: {
    APP_SECRET: process.env.APP_SECRET,
    APP_PASSWORD: process.env.APP_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    RESEND_REPLY_TO_DOMAIN: process.env.RESEND_REPLY_TO_DOMAIN,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
