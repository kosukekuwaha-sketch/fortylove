"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { clearSession, getSession, setSession } from "@/lib/auth";
import { tokyoLocalToIso } from "@/lib/datetime";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const EVENT_DOCUMENT_BUCKET = "event-documents";
const MAX_EVENT_PDF_SIZE = 15 * 1024 * 1024;

async function replaceEventDocument(eventId: string, actorId: string, file: File) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return "type";
  if (file.size > MAX_EVENT_PDF_SIZE) return "size";
  const client = db();
  const { data: bucket } = await client.storage.getBucket(EVENT_DOCUMENT_BUCKET);
  if (!bucket) {
    const { error } = await client.storage.createBucket(EVENT_DOCUMENT_BUCKET, {
      public: false,
      fileSizeLimit: MAX_EVENT_PDF_SIZE,
      allowedMimeTypes: ["application/pdf"],
    });
    if (error) return "upload";
  }
  const { data: existing } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const path = `${eventId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await client.storage.from(EVENT_DOCUMENT_BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (uploadError) return "upload";
  const { error: databaseError } = await client.from("event_documents").upsert({
    event_id: eventId,
    file_path: path,
    file_name: file.name,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id" });
  if (databaseError) {
    await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([path]);
    return "database";
  }
  if (existing?.file_path && existing.file_path !== path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([existing.file_path]);
  return null;
}

async function removeEventDocument(eventId: string) {
  const client = db();
  const { data } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error } = await client.from("event_documents").delete().eq("event_id", eventId);
  if (error) return false;
  if (data?.file_path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([data.file_path]);
  return true;
}

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
    faculty: text(fd, "faculty"), department: text(fd, "department"), grade: Number(text(fd, "grade")),
    instagram_id: text(fd, "instagram_id") || null, line_display_name: text(fd, "line_display_name") || null,
    tennis_experience: text(fd, "tennis_experience"), role: "member",
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
  const { error } = await client.from("reservations").upsert(
    { user_id: user.id, event_id: eventId, status: "reserved" },
    { onConflict: "user_id,event_id" },
  );
  if (error) redirect("/home?error=reservation");
  revalidatePath("/home");
  redirect(`/home?reserved=${eventId}`);
}

export async function cancelReservation(fd: FormData) {
  const user = await getSession();
  if (!user) redirect("/login");
  const eventId = text(fd, "event_id");
  const { data: event } = await db().from("events").select("starts_at").eq("id", eventId).single();
  if (!event || new Date(event.starts_at).getTime() - Date.now() < 2 * 3600_000) redirect("/home?error=cancel-deadline");
  const { error } = await db().from("reservations").update({ status: "cancelled" }).eq("user_id", user.id).eq("event_id", eventId);
  if (error) redirect("/home?error=reservation");
  revalidatePath("/home");
  redirect("/home?cancelled=1");
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
    client.from("users").select("id,name,university,faculty,department,grade,instagram_id,line_display_name,tennis_experience,has_racket").eq("id", userId).single(),
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
    instagram_id: formerUser.instagram_id,
    line_display_name: formerUser.line_display_name,
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
    instagram_id: text(fd, "instagram_id") || null,
    line_display_name: text(fd, "line_display_name") || null,
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
  const startsAt = tokyoLocalToIso(text(fd, "starts_at"));
  const endsAt = tokyoLocalToIso(text(fd, "ends_at"));
  if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) redirect("/admin/events?error=create");
  const { data, error } = await client.from("events").insert({
    title: text(fd, "title"), starts_at: startsAt, ends_at: endsAt,
    location: text(fd, "location"), capacity: Number(text(fd, "capacity")), description: text(fd, "description"),
    event_type: text(fd, "event_type") || "tennis",
  }).select("id").single();
  if (error) redirect("/admin/events?error=create");
  const document = fd.get("document");
  if (data?.id && document instanceof File && document.size > 0) {
    const documentError = await replaceEventDocument(data.id, user.id, document);
    if (documentError) redirect(`/admin/events?error=document-${documentError}`);
  }
  await client.from("audit_logs").insert({ actor_id: user.id, action: "event.create", target_type: "event", target_id: data?.id });
  revalidatePath("/admin/events");
}

export async function updateEvent(fd: FormData) {
  const user = await requireAdmin();
  const eventId = text(fd, "event_id");
  const startsAt = tokyoLocalToIso(text(fd, "starts_at"));
  const endsAt = tokyoLocalToIso(text(fd, "ends_at"));
  const capacity = Number(text(fd, "capacity"));
  if (!eventId || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt) || capacity < 1) {
    redirect("/admin/events?error=update");
  }
  const client = db();
  const { count } = await client.from("reservations").select("*", { count: "exact", head: true })
    .eq("event_id", eventId).eq("status", "reserved");
  if (capacity < (count ?? 0)) redirect("/admin/events?error=capacity");
  const { error } = await client.from("events").update({
    title: text(fd, "title"),
    starts_at: startsAt,
    ends_at: endsAt,
    location: text(fd, "location"),
    capacity,
    description: text(fd, "description"),
    event_type: text(fd, "event_type") || "tennis",
  }).eq("id", eventId);
  if (error) redirect("/admin/events?error=update");
  const document = fd.get("document");
  if (document instanceof File && document.size > 0) {
    const documentError = await replaceEventDocument(eventId, user.id, document);
    if (documentError) redirect(`/admin/events?error=document-${documentError}`);
  } else if (text(fd, "remove_document") === "true") {
    if (!await removeEventDocument(eventId)) redirect("/admin/events?error=document-delete");
  }
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "event.update",
    target_type: "event",
    target_id: eventId,
  });
  revalidatePath("/home");
  redirect("/admin/events?updated=1");
}

export async function deleteEvent(fd: FormData) {
  const user = await requireAdmin();
  const eventId = text(fd, "event_id");
  if (!eventId) redirect("/admin/events?error=selection");
  const client = db();
  const { data: document } = await client.from("event_documents").select("file_path").eq("event_id", eventId).maybeSingle();
  const { error } = await client.from("events").delete().eq("id", eventId);
  if (error) {
    console.error("Event delete error", {
      message: error.message,
      code: error.code,
      details: error.details,
    });
    redirect("/admin/events?error=delete");
  }
  if (document?.file_path) await client.storage.from(EVENT_DOCUMENT_BUCKET).remove([document.file_path]);
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "event.delete",
    target_type: "event",
    target_id: eventId,
  });
  redirect("/admin/events?deleted=1");
}

export async function createFaq(fd: FormData) {
  const user = await requireAdmin();
  const client = db();
  const { data, error } = await client.from("faqs").insert({
    question: text(fd, "question"), answer: text(fd, "answer"),
    category: text(fd, "category") || "その他",
    sort_order: Number(text(fd, "sort_order")) || 0,
    is_published: text(fd, "is_published") === "true",
  }).select("id").single();
  if (error) redirect("/admin/faqs?error=create");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.create", target_type: "faq", target_id: data?.id });
  redirect("/admin/faqs?created=1");
}

export async function createFaqCategory(fd: FormData) {
  const user = await requireAdmin();
  const name = text(fd, "name");
  if (!name) redirect("/admin/faqs?error=category");
  const client = db();
  const { data, error } = await client.from("faq_categories").insert({
    name,
    sort_order: Number(text(fd, "sort_order")) || 0,
  }).select("id").single();
  if (error) redirect("/admin/faqs?error=category");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.category.create", target_type: "faq_category", target_id: data?.id });
  redirect("/admin/faqs?category_created=1");
}

export async function deleteFaqCategory(fd: FormData) {
  const user = await requireAdmin();
  const categoryId = text(fd, "category_id");
  const categoryName = text(fd, "category_name");
  const client = db();
  const { count } = await client.from("faqs").select("*", { count: "exact", head: true }).eq("category", categoryName);
  if (count) redirect("/admin/faqs?error=category-used");
  const { error } = await client.from("faq_categories").delete().eq("id", categoryId);
  if (error) redirect("/admin/faqs?error=category");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.category.delete", target_type: "faq_category", target_id: categoryId });
  redirect("/admin/faqs?category_deleted=1");
}

export async function updateFaq(fd: FormData) {
  const user = await requireAdmin();
  const faqId = text(fd, "faq_id");
  const client = db();
  const { error } = await client.from("faqs").update({
    question: text(fd, "question"), answer: text(fd, "answer"),
    category: text(fd, "category") || "その他",
    sort_order: Number(text(fd, "sort_order")) || 0,
    is_published: text(fd, "is_published") === "true",
    updated_at: new Date().toISOString(),
  }).eq("id", faqId);
  if (error) redirect("/admin/faqs?error=update");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.update", target_type: "faq", target_id: faqId });
  redirect("/admin/faqs?updated=1");
}

export async function deleteFaq(fd: FormData) {
  const user = await requireAdmin();
  const faqId = text(fd, "faq_id");
  const client = db();
  const { error } = await client.from("faqs").delete().eq("id", faqId);
  if (error) redirect("/admin/faqs?error=delete");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "faq.delete", target_type: "faq", target_id: faqId });
  redirect("/admin/faqs?deleted=1");
}

export async function registerJoinedMember(fd: FormData) {
  const user = await requireAdmin();
  const userId = text(fd, "user_id");
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

export async function deleteReceptionAccount(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const userId = text(fd, "user_id");
  const client = db();
  if (!await archiveWithdrawal(userId, user.id, "admin")) redirect("/admin?error=delete");
  await removeAvatarFiles(userId);
  const { error } = await client.from("users").delete().eq("id", userId).eq("role", "member");
  if (error) redirect("/admin?error=delete");
  await client.from("audit_logs").insert({
    actor_id: user.id,
    action: "account.delete.reception",
    target_type: "user",
    target_id: userId,
  });
  redirect("/admin?deleted=1");
}

export async function restoreWithdrawalAccount(fd: FormData) {
  const user = await requireAdmin();
  if (user.role !== "super_admin") redirect("/admin");
  const withdrawalId = text(fd, "withdrawal_id");
  const temporaryPassword = text(fd, "temporary_password");
  if (temporaryPassword.length < 4) redirect("/admin/withdrawals?error=password");
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
  const user = await requireAdmin();
  const reservationId = text(fd, "id");
  const status = text(fd, "status");
  if (!["reserved", "cancelled", "attended"].includes(status)) redirect("/admin/events?error=attendance");
  const client = db();
  const { error } = await client.from("reservations").update({ status }).eq("id", reservationId);
  if (error) redirect("/admin/events?error=attendance");
  await client.from("audit_logs").insert({ actor_id: user.id, action: "reservation.attendance.update", target_type: "reservation", target_id: reservationId });
  redirect("/admin/events?attendance_updated=1");
}
