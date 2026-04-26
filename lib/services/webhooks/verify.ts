import { env } from "@/lib/env";
import crypto from "crypto";

export function verifyResendSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
): boolean {
  const secret = env.RESEND_WEBHOOK_SECRET;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");

  const toSign = `${svixId}.${svixTimestamp}.${payload}`;
  const computed = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");
  const expected = `v1,${computed}`;

  const signatures = svixSignature.split(" ");
  return signatures.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return crypto.timingSafeEqual(aBuf, bBuf);
}
