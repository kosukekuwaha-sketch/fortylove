"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { clearSession, getSession, setSession } from "@/lib/auth";
import { isValidNewPassword } from "@/lib/password-policy";
import { requireAdmin } from "@/lib/server/action-context";
import { loginInputSchema, memberProfileInputSchema, registrationInputSchema, uuidSchema } from "@/lib/input-validation";
import {
  clientAddress,
  LOGIN_BLOCK_SECONDS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_SECONDS,
  loginRateLimitKey,
} from "@/lib/login-rate-limit";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
function configuredSupabaseRole() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (key.startsWith("sb_secret_")) return "secret";
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    return String(payload.role ?? "jwt-without-role");
  } catch {
    return key ? "unrecognized-key-format" : "missing";
  }
}

export async function login(fd: FormData) {
  const input = loginInputSchema.safeParse({ name: text(fd, "name"), password: String(fd.get("password") ?? "") });
  if (!input.success) redirect("/login?error=1");
  const { name, password } = input.data;
  const secret = process.env.SESSION_SECRET ?? "";
  const requestHeaders = await headers();
  const address = clientAddress(requestHeaders.get("x-forwarded-for"), requestHeaders.get("x-real-ip"));
  const keys = [
    loginRateLimitKey("address", address, secret),
    loginRateLimitKey("identity", name, secret),
  ];
  const client = db();
  const checks = await Promise.all(keys.map((key) => client.rpc("check_login_rate_limit", { p_key_hash: key })));
  const checkError = checks.find((check) => check.error)?.error;
  if (checkError) {
    console.error("Login rate-limit database error", { message: checkError.message, code: checkError.code });
    redirect("/login?error=server");
  }
  if (checks.some((check) => Number(check.data ?? 0) > 0)) {
    redirect("/login?error=rate-limit");
  }

  const { data: users, error } = await client.from("users").select("id,name,password_hash,role,session_version").eq("name", name);
  if (error) {
    console.error("Login database error", {
      message: error.message,
      code: error.code,
      details: error.details,
      configuredKeyRole: configuredSupabaseRole(),
    });
    redirect("/login?error=server");
  }
  const user = users?.find((item) => bcrypt.compareSync(password, item.password_hash));
  if (!user) {
    const failures = await Promise.all(keys.map((key) => client.rpc("record_login_failure", {
      p_key_hash: key,
      p_window_seconds: LOGIN_WINDOW_SECONDS,
      p_max_failures: LOGIN_MAX_FAILURES,
      p_block_seconds: LOGIN_BLOCK_SECONDS,
    })));
    const failureError = failures.find((failure) => failure.error)?.error;
    if (failureError) {
      console.error("Login failure recording error", { message: failureError.message, code: failureError.code });
      redirect("/login?error=server");
    }
    if (failures.some((failure) => Number(failure.data ?? 0) > 0)) {
      await client.from("audit_logs").insert({ action: "auth.login.rate_limited", target_type: "login" });
      redirect("/login?error=rate-limit");
    }
    redirect("/login?error=1");
  }
  await client.rpc("clear_login_rate_limit", { p_key_hash: keys[1] });
  await setSession({ id: user.id, name: user.name, role: user.role, session_version: user.session_version });
  redirect(user.role === "member" ? "/home" : "/admin");
}

export async function register(fd: FormData) {
  const client = db();
  const { data: settings, error: settingsError } = await client.from("app_settings").select("recruiting_open").eq("id", 1).maybeSingle();
  if (settingsError) redirect("/register?error=server");
  if (settings?.recruiting_open === false) redirect("/register?error=closed");
  const input = registrationInputSchema.safeParse({
    name: text(fd, "name"), password: String(fd.get("password") ?? ""),
    university: text(fd, "university"), faculty: text(fd, "faculty"), department: text(fd, "department"),
    grade: text(fd, "grade"), instagram_id: text(fd, "instagram_id"), line_display_name: text(fd, "line_display_name"),
    tennis_experience: text(fd, "tennis_experience"), has_racket: text(fd, "has_racket"),
  });
  if (!input.success) redirect("/register?error=validation");
  const { password, name } = input.data;
  if (!isValidNewPassword(password)) redirect("/register?error=password");
  const { data: sameNames } = await client.from("users").select("password_hash").eq("name", name);
  if (sameNames?.some((u) => bcrypt.compareSync(password, u.password_hash))) redirect("/register?error=duplicate");
  const { data, error } = await client.from("users").insert({
    name, password_hash: await bcrypt.hash(password, 12), university: input.data.university,
    faculty: input.data.faculty, department: input.data.department, grade: input.data.grade,
    instagram_id: input.data.instagram_id || null, line_display_name: input.data.line_display_name || null,
    tennis_experience: input.data.tennis_experience,
    has_racket: input.data.has_racket === "true",
    role: "member",
  }).select("id,name,role,session_version").single();
  if (error || !data) redirect("/register?error=server");
  await setSession(data);
  redirect("/home");
}

