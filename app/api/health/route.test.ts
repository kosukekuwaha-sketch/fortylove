import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ abort: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ from: () => ({ select: () => ({ eq: () => ({ abortSignal: mocks.abort }) }) }) }) }));
import { GET } from "./route";
const ready = () => GET(new Request("https://example.com/api/health", { headers: { authorization: "Bearer quality-test" } }));
beforeEach(() => { vi.stubEnv("MONITOR_SECRET", "quality-test"); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());
it("public liveness and invalid credentials never query the database", async () => {
  const result = await GET(new Request("https://example.com/api/health"));
  expect(await result.json()).toEqual({ status: "ok" });
  expect((await GET(new Request("https://example.com/api/health", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
  expect(mocks.abort).not.toHaveBeenCalled();
});
it("reports healthy only when the singleton setting exists", async () => {
  mocks.abort.mockResolvedValue({ data: [{ id: 1 }], error: null }); expect((await ready()).status).toBe(200);
  mocks.abort.mockResolvedValue({ data: [], error: null }); expect((await ready()).status).toBe(503);
});
it("returns controlled degradation without leaking failures", async () => {
  mocks.abort.mockRejectedValue(new Error("secret database hostname"));
  const result = await ready(); expect(result.status).toBe(503); expect(await result.text()).not.toContain("secret");
  expect(mocks.abort.mock.lastCall?.[0]).toBeInstanceOf(AbortSignal);
});
