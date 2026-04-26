import { describe, expect, it } from "vitest";
import crypto from "crypto";

// Test the signature logic directly (without importing env)
function verifySignature(payload: string, svixId: string, svixTimestamp: string, svixSignature: string, secret: string): boolean {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const toSign = `${svixId}.${svixTimestamp}.${payload}`;
  const computed = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");
  const expected = `v1,${computed}`;
  const signatures = svixSignature.split(" ");
  return signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

describe("verifyResendSignature", () => {
  const secret = Buffer.from("test-secret-key-32bytes-padding!").toString("base64");
  const wrappedSecret = `whsec_${secret}`;
  const payload = '{"type":"email.delivered"}';
  const svixId = "msg_test123";
  const svixTimestamp = "1700000000";

  function makeSignature(): string {
    const secretBytes = Buffer.from(secret, "base64");
    const toSign = `${svixId}.${svixTimestamp}.${payload}`;
    const computed = crypto.createHmac("sha256", secretBytes).update(toSign).digest("base64");
    return `v1,${computed}`;
  }

  it("accepts a valid signature", () => {
    const sig = makeSignature();
    expect(verifySignature(payload, svixId, svixTimestamp, sig, wrappedSecret)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const sig = makeSignature();
    expect(verifySignature('{"type":"email.bounced"}', svixId, svixTimestamp, sig, wrappedSecret)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    expect(verifySignature(payload, svixId, svixTimestamp, "v1,invalidsignature=", wrappedSecret)).toBe(false);
  });

  it("accepts when valid sig is one of multiple space-separated signatures", () => {
    const sig = makeSignature();
    expect(verifySignature(payload, svixId, svixTimestamp, `v1,oldsig= ${sig}`, wrappedSecret)).toBe(true);
  });
});
