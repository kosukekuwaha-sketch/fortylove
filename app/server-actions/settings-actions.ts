"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/server/action-context";
import { parseActionInput } from "@/lib/server/action-input";
import { writeAuditLog } from "@/lib/server/audit-log";
import { formText } from "@/lib/server/form-data";
import { recruitingStatusInputSchema } from "@/lib/server-action-validation";
import { notificationSettingsSchema } from "@/lib/ops-policy";
import { readNotificationSettings, sendOperationsEmail } from "@/lib/server/ops-notifications";

export async function updateRecruitingStatus(formData: FormData) {
  const user = await requireSuperAdmin();
  const { recruiting_open: recruitingOpen } = parseActionInput(
    recruitingStatusInputSchema,
    { recruiting_open: formText(formData, "recruiting_open") },
    "/admin/settings?error=validation",
  );
  const client = db();
  const { error } = await client.from("app_settings").update({ recruiting_open: recruitingOpen }).eq("id", 1);
  if (error) redirect("/admin/settings?error=save");

  await writeAuditLog(client, {
    actorId: user.id,
    action: recruitingOpen ? "recruiting.open" : "recruiting.close",
    targetType: "app_settings",
  });
  redirect(`/admin/settings?updated=${recruitingOpen ? "open" : "closed"}`);
}

export async function updateNotificationSettings(formData: FormData) {
  const user = await requireSuperAdmin();
  const input = parseActionInput(notificationSettingsSchema, {
    email: formText(formData, "email"), health_enabled: formData.get("health_enabled") === "on", errors_enabled: formData.get("errors_enabled") === "on",
  }, "/admin/settings?error=notification-validation");
  const { error } = await db().rpc("update_ops_notification_settings", { p_actor: user.id, p_email: input.email || null, p_health: input.health_enabled, p_errors: input.errors_enabled });
  if (error) redirect("/admin/settings?error=notification-save");
}

export async function testNotificationDelivery() {
  const user = await requireSuperAdmin();
  const client = db();
  const { data: allowed, error } = await client.rpc("consume_request_rate_limit", { p_key_hash: `ops-test:${user.id}`, p_window_seconds: 60, p_max_requests: 1, p_block_seconds: 60 });
  if (error || !allowed) redirect("/admin/settings?error=notification-rate");
  try {
    const settings = await readNotificationSettings();
    if (!settings.email) throw new Error("No recipient");
    await sendOperationsEmail(settings.email, "【Fortylove】監視通知の送信テスト", "最高管理者の操作により送信されたテストメールです。現在保存されている通知先へ届いています。");
    await writeAuditLog(client, { actorId: user.id, action: "ops.notification.test", targetType: "ops_settings" });
  } catch { redirect("/admin/settings?error=notification-test"); }
  redirect("/admin/settings?updated=notification-test");
}
