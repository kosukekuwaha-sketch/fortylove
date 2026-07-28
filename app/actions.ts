"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clearSession, getSession, setSession } from "@/lib/auth";

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
  const name = text(fd, "name");
  const password = text(fd, "password");
  const { data: users, error } = await db().from("users").select("id,name,password_hash,role").eq("name", name);
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
  if (!user) redirect("/login?error=1");
  await setSession({ id: user.id, name: user.name, role: user.role });
  redirect(user.role === "member" ? "/home" : "/admin");
}

export async function register(fd: FormData) {
  const password = text(fd, "password");
  if (password.length < 4) redirect("/register?error=password");
  const name = text(fd, "name");
  const client = db();
  const { data: sameNames } = await client.from("users").select("password_hash").eq("name", name);
  if (sameNames?.some((u) => bcrypt.compareSync(password, u.password_hash))) redirect("/register?error=duplicate");
  const { data, error } = await client.from("users").insert({
    name, password_hash: await bcrypt.hash(password, 12), university: text(fd, "university"),
    faculty: text(fd, "faculty"), department: text(fd, "department"), grade: Number(text(fd, "grade")), email: text(fd, "email"),
    line_id: text(fd, "line_id") || null, tennis_experience: text(fd, "tennis_experience"), role: "member",
  }).select("id,name,role").single();
  if (error || !data) redirect("/register?error=server");
  await setSession(data);
  redirect("/home");
}

export async function logout() { await clearSession(); redirect("/login"); }

export async function reserve(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  const client = db();
  const { data: event } = await client.from("events").select("capacity,starts_at").eq("id", eventId).single();
  const { count } = await client.from("reservations").select("*", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "reserved");
  if (!event || new Date(event.starts_at) <= new Date()) return;
  if ((count ?? 0) >= event.capacity) redirect("/home?error=full");
  await client.from("reservations").upsert({ user_id: user.id, event_id: eventId, status: "reserved" }, { onConflict: "user_id,event_id" });
  revalidatePath("/home");
}

export async function cancelReservation(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  const { data: event } = await db().from("events").select("starts_at").eq("id", eventId).single();
  if (event && new Date(event.starts_at).getTime() - Date.now() >= 2 * 3600_000) {
    await db().from("reservations").update({ status: "cancelled" }).eq("user_id", user.id).eq("event_id", eventId);
  }
  revalidatePath("/home");
}

export async function applyMembership() {
  const user = await getSession();
  if (!user) redirect("/login");
  await db().from("membership_applications").upsert({ user_id: user.id, status: "pending" }, { onConflict: "user_id", ignoreDuplicates: true });
  revalidatePath("/home");
}

async function removeAvatarFiles(userId: string) {
  const client = db();
  const { data: files } = await client.storage.from("avatars").list(userId);
  if (files?.length) {
    await client.storage.from("avatars").remove(files.map((file) => `${userId}/${file.name}`));
  }
}

async function archiveWithdrawal(userId: string, withdrawnBy: string, source: "self" | "admin") {
  const client = db();
  const [{ data: formerUser, error: userError }, { data: reservations, error: reservationError }] = await Promise.all([
    client.from("users").select("id,name,university,faculty,department,grade,email,line_id,tennis_experience,has_racket").eq("id", userId).single(),
    client.from("reservations").select("status,created_at,event:events(title,starts_at,location)").eq("user_id", userId),
  ]);
  if (userError || !formerUser || reservationError) return false;
  const { error } = await client.from("membership_withdrawals").insert({
    former_user_id: formerUser.id,
    name: formerUser.name,
    university: formerUser.university,
    faculty: formerUser.faculty,
    department: formerUser.department,
    grade: formerUser.grade,
    email: formerUser.email,
    line_id: formerUser.line_id,
    tennis_experience: formerUser.tennis_experience,
    has_racket: formerUser.has_racket,
    reservation_history: reservations ?? [],
    withdrawal_source: source,
    withdrawn_by: withdrawnBy,
  });
  return !error;
}

export async function deleteOwnAccount() {
  const user = await getSession();
  if (!user) redirect("/login");
  const client = db();
  if (!await archiveWithdrawal(user.id, user.id, "self")) redirect("/profile?error=delete");
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "account.delete.self",
    target_type: "user",
    target_id: user.id,
  });
  await removeAvatarFiles(user.id);
  const { error } = await client.from("users").delete().eq("id", user.id);
  if (error) redirect("/profile?error=delete");
  await clearSession();
  redirect("/login?deleted=1");
}

