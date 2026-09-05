"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/server/action-context";
import { formText } from "@/lib/server/form-data";
import { recruitingStatusInputSchema } from "@/lib/server-action-validation";

export async function updateRecruitingStatus(formData: FormData) {
  const user = await requireSuperAdmin();
  const parsed = recruitingStatusInputSchema.safeParse({ recruiting_open: formText(formData, "recruiting_open") });
  if (!parsed.success) redirect("/admin/settings?error=validation");
  const recruitingOpen = parsed.data.recruiting_open;
  const client = db();
  const { error } = await client.from("app_settings").update({ recruiting_open: recruitingOpen }).eq("id", 1);
  if (error) redirect("/admin/settings?error=save");

  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: recruitingOpen ? "recruiting.open" : "recruiting.close",
    target_type: "app_settings",
  });
  redirect(`/admin/settings?updated=${recruitingOpen ? "open" : "closed"}`);
}
