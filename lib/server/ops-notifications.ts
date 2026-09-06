import { db } from "@/lib/db";
import { notificationSettingsSchema } from "@/lib/ops-policy";

export async function readNotificationSettings() {
  const { data, error } = await db().from("ops_notification_settings").select("email,health_enabled,errors_enabled,updated_at").eq("id", 1).single();
  if (error || !data) throw new Error("Notification settings unavailable");
  return { ...notificationSettingsSchema.parse({ ...data, email: data.email ?? "" }), updated_at: data.updated_at as string };
}

// Provider errors and bodies are intentionally not logged: they can contain addresses or credentials.
export async function sendOperationsEmail(recipient: string, subject: string, textContent: string) {
  const apiKey = process.env.BREVO_API_KEY, sender = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !sender) throw new Error("Notification provider not configured");
  const result = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ sender: { email: sender, name: process.env.BREVO_SENDER_NAME || "Fortylove" }, to: [{ email: recipient }], subject, textContent }),
  });
  if (!result.ok) throw new Error("Notification delivery failed");
}

export async function deliverErrorAlert(key: string) {
  const settings = await readNotificationSettings();
  if (!settings.errors_enabled || !settings.email) return "disabled";
  const client = db();
  const { data: lease, error } = await client.rpc("claim_ops_delivery", { p_key: key });
  if (error) throw new Error("Notification claim failed");
  if (!lease) return "duplicate";
  try {
    await sendOperationsEmail(settings.email, "【Fortylove】アプリケーションエラーを検出しました", "Sentryで新しいエラーが検出されました。SentryのFortyloveプロジェクトで詳細をご確認ください。\nこのメールには利用者の入力内容・個人情報を含めていません。");
    const { error: finishError } = await client.rpc("finish_ops_delivery", { p_key: key, p_lease: lease, p_sent: true });
    if (finishError) throw new Error("Notification recording failed");
    return "sent";
  } catch {
    await client.rpc("finish_ops_delivery", { p_key: key, p_lease: lease, p_sent: false });
    throw new Error("Notification delivery failed");
  }
}
