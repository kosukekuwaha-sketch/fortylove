import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ settings: vi.fn(), rpc: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: mocks.settings }) }) }), rpc: mocks.rpc }) }));
import { deliverErrorAlert } from "./ops-notifications";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("BREVO_API_KEY", "test-key"); vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.com"); vi.stubGlobal("fetch", mocks.fetch);
  mocks.settings.mockResolvedValue({ data: { email: "ops@example.com", errors_enabled: true, health_enabled: false, updated_at: "2026-09-06" }, error: null });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_ops_delivery" ? "lease" : null, error: null }));
  mocks.fetch.mockResolvedValue({ ok: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("sends to the latest saved recipient and marks the lease sent", async () => {
  expect(await deliverErrorAlert("sentry:event")).toBe("sent");
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).to).toEqual([{ email: "ops@example.com" }]);
  expect(mocks.rpc).toHaveBeenLastCalledWith("finish_ops_delivery", { p_key: "sentry:event", p_lease: "lease", p_sent: true });
});
it("does not send a duplicate or disabled notification", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: null });
  expect(await deliverErrorAlert("sentry:event")).toBe("duplicate");
  mocks.settings.mockResolvedValue({ data: { email: "", errors_enabled: false, health_enabled: false }, error: null });
  expect(await deliverErrorAlert("sentry:event")).toBe("disabled"); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("releases a failed delivery for retry without exposing the provider body", async () => {
  mocks.fetch.mockRejectedValue(new Error("private provider response"));
  await expect(deliverErrorAlert("sentry:event")).rejects.toThrow("Notification delivery failed");
  expect(mocks.rpc).toHaveBeenLastCalledWith("finish_ops_delivery", { p_key: "sentry:event", p_lease: "lease", p_sent: false });
});