export async function updateProfile(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const name = text(fd, "name");
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
    university: text(fd, "university"),
    faculty: text(fd, "faculty"),
    department: text(fd, "department"),
    grade: Number(text(fd, "grade")),
    email: text(fd, "email"),
    line_id: text(fd, "line_id") || null,
    tennis_experience: text(fd, "tennis_experience"),
    has_racket: text(fd, "has_racket") === "true",
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

async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: user } = await db().from("users").select("id,name,role").eq("id", session.id).single();
  if (!user || user.role === "member") redirect("/login");
  return user;
}

export async function updateUserRole(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userId = text(fd, "user_id");
  const role = text(fd, "role");
  if (userId === user.id || !["member", "admin", "super_admin"].includes(role)) return;
  const client = db();
  await client.from("users").update({ role }).eq("id", userId);
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
  const userIds = fd.getAll("user_ids").map(String).filter((id) => id && id !== user.id);
  const role = text(fd, "role");
  if (!userIds.length || !["admin", "super_admin"].includes(role)) redirect("/admin/admins?error=selection");
  const client = db();
  const { error } = await client.from("users").update({ role }).in("id", userIds).eq("role", "member");
  if (error) redirect("/admin/admins?error=role-update");
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
  if (!userId || temporaryPassword.length < 4) redirect("/admin?error=password");
  const client = db();
  const { error } = await client.from("users").update({
    password_hash: await bcrypt.hash(temporaryPassword, 12),
  }).eq("id", userId);
  if (error) redirect("/admin?error=password-update");
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "user.password.reset",
    target_type: "user",
    target_id: userId,
  });
  redirect("/admin?password_reset=1");
}

export async function createEvent(fd: FormData) {
  const user = await requireAdmin();
  const client = db();
  const { data } = await client.from("events").insert({
    title: text(fd, "title"), starts_at: text(fd, "starts_at"), ends_at: text(fd, "ends_at"),
    location: text(fd, "location"), capacity: Number(text(fd, "capacity")), description: text(fd, "description"),
    event_type: text(fd, "event_type") || "tennis",
  }).select("id").single();
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.create", target_type: "event", target_id: data?.id });
  revalidatePath("/admin/events");
}

export async function updateApplication(fd: FormData) {
  const user = await requireAdmin();
  const id = text(fd, "id");
  await db().from("membership_applications").update({ status: text(fd, "status") }).eq("id", id);
  await db().from("audit_logs").insert({ actor_id: user.id, action: "application.update", target_type: "application", target_id: id });
  revalidatePath("/admin/applications");
}

export async function deleteMemberAccount(fd: FormData) {
  const user = await requireAdmin();
  const userId = text(fd, "user_id");
  const client = db();
  if (!await archiveWithdrawal(userId, user.id, "admin")) redirect("/admin/members?error=delete");
  await removeAvatarFiles(userId);
  await client.from("users").delete().eq("id", userId).eq("role", "member");
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "account.delete.admin",
    target_type: "user",
    target_id: userId,
  });
  redirect("/admin/members?deleted=1");
}

export async function deleteMemberAccounts(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userIds = [...new Set(fd.getAll("user_ids").map(String).filter(Boolean))];
  if (!userIds.length) redirect("/admin/members?error=selection");
  let deleted = 0;
  for (const userId of userIds) {
    if (!await archiveWithdrawal(userId, user.id, "admin")) continue;
    await removeAvatarFiles(userId);
    const { error } = await db().from("users").delete().eq("id", userId).eq("role", "member");
    if (!error) {
      deleted += 1;
      await db().from("audit_logs").insert({
        actor_id: user.id,
        action: "account.delete.admin",
        target_type: "user",
        target_id: userId,
      });
    }
  }
  if (!deleted) redirect("/admin/members?error=delete");
  redirect(`/admin/members?deleted=${deleted}`);
}

export async function deleteWithdrawalRecords(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const ids = [...new Set(fd.getAll("withdrawal_ids").map(String).filter(Boolean))];
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

export async function updateAttendance(fd: FormData) {
  await requireAdmin();
  await db().from("reservations").update({ status: text(fd, "status") }).eq("id", text(fd, "id"));
  revalidatePath("/admin/events");
}
