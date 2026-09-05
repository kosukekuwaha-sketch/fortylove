import { describe, expect, it, vi } from "vitest";
import { writeAuditLog, writeAuditLogs } from "@/lib/server/audit-log";

function auditClient(error: null | { code: string; message: string } = null) {
  const insert = vi.fn().mockResolvedValue({ error });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

describe("audit log helpers", () => {
  it("maps one audit entry to the database shape", async () => {
    const { client, from, insert } = auditClient();

    await writeAuditLog(client, {
      actorId: "actor-id",
      action: "event.create",
      targetType: "event",
      targetId: "event-id",
    });

    expect(from).toHaveBeenCalledWith("audit_logs");
    expect(insert).toHaveBeenCalledWith({
      actor_id: "actor-id",
      action: "event.create",
      target_type: "event",
      target_id: "event-id",
    });
  });

  it("writes multiple entries in one insert", async () => {
    const { client, insert } = auditClient();

    await writeAuditLogs(client, [
      { action: "user.role.update", targetType: "user", targetId: "user-1" },
      { action: "user.role.update", targetType: "user", targetId: "user-2" },
    ]);

    expect(insert).toHaveBeenCalledWith([
      { action: "user.role.update", target_type: "user", target_id: "user-1" },
      { action: "user.role.update", target_type: "user", target_id: "user-2" },
    ]);
  });

  it("reports an audit failure without failing the action", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = auditClient({ code: "42501", message: "denied" });

    await expect(writeAuditLog(client, {
      action: "event.delete",
      targetType: "event",
    })).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledWith("Audit log write failed", expect.objectContaining({
      action: "event.delete",
      code: "42501",
    }));
    errorSpy.mockRestore();
  });
});
