import { db } from "@/lib/db";

type DatabaseClient = ReturnType<typeof db>;

type AuditEntry = {
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string | number;
};

const auditRow = ({ actorId, action, targetType, targetId }: AuditEntry) => ({
  ...(actorId ? { actor_id: actorId } : {}),
  action,
  target_type: targetType,
  ...(targetId !== undefined ? { target_id: targetId } : {}),
});

export async function writeAuditLog(client: DatabaseClient, entry: AuditEntry) {
  const { error } = await client.from("audit_logs").insert(auditRow(entry));
  if (error) {
    console.error("Audit log write failed", {
      action: entry.action,
      targetType: entry.targetType,
      code: error.code,
      message: error.message,
    });
  }
}

export async function writeAuditLogs(client: DatabaseClient, entries: AuditEntry[]) {
  const { error } = await client.from("audit_logs").insert(entries.map(auditRow));
  if (error) {
    console.error("Audit log write failed", {
      actions: [...new Set(entries.map((entry) => entry.action))],
      targetTypes: [...new Set(entries.map((entry) => entry.targetType))],
      count: entries.length,
      code: error.code,
      message: error.message,
    });
  }
}
