import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deliver: vi.fn() }));
vi.mock("@/lib/server/ops-notifications", () => ({ deliverErrorAlert: mocks.deliver }));
import { POST } from "./route";
beforeEach(() => { vi.stubEnv("SENTRY_WEBHOOK_SECRET", "test-webhook-secret"); vi.stubEnv("SENTRY_PROJECT_ID", "123"); mocks.deliver.mockReset().mockResolvedValue("sent"); });
afterEach(() => vi.unstubAllEnvs());
const raw = JSON.stringify({ action: "triggered", data: { event: { event_id: "a".repeat(32), project: 123, message: "private user text" } } });
function request(body = raw, signature = createHmac("sha256", "test-webhook-secret").update(body).digest("hex")) {
  return new Request("https://example.test/api/ops/sentry-webhook", { method: "POST", headers: { "sentry-hook-signature": signature, "sentry-hook-resource": "issue_alert" }, body });
}
it("rejects unsigned and tampered payloads before notification", async () => {
  expect((await POST(request(raw, ""))).status).toBe(401);
  expect((await POST(request(raw + " ", createHmac("sha256", "test-webhook-secret").update(raw).digest("hex")))).status).toBe(401);
  expect(mocks.deliver).not.toHaveBeenCalled();
});
it("passes only an opaque event identifier to delivery", async () => {
  expect((await POST(request())).status).toBe(200);
  expect(mocks.deliver).toHaveBeenCalledWith(`sentry:${"a".repeat(32)}`);
});
it("rejects unrelated projects and returns retryable failure on provider error", async () => {
  vi.stubEnv("SENTRY_PROJECT_ID", "456"); expect((await POST(request())).status).toBe(403);
  vi.stubEnv("SENTRY_PROJECT_ID", "123"); mocks.deliver.mockRejectedValue(new Error("secret provider body"));
  const result = await POST(request()); expect(result.status).toBe(503); expect(await result.text()).not.toContain("secret provider");
});
it("bounds streamed body even without content-length", async () => {
  expect((await POST(request("x".repeat(262145)))).status).toBe(413);
  expect(mocks.deliver).not.toHaveBeenCalled();
});
