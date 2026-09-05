import { describe, expect, it } from "vitest";
import { clientAddress, loginRateLimitKey, normalizeLoginIdentifier } from "./login-rate-limit";

const secret = "test-secret-that-is-definitely-over-32-characters";

describe("login rate limit", () => {
  it("normalizes equivalent login identifiers", () => {
    expect(normalizeLoginIdentifier(" ＴＥＳＴ ")).toBe("test");
    expect(loginRateLimitKey("identity", " ＴＥＳＴ ", secret)).toBe(loginRateLimitKey("identity", "test", secret));
  });

  it("separates scopes and values without exposing their source", () => {
    const addressKey = loginRateLimitKey("address", "203.0.113.10", secret);
    const identityKey = loginRateLimitKey("identity", "test", secret);
    const registrationKey = loginRateLimitKey("registration-address", "203.0.113.10", secret);
    expect(addressKey).toMatch(/^[a-f0-9]{64}$/);
    expect(addressKey).not.toContain("203.0.113.10");
    expect(addressKey).not.toBe(identityKey);
    expect(addressKey).not.toBe(registrationKey);
  });

  it("uses the first trusted proxy address and has a stable fallback", () => {
    expect(clientAddress("203.0.113.10, 10.0.0.1", null)).toBe("203.0.113.10");
    expect(clientAddress(null, "198.51.100.2")).toBe("198.51.100.2");
    expect(clientAddress(null, null)).toBe("unknown");
  });
});