export async function logout() { await clearSession(); redirect("/login"); }

export async function reserve(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  if (!uuidSchema.safeParse(eventId).success) redirect("/home?error=reservation");
  const { data, error } = await db().rpc("reserve_event", { p_user_id: user.id, p_event_id: eventId });
  if (error) redirect("/home?error=reservation");
  if (data === "full") redirect("/home?error=full");
  if (!["reserved", "already_reserved"].includes(String(data))) redirect("/home?error=reservation");
  revalidatePath("/home");
  redirect(`/home?reserved=${eventId}`);
}

export async function cancelReservation(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  if (!uuidSchema.safeParse(eventId).success) redirect("/home?error=reservation");
  const { data, error } = await db().rpc("cancel_event_reservation", { p_user_id: user.id, p_event_id: eventId });
  if (error) redirect("/home?error=reservation");
  if (data === "deadline_passed") redirect("/home?error=cancel-deadline");
  if (data !== "cancelled") redirect("/home?error=reservation");
  revalidatePath("/home");
  redirect("/home?cancelled=1");
}

async function removeAvatarFiles(userId: string) {
  const client = db();
  const { data: files } = await client.storage.from("avatars").list(userId);
  if (files?.length) {
    const { error } = await client.storage.from("avatars").remove(files.map((file) => `${userId}/${file.name}`));
    if (error) console.error("Post-withdrawal avatar cleanup failed", { userId, message: error.message });
  }
}

async function archiveAndDeleteMember(userId: string, withdrawnBy: string, source: "self" | "admin") {
  const { data, error } = await db().rpc("archive_and_delete_member", {
    p_user_id: userId,
    p_withdrawn_by: withdrawnBy,
    p_source: source,
  });
  if (error) {
    console.error("Atomic account deletion failed", { userId, source, message: error.message, code: error.code });
    return false;
  }
  return data === "deleted";
}

export async function deleteOwnAccount() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!await archiveAndDeleteMember(user.id, user.id, "self")) redirect("/profile?error=delete");
  await removeAvatarFiles(user.id);
  await clearSession();
  redirect("/login?deleted=1");
}

