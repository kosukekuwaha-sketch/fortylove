"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { uuidSchema } from "@/lib/input-validation";
import { isValidNewPassword } from "@/lib/password-policy";
import { requireAdmin, requireSuperAdmin } from "@/lib/server/action-context";
import { removeAvatarFiles } from "@/lib/server/avatar-service";
import { formText } from "@/lib/server/form-data";
import { archiveAndDeleteMember } from "@/lib/server/member-account-service";

const isValidTemporaryPassword = (value: string) => isValidNewPassword(value) && value.length <= 256;

export async function updateUserRole(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userId = formText(formData, "user_id");
  const role = formText(formData, "role");
  if (userId === actor.id || !uuidSchema.safeParse(userId).success || !["member", "admin", "super_admin"].includes(role)) return;

  const client = db();
  const { data: updated, error } = await client.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error || !updated) redirect("/admin/admins?error=role-update");
  await client.from("audit_logs").insert({ actor_id: actor.id, action: "user.role.update", target_type: "user", target_id: userId });
  redirect("/admin/admins?role_updated=1");
}

export async function updateUsersRole(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userIds = formData.getAll("user_ids").map(String)
    .filter((id) => id !== actor.id && uuidSchema.safeParse(id).success);
  const role = formText(formData, "role");
  if (!userIds.length || !["admin", "super_admin"].includes(role)) redirect("/admin/admins?error=selection");

  const client = db();
  const updates = await Promise.all(userIds.map((userId) =>
    client.rpc("set_member_role", { p_user_id: userId, p_role: role })));
  if (updates.some((result) => result.error || result.data !== true)) redirect("/admin/admins?error=role-update");
  await client.from("audit_logs").insert(userIds.map((targetId) => ({
    actor_id: actor.id, action: "user.role.update", target_type: "user", target_id: targetId,
  })));
  redirect(`/admin/admins?role_updated=${userIds.length}`);
}

export async function resetUserPassword(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userId = formText(formData, "user_id");
  const temporaryPassword = formText(formData, "temporary_password");
  if (!uuidSchema.safeParse(userId).success || !isValidTemporaryPassword(temporaryPassword)) redirect("/admin?error=password");

  const client = db();
  const { data: updated, error } = await client.rpc("replace_user_password", {
    p_user_id: userId,
    p_password_hash: await bcrypt.hash(temporaryPassword, 12),
  });
  if (error || !updated) redirect("/admin?error=password-update");
  await client.from("audit_logs").insert({ actor_id: actor.id, action: "user.password.reset", target_type: "user", target_id: userId });
  redirect("/admin?password_reset=1");
}

export async function registerJoinedMember(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formText(formData, "user_id");
  if (!uuidSchema.safeParse(userId).success) redirect("/admin/members?error=membership-register");

  const client = db();
  const { error } = await client.from("membership_applications").upsert(
    { user_id: userId, status: "approved", applied_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) redirect("/admin/members?error=membership-register");
  await client.from("audit_logs").insert({ actor_id: actor.id, action: "membership.register.direct", target_type: "user", target_id: userId });
  redirect("/admin/members?membership_registered=1");
}

export async function deleteMemberAccount(formData: FormData) {
  const actor = await requireAdmin();
  const userId = formText(formData, "user_id");
  if (!uuidSchema.safeParse(userId).success) redirect("/admin/members?error=delete");
  if (!await archiveAndDeleteMember(userId, actor.id, "admin")) redirect("/admin/members?error=delete");
  await removeAvatarFiles(userId);
  redirect("/admin/members?deleted=1");
}

export async function deleteReceptionAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userId = formText(formData, "user_id");
  if (!uuidSchema.safeParse(userId).success) redirect("/admin?error=delete");
  if (!await archiveAndDeleteMember(userId, actor.id, "admin")) redirect("/admin?error=delete");
  await removeAvatarFiles(userId);
  redirect("/admin?deleted=1");
}

export async function restoreWithdrawalAccount(formData: FormData) {
  const actor = await requireSuperAdmin();
  const withdrawalId = formText(formData, "withdrawal_id");
  const temporaryPassword = formText(formData, "temporary_password");
  if (!/^\d+$/.test(withdrawalId) || !isValidTemporaryPassword(temporaryPassword)) redirect("/admin/withdrawals?error=password");

  const client = db();
  const { data: archived, error: archiveError } = await client.from("membership_withdrawals")
    .select("*").eq("id", withdrawalId).single();
  if (archiveError || !archived) redirect("/admin/withdrawals?error=restore");
  const { error: restoreError } = await client.from("users").insert({
    id: archived.former_user_id,
    name: archived.name,
    password_hash: await bcrypt.hash(temporaryPassword, 12),
    university: archived.university,
    faculty: archived.faculty,
    department: archived.department,
    grade: archived.grade ?? 1,
    instagram_id: archived.instagram_id,
    line_display_name: archived.line_display_name,
    tennis_experience: archived.tennis_experience,
    has_racket: archived.has_racket,
    role: "member",
  });
  if (restoreError) redirect("/admin/withdrawals?error=restore");
  const { error: deleteError } = await client.from("membership_withdrawals").delete().eq("id", withdrawalId);
  if (deleteError) {
    await client.from("users").delete().eq("id", archived.former_user_id);
    redirect("/admin/withdrawals?error=restore");
  }
  await client.from("audit_logs").insert({
    actor_id: actor.id, action: "account.restore.withdrawal", target_type: "user", target_id: archived.former_user_id,
  });
  redirect("/admin/withdrawals?restored=1");
}

export async function deleteMemberAccounts(formData: FormData) {
  const actor = await requireSuperAdmin();
  const userIds = [...new Set(formData.getAll("user_ids").map(String)
    .filter((id) => uuidSchema.safeParse(id).success))];
  if (!userIds.length) redirect("/admin/members?error=selection");

  let deleted = 0;
  for (const userId of userIds) {
    if (!await archiveAndDeleteMember(userId, actor.id, "admin")) continue;
    await removeAvatarFiles(userId);
    deleted += 1;
  }
  if (!deleted) redirect("/admin/members?error=delete");
  redirect(`/admin/members?deleted=${deleted}`);
}

export async function deleteWithdrawalRecords(formData: FormData) {
  const actor = await requireSuperAdmin();
  const ids = [...new Set(formData.getAll("withdrawal_ids").map(String)
    .filter((id) => /^\d+$/.test(id)))];
  if (!ids.length) redirect("/admin/withdrawals?error=selection");

  const client = db();
  const { error } = await client.from("membership_withdrawals").delete().in("id", ids);
  if (error) redirect("/admin/withdrawals?error=delete");
  await client.from("audit_logs").insert({
    actor_id: actor.id, action: "withdrawal.archive.delete", target_type: "membership_withdrawals",
  });
  redirect(`/admin/withdrawals?deleted=${ids.length}`);
}
