import { describe, expect, it, vi } from "vitest";
import { runMonitor, seal, unseal } from "./monitor.mjs";

const config = { url: "https://fortylove.example", secret: "secret", apiKey: "test", sender: "sender@example.com" };
const settings = { email: "ops@example.com", enabled: true, revision: "1" };
const provider = (healthy, nextSettings = settings, sendOk = true) => vi.fn(async (url) => {
  if (String(url).includes("brevo")) return new Response(null, { status: sendOk ? 201 : 503 });
  if (!healthy) throw new Error("offline");
  return Response.json(String(url).includes("monitor-config") ? nextSettings : { status: "ok", database: "ok" });
});

describe("independent health monitor", () => {
  it("encrypts recipient and state; tampering or wrong keys fail closed", () => {
    const encrypted = seal({ settings }, "a".repeat(32));
    expect(encrypted.toString()).not.toContain(settings.email);
    expect(unseal(encrypted, "a".repeat(32))).toEqual({ settings });
    expect(() => unseal(encrypted, "b".repeat(32))).toThrow();
    encrypted[30] ^= 1; expect(() => unseal(encrypted, "a".repeat(32))).toThrow();
  });
  it("notifies on two failures using cached recipient, deduplicates, then confirms recovery", async () => {
    const first = await runMonitor({ config, previous: { settings }, fetcher: provider(false), now: 1 });
    expect(first.summary.delivery).toBe("none");
    const fetcher = provider(false);
    const second = await runMonitor({ config, previous: first.state, fetcher, now: 2 });
    expect(second.summary.delivery).toBe("outage");
    expect(JSON.parse(fetcher.mock.calls.find(([url]) => String(url).includes("brevo"))[1].body).to[0].email).toBe(settings.email);
    const third = await runMonitor({ config, previous: second.state, fetcher: provider(false), now: 3 });
    expect(third.summary.delivery).toBe("none");
    const fourth = await runMonitor({ config, previous: third.state, fetcher: provider(true), now: 4 });
    expect(fourth.summary.delivery).toBe("none");
    const fifth = await runMonitor({ config, previous: fourth.state, fetcher: provider(true), now: 5 });
    expect(fifth.summary.delivery).toBe("recovery");
  });
  it("does not mark failed email as delivered; retries next run", async () => {
    const first = await runMonitor({ config, previous: { settings, failures: 1 }, fetcher: provider(false, settings, false) });
    expect(first.failed).toBe(true); expect(first.state.incident).not.toBe(true);
    const retry = await runMonitor({ config, previous: first.state, fetcher: provider(false) });
    expect(retry.summary.delivery).toBe("outage");
  });
  it("applies recipient changes and disabling without repository edits", async () => {
    const updated = { ...settings, email: "new@example.com", revision: "2", enabled: false };
    const result = await runMonitor({ config, previous: { settings, incident: true }, fetcher: provider(true, updated) });
    expect(result.state.settings).toEqual(updated); expect(result.state.incident).toBe(false);
  });
  it("fails visibly if no recipient configuration has ever been retrieved", async () => {
    expect((await runMonitor({ config, fetcher: provider(false) })).failed).toBe(true);
  });
});
