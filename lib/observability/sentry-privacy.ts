import type { ErrorEvent } from "@sentry/nextjs";
import { safeRoute } from "@/lib/ops-policy";

const errorTypes = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError"]);
// Rebuild an allowlisted event rather than attempting to redact arbitrary nested user data.
export function scrubErrorEvent(event: ErrorEvent): ErrorEvent | null {
  if (event.type) return null;
  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    platform: event.platform === "node" ? "node" : "javascript",
    level: "error",
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    tags: { route: safeRoute(event.transaction ?? "other") },
    exception: { values: (event.exception?.values ?? [{ type: "Error" }]).slice(0, 5).map((item) => ({
      type: errorTypes.has(item.type ?? "") ? item.type : "Error",
      value: "Application error (sensitive details removed)",
      stacktrace: { frames: item.stacktrace?.frames?.slice(-30).map((frame) => ({
        filename: (frame.filename ?? "").match(/(?:app|components|lib)\/[a-zA-Z0-9_./[\]-]+\.(?:[cm]?js|tsx?)$/)?.[0] ?? "application.js",
        lineno: frame.lineno, colno: frame.colno, in_app: frame.in_app,
      })) },
    })) },
  };
}
