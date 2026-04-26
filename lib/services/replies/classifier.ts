import type { replyClassificationEnum } from "@/lib/db/schema";

type Classification = (typeof replyClassificationEnum.enumValues)[number];

type EmailHeaders = {
  "auto-submitted"?: string;
  "x-autoreply"?: string;
  "x-autorespond"?: string;
  precedence?: string;
  "content-type"?: string;
  from?: string;
};

export function classifyReply(headers: EmailHeaders, bodyText?: string): Classification {
  const autoSubmitted = headers["auto-submitted"] ?? "";
  const xAutoreply = headers["x-autoreply"] ?? headers["x-autorespond"] ?? "";
  const precedence = headers.precedence ?? "";
  const contentType = headers["content-type"] ?? "";

  if (autoSubmitted && autoSubmitted !== "no") return "ooo";
  if (xAutoreply) return "ooo";
  if (precedence === "bulk" || precedence === "junk" || precedence === "list") return "bulk";
  if (contentType.includes("multipart/report")) return "dsn";

  if (bodyText) {
    const lower = bodyText.toLowerCase();
    const oooKeywords = [
      "out of office",
      "out-of-office",
      "automatic reply",
      "i am away",
      "i'm away",
      "on vacation",
      "on leave",
      "will be back",
    ];
    if (oooKeywords.some((kw) => lower.includes(kw))) return "ooo";

    const autokeywords = ["noreply", "no-reply", "do not reply", "donotreply", "automated message"];
    if (autokeywords.some((kw) => lower.includes(kw))) return "autoresponder";
  }

  return "human";
}