export async function updateProfile(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const input = memberProfileInputSchema.safeParse({
    name: text(fd, "name"), university: text(fd, "university"), faculty: text(fd, "faculty"),
    department: text(fd, "department"), grade: text(fd, "grade"), instagram_id: text(fd, "instagram_id"),
    line_display_name: text(fd, "line_display_name"), tennis_experience: text(fd, "tennis_experience"),
    has_racket: text(fd, "has_racket"),
  });
  if (!input.success) redirect("/profile?error=validation");
  const { name } = input.data;
  const client = db();
  const avatar = fd.get("avatar");
  let avatarUrl: string | undefined;

  if (avatar instanceof File && avatar.size > 0) {
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const extension = extensions[avatar.type];
    if (!extension) redirect("/profile?error=avatar-type");
    if (avatar.size > 2 * 1024 * 1024) redirect("/profile?error=avatar-size");

    const { data: bucket } = await client.storage.getBucket("avatars");
    if (!bucket) {
      const { error: bucketError } = await client.storage.createBucket("avatars", {
        public: true,
        fileSizeLimit: 2 * 1024 * 1024,
        allowedMimeTypes: Object.keys(extensions),
      });
      if (bucketError) redirect("/profile?error=avatar-upload");
    }

    const path = `${user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await client.storage.from("avatars").upload(path, avatar, {
      contentType: avatar.type,
      upsert: false,
    });
    if (uploadError) redirect("/profile?error=avatar-upload");
    avatarUrl = client.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  const updates = {
    name,
    university: input.data.university,
    faculty: input.data.faculty,
    department: input.data.department,
    grade: input.data.grade,
    instagram_id: input.data.instagram_id || null,
    line_display_name: input.data.line_display_name || null,
    tennis_experience: input.data.tennis_experience,
    has_racket: input.data.has_racket === "true",
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  };
  const { error } = await client.from("users").update(updates).eq("id", user.id);
  if (error) {
    console.error("Profile database error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      configuredKeyRole: configuredSupabaseRole(),
    });
    if (error.message.includes("avatar_url")) redirect("/profile?error=avatar-column");
    redirect("/profile?error=update");
  }
  await setSession({ ...user, name });
  redirect("/profile?saved=1");
}

export async function updateUserRole(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userId = text(fd, "user_id");
  const role = text(fd, "role");
  if (userId === user.id || !uuidSchema.safeParse(userId).success || !["member", "admin", "super_admin"].includes(role)) return;
  const client = db();
  const { data: updated, error } = await client.rpc("set_user_role", { p_user_id: userId, p_role: role });
  if (error || !updated) redirect("/admin/admins?error=role-update");
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "user.role.update",
    target_type: "user",
    target_id: userId,
  });
  redirect("/admin/admins?role_updated=1");
}

export async function updateUsersRole(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userIds = fd.getAll("user_ids").map(String).filter((id) => id !== user.id && uuidSchema.safeParse(id).success);
  const role = text(fd, "role");
  if (!userIds.length || !["admin", "super_admin"].includes(role)) redirect("/admin/admins?error=selection");
  const client = db();
  const roleUpdates = await Promise.all(userIds.map((userId) => client.rpc("set_member_role", { p_user_id: userId, p_role: role })));
  if (roleUpdates.some((result) => result.error || result.data !== true)) redirect("/admin/admins?error=role-update");
  await client.from("audit_logs").insert(userIds.map((targetId) => ({
    actor_id: user.id,
    action: "user.role.update",
    target_type: "user",
    target_id: targetId,
  })));
  redirect(`/admin/admins?role_updated=${userIds.length}`);
}

export async function resetUserPassword(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userId = text(fd, "user_id");
  const temporaryPassword = text(fd, "temporary_password");
  if (!uuidSchema.safeParse(userId).success || !isValidNewPassword(temporaryPassword) || temporaryPassword.length > 256) redirect("/admin?error=password");
  const client = db();
  const { data: updated, error } = await client.rpc("replace_user_password", {
    p_user_id: userId,
    p_password_hash: await bcrypt.hash(temporaryPassword, 12),
  });
  if (error || !updated) redirect("/admin?error=password-update");
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "user.password.reset",
    target_type: "user",
    target_id: userId,
  });
  redirect("/admin?password_reset=1");
}

export async function registerJoinedMember(fd: FormData) {
  const user = await requireAdmin();
  const userId = text(fd, "user_id");
  if (!uuidSchema.safeParse(userId).success) redirect("/admin/members?error=membership-register");
  const client = db();
  const { error } = await client.from("membership_applications").upsert(
    { user_id: userId, status: "approved", applied_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) redirect("/admin/members?error=membership-register");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "membership.register.direct", target_type: "user", target_id: userId });
  redirect("/admin/members?membership_registered=1");
}

export async function deleteMemberAccount(fd: FormData) {
  const user = await requireAdmin();
  const userId = text(fd, "user_id");
  if (!uuidSchema.safeParse(userId).success) redirect("/admin/members?error=delete");
  if (!await archiveAndDeleteMember(userId, user.id, "admin")) redirect("/admin/members?error=delete");
  await removeAvatarFiles(userId);
  redirect("/admin/members?deleted=1");
}

export async function deleteReceptionAccount(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userId = text(fd, "user_id");
  if (!uuidSchema.safeParse(userId).success) redirect("/admin?error=delete");
  if (!await archiveAndDeleteMember(userId, user.id, "admin")) redirect("/admin?error=delete");
  await removeAvatarFiles(userId);
  redirect("/admin?deleted=1");
}

export async function restoreWithdrawalAccount(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const withdrawalId = text(fd, "withdrawal_id");
  const temporaryPassword = text(fd, "temporary_password");
  if (!/^\d+$/.test(withdrawalId) || !isValidNewPassword(temporaryPassword) || temporaryPassword.length > 256) redirect("/admin/withdrawals?error=password");
  const client = db();
  const { data: archived, error: archiveError } = await client.from("membership_withdrawals").select("*").eq("id", withdrawalId).single();
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
  await client.from("audit_logs").insert({ actor_id: user.id, action: "account.restore.withdrawal", target_type: "user", target_id: archived.former_user_id });
  redirect("/admin/withdrawals?restored=1");
}

export async function deleteMemberAccounts(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userIds = [...new Set(fd.getAll("user_ids").map(String).filter((id) => uuidSchema.safeParse(id).success))];
  if (!userIds.length) redirect("/admin/members?error=selection");
  let deleted = 0;
  for (const userId of userIds) {
    if (!await archiveAndDeleteMember(userId, user.id, "admin")) continue;
    await removeAvatarFiles(userId);
    deleted += 1;
  }
  if (!deleted) redirect("/admin/members?error=delete");
  redirect(`/admin/members?deleted=${deleted}`);
}

export async function deleteWithdrawalRecords(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const ids = [...new Set(fd.getAll("withdrawal_ids").map(String).filter((id) => /^\d+$/.test(id)))];
  if (!ids.length) redirect("/admin/withdrawals?error=selection");
  const { error } = await db().from("membership_withdrawals").delete().in("id", ids);
  if (error) redirect("/admin/withdrawals?error=delete");
  await db().from("audit_logs").insert({
    actor_id: user.id,
    action: "withdrawal.archive.delete",
    target_type: "membership_withdrawals",
  });
  redirect(`/admin/withdrawals?deleted=${ids.length}`);
}
