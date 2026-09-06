import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubErrorEvent } from "./sentry-privacy";
import { notificationSettingsSchema, safeRoute } from "@/lib/ops-policy";

describe("observability privacy and settings", () => {
  it("does not forward user, cookies, headers, form body, messages, breadcrumbs or stack context", () => {
    const secret = "PRIVATE_PASSWORD_AND_CHAT_TEXT";
    const event: ErrorEvent = {
      type: undefined, event_id: "f".repeat(32), user: { email: secret },
      request: { headers: { cookie: secret }, data: secret, url: `https://example.com/home?name=${secret}` },
      extra: { secret }, contexts: { arbitrary: { secret } }, breadcrumbs: [{ message: secret }],
      message: secret, transaction: "/home?name=secret",
      exception: { values: [{ type: "TypeError", value: secret, stacktrace: { frames: [{ filename: "/app/home/page.js", lineno: 42, vars: { secret }, context_line: secret }] } }] },
    };
    const scrubbed = scrubErrorEvent(event);
    expect(JSON.stringify(scrubbed)).not.toContain(secret);
    expect(scrubbed?.tags?.route).toBe("/home");
    expect(scrubbed?.exception?.values?.[0].stacktrace?.frames?.[0].lineno).toBe(42);
    expect(scrubbed?.request).toBeUndefined(); expect(scrubbed?.user).toBeUndefined();
  });
  it("requires an address for enabled notifications and rejects header injection", () => {
    expect(notificationSettingsSchema.safeParse({ email: "", health_enabled: true, errors_enabled: false }).success).toBe(false);
    expect(notificationSettingsSchema.safeParse({ email: "ops@example.com\r\nBcc:other@example.com", health_enabled: true, errors_enabled: true }).success).toBe(false);
    expect(notificationSettingsSchema.safeParse({ email: "ops@example.com", health_enabled: true, errors_enabled: true }).success).toBe(true);
    expect(safeRoute("/users/private-name")).toBe("other");
  });
});
