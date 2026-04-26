import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  redact: [
    "*.body",
    "*.html",
    "*.text",
    "*.snippet",
    "*.bodyText",
    "*.bodyHtml",
    "req.headers.authorization",
    "req.headers.cookie",
  ],
  formatters: {
    level: (label) => ({ level: label }),
  },
});
