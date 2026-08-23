import { describe, expect, it } from "vitest";
import { isValidNewPassword, MIN_PASSWORD_LENGTH } from "./password-policy";

describe("new password policy", () => {
  it("requires at least eight characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isValidNewPassword("1234567")).toBe(false);
    expect(isValidNewPassword("12345678")).toBe(true);
  });

  it("counts Unicode characters consistently", () => {
    expect(isValidNewPassword("テニス部12ab")).toBe(true);
  });
});
