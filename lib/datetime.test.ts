import { describe, expect, it } from "vitest";
import { eachTokyoDateKey, tokyoDateKey, tokyoLocalToIso, toTokyoDatetimeLocal } from "./datetime";

describe("Tokyo date handling", () => {
  it("round-trips a local datetime without shifting the displayed time", () => {
    const iso = tokyoLocalToIso("2026-08-24T18:30");
    expect(iso).toBe("2026-08-24T09:30:00.000Z");
    expect(toTokyoDatetimeLocal(iso!)).toBe("2026-08-24T18:30");
  });

  it("uses the Tokyo calendar day around UTC midnight", () => {
    expect(tokyoDateKey("2026-08-24T16:00:00.000Z")).toBe("2026-08-25");
  });

  it("expands multi-day events into every covered date", () => {
    expect(eachTokyoDateKey("2026-08-24T14:00:00.000Z", "2026-08-26T01:00:00.000Z"))
      .toEqual(["2026-08-24", "2026-08-25", "2026-08-26"]);
  });
});
