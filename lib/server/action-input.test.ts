import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { parseActionInput } from "./action-input";

describe("parseActionInput", () => {
  const schema = z.object({ count: z.coerce.number().int().positive() });

  it("returns normalized Zod output", () => {
    expect(parseActionInput(schema, { count: "2" }, "/error")).toEqual({ count: 2 });
  });

  it("redirects invalid input to the action-specific error path", () => {
    expect(() => parseActionInput(schema, { count: "0" }, "/error"))
      .toThrow("REDIRECT:/error");
  });
});
