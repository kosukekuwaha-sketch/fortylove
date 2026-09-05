"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/server/action-context";
import { parseActionInput } from "@/lib/server/action-input";
import { writeAuditLog } from "@/lib/server/audit-log";
import { formText } from "@/lib/server/form-data";
import { recruitingStatusInputSchema } from "@/lib/server-action-validation";

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
