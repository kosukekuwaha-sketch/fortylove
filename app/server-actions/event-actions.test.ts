import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  db: vi.fn(),
}));

vi.mock("@/lib/server/action-context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { createEvent } from "./event-actions";

describe("admin event Server Action authorization", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset();
    mocks.db.mockReset();
  });

  it("stops a member request at the authorization boundary before validation or database access", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN_MEMBER"));

    await expect(createEvent(new FormData())).rejects.toThrow("FORBIDDEN_MEMBER");
    expect(mocks.db).not.toHaveBeenCalled();
  });
});
