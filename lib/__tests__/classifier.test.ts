import { describe, expect, it } from "vitest";
import { classifyReply } from "@/lib/services/replies/classifier";

describe("classifyReply", () => {
  it("classifies human reply with no special headers", () => {
    expect(classifyReply({}, "Thanks for reaching out! Would love to chat.")).toBe("human");
  });

  it("classifies auto-submitted OOO", () => {
    expect(classifyReply({ "auto-submitted": "auto-replied" })).toBe("ooo");
  });

  it("classifies x-autoreply header", () => {
    expect(classifyReply({ "x-autoreply": "yes" })).toBe("ooo");
  });

  it("classifies bulk precedence", () => {
    expect(classifyReply({ precedence: "bulk" })).toBe("bulk");
  });

  it("classifies DSN by content-type", () => {
    expect(classifyReply({ "content-type": "multipart/report; report-type=delivery-status" })).toBe("dsn");
  });

  it("classifies OOO from body text", () => {
    expect(classifyReply({}, "I am out of office until Monday.")).toBe("ooo");
  });

  it("classifies autoresponder from body text", () => {
    expect(classifyReply({}, "This is an automated message from our system.")).toBe("autoresponder");
  });

  it("returns human for normal auto-submitted=no", () => {
    expect(classifyReply({ "auto-submitted": "no" }, "Sounds great!")).toBe("human");
  });
});
